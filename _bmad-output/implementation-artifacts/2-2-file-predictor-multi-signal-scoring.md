# Story 2.2: File Predictor — Multi-Signal Scoring

Status: done
Epic: 2 - Smart Task Execution Pipeline
Story: 2.2
Date: 2026-03-04
Complexity: Large
Estimated Scope: Multi-signal file prediction engine with 4 signal sources, confidence scoring, and threshold filtering

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the optimizer to predict which files are relevant to my task,
so that Claude starts with the right context and doesn't waste tokens exploring.

## Acceptance Criteria (BDD)

### AC1: Multi-Signal File Prediction
**Given** a classified task and the project's knowledge store
**When** the File Predictor runs
**Then** it combines 4 signal sources with configurable weights:
**And** (1) Task history similarity — keyword overlap with past tasks' actual files
**And** (2) Dependency graph traversal — files connected to keyword-matched files
**And** (3) Keyword index lookup — direct keyword-to-file mapping
**And** (4) Pattern co-occurrence boosting — if file A predicted, boost co-occurring file B
**And** prediction completes in <200ms

### AC2: Ranked Scored Results
**Given** the File Predictor produces results
**When** scoring is complete
**Then** each candidate file has a composite confidence score between 0.0 and 1.0
**And** files are returned as a ranked list sorted by confidence (highest first)
**And** files below the confidence threshold are excluded from the prediction

### AC3: Cold Start Handling
**Given** the optimizer is on session 1 (cold start) with no task history
**When** the File Predictor runs
**Then** it relies on keyword index, dependency graph, and starter pack patterns
**And** still produces reasonable predictions (>50% precision target within 5 sessions)

### AC4: Graceful Degradation
**Given** prediction confidence is low (all candidates below threshold)
**When** the File Predictor applies graceful degradation
**Then** it predicts fewer files (or none) rather than including bad predictions
**And** the session is never made worse than raw Claude Code without the optimizer

### AC5: Dual Content Type Support
**Given** a task involving both code files and document files
**When** the File Predictor runs
**Then** both code files (.ts, .js, etc.) and document files (.md, .txt) are considered
**And** the prediction is not biased toward one file type

### AC6: Accuracy Tracking
**Given** the File Predictor tracks accuracy
**When** a prediction is made
**Then** the predicted file list is stored for later comparison with actually-used files
**And** precision and recall metrics are tracked per task, per domain, and overall

## Tasks / Subtasks

