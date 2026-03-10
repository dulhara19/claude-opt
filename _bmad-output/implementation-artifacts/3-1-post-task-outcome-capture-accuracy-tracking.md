# Story 3.1: Post-Task Outcome Capture & Accuracy Tracking

Status: done
Epic: 3 - Learning & Self-Improvement
Story: 3.1
Date: 2026-03-04
Complexity: Medium
Estimated Scope: Learner module foundation — post-task capture, predicted-vs-actual comparison, accuracy metrics, keyword-index updates

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the optimizer to capture what actually happened after each task and compare it to predictions,
So that the system builds accurate learning data and tracks how well it's performing.

## Acceptance Criteria (BDD)

### AC1: Post-Task Outcome Capture
**Given** a task has completed through the Claude Code Adapter
**When** the Knowledge Learner captures the outcome
**Then** it records: files actually used (from AdapterResult.filesUsed), model used, task classification, success/failure signal, and token estimate
**And** the outcome is appended to task-history.json via the store module
**And** capture completes in <500ms

### AC2: Predicted vs Actual Accuracy Comparison
**Given** the File Predictor predicted files [A, B, C] and Claude actually used files [B, C, D]
**When** the accuracy comparison runs
**Then** precision is calculated: 2/3 = 66.7% (predicted files that were actually needed)
**And** recall is calculated: 2/3 = 66.7% (needed files that were correctly predicted)
**And** per-task metrics are stored in the task history entry

### AC3: Aggregated Accuracy Metrics
**Given** multiple tasks have been completed
**When** accuracy metrics are aggregated
**Then** metrics are tracked at three levels: per-task, per-domain, and overall
**And** metrics.json is updated with the latest aggregated accuracy data
**And** domain-specific accuracy allows targeted improvement analysis

### AC4: Keyword-Index Updates
**Given** a task outcome reveals files that were actually used but not predicted
**When** the Learner processes the outcome
**Then** new keyword-to-file mappings are extracted from the task description and actual files
**And** keyword-index.json is updated with these new discovered mappings via the store module

### AC5: Fail-Open Error Handling
**Given** the Learner encounters an error during capture
**When** `withFailOpen()` catches the error
**Then** the task still completes successfully — learning failure never blocks the user
**And** the error is logged for later Doctor analysis

## Tasks / Subtasks

