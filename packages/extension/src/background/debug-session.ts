import type {
  DebugClickTarget,
  DebugCaptureStatus,
  DebugContentEvent,
  DebugInputInfo,
  Session,
  WrittenFile,
} from '../common/types.js';
import type { DebugCaptureSettings } from '../common/settings.js';
import { sanitizeSegment } from '../common/path-sanitize.js';
import { createLogger } from '../common/logger.js';
import { ensureWritable } from './vault.js';
import { captureElement as captureElementImage, captureViewport } from './screenshot.js';
import { sendTabCommandWithInject } from './tab-bridge.js';

const log = createLogger('debug-session');

const SCREENSHOT_DELAY_MS = 900;
const SCREENSHOT_MIN_INTERVAL_MS = 1500;
const CLICK_SCREENSHOT_PADDING = 100;
const ACTION_REQUEST_LOOKBACK_MS = 500;
const ACTION_REQUEST_LOOKAHEAD_MS = 8000;
const VIEW_REQUEST_LOOKBACK_MS = 2000;
const VIEW_REQUEST_LOOKAHEAD_MS = 10000;
const BODY_TEXT_LIMIT = 10_000_000;
const REQUEST_POST_DATA_LIMIT = 10_000_000;

type DebuggerTarget = chrome.debugger.Debuggee;

interface DebugRuntimeEvent {
  id: number;
  type: DebugContentEvent['type'];
  timestamp: number;
  elapsedMs: number;
  screenshot: string | null;
  screenshotKind: 'viewport' | 'element' | null;
  relatedRequests: DebugRelatedRequest[];
  page: DebugContentEvent['page'];
  content: DebugContentEvent;
}

interface DebugRelatedRequest {
  id: number;
  file: string;
  method: string;
  url: string;
  status: number | null;
  elapsedMs: number;
  durationMs: number | null;
}

interface DebugRelatedEvent {
  id: number;
  file: string;
  type: DebugContentEvent['type'];
  label: string;
  elapsedMs: number;
}

interface DebugRequestRecord {
  id: number;
  requestId: string;
  startedAt: number;
  elapsedMs: number;
  type: string;
  request: Record<string, unknown>;
  response?: Record<string, unknown>;
  finishedAt?: number;
  durationMs?: number;
  error?: string;
  requestBodyPath?: string;
  responseBodyPath?: string;
  responseBodyError?: string;
  filePath?: string;
  initiatorEvent?: DebugRelatedEvent | null;
}

interface DebugSessionState {
  tabId: number;
  target: DebuggerTarget;
  session: Session;
  settings: DebugCaptureSettings;
  startedAt: number;
  stoppedAt: number | null;
  eventSeq: number;
  requestSeq: number;
  consoleSeq: number;
  networkCount: number;
  consoleCount: number;
  lastError: string | null;
  requests: Map<string, DebugRequestRecord>;
  seenRequestKeys: Set<string>;
  seenViewUrls: Set<string>;
  events: Map<number, DebugRuntimeEvent>;
  completedRequests: DebugRequestRecord[];
  currentPageOrigin: string | null;
  pendingScreenshots: Set<Promise<void>>;
  lastScreenshotAt: number;
  queue: Promise<unknown>;
}

type DirIterable = AsyncIterable<[string, FileSystemHandle]>;

const sessionsByTab = new Map<number, DebugSessionState>();
const lastStatusByTab = new Map<number, DebugCaptureStatus>();
const stopTasksByTab = new Map<number, Promise<DebugCaptureStatus>>();
let debuggerListenerInstalled = false;

export function setupDebugSessions(): void {
  if (debuggerListenerInstalled) return;
  debuggerListenerInstalled = true;
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (typeof source.tabId !== 'number') return;
    const state = sessionsByTab.get(source.tabId);
    if (!state) return;
    void handleDebuggerEvent(state, method, (params ?? {}) as Record<string, unknown>);
  });
  chrome.debugger.onDetach.addListener((source, reason) => {
    if (typeof source.tabId !== 'number') return;
    const state = sessionsByTab.get(source.tabId);
    if (!state) return;
    state.lastError = reason ? `Debugger detached: ${reason}` : 'Debugger detached.';
    void stopDebugSession(source.tabId, state.session.id, false).catch((e) =>
      log.warn('detach stop failed', e),
    );
  });
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    const state = sessionsByTab.get(tabId);
    if (!state) return;
    if (info.status === 'complete') {
      void sendTabCommandWithInject(tabId, {
        kind: 'debug:capture-start',
        startedAt: state.startedAt,
      });
    }
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    const state = sessionsByTab.get(tabId);
    if (!state) return;
    void stopDebugSession(tabId, state.session.id, false).catch((e) =>
      log.warn('tab removed stop failed', e),
    );
  });
}

