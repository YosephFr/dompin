import { setupActions } from './actions.js';
import { setupCommands } from './commands.js';
import { setupRouter } from './router.js';
import { onSessionChange, setupSessionLifecycle } from './session.js';
import { broadcastToTabs } from './tab-bridge.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('bg');

function bootstrap(): void {
  setupActions();
  setupCommands();
  setupRouter();
  setupSessionLifecycle();
  onSessionChange(() => {
    void broadcastToTabs({ kind: 'pins:update' });
  });
  log.info('background ready');
}

bootstrap();
chrome.runtime.onInstalled.addListener(() => log.info('onInstalled'));
chrome.runtime.onStartup.addListener(() => log.info('onStartup'));
