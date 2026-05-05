import { setupActions } from './actions.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('bg');

async function bootstrap(): Promise<void> {
  setupActions();
  log.info('background ready');
}

chrome.runtime.onInstalled.addListener(() => {
  log.info('onInstalled');
});

chrome.runtime.onStartup.addListener(() => {
  log.info('onStartup');
});

void bootstrap();