export async function startDebugSession(
  tabId: number,
  session: Session,
  settings: DebugCaptureSettings,
): Promise<DebugCaptureStatus> {
  const existing = sessionsByTab.get(tabId);
  if (existing) {
    if (existing.session.id === session.id) return statusFor(existing);
    await stopDebugSession(tabId, existing.session.id, true);
  }
  const stopping = stopTasksByTab.get(tabId);
  if (stopping) await stopping;
  lastStatusByTab.delete(tabId);

  const target = { tabId };
  await attachDebuggerWithRecovery(target);
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const state: DebugSessionState = {
    tabId,
    target,
    session,
    settings,
    startedAt: Date.now(),
    stoppedAt: null,
    eventSeq: 0,
    requestSeq: 0,
    consoleSeq: 0,
    networkCount: 0,
    consoleCount: 0,
    lastError: null,
    requests: new Map(),
    seenRequestKeys: new Set(),
    seenViewUrls: new Set(),
    events: new Map(),
    completedRequests: [],
    currentPageOrigin: safeOrigin(tab?.url),
    pendingScreenshots: new Set(),
    lastScreenshotAt: 0,
    queue: Promise.resolve(),
  };
  sessionsByTab.set(tabId, state);
  try {
    await ensureDebugScaffold(state);
    const commands: Array<Promise<unknown>> = [
      sendDebuggerCommand(target, 'Network.enable', {
        maxPostDataSize: REQUEST_POST_DATA_LIMIT,
      }),
      sendDebuggerCommand(target, 'Page.enable'),
    ];
    if (settings.captureConsole) {
      commands.push(
        sendDebuggerCommand(target, 'Runtime.enable'),
        sendDebuggerCommand(target, 'Log.enable'),
      );
    }
    await Promise.all(commands);
  } catch (e) {
    sessionsByTab.delete(tabId);
    await detachDebugger(target).catch(() => undefined);
    throw e;
  }

  await sendTabCommandWithInject(tabId, {
    kind: 'debug:capture-start',
    startedAt: state.startedAt,
  });
  await writeSessionSummary(state);
  return statusFor(state);
}

export async function stopDebugSession(
  tabId: number,
  sessionId: string,
  detach = true,
): Promise<DebugCaptureStatus> {
  const runningStop = stopTasksByTab.get(tabId);
  if (runningStop) return runningStop;
  const state = sessionsByTab.get(tabId);
  if (!state || state.session.id !== sessionId) return inactiveStatus();
  const task = doStopDebugSession(state, detach);
  stopTasksByTab.set(tabId, task);
  try {
    return await task;
  } finally {
    stopTasksByTab.delete(tabId);
  }
}

async function doStopDebugSession(
  state: DebugSessionState,
  detach: boolean,
): Promise<DebugCaptureStatus> {
  state.stoppedAt = Date.now();
  sessionsByTab.delete(state.tabId);
  try {
    await sendTabCommandWithInject(state.tabId, { kind: 'debug:capture-stop' }).catch(() => false);
    await Promise.allSettled(Array.from(state.pendingScreenshots));
    await serialize(state, async () => {
      await writeOpenRequests(state);
      await rewriteDebugEvents(state);
      await rewriteNetworkRecords(state);
      await writeSessionSummary(state);
      await writeDebugReadme(state);
    });
  } catch (e) {
    state.lastError = e instanceof Error ? e.message : String(e);
  } finally {
    if (detach) await detachDebugger(state.target).catch(() => undefined);
  }
  const status = statusFor(state);
  lastStatusByTab.set(state.tabId, status);
  return status;
}

export function getDebugStatus(tabId?: number): DebugCaptureStatus {
  if (typeof tabId === 'number') {
    const state = sessionsByTab.get(tabId);
    return state ? statusFor(state) : (lastStatusByTab.get(tabId) ?? inactiveStatus());
  }
  const state = sessionsByTab.values().next().value as DebugSessionState | undefined;
  return state ? statusFor(state) : inactiveStatus();
}

export function setDebugLastError(tabId: number, message: string): void {
  const state = sessionsByTab.get(tabId);
  if (state) {
    state.lastError = message;
    return;
  }
  const current = lastStatusByTab.get(tabId) ?? inactiveStatus();
  lastStatusByTab.set(tabId, { ...current, lastError: message });
}

