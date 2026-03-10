# Story 1.2: Knowledge Store I/O Layer

Status: done
Epic: 1 - Project Initialization & Scanning
Story: 1.2
Date: 2026-03-04
Complexity: Large
Estimated Scope: Persistence layer — 9 JSON file schemas, typed read/write accessors, atomic writes, type guards, schema migration

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want project knowledge persisted in human-readable JSON files with reliable atomic writes,
So that the optimizer remembers data between sessions and I can inspect or edit the store directly.

## Acceptance Criteria (BDD)

### AC1: Store Directory Initialization
**Given** a project with claude-opt initialized
**When** the store module initializes
**Then** a `.claude-opt/` directory is created in the project root
**And** it contains separate JSON files: config.json, project-map.json, dependency-graph.json, task-history.json, patterns.json, metrics.json, keyword-index.json, doctor-log.json, and .schema-version

### AC2: Atomic Writes
**Given** any module calls a store write function (e.g., `writeTaskHistory(data)`)
**When** the write executes
**Then** data is written to a `.tmp` file first, then atomically renamed to the target file
**And** the JSON is formatted with 2-space indentation for human readability
**And** the write completes in <50ms

### AC3: Typed Reads with Validation
**Given** any module calls a store read function (e.g., `readProjectMap()`)
**When** the read executes
**Then** the JSON file is parsed and validated using a type guard (e.g., `isProjectMap()`)
**And** if validation fails, a `Result` with `ok: false` is returned (fail-open, no throw)
**And** the read completes in <50ms

### AC4: Task History Archiving
**Given** the task-history.json file has reached 500 entries
**When** a new task entry is added
**Then** the oldest entries beyond 500 are moved to `.claude-opt/archive/task-history-{date}.json`
**And** archive files are read-only during normal operation

### AC5: Schema Migration
**Given** the `.schema-version` file shows an older version than the installed package
**When** the store module initializes
**Then** sequential non-destructive migrations run (adding fields with defaults, never removing)
**And** `.schema-version` is updated to the current version
**And** no knowledge data is lost during migration

### AC6: Module Access Enforcement
**Given** different modules access the store
**When** pipeline stages (analyzer, predictor, router, compressor) call store functions
**Then** only read-only accessors are available to them
**And** write accessors are only available to learner, tracker, doctor, and scanner modules

### AC7: Per-Project Isolation
**Given** a project's `.claude-opt/` directory
**When** a different project initializes claude-opt
**Then** it gets its own separate `.claude-opt/` directory with isolated data

## Tasks / Subtasks

