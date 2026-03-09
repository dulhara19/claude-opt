/**
 * co_feedback MCP tool — report task outcome to improve future predictions.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { captureOutcome } from '../../learner/index.js';
import { classifyTask } from '../../analyzer/index.js';
import { predictFiles } from '../../predictor/index.js';
import { selectModel } from '../../router/index.js';
import { readProjectMap, readKeywordIndex, readPatterns, readMetrics } from '../../store/index.js';
import { buildContext, formatForMcp } from '../helpers.js';
import type { AdapterResult } from '../../types/pipeline.js';

export const feedbackSchema = {
  task: z.string().describe('The task description that was performed'),
  success: z.boolean().describe('Whether the task completed successfully'),
  filesUsed: z.array(z.string()).optional().describe('List of files actually used/modified'),
};

export function registerFeedback(server: McpServer, projectRoot: string): void {
  server.tool(
    'co_feedback',
    'Report task outcome (success/failure, files used) to improve future predictions',
    feedbackSchema,
    async ({ task, success, filesUsed }) => {
      try {
        const ctx = buildContext(task, projectRoot);

        const projectMap = readProjectMap(projectRoot);
        const keywordIndex = readKeywordIndex(projectRoot);
        const patterns = readPatterns(projectRoot);
        const metrics = readMetrics(projectRoot);

        // Rebuild classification and prediction for the task
        ctx.classification = classifyTask(
          task,
          projectMap.ok ? projectMap.value : undefined,
          keywordIndex.ok ? keywordIndex.value : undefined,
          patterns.ok ? patterns.value : undefined,
          metrics.ok ? metrics.value : undefined,
        );
        ctx.prediction = predictFiles(ctx);
        ctx.routing = selectModel(ctx);

        // Simulate adapter result with the reported outcome
        ctx.adapterResult = {
          output: '',
          exitCode: success ? 0 : 1,
          filesUsed: filesUsed ?? [],
          tokenEstimate: 0,
          isFallback: false,
          durationMs: 0,
        } as AdapterResult;

        captureOutcome(ctx);

        const predictedFiles = ctx.prediction.predictions.map((p) => p.filePath);
        const actualFiles = filesUsed ?? [];
        const hits = actualFiles.filter((f) => predictedFiles.includes(f));

        const output = {
          recorded: true,
          success,
          predictedFiles: predictedFiles.length,
          actualFiles: actualFiles.length,
          hits: hits.length,
          precision: predictedFiles.length > 0
            ? Math.round((hits.length / predictedFiles.length) * 100) + '%'
            : 'N/A',
        };

        return {
          content: [{ type: 'text' as const, text: formatForMcp(output) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error recording feedback: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
