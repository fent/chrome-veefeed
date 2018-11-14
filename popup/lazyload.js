/* lazyload.js (c) Lorenzo Giuliani
 * MIT License (http://www.opensource.org/licenses/mit-license.html)
 *
 * expects a list of:  
 * `<img src="blank.gif" data-src="my_image.png" width="600" height="400" class="lazy">`
 */

const loadImage = ($img, fn) => {
  const img = new Image();
  let src = $img.getAttribute('data-src');
  if (/^\/\//.test(src)) {
    src = 'https:' + src;
  }
  img.onload = () => {
    $img.src = src;
    $img.classList.remove('lazy');
    fn? fn() : null;
  };
  img.src = src;
};

const elementInViewport = ($el) => {
  const rect = $el.getBoundingClientRect();
  return rect.top >= 0 && rect.left >= 0 && rect.top <= window.innerHeight;
};

// Expose library.
const lazyload = {};
export default lazyload;
const images = [];
const processScroll = lazyload.processScroll = () => {
  for (let i = 0; i < images.length; i++) {
    if (elementInViewport(images[i])) {
      loadImage(images[i], () => { images.splice(i, i); });
    }
  }
};

lazyload.addImages = ($node) => {
  for (let $el of $node.getElementsByClassName('lazy')) {
    images.push($el);
  }
  processScroll();
};

lazyload.addImages(document.body);
window.addEventListener('croll', processScroll);
