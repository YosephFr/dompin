import type { RequestMessage, Resp } from '../common/messaging.js';
import type { Session, VaultStatus } from '../common/types.js';
import { mergeSettings } from '../common/settings.js';
import { loadSettings, saveSettings } from '../common/storage.js';
import { loadRootHandle, requestRootPermission } from '../common/vault-handle.js';
import { createLogger } from '../common/logger.js';
import { clearVault, ensureWritable, getStatus, invalidateHandleCache } from './vault.js';
import {
  archiveSession,
  bumpSessionAnnotation,
  clearAllSessions,
  ensureSession,
  getActiveSession,
  listSessions,
  newSession,
  renameSession,
  resumeSession,
} from './session.js';
import {
  deleteAnnotation,
  editAnnotationComment,
  readSessionPins,
  regenerateSessionReadme,
  updateAnnotation,
  writeAnnotation,
} from './vault-writer.js';
import { broadcastToTabs, sendTabCommand, sendTabCommandWithInject } from './tab-bridge.js';
import { captureElement, captureViewport } from './screenshot.js';
import { gatePickerBySession } from './picker-gate.js';
import { checkPageAccess } from './page-access.js';
import { transcribeAudio } from './transcription.js';
import { cancelRecording, startRecording, stopRecording } from './audio-recorder.js';
import { snapshotNetworkFailures } from './network-failures.js';

const log = createLogger('router');

type RouterResp = Resp<Record<string, unknown>>;

export function setupRouter(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object' || !('kind' in message)) {
      return false;
    }
    const req = message as RequestMessage;
    handle(req, sender)
      .then((resp) => sendResponse(resp))
      .catch((e) => {
        log.error('handler threw', req.kind, e);
        sendResponse(err(e instanceof Error ? e.message : String(e)));
      });
    return true;
  });
}

