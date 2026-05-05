import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Logger } from '../../log.js';
import type { AnnotationStore } from '../../store.js';
import type { WsBridge } from '../../ws/server.js';

export interface ToolDeps {
  store: AnnotationStore;
  ws: WsBridge | null;
  logger: Logger;
  serverVersion: string;
  protocolVersion: string;
  serverStartedAt: number;
}

export type ToolRegistrar = (mcp: McpServer, deps: ToolDeps) => void;