export async function recordDebugContentEvent(
  tabId: number,
  event: DebugContentEvent,
): Promise<DebugCaptureStatus> {
  const state = sessionsByTab.get(tabId);
  if (!state) return inactiveStatus();
  state.currentPageOrigin = safeOrigin(event.page.url) ?? state.currentPageOrigin;
  if (event.type === 'view' && state.settings.mode === 'soft') {
    if (state.seenViewUrls.has(event.page.url)) return statusFor(state);
    state.seenViewUrls.add(event.page.url);
  }
  const id = state.eventSeq + 1;
  state.eventSeq = id;
  const item: DebugRuntimeEvent = {
    id,
    type: event.type,
    timestamp: event.timestamp,
    elapsedMs: Math.max(0, event.timestamp - state.startedAt),
    screenshot: null,
    screenshotKind: null,
    relatedRequests: [],
    page: event.page,
    content: event,
  };
  state.events.set(item.id, item);
  await serialize(state, async () => {
    await writeDebugEvent(state, item);
    await writeSessionSummary(state);
  });
  if (state.settings.captureScreenshots) {
    const screenshotJob = completeDebugEventScreenshot(state, item);
    state.pendingScreenshots.add(screenshotJob);
    void screenshotJob.finally(() => state.pendingScreenshots.delete(screenshotJob));
  }
  return statusFor(state);
}

async function completeDebugEventScreenshot(
  state: DebugSessionState,
  item: DebugRuntimeEvent,
): Promise<void> {
  await delay(SCREENSHOT_DELAY_MS);
  const now = Date.now();
  if (now - state.lastScreenshotAt < SCREENSHOT_MIN_INTERVAL_MS) {
    await serialize(state, async () => {
      await writeDebugEvent(state, item);
      await writeSessionSummary(state);
    });
    return;
  }
  state.lastScreenshotAt = now;
  item.screenshot = await captureDebugScreenshot(state, item).catch((e) => {
    const message = e instanceof Error ? e.message : String(e);
    state.lastError = message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')
      ? 'Screenshot skipped: Chrome captureVisibleTab quota reached.'
      : message;
    return null;
  });
  await serialize(state, async () => {
    await writeDebugEvent(state, item);
    await writeSessionSummary(state);
  });
}

async function handleDebuggerEvent(
  state: DebugSessionState,
  method: string,
  params: Record<string, unknown>,
): Promise<void> {
  try {
    if (method === 'Network.requestWillBeSent') {
      await handleRequestWillBeSent(state, params);
    } else if (method === 'Network.responseReceived') {
      await handleResponseReceived(state, params);
    } else if (method === 'Network.loadingFinished') {
      await handleLoadingFinished(state, params);
    } else if (method === 'Network.loadingFailed') {
      await handleLoadingFailed(state, params);
    } else if (state.settings.captureConsole && method === 'Runtime.consoleAPICalled') {
      await handleConsoleCalled(state, params);
    } else if (state.settings.captureConsole && method === 'Runtime.exceptionThrown') {
      await handleExceptionThrown(state, params);
    } else if (state.settings.captureConsole && method === 'Log.entryAdded') {
      await handleLogEntry(state, params);
    }
  } catch (e) {
    state.lastError = e instanceof Error ? e.message : String(e);
    log.warn('debugger event failed', method, e);
  }
}

async function handleRequestWillBeSent(
  state: DebugSessionState,
  params: Record<string, unknown>,
): Promise<void> {
  const requestId = stringValue(params['requestId']);
  if (!requestId) return;
  const request = objectValue(params['request']);
  const requestUrl = stringValue(request['url']);
  const method = stringValue(request['method']) || 'GET';
  const startedAt = Number(params['wallTime'])
    ? Math.round(Number(params['wallTime']) * 1000)
    : Date.now();
  const record: DebugRequestRecord = {
    id: state.requestSeq + 1,
    requestId,
    startedAt,
    elapsedMs: Math.max(0, startedAt - state.startedAt),
    type: stringValue(params['type']) || 'Other',
    request: {
      url: requestUrl,
      method,
      headers: request['headers'] ?? {},
      hasPostData: Boolean(request['hasPostData']),
      mixedContentType: request['mixedContentType'] ?? null,
      initiator: params['initiator'] ?? null,
      documentURL: stringValue(params['documentURL']),
    },
  };
  if (!shouldTrackNetworkRecord(state, record)) return;
  const requestKey = `${method.toUpperCase()} ${requestUrl}`;
  if (state.settings.dedupeRequests && state.seenRequestKeys.has(requestKey)) return;
  state.seenRequestKeys.add(requestKey);
  state.requestSeq = record.id;
  state.requests.set(requestId, record);
  await persistRequestPostData(state, record, stringValue(request['postData']));
  await serialize(state, () => writeNetworkRecord(state, record));
}

