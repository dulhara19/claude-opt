# Story 4.1: Token Usage Tracking & Savings Estimation

Status: done
Epic: 4 - Token Budget & Window Management
Story: 4.1
Date: 2026-03-04
Complexity: Medium
Estimated Scope: Token tracker module — per-task, per-session, per-window tracking with savings estimation and <10ms overhead

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want to know how many tokens each task costs and how much the optimizer is saving me,
So that I can make informed decisions about my token budget and see the optimizer's value.

## Acceptance Criteria (BDD)

### AC1: Per-Task Token Tracking (TT-01)
**Given** a task completes through the pipeline
**When** the Token Tracker records usage via `trackUsage()`
**Then** it stores the token estimate for that individual task in the task record
**And** the token estimate includes both `tokensUsed` and `estimatedUnoptimized` values
**And** the record is persisted to metrics.json via the store layer

### AC2: Per-Session Token Aggregation (TT-02)
**Given** multiple tasks have been run in the current session
**When** the Token Tracker aggregates session usage
**Then** total tokens consumed across all tasks in the session are calculated
**And** the session total is stored in the `overall.totalTokensConsumed` field of metrics.json
**And** `overall.totalSessions` is incremented when a new session starts

### AC3: Per-Window Token Tracking (TT-03)
**Given** the user is on a 5-hour window budget (default: 44,000 tokens)
**When** the Token Tracker updates the window total via `trackUsage()`
**Then** tokens consumed across all sessions within the current 5-hour window are tracked in the `windows` array
**And** the window entry includes `startedAt`, `expiresAt`, `tokensConsumed`, `budget`, `remaining`, `tasksCompleted`
**And** the window start time is recorded for reset calculation
**And** a new window entry is created if no active (non-expired) window exists

### AC4: Savings Estimation (TT-04)
**Given** a task completed with optimization (predicted files, compressed prompt)
**When** the Token Tracker estimates savings
**Then** it calculates `estimatedUnoptimized` cost (what it would have cost without the optimizer)
**And** the savings estimate is: `estimatedUnoptimized - tokensUsed`
**And** both values are stored per-task and aggregated into `overall.totalTokensSaved` and `overall.savingsRate`
**And** per-domain token breakdowns are updated in `perDomain`

### AC5: Tracking Performance (TT-10)
**Given** any task is being tracked
**When** `trackUsage()` is called
**Then** the total overhead of recording token usage, updating aggregates, and writing metrics.json is <10ms
**And** tracking never blocks or delays the pipeline response to the user

### AC6: Window Status Query
**Given** the tracker has active window data
**When** `getWindowStatus()` is called
**Then** it returns a `WindowStatus` object with `tokensConsumed`, `budget`, `remaining`, `percentUsed`, `tasksCompleted`, `timeRemainingMs`, and `isExpired`
**And** expired windows return `isExpired: true` with `remaining: 0`

## Tasks / Subtasks

