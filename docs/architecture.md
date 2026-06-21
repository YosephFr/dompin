# Architecture

DOMPin is a single Chrome extension that writes annotations directly to a folder on the user's machine. There is no DOMPin server, no WebSocket, and no inter-process protocol. The integration surface is the folder layout itself, documented in [file-schema.md](file-schema.md). Optional audio transcription calls go directly from the extension to the configured provider.

## Surfaces

```
┌──────────────────────────────────────────────────────────────┐
│ Chrome (your real session)                                   │
│                                                              │
│  ┌──────────────────────────┐   ┌──────────────────────────┐ │
│  │ Content script           │   │ Background service worker│ │
│  │ • picker overlay         │◀─▶│ • session bookkeeping    │ │
│  │ • comment popup          │   │ • settings + vault state │ │
  │  │ • DOM + style capture    │   │ • viewport screenshots   │ │
  │  │ • element infobox        │   │ • element clean crops    │ │
  │  └────────────┬─────────────┘   │ • audio transcription    │ │
  │               │                 │ • file writes (FS API)   │ │
│               │                 │ • context-menu wiring    │ │
│               │                 └────────────┬─────────────┘ │
│               ▼                              ▼               │
│        ┌──────────────────────────────────────────┐          │
│        │ Side panel + Options page (React)        │          │
│        │ • setup wizard, session, pin list        │          │
│        │ • edit/delete pins, picker pause/resume  │          │
│        └──────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                  Local folder you picked
                  (organized by domain → session)
```

## Components

- **Content script.** One per tab, isolated in a Shadow DOM. Owns the picker overlay, the comment popup, the marker manager, the highlight + infobox renderer, and the per-element or region capture pipeline (selector, XPath, computed styles, React Fiber introspection, console buffer). It serializes attachments selected in the popup and tracks the last right-clicked element so the **Annotate element with DOMPin** menu item can target it without dismissing modals. Markers are scoped per view: each pin records the URL it was captured on, and the content script shows only the pins whose URL matches the page currently on screen (re-evaluated on hard loads and on SPA route changes). Microphone capture does **not** happen here — it runs in an offscreen document (see below) so it is immune to the page's `Permissions-Policy`.
- **Background service worker.** The single coordinator. Owns the session list, the active-session-per-tab mapping, the vault status, the settings, the screenshot capability (`chrome.tabs.captureVisibleTab`), the optional network-failure buffer, and audio: it drives the offscreen recorder, opens the one-time microphone-permission window when needed, and makes the transcription provider calls. Writes annotations and attachments to disk through the File System Access API using the directory handle persisted in IndexedDB. Wires the `chrome.action`, `chrome.commands`, `chrome.contextMenus`, `chrome.offscreen`, `chrome.sidePanel`, and `chrome.webRequest` surfaces.
- **Offscreen document.** A headless extension-origin page (`src/offscreen/offscreen.html`) created on demand with the `USER_MEDIA` reason. It runs `getUserMedia` + `MediaRecorder` and hands the recorded audio back to the background as a data URL. Because it lives at `chrome-extension://…` rather than in the page, microphone capture works on any site — including ones whose `Permissions-Policy` forbids the page from using the mic, and `http` pages where page-context capture is unavailable. Offscreen documents cannot show a permission prompt, so the first grant is collected by a small visible window (`src/offscreen/mic.html`); once granted for the extension origin it persists and recording is silent thereafter.
- **Side panel.** Opened by clicking the extension icon (or via `chrome.sidePanel.setPanelBehavior`). Shows the active session for the current tab, the list of pins on the current page (with edit and delete), recent sessions on that domain, the picker pause/resume control, and a setup wizard the first time the extension runs.
- **Options page.** Settings page after the vault is configured: vault folder management, allowlist, capture flags, transcription provider, and API keys. Also doubles as a fallback wizard when opened on a fresh install.

## Two-screenshot capture

Each annotation produces two PNGs:

- `NN.viewport.png` — full visible viewport with all overlay layers rendered: existing markers, the provisional marker for this annotation, the element highlight, and the infobox showing tag/id/classes/dimensions. This is what the user saw at the moment of capture.
- `NN.element.png` — clean crop of the picked element or custom region with padding, taken from a viewport capture made with the overlay temporarily hidden. This gives an unobstructed close-up.

The content script orchestrates the sequence: it positions the highlight and provisional marker, requests the viewport capture, then briefly hides the overlay (`visibility: hidden` + two RAFs) before requesting the element crop. The background returns both as data URLs; the writer persists them as PNG files.

## Data and storage

- **Settings** live in `chrome.storage.local` under the key `dompin:settings:v2`, including transcription provider and API key values.
- **Sessions** are tracked by the background worker, keyed by tab ID for the active mapping and persisted in `chrome.storage.local` for history.
- **Vault root handle** lives in IndexedDB (database `dompin`, store `kv`, key `vaultRoot`). The handle is what the File System Access API gives you back after a `showDirectoryPicker` call. It survives browser restarts but may need to be re-authorized.
- **Annotation files and attachments** live in the user-chosen folder. Nothing else is stored there by the extension.

## Permission model

DOMPin requests these from the browser:

- `<all_urls>` host permission, so the picker can attach to any page.
- `tabs` + `scripting` for messaging and `chrome.tabs.captureVisibleTab`.
- `contextMenus` for the right-click annotate entry.
- `sidePanel` for the side panel surface.
- `offscreen` to record microphone audio at the extension origin for voice transcription.
- `webRequest` to record failed request metadata when the user enables network-failure capture.
- `storage` and `unlimitedStorage` for settings and IndexedDB.
- A user-granted directory handle, scoped to the single folder the user picked.
- A user-granted microphone permission, requested only when voice transcription is first used. It is held by the extension origin, not by the sites you visit.

There is no telemetry, no DOMPin remote endpoint, and no broad filesystem access. Audio transcription is the only provider-bound network path: when configured, the recorded audio is captured in the offscreen document, passed to the background worker, sent directly to OpenAI or ElevenLabs, and the returned transcript is inserted into the user's visible comment draft. The audio never enters the page.

## Why MV3

Manifest V3 is the only path forward for new Chrome extensions. The service worker model is more constrained than V2 background pages — it sleeps, has no DOM, limited APIs — but for our use case the constraints are workable. The directory handle is loaded on demand from IndexedDB, screenshots are captured through the action API, and the side panel holds the user gesture needed for the File System Access API when a re-grant is required.

## Why a folder is the integration

Because every coding agent already reads files. Claude Code, Cursor, Aider, Continue, custom workflows — they all walk a working directory. By writing annotations to disk in a stable schema, DOMPin sidesteps the need for a custom protocol or a long-running daemon. Agents simply read `*.md` and `*.json` files like they would any other piece of context.
