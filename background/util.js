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
 * @param {Function(Object)} callback
 * @return {XMLHttpRequest}
 */
export const ajax = (url, opts, callback) => {
  if (ajax.active >= ajax.max) {
    ajax.queue.push([url, opts, callback]);
    return;
  }

  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }

  const parsed = new URL(url);
  if (window.location.protocol.indexOf('http') === 0 &&
      url.indexOf('http') === 0) {
    parsed.protocol = window.location.protocol;
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
      callback(cache.get(cacheRequestKey));
      return;
    }
  }

  ajax.active++;
  let responseType;
  return fetch(url, {
    credentials: 'include',
    redirect: 'follow',
    headers: opts.headers,
  }).then((response) => {
    ajax.active--;
    ajax.next();
    if (!response.ok) return callback(null);

    const type = response.headers.get('content-type');
    if (opts.responseType === 'text') {
      return response.text();
    } else if (opts.responseType === 'json' || type.includes('application/json')) {
      responseType = 'json';
      return response.json();
    } else if (opts.responseType === 'document' || type.includes('text/html')) {
      responseType = 'document';
      return response.text();
    } else if (opts.responseType === 'url-encoded' ||
      type.includes('application/x-www-form-urlencoded')) {
      responseType = 'url-encoded';
      return response.text();
    } else {
      return response.text();
    }
  }).then((body) => {
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
    if (opts.cache) {
      if (opts.cache.transform) {
        data = opts.cache.transform(data);
      }
      if (data) {
        cache.push(cacheRequestKey, data);
      }
    }
    callback(data || null);
  });
};

ajax.queue = [];
ajax.max = 5;
ajax.active = 0;
ajax.cache = {};
ajax.next = () => {
  if (ajax.queue.length && ajax.active < ajax.max) {
    const args = ajax.queue.shift();
    setTimeout(() => {
      ajax(...args);
    });
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
  const n = parseInt(r[1], 10);
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

/*
 * Calls a list of functions in parallel, waits until all of them have
 * called their respective callback function before calling the given callback.
 *
 * @param {Array.<Function(Function(Object))} funcs
 * @param {Function(Array.<Object>)} callback Will be called with a list of
 *   the objects for which each of the callbacks were given, in the order
 *   in which the functions were originally laid out.
 */
export const parallel = (funcs, callback) => {
  if (!funcs.length) { return callback([]); }
  let callsDone = 0;
  let results = [];
  funcs.forEach((func, i) => {
    func((result) => {
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
export const parallelMap = (args, func, callback) => {
  parallel(args.map((arg) => {
    return (callback) => {
      func(arg, callback);
    };
  }), callback);
};

/**
 * Calls one function in parallel, and calls the callback with the
 * items in `args` for which the async function is true.
 *
 * @param {Array.<Object>} args
 * @param {Function(Object, Function(Object))} func
 * @param {Function(Array.<Object>)} callback
 */
export const parallelFilter = (args, func, callback) => {
  const filteredList = [];
  parallel(args.map((arg, i) => {
    return (callback) => {
      func(arg, (success) => {
        if (success) {
          filteredList[i] = arg;
        }
        callback();
      });
    };
  }), () => {
    callback(filteredList.filter(d => !!d));
  });
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
