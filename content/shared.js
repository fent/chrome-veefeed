/* global chrome, m, toHumanLength */
/* exported getElement, setNextButton */

var queuedVideo;
chrome.runtime.sendMessage({ started: true }, {}, function(response) {
  queuedVideo = response;
});

// Element may not be available right away when the page loads.
function getElement(className, callback) {
  function search() {
    return document.getElementsByClassName(className)[0];
  }
  var maxAttempts = 10;
  var iid = setInterval(function() {
    var $el = search();
    if ($el || --maxAttempts === 0) {
      clearInterval(iid);
    }
    if ($el) {
      callback($el);
    }
  }, 1000);
}

function setNextButton($playButton, buttonClass) {
  // Prepend all class names with app name to avoid collisions.
  var $thumbnail, $length, $title;
  var $nextButton = m('a.veefeed-next-button.' + buttonClass, {
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

  // Place button to the right of play button.
  $playButton.parentNode.insertBefore($nextButton, $playButton.nextSibling);

  function onQueueUpdate(video) {
    if (video) {
      $nextButton.href = video.url;
      $nextButton.classList.add('veefeed-show');
      $thumbnail.src = video.thumbnail;
      $length.textContent = toHumanLength(video.length);
      $title.textContent = video.title;
    } else {
      $nextButton.classList.remove('veefeed-show');
    }
  }

  chrome.runtime.onMessage.addListener(function(message) {
    if (message.setQueue) {
      onQueueUpdate(message.video);
    }
  });

  onQueueUpdate(queuedVideo);

  return $nextButton;
}
