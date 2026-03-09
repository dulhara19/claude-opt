/**
 * co_doctor MCP tool — run diagnostics or pre-flight checkup.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { runCheckup, runDiagnostics, renderCheckupReport, renderDiagnosticReport } from '../../doctor/index.js';
import { formatForMcp } from '../helpers.js';

export const doctorSchema = {
  checkup: z.boolean().optional().describe('Run pre-flight checkup instead of diagnostics (default: false)'),
};

export function registerDoctor(server: McpServer, projectRoot: string): void {
  server.tool(
    'co_doctor',
    'Run optimizer health diagnostics or a pre-flight checkup',
    doctorSchema,
    async ({ checkup }) => {
      try {
        if (checkup) {
          const result = runCheckup(projectRoot);
          if (!result.ok) {
            return {
              content: [{ type: 'text' as const, text: `Checkup failed: ${result.error}` }],
              isError: true,
            };
          }
          const report = renderCheckupReport(result.value);
          return {
            content: [{ type: 'text' as const, text: formatForMcp(report) }],
          };
        }

        // Default: run diagnostics in report-only mode (no interactive fixes via MCP)
        const result = await runDiagnostics(projectRoot, { reportOnly: true });
        if (!result.ok) {
          return {
            content: [{ type: 'text' as const, text: `Diagnostics failed: ${result.error}` }],
            isError: true,
          };
        }
        const report = renderDiagnosticReport(result.value, true);
        return {
          content: [{ type: 'text' as const, text: formatForMcp(report) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error running doctor: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
