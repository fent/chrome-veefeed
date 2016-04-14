/* global chrome, sources, util */

var MAX_WATCHED = 150; // Max watched videos to keep in storage.
var MAX_KNOWN = 200;   // Max videos in memory to "know" about, to notify.
var MAX_VIDEOS = 50;   // Max videos to display for each group.
var QUEUE_WAIT = 2500; // How long to wait to play queued up videos.

var options = {
  sources: { youtube: true, twitch: false },
  interval: 15,
  use_same_tab: true,
  ignore: [],
  show_ignored_tab: false,
  show_notifications: false,
  play_sound: '',
  show_watched: false,
  show_ungrouped: false,
  merge: [],
};


var allVideos;
var watchedVideos;
var knownVideos = new util.sizedMap(MAX_KNOWN);
var ignoredVideos;
var ignoreRules = [];
var groups = [];
var queueTabs = {};
var queueUrlMap = {};

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
        allVideos = results;
        allVideos.sort(function(a, b) { return b.timestamp - a.timestamp; });
        updateVideos();
      }
    });
  });
}

function mergeMatch(source, username, video) {
  return video.source === source && video.user.name === username;
}

function updateVideos() {
  ignoredVideos = [];

  var results = allVideos
    .filter(function(video) {
      delete video.otherSource;
      if (watchedVideos.has(video.url)) {
        if (options.show_watched) {
          video.watched = true;
        } else {
          return false;
        }
      }
      var ignoreIt = matchRules(ignoreRules, video);
      if (ignoreIt) { ignoredVideos.push(video); }
      return !ignoreIt;
    });

  // See if any videos can be merged.
  options.merge.forEach(function(rule) {
    results
      .filter(mergeMatch.bind(null, rule.source1, rule.username1))
      .forEach(function(video1) {
        if (video1.otherSource) { return; }
        for (var i = results.length - 1; i >= 0; i--) {
          var video2 = results[i];
          if (!mergeMatch(rule.source2, rule.username2, video2)) { continue; }
          if (util.isSameVideo(video1, video2)) {
            results.splice(i, 1);

            // Merge everything from other source to preferred source.
            // If one is watched, they both will be.
            for (var key in video2) {
              if (!video1[key]) { video1[key] = video2[key]; }
            }
            video1.otherSource = { source: video2.source, url: video2.url };
          }
        }
      });
  });

  // Check if there are any new videos, only after the first fetch of videos.
  if (knownVideos.list.length) {
    var newVideos = results.filter(function(video) {
      return !knownVideos.has(video.url) && !video.watched;
    });

    if (options.show_notifications && newVideos.length === 1) {
      chrome.notifications.create('vee', {
        type: 'basic',
        iconUrl: newVideos[0].thumbnail,
        title: newVideos[0].title,
        message: newVideos[0].user.name,
        contextMessage: newVideos[0].desc.slice(0, 50),
        eventTime: newVideos[0].timestamp,
      });
    } else if (options.show_notifications && newVideos.length > 1) {
      chrome.notifications.create('vee', {
        type: 'list',
        iconUrl: newVideos[0].thumbnail,
        title: newVideos[0].title,
        message: 'New videos',
        eventTime: newVideos[0].timestamp,
        items: newVideos.map(function(video) {
          return { title: video.title, message: video.user.name };
        }),
      });
    }

    if (options.play_sound && newVideos.length) {
      var audio = new Audio();
      audio.src = 'options/bower_components/chrome-options/sounds/' +
        options.play_sound + '.wav';
      audio.play();
    }

    newVideos.forEach(function(video) { knownVideos.push(video.url); });
  } else {
    results.forEach(function(video) { knownVideos.push(video.url); });
  }

  var matchedMap = {};
  var groupedVideos = groups.map(function(group) {
    var matched = results.filter(matchRules.bind(null, group.rules));
    matched.forEach(function(video) { matchedMap[video.url] = true; });
    return { name: group.name, videos: matched.slice(0, MAX_VIDEOS) };
  });

  var ungroupedVideos = results.filter(function(video) {
    return !matchedMap[video.url];
  }).slice(0, MAX_VIDEOS);

  results = results.slice(0, MAX_VIDEOS);
  var unwatched = results.filter(function(video) {
    return !video.watched;
  }).length;
  chrome.browserAction.setBadgeText({
    text: unwatched ? '' + unwatched : '',
  });

  // Store results into local storage so that popup can read it.
  localStorage.setItem('videos', JSON.stringify(results));
  localStorage.setItem('groups', JSON.stringify(groupedVideos));
  localStorage.setItem('ungrouped', JSON.stringify(ungroupedVideos));
  localStorage.setItem('ignored',
    JSON.stringify(ignoredVideos.slice(0, MAX_VIDEOS)));
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
chrome.storage.sync.get(['watched', 'groups'].concat(optionsKeys),
  function(items) {
  // Keep track of watched videos in storage so that this extension
  // works across computers.
  watchedVideos = new util.sizedMap(MAX_WATCHED, items.watched || []);
  ignoreRules = generateRules(items.ignore || []);
  groups = items.groups || [];
  groups.forEach(function(group) { generateRules(group.rules); });

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

function generateRules(rules) {
  return rules.map(function(rule) {
    ['user', 'title', 'game'].forEach(function(key) {
      if (!rule[key]) { return; }
      var exp = rule[key].replace(/[-[\]{}()*+?.\\^$|]/g, function(m) {
        return m === '*' ? '.*' : '\\' + m;
      });
      rule[key] = new RegExp('^' + exp + '$', 'i');
    });
    return rule;
  });
}

function matchRules(rules, video) {
  return rules.some(function(ignore) {
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
}

// Clear queue when extension starts.
localStorage.removeItem('queue');

function updateQueue(queue, tabID, url) {
  if (!queue.length) {
    delete queueTabs[tabID];
    delete queueUrlMap[tabID];
  } else {
    queue.forEach(function(url, i) { queueUrlMap[tabID][url] = i; });
    delete queueUrlMap[tabID][url];
  }
}

chrome.runtime.onMessage.addListener(function(request, sender) {
  var queue;

  if (request.watched) {
    watchedVideos.push(request.watched);
    chrome.storage.sync.set({ watched: watchedVideos.list });

  } else if (request.queue) {
    var pos = (queueTabs[request.tabID] = queueTabs[request.tabID] || [])
      .push(request.url);
    (queueUrlMap[request.tabID] = queueUrlMap[request.tabID] || {})
      [request.url] = pos - 1;
    localStorage.setItem('queue', JSON.stringify(queueUrlMap));

  } else if (request.unqueue) {
    if (queue = queueTabs[request.tabID]) {
      var i = queue.indexOf(request.url);
      if (i > -1) {
        queue.splice(i, 1);
        updateQueue(queue, request.tabID, request.url);
      }
    }
    localStorage.setItem('queue', JSON.stringify(queueUrlMap));

  } else if (request.ended) {
    var tabID = sender.tab.id;
    queue = queueTabs[tabID];
    if (queue) {
      var nextVideoUrl = queue.shift();
      updateQueue(queue, tabID, nextVideoUrl);

      localStorage.setItem('queue', JSON.stringify(queueUrlMap));
      watchedVideos.push(nextVideoUrl);
      chrome.storage.sync.set({ watched: watchedVideos.list });

      // Play the next video in a few secs...
      setTimeout(function() {
        chrome.tabs.update(parseInt(tabID), {
          url: nextVideoUrl,
          active: true
        });
      }, QUEUE_WAIT);
    }
  }
});

chrome.storage.onChanged.addListener(function(changes) {
  if (changes.watched) {
    // Watched videos are in storage so that they are remembered
    // across the same account.
    watchedVideos = new util.sizedMap(MAX_WATCHED, changes.watched.newValue);
  } else {
    for (var key in changes) {
      options[key] = changes[key].newValue;
    }
    localStorage.setItem('options', JSON.stringify(options));
    if (changes.interval) {
      checkEveryNowAndThen();
    }
    if (changes.ignore) {
      ignoreRules = generateRules(changes.ignore.newValue);
    }
    if (changes.groups) {
      groups = changes.groups.newValue;
      groups.forEach(function(group) { generateRules(group.rules); });
    }
  }

  updateVideos();
});

chrome.tabs.onAttached.addListener(function(tabId, attachInfo) {
  var tabs = JSON.parse(localStorage.getItem('tabs'));
  if (tabs && tabs[tabId]) {
    tabs[tabId] = attachInfo.newWindowId;
    localStorage.setItem('tabs', JSON.stringify(tabs));
  }
});

chrome.tabs.onRemoved.addListener(function(tabId) {
  var tabs = JSON.parse(localStorage.getItem('tabs'));
  if (tabs && tabs[tabId]) {
    delete tabs[tabId];
    localStorage.setItem('tabs', JSON.stringify(tabs));
    delete queueTabs[tabId];
    delete queueUrlMap[tabId];
    localStorage.setItem('queue', JSON.stringify(queueUrlMap));
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
