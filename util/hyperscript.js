// Inspired by mithril's hyperscript :)
const svgElements = { svg: true, path: true };
const jsattrs = { innerHTML: true, href: true, disabled: true };
const m = window.m = (element, attr, content) => {
  const s = element.split('.');
  const elementName = s[0];
  const $el = svgElements[elementName] ?
    document.createElementNS('http://www.w3.org/2000/svg', elementName) :
    document.createElement(elementName);
  if (s[1]) { $el.className = s.slice(1).join(' '); }
  if (typeof attr === 'object' && !Array.isArray(attr) &&
     !(attr instanceof HTMLElement)) {
    for (let key in attr) {
      if (key === 'className') {
        if (attr[key]) { $el.classList.add(attr[key]); }
      } else if (/^data-/.test(key) || !/^on/.test(key) && !jsattrs[key]) {
        $el.setAttribute(key, attr[key]);
      } else {
        $el[key] = attr[key];
      }
    }
  } else {
    content = attr;
  }
  if (Array.isArray(content)) {
    content.forEach((node) => { if (node) { $el.appendChild(node); } });
  } else if (content != null) {
    if (content.nodeType != null) {
      $el.appendChild(content);
    } else {
      $el.textContent = content;
    }
  }
  return $el;
};

m.trust = (html) => {
  const node = document.createElement('span');
  node.innerHTML = html;
  return node;
};
