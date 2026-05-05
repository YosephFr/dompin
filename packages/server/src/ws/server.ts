import { createServer, type Server as HttpServer, type IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  DEFAULT_WS_PATH,
  PROTOCOL_VERSION,
  type ServerMessage,
  type ServerErrorCode,
  type AnnotationPayload,
} from '@dompin/shared';
import type { Logger } from '../log.js';
import type { AnnotationStore } from '../store.js';
import { ExtensionMessageSchema, type ParsedExtensionMessage } from './validate.js';

export interface WsServerOptions {
  host: string;
  port: number;
  serverVersion: string;
  store: AnnotationStore;
  logger: Logger;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
}

interface ActiveClient {
  socket: WebSocket;
  remote: string;
  isAlive: boolean;
  helloed: boolean;
}

const CODE_NORMAL = 1000;
const CODE_PROTOCOL_VIOLATION = 1002;
const CODE_GOING_AWAY = 1001;
const CODE_INTERNAL = 1011;

const majorOf = (version: string): string => {
  const [first] = version.split('.');
  return first ?? version;
};

export class WsBridge {
  private readonly options: Required<
    Pick<WsServerOptions, 'heartbeatIntervalMs' | 'heartbeatTimeoutMs'>
  > &
    WsServerOptions;
  private http: HttpServer | null = null;
  private wss: WebSocketServer | null = null;
  private active: ActiveClient | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private starting: Promise<void> | null = null;
  private startedAt: number | null = null;

  constructor(options: WsServerOptions) {
    this.options = {
      heartbeatIntervalMs: 30_000,
      heartbeatTimeoutMs: 60_000,
      ...options,
    };
  }

