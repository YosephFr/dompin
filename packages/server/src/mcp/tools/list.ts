import { z } from 'zod';
import type { ToolRegistrar } from './index.js';

const SummaryShape = z.object({
  id: z.string(),
  createdAt: z.string(),
  pageUrl: z.string(),
  pageTitle: z.string(),
  selector: z.string().nullable(),
  commentPreview: z.string(),
});

const OutputSchema = {
  count: z.number(),
  annotations: z.array(SummaryShape),
};

export const registerListTool: ToolRegistrar = (mcp, { store }) => {
  mcp.registerTool(
    'list_pinned_annotations',
    {
      title: 'List pinned annotations',
      description:
        'Returns the queue of annotations the user has pinned in their browser, ordered oldest-first. Each entry is a compact summary; call get_annotation to fetch the full payload.',
      inputSchema: {},
      outputSchema: OutputSchema,
    },
    async () => {
      const summaries = store.list().map((s) => ({
        id: s.id,
        createdAt: new Date(s.createdAt).toISOString(),
        pageUrl: s.pageUrl,
        pageTitle: s.pageTitle,
        selector: s.selector,
        commentPreview: s.commentPreview,
      }));
      const structured = { count: summaries.length, annotations: summaries };
      const text =
        summaries.length === 0
          ? 'No pinned annotations.'
          : summaries
              .map(
                (s, i) =>
                  `${i + 1}. ${s.id}\n   page: ${s.pageTitle} (${s.pageUrl})\n   selector: ${s.selector ?? '(region)'}\n   created: ${s.createdAt}\n   comment: ${s.commentPreview}`,
              )
              .join('\n\n');
      return {
        content: [{ type: 'text', text }],
        structuredContent: structured,
      };
    },
  );
};