async function handleResponseReceived(
  state: DebugSessionState,
  params: Record<string, unknown>,
): Promise<void> {
  const record = requestRecord(state, params['requestId']);
  if (!record) return;
  const response = objectValue(params['response']);
  record.response = {
    url: stringValue(response['url']),
    status: Number(response['status']) || 0,
    statusText: stringValue(response['statusText']),
    headers: response['headers'] ?? {},
    mimeType: stringValue(response['mimeType']),
    remoteIPAddress: response['remoteIPAddress'] ?? null,
    remotePort: response['remotePort'] ?? null,
    protocol: response['protocol'] ?? null,
    fromDiskCache: Boolean(response['fromDiskCache']),
    fromServiceWorker: Boolean(response['fromServiceWorker']),
    timing: response['timing'] ?? null,
  };
  await serialize(state, () => writeNetworkRecord(state, record));
}

async function handleLoadingFinished(
  state: DebugSessionState,
  params: Record<string, unknown>,
): Promise<void> {
  const record = requestRecord(state, params['requestId']);
  if (!record) return;
  record.finishedAt = Date.now();
  record.durationMs = Math.max(0, record.finishedAt - record.startedAt);
  await persistResponseBody(state, record);
  state.networkCount += 1;
  state.requests.delete(record.requestId);
  state.completedRequests.push(record);
  await serialize(state, async () => {
    await writeNetworkRecord(state, record);
    await writeSessionSummary(state);
  });
}

async function handleLoadingFailed(
  state: DebugSessionState,
  params: Record<string, unknown>,
): Promise<void> {
  const record = requestRecord(state, params['requestId']);
  if (!record) return;
  record.finishedAt = Date.now();
  record.durationMs = Math.max(0, record.finishedAt - record.startedAt);
  record.error = stringValue(params['errorText']) || 'Network loading failed.';
  state.networkCount += 1;
  state.requests.delete(record.requestId);
  state.completedRequests.push(record);
  await serialize(state, async () => {
    await writeNetworkRecord(state, record);
    await writeSessionSummary(state);
  });
}

async function handleConsoleCalled(
  state: DebugSessionState,
  params: Record<string, unknown>,
): Promise<void> {
  const entry = {
    type: stringValue(params['type']) || 'log',
    timestamp: Number(params['timestamp']) || Date.now(),
    elapsedMs: Math.max(0, (Number(params['timestamp']) || Date.now()) - state.startedAt),
    args: Array.isArray(params['args'])
      ? params['args'].map((arg) => serializeRemoteObject(arg))
      : [],
    stackTrace: params['stackTrace'] ?? null,
  };
  await writeConsoleItem(state, entry);
}

async function handleExceptionThrown(
  state: DebugSessionState,
  params: Record<string, unknown>,
): Promise<void> {
  const details = objectValue(params['exceptionDetails']);
  const entry = {
    type: 'exception',
    timestamp: Date.now(),
    elapsedMs: Math.max(0, Date.now() - state.startedAt),
    text: stringValue(details['text']),
    url: stringValue(details['url']),
    lineNumber: details['lineNumber'] ?? null,
    columnNumber: details['columnNumber'] ?? null,
    exception: serializeRemoteObject(details['exception']),
    stackTrace: details['stackTrace'] ?? null,
  };
  await writeConsoleItem(state, entry);
}

async function handleLogEntry(
  state: DebugSessionState,
  params: Record<string, unknown>,
): Promise<void> {
  const entry = objectValue(params['entry']);
  await writeConsoleItem(state, {
    type: stringValue(entry['level']) || 'log',
    timestamp: Number(entry['timestamp']) || Date.now(),
    elapsedMs: Math.max(0, (Number(entry['timestamp']) || Date.now()) - state.startedAt),
    source: entry['source'] ?? null,
    text: stringValue(entry['text']),
    url: stringValue(entry['url']),
    lineNumber: entry['lineNumber'] ?? null,
  });
}

async function writeConsoleItem(state: DebugSessionState, item: Record<string, unknown>) {
  state.consoleSeq += 1;
  state.consoleCount += 1;
  const seq = state.consoleSeq;
  await serialize(state, async () => {
    const dirs = await getDebugDirs(state.session);
    await writeJson(dirs.console, `${seqName(seq)}.json`, {
      id: seq,
      sessionId: state.session.id,
      ...item,
    });
    await writeSessionSummary(state);
  });
}

