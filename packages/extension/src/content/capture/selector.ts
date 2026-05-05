export function uniqueSelector(el: Element): string {
  if (!(el instanceof Element)) return '';
  const tag = el.tagName.toLowerCase();

  const testid = el.getAttribute('data-testid');
  if (testid) {
    const sel = `[data-testid="${escapeAttr(testid)}"]`;
    if (matchesOne(sel, el)) return sel;
  }

  const dataTest = el.getAttribute('data-test');
  if (dataTest) {
    const sel = `[data-test="${escapeAttr(dataTest)}"]`;
    if (matchesOne(sel, el)) return sel;
  }

  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) {
    const sel = `#${cssEscape(el.id)}`;
    if (matchesOne(sel, el)) return sel;
  }

  const aria = el.getAttribute('aria-label');
  if (aria) {
    const sel = `${tag}[aria-label="${escapeAttr(aria)}"]`;
    if (matchesOne(sel, el)) return sel;
  }

  const classes = Array.from(el.classList).filter((c) => c && !looksGenerated(c));
  if (classes.length) {
    const cls = `${tag}.${classes.map(cssEscape).join('.')}`;
    if (matchesOne(cls, el)) return cls;
    if (el.parentElement) {
      const parentSel = shortAncestorSelector(el.parentElement);
      const compound = `${parentSel} > ${cls}`;
      if (matchesOne(compound, el)) return compound;
    }
  }

  return nthChain(el);
}

function nthChain(el: Element): string {
  const segments: string[] = [];
  let cursor: Element | null = el;
  while (cursor && cursor !== document.body && cursor.parentElement) {
    const node: Element = cursor;
    const parent: Element = node.parentElement as Element;
    const tag = node.tagName.toLowerCase();
    const siblings = Array.from(parent.children) as Element[];
    const sameTag = siblings.filter((c) => c.tagName === node.tagName);
    const idx = sameTag.indexOf(node) + 1;
    segments.unshift(`${tag}:nth-of-type(${idx})`);
    if (matchesOne(`body > ${segments.join(' > ')}`, el)) {
      return `body > ${segments.join(' > ')}`;
    }
    cursor = parent;
  }
  return `body > ${segments.join(' > ')}`;
}

function shortAncestorSelector(el: Element): string {
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return `#${cssEscape(el.id)}`;
  const tag = el.tagName.toLowerCase();
  const cls = Array.from(el.classList).find((c) => !looksGenerated(c));
  if (cls) return `${tag}.${cssEscape(cls)}`;
  return tag;
}

function matchesOne(selector: string, el: Element): boolean {
  try {
    const found = document.querySelectorAll(selector);
    return found.length === 1 && found[0] === el;
  } catch {
    return false;
  }
}

function looksGenerated(cls: string): boolean {
  if (cls.length > 36) return true;
  if (/^[a-z]+-[a-z0-9]{6,}$/.test(cls)) return true;
  if (/^css-[a-z0-9]+$/.test(cls)) return true;
  if (/^_[\w]+__[a-z0-9]+$/i.test(cls)) return true;
  return false;
}

function cssEscape(s: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(s);
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

function escapeAttr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
