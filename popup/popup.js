/* global chrome, lazyload, toHumanLength, now, timeAgo, showTime, m */

function removeChildClasses($node, className) {
  for (var i = 0, len = $node.children.length; i < len; i++) {
    $node.children[i].classList.remove(className);
  }
}

function numberWithCommas(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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


var tabID, winID, fullqueue, queue, openedVideo;
function getQueue() {
  fullqueue = JSON.parse(localStorage.getItem('queue'));
  if (fullqueue) {
    queue = fullqueue[tabID];
    delete fullqueue[tabID];
  } else {
    queue = null;
  }
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
  openedVideo = JSON.parse(localStorage.getItem('opened'));
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
      for (var otherTabID in fullqueue) {
        if (fullqueue[otherTabID][video.url] != null) {
          video.silentQueued = true;
          break;
        }
      }
      video.playing = openedVideo &&
        openedVideo.url === video.url && openedVideo.playing;
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

  // Still no? Select the first tab with any video.
  if (!groupSelected) {
    groupSelected = groups.find(function(group) {
      return group.videos.length;
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
            group.$container.classList.add('selected');
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
    $content.appendChild(group.$container = m('div.no-videos', {
      className: group.selected && 'selected',
    }, 'No new videos'));
    return;
  }

  group.$queueAll = m('div.queue-all', {
    className: openedVideo && openedVideo.playing && 'video-is-playing',
    onclick: function() {
      if (openedVideo && openedVideo.playing) {
        chrome.runtime.sendMessage({
          queueAll: true,
          tabID: tabID,
          videos: group.queueable,
        });

        group.queueable.forEach(function(video) {
          videosMap[video.url].forEach(function(g) {
            g.video.queued = !video.queued;
            if (g.video.$video) {
              g.video.$video.classList.toggle('queued');
            }
            setTimeout(function() {
              getQueue();
              setVideoPositions(g.group);
            }, SET_POS_WAIT);
          });
        });

      } else {
        openVideo(group.queueable.shift(), false, function(tabID) {
          chrome.runtime.sendMessage({
            queueAll: true,
            tabID: tabID,
            videos: group.queueable,
          });
        });

      }
    },
  }, [
    m('span.play-icon'),
    m('span.queue-icon'),
    m('span.label',
      (openedVideo && openedVideo.playing ?
      'Q' : 'Play and q') + 'ueue all unwatched')
  ]);

  group.$videos = m('ul', group.videos.map(function(video) {
    if (!options.show_watched && video.watched) { return; }

    var opening = false;
    function open(inNewTab, event) {
      if (event) { event.preventDefault(); }
      if (opening) { return; }
      if (video.$video.classList.contains('animating')) { return; }
      opening = true;
      inNewTab = inNewTab || event && (event.which === 2 || event.metaKey);

      if (video.queued) {
        // If video is in queue, wait a little to let the user know that
        // it will be removed from the queue as they open it.
        videosMap[video.url].forEach(function(g) {
          g.video.queued = false;
          if (g.video.$video) { g.video.$video.classList.remove('queued'); }
        });

        chrome.runtime.sendMessage({
          unqueue: true,
          video: video,
          tabID: tabID,
        });

        setTimeout(function() {
          opening = false;
          open(inNewTab);
        }, 500);
        return;
      }

      openVideo(video, inNewTab);
    }

    function userView(user) {
      if (!user) { return null; }
      return m('span.user', [
        user.thumbnail ?
          m('img.lazy', { 'data-src': user.thumbnail }) : null,
          m((user.url ? 'a' : 'span') + '.name', {
            href: user.url || '#',
            target: '_blank',
          }, user.name),
        user.verified ?
        m('span.verified', { 'data-title': 'Verified' }) : null,
      ]);
    }

    function sourceView(source) {
      return m('span.source', [
        m((source.url ? 'a' : 'span') + '.favicon', {
          className: 'source-' + source.source,
          href: source.url || '#',
          target: '_blank',
        })
      ].concat(source.users ?
        source.users.map(userView) : userView(source.user))
      );
    }

    var vidClass = '.source-' + video.source;
    if (video.watched) { vidClass += '.watched'; }
    if (video.queued) { vidClass += '.queued'; }
    if (video.silentQueued) { vidClass += '.silent-queued'; }
    if (video.playing) { vidClass += '.playing'; }
    var $video = m('li.video' + vidClass, [
      m('a.left-side', { href: video.url, disabled: true }, [
        m('img.lazy', {
          'data-src': video.thumbnail || '',
          onclick: open.bind(null, false),
        }),
        video.game ?
          m('a.game', {
            href: 'https://www.twitch.tv/directory/game/' +
              encodeURIComponent(video.game) + '/videos/week',
            'data-title': video.game,
            target: '_blank',
          }, m('img.lazy', {
            'data-src': 'http://static-cdn.jtvnw.net/ttv-boxart/' +
              encodeURIComponent(video.game) + '-138x190.jpg',
          })) : null,
        video.length && m('span.length', toHumanLength(video.length)),
        openedVideo && openedVideo.playing && m('span.queue', {
          'data-title': 'Add to Queue',
          onclick: function() {
            var message = {
              tabID: tabID,
              video: video,
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
        openedVideo && options.use_same_tab && m('span.open-new-tab', {
          'data-title': 'Open in new tab' +
            (options.pause_other_tabs && openedVideo && openedVideo.playing ?
             ', pause current video' : ''),
          onclick: open.bind(null, true),
        }, m.trust('&#8663;'))
      ]),
      m('div.right-side', [
        group.removable && !video.watched && m('a.close', {
          href: '#',
          'data-title': 'Mark as Watched',
          onclick: function(e) {
            chrome.runtime.sendMessage({
              watched: true,
              url: video.url,
              tabID: tabID,
            });
            videosMap[video.url].forEach(function(g) {
              if (g.$badge) {
                g.$badge.textContent = (--g.group.unwatched) || '';
              }
              g.video.watched = true;
              g.video.queued = false;
              var $video = g.video.$video;
              if (!$video) { return; }

              if (options.show_watched) {
                $video.classList.add('watched');
                $video.classList.remove('queued');

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
        }, m.trust('&times;')),
        m('a.title', {
          href: video.url,
          onclick: open.bind(null, false)
        }, video.title),
        m('div', [
          video.collections ?
            m('span.collections', video.collections.map(sourceView)) : null,
            m('span.sources', [
              video.otherSource ? sourceView(video.otherSource) : null,
              sourceView(video),
            ])
        ]),
        m('div', [
          video.live ? m('span.live', 'LIVE NOW') :
          video.timestamp ?
            now < video.timestamp ?
            m('span.starts', showTime(video.timestamp)) :
            now >= video.timestamp &&
              m('span.time', timeAgo(video.timestamp)) : null,
          video.views && m('span.views',
            numberWithCommas(video.views) +
            (video.live ? ' watching' : ' views')
          ),
        ]),
        video.desc ? m('div', { innerHTML: video.desc }) : null
      ])
    ]);

    video.$video = $video;
    return $video;
  }));

  group.$container = m('div.videos.selected');
  lazyload.addImages(group.$videos);
  setVideoPositions(group);
  group.$container.appendChild(group.$queueAll);
  group.$container.appendChild(group.$videos);
  $content.appendChild(group.$container);
}

function openVideo(video, inNewTab, callback) {
  chrome.runtime.sendMessage({
    watched: true,
    url: video.url,
    tabID: tabID,
  });

  if (options.use_same_tab && openedVideo && !inNewTab) {
    chrome.tabs.update(parseInt(tabID), {
      url: video.url,
      active: true
    }, function(tab) {
      if (!tab) {
        openNewTab(video, callback);
      } else {
        if (callback) { callback(tabID); }
        window.close();
      }
    });
  } else {
    openNewTab(video, callback);
  }
}

function openNewTab(video, callback) {
  chrome.tabs.create({ url: video.url }, function(tab) {
    chrome.runtime.sendMessage({
      newTab: true,
      url: video.url,
      tabID: tab.id,
      winID: winID,
    });
    if (callback) { callback(tab.id); }
  });
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
      if (b.timestamp !== a.timestamp) {
        return b.timestamp - a.timestamp;
      } else {
        return a.index - b.index;
      }
    }
  });

  group.queueable = group.videos.filter(function(v) {
    return !v.watched && !v.queued;
  }).reverse();
  group.$queueAll.classList.toggle('hidden', group.queueable.length < 2);

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
