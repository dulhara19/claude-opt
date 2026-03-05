import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateClaudeMd } from '../../src/scanner/claudemd-generator.js';
import { createTempProjectRoot, cleanupTempProjectRoot } from '../helpers/test-store.js';
import type { ProjectMap, DependencyGraph } from '../../src/types/index.js';

function makeProjectMap(overrides?: Partial<ProjectMap>): ProjectMap {
  return {
    schemaVersion: '1.0.0',
    scannedAt: '2026-03-04T12:00:00Z',
    scanType: 'full',
    projectType: 'code',
    totalFiles: 3,
    files: {
      'src/index.ts': {
        path: 'src/index.ts', size: 100, contentHash: 'aaaa',
        lastModified: '', language: 'typescript', domain: 'root',
        imports: [], exports: [], keywords: [],
      },
      'src/utils.ts': {
        path: 'src/utils.ts', size: 80, contentHash: 'bbbb',
        lastModified: '', language: 'typescript', domain: 'root',
        imports: [], exports: [], keywords: [],
      },
      'readme.md': {
        path: 'readme.md', size: 50, contentHash: 'cccc',
        lastModified: '', language: null, domain: 'root',
        imports: [], exports: [], keywords: [],
      },
    },
    domains: {
      root: ['src/index.ts', 'src/utils.ts', 'readme.md'],
    },
    ignoredPatterns: [],
    ...overrides,
  };
}

function makeDepGraph(overrides?: Partial<DependencyGraph>): DependencyGraph {
  return {
    schemaVersion: '1.0.0',
    updatedAt: '2026-03-04T12:00:00Z',
    edges: [{ source: 'src/index.ts', target: 'src/utils.ts', type: 'import' }],
    adjacency: {
      'src/index.ts': { imports: ['src/utils.ts'], importedBy: [] },
      'src/utils.ts': { imports: [], importedBy: ['src/index.ts'] },
    },
    ...overrides,
  };
}

describe('generateClaudeMd', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTempProjectRoot();
  });

  afterEach(() => {
    cleanupTempProjectRoot(projectRoot);
  });

  it('should create CLAUDE.md when none exists', () => {
    const result = generateClaudeMd(projectRoot, makeProjectMap(), makeDepGraph());
    expect(result.ok).toBe(true);

    const content = readFileSync(path.join(projectRoot, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('<!-- claude-opt:start -->');
    expect(content).toContain('<!-- claude-opt:end -->');
    expect(content).toContain('Project Context');
  });

  it('should include project structure summary', () => {
    generateClaudeMd(projectRoot, makeProjectMap(), makeDepGraph());
    const content = readFileSync(path.join(projectRoot, 'CLAUDE.md'), 'utf-8');

    expect(content).toContain('## Project Structure');
    expect(content).toContain('typescript');
    expect(content).toContain('**Project Type:** code');
    expect(content).toContain('**Total Files:** 3');
  });

  it('should include key file locations', () => {
    generateClaudeMd(projectRoot, makeProjectMap(), makeDepGraph());
    const content = readFileSync(path.join(projectRoot, 'CLAUDE.md'), 'utf-8');

    expect(content).toContain('## Key Files');
    expect(content).toContain('src/index.ts');
  });

  it('should include domain organization', () => {
    generateClaudeMd(projectRoot, makeProjectMap(), makeDepGraph());
    const content = readFileSync(path.join(projectRoot, 'CLAUDE.md'), 'utf-8');

    expect(content).toContain('## Domains');
    expect(content).toContain('**root**');
  });

  it('should include most imported files', () => {
    generateClaudeMd(projectRoot, makeProjectMap(), makeDepGraph());
    const content = readFileSync(path.join(projectRoot, 'CLAUDE.md'), 'utf-8');

    expect(content).toContain('Most imported');
    expect(content).toContain('src/utils.ts');
  });

  it('should preserve existing manual content when markers exist', () => {
    const manualContent = [
      '# My Project',
      '',
      'Manual notes here.',
      '',
      '<!-- claude-opt:start -->',
      'old generated content',
      '<!-- claude-opt:end -->',
      '',
      '## More manual notes',
    ].join('\n');

    writeFileSync(path.join(projectRoot, 'CLAUDE.md'), manualContent, 'utf-8');

    generateClaudeMd(projectRoot, makeProjectMap(), makeDepGraph());
    const content = readFileSync(path.join(projectRoot, 'CLAUDE.md'), 'utf-8');

    expect(content).toContain('# My Project');
    expect(content).toContain('Manual notes here.');
    expect(content).toContain('## More manual notes');
    expect(content).not.toContain('old generated content');
    expect(content).toContain('Project Context');
  });

  it('should append content when no markers in existing CLAUDE.md', () => {
    const manualContent = '# My Project\n\nSome notes.\n';
    writeFileSync(path.join(projectRoot, 'CLAUDE.md'), manualContent, 'utf-8');

    generateClaudeMd(projectRoot, makeProjectMap(), makeDepGraph());
    const content = readFileSync(path.join(projectRoot, 'CLAUDE.md'), 'utf-8');

    expect(content).toContain('# My Project');
    expect(content).toContain('Some notes.');
    expect(content).toContain('<!-- claude-opt:start -->');
    expect(content).toContain('<!-- claude-opt:end -->');
  });

  it('should have correct marker boundaries', () => {
    generateClaudeMd(projectRoot, makeProjectMap(), makeDepGraph());
    const content = readFileSync(path.join(projectRoot, 'CLAUDE.md'), 'utf-8');

    const startIdx = content.indexOf('<!-- claude-opt:start -->');
    const endIdx = content.indexOf('<!-- claude-opt:end -->');
    expect(startIdx).toBeLessThan(endIdx);

    const between = content.slice(startIdx + '<!-- claude-opt:start -->'.length, endIdx);
    expect(between).toContain('Project Context');
  });
});
