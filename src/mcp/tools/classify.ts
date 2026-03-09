/**
 * co_classify MCP tool — classify a task by type, domain, and complexity.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { classifyTask } from '../../analyzer/index.js';
import { readProjectMap, readKeywordIndex, readPatterns, readMetrics } from '../../store/index.js';
import { formatForMcp } from '../helpers.js';

export const classifySchema = {
  task: z.string().describe('Task description to classify'),
};

export function registerClassify(server: McpServer, projectRoot: string): void {
  server.tool(
    'co_classify',
    'Classify a task by type (bugfix, feature, refactor, etc.), domain, and complexity',
    classifySchema,
    async ({ task }) => {
      try {
        const projectMap = readProjectMap(projectRoot);
        const keywordIndex = readKeywordIndex(projectRoot);
        const patterns = readPatterns(projectRoot);
        const metrics = readMetrics(projectRoot);

        const result = classifyTask(
          task,
          projectMap.ok ? projectMap.value : undefined,
          keywordIndex.ok ? keywordIndex.value : undefined,
          patterns.ok ? patterns.value : undefined,
          metrics.ok ? metrics.value : undefined,
        );

        return {
          content: [{ type: 'text' as const, text: formatForMcp(result) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error classifying task: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
