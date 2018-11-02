import * as util from '../../util.js';


const RECORDS_PAGE = 'https://haloruns.com/records?recent';
const resolveLink = ($link) => {
  return new URL($link.getAttribute('href'), RECORDS_PAGE).href;
};

const $a = document.createElement('a');
const embedLink = ($link) => {
  $a.href = resolveLink($link);
  $a.target = '_blank';
  $a.textContent = $link.textContent;
  return $a.outerHTML;
};

export default async () => {
  const body = await util.ajax(RECORDS_PAGE);
  let $items = body.getElementById('recentWRTable');
  if (!$items) {
    throw Error('Error retrieving videos');
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

    // Use Halo game names that Twitch will find.
    game = game.replace(/ MCC$/, '');
    if (game === 'Halo CE') {
      game = 'Halo: Combat Evolved';
    } else if (game === 'Halo 5') {
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

    items.push({
      col: {
        url: resolveLink($level),
        users: [{
          url: resolveLink($newUser),
          name: $newUser.textContent,
        }],
      },
      url: resolveLink($newRecord),
      thumbnail: null,
      length: util.timeToSeconds($newRecord.textContent),
      title: game + ' ' + difficulty + ' - ' + $level.textContent +
        ' (' + $newRecord.textContent.replace(/ /g, '') + ')',
      timestamp: date.getTime(),
      desc: 'Previous Record: ' + embedLink($previousRecord) +
        ' by ' + embedLink($previousUser) + '<br />' +
        'Time Saved: ' + timeSaved,
      game: { name: game },
    });
  }
  return items;
};
