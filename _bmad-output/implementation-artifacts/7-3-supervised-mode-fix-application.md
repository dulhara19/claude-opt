# Story 7.3: Supervised Mode & Fix Application

Status: done
Epic: 7 - Doctor Agent & Automated Recovery
Story: 7.3
Date: 2026-03-04
Complexity: High
Estimated Scope: Supervised mode with threshold-based alerts, interactive fix proposal/approval workflow, and knowledge store mutation logic

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the Doctor to alert me when predictions degrade and propose fixes for my approval,
so that knowledge store repairs happen with my oversight and consent.

## Acceptance Criteria (BDD)

### AC1: Threshold Detection & Alert
**Given** Doctor is in Supervised mode (default)
**When** prediction accuracy drops below the threshold (default: 60%) for any domain
**Then** the user is alerted: "Prediction accuracy for [domain] dropped to [X]%. Run `co doctor` to diagnose?"
**And** the alert waits for user acknowledgement before proceeding

### AC2: User Alert Options
**Given** the threshold alert is displayed
**When** the user sees the alert options
**Then** three options are presented: [1] "Let Doctor diagnose" / [2] "I'll handle it manually" / [3] "Dismiss"
**And** the alert matches the PRD CLI mockup box-drawing style

### AC3: Supervised Diagnostic with Fix Proposals
**Given** the user chooses "Let Doctor diagnose" from the alert
**When** diagnostics run
**Then** the diagnostic engine runs and generates a report (from Story 7.2)
**And** for each finding, the Doctor proposes a specific fix with an explanation
**And** the user must approve each fix before it is applied: [Apply] [Skip] [Apply All]

### AC4: Fix Application — Add Co-occurrence Pattern
**Given** the Doctor proposes to add a missing co-occurrence pattern
**When** the user approves the fix
**Then** the pattern is added to patterns.json with the Doctor's evidence as the source
**And** the pattern includes confidence score based on the co-occurrence frequency
**And** prediction accuracy should improve for related tasks

### AC5: Fix Application — Remove Stale Pattern
**Given** the Doctor proposes to remove or reduce weight of a stale pattern
**When** the user approves the fix
**Then** the pattern weight is reduced to 0.0 (or the pattern entry is removed from patterns.json)
**And** the fix result is recorded with before/after values

### AC6: Fix Application — Reduce Bad Prediction Weight
**Given** the Doctor proposes to reduce weight for a bad prediction
**When** the user approves the fix
**Then** the prediction weight is reduced in the relevant data structure
**And** the reduction amount is proportional to the severity of the misprediction

### AC7: Haiku Model for Diagnostic Inference
**Given** Doctor diagnostics run
**When** they interact with Claude Code
**Then** all diagnostic inference is sent requesting Haiku model to minimize token cost
**And** a typical Doctor session costs <500 tokens

### AC8: Dismiss and Manual Handling
**Given** the user chooses "Handle manually" or "Dismiss"
**When** the alert is acknowledged
**Then** the Doctor does not run diagnostics
**And** the user is reminded they can run `co doctor` anytime
**And** the dismissal is not logged as a Doctor action (no doctor-log entry for dismissals)

## Tasks / Subtasks

