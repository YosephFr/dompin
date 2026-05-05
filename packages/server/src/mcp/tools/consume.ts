import { z } from 'zod';
import type { ToolRegistrar } from './index.js';

const InputSchema = {
  id: z.string().min(1).describe('Annotation id to remove from the queue'),
};

const OutputSchema = {
  removed: z.boolean(),
  reason: z.string().optional(),
  remaining: z.number(),
};

export const registerConsumeTool: ToolRegistrar = (mcp, { store }) => {
  mcp.registerTool(
    'consume_annotation',
    {
      title: 'Consume annotation',
      description:
        'Removes an annotation from the queue once the agent has finished acting on it. Returns whether the removal happened and the remaining count.',
      inputSchema: InputSchema,
      outputSchema: OutputSchema,
    },
    async ({ id }) => {
      const removed = store.remove(id);
      const remaining = store.size();
      const structured = removed
        ? { removed: true, remaining }
        : { removed: false, reason: 'not_found', remaining };
      const text = removed
        ? `Removed ${id}. ${remaining} remaining.`
        : `Annotation ${id} not found. ${remaining} remaining.`;
      return {
        content: [{ type: 'text', text }],
        structuredContent: structured,
      };
    },
  );
};
