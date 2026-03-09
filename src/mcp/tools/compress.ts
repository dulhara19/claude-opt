/**
 * co_compress MCP tool — run the full optimization pipeline on a task prompt.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { classifyTask } from '../../analyzer/index.js';
import { predictFiles } from '../../predictor/index.js';
import { selectModel } from '../../router/index.js';
import { compressPrompt } from '../../compressor/index.js';
import { readProjectMap, readKeywordIndex, readPatterns, readMetrics } from '../../store/index.js';
import { buildContext, formatForMcp } from '../helpers.js';

export const compressSchema = {
  task: z.string().describe('Task description to optimize'),
};

export function registerCompress(server: McpServer, projectRoot: string): void {
  server.tool(
    'co_compress',
    'Run the full optimization pipeline: classify, predict files, route model, and compress the prompt',
    compressSchema,
    async ({ task }) => {
      try {
        const ctx = buildContext(task, projectRoot);

        const projectMap = readProjectMap(projectRoot);
        const keywordIndex = readKeywordIndex(projectRoot);
        const patterns = readPatterns(projectRoot);
        const metrics = readMetrics(projectRoot);

        // Stage 1: Classify
        ctx.classification = classifyTask(
          task,
          projectMap.ok ? projectMap.value : undefined,
          keywordIndex.ok ? keywordIndex.value : undefined,
          patterns.ok ? patterns.value : undefined,
          metrics.ok ? metrics.value : undefined,
        );

        // Stage 2: Predict
        ctx.prediction = predictFiles(ctx);

        // Stage 3: Route
        ctx.routing = selectModel(ctx);

        // Stage 4: Compress
        ctx.compression = compressPrompt(ctx);

        const output = {
          classification: ctx.classification,
          predictedFiles: ctx.prediction.predictions.map((p) => ({
            file: p.filePath,
            score: Math.round(p.score * 100) + '%',
          })),
          model: ctx.routing.model,
          rationale: ctx.routing.rationale,
          optimizedPrompt: ctx.compression.optimizedPrompt,
          compressionRatio: ctx.compression.originalLength > 0
            ? Math.round((1 - ctx.compression.compressedLength / ctx.compression.originalLength) * 100) + '%'
            : '0%',
        };

        return {
          content: [{ type: 'text' as const, text: formatForMcp(output) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error compressing: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
