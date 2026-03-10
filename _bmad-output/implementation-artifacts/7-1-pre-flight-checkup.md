# Story 7.1: Pre-Flight Checkup

Status: done
Epic: 7 - Doctor Agent & Automated Recovery
Story: 7.1
Date: 2026-03-04
Complexity: Medium
Estimated Scope: Local-only pre-flight validation system with readiness scoring and auto-fix capabilities

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to verify my optimizer setup is healthy after initialization,
so that I can catch configuration issues before running my first optimized task.

## Acceptance Criteria (BDD)

### AC1: Pre-Flight Validation — All Checks Pass
**Given** a developer runs `co doctor --checkup` after `co init`
**When** the checkup runs
**Then** it validates: all 8 knowledge store JSON files exist and are valid (config.json, project-map.json, dependency-graph.json, task-history.json, patterns.json, metrics.json, keyword-index.json, doctor-log.json), project map is populated and complete, dependency graph has edges (for code projects), keyword index is populated, starter pack was loaded (if applicable), config.json has valid settings, and .schema-version matches installed version
**And** the checkup costs zero tokens (all validation is local)

### AC2: Readiness Score Display — Healthy Setup
**Given** the checkup finds no issues
**When** results are displayed
**Then** a readiness score is shown (e.g., "Setup health: 100% — Ready to go!")
**And** each check item is shown with a pass/fail indicator
**And** the user is directed: "Run your first task with `co \"your task\"`"
**And** a tip is shown about prediction accuracy improving over the first 5-10 sessions

### AC3: Issue Reporting with Severity Levels
**Given** the checkup finds issues
**When** results are displayed
**Then** each issue has a severity level (critical, warning, info)
**And** for each issue, options are presented: [1] Auto-fix what I can / [2] Continue anyway / [3] I'll fix manually
**And** critical issues recommend fixing before first task
**And** the readiness score reflects the severity of found issues

### AC4: Missing Project Detection
**Given** `co doctor --checkup` is run on a project without `co init`
**When** the checkup detects missing `.claude-opt/` directory
**Then** a clear message is shown: "Project not initialized. Run `co init` first."
**And** the command exits with a non-zero exit code

### AC5: Auto-Fix Capability
**Given** the checkup finds fixable issues (e.g., missing default config values, isolated dependency graph nodes)
**When** the user selects "[1] Auto-fix what I can"
**Then** the checkup attempts to fix each fixable issue
**And** results of auto-fix are displayed (fixed/failed)
**And** the readiness score is recalculated after fixes
**And** non-fixable issues are reported for manual resolution

### AC6: Zero Token Cost
**Given** a developer runs `co doctor --checkup`
**When** the checkup completes
**Then** zero tokens are consumed (no Claude API calls are made)
**And** all validation is performed using local file system checks and JSON parsing

## Tasks / Subtasks

