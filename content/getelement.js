// Element may not be available right away when the page loads.
window.getElement = function(className, callback) {
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
};
