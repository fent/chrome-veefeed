/* global util */
// Some URLs are given as shortened URLs...
(() => {
  var cache = new util.SizedMap(200, 'shortenedURLs');
  var supportedHosts = {
    't.co': getURLFromMeta,
  };

  function getURLFromMeta(url, callback) {
    util.ajax(url, (xhr, body) => {
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

  const shorteners = window.shorteners = {};
  shorteners.isShortened = url => !!supportedHosts[new URL(url).host];
  shorteners.getRealURL = (url, callback) => {
    if (cache.has(url)) {
      callback(cache.get(url));
    } else {
      var fn = supportedHosts[new URL(url).host];
      if (fn) {
        fn(url, (realurl) => {
          if (realurl) {
            cache.push(url, realurl);
          }
          callback(realurl);
        });
      }
    }
  };
})();
