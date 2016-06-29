/* global URLSearchParams */
/* exported util */
var util = {};

/*
 * Helper function for requests.
 *
 * @param {String} url
 * @param {Object?} opts
 *   {Object} headers
 *   {Object} cache
 *     {Function} transform
 *     {Number} ttl
 * @param {Function(Object)} callback
 * @return {XMLHttpRequest}
 */
util.ajax = function(url, opts, callback) {
  if (util.ajax.active >= util.ajax.max) {
    util.ajax.queue.push(arguments);
    return;
  }

  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }

  var parsed = new URL(url);
  if (window.location.protocol.indexOf('http') === 0 &&
      url.indexOf('http') === 0) {
    parsed.protocol = window.location.protocol;
    url = parsed.href;
  }

  var cache, cacheRequestKey;
  if (opts.cache) {
    if (!util.ajax.cache[parsed.host]) {
      util.ajax.cache[parsed.host] =
        new util.SizedMap(200, 'cache-' + parsed.host, opts.cache.ttl);
    }
    cache = util.ajax.cache[parsed.host];
    cacheRequestKey = parsed.pathname + parsed.search;
    if (cache.has(cacheRequestKey)) {
      callback(null, cache.get(cacheRequestKey));
      return;
    }
  }

  util.ajax.active++;
  var isURLEncoded = false;
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 2) {
      var type = xhr.getResponseHeader('content-type');
      if (type.includes('application/json')) {
        xhr.responseType = 'json';
      } else if (type.includes('text/html')) {
        xhr.responseType = 'document';
      } else if (type.includes('application/x-www-form-urlencoded')) {
        xhr.responseType = 'text';
        isURLEncoded = true;
      }

    } else if (xhr.readyState === 4 && xhr.status >= 200) {
      util.ajax.active--;
      if (util.ajax.queue.length && util.ajax.active < util.ajax.max) {
        util.ajax.apply(null, util.ajax.queue.shift());
      }
      if (xhr.status >= 200) {
        var response = isURLEncoded ?
          util.parseQueryString(xhr.responseText) : xhr.response;
        if (opts.cache) {
          if (opts.cache.transform) {
            response = opts.cache.transform(response);
          }
          cache.push(cacheRequestKey, response);
          callback(xhr, response);
        } else {
          callback(xhr, response);
        }
      } else {
        callback(xhr, null);
      }
    }
  };
  if (opts.headers) {
    for (var key in opts.headers) {
      xhr.setRequestHeader(key, opts.headers[key]);
    }
  }
  xhr.send();
};
util.ajax.queue = [];
util.ajax.max = 3;
util.ajax.active = 0;
util.ajax.cache = {};


/*
 * Converts time formatted as '2 days ago' to a timestamp.
 *
 * @param {String} str
 * @return {Number}
 */
util.relativeToTimestamp = function(str) {
  var s = str.trim().split(' ');
  var n = parseInt(s[0], 10);
  var multiplier = {
    second: 1,
    seconds: 1,
    minute: 60,
    minutes: 60,
    hour: 3600,
    hours: 3600,
    day: 86400,
    days: 86400,
  }[s[1]];
  return Date.now() - n * multiplier * 1000;
};

/**
 * A list that only keeps the last `limit` items added.
 *
 * @constructor
 * @param {Number} limit
 * @param {Array.<Object>|String?} list
 * @param {Number} ttl
 */
var SizedMap = util.SizedMap = function(limit, list, ttl) {
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
      for (var i = 0, len = this.list.length; i < len; i++) {
        this.map[this.list[i]] = true;
      }
    } else {
      for (var key in list) {
        this.list.push(key);
        this.map[key] = list[key];
      }
    }
  }
};

/**
 * Add an item to the list. `key` is used to identify the uniqueness of the
 * item. If an item with the same key is already on the list, it will instead
 * be moved to the top of the list with the new value.
 *
 * @param {String} key
 * @param {Object} value
 * @param {Boolean} noUpdate If this is `true`, item won't be moved to the top.
 */
SizedMap.prototype.push = function(key, value, noUpdate) {
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
};

