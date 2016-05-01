/* global chrome */

function getByClass(classes) {
  for (var i = 0, len = classes.length; i < len; i++) {
    var $el = document.getElementsByClassName(classes[i])[0];
    if ($el) {
      return $el;
    }
  }
}

function pause() {
  var button = getByClass([
    'icon-player-pause',
    'js-pause-button',
    'ytp-play-button'
  ]);

  var label;
  if (button && getComputedStyle(button).display !== 'none' &&
     (!(label = button.getAttribute('aria-label')) || label === 'Pause') &&
      button.getAttribute('title') !== 'Replay') {
    button.click();
    return true;
  }
}

function play() {
  var button = getByClass([
    'icon-player-play',
    'js-play-button',
    'ytp-play-button'
  ]);

  var label;
  if (button && getComputedStyle(button).display !== 'none' &&
     (!(label = button.getAttribute('aria-label')) || label === 'Play')) {
    button.click();
  }
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.pause) {
    sendResponse(pause());
  } else if (message.play) {
    play();
  }
});
