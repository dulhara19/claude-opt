# Story 1.5: CLAUDE.md Generation & Incremental Scanning

Status: done
Epic: 1 - Project Initialization & Scanning
Story: 1.5
Date: 2026-03-04
Complexity: Medium
Estimated Scope: CLAUDE.md auto-generation from scan data, incremental re-scanning via content hash comparison, delta updates to project map / dependency graph / keyword index

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the optimizer to auto-generate a CLAUDE.md with discovered conventions and support fast re-scans,
So that Claude Code starts each session with project context and I don't wait for full re-scans after small changes.

## Acceptance Criteria (BDD)

### AC1: CLAUDE.md Generation
**Given** a project has been scanned
**When** the CLAUDE.md generator runs
**Then** a CLAUDE.md file is created (or updated) in the project root
**And** it includes: project structure summary, detected conventions (naming, patterns), key file locations, and domain organization
**And** existing manual content in CLAUDE.md is preserved (optimizer appends to a marked section)

### AC2: Incremental Scan — Changed Files
**Given** a previously scanned project where 3 files have changed
**When** `co scan` (or implicit re-scan) runs
**Then** only the 3 changed files are re-processed (detected via content hashing)
**And** unchanged files are skipped entirely
**And** the project map, dependency graph, and keyword index are updated incrementally

### AC3: Incremental Scan — Performance
**Given** a project with 500 files where 5 files changed
**When** incremental re-scan runs
**Then** the scan completes in <2 seconds
**And** the project map reflects the current state of all files

### AC4: Incremental Scan — Deleted Files
**Given** a file has been deleted from the project
**When** incremental re-scan runs
**Then** the file is removed from the project map, dependency graph, and keyword index
**And** no orphan references remain in the knowledge store

## Tasks / Subtasks

