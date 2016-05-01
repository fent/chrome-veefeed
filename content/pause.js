/* global chrome */

function get(selectors) {
  for (var i = 0, len = selectors.length; i < len; i++) {
    var $el = document.querySelector(selectors[i]);
    if ($el) {
      return $el;
    }
  }
}

function pause() {
  var button = get([
    '.icon-player-pause',
    '.js-pause-button',
    '.ytp-play-button[aria-label="Pause"]'
  ]);

  if (button && getComputedStyle(button).display !== 'none') {
    button.click();
    return true;
  }
}

function play() {
  var button = get([
    '.icon-player-play',
    '.js-play-button',
    '.ytp-play-button[aria-label="Play"]'
  ]);

  if (button && getComputedStyle(button).display !== 'none') {
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
