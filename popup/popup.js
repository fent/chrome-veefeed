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

var VIDEO_HEIGHT = 119;
var SET_POS_WAIT = 100;
var POS_ANIM_TIME = 500;

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

var $tabs = document.getElementById('tabs').children[0];
var $content = document.getElementById('content');


var tabID, winID, queue, videoIsOpened = false, videoIsPlaying = false;
function getQueue() {
  queue = JSON.parse(localStorage.getItem('queue'));
  if (queue) { queue = queue[tabID]; }
}

chrome.tabs.query({ active: true, currentWindow: true }, function(results) {
  if (!results.length) {
    console.error('This shouldn\'t happen');
    return;
  }

  var tab = results[0];
  tabID = tab.id;
  winID = tab.windowId;
  getQueue();

  // See if there's another video opened in this tab.
  var openedVideo = JSON.parse(localStorage.getItem('opened'));
  if (openedVideo) {
    openedVideo = openedVideo[tabID];
    if (openedVideo && openedVideo.url !== tab.url) {
      openedVideo = null;
    }
  }

  // Find out what videos are queued.
  groups.forEach(function(group) {
    group.videos.forEach(function(video) {
      video.queued = queue && queue[video.url] != null;
      video.playing = openedVideo &&
        openedVideo.url === video.url && openedVideo.playing;
      videoIsOpened = videoIsOpened ||
        openedVideo && openedVideo.url === video.url;
      videoIsPlaying = videoIsPlaying || video.playing;
    });
  });

  var groupSelected;

  // Select the first tab with a video playing.
  groupSelected = groups.find(function(group) {
    return group.videos.some(function(video) { return video.playing; });
  });

  // Otherwise, look for queued videos.
  if (!groupSelected) {
    groupSelected = groups.find(function(group) {
      return group.videos.some(function(video) { return video.queued; });
    });
  }

  // If no currently playing or queued, look for unwatched videos.
  if (!groupSelected) {
    groupSelected = groups.find(function(group) {
      return group.videos.some(function(video) { return !video.watched; });
    });
  }

  // Otherwise, select the first tab.
  if (!groupSelected) { groupSelected = groups[0]; }
  groupSelected.selected = true;

  if (options.ignore && options.ignore.length && options.show_ignored_tab) {
    var ignoredVideos = JSON.parse(localStorage.getItem('ignored'));
    groups.push({ name: 'Ignored', videos: ignoredVideos });
    showTabs = true;
  }

  if (!showTabs) {
    $tabs.style.display = 'none';
    $content.style.marginTop = 0;
  }

  renderContent();
});


