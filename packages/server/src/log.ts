export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}

export interface LoggerOptions {
  debug: boolean;
}

const formatMeta = (meta?: Record<string, unknown>): string => {
  if (!meta) return '';
  const entries = Object.entries(meta);
  if (entries.length === 0) return '';
  try {
    return ' ' + JSON.stringify(meta);
  } catch {
    return ' ' + entries.map(([k, v]) => `${k}=${String(v)}`).join(' ');
  }
};

const write = (level: LogLevel, message: string, meta?: Record<string, unknown>): void => {
  const line = `[${new Date().toISOString()}] [${level}] ${message}${formatMeta(meta)}\n`;
  process.stderr.write(line);
};

export const createLogger = (options: LoggerOptions): Logger => {
  return {
    debug: (msg, meta) => {
      if (options.debug) write('debug', msg, meta);
    },
    info: (msg, meta) => write('info', msg, meta),
    warn: (msg, meta) => write('warn', msg, meta),
    error: (msg, meta) => write('error', msg, meta),
  };
};
