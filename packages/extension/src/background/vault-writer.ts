import type { AnnotationPayload, PinForPage, Session, WrittenFile } from '../common/types.js';
import { annotationFileBase } from '../common/path-sanitize.js';
import { ensureWritable } from './vault.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('vault-writer');

interface IndexEntry {
  ordinal: number;
  id: string;
  createdAt: number;
  selector: string | null;
  region: { width: number; height: number } | null;
  comment: string;
  pageUrl: string;
  pageTitle: string;
}

type DirIterable = AsyncIterable<[string, FileSystemHandle]>;

let writeQueue: Promise<unknown> = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.catch(() => undefined);
  return next;
}

export async function writeAnnotation(
  session: Session,
  payload: AnnotationPayload,
): Promise<{ ordinal: number; files: WrittenFile[] }> {
  return serialize(async () => {
    const dir = await getSessionDir(session, true);
    const ordinal = await nextOrdinal(dir);
    const base = annotationFileBase(ordinal);
    const files: WrittenFile[] = [];

    const viewportName = payload.screenshots.viewport ? `${base}.viewport.png` : null;
    const elementName = payload.screenshots.element ? `${base}.element.png` : null;

    if (viewportName) {
      const bytes = await writeBlob(dir, viewportName, payload.screenshots.viewport);
      files.push({ relativePath: relPath(session, viewportName), bytes });
    }
    if (elementName && payload.screenshots.element) {
      const bytes = await writeBlob(dir, elementName, payload.screenshots.element);
      files.push({ relativePath: relPath(session, elementName), bytes });
    }

    const jsonName = `${base}.json`;
    const jsonStr = serializePayloadJson(session, payload, ordinal, viewportName, elementName);
    const jsonBytes = await writeText(dir, jsonName, jsonStr);
    files.push({ relativePath: relPath(session, jsonName), bytes: jsonBytes });

    const mdName = `${base}.md`;
    const md = renderAnnotationMarkdown(session, payload, ordinal, viewportName, elementName);
    const mdBytes = await writeText(dir, mdName, md);
    files.push({ relativePath: relPath(session, mdName), bytes: mdBytes });

    await regenerateSessionReadmeFromDir(session, dir);
    return { ordinal, files };
  });
}

