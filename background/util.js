import SizedMap from './SizedMap.js';


/*
 * Helper wrapper function around fetch with a cache and type handling.
 *
 * @param {string} url
 * @param {!Object} opts
 * @param {Object} opts.headers
 * @param {Object} opts.cache
 * @param {Function} opts.cache.transform
 * @param {number} opts.cache.ttl
 * @param {string} opts.responseType
 * @param {Object} opts.data
 * @return {Promise.<Object>}
 */
export const ajax = (url, opts = {}) => {
  if (ajax.active >= ajax.max) {
    return new Promise((resolve) => {
      ajax.queue.push([resolve, url, opts]);
    });
  }

  const parsed = new URL(url);
  if (window.location.protocol.indexOf('http') === 0 &&
      url.indexOf('http') === 0) {
    parsed.protocol = window.location.protocol;
    url = parsed.href;
  }

  if (opts.data) {
    const params = new URLSearchParams(parsed.search);
    for (let [key, value] of Object.entries(opts.data)) {
      if (Array.isArray(value)) {
        for (let ivalue of value) {
          params.append(key, ivalue);
        }
      } else {
        params.append(key, value);
      }
    }
    parsed.search = params.toString();
    url = parsed.href;
  }

  let cache, cacheRequestKey;
  if (opts.cache) {
    if (!ajax.cache[parsed.host]) {
      ajax.cache[parsed.host] =
        new SizedMap(200, 'cache-' + parsed.host, opts.cache.ttl);
    }
    cache = ajax.cache[parsed.host];
    cacheRequestKey = parsed.pathname + parsed.search;
    if (cache.has(cacheRequestKey)) {
      ajax.next();
      return cache.get(cacheRequestKey);
    } else {
      const req = request(url, opts);
      // Store the promise in the cache in case other of the same requests
      // are made before this one finishes.
      cache.push(cacheRequestKey, req);
      return req;
    }
  }
  return request(url, opts);
};

const request = async (url, opts) => {
  ajax.active++;
  let responseType;
  const response = await fetch(url, {
    credentials: 'include',
    redirect: 'follow',
    headers: opts.headers,
  });
  ajax.active--;
  ajax.next();
  if (!response.ok) throw Error('status code: ' + response.status);

  const type = response.headers.get('content-type');
  let body;
  if (opts.responseType === 'text') {
    body = await response.text();
  } else if (opts.responseType === 'json' || type.includes('application/json')) {
    responseType = 'json';
    body = await response.json();
  } else if (opts.responseType === 'document' || type.includes('text/html')) {
    responseType = 'document';
    body = await response.text();
  } else if (opts.responseType === 'url-encoded' ||
    type.includes('application/x-www-form-urlencoded')) {
    responseType = 'url-encoded';
    body = await response.text();
  } else {
    body = await response.text();
  }

  let data;
  switch (responseType) {
    case 'document':
      data = new DOMParser().parseFromString(body, 'text/html');
      break;
    case 'url-encoded':
      data = parseQueryString(body);
      break;
    default:
      data = body;
  }
  if (opts.cache && opts.cache.transform) {
    data = await opts.cache.transform(data);
  }
  return data || null;
};

ajax.queue = [];
ajax.max = 5;
ajax.active = 0;
ajax.cache = {};
ajax.next = () => {
  if (ajax.queue.length && ajax.active < ajax.max) {
    const [resolve, url, opts] = ajax.queue.shift();
    resolve(ajax(url, opts));
  }
};

/*
 * Converts time formatted as '2 days ago' to a timestamp.
 *
 * @param {string} str
 * @return {number}
 */
export const relativeToTimestamp = (str) => {
  const r = /(\d+)\s+(second|minute|hour|day)s?/.exec(str);
  if (!r) { return null; }
  const n = parseInt(r[1]);
  const multiplier = {
    second: 1,
    minute: 60,
    hour: 3600,
    day: 86400,
  }[r[2]];
  return Date.now() - n * multiplier * 1000;
};

/**
 * Converts from 00:00:00 or 00:00 to seconds.
 *
 * @param {string} str
 * @return {number}
 */
export const timeToSeconds = (str) => {
  const s = str.split(':');
  return s.length === 2 ?
    ~~s[0] * 60 + ~~s[1] :
    ~~s[0] * 3600 + ~~s[1] * 60 + ~~s[2];
};

/*
 * @param {Object} video1
 * @param {Object} video2
 * @return {boolean}
 */
export const isSameVideo = (video1, video2) => {
  // If the videos are within a few seconds of each other,
  // they might be the same video...
  // Compare using percent, for longer videos,
  // the difference in length tends to be higher.
  if (Math.abs(video1.length - video2.length) > 5 &&
      Math.abs(1 - (video1.length / video2.length)) > 0.02) {
    return false;
  }

  // If the titles are exact, then they are the same.
  if (video1.title === video2.title) { return true; }

  const wordsMap = {};
  video2.title.split(/\s+/).forEach((word) => {
    if (word) { wordsMap[word.toLowerCase()] = true; }
  });

  // Look for numbers, if they both have the same numbers, then ok...
  const pattern = /((?:\d+:)?\d\d?:\d\d|\d+(?:\.\d+)%?)/g;
  let r;
  while ((r = pattern.exec(video1))) {
    let num = r[1];
    if (!wordsMap[num]) { return false; }
    delete wordsMap[num];
  }

  // If they both have two of the same words, consider them the same video.
  return video2.title.split(/\s+/).filter((word) => {
    return word && wordsMap[word.toLowerCase()];
  }).length >= 2;
};

/**
 * Calls one function in parallel, and returns a promise with the
 * items in `args` for which the async function is true.
 *
 * @param {Array.<Object>} args
 * @param {Function(Object)} func
 * @return {Promise<Array.<Object>>}
 */
export const parallelFilter = async (args, func) => {
  const results = await Promise.all(args.map(func));
  return args.filter((arg, i) => results[i]);
};

/**
 * Returns ony the ID portion of a video URL. Because saving just the id
 * in storage takes up much less space than the entire URL.
 *
 * @param {string} url
 * @return {string}
 */
export const videoID = (url) => {
  const result = /([a-z0-9_-]+)$/i.exec(url);
  return result && result[1] || url;
};

/**
 * @param {string} str
 * @return {Object}
 */
export const parseQueryString = (str) => {
  const obj = {};
  const searchParams = new URLSearchParams(str);
  for (let pair of searchParams.entries()) {
    obj[pair[0]] = pair[1];
  }
  return obj;
};

/**
 * Generates a regexp for a minimatch string.
 *
 * @param {string} str
 * @return {RegExp}
 */
export const minimatch = (str) => {
  const exp = str
    .replace(/[-[\]{}()+?.\\^$|]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp('^' + exp + '$', 'i');
};

/**
 * Returns an array of unique items.
 *
 * @param {Array.<Object>} arr
 * @return {Array.<Object>}
 */
export const uniq = (arr) => {
  return Array.from(new Set(arr));
};

/**
 * @param {number} ms
 * @return {Promise}
 */
export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Converts urls in a string, that are not already html links, to html links.
 *
 * @param {string} str
 * @return {string}
 */
const $a = document.createElement('a');
export const embedLinks = (str) => {
  return str.replace(/(href=")?(https?:\/\/[^"'()[\]{} ]+)/g, (m, p1, url) => {
    if (p1) return m;
    $a.href = url;
    $a.target = '_blank';
    $a.textContent = url;
    return $a.outerHTML;
  });
};
