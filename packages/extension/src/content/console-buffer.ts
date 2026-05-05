import type { ConsoleEntry, ConsoleLevel } from '../common/types.js';

const BUFFER_WINDOW_MS = 60_000;
const MAX_ENTRIES = 500;

const buffer: ConsoleEntry[] = [];
let installed = false;

const LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;

export function installConsoleBuffer(): void {
  if (installed) return;
  installed = true;
  const target = console as unknown as Record<ConsoleLevel, (...args: unknown[]) => void>;
  for (const level of LEVELS) {
    const original = target[level].bind(console);
    target[level] = (...args: unknown[]) => {
      try {
        recordEntry(level, args);
      } catch {
        /* noop */
      }
      original(...args);
    };
  }
  window.addEventListener('error', (ev) => {
    const stack = ev.error instanceof Error ? ev.error.stack : undefined;
    record('error', formatMessage([ev.message, ev.filename, ev.lineno, ev.colno]), stack);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    const stack = reason instanceof Error ? reason.stack : undefined;
    record('error', `Unhandled promise rejection: ${formatArg(reason)}`, stack);
  });
}

export function snapshotConsole(): ConsoleEntry[] {
  prune();
  return buffer.slice();
}

function recordEntry(level: ConsoleLevel, args: unknown[]): void {
  let stack: string | undefined;
  for (const a of args) {
    if (a instanceof Error && a.stack) {
      stack = a.stack;
      break;
    }
  }
  record(level, formatMessage(args), stack);
}

function record(level: ConsoleLevel, message: string, stack: string | undefined): void {
  buffer.push({ level, timestamp: Date.now(), message, ...(stack ? { stack } : {}) });
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  prune();
}

function prune(): void {
  const cutoff = Date.now() - BUFFER_WINDOW_MS;
  while (buffer.length) {
    const first = buffer[0];
    if (!first || first.timestamp >= cutoff) break;
    buffer.shift();
  }
}

function formatMessage(args: unknown[]): string {
  return args.map(formatArg).join(' ');
}

function formatArg(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.message;
  if (a == null) return String(a);
  try {
    return JSON.stringify(a, replacer);
  } catch {
    return String(a);
  }
}

function replacer(_k: string, value: unknown): unknown {
  if (typeof value === 'function') return '[Function]';
  if (value instanceof Element) return `[Element <${value.tagName.toLowerCase()}>]`;
  return value;
}
