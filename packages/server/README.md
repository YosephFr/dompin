# @dompin/server

Local MCP server for [DOMPin](https://github.com/YosephFr/dompin). Bridges the DOMPin Chrome extension (over a `127.0.0.1` WebSocket) to MCP-compatible coding agents (Claude Code, Cursor, and any other MCP client) over a stdio transport.

The server is intentionally small: it exposes a queue of annotations the user has pinned in the browser and a couple of bidirectional commands the agent can use to point at things back in the user browser. State lives in memory only — the extension owns persistence.

## Install

The server is published as `@dompin/server` and is meant to be invoked through `npx` from your MCP client config (no global install needed):

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

For development from a checkout:

```bash
pnpm install
pnpm --filter @dompin/server build
node packages/server/dist/index.js
```

The bin entry is `dompin-server`; `pnpm link --global` exposes it on your `PATH` if you prefer that workflow.

## How it fits together

```
Chrome extension <—WS—> dompin-server <—stdio MCP—> coding agent
```

- The extension opens a WebSocket to `ws://127.0.0.1:8930/dompin` and pushes annotations as the user pins them.
- The agent calls MCP tools to read the queue, fetch full payloads (DOM context, computed styles, screenshots), and ask the extension to highlight or scroll to elements in the user browser.

## CLI

```
dompin-server [options]

Options:
  --host <host>    WebSocket bind host (default: 127.0.0.1)
  --port <port>    WebSocket bind port (default: 8930)
  --no-ws          Disable the WebSocket bridge (MCP stdio only)
  --help, -h       Show help
  --version, -v    Print server version

Environment variables:
  DOMPIN_HOST      Same as --host
  DOMPIN_PORT      Same as --port
  DOMPIN_DEBUG     Set to 1 to enable verbose debug logs on stderr
```

CLI flags take precedence over env vars. All logging is written to stderr; stdout is reserved for the MCP transport.

## MCP tools

| Tool                       | Purpose                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `list_pinned_annotations`  | Compact summary list of every queued annotation                                                        |
| `get_annotation`           | Full payload for one annotation (DOM, styles, screenshots as image content blocks, console, network)   |
| `consume_annotation`       | Remove an annotation from the queue once acted on                                                      |
| `clear_pinned`             | Remove every annotation in the queue                                                                   |
| `highlight_element`        | Ask the extension to flash a highlight overlay around a selector in the user browser                   |
| `scroll_to_element`        | Ask the extension to scroll a selector into view in the user browser                                   |
| `server_status`            | Server runtime info: protocol/server versions, uptime, pending count, whether the extension is online  |

Each tool accepts a zod-validated input schema and returns a structured payload alongside human-readable text content.

## WebSocket protocol

- URL: `ws://<host>:<port>/dompin`
- One active extension connection at a time. A new connection cleanly replaces the previous one (close code `1000`, reason `replaced`).
- On connect, the server sends a `welcome` message with `serverVersion` and `protocolVersion`, followed by a `pendingCountChanged` snapshot.
- The extension must send `{ "type": "hello", "protocolVersion": "<server major>.x.y", "extensionVersion": "..." }`. A major version mismatch closes the socket with an `error` of code `PROTOCOL_MISMATCH`.
- Heartbeat: server pings every 30 s; if no pong arrives within 60 s the connection is closed.
- Invalid messages return an `error` with code `INVALID_PAYLOAD`. The server never crashes on malformed input.

See `@dompin/shared` for the canonical `ExtensionMessage` and `ServerMessage` shapes.

## Troubleshooting

- **`Address already in use`**: another process holds the port. Stop it or run with `--port 8931`.
- **MCP client receives garbled output**: something is writing to stdout from inside the server process. Check for stray `console.log` calls; this server logs only to stderr by design.
- **Extension cannot connect**: confirm the host/port match the extension settings and that no host firewall is blocking `127.0.0.1`.
- **Highlight returns `delivered: false`**: no extension is connected, or the bridge is disabled (`--no-ws`). Reload the extension page or remove `--no-ws`.

## License

[MIT](../../LICENSE)
