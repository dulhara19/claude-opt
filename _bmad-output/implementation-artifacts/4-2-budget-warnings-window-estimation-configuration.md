# Story 4.2: Budget Warnings, Window Estimation & Configuration

Status: done
Epic: 4 - Token Budget & Window Management
Story: 4.2
Date: 2026-03-04
Complexity: Medium
Estimated Scope: Budget warning system (inline + blocking), window time estimation with reset countdown, and configurable budget/window/threshold settings via `co config`

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want warnings when I'm approaching my token budget and the ability to configure my limits,
So that I never unexpectedly hit the token wall and can adapt settings to my plan.

## Acceptance Criteria (BDD)

### AC1: Inline Budget Warning at 75% (TT-05)
**Given** the user has consumed 75% of their window budget (33,000 of 44,000 default)
**When** a new task is about to be sent through the pipeline
**Then** an inline warning is displayed in the result box: "Budget: 33,400 / 44,000 (76%) | 1h 03m remaining"
**And** the warning includes a suggestion: "Consider: use --dry-run to preview before executing"
**And** the task proceeds without interruption
**And** the 75% threshold is read from `config.json` `budgetWarnings.inline` (default: 0.75)

### AC2: Blocking Budget Warning at 90% (TT-05)
**Given** the user has consumed 90% of their window budget (39,600 of 44,000 default)
**When** a new task is about to be sent through the pipeline
**Then** a blocking prompt is displayed with a box showing: tokens consumed, tokens remaining, estimated remaining simple tasks, window reset time
**And** the user is presented with three options: [1] Continue anyway, [2] Wait for reset, [3] Cancel this task
**And** the task only proceeds if the user selects option [1]
**And** selecting [2] or [3] cancels the task gracefully
**And** the 90% threshold is read from `config.json` `budgetWarnings.blocking` (default: 0.90)

### AC3: Budget Exhausted Display (TT-05)
**Given** the user has consumed 100% of their window budget
**When** a new task is attempted
**Then** a blocking display shows: "Token budget fully consumed for this window."
**And** it shows the time until the next window reset
**And** it suggests: "Use this time to review stats and plan next tasks with co --dry-run"
**And** the task does not proceed

### AC4: Budget Status Display via `co budget` (TT-06)
**Given** the user runs `co budget`
**When** the command displays budget status
**Then** it shows: tokens used, tokens remaining, percentage used with a progress bar visualization
**And** it shows projected runway (estimated tasks remaining based on average usage)
**And** it shows time remaining until the next window reset with the exact reset time
**And** it shows a session breakdown of token usage per task group

### AC5: Token Budget Configuration (TT-07)
**Given** the user wants to change the token budget
**When** they run `co config token-budget 60000`
**Then** the `tokenBudget` field is updated in config.json to 60000
**And** all future window tracking uses the new budget value
**And** a confirmation message is displayed: "token-budget updated: 44,000 -> 60,000"

### AC6: Window Duration Configuration (TT-09)
**Given** the user wants to change the window duration
**When** they run `co config window-duration 4` (hours as decimal)
**Then** the `windowDurationMs` field is updated in config.json (4 hours = 14,400,000ms)
**And** a confirmation message is displayed: "window-duration updated: 5h -> 4h"
**And** window reset calculations use the new duration for newly created windows

### AC7: Warning Threshold Configuration (TT-05)
**Given** the user wants to customize warning thresholds
**When** they run `co config budget-warn-inline 0.80` or `co config budget-warn-blocking 0.95`
**Then** the `budgetWarnings.inline` or `budgetWarnings.blocking` field is updated in config.json
**And** all future budget checks use the new threshold values
**And** values must be between 0.0 and 1.0, with inline < blocking enforced

### AC8: Window Time Estimation & Reset (TT-08)
**Given** the current 5-hour window has tracking data
**When** the Window Estimator calculates time remaining
**Then** it returns accurate `timeRemainingMs` based on `expiresAt - Date.now()`
**And** it returns a human-readable reset countdown (e.g., "2h 12m", "47 minutes")
**And** when the window has expired, it returns `timeRemainingMs: 0` and `isExpired: true`

