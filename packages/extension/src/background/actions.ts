import { sendTabCommandWithInject } from './tab-bridge.js';
import { createLogger } from '../common/logger.js';
import { gatePickerBySession, openSidePanelFor } from './picker-gate.js';
import { checkPageAccess } from './page-access.js';
import { broadcastPickerError } from './picker-error.js';

const log = createLogger('actions');

const ANNOTATE_MENU_ID = 'dompin-annotate-element';

export function setupActions(): void {
  configureSidePanel();

  ensureContextMenus();
  chrome.runtime.onInstalled.addListener(() => ensureContextMenus());
  chrome.runtime.onStartup.addListener(() => ensureContextMenus());

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === ANNOTATE_MENU_ID && typeof tab?.id === 'number') {
      void onAnnotateContext(tab.id, tab.url ?? null);
    }
  });
}

async function onAnnotateContext(tabId: number, tabUrl: string | null): Promise<void> {
  const access = checkPageAccess(tabUrl);
  if (!access.ok) {
    await openSidePanelFor(tabId);
    await broadcastPickerError(tabId, `PAGE:${access.code}`);
    return;
  }
  const ok = await gatePickerBySession(tabId);
  if (!ok) return;
  const sent = await sendTabCommandWithInject(tabId, { kind: 'annotate:context' });
  if (!sent) {
    await openSidePanelFor(tabId);
    await broadcastPickerError(tabId, 'PAGE:needs-refresh');
  }
}

function configureSidePanel(): void {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) => {
    log.warn('setPanelBehavior failed', e);
  });
}

function ensureContextMenus(): void {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: ANNOTATE_MENU_ID,
        title: 'Annotate element with DOMPin',
        contexts: ['all'],
      });
    });
  } catch (e) {
    log.warn('contextMenus setup failed', e);
  }
}
