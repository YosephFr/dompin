# File schema

This document is the integration contract between DOMPin and any tool that reads its output. Every annotation is a small group of plain files inside a folder you control. There is no protocol, no socket, no daemon — only this layout.

## Top-level layout

```
<your-vault>/
  <domain-folder>/
    <session-folder>/
      README.md
      01.md
      01.element.png
      01.viewport.png
      01.json
      01.attachments/
        screenshot.png
      recording/
        recording.json
        transcript.txt
        transcript.srt
        frames/
      debug/
        session.json
        events/
        screenshots/
        network/
        console/
      02.md
      02.element.png
      02.viewport.png
      02.json
      ...
```

- The vault root is the directory the user picks the first time they run DOMPin.
- Inside the root, each browsed domain becomes a folder named after its hostname (lowercased). For example, `app.example.com` becomes `app.example.com/`.
- Inside each domain folder, each session becomes a folder.

## Session folder name

`YYYYMMDD-HHMM__<short-name>_<id>`

- `YYYYMMDD-HHMM` is the local timestamp of when the session started.
- `<short-name>` is a slug derived from the session's display name. Spaces and unsafe characters become `_`. Maximum length 80 characters.
- `<id>` is a 4-character hexadecimal suffix that disambiguates concurrent sessions with the same name.

Example: `20260505-1432__landing_a1f2`.

## Session `README.md`

A short Markdown file describing the session as a whole. Generated when the session is first created and updated whenever an annotation is added, edited, or deleted. Typical contents:

```markdown
# landing-1432

- Domain: example.com
- Started: 2026-05-05T14:32:00.000Z
- Last write: 2026-05-05T14:51:12.214Z
- Annotations: 4

## Pages

- Example — Landing — https://example.com/landing

## Annotations

| #   | When     | Selector                             | Comment                      |
| --- | -------- | ------------------------------------ | ---------------------------- |
| 01  | 14:32:18 | `header.site-header > nav > a.brand` | "header overlap on mobile"   |
| 02  | 14:38:04 | `section.hero .cta`                  | "wrong gradient on hero CTA" |
| 03  | 14:44:52 | `table.pricing td:nth-child(2)`      | "pricing cells misaligned"   |
| 04  | 14:51:12 | `footer .links a`                    | "footer link contrast"       |
```

The README is meant to be read by humans and by AI agents alike. It is the first thing a tool should open if it wants a quick summary of the session.

## Annotation files

Every annotation produces four base files. The filename ordinal is two-digit, zero-padded, and increments per session: `01`, `02`, …, `99`, `100`. If the user adds files to a pin, the annotation also gets an `NN.attachments/` folder.

### `NN.md`

Human-readable Markdown. Authoritative for the comment text and for reference links.

Each `NN.md` opens with an `H1` line containing the ordinal and the session name, followed by a metadata block (when, page, selector). After that, a `## Comment` section carries the user's full comment text. Then come any voice transcript and attachments, the two screenshots, the element details (tag, classes, id, XPath, role, aria-label, React info, outer HTML preview), the computed styles subset, and any console or network excerpts that were captured.

The exact wording and ordering of section headers may evolve between versions, but the file always contains:

1. A title with the ordinal and the session name.
2. A `## Comment` section with the user's full comment.
3. A `## Voice transcript` section when audio transcription was used.
4. A `## Attachments` section when files were attached.
5. Inline references to `NN.viewport.png` and `NN.element.png` under `## Screenshots`.
6. A `## Element` (or `## Region`) section with the structural identifiers.
7. A `## Computed styles` section when computed style data is present.
8. Any `## Console` or `## Network failures` excerpts that were captured.

### `NN.viewport.png` — full viewport with overlay

PNG of the entire visible page viewport at the moment of capture, with DOMPin's overlay rendered on top: every existing annotation marker on the page, a provisional marker for this annotation, the element highlight, and the small infobox showing tag/id/classes/dimensions. Use this to reconstruct what the user was looking at — including which elements were already pinned.

### `NN.element.png` — clean element crop

PNG of the picked element with padding (24 CSS pixels by default), cropped from a clean viewport capture taken with the overlay temporarily hidden. This is the screenshot most useful for AI agents that want a tight, unobstructed view of what the user pointed at.

If the annotation is a free region (drag-region mode) instead of an element, this PNG is the rectangular crop of that region with the same padding.

### `NN.json` — structured payload

Full machine-readable payload. Use this when you want to parse rather than read prose. Top-level shape:

