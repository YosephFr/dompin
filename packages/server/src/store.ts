import type { AnnotationPayload, AnnotationSummary, AnnotationId } from '@dompin/shared';

export type CountListener = (count: number) => void;

const COMMENT_PREVIEW_LENGTH = 120;

const buildCommentPreview = (raw: string): string => {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= COMMENT_PREVIEW_LENGTH) return trimmed;
  return trimmed.slice(0, COMMENT_PREVIEW_LENGTH - 1).trimEnd() + '…';
};

const toSummary = (p: AnnotationPayload): AnnotationSummary => ({
  id: p.id,
  createdAt: p.createdAt,
  pageUrl: p.page.url,
  pageTitle: p.page.title,
  selector: p.element ? p.element.selector : null,
  commentPreview: buildCommentPreview(p.comment),
});

export class AnnotationStore {
  private order: AnnotationId[] = [];
  private byId = new Map<AnnotationId, AnnotationPayload>();
  private listeners = new Set<CountListener>();

  size(): number {
    return this.order.length;
  }

  has(id: AnnotationId): boolean {
    return this.byId.has(id);
  }

  get(id: AnnotationId): AnnotationPayload | null {
    return this.byId.get(id) ?? null;
  }

  add(payload: AnnotationPayload): { added: boolean; replaced: boolean } {
    const existed = this.byId.has(payload.id);
    this.byId.set(payload.id, payload);
    if (!existed) {
      this.order.push(payload.id);
    }
    this.notify();
    return { added: !existed, replaced: existed };
  }

  remove(id: AnnotationId): boolean {
    if (!this.byId.has(id)) return false;
    this.byId.delete(id);
    const idx = this.order.indexOf(id);
    if (idx >= 0) this.order.splice(idx, 1);
    this.notify();
    return true;
  }

  clear(): number {
    const removed = this.order.length;
    this.order = [];
    this.byId.clear();
    if (removed > 0) this.notify();
    return removed;
  }

  replace(payloads: AnnotationPayload[]): void {
    this.order = [];
    this.byId.clear();
    for (const p of payloads) {
      if (!this.byId.has(p.id)) this.order.push(p.id);
      this.byId.set(p.id, p);
    }
    this.notify();
  }

  list(): AnnotationSummary[] {
    return this.order.map((id) => {
      const payload = this.byId.get(id);
      if (!payload) {
        throw new Error(`AnnotationStore inconsistency: ${id} present in order but missing in byId`);
      }
      return toSummary(payload);
    });
  }

  ids(): AnnotationId[] {
    return [...this.order];
  }

  onCountChanged(listener: CountListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const count = this.order.length;
    for (const listener of this.listeners) {
      try {
        listener(count);
      } catch {
        // listener errors must not poison the store; the listener owns its own logging
      }
    }
  }
}
