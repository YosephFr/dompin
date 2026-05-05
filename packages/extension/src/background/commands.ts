import { sendTabCommand } from './tab-bridge.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('commands');

export function setupCommands(): void {
  if (!chrome.commands?.onCommand) return;
  chrome.commands.onCommand.addListener((command) => {
    if (command !== 'toggle-picker') return;
    void togglePickerOnActiveTab();
  });
}

async function togglePickerOnActiveTab(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id !== 'number') return;
    await sendTabCommand(tab.id, { kind: 'picker:toggle' });
  } catch (e) {
    log.warn('toggle-picker command failed', e);
  }
}
