import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocket } from 'ws';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = resolve(here, '..', 'dist', 'index.js');

const PORT = 18931;
const WS_URL = `ws://127.0.0.1:${PORT}/dompin`;

const failures = [];
const ok = (label) => console.log(`PASS  ${label}`);
const fail = (label, detail) => {
  failures.push({ label, detail });
  console.log(`FAIL  ${label} -- ${detail}`);
};

const expect = (label, cond, detail = '') => (cond ? ok(label) : fail(label, detail));

const attachQueue = (ws) => {
  const buffer = [];
  const waiters = [];
  ws.on('message', (data) => {
    let parsed;
    try {
      parsed = JSON.parse(data.toString('utf8'));
    } catch (err) {
      parsed = { __parseError: err.message, raw: data.toString('utf8') };
    }
    const w = waiters.shift();
    if (w) w.resolve(parsed);
    else buffer.push(parsed);
  });
  return {
    take: (timeoutMs = 3000) =>
      new Promise((resolveMsg, rejectMsg) => {
        if (buffer.length > 0) {
          resolveMsg(buffer.shift());
          return;
        }
        const entry = {
          resolve: (msg) => {
            clearTimeout(timer);
            resolveMsg(msg);
          },
        };
        const timer = setTimeout(() => {
          const idx = waiters.indexOf(entry);
          if (idx >= 0) waiters.splice(idx, 1);
          rejectMsg(new Error('ws message timeout'));
        }, timeoutMs);
        waiters.push(entry);
      }),
    drain: (n, timeoutMs = 3000) => {
      const out = [];
      const next = async () => {
        const remaining = n - out.length;
        if (remaining <= 0) return out;
        out.push(await self.take(timeoutMs));
        return next();
      };
      const self = { take: (t = timeoutMs) => self.takeOne(t), takeOne: (t = timeoutMs) => null };
      // simple sequential drain
      const run = async () => {
        while (out.length < n) {
          const m = await new Promise((res, rej) => {
            if (buffer.length > 0) {
              res(buffer.shift());
              return;
            }
            const entry = { resolve: res };
            const timer = setTimeout(() => {
              const idx = waiters.indexOf(entry);
              if (idx >= 0) waiters.splice(idx, 1);
              rej(new Error('ws message timeout'));
            }, timeoutMs);
            entry.resolve = (msg) => {
              clearTimeout(timer);
              res(msg);
            };
            waiters.push(entry);
          });
          out.push(m);
        }
        return out;
      };
      return run();
    },
  };
};

const buildAnnotation = (id, comment) => ({
  id,
  createdAt: Date.now(),
  page: {
    url: 'https://example.com/path',
    title: 'Example Page',
    userAgent: 'smoke-test',
    viewport: { width: 1280, height: 800, devicePixelRatio: 2 },
    scroll: { x: 0, y: 0 },
    colorScheme: 'light',
    documentReadyState: 'complete',
  },
  element: {
    selector: '#hero h1',
    xpath: '/html/body/main/section[1]/h1',
    tag: 'h1',
    id: null,
    classes: ['title', 'display-1'],
    role: 'heading',
    ariaLabel: null,
    textPreview: 'Welcome',
    outerHTMLPreview: '<h1 class="title display-1">Welcome</h1>',
    boundingRect: { x: 32, y: 80, width: 600, height: 48 },
    computedStyles: {
      layout: { display: 'block' },
      typography: { fontFamily: 'Inter', fontSize: '40px' },
      box: { padding: '0px' },
      visual: { color: 'rgb(20,20,20)' },
    },
    react: null,
    scrollAncestorSelector: 'body',
  },
  region: null,
  comment,
  screenshots: {
    viewport:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=',
    zoned: null,
  },
  console: [{ level: 'warn', timestamp: Date.now() - 100, message: 'deprecated foo' }],
});

const main = async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverEntry, '--port', String(PORT)],
    env: { ...process.env, DOMPIN_DEBUG: '0' },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'dompin-smoke', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);
  ok('mcp client connected');

  await wait(150);

  const tools = await client.listTools();
  const toolNames = tools.tools.map((t) => t.name).sort();
  const expectedNames = [
    'clear_pinned',
    'consume_annotation',
    'get_annotation',
    'highlight_element',
    'list_pinned_annotations',
    'scroll_to_element',
    'server_status',
  ];
  expect(
    'tools/list returns the 7 expected tools',
    JSON.stringify(toolNames) === JSON.stringify(expectedNames),
    `got ${JSON.stringify(toolNames)}`,
  );

  const status = await client.callTool({ name: 'server_status', arguments: {} });
  expect(
    'server_status before WS client',
    status.structuredContent && status.structuredContent.extensionConnected === false,
    `extensionConnected=${status.structuredContent?.extensionConnected}`,
  );

  const ws = new WebSocket(WS_URL);
  const wsq = attachQueue(ws);
  await new Promise((r) => ws.once('open', r));
  ok('ws connected');

  const initial = await wsq.drain(2);
  expect(
    'welcome on connect',
    initial[0]?.type === 'welcome' && initial[0].protocolVersion === '1.0.0',
    JSON.stringify(initial[0]),
  );
  expect(
    'pendingCountChanged snapshot is 0',
    initial[1]?.type === 'pendingCountChanged' && initial[1].count === 0,
    JSON.stringify(initial[1]),
  );

  ws.send(JSON.stringify({ type: 'hello', protocolVersion: '1.0.0', extensionVersion: '0.0.1' }));
  await wait(80);

  const a = buildAnnotation('ann-1', 'Hero title is too tight on mobile');
  ws.send(JSON.stringify({ type: 'annotation:new', payload: a }));
  const annDrained = await wsq.drain(2);
  const ack = annDrained.find((m) => m.type === 'ack');
  const countAfterAdd = annDrained.find((m) => m.type === 'pendingCountChanged');
  expect('ack on annotation:new', ack && ack.ids[0] === 'ann-1', JSON.stringify(ack));
  expect(
    'pendingCountChanged → 1',
    countAfterAdd && countAfterAdd.count === 1,
    JSON.stringify(countAfterAdd),
  );

  const list = await client.callTool({ name: 'list_pinned_annotations', arguments: {} });
  expect(
    'list_pinned_annotations returns one summary',
    list.structuredContent?.count === 1 &&
      list.structuredContent.annotations[0].id === 'ann-1' &&
      list.structuredContent.annotations[0].selector === '#hero h1',
    JSON.stringify(list.structuredContent),
  );

  const get = await client.callTool({ name: 'get_annotation', arguments: { id: 'ann-1' } });
  const hasImage = Array.isArray(get.content) && get.content.some((c) => c.type === 'image');
  expect(
    'get_annotation returns an image content block',
    hasImage && get.structuredContent?.hasViewportScreenshot === true,
    `content types: ${get.content?.map((c) => c.type).join(',')}`,
  );

  const highlight = await client.callTool({
    name: 'highlight_element',
    arguments: { selector: '#hero h1', durationMs: 1500 },
  });
  expect(
    'highlight_element delivered',
    highlight.structuredContent?.delivered === true,
    JSON.stringify(highlight.structuredContent),
  );
  const highlightWire = await wsq.take();
  expect(
    'extension receives highlight wire message',
    highlightWire.type === 'highlight' &&
      highlightWire.selector === '#hero h1' &&
      highlightWire.durationMs === 1500,
    JSON.stringify(highlightWire),
  );

  const scroll = await client.callTool({
    name: 'scroll_to_element',
    arguments: { selector: '#hero h1', behavior: 'smooth' },
  });
  expect(
    'scroll_to_element delivered',
    scroll.structuredContent?.delivered === true,
    JSON.stringify(scroll.structuredContent),
  );
  const scrollWire = await wsq.take();
  expect(
    'extension receives scrollTo wire message',
    scrollWire.type === 'scrollTo' && scrollWire.behavior === 'smooth',
    JSON.stringify(scrollWire),
  );

  const consume = await client.callTool({
    name: 'consume_annotation',
    arguments: { id: 'ann-1' },
  });
  const countAfterConsume = await wsq.take();
  expect(
    'consume_annotation removes',
    consume.structuredContent?.removed === true && consume.structuredContent.remaining === 0,
    JSON.stringify(consume.structuredContent),
  );
  expect(
    'pendingCountChanged → 0 after consume',
    countAfterConsume.type === 'pendingCountChanged' && countAfterConsume.count === 0,
    JSON.stringify(countAfterConsume),
  );

  const consumeMissing = await client.callTool({
    name: 'consume_annotation',
    arguments: { id: 'never-existed' },
  });
  expect(
    'consume_annotation on unknown id returns removed=false',
    consumeMissing.structuredContent?.removed === false &&
      consumeMissing.structuredContent.reason === 'not_found',
    JSON.stringify(consumeMissing.structuredContent),
  );

  ws.send(JSON.stringify({ type: 'annotation:new', payload: buildAnnotation('ann-2', 'second') }));
  await wsq.drain(2);
  const cleared = await client.callTool({ name: 'clear_pinned', arguments: {} });
  await wsq.take();
  expect(
    'clear_pinned wipes the queue',
    cleared.structuredContent?.cleared === 1,
    JSON.stringify(cleared.structuredContent),
  );

  ws.send('{not valid json');
  const invalidJson = await wsq.take();
  expect(
    'malformed JSON → INVALID_PAYLOAD',
    invalidJson.type === 'error' && invalidJson.code === 'INVALID_PAYLOAD',
    JSON.stringify(invalidJson),
  );

  ws.send(JSON.stringify({ type: 'annotation:new', payload: { wrong: true } }));
  const invalidShape = await wsq.take();
  expect(
    'invalid shape → INVALID_PAYLOAD',
    invalidShape.type === 'error' && invalidShape.code === 'INVALID_PAYLOAD',
    JSON.stringify(invalidShape),
  );

  const ws2 = new WebSocket(WS_URL);
  const ws2q = attachQueue(ws2);
  await new Promise((r) => ws2.once('open', r));
  await ws2q.drain(2);
  const closeReason = new Promise((r) =>
    ws2.once('close', (code, reason) => r({ code, reason: reason.toString('utf8') })),
  );
  ws2.send(JSON.stringify({ type: 'hello', protocolVersion: '99.0.0', extensionVersion: '0.0.1' }));
  const mismatch = await ws2q.take();
  const closed = await closeReason;
  expect(
    'major-version mismatch → PROTOCOL_MISMATCH error and close',
    mismatch.type === 'error' && mismatch.code === 'PROTOCOL_MISMATCH' && closed.code === 1002,
    JSON.stringify({ mismatch, closed }),
  );

  const ws3 = new WebSocket(WS_URL);
  const ws3q = attachQueue(ws3);
  await new Promise((r) => ws3.once('open', r));
  const hello3 = await ws3q.drain(2);
  expect(
    'a fresh client can replace the previous one and gets welcomed',
    hello3[0].type === 'welcome',
    JSON.stringify(hello3[0]),
  );

  const finalStatus = await client.callTool({ name: 'server_status', arguments: {} });
  expect(
    'server_status reflects extension connected after reconnect',
    finalStatus.structuredContent?.extensionConnected === true,
    JSON.stringify(finalStatus.structuredContent),
  );

  ws3.close();
  await wait(50);
  await client.close();

  if (failures.length > 0) {
    console.error(`\n${failures.length} smoke test(s) failed`);
    process.exit(1);
  }
  console.log('\nAll smoke checks passed.');
};

main().catch((err) => {
  console.error('smoke test crashed:', err);
  process.exit(1);
});