### AC9: Window Auto-Reset (TT-08)
**Given** the current 5-hour window has expired
**When** the Token Tracker checks window status (on the next task or `co budget` call)
**Then** the window budget resets to full (new window created)
**And** the new window start time is recorded
**And** the old window remains in the `windows` array for historical tracking

## Tasks / Subtasks

- [x] Task 1: Create BudgetWarning type and warning level enum (AC: #1, #2, #3)
  - [x] In `src/tracker/types.ts`, add the following types:
    - `BudgetWarningLevel` — union type: `'none' | 'inline' | 'blocking' | 'exhausted'`
    - `BudgetWarning` — `{ level: BudgetWarningLevel; percentUsed: number; tokensConsumed: number; budget: number; remaining: number; estimatedTasksRemaining: number; timeRemainingMs: number; resetAt: string; message: string }`
    - `BudgetCheckResult` — `{ warning: BudgetWarning; shouldProceed: boolean; userChoice?: 'continue' | 'wait' | 'cancel' }`
    - `WindowEstimate` — `{ timeRemainingMs: number; resetAt: string; humanReadable: string; isExpired: boolean }`
  - [x] Ensure types follow PascalCase naming and camelCase fields

- [x]Task 2: Implement budget warning checker (AC: #1, #2, #3)
  - [x]Create `src/tracker/budget-warnings.ts` with the following functions:
    - `checkBudget(windowStatus: WindowStatus, config: { inline: number; blocking: number }): BudgetWarning`
      - If `percentUsed >= 1.0` (100%): return level `'exhausted'`
      - If `percentUsed >= blocking` threshold: return level `'blocking'`
      - If `percentUsed >= inline` threshold: return level `'inline'`
      - Otherwise: return level `'none'`
    - `estimateRemainingTasks(remaining: number, avgTokensPerTask: number): number`
      - Calculate based on average tokens per task from metrics history
      - Guard against division by zero (return 0 if avgTokensPerTask is 0)
    - `formatWarningMessage(warning: BudgetWarning): string`
      - For `'inline'`: format as single-line warning with budget fraction and time remaining
      - For `'blocking'`: format as multi-line box with full details and options
      - For `'exhausted'`: format as blocking box with reset time and suggestion
      - For `'none'`: return empty string
  - [x]Write unit tests: `tests/tracker/budget-warnings.test.ts`

- [x]Task 3: Implement blocking prompt interaction (AC: #2, #3)
  - [x]In `src/tracker/budget-warnings.ts`, implement:
    - `promptBudgetWarning(warning: BudgetWarning): Promise<BudgetCheckResult>`
      - For `'inline'` level: display warning message (no prompt), return `{ shouldProceed: true }`
      - For `'blocking'` level: display box with options, read user input from stdin
        - `[1]` Continue anyway -> `{ shouldProceed: true, userChoice: 'continue' }`
        - `[2]` Wait for reset -> `{ shouldProceed: false, userChoice: 'wait' }`
        - `[3]` Cancel this task -> `{ shouldProceed: false, userChoice: 'cancel' }`
        - Default (Enter with no input) -> cancel (safe default)
      - For `'exhausted'` level: display exhausted box, return `{ shouldProceed: false, userChoice: 'wait' }`
      - For `'none'` level: return `{ shouldProceed: true }` immediately
  - [x]Use `process.stdin` for reading user input (or `readline` from Node.js built-in)
  - [x]Use Chalk for colored output: yellow for inline warning, red for blocking/exhausted
  - [x]Write tests with mocked stdin for interactive prompts

- [x]Task 4: Implement window time estimator (AC: #8, #9)
  - [x]Create `src/tracker/window-estimator.ts` with the following functions:
    - `estimateWindowTime(windowStatus: WindowStatus): WindowEstimate`
      - Calculate `timeRemainingMs = Math.max(0, Date.parse(expiresAt) - Date.now())`
      - Format `humanReadable`: "2h 12m", "47 minutes", "3m", etc.
      - Set `isExpired = timeRemainingMs <= 0`
      - Set `resetAt = expiresAt` (the time the next window begins)
    - `formatTimeRemaining(ms: number): string`
      - Convert milliseconds to human-readable duration
      - Hours and minutes for > 60 minutes: "2h 12m"
      - Minutes only for 1-60 minutes: "47 minutes"
      - Seconds for < 1 minute: "45 seconds"
      - "now" for 0 or negative
    - `formatResetTime(isoTimestamp: string): string`
      - Convert ISO timestamp to local time display: "at 14:00"
  - [x]Write unit tests: test time formatting, expiry detection, edge cases (exact boundary, already expired, far future)

- [x]Task 5: Implement budget warning display rendering (AC: #1, #2, #3)
  - [x]In `src/tracker/budget-warnings.ts`, implement Chalk + box-drawing rendering functions:
    - `renderInlineWarning(warning: BudgetWarning): string`
      ```
      ⚠ Budget: 33,400 / 44,000 (76%) | 1h 03m remaining
        Consider: use --dry-run to preview before executing
      ```
    - `renderBlockingWarning(warning: BudgetWarning): string`
      ```
      ┌─ ⚠ Budget Warning ──────────────────────────────────┐
      │                                                      │
      │ You've used 90% of your token budget.                │
      │ 39,800 / 44,000 tokens consumed.                     │
      │ Remaining: ~4,200 tokens (~1-2 simple tasks)         │
      │                                                      │
      │ Window resets in: 47 minutes (at 14:00)              │
      │                                                      │
      │ [1] Continue anyway                                   │
      │ [2] Wait for reset (47m)                              │
      │ [3] Cancel this task                                  │
      └──────────────────────────────────────────────────────┘
      ```
    - `renderExhaustedWarning(warning: BudgetWarning): string`
      ```
      ┌─ ⛔ Budget Exhausted ────────────────────────────────┐
      │                                                      │
      │ Token budget fully consumed for this window.          │
      │ 44,000 / 44,000 tokens used.                         │
      │                                                      │
      │ Next window opens in: 1h 23m (at 15:23)              │
      │                                                      │
      │ Tip: Use this time to review stats and plan next      │
      │ tasks with co --dry-run                               │
      └──────────────────────────────────────────────────────┘
      ```
  - [x]Use Chalk for coloring: yellow for inline/blocking warnings, red for exhausted
  - [x]Number formatting: use locale-aware comma separators (e.g., "44,000")
  - [x]Write snapshot-style tests for rendered output

- [x]Task 6: Implement `co budget` display command (AC: #4)
  - [x]In `src/visibility/budget.ts`, implement the `co budget` command handler:
    - Read current metrics via `readMetrics()` and config via `readConfig()`
    - Get active window status from tracker's `getWindowStatus()`
    - Get window time estimate from `estimateWindowTime()`
    - Calculate projected runway from `estimateRemainingTasks()`
    - Render the budget display box:
      ```
      ┌─ Token Budget ──────────────────────────────────────┐
      │                                                      │
      │ Window: 09:00 — 14:00 (2h 12m remaining)             │
      │                                                      │
      │ ██████████████░░░░░░░░░░░░░░░░  41% used             │
      │ 18,200 / 44,000 tokens                               │
      │                                                      │
      │ Remaining: 25,800 tokens                             │
      │ Est. tasks remaining: ~8-12 (based on avg usage)     │
      │ Window resets at: 14:00 (2h 12m from now)            │
      │                                                      │
      │ Session breakdown:                                    │
      │   Task 1-5:   6,200t  ░░░░░░░░                       │
      │   Task 6-10:  5,800t  ░░░░░░░                        │
      │   Task 11-14: 6,200t  ░░░░░░░░                       │
      │                                                      │
      └──────────────────────────────────────────────────────┘
      ```
    - `renderProgressBar(percentUsed: number, width: number): string` — filled/empty block characters
  - [x]Register `budget` subcommand in `src/visibility/index.ts` and wire into Commander in `src/index.ts`
  - [x]Write tests for budget display rendering

- [x]Task 7: Implement configuration commands for budget/window/thresholds (AC: #5, #6, #7)
  - [x]In the config command handler (likely `src/visibility/` or `src/index.ts` config subcommand), implement:
    - `co config token-budget <value>`: validate positive integer, update `config.tokenBudget`, display confirmation
    - `co config window-duration <hours>`: validate positive number, convert hours to ms (`hours * 3600000`), update `config.windowDurationMs`, display confirmation
    - `co config budget-warn-inline <threshold>`: validate 0.0-1.0, ensure < blocking threshold, update `config.budgetWarnings.inline`, display confirmation
    - `co config budget-warn-blocking <threshold>`: validate 0.0-1.0, ensure > inline threshold, update `config.budgetWarnings.blocking`, display confirmation
  - [x]All config updates use `readConfig()` -> modify -> `writeConfig()` via store layer
  - [x]Validation errors display helpful messages: "Error: budget-warn-inline must be less than budget-warn-blocking (currently 0.90)"
  - [x]Write tests for each config key: valid values, boundary values, invalid values, constraint violations

- [x]Task 8: Integrate budget check into pipeline orchestrator (AC: #1, #2, #3)
  - [x]In `src/pipeline.ts`, add a pre-execution budget check step:
    - Before the adapter stage (before sending to Claude Code), call `checkBudget()`
    - If `BudgetWarningLevel` is `'inline'`: display warning, continue pipeline
    - If `BudgetWarningLevel` is `'blocking'`: call `promptBudgetWarning()`, await user choice
    - If `BudgetWarningLevel` is `'exhausted'`: display exhausted message, abort pipeline gracefully
    - If user cancels at blocking prompt: abort pipeline, return early with cancellation result
  - [x]Wrap budget check in `withFailOpen()` — if budget check itself fails, proceed with the task (fail-open)
  - [x]Write integration test: pipeline with mocked budget states triggering each warning level

- [x]Task 9: Update tracker barrel export (AC: #1, #2, #8)
  - [x]Update `src/tracker/index.ts` to export new public APIs:
    - From `budget-warnings.ts`: `checkBudget`, `promptBudgetWarning`, `formatWarningMessage`, `renderInlineWarning`, `renderBlockingWarning`, `renderExhaustedWarning`
    - From `window-estimator.ts`: `estimateWindowTime`, `formatTimeRemaining`, `formatResetTime`
    - From `types.ts`: `BudgetWarning`, `BudgetWarningLevel`, `BudgetCheckResult`, `WindowEstimate`
  - [x]Ensure all exports are through the barrel — no direct imports from internal files

- [x]Task 10: Write comprehensive tests (AC: #1, #2, #3, #4, #5, #6, #7, #8, #9)
  - [x]Create/extend `tests/tracker/budget-warnings.test.ts`:
    - **Warning levels:** verify correct level returned for 0%, 50%, 75%, 90%, 100% usage
    - **Custom thresholds:** verify configurable thresholds work (e.g., inline at 0.80, blocking at 0.95)
    - **Remaining tasks estimation:** verify calculation with various average token rates
    - **Blocking prompt:** verify user choice handling with mocked stdin ([1], [2], [3], empty)
    - **Rendering:** verify inline, blocking, and exhausted warning box output
    - **Edge cases:** budget of 0, window expired during check, threshold inline >= blocking (validation error)
  - [x]Create `tests/tracker/window-estimator.test.ts`:
    - **Time formatting:** verify "2h 12m", "47 minutes", "45 seconds", "now" outputs
    - **Reset time:** verify ISO timestamp to local time conversion
    - **Expiry:** verify expired window returns isExpired: true, timeRemainingMs: 0
  - [x]Extend tests for config commands: validate all 4 config keys with valid/invalid inputs

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-03 | Store module owns all JSON I/O — budget reads config, writes metrics | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | `withFailOpen()` wraps budget check in pipeline — warning failure never blocks task | [Source: architecture.md#Core Architectural Decisions] |
| AD-07 | Chalk + String Templates for terminal UI — box-drawing for warnings and budget display | [Source: architecture.md#Core Architectural Decisions] |

### Module Access Pattern

Budget Warnings and Window Estimator share the tracker module's access pattern:
- READ: `readConfig()` — get `tokenBudget`, `windowDurationMs`, `budgetWarnings.inline`, `budgetWarnings.blocking`
- READ: `readMetrics()` — get current window data, overall stats for average calculation
- WRITE: `writeMetrics()` — update window data when reset occurs (via token-tracker.ts from Story 4.1)
- WRITE: `writeConfig()` — only via `co config` commands (configuration changes)

### Warning Behavior Design

The warning system has three tiers, matching the PRD CLI mockups:

1. **Inline (default >= 75%):** Non-blocking. Displayed as part of the task result box. User sees it but workflow is uninterrupted. Yellow color.

2. **Blocking (default >= 90%):** Requires user confirmation. Displayed as a standalone warning box with three explicit choices. The user must make a conscious decision to continue. Red/yellow color.

3. **Exhausted (100%):** Fully blocking, no option to continue. Shows reset countdown and suggests productive alternatives (`co --dry-run`). Red color.

Key design principle: **fail-open**. If the budget checking mechanism itself errors (can't read config, can't read metrics), the task proceeds without warnings. The user should never be blocked by a bug in the warning system.

### Window Auto-Reset Logic

When `checkBudget()` or `getWindowStatus()` detects an expired window:
1. The old window entry stays in `metrics.json` `windows` array (historical record)
2. A new window entry is created with fresh budget
3. The new window's `startedAt` is `Date.now()`, not the old window's `expiresAt` (no retroactive billing)
4. This happens lazily — only when the tracker is next invoked, not on a timer

### Configuration Validation Rules

| Config Key | Type | Range | Constraint |
|---|---|---|---|
| `token-budget` | Positive integer | > 0 | None |
| `window-duration` | Positive number (hours) | > 0 | Stored as ms: `hours * 3600000` |
| `budget-warn-inline` | Float | 0.0 - 1.0 | Must be < `budget-warn-blocking` |
| `budget-warn-blocking` | Float | 0.0 - 1.0 | Must be > `budget-warn-inline` |

If the user tries to set `budget-warn-inline` to a value >= current `budget-warn-blocking`, display an error with the current blocking value and suggest setting blocking first.

### PRD CLI Mockup Reference

**75% budget warning (inline):**
```
┌─ Result ─────────────────────────────────────────────┐
│ ✓ Tokens: 1,400 used | Saved: ~1,200 (46%)          │
│ ⚠ Budget: 33,400 / 44,000 (76%) | 1h 03m remaining  │
│   Consider: use --dry-run to preview before executing │
├──────────────────────────────────────────────────────┤
│ [Good]  [Bad]  [-> Skip]                             │
└──────────────────────────────────────────────────────┘
```

**90% budget warning (blocking):**
```
┌─ ⚠ Budget Warning ──────────────────────────────────┐
│                                                      │
│ You've used 90% of your token budget.                │
│ 39,800 / 44,000 tokens consumed.                     │
│ Remaining: ~4,200 tokens (~1-2 simple tasks)         │
│                                                      │
│ Window resets in: 47 minutes (at 14:00)              │
│                                                      │
│ [1] Continue anyway                                   │
│ [2] Wait for reset (47m)                              │
│ [3] Cancel this task                                  │
└──────────────────────────────────────────────────────┘
```

**Budget exhausted:**
```
┌─ ⛔ Budget Exhausted ────────────────────────────────┐
│                                                      │
│ Token budget fully consumed for this window.          │
│ 44,000 / 44,000 tokens used.                         │
│                                                      │
│ Next window opens in: 1h 23m (at 15:23)              │
│                                                      │
│ Tip: Use this time to review stats and plan next      │
│ tasks with co --dry-run                               │
└──────────────────────────────────────────────────────┘
```

**`co budget` display:**
```
┌─ Token Budget ──────────────────────────────────────┐
│                                                      │
│ Window: 09:00 — 14:00 (2h 12m remaining)             │
│                                                      │
│ ██████████████░░░░░░░░░░░░░░░░  41% used             │
│ 18,200 / 44,000 tokens                               │
│                                                      │
│ Remaining: 25,800 tokens                             │
│ Est. tasks remaining: ~8-12 (based on avg usage)     │
│ Window resets at: 14:00 (2h 12m from now)            │
│                                                      │
│ Session breakdown:                                    │
│   Task 1-5:   6,200t  ░░░░░░░░                       │
│   Task 6-10:  5,800t  ░░░░░░░                        │
│   Task 11-14: 6,200t  ░░░░░░░░                       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### config.json Schema Reference

```json
{
  "schemaVersion": "1.0.0",
  "tokenBudget": 44000,
  "windowDurationMs": 18000000,
  "budgetWarnings": {
    "inline": 0.75,
    "blocking": 0.90
  }
}
```

### Configurable Values Table (from PRD)

| Key | Values | Default |
|---|---|---|
| `token-budget` | Positive integer | 44000 |
| `window-duration` | Hours (decimal) | 5 |
| `budget-warn-inline` | 0.0 - 1.0 | 0.75 |
| `budget-warn-blocking` | 0.0 - 1.0 | 0.90 |

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `budget-warnings.ts`, `window-estimator.ts` |
| Test files | kebab-case.test.ts | `tests/tracker/budget-warnings.test.ts` |
| Functions | camelCase | `checkBudget()`, `promptBudgetWarning()`, `estimateWindowTime()`, `formatTimeRemaining()` |
| Variables | camelCase | `warningLevel`, `timeRemainingMs`, `percentUsed` |
| Types/Interfaces | PascalCase | `BudgetWarning`, `BudgetCheckResult`, `WindowEstimate` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_BUDGET`, `DEFAULT_WINDOW_DURATION` |
| Booleans | is/has/should/can prefix | `isExpired`, `shouldProceed`, `hasWarning` |
| JSON fields | camelCase | `budgetWarnings`, `windowDurationMs`, `timeRemainingMs` |
| Directories | kebab-case | `src/tracker/` |

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
// Budget check wrapped fail-open in pipeline
const budgetCheck = withFailOpen(
  (ctx: PipelineContext) => tracker.checkBudget(windowStatus, config.budgetWarnings),
  { level: 'none', shouldProceed: true } as BudgetCheckResult,
  'tracker:budget'
);
```

**Chalk Terminal Rendering:**
```typescript
import chalk from 'chalk';

// Inline warning (yellow)
console.log(chalk.yellow('⚠ Budget: 33,400 / 44,000 (76%) | 1h 03m remaining'));

// Blocking warning (red border, yellow text)
console.log(chalk.red('┌─ ⚠ Budget Warning ─────────────┐'));

// Exhausted (red)
console.log(chalk.red('┌─ ⛔ Budget Exhausted ──────────┐'));
```

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display.

**Timestamps:** ISO 8601 strings in JSON — e.g., `"2026-03-04T09:15:00Z"`.

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- Modules import from other modules ONLY through their `index.ts` barrel export
- `src/tracker/budget-warnings.ts` imports types from `./types.ts` (same module — internal)
- `src/tracker/window-estimator.ts` imports types from `./types.ts` (same module — internal)
- `src/visibility/budget.ts` imports from `../tracker/index.ts` (barrel export)
- `src/tracker/` imports from `src/store/index.ts` and `src/utils/index.ts`
- Never import from another module's internal files directly

[Source: architecture.md#Import Rules]

### Library Versions (Verified March 2026)

No new dependencies required for this story. Uses:
- `chalk` 5.6.2 (already installed) — for colored terminal output
- `node:readline` (built-in) — for reading user input at blocking prompts
- Standard Date/Math APIs — for time calculations
- Store layer — for config.json and metrics.json I/O

### Project Structure for This Story

```
src/tracker/
├── index.ts              # Updated: add budget-warnings and window-estimator exports
├── types.ts              # Updated: add BudgetWarning, BudgetWarningLevel, BudgetCheckResult, WindowEstimate
├── token-tracker.ts      # From Story 4.1 (not modified)
├── budget-warnings.ts    # NEW: checkBudget(), promptBudgetWarning(), warning renderers
└── window-estimator.ts   # NEW: estimateWindowTime(), formatTimeRemaining(), formatResetTime()

src/visibility/
├── budget.ts             # NEW or UPDATED: co budget command handler and display rendering

src/pipeline.ts           # UPDATED: add pre-execution budget check step

tests/tracker/
├── token-tracker.test.ts # From Story 4.1 (not modified)
├── budget-warnings.test.ts  # NEW: warning levels, prompts, rendering, thresholds
└── window-estimator.test.ts # NEW: time formatting, expiry, reset calculation
```

### Dependencies

- **Story 4.1:** Token tracking foundation — `trackUsage()`, `getWindowStatus()`, `TokenUsage`, `WindowStatus` types
- **Epic 1 (Story 1.1):** Shared utilities (`utils/errors.ts` for `withFailOpen`, `utils/logger.ts`, `utils/constants.ts` for `DEFAULT_BUDGET`, `DEFAULT_WINDOW_DURATION`)
- **Epic 1 (Story 1.2):** Store layer (`readConfig()`, `writeConfig()`, `readMetrics()`)
- **Story 1.1 (CLI):** Commander.js command registration for `co budget` and `co config` subcommands

### What This Story Does NOT Create

- `src/tracker/token-tracker.ts` — Already created in Story 4.1
- `co stats` dashboard — Created in Story 5.1 (Visibility Layer)
- `co knowledge` command — Created in Story 5.2
- Doctor Agent integration — Doctor reads metrics but is its own epic (Epic 6)
- Feedback buttons (`[Good] [Bad] [Skip]`) — Created in Story 5.4

### References

- [Source: architecture.md#Complete Project Directory Structure] — tracker/ module files: budget-warnings.ts, window-estimator.ts
- [Source: architecture.md#Core Architectural Decisions] — AD-03 (store I/O), AD-04 (fail-open), AD-07 (Chalk + string templates)
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — Naming, structure, format, communication patterns
- [Source: architecture.md#Project Structure & Boundaries] — Module boundaries, dependency direction, visibility boundary
- [Source: prd.md#Domain 7: Token Tracker] — TT-05 to TT-09 requirements
- [Source: prd.md#config.json schema] — tokenBudget, windowDurationMs, budgetWarnings fields
- [Source: prd.md#CLI Mockups: 75% warning] — Inline warning box design
- [Source: prd.md#CLI Mockups: 90% warning] — Blocking warning box design
- [Source: prd.md#CLI Mockups: Budget exhausted] — Exhausted display design
- [Source: prd.md#CLI Mockups: co budget] — Budget status display design
- [Source: prd.md#Configurable Values] — Config keys, ranges, defaults for budget/window/thresholds
- [Source: epics.md#Story 4.2] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
None — clean implementation, no blocking issues encountered.

### Completion Notes List
- Task 1: Added BudgetWarningLevel, BudgetWarning, BudgetCheckResult, WindowEstimate types to src/tracker/types.ts
- Task 2: Created src/tracker/budget-warnings.ts with checkBudget(), estimateRemainingTasks(), formatWarningMessage()
- Task 3: Implemented promptBudgetWarning() with readline-based stdin interaction for blocking/exhausted prompts
- Task 4: Created src/tracker/window-estimator.ts with estimateWindowTime(), formatTimeRemaining(), formatResetTime()
- Task 5: Implemented renderInlineWarning(), renderBlockingWarning(), renderExhaustedWarning() with Chalk + box-drawing
- Task 6: Created src/visibility/budget.ts + index.ts with runBudgetCommand() and renderBudgetDisplay() including progress bar and session breakdown
- Task 7: Implemented co config commands for token-budget, window-duration, budget-warn-inline, budget-warn-blocking with validation
- Task 8: Integrated budget check into pipeline.ts as Stage 5 (pre-review), wrapped with withFailOpen()
- Task 9: Updated src/tracker/index.ts barrel to export all new public APIs and types
- Task 10: Created tests/tracker/budget-warnings.test.ts (25 tests) and tests/tracker/window-estimator.test.ts (14 tests) — all 576 tests pass

### File List
- src/tracker/types.ts (modified) — added BudgetWarningLevel, BudgetWarning, BudgetCheckResult, WindowEstimate types
- src/tracker/budget-warnings.ts (new) — budget warning checker, prompt interaction, warning renderers, formatting helpers
- src/tracker/window-estimator.ts (new) — window time estimation, duration formatting, reset time formatting
- src/tracker/index.ts (modified) — updated barrel exports with all new APIs and types
- src/visibility/budget.ts (new) — co budget command handler and display rendering
- src/visibility/index.ts (new) — visibility module barrel export
- src/pipeline.ts (modified) — added pre-execution budget check stage (Stage 5) with fail-open wrapper
- src/index.ts (modified) — wired budget command, implemented config command with 4 config keys
- tests/tracker/budget-warnings.test.ts (new) — 25 tests for warning levels, rendering, formatting
- tests/tracker/window-estimator.test.ts (new) — 14 tests for time formatting, expiry detection

### Change Log
- 2026-03-05: Implemented Story 4.2 — Budget warnings (inline/blocking/exhausted), window time estimation, co budget display, co config commands, pipeline integration. All 576 tests pass (39 new).
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean
