import * as util from '../../util.js';


let twitchToken = null;
const getTwitchToken = () => {
  return new Promise((resolve) => {
    if (twitchToken) {
      return twitchToken;
    } else {
      chrome.cookies.get({
        url: 'https://www.twitch.tv/directory/following/videos',
        name: 'api_token',
      }, (cookie) => {
        twitchToken = cookie && cookie.value;
        resolve(twitchToken);
      });
    }
  });
};

export default {
  patterns: [
    '*://*.twitch.tv/*/v/*',
    '*://twitch.tv/*/v/*',
  ],
  getVideo: async (url) => {
    const token = await getTwitchToken();
    const parsed = new URL(url);
    const s = parsed.pathname.split(/\//);
    const id = s[s.length - 1];
    const meta = await util.ajax('https://api.twitch.tv/kraken/videos/v' + id, {
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
    });
    const username = /twitch\.tv\/([^/]+)\//.exec(url)[1];
    return {
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
    };
  },
  getAllVideos: async () => {
    const token = await getTwitchToken();
    const result = await util.ajax('https://api.twitch.tv/kraken/videos/followed?' +
    'limit=40&broadcast_type=highlight&offset=0&on_site=1', {
      headers: { 'Twitch-Api-Token': token },
    });
    return result.videos.map((video) => {
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
    });
  },
};
