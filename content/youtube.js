/* global chrome, getElement, setNextButton, videoEnded */

getElement('.ytp-play-button', ($playButton) => {
  const observer = new MutationObserver(() => {
    // if the video has ended, the play button will change to a
    // swirly replay arrow.
    if ($playButton.getAttribute('title') === 'Replay') {
      observer.disconnect();
      videoEnded({ scrollTop: document.body.scrollTop });
    }
  });
  observer.observe($playButton, { attributes: true });

  setNextButton($playButton, 'ytp-button');
});