var videosMap = {};
function renderContent() {
  groups.forEach(function(group) {
    if (options.hide_empty_tabs && !group.videos.length) { return; }

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
}

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
        chrome.runtime.sendMessage({
          newTab: true,
          url: video.url,
          tabID: tab.id,
          winID: winID,
        });
      });
    }

    var opening = false;
    function open(inNewTab) {
      if (opening) { return; }
      if (video.$video.classList.contains('animating')) { return; }
      opening = true;

      if (video.queued) {
        // If video is in queue, wait a little to let the user know that
        // it will be removed from the queue as they open it.
        videosMap[video.url].forEach(function(g) {
          g.video.queued = false;
          if (g.video.$video) { g.video.$video.classList.remove('queued'); }
        });
        setTimeout(function() {
          opening = false;
          open(inNewTab);
        }, 500);
        return;
      }

      chrome.runtime.sendMessage({
        watched: true,
        url: video.url,
        source: video.source,
        tabID: tabID,
      });

      if (options.use_same_tab && videoIsOpened && !inNewTab) {
        chrome.tabs.update(parseInt(tabID), {
          url: video.url,
          active: true
        }, function(tab) {
          if (!tab) {
            openNewTab();
          } else {
            chrome.runtime.sendMessage({
              play: true,
              url: video.url,
              tabID: tab.id,
            });
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
    if (video.playing) { vidClass += '.playing'; }
    var $video = m('li.video' + vidClass, [
      m('a.left-side', { href: video.url, disabled: true }, [
        m('img.lazy', {
          'data-src': video.thumbnail,
          onclick: open.bind(null, false),
        }),
        video.length && m('span.length', toHumanLength(video.length)),
        video.source === 'twitch' && video.game ?
          m('a.game', {
            href: 'https://www.twitch.tv/directory/game/' +
              encodeURIComponent(video.game) + '/videos/week',
            'data-title': video.game,
            target: '_blank',
          }, m('img.lazy', {
            'data-src': 'http://static-cdn.jtvnw.net/ttv-boxart/' +
              encodeURIComponent(video.game) + '-138x190.jpg',
          })) : null,
        videoIsPlaying && m('span.queue', {
          'data-title': 'Add to Queue',
          onclick: function() {
            var message = {
              tabID: tabID,
              url: video.url,
              source: video.source,
            };
            if (!video.queued) {
              message.queue = true;
            } else {
              message.unqueue = true;
            }
            chrome.runtime.sendMessage(message);
            videosMap[video.url].forEach(function(g) {
              g.video.queued = !video.queued;
              if (g.video.$video) {
                g.video.$video.classList.toggle('queued');
                setTimeout(function() {
                  getQueue();
                  setVideoPositions(g.group);
                  setTimeout(function() {
                    // A nasty hack to make the :hover states of possible
                    // videos being placed under the mouse after the
                    // animation, activate.
                    var $children = g.group.$videos.querySelectorAll(
                      '.animating .queue, .animating .open-new-tab');
                    for (var i = 0, len = $children.length; i < len; i++) {
                      $children[i].style.opacity = '0';
                      $children[i].style.display = 'none';
                    }
                    setTimeout(function() {
                      for (var i = 0, len = $children.length; i < len; i++) {
                        $children[i].style.display = null;
                      }
                    }, 20);
                    setTimeout(function() {
                      for (var i = 0, len = $children.length; i < len; i++) {
                        $children[i].style.opacity = null;
                      }
                    }, 100);
                  }, POS_ANIM_TIME);
                }, SET_POS_WAIT);
              }
            });
          },
        }),
        videoIsOpened && options.use_same_tab && m('span.open-new-tab', {
          'data-title': 'Open in new tab' +
            (options.pause_other_tabs && videoIsPlaying?
             ', pause current video' : ''),
          onclick: open.bind(null, true),
        }, '⇗')
      ]),
      m('div.right-side', [
        group.removable && !video.watched && m('a.close', {
          href: '#',
          'data-title': 'Mark as Watched',
          onclick: function(e) {
            chrome.runtime.sendMessage({
              watched: true,
              url: video.url,
              source: video.source,
              tabID: tabID,
            });
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
                  }, SET_POS_WAIT);
                }
              }

              setTimeout(setVideoPositions.bind(null, g.group), SET_POS_WAIT);
            });

            e.preventDefault();
          },
        }, '✖'),
        m('a.title', {
          href: video.url,
          onclick: open.bind(null, false)
        }, video.title),
        m('div', [
          m('span.favicon', { className: 'source-' + video.source }),
          video.otherSource && m('a.favicon', {
            className: 'source-' + video.otherSource.source,
            href: video.otherSource.url,
            target: '_blank',
          }),
          m('span.user', [
            video.user.thumbnail ?
              m('img.lazy', { 'data-src': video.user.thumbnail }) : null,
            m('a.name', {
              href: video.user.url,
              target: '_blank',
            }, video.user.name),
            video.user.verified &&
              m('span.verified', { 'data-title': 'Verified' })
          ])
        ]),
        m('div', [
          video.timestamp ?
            now < video.timestamp ?
            m('span.starts', showTime(video.timestamp)) :
            now >= video.timestamp &&
              m('span.time', timeAgo(video.timestamp)) :
          video.live ? m('span.live', 'LIVE NOW') : null,
          video.views && m('span.views', video.views),
        ]),
        video.desc ? m('div', { innerHTML: video.desc }) : null
      ])
    ]);

    video.$video = $video;
    return $video;
  }));

  lazyload.addImages(group.$videos);
  setVideoPositions(group);
  $content.appendChild(group.$videos);
}

function setVideoPositions(group) {
  if (!options.show_watched) {
    group.videos = group.videos.filter(function(v) { return !v.watched; });
  }

  // Put currently playing video at the top, followed by queued videos,
  // then unwatched videos, and finally, watched videos at the bottom.
  group.videos.sort(function(a, b) {
    var playing = !!b.playing - !!a.playing;
    if (playing !== 0) { return playing; }
    var queued = !!b.queued - !!a.queued;
    if (queued !== 0) { return queued; }
    if (a.queued && b.queued) {
      return queue[a.url] - queue[b.url];
    } else {
      var watched = !!a.watched - !!b.watched;
      if (watched !== 0) { return watched; }
      return b.timestamp - a.timestamp;
    }
  });

  group.$videos.style.height = (VIDEO_HEIGHT * group.videos.length) + 'px';
  group.videos.forEach(function(video, i) {
    var top = (VIDEO_HEIGHT * i) + 'px';
    if (top !== video.$video.style.top) {
      video.$video.style.top = top;
      video.$video.classList.add('animating');
      setTimeout(function() {
        video.$video.classList.remove('animating');
      }, POS_ANIM_TIME + 20);
    }
  });

  lazyload.processScroll();
}
