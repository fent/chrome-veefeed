/* lazyload.js (c) Lorenzo Giuliani
 * MIT License (http://www.opensource.org/licenses/mit-license.html)
 *
 * expects a list of:  
 * `<img src="blank.gif" data-src="my_image.png" width="600" height="400" class="lazy">`
 */

(() => {
  function loadImage($img, fn) {
    var img = new Image();
    var src = $img.getAttribute('data-src');
    img.onload = () => {
      $img.src = src;
      $img.classList.remove('lazy');
      fn? fn() : null;
    };
    img.src = src;
  }

  function elementInViewport($el) {
    var rect = $el.getBoundingClientRect();
    return rect.top >= 0 && rect.left >= 0 && rect.top <= window.innerHeight;
  }

  // Expose library.
  const lazyload = window.lazyload = {};
  const images = [];
  var processScroll = lazyload.processScroll = () => {
    for (let i = 0; i < images.length; i++) {
      if (elementInViewport(images[i])) {
        loadImage(images[i], () => { images.splice(i, i); });
      }
    }
  };

  lazyload.addImages = function($node) {
    for (let $el of $node.getElementsByClassName('lazy')) {
      images.push($el);
    }
    processScroll();
  };

  lazyload.addImages(document.body);
  window.addEventListener('croll', processScroll);
})();
