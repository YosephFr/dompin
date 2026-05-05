import type { ServerMessage } from '@dompin/shared';
import { PROTOCOL_VERSION, buildWsUrl } from '@dompin/shared';
import type { ExtensionState, PinForPage, RequestMessage } from '../common/messaging.js';
import { createLogger } from '../common/logger.js';
import { saveSettings, loadSettings } from '../common/storage.js';
import { mergeSettings, type Settings } from '../common/settings.js';
import {
  clearQueue,
  getPinsForUrl,
  getQueue,
  pushPin,
  removePin,
  summarize,
  toSummary,
} from './queue.js';
import { captureViewport, cropDataUrl } from './screenshot.js';
import type { WsClient } from './ws-client.js';
import { broadcastToTabs, findTabByUrl, sendTabCommand } from './tab-bridge.js';

const log = createLogger('router');

interface RouterContext {
  ws: WsClient;
  getSettings: () => Settings;
  setSettings: (next: Settings) => Promise<void>;
  refreshConnection: () => void;
}

export function setupRouter(ctx: RouterContext): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!message || typeof message !== 'object' || !('kind' in message)) {
      return false;
    }
    const req = message as RequestMessage;
    handle(req, sender, ctx)
      .then((resp) => sendResponse(resp))
      .catch((e) => {
        log.error('handler error', e);
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      });
    return true;
  });
}

async function handle(
  req: RequestMessage,
  sender: chrome.runtime.MessageSender,
  ctx: RouterContext,
): Promise<unknown> {
  switch (req.kind) {
    case 'state:get':
      return getState(ctx);
    case 'pin':
      await pushPin(req.payload);
      ctx.ws.send({ type: 'annotation:new', payload: req.payload });
      return { ok: true, id: req.payload.id };
    case 'cancel':
      await removePin(req.id);
      ctx.ws.send({ type: 'annotation:cancel', id: req.id });
      return { ok: true };
    case 'send-all': {
      const queue = await getQueue();
      const sent = ctx.ws.send({ type: 'queue:replace', payloads: queue });
      if (!sent) {
        return { ok: false, error: 'Server not connected' };
      }
      await clearQueue();
      ctx.ws.send({ type: 'queue:clear' });
      return { ok: true, sent: queue.length };
    }
    case 'clear':
      await clearQueue();
      ctx.ws.send({ type: 'queue:clear' });
      return { ok: true };
    case 'capture-viewport': {
      if (sender.tab?.id == null) {
        return { ok: false, error: 'No source tab' };
      }
      const dataUrl = await captureViewport(sender.tab.id);
      return { ok: true, dataUrl };
    }
    case 'capture-zoned': {
      if (sender.tab?.id == null) {
        return { ok: false, error: 'No source tab' };
      }
      const viewport = await captureViewport(sender.tab.id);
      const dataUrl = await cropDataUrl(viewport, req.rect, req.dpr, req.padding ?? 16);
      return { ok: true, dataUrl };
    }
    case 'pins:for-url': {
      const pins = await getPinsForUrl(req.url);
      const result: PinForPage[] = pins.map((p, i) => ({
        id: p.id,
        ordinal: i + 1,
        selector: p.element?.selector ?? null,
        region: p.region?.rect ?? null,
        commentPreview: toSummary(p).commentPreview,
        createdAt: p.createdAt,
      }));
      return { ok: true, pins: result };
    }
    case 'toggle-picker': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { ok: false, error: 'No active tab' };
      await sendTabCommand(tab.id, { kind: 'picker:toggle' });
      return { ok: true };
    }
    case 'reconnect':
      ctx.ws.reconnect();
      return { ok: true };
    case 'settings:save':
      await ctx.setSettings(req.settings);
      ctx.refreshConnection();
      return { ok: true };
    case 'test-connection':
      return testConnection(req.settings);
    default:
      return { ok: false, error: 'Unknown request' };
  }
}

async function getState(ctx: RouterContext): Promise<{ ok: true; state: ExtensionState }> {
  const queue = await summarize();
  const settings = ctx.getSettings();
  return {
    ok: true,
    state: {
      connection: ctx.ws.getStatus(),
      pendingCount: queue.length,
      queue,
      settings,
    },
  };
}

async function testConnection(
  partial: Settings,
): Promise<
  { ok: true; serverVersion: string; protocolVersion: string } | { ok: false; error: string }
> {
  const settings = mergeSettings(partial);
  const url = buildWsUrl(settings.ws.host, settings.ws.port, settings.ws.path);
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
      return;
    }
    let settled = false;
    const finish = (
      r:
        | { ok: true; serverVersion: string; protocolVersion: string }
        | { ok: false; error: string },
    ) => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        /* noop */
      }
      resolve(r);
    };
    const to = setTimeout(() => finish({ ok: false, error: 'Timeout (5s)' }), 5000);
    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          type: 'hello',
          protocolVersion: PROTOCOL_VERSION,
          extensionVersion: chrome.runtime.getManifest().version,
        }),
      );
    };
    socket.onmessage = (ev) => {
      try {
        const data = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
        if (data?.type === 'welcome') {
          clearTimeout(to);
          finish({
            ok: true,
            serverVersion: String(data.serverVersion ?? 'unknown'),
            protocolVersion: String(data.protocolVersion ?? 'unknown'),
          });
        }
      } catch {
        /* noop */
      }
    };
    socket.onerror = () => {
      clearTimeout(to);
      finish({ ok: false, error: 'Connection failed' });
    };
    socket.onclose = (ev) => {
      clearTimeout(to);
      finish({ ok: false, error: ev.reason || 'Connection closed' });
    };
  });
}

export async function relayServerCommand(msg: ServerMessage): Promise<void> {
  if (msg.type === 'highlight') {
    await dispatchToMatchingTabs(msg.url, {
      kind: 'highlight',
      selector: msg.selector,
      durationMs: msg.durationMs,
    });
  } else if (msg.type === 'scrollTo') {
    await dispatchToMatchingTabs(msg.url, {
      kind: 'scrollTo',
      selector: msg.selector,
      behavior: msg.behavior,
    });
  }
}

async function dispatchToMatchingTabs(
  preferredUrl: string | undefined,
  cmd: import('../common/messaging.js').TabCommand,
): Promise<void> {
  if (preferredUrl) {
    const tabId = await findTabByUrl(preferredUrl);
    if (tabId != null) {
      const ok = await sendTabCommand(tabId, cmd);
      if (ok) return;
    }
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active?.id) {
      await sendTabCommand(active.id, cmd);
      return;
    }
  } else {
    await broadcastToTabs(cmd);
  }
}

export async function bootstrapSettings(): Promise<Settings> {
  const settings = await loadSettings();
  await saveSettings(settings);
  return settings;
}
