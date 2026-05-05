import { sendTabCommand } from './tab-bridge.js';
import { createLogger } from '../common/logger.js';
import { gatePickerBySession } from './picker-gate.js';

const log = createLogger('actions');

const ANNOTATE_MENU_ID = 'dompin-annotate-element';
const DEMO_PATH = 'examples/demo-app/index.html';

export function setupActions(): void {
  configureSidePanel();

  ensureContextMenus();
  chrome.runtime.onInstalled.addListener((details) => {
    ensureContextMenus();
    if (details.reason === 'install') {
      void openOnboarding();
    }
  });
  chrome.runtime.onStartup.addListener(() => ensureContextMenus());

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === ANNOTATE_MENU_ID && typeof tab?.id === 'number') {
      void onAnnotateContext(tab.id);
    }
  });
}

async function onAnnotateContext(tabId: number): Promise<void> {
  const ok = await gatePickerBySession(tabId);
  if (!ok) return;
  await sendTabCommand(tabId, { kind: 'annotate:context' });
}

function configureSidePanel(): void {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) => {
    log.warn('setPanelBehavior failed', e);
  });
}

async function openOnboarding(): Promise<void> {
  try {
    const url = chrome.runtime.getURL(DEMO_PATH);
    const tab = await chrome.tabs.create({ url, active: true });
    if (typeof tab.id === 'number' && chrome.sidePanel?.open) {
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
      } catch (e) {
        log.debug('sidePanel.open on install skipped', e);
      }
    }
  } catch (e) {
    log.warn('open onboarding failed', e);
  }
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
