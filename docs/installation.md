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

The first time you click the extension icon, the side panel walks you through picking a folder. If you've installed it before and just rebuilt, simply click the icon on any page to open the side panel.

## 3. Pick your vault folder

1. Click the DOMPin icon. The side panel opens with the welcome wizard.
2. In step 1 of the wizard, click **Choose folder…** and pick any directory on your machine. A dedicated folder you can later open in your editor is recommended.
3. Chrome will ask once for read-write permission to that folder. Approve it.

The extension stores the folder handle locally. It does not see anything outside that folder.

You can change the vault folder at any time by clicking the pencil icon next to **Vault: …** at the bottom of the side panel.

## 4. Start a session

DOMPin scopes annotations to named sessions, one per browser tab.

1. With the side panel open, click **Start new session** in the Session card.
2. Type a name (or leave it blank for an auto-generated slug) and press Enter.
3. The picker arms automatically once the session is active.

## 5. Pin elements

You have three ways to capture an element:

- **Sticky picker**: click **Start picking** in the side panel. The picker stays on across multiple pins until you stop it. Best for a focused review of several elements in a row.
- **Keyboard shortcut**: press `Cmd+Shift+.` (Mac) or `Ctrl+Shift+.` (Win/Linux). The picker enters one-shot mode, captures a single element, and auto-stops.
- **Right-click**: choose **Annotate element with DOMPin** from the browser's native right-click menu on any element. The comment popup opens for that exact element without dismissing modals, popovers, or dropdowns.

Hover over an element, click to anchor it, type a comment, press Enter. A new domain subfolder and a session subfolder will appear in your vault folder with `01.md`, `01.element.png`, `01.viewport.png`, and `01.json`.

To capture a custom region, click and drag while the picker is active. DOMPin draws a dashed rectangle, captures that crop, and records the visible elements inside the region.

The comment popup also includes:

- **Record audio**: records through your browser microphone, sends the audio to the transcription provider configured in settings, and inserts the returned transcript into the visible comment box.
- **Attach file**: adds one or more local files to the pin. Attached files are written into `NN.attachments/` next to the annotation files.

## Optional: configure transcription

Open the options page from the side panel menu. Under **Audio transcription**, choose **ElevenLabs** or **OpenAI**, enter the matching API key, and keep or change the default model. DOMPin currently defaults to `scribe_v2` for ElevenLabs and `gpt-4o-transcribe` for OpenAI.

## Optional: change the keyboard shortcut

To rebind the one-shot picker shortcut:

1. Open `chrome://extensions/shortcuts`.
2. Find **DOMPin → Toggle the DOMPin element picker** and assign your preferred chord.

## Reconnecting after a browser restart

Chrome may ask you to reauthorize folder access after a restart or after long periods of inactivity. The side panel shows a **Reconnect folder** banner when this happens. Click it once and access is restored.

If you move or delete the vault folder, DOMPin detects it on the next health check and shows an **unreachable** banner with **Pick a new folder** and **Try reconnect** actions.

## Allowed domains

By default, the picker is enabled on every site. To restrict it, open the options page from the side panel's overflow menu (⋯ → **Open settings**) and edit the **Allowed domains** list. Use one entry per line; `*.example.com` matches every subdomain.
