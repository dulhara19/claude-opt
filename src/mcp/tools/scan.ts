/**
 * co_scan MCP tool — scan the project and regenerate CLAUDE.md.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { scanProject, generateClaudeMd } from '../../scanner/index.js';
import { readDependencyGraph } from '../../store/index.js';
import { formatForMcp } from '../helpers.js';

export const scanSchema = {
  full: z.boolean().optional().describe('Run a full scan instead of incremental (default: false)'),
};

export function registerScan(server: McpServer, projectRoot: string): void {
  server.tool(
    'co_scan',
    'Scan the project files and regenerate CLAUDE.md context',
    scanSchema,
    async ({ full }) => {
      try {
        const scanType = full ? 'full' : 'incremental';
        const scanResult = scanProject({ projectRoot, scanType });

        if (!scanResult.ok) {
          return {
            content: [{ type: 'text' as const, text: `Scan failed: ${scanResult.error}` }],
            isError: true,
          };
        }

        // Regenerate CLAUDE.md
        const graphResult = readDependencyGraph(projectRoot);
        const depGraph = graphResult.ok
          ? graphResult.value
          : { schemaVersion: '1.0.0', updatedAt: '', edges: [], adjacency: {} };
        generateClaudeMd(projectRoot, scanResult.value.projectMap, depGraph);

        const output = {
          scanType,
          filesScanned: scanResult.value.filesScanned,
          filesChanged: scanResult.value.filesChanged,
          filesNew: scanResult.value.filesNew,
          filesDeleted: scanResult.value.filesDeleted,
          dependencyEdges: scanResult.value.dependencyEdges,
          keywordsExtracted: scanResult.value.keywordsExtracted,
          claudeMdUpdated: true,
        };

        return {
          content: [{ type: 'text' as const, text: formatForMcp(output) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Error scanning: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
