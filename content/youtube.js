/* global chrome, getElement */

getElement('ytp-play-button', function($playButton) {
  var observer = new MutationObserver(function() {
    // if the video has ended, the play button will change to a
    // swirly replay arrow.
    if ($playButton.getAttribute('title') === 'Replay') {
      observer.disconnect();
      chrome.runtime.sendMessage({ ended: true });
    }
  });
  observer.observe($playButton, { attributes: true });
});
