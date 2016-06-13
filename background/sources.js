/* global chrome, util */
/* exported sources */

// Keep a local cache of videos, since some sources link to Twitch,
// but there isn't a way to get a vod's thumbnail only from its id,
// we'll get it by making a request to the Twitch API.
var cachedVideos;
try {
  cachedVideos = JSON.parse(localStorage.getItem('cachedVideos'));
  cachedVideos = new util.SizedMap(200, cachedVideos);
} catch (err) {
  cachedVideos = new util.SizedMap(200);
}

var sources = {
  // Sources which directly host videos.
  videos: {},

  // Sources that link to other websites' videos.
  collections: {},

  getVideos: function(options, callback) {
    function filterEnabled(type) {
      return Object.keys(sources[type])
        .filter(function(source) { return options[source]; })
        .map(function(source) {
          return function(callback) {
            sources[type][source](function(videos) {
              callback({ source: source, videos: videos });
            });
          };
        });
    }

    // First, get videos directly from where they're hosted,
    // in case any of them are included in collection sites.
    util.parallel(filterEnabled('videos'), function(results) {
      var videos = [].concat.apply([], results.map(function(result) {
        result.videos.forEach(function(video) {
          video.source = result.source;
        });
        return result.videos;
      }));
      var videosMap = {};
      videos.forEach(function(video) {
        videosMap[video.url] = video;
        cachedVideos.push(video.url, video, true);
      });
      util.parallel(filterEnabled('collections'), function(results) {
        var colVideos = [].concat.apply([], results.map(function(result) {
          result.videos.forEach(function(video) {
            video.collections = [{ source: result.source }];
          });
          return result.videos;
        }));

        // If anything from a collection site is already in the list of
        // videos directly gathered from a hosting site, then merge them.
        // But give preference to the site hosting the video, in case
        // the user is following those channels.
        // That way, direct channel subscriptions get priority.
        colVideos.forEach(function(colVideo) {
          var video = videosMap[colVideo.url];
          if (video) {
            for (var key in colVideo) {
              if (key === 'collections') {
                if (video.collections) {
                  video.collections.push(colVideo.collections[0]);
                } else {
                  video.collections = colVideo.collections;
                }
              } else if (!video[key]) {
                video[key] = colVideo[key];
              }
            }
          } else {
            colVideo.source = sources.sourceFromURL(colVideo.url);
            videosMap[colVideo.url] = colVideo;
          }
          cachedVideos.push(colVideo.url, colVideo, true);
        });
        localStorage.setItem('cachedVideos', JSON.stringify(cachedVideos.map));

        var allVideos = [];
        for (var url in videosMap) { allVideos.push(videosMap[url]); }
        callback(allVideos);
      });
    });
  },

  sourceFromURL: function(url) {
    var hostname = new URL(url).hostname;
    for (var source in sources.videos) {
      if (hostname.indexOf(source) > -1) {
        return source;
      }
    }
    return null;
  },
};

