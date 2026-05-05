# Development

How to work on DOMPin.

## Layout

```
dompin/
├── packages/
│   └── extension/        # Chrome extension (Vite + crxjs + React 18)
│       └── src/
│           ├── background/  # service worker: sessions, vault, file writes
│           ├── content/     # picker overlay, comment popup, capture pipeline
│           ├── popup/       # popup window UI
│           ├── options/     # options page + setup wizard
│           └── common/      # shared types, settings, messaging, vault handle
├── examples/
│   └── demo-app/         # static page for manual picker QA
└── docs/                 # installation, architecture, file schema, this file
```

There used to be `packages/shared` and `packages/server`. Both were removed when DOMPin moved from a WebSocket / MCP bridge to direct file system writes. If you find references to them in old comments or branches, treat them as historical.

## First-time setup

```bash
pnpm install
pnpm build
```

`pnpm build` produces `packages/extension/dist`. That directory is the loadable extension.

## Daily loop

```bash
pnpm --filter @dompin/extension dev
```

Vite rebuilds `dist/` on file changes. After the first build, load `dist/` as an unpacked extension at `chrome://extensions` (Developer mode → Load unpacked). Subsequent edits hot-reload automatically.

A second helpful pane:

```bash
pnpm typecheck --watch
```

## Quality gates

```bash
pnpm typecheck     # strict TypeScript across the workspace
pnpm format        # Prettier write
pnpm format:check  # Prettier verify, used by CI
pnpm validate      # typecheck + build, the same combo CI runs
```

The repository ships with a strict `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. Imports of types must use `import type` syntax. Index access on arrays returns `T | undefined` and must be narrowed.

## Manual end-to-end test

1. `pnpm build`.
2. Load `packages/extension/dist` as an unpacked extension at `chrome://extensions`.
3. Right-click the DOMPin icon → **Options**, walk through the wizard, and pick a vault folder. A scratch folder under `/tmp` is fine for experiments.
4. Open `examples/demo-app/index.html` in your browser, or any real site you have permission to annotate.
5. Press `Cmd+Shift+.` (macOS) or `Ctrl+Shift+.` (other) to enable the picker.
6. Hover over a card or button, click to anchor, type a comment, press `Cmd+Enter`.
7. Open the vault folder. A new domain subfolder and a session subfolder should contain `01.md`, `01.png`, `01.viewport.png`, and `01.json`.

The session panel (right-click the DOMPin icon) lets you rename, archive, or start a new session in the same tab.

## Conventions

- TypeScript strict, no implicit `any`.
- Many small files: 200-400 lines typical, 800 max per file.
- Comments only when the _why_ is non-obvious; never paraphrase the code.
- React lives in popup and options. The content script avoids React except for the comment popup, which mounts inside a Shadow DOM root for isolation.
- All file writes go through the helpers in `src/background/`. Never call `showSaveFilePicker` directly from a UI surface — the wizard's `showDirectoryPicker` is the only direct File System Access API call from a UI.

## Releasing

`v0.x` until the file schema stabilizes. Each release:

1. Bump the version in `package.json` and `packages/extension/package.json`.
2. Update `CHANGELOG.md`.
3. `git tag vX.Y.Z && git push --tags`.
4. `gh release create vX.Y.Z` with notes drawn from the changelog.
5. Once the schema is stable, publish a packaged build to the Chrome Web Store.
