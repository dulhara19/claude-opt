# Story 2.6: Claude Code Adapter & Task Execution

Status: done
Epic: 2 - Smart Task Execution Pipeline
Story: 2.6
Date: 2026-03-04
Complexity: Large
Estimated Scope: Claude Code subprocess adapter with CLAUDE.md injection, files-used detection (timestamps + stdout parsing), and fail-open fallback execution

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the optimizer to execute my task through Claude Code and detect which files were used,
so that the learning loop has accurate data about what actually happened during the session.

## Acceptance Criteria (BDD)

### AC1: Subprocess Execution with CLAUDE.md Injection
**Given** the user has approved the optimized prompt
**When** the Adapter executes the task
**Then** it generates an optimized CLAUDE.md with predicted files and conventions
**And** spawns Claude Code as a subprocess: `child_process.spawn('claude', [optimizedPrompt], { cwd: projectRoot })`
**And** captures stdout and stderr from the subprocess

### AC2: AdapterResult with Files-Used Detection
**Given** Claude Code completes execution
**When** the Adapter processes the result
**Then** it returns an `AdapterResult`: `{ output, filesUsed, exitCode, tokenEstimate }`
**And** `filesUsed` is detected via a hybrid approach: file modification timestamps before/after execution + parsing file path references from stdout

### AC3: Fail-Open Fallback Execution
**Given** the Claude Code subprocess fails or crashes
**When** the Adapter encounters an error
**Then** it falls back to raw Claude Code execution (no optimization applied)
**And** returns a fallback AdapterResult with a special exit code (e.g., 10) indicating fallback mode
**And** the error is logged for Doctor analysis
**And** the user's task still completes — the optimizer never blocks work

### AC4: Claude Code CLI Detection
**Given** the Adapter needs to detect the installed Claude Code version
**When** it initializes
**Then** it checks for Claude Code CLI availability and version
**And** handles CLI interface differences gracefully between versions
**And** if Claude Code is not installed, shows a clear error message and exits

## Tasks / Subtasks

