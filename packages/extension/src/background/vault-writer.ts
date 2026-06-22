import type { AnnotationPayload, PinForPage, Session, WrittenFile } from '../common/types.js';
import { annotationFileBase, sanitizeSegment } from '../common/path-sanitize.js';
import { ensureWritable } from './vault.js';
import { createLogger } from '../common/logger.js';

const log = createLogger('vault-writer');

interface IndexEntry {
  ordinal: number;
  id: string;
  createdAt: number;
  selector: string | null;
  /** Region rect in page/document coordinates (rect at capture + scroll). */
  region: { x: number; y: number; width: number; height: number } | null;
  comment: string;
  voiceTranscript?: string;
  attachments?: AnnotationPayload['attachments'];
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

    const attachmentResult = await writeAttachments(dir, session, base, payload);
    const payloadWithAttachments = attachmentResult.payload;
    files.push(...attachmentResult.files);

    const jsonName = `${base}.json`;
    const jsonStr = serializePayloadJson(
      session,
      payloadWithAttachments,
      ordinal,
      viewportName,
      elementName,
    );
    const jsonBytes = await writeText(dir, jsonName, jsonStr);
    files.push({ relativePath: relPath(session, jsonName), bytes: jsonBytes });

    const mdName = `${base}.md`;
    const md = renderAnnotationMarkdown(
      session,
      payloadWithAttachments,
      ordinal,
      viewportName,
      elementName,
    );
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
      await safeRemove(dir, `${base}.attachments`, true);
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
  return updateAnnotation(session, annotationId, {
    comment: newComment,
    voiceTranscript: undefined,
    attachments: undefined,
  });
}

