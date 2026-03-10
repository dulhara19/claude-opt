# Story 1.1: Project Scaffold & Core Utilities

Status: done
Epic: 1 - Project Initialization & Scanning
Story: 1.1
Date: 2026-03-04
Complexity: Medium
Estimated Scope: Project foundation — npm package, TypeScript config, build tooling, shared utilities

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to install claude-opt globally via npm and have a working CLI skeleton with shared utilities,
so that the tool is available on my system as the foundation for all optimizer features.

## Acceptance Criteria (BDD)

### AC1: Global CLI Installation
**Given** a developer runs `npm install -g claude-opt`
**When** the installation completes
**Then** both `claude-opt` and `co` commands are available globally
**And** `co --version` displays the current package version
**And** `co --help` displays available commands and usage

### AC2: Build Tooling
**Given** the project source code
**When** building with `npm run build` (tsup)
**Then** a CJS bundle is produced in `dist/` with source maps and type declarations
**And** TypeScript strict mode passes with zero errors

### AC3: Cross-Platform Path Utilities
**Given** any module in the codebase
**When** it needs cross-platform file path handling
**Then** `utils/paths.ts` provides `toInternal(osPath)` and `toOS(posixPath)` functions
**And** all internal data structures store POSIX-format paths

### AC4: Fail-Open Error Wrapper
**Given** any pipeline stage function
**When** it is wrapped with `withFailOpen(stageFn, fallback)` from `utils/errors.ts`
**Then** any thrown error is caught, logged via `utils/logger.ts`, and the fallback value is returned
**And** the pipeline continues execution without crashing

### AC5: Shared Types
**Given** the shared types directory `src/types/`
**When** imported by any module
**Then** it exports `PipelineContext`, `Result<T>`, `TaskType`, `Complexity`, and common type definitions
**And** `Result<T>` follows the pattern `{ ok: true; value: T } | { ok: false; error: string }`

### AC6: Logger Utility
**Given** the logger utility
**When** used by any module
**Then** it supports `debug`, `info`, `warn`, `error` levels with structured output
**And** `--verbose` flag enables debug-level output
**And** `--quiet` flag suppresses info-level output
**And** errors are always logged regardless of verbosity

## Tasks / Subtasks

