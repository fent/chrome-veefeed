const pad = (num) => num < 10 ? '0' + num : num;

/**
 * Returns a formatted length format, 00:00:00 from number of seconds.
 *
 * @param {number} secs
 * @return {string}
 */
window.formatVideoLength = (secs) => {
  let mins = Math.floor(secs / 60);
  let hours = mins ? Math.floor(mins / 60) : 0;
  secs = secs % 60;
  mins = mins % 60;
  if (hours) { mins = pad(mins); }
  return (hours ? hours + ':' : '') + mins + ':' + pad(secs);
};

const now = Date.now();
const timeFormats = [
  [60, 'seconds', 1],
  [120, '1 minute ago'],
  [3600, 'minutes', 60],
  [7200, '1 hour ago'],
  [86400, 'hours', 3600],
  [172800, '1 day ago'],
  [604800, 'days', 86400],
  [1209600, 'Last week'],
  [2419200, 'weeks', 604800],
  [4838400, 'Last month'],
  [29030400, 'months', 2419200],
  [58060800, 'Last year'],
  [2903040000, 'years', 29030400]
];

/**
 * Returns a human friendly "time ago" string from a timestamp.
 * 
 * @param {number} timestamp
 * @return {string}
 */
window.timeAgo = (timestamp) => {
  const seconds = (now - timestamp) / 1000;
  for (let f of timeFormats) {
    if (seconds < f[0]) {
      return f[2] ? Math.floor(seconds / f[2]) + ' ' + f[1] + ' ago' : f[1];
    }
  }
  return null;
};

/**
 * Returns a human friendly formatted absolute time from a timestamp.
 *
 * @param {number} timestamp
 * @param {string}
 */
const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
window.formatTime = (timestamp) => {
  let date = new Date(timestamp);
  let hour = date.getHours() % 12;
  let ampm = hour > 11 ? 'pm' : 'am';
  hour = hour % 12;
  if (hour === 0) { hour = 12; }
  return months[date.getMonth()] + ' ' + date.getDate() + ', ' +
    hour + ':' + pad(date.getMinutes()) + ampm;
};
