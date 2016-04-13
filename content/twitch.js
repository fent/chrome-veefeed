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
  var $currentTime = document.getElementsByClassName('js-seek-currenttime')[0];
  var $totalTime = document.getElementsByClassName('js-seek-totaltime')[0];
  var totalTime;
  
  // This looks at the player slider, whenever it reaches the end,
  // it assumes the video has ended.
  // However, there's a bug where the slider will move without the video
  // playing. Happens when the page is opened at a small size.
  var observer = new MutationObserver(function() {
    var currentTime = $currentTime.textContent;
    totalTime = totalTime || $totalTime.textContent;
    if (currentTime === totalTime && currentTime !== '00:00') {
      chrome.runtime.sendMessage({ ended: true });
      observer.disconnect();
    }
  });
  observer.observe($currentTime, { childList: true });
});