async function persistRequestPostData(
  state: DebugSessionState,
  record: DebugRequestRecord,
  postData: string,
): Promise<void> {
  if (!postData) return;
  const body = limitText(postData, REQUEST_POST_DATA_LIMIT);
  const dirs = await getDebugDirs(state.session);
  const name = `${networkFileBase(record)}.request.txt`;
  await writeText(dirs.network, name, body.text);
  record.requestBodyPath = `./network/${name}`;
  if (body.truncated) record.request['postDataTruncated'] = true;
}

async function persistResponseBody(
  state: DebugSessionState,
  record: DebugRequestRecord,
): Promise<void> {
  if (!record.response) return;
  try {
    const body = (await sendDebuggerCommand(state.target, 'Network.getResponseBody', {
      requestId: record.requestId,
    })) as { body?: unknown; base64Encoded?: unknown };
    const raw = stringValue(body.body);
    if (!raw) return;
    const limited = limitText(raw, BODY_TEXT_LIMIT);
    const dirs = await getDebugDirs(state.session);
    const name = `${networkFileBase(record)}.response.${body.base64Encoded ? 'base64' : 'txt'}`;
    await writeText(dirs.network, name, limited.text);
    record.responseBodyPath = `./network/${name}`;
    record.response['bodyBase64Encoded'] = Boolean(body.base64Encoded);
    if (limited.truncated) record.response['bodyTruncated'] = true;
  } catch (e) {
    record.responseBodyError = e instanceof Error ? e.message : String(e);
  }
}

async function writeOpenRequests(state: DebugSessionState): Promise<void> {
  for (const record of state.requests.values()) {
    record.finishedAt = Date.now();
    record.durationMs = Math.max(0, record.finishedAt - record.startedAt);
    record.error = record.error ?? 'Still in flight when debug capture stopped.';
    state.completedRequests.push(record);
    await writeNetworkRecord(state, record);
  }
  state.requests.clear();
}

async function captureDebugScreenshot(
  state: DebugSessionState,
  item: DebugRuntimeEvent,
): Promise<string> {
  const target = debugEventTarget(item.content);
  const dataUrl = target
    ? await captureElementImage(
        state.tabId,
        target.boundingRect,
        item.page.viewport.devicePixelRatio,
        CLICK_SCREENSHOT_PADDING,
      )
    : await captureViewport(state.tabId);
  const dirs = await getDebugDirs(state.session);
  const name = `${seqName(item.id)}-${item.type}.png`;
  await writeDataUrl(dirs.screenshots, name, dataUrl);
  item.screenshotKind = target ? 'element' : 'viewport';
  return `./screenshots/${name}`;
}

async function writeDebugEvent(state: DebugSessionState, item: DebugRuntimeEvent): Promise<void> {
  const dirs = await getDebugDirs(state.session);
  item.relatedRequests = relatedRequestsForEvent(state, item);
  await writeJson(dirs.events, `${seqName(item.id)}-${item.type}.json`, {
    sessionId: state.session.id,
    sessionName: state.session.name,
    ...item,
  });
}

async function writeNetworkRecord(
  state: DebugSessionState,
  record: DebugRequestRecord,
): Promise<void> {
  const dirs = await getDebugDirs(state.session);
  const name = `${networkFileBase(record)}.json`;
  record.filePath = `./network/${name}`;
  record.initiatorEvent = initiatorEventForRequest(state, record);
  await writeJson(dirs.network, name, {
    sessionId: state.session.id,
    sessionName: state.session.name,
    ...record,
  });
}

async function writeSessionSummary(state: DebugSessionState): Promise<void> {
  const dirs = await getDebugDirs(state.session);
  await writeJson(dirs.root, 'session.json', {
    schemaVersion: 1,
    sessionId: state.session.id,
    sessionName: state.session.name,
    domain: state.session.domain,
    startedAt: state.startedAt,
    stoppedAt: state.stoppedAt,
    active: sessionsByTab.get(state.tabId) === state,
    elapsedMs: Math.max(0, (state.stoppedAt ?? Date.now()) - state.startedAt),
    counts: {
      events: state.eventSeq,
      network: state.networkCount,
      console: state.consoleCount,
      inFlightRequests: state.requests.size,
    },
    capture: state.settings,
    paths: {
      events: './events/',
      screenshots: './screenshots/',
      network: './network/',
      console: './console/',
    },
    lastError: state.lastError,
  });
}

