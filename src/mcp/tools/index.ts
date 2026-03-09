/**
 * MCP tools barrel — registers all claude-opt tools on the MCP server.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerClassify } from './classify.js';
import { registerPredict } from './predict.js';
import { registerSuggestModel } from './suggest-model.js';
import { registerCompress } from './compress.js';
import { registerStats } from './stats.js';
import { registerScan } from './scan.js';
import { registerDoctor } from './doctor.js';
import { registerFeedback } from './feedback.js';

export function registerAllTools(server: McpServer, projectRoot: string): void {
  registerClassify(server, projectRoot);
  registerPredict(server, projectRoot);
  registerSuggestModel(server, projectRoot);
  registerCompress(server, projectRoot);
  registerStats(server, projectRoot);
  registerScan(server, projectRoot);
  registerDoctor(server, projectRoot);
  registerFeedback(server, projectRoot);
}
