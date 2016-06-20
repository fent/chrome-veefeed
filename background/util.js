/* exported util */
var util = {};

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
    if (xhr.readyState === 4 && xhr.status >= 200) {
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

var SizedMap = util.SizedMap = function(limit, list) {
  this.limit = limit;
  this.list = [];
  this.map = {};
  if (list) {
    if (Array.isArray(list)) {
      list = list.slice(-limit);
      for (var i = 0, len = list.length; i < len; i++) {
        this.push(list[i]);
      }
    } else {
      for (var key in list) {
        this.push(key, list[key]);
      }
    }
  }
};

SizedMap.prototype.push = function(key, val, noUpdate) {
  if (this.has(key)) {
    if (noUpdate) { return; }
    this.list.splice(this.list.indexOf(key), 1);
  }
  this.list.push(key);
  this.map[key] = val || true;
  if (this.list.length > this.limit) {
    delete this.map[this.list.shift()];
  }
};

SizedMap.prototype.has = function(key) {
  return key in this.map;
};

SizedMap.prototype.get = function(key) {
  return this.map[key];
};

// Converts from 00:00:00 or 00:00 to seconds.
util.timeToSeconds = function(str) {
  var s = str.split(':');
  return s.length === 2 ?
    ~~s[0] * 60 + ~~s[1] :
    ~~s[0] * 3600 + ~~s[1] * 60 + ~~s[2];
};

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

util.parallelMap = function(args, func, callback) {
  util.parallel(args.map(function(arg) {
    return function(callback) {
      func(arg, callback);
    };
  }), callback);
};