- [x] Task 1: Implement incremental scanning in `src/scanner/scanner.ts` (AC: #2, #3, #4)
  - [x] Implement `incrementalScan(projectRoot: string): Result<ScanResult>`
  - [x] Read existing project-map.json from store
  - [x] Walk the current directory tree (same as full scan but with delta detection)
  - [x] For each file found on disk:
    - Compute content hash
    - Compare with stored `contentHash` in existing project map
    - If hash matches: skip file (mark as unchanged)
    - If hash differs: re-process file (mark as changed)
    - If file is new (not in existing project map): process as new file
  - [x] For each file in existing project map but NOT on disk:
    - Mark as deleted
    - Remove from project map `files` and `domains`
  - [x] Build list of changed/new/deleted files for downstream processing

- [x] Task 2: Implement incremental dependency graph update (AC: #2, #4)
  - [x] Implement `updateDependencyGraph(projectRoot: string, changedFiles: string[], deletedFiles: string[], projectMap: ProjectMap): Result<DependencyGraph>`
  - [x] Read existing dependency-graph.json from store
  - [x] For deleted files:
    - Remove all edges where file is source or target
    - Remove file from adjacency map
  - [x] For changed/new files:
    - Remove old edges where file is source (imports may have changed)
    - Re-parse imports using appropriate parser
    - Add new edges
    - Rebuild adjacency entries for affected files
  - [x] Write updated dependency-graph.json via store module

- [x] Task 3: Implement incremental keyword index update (AC: #2, #4)
  - [x] Implement `updateKeywordIndex(projectRoot: string, changedFiles: string[], deletedFiles: string[], projectMap: ProjectMap): Result<KeywordIndex>`
  - [x] Read existing keyword-index.json from store
  - [x] For deleted files:
    - Remove file from `fileToKeywords`
    - Remove file from all entries in `keywordToFiles`
    - Clean up empty keyword entries
  - [x] For changed/new files:
    - Remove old keywords for this file
    - Re-extract keywords using appropriate parser
    - Add new keyword mappings
  - [x] Write updated keyword-index.json via store module

- [x] Task 4: Update scanner public API for incremental mode (AC: #2, #3)
  - [x] Update `scanProject(options: ScanOptions)` to support `scanType: 'incremental'`
  - [x] When `scanType` is `incremental`:
    - Run incremental scan for file map
    - Run incremental update for dependency graph
    - Run incremental update for keyword index
  - [x] When `scanType` is `full`:
    - Run full scan (existing behavior from Story 1.3/1.4)
  - [x] Update `ScanResult` to include: `filesChanged`, `filesNew`, `filesDeleted`, `filesUnchanged` counts
  - [x] Export `incrementalScan` from `src/scanner/index.ts`

- [x] Task 5: Implement CLAUDE.md generator in `src/scanner/claudemd-generator.ts` (AC: #1)
  - [x] Create new file `src/scanner/claudemd-generator.ts`
  - [x] Implement `generateClaudeMd(projectRoot: string, projectMap: ProjectMap, depGraph: DependencyGraph): Result<void>`
  - [x] Generate content sections:
    - **Project Structure Summary**: file counts by type, directory tree overview
    - **Detected Conventions**: naming patterns (kebab-case files, camelCase functions, etc.), test file location patterns
    - **Key File Locations**: entry points (index.ts, main.py), config files (package.json, tsconfig.json)
    - **Domain Organization**: list domains with file counts and key files
    - **Dependency Highlights**: most-imported files (highest in-degree in dependency graph)
  - [x] Wrap optimizer-generated content in markers:
    ```markdown
    <!-- claude-opt:start -->
    ... generated content ...
    <!-- claude-opt:end -->
    ```
  - [x] Write CLAUDE.md to project root

- [x] Task 6: Implement CLAUDE.md content preservation (AC: #1)
  - [x] When CLAUDE.md already exists in project root:
    - Read existing content
    - Find `<!-- claude-opt:start -->` and `<!-- claude-opt:end -->` markers
    - If markers found: replace content between markers with new generated content
    - If markers not found: append markers + generated content at the end
  - [x] Preserve all content outside the marker boundaries (user's manual content)
  - [x] If CLAUDE.md does not exist: create new file with just the generated content

- [x] Task 7: Implement convention detection (AC: #1)
  - [x] Implement `detectConventions(projectMap: ProjectMap): Convention[]` in `src/scanner/claudemd-generator.ts`
  - [x] Detect naming conventions:
    - File naming: kebab-case, camelCase, PascalCase, snake_case
    - Test file patterns: co-located (`*.test.*`), separate dir (`__tests__/`, `tests/`)
  - [x] Detect structural conventions:
    - Source directory name (`src/`, `lib/`, `app/`)
    - Config file patterns (root-level config files)
    - Documentation patterns (`docs/`, `README.md`)
  - [x] Detect project-specific patterns:
    - Barrel exports (`index.ts` in directories)
    - Package manager (npm, yarn, pnpm from lock files)
  - [x] Return conventions with confidence scores (based on how consistently the pattern appears)

- [x] Task 8: Write tests (AC: #1, #2, #3, #4)
  - [x] Create `tests/scanner/incremental-scan.test.ts`
    - [x] Test incremental scan detects changed files via content hash
    - [x] Test incremental scan detects new files
    - [x] Test incremental scan detects deleted files
    - [x] Test unchanged files are skipped (verify by checking no re-parse)
    - [x] Test project map is updated correctly after incremental scan
    - [x] Test dependency graph removes edges for deleted files
    - [x] Test dependency graph updates edges for changed files
    - [x] Test keyword index removes entries for deleted files
    - [x] Test keyword index updates entries for changed files
    - [x] Test no orphan references remain after file deletion
    - [x] Performance test: incremental scan of 5 changed files in <2 seconds
  - [x] Create `tests/scanner/claudemd-generator.test.ts`
    - [x] Test CLAUDE.md generation includes project structure summary
    - [x] Test CLAUDE.md generation includes detected conventions
    - [x] Test CLAUDE.md generation includes key file locations
    - [x] Test CLAUDE.md generation includes domain organization
    - [x] Test existing manual content is preserved when markers exist
    - [x] Test content is appended when no markers exist in existing CLAUDE.md
    - [x] Test new CLAUDE.md is created when none exists
    - [x] Test marker boundaries are correct: `<!-- claude-opt:start -->` / `<!-- claude-opt:end -->`
  - [x] Create `tests/scanner/convention-detection.test.ts`
    - [x] Test naming convention detection (kebab-case, camelCase, etc.)
    - [x] Test test file pattern detection
    - [x] Test structural convention detection
  - [x] Update test fixtures:
    - [x] Add a pre-existing CLAUDE.md to `tests/fixtures/sample-project/` with manual content
    - [x] Modify some fixture files' content for incremental scan testing
  - [x] Verify all tests pass: `npm run test`

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-01 | CLAUDE.md Injection — optimizer writes optimized CLAUDE.md for Claude Code to read natively | [Source: architecture.md#Core Architectural Decisions] |
| AD-03 | Single Store Module — all reads/writes go through store accessors | [Source: architecture.md#Core Architectural Decisions] |
| AD-05 | POSIX Internal — all paths in generated CLAUDE.md content use POSIX format | [Source: architecture.md#Core Architectural Decisions] |

### Scanner Requirements Mapping

| Requirement | Coverage in This Story | Source |
|---|---|---|
| SC-05 | Auto-generate/update CLAUDE.md with discovered conventions — full coverage | [Source: prd.md#Project Scanner] |
| SC-06 | Incremental re-scanning — skip unchanged files, process deltas — full coverage | [Source: prd.md#Project Scanner] |
| SC-07 | Auto-detect project type — convention detection enhances this | [Source: prd.md#Project Scanner] |

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `claudemd-generator.ts`, `incremental-scan.ts` |
| Test files | kebab-case.test.ts | `tests/scanner/claudemd-generator.test.ts` |
| Functions | camelCase | `generateClaudeMd()`, `incrementalScan()`, `detectConventions()` |
| Variables | camelCase | `changedFiles`, `deletedFiles`, `contentHash` |
| Types/Interfaces | PascalCase | `IncrementalScanResult`, `Convention` |
| Constants | UPPER_SNAKE_CASE | `CLAUDE_OPT_START_MARKER`, `CLAUDE_OPT_END_MARKER` |
| Booleans | is/has/should/can prefix | `isChanged`, `isDeleted`, `hasMarkers` |
| JSON fields | camelCase | `contentHash`, `scannedAt`, `scanType` |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**Content Hash Comparison Pattern:**
```typescript
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function computeContentHash(absolutePath: string): string {
  const content = readFileSync(absolutePath, 'utf-8');
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
}

function detectChanges(
  projectRoot: string,
  existingMap: ProjectMap,
  currentFiles: Map<string, FileEntry>
): { changed: string[]; added: string[]; deleted: string[]; unchanged: string[] } {
  const changed: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  const unchanged: string[] = [];

  // Check current files against existing map
  for (const [filePath, entry] of currentFiles) {
    const existing = existingMap.files[filePath];
    if (!existing) {
      added.push(filePath);
    } else if (existing.contentHash !== entry.contentHash) {
      changed.push(filePath);
    } else {
      unchanged.push(filePath);
    }
  }

  // Check for deleted files
  for (const filePath of Object.keys(existingMap.files)) {
    if (!currentFiles.has(filePath)) {
      deleted.push(filePath);
    }
  }

  return { changed, added, deleted, unchanged };
}
```

**CLAUDE.md Marker Pattern:**
```typescript
const CLAUDE_OPT_START_MARKER = '<!-- claude-opt:start -->';
const CLAUDE_OPT_END_MARKER = '<!-- claude-opt:end -->';

function updateClaudeMd(existingContent: string, generatedContent: string): string {
  const startIdx = existingContent.indexOf(CLAUDE_OPT_START_MARKER);
  const endIdx = existingContent.indexOf(CLAUDE_OPT_END_MARKER);

  const wrappedContent = `${CLAUDE_OPT_START_MARKER}\n${generatedContent}\n${CLAUDE_OPT_END_MARKER}`;

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing generated section
    return (
      existingContent.slice(0, startIdx) +
      wrappedContent +
      existingContent.slice(endIdx + CLAUDE_OPT_END_MARKER.length)
    );
  }

  // Append to end
  return existingContent.trimEnd() + '\n\n' + wrappedContent + '\n';
}
```

**CLAUDE.md Generation Template:**
```typescript
function buildClaudeMdContent(
  projectMap: ProjectMap,
  depGraph: DependencyGraph,
  conventions: Convention[]
): string {
  const lines: string[] = [];

  lines.push('# Project Context (Auto-generated by claude-opt)');
  lines.push('');
  lines.push(`**Project Type:** ${projectMap.projectType}`);
  lines.push(`**Total Files:** ${projectMap.totalFiles}`);
  lines.push(`**Last Scanned:** ${projectMap.scannedAt}`);
  lines.push('');

  // Project Structure
  lines.push('## Project Structure');
  // ... file type summary, directory overview

  // Conventions
  lines.push('## Detected Conventions');
  for (const conv of conventions) {
    lines.push(`- ${conv.pattern} (confidence: ${Math.round(conv.confidence * 100)}%)`);
  }

  // Key Files
  lines.push('## Key Files');
  // ... entry points, config files, most-imported files

  // Domain Organization
  lines.push('## Domains');
  for (const [domain, info] of Object.entries(projectMap.domains)) {
    lines.push(`- **${domain}**: ${info.fileCount} files`);
  }

  return lines.join('\n');
}
```

**Result<T> Pattern:** All functions that can fail return `Result<T>`.

**Incremental Update Pattern:**
```typescript
function updateProjectMap(
  existingMap: ProjectMap,
  changes: { changed: string[]; added: string[]; deleted: string[] },
  newEntries: Map<string, FileEntry>
): ProjectMap {
  const updatedFiles = { ...existingMap.files };

  // Remove deleted files
  for (const file of changes.deleted) {
    delete updatedFiles[file];
  }

  // Update changed and add new files
  for (const file of [...changes.changed, ...changes.added]) {
    const entry = newEntries.get(file);
    if (entry) updatedFiles[file] = entry;
  }

  return {
    ...existingMap,
    scannedAt: new Date().toISOString(),
    scanType: 'incremental',
    totalFiles: Object.keys(updatedFiles).length,
    files: updatedFiles,
    domains: buildDomainMap(new Map(Object.entries(updatedFiles))),
  };
}
```

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- CLAUDE.md generator reads from store: `import { readProjectMap, readDependencyGraph } from '../store/index.js';`
- Incremental scan reads and writes store: `import { readProjectMap, writeProjectMap } from '../store/index.js';`
- Generator imports from scanner internals (same module): `import { detectConventions } from './claudemd-generator.js';`
- CLAUDE.md file is written directly to disk (NOT through store — it's a project root file, not a store file)
- Use `writeFileSync` for CLAUDE.md directly since it's not in `.claude-opt/`

[Source: architecture.md#Import Rules]

### Library Versions (Verified March 2026)

| Package | Version | Notes |
|---|---|---|
| Node.js built-ins | node:fs, node:path, node:crypto | File I/O, path resolution, content hashing |
| typescript | 5.9.3 | Strict mode enabled |
| vitest | 4.0.18 | Testing framework |

No external dependencies needed.

### Project Structure Notes

This story creates the following files:

```
claude-opt/
├── src/
│   └── scanner/
│       └── claudemd-generator.ts   # NEW: CLAUDE.md generation + convention detection
├── tests/
│   └── scanner/
│       ├── incremental-scan.test.ts     # NEW: Incremental scanning tests
│       ├── claudemd-generator.test.ts   # NEW: CLAUDE.md generation tests
│       └── convention-detection.test.ts # NEW: Convention detection tests
```

**Modified files from previous stories:**
```
├── src/
│   └── scanner/
│       ├── scanner.ts            # MODIFIED: Add incremental scan mode
│       ├── index.ts              # MODIFIED: Export incremental scan + CLAUDE.md generator
│       ├── types.ts              # MODIFIED: Add incremental scan types
│       ├── dependency-graph.ts   # MODIFIED: Add updateDependencyGraph()
│       └── keyword-extractor.ts  # MODIFIED: Add updateKeywordIndex()
```

### What This Story Does NOT Create

- `co scan` CLI command — Created in Story 1.6 (init command orchestrates scan)
- `co init` CLI command — Created in Story 1.6
- Starter knowledge packs — Created in Story 1.6
- Per-session CLAUDE.md regeneration (before each task) — Created in Epic 2 (Adapter module)
- Convention storage in patterns.json — Created in Epic 3 (Learner module)

### Dependencies on Previous Stories

- **Story 1.1 (Project Scaffold & Core Utilities):** This story depends on:
  - `src/utils/paths.ts` — `toInternal()`, `toOS()` for path normalization
  - `src/utils/errors.ts` — `ok()`, `err()`, `Result<T>`
  - `src/utils/logger.ts` — logging scan progress
  - `src/utils/constants.ts` — `SCHEMA_VERSION`

- **Story 1.2 (Knowledge Store I/O Layer):** This story depends on:
  - `src/store/index.ts` — `readProjectMap()`, `writeProjectMap()`, `readDependencyGraph()`, `writeDependencyGraph()`, `readKeywordIndex()`, `writeKeywordIndex()` for incremental updates

- **Story 1.3 (Project Scanner & File Map):** This story depends on:
  - `src/scanner/scanner.ts` — base scanning logic, file walking, content hashing
  - `src/scanner/types.ts` — `ScanOptions`, `ScanResult`, `FileCategory`
  - `src/scanner/ignore.ts` — ignore pattern handling

- **Story 1.4 (Import Parsers & Dependency Graph):** This story depends on:
  - `src/scanner/parsers/` — parsers for re-processing changed files
  - `src/scanner/dependency-graph.ts` — `buildDependencyGraph()` for full rebuilds, extended here for incremental updates
  - `src/scanner/keyword-extractor.ts` — `buildKeywordIndex()` for full rebuilds, extended here for incremental updates

### References

- [Source: architecture.md#Core Architectural Decisions] — AD-01 (CLAUDE.md Injection), AD-03 (Store), AD-05 (Paths)
- [Source: architecture.md#Complete Project Directory Structure] — Scanner module file tree
- [Source: prd.md#Project Scanner] — SC-05 (CLAUDE.md generation), SC-06 (incremental scanning), SC-07 (project type detection)
- [Source: prd.md#Schema Definitions] — project-map.json contentHash field for delta detection
- [Source: epics.md#Story 1.5] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- All 177 tests pass (16 suites)
- TypeScript strict: zero errors
- ESLint: zero errors
- Build: clean CJS output

### Change Log
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean

### Completion Notes List
- Task 1: Incremental scanning — detectChanges() compares content hashes, walkDirectory reuses existing entries for unchanged files, handles changed/new/deleted
- Task 2: updateDependencyGraph — reads existing graph, removes edges for deleted/changed files, re-parses changed files, rebuilds adjacency
- Task 3: updateKeywordIndex — reads existing index, removes keywords for affected files, re-extracts for changed files, cleans up empty keyword entries
- Task 4: scanProject dispatches to fullScan or incrementalScan based on scanType; ScanResult extended with filesChanged/filesNew/filesDeleted/filesUnchanged; falls back to full scan if no existing project map
- Task 5: CLAUDE.md generator — generates sections: Project Structure (file type counts), Key Files (entry points, config, most-imported), Domains (file counts per domain)
- Task 6: Content preservation — markers `<!-- claude-opt:start -->` / `<!-- claude-opt:end -->`; replaces between markers if found, appends if not
- Task 7: Convention detection — detects file naming (kebab/camel/Pascal/snake), test patterns (co-located/separate/mixed), source directory, barrel exports, package manager
- Task 8: 27 new tests across 3 test files (incremental-scan, claudemd-generator, convention-detection)

### File List
- src/scanner/claudemd-generator.ts (new)
- src/scanner/scanner.ts (updated — incremental scanning, detectChanges)
- src/scanner/dependency-graph.ts (updated — updateDependencyGraph)
- src/scanner/keyword-extractor.ts (updated — updateKeywordIndex)
- src/scanner/types.ts (updated — FileChanges, ScanResult fields)
- src/scanner/index.ts (updated — exports)
- tests/scanner/incremental-scan.test.ts (new)
- tests/scanner/claudemd-generator.test.ts (new)
- tests/scanner/convention-detection.test.ts (new)
