# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.2] — 2026-05-06

### Changed

- **Rename and End session are visible again on the Session card.** The kebab introduced in 0.3.0 was not discoverable enough — users couldn't find the Rename / End controls. They are now back as plain link-style buttons on a secondary row right under **New session**, separated by a thin dashed divider so the visual hierarchy stays clean. **End session** uses a danger-tinted hover state.

## [0.3.1] — 2026-05-06

### Fixed

- **Picker now reports a clear error when it can't reach the page.** Before, clicking **Start picking** on a tab where the content script was not loaded (or could not be loaded) silently did nothing. The side panel now surfaces a localized error message in the banner — for example, _"DOMPin needs to load on this page. Refresh the tab and try again."_ on regular sites where the script never bootstrapped, or _"DOMPin can't pick on chrome:// pages."_ on internal browser pages.
- **Inject-on-demand fallback.** When the page is a regular http(s) site but the content script isn't loaded yet (typical for tabs that were already open before the extension was installed or reloaded), the background now uses `chrome.scripting.executeScript` to inject the script and retries the command automatically — no more "refresh" required for that case.

### Changed

- **Specific error messages by URL type.** The side panel banner now distinguishes between `chrome://`, `chrome-extension://`, `about:`/`edge://`, `view-source:`, `data:`, `file://`, the Chrome Web Store, and unsupported schemes. Each gets its own localized hint pointing to the right next step.
- **Keyboard shortcut and right-click menu also surface the error.** When `⌘⇧.` or **Annotate element with DOMPin** can't reach the page, the side panel opens automatically and shows the same banner, so the failure is no longer hidden when the user wasn't looking at the panel.

### Removed

- **No more demo tab on install.** The first-install flow no longer opens `examples/demo-app/index.html` automatically. The side panel onboarding wizard is the single entry point. The demo files are kept in the repo for local QA only and are no longer bundled into the extension's web-accessible resources.

## [0.3.0] — 2026-05-06

### Added

- **Hero screenshot** at the top of `README.md`: shows DOMPin in action on a real page so visitors get the gist before reading the prose.
- **Kebab menu** in the side panel's Session card for **Rename** and **End session**. The action row no longer wraps to two lines on narrow side panels — only **New session** stays inline.
- **Drop-pin brand logo** (inline SVG) in the side panel and options page header, replacing the placeholder square mark. Matches the extension icon family.

### Changed

- **`New session` always prompts for a name now**, on every install, regardless of past settings. The form opens with placeholder "Session name (optional)" — press Enter without typing to fall back to the default `host_HHMM` name. One predictable flow.
- **Session card layout**: secondary actions (Rename, End session) live under a kebab in the card header instead of crowding the action row.

### Fixed

- **Session auto-naming was inconsistent across Chrome installs.** Some profiles silently auto-named sessions while others prompted, depending on whether the hidden `promptSessionName` flag had ever been toggled. Removed the flag entirely; behavior is now the same everywhere.

### Removed

- The hidden `promptSessionName` capture-options toggle in the options page. Session naming is no longer configurable — the prompt is always shown, with a sensible default available via Enter.

## [0.2.1] — 2026-05-05

### Fixed

- Side panel crashed with `TypeError: Cannot read properties of undefined (reading 'theme')` when settings persisted by v0.1.0 were loaded by v0.2.0. The theme/locale lookups now fall back to defaults when `settings.preferences` is missing.

## [0.2.0] — 2026-05-05

### Added

- **Theme switcher** in the side panel's overflow menu: Auto (system), Light, Dark. Persisted across sessions.
- **Language switcher** in the same menu with English and Español. Auto-detects from the browser locale by default; manual override is persisted.
- **Highlight stays visible while you write the pin**: the element outline + DevTools-style infobox no longer disappear when the comment popup opens.
- **Provisional marker on the element while you type**: the numbered bubble for the pin you're about to save now appears over the element as soon as the popup opens, so you can see the order of the next pin before committing.

### Changed

- `outerHTMLPreview` capped at 800 chars (down from 4096) for non-SVG elements; SVG elements now get a compact `<svg attrs>…</svg>` summary instead of the full path-heavy markup. Drastically smaller `NN.md` and `NN.json` files for icon-heavy pages.
- `## Element` section in `NN.md` now lists the selector inline alongside the tag and XPath; the redundant `**Selector**:` line in the header is gone.

