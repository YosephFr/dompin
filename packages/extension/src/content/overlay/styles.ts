import { FONT_MONO, FONT_UI } from '../../common/theme.js';

export const OVERLAY_CSS = `
:host {
  all: initial;
  color-scheme: light dark;
  font-family: ${FONT_UI};
  --dp-accent: #0a84ff;
  --dp-accent-pressed: #006fdc;
  --dp-accent-soft: rgba(10,132,255,0.14);
  --dp-ink: #101113;
  --dp-paper: #ffffff;
  --dp-muted: #5b6068;
  --dp-border: #e3e5e9;
  --dp-shadow: 0 12px 40px -8px rgba(15,17,20,0.22), 0 4px 12px -4px rgba(15,17,20,0.10);
}

@media (prefers-color-scheme: dark) {
  :host {
    --dp-ink: #f5f6f8;
    --dp-paper: #15171b;
    --dp-muted: #a0a4ad;
    --dp-border: #2a2d33;
    --dp-shadow: 0 12px 40px -8px rgba(0,0,0,0.6), 0 4px 14px -4px rgba(0,0,0,0.45);
  }
}

.dp-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483647;
  font-family: ${FONT_UI};
}

.dp-cursor-cover {
  position: fixed;
  inset: 0;
  pointer-events: none;
  cursor: crosshair;
}

.dp-cursor-cover[data-active='true'] {
  pointer-events: auto;
  background: transparent;
}

.dp-highlight {
  position: fixed;
  border: 2px solid var(--dp-accent);
  background: var(--dp-accent-soft);
  pointer-events: none;
  border-radius: 2px;
  box-sizing: border-box;
  transition: opacity 80ms ease;
  will-change: transform, width, height;
}

.dp-tooltip {
  position: fixed;
  pointer-events: none;
  padding: 5px 8px;
  border-radius: 6px;
  background: var(--dp-ink);
  color: var(--dp-paper);
  font-size: 11px;
  line-height: 1.3;
  font-family: ${FONT_MONO};
  white-space: nowrap;
  display: inline-flex;
  gap: 10px;
  align-items: center;
  box-shadow: var(--dp-shadow);
  letter-spacing: 0;
}

.dp-tooltip .tag { color: #f9c5d1; }
.dp-tooltip .id { color: #ffd28a; }
.dp-tooltip .cls { color: #c5d1f9; }
.dp-tooltip .dim { color: #a8e6a3; }

.dp-region {
  position: fixed;
  border: 2px dashed var(--dp-accent);
  background: var(--dp-accent-soft);
  pointer-events: none;
  border-radius: 4px;
  box-sizing: border-box;
}

.dp-pulse {
  position: fixed;
  border: 2px solid var(--dp-accent);
  background: var(--dp-accent-soft);
  pointer-events: none;
  border-radius: 4px;
  box-sizing: border-box;
  animation: dp-pulse-anim 1.5s ease-out forwards;
}

@keyframes dp-pulse-anim {
  0% { opacity: 0; transform: scale(0.95); }
  20% { opacity: 1; transform: scale(1); }
  60% { opacity: 1; transform: scale(1.02); }
  100% { opacity: 0; transform: scale(1.04); }
}

.dp-marker {
  position: fixed;
  z-index: 2;
  pointer-events: auto;
  cursor: pointer;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--dp-accent);
  color: white;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 2px 6px rgba(10,132,255,0.45), 0 0 0 2px var(--dp-paper);
  transition: transform 120ms ease;
  user-select: none;
}

.dp-marker:hover { transform: scale(1.12); }

.dp-marker.is-provisional {
  background: var(--dp-accent);
  position: fixed;
}

.dp-marker.is-provisional::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid var(--dp-accent);
  opacity: 0.6;
  animation: dp-marker-prov-ring 1.2s ease-out infinite;
  pointer-events: none;
}

@keyframes dp-marker-prov-ring {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.6); opacity: 0; }
}

.dp-popup {
  position: fixed;
  z-index: 3;
  pointer-events: auto;
  background: var(--dp-paper);
  color: var(--dp-ink);
  border: 1px solid var(--dp-border);
  border-radius: 12px;
  width: 320px;
  max-width: calc(100vw - 16px);
  box-shadow: var(--dp-shadow);
  font-family: ${FONT_UI};
  font-size: 13px;
  line-height: 1.4;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dp-popup-header {
  padding: 10px 14px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.dp-popup-meta {
  font-size: 11px;
  color: var(--dp-muted);
  font-family: ${FONT_MONO};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.dp-popup-close {
  appearance: none;
  background: none;
  border: 0;
  color: var(--dp-muted);
  cursor: pointer;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  flex-shrink: 0;
}

.dp-popup-close:hover {
  background: var(--dp-border);
  color: var(--dp-ink);
}

.dp-popup-body {
  padding: 8px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dp-textarea {
  appearance: none;
  width: 100%;
  min-height: 76px;
  resize: vertical;
  background: transparent;
  color: var(--dp-ink);
  border: 1px solid var(--dp-border);
  border-radius: 8px;
  padding: 8px 10px;
  font-family: ${FONT_UI};
  font-size: 13px;
  line-height: 1.4;
  outline: none;
  transition: border-color 120ms;
  box-sizing: border-box;
}

.dp-textarea:focus {
  border-color: var(--dp-accent);
  box-shadow: 0 0 0 3px var(--dp-accent-soft);
}

.dp-popup-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-top: 1px solid var(--dp-border);
  background: color-mix(in srgb, var(--dp-paper) 96%, var(--dp-ink));
}

.dp-file-input {
  display: none;
}

.dp-icon-btn {
  appearance: none;
  background: transparent;
  border: 1px solid transparent;
  color: var(--dp-muted);
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
  transition: all 120ms;
}

.dp-icon-btn:hover {
  color: var(--dp-ink);
  background: var(--dp-border);
}

.dp-icon-btn[data-active='true'] {
  color: var(--dp-accent);
  background: var(--dp-accent-soft);
}

.dp-icon-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.dp-rec-btn[data-active='true'] {
  box-shadow: 0 0 0 3px var(--dp-accent-soft);
}

.dp-rec-btn[data-busy='true'] svg {
  animation: dp-rec-pulse 900ms ease-in-out infinite;
}

@keyframes dp-rec-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}

.dp-spacer { flex: 1; }

.dp-btn {
  appearance: none;
  border: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  padding: 7px 12px;
  border-radius: 8px;
  transition: background 120ms, color 120ms, transform 80ms;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.dp-btn-primary {
  background: var(--dp-accent);
  color: #ffffff;
}

.dp-btn-primary:hover { background: var(--dp-accent-pressed); }
.dp-btn-primary:active { transform: scale(0.98); }
.dp-btn-primary:disabled {
  background: var(--dp-border);
  color: var(--dp-muted);
  cursor: not-allowed;
}

.dp-btn-ghost {
  background: transparent;
  color: var(--dp-muted);
  border: 1px solid transparent;
}

.dp-btn-ghost:hover {
  color: var(--dp-ink);
  background: var(--dp-border);
}

.dp-voice-status {
  font-size: 11px;
  color: var(--dp-accent);
  font-family: ${FONT_MONO};
  min-width: 0;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dp-helper {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  color: var(--dp-muted);
  font-family: ${FONT_MONO};
  letter-spacing: 0.02em;
}

.dp-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dp-attachment {
  appearance: none;
  border: 1px solid var(--dp-border);
  background: color-mix(in srgb, var(--dp-paper) 94%, var(--dp-ink));
  color: var(--dp-ink);
  border-radius: 7px;
  padding: 5px 7px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  cursor: pointer;
  font-family: ${FONT_UI};
}

.dp-attachment span {
  max-width: 145px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
}

.dp-attachment small {
  color: var(--dp-muted);
  font-size: 10px;
  font-family: ${FONT_MONO};
  white-space: nowrap;
}

.dp-attachment:hover {
  border-color: var(--dp-accent);
  background: var(--dp-accent-soft);
}

.dp-inline-error {
  color: #d8404a;
  font-size: 11px;
  line-height: 1.35;
}

.dp-pinned-region {
  position: fixed;
  z-index: 1;
  border: 1.5px solid var(--dp-accent);
  background: rgba(10,132,255,0.06);
  pointer-events: none;
  border-radius: 4px;
  box-sizing: border-box;
}
`;
