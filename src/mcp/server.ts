/**
 * MCP Server entry point — stdio transport for Claude Code integration.
 * Stdout is reserved for MCP protocol; all logs go to stderr.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setLogOutput } from '../utils/logger.js';
import { registerAllTools } from './tools/index.js';
import { resolveProjectRoot } from './helpers.js';

export async function startServer(): Promise<void> {
  // Redirect debug/info logs to stderr so stdout stays clean for MCP protocol
  setLogOutput(process.stderr);

  const projectRoot = resolveProjectRoot();
  const server = new McpServer({
    name: 'claude-opt',
    version: '0.1.0',
  });

  registerAllTools(server, projectRoot);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Auto-start when run directly
startServer().catch((err) => {
  process.stderr.write(`MCP server failed to start: ${err}\n`);
  process.exit(1);
});
