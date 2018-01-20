/* global chrome, util, shorteners */
/* exported sources */

// Keep a local cache of videos, since some collections link to host sites,
// but will often not contain enough metainfo of the videos, such
// as the thumbnail, views, even the user.
//
// Note that this is different from ajax cache.
var cachedVideos = new util.SizedMap(200, 'cachedVideos');

// Keep an in memory cache in case there are errors retrieving videos
// in the future. If that happens, it will use the last successful result
// from that source.
var cachedResults = { videos: {}, collections: {} };

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
              videos = videos || cachedResults[type][source] || [];
              cachedResults[type][source] = videos;
              callback({ source: source, videos: videos });
            });
          };
        });
    }

    // First, get videos directly from where they're hosted,
    // in case any of them are included in collection sites.
    util.parallel(filterEnabled('videos', true), function(results) {
      var videos = [].concat.apply([], results.map(function(result) {
        result.videos.forEach(function(video, i) {
          video.source = result.source;
          video.index = i;
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
          result.videos.forEach(function(video, i) {
            var col = video.col || {};
            delete video.col;
            col.source = result.source;
            video.collections = [col];
            video.index = i;
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
            // Keep a reference of the collection title for filtering,
            // since the video will have its own title.
            colVideo.collections[0].title = colVideo.title;
            if (video.collections) {
              // It's possible that the same video could be posted in
              // many collectioin sites.
              video.collections.push(colVideo.collections[0]);
            } else {
              video.collections = colVideo.collections.slice();
            }
            video.desc = video.desc || colVideo.desc;
            video.game = video.game || colVideo.game;
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
    if (shorteners.isShortened(url)) {
      shorteners.getRealURL(url, function(realurl) {
        if (realurl) {
          sources.getMetaForVideo(realurl, callback);
        } else {
          callback();
        }
      });

    } else if (cachedVideos.has(url)) {
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
      if (!meta) { return callback(null); }
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
      callback(true);
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
      cache: {
        transform: function(response) {
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
        ttl: 1800000,
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
    util.ajax('https://www.youtube.com/feed/subscriptions?flow=2',
      { responseType: 'text' }, function(xhr, body) {
        if (!body) { return callback(); }
        var key = 'window["ytInitialData"] = ';
        var response = body;
        response = response.slice(response.indexOf(key) + key.length);
        response = response.slice(0, response.indexOf('}}};') + 3);
        try {
          response = JSON.parse(response);
        } catch (err) {
          console.error('Error parsing videos ' + err.message);
        }

        callback(response
          .contents
          .twoColumnBrowseResultsRenderer
          .tabs[0]
          .tabRenderer
          .content
          .sectionListRenderer
          .contents.map(function(item) {
            item = item
              .itemSectionRenderer
              .contents[0]
              .shelfRenderer
              .content
              .expandedShelfContentsRenderer
              .items[0]
              .videoRenderer;

            var user = item.ownerText.runs[0];
            var url = 'https://www.youtube.com/watch?v=' + item.videoId;

            // YouTube videos sometimes don't have thumbnails loaded until
            // the page is scrolle down.
            var thumbnail = 'https://i.ytimg.com/vi/' + item.videoId +
              '/mqdefault.jpg?custom=true&w=196&h=110&stc=true&jpg444=true&' +
              'jpgq=90&sp=68';

            var length = item.lengthText;
            var timestamp = item.publishedTimeText ?
              util.relativeToTimestamp(item.publishedTimeText.simpleText) :
              item.upcomingEventData ?
                parseInt(item.upcomingEventData.startTime, 10) * 1000 : null;
            var views = item.viewCountText;
            views = views && views.simpleText ?  views.simpleText :
              views && views.runs ? views.runs[0].text : null;

            return {
              user: {
                url: 'https://www.youtube.com' +
                  user.navigationEndpoint.webNavigationEndpointData.url,
                thumbnail: item.channelThumbnail.thumbnails[0].url,
                name: user.text,
                verified: item.ownerBadges && item.ownerBadges.some((badge) => {
                  badge.tooltip == 'Verified';
                }),
              },
              url,
              thumbnail,
              title: item.title.simpleText,
              desc:
                item.descriptionSnippet && item.descriptionSnippet.simpleText,
              length: length ? util.timeToSeconds(length.simpleText) : null,
              views: views ?  parseInt(views.replace(/,/g, ''), 10) : null,
              timestamp,
              live: item.badges && timestamp < Date.now() &&
                item.badges.some((badge) => {
                  var label = badge.metadataBadgeRenderer.label;
                  if (label) {
                    return label == 'LIVE NOW';
                  } else {
                    return false;
                  }
                }),
              watched: item.isWatched,
            };
          }));
      });
  },
};

var twitchToken = null;
function getTwitchToken(callback) {
  if (twitchToken) {
    callback(twitchToken);
  } else {
    chrome.cookies.get({
      url: 'https://www.twitch.tv/directory/following/videos',
      name: 'api_token',
    }, function(cookie) {
      twitchToken = cookie && cookie.value;
      callback(twitchToken);
    });
  }
}
sources.videos.twitch = {
  patterns: [
    '*://*.twitch.tv/*/v/*',
    '*://twitch.tv/*/v/*',
  ],
  getVideo: function(url, callback) {
    getTwitchToken(function(token) {
      var parsed = new URL(url);
      var s = parsed.pathname.split(/\//);
      var id = s[s.length - 1];
      util.ajax('https://api.twitch.tv/kraken/videos/v' + id, {
        cache: {
          transform: function(response) {
            return {
              thumbnail : response.preview,
              length    : response.length,
              title     : response.title,
              game      : response.game,
              views     : response.views,
            };
          },
          ttl: 1800000,
        },
        headers: { 'Twitch-Api-Token': token },
      }, function(xhr, meta) {
        if (!meta) { return callback(null); }
        var username = /twitch\.tv\/([^/]+)\//.exec(url)[1];
        callback({
          url       : 'https://www.twitch.tv/' + username + '/v/' + id,
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
    });
  },
  getAllVideos: function(callback) {
    getTwitchToken(function(token) {
      util.ajax('https://api.twitch.tv/kraken/videos/followed?' +
      'limit=40&broadcast_type=highlight&offset=0&on_site=1', {
        headers: { 'Twitch-Api-Token': token },
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
      var timeSaved = $col5.textContent.replace(' : ', ':');

      var url = $newRecord.href;
      items.push({
        col: {
          url: $level.href,
          users: [{
            url: $newUser.href,
            name: $newUser.textContent,
          }],
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
    util.parallelFilter(items, sources.addMetaToVideo, callback);
  });
};

var speedrundotcomKey = localStorage.getItem('speedrundotcomKey');
sources.collections.speedrundotcom = function(callback) {
  function getMetaForRun(url, callback) {
    util.ajax(url, {
      cache: {
        transform: function(response) {
          if (!response.data.videos || !response.data.videos.links.length) {
            return null;
          }
          return {
            url: response.data.videos.links[0].uri,
            desc: response.data.comment,
            gameID: response.data.game,
            users: response.data.players,
          };
        },
      },
    }, function(xhr, meta) {
      callback(meta);
    });
  }

  function addUsersToRun(run, meta, callback) {
    if (!meta.users) { return callback(); }
    util.parallelMap(meta.users, function(user, callback) {
      if (user.rel === 'guest') {
        callback({ name: user.name });
      } else {
        util.ajax('http://www.speedrun.com/api/v1/users/' + user.id, {
          cache: {
            transform: function(response) {
              return {
                url: response.data.weblink,
                name: response.data.names.international,
              };
            }
          }
        }, function(xhr, response) { callback(response); });
      }
    }, function(users) {
      run.col.users = users;
      callback(!!users.filter(function(u) { return !!u; }).length);
    });
  }

  function addMetaToVideo(run, meta, callback) {
    sources.addMetaToVideo(run, function(success) {
      if (!success) { return callback(); }
      if (!run.game && meta.gameID) {
        util.ajax('http://www.speedrun.com/api/v1/games/' + meta.gameID, {
          cache: {
            transform: function(response) {
              return { name: response.data.names.international };
            },
          },
        }, function(xhr, game) {
          run.game = game.name;
          callback(true);
        });
      } else {
        callback(true);
      }
    });
  }

  function addMetaToRun(run, callback) {
    getMetaForRun(run.url, function(meta) {
      if (!meta) { return callback(); }
      run.url = meta.url;
      run.desc = meta.desc;
      util.parallel([
        addUsersToRun.bind(null, run, meta),
        addMetaToVideo.bind(null, run, meta)
      ], function(results) {
        callback(results[0] && results[1]);
      });
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
            col: {
              url: noti.item.uri,
            },
            url: noti.links[0].uri,
            title: noti.text,
            timestamp: new Date(noti.created).getTime(),
          };
        });
      util.parallelFilter(runs, addMetaToRun, callback);
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