export async function deleteAnnotation(
  session: Session,
  annotationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return serialize(async () => {
    try {
      const dir = await getSessionDir(session, false);
      const entries = await readSessionIndex(dir);
      const entry = entries.find((e) => e.id === annotationId);
      if (!entry) return { ok: false as const, error: 'Annotation not found' };
      const base = annotationFileBase(entry.ordinal);
      for (const name of [
        `${base}.md`,
        `${base}.json`,
        `${base}.element.png`,
        `${base}.viewport.png`,
      ]) {
        await safeRemove(dir, name);
      }
      await regenerateSessionReadmeFromDir(session, dir);
      return { ok: true as const };
    } catch (e) {
      log.warn('deleteAnnotation', e);
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });
}

export async function editAnnotationComment(
  session: Session,
  annotationId: string,
  newComment: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return serialize(async () => {
    try {
      const dir = await getSessionDir(session, false);
      const entries = await readSessionIndex(dir);
      const entry = entries.find((e) => e.id === annotationId);
      if (!entry) return { ok: false as const, error: 'Annotation not found' };
      const base = annotationFileBase(entry.ordinal);
      const jsonHandle = await dir.getFileHandle(`${base}.json`).catch(() => null);
      if (!jsonHandle) return { ok: false as const, error: 'Annotation JSON missing' };
      const file = await jsonHandle.getFile();
      const text = await file.text();
      const json = JSON.parse(text) as Record<string, unknown>;
      const trimmed = newComment.trim();
      json['comment'] = trimmed;
      const meta = (json['meta'] ?? {}) as Record<string, unknown>;
      meta['editedAt'] = Date.now();
      json['meta'] = meta;
      await writeText(dir, `${base}.json`, JSON.stringify(json, null, 2));

      const screenshots = (json['screenshots'] ?? {}) as Record<string, unknown>;
      const viewportRel = String(screenshots['viewport'] ?? '');
      const elementRel = (screenshots['element'] ?? null) as string | null;
      const viewportFile = viewportRel ? viewportRel.replace(/^\.\//, '') : null;
      const elementFile = elementRel ? String(elementRel).replace(/^\.\//, '') : null;

      const payload = jsonToAnnotationPayload(json);
      const md = renderAnnotationMarkdown(
        session,
        payload,
        entry.ordinal,
        viewportFile,
        elementFile,
      );
      await writeText(dir, `${base}.md`, md);

      await regenerateSessionReadmeFromDir(session, dir);
      return { ok: true as const };
    } catch (e) {
      log.warn('editAnnotationComment', e);
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });
}

export async function regenerateSessionReadme(session: Session): Promise<void> {
  return serialize(async () => {
    const dir = await getSessionDir(session, true);
    await regenerateSessionReadmeFromDir(session, dir);
  });
}

export async function readSessionPins(session: Session): Promise<PinForPage[]> {
  try {
    const dir = await getSessionDir(session, false);
    const entries = await readSessionIndex(dir);
    return entries
      .map<PinForPage>((e) => ({
        id: e.id,
        ordinal: e.ordinal,
        selector: e.selector,
        region:
          e.region != null ? { x: 0, y: 0, width: e.region.width, height: e.region.height } : null,
        commentPreview: previewComment(e.comment),
        createdAt: e.createdAt,
      }))
      .sort((a, b) => a.ordinal - b.ordinal);
  } catch (e) {
    log.debug('readSessionPins fallback to empty', e);
    return [];
  }
}

export async function deleteSessionFolder(session: Session): Promise<void> {
  try {
    const root = await ensureWritable();
    const domainDir = await root.getDirectoryHandle(session.domainFolder);
    await domainDir.removeEntry(session.folder, { recursive: true });
  } catch (e) {
    log.debug('deleteSessionFolder', e);
  }
}

async function regenerateSessionReadmeFromDir(
  session: Session,
  dir: FileSystemDirectoryHandle,
): Promise<void> {
  const entries = await readSessionIndex(dir);
  const md = renderSessionReadme(session, entries);
  await writeText(dir, 'README.md', md);
}

async function getSessionDir(
  session: Session,
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  const root = await ensureWritable();
  const domain = await root.getDirectoryHandle(session.domainFolder, { create });
  return domain.getDirectoryHandle(session.folder, { create });
}

function relPath(session: Session, file: string): string {
  return `${session.domainFolder}/${session.folder}/${file}`;
}

async function nextOrdinal(dir: FileSystemDirectoryHandle): Promise<number> {
  let max = 0;
  for await (const [name] of dir as unknown as DirIterable) {
    const m = /^(\d+)\.json$/.exec(name);
    if (!m) continue;
    const raw = m[1];
    if (raw == null) continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

async function writeBlob(
  dir: FileSystemDirectoryHandle,
  name: string,
  dataUrl: string,
): Promise<number> {
  const blob = await fetch(dataUrl).then((r) => r.blob());
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
    return blob.size;
  } finally {
    await writable.close();
  }
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

async function safeRemove(dir: FileSystemDirectoryHandle, name: string): Promise<void> {
  try {
    await dir.removeEntry(name);
  } catch {
    /* missing file is fine */
  }
}

async function readSessionIndex(dir: FileSystemDirectoryHandle): Promise<IndexEntry[]> {
  const out: IndexEntry[] = [];
  for await (const [name, handle] of dir as unknown as DirIterable) {
    const m = /^(\d+)\.json$/.exec(name);
    if (!m) continue;
    const raw = m[1];
    if (raw == null) continue;
    if (handle.kind !== 'file') continue;
    const ordinal = Number(raw);
    if (!Number.isFinite(ordinal)) continue;
    try {
      const file = await (handle as FileSystemFileHandle).getFile();
      const text = await file.text();
      const json = JSON.parse(text) as unknown;
      out.push(parseIndexEntry(ordinal, json));
    } catch (e) {
      log.warn('readSessionIndex parse failed for', name, e);
    }
  }
  out.sort((a, b) => a.ordinal - b.ordinal);
  return out;
}

function parseIndexEntry(ordinal: number, json: unknown): IndexEntry {
  const j = (json ?? {}) as Record<string, unknown>;
  const meta = (j['meta'] ?? {}) as Record<string, unknown>;
  const page = (j['page'] ?? {}) as Record<string, unknown>;
  const element = (j['element'] ?? null) as Record<string, unknown> | null;
  const region = (j['region'] ?? null) as Record<string, unknown> | null;
  const selector = element ? ((element['selector'] as string | undefined) ?? null) : null;
  let regionInfo: { width: number; height: number } | null = null;
  if (region) {
    const rect = (region['rect'] ?? {}) as Record<string, unknown>;
    regionInfo = {
      width: Number(rect['width']) || 0,
      height: Number(rect['height']) || 0,
    };
  }
  return {
    ordinal,
    id: String(j['id'] ?? meta['annotationId'] ?? ''),
    createdAt: Number(j['createdAt'] ?? meta['writtenAt'] ?? 0),
    selector,
    region: regionInfo,
    comment: String(j['comment'] ?? ''),
    pageUrl: String(page['url'] ?? ''),
    pageTitle: String(page['title'] ?? ''),
  };
}

function jsonToAnnotationPayload(json: Record<string, unknown>): AnnotationPayload {
  const screenshots = (json['screenshots'] ?? {}) as Record<string, unknown>;
  return {
    id: String(json['id'] ?? ''),
    createdAt: Number(json['createdAt'] ?? Date.now()),
    page: (json['page'] ?? {}) as AnnotationPayload['page'],
    element: (json['element'] ?? null) as AnnotationPayload['element'],
    region: (json['region'] ?? null) as AnnotationPayload['region'],
    comment: String(json['comment'] ?? ''),
    voiceTranscript:
      typeof json['voiceTranscript'] === 'string' ? (json['voiceTranscript'] as string) : undefined,
    screenshots: {
      viewport: String(screenshots['viewport'] ?? ''),
      element:
        typeof screenshots['element'] === 'string' ? (screenshots['element'] as string) : null,
    },
    console: Array.isArray(json['console'])
      ? (json['console'] as AnnotationPayload['console'])
      : [],
    network: Array.isArray(json['network'])
      ? (json['network'] as AnnotationPayload['network'])
      : undefined,
  };
}

function previewComment(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 80 ? `${t.slice(0, 77)}...` : t;
}

function serializePayloadJson(
  session: Session,
  payload: AnnotationPayload,
  ordinal: number,
  viewportFile: string | null,
  elementFile: string | null,
): string {
  const meta = {
    sessionId: session.id,
    sessionName: session.name,
    ordinal,
    domain: session.domain,
    writtenAt: Date.now(),
  };
  const trimmed: AnnotationPayload = {
    ...payload,
    screenshots: {
      viewport: viewportFile ? `./${viewportFile}` : '',
      element: elementFile ? `./${elementFile}` : null,
    },
  };
  return JSON.stringify({ meta, ...trimmed }, null, 2);
}

function renderAnnotationMarkdown(
  session: Session,
  payload: AnnotationPayload,
  ordinal: number,
  viewportFile: string | null,
  elementFile: string | null,
): string {
  const ts = new Date(payload.createdAt).toISOString();
  const lines: string[] = [];
  lines.push(`# Annotation ${annotationFileBase(ordinal)} — ${session.name}`);
  lines.push('');
  lines.push(`**When**: ${ts}`);
  lines.push(
    `**Page**: [${escapeMd(payload.page.title || payload.page.url)}](${payload.page.url})`,
  );
  if (payload.element) {
    lines.push(`**Selector**: \`${payload.element.selector}\``);
  } else if (payload.region) {
    const r = payload.region.rect;
    lines.push(`**Selector**: \`region ${Math.round(r.width)}×${Math.round(r.height)}\``);
  }
  lines.push('');
  lines.push('## Comment');
  lines.push('');
  lines.push(payload.comment.trim() || '_(no comment)_');
  lines.push('');
  if (payload.voiceTranscript?.trim()) {
    lines.push('## Voice transcript');
    lines.push('');
    lines.push(payload.voiceTranscript.trim());
    lines.push('');
  }
  appendScreenshotsSection(lines, viewportFile, elementFile);
  if (payload.element) {
    appendElementSection(lines, payload.element);
  } else if (payload.region) {
    appendRegionSection(lines, payload.region.rect);
  }
  if (payload.element?.computedStyles) {
    appendComputedStyles(lines, payload.element.computedStyles);
  }
  appendConsoleSection(lines, payload.console);
  appendNetworkSection(lines, payload.network);
  return lines.join('\n');
}

function appendElementSection(
  lines: string[],
  el: NonNullable<AnnotationPayload['element']>,
): void {
  lines.push('## Element');
  lines.push('');
  const idPart = el.id ? `#${el.id}` : '';
  const classPart = el.classes.length ? `.${el.classes.join('.')}` : '';
  lines.push(`- Tag: \`${el.tag}${idPart}${classPart}\``);
  lines.push(`- XPath: \`${el.xpath}\``);
  const r = el.boundingRect;
  lines.push(
    `- Bounding rect: x=${Math.round(r.x)}, y=${Math.round(r.y)}, w=${Math.round(r.width)}, h=${Math.round(r.height)}`,
  );
  if (el.role) lines.push(`- Role: \`${el.role}\``);
  if (el.ariaLabel) lines.push(`- aria-label: ${el.ariaLabel}`);
  if (el.react?.componentName) lines.push(`- React component: \`${el.react.componentName}\``);
  if (el.react?.ownerChain.length) {
    lines.push(`- React owner chain: \`${el.react.ownerChain.join(' > ')}\``);
  }
  if (el.react?.source) {
    const s = el.react.source;
    lines.push(`- React source: \`${s.fileName}:${s.lineNumber}:${s.columnNumber}\``);
  }
  lines.push('- Outer HTML preview:');
  lines.push('');
  lines.push('```html');
  lines.push(el.outerHTMLPreview);
  lines.push('```');
  lines.push('');
}

function appendRegionSection(
  lines: string[],
  rect: NonNullable<AnnotationPayload['region']>['rect'],
): void {
  lines.push('## Region');
  lines.push('');
  lines.push(
    `- Bounding rect: x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, w=${Math.round(rect.width)}, h=${Math.round(rect.height)}`,
  );
  lines.push('');
}

function appendComputedStyles(
  lines: string[],
  cs: NonNullable<AnnotationPayload['element']>['computedStyles'],
): void {
  const all: Record<string, string> = { ...cs.layout, ...cs.typography, ...cs.box, ...cs.visual };
  const keys = Object.keys(all);
  if (!keys.length) return;
  lines.push('## Computed styles');
  lines.push('');
  for (const key of keys) {
    lines.push(`- \`${key}\`: \`${all[key] ?? ''}\``);
  }
  lines.push('');
}

function appendScreenshotsSection(
  lines: string[],
  viewportFile: string | null,
  elementFile: string | null,
): void {
  if (!viewportFile && !elementFile) return;
  lines.push('## Screenshots');
  lines.push('');
  if (viewportFile) {
    lines.push(`![viewport](./${viewportFile})`);
    lines.push('');
    lines.push('_Viewport with markers, highlight, and element infobox._');
    lines.push('');
  }
  if (elementFile) {
    lines.push(`![element](./${elementFile})`);
    lines.push('');
    lines.push('_Clean crop of the pinned element._');
    lines.push('');
  }
}

function appendConsoleSection(lines: string[], entries: AnnotationPayload['console']): void {
  if (!entries.length) return;
  lines.push(`## Console (last ${entries.length} entries)`);
  lines.push('');
  for (const entry of entries) {
    lines.push(`- \`[${entry.level}] ${truncate(entry.message, 200)}\``);
  }
  lines.push('');
}

function appendNetworkSection(lines: string[], entries: AnnotationPayload['network']): void {
  if (!entries || !entries.length) return;
  lines.push('## Network failures');
  lines.push('');
  for (const n of entries) {
    lines.push(`- \`[${n.method} ${n.status}] ${n.url} (${n.durationMs}ms)\``);
  }
  lines.push('');
}

function renderSessionReadme(session: Session, entries: IndexEntry[]): string {
  const lines: string[] = [];
  const startedAt = new Date(session.startedAt).toISOString();
  const lastWriteAt = entries.length
    ? new Date(Math.max(...entries.map((e) => e.createdAt))).toISOString()
    : '—';
  const pages = uniquePages(entries);

  lines.push(`# ${session.name}`);
  lines.push('');
  lines.push(`- Domain: ${session.domain}`);
  lines.push(`- Started: ${startedAt}`);
  lines.push(`- Last write: ${lastWriteAt}`);
  lines.push(`- Annotations: ${entries.length}`);
  lines.push('');
  if (pages.length) {
    lines.push('## Pages');
    lines.push('');
    for (const p of pages) {
      lines.push(`- ${p.title || p.url} — ${p.url}`);
    }
    lines.push('');
  }
  if (entries.length) {
    lines.push('## Annotations');
    lines.push('');
    lines.push('| # | When | Selector | Comment |');
    lines.push('| - | ---- | -------- | ------- |');
    for (const e of entries) {
      const when = formatHms(e.createdAt);
      const sel = e.selector
        ? '`' + escapeTableCell(e.selector) + '`'
        : e.region
          ? `region ${Math.round(e.region.width)}×${Math.round(e.region.height)}`
          : '—';
      const comment = e.comment ? `"${escapeTableCell(e.comment)}"` : '—';
      lines.push(`| ${annotationFileBase(e.ordinal)} | ${when} | ${sel} | ${comment} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function uniquePages(entries: IndexEntry[]): { url: string; title: string }[] {
  const seen = new Set<string>();
  const out: { url: string; title: string }[] = [];
  for (const e of entries) {
    if (!e.pageUrl || seen.has(e.pageUrl)) continue;
    seen.add(e.pageUrl);
    out.push({ url: e.pageUrl, title: e.pageTitle });
  }
  return out;
}

function formatHms(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function escapeMd(s: string): string {
  return s.replace(/[\[\]]/g, (c) => '\\' + c);
}

function escapeTableCell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 120);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
