/* global chrome, sources, util */

const MAX_WATCHED   = 400;  // Max watched videos to keep in storage.
const MAX_KNOWN     = 400;  // Max videos in memory to "know" about, to notify.
const MAX_VIDEOS    = 50;   // Max videos to display for each group.
const QUEUE_WAIT_MS = 2500; // How long to wait to play queued up videos.
const BADGE_COLOR        = '#225F86';
const BADGE_COLOR_QUEUED = '#6294df';

const options = {
  sources: { youtube: true, twitch: false },
  interval: 15,
  use_same_tab: true,
  pause_other_tabs: true,
  ignore: [],
  ignore_live: false,
  ignore_future: false,
  show_ignored_tab: false,
  show_notifications: false,
  play_sound: '',
  show_watched: false,
  only_play_queued_at_top: true,
  show_ungrouped: false,
  merge: [],
  hide_empty_tabs: false,
};


var allVideos;
var watchedVideos = {};
var knownVideos = new util.SizedMap(MAX_KNOWN);
var ignoredVideos;
var ignoreRules = [];
var groups = [];
var queueTabs = {};
var queueUrlMap = {};
var openedVideos = {};
var pausedTabs = {};

function checkForUpdates() {
  sources.getVideos(options.sources, (results) => {
    allVideos = results;
    updateVideos();
  });
}

function mergeMatch(source, username, video) {
  return video.source === source && video.user.name === username;
}

function updateVideos() {
  ignoredVideos = [];
  var now = Date.now();

  var results = allVideos
    .filter((video) => {
      if (!video.source) { return false; }
      delete video.otherSource;
      if (!video.watched) {
        var source = sources.sourceFromURL(video.url);
        if (source) {
          video.watched = watchedVideos[source].has(util.videoID(video.url));
        }
      }
      var ignoreIt = matchRules(ignoreRules, video);
      ignoreIt = ignoreIt ||
        options.ignore_live && video.live ||
        options.ignore_future && now < video.timestamp;
      if (ignoreIt) { ignoredVideos.push(video); }
      return !ignoreIt;
    });

  // See if any videos can be merged.
  options.merge.forEach((rule) => {
    results
      .filter(mergeMatch.bind(null, rule.source1, rule.username1))
      .forEach((video1) => {
        if (video1.otherSource) { return; }
        for (let i = results.length - 1; i >= 0; i--) {
          var video2 = results[i];
          if (!mergeMatch(rule.source2, rule.username2, video2)) { continue; }
          if (util.isSameVideo(video1, video2)) {
            results.splice(i, 1);

            // Merge everything from other source to preferred source.
            // If one is watched, they both will be.
            for (let key in video2) {
              if (!video1[key]) { video1[key] = video2[key]; }
            }
            video1.otherSource = {
              source: video2.source,
              url: video2.url,
              user: video2.user,
            };
          }
        }
      });
  });

  // Lower the amount of videos sent to popup if `show_watched` is false.
  results = results.filter(video => !video.watched || options.show_watched);

  // Sort.
  allVideos.sort((a, b) => {
    if (b.timestamp !== a.timestamp) {
      return b.timestamp - a.timestamp;
    } else {
      return a.index - b.index;
    }
  });

  // Check if there are any new videos, only after the first fetch of videos.
  if (knownVideos.list.length) {
    var newVideos = results.filter((video) => {
      return !knownVideos.has(video.url) && !video.watched;
    });

    if (options.show_notifications && newVideos.length) {
      var notification = {};
      if (newVideos.length === 1) {
        var $node = document.createElement('div');
        $node.innerHTML = newVideos[0].desc;
        notification = {
          type: 'basic',
          title: newVideos[0].title,
          message: newVideos[0].user.name,
          contextMessage: $node.textContent.slice(0, 50),
          eventTime: newVideos[0].timestamp,
        };
      } else {
        notification = {
          type: 'list',
          title: newVideos[0].title,
          message: 'New videos',
          eventTime: newVideos[0].timestamp,
          items: newVideos.map((video) => {
            return { title: video.title, message: video.user.name };
          }),
        };
      }
      var video = newVideos
        .find(video => video.thumbnail);
      if (video) { notification.iconUrl = video.thumbnail; }
      chrome.notifications.create('veefeed' + Date.now(), notification);
    }

    if (options.play_sound && newVideos.length) {
      var audio = new Audio();
      audio.src = 'options/bower_components/chrome-options/sounds/' +
        options.play_sound + '.wav';
      audio.play();
    }

    newVideos.forEach((video) => { knownVideos.push(video.url); });
  } else {
    results.forEach((video) => { knownVideos.push(video.url); });
  }

  var unwatched = 0;
  var matchedMap = {};
  var matchedOnlyMap = {};
  var groupedVideos = groups.map((group) => {
    var matched = results
      .filter(matchRules.bind(null, group.rules))
      .filter(function(video) { return !matchedOnlyMap[video.url]; });
    matched.forEach(function(video) {
      matchedMap[video.url] = true;
      if (group.only) { matchedOnlyMap[video.url] = true; }
    });
    group = { name: group.name, videos: matched.slice(0, MAX_VIDEOS) };
    unwatched += group.videos.filter(video => !video.watched).length;
    return group;
  });

  var ungroupedVideos =
    results.filter(video => !matchedMap[video.url]).slice(0, MAX_VIDEOS);

  unwatched += ungroupedVideos.filter(video => !video.watched).length;

  chrome.browserAction.setBadgeText({ text: unwatched ? '' + unwatched : '' });

  // Store results into local storage so that popup can read it.
  localStorage.setItem('videos', JSON.stringify(results.slice(0, MAX_VIDEOS)));
  localStorage.setItem('groups', JSON.stringify(groupedVideos));
  localStorage.setItem('ungrouped', JSON.stringify(ungroupedVideos));
  localStorage.setItem('ignored',
    JSON.stringify(ignoredVideos.slice(0, MAX_VIDEOS)));
}

