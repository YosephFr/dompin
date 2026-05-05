export const PROTOCOL_VERSION = '1.0.0';

export const DEFAULT_WS_HOST = '127.0.0.1';
export const DEFAULT_WS_PORT = 8930;
export const DEFAULT_WS_PATH = '/dompin';

export const buildWsUrl = (
  host: string = DEFAULT_WS_HOST,
  port: number = DEFAULT_WS_PORT,
  path: string = DEFAULT_WS_PATH,
): string => `ws://${host}:${port}${path}`;
