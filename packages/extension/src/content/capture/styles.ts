import type { ComputedStyleSubset } from '@dompin/shared';

const LAYOUT_PROPS = [
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'flex',
  'flex-direction',
  'flex-wrap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'justify-content',
  'justify-self',
  'justify-items',
  'align-content',
  'align-items',
  'align-self',
  'order',
  'grid-template-rows',
  'grid-template-columns',
  'grid-template-areas',
  'grid-row',
  'grid-column',
  'grid-area',
  'grid-auto-rows',
  'grid-auto-columns',
  'grid-auto-flow',
  'gap',
  'row-gap',
  'column-gap',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'box-sizing',
  'float',
  'clear',
  'z-index',
];

const TYPOGRAPHY_PROPS = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'color',
  'text-align',
  'text-transform',
  'text-decoration',
  'text-overflow',
  'white-space',
  'word-break',
  'text-shadow',
];

const BOX_PROPS = [
  'background-color',
  'background-image',
  'background-size',
  'background-repeat',
  'background-position',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-radius',
  'box-shadow',
  'opacity',
  'outline',
];

const VISUAL_PROPS = [
  'cursor',
  'pointer-events',
  'overflow',
  'overflow-x',
  'overflow-y',
  'transform',
  'transform-origin',
  'transition',
  'animation',
  'filter',
  'backdrop-filter',
  'mix-blend-mode',
  'visibility',
];

const ALWAYS_KEEP = new Set([
  'display',
  'position',
  'overflow',
  'overflow-x',
  'overflow-y',
  'cursor',
  'font-family',
  'font-size',
  'color',
  'box-sizing',
]);

export function categorizedStyles(el: Element): ComputedStyleSubset {
  const cs = window.getComputedStyle(el);
  return {
    layout: pick(cs, LAYOUT_PROPS),
    typography: pick(cs, TYPOGRAPHY_PROPS),
    box: pick(cs, BOX_PROPS),
    visual: pick(cs, VISUAL_PROPS),
  };
}

function pick(cs: CSSStyleDeclaration, props: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of props) {
    const v = cs.getPropertyValue(p).trim();
    if (!v) continue;
    if (!ALWAYS_KEEP.has(p) && isDefaultish(p, v)) continue;
    out[p] = v;
  }
  return out;
}

function isDefaultish(prop: string, value: string): boolean {
  if (value === 'none' || value === 'normal' || value === 'auto' || value === 'initial') {
    return true;
  }
  if (/^margin|^padding|^gap|^row-gap|^column-gap/.test(prop)) {
    if (value === '0px' || value === '0') return true;
  }
  if (/^border(-[a-z]+)?-width$/.test(prop) && (value === '0px' || value === '0')) return true;
  if (/^border(-[a-z]+)?-style$/.test(prop) && value === 'none') return true;
  if (prop === 'opacity' && value === '1') return true;
  if (prop === 'background-color' && (value === 'rgba(0, 0, 0, 0)' || value === 'transparent')) {
    return true;
  }
  if (prop === 'background-image' && value === 'none') return true;
  if (prop === 'box-shadow' && value === 'none') return true;
  if (prop === 'transform' && value === 'none') return true;
  if (prop === 'filter' && value === 'none') return true;
  if (prop === 'visibility' && value === 'visible') return true;
  if (prop === 'pointer-events' && value === 'auto') return true;
  if (prop === 'z-index' && value === 'auto') return true;
  if (prop === 'text-decoration' && /^none/.test(value)) return true;
  if (prop === 'text-shadow' && value === 'none') return true;
  if (prop === 'outline' && /^rgb.*0px none|^0px none/.test(value)) return true;
  return false;
}
