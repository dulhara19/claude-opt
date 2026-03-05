import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Result, ProjectMap, Patterns } from '../types/index.js';
import { ok, err, toOS, logger } from '../utils/index.js';
import { readPatterns, writePatterns } from '../store/index.js';
import type { StarterPack } from './types.js';

// ─── Starter pack directory resolution ────────────────────────

function getStarterPackDir(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, '..', '..', 'starter-packs');
}

// ─── Type guard ───────────────────────────────────────────────

function isStarterPack(value: unknown): value is StarterPack {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.version === 'string' &&
    typeof obj.description === 'string' &&
    typeof obj.patterns === 'object' && obj.patterns !== null &&
    Array.isArray((obj.patterns as Record<string, unknown>).coOccurrences) &&
    Array.isArray((obj.patterns as Record<string, unknown>).conventions) &&
    Array.isArray(obj.keyFiles)
  );
}

// ─── Stack detection ──────────────────────────────────────────

export function detectProjectStack(projectRoot: string, projectMap: ProjectMap): string | null {
  const fileList = Object.keys(projectMap.files);
  const hasFile = (name: string) => fileList.some((f) => f === name || f.endsWith('/' + name));
  const fileExtRatio = (ext: string) => {
    const matching = fileList.filter((f) => f.endsWith(ext)).length;
    return fileList.length > 0 ? matching / fileList.length : 0;
  };

  // Check React first (more specific)
  if (hasFile('package.json')) {
    const pkgPath = path.join(toOS(projectRoot), 'package.json');
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
      const deps = {
        ...(pkg.dependencies as Record<string, unknown> | undefined),
        ...(pkg.devDependencies as Record<string, unknown> | undefined),
      };
      if (deps.react && (fileExtRatio('.tsx') > 0 || fileExtRatio('.jsx') > 0)) {
        return 'react';
      }
    } catch {
      // ignore parse errors
    }
  }

  // TypeScript/Node
  if (hasFile('package.json') && (hasFile('tsconfig.json') || fileExtRatio('.ts') > 0.3)) {
    return 'typescript-node';
  }

  // Python
  if (
    hasFile('setup.py') ||
    hasFile('pyproject.toml') ||
    hasFile('requirements.txt') ||
    fileExtRatio('.py') > 0.3
  ) {
    return 'python';
  }

  // Research/Markdown
  if (fileExtRatio('.md') > 0.5 && !hasFile('package.json') && !hasFile('setup.py')) {
    return 'research-markdown';
  }

  return null;
}

// ─── Starter pack loading ─────────────────────────────────────

function mergeStarterPacks(parent: StarterPack, child: StarterPack): StarterPack {
  return {
    name: child.name,
    version: child.version,
    description: child.description,
    patterns: {
      coOccurrences: [
        ...parent.patterns.coOccurrences,
        ...child.patterns.coOccurrences,
      ],
      conventions: [
        ...parent.patterns.conventions,
        ...child.patterns.conventions,
      ],
      typeAffinities: {
        ...parent.patterns.typeAffinities,
        ...child.patterns.typeAffinities,
      },
    },
    keyFiles: [...new Set([...parent.keyFiles, ...child.keyFiles])],
  };
}

export function loadStarterPack(stackName: string): Result<StarterPack> {
  const packPath = path.join(getStarterPackDir(), `${stackName}.json`);
  try {
    const raw = JSON.parse(readFileSync(packPath, 'utf-8')) as unknown;
    if (!isStarterPack(raw)) return err(`Invalid starter pack format: ${stackName}`);

    // Handle inheritance
    if (raw.extends) {
      const parentResult = loadStarterPack(raw.extends);
      if (parentResult.ok) {
        return ok(mergeStarterPacks(parentResult.value, raw));
      }
    }

    return ok(raw);
  } catch {
    return err(`Starter pack not found: ${stackName}`);
  }
}

// ─── Starter pack application ─────────────────────────────────

export function applyStarterPack(
  projectRoot: string,
  pack: StarterPack,
): Result<void> {
  // Read existing patterns (or use defaults)
  const existingResult = readPatterns(projectRoot);
  const patterns: Patterns = existingResult.ok
    ? existingResult.value
    : {
        schemaVersion: '1.0.0',
        coOccurrences: [],
        typeAffinities: {},
        conventions: [],
      };

  // Seed co-occurrences
  for (const coOcc of pack.patterns.coOccurrences) {
    patterns.coOccurrences.push({
      files: [coOcc.files[0] ?? '', coOcc.files[1] ?? coOcc.files[0] ?? ''],
      count: coOcc.frequency,
      confidence: coOcc.confidence,
    });
  }

  // Seed conventions
  for (const conv of pack.patterns.conventions) {
    patterns.conventions.push({
      pattern: conv.pattern,
      description: conv.pattern,
      examples: [],
    });
  }

  // Seed type affinities
  if (pack.patterns.typeAffinities) {
    for (const [taskType] of Object.entries(pack.patterns.typeAffinities)) {
      if (!patterns.typeAffinities[taskType]) {
        patterns.typeAffinities[taskType] = {
          taskType,
          files: [],
          confidence: 0.5,
        };
      }
    }
  }

  const writeResult = writePatterns(projectRoot, patterns);
  if (!writeResult.ok) {
    logger.error('starter-packs', 'Failed to write patterns', writeResult.error);
    return err(writeResult.error);
  }

  logger.info(
    'starter-packs',
    `Applied starter pack "${pack.name}": ${pack.patterns.coOccurrences.length} co-occurrences, ${pack.patterns.conventions.length} conventions`,
  );
  return ok(undefined);
}
