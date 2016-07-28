/* global util */
// Some URLs are given as shortened URLs...
(function() {
  var cache = new util.SizedMap(200, 'shortenedURLs');
  var supportedHosts = {
    't.co': getURLFromMeta,
  };

  function getURLFromMeta(url, callback) {
    util.ajax(url, function(xhr, body) {
      var location = xhr.getResponseHeader('location');
      if (location) {
        callback(location);
      } else {
        var meta = body.getElementsByTagName('meta')[0];
        if (meta) {
          var content = meta.getAttribute('content').toLowerCase();
          var p = content.indexOf('url=');
          if (p > -1) {
            callback(content.slice(p + 4));
            return;
          }
        }
        callback();
      }
    });
  }

  var shorteners = window.shorteners = {};
  shorteners.isShortened = function(url) {
    return !!supportedHosts[new URL(url).host];
  };
  shorteners.getRealURL = function(url, callback) {
    if (cache.has(url)) {
      callback(cache.get(url));
    } else {
      var fn = supportedHosts[new URL(url).host];
      if (fn) {
        fn(url, function(realurl) {
          if (realurl) {
            cache.push(url, realurl);
          }
          callback(realurl);
        });
      }
    }
  };
})();
