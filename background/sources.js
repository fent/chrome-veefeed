/* global chrome, util */

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
        source: 'youtube',
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

sources.twitch = function(callback) {
  chrome.cookies.get({
    url: 'https://www.twitch.tv/directory/following/videos',
    name: 'api_token',
  }, function(cookie) {
    var xhr = util.ajax('https://api.twitch.tv/kraken/videos/followed?' +
      'limit=40&broadcast_type=highlight&offset=0&on_site=1', function(xhr) {
        if (!xhr.response || !xhr.response.videos) { return; }
        callback(xhr.response.videos.map(function(video) {
          return {
            source: 'twitch',
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
