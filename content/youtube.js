/* global chrome, getElement, onQueueUpdate, toHumanLength */

getElement('ytp-play-button', function($playButton) {
  chrome.runtime.sendMessage({ started: true });
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

  var $nextButton = document.getElementsByClassName('ytp-next-button')[0];
  var nextObserver = new MutationObserver(function() {
    if ($nextButton.getAttribute('data-duration')) {
      nextObserver.disconnect();
      var original = {
        duration: $nextButton.getAttribute('data-duration'),
        thumbnail: $nextButton.getAttribute('data-preview'),
        title: $nextButton.getAttribute('data-tooltip-text'),
        url: $nextButton.href,
      };

      onQueueUpdate(function(video) {
        video = video || original;
        $nextButton.setAttribute('data-duration',
          video.duration || toHumanLength(video.length));
        $nextButton.setAttribute('data-preview', video.thumbnail);
        $nextButton.setAttribute('data-tooltip-text', video.title);
        $nextButton.href = video.url;
      });
    }
  });
  nextObserver.observe($nextButton, { attributes: true });
});
