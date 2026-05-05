import type { AnnotationPayload, AnnotationId } from './types.js';

export type ExtensionMessage =
  | { type: 'hello'; protocolVersion: string; extensionVersion: string }
  | { type: 'ping' }
  | { type: 'annotation:new'; payload: AnnotationPayload }
  | { type: 'annotation:cancel'; id: AnnotationId }
  | { type: 'queue:replace'; payloads: AnnotationPayload[] }
  | { type: 'queue:clear' };

export type ServerMessage =
  | { type: 'welcome'; serverVersion: string; protocolVersion: string }
  | { type: 'pong' }
  | { type: 'ack'; ids: AnnotationId[] }
  | { type: 'error'; code: ServerErrorCode; message: string }
  | { type: 'highlight'; selector: string; url?: string; durationMs?: number }
  | { type: 'scrollTo'; selector: string; url?: string; behavior?: ScrollBehavior }
  | { type: 'pendingCountChanged'; count: number };

export type WireMessage = ExtensionMessage | ServerMessage;

export type ServerErrorCode =
  | 'PROTOCOL_MISMATCH'
  | 'INVALID_PAYLOAD'
  | 'UNKNOWN_MESSAGE'
  | 'INTERNAL_ERROR';

export const isExtensionMessage = (value: unknown): value is ExtensionMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const t = (value as { type?: unknown }).type;
  return (
    t === 'hello' ||
    t === 'ping' ||
    t === 'annotation:new' ||
    t === 'annotation:cancel' ||
    t === 'queue:replace' ||
    t === 'queue:clear'
  );
};

export const isServerMessage = (value: unknown): value is ServerMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const t = (value as { type?: unknown }).type;
  return (
    t === 'welcome' ||
    t === 'pong' ||
    t === 'ack' ||
    t === 'error' ||
    t === 'highlight' ||
    t === 'scrollTo' ||
    t === 'pendingCountChanged'
  );
};
