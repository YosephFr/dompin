# Architecture

DOMPin is a single Chrome extension that writes annotations directly to a folder on the user's machine. There is no server, no WebSocket, and no inter-process protocol. The integration surface is the folder layout itself, documented in [file-schema.md](file-schema.md).

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
│  └────────────┬─────────────┘   │ • file writes (FS API)   │ │
│               │                 └────────────┬─────────────┘ │
│               │                              │               │
│               ▼                              ▼               │
│        ┌──────────────────────────────────────────┐          │
│        │ Popup window + Options page (React)      │          │
│        │ • setup wizard, settings, session panel  │          │
│        └──────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                  Local folder you picked
                  (organized by domain → session)
```

## Components

- **Content script.** One per tab, isolated in a Shadow DOM. Owns the picker overlay, the comment popup, the per-element capture pipeline (selector, XPath, computed styles, React Fiber introspection, console buffer), and the optional voice memo input. Sends a finished annotation to the background worker.
- **Background service worker.** The single coordinator. Owns the session list, the active-session-per-tab mapping, the vault status, the settings, and the viewport screenshot capability (`chrome.tabs.captureVisibleTab`). Writes annotations to disk through the File System Access API using the directory handle persisted in IndexedDB.
- **Popup window.** Opened by right-clicking the extension icon. Shows the active session for the current tab, recent sessions on that domain, and the controls to toggle the picker, rename the session, or start a new one.
- **Options page.** A welcome wizard the first time it runs (welcome → pick folder → confirmation), and a settings page after that (vault folder management, allowlist, capture flags).

## Data and storage

- **Settings** live in `chrome.storage.local` under the key `dompin:settings:v2`.
- **Sessions** are tracked by the background worker, keyed by tab ID for the active mapping and persisted in `chrome.storage.local` for history.
- **Vault root handle** lives in IndexedDB (database `dompin`, store `handles`). The handle is what the File System Access API gives you back after a `showDirectoryPicker` call. It survives browser restarts but may need to be re-authorized.
- **Annotation files** live in the user-chosen folder. Nothing else is stored there by the extension.

## Permission model

DOMPin requests three things from the browser:

- `<all_urls>` host permission, so the picker can attach to any page.
- `chrome.tabs.captureVisibleTab`, for viewport screenshots.
- A user-granted directory handle, scoped to the single folder the user picked.

There is no remote endpoint, no telemetry, and no broad filesystem access.

## Why MV3

Manifest V3 is the only path forward for new Chrome extensions. The service worker model is more constrained than V2 background pages — it sleeps, has no DOM, and limited APIs — but for our use case the constraints are workable. The directory handle is loaded on demand from IndexedDB, screenshots are captured through the action API, and the popup window holds the user gesture needed for the File System Access API when a re-grant is required.

## Why a folder is the integration

Because every coding agent already reads files. Claude Code, Cursor, Aider, Continue, custom workflows — they all walk a working directory. By writing annotations to disk in a stable schema, DOMPin sidesteps the need for a custom protocol or a long-running daemon. Agents simply read `*.md` and `*.json` files like they would any other piece of context.
