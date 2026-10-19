// Just enough DOM for the sidebar modules: elements with attributes, class names, dataset, children and text.
export class FakeElement {
  constructor(tag) {
    this.tag = tag;
    this.className = "";
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.attrs = new Map();
    this.hidden = false;
    this.innerHTML = "";
    this.textContent = "";
    this.title = "";
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  removeAttribute(name) { this.attrs.delete(name); }
  append(...nodes) { for (const node of nodes) this.insertBefore(node, null); }
  insertBefore(node, ref) {
    node.remove();
    const at = ref ? this.children.indexOf(ref) : this.children.length;
    this.children.splice(at < 0 ? this.children.length : at, 0, node);
    node.parentNode = this;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
}

export class FakeDocument {
  constructor() { this.created = 0; }
  createElement(tag) { this.created++; return new FakeElement(tag); }
}

export function walk(node, visit) {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

export function findAll(node, predicate) {
  const found = [];
  walk(node, (item) => { if (predicate(item)) found.push(item); });
  return found;
}

export const hasClass = (node, name) => node.className.split(/\s+/).includes(name);
export const byClass = (node, name) => findAll(node, (item) => hasClass(item, name));
export const byKey = (node, key) => findAll(node, (item) => item.dataset.key === key)[0];
