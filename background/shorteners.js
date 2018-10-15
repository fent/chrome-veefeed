/* global util */
// Some URLs are given as shortened URLs...
(() => {
  const getURLFromMeta = (url, callback) => {
    util.ajax(url, (xhr, body) => {
      const location = xhr.getResponseHeader('location');
      if (location) {
        callback(location);
      } else {
        const meta = body.getElementsByTagName('meta')[0];
        if (meta) {
          let content = meta.getAttribute('content').toLowerCase();
          let p = content.indexOf('url=');
          if (p > -1) {
            callback(content.slice(p + 4));
            return;
          }
        }
        callback();
      }
    });
  };

  const cache = new util.SizedMap(200, 'shortenedURLs');
  const supportedHosts = {
    't.co': getURLFromMeta,
  };

  const shorteners = window.shorteners = {};
  shorteners.isShortened = url => !!supportedHosts[new URL(url).host];
  shorteners.getRealURL = (url, callback) => {
    if (cache.has(url)) {
      callback(cache.get(url));
    } else {
      const fn = supportedHosts[new URL(url).host];
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
