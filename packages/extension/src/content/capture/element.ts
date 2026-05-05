import type { ElementContext, RectInfo } from '../../common/types.js';
import { uniqueSelector } from './selector.js';
import { xpathOf } from './xpath.js';
import { categorizedStyles } from './styles.js';
import { reactInfoOf } from './fiber.js';
import { scrollAncestorSelectorOf } from './scroll-ancestor.js';

export interface ElementCaptureOptions {
  enableReactFiber: boolean;
}

const OUTER_HTML_LIMIT = 800;
const SVG_OUTER_HTML_LIMIT = 320;
const TEXT_PREVIEW_LIMIT = 200;

export function captureElement(el: Element, opts: ElementCaptureOptions): ElementContext {
  const tag = el.tagName.toLowerCase();
  const id = el.id || null;
  const classes = Array.from(el.classList);
  const role = el.getAttribute('role');
  const ariaLabel = el.getAttribute('aria-label');
  const rect = el.getBoundingClientRect();
  const boundingRect: RectInfo = {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
  return {
    selector: uniqueSelector(el),
    xpath: xpathOf(el),
    tag,
    id,
    classes,
    role,
    ariaLabel,
    textPreview: textPreviewOf(el),
    outerHTMLPreview: previewOuterHtml(el),
    boundingRect,
    computedStyles: categorizedStyles(el),
    react: opts.enableReactFiber ? reactInfoOf(el) : null,
    scrollAncestorSelector: scrollAncestorSelectorOf(el),
  };
}

function textPreviewOf(el: Element): string | null {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > TEXT_PREVIEW_LIMIT ? text.slice(0, TEXT_PREVIEW_LIMIT) + '...' : text;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '…[truncated]…';
}

function previewOuterHtml(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (tag === 'svg' || el.namespaceURI === 'http://www.w3.org/2000/svg') {
    return svgShortPreview(el);
  }
  return truncate(el.outerHTML, OUTER_HTML_LIMIT);
}

function svgShortPreview(el: Element): string {
  const open = openTagOf(el);
  const childCount = el.children.length;
  const text = (el.textContent ?? '').trim();
  const summary =
    childCount > 0
      ? `<!-- ${childCount} child node${childCount === 1 ? '' : 's'} omitted -->`
      : text
        ? `<!-- ${text.length} chars of text -->`
        : '';
  const close = `</${el.tagName.toLowerCase()}>`;
  const candidate = `${open}${summary ? `\n  ${summary}\n` : ''}${close}`;
  if (candidate.length <= SVG_OUTER_HTML_LIMIT) return candidate;
  return truncate(open, SVG_OUTER_HTML_LIMIT) + close;
}

function openTagOf(el: Element): string {
  const name = el.tagName.toLowerCase();
  const attrs: string[] = [];
  for (const a of Array.from(el.attributes)) {
    const value = a.value.length > 80 ? a.value.slice(0, 77) + '...' : a.value;
    attrs.push(`${a.name}="${value.replace(/"/g, '&quot;')}"`);
  }
  return `<${name}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
}
