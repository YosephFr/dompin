# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] — 2026-06-21

### Added

- **Debug capture sessions.** A new side-panel control starts a continuous debugging capture for the active session. It records automatic view and click events, delayed viewport screenshots, Chrome debugger network metadata, request payload sidecars, response body sidecars when available, console calls, browser log entries, and uncaught exceptions under `debug/` in the session folder.
- **Debug capture appears in session output.** Session README files now link to `debug/README.md` when a debug capture exists, without mixing automatic debug events into the manual annotation count.
- **Onboarding now explains debugging capture.** The startup guide describes when to use the new technical investigation mode.

### Changed

- DOMPin now requests Chrome's `debugger` permission so the explicit Debug capture mode can collect full technical network and console evidence for the selected tab.
- Documented recorded-session and debug-capture output folders in `docs/file-schema.md`.

## [0.4.8] — 2026-06-21

### Added

- **Recent sessions can be resumed from the same view.** When the current tab matches a recent session's latest view, the side panel shows **Resume** / **Retomar** so you can reactivate that session and keep adding annotations instead of creating a new folder.
- **The annotation list now covers the full active session.** Pins from the current view stay grouped first, and pins from other views in the same session remain visible below so you can jump back to them.
- **Clicking an annotation focuses it on the page.** DOMPin scrolls to the saved element or region and pulses the target; clicking a pin from another view navigates to that view first.
- **Editing uses the original in-page popup.** The side panel's Edit action reopens the DOMPin popup over the saved element or region with the existing comment, voice transcript, and attachments, so new audio or files can be added in context.
- **The annotation popup can be dragged while writing.** Move it from the header when it covers the target content; the selected element or region stays highlighted in the background.
- **Optional network-failure capture now records real failed requests.** When enabled, the background worker keeps a recent per-tab buffer from `webRequest` and includes those failures in new annotations.

### Fixed

- Annotation edits now preserve full comments instead of starting from the shortened side-panel preview.
- Saved annotation JSON now records `meta.schemaVersion`.
- Security and development docs now match the optional transcription/network surfaces and the current Enter-to-submit behavior.

## [0.4.7] — 2026-05-25

### Changed

