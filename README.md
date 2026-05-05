# DOMPin

> Pin elements on any web page and send them to your AI coding agent.

DOMPin is a Chrome extension plus a local MCP server. You point at elements on any page in your real browser, drop a comment, and the full DOM context — unique selector, XPath, outerHTML, filtered computed styles, viewport + zoned screenshots, React Fiber info, console state — flows straight into Claude Code (or any MCP-compatible coding agent).

It is the natural complement to a "show, don't tell" workflow: instead of describing the bug or the change in words, you click the element and the agent receives a complete, structured payload of what you mean.

## Why

Existing approaches fall short:

- Browser-internal annotation tools live in a sandboxed browser, so you lose your real session, extensions, and dev muscle memory.
- DevTools-based pickers are precise but skip the annotation and comment workflow.
- Localhost-only annotators do not help when you need to point at your deployed app.

DOMPin runs as an extension on your real Chrome, with your real session, on any URL, and pipes annotations through MCP — the same protocol your IDE agent already speaks.

## Features

- Element picker with hover overlay (DevTools-style highlight, selector tooltip, dimensions)
- Drag-region mode for annotations that are not anchored to a single element
- Multi-page batching: queue annotations across routes and pages of a single-page app
- Bidirectional control: the agent can highlight or scroll to any element in your browser
- Full payload per annotation: unique CSS selector, XPath, outerHTML preview, filtered computed styles, viewport and element-zoned screenshots, React Fiber introspection, console state
- Voice memos via the Web Speech API (optional)
- Persistence: queue survives page reloads and SPA navigation
- Privacy first: runs entirely on localhost, no telemetry, configurable domain allowlist
- MIT licensed

## Architecture

```
┌────────────────────────────────────────────────┐
│ Your Chrome (real session, real cookies)       │
│  ┌─────────────────────────────────────────┐   │
│  │ DOMPin content script                   │   │
│  │ • overlay + picker + comment popup      │   │
│  │ • element capture + screenshot          │   │
│  └────────────────┬────────────────────────┘   │
│                   │ chrome.runtime              │
│  ┌────────────────▼────────────────────────┐   │
│  │ DOMPin background service worker        │   │
│  │ • queue + persistence                   │   │
│  │ • WS client                             │   │
│  └────────────────┬────────────────────────┘   │
└───────────────────┼────────────────────────────┘
                    │ WebSocket on 127.0.0.1
┌───────────────────▼────────────────────────────┐
│ DOMPin MCP server (Node)                        │
│ • WS server (extension link)                    │
│ • MCP stdio transport (agent link)              │
│ • in-memory pin queue                           │
└───────────────────┬────────────────────────────┘
                    │ MCP stdio
┌───────────────────▼────────────────────────────┐
│ Claude Code, Cursor, or any MCP client          │
└────────────────────────────────────────────────┘
```

## Quick start

> Stable installer is in progress. Until v0.1.0 is published, see [docs/installation.md](docs/installation.md) for the dev workflow.

```bash
pnpm install
pnpm build
```

Then load `packages/extension/dist` as an unpacked extension in Chrome (`chrome://extensions`, Developer mode), and point your MCP-compatible agent at the local server (see [docs/installation.md](docs/installation.md)).

## Repo layout

| Path                  | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| `packages/shared`     | Protocol types shared by extension and server                 |
| `packages/extension`  | Chrome extension (Manifest V3)                                |
| `packages/server`     | Local MCP server with WebSocket bridge to the extension       |
| `docs/`               | Architecture, installation, protocol reference                |
| `examples/`           | Sample MCP client configuration snippets                      |

## Disclaimer

DOMPin is an independent open-source project. It is not affiliated with, endorsed by, or sponsored by Anthropic, the maker of Claude.

## License

[MIT](LICENSE)
