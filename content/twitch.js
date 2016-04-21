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

// Converts from 00:00:00 or 00:00 to seconds.
function timeToSeconds(str) {
  var s = str.split(':');
  return s.length === 2 ?
    ~~s[0] * 60 + ~~s[1] :
    ~~s[0] * 3600 + ~~s[1] * 60 + ~~s[2];
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
    var currentTime = timeToSeconds($currentTime.textContent);

    // Sometimes the timer will end 1 second off.
    totalTime = totalTime || timeToSeconds($totalTime.textContent) - 1 || 1;
    if (totalTime && currentTime >= totalTime) {
      observer.disconnect();
      chrome.runtime.sendMessage({ ended: true });
    }
  });
  observer.observe($currentTime, { childList: true });
});
