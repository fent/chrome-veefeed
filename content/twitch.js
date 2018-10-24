/* global chrome, getElement, setNextButton, videoEnded  */

// Wait for player to load.
getElement('.player', () => {
  // Since Twitch VODs don't have a proper title at page load on the tab,
  // or even after the video loads, we get the title ourselves.
  getElement('title', ($title) => {
    chrome.runtime.sendMessage({ title: $title.textContent.trim() });
  });

  // Use the slider on the player to know when the video ends.
  const $slider = document.querySelector('.js-player-slider');
  let valuemax;
  const observer = new MutationObserver(() => {
    if (!valuemax || valuemax <= 0) {
      valuemax = parseFloat($slider.getAttribute('aria-valuemax'));
    }
    let valuenow = parseFloat($slider.getAttribute('aria-valuenow'));
    if (valuemax && valuenow + 1 > valuemax) {
      observer.disconnect();
      const $scroll = document.querySelector('main .simplebar-scroll-content');
      const $tip =
        document.querySelector('.qa-theatre-mode-button span.player-tip');
      videoEnded({
        scrollTop: $tip.getAttribute('data-tip') === 'Exit Theatre Mode'
          ? 0 : $scroll.scrollTop,
      });
    }
  });
  observer.observe($slider, { attributes: true });

  const $playButton = document.querySelector('button.qa-pause-play-button');
  setNextButton($playButton, 'player-button');
});
