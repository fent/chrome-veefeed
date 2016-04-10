/* global chrome, sources */

var MAX_WATCHED = 200;
var options = {
  sources: { youtube: true, twitch: true },
  interval: 15,
  use_same_tab: true,
  ignore: [],
  show_ignored_tab: false,
};


var allVideos;
var ignoredVideos;
var watchedVideos;
var watchedVideosMap = {};
var ignoreRules = [];

function checkForUpdates() {
  var keys = Object.keys(sources);
  var totalCalls = 0;
  var callsDone = 0;
  var results = [];

  keys.forEach(function(source) {
    if (!options.sources[source]) { return; }
    totalCalls++;
    sources[source](function(items) {
      results = results.concat(items);
      if (++callsDone === totalCalls) {
        results.sort(function(a, b) { return b.timestamp - a.timestamp; });
        allVideos = results;
        updateMaxVideos();
      }
    });
  });
}

function updateMaxVideos() {
  ignoredVideos = [];
  var results = allVideos
    .filter(function(video) {
      if (watchedVideosMap[video.url]) { return false; }
      var ignoreIt = ignoreRules.some(function(ignore) {
        if (ignore.source !== video.source) { return false; }
        if (ignore.user && !ignore.user.test(video.user.name)) {
          return false;
        }
        if (ignore.title && !ignore.title.test(video.title)) {
          return false;
        }
        if (ignore.game && !ignore.game.test(video.game)) {
          return false;
        }
        return ignore.user || ignore.title || ignore.game;
      });
      if (ignoreIt) { ignoredVideos.push(video); }
      return !ignoreIt;
    })
    .slice(0, 50);

  chrome.browserAction.setBadgeText({
    text: results.length ? '' + results.length : '',
  });
  localStorage.setItem('videos', JSON.stringify(results));
  localStorage.setItem('ignored', JSON.stringify(ignoredVideos.slice(0, 50)));
}

// Check every now and then for new videos.
var timeoutID;
function checkEveryNowAndThen() {
  timeoutID = setTimeout(function() {
    checkForUpdates();
    checkEveryNowAndThen();
  }, options.interval * 1000 * 60);
}

// Change badge color, the default red is ugh.
chrome.browserAction.setBadgeBackgroundColor({ color: [0, 0, 255, 192] });

var optionsKeys = Object.keys(options);
chrome.storage.sync.get(['watched'].concat(optionsKeys), function(items) {
  // Keep track of watched videos in storage so that this extension
  // works across computers.
  watchedVideos = items.watched || [];
  makeWatchedMap();
  generateIgnore(items.ignore || []);

  optionsKeys.forEach(function(key) {
    if (items[key] !== undefined) {
      options[key] = items[key];
    }
  });
  localStorage.setItem('options', JSON.stringify(options));

  // Check for videos when Chrome opens.
  checkForUpdates();
  checkEveryNowAndThen();
});

function makeWatchedMap() {
  watchedVideosMap = {};
  watchedVideos.forEach(function(url) { watchedVideosMap[url] = true; });
}

function generateIgnore(rules) {
  rules.map(function(rule) {
    ['user', 'title', 'game'].forEach(function(key) {
      if (!rule[key]) { return; }
      var exp = rule[key].replace(/[-[\]{}()*+?.\\^$|]/g, function(m) {
        return m === '*' ? '.*' : '\\' + m;
      });
      rule[key] = new RegExp('^' + exp + '$', 'i');
    });
  });
  ignoreRules = rules;
}

chrome.runtime.onMessage.addListener(function(request) {
  if (request.watched) {
    watchedVideos.push(request.watched);

    // Only keep  track of last 100 videos watched.
    if (watchedVideos.length > MAX_WATCHED) {
      watchedVideos = watchedVideos.slice(-MAX_WATCHED);
    }
    chrome.storage.sync.set({ watched: watchedVideos });
  }
});

chrome.storage.onChanged.addListener(function(changes) {
  if (changes.watched) {
    watchedVideos = changes.watched.newValue;
    makeWatchedMap();
  } else {
    for (var key in changes) {
      options[key] = changes[key].newValue;
    }
    localStorage.setItem('options', JSON.stringify(options));
    if (changes.interval) {
      checkEveryNowAndThen();
    }
    if (changes.ignore) {
      generateIgnore(changes.ignore.newValue);
    }
  }

  updateMaxVideos();
});

// Clear the tabs that have been opened when the extension starts.
localStorage.removeItem('tabs');

chrome.tabs.onAttached.addListener(function(tabId, attachInfo) {
  var tabs = JSON.parse(localStorage.getItem('tabs'));
  if (tabs && tabs[tabId]) {
    tabs[tabId] = attachInfo.newWindowId;
    localStorage.setItem('tabs', JSON.stringify(tabs));
  }
});

// Open options on installed.
chrome.runtime.onInstalled.addListener(function() {
  chrome.storage.sync.get(null, function(items) {
    if (!Object.keys(items).length) {
      chrome.runtime.openOptionsPage();
    }
  });
});
