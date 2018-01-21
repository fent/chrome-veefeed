/* exported toHumanLength, now, timeAgo, showTime, m */

function pad(num) { return num < 10 ? '0' + num : num; }

window.toHumanLength = (secs) => {
  var mins = Math.floor(secs / 60);
  var hours = mins ? Math.floor(mins / 60) : 0;
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

window.timeAgo = (timestamp) => {
  var seconds = (now - timestamp) / 1000;
  for (let f of timeFormats) {
    if (seconds < f[0]) {
      return f[2] ? Math.floor(seconds / f[2]) + ' ' + f[1] + ' ago' : f[1];
    }
  }
  return null;
};

const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
window.showTime = (timestamp) => {
  var date = new Date(timestamp);
  var hour = date.getHours() % 12;
  var ampm = hour > 11 ? 'pm' : 'am';
  hour = hour % 12;
  if (hour === 0) { hour = 12; }
  return months[date.getMonth()] + ' ' + date.getDate() + ', ' +
    hour + ':' + pad(date.getMinutes()) + ampm;
};

// Inspired by mithril :)
const svgElements = { svg: true, path: true };
const jsattrs = { innerHTML: true, href: true, disabled: true };
const m = window.m = (element, attr, content) => {
  var s = element.split('.');
  var elementName = s[0];
  var $el = svgElements[elementName] ?
    document.createElementNS('http://www.w3.org/2000/svg', elementName) :
    document.createElement(elementName);
  if (s[1]) { $el.className = s.slice(1).join(' '); }
  if (typeof attr === 'object' && !Array.isArray(attr) &&
     !(attr instanceof HTMLElement)) {
    for (let key in attr) {
      if (key === 'className') {
        if (attr[key]) { $el.classList.add(attr[key]); }
      } else if (/^data-/.test(key) || !/^on/.test(key) && !jsattrs[key]) {
        $el.setAttribute(key, attr[key]);
      } else {
        $el[key] = attr[key];
      }
    }
  } else {
    content = attr;
  }
  if (Array.isArray(content)) {
    content.forEach((node) => { if (node) { $el.appendChild(node); } });
  } else if (content != null) {
    if (content.nodeType != null) {
      $el.appendChild(content);
    } else {
      $el.textContent = content;
    }
  }
  return $el;
};

m.trust = (html) => {
  var node = document.createElement('span');
  node.innerHTML = html;
  return node;
};
