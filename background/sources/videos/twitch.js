import * as util from '../../util.js';


let cachedToken = null;
const getTwitchToken = () => {
  return new Promise((resolve) => {
    if (cachedToken) {
      resolve(cachedToken);
    } else {
      chrome.cookies.get({
        url: 'https://www.twitch.tv',
        name: 'auth-token',
      }, (cookie) => {
        cachedToken = cookie && cookie.value;
        resolve(cachedToken);
      });
    }
  });
};

const userLimit = 50;
let recentUsers = [];
const getUserImages = async (videos) => {
  const token = await getTwitchToken();
  const usernames = videos.map(video => video.channel.name);

  // Use `.reverse()` since `util.uniq()` favors earlier entries,
  // and we later truncate the list of usernames to the last `userLimit`.
  recentUsers = util.uniq(recentUsers.concat(usernames).reverse())
    .reverse().slice(-userLimit);

  // Use a timeout to gather up recent users requested,
  // to minimize API requests.
  await util.sleep(250);
  const userImages = await util.ajax('https://api.twitch.tv/helix/users', {
    data: { login: recentUsers },
    headers: { 'Authorization': `Bearer ${token}` },
    cache: {
      transform: (response) => response.data.map(user => ({
        login: user.login,
        profile_image_url: user.profile_image_url,
      })),
      ttl: 1000 * 60 * 60 * 24 // 1day
    }
  });
  const usersMap = new Map();
  for (let user of userImages) {
    usersMap.set(user.login, user.profile_image_url);
  }
  return usersMap;
};

const limit = 50;
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
        transform: async (response) => {
          const userImages = await getUserImages([response]);
          return {
            url       : response.url,
            thumbnail : response.preview,
            length    : response.length,
            title     : response.title,
            game      : response.game,
            views     : response.views,
            user      : {
              url: 'https://www.twitch.tv/' + response.channel.name,
              name: response.channel.display_name,
              thumbnail: userImages.get(response.channel.name),
            },
          };
        },
        ttl: 1000 * 60 * 30 // 30min
      },
      headers: { 'Authorization': `OAuth ${token}` },
    });
  },
  getAllVideos: async () => {
    const token = await getTwitchToken();
    const result = await util.ajax('https://api.twitch.tv/kraken/videos/followed', {
      data: { limit, broadcast_type: 'highlight', offset: 0 },
      headers: { 'Authorization': `OAuth ${token}` },
    });
    const userImages = await getUserImages(result.videos);
    return result.videos.map((video) => {
      return {
        user: {
          url: 'https://www.twitch.tv/' + video.channel.name,
          name: video.channel.display_name,
          thumbnail: userImages.get(video.channel.name),
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