- **Screenshots are taken the instant you pick, not when you submit the note.** Clicking a DOM element or releasing a drag-region now freezes the viewport and the element/region crop immediately, then opens the note popup. So short-lived UI — dropdowns, toasts, hover states — is captured as it looked at pick time, even if it changes (or you take a while) while writing the note. (There's a brief moment between the click and the popup while the capture runs.)

### Fixed

- **The note box now focuses on a right-click pick too.** The secondary-button release no longer reaches the page to steal focus, and the textarea re-focuses shortly after opening, so you can type immediately however you picked.
- **Stopping the picker mid-note no longer leaves the note stranded.** If a note is still open when you stop the picker, it's now submitted when it has content and cancelled when it's empty — instead of hanging without saving or closing.

## [0.4.6] — 2026-05-25

### Added

- **Right-click to pin.** While the picker is on, a secondary (right) click picks the element under the cursor just like a primary click. Because many web modals close on a primary outside-click but not a secondary one, this lets you pin elements inside a modal/dropdown without dismissing it. The native context menu is suppressed while picking.

### Changed

- **Enter sends the note.** The comment box now submits on plain `Enter`; use `Shift+Enter` for a newline. (Was `⌘/Ctrl+Enter`.)
- **A region's number sits at the center of its box** instead of the corner where you released the drag. Supersedes the release-corner behavior from 0.4.3; `region.corner` is no longer written to `NN.json`.

### Fixed

- **The note box focuses itself on open.** You can start typing immediately after picking — no extra click into the textarea.
- **A region's box stays visible while you write its note**, matching element pins (whose highlight was already shown during writing).

## [0.4.5] — 2026-05-25

### Changed

- **A pin is just its number until you hover it.** Refines 0.4.4: a pin's box no longer stays on screen by itself — not even while the picker is on. Every pin shows only its numbered dot, and the box appears only while the pointer is over that dot. Hovering a **region** pin reveals the rectangle you drew; hovering an **element** pin now reveals the element's bounds (previously element dots showed nothing on hover). One consistent rule for both kinds, so a region pin no longer lingers with its box drawn while you keep picking.

## [0.4.4] — 2026-05-25

### Changed

- **Region boxes stay out of the way.** The blue box around a region pin is now drawn only while the picker is on. With the picker off, the page shows just the numbered dots; hover a dot to reveal that pin's box. So right after you save a region note and the picker is off, only the number remains, and the box comes back on demand. Element pins were already dots-only.

### Fixed

- **Pins from another view no longer linger after navigating.** On single-page apps that switch views by changing the URL in ways the history hooks didn't catch (for example `?v=…` query routes), the on-page markers for the previous view stayed visible even though the side panel had already moved on. The content script now also listens for `hashchange` and polls the URL as a safety net, so markers re-scope to the current view on any navigation — full load, SPA route, hash, or query-only change.

## [0.4.3] — 2026-05-25

### Changed

- **A dragged region's number lands where you released the mouse.** The numbered marker used to always anchor to the region's top-right corner. It now sits on whichever corner you finished the drag on, stays there while you write the note, and keeps that spot after the pin is saved and on reload. Each region pin records its release corner in `NN.json` (`region.corner`); pins saved by older versions keep the top-right default.

### Fixed

- **The region's number is no longer clipped by the box outline.** The numbered circle now stacks above the region's border (and the comment popup stays above both), so the marker is always fully visible instead of being painted under the frame.

## [0.4.2] — 2026-05-25

### Fixed

- **Dragging a region no longer highlights elements or selects page text.** While you drag the selection box, the blue element-highlight boxes used to keep popping up over whatever was underneath: a hover highlight queued just before the drag began fired ~50 ms later and stuck around for the rest of the drag. The pending hover is now cancelled the moment a region drag starts, so only the dashed selection rectangle shows. Dragging also no longer paints the browser's native text selection over the page — the picker applies `user-select: none` while it's live (and removes it on pause/stop, so the comment box stays editable).

## [0.4.1] — 2026-05-25

### Fixed

- **Voice transcription no longer fails with "Invalid audio payload."** The audio decoder rejected the recorder's `audio/webm;codecs=opus` data URL because its hand-rolled parser couldn't handle the `;codecs=…` MIME parameter. It now decodes the data URL with `fetch().blob()` (the same path screenshots use), so transcription works. This also unblocks **saving voice-only annotations**: when the transcript filled the comment box, a failed transcription left it empty and the **Pin** button stayed disabled — fixing the decode lets the transcript land, which re-enables saving. (The bug was dormant until 0.4.0 made the microphone actually record.)

## [0.4.0] — 2026-05-25

### Added

- **Per-view markers.** A session can span several pages or single-page-app routes. Each pin now remembers the URL it was captured on, and DOMPin shows only the pins that belong to the view currently on screen — both the on-page markers and the side-panel list. Pin the home page, walk into a menu or sub-section, and the home pins step aside; come back and they reappear. Works for full page loads and for SPA route changes (the URL is tracked through `pushState`/`replaceState`/`popstate`). View identity ignores tracking params like `utm_*` so returning to a view doesn't lose its pins.

### Fixed

- **Region pins land where you drew them.** The box and its number badge for a dragged region used to jump to the top-left corner (their position was never persisted) and didn't follow the page when you scrolled. Region coordinates are now stored in document space, so the marker sits exactly on the region you selected and tracks the content as you scroll or reload.
- **Microphone works on any site.** Voice recording used to run inside the page, so it failed silently on sites whose `Permissions-Policy` blocks the microphone and on insecure (`http`) pages, and the permission prompt was confusing. Recording now happens in an offscreen document at the extension's own origin, which is immune to the page's policy. The first time you record, DOMPin asks for microphone access once in a small window; after that it records silently everywhere. The captured audio goes offscreen → background → provider and never enters the page you're annotating.

### Changed

- New `offscreen` permission, used solely to capture microphone audio for transcription.

## [0.3.3] — 2026-05-06

### Changed

- **No more "New session" while a session is active.** The Session card now only shows **Rename** and **End session** while a session is in progress. To start a new one, you have to end the current session first — `Iniciar nueva sesión` reappears as the primary button on the empty card. Cleaner mental model: one explicit cycle per session, no half-overlap.

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

[0.4.8]: https://github.com/YosephFr/dompin/releases/tag/v0.4.8
[0.4.7]: https://github.com/YosephFr/dompin/releases/tag/v0.4.7
[0.4.6]: https://github.com/YosephFr/dompin/releases/tag/v0.4.6
[0.4.5]: https://github.com/YosephFr/dompin/releases/tag/v0.4.5
[0.4.4]: https://github.com/YosephFr/dompin/releases/tag/v0.4.4
[0.4.3]: https://github.com/YosephFr/dompin/releases/tag/v0.4.3
[0.4.2]: https://github.com/YosephFr/dompin/releases/tag/v0.4.2
[0.4.1]: https://github.com/YosephFr/dompin/releases/tag/v0.4.1
[0.4.0]: https://github.com/YosephFr/dompin/releases/tag/v0.4.0
[0.3.3]: https://github.com/YosephFr/dompin/releases/tag/v0.3.3
[0.3.2]: https://github.com/YosephFr/dompin/releases/tag/v0.3.2
[0.3.1]: https://github.com/YosephFr/dompin/releases/tag/v0.3.1
[0.3.0]: https://github.com/YosephFr/dompin/releases/tag/v0.3.0
[0.2.1]: https://github.com/YosephFr/dompin/releases/tag/v0.2.1
[0.2.0]: https://github.com/YosephFr/dompin/releases/tag/v0.2.0
[0.1.0]: https://github.com/YosephFr/dompin/releases/tag/v0.1.0
