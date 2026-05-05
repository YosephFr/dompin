import type { ToolRegistrar } from './index.js';
import { z } from 'zod';

const OutputSchema = {
  cleared: z.number(),
};

export const registerClearTool: ToolRegistrar = (mcp, { store }) => {
  mcp.registerTool(
    'clear_pinned',
    {
      title: 'Clear all pinned annotations',
      description: 'Removes every annotation from the queue. Returns how many were cleared.',
      inputSchema: {},
      outputSchema: OutputSchema,
    },
    async () => {
      const cleared = store.clear();
      return {
        content: [{ type: 'text', text: `Cleared ${cleared} annotation(s).` }],
        structuredContent: { cleared },
      };
    },
  );
};