async function writeDebugReadme(state: DebugSessionState): Promise<void> {
  const dirs = await getDebugDirs(state.session);
  const events = Array.from(state.events.values()).sort((a, b) => a.timestamp - b.timestamp);
  const requests = [...state.completedRequests].sort((a, b) => a.startedAt - b.startedAt);
  const lines: string[] = [];
  lines.push(`# Debug capture - ${state.session.name}`);
  lines.push('');
  lines.push(`- Started: ${new Date(state.startedAt).toISOString()}`);
  if (state.stoppedAt) lines.push(`- Stopped: ${new Date(state.stoppedAt).toISOString()}`);
  lines.push(`- Duration: ${formatDuration((state.stoppedAt ?? Date.now()) - state.startedAt)}`);
  lines.push(`- Mode: ${state.settings.mode}`);
  lines.push(`- Console capture: ${state.settings.captureConsole ? 'enabled' : 'disabled'}`);
  lines.push(`- Screenshot capture: ${state.settings.captureScreenshots ? 'enabled' : 'disabled'}`);
  lines.push(
    `- Duplicate request filter: ${state.settings.dedupeRequests ? 'enabled' : 'disabled'}`,
  );
  lines.push(`- Action events: ${state.eventSeq}`);
  lines.push(`- Completed network requests: ${state.networkCount}`);
  lines.push(`- Console entries: ${state.consoleCount}`);
  if (state.lastError) lines.push(`- Last error: ${state.lastError}`);
  lines.push('');
  lines.push('## Files');
  lines.push('');
  lines.push('- [Session summary](./session.json)');
  lines.push('- [Events](./events/)');
  if (state.settings.captureScreenshots) lines.push('- [Screenshots](./screenshots/)');
  lines.push('- [Network](./network/)');
  lines.push('- [Console](./console/)');
  if (events.length) {
    lines.push('');
    lines.push('## Timeline');
    lines.push('');
    for (const item of events) {
      const eventFile = `./events/${seqName(item.id)}-${item.type}.json`;
      const screenshot = item.screenshot
        ? ` · [${item.screenshotKind === 'element' ? 'element crop' : 'viewport'}](${item.screenshot})`
        : '';
      lines.push(
        `- ${formatClock(item.elapsedMs)} · ${actionLabel(item)} · [event](${eventFile})${screenshot}`,
      );
      lines.push(`  Page: ${item.page.title || '(untitled)'} · ${item.page.url}`);
      if (item.relatedRequests.length) {
        lines.push(
          `  Related network: ${item.relatedRequests.map((r) => requestLink(r)).join(' · ')}`,
        );
      } else {
        lines.push('  Related network: none captured in the event window.');
      }
    }
  }
  if (requests.length) {
    lines.push('');
    lines.push('## Network requests');
    lines.push('');
    for (const record of requests) {
      lines.push(`- ${requestSummary(record)}`);
    }
  }
  if (!state.settings.captureConsole) {
    lines.push('');
    lines.push('## Console');
    lines.push('');
    lines.push('Console capture was disabled for this session.');
  }
  lines.push('');
  await writeText(dirs.root, 'README.md', lines.join('\n'));
}

async function rewriteDebugEvents(state: DebugSessionState): Promise<void> {
  for (const item of state.events.values()) {
    await writeDebugEvent(state, item);
  }
}

async function rewriteNetworkRecords(state: DebugSessionState): Promise<void> {
  for (const record of state.completedRequests) {
    await writeNetworkRecord(state, record);
  }
}

async function ensureDebugScaffold(state: DebugSessionState): Promise<void> {
  const dirs = await getDebugDirs(state.session);
  await clearDirectory(dirs.root);
  await getDebugDirs(state.session);
  await writeDebugReadme(state);
}

async function getDebugDirs(session: Session): Promise<{
  root: FileSystemDirectoryHandle;
  events: FileSystemDirectoryHandle;
  screenshots: FileSystemDirectoryHandle;
  network: FileSystemDirectoryHandle;
  console: FileSystemDirectoryHandle;
}> {
  const root = await ensureWritable();
  const domain = await root.getDirectoryHandle(session.domainFolder, { create: true });
  const sessionDir = await domain.getDirectoryHandle(session.folder, { create: true });
  const debug = await sessionDir.getDirectoryHandle('debug', { create: true });
  return {
    root: debug,
    events: await debug.getDirectoryHandle('events', { create: true }),
    screenshots: await debug.getDirectoryHandle('screenshots', { create: true }),
    network: await debug.getDirectoryHandle('network', { create: true }),
    console: await debug.getDirectoryHandle('console', { create: true }),
  };
}

async function clearDirectory(dir: FileSystemDirectoryHandle): Promise<void> {
  for await (const [name] of dir as unknown as DirIterable) {
    await dir.removeEntry(name, { recursive: true });
  }
}

