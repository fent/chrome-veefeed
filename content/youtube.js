/* global chrome, getElement, onQueueUpdate, toHumanLength */

getElement('ytp-play-button', function($playButton) {
  chrome.runtime.sendMessage({ started: true });
  var hasNextVideo = false;
  var $nextButton = document.getElementsByClassName('ytp-next-button')[0];
  var observer = new MutationObserver(function() {
    // if the video has ended, the play button will change to a
    // swirly replay arrow.
    if ($playButton.getAttribute('title') === 'Replay') {
      observer.disconnect();
      chrome.runtime.sendMessage({
        ended: true,
        scrollTop: document.body.scrollTop,
      });
      if (hasNextVideo) {
        $nextButton.getElementsByTagName('path')[0].style.fill = '#6294df';
      }
    }
  });
  observer.observe($playButton, { attributes: true });

  var nextObserver = new MutationObserver(checkNextButton);
  function checkNextButton() {
    if ($nextButton.getAttribute('data-duration')) {
      nextObserver.disconnect();
      var original = {
        duration: $nextButton.getAttribute('data-duration'),
        thumbnail: $nextButton.getAttribute('data-preview'),
        title: $nextButton.getAttribute('data-tooltip-text'),
        url: $nextButton.href,
      };

      // Since we are hijacking YouTube's own next button,
      // it's already assigned to go to a video programmatically,
      // even if the link's `href` property is changed.
      $nextButton.addEventListener('click', function(e) {
        if ($nextButton.href !== original.url) {
          window.location = $nextButton.href;
          e.preventDefault();
        }
      });

      onQueueUpdate(function(video) {
        hasNextVideo = !!video;
        video = video || original;
        $nextButton.setAttribute('data-duration',
          video.duration || toHumanLength(video.length));
        $nextButton.setAttribute('data-preview', video.thumbnail);
        $nextButton.setAttribute('data-tooltip-text', video.title);
        $nextButton.href = video.url;
      });
    }
  }

  nextObserver.observe($nextButton, { attributes: true });
  checkNextButton();
});
