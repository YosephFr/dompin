import { sendTabCommand } from './tab-bridge.js';
import { createLogger } from '../common/logger.js';
import { gatePickerBySession } from './picker-gate.js';

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
    const ok = await gatePickerBySession(tab.id);
    if (!ok) return;
    await sendTabCommand(tab.id, { kind: 'picker:open', mode: 'oneShot' });
  } catch (e) {
    log.warn('toggle-picker command failed', e);
  }
}
