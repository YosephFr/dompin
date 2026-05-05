import { uniqueSelector } from './selector.js';

export function scrollAncestorSelectorOf(el: Element): string | null {
  const ancestor = findScrollAncestor(el);
  if (!ancestor) return null;
  if (ancestor === document.documentElement || ancestor === document.body) return null;
  try {
    return uniqueSelector(ancestor);
  } catch {
    return null;
  }
}

function findScrollAncestor(el: Element): Element | null {
  let cur: Element | null = el.parentElement;
  while (cur) {
    if (cur === document.documentElement || cur === document.body) return cur;
    const cs = window.getComputedStyle(cur);
    const ovY = cs.overflowY;
    const ovX = cs.overflowX;
    const scrollableY = (ovY === 'auto' || ovY === 'scroll') && cur.scrollHeight > cur.clientHeight;
    const scrollableX = (ovX === 'auto' || ovX === 'scroll') && cur.scrollWidth > cur.clientWidth;
    if (scrollableY || scrollableX) return cur;
    cur = cur.parentElement;
  }
  return null;
}
