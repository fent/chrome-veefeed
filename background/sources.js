/* global chrome, util */
/* exported sources */

// Keep a local cache of videos, since some collections link to host sites,
// but will often not contain enough metainfo of the videos, such
// as the thumbnail, views, even the user.
//
// Note that this is different from ajax cache.
var cachedVideos = new util.SizedMap(200, 'cachedVideos');
var sources = {
  // Sources which directly host videos.
  videos: {},

  // Sources that link to other websites' videos.
  collections: {},

  getVideos: function(options, callback) {
    function filterEnabled(type, isHost) {
      return Object.keys(sources[type])
        .filter(function(source) { return options[source]; })
        .map(function(source) {
          return function(callback) {
            var fn = sources[type][source];
            if (isHost) {
              fn = fn.getAllVideos;
            }
            fn(function(videos) {
              callback({ source: source, videos: videos || [] });
            });
          };
        });
    }

    // First, get videos directly from where they're hosted,
    // in case any of them are included in collection sites.
    util.parallel(filterEnabled('videos', true), function(results) {
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
      util.parallel(filterEnabled('collections', false), function(results) {
        var colVideos = [].concat.apply([], results.map(function(result) {
          result.videos.forEach(function(video) {
            var col = { source: result.source };
            if (video.colUrl) {
              col.url = video.colUrl;
              delete video.colUrl;
            }
            video.collections = [col];
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

                // Keeping a copy of the collection username and title
                // for filtering.
              } else if (key === 'user') {
                colVideo.collections[0].username = colVideo.user.name;

              } else if (key === 'title') {
                colVideo.collections[0].title = colVideo.title;

              }
            }
          } else {
            colVideo.source = sources.sourceFromURL(colVideo.url);
            videosMap[colVideo.url] = colVideo;
          }
        });

        var allVideos = [];
        for (var url in videosMap) { allVideos.push(videosMap[url]); }
        callback(allVideos);
      });
    });
  },

  getMetaForVideo: function(url, callback) {
    if (cachedVideos.has(url)) {
      callback(cachedVideos.get(url));
    } else {
      var source = sources.sourceFromURL(url);
      if (source) {
        sources.videos[source].getVideo(url, callback);
      } else {
        console.warn('Could not find source for URL: ' + url);
        callback();
      }
    }
  },

  addMetaToVideo: function(video, callback) {
    sources.getMetaForVideo(video.url, function(meta) {
      if (!meta) { return callback(); }
      video.url = meta.url;
      video.thumbnail = meta.thumbnail;
      video.length = meta.length;

      // Views and title can update later, so don't include these when getting
      // metainfo from cache.
      ['game', 'title', 'views', 'user'].forEach(function(field) {
        if (meta[field] && !video[field]) {
          video[field] = meta[field];
        }
      });
      callback();
    });
  },

  sourceFromURL: function(url) {
    for (var source in sources.videos) {
      if (sources.videos[source]._patterns.some(function(pattern) {
        return pattern.test(url);
      })) {
        return source;
      }
    }
    return null;
  },

  isVideoPage: function(url) {
    return !!sources.sourceFromURL(url);
  },
};

