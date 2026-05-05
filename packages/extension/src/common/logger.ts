type Level = 'log' | 'info' | 'warn' | 'error' | 'debug';

const PREFIX = '[DOMPin]';

function emit(level: Level, scope: string, args: unknown[]): void {
  const tag = `${PREFIX} ${scope}`;
  switch (level) {
    case 'error':
      console.error(tag, ...args);
      return;
    case 'warn':
      console.warn(tag, ...args);
      return;
    case 'info':
      console.info(tag, ...args);
      return;
    case 'debug':
      console.debug(tag, ...args);
      return;
    default:
      console.log(tag, ...args);
  }
}

export interface ScopedLogger {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

export function createLogger(scope: string): ScopedLogger {
  return {
    log: (...args) => emit('log', scope, args),
    info: (...args) => emit('info', scope, args),
    warn: (...args) => emit('warn', scope, args),
    error: (...args) => emit('error', scope, args),
    debug: (...args) => emit('debug', scope, args),
  };
}
