import { DEFAULT_WS_HOST, DEFAULT_WS_PORT } from '@dompin/shared';

export interface Config {
  host: string;
  port: number;
  enableWs: boolean;
  debug: boolean;
}

export type ParseResult =
  | { kind: 'config'; config: Config }
  | { kind: 'help'; text: string }
  | { kind: 'version'; text: string }
  | { kind: 'error'; message: string };

export const HELP_TEXT = `dompin-server -- MCP server for the DOMPin Chrome extension

Usage:
  dompin-server [options]

Options:
  --host <host>    WebSocket bind host (default: ${DEFAULT_WS_HOST})
  --port <port>    WebSocket bind port (default: ${DEFAULT_WS_PORT})
  --no-ws          Disable the WebSocket bridge (MCP stdio only)
  --help, -h       Show this help and exit
  --version, -v    Print server version and exit

Environment variables:
  DOMPIN_HOST      Same as --host
  DOMPIN_PORT      Same as --port
  DOMPIN_DEBUG     Set to 1 to enable verbose debug logging on stderr

Connect this server to an MCP-compatible client by pointing it at the
'dompin-server' executable. Logging is written to stderr; stdout is
reserved for the MCP JSON-RPC transport.
`;

const parsePort = (raw: string): number | null => {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return null;
  return n;
};

const truthy = (raw: string | undefined): boolean => {
  if (!raw) return false;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
};

export const parseArgs = (
  argv: string[],
  env: NodeJS.ProcessEnv,
  serverVersion: string,
): ParseResult => {
  let host = env['DOMPIN_HOST'] ?? DEFAULT_WS_HOST;
  const envPortRaw = env['DOMPIN_PORT'];
  let port = DEFAULT_WS_PORT;
  if (envPortRaw !== undefined) {
    const parsed = parsePort(envPortRaw);
    if (parsed === null) {
      return { kind: 'error', message: `Invalid DOMPIN_PORT: ${envPortRaw}` };
    }
    port = parsed;
  }
  const debug = truthy(env['DOMPIN_DEBUG']);
  let enableWs = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        return { kind: 'help', text: HELP_TEXT };
      case '--version':
      case '-v':
        return { kind: 'version', text: `dompin-server ${serverVersion}\n` };
      case '--no-ws':
        enableWs = false;
        break;
      case '--host': {
        const next = argv[i + 1];
        if (!next || next.startsWith('-')) {
          return { kind: 'error', message: '--host requires a value' };
        }
        host = next;
        i++;
        break;
      }
      case '--port': {
        const next = argv[i + 1];
        if (!next) {
          return { kind: 'error', message: '--port requires a value' };
        }
        const parsed = parsePort(next);
        if (parsed === null) {
          return { kind: 'error', message: `Invalid --port value: ${next}` };
        }
        port = parsed;
        i++;
        break;
      }
      default:
        if (arg && arg.startsWith('-')) {
          return { kind: 'error', message: `Unknown option: ${arg}` };
        }
    }
  }

  return { kind: 'config', config: { host, port, enableWs, debug } };
};
