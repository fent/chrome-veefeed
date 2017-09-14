/* lazyload.js (c) Lorenzo Giuliani
 * MIT License (http://www.opensource.org/licenses/mit-license.html)
 *
 * expects a list of:  
 * `<img src="blank.gif" data-src="my_image.png" width="600" height="400" class="lazy">`
 */

!function(window){
  var addEventListener = function(evt, fn){
    window.addEventListener
      ? this.addEventListener(evt, fn, false)
      : (window.attachEvent)
        ? this.attachEvent('on' + evt, fn)
        : this['on' + evt] = fn;
  };

  function loadImage (el, fn) {
    var img = new Image()
      , src = el.getAttribute('data-src');
    img.onload = function() {
      if (el.parent)
        el.parent.replaceChild(img, el);
      else
        el.src = src;

      fn? fn() : null;
    };
    img.src = src;
  }

  function elementInViewport(el) {
    var rect = el.getBoundingClientRect();

    return (
      rect.top    >= 0
    && rect.left   >= 0
    && rect.top <= (window.innerHeight || document.documentElement.clientHeight)
    );
  }

  // Expose library.
  var lazyload = window.lazyload = {};
  var images = new Array();
  var query = document.getElementsByClassName('lazy');
  var processScroll = lazyload.processScroll = function() {
    for (var i = 0; i < images.length; i++) {
      if (elementInViewport(images[i])) {
        loadImage(images[i], function () {
          images.splice(i, i);
        });
      }
    }
  };

  // Array.prototype.slice.call is not callable under our lovely IE8 
  function addImages() {
    for (var i = 0; i < query.length; i++) {
      images.push(query[i]);
    }
  }

  lazyload.addImages = function($node) {
    var query = $node.getElementsByClassName('lazy');
    for (var i = 0; i < query.length; i++) {
      images.push(query[i]);
    }
    processScroll();
  };

  addImages();
  processScroll();
  addEventListener('scroll',processScroll);

}(this);
