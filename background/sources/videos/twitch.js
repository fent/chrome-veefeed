import * as util from '../../util.js';


let twitchToken = null;
const getTwitchToken = () => {
  return new Promise((resolve) => {
    if (twitchToken) {
      resolve(twitchToken);
    } else {
      chrome.cookies.get({
        url: 'https://www.twitch.tv',
        name: 'auth-token',
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
    '*://*.twitch.tv/videos/*',
    '*://twitch.tv/videos/*',
  ],
  getVideo: async (url) => {
    const token = await getTwitchToken();
    const parsed = new URL(url);
    const s = parsed.pathname.split(/\//);
    const id = s[s.length - 1];
    return util.ajax('https://api.twitch.tv/kraken/videos/' + id, {
      cache: {
        transform: (response) => ({
          url       : response.url,
          thumbnail : response.preview,
          length    : response.length,
          title     : response.title,
          game      : response.game,
          views     : response.views,
          user      : {
            url: 'https://www.twitch.tv/' + response.channel.name,
            name: response.channel.display_name,
          },
        }),
        ttl: 1800000,
      },
      headers: { 'Authorization': `OAuth ${token}` },
    });
  },
  getAllVideos: async () => {
    const token = await getTwitchToken();
    const result = await util.ajax('https://api.twitch.tv/kraken/videos/followed?' +
    'limit=50&broadcast_type=highlight&offset=0&on_site=1', {
      headers: { 'Authorization': `OAuth ${token}` },
    });
    return result.videos.map((video) => {
      return {
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
    });
  },
};
