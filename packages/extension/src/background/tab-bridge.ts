import type { TabCommand } from '../common/messaging.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('tab-bridge');

export async function sendTabCommand(tabId: number, cmd: TabCommand): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, cmd, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          log.debug('tab', tabId, 'unreachable:', err.message);
          resolve(false);
          return;
        }
        resolve(true);
      });
    } catch (e) {
      log.warn('sendMessage threw', e);
      resolve(false);
    }
  });
}

export async function injectContentScript(tabId: number): Promise<boolean> {
  if (!chrome.scripting?.executeScript) return false;
  try {
    const manifest = chrome.runtime.getManifest();
    const csFiles = manifest.content_scripts?.[0]?.js ?? [];
    if (csFiles.length === 0) return false;
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: csFiles,
      injectImmediately: true,
    });
    return true;
  } catch (e) {
    log.debug('inject failed for tab', tabId, e);
    return false;
  }
}

export async function sendTabCommandWithInject(tabId: number, cmd: TabCommand): Promise<boolean> {
  if (await sendTabCommand(tabId, cmd)) return true;
  const injected = await injectContentScript(tabId);
  if (!injected) return false;
  await new Promise((r) => setTimeout(r, 150));
  return sendTabCommand(tabId, cmd);
}

export async function broadcastToTabs(cmd: TabCommand): Promise<void> {
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({});
  } catch (e) {
    log.warn('tabs.query failed', e);
    return;
  }
  await Promise.all(
    tabs
      .filter((t): t is chrome.tabs.Tab & { id: number } => typeof t.id === 'number')
      .map((t) => sendTabCommand(t.id, cmd)),
  );
}

export async function findTabByUrl(url: string): Promise<number | null> {
  try {
    const tabs = await chrome.tabs.query({});
    const match = tabs.find((t) => t.url === url);
    return typeof match?.id === 'number' ? match.id : null;
  } catch {
    return null;
  }
}
