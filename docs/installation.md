# Installation

> DOMPin is pre-1.0. The flow below is for development and early adopters. Once a stable release lands, a one-line installer will replace it.

## Prerequisites

- Node 20 or newer
- pnpm 9 or newer
- Chrome (or any Chromium-based browser)
- An MCP-compatible coding agent (Claude Code, Cursor, etc.)

## 1. Build the project

```bash
git clone https://github.com/YosephFr/dompin.git
cd dompin
pnpm install
pnpm build
```

## 2. Load the extension

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the `packages/extension/dist` directory.
5. Pin the DOMPin icon to your toolbar for quick access.

## 3. Configure your MCP client

Add the DOMPin server to your MCP client configuration. For Claude Code, edit your `.mcp.json` (or run `claude mcp add`):

```json
{
  "mcpServers": {
    "dompin": {
      "command": "node",
      "args": ["/absolute/path/to/dompin/packages/server/dist/index.js"]
    }
  }
}
```

After publishing to npm, this will become:

```json
{
  "mcpServers": {
    "dompin": {
      "command": "npx",
      "args": ["-y", "@dompin/server"]
    }
  }
}
```

## 4. Verify

1. Restart your MCP client.
2. Open any web page.
3. Press `Cmd+Shift+.` (Mac) or `Ctrl+Shift+.` (Windows / Linux) to toggle the picker.
4. Hover over an element, click to anchor it, type a comment, hit send.
5. In your MCP client, the agent should now have access to the pinned annotations via the `list_pinned_annotations` and `get_annotation` tools.