- [ ] Task 1: Create doctor module types (AC: #1, #3)
  - [ ] Create `src/doctor/types.ts` with checkup-related types
  - [ ] Define `CheckupResult` interface: `{ checks: CheckItem[]; score: number; issues: CheckupIssue[]; passed: boolean }`
  - [ ] Define `CheckItem` interface: `{ name: string; status: 'pass' | 'fail' | 'warn'; detail: string; severity: CheckSeverity }`
  - [ ] Define `CheckSeverity` type: `'critical' | 'warning' | 'info'`
  - [ ] Define `CheckupIssue` interface: `{ check: string; severity: CheckSeverity; message: string; isFixable: boolean; fixDescription?: string }`
  - [ ] Define `CheckupFix` interface: `{ issue: CheckupIssue; applied: boolean; result: string }`
  - [ ] Define shared Doctor types used across 7.1–7.4: `DoctorMode` (`'supervised' | 'autonomous'`), `FindingType` (`'stale-pattern' | 'missing-cooccurrence' | 'bad-prediction' | 'thin-domain'`), `FindingSeverity` (`'critical' | 'medium' | 'low' | 'info'`)
  - [ ] Define `DoctorLogEntry` interface matching the doctor-log.json schema: `{ id, timestamp, mode, trigger, triggerDetail, usedArchive, findings[], actions[], healthScore: { before, after }, tokensCost }`

- [ ] Task 2: Create checkup validation engine (AC: #1, #6)
  - [ ] Create `src/doctor/checkup.ts`
  - [ ] Implement `runCheckup(projectRoot: string): Result<CheckupResult>` — main entry function
  - [ ] Implement `checkStoreDirectory(projectRoot: string): CheckItem` — verify `.claude-opt/` exists
  - [ ] Implement `checkJsonFiles(projectRoot: string): CheckItem[]` — validate all 8 JSON files exist and parse without error
  - [ ] Implement `checkProjectMap(projectRoot: string): CheckItem` — verify project map is populated (has files, has domains)
  - [ ] Implement `checkDependencyGraph(projectRoot: string): CheckItem` — verify edges exist, check for isolated nodes
  - [ ] Implement `checkKeywordIndex(projectRoot: string): CheckItem` — verify keyword index is populated
  - [ ] Implement `checkStarterPack(projectRoot: string): CheckItem` — verify starter pack was loaded if applicable
  - [ ] Implement `checkConfig(projectRoot: string): CheckItem` — verify config.json has valid required fields (budget, window duration, doctor mode)
  - [ ] Implement `checkSchemaVersion(projectRoot: string): CheckItem` — verify .schema-version matches `SCHEMA_VERSION` constant
  - [ ] All validation reads via the `store/` module — no direct filesystem access

- [ ] Task 3: Implement readiness score calculation (AC: #2, #3)
  - [ ] Implement `calculateReadinessScore(checks: CheckItem[]): number` — score 0-100
  - [ ] Critical failures deduct 25 points each
  - [ ] Warnings deduct 10 points each
  - [ ] Info items deduct 0 points
  - [ ] Score floors at 0, caps at 100
  - [ ] Determine `passed` threshold: score >= 60 means "Ready with warnings", score >= 90 means "Ready to go!", score < 60 means "Needs attention"

- [ ] Task 4: Implement auto-fix engine (AC: #5)
  - [ ] Implement `applyCheckupFixes(issues: CheckupIssue[], projectRoot: string): CheckupFix[]`
  - [ ] Fix: missing config defaults — populate with `DEFAULT_BUDGET`, `DEFAULT_WINDOW_DURATION`, default doctor mode
  - [ ] Fix: missing doctor-log.json — create with empty entries array and schemaVersion
  - [ ] Fix: isolated dependency graph nodes — flag as info only (cannot auto-fix)
  - [ ] Fix: window duration unset — set to `DEFAULT_WINDOW_DURATION`
  - [ ] Each fix writes through `store/` module with atomic writes
  - [ ] Return array of `CheckupFix` results indicating success/failure per fix

- [ ] Task 5: Implement checkup CLI output rendering (AC: #2, #3)
  - [ ] Implement `renderCheckupReport(result: CheckupResult): string` using Chalk + box-drawing
  - [ ] Render each check item with pass (checkmark) / warning (triangle) / fail (X) icons
  - [ ] Render readiness score with filled/empty circles indicator
  - [ ] Render issue list with severity coloring (critical=red, warning=yellow, info=blue)
  - [ ] Render fix options prompt: [1] Auto-fix / [2] Continue anyway / [3] Fix manually
  - [ ] Render post-fix summary when auto-fix is applied
  - [ ] Match the CLI mockup layout from the PRD (box-drawing style)

- [ ] Task 6: Implement checkup user interaction flow (AC: #3, #4, #5)
  - [ ] Implement `handleCheckupInteraction(result: CheckupResult, projectRoot: string): Promise<void>`
  - [ ] If no issues: display positive report and "Run your first task" tip, then exit
  - [ ] If issues found: display report, prompt for choice (1/2/3)
  - [ ] Choice 1 (auto-fix): run `applyCheckupFixes`, display results, recalculate score
  - [ ] Choice 2 (continue): display reminder about issues, exit normally
  - [ ] Choice 3 (manual): display list of issues with manual fix instructions, exit
  - [ ] Use Node.js readline for user prompting (no additional dependencies)

- [ ] Task 7: Create doctor module barrel export (AC: #1)
  - [ ] Create `src/doctor/index.ts` — public API barrel export
  - [ ] Export `runCheckup` from `checkup.ts`
  - [ ] Export all types from `types.ts`
  - [ ] Add placeholder exports for future stories: `runDiagnostics` (7.2), `runSupervised` (7.3), `runAutonomous` (7.4)

- [ ] Task 8: Register `doctor --checkup` CLI command (AC: #1, #4)
  - [ ] In `src/index.ts`, register (or update placeholder) `doctor` subcommand
  - [ ] Add `--checkup` flag to doctor command
  - [ ] When `--checkup` is passed: resolve project root, call `runCheckup`, render results, handle interaction
  - [ ] When project root has no `.claude-opt/`: display "Project not initialized" message and exit with code 1

- [ ] Task 9: Write unit tests (AC: #1, #2, #3, #4, #5, #6)
  - [ ] Create `tests/doctor/checkup.test.ts`
  - [ ] Test: all checks pass with valid knowledge store → score 100, passed true
  - [ ] Test: missing JSON files → critical severity, score deducted
  - [ ] Test: empty project map → warning severity
  - [ ] Test: isolated dependency graph nodes → warning severity
  - [ ] Test: missing `.claude-opt/` directory → early exit with initialization message
  - [ ] Test: schema version mismatch → critical severity
  - [ ] Test: readiness score calculation with various check combinations
  - [ ] Test: auto-fix applies fixable issues and skips non-fixable
  - [ ] Test: zero token cost verification (no adapter calls in any code path)
  - [ ] Use test-store.ts in-memory mock for all store interactions

- [ ] Task 10: Verify end-to-end (AC: #1–#6)
  - [ ] Run `npm run build` — verify clean build with zero errors
  - [ ] Run `npm run test` — verify all new tests pass
  - [ ] Run `npm run typecheck` — verify TypeScript strict mode passes
  - [ ] Manually test: `co doctor --checkup` on an initialized project
  - [ ] Manually test: `co doctor --checkup` on a project without `co init`

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-03 | All file I/O through `store/` module — never direct filesystem access | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | `withFailOpen(stageFn, fallback)` wrapper for error boundaries | [Source: architecture.md#Core Architectural Decisions] |
| AD-05 | POSIX internal paths, platform-native I/O via `utils/paths.ts` | [Source: architecture.md#Core Architectural Decisions] |
| AD-06 | TypeScript Type Guards for validation (no Zod/Ajv) | [Source: architecture.md#Core Architectural Decisions] |
| AD-07 | Chalk + String Templates for terminal UI (no TUI framework) | [Source: architecture.md#Core Architectural Decisions] |

### Key Constraint: Zero Token Cost

Story 7.1 is strictly local-only validation. The checkup must **never** call the Claude Code adapter or any API. All checks are performed by reading local JSON files and validating their structure. This is a hard requirement from DR-14 and DR-16.

### Doctor Module Structure

```
src/doctor/
├── index.ts          # Public API: runCheckup(), (placeholders for 7.2–7.4)
├── types.ts          # All Doctor types shared across 7.1–7.4
├── checkup.ts        # Pre-flight validation engine (this story)
├── doctor.ts         # Core diagnostic engine (Story 7.2)
├── supervised.ts     # Supervised mode (Story 7.3)
├── autonomous.ts     # Autonomous mode (Story 7.4)
└── audit-log.ts      # Audit logging (Story 7.4)
```

### Knowledge Store Files to Validate

The 8 JSON files that checkup validates (plus .schema-version):
1. `config.json` — budget, window duration, doctor mode setting
2. `project-map.json` — file metadata, domains
3. `dependency-graph.json` — adjacency list edges
4. `task-history.json` — past task records
5. `patterns.json` — co-occurrence patterns, conventions
6. `metrics.json` — prediction accuracy, token usage
7. `keyword-index.json` — keyword-to-file mappings
8. `doctor-log.json` — doctor audit trail (may be empty)
9. `.schema-version` — version string matching installed version

### Store Access Pattern

Doctor module has READ-WRITE access to: patterns, metrics, doctor-log. Reads: task-history, dep-graph, archive/* (with permission). For checkup (7.1), only READ access is needed for validation, plus WRITE access for auto-fix operations on config and doctor-log.

All reads/writes must go through the `store/` module typed accessors:
```typescript
import { readConfig, readProjectMap, readDependencyGraph, readTaskHistory,
         readPatterns, readMetrics, readKeywordIndex, readDoctorLog,
         readSchemaVersion } from '../store/index.js';
```

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `checkup.ts`, `audit-log.ts` |
| Test files | kebab-case.test.ts | `tests/doctor/checkup.test.ts` |
| Functions | camelCase | `runCheckup()`, `checkJsonFiles()` |
| Variables | camelCase | `checkupResult`, `readinessScore` |
| Types/Interfaces | PascalCase | `CheckupResult`, `CheckItem` |
| Constants | UPPER_SNAKE_CASE | `CHECKUP_CRITICAL_DEDUCTION` |
| Booleans | is/has/should/can prefix | `isFixable`, `hasPassed` |
| JSON fields | camelCase | `schemaVersion`, `healthScore` |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): Result<T> { return { ok: true, value }; }
function err<T>(error: string): Result<T> { return { ok: false, error }; }
```

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display.

**Null vs Undefined:** JSON uses `null`, TypeScript uses `undefined` for optional params, `null` for explicit "no value".

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- Modules import from other modules ONLY through their `index.ts` barrel export
- Never import from another module's internal files directly
- Shared types used across 3+ modules go in `src/types/`
- `utils/` and `store/` are leaf dependencies — never import pipeline modules
- Doctor module imports: `store/index.ts` (for data access), `utils/index.ts` (for paths, logger, constants, errors)

[Source: architecture.md#Import Rules]

### CLI Mockup Reference

The checkup output should match the PRD CLI mockup style:
- Box-drawing characters for framing
- Checkmark/warning/X icons per check item
- Filled/empty circles for readiness score
- Numbered options for user interaction

[Source: prd.md#co doctor --checkup mockups]

### Dependencies

- **Epic 1 (Stories 1.1, 1.2):** Store module, utils, types, constants — must be complete
- **Epic 1 (Stories 1.3, 1.4):** Scanner creates the project-map and dependency-graph that checkup validates
- **No dependency on Epic 2:** Checkup does not need the adapter or pipeline

### What This Story Does NOT Create

- `src/doctor/doctor.ts` — Diagnostic engine (Story 7.2)
- `src/doctor/supervised.ts` — Supervised mode (Story 7.3)
- `src/doctor/autonomous.ts` — Autonomous mode (Story 7.4)
- `src/doctor/audit-log.ts` — Audit logging (Story 7.4)
- These files may have placeholder stubs in `index.ts` but no implementation

### References

- [Source: architecture.md#Complete Project Directory Structure] — Doctor module file layout
- [Source: architecture.md#Core Architectural Decisions] — AD-03, AD-04, AD-05, AD-06, AD-07, AD-08
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — All naming, structure, format patterns
- [Source: architecture.md#Project Structure & Boundaries] — Module boundaries and dependency direction
- [Source: prd.md#Domain 8: Doctor Agent] — DR-14, DR-15, DR-16
- [Source: prd.md#doctor-log.json] — Doctor log schema
- [Source: prd.md#co doctor --checkup CLI mockups] — Pre-flight UI mockups
- [Source: epics.md#Story 7.1] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
N/A

### Completion Notes List
- Doctor module created in `src/doctor/` with pre-flight checkup
- Validates all knowledge store JSON files exist and are valid
- Checks project-map, dependency-graph, keyword-index, config, schema-version
- Health/readiness score calculation with pass/warn/fail status per check
- CLI registered: `co doctor --checkup` command
- Terminal output with checkmark/warning/X icons
- User interaction for issues found (auto-fix / continue / fix manually)
- Zero token cost — all validation is local
- 42 tests passing

### File List
- `src/doctor/types.ts` — NEW: CheckupResult, CheckItem, CheckStatus types
- `src/doctor/checkup.ts` — NEW: runCheckup(), renderCheckupReport(), handleCheckupInteraction()
- `src/doctor/index.ts` — NEW: barrel exports
- `src/index.ts` — MODIFIED: wired `co doctor --checkup` command
- `tests/doctor/checkup.test.ts` — NEW: 42 tests
