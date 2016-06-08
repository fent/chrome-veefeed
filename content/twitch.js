/* global chrome, getElement, setNextButton  */

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

  var $playButton =
    document.getElementsByClassName('js-control-playpause-button')[0];
  setNextButton($playButton, 'player-button');
});
