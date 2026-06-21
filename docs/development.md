# Development

How to work on DOMPin.

## Layout

```
dompin/
├── packages/
│   └── extension/        # Chrome extension (Vite + crxjs + React 18)
│       └── src/
│           ├── background/  # service worker: sessions, vault, transcription, file writes, picker gate
│           ├── content/     # picker overlay, comment popup, capture pipeline
│           ├── sidepanel/   # side-panel UI (React): wizard, session card, picker hero, pin list
│           ├── options/     # options page (React)
│           └── common/      # shared types, settings, messaging, vault handle
├── examples/
│   └── demo-app/         # static page for manual picker QA
└── docs/                 # installation, architecture, file schema, this file
```

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
3. Click the DOMPin icon to open the side panel. The first time, the wizard walks you through picking a vault folder. A scratch folder under `/tmp` is fine for experiments.
4. Open `examples/demo-app/index.html` (served from the extension) or any real site you have permission to annotate.
5. In the side panel, click **Start new session** in the Session card. Name it and press Enter — the picker arms automatically.
6. Hover over a card or button, click to anchor, type a comment, press Enter. The picker stays on for the next pin.
7. Try the one-shot shortcut: press `Cmd+Shift+.` (or `Ctrl+Shift+.`) on a fresh element. The picker captures one element and auto-stops.
8. Try the right-click flow on a hover-only element: right-click → **Annotate element with DOMPin** → confirm the popup captures that element without dismissing it.
9. Try region capture: with the picker active, click and drag a rectangle over part of the page. The dashed region should stay visible until the popup opens, and `NN.json` should include `region.elements`.
10. Configure OpenAI or ElevenLabs in the options page, record a short audio note from the popup, stop recording, and confirm the transcript is inserted into the visible comment before submitting.
11. Attach a small file from the popup and submit. The vault should contain `NN.attachments/<file>` and the Markdown/JSON should link to it.
12. Open the vault folder. A new domain subfolder and a session subfolder should contain `01.md`, `01.element.png`, `01.viewport.png`, `01.json`, and any `01.attachments/` directory for that pin.
13. Click **End session** in the side panel: the picker stops, the session card returns to the empty state.

The session card also lets you rename the active session, start a new one, or end it. The pin list below shows annotations for the current page with edit and delete in place.

## Conventions

- TypeScript strict, no implicit `any`.
- Many small files: 200-400 lines typical, 800 max per file.
- Comments only when the _why_ is non-obvious; never paraphrase the code.
- React lives in the side panel and the options page. The content script avoids React except for the comment popup, which mounts inside a Shadow DOM root for isolation.
- All file writes go through the helpers in `src/background/`. Never call `showSaveFilePicker` directly from a UI surface — the wizard's `showDirectoryPicker` is the only direct File System Access API call from a UI.
- Picker access is gated by an active session. The shared check lives in `src/background/picker-gate.ts`; route any new entry point through it.
- Audio transcription runs through `src/background/transcription.ts`. Content scripts should send recorded audio to the background instead of calling provider APIs directly.

## Releasing

`v0.x` until the file schema stabilizes. Each release:

1. Bump the version in `package.json`, `packages/extension/package.json`, and `packages/extension/manifest.json`.
2. Update `CHANGELOG.md`.
3. `git tag vX.Y.Z && git push --tags`.
4. `gh release create vX.Y.Z` with notes drawn from the changelog.
5. Once the schema is stable, publish a packaged build to the Chrome Web Store.
