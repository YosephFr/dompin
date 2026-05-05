import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ToolDeps } from './tools/index.js';
import { registerListTool } from './tools/list.js';
import { registerGetTool } from './tools/get.js';
import { registerConsumeTool } from './tools/consume.js';
import { registerClearTool } from './tools/clear.js';
import { registerHighlightTool } from './tools/highlight.js';
import { registerScrollTool } from './tools/scroll.js';
import { registerStatusTool } from './tools/status.js';

export interface CreatedMcp {
  mcp: McpServer;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export const createMcp = (deps: ToolDeps): CreatedMcp => {
  const mcp = new McpServer(
    { name: 'dompin-server', version: deps.serverVersion },
    {
      capabilities: { tools: {}, logging: {} },
      instructions:
        'DOMPin bridges the DOMPin Chrome extension to MCP coding agents. Pinned annotations from the user browser are queued here; use list_pinned_annotations to discover them, get_annotation to read one, then consume_annotation when done. Use highlight_element / scroll_to_element to point at things in the user browser.',
    },
  );

  registerListTool(mcp, deps);
  registerGetTool(mcp, deps);
  registerConsumeTool(mcp, deps);
  registerClearTool(mcp, deps);
  registerHighlightTool(mcp, deps);
  registerScrollTool(mcp, deps);
  registerStatusTool(mcp, deps);

  let transport: StdioServerTransport | null = null;

  return {
    mcp,
    async start() {
      transport = new StdioServerTransport();
      await mcp.connect(transport);
      deps.logger.info('mcp listening on stdio');
    },
    async stop() {
      try {
        await mcp.close();
      } catch (err) {
        deps.logger.warn('mcp close failed', { error: (err as Error).message });
      }
      transport = null;
    },
  };
};
