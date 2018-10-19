import * as util from '../../util.js';


export default (callback) => {
  util.ajax('https://haloruns.com/records?recent', (xhr, body) => {
    if (!body) { return callback(); }
    let $items = body.getElementById('recentWRTable');
    if (!$items) {
      console.warn('Error retrieving videos');
      callback();
      return;
    }
    $items = $items.children[0];
    const items = [];
    for (let i = 1, len = Math.min($items.children.length, 21); i < len; i++) {
      let $item = $items.children[i];
      let $col1 = $item.children[0];
      let $col2 = $item.children[1];
      let $col3 = $item.children[2];
      let $col4 = $item.children[3];
      let $col5 = $item.children[4];
      let date = new Date($col1.childNodes[0].nodeValue);
      let $level = $col2.children[0];
      let gameSplit = $col2.children[1].textContent.split(' ');
      let game = gameSplit.slice(0, -1).join(' ');

      // "Halo 5" is actually called "Halo 5: Guardians"
      if (game === 'Halo 5') {
        game += ': Guardians';
      }
      let difficulty = gameSplit[gameSplit.length - 1];
      let $previousRecord = $col3.children[0];
      $previousRecord.textContent =
        $previousRecord.textContent.replace(/ /g, '');
      let $previousUser = $col3.children[1].children[0];
      let $newRecord = $col4.children[0];
      let $newUser = $col4.children[1].children[0];
      let timeSaved = $col5.textContent.replace(' : ', ':');

      let url = $newRecord.href;
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
    callback(items);
  });
};
