import type { ProjectMap } from '../types/index.js';

export interface ScanOptions {
  projectRoot: string;
  scanType: 'full' | 'incremental';
  projectType?: 'code' | 'research' | 'mixed';
}

export interface ScanResult {
  projectMap: ProjectMap;
  projectType: 'code' | 'research' | 'mixed';
  filesScanned: number;
  filesSkipped: number;
  filesChanged: number;
  filesNew: number;
  filesDeleted: number;
  filesUnchanged: number;
  dependencyEdges: number;
  keywordsExtracted: number;
  scanDurationMs: number;
}

export interface FileChanges {
  changed: string[];
  added: string[];
  deleted: string[];
  unchanged: string[];
}

export type FileCategory = 'code' | 'markdown' | 'document' | 'config' | 'test' | 'asset';

export interface IgnorePatterns {
  allPatterns: string[];
}

export interface FileTypeInfo {
  type: string;
  category: FileCategory;
}

// ─── Starter pack types ───────────────────────────────────────

export interface StarterCoOccurrence {
  id: string;
  files: string[];
  description: string;
  frequency: number;
  confidence: number;
  decayFactor: number;
}

export interface StarterConvention {
  id: string;
  pattern: string;
  confidence: number;
  evidenceCount: number;
}

export interface StarterPack {
  name: string;
  version: string;
  description: string;
  extends?: string;
  patterns: {
    coOccurrences: StarterCoOccurrence[];
    conventions: StarterConvention[];
    typeAffinities?: Record<string, { description: string }>;
  };
  keyFiles: string[];
}
