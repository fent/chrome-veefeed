/* global chrome, getElement, setNextButton */

getElement('ytp-play-button', function($playButton) {
  var observer = new MutationObserver(function() {
    // if the video has ended, the play button will change to a
    // swirly replay arrow.
    if ($playButton.getAttribute('title') === 'Replay') {
      observer.disconnect();
      chrome.runtime.sendMessage({
        ended: true,
        scrollTop: document.body.scrollTop,
      });
    }
  });
  observer.observe($playButton, { attributes: true });

  setNextButton($playButton, 'ytp-button');
});
