import { sendTabCommand } from './tab-bridge.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('commands');

export function setupCommands(): void {
  chrome.commands.onCommand.addListener((command) => {
    log.info('command', command);
    if (command === 'toggle-picker') {
      void togglePickerOnActiveTab();
    }
  });
}

async function togglePickerOnActiveTab(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await sendTabCommand(tab.id, { kind: 'picker:toggle' });
  } catch (e) {
    log.warn('toggle picker failed', e);
  }
}
