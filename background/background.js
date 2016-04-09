/* global chrome, util */

var MAX_WATCHED = 200;
var options = {
  interval: 15,
  use_same_tab: true,
};

var sources = {};
sources.youtube = function(callback) {
  util.ajax('https://www.youtube.com/feed/subscriptions', function(xhr) {
    var $items = xhr.response.getElementById('browse-items-primary');
    if (!$items) {
      console.error('Not logged in');
      return;
    }
    $items = $items.children[0];
    var items = [];
    for (var i = 0, len = $items.children.length; i < len; i++) {
      var $item = $items.children[i];
      var $user = $item
        .getElementsByClassName('branded-page-module-title')[0].children[0];
      var $thumb = $item.getElementsByClassName('yt-lockup-thumbnail')[1];
      var $length = $thumb.getElementsByClassName('video-time')[0];
      var $content = $item.getElementsByClassName('yt-lockup-content')[0];
      var $meta = $content.getElementsByClassName('yt-lockup-meta-info')[0];
      var hasMeta = $meta.children.length > 1;
      var time = hasMeta ? $meta.children[0].textContent : null;
      var views = hasMeta ? parseInt($meta.children[1].textContent, 10) : null;
      var $desc = $content.getElementsByClassName('yt-lockup-description')[0];

      // Skip videos that have already been watched,
      // and marked watched by YouTube.
      if(!!$thumb.getElementsByClassName('watched-badge').length) {
        continue;
      }

      items.push({
        source: 'youtube',
        user: {
          url: $user.href,
          thumbnail: $user.getElementsByTagName('img')[0].src,
          name: $user.children[1].textContent,
          verified: !!$content
            .getElementsByClassName('yt-channel-title-icon-verified').length
        },
        url: $thumb.children[0].href,
        thumbnail: $thumb.getElementsByTagName('img')[0].src,
        length: $length ? $length.textContent : null,
        title: $content.children[0].children[0].textContent,
        timestamp: hasMeta ? util.relativeToTimestamp(time) : 0, 
        views: views,
        desc: $desc ? $desc.innerHTML : null,
      });
    }
    callback(items);
  });
};

sources.twitch = function(callback) {
  chrome.cookies.get({
    url: 'https://www.twitch.tv/directory/following/videos',
    name: 'api_token',
  }, function(cookie) {
    var xhr = util.ajax('https://api.twitch.tv/kraken/videos/followed?' +
      'limit=20&offset=0&on_site=1', function(xhr) {
        callback(xhr.response.videos.map(function(video) {
          return {
            source: 'twitch',
            user: {
              url: 'https://www.twitch.tv/' + video.channel.name,
              name: video.channel.display_name,
            },
            url: video.url,
            thumbnail: video.preview,
            length: video.length,
            title: video.title,
            timestamp: new Date(video.created_at).getTime(),
            views: video.views,
            desc: video.description,
            game: video.game,
          };
        }));
    });
    xhr.setRequestHeader('Twitch-Api-Token', cookie.value);
    xhr.responseType = 'json';
  });
};

var allVideos;
var watchedVideos;
var watchedVideosMap = {};

function checkForUpdates() {
  var keys = Object.keys(sources);
  var callsDone = 0;
  var results = [];

  keys.forEach(function(source) {
    sources[source](function(items) {
      results = results.concat(items);
      if (++callsDone === keys.length) {
        results.sort(function(a, b) { return b.timestamp - a.timestamp; });
        allVideos = results;
        updateMaxVideos();
      }
    });
  });
}

function updateMaxVideos() {
  var results = allVideos
    .filter(function(video) { return !watchedVideosMap[video.url]; })
    .slice(0, 50);
  chrome.browserAction.setBadgeText({
    text: results.length ? '' + results.length : '',
  });
  localStorage.setItem('videos', JSON.stringify(results));
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
    updateMaxVideos();
  } else {
    for (var key in changes) {
      options[key] = changes[key].newValue;
    }
    localStorage.setItem('options', JSON.stringify(options));
    if (changes.interval) {
      checkEveryNowAndThen();
    }
  }
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
