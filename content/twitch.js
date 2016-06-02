/* global chrome, getElement, onQueueUpdate, toHumanLength, m */

getElement('player', function($player) {
  chrome.runtime.sendMessage({ started: true });
  var $scroll = document.querySelector('#main_col .tse-scroll-content');
  var observer = new MutationObserver(function() {
    // If the video has ended, not just paused, the player will have its
    // `data-ended` attribute be equal to `true`.
    if ($player.getAttribute('data-ended') === 'true') {
      observer.disconnect();
      chrome.runtime.sendMessage({
        ended: true,
        scrollTop: $scroll.scrollTop,
      });
    }
  });
  observer.observe($player, { attributes: true });

  var $buttons = document.getElementsByClassName('player-buttons-left')[0];

  // Prepend all class names with app name to avoid collisions.
  var $thumbnail, $length, $title;
  var $nextButton = m('a.veefeed-next-button', {
    onclick: function(e) {
      if ($nextButton.classList.contains('veefeed-show')) {
        window.location = $nextButton.href;
      }
      e.preventDefault();
    }
  }, [
    m('svg', {
      'xmlns:xlink': 'http://www.w3.org/1999/xlink',
      width: '100%',
      height: '100%',
      version: '1.1',
      viewBox: '0 0 36 36',
    }, m('path', {
      d: 'M 12,24 20.5,18 12,12 V 24 z M 22,12 v 12 h 2 V 12 h -2 z',
    })),
    m('div.veefeed-next-video', [
      m('div.veefeed-left-side', [
        $thumbnail = m('img'),
        $length = m('span.veefeed-length'),
      ]),
      m('div.veefeed-right-side', [
        m('div.veefeed-title-head', 'NEXT'),
        $title = m('div.veefeed-title'),
      ]),
    ]),
  ]);
  $buttons.insertBefore($nextButton, $buttons.children[1]);

  onQueueUpdate(function(video) {
    if (video) {
      $nextButton.href = video.url;
      $nextButton.classList.add('veefeed-show');
      $thumbnail.src = video.thumbnail;
      $length.textContent = toHumanLength(video.length);
      $title.textContent = video.title;
    } else {
      $nextButton.classList.remove('veefeed-show');
    }
  });
});
