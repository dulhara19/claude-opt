/**
 * co_stats MCP tool — gather and display optimizer statistics.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { gatherStatsData } from '../../visibility/stats.js';
import { formatForMcp } from '../helpers.js';

export const statsSchema = {
  domain: z.string().optional().describe('Filter stats by domain name'),
};

export function registerStats(server: McpServer, projectRoot: string): void {
  server.tool(
    'co_stats',
    'Get optimizer statistics: prediction accuracy, token savings, model usage, and domain breakdown',
    statsSchema,
    async ({ domain }) => {
      try {
        const data = gatherStatsData(projectRoot, { domain });
        return {
          content: [{ type: 'text' as const, text: formatForMcp(data) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error gathering stats: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