function statusFor(state: DebugSessionState): DebugCaptureStatus {
  return {
    active: sessionsByTab.get(state.tabId) === state,
    sessionId: state.session.id,
    startedAt: state.startedAt,
    elapsedMs: Math.max(0, (state.stoppedAt ?? Date.now()) - state.startedAt),
    eventCount: state.eventSeq,
    networkCount: state.networkCount,
    consoleCount: state.consoleCount,
    lastError: state.lastError,
  };
}

function inactiveStatus(): DebugCaptureStatus {
  return {
    active: false,
    sessionId: null,
    startedAt: null,
    elapsedMs: 0,
    eventCount: 0,
    networkCount: 0,
    consoleCount: 0,
    lastError: null,
  };
}

function attachDebugger(target: DebuggerTarget): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, '1.3', () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message ?? 'Could not attach debugger.'));
      else resolve();
    });
  });
}

async function attachDebuggerWithRecovery(target: DebuggerTarget): Promise<void> {
  try {
    await attachDebugger(target);
    return;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!message.includes('Another debugger is already attached')) throw e;
    await detachDebugger(target).catch(() => undefined);
    await delay(150);
    await attachDebugger(target);
  }
}

function detachDebugger(target: DebuggerTarget): Promise<void> {
  return new Promise((resolve) => {
    chrome.debugger.detach(target, () => resolve());
  });
}

function sendDebuggerCommand(
  target: DebuggerTarget,
  method: string,
  commandParams?: Record<string, unknown>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, commandParams, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message ?? `${method} failed.`));
      else resolve(result);
    });
  });
}

function serialize<T>(state: DebugSessionState, fn: () => Promise<T>): Promise<T> {
  const next = state.queue.then(fn, fn);
  state.queue = next.catch(() => undefined);
  return next;
}

async function writeJson(
  dir: FileSystemDirectoryHandle,
  name: string,
  value: unknown,
): Promise<number> {
  return writeText(dir, name, JSON.stringify(value, null, 2));
}

async function writeText(
  dir: FileSystemDirectoryHandle,
  name: string,
  text: string,
): Promise<number> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
    return new Blob([text]).size;
  } finally {
    await writable.close();
  }
}

async function writeDataUrl(
  dir: FileSystemDirectoryHandle,
  name: string,
  dataUrl: string,
): Promise<WrittenFile> {
  const blob = await fetch(dataUrl).then((r) => r.blob());
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
  return { relativePath: name, bytes: blob.size };
}

function requestRecord(state: DebugSessionState, requestId: unknown): DebugRequestRecord | null {
  const id = stringValue(requestId);
  return id ? (state.requests.get(id) ?? null) : null;
}