- [x] Task 1: Define supervised mode types (AC: #1, #2, #3)
  - [x] In `src/doctor/types.ts`, add supervised-mode-specific types
  - [x] Define `ThresholdAlert` interface: `{ domain: string; currentAccuracy: number; threshold: number; timestamp: string }`
  - [x] Define `AlertChoice` type: `'diagnose' | 'manual' | 'dismiss'`
  - [x] Define `FixProposal` interface: `{ findingId: string; finding: Finding; action: FixAction; explanation: string; riskLevel: 'low' | 'medium' | 'high' }`
  - [x] Define `FixAction` type: `'add-cooccurrence' | 'remove-stale' | 'reduce-weight' | 'custom'`
  - [x] Define `FixResult` interface: `{ proposal: FixProposal; applied: boolean; approvedBy: 'user' | 'auto'; result: string; before?: unknown; after?: unknown }`
  - [x] Define `SupervisedSession` interface: `{ alert: ThresholdAlert; choice: AlertChoice; report?: DiagnosticReport; fixes: FixResult[] }`

- [x] Task 2: Implement threshold detection (AC: #1)
  - [x] Create `src/doctor/supervised.ts`
  - [x] Implement `checkThresholds(metrics): ThresholdAlert[]` — check per-domain prediction accuracy against threshold
  - [x] Read `DOCTOR_ACCURACY_THRESHOLD` from config (default 0.6 from constants)
  - [x] For each domain in metrics: if precision < threshold, create `ThresholdAlert`
  - [x] Return all domains that have breached the threshold
  - [x] Skip domains with fewer than 3 tasks (insufficient data for reliable threshold checking)

- [x] Task 3: Implement threshold alert rendering and interaction (AC: #1, #2, #8)
  - [x] Implement `renderThresholdAlert(alert: ThresholdAlert): string` — Chalk box-drawing UI matching PRD mockup
  - [x] Show: domain name, current accuracy percentage, threshold percentage
  - [x] Show options: [1] Let Doctor diagnose / [2] I'll handle it manually / [3] Dismiss
  - [x] Implement `promptAlertChoice(): Promise<AlertChoice>` — read user input via Node.js readline
  - [x] On "diagnose": return `'diagnose'` to trigger diagnostic flow
  - [x] On "manual": display reminder "You can run `co doctor` anytime", return `'manual'`
  - [x] On "dismiss": return `'dismiss'` silently

- [x] Task 4: Implement fix proposal generation (AC: #3)
  - [x] Implement `generateFixProposals(findings: Finding[]): FixProposal[]`
  - [x] For `stale-pattern` findings: propose `'remove-stale'` action, explain staleness evidence
  - [x] For `missing-cooccurrence` findings: propose `'add-cooccurrence'` action, explain co-occurrence statistics
  - [x] For `bad-prediction` findings: propose `'reduce-weight'` action, explain prediction hit rate
  - [x] For `thin-domain` / `info` findings: no fix proposed (informational only)
  - [x] Assign risk level: `'low'` for adding co-occurrences and removing clearly stale entries, `'medium'` for weight reductions, `'high'` for bulk pattern changes

- [x] Task 5: Implement fix proposal rendering and approval flow (AC: #3)
  - [x] Implement `renderFixProposal(proposal: FixProposal, index: number, total: number): string` — display one fix at a time
  - [x] Show: finding type, severity, affected files, explanation, proposed action, risk level
  - [x] Show options: [A] Apply / [S] Skip / [AA] Apply All remaining
  - [x] Implement `promptFixApproval(): Promise<'apply' | 'skip' | 'apply-all'>` — user input
  - [x] Implement `runSupervisedFixFlow(proposals: FixProposal[]): Promise<FixResult[]>` — iterate through proposals, prompt for each unless "Apply All" selected

- [x] Task 6: Implement fix application — add co-occurrence pattern (AC: #4)
  - [x] Implement `applyAddCooccurrence(proposal: FixProposal): Result<FixResult>`
  - [x] Read current patterns.json via store
  - [x] Add new co-occurrence entry with: file pair, confidence score from evidence, source `'doctor'`, timestamp
  - [x] Write updated patterns.json via store (atomic write)
  - [x] Return FixResult with before (no pattern) and after (pattern added) details

- [x] Task 7: Implement fix application — remove stale pattern (AC: #5)
  - [x] Implement `applyRemoveStale(proposal: FixProposal): Result<FixResult>`
  - [x] Read current patterns.json via store
  - [x] Set the stale pattern's weight to 0.0 (soft delete — preserves history)
  - [x] Write updated patterns.json via store (atomic write)
  - [x] Return FixResult with before (original weight) and after (weight 0.0)

- [x] Task 8: Implement fix application — reduce bad prediction weight (AC: #6)
  - [x] Implement `applyReduceWeight(proposal: FixProposal): Result<FixResult>`
  - [x] Read current patterns/metrics via store
  - [x] Reduce weight proportionally: if hit rate is 0%, reduce to 0.0; if 10%, reduce by 50%; etc.
  - [x] Write updated data via store (atomic write)
  - [x] Return FixResult with before (original weight) and after (reduced weight)

- [x] Task 9: Implement fix application dispatcher (AC: #3, #4, #5, #6)
  - [x] Implement `applyFix(proposal: FixProposal): Result<FixResult>` — routes to the correct fix function based on `proposal.action`
  - [x] `'add-cooccurrence'` → `applyAddCooccurrence`
  - [x] `'remove-stale'` → `applyRemoveStale`
  - [x] `'reduce-weight'` → `applyReduceWeight`
  - [x] `'custom'` → return error "Custom fixes not supported in automated mode"
  - [x] Wrap each fix in error handling — if a fix fails, return FixResult with `applied: false` and error details
  - [x] All writes go through `store/` module

- [x] Task 10: Implement supervised mode orchestrator (AC: #1, #2, #3, #7)
  - [x] Implement `runSupervised(alerts: ThresholdAlert[]): Promise<SupervisedSession[]>` — main supervised mode entry
  - [x] For each alert: render alert UI, prompt for choice
  - [x] If choice is `'diagnose'`: call `runDiagnostics()` from Story 7.2, generate fix proposals, run supervised fix flow
  - [x] If choice is `'manual'` or `'dismiss'`: skip diagnostics
  - [x] Collect all FixResults for the session
  - [x] Return SupervisedSession(s) with full details (consumed by audit logging in Story 7.4)

- [x] Task 11: Integrate threshold check into pipeline (AC: #1)
  - [x] In the pipeline orchestrator (or post-task flow), after learner captures outcome:
  - [x] If doctor mode is `'supervised'`: call `checkThresholds(metrics)`
  - [x] If any alerts returned: call `runSupervised(alerts)`
  - [x] Threshold check happens after every task completion, but alert only triggers when accuracy drops below threshold
  - [x] Ensure threshold check is non-blocking if user dismisses — pipeline continues

- [x] Task 12: Update doctor module barrel export (AC: #1)
  - [x] Update `src/doctor/index.ts` to export: `checkThresholds`, `runSupervised`, fix application functions
  - [x] Export all new types: `ThresholdAlert`, `AlertChoice`, `FixProposal`, `FixResult`, `SupervisedSession`

- [x] Task 13: Write unit tests (AC: #1–#8)
  - [x] Create `tests/doctor/supervised.test.ts`
  - [x] Test: threshold detection — domain at 0.48 accuracy, threshold 0.60 → alert created
  - [x] Test: threshold detection — domain at 0.72 accuracy, threshold 0.60 → no alert
  - [x] Test: threshold detection — domain with <3 tasks → skipped
  - [x] Test: fix proposal generation — stale pattern finding → remove-stale proposal with low risk
  - [x] Test: fix proposal generation — missing co-occurrence finding → add-cooccurrence proposal with low risk
  - [x] Test: fix proposal generation — bad prediction finding → reduce-weight proposal with medium risk
  - [x] Test: fix proposal generation — info finding → no proposal generated
  - [x] Test: apply add co-occurrence — pattern added to patterns.json correctly
  - [x] Test: apply remove stale — weight set to 0.0 in patterns.json
  - [x] Test: apply reduce weight — weight reduced proportionally
  - [x] Test: fix application failure — store write fails → FixResult with applied false
  - [x] Test: supervised flow — user selects "Apply All" → all proposals applied
  - [x] Test: supervised flow — user selects "Skip" → proposal skipped, next shown
  - [x] Test: dismiss choice — no diagnostics run, reminder displayed
  - [x] Mock adapter, store, and readline for all tests

- [x] Task 14: Verify end-to-end (AC: #1–#8)
  - [x] Run `npm run build` — verify clean build with zero errors
  - [x] Run `npm run test` — verify all new tests pass
  - [x] Run `npm run typecheck` — verify TypeScript strict mode passes
  - [x] Manually test: trigger threshold alert with degraded metrics
  - [x] Manually test: approve and skip individual fixes
  - [x] Manually test: "Apply All" flow
  - [x] Manually test: dismiss and manual handling options

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-03 | All file I/O through `store/` module — never direct filesystem access | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | `withFailOpen(stageFn, fallback)` wrapper for error boundaries | [Source: architecture.md#Core Architectural Decisions] |
| AD-05 | POSIX internal paths, platform-native I/O via `utils/paths.ts` | [Source: architecture.md#Core Architectural Decisions] |
| AD-07 | Chalk + String Templates for terminal UI (no TUI framework) | [Source: architecture.md#Core Architectural Decisions] |
| AD-08 | Doctor uses same adapter as regular tasks with diagnostic prompt targeting Haiku model | [Source: architecture.md#Core Architectural Decisions] |

### Supervised Mode is the Default

Supervised mode is the default doctor mode. When a user installs claude-opt and runs tasks, the Doctor operates in supervised mode unless explicitly changed via `co config doctor-mode autonomous`. This means:
- Threshold checks run silently after each task
- Alerts only appear when a threshold is breached
- The user always has control: approve, skip, or dismiss
- No automatic changes to the knowledge store without user consent

### Threshold Detection Integration Point

The threshold check integrates into the post-task pipeline flow. After the Learner captures outcomes and updates metrics, the pipeline orchestrator checks if doctor mode is supervised and calls `checkThresholds()`. This is a lightweight local check (reads metrics.json, compares numbers) — zero token cost.

```
Pipeline: ... → Learner → Tracker → [Doctor Threshold Check] → Done
                                          ↓ (if breached)
                                    [Alert UI → User Choice → Diagnostics → Fixes]
```

### Fix Application Safety

All fix applications follow these safety principles:
1. **Soft deletes only** — stale patterns have weight set to 0.0, never removed from the file (preserves history for audit)
2. **Atomic writes** — all store mutations use the atomic write pattern (write .tmp, rename)
3. **Before/after tracking** — every FixResult records the state before and after the fix for audit logging
4. **User approval required** — every fix in supervised mode requires explicit user approval
5. **Individual granularity** — users can approve/skip each fix individually, or "Apply All" for convenience

### Fix Risk Levels

| Risk Level | Examples | Supervised Mode | Autonomous Mode (7.4) |
|---|---|---|---|
| Low | Add co-occurrence pattern, remove clearly stale entry | User approves | Auto-applied |
| Medium | Reduce prediction weight, modify pattern confidence | User approves | User approves |
| High | Bulk pattern changes, domain-wide resets | User approves | User approves |

### Store Access Pattern

Doctor module READ-WRITE access: patterns, metrics, doctor-log.
Reads: task-history, dep-graph.

For supervised mode fix application:
```typescript
import { readPatterns, writePatterns, readMetrics, writeMetrics,
         readTaskHistory, readDoctorLog, writeDoctorLog } from '../store/index.js';
import { runDiagnostics } from './doctor.js';  // From Story 7.2
```

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `supervised.ts` |
| Test files | kebab-case.test.ts | `tests/doctor/supervised.test.ts` |
| Functions | camelCase | `checkThresholds()`, `applyFix()` |
| Variables | camelCase | `fixProposal`, `alertChoice` |
| Types/Interfaces | PascalCase | `ThresholdAlert`, `FixProposal` |
| Constants | UPPER_SNAKE_CASE | `DOCTOR_ACCURACY_THRESHOLD` |
| Booleans | is/has/should/can prefix | `isApproved`, `hasBreached` |
| JSON fields | camelCase | `approvedBy`, `riskLevel` |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display.

**Null vs Undefined:** JSON uses `null`, TypeScript uses `undefined` for optional params.

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- Modules import from other modules ONLY through their `index.ts` barrel export
- Within the doctor module, internal imports between files (e.g., supervised.ts importing from doctor.ts) are allowed
- Doctor imports from: `store/index.ts`, `adapter/index.ts`, `utils/index.ts`

[Source: architecture.md#Import Rules]

### CLI Mockup Reference

The supervised alert should match the PRD CLI mockup:
```
+-- Doctor Alert ----------------------------------------+
|                                                         |
| Prediction accuracy in "compliance" domain dropped      |
| to 48% (threshold: 60%).                                |
|                                                         |
| [1] Let Doctor diagnose                                 |
| [2] I'll handle it manually                             |
| [3] Dismiss                                             |
+---------------------------------------------------------+
```

[Source: prd.md#Supervised mode auto-trigger alert mockup]

### Dependencies

- **Story 7.1:** Doctor module scaffold, types.ts, index.ts barrel
- **Story 7.2:** Diagnostic engine (`runDiagnostics`) and report generation
- **Epic 1 (Stories 1.1, 1.2):** Store module, utils, types, constants
- **Epic 2 (Story 2.1):** Adapter module for Haiku diagnostic calls
- **Epic 3 (Story 3.1):** Metrics data with per-domain prediction accuracy
- **Epic 5 (Story 5.1):** Learner module that updates metrics after each task (threshold check integrates after learner)

### What This Story Does NOT Create

- Autonomous mode auto-fix logic — Story 7.4
- Deep analysis with archived history — Story 7.4
- Audit log writing — Story 7.4 (this story prepares FixResult data that 7.4 logs)
- `src/doctor/autonomous.ts` — Story 7.4
- `src/doctor/audit-log.ts` — Story 7.4

### References

- [Source: architecture.md#Complete Project Directory Structure] — Doctor module file layout
- [Source: architecture.md#Core Architectural Decisions] — AD-03, AD-04, AD-05, AD-07, AD-08
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — Naming, structure, format patterns
- [Source: architecture.md#Project Structure & Boundaries] — Module boundaries, dependency direction
- [Source: architecture.md#Communication Patterns] — "If a module needs to notify (e.g., Doctor threshold alert), it returns a flag in its result that the orchestrator checks"
- [Source: prd.md#Domain 8: Doctor Agent] — DR-06, DR-07, DR-08, DR-09
- [Source: prd.md#doctor-log.json] — Doctor log schema (actions with approvedBy field)
- [Source: prd.md#co doctor CLI mockups] — Supervised mode alert and fix application mockups
- [Source: prd.md#Module Access Matrix] — Doctor read/write permissions
- [Source: epics.md#Story 7.3] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- No debug issues encountered during implementation.

### Completion Notes List
- Implemented all supervised mode types in `src/doctor/types.ts`: ThresholdAlert, AlertChoice, FixAction, FixProposal, FixResult, SupervisedSession, MIN_TASKS_FOR_THRESHOLD
- Created `src/doctor/supervised.ts` with full supervised mode implementation:
  - `checkThresholds()`: Per-domain accuracy check against configurable threshold, skips domains with <3 tasks
  - `renderThresholdAlert()`: Box-drawing UI matching PRD mockup
  - `promptAlertChoice()`: Node.js readline user input for alert response
  - `generateFixProposals()`: Maps finding types to fix actions with risk levels
  - `renderFixProposal()`: Individual fix display with Apply/Skip/Apply All options
  - `promptFixApproval()`: User input for individual fix decisions
  - `runSupervisedFixFlow()`: Iterates proposals, supports "Apply All" batch approval
  - `applyAddCooccurrence()`: Adds co-occurrence pattern to patterns.json via store
  - `applyRemoveStale()`: Sets stale pattern weight to 0.0 (soft delete)
  - `applyReduceWeight()`: Proportional weight reduction based on hit rate
  - `applyFix()`: Dispatcher routing to correct fix handler with error handling
  - `runSupervised()`: Main orchestrator — alert → choice → diagnostics → fix flow
- Integrated threshold check into pipeline.ts as Stage 9 (post-feedback, fail-open, non-blocking)
- Updated barrel exports in `src/doctor/index.ts` — replaced stub with real exports
- All store access through store module (AD-03), atomic writes, before/after tracking
- 25 unit tests covering all acceptance criteria
- Full test suite: 47 files, 733 tests, all passing
- Build: clean with zero errors
- TypeScript strict mode: passes

### Implementation Plan
Red-green-refactor cycle: wrote failing tests first, then implemented minimal code to pass, then verified no regressions.

### Change Log
- 2026-03-05: Implemented Story 7.3 — Supervised Mode & Fix Application (all 14 tasks)
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean

### File List
- `src/doctor/types.ts` (modified) — Added supervised mode types and MIN_TASKS_FOR_THRESHOLD constant
- `src/doctor/supervised.ts` (new) — Full supervised mode implementation
- `src/doctor/index.ts` (modified) — Updated barrel exports, replaced stub with real runSupervised
- `src/pipeline.ts` (modified) — Added Stage 9 doctor threshold check integration
- `tests/doctor/supervised.test.ts` (new) — 25 unit tests for supervised mode