export async function updateAnnotation(
  session: Session,
  annotationId: string,
  input: {
    comment: string;
    voiceTranscript?: string | null;
    attachments?: AnnotationPayload['attachments'];
  },
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
      const trimmed = input.comment.trim();
      const previousAttachments = Array.isArray(json['attachments'])
        ? (json['attachments'] as NonNullable<AnnotationPayload['attachments']>)
        : [];
      json['comment'] = trimmed;
      if (input.voiceTranscript !== undefined) {
        if (input.voiceTranscript?.trim()) {
          json['voiceTranscript'] = input.voiceTranscript.trim();
        } else {
          delete json['voiceTranscript'];
        }
      }
      const meta = (json['meta'] ?? {}) as Record<string, unknown>;
      meta['schemaVersion'] = 2;
      meta['editedAt'] = Date.now();
      json['meta'] = meta;

      const screenshots = (json['screenshots'] ?? {}) as Record<string, unknown>;
      const viewportRel = String(screenshots['viewport'] ?? '');
      const elementRel = (screenshots['element'] ?? null) as string | null;
      const viewportFile = viewportRel ? viewportRel.replace(/^\.\//, '') : null;
      const elementFile = elementRel ? String(elementRel).replace(/^\.\//, '') : null;

      let payload = jsonToAnnotationPayload(json);
      if (input.attachments !== undefined) {
        await removeDroppedAttachments(dir, previousAttachments, input.attachments);
        const result = await writeAttachments(dir, session, base, {
          ...payload,
          attachments: input.attachments,
        });
        payload = result.payload;
        json['attachments'] = payload.attachments ?? [];
      }
      await writeText(dir, `${base}.json`, JSON.stringify({ ...json, ...payload }, null, 2));
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
        url: e.pageUrl,
        selector: e.selector,
        region: e.region != null ? { ...e.region } : null,
        pageTitle: e.pageTitle,
        comment: e.comment,
        commentPreview: previewComment(e.comment),
        ...(e.voiceTranscript ? { voiceTranscript: e.voiceTranscript } : {}),
        ...(e.attachments?.length ? { attachments: e.attachments } : {}),
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
  const md = renderSessionReadme(session, entries, await hasRecording(dir));
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

async function writeAttachments(
  dir: FileSystemDirectoryHandle,
  session: Session,
  base: string,
  payload: AnnotationPayload,
): Promise<{ payload: AnnotationPayload; files: WrittenFile[] }> {
  const attachments = payload.attachments ?? [];
  if (!attachments.length) return { payload, files: [] };

  const files: WrittenFile[] = [];
  const attachmentDirName = `${base}.attachments`;
  const attachmentDir = await dir.getDirectoryHandle(attachmentDirName, { create: true });
  const used = new Set<string>();
  const written = [];

  for (const attachment of attachments) {
    if (!attachment.dataUrl) {
      const existingName = fileNameFromAttachmentPath(attachment.path);
      if (existingName) used.add(existingName);
      written.push(attachment);
      continue;
    }
    const safeName = uniqueAttachmentName(attachment.name, used);
    const bytes = await writeBlob(attachmentDir, safeName, attachment.dataUrl);
    files.push({
      relativePath: relPath(session, `${attachmentDirName}/${safeName}`),
      bytes,
    });
    written.push({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      path: `./${attachmentDirName}/${safeName}`,
      bytes,
    });
  }

  return { payload: { ...payload, attachments: written }, files };
}

async function removeDroppedAttachments(
  dir: FileSystemDirectoryHandle,
  previous: NonNullable<AnnotationPayload['attachments']>,
  next: AnnotationPayload['attachments'],
): Promise<void> {
  const keptIds = new Set((next ?? []).map((a) => a.id));
  for (const item of previous) {
    if (keptIds.has(item.id)) continue;
    const path = item.path?.replace(/^\.\//, '');
    if (!path) continue;
    const [folder, file] = path.split('/');
    if (!folder || !file) continue;
    try {
      const attachmentDir = await dir.getDirectoryHandle(folder);
      await safeRemove(attachmentDir, file);
    } catch {}
  }
}

function fileNameFromAttachmentPath(path: string | undefined): string | null {
  if (!path) return null;
  const clean = path.replace(/^\.\//, '');
  const parts = clean.split('/');
  return parts[parts.length - 1] || null;
}

function uniqueAttachmentName(name: string, used: Set<string>): string {
  const fallback = `attachment-${used.size + 1}`;
  const safe = sanitizeSegment(name, fallback);
  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }
  const dot = safe.lastIndexOf('.');
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : '';
  let i = 2;
  while (used.has(`${stem}-${i}${ext}`)) i += 1;
  const next = `${stem}-${i}${ext}`;
  used.add(next);
  return next;
}

async function safeRemove(
  dir: FileSystemDirectoryHandle,
  name: string,
  recursive = false,
): Promise<void> {
  try {
    await dir.removeEntry(name, { recursive });
  } catch {
    /* missing file is fine */
  }
}

async function hasRecording(dir: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const recordingDir = await dir.getDirectoryHandle('recording');
    await recordingDir.getFileHandle('recording.json');
    return true;
  } catch {
    return false;
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
  const attachments = Array.isArray(j['attachments'])
    ? (j['attachments'] as AnnotationPayload['attachments'])
    : undefined;
  let regionInfo: { x: number; y: number; width: number; height: number } | null = null;
  if (region) {
    const rect = (region['rect'] ?? {}) as Record<string, unknown>;
    // Region rects are stored in viewport coords at capture time. Convert to
    // page/document space (add the scroll offset) so markers can re-anchor to
    // the same content regardless of the current scroll position.
    const scroll = (page['scroll'] ?? {}) as Record<string, unknown>;
    regionInfo = {
      x: (Number(rect['x']) || 0) + (Number(scroll['x']) || 0),
      y: (Number(rect['y']) || 0) + (Number(scroll['y']) || 0),
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
    voiceTranscript:
      typeof j['voiceTranscript'] === 'string' ? (j['voiceTranscript'] as string) : undefined,
    attachments,
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
    attachments: Array.isArray(json['attachments'])
      ? (json['attachments'] as AnnotationPayload['attachments'])
      : undefined,
    recording:
      typeof json['recording'] === 'object' && json['recording'] !== null
        ? (json['recording'] as AnnotationPayload['recording'])
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
    schemaVersion: 2,
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
  if (payload.recording) {
    lines.push('## Recording timestamp');
    lines.push('');
    lines.push(`- Elapsed: ${formatDuration(payload.recording.elapsedMs)}`);
    lines.push(`- Captured: ${new Date(payload.recording.capturedAt).toISOString()}`);
    lines.push('');
  }
  appendAttachmentsSection(lines, payload.attachments);
  appendScreenshotsSection(lines, viewportFile, elementFile);
  if (payload.element) {
    appendElementSection(lines, payload.element);
  } else if (payload.region) {
    appendRegionSection(lines, payload.region.rect, payload.region.elements);
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
  lines.push(`- Selector: \`${el.selector}\``);
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
  elements?: NonNullable<AnnotationPayload['region']>['elements'],
): void {
  lines.push('## Region');
  lines.push('');
  lines.push(
    `- Bounding rect: x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, w=${Math.round(rect.width)}, h=${Math.round(rect.height)}`,
  );
  if (elements?.length) {
    lines.push(`- Elements inside: ${elements.length}`);
    lines.push('');
    for (const el of elements) {
      const r = el.boundingRect;
      lines.push(
        `  - \`${el.selector}\` (${Math.round(r.width)}×${Math.round(r.height)} at ${Math.round(r.x)},${Math.round(r.y)})`,
      );
    }
  }
  lines.push('');
}

function appendAttachmentsSection(
  lines: string[],
  attachments: AnnotationPayload['attachments'],
): void {
  if (!attachments?.length) return;
  lines.push('## Attachments');
  lines.push('');
  for (const item of attachments) {
    const path = item.path ?? '';
    const size = item.bytes ?? item.size;
    lines.push(
      `- [${escapeMd(item.name)}](${path}) — ${item.mimeType || 'application/octet-stream'}, ${formatBytes(size)}`,
    );
  }
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
    const error = n.error ? ` — ${truncate(n.error, 120)}` : '';
    lines.push(`- \`[${n.method} ${n.status}] ${n.url} (${n.durationMs}ms)${error}\``);
  }
  lines.push('');
}

function renderSessionReadme(
  session: Session,
  entries: IndexEntry[],
  recordingAvailable: boolean,
): string {
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
  if (recordingAvailable) {
    lines.push('## Recording');
    lines.push('');
    lines.push('- [Recorded session assets](./recording/README.md)');
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
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
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

function pad2(n: number): string {
  return String(n).padStart(2, '0');
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
