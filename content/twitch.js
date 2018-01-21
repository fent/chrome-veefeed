/* global chrome, getElement, setNextButton  */

getElement('player', ($player) => {
  // Since Twitch VODs don't hae a proper title at page load on the tab,
  // or even after the video load, we get the title ourselves.
  getElement('title', ($title) => {
    chrome.runtime.sendMessage({ title: $title.textContent.trim() });
  });

  var $scroll = document.querySelector('#main_col .tse-scroll-content');
  var observer = new MutationObserver(() => {
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

  var $playButton =
    document.getElementsByClassName('js-control-playpause-button')[0];
  setNextButton($playButton, 'player-button');
});
