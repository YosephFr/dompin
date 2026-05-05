import type { ReactInfo, ReactSource } from '@dompin/shared';

interface FiberLike {
  type?: unknown;
  return?: FiberLike | null;
  _debugOwner?: FiberLike | null;
  _debugSource?: { fileName?: unknown; lineNumber?: unknown; columnNumber?: unknown } | null;
  memoizedProps?: unknown;
  stateNode?: unknown;
}

export function reactInfoOf(el: Element): ReactInfo | null {
  const fiber = readFiber(el);
  const props = readProps(el);
  if (!fiber && props == null) return null;
  return {
    componentName: fiber ? componentNameOf(fiber) : null,
    ownerChain: fiber ? ownerChainOf(fiber, 5) : [],
    source: fiber ? sourceOf(fiber) : null,
    props: props != null ? sanitize(props, 2) as Record<string, unknown> : null,
  };
}

function readFiber(el: Element): FiberLike | null {
  for (const k of Object.keys(el)) {
    if (k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')) {
      const v = (el as unknown as Record<string, unknown>)[k];
      if (v && typeof v === 'object') return v as FiberLike;
    }
  }
  return null;
}

function readProps(el: Element): unknown {
  for (const k of Object.keys(el)) {
    if (k.startsWith('__reactProps')) {
      return (el as unknown as Record<string, unknown>)[k];
    }
  }
  return undefined;
}

function componentNameOf(fiber: FiberLike): string | null {
  const t = fiber.type;
  if (typeof t === 'string') return t;
  if (typeof t === 'function') {
    const fn = t as { displayName?: string; name?: string };
    return fn.displayName ?? fn.name ?? null;
  }
  if (t && typeof t === 'object') {
    const obj = t as {
      displayName?: string;
      render?: { displayName?: string; name?: string };
      type?: { displayName?: string; name?: string };
    };
    return (
      obj.displayName ?? obj.render?.displayName ?? obj.render?.name ?? obj.type?.displayName ?? obj.type?.name ?? null
    );
  }
  return null;
}

function ownerChainOf(fiber: FiberLike, max: number): string[] {
  const out: string[] = [];
  let owner = fiber._debugOwner;
  while (owner && out.length < max) {
    const name = componentNameOf(owner);
    if (name) out.push(name);
    owner = owner._debugOwner ?? null;
  }
  if (out.length === 0) {
    let cur = fiber.return;
    while (cur && out.length < max) {
      const name = componentNameOf(cur);
      if (name && /^[A-Z]/.test(name)) out.push(name);
      cur = cur.return ?? null;
    }
  }
  return out;
}

function sourceOf(fiber: FiberLike): ReactSource | null {
  const src = fiber._debugSource;
  if (!src) return null;
  const file = src.fileName;
  if (typeof file !== 'string') return null;
  return {
    fileName: file,
    lineNumber: typeof src.lineNumber === 'number' ? src.lineNumber : 0,
    columnNumber: typeof src.columnNumber === 'number' ? src.columnNumber : 0,
  };
}

function sanitize(value: unknown, depth: number): unknown {
  if (depth < 0) return '[depth limit]';
  if (value == null) return value;
  if (typeof value === 'function') return undefined;
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'string') {
    return value.length > 200 ? value.slice(0, 200) + '...' : value;
  }
  if (typeof value !== 'object') return value;
  if (value instanceof Element) return `<${value.tagName.toLowerCase()}>`;
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((v) => sanitize(v, depth - 1));
  }
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (count >= 32) break;
    if (k === 'children') continue;
    if (k.startsWith('_') || k.startsWith('$$')) continue;
    const w = sanitize(v, depth - 1);
    if (w !== undefined) {
      out[k] = w;
      count++;
    }
  }
  return out;
}