sources.videos.youtube = {
  patterns: [
    '*://www.youtube.com/watch?v=*',
    '*://m.youtube.com/watch?v=*',
    '*://youtu.be/*',
  ],
  getVideo: function(url, callback) {
    var r = /(?:v=|youtu\.be\/)([^?&$]+)/.exec(url);
    var id;
    if (r) {
      id = r[1];
    } else {
      console.warn('Could not get video ID of URL: ' + url);
      return callback();
    }
    util.ajax('https://www.youtube.com/get_video_info' +
    '?ps=default&gl=US&hl=en&video_id=' + id, {
      cache: function(response) {
        if (response.status === 'fail') {
          return callback();
        }
        return {
          length: parseInt(response.length_seconds, 10),
          title: response.title,
          views: parseInt(response.view_count, 10),
          user: { name: response.author },
        };
      },
    }, function(xhr, meta) {
      if (!meta) { return callback(); }
      callback({
        // Canonical form of URL.
        url: 'https://www.youtube.com/watch?v=' + id,

        // Using medium quality gives a screenshot without black bars.
        thumbnail: 'https://i.ytimg.com/vi/' + id +
          '/mqdefault.jpg?custom=true&w=196&h=110&stc=true&jpg444=true&' +
          'jpgq=90&sp=68',

        length: meta.length,
        title: meta.title,
        views: meta.views,
        user: meta.user,
        game: null,
      });
    });
  },
  getAllVideos: function(callback) {
    util.ajax('https://www.youtube.com/feed/subscriptions',
    function(xhr, body) {
      if (!body) { return callback(); }
      var $items = body.getElementById('browse-items-primary');
      if (!$items) {
        console.error('Not logged in');
        callback();
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
  },
};

sources.videos.twitch = {
  patterns: [
    '*://www.twitch.tv/*/v/*'
  ],
  getVideo: function(url, callback) {
    var parsed = new URL(url);
    var s = parsed.pathname.split(/\//);
    var id = s[s.length - 1];
    util.ajax('https://api.twitch.tv/kraken/videos/v' + id, {
      cache: function(response) {
        return {
          thumbnail : response.preview,
          length    : response.length,
          title     : response.title,
          game      : response.game,
          views     : response.views,
        };
      },
    }, function(xhr, meta) {
      if (!meta) { return callback(null); }
      var username = /twitch\.tv\/([^\/]+)\//.exec(url)[1];
      callback({
        url       : url,
        thumbnail : meta.thumbnail,
        length    : meta.length,
        title     : meta.title,
        game      : meta.game,
        views     : meta.views,
        user      : {
          url: 'https://www.twitch.tv/' + username,
          name: username,
        }
      });
    });
  },
  getAllVideos: function(callback) {
    chrome.cookies.get({
      url: 'https://www.twitch.tv/directory/following/videos',
      name: 'api_token',
    }, function(cookie) {
      util.ajax('https://api.twitch.tv/kraken/videos/followed?' +
      'limit=40&broadcast_type=highlight&offset=0&on_site=1', {
        headers: { 'Twitch-Api-Token': cookie.value },
      }, function(xhr, result) {
        if (!result || !result.videos) { return callback(); }
        callback(result.videos.map(function(video) {
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
    });
  },
};

sources.collections.haloruns = function(callback) {
  util.ajax('http://haloruns.com/records?recent', function(xhr, body) {
    if (!body) { return callback(); }
    var $items = body.getElementById('recentWRTable');
    if (!$items) {
      console.warn('Error retrieving videos');
      callback();
      return;
    }
    $items = $items.children[0];
    var items = [];
    for (var i = 1, len = Math.min($items.children.length, 21); i < len; i++) {
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
    util.parallelMap(items, sources.addMetaToVideo,
      callback.bind(null, items));
  });
};

var speedrundotcomKey = localStorage.getItem('speedrundotcomKey');
sources.collections.speedrundotcom = function(callback) {
  function getMetaForRun(url, callback) {
    util.ajax(url, {
      cache: function(response) {
        return {
          url: response.data.videos.links[0].uri,
          desc: response.data.comment,
        };
      },
    }, function(xhr, meta) {
      callback(meta);
    });
  }

  function addMetaToRun(run, callback) {
    getMetaForRun(run.url, function(meta) {
      run.url = meta.url;
      run.desc = meta.desc;
      sources.addMetaToVideo(run, callback);
    });
  }

  function getNotifications() {
    util.ajax('http://www.speedrun.com/api/v1/notifications', {
      headers: { 'X-API-Key': speedrundotcomKey },
    }, function(xhr, results) {
      if (!results) { return callback(); }
      var runs = results.data
        .filter(function(noti) { return noti.item.rel === 'run'; })
        .map(function(noti) {
          return {
            id: noti.id,
            title: noti.text,
            url: noti.links[0].uri,
            colUrl: noti.item.uri,
            timestamp: new Date(noti.created).getTime(),
          };
        });
      util.parallelMap(runs, addMetaToRun, callback.bind(null, runs));
    });
  }

  if (!speedrundotcomKey) {
    util.ajax('http://www.speedrun.com/settings', function(xhr, body) {
      if (!body) { return callback(); }
      var $code = body.getElementsByTagName('code')[0];
      if (!$code) {
        console.warn('Unable to retrieve API token from speedrun.com');
        return callback();
      }
      var key = $code.textContent;
      speedrundotcomKey = key;
      localStorage.setItem('speedrundotcomKey', key);
      getNotifications();
    });
  } else {
    getNotifications();
  }
};

sources.patterns = [];
for (var source in sources.videos) {
  sources.videos[source]._patterns =
    sources.videos[source].patterns.map(util.minimatch);
  sources.patterns = sources.patterns.concat(sources.videos[source].patterns);
}
