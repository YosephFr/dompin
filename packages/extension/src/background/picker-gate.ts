import { getActiveSession } from './session.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('picker-gate');

export async function gatePickerBySession(tabId: number): Promise<boolean> {
  const session = await getActiveSession(tabId);
  if (session) return true;
  await openSidePanelFor(tabId);
  await flashNeedsSession(tabId);
  return false;
}

export async function openSidePanelFor(tabId: number): Promise<void> {
  if (!chrome.sidePanel?.open) return;
  try {
    await chrome.sidePanel.open({ tabId });
  } catch (e) {
    log.debug('sidePanel.open failed', e);
  }
}

async function flashNeedsSession(tabId: number): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ kind: 'picker:needs-session', tabId });
  } catch {
    // sidepanel may not have a listener yet; harmless
  }
}
