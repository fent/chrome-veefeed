const get = (selectors) => {
  for (let selector of selectors) {
    let $el = document.querySelector(selector);
    if ($el) {
      return $el;
    }
  }
};

const $button = get([
  '.icon-player-pause',
  '.js-pause-button',
  '.ytp-play-button[aria-label="Pause"]'
]);

if ($button && getComputedStyle($button).display !== 'none') {
  $button.click();
  true;
}
