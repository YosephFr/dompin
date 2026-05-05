import type { ExtensionMessage, ServerMessage } from '@dompin/shared';
import { PROTOCOL_VERSION, buildWsUrl, isServerMessage } from '@dompin/shared';
import type { Settings } from '../common/settings.js';
import type { ConnectionStatus } from '../common/messaging.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('ws');

const HEARTBEAT_MS = 25_000;
const BACKOFF_STEPS = [1000, 2000, 4000, 8000, 16000, 30000];

interface WsClientOptions {
  getSettings: () => Settings;
  onCommand: (msg: ServerMessage) => void;
  onStatusChange: (status: ConnectionStatus) => void;
}

export class WsClient {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = {
    state: 'disconnected',
    lastError: null,
    reconnectAttempt: 0,
    serverVersion: null,
    serverProtocolVersion: null,
  };
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private stopped = true;
  private extensionVersion: string;

  constructor(private opts: WsClientOptions) {
    this.extensionVersion = chrome.runtime.getManifest().version;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    this.closeSocket('client stop');
    this.setStatus({
      state: 'disconnected',
      lastError: null,
      reconnectAttempt: 0,
      serverVersion: null,
      serverProtocolVersion: null,
    });
  }

  reconnect(): void {
    log.info('manual reconnect');
    this.clearTimers();
    this.closeSocket('manual reconnect');
    this.status = { ...this.status, reconnectAttempt: 0 };
    this.connect();
  }

  send(msg: ExtensionMessage): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    try {
      this.socket.send(JSON.stringify(msg));
      return true;
    } catch (e) {
      log.error('send failed', e);
      return false;
    }
  }

  getStatus(): ConnectionStatus {
    return { ...this.status };
  }

  isConnected(): boolean {
    return this.status.state === 'connected';
  }

  private connect(): void {
    if (this.stopped) return;
    const settings = this.opts.getSettings();
    const url = buildWsUrl(settings.ws.host, settings.ws.port, settings.ws.path);
    this.setStatus({ ...this.status, state: 'connecting' });
    log.info('connecting to', url);
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn('socket ctor failed', msg);
      this.scheduleReconnect(msg);
      return;
    }
    this.socket = socket;
    socket.onopen = () => this.handleOpen();
    socket.onmessage = (ev) => this.handleMessage(ev);
    socket.onerror = () => log.warn('ws error event');
    socket.onclose = (ev) => this.handleClose(ev);
  }

  private handleOpen(): void {
    log.info('ws open');
    const hello: ExtensionMessage = {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      extensionVersion: this.extensionVersion,
    };
    this.send(hello);
    this.startHeartbeat();
    this.setStatus({
      state: 'connected',
      lastError: null,
      reconnectAttempt: 0,
      serverVersion: this.status.serverVersion,
      serverProtocolVersion: this.status.serverProtocolVersion,
    });
  }

  private handleMessage(ev: MessageEvent): void {
    let parsed: unknown;
    try {
      const data = typeof ev.data === 'string' ? ev.data : String(ev.data);
      parsed = JSON.parse(data);
    } catch {
      log.warn('invalid json');
      return;
    }
    if (!isServerMessage(parsed)) {
      log.warn('unrecognized server message', parsed);
      return;
    }
    if (parsed.type === 'welcome') {
      log.info('welcome:', parsed.serverVersion, parsed.protocolVersion);
      this.setStatus({
        state: 'connected',
        lastError: null,
        reconnectAttempt: 0,
        serverVersion: parsed.serverVersion,
        serverProtocolVersion: parsed.protocolVersion,
      });
      return;
    }
    if (parsed.type === 'pong') return;
    this.opts.onCommand(parsed);
  }

  private handleClose(ev: CloseEvent): void {
    log.info('ws close', ev.code, ev.reason);
    this.clearTimers();
    this.socket = null;
    if (this.stopped) return;
    const reason = ev.reason || `closed (${ev.code})`;
    this.scheduleReconnect(reason);
  }

  private scheduleReconnect(reason: string): void {
    const attempt = this.status.reconnectAttempt;
    const idx = Math.min(attempt, BACKOFF_STEPS.length - 1);
    const delay = BACKOFF_STEPS[idx] ?? 30000;
    log.info('reconnect in', delay, 'ms (attempt', attempt + 1, ')');
    this.setStatus({
      ...this.status,
      state: 'connecting',
      lastError: reason,
      reconnectAttempt: attempt + 1,
    });
    this.reconnectTimer = self.setTimeout(() => this.connect(), delay) as unknown as number;
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = self.setInterval(() => {
      this.send({ type: 'ping' });
    }, HEARTBEAT_MS) as unknown as number;
  }

  private closeSocket(reason: string): void {
    if (this.socket) {
      try {
        this.socket.close(1000, reason);
      } catch {
        /* noop */
      }
      this.socket = null;
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearHeartbeat();
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setStatus(s: ConnectionStatus): void {
    this.status = s;
    try {
      this.opts.onStatusChange({ ...s });
    } catch (e) {
      log.error('status handler error', e);
    }
  }
}
