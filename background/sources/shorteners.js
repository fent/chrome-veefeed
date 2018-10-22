import SizedMap from '../SizedMap.js';


// Some URLs are given as shortened URLs...
const getURLFromMeta = async (url) => {
  const res = await fetch(url, { redirect: 'manual' });
  const location = res.headers.get('location');
  if (location) {
    return location;
  } else {
    const text = await res.text();
    const body = new DOMParser().parseFromString(text, 'text/html');
    const meta = body.getElementsByTagName('meta')[0];
    if (meta) {
      let content = meta.getAttribute('content').toLowerCase();
      let p = content.indexOf('url=');
      if (p > -1) {
        return content.slice(p + 4);
      }
    }
  }
};

const cache = new SizedMap(200, 'shortenedURLs');
const supportedHosts = {
  't.co': getURLFromMeta,
};

const shorteners = {};
export default shorteners;
shorteners.isShortened = url => !!supportedHosts[new URL(url).host];
shorteners.getRealURL = async (url) => {
  if (cache.has(url)) {
    return cache.get(url);
  } else {
    const fn = supportedHosts[new URL(url).host];
    if (fn) {
      const realurl = await fn(url);
      if (realurl) {
        cache.push(url, realurl);
      }
      return realurl;
    }
  }
};