// Check every now and then for new videos.
var timeoutID;
function checkEveryNowAndThen() {
  timeoutID = setTimeout(() => {
    clearTimeout(timeoutID);
    checkForUpdates();
    checkEveryNowAndThen();
  }, options.interval * 1000 * 60);
}

// Change badge color, the default red is ugh.
chrome.browserAction.setBadgeBackgroundColor({ color: BADGE_COLOR });

var optionsKeys = ['groups']
  .concat(Object.keys(options))
  .concat(Object.keys(sources.videos).map(s => 'watched_' + s));

chrome.storage.sync.get(optionsKeys, (items) => {
  // Keep track of watched videos in storage so that this extension
  // works across computers.
  Object.keys(sources.videos).forEach((source) => {
    watchedVideos[source] =
      new util.SizedMap(MAX_WATCHED, items['watched_' + source] || []);
  });

  ignoreRules = generateRules(items.ignore || []);
  groups = items.groups || [];
  groups.forEach((group) => { generateRules(group.rules); });

  optionsKeys.forEach((key) => {
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
  return rules.map((rule) => {
    ['user', 'title', 'game'].forEach((key) => {
      if (!rule[key]) { return; }
      rule[key] = util.minimatch(rule[key]);
    });
    return rule;
  });
}

function matchRules(rules, video) {
  return rules.some((ignore) => {
    if (video.collections && video.collections.some((col) => {
      if (ignore.source && ignore.source !== col.source) { return false; }
      if (ignore.user && col.users && col.users.length &&
        col.users.every(user => !ignore.user.test(user.name))) { return false; }
      if (ignore.title && !ignore.title.test(col.title)) { return false; }
      return ignore.source || ignore.user || ignore.title;
    })) { return true; }
    if (ignore.source && ignore.source !== video.source) { return false; }
    if (ignore.user && video.user && !ignore.user.test(video.user.name)) {
      return false; }
    if (ignore.title && !ignore.title.test(video.title)) { return false; }
    if (ignore.game && !ignore.game.test(video.game)) { return false; }
    return ignore.source || ignore.user || ignore.title || ignore.game;
  });
}

// Clear queue and videos playing when extension starts.
localStorage.removeItem('queue');
localStorage.removeItem('opened');

function updateQueue(queue, tabID, url) {
  if (!queue.length) {
    // If queue is empty, remove the tab maps.
    delete queueTabs[tabID];
    delete queueUrlMap[tabID];
    chrome.browserAction.setBadgeBackgroundColor({
      color: BADGE_COLOR,
      tabId: +tabID,
    });
  } else {
    // Otherwise, update the position of the queued videos,
    // since a video could have been removed from the middle.
    queue.forEach((o, i) => { queueUrlMap[tabID][o.url] = i; });
    delete queueUrlMap[tabID][url];
  }
  localStorage.setItem('queue', JSON.stringify(queueUrlMap));
}

function queueVideo(tabID, video) {
  var pos = (queueTabs[tabID] = queueTabs[tabID] || [])
    .push(video);
  (queueUrlMap[tabID] = queueUrlMap[tabID] || {})[video.url] = pos - 1;

  // If this is the next video up, let the playing tab know
  // so that it can update the contents of its "Next" button.
  if (pos === 1) {
    chrome.tabs.sendMessage(+tabID, { setQueue: true, video: video });
  }
}

function afterQueue(tabID) {
  localStorage.setItem('queue', JSON.stringify(queueUrlMap));
  chrome.browserAction.setBadgeBackgroundColor({
    color: BADGE_COLOR_QUEUED,
    tabId: +tabID,
  });
}

function unqueueVideo(tabID, url) {
  var queue = queueTabs[tabID];
  if (!queue) { return; }
  var i = queue.findIndex(o => o.url === url);
  if (i > -1) {
    queue.splice(i, 1);
    updateQueue(queue, tabID, url);
    if (i === 0 || !queue.length) {
      chrome.tabs.sendMessage(+tabID, { setQueue: true, video: queue[0] });
    }
  }
}

function markAsWatched(url) {
  if (!knownVideos.has(url)) { return; }
  var source = sources.sourceFromURL(url);
  if (!source) { return; }
  watchedVideos[source].push(util.videoID(url));

  // Watched videos is updated in storage since there is a listener
  // for this storage key.
  chrome.storage.sync.set({
    ['watched_' + source]: watchedVideos[source].list
  });
}

function queueMenuClicked(tabID, info) {
  var url = info.linkUrl;
  sources.getMetaForVideo(url, (video) => {
    if (!video) { return; }

    // Keep the original URL, since it might contain things like timestamps.
    video.url = url;
    queueVideo(tabID, video);
    afterQueue(tabID);
  });
}

function markAsPlaying(tabID, url, title) {
  openedVideos[tabID] = { url: url, playing: true };
  localStorage.setItem('opened', JSON.stringify(openedVideos));

  chrome.contextMenus.update('queue', { enabled: true });
  chrome.contextMenus.update('queue-' + tabID, { title: title }, () => {
    if (chrome.runtime.lastError) {
      chrome.contextMenus.create({
        id: 'queue-' + tabID,
        parentId: 'queue',
        title: title,
        onclick: queueMenuClicked.bind(null, tabID),
        contexts: ['link'],
        targetUrlPatterns: sources.patterns,
      });
    }
  });
}

function removeMenu(tabID) {
  chrome.contextMenus.remove('queue-' + tabID);

  // If there are no more videos that are playing, disable the queue menu.
  if (Object.keys(openedVideos).every((key) => {
    return key !== tabID || !openedVideos[key].playing;
  })) {
    chrome.contextMenus.update('queue', { enabled: false });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  var queue;

  if (request.watched) {
    // Remove this video from queue if opened from a tab that has a queue.
    if (request.tabID) { unqueueVideo(request.tabID, request.url); }
    markAsWatched(request.url);

  } else if (request.started) {
    unqueueVideo(sender.tab.id, sender.tab.url);
    markAsWatched(sender.tab.url);
    markAsPlaying(sender.tab.id, sender.tab.url, sender.tab.title);
    queue = queueTabs[sender.tab.id];
    if (queue) {
      sendResponse(queue[0]);
    }

  } else if (request.newTab) {
    // When a new tab is created for a video,
    // check if the same videos has other video tabs opened
    // pause them if they are playing.
    if (!options.pause_other_tabs) { return; }
    pausedTabs[request.tabID] = [];
    chrome.tabs.query({ windowId: request.winID }, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.url !== request.url && sources.isVideoPage(tab.url)) {
          chrome.tabs.executeScript(tab.id, {
            file: 'content/pause.js',
          }, (results) => {
            if (results[0]) {
              pausedTabs[request.tabID].push(tab.id);
            }
          });
        }
      });
    });

  } else if (request.queue) {
    queueVideo(request.tabID, request.video);
    afterQueue(request.tabID);

  } else if (request.queueAll) {
    request.videos.forEach(queueVideo.bind(null, request.tabID));
    afterQueue(request.tabID);

  } else if (request.unqueue) {
    unqueueVideo(request.tabID, request.video.url);

  } else if (request.ended) {
    if (!openedVideos[sender.tab.id]) { return; }
    openedVideos[sender.tab.id].playing = false;
    localStorage.setItem('opened', JSON.stringify(openedVideos));

    queue = queueTabs[sender.tab.id];
    if (queue) {
      if (options.only_play_queued_at_top && request.scrollTop > 10) {
        return;
      }
      var nextVideo = queue.shift();
      updateQueue(queue, sender.tab.id, nextVideo.url);

      // Play the next video in a few secs...
      setTimeout(() => {
        chrome.tabs.update(parseInt(sender.tab.id), {
          url: nextVideo.url,
        });
      }, QUEUE_WAIT_MS);
    } else {
      removeMenu(sender.tab.id);
    }

  } else if (request.title) {
    if (openedVideos[sender.tab.id] && openedVideos[sender.tab.id].playing) {
      chrome.contextMenus.update('queue-' + sender.tab.id, {
        title: request.title,
      });
    }
  }

});

