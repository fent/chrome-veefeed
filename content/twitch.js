/* global chrome */

function getSlider(callback) {
  function search() {
    return document.getElementsByClassName('js-seek-slider')[0];
  }
  var maxAttempts = 10;
  var iid = setInterval(function() {
    var $slider = search();
    if ($slider || --maxAttempts === 0) {
      clearInterval(iid);
    }
    if ($slider) {
      callback($slider);
    }
  }, 1000);
}

getSlider(function() {
  var $player = document.getElementsByClassName('player')[0];
  
  // This looks at the player slider, whenever it reaches the end,
  // it assumes the video has ended.
  // However, there's a bug where the slider will move without the video
  // playing. Happens when the page is opened at a small size.
  var observer = new MutationObserver(function() {
    // If the player has ended, not just paused, it will have its
    // `data-ended` attribute be equal to `true`.
    if ($player.getAttribute('data-ended') === 'true') {
      observer.disconnect();
      chrome.runtime.sendMessage({ ended: true });
    }
  });
  observer.observe($player, { attributes: true });
});
