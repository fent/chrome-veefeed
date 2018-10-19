/**
 * A list that only keeps the last `limit` items added.
 *
 * @constructor
 * @param {number} limit
 * @param {Array.<Object>|string?} list
 * @param {number} ttl
 */
export default class {
  constructor(limit, list, ttl) {
    this.limit = limit;
    this._ttl = ttl;
    if (typeof list === 'string') {
      this._key = list;
      try {
        list = JSON.parse(localStorage.getItem(list)) || {};
      } catch (err) {
        list = {};
      }
    }
    this.list = [];
    this.map = {};
    if (list) {
      if (Array.isArray(list)) {
        this.saveList = true;
        this.list = list.slice(-limit);
        for (let i = 0, len = this.list.length; i < len; i++) {
          this.map[this.list[i]] = true;
        }
      } else {
        for (let key in list) {
          this.list.push(key);
          this.map[key] = list[key];
        }
      }
    }
  }

  /**
   * Add an item to the list. `key` is used to identify the uniqueness of the
   * item. If an item with the same key is already on the list, it will instead
   * be moved to the top of the list with the new value.
   *
   * @param {string} key
   * @param {Object} value
   * @param {boolean} noUpdate If this is `true`, item won't be moved to the top.
   */
  push(key, value, noUpdate) {
    if (this.has(key)) {
      if (noUpdate) { return; }
      this.list.splice(this.list.indexOf(key), 1);
    }
    this.list.push(key);
    if (this._ttl) {
      value = { v: value, t: Date.now() };
    }
    this.map[key] = value || true;
    if (this.list.length > this.limit) {
      delete this.map[this.list.shift()];
    }

    // Save this to local storage.
    if (this._key) {
      this._shouldSave = true;
      clearTimeout(this._tid);
      this._tid = setTimeout(this._save.bind(this), 1000);
    }
  }

  /*
   * @param {string} key
   * @return {boolean}
   */
  has(key) {
    return key in this.map &&
      (!this._ttl || Date.now() - this.map[key].t < this._ttl);
  }

  /*
   * @param {string} key
   * @return {Object}
   */
  get(key) {
    return this._ttl ? this.map[key].v : this.map[key];
  }

  /**
   * Saves to local storage.
   */
  _save() {
    if (!this._key || !this._shouldSave) { return; }
    const store = this.saveList ? this.list : this.map;
    localStorage.setItem(this._key, JSON.stringify(store));
    this._shouldSave = false;
  }
}
