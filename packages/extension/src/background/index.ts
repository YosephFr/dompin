import type { Settings } from '../common/settings.js';
import { DEFAULT_SETTINGS } from '../common/settings.js';
import { loadSettings, saveSettings } from '../common/storage.js';
import { createLogger } from '../common/logger.js';
import { setupCommands } from './commands.js';
import { setupRouter, relayServerCommand } from './router.js';
import { onQueueMutate } from './queue.js';
import { broadcastToTabs } from './tab-bridge.js';
import { WsClient } from './ws-client.js';

const log = createLogger('bg');

let currentSettings: Settings = DEFAULT_SETTINGS;
let ws: WsClient | null = null;

async function bootstrap(): Promise<void> {
  currentSettings = await loadSettings();
  await saveSettings(currentSettings);

  ws = new WsClient({
    getSettings: () => currentSettings,
    onCommand: (msg) => {
      void relayServerCommand(msg);
    },
    onStatusChange: () => {
      /* status is read on demand via getStatus */
    },
  });

  setupCommands();

  setupRouter({
    ws,
    getSettings: () => currentSettings,
    setSettings: async (next) => {
      currentSettings = next;
      await saveSettings(next);
    },
    refreshConnection: () => {
      ws?.reconnect();
    },
  });

  onQueueMutate(() => {
    void broadcastToTabs({ kind: 'pins:update' });
  });

  ws.start();
  log.info('background ready');
}

chrome.runtime.onInstalled.addListener(() => {
  log.info('onInstalled');
});

chrome.runtime.onStartup.addListener(() => {
  log.info('onStartup');
});

void bootstrap();