## [0.1.0] — 2026-05-05

Initial public release.

### Added

#### Side panel UX

- Setup wizard with five clearly separated steps: pick folder, name a session, pick elements, one-off shortcut, type comment + save.
- Active-session card with inline name/rename, pin count, last-write time, **Start new session**, **Rename**, and **End session** controls.
- Picker hero with explicit on/off state, a big primary button, and the keyboard-shortcut hint — only shown once a session exists for the tab.
- Pin list for the current page with edit and delete in place.
- Recent sessions for the same domain, surfaced under the active session card.
- Header overflow menu with **Open settings** and **Show onboarding**.
- Footer with vault status dot and a pencil icon to change the vault folder without leaving the panel.
- Error banner and dedicated "vault unreachable" banner with **Pick a new folder** and **Try reconnect** actions.

#### Picker

- Sticky mode (default, from the side-panel button): stays on across multiple pins.
- One-shot mode (keyboard shortcut `Cmd+Shift+.` on Mac, `Ctrl+Shift+.` on Win/Linux): captures a single element and auto-stops.
- Right-click **Annotate element with DOMPin** entry that captures the element under the cursor without dismissing modals, popovers, or dropdowns.
- Element highlight with a DevTools-style infobox showing tag/id/classes and dimensions.
- Drag-region capture (Shift-drag) for free-region annotations when no single element fits.
- Robust unique-selector algorithm with `data-testid` / `data-test` / `id` / `aria-label` / class / nth-of-type fallback, generated-class heuristics, and uniqueness validation.
- Per-page numbered markers, clickable to delete.
- Provisional marker that anchors over the element being captured (no longer in the upper-left corner of viewport screenshots).
- Picker is gated by an active session: any attempt to start it without one opens the side panel and flashes the Session card.

#### Capture pipeline

- Two-screenshot output per pin: `NN.viewport.png` (full viewport with overlay rendered) and `NN.element.png` (clean crop with 24px padding, taken with the overlay temporarily hidden).
- `chrome.tabs.captureVisibleTab` for the viewport pass; off-screen canvas for the element crop.
- Comment popup anchored to the picked element, with optional Web Speech API voice memo.
- React Fiber introspection: component name, owner chain (depth ≤ 5), `_debugSource` when available, sanitized props (depth ≤ 2, no functions, truncated strings).
- Console buffer (last 60 s) and optional network-failure capture.
- Computed-styles subset (layout, typography, box, visual) bundled into the JSON payload.

#### File output

- `<vault>/<domain>/<session>/NN.{md,json,viewport.png,element.png}`.
- Per-session `README.md` index regenerated on every write.
- Session folders named `YYYYMMDD-HHMM__<slug>_<id>` for natural sort and disambiguation.
- Filesystem-illegal characters in session names are sanitized.
- Schema versioned at `2`, documented in `docs/file-schema.md`.

#### Vault management

- File System Access API with the directory handle persisted in IndexedDB.
- Periodic health check (write-then-read of `.dompin-health`) detects when the folder is moved or deleted; the side panel surfaces an unreachable banner with reconnect / pick-a-new-folder actions.
- Permission re-grant flow when Chrome expires the directory access.

#### Other

- Manifest V3 Chrome extension built with Vite + `@crxjs/vite-plugin`.
- Shadow-DOM-isolated overlay; light / dark color-scheme aware.
- Self-generated icon set (16 / 32 / 48 / 128).
- Allowlist with `*` and `*.example.com` patterns.
- Demo app under `examples/demo-app/` for manual picker QA.

#### Tooling

- pnpm monorepo (single workspace package: `@dompin/extension`).
- Strict TypeScript (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, etc.).
- GitHub Actions CI: format check, typecheck, build.
- MIT license, public-friendly README, contribution guide, security policy, issue and PR templates.

[0.3.2]: https://github.com/YosephFr/dompin/releases/tag/v0.3.2
[0.3.1]: https://github.com/YosephFr/dompin/releases/tag/v0.3.1
[0.3.0]: https://github.com/YosephFr/dompin/releases/tag/v0.3.0
[0.2.1]: https://github.com/YosephFr/dompin/releases/tag/v0.2.1
[0.2.0]: https://github.com/YosephFr/dompin/releases/tag/v0.2.0
[0.1.0]: https://github.com/YosephFr/dompin/releases/tag/v0.1.0
