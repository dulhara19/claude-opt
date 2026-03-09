/**
 * co_predict MCP tool — predict relevant files for a task.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { classifyTask } from '../../analyzer/index.js';
import { predictFiles } from '../../predictor/index.js';
import { readProjectMap, readKeywordIndex, readPatterns, readMetrics } from '../../store/index.js';
import { buildContext, formatForMcp } from '../helpers.js';

export const predictSchema = {
  task: z.string().describe('Task description to predict files for'),
};

export function registerPredict(server: McpServer, projectRoot: string): void {
  server.tool(
    'co_predict',
    'Predict which files are relevant to a task. Call before exploring the codebase to focus your search.',
    predictSchema,
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

        const prediction = predictFiles(ctx);

        const output = {
          classification: ctx.classification,
          predictions: prediction.predictions.map((p) => ({
            file: p.filePath,
            score: Math.round(p.score * 100) + '%',
          })),
          totalCandidates: prediction.totalCandidates,
          durationMs: Math.round(prediction.durationMs),
        };

        return {
          content: [{ type: 'text' as const, text: formatForMcp(output) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error predicting files: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
