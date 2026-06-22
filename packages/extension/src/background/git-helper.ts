import type { Settings } from '../common/settings.js';
import type { Session } from '../common/types.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('git-helper');

export type GitCommitResult =
  | {
      ok: true;
      status: 'disabled' | 'skipped' | 'clean' | 'committed' | 'ready';
      commit?: string;
      git?: string;
    }
  | { ok: false; error: string };

let gitQueue: Promise<unknown> = Promise.resolve();

export function commitSessionSnapshot(
  session: Session,
  settings: Settings,
  message: string,
  vaultName?: string | null,
): Promise<GitCommitResult> {
  const next = gitQueue.then(
    () => commitNow(session, settings, message, vaultName),
    () => commitNow(session, settings, message, vaultName),
  );
  gitQueue = next.catch(() => undefined);
  return next;
}

export async function checkGitHelper(
  settings: Settings,
): Promise<{ available: boolean; message: string }> {
  const helperName = settings.git.helperName.trim();
  if (!helperName) return { available: false, message: 'Companion name is empty.' };
  const resp = await sendNative(helperName, { kind: 'status' });
  if (!resp.ok) return { available: false, message: resp.error };
  return {
    available: true,
    message: resp.git ? `Connected: ${resp.git}` : 'Connected.',
  };
}

async function commitNow(
  session: Session,
  settings: Settings,
  message: string,
  vaultName?: string | null,
): Promise<GitCommitResult> {
  if (!settings.git.enabled) return { ok: true, status: 'disabled' };
  const helperName = settings.git.helperName.trim();
  const vaultPath = settings.git.vaultPath.trim();
  if (!helperName) return { ok: true, status: 'skipped' };

  const resp = await sendNative(helperName, {
    kind: 'commit-session',
    vaultPath,
    vaultName: vaultName ?? '',
    domainFolder: session.domainFolder,
    sessionFolder: session.folder,
    sessionName: session.name,
    message: normalizeMessage(message),
  });
  if (!resp.ok) {
    log.warn('commit failed', resp.error);
  }
  return resp;
}

function sendNative(hostName: string, payload: Record<string, unknown>): Promise<GitCommitResult> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(hostName, payload, (response: unknown) => {
        const err = chrome.runtime.lastError;
        if (err) {
          resolve({ ok: false, error: err.message ?? 'Native messaging failed.' });
          return;
        }
        resolve(parseResponse(response));
      });
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}

function parseResponse(response: unknown): GitCommitResult {
  const r = (response ?? {}) as Record<string, unknown>;
  if (r['ok'] === true) {
    const status =
      r['status'] === 'clean' || r['status'] === 'committed' || r['status'] === 'ready'
        ? r['status']
        : 'skipped';
    const commit = typeof r['commit'] === 'string' ? r['commit'] : undefined;
    const git = typeof r['git'] === 'string' ? r['git'] : undefined;
    return { ok: true, status, ...(commit ? { commit } : {}), ...(git ? { git } : {}) };
  }
  const error = typeof r['error'] === 'string' ? r['error'] : 'Native helper returned an error.';
  return { ok: false, error };
}

function normalizeMessage(message: string): string {
  const trimmed = message.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, 180) : 'Update DOMPin session';
}
