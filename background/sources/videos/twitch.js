import * as util from '../../util.js';


let twitchToken = null;
const getTwitchToken = (callback) => {
  if (twitchToken) {
    callback(twitchToken);
  } else {
    chrome.cookies.get({
      url: 'https://www.twitch.tv/directory/following/videos',
      name: 'api_token',
    }, (cookie) => {
      twitchToken = cookie && cookie.value;
      callback(twitchToken);
    });
  }
};

export default {
  patterns: [
    '*://*.twitch.tv/*/v/*',
    '*://twitch.tv/*/v/*',
  ],
  getVideo: (url, callback) => {
    getTwitchToken((token) => {
      const parsed = new URL(url);
      const s = parsed.pathname.split(/\//);
      const id = s[s.length - 1];
      util.ajax('https://api.twitch.tv/kraken/videos/v' + id, {
        cache: {
          transform: (response) => {
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
      }, (meta) => {
        if (!meta) { return callback(null); }
        const username = /twitch\.tv\/([^/]+)\//.exec(url)[1];
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
  getAllVideos: (callback) => {
    getTwitchToken((token) => {
      util.ajax('https://api.twitch.tv/kraken/videos/followed?' +
      'limit=40&broadcast_type=highlight&offset=0&on_site=1', {
        headers: { 'Twitch-Api-Token': token },
      }, (result) => {
        if (!result || !result.videos) { return callback(); }
        callback(result.videos.map((video) => {
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
