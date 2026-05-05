import { sendTabCommand } from './tab-bridge.js';
import { getStatus } from './vault.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('actions');

const ANNOTATE_MENU_ID = 'dompin-annotate-element';
const DEMO_PATH = 'examples/demo-app/index.html';

export function setupActions(): void {
  configureSidePanel();

  chrome.action.onClicked.addListener((tab) => {
    void onActionClick(tab);
  });

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
      void sendTabCommand(tab.id, { kind: 'annotate:context' });
    }
  });
}

function configureSidePanel(): void {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) => {
    log.warn('setPanelBehavior failed', e);
  });
}

async function onActionClick(tab: chrome.tabs.Tab): Promise<void> {
  let targetId = tab.id;
  if (typeof targetId !== 'number') {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    targetId = active?.id;
  }
  if (typeof targetId !== 'number') return;

  const status = await getStatus().catch(() => null);
  if (!status?.configured || status.needsReconnect) return;

  const delivered = await sendTabCommand(targetId, { kind: 'picker:toggle' });
  if (!delivered) log.debug('picker toggle did not reach tab', targetId);
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
