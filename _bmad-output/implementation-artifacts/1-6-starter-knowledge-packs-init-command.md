# Story 1.6: Starter Knowledge Packs & Init Command

Status: done
Epic: 1 - Project Initialization & Scanning
Story: 1.6
Date: 2026-03-04
Complexity: Large
Estimated Scope: `co init` command orchestration, `co scan` command, starter pack detection/loading, 4 built-in starter pack JSON files, re-init flow, progress output

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to run `co init` and get baseline intelligence for my project stack from day one,
So that file predictions are useful from my very first optimized session without waiting for learning.

## Acceptance Criteria (BDD)

### AC1: TypeScript/Node Starter Pack
**Given** a developer runs `co init` on a TypeScript/Node project
**When** the starter pack detector analyzes the project (package.json, file extensions, structure)
**Then** the project stack is identified as "typescript-node"
**And** the typescript-node.json starter pack is loaded into the knowledge store
**And** common patterns are seeded (e.g., test files co-located, package.json always relevant, src/ structure)

### AC2: React Starter Pack
**Given** a developer runs `co init` on a React project
**When** the starter pack detector finds React dependencies and component files
**Then** the react.json starter pack is loaded
**And** React-specific patterns are seeded (component/test/style co-occurrence, hooks patterns)

### AC3: Research/Markdown Starter Pack
**Given** a developer runs `co init` on a markdown-heavy research project
**When** the starter pack detector finds primarily .md files with heading structure
**Then** the research-markdown.json starter pack is loaded
**And** document patterns are seeded (chapter structure, reference co-occurrence)

### AC4: Graceful Degradation
**Given** built-in starter packs exist for TypeScript/Node, React, Python, and Research/Markdown
**When** a project doesn't match any built-in pack
**Then** initialization proceeds without a starter pack
**And** the optimizer falls back to learning from scratch (graceful degradation)

### AC5: Full Init Flow
**Given** a developer runs `co init` for the first time
**When** the full initialization flow executes
**Then** the sequence is: create `.claude-opt/` -> scan project -> build file map -> parse imports -> build dependency graph -> extract keywords -> detect stack -> load starter pack -> generate CLAUDE.md
**And** the user sees progress output for each stage
**And** the final output shows: files scanned, dependency edges found, starter pack loaded (if any), and "Ready! Run `co doctor --checkup` to verify setup"

### AC6: Re-Init Flow
**Given** `co init` has already been run on a project
**When** the developer runs `co init` again
**Then** the user is prompted: "Project already initialized. Re-scan? [Y/n]"
**And** if yes, an incremental re-scan runs (not a full reset)
**And** existing knowledge store data (task history, patterns, metrics) is preserved

## Tasks / Subtasks

