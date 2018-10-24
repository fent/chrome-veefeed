/* global chrome, formatVideoLength, m */
/* exported getElement, setNextButton */

let queuedVideo;
chrome.runtime.sendMessage({ started: true }, {}, (response) => {
  queuedVideo = response;
});

// Element may not be available right away when the page loads.
window.getElement = (selector, callback) => {
  let maxAttempts = 10;
  let iid = setInterval(() => {
    const $el = document.querySelector(selector);
    if ($el || --maxAttempts === 0) {
      clearInterval(iid);
    }
    if ($el) {
      callback($el);
    }
  }, 1000);
};

// Adds a Next Video button next to the Play/Pause button of the video player.
window.setNextButton = ($playButton, buttonClass) => {
  // Prepend all class names with app name to avoid collisions.
  let $thumbnail, $length, $title;
  const $nextButton = m('a._veefeed-next-button.' + buttonClass, {
    onclick: (e) => {
      if ($nextButton.classList.contains('_veefeed-show')) {
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
    m('div._veefeed-next-video', [
      m('div._veefeed-left-side', [
        $thumbnail = m('img'),
        $length = m('span._veefeed-length'),
      ]),
      m('div._veefeed-right-side', [
        m('div._veefeed-title-head', 'NEXT'),
        $title = m('div._veefeed-title'),
      ]),
    ]),
  ]);

  // Place button to the right of play button.
  $playButton.parentNode.insertBefore($nextButton, $playButton.nextSibling);

  const onQueueUpdate = (video) => {
    if (video) {
      $nextButton.href = video.url;
      $nextButton.classList.add('_veefeed-show');
      $thumbnail.src = video.thumbnail;
      $length.textContent = formatVideoLength(video.length);
      $title.textContent = video.title;
    } else {
      $nextButton.classList.remove('_veefeed-show');
    }
    queuedVideo = video;
  };

  chrome.runtime.onMessage.addListener((message) => {
    if (message.setQueue) {
      onQueueUpdate(message.video);
    }
  });

  onQueueUpdate(queuedVideo);

  return $nextButton;
};

// Called when the video has ended.
// Lets the background page know, in case there is a queued video.
window.videoEnded = (msg) => {
  document.body.classList.add('_veefeed-ended');
  document.body.classList.toggle('_veefeed-queued-video', !!queuedVideo);
  chrome.runtime.sendMessage({
    ended: true,
    ...msg,
  });
};
