# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-05-05

Initial release.

### Added

#### Extension (`@dompin/extension`)

- Manifest V3 Chrome extension built with Vite + `@crxjs/vite-plugin`.
- Element picker with hover overlay (DevTools-style highlight, selector + dimensions tooltip), debounced and crosshair-cursor.
- Drag-region picker (Shift-drag) for non-element annotations.
- Robust unique-selector algorithm with `data-testid` / `data-test` / `id` / `aria-label` / class / nth-of-type fallback, generated-class heuristics, and uniqueness validation.
- Comment popup anchored to the picked element, with optional Web Speech API voice memo.
- Persistent annotation queue in `chrome.storage.local`, restored on service worker restart.
- Per-page annotation markers (clickable to remove), updated on SPA navigation.
- Toolbar popup (React) with connection status, queue summary, and "send to server" / "clear" / "toggle picker" actions.
- Options page (React) for WebSocket host/port/path, domain allowlist (`*` and `*.example.com` patterns), and feature toggles (network failures, Web Speech API, React Fiber introspection).
- Hotkey: `Cmd+Shift+.` (macOS) / `Ctrl+Shift+.` (Windows / Linux).
- Background service worker: WebSocket client with exponential-backoff reconnect, heartbeat, hello/welcome handshake, viewport screenshot via `captureVisibleTab`, element-zoned screenshot crop with offscreen canvas.
- Bidirectional commands: `highlight` (pulsating outline) and `scrollTo` (smooth scroll into view) driven from the agent.
- Console buffer (last 60 s) and optional network-failure capture.
- React Fiber introspection: component name, owner chain (depth ≤ 5), `_debugSource` when in dev builds, sanitized props (depth ≤ 2, no functions, truncated strings).
- Shadow-DOM-isolated overlay; light / dark color-scheme aware.
- Self-generated icon set (16 / 32 / 48 / 128).

#### Server (`@dompin/server`)

- MCP server over stdio, plus a WebSocket bridge on `127.0.0.1:8930/dompin`.
- Seven tools: `list_pinned_annotations`, `get_annotation`, `consume_annotation`, `clear_pinned`, `highlight_element`, `scroll_to_element`, `server_status`.
- `get_annotation` returns image content blocks for screenshots when possible.
- Strict zod validation of all extension messages with `INVALID_PAYLOAD` errors that never crash the process.
- Major-version protocol check with `PROTOCOL_MISMATCH` close.
- One active extension client at a time; new connections cleanly replace the previous one.
- 30 s server-side ping with 60 s pong-loss timeout.
- CLI: `--host`, `--port`, `--no-ws`, `--help`, `--version`. Env: `DOMPIN_HOST`, `DOMPIN_PORT`, `DOMPIN_DEBUG`.
- Logging exclusively on stderr (stdout reserved for MCP transport).
- 23-check end-to-end smoke test exercising MCP and WebSocket together.

#### Shared (`@dompin/shared`)

- Protocol types: `AnnotationPayload`, `ExtensionMessage`, `ServerMessage`, `ServerStatus`, summaries.
- Constants: `PROTOCOL_VERSION`, default WS host / port / path.
- `buildWsUrl` helper and message-type guards.

#### Tooling

- pnpm monorepo with three workspace packages.
- Strict TypeScript (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, etc.).
- GitHub Actions CI: format check, typecheck, build.
- MIT license, public-friendly README, contribution guide, security policy, issue and PR templates.
- Demo app under `examples/demo-app/` for manual picker QA.

[Unreleased]: https://github.com/YosephFr/dompin/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/YosephFr/dompin/releases/tag/v0.1.0