- [x] Task 1: Initialize npm package (AC: #1)
  - [x] Run `npm init -y` and configure package.json
  - [x] Set `"name": "claude-opt"`, `"type": "module"`, `"engines": { "node": ">=20" }`
  - [x] Add `"bin": { "claude-opt": "./dist/index.js", "co": "./dist/index.js" }`
  - [x] Add `"files"` whitelist: `["dist", "starter-packs"]`
  - [x] Install production deps: `npm i commander chalk`
  - [x] Install dev deps: `npm i -D typescript @tsconfig/node22 tsup vitest @types/node eslint prettier tsx`
- [x] Task 2: Create .gitignore (AC: #2)
  - [x] Ignore: `node_modules/`, `dist/`, `.claude-opt/`, `*.tmp`, `coverage/`, `.eslintcache`
  - [x] Include standard Node.js ignores (`.env`, `*.log`, `.DS_Store`)
- [x] Task 3: Configure TypeScript (AC: #2)
  - [x] Create `tsconfig.json` extending `@tsconfig/node22` with `strict: true`
  - [x] Set `"module": "nodenext"`, `"moduleResolution": "nodenext"`, `"outDir": "./dist"`
  - [x] Configure paths and include/exclude patterns
- [x] Task 4: Configure ESLint & Prettier (AC: #2)
  - [x] Create `.prettierrc`: `{ "singleQuote": true, "trailingComma": "all", "printWidth": 100 }`
  - [x] Create `eslint.config.js` with TypeScript support (flat config for ESLint 9.x)
  - [x] Add `no-restricted-imports` rule to enforce module boundary imports (only import from barrel `index.ts`)
  - [x] Add npm script: `"lint": "eslint src/ tests/"`, `"format": "prettier --write src/ tests/"`
- [x] Task 5: Configure tsup build (AC: #2)
  - [x] Create `tsup.config.ts`: entry `src/index.ts`, format `cjs`, sourcemap, dts
  - [x] Add shebang banner for `#!/usr/bin/env node` in output
  - [x] Add npm scripts: `build`, `dev` (tsx), `test`, `test:watch`, `typecheck`
- [x] Task 6: Configure Vitest (AC: #2)
  - [x] Create `vitest.config.ts` with TypeScript support and coverage config
  - [x] Create `tests/setup.ts` for global test setup
- [x] Task 7: Create CLI entry point with Commander.js (AC: #1)
  - [x] Create `src/index.ts` with Commander program definition
  - [x] Register `--version`, `--help`, `--verbose`, `--quiet` flags
  - [x] Register placeholder subcommands: `init`, `stats`, `budget`, `knowledge`, `doctor`, `config`, `correct`, `forget`
  - [x] Add `--dry-run` global option
- [x] Task 8: Create shared types (AC: #5)
  - [x] Create `src/types/index.ts` (barrel export)
  - [x] Create `src/types/pipeline.ts` — `PipelineContext`, `Result<T>`
  - [x] Create `src/types/common.ts` — `TaskType` enum, `Complexity` enum, confidence score type
  - [x] Create `src/types/store.ts` — minimal placeholder types with `TODO` comments for Story 1.2 (ProjectMap, TaskHistory, Patterns, Metrics, DependencyGraph, KeywordIndex, Config, DoctorLog)
- [x] Task 9: Create utils/paths.ts (AC: #3)
  - [x] Implement `toInternal(osPath: string): string` — normalize to POSIX
  - [x] Implement `toOS(posixPath: string): string` — convert to platform-native
  - [x] Implement `normalizePath(p: string): string` — resolve and normalize
  - [x] Handle Windows backslash conversion
  - [x] Write tests: `tests/utils/paths.test.ts`
- [x] Task 10: Create utils/errors.ts (AC: #4)
  - [x] Implement `Result<T>` type and helpers: `ok(value)`, `err(error)`
  - [x] Implement `withFailOpen<T>(fn: () => T, fallback: T): T` HOF
  - [x] Ensure errors are logged before returning fallback
  - [x] Write tests: `tests/utils/errors.test.ts`
- [x] Task 11: Create utils/logger.ts (AC: #6)
  - [x] Implement structured logger with `debug`, `info`, `warn`, `error` levels
  - [x] Format: `[module] message` with Chalk coloring per level
  - [x] Support `--verbose` (debug level) and `--quiet` (suppress info) flags
  - [x] Errors always logged regardless of verbosity
  - [x] Write tests: `tests/utils/logger.test.ts`
- [x] Task 12: Create utils/constants.ts
  - [x] Define `SCHEMA_VERSION`, `DEFAULT_BUDGET` (44000), `MAX_HISTORY_CAP` (500)
  - [x] Define `DEFAULT_WINDOW_DURATION` (18000000ms / 5 hours)
  - [x] Define `CONFIDENCE_THRESHOLD`, `DOCTOR_ACCURACY_THRESHOLD` (0.6)
  - [x] Define `STORE_DIR` ('.claude-opt'), file names for all JSON store files
- [x] Task 13: Create utils/index.ts barrel export
  - [x] Export all from paths, errors, logger, constants
- [x] Task 14: Verify end-to-end (AC: #1, #2)
  - [x] Run `npm run build` — verify clean build with zero errors
  - [x] Run `node dist/index.cjs` — verify `--version` and `--help` work
  - [x] Run `npm run test` — verify all 26 tests pass
  - [x] Run `npm run typecheck` — verify TypeScript strict mode passes
  - [x] Run `npm run lint` — verify ESLint passes with no violations

## Dev Notes

### CRITICAL: Node.js Version Compatibility Issue

The Architecture document specifies Commander.js 14.0.3 and Vitest 4.0.18. Web research confirms:
- **Commander 14.x requires Node.js >=20** (not compatible with Node 18)
- **Vitest 4.x requires Node.js >=20** (drops Node 18 support)

The PRD originally specifies Node.js >=18 LTS support, but the Architecture's verified package versions are incompatible with Node 18.

**Resolution: Update minimum Node version to >=20 LTS.** This aligns with:
- Both key dependencies requiring >=20
- Node 18 reaching EOL September 2025 (already past)
- Node 20 being current LTS (until April 2026)
- Node 22 being the next LTS

Update `package.json` engines to `"node": ">=20"` and CI matrix to test Node 20, 22.

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-02 | Typed Pipeline with Orchestrator — `PipelineContext` accumulates results | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | `withFailOpen(stageFn, fallback)` wrapper for every pipeline stage | [Source: architecture.md#Core Architectural Decisions] |
| AD-05 | POSIX internal paths, platform-native I/O via `utils/paths.ts` | [Source: architecture.md#Core Architectural Decisions] |
| AD-06 | TypeScript Type Guards for validation (no Zod/Ajv) | [Source: architecture.md#Core Architectural Decisions] |
| AD-07 | Chalk + String Templates for terminal UI (no TUI framework) | [Source: architecture.md#Core Architectural Decisions] |

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `task-analyzer.ts`, `keyword-index.ts` |
| Test files | kebab-case.test.ts | `tests/utils/paths.test.ts` |
| Functions | camelCase | `classifyTask()`, `toInternal()` |
| Variables | camelCase | `taskType`, `confidenceScore` |
| Types/Interfaces | PascalCase | `PipelineContext`, `TaskType` |
| Constants | UPPER_SNAKE_CASE | `MAX_HISTORY_CAP`, `DEFAULT_BUDGET` |
| Enums | PascalCase + PascalCase members | `TaskType.Feature`, `Complexity.Medium` |
| Booleans | is/has/should/can prefix | `isStale`, `hasPatterns` |
| JSON fields | camelCase | `schemaVersion`, `confidenceScore` |
| Directories | kebab-case | `src/analyzer/`, `src/utils/` |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): Result<T> { return { ok: true, value }; }
function err<T>(error: string): Result<T> { return { ok: false, error }; }
```

**withFailOpen Pattern:**
```typescript
function withFailOpen<T>(fn: () => T, fallback: T, module: string): T {
  try {
    return fn();
  } catch (error) {
    logger.error(module, 'Stage failed, falling back', error);
    return fallback;
  }
}
```

**Confidence Scores:** Always 0.0–1.0 float in data, convert to percentage only for display.

**Null vs Undefined:** JSON uses `null`, TypeScript uses `undefined` for optional params, `null` for explicit "no value".

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- Modules import from other modules ONLY through their `index.ts` barrel export
- Never import from another module's internal files directly
- Shared types used across 3+ modules go in `src/types/`
- `utils/` and `store/` are leaf dependencies — never import pipeline modules

[Source: architecture.md#Import Rules]

### Library Versions (Verified March 2026)

| Package | Version | Notes |
|---|---|---|
| commander | 14.0.3 | CLI framework. Requires Node >=20 |
| chalk | 5.6.2 | ESM-only. Terminal styling |
| tsup | 8.5.1 | esbuild-powered bundler. CJS+ESM output |
| vitest | 4.0.18 | Testing. Requires Node >=20 |
| typescript | 5.9.3 | Strict mode enabled |
| @tsconfig/node22 | 22.0.5 | Base tsconfig for Node 22 |
| tsx | 4.21.0 | Zero-config TS executor for dev |

### Project Structure Notes

This story creates the foundational directory structure. All subsequent stories build on this scaffold.

```
claude-opt/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── .gitignore
├── .prettierrc               # single quotes, trailing commas, 100 width
├── .eslintrc.json            # TS support + no-restricted-imports boundaries
├── src/
│   ├── index.ts              # CLI entry point (Commander.js)
│   ├── types/
│   │   ├── index.ts          # Barrel export
│   │   ├── pipeline.ts       # PipelineContext, Result<T>
│   │   ├── common.ts         # TaskType, Complexity enums
│   │   └── store.ts          # Minimal placeholders — full schemas in Story 1.2
│   └── utils/
│       ├── index.ts          # Barrel export
│       ├── paths.ts          # toInternal(), toOS()
│       ├── errors.ts         # Result<T>, withFailOpen()
│       ├── logger.ts         # Structured logging
│       └── constants.ts      # SCHEMA_VERSION, DEFAULT_BUDGET, etc.
├── starter-packs/            # Empty dir, populated in Story 1.6
├── tests/
│   ├── setup.ts
│   ├── helpers/              # Empty dir, populated in Story 1.2
│   ├── fixtures/             # Empty dir, populated in Story 1.2
│   └── utils/
│       ├── paths.test.ts
│       ├── errors.test.ts
│       └── logger.test.ts
└── dist/                     # Build output (gitignored)
```

[Source: architecture.md#Complete Project Directory Structure]

### What This Story Does NOT Create

- `src/store/` — Created in Story 1.2
- `src/scanner/` — Created in Stories 1.3, 1.4
- `src/analyzer/`, `src/predictor/`, etc. — Created in Epic 2
- `.github/workflows/` — CI/CD, handled separately
- `README.md`, `CONTRIBUTING.md`, `LICENSE` — Documentation, can be added anytime

### References

- [Source: architecture.md#Starter Template Evaluation] — Custom scaffold rationale and init command
- [Source: architecture.md#Core Architectural Decisions] — AD-02, AD-04, AD-05, AD-06, AD-07
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — All naming, structure, format patterns
- [Source: architecture.md#Complete Project Directory Structure] — Full file tree
- [Source: architecture.md#Project Structure & Boundaries] — Module boundaries and dependency direction
- [Source: prd.md#Technical Constraints & Architecture Boundaries] — Technology stack, platform constraints
- [Source: epics.md#Story 1.1] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- ESLint: Used flat config (eslint.config.js) instead of .eslintrc.json since ESLint 9.x uses flat config format by default
- Store types: Changed from empty interfaces to `Record<string, unknown>` type aliases to satisfy `@typescript-eslint/no-empty-object-type` rule
- ESLint no-restricted-imports: Added `.js` extension variants to exclusion patterns since ESM imports require `.js` extensions

### Completion Notes List

- All 14 tasks completed successfully
- 26 unit tests across 3 test suites (paths: 11, errors: 7, logger: 8) — all passing
- Clean tsup CJS build with source maps and type declarations
- TypeScript strict mode: zero errors
- ESLint: zero errors, zero warnings
- CLI entry point registers all 8 placeholder subcommands + --version, --help, --verbose, --quiet, --dry-run
- All architecture decisions (AD-02, AD-04, AD-05, AD-06, AD-07) followed
- All naming conventions followed (kebab-case files, camelCase functions, PascalCase types, UPPER_SNAKE constants)
- Installed deps match specified versions: commander ^14.0.3, chalk ^5.6.2, vitest ^4.0.18, typescript, tsup ^8.5.1

### Change Log

- 2026-03-04: Story 1.1 implementation complete — project scaffold with CLI skeleton, shared types, and utility modules
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean

### File List

- package.json (new)
- package-lock.json (new)
- tsconfig.json (new)
- tsup.config.ts (new)
- vitest.config.ts (new)
- eslint.config.js (new)
- .prettierrc (new)
- .gitignore (new)
- src/index.ts (new)
- src/types/index.ts (new)
- src/types/pipeline.ts (new)
- src/types/common.ts (new)
- src/types/store.ts (new)
- src/utils/index.ts (new)
- src/utils/paths.ts (new)
- src/utils/errors.ts (new)
- src/utils/logger.ts (new)
- src/utils/constants.ts (new)
- tests/setup.ts (new)
- tests/utils/paths.test.ts (new)
- tests/utils/errors.test.ts (new)
- tests/utils/logger.test.ts (new)
