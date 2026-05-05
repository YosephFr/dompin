import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { RectInfo } from '../../common/types.js';

interface PopupOptions {
  anchorRect: RectInfo;
  selectorPreview: string;
  enableSpeech: boolean;
  onConfirm: (input: { comment: string; voiceTranscript: string | null }) => void;
  onCancel: () => void;
}

export class CommentPopup {
  private mount: HTMLElement;
  private root: Root | null = null;

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
      <PopupView {...opts} onLifecycle={(action) => action === 'close' && this.close()} />,
    );
  }

  close(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
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
}

function PopupView(props: InternalProps): JSX.Element {
  const { anchorRect, selectorPreview, enableSpeech, onConfirm, onCancel, onLifecycle } = props;
  const [comment, setComment] = useState('');
  const [transcript, setTranscript] = useState('');
  const [recording, setRecording] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<unknown>(null);

  const SpeechRecognition = useMemo(() => getSpeechRecognition(), []);
  const speechAvailable = enableSpeech && SpeechRecognition != null;

  useEffect(() => {
    requestAnimationFrame(() => {
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect();
        setSize({ w: rect.width, h: rect.height });
      }
      textareaRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    return () => {
      stopRecognition(recognitionRef.current);
    };
  }, []);

  const position = positionPopup(anchorRect, size ?? { w: 320, h: 200 });

  const handleConfirm = () => {
    const trimmed = comment.trim();
    if (!trimmed) return;
    stopRecognition(recognitionRef.current);
    onConfirm({ comment: trimmed, voiceTranscript: transcript.trim() || null });
    onLifecycle('close');
  };

  const handleCancel = () => {
    stopRecognition(recognitionRef.current);
    onCancel();
    onLifecycle('close');
  };

  const handleKey = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) {
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
    if (!speechAvailable) return;
    if (recording) {
      stopRecognition(recognitionRef.current);
      recognitionRef.current = null;
      setRecording(false);
      return;
    }
    const Ctor = SpeechRecognition as new () => SpeechRecognitionLike;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = navigator.language || 'en-US';
    let baselineComment = '';
    let baselineTranscript = '';
    let interim = '';
    r.onstart = () => {
      baselineComment = comment;
      baselineTranscript = transcript;
    };
    r.onresult = (ev: SpeechRecognitionEventLike) => {
      let finalText = '';
      interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        if (!result) continue;
        const alt = result[0];
        if (!alt) continue;
        if (result.isFinal) finalText += alt.transcript;
        else interim += alt.transcript;
      }
      const sep = baselineComment && !baselineComment.endsWith(' ') ? ' ' : '';
      setComment(baselineComment + sep + (finalText + interim).trim());
      if (finalText) {
        const tsep = baselineTranscript && !baselineTranscript.endsWith(' ') ? ' ' : '';
        baselineTranscript = baselineTranscript + tsep + finalText.trim();
        setTranscript(baselineTranscript);
      }
    };
    r.onend = () => {
      setRecording(false);
      recognitionRef.current = null;
    };
    r.onerror = () => {
      setRecording(false);
      recognitionRef.current = null;
    };
    try {
      r.start();
      recognitionRef.current = r;
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

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
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={handleKey}
        />
        <div className="dp-helper">
          <span>Pin · ⌘ Enter</span>
          <span>Cancel · Esc</span>
        </div>
      </div>
      <div className="dp-popup-footer">
        {speechAvailable ? (
          <button
            type="button"
            className="dp-icon-btn"
            onClick={toggleRecording}
            data-active={recording ? 'true' : 'false'}
            aria-label={recording ? 'Stop recording' : 'Start recording'}
            title={recording ? 'Stop voice memo' : 'Voice memo'}
          >
            <MicIcon />
          </button>
        ) : null}
        {recording ? <span className="dp-voice-status">Listening…</span> : null}
        <span className="dp-spacer" />
        <button type="button" className="dp-btn dp-btn-ghost" onClick={handleCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="dp-btn dp-btn-primary"
          onClick={handleConfirm}
          disabled={comment.trim().length === 0}
        >
          Pin
        </button>
      </div>
    </div>
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

interface SpeechAlternativeLike {
  transcript: string;
  confidence: number;
}

interface SpeechResultLike {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: SpeechAlternativeLike;
}

interface SpeechResultsLike {
  readonly length: number;
  [index: number]: SpeechResultLike;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechResultsLike;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  const ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined;
  return ctor ?? null;
}

function stopRecognition(r: unknown): void {
  if (!r) return;
  const obj = r as SpeechRecognitionLike;
  try {
    obj.stop();
  } catch {
    /* noop */
  }
}

function CloseIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MicIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="6" y="2" width="4" height="7" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3.5 7.5C3.5 9.99 5.51 12 8 12s4.5-2.01 4.5-4.5M8 12v2M5.5 14h5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