- [x] Task 1: Define complete store type schemas in `src/types/store.ts` (AC: #1, #3)
  - [x] Replace the placeholder interfaces from Story 1.1 with full type definitions
  - [x] Define `Config` interface matching config.json schema
  - [x] Define `ProjectMap` and `FileEntry` interfaces matching project-map.json schema
  - [x] Define `DependencyGraph`, `DependencyEdge`, and `AdjacencyEntry` interfaces matching dependency-graph.json schema
  - [x] Define `TaskHistory`, `TaskEntry`, `TaskClassification`, `TaskPrediction`, `TaskRouting`, `TaskTokens`, `TaskFeedback` interfaces matching task-history.json schema
  - [x] Define `Patterns`, `CoOccurrence`, `TypeAffinity`, `Convention` interfaces matching patterns.json schema
  - [x] Define `Metrics`, `DomainMetrics`, `TokenWindow`, `PredictionTrendPoint` interfaces matching metrics.json schema
  - [x] Define `KeywordIndex` interface matching keyword-index.json schema
  - [x] Define `DoctorLog`, `DoctorEntry`, `Finding`, `DoctorAction`, `HealthScore` interfaces matching doctor-log.json schema
  - [x] Define `StoreFile` union type of all store file types
  - [x] Export all types from `src/types/index.ts` barrel

- [x] Task 2: Create store module directory structure (AC: #1)
  - [x] Create `src/store/index.ts` — barrel export (public API)
  - [x] Create `src/store/types.ts` — store-internal types (file paths, write options)
  - [x] Create `src/store/store.ts` — core I/O functions
  - [x] Create `src/store/validators.ts` — type guard functions
  - [x] Create `src/store/migration.ts` — schema migration runner

- [x] Task 3: Implement core store I/O in `src/store/store.ts` (AC: #1, #2, #3, #7)
  - [x] Implement `resolveStorePath(projectRoot: string): string`
  - [x] Implement `resolveFilePath(projectRoot: string, fileName: string): string`
  - [x] Implement `ensureStoreDir(projectRoot: string): Result<void>`
  - [x] Implement `atomicWrite(filePath: string, data: unknown): Result<void>`
  - [x] Implement `readJSON<T>(filePath: string): Result<T>`
  - [x] Implement `initializeStore(projectRoot: string): Result<void>`
  - [x] Use `writeFileSync`/`readFileSync` (synchronous per architecture)
  - [x] Use `JSON.stringify(data, null, 2)` for human-readable output
  - [x] All paths normalized via `utils/paths.ts`
  - [x] Return `Result<T>` for all operations — never throw

- [x] Task 4: Implement typed accessors in `src/store/index.ts` (AC: #3, #6)
  - [x] Implement read-only accessors (9 read functions)
  - [x] Implement write accessors (9 write functions)
  - [x] Each read accessor calls `readJSON()` then validates with corresponding type guard
  - [x] Each write accessor validates data with type guard before writing
  - [x] Export read-only type `StoreReader` and read-write type `StoreWriter` for module access enforcement

- [x] Task 5: Implement type guard validators in `src/store/validators.ts` (AC: #3)
  - [x] Implement all 8 type guards (isConfig, isProjectMap, isDependencyGraph, isTaskHistory, isPatterns, isMetrics, isKeywordIndex, isDoctorLog)
  - [x] Each guard checks top-level fields, correct types, nested structure
  - [x] Guards are lenient — check shape, not every nested field

- [x] Task 6: Implement default store data factories (AC: #1)
  - [x] Implement all 8 factory functions in `src/store/defaults.ts`
  - [x] All defaults use `SCHEMA_VERSION` from `utils/constants.ts`

- [x] Task 7: Implement task history archiving in `src/store/store.ts` (AC: #4)
  - [x] Implement `archiveOldTasks(projectRoot, history): Result<TaskHistory>`
  - [x] Archives oldest entries beyond MAX_HISTORY_CAP to `archive/task-history-{date}.json`
  - [x] Updates count and oldestArchive fields
  - [x] Archive writes use `atomicWrite()`

- [x] Task 8: Implement schema migration in `src/store/migration.ts` (AC: #5)
  - [x] Implement `checkSchemaVersion()` and `runMigrations()`
  - [x] Migration registry infrastructure with sequential execution
  - [x] Non-destructive design, updates `.schema-version` after migration

- [x] Task 9: Create test fixtures (AC: #1, #3)
  - [x] Create 5 sample JSON fixtures and `tests/helpers/test-store.ts` helper

- [x] Task 10: Write tests (AC: #1, #2, #3, #4, #5, #6, #7)
  - [x] `tests/store/store.test.ts` — 14 tests (ensureStoreDir, atomicWrite, readJSON, initializeStore, isolation, accessors, archiving, performance)
  - [x] `tests/store/validators.test.ts` — 17 tests (valid data, invalid data, leniency)
  - [x] `tests/store/migration.test.ts` — 5 tests (version check, mismatch, migrations, non-destructive)

- [x] Task 11: Verify integration (AC: #1, #2, #3)
  - [x] All store functions return `Result<T>` — never throw
  - [x] All JSON output is 2-space indented
  - [x] Store module is a leaf dependency
  - [x] `npm run typecheck` — zero errors
  - [x] `npm run test` — 62/62 tests pass
  - [x] `npm run lint` — no violations

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-03 | Single Store Module with Typed Accessors — one `store/` module owns all JSON file I/O | [Source: architecture.md#Core Architectural Decisions] |
| AD-05 | POSIX Internal, Platform-Native I/O — all paths stored as POSIX in JSON | [Source: architecture.md#Core Architectural Decisions] |
| AD-06 | TypeScript Type Guards for validation — no Zod, no Ajv, custom `isX()` guards | [Source: architecture.md#Core Architectural Decisions] |

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `store.ts`, `validators.ts`, `migration.ts` |
| Test files | kebab-case.test.ts | `tests/store/store.test.ts` |
| Functions | camelCase | `readProjectMap()`, `writeTaskHistory()`, `isPatterns()` |
| Variables | camelCase | `projectRoot`, `filePath`, `schemaVersion` |
| Types/Interfaces | PascalCase | `ProjectMap`, `TaskHistory`, `Config` |
| Constants | UPPER_SNAKE_CASE | `SCHEMA_VERSION`, `MAX_HISTORY_CAP` |
| Booleans | is/has/should/can prefix | `isValid`, `hasArchive`, `needsMigration` |
| JSON fields | camelCase | `schemaVersion`, `contentHash`, `lastModified` |
| Directories | kebab-case | `src/store/` |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**Atomic Write Pattern:**
```typescript
import { writeFileSync, renameSync } from 'node:fs';

function atomicWrite(filePath: string, data: unknown): Result<void> {
  try {
    const json = JSON.stringify(data, null, 2);  // human-readable, 2-space indent
    const tmpPath = filePath + '.tmp';
    writeFileSync(tmpPath, json, 'utf-8');        // write to temp
    renameSync(tmpPath, filePath);                 // atomic rename
    return ok(undefined);
  } catch (error) {
    return err(`Failed to write ${filePath}: ${String(error)}`);
  }
}
```

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): Result<T> { return { ok: true, value }; }
function err<T>(error: string): Result<T> { return { ok: false, error }; }
```

**Type Guard Pattern:**
```typescript
function isProjectMap(data: unknown): data is ProjectMap {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.schemaVersion === 'string' &&
    typeof obj.totalFiles === 'number' &&
    typeof obj.files === 'object' && obj.files !== null
  );
}
```

**Typed Read Accessor Pattern:**
```typescript
function readProjectMap(projectRoot: string): Result<ProjectMap> {
  const filePath = resolveFilePath(projectRoot, 'project-map.json');
  const raw = readJSON<unknown>(filePath);
  if (!raw.ok) return raw;
  if (!isProjectMap(raw.value)) {
    return err('Invalid project-map.json format');
  }
  return ok(raw.value);
}
```

**Module Access Enforcement Pattern:**
```typescript
// Read-only accessors for pipeline stages
export interface StoreReader {
  readConfig: (projectRoot: string) => Result<Config>;
  readProjectMap: (projectRoot: string) => Result<ProjectMap>;
  readDependencyGraph: (projectRoot: string) => Result<DependencyGraph>;
  readTaskHistory: (projectRoot: string) => Result<TaskHistory>;
  readPatterns: (projectRoot: string) => Result<Patterns>;
  readMetrics: (projectRoot: string) => Result<Metrics>;
  readKeywordIndex: (projectRoot: string) => Result<KeywordIndex>;
  readDoctorLog: (projectRoot: string) => Result<DoctorLog>;
}

// Full read-write accessors for learner, tracker, doctor, scanner
export interface StoreWriter extends StoreReader {
  writeConfig: (projectRoot: string, data: Config) => Result<void>;
  writeProjectMap: (projectRoot: string, data: ProjectMap) => Result<void>;
  // ... all write accessors
}
```

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display.

**Null vs Undefined:** JSON uses `null`, TypeScript uses `undefined` for optional params, `null` for explicit "no value".

[Source: architecture.md#Format Patterns, architecture.md#Data Architecture]

### JSON Schema References

**config.json:**
```json
{
  "schemaVersion": "1.0.0",
  "projectName": "my-project",
  "projectType": "code",
  "tokenBudget": 44000,
  "windowDurationMs": 18000000,
  "budgetWarnings": { "inline": 0.75, "blocking": 0.90 },
  "doctorMode": "supervised",
  "doctorThreshold": 0.60,
  "taskHistoryCap": 500,
  "createdAt": "2026-03-04T09:00:00Z",
  "updatedAt": "2026-03-04T09:00:00Z"
}
```

**project-map.json:**
```json
{
  "schemaVersion": "1.0.0",
  "scannedAt": "2026-03-04T09:00:05Z",
  "scanType": "full",
  "projectType": "code",
  "totalFiles": 0,
  "files": {},
  "domains": {},
  "ignoredPatterns": []
}
```

**dependency-graph.json:**
```json
{
  "schemaVersion": "1.0.0",
  "updatedAt": "2026-03-04T09:00:05Z",
  "edges": [],
  "adjacency": {}
}
```

**task-history.json:**
```json
{
  "schemaVersion": "1.0.0",
  "cap": 500,
  "count": 0,
  "oldestArchive": null,
  "tasks": []
}
```

**patterns.json:**
```json
{
  "schemaVersion": "1.0.0",
  "coOccurrences": [],
  "typeAffinities": {},
  "conventions": []
}
```

**metrics.json:**
```json
{
  "schemaVersion": "1.0.0",
  "overall": {
    "totalTasks": 0,
    "totalSessions": 0,
    "avgPrecision": 0,
    "avgRecall": 0,
    "totalTokensConsumed": 0,
    "totalTokensSaved": 0,
    "savingsRate": 0
  },
  "perDomain": {},
  "windows": [],
  "predictionTrend": []
}
```

**keyword-index.json:**
```json
{
  "schemaVersion": "1.0.0",
  "updatedAt": "2026-03-04T09:00:05Z",
  "keywordToFiles": {},
  "fileToKeywords": {}
}
```

**doctor-log.json:**
```json
{
  "schemaVersion": "1.0.0",
  "entries": []
}
```

**`.schema-version` (plain text, not JSON):**
```
1.0.0
```

[Source: prd.md#Schema Definitions]

### Import Rules (MUST FOLLOW)

- The store module is a **leaf dependency** — it NEVER imports from pipeline modules (analyzer, predictor, router, etc.)
- Store imports only from `utils/` and `types/`
- Other modules import store through `src/store/index.ts` barrel only
- Use `import { ok, err } from '../utils/index.js';` for Result helpers
- Use `import { toOS } from '../utils/index.js';` for path conversion on I/O
- Use `import { SCHEMA_VERSION, MAX_HISTORY_CAP, STORE_DIR } from '../utils/index.js';` for constants

[Source: architecture.md#Import Rules]

### Library Versions (Verified March 2026)

| Package | Version | Notes |
|---|---|---|
| Node.js built-ins | node:fs, node:path | `readFileSync`, `writeFileSync`, `renameSync`, `mkdirSync`, `existsSync` |
| typescript | 5.9.3 | Strict mode enabled |
| vitest | 4.0.18 | Testing framework |

No external dependencies needed for the store module — all Node.js built-ins.

### Project Structure Notes

This story creates the following files and directories:

```
claude-opt/
├── src/
│   ├── types/
│   │   └── store.ts          # UPDATED: Full schema types (replaces placeholders from 1.1)
│   ├── store/
│   │   ├── index.ts          # Public API: typed read/write accessors per file
│   │   ├── types.ts          # Store-specific internal types
│   │   ├── store.ts          # Core: atomicWrite, readJSON, resolveStorePath, ensureStoreDir
│   │   ├── validators.ts     # Type guards: isProjectMap(), isTaskHistory(), etc.
│   │   └── migration.ts      # Schema version check + sequential migration runner
├── tests/
│   ├── fixtures/
│   │   ├── sample-config.json
│   │   ├── sample-project-map.json
│   │   ├── sample-task-history.json
│   │   ├── sample-patterns.json
│   │   └── sample-metrics.json
│   ├── helpers/
│   │   └── test-store.ts     # In-memory store mock / temp dir helper
│   └── store/
│       ├── store.test.ts
│       ├── validators.test.ts
│       └── migration.test.ts
```

### What This Story Does NOT Create

- `src/scanner/` — Created in Stories 1.3, 1.4
- `src/analyzer/`, `src/predictor/`, etc. — Created in Epic 2
- `starter-packs/` content — Created in Story 1.6
- Actual migration functions (1.0.0 -> 1.1.0) — Created when schema changes in future stories
- Task history archiving is the mechanism only — actual archiving triggers come from Learner in Epic 3

### Dependencies on Previous Stories

- **Story 1.1 (Project Scaffold & Core Utilities):** This story depends on:
  - `src/utils/paths.ts` — `toInternal()`, `toOS()` for path normalization
  - `src/utils/errors.ts` — `ok()`, `err()`, `Result<T>` type
  - `src/utils/logger.ts` — logging for store operations
  - `src/utils/constants.ts` — `SCHEMA_VERSION`, `MAX_HISTORY_CAP`, `STORE_DIR`, store file name constants
  - `src/types/store.ts` — placeholder interfaces (this story replaces them with full definitions)
  - `src/types/index.ts` — barrel export for types

### References

- [Source: architecture.md#Core Architectural Decisions] — AD-03 (Single Store Module), AD-06 (Type Guards)
- [Source: architecture.md#Data Architecture] — Atomic write pattern, schema migration strategy, module access enforcement
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — Naming, structure, format patterns
- [Source: architecture.md#Complete Project Directory Structure] — Store module file tree
- [Source: architecture.md#Project Structure & Boundaries] — Store boundary, dependency direction
- [Source: prd.md#Schema Definitions] — All 9 JSON file schemas with examples
- [Source: prd.md#Knowledge Store Requirements] — KS-01 to KS-10
- [Source: epics.md#Story 1.2] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Schema version: `SCHEMA_VERSION` constant is numeric (1). For `.schema-version` file and JSON schemas, appended `.0.0` to create semver `"1.0.0"`.
- Store type placeholders from Story 1.1 (`Record<string, unknown>`) fully replaced with typed interfaces.
- Used ESM flat config for ESLint (eslint.config.js, not .eslintrc.json) — consistent with Story 1.1 decision.
- Added `defaults.ts` as separate file alongside `store.ts` to keep factory functions cleanly separated from I/O logic.

### Completion Notes List

- All 11 tasks completed successfully
- 62 tests across 6 test suites — all passing (36 new store tests + 26 existing utils tests)
- 30+ TypeScript interfaces/types defined for all 8 store file schemas
- 8 type guards, 8 default factories, 9 read accessors, 9 write accessors
- Atomic write with .tmp + rename pattern implemented
- Task history archiving mechanism with date-stamped archive files
- Schema migration infrastructure with sequential runner (no migrations needed for v1.0.0)
- StoreReader/StoreWriter interfaces for module access enforcement
- TypeScript strict: zero errors | ESLint: zero errors | Build: clean

### Change Log

- 2026-03-04: Story 1.2 implementation complete — knowledge store I/O layer with typed schemas, atomic writes, validators, migration infrastructure
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean

### File List

- src/types/store.ts (modified — replaced placeholders with full schemas)
- src/types/index.ts (modified — expanded exports)
- src/store/index.ts (new)
- src/store/types.ts (new)
- src/store/store.ts (new)
- src/store/validators.ts (new)
- src/store/defaults.ts (new)
- src/store/migration.ts (new)
- tests/store/store.test.ts (new)
- tests/store/validators.test.ts (new)
- tests/store/migration.test.ts (new)
- tests/fixtures/sample-config.json (new)
- tests/fixtures/sample-project-map.json (new)
- tests/fixtures/sample-task-history.json (new)
- tests/fixtures/sample-patterns.json (new)
- tests/fixtures/sample-metrics.json (new)
- tests/helpers/test-store.ts (new)
