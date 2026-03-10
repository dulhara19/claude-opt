# Story 1.3: Project Scanner & File Map Generation

Status: done
Epic: 1 - Project Initialization & Scanning
Story: 1.3
Date: 2026-03-04
Complexity: Large
Estimated Scope: Scanner core — file discovery, metadata extraction, domain classification, ignore pattern support, project type detection, project-map.json generation

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to scan my project and generate a complete file map with metadata,
So that the optimizer knows what files exist in my project and can classify them by type and domain.

## Acceptance Criteria (BDD)

### AC1: Code Project Scanning
**Given** a developer runs `co init` on a code project (e.g., TypeScript/Node)
**When** the scanner processes the project directory
**Then** a project-map.json is generated containing every non-ignored file
**And** each file entry includes: relative path (POSIX format), file type, size in bytes, last modified timestamp, and domain classification

### AC2: Non-Code Project Scanning
**Given** a developer runs `co init` on a non-code project (e.g., markdown research files)
**When** the scanner processes the project directory
**Then** markdown files, text files, and document files are included in the project map
**And** the project is classified as "research/docs" type

### AC3: Project Type Auto-Detection
**Given** a project with mixed code and documentation
**When** the scanner auto-detects the project type
**Then** it correctly classifies the project as "code", "research/docs", or "mixed"
**And** the scanning strategy adjusts accordingly (import parsing for code, heading parsing for docs)

### AC4: Ignore Pattern Support
**Given** a project with a `.gitignore` file listing `node_modules/` and `dist/`
**When** the scanner runs
**Then** files matching `.gitignore` patterns are excluded from the project map
**And** files matching `.claudeignore` patterns (if the file exists) are also excluded

### AC5: Performance Target
**Given** a project with up to 500 files
**When** a cold scan runs
**Then** the scan completes in <10 seconds
**And** the project-map.json is written to `.claude-opt/` via the store module

## Tasks / Subtasks

