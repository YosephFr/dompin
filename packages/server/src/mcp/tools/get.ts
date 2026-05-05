import { z } from 'zod';
import type { AnnotationPayload } from '@dompin/shared';
import type { ToolRegistrar } from './index.js';

interface DecodedImage {
  mimeType: string;
  data: string;
}

const dataUrlPattern = /^data:([^;,]+);base64,(.*)$/;

const decodeScreenshot = (raw: string): DecodedImage | null => {
  if (!raw) return null;
  const match = dataUrlPattern.exec(raw);
  if (match) {
    const [, mimeType, data] = match;
    if (!mimeType || !data) return null;
    return { mimeType, data };
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.length > 32) {
    return { mimeType: 'image/png', data: raw.replace(/\s+/g, '') };
  }
  return null;
};

const buildSummaryText = (p: AnnotationPayload): string => {
  const lines: string[] = [];
  lines.push(`# Annotation ${p.id}`);
  lines.push(`Created: ${new Date(p.createdAt).toISOString()}`);
  lines.push(`Page: ${p.page.title}`);
  lines.push(`URL: ${p.page.url}`);
  lines.push(
    `Viewport: ${p.page.viewport.width}x${p.page.viewport.height} @ dpr ${p.page.viewport.devicePixelRatio}`,
  );
  lines.push(`Color scheme: ${p.page.colorScheme}`);
  lines.push('');
  if (p.element) {
    lines.push(`## Element`);
    lines.push(`Tag: ${p.element.tag}`);
    lines.push(`Selector: ${p.element.selector}`);
    lines.push(`XPath: ${p.element.xpath}`);
    if (p.element.role) lines.push(`Role: ${p.element.role}`);
    if (p.element.ariaLabel) lines.push(`Aria-label: ${p.element.ariaLabel}`);
    if (p.element.id) lines.push(`Id: ${p.element.id}`);
    if (p.element.classes.length > 0) lines.push(`Classes: ${p.element.classes.join(' ')}`);
    if (p.element.textPreview) lines.push(`Text preview: ${p.element.textPreview}`);
    const r = p.element.boundingRect;
    lines.push(`Rect: x=${r.x} y=${r.y} w=${r.width} h=${r.height}`);
    if (p.element.react?.componentName) {
      lines.push(`React component: ${p.element.react.componentName}`);
      if (p.element.react.source) {
        const s = p.element.react.source;
        lines.push(`React source: ${s.fileName}:${s.lineNumber}:${s.columnNumber}`);
      }
    }
    lines.push('');
    lines.push('### Outer HTML preview');
    lines.push('```html');
    lines.push(p.element.outerHTMLPreview);
    lines.push('```');
  } else if (p.region) {
    lines.push(`## Region`);
    const r = p.region.rect;
    lines.push(`Rect: x=${r.x} y=${r.y} w=${r.width} h=${r.height}`);
  }
  lines.push('');
  lines.push('## Comment');
  lines.push(p.comment.length > 0 ? p.comment : '(empty)');
  if (p.voiceTranscript) {
    lines.push('');
    lines.push('## Voice transcript');
    lines.push(p.voiceTranscript);
  }
  if (p.console.length > 0) {
    lines.push('');
    lines.push(`## Console (${p.console.length})`);
    for (const e of p.console.slice(-25)) {
      lines.push(`[${e.level}] ${new Date(e.timestamp).toISOString()} ${e.message}`);
    }
  }
  if (p.network && p.network.length > 0) {
    lines.push('');
    lines.push(`## Network (${p.network.length})`);
    for (const e of p.network.slice(-25)) {
      lines.push(`${e.method} ${e.status} ${e.url} (${e.durationMs}ms)`);
    }
  }
  return lines.join('\n');
};

const InputSchema = {
  id: z.string().min(1).describe('Annotation id returned by list_pinned_annotations'),
};

const StructuredOutputSchema = {
  payload: z.unknown(),
  hasViewportScreenshot: z.boolean(),
  hasZonedScreenshot: z.boolean(),
};

export const registerGetTool: ToolRegistrar = (mcp, { store }) => {
  mcp.registerTool(
    'get_annotation',
    {
      title: 'Get annotation payload',
      description:
        'Returns the full annotation payload (element context, computed styles, screenshots, console state) for a given id. Screenshots are returned as image content blocks when possible.',
      inputSchema: InputSchema,
      outputSchema: StructuredOutputSchema,
    },
    async ({ id }) => {
      const payload = store.get(id);
      if (!payload) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Annotation ${id} not found.` }],
          structuredContent: {
            payload: null,
            hasViewportScreenshot: false,
            hasZonedScreenshot: false,
          },
        };
      }

      const viewport = decodeScreenshot(payload.screenshots.viewport);
      const zoned = payload.screenshots.zoned ? decodeScreenshot(payload.screenshots.zoned) : null;

      const content: Array<
        { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
      > = [{ type: 'text', text: buildSummaryText(payload) }];

      if (viewport) {
        content.push({ type: 'text', text: 'Viewport screenshot:' });
        content.push({ type: 'image', data: viewport.data, mimeType: viewport.mimeType });
      } else if (payload.screenshots.viewport) {
        content.push({
          type: 'text',
          text:
            'Viewport screenshot (raw, not decodable as image):\n' +
            payload.screenshots.viewport.slice(0, 256) +
            '…',
        });
      }
      if (zoned) {
        content.push({ type: 'text', text: 'Zoned screenshot:' });
        content.push({ type: 'image', data: zoned.data, mimeType: zoned.mimeType });
      }

      return {
        content,
        structuredContent: {
          payload,
          hasViewportScreenshot: viewport !== null,
          hasZonedScreenshot: zoned !== null,
        },
      };
    },
  );
};