- [x] Task 1: Create predictor module structure (AC: #1, #2)
  - [x] Create `src/predictor/` directory
  - [x] Create `src/predictor/index.ts` barrel export: `predictFiles`, `PredictionResult` type
  - [x] Create `src/predictor/types.ts` with `PredictionResult`, `FilePrediction`, `SignalScore`, `SignalWeights`
  - [x] Create `src/predictor/file-predictor.ts` — multi-signal scoring orchestration
- [x] Task 2: Define prediction types (AC: #1, #2)
  - [x] `FilePrediction`: `{ filePath: string; score: number; signals: SignalScore[] }`
  - [x] `PredictionResult`: `{ predictions: FilePrediction[]; totalCandidates: number; threshold: number; durationMs: number }`
  - [x] `SignalScore`: `{ source: SignalSource; score: number; weight: number; reason: string }`
  - [x] `SignalSource` enum: `HistorySimilarity`, `GraphTraversal`, `KeywordLookup`, `CooccurrenceBoost`
  - [x] `SignalWeights`: `{ history: number; graph: number; keyword: number; cooccurrence: number }` — configurable weights
- [x] Task 3: Create signals/ subdirectory and signal implementations (AC: #1)
  - [x] Create `src/predictor/signals/` directory
  - [x] Create `src/predictor/signals/history-similarity.ts` — task history keyword overlap signal
  - [x] Create `src/predictor/signals/graph-traversal.ts` — dependency graph neighbor lookup signal
  - [x] Create `src/predictor/signals/keyword-lookup.ts` — direct keyword-to-file index match signal
  - [x] Create `src/predictor/signals/cooccurrence-boost.ts` — pattern co-occurrence boosting signal
- [x] Task 4: Implement history similarity signal (AC: #1, #3)
  - [x] Read task history from store (read-only)
  - [x] Extract keywords from current task prompt
  - [x] Find past tasks with overlapping keywords
  - [x] Score candidate files by frequency of appearance in similar past tasks' actual files
  - [x] Return empty scores on cold start (no history available) — fail gracefully
- [x] Task 5: Implement dependency graph traversal signal (AC: #1, #3)
  - [x] Read dependency graph from store (read-only)
  - [x] Identify seed files from keyword-matched files in the graph
  - [x] Traverse immediate neighbors (1-hop) in the adjacency list
  - [x] Score neighbors by edge weight and proximity
  - [x] Handle missing graph data gracefully (return empty scores)
- [x] Task 6: Implement keyword index lookup signal (AC: #1, #3)
  - [x] Read keyword index from store (read-only)
  - [x] Extract keywords from the classified task prompt
  - [x] Look up files directly mapped to matching keywords
  - [x] Score by number of keyword matches per file
  - [x] This signal is available even on cold start (keyword index built by scanner)
- [x] Task 7: Implement co-occurrence boost signal (AC: #1)
  - [x] Read patterns/co-occurrences from store (read-only)
  - [x] For each file already predicted by other signals, check for co-occurring files
  - [x] Boost scores for co-occurring files (e.g., if `component.tsx` predicted, boost `component.test.tsx`)
  - [x] This signal runs after the other 3 signals to apply boosting
- [x] Task 8: Implement multi-signal scoring orchestration (AC: #1, #2)
  - [x] In `file-predictor.ts`, call all 4 signal sources
  - [x] Combine scores using configurable weights: `compositeScore = sum(signal.score * signal.weight) / sum(weights)`
  - [x] Normalize composite scores to 0.0-1.0 range
  - [x] Sort candidates by composite score descending
  - [x] Filter out candidates below `CONFIDENCE_THRESHOLD`
- [x] Task 9: Create confidence threshold and filtering logic (AC: #2, #4)
  - [x] Create `src/predictor/confidence.ts` — score normalization + threshold filtering
  - [x] Implement threshold filtering: exclude files below configurable threshold (default from `utils/constants.ts`)
  - [x] Implement graceful degradation: if all below threshold, return empty prediction list
  - [x] Never include low-confidence predictions that could harm the session
- [x] Task 10: Handle cold start scenario (AC: #3)
  - [x] Detect cold start: check if task history is empty or has fewer than N entries
  - [x] On cold start, adjust signal weights: increase keyword lookup and graph traversal weights, decrease history weight
  - [x] Leverage starter pack patterns if available for initial co-occurrence data
- [x] Task 11: Ensure dual content type support (AC: #5)
  - [x] Verify keyword index includes both code files and document files
  - [x] Verify graph traversal handles markdown link references as edges
  - [x] Ensure scoring does not inherently bias toward code or document files
- [x] Task 12: Store predictions for accuracy tracking (AC: #6)
  - [x] After prediction, store the predicted file list in the PipelineContext
  - [x] Include metadata: task prompt keywords, signal breakdown, timestamp
  - [x] The Learner module (Epic 3) will compare predicted vs actually-used files post-execution
- [x] Task 13: Enforce performance budget (AC: #1)
  - [x] Add timing instrumentation around `predictFiles()` execution
  - [x] Log a warning if prediction exceeds 200ms budget
  - [x] Ensure signal lookups use pre-computed data structures (hash maps, adjacency lists) — no heavy computation
- [x] Task 14: Write unit tests for file predictor (AC: #1, #2, #3, #4, #5, #6)
  - [x] Create `tests/predictor/file-predictor.test.ts`
  - [x] Test multi-signal scoring with mock store data
  - [x] Test ranked output: verify sorted by confidence descending
  - [x] Test threshold filtering: verify low-confidence files excluded
  - [x] Test cold start: verify prediction works with empty task history
  - [x] Test graceful degradation: verify empty result when all below threshold
  - [x] Test dual content type: verify both .ts and .md files can be predicted
  - [x] Test performance: verify prediction completes in <200ms
- [x] Task 15: Write unit tests for individual signals (AC: #1)
  - [x] Create `tests/predictor/signals/history-similarity.test.ts`
  - [x] Create `tests/predictor/signals/graph-traversal.test.ts`
  - [x] Create `tests/predictor/signals/keyword-lookup.test.ts`
  - [x] Create `tests/predictor/signals/cooccurrence-boost.test.ts`
  - [x] Test each signal in isolation with mock data
  - [x] Test each signal returns empty scores gracefully when store data is missing

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-10 | Multi-Signal Weighted Scoring — 4 signal sources combined with configurable weights, composite score 0-1, ranked and filtered by confidence threshold | [Source: architecture.md#Core Architectural Decisions] |
| AD-02 | Typed Pipeline with Orchestrator — File Predictor is pipeline stage 2, receives PipelineContext with classification | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | `withFailOpen(stageFn, fallback)` wrapper — predictor failure returns empty prediction, pipeline continues | [Source: architecture.md#Core Architectural Decisions] |
| AD-03 | Single Store Module — predictor reads from store (read-only) for task history, dependency graph, keyword index, patterns | [Source: architecture.md#Core Architectural Decisions] |

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `file-predictor.ts`, `history-similarity.ts` |
| Test files | kebab-case.test.ts | `tests/predictor/file-predictor.test.ts` |
| Functions | camelCase | `predictFiles()`, `scoreHistorySimilarity()` |
| Variables | camelCase | `compositeScore`, `candidateFiles`, `signalWeights` |
| Types/Interfaces | PascalCase | `PredictionResult`, `FilePrediction`, `SignalScore` |
| Constants | UPPER_SNAKE_CASE | `CONFIDENCE_THRESHOLD`, `DEFAULT_SIGNAL_WEIGHTS` |
| Enums | PascalCase + PascalCase members | `SignalSource.HistorySimilarity` |
| Booleans | is/has/should/can prefix | `isColdStart`, `hasCandidates` |
| JSON fields | camelCase | `filePath`, `compositeScore` |
| Directories | kebab-case | `src/predictor/`, `src/predictor/signals/` |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

**withFailOpen Pattern:**
```typescript
const predict = withFailOpen(
  (ctx: PipelineContext) => predictor.predictFiles(ctx),
  DEFAULT_PREDICTION  // { predictions: [], totalCandidates: 0, threshold: CONFIDENCE_THRESHOLD, durationMs: 0 }
);
```

**PipelineContext — Predictor reads classification, writes prediction:**
```typescript
interface PipelineContext {
  userPrompt: string;
  classification?: ClassificationResult;  // Read by predictor
  prediction?: PredictionResult;          // Written by predictor
  routing?: RoutingResult;
  compression?: CompressionResult;
  adapterResult?: AdapterResult;
}
```

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display.

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- Modules import from other modules ONLY through their `index.ts` barrel export
- Never import from another module's internal files directly
- Signal implementations within `signals/` are internal to predictor — not exported through barrel
- Predictor imports `ClassificationResult` from `../analyzer/index.js`
- Predictor reads from `store/` (read-only): `readTaskHistory()`, `readDependencyGraph()`, `readKeywordIndex()`, `readPatterns()`
- `utils/` and `store/` are leaf dependencies

[Source: architecture.md#Import Rules]

### Project Structure Notes

This story creates the second pipeline stage module with a signals subdirectory:

```
src/
├── predictor/                         # File Predictor module (NEW)
│   ├── index.ts                       # Public: predictFiles(), PredictionResult
│   ├── types.ts                       # PredictionResult, FilePrediction, SignalScore, SignalWeights
│   ├── file-predictor.ts              # Multi-signal scoring orchestration
│   ├── confidence.ts                  # Score normalization + threshold filtering
│   └── signals/                       # Individual signal source implementations
│       ├── history-similarity.ts      # Task history keyword overlap
│       ├── graph-traversal.ts         # Dependency graph neighbor lookup
│       ├── keyword-lookup.ts          # Direct keyword-to-file index match
│       └── cooccurrence-boost.ts      # Pattern co-occurrence boosting
tests/
├── predictor/
│   ├── file-predictor.test.ts         # Multi-signal integration tests (NEW)
│   └── signals/
│       ├── history-similarity.test.ts # (NEW)
│       ├── graph-traversal.test.ts    # (NEW)
│       ├── keyword-lookup.test.ts     # (NEW)
│       └── cooccurrence-boost.test.ts # (NEW)
```

### Dependencies on Previous Stories

- **Story 1.1** (Project Scaffold & Core Utilities): Provides `utils/errors.ts` (`withFailOpen`, `Result<T>`), `utils/logger.ts`, `utils/constants.ts` (`CONFIDENCE_THRESHOLD`), `src/types/` (`PipelineContext`)
- **Story 1.2** (Knowledge Store): Provides `store/` module with `readTaskHistory()`, `readDependencyGraph()`, `readKeywordIndex()`, `readPatterns()` — all read-only accessors
- **Story 1.3/1.4** (Project Scanner): Provides the actual data in the store (project map, dependency graph, keyword index) that the predictor reads
- **Story 2.1** (Pipeline Orchestrator & Task Analyzer): Provides `ClassificationResult` from analyzer and the pipeline orchestrator that calls the predictor

### Signal Weight Defaults

| Signal | Default Weight | Rationale |
|---|---|---|
| History Similarity | 0.35 | Strongest signal when history exists |
| Graph Traversal | 0.25 | Structural relationships are reliable |
| Keyword Lookup | 0.25 | Direct mapping, always available |
| Co-occurrence Boost | 0.15 | Supplementary boosting signal |

Weights are configurable and will be adjusted by the Learner module (Epic 3) based on actual accuracy data.

### Performance Budget

- File Predictor total: <200ms
- Each signal source should target <50ms individually
- Use pre-computed data structures from the store (hash maps, adjacency lists)
- No file I/O during prediction — all data pre-loaded from store

### References

- [Source: architecture.md#Core Architectural Decisions] — AD-10, AD-02, AD-04, AD-03
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — All naming, structure, format patterns
- [Source: architecture.md#Complete Project Directory Structure] — predictor/ with signals/ subdirectory
- [Source: architecture.md#API & Communication Patterns] — PipelineContext data flow
- [Source: epics.md#Story 2.2] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
None — clean implementation with no blocking issues.

### Completion Notes List
- Implemented full multi-signal file prediction engine with 4 signal sources (history similarity, graph traversal, keyword lookup, co-occurrence boost)
- All signals read from store (read-only) via `readTaskHistory`, `readDependencyGraph`, `readKeywordIndex`, `readPatterns`
- Composite scoring: weighted sum normalized to 0.0–1.0, filtered by `CONFIDENCE_THRESHOLD` (0.6)
- Cold start detection: when task history < 5 entries, adjusts weights (history=0, keyword=0.45, graph=0.35, cooccurrence=0.20)
- Graceful degradation: returns empty predictions when all candidates below threshold
- Performance instrumented with `performance.now()`, warns if >200ms
- Updated `PredictionResult` type in `types/pipeline.ts` to use full definition from `predictor/types.ts`
- Integrated predictor into pipeline as Stage 2 with `withFailOpen` wrapper and `DEFAULT_PREDICTION` fallback
- Updated existing pipeline test to expect populated prediction result
- 39 new tests covering all signals individually and the orchestrator
- All 357 tests pass, typecheck and lint clean

### Implementation Plan
- Types defined in `src/predictor/types.ts` with `SignalSource` enum, `SignalScore`, `FilePrediction`, `PredictionResult`, `SignalWeights`
- Each signal in `src/predictor/signals/` reads from store, returns `Map<string, SignalScore>`
- Orchestrator in `file-predictor.ts` calls signals 1-3 independently, then signal 4 (co-occurrence) with predicted files from 1-3
- `confidence.ts` provides `computeCompositeScore()` and `filterByThreshold()`
- Barrel export in `index.ts` exposes only `predictFiles`, types, and `DEFAULT_SIGNAL_WEIGHTS`

### Change Log
- 2026-03-04: Initial implementation of Story 2.2 — File Predictor with multi-signal scoring
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean

### File List
- `src/predictor/index.ts` (NEW) — barrel export
- `src/predictor/types.ts` (NEW) — prediction types, signal weights, enums
- `src/predictor/file-predictor.ts` (NEW) — multi-signal orchestration
- `src/predictor/confidence.ts` (NEW) — score normalization and threshold filtering
- `src/predictor/signals/history-similarity.ts` (NEW) — history keyword overlap signal
- `src/predictor/signals/graph-traversal.ts` (NEW) — dependency graph neighbor signal
- `src/predictor/signals/keyword-lookup.ts` (NEW) — keyword index lookup signal
- `src/predictor/signals/cooccurrence-boost.ts` (NEW) — co-occurrence boosting signal
- `src/types/pipeline.ts` (MODIFIED) — updated PredictionResult to import from predictor/types
- `src/pipeline.ts` (MODIFIED) — integrated predictor as Stage 2 with withFailOpen
- `tests/predictor/file-predictor.test.ts` (NEW) — 16 orchestrator tests
- `tests/predictor/signals/history-similarity.test.ts` (NEW) — 10 tests
- `tests/predictor/signals/graph-traversal.test.ts` (NEW) — 8 tests
- `tests/predictor/signals/keyword-lookup.test.ts` (NEW) — 7 tests
- `tests/predictor/signals/cooccurrence-boost.test.ts` (NEW) — 8 tests
- `tests/pipeline/pipeline.test.ts` (MODIFIED) — updated to expect prediction result
