# Story 7.4: Autonomous Mode, Deep Analysis & Audit Logging

Status: done
Epic: 7 - Doctor Agent & Automated Recovery
Story: 7.4
Date: 2026-03-04
Complexity: High
Estimated Scope: Opt-in autonomous fix mode, deep analysis with archived history access, and comprehensive append-only audit logging to doctor-log.json

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want an opt-in autonomous Doctor mode and full audit trail of all Doctor actions,
so that routine fixes happen automatically while I maintain visibility and control.

## Acceptance Criteria (BDD)

### AC1: Autonomous Mode Configuration
**Given** the user configures Doctor to Autonomous mode via `co config doctor-mode autonomous`
**When** prediction accuracy drops below the threshold for any domain
**Then** the Doctor automatically runs diagnostics without waiting for user acknowledgement
**And** low-risk fixes are auto-applied (e.g., adding co-occurrence patterns, removing stale entries)
**And** medium/high-risk fixes still require user approval even in autonomous mode

### AC2: Autonomous Mode Behavior — Low-Risk Auto-Apply
**Given** Doctor is in Autonomous mode
**When** a low-risk fix is identified (e.g., adding a co-occurrence pattern, removing a clearly stale entry)
**Then** the fix is applied automatically without prompting the user
**And** the user is notified after the fact: "Doctor auto-applied 2 low-risk fixes. Run `co doctor --log` to review."

### AC3: Autonomous Mode Behavior — Medium/High-Risk Approval
**Given** Doctor is in Autonomous mode
**When** a medium or high-risk fix is identified
**Then** the user is prompted for approval before the fix is applied (same as supervised mode)
**And** the prompt clearly indicates the risk level and explains why this fix needs approval

### AC4: Deep Analysis Mode
**Given** the Doctor (in either mode) determines diagnosis is severe or insufficient recent data
**When** it needs deeper analysis
**Then** it asks the user for permission to analyze archived task history: "Need to analyze archived history for deeper patterns. Proceed? This may use more tokens."
**And** deep analysis only runs with explicit user permission
**And** the user is warned about potential additional token cost (e.g., "Estimated cost: ~800-1,200 tokens")

### AC5: Deep Analysis via CLI Flag
**Given** a developer runs `co doctor --deep`
**When** the deep analysis mode is triggered
**Then** the archive size and estimated token cost are displayed
**And** the user is prompted: [1] Proceed with deep analysis / [2] Standard analysis only / [3] Cancel
**And** deep analysis accesses archived task history for extended pattern discovery

### AC6: Audit Logging — Every Action Logged
**Given** the Doctor takes any action (finding, diagnosis, fix applied, fix skipped)
**When** the action occurs
**Then** it is logged to `.claude-opt/doctor-log.json` with: finding details, action taken, timestamp, mode (supervised/autonomous), and whether the fix was auto-applied or user-approved
**And** the audit log is append-only and never truncated

### AC7: Audit Log Schema
**Given** a Doctor session completes
**When** the session is logged
**Then** the log entry follows the doctor-log.json schema: `{ id, timestamp, mode, trigger, triggerDetail, usedArchive, findings[], actions[], healthScore: { before, after }, tokensCost }`
**And** the `id` follows the convention `doc_YYYYMMDD_NNN`
**And** `actions[].approvedBy` is `'user'` or `'auto'` depending on the mode

### AC8: Audit Log Review
**Given** the user wants to review Doctor history
**When** they inspect `.claude-opt/doctor-log.json` (or run a review command)
**Then** the log is human-readable JSON with clear entries
**And** full transparency into every Doctor action is maintained

## Tasks / Subtasks

