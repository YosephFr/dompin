import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AnnotationAttachment, RectInfo } from '../../common/types.js';
import { sendRequest } from '../../common/messaging.js';
import { newId } from '../../common/id.js';

interface PopupOptions {
  anchorRect: RectInfo;
  selectorPreview: string;
  enableSpeech: boolean;
  onConfirm: (input: {
    comment: string;
    voiceTranscript: string | null;
    attachments: AnnotationAttachment[];
  }) => void;
  onCancel: () => void;
}

export class CommentPopup {
  private mount: HTMLElement;
  private root: Root | null = null;
  private flushFn: (() => void) | null = null;

  constructor(private layer: HTMLElement) {
    this.mount = document.createElement('div');
    this.mount.style.position = 'fixed';
    this.mount.style.inset = '0';
    this.mount.style.pointerEvents = 'none';
    layer.appendChild(this.mount);
  }

  open(opts: PopupOptions): void {
    if (!this.root) this.root = createRoot(this.mount);
    this.root.render(
      <PopupView
        {...opts}
        registerFlush={(fn) => {
          this.flushFn = fn;
        }}
        onLifecycle={(action) => action === 'close' && this.close()}
      />,
    );
  }

  /** Submit the note if it has content, otherwise cancel it. Used when the
   * picker is stopped while a note is still open. */
  flush(): void {
    this.flushFn?.();
  }

  close(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    this.flushFn = null;
  }

  isOpen(): boolean {
    return this.root != null;
  }

  destroy(): void {
    this.close();
    this.mount.remove();
  }
}

interface InternalProps extends PopupOptions {
  onLifecycle: (action: 'close') => void;
  registerFlush: (fn: () => void) => void;
}