- [ ] Task 1: Create tracker module types (AC: #1, #3, #4, #6)
  - [ ] Create `src/tracker/types.ts` with the following type definitions:
    - `TokenUsage` — per-task record: `{ taskId: string; tokensUsed: number; estimatedUnoptimized: number; savings: number; domain: string; timestamp: string }`
    - `WindowStatus` — snapshot: `{ windowId: string; startedAt: string; expiresAt: string; tokensConsumed: number; budget: number; remaining: number; percentUsed: number; tasksCompleted: number; timeRemainingMs: number; isExpired: boolean; estimatedResetAt: string }`
    - `SessionStats` — session-level aggregate: `{ sessionId: string; startedAt: string; tasksCompleted: number; tokensConsumed: number; tokensSaved: number }`
    - `TrackingResult` — return type from `trackUsage()`: `{ usage: TokenUsage; windowStatus: WindowStatus; sessionStats: SessionStats }`
    - `SavingsEstimate` — `{ estimatedUnoptimized: number; actual: number; saved: number; savingsRate: number }`
  - [ ] Ensure all types use `camelCase` for fields and `PascalCase` for type names

- [ ] Task 2: Implement savings estimation logic (AC: #4)
  - [ ] Create `src/tracker/savings-estimator.ts` (internal helper, not in architecture's file list but logically part of token-tracker.ts — alternatively inline in token-tracker.ts)
  - [ ] Implement `estimateSavings(tokensUsed: number, predictionConfidence: number, compressionRatio: number): SavingsEstimate`
  - [ ] Estimation formula: `estimatedUnoptimized = tokensUsed / (1 - compressionRatio * predictionConfidence)` — i.e., without optimization the user would have sent a larger, uncompressed prompt with no file targeting
  - [ ] If `predictionConfidence` is 0 or no optimization occurred, `estimatedUnoptimized = tokensUsed` (no savings)
  - [ ] Calculate `savingsRate = saved / estimatedUnoptimized` (guard against division by zero)
  - [ ] Write unit tests: `tests/tracker/token-tracker.test.ts` — savings estimation section

- [ ] Task 3: Implement window management logic (AC: #3, #6)
  - [ ] In `src/tracker/token-tracker.ts`, implement window lifecycle:
    - `getActiveWindow(windows: WindowEntry[], config: { windowDurationMs: number; tokenBudget: number }): WindowEntry | null` — find current non-expired window
    - `createWindow(config: { windowDurationMs: number; tokenBudget: number }): WindowEntry` — create new window with `startedAt = now`, `expiresAt = now + windowDurationMs`, `budget = tokenBudget`
    - `isWindowExpired(window: WindowEntry): boolean` — check if `Date.now() > expiresAt`
  - [ ] Window IDs follow the format `w_YYYYMMDD_NN` (e.g., `w_20260304_01`)
  - [ ] Implement `getWindowStatus(window: WindowEntry): WindowStatus` — compute `remaining`, `percentUsed`, `timeRemainingMs`, `isExpired`
  - [ ] Write unit tests: window creation, expiry detection, status calculation

- [ ] Task 4: Implement core trackUsage function (AC: #1, #2, #3, #4, #5)
  - [ ] In `src/tracker/token-tracker.ts`, implement the main tracking function:
    ```typescript
    function trackUsage(input: {
      taskId: string;
      tokensUsed: number;
      domain: string;
      predictionConfidence: number;
      compressionRatio: number;
    }): Result<TrackingResult>
    ```
  - [ ] Read current metrics.json via store layer (`readMetrics()`)
  - [ ] Read config.json via store layer (`readConfig()`) for `tokenBudget` and `windowDurationMs`
  - [ ] Calculate savings estimate using the savings estimation logic from Task 2
  - [ ] Find or create active window; update `tokensConsumed`, `remaining`, `tasksCompleted`
  - [ ] Update `overall` aggregates: `totalTasks`, `totalTokensConsumed`, `totalTokensSaved`, `savingsRate`
  - [ ] Update `perDomain` breakdown for the task's domain
  - [ ] Write updated metrics.json via store layer (`writeMetrics()`)
  - [ ] Return `TrackingResult` with usage, windowStatus, and sessionStats
  - [ ] Wrap entire function in performance measurement — log warning if >10ms

- [ ] Task 5: Implement per-domain breakdown tracking (AC: #4)
  - [ ] In `token-tracker.ts`, implement domain-level aggregation:
    - `updateDomainStats(perDomain: Record<string, DomainStats>, domain: string, tokensUsed: number, tokensSaved: number): void`
  - [ ] Each domain entry in `perDomain` tracks: `tasks`, `precision`, `recall`, `tokensConsumed`, `tokensSaved`
  - [ ] Token fields are cumulative (add to existing totals)
  - [ ] Task count incremented per domain per task
  - [ ] Write unit tests for domain aggregation

- [ ] Task 6: Create tracker barrel export (AC: #1, #6)
  - [ ] Create `src/tracker/index.ts` with public API exports:
    - `trackUsage` — main tracking function
    - `getWindowStatus` — current window status query
    - `getActiveWindow` — find or create active window
    - Export all types from `types.ts`: `TokenUsage`, `WindowStatus`, `SessionStats`, `TrackingResult`, `SavingsEstimate`
  - [ ] Ensure only public API is exported — internal helpers stay private

- [ ] Task 7: Add metrics.json store accessors (AC: #1, #2, #3)
  - [ ] In `src/store/index.ts`, ensure `readMetrics()` and `writeMetrics()` accessors exist (may already be scaffolded from Story 1.2)
  - [ ] `readMetrics(): Result<Metrics>` — read and validate metrics.json with type guard `isMetrics()`
  - [ ] `writeMetrics(data: Metrics): Result<void>` — atomic write to metrics.json
  - [ ] Add `isMetrics()` type guard to `src/store/validators.ts` if not already present
  - [ ] Return empty default metrics structure if file doesn't exist (fail-open: new project starts fresh)

- [ ] Task 8: Write comprehensive tests (AC: #1, #2, #3, #4, #5, #6)
  - [ ] Create `tests/tracker/token-tracker.test.ts` with the following test groups:
    - **Per-task tracking:** verify individual task records are created with correct fields
    - **Session aggregation:** verify totals accumulate across multiple trackUsage calls
    - **Window management:** verify window creation, expiry detection, budget remaining calculation
    - **Savings estimation:** verify unoptimized estimate formula, edge cases (zero confidence, no compression)
    - **Domain breakdown:** verify per-domain stats update correctly
    - **Performance:** verify trackUsage completes in <10ms (use `performance.now()`)
    - **Edge cases:** first-ever task (empty metrics), window expiry mid-session, zero tokens used
  - [ ] Create `tests/fixtures/sample-metrics.json` if not already present — provide realistic test data
  - [ ] Use in-memory store mock from `tests/helpers/test-store.ts` for isolated testing

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-03 | Store module owns all JSON I/O — tracker uses `readMetrics()` / `writeMetrics()` | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | `withFailOpen(trackUsage, fallback)` in pipeline — tracking failure never blocks the pipeline | [Source: architecture.md#Core Architectural Decisions] |
| AD-06 | TypeScript type guards for validation — `isMetrics()` validates on read | [Source: architecture.md#Core Architectural Decisions] |

### Module Access Pattern

The Token Tracker has **read-write** access to `metrics.json` and **read-only** access to `config.json`:
- WRITE: `writeMetrics()` — update token usage, window data, savings
- READ: `readMetrics()` — get current state for aggregation
- READ: `readConfig()` — get `tokenBudget`, `windowDurationMs` for window management

This is enforced by TypeScript types — the store module only exposes write accessors to modules that need them (Learner, Tracker, Doctor, Scanner).

### Savings Estimation Approach

The architecture notes OQ-02 (token counting method) is not fully resolved. The tracker module's interface is designed to work regardless of counting method:
- `tokensUsed` is provided as input to `trackUsage()` — the adapter module estimates this
- The tracker does not count tokens itself — it records and aggregates what the adapter reports
- Savings estimation uses `predictionConfidence` and `compressionRatio` from the pipeline context to estimate what the unoptimized cost would have been

Possible counting approaches (resolved at adapter level, not tracker level):
- `js-tiktoken` — accurate but adds a dependency
- Character-based approximation (`chars / 4`) — fast, zero deps, sufficient for budget tracking

### Performance Budget

TT-10 requires <10ms overhead per task. Strategy:
- Read metrics.json synchronously (small file, <50ms read target from NFR)
- In-memory aggregation (arithmetic only — no expensive operations)
- Write metrics.json synchronously via atomic write
- The 10ms budget applies to the tracker's own logic, not including file I/O latency
- If file I/O pushes over 10ms, log a warning but do not fail (fail-open)

### metrics.json Schema Reference

```json
{
  "schemaVersion": "1.0.0",
  "overall": {
    "totalTasks": 47,
    "totalSessions": 12,
    "avgPrecision": 0.82,
    "avgRecall": 0.76,
    "totalTokensConsumed": 28400,
    "totalTokensSaved": 34200,
    "savingsRate": 0.546
  },
  "perDomain": {
    "learning-engine": {
      "tasks": 12,
      "precision": 0.89,
      "recall": 0.81,
      "tokensConsumed": 8200,
      "tokensSaved": 11400
    }
  },
  "windows": [
    {
      "id": "w_20260304_01",
      "startedAt": "2026-03-04T09:00:00Z",
      "expiresAt": "2026-03-04T14:00:00Z",
      "windowDurationMs": 18000000,
      "tokensConsumed": 18200,
      "budget": 44000,
      "remaining": 25800,
      "tasksCompleted": 14,
      "timeRemainingMs": 7920000,
      "estimatedResetAt": "2026-03-04T14:00:00Z"
    }
  ],
  "predictionTrend": [
    { "session": 1, "precision": 0.45, "recall": 0.40, "timestamp": "2026-03-01T09:00:00Z" }
  ]
}
```

### config.json Schema Reference (Read-Only Fields for Tracker)

```json
{
  "tokenBudget": 44000,
  "windowDurationMs": 18000000,
  "budgetWarnings": {
    "inline": 0.75,
    "blocking": 0.90
  }
}
```

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `token-tracker.ts`, `window-estimator.ts` |
| Test files | kebab-case.test.ts | `tests/tracker/token-tracker.test.ts` |
| Functions | camelCase | `trackUsage()`, `getWindowStatus()`, `estimateSavings()` |
| Variables | camelCase | `tokensUsed`, `windowStatus`, `savingsRate` |
| Types/Interfaces | PascalCase | `TokenUsage`, `WindowStatus`, `TrackingResult` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_BUDGET`, `DEFAULT_WINDOW_DURATION` |
| Booleans | is/has/should/can prefix | `isExpired`, `hasActiveWindow` |
| JSON fields | camelCase | `tokensConsumed`, `savingsRate`, `timeRemainingMs` |
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
// In pipeline.ts — tracker stage wrapped with fail-open
const track = withFailOpen(
  (ctx: PipelineContext) => tracker.trackUsage({ ... }),
  DEFAULT_TRACKING_RESULT,
  'tracker'
);
```

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display.

**Null vs Undefined:** JSON uses `null`, TypeScript uses `undefined` for optional params, `null` for explicit "no value".

**Timestamps:** ISO 8601 strings in JSON — e.g., `"2026-03-04T09:15:00Z"`.

**Window IDs:** Prefixed format — `w_YYYYMMDD_NN` (e.g., `w_20260304_01`).

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- Modules import from other modules ONLY through their `index.ts` barrel export
- Never import from another module's internal files directly
- `src/tracker/` imports from `src/store/index.ts` and `src/utils/index.ts`
- `src/tracker/` NEVER imports from pipeline modules (analyzer, predictor, etc.)
- `utils/` and `store/` are leaf dependencies — never import pipeline modules or tracker

[Source: architecture.md#Import Rules]

### Library Versions (Verified March 2026)

No new dependencies required for this story. Token Tracker uses only:
- `node:perf_hooks` (built-in) — for performance measurement if needed
- Standard Date/Math APIs — for window time calculations
- Store layer — for metrics.json and config.json I/O

### Project Structure for This Story

```
src/tracker/
├── index.ts              # Public API: trackUsage(), getWindowStatus(), type exports
├── types.ts              # TokenUsage, WindowStatus, SessionStats, TrackingResult, SavingsEstimate
└── token-tracker.ts      # Core: per-task tracking, window management, savings estimation, domain aggregation

tests/tracker/
└── token-tracker.test.ts # Unit tests: tracking, windows, savings, performance
```

Note: `budget-warnings.ts` and `window-estimator.ts` are created in Story 4.2. This story creates the tracking foundation that Story 4.2 builds upon.

### Dependencies

- **Epic 1 (Story 1.1):** Shared utilities (`utils/errors.ts`, `utils/logger.ts`, `utils/constants.ts`)
- **Epic 1 (Story 1.2):** Store layer (`store/index.ts` with `readMetrics()`, `writeMetrics()`, `readConfig()`)
- **Epic 2 (Story 2.1+):** Pipeline producing `tokensUsed`, `predictionConfidence`, `compressionRatio` data that the tracker records

### What This Story Does NOT Create

- `src/tracker/budget-warnings.ts` — Created in Story 4.2
- `src/tracker/window-estimator.ts` — Created in Story 4.2
- `co budget` CLI command — Created in Story 5.3 (Visibility Layer)
- Budget warning display/prompts — Created in Story 4.2
- `co config` budget/window commands — Created in Story 4.2

### References

- [Source: architecture.md#Complete Project Directory Structure] — tracker/ module files
- [Source: architecture.md#Core Architectural Decisions] — AD-03, AD-04, AD-06
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — Naming, structure, format patterns
- [Source: architecture.md#Project Structure & Boundaries] — Module boundaries, dependency direction
- [Source: architecture.md#Architecture Validation Results] — OQ-02 token counting gap
- [Source: prd.md#Domain 7: Token Tracker] — TT-01 to TT-04, TT-10 requirements
- [Source: prd.md#metrics.json schema] — Full schema with windows array and overall stats
- [Source: prd.md#config.json schema] — tokenBudget, windowDurationMs defaults
- [Source: epics.md#Story 4.1] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
N/A

### Completion Notes List
- Token tracker module implemented in `src/tracker/`
- Per-task tracking with `trackUsage()` — records tokensUsed, estimatedUnoptimized, savings, domain
- Savings estimation formula: `estimatedUnoptimized = tokensUsed / (1 - compressionRatio * predictionConfidence)`
- Window management: create, find active, detect expiry, compute status
- Window IDs in `w_YYYYMMDD_NN` format
- Per-session stats tracked in-memory (reset per process)
- Per-domain breakdown aggregation
- Overall metrics updated: totalTasks, totalTokensConsumed, totalTokensSaved, savingsRate
- Persists to metrics.json via store layer (readMetrics/writeMetrics)
- Performance: trackUsage completes well under 10ms budget
- 21 tests passing

### File List
- `src/tracker/types.ts` — NEW: TokenUsage, WindowStatus, SessionStats, TrackingResult, SavingsEstimate, WindowEntry, TrackUsageInput
- `src/tracker/token-tracker.ts` — NEW: trackUsage(), estimateSavings(), window management, domain aggregation
- `src/tracker/index.ts` — NEW: barrel exports
- `tests/tracker/token-tracker.test.ts` — NEW: 21 tests