- [x] Task 1: Define autonomous and audit log types (AC: #1, #6, #7)
  - [x] In `src/doctor/types.ts`, add autonomous-mode and audit-log types
  - [x] Define `AutonomousConfig` interface: `{ enabled: boolean; autoApplyRiskLevels: ('low')[]; requireApprovalRiskLevels: ('medium' | 'high')[] }`
  - [x] Define `AutonomousResult` interface: `{ autoApplied: FixResult[]; pendingApproval: FixProposal[]; userApproved: FixResult[]; notifications: string[] }`
  - [x] Define `DeepAnalysisOptions` interface: `{ archivePath: string; archiveSize: number; estimatedTokenCost: { min: number; max: number }; userApproved: boolean }`
  - [x] Define `DoctorLogEntry` interface (if not already defined in 7.1): `{ id: string; timestamp: string; mode: DoctorMode; trigger: DoctorTrigger; triggerDetail: string; usedArchive: boolean; findings: Finding[]; actions: AuditAction[]; healthScore: { before: HealthScore; after: HealthScore }; tokensCost: number }`
  - [x] Define `DoctorTrigger` type: `'threshold-breach' | 'manual' | 'checkup' | 'deep-analysis'`
  - [x] Define `AuditAction` interface: `{ finding: string; action: 'applied' | 'skipped' | 'auto-applied' | 'failed'; approvedBy: 'user' | 'auto' | 'n/a'; result: string }`

- [x] Task 2: Implement autonomous mode engine (AC: #1, #2, #3)
  - [x] Create `src/doctor/autonomous.ts`
  - [x] Implement `runAutonomous(alerts: ThresholdAlert[]): Promise<AutonomousResult>` — main autonomous mode entry
  - [x] For each alert: automatically run `runDiagnostics()` without waiting for user acknowledgement
  - [x] Generate fix proposals from diagnostics
  - [x] Partition proposals by risk level: low-risk → auto-apply queue, medium/high-risk → approval queue
  - [x] Auto-apply all low-risk fixes: call `applyFix()` for each, record as `approvedBy: 'auto'`
  - [x] For medium/high-risk proposals: prompt user for approval (reuse supervised approval flow from Story 7.3)
  - [x] Collect all results into `AutonomousResult`

- [x] Task 3: Implement autonomous notification system (AC: #2)
  - [x] Implement `renderAutonomousNotification(result: AutonomousResult): string` — post-action summary
  - [x] Show: number of auto-applied fixes, number of pending approvals
  - [x] Example: "Doctor auto-applied 2 low-risk fixes. 1 fix requires approval."
  - [x] Show brief summary of each auto-applied fix (type, affected files)
  - [x] Direct user to audit log: "Run `co doctor --log` to review full details."
  - [x] Use Chalk for color-coded output (green for auto-applied, yellow for pending)

- [x] Task 4: Implement deep analysis mode (AC: #4, #5)
  - [x] In `src/doctor/doctor.ts`, implement `runDeepAnalysis(options: DeepAnalysisOptions): Promise<Result<Finding[]>>`
  - [x] Calculate archive size by reading archive directory metadata (not full content)
  - [x] Estimate token cost based on archive size: base 800 + (tasks / 100) * 200 tokens
  - [x] Implement `renderDeepAnalysisPrompt(options: DeepAnalysisOptions): string` — display archive info and cost estimate
  - [x] Implement `promptDeepAnalysisApproval(): Promise<'proceed' | 'standard' | 'cancel'>` — user choice
  - [x] If approved: read archived task history via store, build extended analysis prompt
  - [x] Send extended diagnostic prompt to Claude Code via adapter (Haiku model)
  - [x] Parse response for additional findings not visible in recent data
  - [x] Set `usedArchive: true` in the session record
  - [x] If not approved: fall back to standard analysis

- [x] Task 5: Implement deep analysis CLI integration (AC: #5)
  - [x] Update `doctor` command to handle `--deep` flag
  - [x] When `--deep`: calculate archive metadata, render prompt, get user approval
  - [x] If user selects "Proceed": run deep analysis, then standard diagnostics, merge findings
  - [x] If user selects "Standard only": run standard diagnostics only
  - [x] If user selects "Cancel": exit gracefully
  - [x] Match PRD CLI mockup for deep analysis prompt

- [x] Task 6: Implement audit log writer (AC: #6, #7)
  - [x] Create `src/doctor/audit-log.ts`
  - [x] Implement `writeDoctorLogEntry(entry: DoctorLogEntry): Result<void>` — append entry to doctor-log.json
  - [x] Read current doctor-log.json via store
  - [x] Append new entry to the `entries` array
  - [x] Write updated doctor-log.json via store (atomic write)
  - [x] Never truncate or remove existing entries (append-only)
  - [x] Implement `generateLogEntryId(): string` — format `doc_YYYYMMDD_NNN` where NNN increments daily
  - [x] Count existing entries for today to determine NNN sequence number

- [x] Task 7: Implement audit log entry builder (AC: #6, #7)
  - [x] Implement `buildLogEntry(params: { mode, trigger, triggerDetail, usedArchive, findings, fixResults, healthBefore, healthAfter, tokensCost }): DoctorLogEntry`
  - [x] Map `FixResult[]` to `AuditAction[]` — translate fix results to audit actions
  - [x] Set `approvedBy` to `'auto'` for autonomous auto-applied fixes, `'user'` for user-approved, `'n/a'` for skipped
  - [x] Calculate health score before (from initial diagnostics) and after (recalculate post-fixes)
  - [x] Set timestamp to current ISO 8601 string

- [x] Task 8: Integrate audit logging into all Doctor flows (AC: #6, #7)
  - [x] After checkup (Story 7.1): log entry with trigger `'checkup'`, no findings/actions if all pass
  - [x] After supervised session (Story 7.3): log entry with trigger `'threshold-breach'` or `'manual'`, all findings and fix results
  - [x] After autonomous session: log entry with trigger `'threshold-breach'`, auto-applied and user-approved fixes
  - [x] After manual `co doctor` run: log entry with trigger `'manual'`
  - [x] After deep analysis: log entry with `usedArchive: true` and extended token cost
  - [x] Wrap all logging in error handling — logging failure should never crash the Doctor or pipeline

- [x] Task 9: Implement autonomous mode configuration (AC: #1)
  - [x] In `co config` command handler: support `doctor-mode supervised|autonomous`
  - [x] Write mode to config.json via store
  - [x] Validate input: only `'supervised'` or `'autonomous'` accepted
  - [x] When switching to autonomous: display notice "Doctor will auto-apply low-risk fixes when accuracy drops. Medium/high-risk fixes still require approval."
  - [x] Read mode from config in pipeline orchestrator to determine which Doctor flow to invoke

- [x] Task 10: Integrate autonomous mode into pipeline (AC: #1)
  - [x] Update the post-task pipeline flow (where supervised threshold check was integrated in Story 7.3):
  - [x] Read doctor mode from config
  - [x] If `'supervised'`: call `runSupervised(alerts)` (from Story 7.3)
  - [x] If `'autonomous'`: call `runAutonomous(alerts)` (from this story)
  - [x] After either flow: call `writeDoctorLogEntry()` with session results
  - [x] Ensure mode switching is clean — no leftover state between modes

- [x] Task 11: Update doctor module barrel export (AC: #1, #6)
  - [x] Update `src/doctor/index.ts` to export: `runAutonomous`, `runDeepAnalysis`, `writeDoctorLogEntry`, `buildLogEntry`
  - [x] Export all new types: `AutonomousResult`, `DeepAnalysisOptions`, `DoctorLogEntry`, `AuditAction`, `DoctorTrigger`

- [x] Task 12: Write unit tests — autonomous mode (AC: #1, #2, #3)
  - [x] Create `tests/doctor/autonomous.test.ts`
  - [x] Test: autonomous mode detects threshold breach → auto-runs diagnostics (no user prompt)
  - [x] Test: low-risk fixes auto-applied → FixResult with `approvedBy: 'auto'`
  - [x] Test: medium-risk fix → user prompted for approval
  - [x] Test: high-risk fix → user prompted for approval
  - [x] Test: mixed risk levels → low auto-applied, medium/high prompted
  - [x] Test: autonomous notification shows correct counts and fix summaries
  - [x] Test: autonomous mode disabled (supervised) → autonomous flow not triggered

- [x] Task 13: Write unit tests — deep analysis (AC: #4, #5)
  - [x] Create or extend `tests/doctor/doctor.test.ts` with deep analysis tests
  - [x] Test: deep analysis prompt displays archive size and cost estimate
  - [x] Test: user approves deep analysis → archived history read, extended findings returned
  - [x] Test: user declines deep analysis → standard analysis only
  - [x] Test: `usedArchive` flag set to true when deep analysis runs
  - [x] Test: token cost estimate scales with archive size
  - [x] Test: `--deep` CLI flag triggers deep analysis prompt
  - [x] Test: deep analysis failure falls back gracefully

- [x] Task 14: Write unit tests — audit logging (AC: #6, #7, #8)
  - [x] Create `tests/doctor/audit-log.test.ts`
  - [x] Test: log entry appended to existing entries array (not overwritten)
  - [x] Test: log entry ID follows `doc_YYYYMMDD_NNN` convention with correct sequence
  - [x] Test: log entry from supervised session has `mode: 'supervised'`, `approvedBy: 'user'`
  - [x] Test: log entry from autonomous session has `mode: 'autonomous'`, auto-applied has `approvedBy: 'auto'`
  - [x] Test: log entry from checkup has `trigger: 'checkup'`
  - [x] Test: log entry from deep analysis has `usedArchive: true`
  - [x] Test: health score before/after recorded correctly
  - [x] Test: tokens cost recorded correctly
  - [x] Test: logging failure does not crash Doctor or pipeline
  - [x] Test: empty doctor-log.json (first entry) handled correctly

- [x] Task 15: Verify end-to-end (AC: #1–#8)
  - [x] Run `npm run build` — verify clean build with zero errors
  - [x] Run `npm run test` — verify all new tests pass
  - [x] Run `npm run typecheck` — verify TypeScript strict mode passes
  - [x] Manually test: `co config doctor-mode autonomous` then trigger threshold breach
  - [x] Manually test: autonomous auto-apply of low-risk fix
  - [x] Manually test: autonomous prompt for medium-risk fix
  - [x] Manually test: `co doctor --deep` with archived history
  - [x] Manually test: inspect doctor-log.json for correct entries after various operations

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-03 | All file I/O through `store/` module — never direct filesystem access | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | `withFailOpen(stageFn, fallback)` wrapper for error boundaries | [Source: architecture.md#Core Architectural Decisions] |
| AD-05 | POSIX internal paths, platform-native I/O via `utils/paths.ts` | [Source: architecture.md#Core Architectural Decisions] |
| AD-07 | Chalk + String Templates for terminal UI (no TUI framework) | [Source: architecture.md#Core Architectural Decisions] |
| AD-08 | Doctor uses same adapter as regular tasks with diagnostic prompt targeting Haiku model | [Source: architecture.md#Core Architectural Decisions] |

### Autonomous Mode Safety Model

Autonomous mode is strictly opt-in and has built-in safety constraints:

| Principle | Implementation |
|---|---|
| Opt-in only | Must be explicitly configured via `co config doctor-mode autonomous` |
| Low-risk auto-apply | Only `'low'` risk fixes auto-applied: adding co-occurrences, removing clearly stale entries |
| Medium/high require approval | Weight reductions, bulk changes, domain-wide resets always require user approval |
| Notification | User is always notified of auto-applied fixes after the fact |
| Audit trail | Every auto-applied fix is logged with `approvedBy: 'auto'` |
| Revertable | Soft deletes (weight to 0.0) rather than hard deletes — patterns can be restored |

### Doctor Log Schema (doctor-log.json)

```json
{
  "schemaVersion": "1.0.0",
  "entries": [
    {
      "id": "doc_20260304_001",
      "timestamp": "2026-03-04T13:00:00Z",
      "mode": "supervised",
      "trigger": "threshold-breach",
      "triggerDetail": "compliance domain precision dropped to 0.48",
      "usedArchive": false,
      "findings": [
        {
          "type": "stale-pattern",
          "severity": "medium",
          "description": "old-auth-middleware.ts has weight 0.8 but unused in last 6 tasks",
          "affectedDomain": "auth",
          "recommendation": "Remove from active predictions"
        }
      ],
      "actions": [
        {
          "finding": "stale-pattern: old-auth-middleware.ts",
          "action": "applied",
          "approvedBy": "user",
          "result": "Weight reduced from 0.8 to 0.0"
        }
      ],
      "healthScore": {
        "before": { "overall": 0.62, "compliance": 0.48 },
        "after": { "overall": 0.74, "compliance": 0.72 }
      },
      "tokensCost": 340
    }
  ]
}
```

### Audit Log Implementation Rules

1. **Append-only:** Never truncate, delete, or overwrite existing entries. Always read-then-append-then-write.
2. **Atomic writes:** Use store module's atomic write pattern (write .tmp, rename).
3. **Never crash:** Audit log write failures are caught and logged to console but never crash the Doctor or pipeline.
4. **Human-readable:** JSON is pretty-printed with 2-space indentation (the store module's `atomicWrite` handles this).
5. **ID convention:** `doc_YYYYMMDD_NNN` — e.g., `doc_20260304_001`. The NNN portion increments per day, starting from 001.

### Deep Analysis Architecture

Deep analysis extends the standard diagnostic flow:

```
Standard:  Read recent data → Local analysis → Haiku prompt (300 tokens) → Report
Deep:      Read recent data → Read archived data → Extended local analysis → Haiku prompt (800-1200 tokens) → Extended report
```

Archive access is gated:
1. User must explicitly approve (either via `--deep` flag or Doctor's recommendation)
2. Token cost estimate shown before proceeding
3. `usedArchive: true` flag set in the audit log entry

The archive location is `.claude-opt/archive/` (managed by the store module). Deep analysis reads `archive/task-history-*.json` files for historical patterns that may not be visible in the current truncated task history.

### Store Access Pattern

Doctor module full access for this story:
- **Reads:** task-history, patterns, metrics, dep-graph, config, archive/* (with permission), doctor-log
- **Writes:** patterns (fix application), metrics (health score updates), doctor-log (audit entries)

```typescript
import { readPatterns, writePatterns, readMetrics, writeMetrics,
         readTaskHistory, readDependencyGraph, readConfig,
         readDoctorLog, writeDoctorLog, readArchive } from '../store/index.js';
import { executeTask } from '../adapter/index.js';  // For Haiku diagnostic calls
import { checkThresholds, runSupervised, applyFix,
         generateFixProposals } from './supervised.js';  // From Story 7.3
import { runDiagnostics, calculateHealthScore } from './doctor.js';  // From Story 7.2
```

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `autonomous.ts`, `audit-log.ts` |
| Test files | kebab-case.test.ts | `tests/doctor/autonomous.test.ts`, `tests/doctor/audit-log.test.ts` |
| Functions | camelCase | `runAutonomous()`, `writeDoctorLogEntry()` |
| Variables | camelCase | `autonomousResult`, `logEntry` |
| Types/Interfaces | PascalCase | `AutonomousResult`, `DoctorLogEntry` |
| Constants | UPPER_SNAKE_CASE | `AUTO_APPLY_RISK_LEVELS` |
| Booleans | is/has/should/can prefix | `isAutoApplied`, `hasUserApproval`, `shouldUseArchive` |
| JSON fields | camelCase | `usedArchive`, `tokensCost`, `approvedBy` |
| IDs | Prefixed with entity abbreviation | `doc_20260304_001` (doctor log entry) |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display.

**Null vs Undefined:** JSON uses `null`, TypeScript uses `undefined` for optional params.

**Timestamps:** ISO 8601 strings — e.g., `"2026-03-04T13:00:00Z"`.

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- Modules import from other modules ONLY through their `index.ts` barrel export
- Within the doctor module, internal imports between files are allowed (autonomous.ts can import from supervised.ts, doctor.ts, audit-log.ts)
- Doctor imports from: `store/index.ts`, `adapter/index.ts`, `utils/index.ts`

[Source: architecture.md#Import Rules]

### CLI Mockup Reference — Deep Analysis

```
$ co doctor --deep

Warning: Deep analysis reads archived task history.
  Archive: 1,247 tasks (2026-01-15 to 2026-02-28)
  Estimated cost: ~800-1,200 tokens

  [1] Proceed with deep analysis
  [2] Standard analysis only
  [3] Cancel
```

[Source: prd.md#co doctor --deep CLI mockup]

### Complete Doctor Module Structure (After Story 7.4)

```
src/doctor/
├── index.ts          # Public API: runCheckup, runDiagnostics, runSupervised,
│                     #   runAutonomous, runDeepAnalysis, writeDoctorLogEntry,
│                     #   checkThresholds, all types
├── types.ts          # All Doctor types: checkup, diagnostic, supervised,
│                     #   autonomous, audit log types
├── checkup.ts        # Pre-flight validation (Story 7.1)
├── doctor.ts         # Diagnostic engine + deep analysis (Stories 7.2, 7.4)
├── supervised.ts     # Supervised mode + fix application (Story 7.3)
├── autonomous.ts     # Autonomous mode (Story 7.4)
└── audit-log.ts      # Audit log read/write (Story 7.4)
```

### Dependencies

- **Story 7.1:** Doctor module scaffold, types.ts, index.ts barrel, checkup.ts
- **Story 7.2:** Diagnostic engine (`runDiagnostics`, `calculateHealthScore`), finding types
- **Story 7.3:** Supervised mode (`checkThresholds`, `runSupervised`, `applyFix`, `generateFixProposals`), fix types
- **Epic 1 (Stories 1.1, 1.2):** Store module, utils, types, constants
- **Epic 2 (Story 2.1):** Adapter module for Haiku diagnostic calls
- **Epic 3 (Story 3.1):** Metrics data with per-domain prediction accuracy

### What This Story Creates (Final Pieces)

- `src/doctor/autonomous.ts` — Autonomous mode engine
- `src/doctor/audit-log.ts` — Audit log reader/writer
- Deep analysis logic added to `src/doctor/doctor.ts`
- Autonomous config handling in `co config` command
- Integration of audit logging into all existing Doctor flows (checkup, supervised, autonomous)
- `tests/doctor/autonomous.test.ts` — Autonomous mode tests
- `tests/doctor/audit-log.test.ts` — Audit logging tests

### References

- [Source: architecture.md#Complete Project Directory Structure] — Doctor module file layout
- [Source: architecture.md#Core Architectural Decisions] — AD-03, AD-04, AD-05, AD-07, AD-08
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — Naming, structure, format patterns
- [Source: architecture.md#Project Structure & Boundaries] — Module boundaries, dependency direction
- [Source: prd.md#Domain 8: Doctor Agent] — DR-07, DR-12, DR-13
- [Source: prd.md#doctor-log.json] — Complete doctor-log.json schema with example
- [Source: prd.md#co doctor --deep CLI mockup] — Deep analysis prompt mockup
- [Source: prd.md#Module Access Matrix] — Doctor read/write permissions (patterns, metrics, doctor-log)
- [Source: epics.md#Story 7.4] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
N/A — all tests passed on first run.

### Completion Notes List
- All 15 tasks implemented and verified
- Build: clean (zero errors), Typecheck: passes, Tests: 761 passed (49 files)
- Created `src/doctor/autonomous.ts` — autonomous mode engine with risk-level partitioning and auto-apply for low-risk fixes
- Created `src/doctor/audit-log.ts` — append-only audit log with `doc_YYYYMMDD_NNN` ID convention
- Extended `src/doctor/doctor.ts` with deep analysis functions (getArchiveMetadata, renderDeepAnalysisPrompt, promptDeepAnalysisApproval, runDeepAnalysis)
- Extended `src/doctor/types.ts` with AutonomousConfig, AutonomousResult, DeepAnalysisOptions, DoctorTrigger, AuditAction, AUTO_APPLY_RISK_LEVELS, DEEP_ANALYSIS_BASE_TOKENS, DEEP_ANALYSIS_TOKENS_PER_100
- Updated `src/pipeline.ts` Stage 9 to support both supervised and autonomous modes based on config.doctorMode
- Added `doctor-mode` config key to `src/index.ts` (show + set with validation)
- Added `readJSON` to `src/store/index.ts` barrel re-exports (needed by doctor.ts deep analysis)
- Updated `src/doctor/index.ts` with all new exports for Story 7.4
- Created `tests/doctor/autonomous.test.ts` (8 tests) and `tests/doctor/audit-log.test.ts` (~20 tests including deep analysis)

### File List

| File | Action | Description |
|---|---|---|
| `src/doctor/types.ts` | Modified | Added AutonomousConfig, AutonomousResult, DeepAnalysisOptions, DoctorTrigger, AuditAction types and constants |
| `src/doctor/autonomous.ts` | Created | Autonomous mode engine: runAutonomous, renderAutonomousNotification |
| `src/doctor/audit-log.ts` | Created | Audit log: generateLogEntryId, buildLogEntry, mapFixResultsToAuditActions, writeDoctorLogEntry |
| `src/doctor/doctor.ts` | Modified | Added deep analysis: getArchiveMetadata, renderDeepAnalysisPrompt, promptDeepAnalysisApproval, runDeepAnalysis |
| `src/doctor/index.ts` | Modified | Added all Story 7.4 barrel exports |
| `src/pipeline.ts` | Modified | Updated Stage 9 to dispatch supervised vs autonomous based on config |
| `src/index.ts` | Modified | Added doctor-mode config key (show/set with validation) |
| `src/store/index.ts` | Modified | Added readJSON to barrel re-exports |
| `tests/doctor/autonomous.test.ts` | Created | 8 tests: risk levels, notifications, partitioning |
| `tests/doctor/audit-log.test.ts` | Created | ~20 tests: ID generation, log entry building, append-only writes, deep analysis metadata/prompt/fallback |

### Change Log

| Change | Reason |
|---|---|
| Added `readJSON` to `src/store/index.ts` barrel | `doctor.ts` deep analysis needs to read archive files via store barrel (import rule compliance) |
| Deep analysis tests placed in `audit-log.test.ts` | Collocated with audit log tests since deep analysis metadata and prompts are closely related |
| 2026-03-05: Code review passed | All ESLint errors fixed, all tests passing, build clean |
