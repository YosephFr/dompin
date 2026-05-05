# Security policy

## Supported versions

DOMPin is pre-1.0. Only the latest release on `main` is supported.

## Reporting a vulnerability

Please open a private security advisory on GitHub:

https://github.com/YosephFr/dompin/security/advisories/new

Do not open public issues for security reports. Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce.
- Affected versions.
- Suggested mitigation, if any.

You should expect an initial response within a few days.

## Threat model summary

DOMPin runs entirely on localhost. The extension communicates with the local MCP server over an unauthenticated WebSocket on `127.0.0.1`. This is by design for a developer tool, but it means:

- Any local process can connect to the server while it is running.
- Any web page you visit could attempt to connect to the local WebSocket port if the server is running and the extension is enabled.

The server validates message shapes and origins. Future versions will offer per-domain allowlists in the extension and an opt-in token for the WebSocket handshake. Issues or proposals on tightening this surface are welcome.
