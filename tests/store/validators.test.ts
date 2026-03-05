import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  isConfig,
  isProjectMap,
  isDependencyGraph,
  isTaskHistory,
  isPatterns,
  isMetrics,
  isKeywordIndex,
  isDoctorLog,
} from '../../src/store/index.js';

const fixturesDir = path.resolve(__dirname, '../fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), 'utf-8'));
}

describe('isConfig', () => {
  it('returns true for valid config', () => {
    expect(isConfig(loadFixture('sample-config.json'))).toBe(true);
  });

  it('returns false for invalid data', () => {
    expect(isConfig(null)).toBe(false);
    expect(isConfig({})).toBe(false);
    expect(isConfig({ schemaVersion: '1.0.0' })).toBe(false);
    expect(isConfig('string')).toBe(false);
  });

  it('is lenient with extra fields', () => {
    const data = { ...loadFixture('sample-config.json') as object, extraField: 'ok' };
    expect(isConfig(data)).toBe(true);
  });
});

describe('isProjectMap', () => {
  it('returns true for valid project map', () => {
    expect(isProjectMap(loadFixture('sample-project-map.json'))).toBe(true);
  });

  it('returns false for invalid data', () => {
    expect(isProjectMap(null)).toBe(false);
    expect(isProjectMap({ schemaVersion: '1.0.0' })).toBe(false);
  });
});

describe('isDependencyGraph', () => {
  it('returns true for valid dependency graph', () => {
    expect(isDependencyGraph({ schemaVersion: '1.0.0', edges: [], adjacency: {} })).toBe(true);
  });

  it('returns false for invalid data', () => {
    expect(isDependencyGraph(null)).toBe(false);
    expect(isDependencyGraph({ schemaVersion: '1.0.0', edges: 'not array' })).toBe(false);
  });
});

describe('isTaskHistory', () => {
  it('returns true for valid task history', () => {
    expect(isTaskHistory(loadFixture('sample-task-history.json'))).toBe(true);
  });

  it('returns false for invalid data', () => {
    expect(isTaskHistory(null)).toBe(false);
    expect(isTaskHistory({ schemaVersion: '1.0.0' })).toBe(false);
  });
});

describe('isPatterns', () => {
  it('returns true for valid patterns', () => {
    expect(isPatterns(loadFixture('sample-patterns.json'))).toBe(true);
  });

  it('returns false for invalid data', () => {
    expect(isPatterns(null)).toBe(false);
    expect(isPatterns({ schemaVersion: '1.0.0', coOccurrences: [] })).toBe(false);
  });
});

describe('isMetrics', () => {
  it('returns true for valid metrics', () => {
    expect(isMetrics(loadFixture('sample-metrics.json'))).toBe(true);
  });

  it('returns false for invalid data', () => {
    expect(isMetrics(null)).toBe(false);
    expect(isMetrics({ schemaVersion: '1.0.0' })).toBe(false);
  });
});

describe('isKeywordIndex', () => {
  it('returns true for valid keyword index', () => {
    expect(isKeywordIndex({ schemaVersion: '1.0.0', keywordToFiles: {}, fileToKeywords: {} })).toBe(true);
  });

  it('returns false for invalid data', () => {
    expect(isKeywordIndex(null)).toBe(false);
    expect(isKeywordIndex(42)).toBe(false);
  });
});

describe('isDoctorLog', () => {
  it('returns true for valid doctor log', () => {
    expect(isDoctorLog({ schemaVersion: '1.0.0', entries: [] })).toBe(true);
  });

  it('returns false for invalid data', () => {
    expect(isDoctorLog(null)).toBe(false);
    expect(isDoctorLog({ schemaVersion: '1.0.0' })).toBe(false);
  });
});
