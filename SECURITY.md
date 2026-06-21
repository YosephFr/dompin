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

DOMPin is a Chrome extension that writes annotation files to a folder the user picks. There is no server, no socket, and no remote endpoint. The trust boundary is the extension itself plus the directory handle it holds.

What the extension can reach:

- The folder the user grants through the File System Access API. Nothing else on disk.
- Any page the user visits that matches the configured allowlist (default: every site). The picker overlay only activates when the user toggles it.
- The browser action and screenshot APIs that Manifest V3 exposes to the extension.
- Failed request metadata for tabs where DOMPin is loaded, when network-failure capture is enabled.
- OpenAI or ElevenLabs transcription endpoints, only when the user configures a provider API key and records an audio note.

What the extension cannot reach:

- Any folder outside the granted directory handle.
- A DOMPin server or telemetry endpoint. DOMPin does not phone home.
- Other extensions or browser profiles.

Known caveats:

- The directory handle persists across browser restarts. A different user on the same operating system account who can launch the same Chrome profile inherits access to the chosen vault folder. Do not store secrets there.
- Annotation files include screenshots of what was on screen at capture time, plus a console buffer. Be mindful of capturing sensitive information into the vault.
- If audio transcription is enabled, recorded audio is sent directly to the selected provider from the extension background worker. API keys are stored in `chrome.storage.local`.

Issues or proposals on tightening this surface are welcome.
