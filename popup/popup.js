/* global chrome, lazyload */

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

var months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
function showTime(timestamp) {
  var date = new Date(timestamp);
  var hour = date.getHours() % 12;
  var ampm = hour > 11 ? 'pm' : 'am';
  hour = hour % 12;
  if (hour === 0) { hour = 12; }
  return months[date.getMonth()] + ' ' + date.getDate() + ', ' +
    hour + ':' + pad(date.getMinutes()) + ampm;
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

var options = JSON.parse(localStorage.getItem('options')) || {};
var videos = JSON.parse(localStorage.getItem('videos')) || [];
var groups = [options.show_ungrouped ?
  { name: 'Other',
    videos: JSON.parse(localStorage.getItem('ungrouped')) || [],
    removable: true } :
  { name: 'All', videos: videos, removable: true }
];
var showTabs = false;

var groupedVideos = JSON.parse(localStorage.getItem('groups')) || [];
if (groupedVideos.length) { showTabs = true; }
groupedVideos.forEach(function(group) { group.removable = true; });
groups = groups.concat(groupedVideos);

// Make the first tab with videos selected.
var tabSelected = false;
for (var i = 0, len = groups.length; i < len; i++) {
  if (groups[i].videos.filter(function(v) { return !v.watched; }).length) {
    groups[i].selected = true;
    tabSelected = true;
    break;
  }
}
if (!tabSelected) {
  groups[0].selected = true;
}

if (options.ignore && options.ignore.length && options.show_ignored_tab) {
  var ignoredVideos = JSON.parse(localStorage.getItem('ignored'));
  groups.push({ name: 'Ignored', videos: ignoredVideos });
  showTabs = true;
}

var $tabs = document.getElementById('tabs');
var $content = document.getElementById('content');

if (!showTabs) {
  $tabs.style.display = 'none';
  $content.style.marginTop = 0;
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
        $content.classList.add('tab-opened');
        break;
      }
    }
    tabs = mytabs;
  }
});


var videosMap = {};
groups.forEach(function(group) {
  group.unwatched = group.videos.filter(function(video) {
    return !video.watched;
  }).length;
  var $badge;

  if (showTabs) {
    var $tab = m('a.tab', {
      className: group.selected && 'selected',
      onclick: function() {
        // Remember the scroll position of the last selected group.
        var selectedGroup = groups.filter(function(group) {
          return group.selected;
        })[0];
        if (selectedGroup) {
          selectedGroup.scrollTop = document.body.scrollTop;
          selectedGroup.selected = false;
        }

        removeChildClasses($tabs, 'selected');
        removeChildClasses($content, 'selected');
        $tab.classList.add('selected');

        group.selected = true;
        if (!group.rendered) {
          renderVideos(group);
          lazyload.addImages(group.$videos);
        } else {
          group.$videos.classList.add('selected');
        }
        document.body.scrollTop = group.scrollTop;
      }
    }, m('span.label', group.name));
    $badge = m('span.badge', group.unwatched || '');
    $tab.appendChild($badge);
    $tabs.appendChild($tab);
  }

  // If this videos is also in other tabs, remember in case it's removed.
  group.videos.forEach(function(video) {
    (videosMap[video.url] = videosMap[video.url] || [])
      .push({ group: group, video: video, $badge: $badge });
  });

  if (group.selected) {
    renderVideos(group);
  }
});

function renderVideos(group) {
  group.rendered = true;
  if (!group.videos.length) {
    $content.appendChild(group.$videos = m('div.no-videos', {
      className: group.selected && 'selected',
    }, 'No new videos'));
    return;
  }

  group.$videos = m('ul', {
    className: group.selected && 'selected',
  }, group.videos.map(function(video) {
    if (!options.show_watched && video.watched) { return; }

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

    var vidClass = '.source-' + video.source;
    if (video.watched) { vidClass += '.watched'; }
    if (video.queued) { vidClass += '.queued'; }
    var $video = m('li.video' + vidClass, [
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
          })) : null,
        m('span.queue', {
          'data-title': 'Add to Queue',
          onclick: function() {
            if (video.queued) { return; }
            chrome.runtime.sendMessage({
              queue: true,
              tabID: tabID,
              url: video.url,
            });
            videosMap[video.url].forEach(function(g) {
              g.video.queued = true;
              if (g.video.$video) {
                g.video.$video.classList.add('queued');
              }
            });
          },
        })
      ]),
      m('div.right-side', [
        group.removable && !video.watched && m('a.close', {
          href: '#',
          'data-title': 'Mark as Watched',
          onclick: function(e) {
            chrome.runtime.sendMessage({ watched: video.url });
            videosMap[video.url].forEach(function(g) {
              if (g.$badge) {
                g.$badge.textContent = (--g.group.unwatched) || '';
              }
              g.video.watched = true;
              var $video = g.video.$video;
              if (!$video) { return; }

              if (options.show_watched) {
                $video.classList.add('watched');

              } else {
                if ($video.offsetParent === null) {
                  $video.parentNode.removeChild($video);
                } else {
                  $video.style.height = 0;
                  setTimeout(function() {
                    $video.parentNode.removeChild($video);
                    lazyload.processScroll();
                  }, 250);
                }
              }
            });
            e.preventDefault();
          },
        }, '✖'),
        m('a.title', { href: video.url, onclick: open }, video.title),
        m('div.user', [
          m('span.favicon'),
          video.user.thumbnail ?
            m('img.lazy', { 'data-src': video.user.thumbnail }) : null,
          m('a.name', {
            href: video.user.url,
            onclick: goToLink,
          }, video.user.name),
          video.user.verified &&
            m('span.verified', { 'data-title': 'Verified' })
        ]),
        m('div', [
          video.timestamp && now < video.timestamp &&
            m('span.starts', showTime(video.timestamp)),
          video.timestamp && now >= video.timestamp &&
            m('span.time', timeAgo(video.timestamp)),
          video.views && m('span.views', video.views),
        ]),
        video.desc ? m('div', { innerHTML: video.desc }) : null
      ])
    ]);

    video.$video = $video;
    return $video;
  }));

  $content.appendChild(group.$videos);
}
