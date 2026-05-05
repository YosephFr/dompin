# DOMPin

> Pin elements on any web page. Annotations land in a folder on your machine, ready for any AI coding agent.

DOMPin is a Chrome extension that lets you click any element on any web page, drop a comment, and capture the full DOM context — selector, XPath, outerHTML preview, computed styles, viewport and zoomed screenshots, React Fiber info, console state — straight into a folder you choose. Hand the folder to Claude Code, Cursor, or any tool that reads local files. No server, no port to manage.

## How it works

1. Install the extension. The first time it loads, a side panel opens on a demo page and walks you through picking a folder.
2. On any web page, click the DOMPin icon to open the side panel and start picking. Click an element, type a comment, press Enter.
3. The extension writes a Markdown file plus two PNG screenshots for every pin, organized by domain and session.
4. Open the folder in your editor and let your AI agent work from it.

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

Each browser tab starts a session the first time you pin something on it. The side panel shows the active session, the list of pins on the current page (with edit and delete), and recent sessions for the same domain. Use the **New session** button to split work into multiple sessions in the same tab.

## Annotating without dismissing modals

Open elements that disappear when you click outside them (popovers, modals, dropdowns) are notoriously hard to capture with a regular picker. DOMPin adds an **Annotate element with DOMPin** entry to the browser's native right-click menu — pick it on any element and the comment popup opens for that element without dismissing whatever was already visible.

## Privacy

Everything stays on your machine. DOMPin asks for read-write access to one folder you pick — nothing else. No telemetry, no remote calls, no hidden network traffic. An allowlist controls which sites the picker is available on.

## Install

```bash
git clone https://github.com/YosephFr/dompin.git
cd dompin
pnpm install
pnpm build
```

Then load `packages/extension/dist` as an unpacked extension at `chrome://extensions` (Developer mode → Load unpacked) and open the extension's options page to pick your vault folder. Full instructions in [docs/installation.md](docs/installation.md).

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
