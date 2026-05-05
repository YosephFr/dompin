# Architecture

DOMPin is a small distributed system with three pieces:

1. **Extension content script** runs in every page you visit (subject to allowlist). It owns the picker overlay, the comment popup, and the per-element capture logic. It talks to the background service worker via `chrome.runtime` messages.

2. **Extension background service worker** owns the persistent annotation queue (in `chrome.storage.local`) and the WebSocket client to the local MCP server. It also owns `chrome.tabs.captureVisibleTab` for viewport screenshots, since content scripts cannot capture screenshots themselves.

3. **MCP server** is a small Node process that speaks two protocols at once:
   - **MCP over stdio** with the coding agent (Claude Code, Cursor, etc.).
   - **WebSocket** with the extension on `127.0.0.1:8930`.

The server holds an in-memory queue of pinned annotations. The agent reads them via MCP tools, consumes them when handled, and can emit bidirectional commands (`highlight`, `scrollTo`) that are forwarded to the extension over WebSocket.

## Why a local server

A pure extension cannot expose itself directly to a stdio-based MCP client. The local MCP server is the bridge. It also gives us a clean place to enforce protocol versioning, message validation, and allowlists.

## Why MV3

Manifest V3 is the only path forward for new Chrome extensions. The service worker model is more constrained than V2 background pages (it sleeps, has no DOM, no `XMLHttpRequest`), but for our use case the constraints are workable: WebSocket connections are kept alive while the worker is awake, and we re-establish on demand.

## Threading and lifecycle

```
┌─────────────────────┐       ┌─────────────────────┐       ┌─────────────────────┐
│ content script      │       │ background SW       │       │ MCP server          │
│ (one per tab)       │       │ (one global)        │       │ (one global)        │
├─────────────────────┤       ├─────────────────────┤       ├─────────────────────┤
│ overlay + picker    │◀────▶ │ queue + WS client   │◀────▶ │ WS server + MCP     │
│ capture + screenshot│       │ persistence         │       │ in-memory queue     │
└─────────────────────┘       └─────────────────────┘       └─────────────────────┘
```

The content script is the only place that holds DOM references. The background service worker is the only place that holds the WebSocket. The server is the only place that exposes MCP tools. This separation keeps each surface small and testable.

## Protocol

See [protocol.md](protocol.md) for the wire format.
