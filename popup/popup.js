/* global chrome, processScroll */

function pad(num) { return num < 10 ? '0' + num : num; }

function toHumanLength(secs) {
  var mins = Math.floor(secs / 60);
  var hours = mins ? Math.floor(mins / 60) : 0;
  secs = secs % 60;
  mins = mins % 60;
  if (hours) { mins = pad(mins); }
  return (hours ? hours + ':' : '') + mins + ':' + pad(secs);
}

var now = Date.now();
var timeFormats = [
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
function timeAgo(timestamp) {
  var seconds = (now - timestamp) / 1000;
  for (var i = 0, len = timeFormats.length; i < len; i++) {
    var f = timeFormats[i];
    if (seconds < f[0]) {
      return f[2] ? Math.floor(seconds / f[2]) + ' ' + f[1] + ' ago' : f[1];
    }
  }
  return null;
}

// Inspired by mithril :)
function m(element, attr, content) {
  var s = element.split('.');
  var $el = document.createElement(s[0]);
  if (s[1]) { $el.className = s.slice(1).join(' '); }
  if (typeof attr === 'object' && !Array.isArray(attr) &&
     !(attr instanceof HTMLElement)) {
    for (var key in attr) {
      if (/^data-/.test(key)) {
        $el.setAttribute(key, attr[key]);
      } else if (key === 'className') {
        if (attr[key]) { $el.classList.add(attr[key]); }
      } else {
        $el[key] = attr[key];
      }
    }
  } else {
    content = attr;
  }
  if (Array.isArray(content)) {
    content.forEach(function(node) { if (node) { $el.appendChild(node); } });
  } else if (content instanceof HTMLElement) {
    $el.appendChild(content);
  } else if (content != null) {
    $el.textContent = content;
  }
  return $el;
}

function removeChildClasses($node, className) {
  for (var i = 0, len = $node.children.length; i < len; i++) {
    $node.children[i].classList.remove(className);
  }
}

function goToLink(e) {
  chrome.tabs.create({ url: e.target.href || e.target.parentNode.href });
}

// See if there's another video opened in this window.
var tabs = {}, tabID, winID;
chrome.windows.getCurrent({}, function(win) {
  winID = win.id;
  var mytabs = JSON.parse(localStorage.getItem('tabs'));
  if (mytabs) {
    for (var id in mytabs) {
      if (mytabs[id] === winID) {
        tabID = id;
        break;
      }
    }
    tabs = mytabs;
  }
});

var options = JSON.parse(localStorage.getItem('options')) || {};
var videos = JSON.parse(localStorage.getItem('videos')) || [];
var groups = [{ name: 'All', videos: videos, selected: true, removable: true }];
var showTabs = false;

if (options.ignore && options.ignore.length && options.show_ignored_tab) {
  var ignoredVideos = JSON.parse(localStorage.getItem('ignored'));
  groups.push({ name: 'Ignored', videos: ignoredVideos });
  showTabs = true;
}

var $tabs = document.getElementById('tabs');
var $content = document.getElementById('content');

if (!showTabs) {
  $tabs.style.display = 'none';
}

groups.forEach(function(group) {
  var $badge, $videos;

  if (showTabs) {
    var $tab = m('a.tab', {
      className: group.selected && 'selected',
      onclick: function() {
        removeChildClasses($tabs, 'selected');
        removeChildClasses($content, 'selected');
        $tab.classList.add('selected');
        $videos.classList.add('selected');
      }
    }, m('span.label', group.name));
    $badge = m('span.badge', group.videos.length || '');
    $tab.appendChild($badge);
    $tabs.appendChild($tab);
  }

  if (!group.videos.length) {
    $content.appendChild($videos = m('div.no-videos', {
      className: group.selected && 'selected',
    }, 'No new videos'));
    return;
  }

  $videos = m('ul', {
    className: group.selected && 'selected',
  }, group.videos.map(function(video) {
    function openNewTab() {
      chrome.tabs.create({ url: video.url }, function(tab) {
        tabs[tab.id] = winID;
        localStorage.setItem('tabs', JSON.stringify(tabs));
      });
    }

    function open() {
      chrome.runtime.sendMessage({ watched: video.url });
      if (options.use_same_tab && tabID) {
        chrome.tabs.update(parseInt(tabID), {
          url: video.url,
          active: true
        }, function(tab) {
          if (!tab) {
            delete tabs[tabID];
            localStorage.setItem('tabs', JSON.stringify(tabs));
            openNewTab();
          } else {
            window.close();
          }
        });
      } else {
        openNewTab();
      }
    }

    if (video.thumbnail === 'https://s.ytimg.com/yts/img/pixel-vfl3z5WfW.gif') {
      var id = video.url.slice(video.url.indexOf('v=') + 2);
      video.thumbnail = 'https://i.ytimg.com/vi_webp/' + id + '/mqdefault.webp';
    }

    return m('li.video.source-' + video.source, [
      m('a.left-side', { href: video.url, disabled: true }, [
        m('img.lazy', { 'data-src': video.thumbnail, onclick: open }),
        m('span.length', typeof video.length === 'number' ?
             toHumanLength(video.length) : video.length),
        video.source === 'twitch' && video.game ?
          m('a.game', {
            href: 'https://www.twitch.tv/directory/game/' +
              encodeURIComponent(video.game) + '/videos/week',
           'data-title': video.game,
           onclick: goToLink,
          }, m('img.lazy', {
            'data-src': 'http://static-cdn.jtvnw.net/ttv-boxart/' +
              encodeURIComponent(video.game) + '-138x190.jpg',
          })) : null
      ]),
      m('div.right-side', [
        group.removable && m('a.close', {
          href: '#',
          onclick: function(e) {
            chrome.runtime.sendMessage({ watched: video.url });
            if ($badge) {
              group.videos.pop();
              $badge.textContent = group.videos.length;
            }

            var $video = e.target.parentNode.parentNode;
            $video.style.height = 0;
            setTimeout(function() {
              $video.parentNode.removeChild($video);
              processScroll();
            }, 250);
            e.preventDefault();
          },
        }, '✖'),
        m('a.title', { href: video.url, onclick: open }, video.title),
        m('div.user', [
          video.user.thumbnail ?
            m('img.lazy', { 'data-src': video.user.thumbnail }) : null,
          m('a.name', {
            href: video.user.url,
            onclick: goToLink,
          }, video.user.name),
          video.user.verified ?
            m('span.verified', { 'data-title': 'Verified' }) : null
        ]),
        m('div', [
          m('span.time', timeAgo(video.timestamp)),
          m('span.views', video.views)
        ]),
        video.desc ? m('div', { innerHTML: video.desc }) : null
      ])
    ]);
  }));

  $content.appendChild($videos);
});
