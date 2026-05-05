# Protocol

DOMPin speaks two protocols, both defined in [`packages/shared/src/protocol.ts`](../packages/shared/src/protocol.ts).

## Extension ↔ Server (WebSocket)

JSON messages over a WebSocket on `ws://127.0.0.1:8930/dompin`.

### Extension → Server

| Type                  | Payload                                                |
| --------------------- | ------------------------------------------------------ |
| `hello`               | `protocolVersion`, `extensionVersion`                  |
| `ping`                | (none)                                                 |
| `annotation:new`      | `payload: AnnotationPayload`                           |
| `annotation:cancel`   | `id`                                                   |
| `queue:replace`       | `payloads: AnnotationPayload[]`                        |
| `queue:clear`         | (none)                                                 |

### Server → Extension

| Type                    | Payload                                                |
| ----------------------- | ------------------------------------------------------ |
| `welcome`               | `serverVersion`, `protocolVersion`                     |
| `pong`                  | (none)                                                 |
| `ack`                   | `ids: string[]`                                        |
| `error`                 | `code`, `message`                                      |
| `highlight`             | `selector`, `url?`, `durationMs?`                      |
| `scrollTo`              | `selector`, `url?`, `behavior?`                        |
| `pendingCountChanged`   | `count`                                                |

## MCP tools (server → coding agent)

| Tool                          | Purpose                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `list_pinned_annotations`     | List pending annotation summaries.                      |
| `get_annotation`              | Fetch a full annotation payload by id.                  |
| `consume_annotation`          | Mark an annotation as handled and remove it from queue. |
| `clear_pinned`                | Wipe the queue.                                         |
| `highlight_element`           | Ask the extension to flash an outline on an element.    |
| `scroll_to_element`           | Ask the extension to scroll to an element.              |
| `server_status`               | Server uptime, queue size, extension link state.        |

## AnnotationPayload shape

See [`packages/shared/src/types.ts`](../packages/shared/src/types.ts). Each annotation includes:

- `page`: URL, title, viewport, scroll, color scheme.
- `element`: unique selector, XPath, computed-style subset, React Fiber info if available.
- `region`: optional drag-region rectangle.
- `screenshots`: viewport (always) and zoned (when there is an element).
- `console`: recent console entries captured at annotation time.
- `network`: optional recent network failures.
- `comment` and optional `voiceTranscript`.

## Versioning

`PROTOCOL_VERSION` is exported from `@dompin/shared`. The server rejects connections with mismatched major versions. Minor bumps are backward compatible.
