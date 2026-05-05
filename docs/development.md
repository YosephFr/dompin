# Development

How to work on DOMPin.

## Layout

```
dompin/
├── packages/
│   ├── shared/      # protocol types (TypeScript only, no runtime)
│   ├── extension/   # Chrome extension (Vite + crxjs)
│   └── server/      # MCP server (Node)
├── examples/
│   └── demo-app/    # static page for manual picker QA
├── scripts/
│   └── smoke-test.mjs  # exercises the server WS protocol
└── docs/
```

## First-time setup

```bash
pnpm install
pnpm build
```

## Daily loops

### Working on the extension

```bash
pnpm --filter @dompin/extension dev
```

This rebuilds `packages/extension/dist/` on file changes. After the first build, load `dist/` as an unpacked extension at `chrome://extensions` (Developer mode → Load unpacked). Subsequent edits hot-reload automatically.

### Working on the server

```bash
pnpm --filter @dompin/server dev    # tsc --watch
# in another terminal
pnpm --filter @dompin/server start  # node dist/index.js
```

Or, if you want stdio MCP only without the WebSocket bridge, pass `--no-ws`.

### Working on the protocol (`packages/shared`)

`shared` has no runtime — only types, constants, and validators that both extension and server import. Always run `pnpm --filter @dompin/shared build` after changes so consumers pick up the new declarations.

## Smoke test

After building, validate that the server speaks the wire protocol correctly:

```bash
pnpm smoke
```

This spawns the server, connects a WebSocket client, performs the `hello`/`welcome` handshake, sends an `annotation:new`, and asserts an `ack` comes back.

## Manual end-to-end test

1. `pnpm build`
2. Load `packages/extension/dist` as an unpacked extension at `chrome://extensions`.
3. Start the server: `pnpm --filter @dompin/server start`.
4. Open `examples/demo-app/index.html` in your browser.
5. Press `Cmd+Shift+.` (Mac) or `Ctrl+Shift+.` (other) to enable the picker.
6. Hover over a card or button, click to anchor, type a comment, press `Cmd+Enter`.
7. Open the extension popup. The pending count should reflect the new annotation. Click `Send to Claude`.
8. The server log should show `annotation accepted`. Verify with the smoke test client or any MCP client.

## Type checking and formatting

```bash
pnpm typecheck
pnpm format        # write
pnpm format:check  # CI
```

## Conventions

- TypeScript strict, no implicit `any`.
- Many small files (200-400 lines typical, 800 max).
- Comments only when the *why* is non-obvious; never paraphrase the code.
- React only in popup/options. Content script avoids React unless we mount inside a Shadow DOM root for isolation.
- Logging in the server goes to stderr (`process.stderr.write` or `console.error`). `stdout` is reserved for MCP transport.

## Releasing

`v0.x` until the protocol stabilizes. Each release:

1. Bump versions in all `package.json`.
2. Update `CHANGELOG.md`.
3. `git tag vX.Y.Z && git push --tags`.
4. `gh release create vX.Y.Z` with notes drawn from the changelog.
5. Once the protocol is stable, publish `@dompin/shared` and `@dompin/server` to npm.