  async start(): Promise<void> {
    if (this.wss) return;
    if (this.starting) return this.starting;

    this.starting = new Promise<void>((resolve, reject) => {
      const http = createServer((req, res) => {
        if (req.url === '/healthz') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ok');
          return;
        }
        res.writeHead(404);
        res.end();
      });
      const wss = new WebSocketServer({ noServer: true });

      http.on('upgrade', (req, socket, head) => {
        const url = req.url ?? '';
        if (!url.startsWith(DEFAULT_WS_PATH)) {
          socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
        });
      });

      wss.on('connection', (ws, req) => this.onConnection(ws, req));

      http.once('error', (err) => {
        this.starting = null;
        reject(err);
      });

      http.listen(this.options.port, this.options.host, () => {
        this.http = http;
        this.wss = wss;
        this.startedAt = Date.now();
        this.unsubscribeStore = this.options.store.onCountChanged((count) => {
          this.send({ type: 'pendingCountChanged', count });
        });
        this.heartbeat = setInterval(() => this.tickHeartbeat(), this.options.heartbeatIntervalMs);
        this.options.logger.info('ws listening', {
          host: this.options.host,
          port: this.options.port,
          path: DEFAULT_WS_PATH,
        });
        resolve();
      });
    });

    return this.starting;
  }

  async stop(): Promise<void> {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    if (this.active) {
      this.safeClose(this.active.socket, CODE_GOING_AWAY, 'server shutdown');
      this.active = null;
    }
    if (this.wss) {
      await new Promise<void>((resolve) => this.wss!.close(() => resolve()));
      this.wss = null;
    }
    if (this.http) {
      await new Promise<void>((resolve) => this.http!.close(() => resolve()));
      this.http = null;
    }
    this.startedAt = null;
  }

  isClientConnected(): boolean {
    return this.active !== null && this.active.socket.readyState === 1;
  }

  send(message: ServerMessage): boolean {
    if (!this.active || this.active.socket.readyState !== 1) return false;
    try {
      this.active.socket.send(JSON.stringify(message));
      return true;
    } catch (err) {
      this.options.logger.warn('ws send failed', { error: (err as Error).message });
      return false;
    }
  }

  uptimeMs(): number {
    return this.startedAt === null ? 0 : Date.now() - this.startedAt;
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const remote = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
    if (this.active) {
      this.options.logger.info('ws replacing previous client', { remote });
      this.safeClose(this.active.socket, CODE_NORMAL, 'replaced');
      this.active = null;
    }

    const client: ActiveClient = { socket: ws, remote, isAlive: true, helloed: false };
    this.active = client;
    this.options.logger.info('ws client connected', { remote });

    this.sendTo(ws, {
      type: 'welcome',
      serverVersion: this.options.serverVersion,
      protocolVersion: PROTOCOL_VERSION,
    });
    this.sendTo(ws, { type: 'pendingCountChanged', count: this.options.store.size() });

    ws.on('message', (raw) => this.onMessage(client, raw));
    ws.on('pong', () => {
      client.isAlive = true;
    });
    ws.on('close', (code, reason) => {
      if (this.active === client) this.active = null;
      this.options.logger.info('ws client closed', {
        remote,
        code,
        reason: reason.toString('utf8'),
      });
    });
    ws.on('error', (err) => {
      this.options.logger.warn('ws client error', { remote, error: err.message });
    });
  }

  private onMessage(client: ActiveClient, raw: import('ws').RawData): void {
    let json: unknown;
    try {
      const text = typeof raw === 'string' ? raw : raw.toString('utf8');
      json = JSON.parse(text);
    } catch {
      this.replyError(client, 'INVALID_PAYLOAD', 'Could not parse JSON');
      return;
    }

    const parsed = ExtensionMessageSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const message = issue ? `${issue.path.join('.') || '<root>'}: ${issue.message}` : 'invalid';
      this.replyError(client, 'INVALID_PAYLOAD', message);
      return;
    }

    try {
      this.handleMessage(client, parsed.data);
    } catch (err) {
      this.options.logger.error('ws handler crashed', { error: (err as Error).message });
      this.replyError(client, 'INTERNAL_ERROR', 'handler failure');
    }
  }

  private handleMessage(client: ActiveClient, msg: ParsedExtensionMessage): void {
    switch (msg.type) {
      case 'hello': {
        const remoteMajor = majorOf(msg.protocolVersion);
        const ourMajor = majorOf(PROTOCOL_VERSION);
        if (remoteMajor !== ourMajor) {
          this.options.logger.warn('ws protocol mismatch', {
            remote: client.remote,
            extensionProtocol: msg.protocolVersion,
            serverProtocol: PROTOCOL_VERSION,
          });
          this.replyError(
            client,
            'PROTOCOL_MISMATCH',
            `server protocol ${PROTOCOL_VERSION} incompatible with client ${msg.protocolVersion}`,
          );
          this.safeClose(client.socket, CODE_PROTOCOL_VIOLATION, 'protocol mismatch');
          if (this.active === client) this.active = null;
          return;
        }
        client.helloed = true;
        this.options.logger.info('ws client helloed', {
          remote: client.remote,
          extensionVersion: msg.extensionVersion,
          extensionProtocol: msg.protocolVersion,
        });
        return;
      }
      case 'ping':
        this.sendTo(client.socket, { type: 'pong' });
        return;
      case 'annotation:new':
        this.acceptPayloads([msg.payload], client);
        return;
      case 'annotation:cancel': {
        const removed = this.options.store.remove(msg.id);
        this.options.logger.debug('annotation cancel', { id: msg.id, removed });
        return;
      }
      case 'queue:replace':
        this.options.store.replace(msg.payloads);
        this.sendTo(client.socket, {
          type: 'ack',
          ids: msg.payloads.map((p) => p.id),
        });
        return;
      case 'queue:clear':
        this.options.store.clear();
        return;
    }
  }

  private acceptPayloads(payloads: AnnotationPayload[], client: ActiveClient): void {
    const ids: string[] = [];
    for (const payload of payloads) {
      this.options.store.add(payload);
      ids.push(payload.id);
    }
    this.sendTo(client.socket, { type: 'ack', ids });
  }

  private replyError(client: ActiveClient, code: ServerErrorCode, message: string): void {
    this.sendTo(client.socket, { type: 'error', code, message });
  }

  private sendTo(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState !== 1) return;
    try {
      socket.send(JSON.stringify(message));
    } catch (err) {
      this.options.logger.warn('ws sendTo failed', { error: (err as Error).message });
    }
  }

  private tickHeartbeat(): void {
    const client = this.active;
    if (!client) return;
    if (!client.isAlive) {
      this.options.logger.info('ws client timed out', { remote: client.remote });
      this.safeClose(client.socket, CODE_INTERNAL, 'heartbeat timeout');
      if (this.active === client) this.active = null;
      return;
    }
    client.isAlive = false;
    try {
      client.socket.ping();
    } catch (err) {
      this.options.logger.warn('ws ping failed', { error: (err as Error).message });
    }
  }

  private safeClose(socket: WebSocket, code: number, reason: string): void {
    try {
      socket.close(code, reason);
    } catch {
      try {
        socket.terminate();
      } catch {
        // socket already detached
      }
    }
  }
}
