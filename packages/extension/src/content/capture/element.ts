import type { ElementContext, RectInfo } from '@dompin/shared';
import { uniqueSelector } from './selector.js';
import { xpathOf } from './xpath.js';
import { categorizedStyles } from './styles.js';
import { reactInfoOf } from './fiber.js';
import { scrollAncestorSelectorOf } from './scroll-ancestor.js';

export interface ElementCaptureOptions {
  enableReactFiber: boolean;
}

const OUTER_HTML_LIMIT = 4096;
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
    outerHTMLPreview: truncate(el.outerHTML, OUTER_HTML_LIMIT),
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