- [x] Task 1: Implement starter pack detector in `src/scanner/starter-packs.ts` (AC: #1, #2, #3, #4)
  - [x] Implement `detectProjectStack(projectRoot: string, projectMap: ProjectMap): string | null`
  - [x] Detection logic for each stack:
    - **typescript-node**: `package.json` exists AND (`tsconfig.json` exists OR >30% `.ts`/`.tsx` files)
    - **react**: `package.json` exists AND has `react` in dependencies/devDependencies AND `.tsx`/`.jsx` files present
    - **python**: `setup.py` OR `pyproject.toml` OR `requirements.txt` exists OR >30% `.py` files
    - **research-markdown**: >50% `.md` files AND no `package.json`/`setup.py`/etc.
  - [x] Priority order: react > typescript-node > python > research-markdown (more specific wins)
  - [x] Return `null` if no match (graceful degradation)

- [x] Task 2: Create built-in starter pack JSON files (AC: #1, #2, #3)
  - [x] Create `starter-packs/typescript-node.json`:
    ```json
    {
      "name": "typescript-node",
      "version": "1.0.0",
      "description": "Starter patterns for TypeScript/Node.js projects",
      "patterns": {
        "coOccurrences": [
          {
            "id": "sp_ts_001",
            "files": ["*.ts", "*.test.ts"],
            "description": "Source files and their test files are co-located",
            "frequency": 10,
            "confidence": 0.80,
            "decayFactor": 1.0
          },
          {
            "id": "sp_ts_002",
            "files": ["package.json"],
            "description": "package.json is relevant to most dependency changes",
            "frequency": 15,
            "confidence": 0.75,
            "decayFactor": 1.0
          }
        ],
        "conventions": [
          {
            "id": "sp_ts_conv_001",
            "pattern": "Source files in src/ directory",
            "confidence": 0.85,
            "evidenceCount": 0
          },
          {
            "id": "sp_ts_conv_002",
            "pattern": "Test files use .test.ts extension",
            "confidence": 0.80,
            "evidenceCount": 0
          },
          {
            "id": "sp_ts_conv_003",
            "pattern": "Barrel exports via index.ts in each module directory",
            "confidence": 0.75,
            "evidenceCount": 0
          }
        ],
        "typeAffinities": {
          "bugfix": {
            "description": "Bug fixes often touch utility and test files"
          },
          "feature": {
            "description": "New features typically involve src/ files and their tests"
          }
        }
      },
      "keyFiles": ["package.json", "tsconfig.json", "src/index.ts"]
    }
    ```
  - [x] Create `starter-packs/react.json`:
    ```json
    {
      "name": "react",
      "version": "1.0.0",
      "description": "Starter patterns for React projects (extends typescript-node)",
      "extends": "typescript-node",
      "patterns": {
        "coOccurrences": [
          {
            "id": "sp_react_001",
            "files": ["*.tsx", "*.test.tsx", "*.css"],
            "description": "React components, tests, and styles co-occur",
            "frequency": 12,
            "confidence": 0.85,
            "decayFactor": 1.0
          },
          {
            "id": "sp_react_002",
            "files": ["*.tsx", "*.module.css"],
            "description": "Components and CSS modules co-occur",
            "frequency": 8,
            "confidence": 0.78,
            "decayFactor": 1.0
          }
        ],
        "conventions": [
          {
            "id": "sp_react_conv_001",
            "pattern": "React components use PascalCase file names",
            "confidence": 0.82,
            "evidenceCount": 0
          },
          {
            "id": "sp_react_conv_002",
            "pattern": "Hooks files prefixed with use (useAuth.ts, useForm.ts)",
            "confidence": 0.80,
            "evidenceCount": 0
          }
        ]
      },
      "keyFiles": ["package.json", "tsconfig.json", "src/App.tsx", "src/index.tsx"]
    }
    ```
  - [x] Create `starter-packs/python.json`:
    ```json
    {
      "name": "python",
      "version": "1.0.0",
      "description": "Starter patterns for Python projects",
      "patterns": {
        "coOccurrences": [
          {
            "id": "sp_py_001",
            "files": ["*.py", "test_*.py"],
            "description": "Python source and test files co-occur",
            "frequency": 10,
            "confidence": 0.80,
            "decayFactor": 1.0
          },
          {
            "id": "sp_py_002",
            "files": ["requirements.txt", "setup.py"],
            "description": "Dependency files relevant to package changes",
            "frequency": 8,
            "confidence": 0.72,
            "decayFactor": 1.0
          }
        ],
        "conventions": [
          {
            "id": "sp_py_conv_001",
            "pattern": "Python files use snake_case naming",
            "confidence": 0.90,
            "evidenceCount": 0
          },
          {
            "id": "sp_py_conv_002",
            "pattern": "Test files prefixed with test_ or in tests/ directory",
            "confidence": 0.85,
            "evidenceCount": 0
          },
          {
            "id": "sp_py_conv_003",
            "pattern": "__init__.py marks Python packages",
            "confidence": 0.88,
            "evidenceCount": 0
          }
        ]
      },
      "keyFiles": ["setup.py", "requirements.txt", "pyproject.toml"]
    }
    ```
  - [x] Create `starter-packs/research-markdown.json`:
    ```json
    {
      "name": "research-markdown",
      "version": "1.0.0",
      "description": "Starter patterns for research and documentation projects",
      "patterns": {
        "coOccurrences": [
          {
            "id": "sp_md_001",
            "files": ["*.md"],
            "description": "Markdown chapters/sections reference each other",
            "frequency": 8,
            "confidence": 0.75,
            "decayFactor": 1.0
          }
        ],
        "conventions": [
          {
            "id": "sp_md_conv_001",
            "pattern": "Documents organized by chapter/section directories",
            "confidence": 0.78,
            "evidenceCount": 0
          },
          {
            "id": "sp_md_conv_002",
            "pattern": "Reference materials in references/ or refs/ directory",
            "confidence": 0.72,
            "evidenceCount": 0
          },
          {
            "id": "sp_md_conv_003",
            "pattern": "Images/figures in images/ or figures/ directory",
            "confidence": 0.80,
            "evidenceCount": 0
          }
        ]
      },
      "keyFiles": ["README.md"]
    }
    ```

- [x] Task 3: Implement starter pack loader in `src/scanner/starter-packs.ts` (AC: #1, #2, #3)
  - [x] Implement `loadStarterPack(stackName: string): Result<StarterPack>`
  - [x] Read starter pack JSON from `starter-packs/` directory (resolve from package installation path)
  - [x] If pack has `"extends"` field, merge parent pack's patterns first, then overlay child patterns
  - [x] Validate starter pack structure with a type guard
  - [x] Return `Result` — `err` if file not found or invalid (graceful degradation)

- [x] Task 4: Implement starter pack application (AC: #1, #2, #3)
  - [x] Implement `applyStarterPack(projectRoot: string, pack: StarterPack, projectMap: ProjectMap): Result<void>`
  - [x] Seed patterns.json with starter pack co-occurrences and conventions:
    - Resolve glob patterns (`*.ts`) against actual project files
    - Set `discoveredAt` to current timestamp
    - Set `lastSeen` to current timestamp
  - [x] Seed patterns.json typeAffinities from starter pack
  - [x] Write updated patterns via `writePatterns()` from store module
  - [x] Log which patterns were seeded for transparency

- [x] Task 5: Define StarterPack types in `src/scanner/types.ts` (AC: #1, #2, #3, #4)
  - [x] Define `StarterPack` interface:
    ```typescript
    interface StarterPack {
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
    ```
  - [x] Define `StarterCoOccurrence` and `StarterConvention` interfaces
  - [x] Export from scanner types

- [x] Task 6: Implement `co init` command in `src/index.ts` (AC: #5, #6)
  - [x] Update the `init` command handler (placeholder from Story 1.1) with full implementation
  - [x] Implement `runInit(projectRoot: string, options: { force?: boolean }): Promise<void>`
  - [x] Full init sequence:
    1. Check if `.claude-opt/` already exists
    2. If exists and not `--force`: prompt "Project already initialized. Re-scan? [Y/n]"
    3. If re-scanning: run incremental scan (Story 1.5)
    4. If new init:
       a. `ensureStoreDir()` — create `.claude-opt/`
       b. `initializeStore()` — write default JSON files
       c. `scanProject({ scanType: 'full' })` — scan files, build project map
       d. `buildDependencyGraph()` — parse imports, build graph
       e. `buildKeywordIndex()` — extract keywords
       f. `detectProjectStack()` — identify project type
       g. `loadStarterPack()` + `applyStarterPack()` — seed patterns (if pack found)
       h. `generateClaudeMd()` — generate CLAUDE.md
  - [x] Show progress output for each stage using Chalk:
    ```
    Initializing claude-opt...
    [1/7] Scanning project files...        142 files found
    [2/7] Parsing imports...               87 edges discovered
    [3/7] Extracting keywords...           324 keywords indexed
    [4/7] Detecting project stack...       typescript-node
    [5/7] Loading starter pack...          typescript-node.json loaded
    [6/7] Generating CLAUDE.md...          done
    [7/7] Writing knowledge store...       done

    Ready! Run `co doctor --checkup` to verify setup.
    ```

- [x] Task 7: Implement `co scan` command in `src/index.ts` (AC: #5)
  - [x] Update the placeholder `scan` command with implementation
  - [x] Implement `runScan(projectRoot: string): Promise<void>`
  - [x] Runs incremental scan by default (full scan with `--full` flag)
  - [x] Show progress output similar to init but for scan-specific stages
  - [x] Update CLAUDE.md after scan completes

- [x] Task 8: Implement re-init prompt (AC: #6)
  - [x] Detect existing `.claude-opt/` directory
  - [x] If exists: use `readline` from Node.js built-ins for prompt
    ```typescript
    import { createInterface } from 'node:readline';

    async function promptReinit(): Promise<boolean> {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      return new Promise((resolve) => {
        rl.question('Project already initialized. Re-scan? [Y/n] ', (answer) => {
          rl.close();
          resolve(answer.toLowerCase() !== 'n');
        });
      });
    }
    ```
  - [x] If user says yes: run incremental scan, preserve existing task history/patterns/metrics
  - [x] If `--force` flag: skip prompt, run full re-scan
  - [x] If user says no: exit with message "No changes made."

- [x] Task 9: Write tests (AC: #1, #2, #3, #4, #5, #6)
  - [x] Create `tests/scanner/starter-packs.test.ts`
    - [x] Test `detectProjectStack` identifies TypeScript/Node project
    - [x] Test `detectProjectStack` identifies React project
    - [x] Test `detectProjectStack` identifies Python project
    - [x] Test `detectProjectStack` identifies research/markdown project
    - [x] Test `detectProjectStack` returns null for unrecognized project
    - [x] Test priority: React detected over plain TypeScript when both match
    - [x] Test `loadStarterPack` loads valid JSON from starter-packs/
    - [x] Test `loadStarterPack` returns err for missing pack
    - [x] Test starter pack `extends` inheritance works (react extends typescript-node)
    - [x] Test `applyStarterPack` seeds patterns.json correctly
    - [x] Test `applyStarterPack` resolves glob patterns against actual files
  - [x] Create `tests/scanner/init-flow.test.ts`
    - [x] Test full init sequence creates all store files
    - [x] Test full init produces valid project-map.json
    - [x] Test full init produces valid dependency-graph.json
    - [x] Test full init produces valid keyword-index.json
    - [x] Test full init generates CLAUDE.md
    - [x] Test re-init preserves existing task history
    - [x] Test re-init preserves existing patterns
    - [x] Test re-init preserves existing metrics
    - [x] Test re-init runs incremental scan (not full reset)
  - [x] Verify all starter pack JSON files are valid JSON
  - [x] Verify all tests pass: `npm run test`

- [x] Task 10: Verify end-to-end (AC: #5)
  - [x] Run `npm run build` — verify clean build
  - [x] Run `npm link` — verify `co init` works on sample project
  - [x] Verify `co init` produces `.claude-opt/` with all JSON files
  - [x] Verify `co init` generates CLAUDE.md
  - [x] Verify `co scan` runs incremental scan
  - [x] Run `npm run typecheck` — zero errors
  - [x] Run `npm run test` — all tests pass
  - [x] Run `npm run lint` — no violations

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-01 | CLAUDE.md Injection — `co init` generates the initial CLAUDE.md | [Source: architecture.md#Core Architectural Decisions] |
| AD-03 | Single Store Module — all reads/writes go through store accessors | [Source: architecture.md#Core Architectural Decisions] |
| AD-05 | POSIX Internal — all paths in starter packs use POSIX format | [Source: architecture.md#Core Architectural Decisions] |
| AD-07 | Chalk + String Templates — progress output uses Chalk for colors | [Source: architecture.md#Core Architectural Decisions] |

### Scanner Requirements Mapping

| Requirement | Coverage in This Story | Source |
|---|---|---|
| SC-08 | Starter knowledge packs — detect stack, seed patterns — full coverage | [Source: prd.md#Project Scanner] |
| SC-09 | Built-in packs for TS/Node, React, Python, Research/Markdown — full coverage | [Source: prd.md#Project Scanner] |

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `starter-packs.ts` |
| Starter pack files | kebab-case.json | `typescript-node.json`, `research-markdown.json` |
| Test files | kebab-case.test.ts | `tests/scanner/starter-packs.test.ts` |
| Functions | camelCase | `detectProjectStack()`, `loadStarterPack()`, `applyStarterPack()` |
| Variables | camelCase | `stackName`, `starterPack`, `projectMap` |
| Types/Interfaces | PascalCase | `StarterPack`, `StarterCoOccurrence` |
| Constants | UPPER_SNAKE_CASE | `STARTER_PACK_DIR` |
| Booleans | is/has/should/can prefix | `isInitialized`, `hasStarterPack` |
| JSON fields | camelCase | `coOccurrences`, `typeAffinities`, `keyFiles` |
| Starter pack IDs | sp_ prefix | `sp_ts_001`, `sp_react_001`, `sp_md_001` |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**Init Flow Pattern:**
```typescript
import chalk from 'chalk';
import { ensureStoreDir, initializeStore } from '../store/index.js';
import { scanProject, buildDependencyGraph, buildKeywordIndex } from '../scanner/index.js';
import { detectProjectStack, loadStarterPack, applyStarterPack } from '../scanner/index.js';
import { generateClaudeMd } from '../scanner/index.js';
import { logger } from '../utils/index.js';

async function runInit(projectRoot: string, options: { force?: boolean }): Promise<void> {
  // Check existing
  const storeExists = existsSync(resolveStorePath(projectRoot));
  if (storeExists && !options.force) {
    const rescan = await promptReinit();
    if (!rescan) {
      console.log('No changes made.');
      return;
    }
    // Run incremental scan
    return runScan(projectRoot);
  }

  console.log(chalk.bold('Initializing claude-opt...\n'));

  // Step 1: Create store
  logStep(1, 7, 'Creating knowledge store...');
  ensureStoreDir(projectRoot);
  initializeStore(projectRoot);

  // Step 2: Scan files
  logStep(2, 7, 'Scanning project files...');
  const scanResult = scanProject({ projectRoot, scanType: 'full' });
  if (!scanResult.ok) { /* handle error */ }
  console.log(`  ${chalk.green(scanResult.value.filesScanned)} files found`);

  // ... steps 3-7 ...

  console.log(chalk.green.bold('\nReady!') + ' Run `co doctor --checkup` to verify setup.');
}

function logStep(step: number, total: number, message: string): void {
  console.log(chalk.dim(`[${step}/${total}]`) + ' ' + message);
}
```

**Stack Detection Pattern:**
```typescript
function detectProjectStack(projectRoot: string, projectMap: ProjectMap): string | null {
  const fileList = Object.keys(projectMap.files);
  const hasFile = (name: string) => fileList.some(f => f === name || f.endsWith('/' + name));
  const fileExtRatio = (ext: string) => {
    const matching = fileList.filter(f => f.endsWith(ext)).length;
    return fileList.length > 0 ? matching / fileList.length : 0;
  };

  // Check React first (more specific)
  if (hasFile('package.json')) {
    const pkgPath = toOS(join(projectRoot, 'package.json'));
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.react && (fileExtRatio('.tsx') > 0 || fileExtRatio('.jsx') > 0)) {
        return 'react';
      }
    } catch { /* ignore parse errors */ }
  }

  // TypeScript/Node
  if (hasFile('package.json') && (hasFile('tsconfig.json') || fileExtRatio('.ts') > 0.3)) {
    return 'typescript-node';
  }

  // Python
  if (hasFile('setup.py') || hasFile('pyproject.toml') || hasFile('requirements.txt') || fileExtRatio('.py') > 0.3) {
    return 'python';
  }

  // Research/Markdown
  if (fileExtRatio('.md') > 0.5 && !hasFile('package.json') && !hasFile('setup.py')) {
    return 'research-markdown';
  }

  return null; // No match — graceful degradation
}
```

**Starter Pack Loading Pattern:**
```typescript
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function getStarterPackDir(): string {
  // Resolve from package installation, not CWD
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return join(__dirname, '..', '..', 'starter-packs');
}

function loadStarterPack(stackName: string): Result<StarterPack> {
  const packPath = join(getStarterPackDir(), `${stackName}.json`);
  try {
    const raw = JSON.parse(readFileSync(packPath, 'utf-8'));
    if (!isStarterPack(raw)) return err(`Invalid starter pack format: ${stackName}`);

    // Handle inheritance
    if (raw.extends) {
      const parent = loadStarterPack(raw.extends);
      if (parent.ok) {
        return ok(mergeStarterPacks(parent.value, raw));
      }
    }
    return ok(raw);
  } catch {
    return err(`Starter pack not found: ${stackName}`);
  }
}
```

**Result<T> Pattern:** All functions that can fail return `Result<T>`.

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- `starter-packs.ts` imports from store for writing patterns: `import { writePatterns, readPatterns } from '../store/index.js';`
- `starter-packs.ts` reads starter pack files directly from disk (they're static bundled assets, not store files)
- `co init` command in `index.ts` imports from scanner: `import { scanProject, detectProjectStack } from './scanner/index.js';`
- `co init` command in `index.ts` imports from store: `import { initializeStore } from './store/index.js';`
- Use chalk for CLI output: `import chalk from 'chalk';`

[Source: architecture.md#Import Rules]

### Library Versions (Verified March 2026)

| Package | Version | Notes |
|---|---|---|
| commander | 14.0.3 | CLI framework — `co init` and `co scan` commands |
| chalk | 5.6.2 | Terminal styling for progress output |
| Node.js built-ins | node:fs, node:path, node:readline | File I/O, path resolution, user prompts |
| typescript | 5.9.3 | Strict mode enabled |
| vitest | 4.0.18 | Testing framework |

### Project Structure Notes

This story creates the following files and directories:

```
claude-opt/
├── src/
│   ├── index.ts                      # MODIFIED: Full `co init` and `co scan` command implementations
│   └── scanner/
│       └── starter-packs.ts          # NEW: detectProjectStack(), loadStarterPack(), applyStarterPack()
├── starter-packs/
│   ├── typescript-node.json          # NEW: TypeScript/Node starter patterns
│   ├── react.json                    # NEW: React starter patterns (extends typescript-node)
│   ├── python.json                   # NEW: Python starter patterns
│   └── research-markdown.json        # NEW: Research/docs starter patterns
├── tests/
│   └── scanner/
│       ├── starter-packs.test.ts     # NEW: Stack detection + pack loading tests
│       └── init-flow.test.ts         # NEW: Full init sequence integration tests
```

### What This Story Does NOT Create

- `src/analyzer/` — Created in Epic 2
- `src/predictor/` — Created in Epic 2
- `src/router/` — Created in Epic 2
- `src/compressor/` — Created in Epic 2
- `src/adapter/` — Created in Epic 2
- `src/learner/` — Created in Epic 3
- `src/tracker/` — Created in Epic 3
- `src/doctor/` — Created in Epic 4 (except `co doctor --checkup` reference in output)
- `src/visibility/` — Created in Epic 5
- Additional community starter packs — post-launch contribution

### Dependencies on Previous Stories

- **Story 1.1 (Project Scaffold & Core Utilities):** This story depends on:
  - `src/index.ts` — CLI entry point with placeholder commands (this story fills them in)
  - `src/utils/paths.ts` — `toInternal()`, `toOS()` for path normalization
  - `src/utils/errors.ts` — `ok()`, `err()`, `Result<T>`
  - `src/utils/logger.ts` — logging init progress
  - `src/utils/constants.ts` — `SCHEMA_VERSION`, `STORE_DIR`

- **Story 1.2 (Knowledge Store I/O Layer):** This story depends on:
  - `src/store/index.ts` — `initializeStore()`, `ensureStoreDir()`, `writePatterns()`, `readPatterns()`
  - All store read/write accessors for the init flow

- **Story 1.3 (Project Scanner & File Map):** This story depends on:
  - `src/scanner/scanner.ts` — `scanProject()` for file walking and project map generation
  - `src/scanner/index.ts` — public scanner API

- **Story 1.4 (Import Parsers & Dependency Graph):** This story depends on:
  - `src/scanner/dependency-graph.ts` — `buildDependencyGraph()` called during init
  - `src/scanner/keyword-extractor.ts` — `buildKeywordIndex()` called during init
  - `src/scanner/parsers/` — all parsers registered and ready

- **Story 1.5 (CLAUDE.md Generation & Incremental Scanning):** This story depends on:
  - `src/scanner/claudemd-generator.ts` — `generateClaudeMd()` called at end of init
  - Incremental scan support for re-init flow

### References

- [Source: architecture.md#Core Architectural Decisions] — AD-01 (CLAUDE.md Injection), AD-03 (Store), AD-07 (Chalk UI)
- [Source: architecture.md#Complete Project Directory Structure] — starter-packs/ directory, scanner module
- [Source: architecture.md#Project Structure & Boundaries] — Scanner boundary
- [Source: prd.md#Project Scanner] — SC-08 (starter packs), SC-09 (built-in packs)
- [Source: prd.md#Schema Definitions] — patterns.json schema for seeding
- [Source: epics.md#Story 1.6] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- All 287 tests pass (21 suites)
- TypeScript strict: zero errors
- ESLint: zero errors (scanner module)
- Build: clean CJS output

### Change Log
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean

### Completion Notes List
- Task 1: detectProjectStack — priority-ordered detection: react > typescript-node > python > research-markdown > null. Uses file extension ratios, package.json dependencies, and indicator files
- Task 2: 4 starter pack JSON files: typescript-node.json, react.json (extends typescript-node), python.json, research-markdown.json — each with co-occurrences, conventions, type affinities, key files
- Task 3: loadStarterPack — reads from starter-packs/ dir, validates with type guard, handles `extends` inheritance via mergeStarterPacks
- Task 4: applyStarterPack — seeds patterns.json with co-occurrences, conventions, type affinities from starter pack via writePatterns store accessor
- Task 5: StarterPack, StarterCoOccurrence, StarterConvention types in scanner/types.ts
- Task 6: `co init` command — full 7-step flow: create store → scan → dep graph → keywords → detect stack → load starter pack → generate CLAUDE.md. Chalk-colored progress output
- Task 7: `co scan` command — incremental by default, --full flag. Shows change counts, updates CLAUDE.md
- Task 8: Re-init prompt via readline. If --force: skip prompt. Preserves existing task history/patterns/metrics
- Task 9: 23 new tests across 2 files (starter-packs, init-flow)
- Task 10: Build clean, typecheck clean, all tests pass

### File List
- src/scanner/starter-packs.ts (new)
- src/scanner/types.ts (updated — StarterPack types)
- src/scanner/index.ts (updated — exports)
- src/index.ts (updated — co init, co scan commands)
- starter-packs/typescript-node.json (new)
- starter-packs/react.json (new)
- starter-packs/python.json (new)
- starter-packs/research-markdown.json (new)
- tests/scanner/starter-packs.test.ts (new)
- tests/scanner/init-flow.test.ts (new)