```jsonc
{
  "meta": {
    "sessionId": "...",
    "sessionName": "landing-1432",
    "schemaVersion": 2,
    "ordinal": 1,
    "domain": "example.com",
    "writtenAt": 1746461594021,
    "editedAt": 1746461700000  // present when the comment was edited later
  },
  "id": "ann_a1f2c3",
  "createdAt": 1746461594021,
  "comment": "The site logo and the menu button overlap below 380px.",
  "voiceTranscript": null,
  "page": {
    "url": "https://example.com/landing",
    "title": "Example — Landing",
    "userAgent": "...",
    "viewport": { "width": 412, "height": 812, "devicePixelRatio": 2 },
    "scroll": { "x": 0, "y": 320 },
    "colorScheme": "light",
    "documentReadyState": "complete"
  },
  "element": {
    "selector": "header.site-header > nav > a.brand",
    "xpath": "/html/body/header[1]/nav/a[1]",
    "tag": "a",
    "id": null,
    "classes": ["brand"],
    "role": null,
    "ariaLabel": null,
    "textPreview": "Example",
    "outerHTMLPreview": "<a class=\"brand\" href=\"/\">…</a>",
    "boundingRect": { "x": 16, "y": 22, "width": 148, "height": 28 },
    "computedStyles": { "layout": { ... }, "typography": { ... }, "box": { ... }, "visual": { ... } },
    "react": { "componentName": "BrandLink", "ownerChain": ["Header", "App"], "source": null, "props": {} },
    "scrollAncestorSelector": null
  },
  "region": null,
  "attachments": [
    {
      "id": "att_a1b2",
      "name": "screenshot.png",
      "mimeType": "image/png",
      "size": 184230,
      "path": "./01.attachments/screenshot.png",
      "bytes": 184230
    }
  ],
  "screenshots": {
    "viewport": "./01.viewport.png",
    "element": "./01.element.png"
  },
  "console": [
    { "level": "warn", "timestamp": 1746461593011, "message": "..." }
  ],
  "network": [
    {
      "url": "https://example.com/api/report",
      "method": "GET",
      "status": 0,
      "durationMs": 0,
      "timestamp": 1746461593011,
      "error": "net::ERR_FAILED"
    }
  ]
}
```

The TypeScript types backing this payload live in `packages/extension/src/common/types.ts` (`AnnotationPayload` and friends). They are the source of truth — this document follows them.

## Free-region annotations

When the user drags a region instead of clicking an element:

- `element` is `null` in `NN.json`.
- `region` has the form `{ "rect": { "x": …, "y": …, "width": …, "height": … }, "elements": [...] }`.
- `region.elements` contains up to 24 visible elements whose centers fall inside the rectangle, captured with the same selector, XPath, style, and React metadata shape used for element pins.
- `NN.md` lists the region rectangle and the contained element selectors in place of the single element identifiers.
- `NN.element.png` is the cropped rectangle from a clean viewport (no overlay).

## Attachments

When files are added from the comment popup:

- Files are written into `NN.attachments/` inside the session folder.
- `NN.md` links each file under `## Attachments`.
- `NN.json` lists each attachment with `id`, original `name`, `mimeType`, original `size`, relative `path`, and written `bytes`.
- Attachment filenames are sanitized and de-duplicated within the annotation folder.

## Recorded sessions

When the user records a session, DOMPin writes media and transcript assets under
`recording/` in the session folder:

```
recording/
  README.md
  recording.json
  session.webm
  narration.webm
  transcript.txt
  transcript.srt
  frames/
    frames.json
    frame-01-0004s.png
```

`recording.json` links the saved screen video, microphone narration, transcript, subtitles, and
manual frame marks. During recording, `⌘/Ctrl + Shift + click` stores a frame mark with the
recording timestamp, page URL, pointer coordinates, and clicked target metadata. After transcription
finishes, DOMPin extracts one PNG from the saved video for each mark and lists the exact timestamp in
`recording/README.md`.

## Debug capture sessions

When the user starts Debug capture, DOMPin attaches Chrome's debugger protocol to that tab for the
duration of the capture and writes a technical trace under `debug/`:

```
debug/
  README.md
  session.json
  events/
    0001-view.json
    0002-click.json
  screenshots/
    0001-view.png
    0002-click.png
  network/
    0001-get-api-example-com-v1-status.json
    0001-get-api-example-com-v1-status.response.txt
  console/
    0001.json
```

- `session.json` contains capture timing, counts, active capture settings, paths, and the last
  capture error if any.
- `events/` contains automatic `view` and `click` events with page context, click target metadata,
  elapsed time, screenshot path, and nearby related network request links.
- `screenshots/` contains viewport PNGs taken shortly after each view or click event when screenshot
  capture is enabled.
- `network/` contains one JSON file per captured request plus request/response body sidecar files
  when Chrome exposes them through the debugger protocol. The default mode captures only external
  API-like requests and skips duplicate method+URL pairs. Aggressive mode captures same-origin and
  browser-level request noise too.
- `console/` contains console calls, browser log entries, and uncaught exception details only when
  console capture is enabled.
- `debug/README.md` includes a timeline that links each click or view screenshot to network calls
  that occurred around that moment.

Debug capture is separate from manual annotation ordinals: it does not create `NN.md` pin files and
does not change the annotation count.

## Sanitization rules

- Domain folder names lowercase the host. `Example.com` and `example.com` collide into the same folder.
- Session names are sanitized: filesystem-illegal characters (`\`, `/`, `:`, `*`, `?`, `"`, `<`, `>`, `|`, control chars) are replaced with `_`. Whitespace is normalized.
- Filenames never contain unsafe characters. Spaces in slugs are replaced with `_`.
- Existing folders are reused, never overwritten. The 4-character session ID suffix prevents accidental folder reuse when two sessions share a name.

## Versioning

The annotation payload schema version is currently `2`, recorded as `meta.schemaVersion` in each
annotation JSON. Extension settings have their own independent schema version. Backward-incompatible
changes to annotation files will bump the annotation schema version and emit a per-session
`SCHEMA.md` describing the changes.
