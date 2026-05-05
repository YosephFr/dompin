import { z } from 'zod';
import type { ToolRegistrar } from './index.js';

const InputSchema = {
  selector: z.string().min(1).describe('CSS selector to scroll into view in the user browser.'),
  url: z.string().url().optional().describe('Optional: URL the selector belongs to.'),
  behavior: z
    .enum(['auto', 'instant', 'smooth'])
    .optional()
    .describe('Scroll behavior to use (default smooth).'),
};

const OutputSchema = {
  delivered: z.boolean(),
  reason: z.string().optional(),
};

export const registerScrollTool: ToolRegistrar = (mcp, { ws }) => {
  mcp.registerTool(
    'scroll_to_element',
    {
      title: 'Scroll element into view',
      description:
        'Asks the connected DOMPin extension to scroll the matching element into view in the user browser.',
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
    },
    async ({ selector, url, behavior }) => {
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
      const delivered = ws.send({
        type: 'scrollTo',
        selector,
        url,
        behavior: behavior as ScrollBehavior | undefined,
      });
      return {
        content: [
          {
            type: 'text',
            text: delivered
              ? `Sent scrollTo for ${selector}.`
              : 'Failed to deliver scrollTo to the extension.',
          },
        ],
        structuredContent: delivered
          ? { delivered: true }
          : { delivered: false, reason: 'send_failed' },
      };
    },
  );
};