function shouldTrackNetworkRecord(state: DebugSessionState, record: DebugRequestRecord): boolean {
  if (state.settings.mode === 'aggressive') return true;
  const url = String(record.request['url'] ?? '');
  const method = String(record.request['method'] ?? 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return false;
  const requestOrigin = safeOrigin(url);
  if (!requestOrigin) return false;
  const documentOrigin = safeOrigin(String(record.request['documentURL'] ?? ''));
  const sourceOrigin = documentOrigin ?? state.currentPageOrigin;
  if (!sourceOrigin || requestOrigin === sourceOrigin) return false;
  const type = String(record.type || '').toLowerCase();
  if (['image', 'stylesheet', 'font', 'media', 'script'].includes(type)) return false;
  return true;
}

function relatedRequestsForEvent(
  state: DebugSessionState,
  item: DebugRuntimeEvent,
): DebugRelatedRequest[] {
  const startsAt =
    item.type === 'view'
      ? item.timestamp - VIEW_REQUEST_LOOKBACK_MS
      : item.timestamp - ACTION_REQUEST_LOOKBACK_MS;
  const endsAt =
    item.type === 'view'
      ? item.timestamp + VIEW_REQUEST_LOOKAHEAD_MS
      : item.timestamp + ACTION_REQUEST_LOOKAHEAD_MS;
  return state.completedRequests
    .filter((record) => record.startedAt >= startsAt && record.startedAt <= endsAt)
    .slice(0, 12)
    .map((record) => ({
      id: record.id,
      file: record.filePath ?? `./network/${networkFileBase(record)}.json`,
      method: String(record.request['method'] ?? 'GET'),
      url: String(record.request['url'] ?? ''),
      status: typeof record.response?.['status'] === 'number' ? record.response['status'] : null,
      elapsedMs: record.elapsedMs,
      durationMs: typeof record.durationMs === 'number' ? record.durationMs : null,
    }));
}

function initiatorEventForRequest(
  state: DebugSessionState,
  record: DebugRequestRecord,
): DebugRelatedEvent | null {
  let best: DebugRuntimeEvent | null = null;
  for (const item of state.events.values()) {
    const startsAt =
      item.type === 'view'
        ? item.timestamp - VIEW_REQUEST_LOOKBACK_MS
        : item.timestamp - ACTION_REQUEST_LOOKBACK_MS;
    const endsAt =
      item.type === 'view'
        ? item.timestamp + VIEW_REQUEST_LOOKAHEAD_MS
        : item.timestamp + ACTION_REQUEST_LOOKAHEAD_MS;
    if (record.startedAt < startsAt || record.startedAt > endsAt) continue;
    if (!best || item.timestamp > best.timestamp) best = item;
  }
  return best
    ? {
        id: best.id,
        file: eventFile(best),
        type: best.type,
        label: actionLabel(best),
        elapsedMs: best.elapsedMs,
      }
    : null;
}

function eventFile(item: DebugRuntimeEvent): string {
  return `./events/${seqName(item.id)}-${item.type}.json`;
}

function actionLabel(item: DebugRuntimeEvent): string {
  if (item.content.type === 'view') return `view ${item.content.trigger}`;
  const target = targetPreview(debugEventTarget(item.content));
  if (item.content.type === 'click') return `click · ${target}`;
  const input = item.content.input ? ` · ${inputLabel(item.content.input)}` : '';
  return `${item.content.type}${input} · ${target}`;
}

function inputLabel(input: DebugInputInfo): string {
  const parts = [
    input.inputType,
    typeof input.valueLength === 'number' ? `${input.valueLength} chars` : null,
    typeof input.checked === 'boolean' ? `checked=${input.checked}` : null,
    typeof input.selectedIndex === 'number' ? `selected=${input.selectedIndex}` : null,
    input.selectedTextPreview ? `"${input.selectedTextPreview}"` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function debugEventTarget(event: DebugContentEvent): DebugClickTarget | null {
  return event.type === 'view' ? null : event.target;
}

function requestLink(request: DebugRelatedRequest): string {
  const status = request.status == null ? 'pending' : String(request.status);
  return `[${request.method.toUpperCase()} ${status} ${shortUrl(request.url)}](${request.file})`;
}

function requestSummary(record: DebugRequestRecord): string {
  const file = record.filePath ?? `./network/${networkFileBase(record)}.json`;
  const method = String(record.request['method'] ?? 'GET').toUpperCase();
  const url = String(record.request['url'] ?? '');
  const status = typeof record.response?.['status'] === 'number' ? record.response['status'] : null;
  const parts = [
    `${formatClock(record.elapsedMs)} · [${method} ${status ?? 'pending'} ${shortUrl(url)}](${file})`,
  ];
  if (typeof record.durationMs === 'number') parts.push(`${record.durationMs}ms`);
  if (record.requestBodyPath) parts.push(`[request body](${record.requestBodyPath})`);
  if (record.responseBodyPath) parts.push(`[response body](${record.responseBodyPath})`);
  if (record.initiatorEvent) {
    parts.push(`action: [${record.initiatorEvent.label}](${record.initiatorEvent.file})`);
  }
  if (record.error) parts.push(`error: ${record.error}`);
  return parts.join(' · ');
}

function targetPreview(target: DebugClickTarget | null): string {
  if (!target) return '(no target)';
  const bits = [
    target.selector,
    target.textPreview ? `"${target.textPreview}"` : null,
    target.role ? `role=${target.role}` : null,
    target.ariaLabel ? `aria=${target.ariaLabel}` : null,
  ].filter(Boolean);
  return bits.join(' · ') || target.tag;
}

function safeOrigin(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const text = `${u.host}${u.pathname}${u.search}`;
    return text.length > 92 ? text.slice(0, 89) + '...' : text;
  } catch {
    return url.length > 92 ? url.slice(0, 89) + '...' : url;
  }
}

function formatClock(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = clamped % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
    millis,
  ).padStart(3, '0')}`;
}

function serializeRemoteObject(value: unknown): unknown {
  const obj = objectValue(value);
  if ('value' in obj) return obj['value'];
  if (typeof obj['description'] === 'string') return obj['description'];
  if (typeof obj['unserializableValue'] === 'string') return obj['unserializableValue'];
  if (typeof obj['type'] === 'string') return `[${obj['type']}]`;
  return value ?? null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function limitText(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

function networkFileBase(record: DebugRequestRecord): string {
  const method = String(record.request['method'] ?? 'GET').toLowerCase();
  const url = String(record.request['url'] ?? 'request');
  const name = sanitizeSegment(url.replace(/^https?:\/\//, ''), 'request').slice(0, 60);
  return `${seqName(record.id)}-${method}-${name}`;
}

function seqName(id: number): string {
  return String(id).padStart(4, '0');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}
