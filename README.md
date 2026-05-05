# DOMPin

> Pin elements on any web page. Annotations land in a folder on your machine, ready for any AI coding agent.

DOMPin is a Chrome extension that lets you click any element on any web page, drop a comment, and capture the full DOM context — selector, XPath, outerHTML preview, computed styles, viewport and zoomed screenshots, React Fiber info, console state — straight into a folder you choose. Hand the folder to Claude Code, Cursor, or any tool that reads local files. No server, no port to manage.

## How it works

1. Install the extension. The first time it loads, the side panel walks you through picking a folder.
2. Click the DOMPin icon to open the side panel. Start a named session for the current tab — that becomes a subfolder where this round of annotations will land.
3. Hit **Start picking**, click any element on the page, type a comment, press Enter. Chain as many as you want — the picker stays on until you stop it.
4. Need a quick one-off without leaving your flow? Hit `⌘⇧.` (Mac) / `Ctrl⇧.` (Win/Linux) for a single-shot pick that auto-stops, or right-click any element and choose **Annotate element with DOMPin** to capture transient UI like dropdowns and popovers without dismissing them.
5. Open the vault folder in your editor and let your AI agent work from it.

## File layout

```
<your-vault>/
  example.com/
    20260505-1432__landing_a1f2/
      README.md
      01.md
      01.element.png
      01.viewport.png
      01.json
      02.md
      02.element.png
      02.viewport.png
      02.json
```

Each `NN.md` contains your comment, the picked element data, and links to the screenshots. `NN.element.png` is a clean crop of the picked element with padding. `NN.viewport.png` is the full viewport with all annotation markers, the highlight, and the element infobox visible — so the agent can see exactly what you saw. `NN.json` carries the full structured payload for tools that prefer to parse rather than read prose. See [docs/file-schema.md](docs/file-schema.md) for the full specification.

## Sessions

Sessions are explicit and named. The side panel shows the current session for the active tab; **Start new session** opens an inline name field so you can split work into focused folders. The card lists pin count and last-write time at a glance, with **Rename** and **End session** controls on the same row. End session stops the picker and frees the tab — your files stay where they are.

Recent sessions for the same domain are listed below for quick context, and pins on the current page can be edited or deleted right from the side panel.

## Picker modes

- **Sticky** (default, from the side panel button): stays on across multiple pins until you stop it. Best for a focused review of several elements in a row.
- **One-shot** (`⌘⇧.` / `Ctrl⇧.`): grabs a single element, then auto-stops. Best for an isolated capture without breaking your reading flow.
- **Right-click context menu**: pick **Annotate element with DOMPin** on any element. The comment popup opens for that exact element without dismissing whatever was already on screen — invaluable for hover dropdowns, modals, and popovers that disappear when you click outside them.

All three require an active session for the tab. If there isn't one, the side panel opens and the Session card flashes so you know where to start.

## Privacy

Everything stays on your machine. DOMPin asks for read-write access to one folder you pick — nothing else. No telemetry, no remote calls, no hidden network traffic. An allowlist controls which sites the picker is available on.

## Install

```bash
git clone https://github.com/YosephFr/dompin.git
cd dompin
pnpm install
pnpm build
```

Then load `packages/extension/dist` as an unpacked extension at `chrome://extensions` (Developer mode → Load unpacked). The first time you click the icon, the side panel's wizard walks you through picking a vault folder. Full instructions in [docs/installation.md](docs/installation.md).

## Why

- Browser-internal annotation tools live in a sandboxed browser, so you lose your real session, extensions, and dev muscle memory. DOMPin runs on your real Chrome.
- DevTools-based pickers are precise but skip the comment workflow.
- Localhost-only annotators do not help when you need to point at your deployed app. DOMPin works on any URL.
- Server-based bridges add a process, a port, and a daemon. DOMPin is just files on disk.

## Documentation

- [Installation](docs/installation.md)
- [Architecture](docs/architecture.md)
- [File schema](docs/file-schema.md)
- [Development](docs/development.md)

## Disclaimer

DOMPin is an independent open-source project. It is not affiliated with, endorsed by, or sponsored by Anthropic, OpenAI, or any other AI tooling vendor. The folder format is the entire integration — any tool that reads local files can use it.

## License

[MIT](LICENSE)