function PopupView(props: InternalProps): JSX.Element {
  const {
    anchorRect,
    selectorPreview,
    enableSpeech,
    onConfirm,
    onCancel,
    onLifecycle,
    registerFlush,
  } = props;
  const [comment, setComment] = useState('');
  const [transcript, setTranscript] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AnnotationAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recordingRef = useRef(false);

  // Recording runs in an extension-origin offscreen document, so the page's
  // own microphone restrictions don't apply — only that the feature is enabled.
  const speechAvailable = enableSpeech;

  useEffect(() => {
    // Focus the textarea so typing starts immediately. Do it now, after layout,
    // and once more after a tick — a right click (whose contextmenu fires on
    // mousedown) is followed by a mouseup that can otherwise steal focus.
    textareaRef.current?.focus();
    requestAnimationFrame(() => {
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        setSize({ w: rect.width, h: rect.height });
      }
      textareaRef.current?.focus();
    });
    const t = window.setTimeout(() => textareaRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current = false;
        void sendRequest({ kind: 'audio:record-cancel' });
      }
    };
  }, []);

  const position = positionPopup(anchorRect, size ?? { w: 320, h: 200 });

  const handleConfirm = () => {
    const trimmed = comment.trim();
    if (!trimmed) return;
    discardRecording();
    onConfirm({ comment: trimmed, voiceTranscript: transcript.trim() || null, attachments });
    onLifecycle('close');
  };

  const handleCancel = () => {
    discardRecording();
    onCancel();
    onLifecycle('close');
  };

  // Let the host flush this note (submit if it has content, else cancel) when
  // the picker is stopped mid-note. Re-registered each render so the closure
  // reads the current comment.
  useEffect(() => {
    registerFlush(() => {
      if (comment.trim()) handleConfirm();
      else handleCancel();
    });
  });

  const handleKey = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends the note; Shift+Enter inserts a newline.
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      handleConfirm();
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      handleCancel();
    }
  };

  const toggleRecording = () => {
    if (!speechAvailable || transcribing) return;
    if (recording) void finishRecording();
    else void beginRecording();
  };

  async function beginRecording(): Promise<void> {
    setVoiceStatus('Requesting microphone…');
    const resp = await sendRequest({ kind: 'audio:record-start' });
    if (resp.ok) {
      recordingRef.current = true;
      setRecording(true);
      setVoiceStatus('Recording…');
    } else {
      recordingRef.current = false;
      setRecording(false);
      setVoiceStatus(micErrorMessage(resp.error));
    }
  }

  async function finishRecording(): Promise<void> {
    recordingRef.current = false;
    setRecording(false);
    setTranscribing(true);
    setVoiceStatus('Transcribing…');
    try {
      const resp = await sendRequest<{
        text?: string;
        provider?: string;
        discarded?: boolean;
      }>({ kind: 'audio:record-stop' });
      if (!resp.ok) throw new Error(resp.error);
      const text = resp.text?.trim();
      if (resp.discarded || !text) {
        setVoiceStatus(null);
        return;
      }
      appendText(text);
      setTranscript((prev) => joinText(prev, text));
      setVoiceStatus(`${providerLabel(resp.provider ?? '')} transcript inserted.`);
    } catch (e) {
      setVoiceStatus(e instanceof Error ? e.message : 'Transcription failed.');
    } finally {
      setTranscribing(false);
    }
  }

  function discardRecording(): void {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    void sendRequest({ kind: 'audio:record-cancel' });
  }

  async function handleAttachmentFiles(files: FileList | null): Promise<void> {
    if (!files?.length) return;
    setAttachmentError(null);
    try {
      const next = await Promise.all(
        Array.from(files).map(async (file) => ({
          id: newId(),
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl: await blobToDataUrl(file),
        })),
      );
      setAttachments((prev) => [...prev, ...next]);
    } catch (e) {
      setAttachmentError(e instanceof Error ? e.message : 'Could not read attachment.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeAttachment(id: string): void {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function appendText(text: string): void {
    setComment((prev) => joinText(prev, text));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function providerLabel(provider: string): string {
    return provider === 'openai' ? 'OpenAI' : 'ElevenLabs';
  }

  function micErrorMessage(error: string): string {
    if (error === 'MIC_PERMISSION_DENIED') return 'Microphone access is required to record.';
    if (error === 'MIC_NOT_FOUND') return 'No microphone was found on this device.';
    if (error === 'OFFSCREEN_UNAVAILABLE') return 'Update Chrome to use voice recording.';
    return error || 'Microphone access failed.';
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'));
      reader.readAsDataURL(blob);
    });
  }

  function joinText(prev: string, next: string): string {
    const clean = next.trim();
    if (!clean) return prev;
    const base = prev.trimEnd();
    const sep = base ? (/[.!?:;]$/.test(base) ? ' ' : '\n') : '';
    return `${base}${sep}${clean}`;
  }

  const voiceBusy = recording || transcribing;

  return (
    <div
      ref={cardRef}
      className="dp-popup"
      style={{ left: 0, top: 0, transform: `translate(${position.x}px, ${position.y}px)` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="dp-popup-header">
        <div className="dp-popup-meta" title={selectorPreview}>
          {selectorPreview}
        </div>
        <button type="button" className="dp-popup-close" onClick={handleCancel} aria-label="Cancel">
          <CloseIcon />
        </button>
      </div>
      <div className="dp-popup-body">
        <textarea
          ref={textareaRef}
          className="dp-textarea"
          placeholder="Describe what you want here…"
          value={comment}
          autoFocus
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={handleKey}
        />
        {attachments.length ? (
          <div className="dp-attachments" aria-label="Attachments">
            {attachments.map((item) => (
              <button
                key={item.id}
                type="button"
                className="dp-attachment"
                onClick={() => removeAttachment(item.id)}
                title="Remove attachment"
              >
                <AttachIcon />
                <span>{item.name}</span>
                <small>{formatBytes(item.size)}</small>
              </button>
            ))}
          </div>
        ) : null}
        {attachmentError ? <div className="dp-inline-error">{attachmentError}</div> : null}
        <div className="dp-helper">
          <span>Pin · Enter</span>
          <span>Cancel · Esc · ⇧↵ newline</span>
        </div>
      </div>
      <div className="dp-popup-footer">
        {speechAvailable ? (
          <button
            type="button"
            className="dp-icon-btn dp-rec-btn"
            onClick={toggleRecording}
            data-active={recording ? 'true' : 'false'}
            data-busy={voiceBusy ? 'true' : 'false'}
            aria-label={recording ? 'Stop recording' : 'Start recording'}
            title={recording ? 'Stop recording' : 'Record audio'}
            disabled={transcribing}
          >
            <MicIcon active={recording} />
          </button>
        ) : null}
        <input
          ref={fileInputRef}
          className="dp-file-input"
          type="file"
          multiple
          onChange={(e) => void handleAttachmentFiles(e.target.files)}
        />
        <button
          type="button"
          className="dp-icon-btn"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach file"
          title="Attach file"
        >
          <AttachIcon />
        </button>
        {voiceStatus ? <span className="dp-voice-status">{voiceStatus}</span> : null}
        <span className="dp-spacer" />
        <button type="button" className="dp-btn dp-btn-ghost" onClick={handleCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="dp-btn dp-btn-primary"
          onClick={handleConfirm}
          disabled={comment.trim().length === 0 || voiceBusy}
        >
          Pin
        </button>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function CloseIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MicIcon({ active }: { active: boolean }): JSX.Element {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
      <rect
        x="6.1"
        y="2"
        width="4.8"
        height="7.4"
        rx="2.4"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <path
        d="M3.7 7.5c0 2.65 2.15 4.8 4.8 4.8s4.8-2.15 4.8-4.8M8.5 12.3v2.2M6 14.5h5"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      {active ? <circle cx="8.5" cy="5.7" r="0.8" fill="var(--dp-paper)" /> : null}
    </svg>
  );
}

function AttachIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 8.6l3.7-3.7a2.2 2.2 0 113.1 3.1l-5 5a3.7 3.7 0 01-5.2-5.2l5.4-5.4"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function positionPopup(anchor: RectInfo, size: { w: number; h: number }): { x: number; y: number } {
  const margin = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = anchor.x;
  let y = anchor.y + anchor.height + margin;
  if (y + size.h > vh - 8) {
    const above = anchor.y - size.h - margin;
    if (above >= 8) y = above;
    else y = vh - size.h - 8;
  }
  if (y < 8) y = 8;
  if (x + size.w > vw - 8) x = vw - size.w - 8;
  if (x < 8) x = 8;
  return { x, y };
}
