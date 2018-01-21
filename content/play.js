function get(selectors) {
  for (let selector of selectors) {
    let $el = document.querySelector(selector);
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