- [x] Task 1: Create learner module directory structure (AC: #1, #5)
  - [x] Create `src/learner/index.ts` — barrel export with `captureOutcome()` as the public API
  - [x] Create `src/learner/types.ts` — define `LearningOutcome`, `WeightUpdate`, `AccuracyMetrics`, `OutcomeCapture` types
  - [x] Create `src/learner/knowledge-learner.ts` — core implementation file (empty skeleton)
  - [x] Create `src/learner/weight-correction.ts` — placeholder for Story 3.3
  - [x] Create `src/learner/pattern-detector.ts` — placeholder for Story 3.2
- [x] Task 2: Define learner types in `src/learner/types.ts` (AC: #1, #2)
  - [x] Define `LearningOutcome` interface: `taskId`, `timestamp`, `filesActuallyUsed` (string[]), `filesPredicted` (FilePrediction[]), `classification` (ClassificationResult), `modelUsed` (string), `success` (boolean), `tokenEstimate` (number)
  - [x] Define `AccuracyMetrics` interface: `precision` (number 0-1), `recall` (number 0-1), `truePositives` (string[]), `falsePositives` (string[]), `falseNegatives` (string[])
  - [x] Define `WeightUpdate` interface: `file` (string), `previousWeight` (number), `newWeight` (number), `reason` (string), `evidence` (string)
  - [x] Define `OutcomeCapture` interface: the full task-history entry shape matching task-history.json schema
- [x] Task 3: Implement `captureOutcome()` in `knowledge-learner.ts` (AC: #1, #5)
  - [x] Accept `PipelineContext` (with `adapterResult`, `classification`, `prediction`) as input
  - [x] Extract `filesUsed` from `AdapterResult.filesUsed`, normalize with `toInternal()`
  - [x] Extract `modelUsed` from routing result, `success` from adapter exit code (0 = success)
  - [x] Extract `tokenEstimate` from `AdapterResult.tokenEstimate`
  - [x] Generate task ID: `t_{YYYYMMDD}_{sequence}` format
  - [x] Generate session ID: `s_{YYYYMMDD}_{sequence}` format (reuse within session)
  - [x] Build the full `OutcomeCapture` entry matching task-history.json schema
  - [x] Wrap entire function body with try/catch — log error, return gracefully on failure (fail-open)
  - [x] Call `compareAccuracy()` to compute precision/recall
  - [x] Call `updateTaskHistory()` via store to append the entry
  - [x] Call `updateMetrics()` to aggregate accuracy data
  - [x] Call `updateKeywordIndex()` to add new keyword discoveries
  - [x] Measure and log execution time — warn if >500ms
- [x] Task 4: Implement `compareAccuracy()` in `knowledge-learner.ts` (AC: #2)
  - [x] Accept `predictedFiles: string[]` and `actualFiles: string[]`
  - [x] Normalize all file paths with `toInternal()` before comparison
  - [x] Compute true positives: intersection of predicted and actual
  - [x] Compute false positives: predicted but not in actual (over-predicted)
  - [x] Compute false negatives: actual but not in predicted (missed files)
  - [x] Calculate precision: `truePositives.length / predictedFiles.length` (handle division by zero → 0)
  - [x] Calculate recall: `truePositives.length / actualFiles.length` (handle division by zero → 0)
  - [x] Return `AccuracyMetrics` with all computed values
- [x] Task 5: Implement `updateMetrics()` in `knowledge-learner.ts` (AC: #3)
  - [x] Read current metrics.json via `readMetrics()` from store
  - [x] Update `overall` section: increment `totalTasks`, recalculate running `avgPrecision` and `avgRecall`
  - [x] Update `perDomain` section: find or create domain entry, increment domain task count, recalculate domain precision/recall
  - [x] Update `overall.totalTokensConsumed` and compute `totalTokensSaved` from estimated unoptimized minus consumed
  - [x] Update `overall.savingsRate`: `totalTokensSaved / (totalTokensConsumed + totalTokensSaved)`
  - [x] Append to `predictionTrend` array if this is the last task in a session (session-level tracking)
  - [x] Write updated metrics via `writeMetrics()` from store
- [x] Task 6: Implement `updateKeywordIndex()` in `knowledge-learner.ts` (AC: #4)
  - [x] Read current keyword-index.json via `readKeywordIndex()` from store
  - [x] Extract keywords from the task description (split on whitespace, filter common words, lowercase)
  - [x] For each actual file not in the predicted set (false negatives):
    - [x] Add keyword-to-file mappings for task description keywords
    - [x] Add file-to-keyword mappings for the discovered file
  - [x] Merge new mappings with existing, avoiding duplicates
  - [x] Write updated keyword-index via `writeKeywordIndex()` from store
- [x] Task 7: Wire `captureOutcome()` into the barrel export (AC: #1)
  - [x] Export `captureOutcome` from `src/learner/index.ts`
  - [x] Export relevant types: `LearningOutcome`, `AccuracyMetrics`, `WeightUpdate`
  - [x] Ensure the pipeline orchestrator (`src/pipeline.ts`) can call `captureOutcome()` after the adapter stage
- [x] Task 8: Write unit tests for accuracy comparison (AC: #2)
  - [x] Create `tests/learner/knowledge-learner.test.ts`
  - [x] Test: perfect prediction — predicted [A, B], actual [A, B] → precision 1.0, recall 1.0
  - [x] Test: partial overlap — predicted [A, B, C], actual [B, C, D] → precision 0.67, recall 0.67
  - [x] Test: no overlap — predicted [A, B], actual [C, D] → precision 0.0, recall 0.0
  - [x] Test: empty prediction — predicted [], actual [A, B] → precision 0.0, recall 0.0
  - [x] Test: empty actual — predicted [A, B], actual [] → precision 0.0, recall 0.0
  - [x] Test: paths are normalized before comparison (Windows backslash vs POSIX)
- [x] Task 9: Write unit tests for metrics aggregation (AC: #3)
  - [x] Test: first task creates initial metrics with correct overall values
  - [x] Test: second task updates running averages correctly
  - [x] Test: domain-specific metrics are tracked separately
  - [x] Test: multiple domains maintain independent precision/recall
  - [x] Test: savings rate calculated correctly from consumed + saved
- [x] Task 10: Write unit tests for keyword-index updates (AC: #4)
  - [x] Test: new file discovery adds keyword-to-file and file-to-keyword mappings
  - [x] Test: existing keyword entries are extended (not replaced)
  - [x] Test: duplicate mappings are not added
  - [x] Test: common/stop words are filtered out of keyword extraction
- [x] Task 11: Write unit tests for captureOutcome end-to-end (AC: #1, #5)
  - [x] Test: full capture flow with mock store — task history entry written correctly
  - [x] Test: capture completes in <500ms with representative data
  - [x] Test: capture failure does not throw — returns gracefully with error logged
  - [x] Test: task ID format matches `t_{YYYYMMDD}_{seq}` pattern
  - [x] Test: all file paths stored as POSIX in the task history entry
- [x] Task 12: Write integration test for learning capture (AC: #1, #2, #3, #4)
  - [x] Create test in `tests/learner/knowledge-learner.test.ts` (or separate integration file)
  - [x] Simulate 3 task captures with different predicted/actual files
  - [x] Verify task-history grows with 3 entries
  - [x] Verify metrics.json overall averages are correct after 3 tasks
  - [x] Verify keyword-index has new mappings from discovered files

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-02 | Typed Pipeline with Orchestrator — `PipelineContext` accumulates results, Learner reads `adapterResult`, `classification`, `prediction` | [Source: architecture.md#Core Architectural Decisions] |
| AD-03 | Single Store Module — all JSON I/O goes through `store/` typed accessors (`readTaskHistory`, `writeTaskHistory`, `readMetrics`, `writeMetrics`, `readKeywordIndex`, `writeKeywordIndex`) | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | `withFailOpen(stageFn, fallback)` — entire capture operation wrapped so learning failure never blocks user | [Source: architecture.md#Core Architectural Decisions] |
| AD-05 | POSIX Internal paths — all file paths normalized via `toInternal()` before storing in task-history.json | [Source: architecture.md#Core Architectural Decisions] |
| AD-06 | TypeScript Type Guards — validate task-history entries on read, no Zod/Ajv | [Source: architecture.md#Core Architectural Decisions] |

### Module Access Matrix (Learner)

| Store File | Access | Operations |
|---|---|---|
| task-history.json | READ (latest) + WRITE | Read latest entry for session ID; append new entries |
| metrics.json | READ + WRITE | Read current metrics; write updated aggregates |
| keyword-index.json | READ + WRITE | Read current index; write new keyword-file mappings |
| project-map.json | READ only | Read file metadata for keyword extraction context |
| dependency-graph.json | WRITE (Story 3.2) | Not used in this story |
| patterns.json | WRITE (Story 3.2, 3.3) | Not used in this story |

### Key Types and Interfaces

**AdapterResult (from adapter module):**
```typescript
interface AdapterResult {
  output: string;
  filesUsed: string[];
  exitCode: number;
  tokenEstimate: number;
}
```

**LearningOutcome (new in this story):**
```typescript
interface LearningOutcome {
  taskId: string;                    // e.g., "t_20260304_001"
  timestamp: string;                 // ISO 8601
  sessionId: string;                 // e.g., "s_20260304_01"
  description: string;               // User's original task description
  classification: ClassificationResult;
  prediction: {
    predictedFiles: FilePrediction[];
    actualFiles: string[];           // POSIX paths from AdapterResult.filesUsed
    precision: number;               // 0.0-1.0
    recall: number;                  // 0.0-1.0
  };
  routing: {
    selectedModel: string;
    rationale: string;
    success: boolean;
  };
  tokens: {
    consumed: number;
    estimatedUnoptimized: number;
    saved: number;
  };
  feedback: null;                    // Initially null, updated by Story 6
}
```

**AccuracyMetrics (new in this story):**
```typescript
interface AccuracyMetrics {
  precision: number;                 // 0.0-1.0
  recall: number;                    // 0.0-1.0
  truePositives: string[];           // Files correctly predicted
  falsePositives: string[];          // Files predicted but not used
  falseNegatives: string[];          // Files used but not predicted
}
```

### JSON Schema Examples

**task-history.json entry:**
```json
{
  "id": "t_20260304_001",
  "timestamp": "2026-03-04T09:15:00Z",
  "sessionId": "s_20260304_01",
  "description": "add confidence decay to pattern detection",
  "classification": {
    "type": "feature",
    "domain": "learning-engine",
    "complexity": "medium",
    "confidence": 0.85
  },
  "prediction": {
    "predictedFiles": [
      { "file": "src/patterns.ts", "confidence": 0.92 },
      { "file": "src/learner.ts", "confidence": 0.88 }
    ],
    "actualFiles": ["src/patterns.ts", "src/learner.ts", "src/config.ts"],
    "precision": 1.0,
    "recall": 0.67
  },
  "routing": {
    "selectedModel": "sonnet",
    "rationale": "medium complexity feature, historical sonnet success",
    "success": true
  },
  "tokens": {
    "consumed": 1200,
    "estimatedUnoptimized": 2800,
    "saved": 1600
  },
  "feedback": null
}
```

**metrics.json (aggregated):**
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
  "predictionTrend": [
    { "session": 1, "precision": 0.45, "recall": 0.40, "timestamp": "2026-03-01T09:00:00Z" }
  ]
}
```

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `knowledge-learner.ts`, `weight-correction.ts` |
| Test files | kebab-case.test.ts | `tests/learner/knowledge-learner.test.ts` |
| Functions | camelCase | `captureOutcome()`, `compareAccuracy()`, `updateMetrics()` |
| Variables | camelCase | `filesActuallyUsed`, `truePositives`, `avgPrecision` |
| Types/Interfaces | PascalCase | `LearningOutcome`, `AccuracyMetrics`, `WeightUpdate` |
| Constants | UPPER_SNAKE_CASE | `MAX_CAPTURE_TIME_MS` (500) |
| Booleans | is/has/should prefix | `isSuccess`, `hasNewKeywords` |
| JSON fields | camelCase | `sessionId`, `predictedFiles`, `avgPrecision` |
| IDs in JSON | entity prefix | `t_20260304_001` (task), `s_20260304_01` (session) |

### Code Patterns (MUST FOLLOW)

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function ok<T>(value: T): Result<T> { return { ok: true, value }; }
function err<T>(error: string): Result<T> { return { ok: false, error }; }
```

**withFailOpen Pattern (wrapping captureOutcome):**
```typescript
// In pipeline.ts
const learnFromOutcome = withFailOpen(
  (ctx: PipelineContext) => learner.captureOutcome(ctx),
  undefined,  // fallback: no learning captured, but task still succeeds
  'learner'
);
```

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display.

**Null vs Undefined:** JSON uses `null` for absent values (e.g., `feedback: null`). TypeScript uses `undefined` for optional params.

**Running Average Calculation:**
```typescript
// Incremental average: newAvg = oldAvg + (newValue - oldAvg) / newCount
function updateRunningAverage(oldAvg: number, newValue: number, newCount: number): number {
  return oldAvg + (newValue - oldAvg) / newCount;
}
```

### Import Rules (MUST FOLLOW)

- Import from `store/` ONLY through its barrel `index.ts`: `import { readTaskHistory, writeTaskHistory, readMetrics, writeMetrics, readKeywordIndex, writeKeywordIndex } from '../store/index.js';`
- Import shared types from `src/types/`: `import { type PipelineContext, type Result } from '../types/index.js';`
- Import utils from `src/utils/`: `import { toInternal, withFailOpen, logger } from '../utils/index.js';`
- Import adapter types: `import { type AdapterResult } from '../adapter/index.js';`
- Never import from another module's internal files directly
- The learner's `index.ts` is the only public API — other modules import `captureOutcome` from `../learner/index.js`

### Dependencies (Prerequisites)

| Dependency | Module | What This Story Needs |
|---|---|---|
| Story 1.1 | `src/utils/` | `toInternal()`, `withFailOpen()`, `logger`, `Result<T>` |
| Story 1.1 | `src/types/` | `PipelineContext`, `TaskType`, `Complexity` |
| Story 1.2 | `src/store/` | `readTaskHistory()`, `writeTaskHistory()`, `readMetrics()`, `writeMetrics()`, `readKeywordIndex()`, `writeKeywordIndex()` — typed accessors with atomic writes |
| Story 2.x | `src/adapter/` | `AdapterResult` type with `filesUsed`, `exitCode`, `tokenEstimate` |
| Story 2.x | `src/predictor/` | `PredictionResult`, `FilePrediction` types |
| Story 2.x | `src/analyzer/` | `ClassificationResult` type |
| Story 2.x | `src/router/` | `RoutingResult` type with `selectedModel`, `rationale` |

### Performance Budget

- Total capture time: <500ms (NFR-KL-08)
- Store reads: <50ms each (NFR-KS-10)
- Store writes: <50ms each (NFR-KS-10)
- Budget breakdown: accuracy comparison <10ms + task-history write <50ms + metrics read+write <100ms + keyword-index read+write <100ms + overhead <240ms

### Project Structure (Files Created/Modified by This Story)

```
src/learner/
├── index.ts                  # Public API: export { captureOutcome }
├── types.ts                  # LearningOutcome, AccuracyMetrics, WeightUpdate, OutcomeCapture
├── knowledge-learner.ts      # captureOutcome(), compareAccuracy(), updateMetrics(), updateKeywordIndex()
├── weight-correction.ts      # Placeholder — implemented in Story 3.3
└── pattern-detector.ts       # Placeholder — implemented in Story 3.2

tests/learner/
├── knowledge-learner.test.ts # Unit + integration tests for capture, accuracy, metrics, keyword-index
└── weight-correction.test.ts # Placeholder — tests added in Story 3.3
```

### What This Story Does NOT Create

- `weight-correction.ts` implementation — Story 3.3
- `pattern-detector.ts` implementation — Story 3.2
- Dependency graph updates — Story 3.2
- patterns.json writes — Story 3.2 and 3.3
- Token tracking integration — Epic 4
- Doctor threshold checking — Epic 7
- User feedback processing — Epic 6

### References

- [Source: architecture.md#Core Architectural Decisions] — AD-02, AD-03, AD-04, AD-05, AD-06
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — All naming, structure, format patterns
- [Source: architecture.md#Complete Project Directory Structure] — `src/learner/` file list
- [Source: architecture.md#Project Structure & Boundaries] — Module boundaries, learner has read-write access to store
- [Source: architecture.md#Data Architecture] — Module Access Enforcement, atomic write pattern
- [Source: prd.md#Knowledge Learner] — KL-01, KL-02, KL-05, KL-08 requirements
- [Source: prd.md#Schema Definitions] — task-history.json, metrics.json, keyword-index.json schemas
- [Source: epics.md#Story 3.1] — Original story definition and acceptance criteria

## Change Log

- 2026-03-05: Implemented learner module — post-task outcome capture, predicted-vs-actual accuracy comparison, metrics aggregation, keyword-index updates, fail-open error handling. 21 new tests, 486 total passing, zero regressions.
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- No debug issues encountered. All tests passed on first run.

### Completion Notes List

- All 12 tasks and subtasks implemented and verified
- AC1 (Post-Task Outcome Capture): `captureOutcome()` extracts filesUsed, model, classification, tokens from PipelineContext, generates task IDs, appends to task-history.json. Completes in <500ms.
- AC2 (Predicted vs Actual Accuracy): `compareAccuracy()` computes precision/recall with path normalization. Handles empty lists, zero division, Windows backslashes.
- AC3 (Aggregated Accuracy Metrics): `updateMetrics()` tracks per-task, per-domain, and overall metrics with running averages. Updates savings rate.
- AC4 (Keyword-Index Updates): `updateKeywordIndex()` discovers new keyword-to-file mappings from false negatives, extends existing entries, avoids duplicates, filters stop words.
- AC5 (Fail-Open): `captureOutcome()` wraps entire body in try/catch — errors logged but never thrown, user's task always completes.
- Placeholder files created for Story 3.2 (pattern-detector.ts) and Story 3.3 (weight-correction.ts)
- 21 new tests (6 accuracy, 5 metrics, 4 keyword-index, 5 capture e2e, 1 integration)
- Full regression suite: 486/486 tests passing
- TypeScript type checking passes cleanly

### File List

- `src/learner/types.ts` (NEW) — LearningOutcome, AccuracyMetrics, WeightUpdate, OutcomeCapture types
- `src/learner/knowledge-learner.ts` (NEW) — captureOutcome, compareAccuracy, updateMetrics, updateKeywordIndex, extractKeywords
- `src/learner/index.ts` (NEW) — Barrel export for learner module
- `src/learner/weight-correction.ts` (NEW) — Placeholder for Story 3.3
- `src/learner/pattern-detector.ts` (NEW) — Placeholder for Story 3.2
- `tests/learner/knowledge-learner.test.ts` (NEW) — 21 unit + integration tests
