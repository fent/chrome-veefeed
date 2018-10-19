import * as util from '../../util.js';


let speedrundotcomKey = localStorage.getItem('speedrundotcomKey');
export default (callback) => {
  const getMetaForRun = (url, callback) => {
    util.ajax(url, {
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
    }, (xhr, meta) => { callback(meta); });
  };

  const addUsersToRun = (run, meta, callback) => {
    if (!meta.users) { return callback(); }
    util.parallelMap(meta.users, (user, callback) => {
      if (user.rel === 'guest') {
        callback({ name: user.name });
      } else {
        util.ajax('http://www.speedrun.com/api/v1/users/' + user.id, {
          cache: {
            transform: (response) => {
              return {
                url: response.data.weblink,
                name: response.data.names.international,
              };
            }
          }
        }, (xhr, response) => { callback(response); });
      }
    }, (users) => {
      run.col.users = users;
      callback(!!users.filter(u => !!u).length);
    });
  };

  const addMetaToVideo = (run, meta, callback) => {
    if (!run.game && meta.gameID) {
      util.ajax('http://www.speedrun.com/api/v1/games/' + meta.gameID, {
        cache: {
          transform: (response) => {
            return { name: response.data.names.international };
          },
        },
      }, (xhr, game) => {
        run.game = game.name;
        callback(true);
      });
    } else {
      callback(true);
    }
  };

  const addMetaToRun = (run, callback) => {
    getMetaForRun(run.url, (meta) => {
      if (!meta) { return callback(); }
      run.url = meta.url;
      run.desc = meta.desc;
      util.parallel([
        addUsersToRun.bind(null, run, meta),
        addMetaToVideo.bind(null, run, meta)
      ], (results) => { callback(results[0] && results[1]); });
    });
  };

  const getNotifications = () => {
    util.ajax('http://www.speedrun.com/api/v1/notifications', {
      headers: { 'X-API-Key': speedrundotcomKey },
    }, (xhr, results) => {
      if (!results) { return callback(); }
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
      util.parallelFilter(runs, addMetaToRun, callback);
    });
  };

  if (!speedrundotcomKey) {
    util.ajax('http://www.speedrun.com/settings', (xhr, body) => {
      if (!body) { return callback(); }
      const $code = body.getElementsByTagName('code')[0];
      if (!$code) {
        console.warn('Unable to retrieve API token from speedrun.com');
        return callback();
      }
      const key = $code.textContent;
      speedrundotcomKey = key;
      localStorage.setItem('speedrundotcomKey', key);
      getNotifications();
    });
  } else {
    getNotifications();
  }
};