- [x] Task 1: Create scanner module directory structure (AC: #1)
  - [x] Create `src/scanner/index.ts` — barrel export (public API)
  - [x] Create `src/scanner/types.ts` — scanner-specific types
  - [x] Create `src/scanner/scanner.ts` — core scanning logic
  - [x] Create `src/scanner/ignore.ts` — .gitignore/.claudeignore pattern matching
  - [x] Create placeholder files for Stories 1.4-1.6

- [x] Task 2: Define scanner types in `src/scanner/types.ts` (AC: #1, #2, #3)
  - [x] Define `ScanOptions` interface:
    ```typescript
    interface ScanOptions {
      projectRoot: string;
      scanType: 'full' | 'incremental';
      projectType?: 'code' | 'research' | 'mixed';  // auto-detected if not provided
    }
    ```
  - [x] Define `ScanResult` interface:
    ```typescript
    interface ScanResult {
      projectMap: ProjectMap;
      projectType: 'code' | 'research' | 'mixed';
      filesScanned: number;
      filesSkipped: number;
      scanDurationMs: number;
    }
    ```
  - [x] Define `FileCategory` type: `'code' | 'markdown' | 'document' | 'config' | 'test' | 'asset'`
  - [x] Define `IgnorePatterns` interface with patterns from both `.gitignore` and `.claudeignore`
  - [x] Define `FileTypeMap` — mapping from file extension to file type and category

- [x] Task 3: Implement ignore pattern handler in `src/scanner/ignore.ts` (AC: #4)
  - [x] Implement `loadIgnorePatterns(projectRoot: string): IgnorePatterns`
  - [x] Read `.gitignore` from project root (if exists)
  - [x] Read `.claudeignore` from project root (if exists)
  - [x] Parse gitignore-style patterns (glob patterns with negation support)
  - [x] Always ignore by default: `node_modules/`, `.git/`, `.claude-opt/`, `.env`, `*.secret`, `*.key`
  - [x] Implement `shouldIgnore(relativePath: string, patterns: IgnorePatterns): boolean`
  - [x] Support directory patterns (trailing `/`), wildcard patterns (`*`, `**`), negation (`!`)
  - [x] Use a lightweight gitignore parsing approach (can use the `ignore` npm package or implement manually)

- [x] Task 4: Implement file type detection (AC: #1, #2)
  - [x] Create file extension to type mapping in `src/scanner/scanner.ts`:
    - TypeScript: `.ts`, `.tsx` -> type: `typescript`, category: `code`
    - JavaScript: `.js`, `.jsx`, `.mjs`, `.cjs` -> type: `javascript`, category: `code`
    - Python: `.py` -> type: `python`, category: `code`
    - Markdown: `.md`, `.mdx` -> type: `markdown`, category: `markdown`
    - JSON: `.json` -> type: `json`, category: `config`
    - YAML: `.yml`, `.yaml` -> type: `yaml`, category: `config`
    - CSS/SCSS: `.css`, `.scss`, `.less` -> type: `stylesheet`, category: `code`
    - HTML: `.html`, `.htm` -> type: `html`, category: `document`
    - Images: `.png`, `.jpg`, `.svg`, `.gif` -> type: `image`, category: `asset`
    - Text: `.txt`, `.rst` -> type: `text`, category: `document`
  - [x] Implement `detectFileType(filePath: string): { type: string; category: FileCategory }`
  - [x] Handle test file detection: files matching `*.test.*`, `*.spec.*`, `__tests__/` -> category: `test`

- [x] Task 5: Implement project type auto-detection in `src/scanner/scanner.ts` (AC: #3)
  - [x] Implement `detectProjectType(projectRoot: string, files: Map<string, FileEntry>): 'code' | 'research' | 'mixed'`
  - [x] Classification logic:
    - Check for `package.json`, `tsconfig.json`, `setup.py`, `Cargo.toml` -> signals "code"
    - Count code files vs document/markdown files
    - If >70% code files -> "code"
    - If >70% markdown/document files -> "research"
    - Otherwise -> "mixed"
  - [x] Store result in project-map.json `projectType` field

- [x] Task 6: Implement domain classification (AC: #1, #2)
  - [x] Implement `classifyDomain(relativePath: string, projectType: string): string`
  - [x] For code projects: domain = top-level directory name (e.g., `src/analyzer/foo.ts` -> domain: `analyzer`)
  - [x] For research projects: domain = directory path or heading-based grouping
  - [x] For root-level files: domain = `root`
  - [x] For test files: domain = `tests` or mirror the source domain
  - [x] Build the `domains` map in project-map.json: `{ domainName: { files: [], keywords: [], fileCount: N } }`

- [x] Task 7: Implement core scanner in `src/scanner/scanner.ts` (AC: #1, #2, #5)
  - [x] Implement `scanProject(options: ScanOptions): Result<ScanResult>`
  - [x] Walk the directory tree recursively using `readdirSync` with `{ withFileTypes: true }`
  - [x] For each file:
    - Check against ignore patterns (skip if ignored)
    - Get file stats: size, last modified timestamp
    - Detect file type and category
    - Compute content hash (first 8 chars of hex hash using `crypto.createHash('sha256')`)
    - Classify domain
    - Store as POSIX-format relative path
  - [x] Build the complete `ProjectMap` object
  - [x] Write project-map.json via `writeProjectMap()` from store module
  - [x] Track timing and return `ScanResult`

- [x] Task 8: Implement public API in `src/scanner/index.ts` (AC: #1, #2, #3, #4, #5)
  - [x] Export `scanProject` from scanner.ts
  - [x] Export `detectProjectType` for use by init command
  - [x] Export `loadIgnorePatterns` for reuse
  - [x] Export scanner types from types.ts

- [x] Task 9: Create test fixtures (AC: #1, #2, #4)
  - [x] Create `tests/fixtures/sample-project/` directory with a realistic project structure:
    ```
    tests/fixtures/sample-project/
    ├── package.json
    ├── tsconfig.json
    ├── .gitignore              # Contains: node_modules/, dist/, *.log
    ├── src/
    │   ├── index.ts
    │   ├── utils.ts
    │   └── helpers/
    │       └── format.ts
    ├── tests/
    │   └── utils.test.ts
    ├── docs/
    │   ├── readme.md
    │   └── guide.md
    └── node_modules/           # Should be ignored
        └── fake-dep/
            └── index.js
    ```
  - [x] Create `tests/fixtures/research-project/` for non-code project testing:
    ```
    tests/fixtures/research-project/
    ├── chapter-1.md
    ├── chapter-2.md
    ├── references/
    │   ├── paper-1.md
    │   └── notes.md
    └── images/
        └── figure-1.png
    ```

- [x] Task 10: Write tests (AC: #1, #2, #3, #4, #5)
  - [x] Create `tests/scanner/scanner.test.ts`
    - [x] Test scanning a code project produces valid project-map.json
    - [x] Test all file entries have: path (POSIX), type, category, size, lastModified, domain, contentHash
    - [x] Test scanning a research project classifies files correctly
    - [x] Test project type auto-detection: code, research, mixed
    - [x] Test domain classification for code and research projects
    - [x] Test scan result includes correct file count and timing
    - [x] Performance test: scan completes in <10 seconds for fixture project
  - [x] Create `tests/scanner/ignore.test.ts`
    - [x] Test `.gitignore` patterns are loaded and applied
    - [x] Test `.claudeignore` patterns are loaded and applied
    - [x] Test default ignore patterns (node_modules, .git, .claude-opt, .env, *.secret)
    - [x] Test directory patterns (trailing `/`)
    - [x] Test wildcard patterns (`*`, `**`)
    - [x] Test negation patterns (`!`)
    - [x] Test missing .gitignore/.claudeignore is handled gracefully
  - [x] Verify all tests pass: `npm run test`

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-03 | Single Store Module with Typed Accessors — scanner writes project-map.json via store module, never directly | [Source: architecture.md#Core Architectural Decisions] |
| AD-05 | POSIX Internal, Platform-Native I/O — all paths in project-map.json are POSIX format | [Source: architecture.md#Core Architectural Decisions] |
| AD-06 | TypeScript Type Guards for validation | [Source: architecture.md#Core Architectural Decisions] |

### Scanner Requirements Mapping

| Requirement | Coverage in This Story | Source |
|---|---|---|
| SC-01 | Scanner architecture — parsing imports handled in Story 1.4 | [Source: prd.md#Project Scanner] |
| SC-02 | Non-code scanning — file discovery here, heading parsing in Story 1.4 | [Source: prd.md#Project Scanner] |
| SC-03 | Project map generation — full coverage | [Source: prd.md#Project Scanner] |
| SC-07 | Auto-detect project type — full coverage | [Source: prd.md#Project Scanner] |
| SC-10 | Cold scan <10 seconds — full coverage | [Source: prd.md#Project Scanner] |
| SC-11 | .gitignore/.claudeignore support — full coverage | [Source: prd.md#Project Scanner] |

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `scanner.ts`, `ignore.ts`, `dependency-graph.ts` |
| Test files | kebab-case.test.ts | `tests/scanner/scanner.test.ts` |
| Functions | camelCase | `scanProject()`, `shouldIgnore()`, `detectProjectType()` |
| Variables | camelCase | `projectRoot`, `fileEntry`, `ignorePatterns` |
| Types/Interfaces | PascalCase | `ScanResult`, `ScanOptions`, `FileCategory` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_IGNORE_PATTERNS` |
| Booleans | is/has/should/can prefix | `isIgnored`, `hasGitignore` |
| JSON fields | camelCase | `projectType`, `contentHash`, `lastModified` |
| Directories | kebab-case | `src/scanner/`, `src/scanner/parsers/` |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**Scanner Function Pattern:**
```typescript
import { writeProjectMap, type ProjectMap } from '../store/index.js';
import { toInternal } from '../utils/index.js';
import { ok, err, type Result } from '../utils/index.js';

function scanProject(options: ScanOptions): Result<ScanResult> {
  const startTime = Date.now();

  // Load ignore patterns
  const ignorePatterns = loadIgnorePatterns(options.projectRoot);

  // Walk directory tree
  const files = new Map<string, FileEntry>();
  walkDirectory(options.projectRoot, '', ignorePatterns, files);

  // Detect project type
  const projectType = options.projectType ?? detectProjectType(options.projectRoot, files);

  // Build project map
  const projectMap: ProjectMap = {
    schemaVersion: SCHEMA_VERSION,
    scannedAt: new Date().toISOString(),
    scanType: options.scanType,
    projectType,
    totalFiles: files.size,
    files: Object.fromEntries(files),
    domains: buildDomainMap(files),
    ignoredPatterns: ignorePatterns.allPatterns,
  };

  // Write via store module
  const writeResult = writeProjectMap(options.projectRoot, projectMap);
  if (!writeResult.ok) return writeResult;

  return ok({
    projectMap,
    projectType,
    filesScanned: files.size,
    filesSkipped: 0, // tracked during walk
    scanDurationMs: Date.now() - startTime,
  });
}
```

**Content Hash Pattern:**
```typescript
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function computeContentHash(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
}
```

**Path Normalization Pattern:**
```typescript
import { toInternal } from '../utils/index.js';
import { relative, join } from 'node:path';

// Always store as POSIX in project-map.json
const relativePath = toInternal(relative(projectRoot, absolutePath));
```

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

**Confidence Scores:** Always 0.0-1.0 float in data structures.

[Source: architecture.md#Format Patterns, architecture.md#Data Architecture]

### Import Rules (MUST FOLLOW)

- Scanner imports from `store/` for writing: `import { writeProjectMap } from '../store/index.js';`
- Scanner imports from `utils/` for paths and logging: `import { toInternal, logger } from '../utils/index.js';`
- Scanner imports from `types/` for shared types: `import { type ProjectMap, type FileEntry } from '../types/index.js';`
- Scanner is a **write-enabled** module — it can call store write accessors
- Scanner NEVER imports from pipeline modules (analyzer, predictor, etc.)
- Other modules import scanner through `src/scanner/index.ts` barrel only

[Source: architecture.md#Import Rules, architecture.md#Project Structure & Boundaries]

### Library Versions (Verified March 2026)

| Package | Version | Notes |
|---|---|---|
| Node.js built-ins | node:fs, node:path, node:crypto | `readdirSync`, `statSync`, `readFileSync`, `createHash` |
| ignore (optional) | 7.x | npm package for gitignore-style pattern matching — or implement manually |
| typescript | 5.9.3 | Strict mode enabled |
| vitest | 4.0.18 | Testing framework |

Note: If using the `ignore` npm package for gitignore parsing, add it as a production dependency. Otherwise, implement a lightweight gitignore parser manually. Architecture allows up to 15 production deps (currently at 2: commander, chalk).

### Project Structure Notes

This story creates the following files and directories:

```
claude-opt/
├── src/
│   └── scanner/
│       ├── index.ts              # Public API: scanProject(), detectProjectType()
│       ├── types.ts              # ScanOptions, ScanResult, FileCategory, IgnorePatterns
│       ├── scanner.ts            # Core: file walking, metadata, domain classification
│       ├── ignore.ts             # .gitignore + .claudeignore pattern matching
│       └── parsers/
│           └── index.ts          # Placeholder — parser interface + registry (Story 1.4)
├── tests/
│   ├── fixtures/
│   │   ├── sample-project/       # Code project fixture (package.json, src/, tests/, docs/)
│   │   │   ├── package.json
│   │   │   ├── tsconfig.json
│   │   │   ├── .gitignore
│   │   │   ├── src/
│   │   │   │   ├── index.ts
│   │   │   │   ├── utils.ts
│   │   │   │   └── helpers/
│   │   │   │       └── format.ts
│   │   │   ├── tests/
│   │   │   │   └── utils.test.ts
│   │   │   ├── docs/
│   │   │   │   ├── readme.md
│   │   │   │   └── guide.md
│   │   │   └── node_modules/
│   │   │       └── fake-dep/
│   │   │           └── index.js
│   │   └── research-project/     # Non-code project fixture
│   │       ├── chapter-1.md
│   │       ├── chapter-2.md
│   │       ├── references/
│   │       │   ├── paper-1.md
│   │       │   └── notes.md
│   │       └── images/
│   │           └── figure-1.png
│   └── scanner/
│       ├── scanner.test.ts
│       └── ignore.test.ts
```

### What This Story Does NOT Create

- `src/scanner/parsers/typescript.ts` — Created in Story 1.4 (import parsing)
- `src/scanner/parsers/markdown.ts` — Created in Story 1.4 (heading/link parsing)
- `src/scanner/parsers/python.ts` — Created in Story 1.4 (import parsing)
- `src/scanner/dependency-graph.ts` — Created in Story 1.4 (dependency graph building)
- `src/scanner/keyword-extractor.ts` — Created in Story 1.4 (keyword extraction)
- `src/scanner/starter-packs.ts` — Created in Story 1.6 (starter knowledge packs)
- Incremental scanning — Created in Story 1.5 (delta detection via content hash)
- CLAUDE.md generation — Created in Story 1.5
- The `co init` CLI command itself — Created in Story 1.6 (orchestrates everything)

### Dependencies on Previous Stories

- **Story 1.1 (Project Scaffold & Core Utilities):** This story depends on:
  - `src/utils/paths.ts` — `toInternal()`, `toOS()` for cross-platform path normalization
  - `src/utils/errors.ts` — `ok()`, `err()`, `Result<T>` for error handling
  - `src/utils/logger.ts` — logging scanner progress and errors
  - `src/utils/constants.ts` — `SCHEMA_VERSION`, `STORE_DIR`
  - `src/types/` — `ProjectMap`, `FileEntry` types

- **Story 1.2 (Knowledge Store I/O Layer):** This story depends on:
  - `src/store/index.ts` — `writeProjectMap()` to persist scan results
  - `src/store/store.ts` — `ensureStoreDir()` for creating `.claude-opt/`
  - All store types must be fully defined before scanner can write to them

### References

- [Source: architecture.md#Core Architectural Decisions] — AD-03 (Store), AD-05 (Paths)
- [Source: architecture.md#Complete Project Directory Structure] — Scanner module file tree
- [Source: architecture.md#Project Structure & Boundaries] — Scanner boundary, parser boundary
- [Source: architecture.md#Security & Privacy] — Scanner skips .env, credential files, *.secret, *.key
- [Source: prd.md#Project Scanner] — SC-01 to SC-11 requirements
- [Source: prd.md#Schema Definitions] — project-map.json schema
- [Source: epics.md#Story 1.3] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Used `ignore` npm package (v7.x) for gitignore-style pattern matching — robust support for globs, negation, directory patterns
- Added `tests/fixtures/**` to vitest exclude to prevent fixture test files from being picked up as test suites
- Content hash uses first 8 chars of SHA-256 hex digest for compact identifiers
- Scanner reads files synchronously per architecture decision (small files, simplicity)

### Completion Notes List

- All 10 tasks completed successfully
- 93 tests across 8 suites — all passing (31 new scanner/ignore tests + 62 existing)
- Scanner walks directories recursively, respects .gitignore + .claudeignore + default ignores
- File type detection for 20+ extensions across 6 categories (code, markdown, document, config, test, asset)
- Project type auto-detection (code/research/mixed) based on file ratio + indicator files
- Domain classification based on directory structure
- Writes project-map.json via store module (never directly)
- Performance: fixture scans complete in ~10ms (well under 10s target)
- TypeScript strict: zero errors | ESLint: zero errors | Build: clean

### Change Log

- 2026-03-04: Story 1.3 implementation complete — project scanner with file discovery, ignore patterns, type detection, domain classification
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean

### File List

- src/scanner/index.ts (new)
- src/scanner/types.ts (new)
- src/scanner/scanner.ts (new)
- src/scanner/ignore.ts (new)
- src/scanner/parsers/index.ts (new — placeholder)
- src/scanner/dependency-graph.ts (new — placeholder)
- src/scanner/keyword-extractor.ts (new — placeholder)
- src/scanner/starter-packs.ts (new — placeholder)
- vitest.config.ts (modified — added fixtures exclude)
- tests/scanner/scanner.test.ts (new)
- tests/scanner/ignore.test.ts (new)
- tests/fixtures/sample-project/ (new — 10 files)
- tests/fixtures/research-project/ (new — 5 files)