- [x] Task 1: Create adapter module structure (AC: #1, #2, #3, #4)
  - [x] Create `src/adapter/` directory
  - [x] Create `src/adapter/index.ts` barrel export: `executeTask`, `executeRaw`, `AdapterResult` type
  - [x] Create `src/adapter/types.ts` with `AdapterResult`, `SpawnOptions`, `ClaudeCodeInfo`, `FileTimestamp`
  - [x] Create `src/adapter/claude-adapter.ts` — core subprocess spawn and CLAUDE.md generation logic
  - [x] Create `src/adapter/file-detector.ts` — post-execution files-used detection
- [x] Task 2: Define adapter types (AC: #1, #2, #3)
  - [x] `AdapterResult`: `{ output: string; filesUsed: string[]; exitCode: number; tokenEstimate: number; isFallback: boolean; durationMs: number }`
  - [x] `SpawnOptions`: `{ prompt: string; cwd: string; model?: string; claudeMdPath?: string; timeout?: number }`
  - [x] `ClaudeCodeInfo`: `{ version: string; path: string; isAvailable: boolean }`
  - [x] `FileTimestamp`: `{ filePath: string; modifiedAt: number }` — for before/after comparison
  - [x] `FALLBACK_EXIT_CODE` constant: `10`
- [x] Task 3: Implement Claude Code CLI detection (AC: #4)
  - [x] Implement `detectClaudeCode(): Result<ClaudeCodeInfo>` function
  - [x] Check if `claude` command is available in PATH using `child_process.execSync('claude --version')`
  - [x] Parse version string from output
  - [x] If not found, return an error Result with clear message: "Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code"
  - [x] Cache the detection result for the session (detect once on startup)
  - [x] Handle cross-platform PATH differences
- [x] Task 4: Implement CLAUDE.md generation (AC: #1)
  - [x] Implement `generateClaudeMd(ctx: PipelineContext): string` function
  - [x] Include predicted files section: list files for Claude to focus on
  - [x] Include conventions section: project patterns and coding standards
  - [x] Include domain context: relevant domain-specific instructions
  - [x] Write the generated CLAUDE.md to the project root (backup existing one if present)
  - [x] Format as valid Markdown that Claude Code natively reads
  - [x] Restore the original CLAUDE.md after execution completes
- [x] Task 5: Implement subprocess spawning (AC: #1)
  - [x] Implement `spawnClaudeCode(options: SpawnOptions): Promise<AdapterResult>` function
  - [x] Use `child_process.spawn('claude', [optimizedPrompt], { cwd: projectRoot })` to spawn subprocess
  - [x] If model is specified (from router), pass model flag to Claude Code CLI
  - [x] Capture stdout into output buffer
  - [x] Capture stderr for error detection
  - [x] Wait for subprocess to exit
  - [x] Return raw output, exit code, and captured streams
- [x] Task 6: Implement file timestamp comparison (AC: #2)
  - [x] Implement `captureTimestamps(projectRoot: string): FileTimestamp[]` — snapshot file modification times before execution
  - [x] Implement `detectModifiedFiles(before: FileTimestamp[], projectRoot: string): string[]` — compare timestamps after execution
  - [x] Only scan files in the project directory (respect .gitignore patterns)
  - [x] Return list of files that were modified during execution
  - [x] Use `fs.statSync()` for timestamp capture — sync is fine for this use case
- [x] Task 7: Implement stdout file path parsing (AC: #2)
  - [x] Implement `parseFilePaths(output: string, projectRoot: string): string[]` — extract file paths referenced in Claude Code's stdout
  - [x] Use regex patterns to detect file path references (e.g., `src/foo/bar.ts`, `/absolute/path/file.js`)
  - [x] Filter to only files that exist in the project directory
  - [x] Normalize detected paths to POSIX format using `utils/paths.ts`
- [x] Task 8: Implement hybrid files-used detection (AC: #2)
  - [x] In `file-detector.ts`, combine timestamp comparison + stdout parsing results
  - [x] Merge and deduplicate the two file lists
  - [x] Normalize all paths to POSIX format
  - [x] Return the combined `filesUsed` list
  - [x] This is the learning signal for the feedback loop (Epic 3)
- [x] Task 9: Implement token estimation (AC: #2)
  - [x] Implement basic token estimation from output length
  - [x] Use a simple heuristic: ~4 characters per token (approximate)
  - [x] Include both prompt length and response length in estimate
  - [x] This is a rough estimate — accurate token counting is deferred (AD-11 area)
- [x] Task 10: Implement `executeTask()` main function (AC: #1, #2)
  - [x] Accept `PipelineContext` with compression result (final prompt), routing result (model) as input
  - [x] Step 1: Detect Claude Code CLI (or use cached detection)
  - [x] Step 2: Capture file timestamps before execution
  - [x] Step 3: Generate and write optimized CLAUDE.md
  - [x] Step 4: Spawn Claude Code subprocess with optimized prompt
  - [x] Step 5: Capture stdout/stderr and exit code
  - [x] Step 6: Restore original CLAUDE.md
  - [x] Step 7: Detect files used (timestamps + stdout parsing)
  - [x] Step 8: Estimate tokens consumed
  - [x] Step 9: Return `AdapterResult`
- [x] Task 11: Implement `executeRaw()` fallback function (AC: #3)
  - [x] Implement raw execution without any optimization: `spawn('claude', [originalPrompt], { cwd: projectRoot })`
  - [x] No CLAUDE.md injection, no model override
  - [x] Still capture output and exit code
  - [x] Return `AdapterResult` with `isFallback: true` and `exitCode: 10`
- [x] Task 12: Implement fail-open error handling (AC: #3)
  - [x] Wrap `executeTask()` with error handling (not `withFailOpen` — adapter handles its own fallback)
  - [x] If optimized execution fails: log error, call `executeRaw()` as fallback
  - [x] If `executeRaw()` also fails: log error, return error AdapterResult
  - [x] Log all errors for Doctor analysis via `utils/logger.ts`
  - [x] The optimizer NEVER blocks the user's work — if optimization fails, raw execution proceeds
- [x] Task 13: Implement CLAUDE.md backup and restore (AC: #1)
  - [x] Before writing optimized CLAUDE.md, check if one already exists
  - [x] If exists, rename to `CLAUDE.md.backup` (or `.claude-opt-backup`)
  - [x] After execution completes (success or failure), restore the original
  - [x] Use atomic rename operations for safety
  - [x] Handle edge case: CLAUDE.md.backup already exists from a previous interrupted run
- [x] Task 14: Wire adapter into pipeline orchestrator (AC: #1, #2, #3)
  - [x] Update `src/pipeline.ts` to call `executeTask()` after review step
  - [x] Pass the final prompt (from review result) and routing result to adapter
  - [x] Store the `AdapterResult` in `PipelineContext.adapterResult`
  - [x] Handle cancel from review: skip adapter execution entirely
- [x] Task 15: Write unit tests for Claude Code adapter (AC: #1, #2, #3, #4)
  - [x] Create `tests/adapter/claude-adapter.test.ts`
  - [x] Test CLI detection: mock `execSync` to simulate claude available/unavailable
  - [x] Test CLAUDE.md generation: verify correct content structure
  - [x] Test CLAUDE.md backup/restore: verify original is preserved
  - [x] Test subprocess spawning: mock `child_process.spawn` to simulate execution
  - [x] Test AdapterResult structure: verify all fields populated
  - [x] Test fail-open: simulate optimized execution failure, verify fallback to raw
  - [x] Test fallback exit code is 10
  - [x] Test error logging on failure
- [x] Task 16: Write unit tests for file detector (AC: #2)
  - [x] Create `tests/adapter/file-detector.test.ts`
  - [x] Test timestamp comparison: mock file stats before/after, detect modified files
  - [x] Test stdout parsing: extract file paths from sample Claude Code output
  - [x] Test hybrid detection: merge timestamp + stdout results, verify deduplication
  - [x] Test path normalization: verify POSIX format output

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-01 | Hybrid: Subprocess Spawn + CLAUDE.md Injection — spawn Claude Code subprocess, inject context via CLAUDE.md, no stream parsing needed | [Source: architecture.md#Core Architectural Decisions] |
| AD-02 | Typed Pipeline with Orchestrator — Adapter is the final execution stage, receives full PipelineContext | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | Fail-Open Pattern — adapter handles its own fallback (raw execution), never blocks work | [Source: architecture.md#Core Architectural Decisions] |
| AD-05 | POSIX Internal Paths — all file paths in AdapterResult.filesUsed stored as POSIX | [Source: architecture.md#Core Architectural Decisions] |
| AD-08 | Doctor Agent uses same adapter — `executeRaw()` is shared between regular tasks and Doctor diagnostics | [Source: architecture.md#Core Architectural Decisions] |

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `claude-adapter.ts`, `file-detector.ts` |
| Test files | kebab-case.test.ts | `tests/adapter/claude-adapter.test.ts` |
| Functions | camelCase | `executeTask()`, `executeRaw()`, `detectClaudeCode()`, `detectModifiedFiles()` |
| Variables | camelCase | `adapterResult`, `filesUsed`, `exitCode`, `tokenEstimate` |
| Types/Interfaces | PascalCase | `AdapterResult`, `SpawnOptions`, `ClaudeCodeInfo` |
| Constants | UPPER_SNAKE_CASE | `FALLBACK_EXIT_CODE`, `CLAUDE_MD_BACKUP` |
| Booleans | is/has/should/can prefix | `isFallback`, `isAvailable`, `hasClaudeMd` |
| JSON fields | camelCase | `filesUsed`, `exitCode`, `tokenEstimate` |
| Directories | kebab-case | `src/adapter/` |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

**Adapter handles its own fail-open (not withFailOpen wrapper):**
```typescript
async function executeTask(ctx: PipelineContext): Promise<AdapterResult> {
  try {
    // Optimized execution with CLAUDE.md injection
    return await spawnClaudeCode(optimizedOptions);
  } catch (error) {
    logger.error('adapter', 'Optimized execution failed, falling back to raw', error);
    try {
      return await executeRaw(ctx.userPrompt, projectRoot);
    } catch (rawError) {
      logger.error('adapter', 'Raw execution also failed', rawError);
      return { output: '', filesUsed: [], exitCode: FALLBACK_EXIT_CODE, tokenEstimate: 0, isFallback: true, durationMs: 0 };
    }
  }
}
```

**AdapterResult Interface:**
```typescript
interface AdapterResult {
  output: string;        // Claude Code's response
  filesUsed: string[];   // Detected files Claude read/modified (POSIX paths)
  exitCode: number;      // Claude Code's exit code (10 = fallback)
  tokenEstimate: number; // Estimated tokens consumed
  isFallback: boolean;   // Whether fallback execution was used
  durationMs: number;    // Total execution duration
}
```

**PipelineContext — Adapter reads all previous stages, writes adapterResult:**
```typescript
interface PipelineContext {
  userPrompt: string;
  classification?: ClassificationResult;
  prediction?: PredictionResult;          // Read for CLAUDE.md generation
  routing?: RoutingResult;                // Read for model selection
  compression?: CompressionResult;        // Read for optimized prompt
  adapterResult?: AdapterResult;          // Written by adapter
}
```

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display.

**File paths:** All paths in `filesUsed` stored as POSIX format. Use `utils/paths.ts` for normalization.

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- Modules import from other modules ONLY through their `index.ts` barrel export
- Never import from another module's internal files directly
- Adapter does NOT depend on store — it reads only from PipelineContext (in-memory)
- Adapter uses Node.js `child_process` for subprocess spawning
- Adapter uses Node.js `fs` for CLAUDE.md file operations and timestamp detection
- `utils/` is a leaf dependency (paths.ts for normalization, logger.ts for error logging)
- Doctor module (Epic 4) will import `executeRaw()` from adapter's barrel export

[Source: architecture.md#Import Rules]

### Project Structure Notes

This story creates the adapter module — the final execution stage of the pipeline:

```
src/
├── adapter/                       # Claude Code CLI Adapter module (NEW)
│   ├── index.ts                   # Public: executeTask(), executeRaw(), AdapterResult
│   ├── types.ts                   # AdapterResult, SpawnOptions, ClaudeCodeInfo, FileTimestamp
│   ├── claude-adapter.ts          # Subprocess spawn, stdout capture, CLAUDE.md generation
│   └── file-detector.ts           # Post-execution files-used detection (timestamps + stdout)
├── pipeline.ts                    # Updated: wire executeTask after review step
tests/
├── adapter/
│   ├── claude-adapter.test.ts     # Adapter subprocess tests (NEW)
│   └── file-detector.test.ts      # File detection tests (NEW)
```

### Dependencies on Previous Stories

- **Story 1.1** (Project Scaffold & Core Utilities): Provides `utils/paths.ts` (path normalization), `utils/logger.ts` (error logging), `utils/errors.ts` (`Result<T>`), `utils/constants.ts`
- **Story 2.1** (Pipeline Orchestrator): Provides `src/pipeline.ts` orchestrator that calls the adapter
- **Story 2.2** (File Predictor): Provides `PredictionResult` used for CLAUDE.md generation (predicted files)
- **Story 2.3** (Model Router): Provides `RoutingResult` used for model selection in subprocess spawn
- **Story 2.4** (Prompt Compressor): Provides `CompressionResult` with the optimized prompt
- **Story 2.5** (Prompt Review UI): Provides the final approved prompt (may be edited by user)

### CLAUDE.md Generation Template

The adapter generates a temporary CLAUDE.md with this structure:

```markdown
# Claude Optimizer Context

## Focus Files
The following files are predicted to be relevant to this task:
- src/components/UserMenu.tsx (high confidence)
- src/styles/dropdown.css (medium confidence)
- src/components/UserMenu.test.tsx (medium confidence)

## Project Conventions
- Components use PascalCase naming
- Test files use .test.ts suffix
- CSS modules for component styling

## Domain Context
- UI components follow atomic design pattern
- Z-index layering defined in variables.css
```

### Files-Used Detection Strategy

The hybrid approach combines two complementary signals:

1. **Timestamp comparison:** Captures file modification times before and after Claude Code execution. Detects files that were actually modified (created/edited/deleted). High precision for write operations.

2. **Stdout parsing:** Scans Claude Code's terminal output for file path references. Detects files that were read or discussed but not necessarily modified. Uses regex patterns to identify project-relative and absolute file paths.

The two signals are merged and deduplicated to produce the most complete picture of files-used for the learning loop.

### Subprocess Execution Flow

```
1. detectClaudeCode() — verify CLI available
2. captureTimestamps() — snapshot file mtimes
3. generateClaudeMd() — write optimized CLAUDE.md
4. spawn('claude', [prompt], { cwd }) — execute
5. capture stdout/stderr — buffer output
6. wait for exit — get exit code
7. restoreClaudeMd() — restore original
8. detectModifiedFiles() — compare timestamps
9. parseFilePaths(stdout) — extract from output
10. merge + deduplicate — final filesUsed
11. return AdapterResult
```

### Special Exit Codes

| Exit Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Claude Code error |
| 10 | Optimizer fallback mode (optimized execution failed, raw was used) |

### References

- [Source: architecture.md#Core Architectural Decisions] — AD-01, AD-02, AD-04, AD-05, AD-08
- [Source: architecture.md#API & Communication Patterns] — AdapterResult interface, execution flow, files-used detection
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — All naming, structure, format patterns
- [Source: architecture.md#Complete Project Directory Structure] — adapter/ placement
- [Source: architecture.md#Process Patterns] — Async subprocess execution, error handling hierarchy
- [Source: epics.md#Story 2.6] — Original story definition and acceptance criteria

## Change Log

- 2026-03-05: Implemented full Claude Code adapter module — subprocess execution with CLAUDE.md injection, hybrid files-used detection (timestamps + stdout parsing), fail-open fallback, CLI detection, and pipeline integration. 34 new tests, 465 total tests passing, zero regressions.
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Fixed TypeScript type error: `FilePrediction` uses `score` not `confidence` for prediction scoring
- Fixed ESM mocking: used `vi.mock()` with factory function instead of `vi.spyOn()` for `node:child_process` (ESM modules are non-configurable)

### Completion Notes List

- All 16 tasks and subtasks implemented and verified
- AC1 (Subprocess Execution with CLAUDE.md Injection): `executeTask()` generates optimized CLAUDE.md, spawns subprocess, captures output, restores original CLAUDE.md
- AC2 (AdapterResult with Files-Used Detection): Hybrid detection via timestamp comparison + stdout parsing, token estimation, complete `AdapterResult` structure
- AC3 (Fail-Open Fallback): `executeTaskFailOpen()` catches errors, falls back to `executeRaw()`, never throws — returns error AdapterResult with exit code 10
- AC4 (CLI Detection): `detectClaudeCode()` checks PATH, caches result, handles cross-platform differences, provides clear error message
- Pipeline integration: `adaptStage()` wired into `runPipeline()` after review stage
- `AdapterResult` type in `types/pipeline.ts` updated from placeholder to re-export from adapter module
- 34 new tests (19 adapter, 15 file-detector), all passing
- Full regression suite: 465/465 tests passing
- TypeScript type checking passes cleanly

### File List

- `src/adapter/types.ts` (NEW) — AdapterResult, SpawnOptions, ClaudeCodeInfo, FileTimestamp types
- `src/adapter/claude-adapter.ts` (NEW) — Core adapter: CLI detection, CLAUDE.md generation/backup/restore, subprocess spawn, executeTask, executeRaw, executeTaskFailOpen
- `src/adapter/file-detector.ts` (NEW) — captureTimestamps, detectModifiedFiles, parseFilePaths, detectFilesUsed
- `src/adapter/index.ts` (NEW) — Barrel export for adapter module
- `src/types/pipeline.ts` (MODIFIED) — Updated AdapterResult from placeholder interface to re-export from adapter
- `src/pipeline.ts` (MODIFIED) — Wired adapter into pipeline, replaced stub adaptStage with real implementation
- `tests/adapter/claude-adapter.test.ts` (NEW) — 19 tests for adapter functionality
- `tests/adapter/file-detector.test.ts` (NEW) — 15 tests for file detection
