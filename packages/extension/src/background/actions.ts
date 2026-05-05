import { sendTabCommand } from './tab-bridge.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('actions');

const PANEL_MENU_ID = 'dompin-open-panel';
const POPUP_PATH = 'src/popup/popup.html';
const POPUP_WIDTH = 400;
const POPUP_HEIGHT = 560;

export function setupActions(): void {
  chrome.action.onClicked.addListener((tab) => {
    void togglePickerOnActiveTab(tab);
  });

  ensureContextMenus();
  chrome.runtime.onInstalled.addListener(() => ensureContextMenus());
  chrome.runtime.onStartup.addListener(() => ensureContextMenus());

  chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === PANEL_MENU_ID) {
      void openPanelWindow();
    }
  });
}

async function togglePickerOnActiveTab(tab: chrome.tabs.Tab): Promise<void> {
  let targetId = tab.id;
  if (typeof targetId !== 'number') {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    targetId = active?.id;
  }
  if (typeof targetId !== 'number') {
    log.debug('no active tab to toggle picker on');
    return;
  }
  const delivered = await sendTabCommand(targetId, { kind: 'picker:toggle' });
  if (!delivered) {
    log.debug('picker toggle did not reach tab', targetId);
  }
}

async function openPanelWindow(): Promise<void> {
  try {
    await chrome.windows.create({
      url: chrome.runtime.getURL(POPUP_PATH),
      type: 'popup',
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT,
      focused: true,
    });
  } catch (e) {
    log.warn('open panel window failed', e);
  }
}

function ensureContextMenus(): void {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: PANEL_MENU_ID,
        title: 'Open DOMPin panel',
        contexts: ['action'],
      });
    });
  } catch (e) {
    log.warn('contextMenus setup failed', e);
  }
}
