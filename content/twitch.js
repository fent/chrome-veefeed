/* global chrome, getElement */

getElement('player', function($player) {
  chrome.runtime.sendMessage({ started: true });
  var observer = new MutationObserver(function() {
    // If the video has ended, not just paused, the player will have its
    // `data-ended` attribute be equal to `true`.
    if ($player.getAttribute('data-ended') === 'true') {
      observer.disconnect();
      chrome.runtime.sendMessage({ ended: true });
    }
  });
  observer.observe($player, { attributes: true });
});
