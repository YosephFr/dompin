import { sendTabCommandWithInject } from './tab-bridge.js';
import { createLogger } from '../common/logger.js';
import { gatePickerBySession, openSidePanelFor } from './picker-gate.js';
import { checkPageAccess } from './page-access.js';
import { broadcastPickerError } from './picker-error.js';

const log = createLogger('commands');

export function setupCommands(): void {
  if (!chrome.commands?.onCommand) return;
  chrome.commands.onCommand.addListener((command) => {
    if (command !== 'toggle-picker') return;
    void oneShotPickerOnActiveTab();
  });
}

async function oneShotPickerOnActiveTab(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id !== 'number') return;
    const access = checkPageAccess(tab.url);
    if (!access.ok) {
      await openSidePanelFor(tab.id);
      await broadcastPickerError(tab.id, `PAGE:${access.code}`);
      return;
    }
    const ok = await gatePickerBySession(tab.id);
    if (!ok) return;
    const sent = await sendTabCommandWithInject(tab.id, {
      kind: 'picker:open',
      mode: 'oneShot',
    });
    if (!sent) {
      await openSidePanelFor(tab.id);
      await broadcastPickerError(tab.id, 'PAGE:needs-refresh');
    }
  } catch (e) {
    log.warn('toggle-picker command failed', e);
  }
}
