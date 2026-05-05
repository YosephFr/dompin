#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import WebSocket from 'ws';

const SERVER_BIN = process.argv[2] ?? 'packages/server/dist/index.js';
const WS_URL = 'ws://127.0.0.1:8930/dompin';
const TIMEOUT_MS = 10000;

const log = (...args) => console.error('[smoke]', ...args);

const main = async () => {
  log(`spawning server: ${SERVER_BIN}`);
  const proc = spawn('node', [SERVER_BIN], { stdio: ['pipe', 'pipe', 'inherit'] });

  const cleanup = () => {
    if (!proc.killed) proc.kill('SIGTERM');
  };
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });

  await sleep(700);

  log(`connecting WS: ${WS_URL}`);
  const ws = new WebSocket(WS_URL);

  const received = [];
  const sawType = (type) => received.some((m) => m.type === type);
  const waitFor = async (type) => {
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (sawType(type)) return received.find((m) => m.type === type);
      await sleep(80);
    }
    throw new Error(`timeout waiting for ${type}`);
  };

  ws.on('open', () => {
    log('ws open');
    ws.send(
      JSON.stringify({
        type: 'hello',
        protocolVersion: '1.0.0',
        extensionVersion: '0.1.0',
      }),
    );
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      received.push(msg);
      log('<-', msg.type);
    } catch {
      log('<- non-json');
    }
  });

  ws.on('error', (err) => log('ws error', err.message));

  try {
    await waitFor('welcome');

    const id = `smoke-${Date.now()}`;
    ws.send(
      JSON.stringify({
        type: 'annotation:new',
        payload: {
          id,
          createdAt: Date.now(),
          page: {
            url: 'http://localhost/demo',
            title: 'Demo',
            userAgent: 'smoke-test',
            viewport: { width: 1280, height: 800, devicePixelRatio: 1 },
            scroll: { x: 0, y: 0 },
            colorScheme: 'light',
            documentReadyState: 'complete',
          },
          element: {
            selector: '[data-testid="card-1"]',
            xpath: '/html/body/main/section/div[1]/article[1]',
            tag: 'article',
            id: null,
            classes: ['card'],
            role: null,
            ariaLabel: null,
            textPreview: 'Wireless headphones',
            outerHTMLPreview: '<article class="card">…</article>',
            boundingRect: { x: 24, y: 120, width: 240, height: 160 },
            computedStyles: { layout: {}, typography: {}, box: {}, visual: {} },
            react: null,
            scrollAncestorSelector: null,
          },
          region: null,
          comment: 'smoke test',
          screenshots: { viewport: 'data:image/png;base64,iVBORw0KGgo=', zoned: null },
          console: [],
        },
      }),
    );

    const ack = await waitFor('ack');
    if (!ack.ids?.includes(id)) throw new Error('ack did not include payload id');
    log('ack OK');

    log('done');
    ws.close();
    cleanup();
    process.exit(0);
  } catch (err) {
    log('FAIL', err.message);
    ws.close();
    cleanup();
    process.exit(1);
  }
};

main();