function getMetaForVideo(video, callback) {
  var parsed = new URL(video.url);
  var host = parsed.host;
  var id;
  if (host === 'youtu.be' || host === 'www.twitch.tv') {
    var s = parsed.pathname.split(/\//);
    id = s[s.length - 1];
  } else if (host === 'www.youtube.com') {
    var r = /v=([^&$]+)/.exec(parsed.search);
    if (r) {
      id = r[1];
    } else {
      console.warn('Could not get video ID of URL: ' + video.url);
      return null;
    }
  }
  if (host === 'www.youtube.com' || host === 'youtu.be') {
    video.url = 'https://www.youtube.com/watch?v=' + id;

    // Using medium quality gives a screenshot without black bars.
    video.thumbnail = 'https://i.ytimg.com/vi/' + id +
      '/mqdefault.jpg?custom=true&w=196&h=110&stc=true&jpg444=true&' +
      'jpgq=90&sp=68';
    callback();
  } else if (host === 'www.twitch.tv') {
    if (cachedVideos.has(video.url)) {
      video.thumbnail = cachedVideos.get(video.url).thumbnail;
      callback();
    } else {
      var url = 'https://api.twitch.tv/kraken/videos/v' + id;
      var xhr = util.ajax(url, function(xhr) {
        var videoMeta = xhr.response;
        if (!videoMeta) { return callback(null); }
        video.thumbnail = videoMeta.preview;
        cachedVideos.push(video.url, video);
        callback();
      });
      xhr.responseType = 'json';
    }
  } else {
    console.warn('No thumbnail generated from URL: ' + video.url);
    callback();
  }
}

sources.videos.youtube = function(callback) {
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
      var views = hasMeta ?
        parseInt($meta.children[1].textContent.replace(/,/g, ''), 0) : null;
      var $starts = $meta.getElementsByClassName('localized-date')[0];
      var timestamp = $starts ?
        parseInt($starts.getAttribute('data-timestamp'), 10) * 1000 :
        // Add i to relative timestamp so that videos that say they were
        // posted at the same time (relatively) are still ordered in the
        // order that they are on the page.
        hasMeta ? util.relativeToTimestamp(time) - i : Date.now() - i;
      var $desc = $content.getElementsByClassName('yt-lockup-description')[0];

      // YouTube videos sometimes don't have thumbnails loaded until
      // the page is scrolle down.
      var url = $thumb.children[0].href;
      var $img = $thumb.getElementsByTagName('img')[0];
      var thumbnail =
        $img.src === 'https://s.ytimg.com/yts/img/pixel-vfl3z5WfW.gif' ?
        thumbnail = $img.getAttribute('data-thumb') : $img.src;
      if (thumbnail.indexOf('//') === 0) {
        thumbnail = 'https:' + thumbnail;
      }

      items.push({
        user: {
          url: $user.href,
          thumbnail: $user.getElementsByTagName('img')[0].src,
          name: $user.children[1].textContent,
          verified: !!$content
            .getElementsByClassName('yt-channel-title-icon-verified').length
        },
        url: url,
        thumbnail: thumbnail,
        length: $length ? util.timeToSeconds($length.textContent) : null,
        title: $content.children[0].children[0].textContent,
        timestamp: timestamp, 
        live: !!$content.getElementsByClassName('yt-badge-live').length,
        views: views,
        desc: $desc ? $desc.innerHTML : '',
        watched: !!$thumb.getElementsByClassName('watched-badge').length,
      });
    }
    callback(items);
  });
};

sources.videos.twitch = function(callback) {
  chrome.cookies.get({
    url: 'https://www.twitch.tv/directory/following/videos',
    name: 'api_token',
  }, function(cookie) {
    var xhr = util.ajax('https://api.twitch.tv/kraken/videos/followed?' +
      'limit=40&broadcast_type=highlight&offset=0&on_site=1', function(xhr) {
        if (!xhr.response || !xhr.response.videos) { return; }
        callback(xhr.response.videos.map(function(video) {
          return {
            user: {
              url: 'https://www.twitch.tv/' + video.channel.name,
              name: video.channel.display_name,
            },
            url: video.url.replace(/^https:\/\/secure\./, 'https://www.'),
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

sources.collections.haloruns = function(callback) {
  util.ajax('http://haloruns.com/records?recent', function(xhr) {
    var $items = xhr.response.getElementById('recentWRTable');
    if (!$items) {
      console.warn('Error retrieving videos');
      return;
    }
    $items = $items.children[0];
    var items = [];
    for (var i = 1, len = $items.children.length; i < len; i++) {
      var $item = $items.children[i];
      var $col1 = $item.children[0];
      var $col2 = $item.children[1];
      var $col3 = $item.children[2];
      var $col4 = $item.children[3];
      var $col5 = $item.children[4];
      var date = new Date($col1.childNodes[0].nodeValue + ' ' +
        $col1.childNodes[2].nodeValue.replace('Eastern', 'EST'));
      var $level = $col2.children[0];
      var gameSplit = $col2.children[1].textContent.split(' ');
      var game = gameSplit.slice(0, -1).join(' ');

      // "Halo 5" is actually called "Halo 5: Guardians"
      if (game === 'Halo 5') {
        game += ': Guardians';
      }
      var difficulty = gameSplit[gameSplit.length - 1];
      var $previousRecord = $col3.children[0];
      $previousRecord.textContent =
        $previousRecord.textContent.replace(/ /g, '');
      var $previousUser = $col3.children[1].children[0];
      var $newRecord = $col4.children[0];
      var $newUser = $col4.children[1].children[0];
      var timeSaved = $col5.textContent;

      var url = $newRecord.href;
      items.push({
        user: {
          url: $newUser.href,
          thumbnail: null,
          name: $newUser.textContent,
        },
        url: url,
        thumbnail: null,
        length: util.timeToSeconds($newRecord.textContent),
        title: game + ' ' + difficulty + ' - ' + $level.textContent +
          ' (' + $newRecord.textContent.replace(/ /g, '') + ')',
        timestamp: date.getTime(),
        desc: 'Previous Record: ' + $previousRecord.outerHTML +
          ' by ' + $previousUser.outerHTML + '<br />' +
          'Time Saved: ' + timeSaved,
        game: game,
      });
    }
    util.parallelMap(items, getMetaForVideo, callback.bind(null, items));
  });
};
