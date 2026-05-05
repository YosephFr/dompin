# Installation

DOMPin is pre-1.0. The flow below is for development and early adopters. Once a stable release lands, a packaged build will replace the manual unpacked-extension step.

## Prerequisites

- Node 20 or newer
- pnpm 9 or newer
- Chrome 120 or newer (or any Chromium-based browser with the File System Access API enabled)

## 1. Build the extension

```bash
git clone https://github.com/YosephFr/dompin.git
cd dompin
pnpm install
pnpm build
```

The build emits `packages/extension/dist`. That directory is the loadable extension.

## 2. Load the extension in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** in the top right.
3. Click **Load unpacked**.
4. Select `packages/extension/dist`.
5. Pin the DOMPin icon to the toolbar so it is reachable on every page.

The first time the extension loads, it opens the bundled demo page and the side panel walks you through picking a folder. If you've installed it before and just rebuilt, simply click the icon on any page to open the side panel.

## 3. Pick your vault folder

1. Click the DOMPin icon. The side panel opens with a welcome card and a **Choose folder…** button.
2. Pick any directory on your machine. A dedicated folder you can later open in your editor is recommended.
3. Chrome will ask once for read-write permission to that folder. Approve it.

The extension stores the folder handle locally. It does not see anything outside that folder.

## 4. Optional: bind a keyboard shortcut

The default shortcut for toggling the picker is `Cmd+Shift+.` on macOS and `Ctrl+Shift+.` elsewhere. To change it or assign one:

1. Open `chrome://extensions/shortcuts`.
2. Find **DOMPin → Toggle the DOMPin element picker** and assign your preferred chord.

## 5. Verify

1. Open any web page.
2. Click the DOMPin icon. The side panel opens. Click **Resume picker** (or press your shortcut) to enter pick mode.
3. Hover over an element, click to anchor it, type a comment, press Enter.
4. Open the vault folder you picked. A new domain subfolder and a session subfolder should contain the annotation files.

You can also right-click any element on a page and choose **Annotate element with DOMPin** — this opens the comment popup for that element without dismissing modals or popovers, which is invaluable when capturing transient UI.

## Reconnecting after a browser restart

Chrome may ask you to reauthorize folder access after a restart or after long periods of inactivity. The side panel shows a **Reconnect folder** banner when this happens. Click it once and access is restored.

## Allowed domains

By default, the picker is enabled on every site. To restrict it, open the options page (gear icon in the side panel, or right-click the extension icon → **Options**) and edit the **Allowed domains** list. Use one entry per line; `*.example.com` matches every subdomain.