async function handle(
  req: RequestMessage,
  sender: chrome.runtime.MessageSender,
): Promise<RouterResp> {
  switch (req.kind) {
    case 'state:get': {
      const [vault, settings] = await Promise.all([getStatus(), loadSettings()]);
      return ok({ state: { vault, settings } });
    }
    case 'vault:status': {
      return ok({ vault: await getStatus() });
    }
    case 'vault:pickRoot': {
      invalidateHandleCache();
      return ok({ vault: await refreshedStatus() });
    }
    case 'vault:reconnect': {
      invalidateHandleCache();
      return ok({ vault: await getStatus() });
    }
    case 'vault:request-permission': {
      const handle = await loadRootHandle();
      if (handle) {
        await requestRootPermission().catch(() => 'denied' as const);
      }
      invalidateHandleCache();
      return ok({ vault: await getStatus() });
    }
    case 'vault:clear': {
      await clearVault();
      await clearAllSessions();
      return ok({ vault: await getStatus() });
    }
    case 'session:active': {
      const tabId = await resolveTabId(req.tabId, sender);
      if (tabId == null) return ok({ session: null });
      const session = await getActiveSession(tabId);
      return ok({ session });
    }
    case 'session:list': {
      const sessions = await listSessions(req.domain, req.limit);
      return ok({ sessions });
    }
    case 'session:rename': {
      const session = await renameSession(req.sessionId, req.newName);
      if (session.annotationCount > 0) {
        await regenerateSessionReadme(session).catch((e) =>
          log.debug('rename readme regen skipped', e),
        );
      }
      return ok({ session });
    }
    case 'session:new': {
      const session = await newSession(req.tabId, req.pageUrl, null, req.name);
      return ok({ session });
    }
    case 'session:resume': {
      const session = await resumeSession(req.tabId, req.sessionId, req.pageUrl, req.pageTitle);
      return ok({ session });
    }
    case 'session:archive': {
      await archiveSession(req.sessionId);
      return ok({});
    }
    case 'annotation:add': {
      const tabId = sender.tab?.id;
      if (typeof tabId !== 'number') return err('annotation:add requires a tab sender');
      try {
        await ensureWritable();
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
      const pageUrl = req.payload.page.url;
      const pageTitle = req.payload.page.title;
      const existing = await getActiveSession(tabId);
      if (!existing) {
        await gatePickerBySession(tabId);
        return err('No active session for this tab. Create one first.');
      }
      const session = await ensureSession(tabId, pageUrl, pageTitle);
      try {
        const settings = await loadSettings();
        const network = settings.flags.captureNetworkFailures ? snapshotNetworkFailures(tabId) : [];
        const payload = network.length ? { ...req.payload, network } : req.payload;
        const result = await writeAnnotation(session, payload);
        await bumpSessionAnnotation(session.id, +1, pageUrl, pageTitle);
        await broadcastToTabs({ kind: 'pins:update' });
        return ok({
          annotationId: payload.id,
          sessionId: session.id,
          ordinal: result.ordinal,
          files: result.files,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
    case 'annotation:cancel': {
      const session = await findSessionForCancel(sender, req.annotationId);
      if (!session) return err('Annotation not found in any active session');
      const result = await deleteAnnotation(session, req.annotationId);
      if (!result.ok) return err(result.error);
      await bumpSessionAnnotation(session.id, -1);
      await broadcastToTabs({ kind: 'pins:update' });
      return ok({});
    }
    case 'annotation:edit-comment': {
      const session = await findSessionForCancel(sender, req.annotationId);
      if (!session) return err('Annotation not found in any active session');
      const result = await editAnnotationComment(session, req.annotationId, req.comment);
      if (!result.ok) return err(result.error);
      await broadcastToTabs({ kind: 'pins:update' });
      return ok({});
    }
    case 'annotation:update': {
      const session = await findSessionForCancel(sender, req.annotationId);
      if (!session) return err('Annotation not found in any active session');
      const result = await updateAnnotation(session, req.annotationId, {
        comment: req.comment,
        voiceTranscript: req.voiceTranscript ?? null,
        attachments: req.attachments ?? [],
      });
      if (!result.ok) return err(result.error);
      await broadcastToTabs({ kind: 'pins:update' });
      return ok({});
    }
    case 'capture-viewport':
    case 'capture-viewport-clean': {
      const tabId = sender.tab?.id;
      if (typeof tabId !== 'number') return err('capture-viewport requires a tab sender');
      try {
        const dataUrl = await captureViewport(tabId);
        return ok({ dataUrl });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
    case 'capture-element': {
      const tabId = sender.tab?.id;
      if (typeof tabId !== 'number') return err('capture-element requires a tab sender');
      try {
        const dataUrl = await captureElement(tabId, req.rect, req.dpr, req.padding);
        return ok({ dataUrl });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
    case 'audio:transcribe': {
      const settings = await loadSettings();
      try {
        const result = await transcribeAudio(
          {
            audioDataUrl: req.audioDataUrl,
            mimeType: req.mimeType,
            fileName: req.fileName,
          },
          settings,
        );
        return ok({ text: result.text, provider: result.provider, model: result.model });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
    case 'audio:record-start': {
      const r = await startRecording();
      return r.ok ? ok({}) : err(r.error);
    }
    case 'audio:record-stop': {
      const r = await stopRecording();
      if (!r.ok) return err(r.error);
      if ('discarded' in r) return ok({ discarded: true });
      try {
        const settings = await loadSettings();
        const result = await transcribeAudio(
          { audioDataUrl: r.audioDataUrl, mimeType: r.mimeType, fileName: r.fileName },
          settings,
        );
        return ok({ text: result.text, provider: result.provider, model: result.model });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
    case 'audio:record-cancel': {
      await cancelRecording();
      return ok({});
    }
    case 'pins:for-tab': {
      const tabId = await resolveTabId(req.tabId, sender);
      if (tabId == null) return ok({ pins: [] });
      const session = await getActiveSession(tabId);
      if (!session) return ok({ pins: [] });
      const pins = await readSessionPins(session);
      return ok({ pins });
    }
    case 'pin:focus': {
      const sent = await sendTabCommandWithInject(req.tabId, {
        kind: 'pin:focus',
        annotationId: req.annotationId,
      });
      if (!sent) return err('PAGE:needs-refresh');
      return ok({});
    }
    case 'pin:edit': {
      const sent = await sendTabCommandWithInject(req.tabId, {
        kind: 'pin:edit',
        annotationId: req.annotationId,
      });
      if (!sent) return err('PAGE:needs-refresh');
      return ok({});
    }
    case 'toggle-picker': {
      const tabId = await resolveActiveTabId(sender);
      if (typeof tabId !== 'number') return err('PAGE:no-tab');
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      const access = checkPageAccess(tab?.url);
      if (!access.ok) return err(`PAGE:${access.code}`);
      const allowed = await gatePickerBySession(tabId);
      if (!allowed) return err('PAGE:no-session');
      const sent = await sendTabCommandWithInject(tabId, {
        kind: 'picker:toggle',
        mode: req.mode ?? 'sticky',
      });
      if (!sent) return err('PAGE:needs-refresh');
      return ok({});
    }
    case 'settings:save': {
      await saveSettings(mergeSettings(req.settings));
      return ok({});
    }
    case 'picker:state-broadcast': {
      return ok({});
    }
  }
}

async function refreshedStatus(): Promise<VaultStatus> {
  return getStatus();
}

async function findSessionForCancel(
  sender: chrome.runtime.MessageSender,
  annotationId: string,
): Promise<Session | null> {
  const tabId = sender.tab?.id;
  if (typeof tabId === 'number') {
    const session = await getActiveSession(tabId);
    if (session) return session;
  }
  const sessions = await listSessions();
  for (const item of sessions) {
    const pins = await readSessionPins(item);
    if (pins.some((p) => p.id === annotationId)) {
      return {
        id: item.id,
        domain: item.domain,
        domainFolder: item.domainFolder,
        name: item.name,
        folder: item.folder,
        startedAt: item.startedAt,
        lastWriteAt: item.lastWriteAt,
        annotationCount: item.annotationCount,
        status: item.status,
      };
    }
  }
  return null;
}

async function resolveTabId(
  explicit: number | undefined,
  sender: chrome.runtime.MessageSender,
): Promise<number | null> {
  if (typeof explicit === 'number') return explicit;
  if (typeof sender.tab?.id === 'number') return sender.tab.id;
  return resolveActiveTabId(sender);
}

async function resolveActiveTabId(sender: chrome.runtime.MessageSender): Promise<number | null> {
  if (typeof sender.tab?.id === 'number') return sender.tab.id;
  try {
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    return typeof t?.id === 'number' ? t.id : null;
  } catch {
    return null;
  }
}

function ok<T extends Record<string, unknown>>(data: T): { ok: true } & T {
  return { ok: true, ...data };
}

function err(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}
