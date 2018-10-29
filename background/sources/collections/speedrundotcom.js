import * as util from '../../util.js';


let cachedKey = localStorage.getItem('speedrundotcomKey');
const getSpeedrundotcomKey = async () => {
  if (cachedKey) {
    return cachedKey;
  } else {
    const settings = await util.ajax('https://www.speedrun.com/settings');
    const $username = settings.querySelector(
      '.container.navbar-bottom .dropdown.user .username');
    if (!$username) {
      throw Error('Unable to get API token from speedrun.com, not logged in?');
    }
    const username = $username.textContent;
    const apiPage = await util.ajax(
      `https://www.speedrun.com/${username}/settings/api`);
    const $code = apiPage.querySelector('code');
    if (!$code) {
      throw Error('Unable to get API token from speedrun.com');
    }
    cachedKey = $code.textContent;
    localStorage.setItem('speedrundotcomKey', cachedKey);
    return cachedKey;
  }
};

export default async () => {
  const getMetaForRun = (url) => {
    return util.ajax(url, {
      cache: {
        transform: (response) => {
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
        ttl: 1000 * 60 * 30 // 30 min
      },
    });
  };

  const addUsersToRun = async (run, meta) => {
    if (!meta.users) { return false; }
    const users = await Promise.all(meta.users.map(async (user) => {
      if (user.rel === 'guest') {
        return { name: user.name };
      } else {
        return util.ajax('https://www.speedrun.com/api/v1/users/' + user.id, {
          cache: {
            transform: async (response) => {
              const url = response.data.weblink;
              const user = url.slice(url.lastIndexOf('/') + 1);
              let image =
                `https://www.speedrun.com/themes/user/${user}/image.png`;
              const imageRes = await fetch(image, {
                method: 'HEAD'
              });
              if (!imageRes.ok) { image = null; }
              return {
                url,
                name: response.data.names.international,
                image,
              };
            },
            ttl: 1000 * 60 * 60 * 24 // 1day
          },
        });
      }
    }));
    run.col.users = users;
    return !!users.filter(u => !!u).length;
  };

  const addGameToVideo = async (run, meta) => {
    if (!run.game && meta.gameID) {
      run.game = await util.ajax(
        'https://www.speedrun.com/api/v1/games/' + meta.gameID, {
          cache: {
            transform: (response) => ({
              name: response.data.names.international,
              url: response.data.weblink,
              image: response.data.assets['cover-small'].uri,
            }),
            ttl: 1000 * 60 * 60 * 24 // 1day
          },
        });
      return true;
    } else {
      return true;
    }
  };

  const addMetaToRun = async (run) => {
    const meta = await getMetaForRun(run.url);
    if (!meta) { return false; }
    run.url = meta.url;
    run.desc = meta.desc;
    const results = await Promise.all([
      addUsersToRun(run, meta),
      addGameToVideo(run, meta)
    ]);
    return results[0] && results[1];
  };

  const key = await getSpeedrundotcomKey();
  const results = await util.ajax('https://www.speedrun.com/api/v1/notifications', {
    headers: { 'X-API-Key': key },
  });
  const runs = results.data
    .filter(noti => noti.item.rel === 'run')
    .map((noti) => {
      return {
        col: {
          url: noti.item.uri,
        },
        url: noti.links[0].uri,
        title: null,
        timestamp: new Date(noti.created).getTime(),
      };
    });
  return util.parallelFilter(runs, addMetaToRun);
};
