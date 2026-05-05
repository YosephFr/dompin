import { z } from 'zod';
import type { ToolRegistrar } from './index.js';

const InputSchema = {
  selector: z
    .string()
    .min(1)
    .describe('CSS selector to highlight in the user browser. Must match an element in the active page.'),
  url: z
    .string()
    .url()
    .optional()
    .describe('Optional: URL the selector belongs to. The extension may use it to disambiguate across tabs.'),
  durationMs: z
    .number()
    .int()
    .min(100)
    .max(60_000)
    .optional()
    .describe('How long to keep the highlight visible (default 1500 ms).'),
};

const OutputSchema = {
  delivered: z.boolean(),
  reason: z.string().optional(),
};

export const registerHighlightTool: ToolRegistrar = (mcp, { ws }) => {
  mcp.registerTool(
    'highlight_element',
    {
      title: 'Highlight element in user browser',
      description:
        'Asks the connected DOMPin extension to flash a highlight overlay around the element matching the selector, in the user browser. Useful for telling the user "this is what I am editing".',
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
    },
    async ({ selector, url, durationMs }) => {
      if (!ws) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'WebSocket bridge is disabled (--no-ws).' }],
          structuredContent: { delivered: false, reason: 'ws_disabled' },
        };
      }
      if (!ws.isClientConnected()) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'No DOMPin extension is currently connected.' }],
          structuredContent: { delivered: false, reason: 'no_client' },
        };
      }
      const delivered = ws.send({ type: 'highlight', selector, url, durationMs });
      return {
        content: [
          {
            type: 'text',
            text: delivered
              ? `Sent highlight for ${selector}.`
              : 'Failed to deliver highlight to the extension.',
          },
        ],
        structuredContent: delivered
          ? { delivered: true }
          : { delivered: false, reason: 'send_failed' },
      };
    },
  );
};
