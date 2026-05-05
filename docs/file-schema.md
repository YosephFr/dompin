# File schema

This document is the integration contract between DOMPin and any tool that reads its output. Every annotation is a small group of plain files inside a folder you control. There is no protocol, no socket, no daemon — only this layout.

## Top-level layout

```
<your-vault>/
  <domain-folder>/
    <session-folder>/
      README.md
      01.md
      01.png
      01.viewport.png
      01.json
      02.md
      02.png
      ...
```

- The vault root is the directory the user picks the first time they run DOMPin.
- Inside the root, each browsed domain becomes a folder named after its hostname (lowercased, with each `.` preserved). For example, `app.example.com` becomes `app.example.com/`.
- Inside each domain folder, each session becomes a folder.

## Session folder name

`YYYYMMDD-HHMM__<short-name>_<id>`

- `YYYYMMDD-HHMM` is the local timestamp of when the session started.
- `<short-name>` is a slug derived from the session's display name. Spaces and unsafe characters become `-`. Maximum length 32 characters.
- `<id>` is a 4-character alphanumeric suffix that disambiguates concurrent sessions with the same name. It also matches the session ID used internally by the extension.

Example: `20260505-1432__landing_a1f2`.

## Session `README.md`

A short Markdown file describing the session as a whole. Generated when the session is first created and updated whenever a new annotation is added. Typical contents:

```markdown
# Landing — example.com

- Started: 2026-05-05 14:32 local
- Page: https://example.com/landing
- Annotations: 4
- Last update: 2026-05-05 14:51 local

## Annotations

- [01](./01.md) — header overlap on mobile
- [02](./02.md) — wrong gradient on the hero CTA
- [03](./03.md) — pricing table cells misaligned
- [04](./04.md) — footer link contrast
```

The README is meant to be read by humans and by AI agents alike. It is the first thing a tool should open if it wants a quick summary of the session.

## Annotation files

Every annotation produces four files. The filename ordinal is two-digit, zero-padded, and increments per session: `01`, `02`, …, `99`, `100`.

### `NN.md`

Human-readable Markdown. Authoritative for the comment text and for reference links.

Each `NN.md` opens with an `H1` line containing the ordinal and a one-line summary derived from the comment, followed by a blockquote of the full comment. After that, a short bullet list carries the page URL, the capture timestamp, and the element identifiers (selector, XPath, tag, viewport). The two screenshots are referenced inline as `![Element](./NN.png)` and `![Viewport](./NN.viewport.png)`.

The remaining sections, in order, are:

- `Console state at capture` — bulleted list of recent console entries when present.
- `Network failures at capture` — bulleted list of failed requests when the corresponding setting is on and any were captured.
- `Computed styles (subset)` — small tables of the layout, typography, box, and visual style subsets.
- `React` — component name, owner chain, and source location when the page is a React app and React Fiber introspection is enabled.
- `Outer HTML preview` — the captured outer HTML in a fenced HTML block.

The exact wording of section headers may evolve between versions, but the file always contains:

1. A title with the ordinal and the comment summary.
2. A blockquote of the user's full comment.
3. A short metadata list (page URL, capture time, selector, XPath, tag, viewport).
4. Inline references to `NN.png` and `NN.viewport.png`.
5. Any console or network excerpts that were captured.
6. The element outer HTML preview.

### `NN.png` — element-zoned screenshot

PNG of the picked element with surrounding context. Bound by the element's bounding rect with a small padding. This is the screenshot most useful for AI agents that want a tight view of what the user pointed at.

If the annotation is a free region (drag-region mode) instead of an element, this PNG is the rectangular crop of that region.

### `NN.viewport.png` — viewport screenshot

PNG of the entire visible page viewport at the moment of capture. Same dimensions as the browser viewport, scaled by device pixel ratio. Useful for understanding the surrounding layout context.

This file may be missing if the user disabled `Capture viewport screenshot per pin` in settings.

### `NN.json` — structured payload

Full machine-readable payload. Use this when you want to parse rather than read prose. Top-level shape:

```jsonc
{
  "id": "ann_a1f2c3",
  "ordinal": 1,
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
  "screenshots": {
    "viewport": "01.viewport.png",
    "zoned": "01.png"
  },
  "console": [
    { "level": "warn", "timestamp": 1746461593011, "message": "..." }
  ],
  "network": []
}
```

The TypeScript types backing this payload live in `packages/extension/src/common/types.ts` (`AnnotationPayload` and friends). They are the source of truth — this document follows them.

## Free-region annotations

When the user drags a region instead of clicking an element:

- `element` is `null` in `NN.json`.
- `region` has the form `{ "rect": { "x": …, "y": …, "width": …, "height": … } }`.
- `NN.md` lists the region rectangle in place of selector and XPath.
- `NN.png` is the cropped rectangle from the viewport.

## Sanitization rules

- Domain folder names lowercase the host. `Example.com` and `example.com` collide into the same folder.
- Session names are slugged to `[a-z0-9_-]`. Other characters collapse to `-`.
- Filenames never contain spaces, slashes, or non-ASCII characters.
- Existing folders are reused, never overwritten. If a slug collision happens, the 4-character session ID prevents folder name reuse.

## Versioning

The schema version is currently `2` and matches `Settings.schemaVersion` in the extension. Backward-incompatible changes to the file layout will bump this version and emit a per-session `SCHEMA.md` describing the changes.
