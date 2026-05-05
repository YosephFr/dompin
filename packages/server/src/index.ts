#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PROTOCOL_VERSION } from '@dompin/shared';
import { parseArgs } from './config.js';
import { createLogger } from './log.js';
import { AnnotationStore } from './store.js';
import { WsBridge } from './ws/server.js';
import { createMcp } from './mcp/server.js';

const readServerVersion = (): string => {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = resolve(here, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
};

const main = async (): Promise<void> => {
  const serverVersion = readServerVersion();
  const parsed = parseArgs(process.argv.slice(2), process.env, serverVersion);

  if (parsed.kind === 'help') {
    process.stdout.write(parsed.text);
    process.exit(0);
  }
  if (parsed.kind === 'version') {
    process.stdout.write(parsed.text);
    process.exit(0);
  }
  if (parsed.kind === 'error') {
    process.stderr.write(`dompin-server: ${parsed.message}\n\nRun with --help for usage.\n`);
    process.exit(2);
  }

  const { config } = parsed;
  const logger = createLogger({ debug: config.debug });
  logger.info('starting', {
    serverVersion,
    protocolVersion: PROTOCOL_VERSION,
    host: config.host,
    port: config.port,
    enableWs: config.enableWs,
  });

  const store = new AnnotationStore();
  let ws: WsBridge | null = null;

  if (config.enableWs) {
    ws = new WsBridge({
      host: config.host,
      port: config.port,
      serverVersion,
      store,
      logger,
    });
    try {
      await ws.start();
    } catch (err) {
      logger.error('ws failed to start', { error: (err as Error).message });
      process.exit(1);
    }
  } else {
    logger.info('ws disabled (--no-ws)');
  }

  const serverStartedAt = Date.now();
  const mcp = createMcp({
    store,
    ws,
    logger,
    serverVersion,
    protocolVersion: PROTOCOL_VERSION,
    serverStartedAt,
  });

  try {
    await mcp.start();
  } catch (err) {
    logger.error('mcp failed to start', { error: (err as Error).message });
    if (ws) await ws.stop();
    process.exit(1);
  }

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutdown', { signal });
    try {
      await mcp.stop();
    } catch {
      // mcp.stop logs its own errors
    }
    if (ws) {
      try {
        await ws.stop();
      } catch (err) {
        logger.warn('ws stop failed', { error: (err as Error).message });
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
};

main().catch((err) => {
  process.stderr.write(`dompin-server fatal: ${(err as Error).stack ?? String(err)}\n`);
  process.exit(1);
});
