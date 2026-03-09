/**
 * co_suggest_model MCP tool — suggest optimal model tier for a task.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { classifyTask } from '../../analyzer/index.js';
import { selectModel } from '../../router/index.js';
import { readProjectMap, readKeywordIndex, readPatterns, readMetrics } from '../../store/index.js';
import { buildContext, formatForMcp } from '../helpers.js';

export const suggestModelSchema = {
  task: z.string().describe('Task description to get model recommendation for'),
};

export function registerSuggestModel(server: McpServer, projectRoot: string): void {
  server.tool(
    'co_suggest_model',
    'Get a recommended model tier (haiku/sonnet/opus) based on task complexity',
    suggestModelSchema,
    async ({ task }) => {
      try {
        const ctx = buildContext(task, projectRoot);

        const projectMap = readProjectMap(projectRoot);
        const keywordIndex = readKeywordIndex(projectRoot);
        const patterns = readPatterns(projectRoot);
        const metrics = readMetrics(projectRoot);

        ctx.classification = classifyTask(
          task,
          projectMap.ok ? projectMap.value : undefined,
          keywordIndex.ok ? keywordIndex.value : undefined,
          patterns.ok ? patterns.value : undefined,
          metrics.ok ? metrics.value : undefined,
        );

        const routing = selectModel(ctx);

        const output = {
          model: routing.model,
          rationale: routing.rationale,
          confidence: Math.round(routing.confidence * 100) + '%',
          overrideApplied: routing.overrideApplied,
          classification: ctx.classification,
        };

        return {
          content: [{ type: 'text' as const, text: formatForMcp(output) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error suggesting model: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
