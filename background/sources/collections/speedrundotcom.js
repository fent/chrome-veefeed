import * as util from '../../util.js';


let speedrundotcomKey = localStorage.getItem('speedrundotcomKey');
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
      },
    });
  };

  const addUsersToRun = async (run, meta) => {
    if (!meta.users) { return false; }
    const users = await Promise.all(meta.users.map(async (user) => {
      if (user.rel === 'guest') {
        return { name: user.name };
      } else {
        return util.ajax('http://www.speedrun.com/api/v1/users/' + user.id, {
          cache: {
            transform: (response) => ({
              url: response.data.weblink,
              name: response.data.names.international,
            })
          }
        });
      }
    }));
    run.col.users = users;
    return !!users.filter(u => !!u).length;
  };

  const addMetaToVideo = async (run, meta) => {
    if (!run.game && meta.gameID) {
      const game = await util.ajax(
        'http://www.speedrun.com/api/v1/games/' + meta.gameID, {
          cache: {
            transform: (response) => ({
              name: response.data.names.international
            }),
          },
        });
      run.game = game.name;
      return true;
    } else {
      return true;
    }
  };

  const addMetaToRun = async (run) => {
    const meta = await getMetaForRun(run.url);
    run.url = meta.url;
    run.desc = meta.desc;
    const results = await Promise.all([
      addUsersToRun.bind(null, run, meta),
      addMetaToVideo.bind(null, run, meta)
    ]);
    return results[0] && results[1];
  };

  if (!speedrundotcomKey) {
    const body = await util.ajax('http://www.speedrun.com/settings');
    const $code = body.getElementsByTagName('code')[0];
    if (!$code) {
      throw Error('Unable to retrieve API token from speedrun.com');
    }
    speedrundotcomKey = $code.textContent;
    localStorage.setItem('speedrundotcomKey', speedrundotcomKey);
  }
  const results = await util.ajax('http://www.speedrun.com/api/v1/notifications', {
    headers: { 'X-API-Key': speedrundotcomKey },
  });
  const runs = results.data
    .filter(noti => noti.item.rel === 'run')
    .map((noti) => {
      return {
        col: {
          url: noti.item.uri,
        },
        url: noti.links[0].uri,
        title: noti.text,
        timestamp: new Date(noti.created).getTime(),
      };
    });
  return util.parallelFilter(runs, addMetaToRun);
};
