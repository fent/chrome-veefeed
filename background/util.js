var util = window.util = {};

util.ajax = function(url, callback) {
  if (window.location.protocol.indexOf('http') === 0 &&
      url.indexOf('http') === 0) {
    url = new URL(url);
    url.protocol = window.location.protocol;
    url = url.href;
  }

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 2 && xhr.status >= 300 ||
        xhr.readyState === 4) {
      callback(xhr);
    }
  };
  xhr.responseType = 'document';
  setTimeout(function() {
    xhr.send();
  });
  return xhr;
};

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

var sizedMap = util.sizedMap = function(limit, list) {
  this.limit = limit;
  this.list = [];
  this.map = {};
  if (list) {
    list = list.slice(-limit);
    for (var i = 0, len = list.length; i < len; i++) {
      this.push(list[i]);
    }
  }
};

sizedMap.prototype.push = function(key) {
  if (this.has(key)) {
    this.list.splice(this.list.indexOf(key), 1);
  }
  this.list.push(key);
  this.map[key] = true;
  if (this.list.length > this.limit) {
    delete this.map[this.list.shift()];
  }
};

sizedMap.prototype.has = function(key) {
  return this.map[key] === true;
};
