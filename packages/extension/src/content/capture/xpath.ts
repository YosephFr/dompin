export function xpathOf(el: Element): string {
  if (!(el instanceof Element)) return '';
  const segments: string[] = [];
  let cursor: Element | null = el;
  while (cursor && cursor.nodeType === Node.ELEMENT_NODE) {
    if (cursor === document.documentElement) {
      segments.unshift('html');
      break;
    }
    if (!cursor.parentElement) {
      segments.unshift(cursor.tagName.toLowerCase());
      break;
    }
    const node: Element = cursor;
    const parent: Element = node.parentElement as Element;
    const siblings = Array.from(parent.children) as Element[];
    const sameTag = siblings.filter((c) => c.tagName === node.tagName);
    const idx = sameTag.indexOf(node) + 1;
    segments.unshift(`${node.tagName.toLowerCase()}[${idx}]`);
    cursor = parent;
  }
  return '/' + segments.join('/');
}
