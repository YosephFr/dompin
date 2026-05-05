import { z } from 'zod';
import type { ToolRegistrar } from './index.js';

const OutputSchema = {
  protocolVersion: z.string(),
  serverVersion: z.string(),
  uptimeMs: z.number(),
  pendingCount: z.number(),
  extensionConnected: z.boolean(),
};

export const registerStatusTool: ToolRegistrar = (mcp, deps) => {
  mcp.registerTool(
    'server_status',
    {
      title: 'Server status',
      description:
        'Returns runtime info about the DOMPin server: protocol/server versions, uptime, pending count, and whether the extension is connected.',
      inputSchema: {},
      outputSchema: OutputSchema,
    },
    async () => {
      const status = {
        protocolVersion: deps.protocolVersion,
        serverVersion: deps.serverVersion,
        uptimeMs: Date.now() - deps.serverStartedAt,
        pendingCount: deps.store.size(),
        extensionConnected: deps.ws ? deps.ws.isClientConnected() : false,
      };
      return {
        content: [
          {
            type: 'text',
            text: `dompin-server ${status.serverVersion} (protocol ${status.protocolVersion})\nUptime: ${Math.round(status.uptimeMs / 1000)}s\nPending annotations: ${status.pendingCount}\nExtension connected: ${status.extensionConnected ? 'yes' : 'no'}`,
          },
        ],
        structuredContent: status,
      };
    },
  );
};