chrome.storage.onChanged.addListener((changes) => {
  for (let source in sources.videos) {
    // Watched videos are in storage so that they are remembered
    // across the same account.
    if (changes['watched_' + source]) {
      watchedVideos[source] =
        new util.SizedMap(MAX_WATCHED, changes['watched_' + source].newValue);
      updateVideos();
      return;
    }
  }

  for (let key in changes) {
    options[key] = changes[key].newValue;
  }
  localStorage.setItem('options', JSON.stringify(options));

  if (changes.sources) {
    checkForUpdates();
    checkEveryNowAndThen();

  } else {
    if (changes.interval) {
      checkEveryNowAndThen();
    }
    if (changes.ignore) {
      ignoreRules = generateRules(changes.ignore.newValue);
    }
    if (changes.groups) {
      groups = changes.groups.newValue;
      groups.forEach((group) => { generateRules(group.rules); });
    }

    updateVideos();
  }
});

chrome.tabs.onRemoved.addListener((tabID) => {
  if (queueTabs[tabID]) {
    delete queueTabs[tabID];
    delete queueUrlMap[tabID];
    localStorage.setItem('queue', JSON.stringify(queueUrlMap));
  }
  if (openedVideos[tabID]) {
    if (openedVideos[tabID].playing) {
      removeMenu(tabID);
    }
    delete openedVideos[tabID];
    localStorage.setItem('opened', JSON.stringify(openedVideos));
  }
  for (let tabID in pausedTabs) {
    let tabs = pausedTabs[tabID];
    let i = tabs.indexOf(tabID);
    if (i > -1) {
      tabs.splice(i, 1);
    }
  }
  if (pausedTabs[tabID]) {
    setTimeout(() => {
      pausedTabs[tabID].forEach((tabID) => {
        // Possible that the tabs that were paused, were closed before
        // the new video tab was closed. Check if the tab is still
        // around and if it's at the front. Only then play it.
        chrome.tabs.get(tabID, (tab) => {
          if (!tab.active) { return; }
          chrome.tabs.executeScript(tabID, { file: 'content/play.js' });
        });
      });
      delete pausedTabs[tabID];
    }, 700);
  }
});

// Open options on installed.
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(null, (items) => {
    if (!Object.keys(items).length) {
      chrome.runtime.openOptionsPage();
    }
  });
});

// Add context menu so links to videos can be queued up from any page.
chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    id: 'queue',
    title: 'Queue Video',
    contexts: ['link'],
    targetUrlPatterns: sources.patterns,
    enabled: false,
  });
});
