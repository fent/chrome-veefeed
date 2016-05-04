function get(selectors) {
  for (var i = 0, len = selectors.length; i < len; i++) {
    var $el = document.querySelector(selectors[i]);
    if ($el) {
      return $el;
    }
  }
}

var $button = get([
  '.icon-player-play',
  '.js-play-button',
  '.ytp-play-button[aria-label="Play"]'
]);

if ($button && getComputedStyle($button).display !== 'none') {
  $button.click();
}