/*
 * @param {String} key
 * @return {Boolean}
 */
SizedMap.prototype.has = function(key) {
  return key in this.map &&
    (!this._ttl || Date.now() - this.map[key].t < this._ttl);
};

/*
 * @param {String} key
 * @return {Object}
 */
SizedMap.prototype.get = function(key) {
  return this._ttl ? this.map[key].v : this.map[key];
};

/**
 * Saves to local storage.
 */
SizedMap.prototype._save = function() {
  if (!this._key || !this._shouldSave) { return; }
  var store = this.saveList ? this.list : this.map;
  localStorage.setItem(this._key, JSON.stringify(store));
  this._shouldSave = false;
};

/**
 * Converts from 00:00:00 or 00:00 to seconds.
 *
 * @param {String} str
 * @return {Number}
 */
util.timeToSeconds = function(str) {
  var s = str.split(':');
  return s.length === 2 ?
    ~~s[0] * 60 + ~~s[1] :
    ~~s[0] * 3600 + ~~s[1] * 60 + ~~s[2];
};

/*
 * @param {Object} video1
 * @param {Object} video2
 * @return {Boolean}
 */
util.isSameVideo = function(video1, video2) {
  // If the videos are within a few seconds of each other,
  // they might be the same video...
  if (video1.length - 10 > video2.length ||
      video2.length > video1.length + 10) {
    return false;
  }

  // If the titles are exact, then they are the same.
  if (video1.title === video2.title) { return true; }

  var wordsMap = {};
  video2.title.split(/\s+/).forEach(function(word) {
    if (word) { wordsMap[word.toLowerCase()] = true; }
  });

  // Look for numbers, if they both have the same numbers, then ok...
  var r, pattern = /((?:\d+:)?\d\d?:\d\d|\d+(?:\.\d+)%?)/g;
  while (r = pattern.exec(video1)) {
    var num = r[1];
    if (!wordsMap[num]) { return false; }
    delete wordsMap[num];
  }

  // If they both have two of the same words, consider them the same video.
  return video2.title.split(/\s+/).filter(function(word) {
    return word && wordsMap[word.toLowerCase()];
  }).length >= 2;
};

/*
 * Calls a list of functions in parallel, waits until all of them have
 * called their respective callback function before calling the given callback.
 *
 * @param {Array.<Function(Function(Object))} funcs
 * @param {Function(Array.<Object>)} callback Will be called with a list of
 *   the objects for which each of the callbacks were given, in the order
 *   in which the functions were originally laid out.
 */
util.parallel = function(funcs, callback) {
  if (!funcs.length) { return callback([]); }
  var callsDone = 0;
  var results = [];
  funcs.forEach(function(func, i) {
    func(function(result) {
      results[i] = result;
      if (++callsDone === funcs.length) {
        callback(results);
      }
    });
  });
};

/**
 * Calls one function with each of the items in `args` in parallel.
 *
 * @param {Array.<Object>} args
 * @param {Function(Object, Function(Object))} func
 * @param {Function(Array.<Object>)} callback
 */
util.parallelMap = function(args, func, callback) {
  util.parallel(args.map(function(arg) {
    return function(callback) {
      func(arg, callback);
    };
  }), callback);
};


/**
 * Returns ony the ID portion of a video URL. Because saving just the id
 * in storage takes up much less space than the entire URL.
 *
 * @param {String} url
 * @return {String}
 */
util.videoID = function(url) {
  var result = /([a-z0-9_-]+)$/i.exec(url);
  return result && result[1] || url;
};

/**
 * @param {String} str
 * @return {Object}
 */
util.parseQueryString = function(str) {
  var obj = {};
  var searchParams = new URLSearchParams(str);
  for(var pair of searchParams.entries()) {
    obj[pair[0]] = pair[1];
  }
  return obj;
};

/**
 * Generates a regexp for a minimatch string.
 *
 * @param {String} str
 * @param {Return} RegExp
 */
util.minimatch = function(str) {
  var exp = str
    .replace(/[-[\]{}()+?.\\^$|]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp('^' + exp + '$', 'i');
};
