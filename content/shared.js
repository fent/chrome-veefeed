/* global chrome */
/* exported getElement, onQueueUpdate */

// Element may not be available right away when the page loads.
function getElement(className, callback) {
  function search() {
    return document.getElementsByClassName(className)[0];
  }
  var maxAttempts = 10;
  var iid = setInterval(function() {
    var $el = search();
    if ($el || --maxAttempts === 0) {
      clearInterval(iid);
    }
    if ($el) {
      callback($el);
    }
  }, 1000);
}

function onQueueUpdate(onUpdate) {
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.setQueue) {
      onUpdate(message.video);
    }
  });

  chrome.runtime.sendMessage({ getQueueFront: true }, {}, function(response) {
    onUpdate(response);
  });
}
