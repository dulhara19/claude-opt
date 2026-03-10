# Story 2.3: Model Router

Status: done
Epic: 2 - Smart Task Execution Pipeline
Story: 2.3
Date: 2026-03-04
Complexity: Medium
Estimated Scope: Model selection engine with Haiku/Sonnet/Opus escalation, complexity-based routing, and historical override logic

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the optimizer to automatically select the cheapest Claude model that can handle my task,
so that I save tokens on simple tasks and only use expensive models when necessary.

## Acceptance Criteria (BDD)

### AC1: Simple Task Routes to Haiku
**Given** a task classified as `bugfix` with complexity `simple`
**When** the Model Router selects a model
**Then** it routes to Haiku (cheapest model)
**And** the routing decision and rationale are included in the RoutingResult
**And** the routing decision completes in <50ms

### AC2: Complex Task Escalation
**Given** a task classified as `feature` with complexity `complex`
**When** the Model Router selects a model
**Then** it routes to Sonnet or Opus based on complexity signals
**And** the escalation path is Haiku -> Sonnet -> Opus

### AC3: Research/Learning Defaults to Haiku
**Given** a task classified as `research`, `learning`, or `documentation`
**When** the Model Router selects a model
**Then** it defaults to Haiku unless historical data shows Haiku failed on similar tasks

### AC4: Historical Failure Override
**Given** historical data shows Haiku failed on a similar task type+domain combination
**When** the Model Router evaluates routing
**Then** it overrides the default and escalates to Sonnet
**And** the override reason is logged in the RoutingResult for transparency

### AC5: Routing Transparency
**Given** the Model Router produces a result
**When** displayed to the user
**Then** the selected model name and the rationale are shown (e.g., "Routing to Haiku: simple bugfix, Haiku succeeded on 4/4 similar tasks")

## Tasks / Subtasks

- [x] Task 1: Create router module structure (AC: #1, #2, #3)
  - [x] Create `src/router/` directory
  - [x] Create `src/router/index.ts` barrel export: `selectModel`, `RoutingResult` type
  - [x] Create `src/router/types.ts` with `RoutingResult`, `ModelTier`, `RoutingRule`, `RoutingRationale`
  - [x] Create `src/router/model-router.ts` — core routing logic
- [x] Task 2: Define routing types (AC: #1, #5)
  - [x] `ModelTier` enum: `Haiku`, `Sonnet`, `Opus`
  - [x] `RoutingResult`: `{ model: ModelTier; rationale: string; confidence: number; overrideApplied: boolean; durationMs: number }`
  - [x] `RoutingRule`: `{ taskType: TaskType; complexity: Complexity; defaultModel: ModelTier }`
  - [x] `RoutingRationale`: human-readable explanation string for display
- [x] Task 3: Implement default routing rules (AC: #1, #2, #3)
  - [x] Define `DEFAULT_ROUTING_RULES` mapping: task type + complexity -> model tier
  - [x] Simple bugfix -> Haiku
  - [x] Simple feature -> Haiku
  - [x] Medium bugfix -> Sonnet
  - [x] Medium feature -> Sonnet
  - [x] Complex feature -> Opus
  - [x] Complex refactor -> Opus
  - [x] Research/learning/documentation -> Haiku (default)
  - [x] Unknown type -> Sonnet (safe middle ground)
- [x] Task 4: Implement `selectModel()` function (AC: #1, #2, #3)
  - [x] Accept `PipelineContext` with `classification` (from analyzer) as input
  - [x] Look up default model from `DEFAULT_ROUTING_RULES` using task type + complexity
  - [x] Build rationale string explaining the routing decision
  - [x] Return `RoutingResult` with model, rationale, and confidence
- [x] Task 5: Implement historical failure override (AC: #4)
  - [x] Read task history from store (read-only) to check past model performance
  - [x] For the current task type + domain combination, check if the default model failed previously
  - [x] Define "failure" criteria: task resulted in error, low quality, or user correction
  - [x] If default model has failure rate above threshold for this type+domain, escalate one tier
  - [x] Record the override in the `RoutingResult` with `overrideApplied: true` and reason in rationale
- [x] Task 6: Implement escalation path logic (AC: #2, #4)
  - [x] Define escalation chain: Haiku -> Sonnet -> Opus
  - [x] `escalate(currentModel: ModelTier): ModelTier` — returns next tier up
  - [x] Opus is the ceiling — cannot escalate beyond Opus
  - [x] Haiku is the floor — default starting point for simple tasks
- [x] Task 7: Build human-readable rationale strings (AC: #5)
  - [x] Format: "Routing to {Model}: {reason}" — e.g., "Routing to Haiku: simple bugfix, Haiku succeeded on 4/4 similar tasks"
  - [x] Include task type, complexity, and historical success rate when available
  - [x] If override applied, include override reason: "Routing to Sonnet: simple bugfix, but Haiku failed on 2/3 similar tasks — escalating"
- [x] Task 8: Enforce performance budget (AC: #1)
  - [x] Add timing instrumentation around `selectModel()` execution
  - [x] Log a warning if routing exceeds 50ms budget
  - [x] Routing is purely computational (hash lookups + simple logic) — should be well under budget
- [x] Task 9: Define fail-open default routing (AC: #1)
  - [x] Define `DEFAULT_ROUTING` constant: `{ model: ModelTier.Sonnet, rationale: 'Default routing — classification unavailable', confidence: 0, overrideApplied: false, durationMs: 0 }`
  - [x] Export for use by pipeline orchestrator's `withFailOpen()` wrapper
  - [x] Sonnet as default fallback is a safe middle ground — not too expensive, not too limited
- [x] Task 10: Write unit tests for model router (AC: #1, #2, #3, #4, #5)
  - [x] Create `tests/router/model-router.test.ts`
  - [x] Test simple bugfix routes to Haiku
  - [x] Test complex feature routes to Sonnet or Opus
  - [x] Test research/learning defaults to Haiku
  - [x] Test historical override: mock failed history, verify escalation to Sonnet
  - [x] Test escalation path: Haiku -> Sonnet -> Opus, Opus is ceiling
  - [x] Test rationale string contains model name, task type, and reason
  - [x] Test unknown task type routes to Sonnet (safe default)
  - [x] Test fail-open default routing when classification is missing
  - [x] Test performance: verify routing completes in <50ms

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-02 | Typed Pipeline with Orchestrator — Model Router is pipeline stage 3, receives PipelineContext with classification and prediction | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | `withFailOpen(stageFn, fallback)` wrapper — router failure returns default Sonnet routing, pipeline continues | [Source: architecture.md#Core Architectural Decisions] |
| AD-03 | Single Store Module — router reads from store (read-only) for task history to check historical model performance | [Source: architecture.md#Core Architectural Decisions] |

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `model-router.ts` |
| Test files | kebab-case.test.ts | `tests/router/model-router.test.ts` |
| Functions | camelCase | `selectModel()`, `escalate()` |
| Variables | camelCase | `selectedModel`, `routingRationale`, `failureRate` |
| Types/Interfaces | PascalCase | `RoutingResult`, `ModelTier`, `RoutingRule` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_ROUTING_RULES`, `DEFAULT_ROUTING` |
| Enums | PascalCase + PascalCase members | `ModelTier.Haiku`, `ModelTier.Sonnet`, `ModelTier.Opus` |
| Booleans | is/has/should/can prefix | `isOverridden`, `hasFailureHistory`, `shouldEscalate` |
| JSON fields | camelCase | `modelTier`, `overrideApplied` |
| Directories | kebab-case | `src/router/` |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

**withFailOpen Pattern:**
```typescript
const route = withFailOpen(
  (ctx: PipelineContext) => router.selectModel(ctx),
  DEFAULT_ROUTING
);
```

**PipelineContext — Router reads classification + prediction, writes routing:**
```typescript
interface PipelineContext {
  userPrompt: string;
  classification?: ClassificationResult;  // Read by router
  prediction?: PredictionResult;          // Read by router (file count for complexity)
  routing?: RoutingResult;                // Written by router
  compression?: CompressionResult;
  adapterResult?: AdapterResult;
}
```

**ModelTier Enum:**
```typescript
enum ModelTier {
  Haiku = 'haiku',
  Sonnet = 'sonnet',
  Opus = 'opus',
}
```

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display.

[Source: architecture.md#Format Patterns]

### Import Rules (MUST FOLLOW)

- Modules import from other modules ONLY through their `index.ts` barrel export
- Never import from another module's internal files directly
- Router imports `ClassificationResult` from `../analyzer/index.js`
- Router imports `PredictionResult` from `../predictor/index.js` (for file count signal)
- Router reads from `store/` (read-only): `readTaskHistory()` for historical model performance
- `utils/` and `store/` are leaf dependencies

[Source: architecture.md#Import Rules]

### Project Structure Notes

This story creates the third pipeline stage module:

```
src/
├── router/                     # Model Router module (NEW)
│   ├── index.ts                # Public: selectModel(), RoutingResult, ModelTier
│   ├── types.ts                # RoutingResult, ModelTier, RoutingRule
│   └── model-router.ts         # Complexity-to-model mapping + history overrides
tests/
├── router/
│   └── model-router.test.ts    # Model router tests (NEW)
```

### Dependencies on Previous Stories

- **Story 1.1** (Project Scaffold & Core Utilities): Provides `utils/errors.ts` (`withFailOpen`, `Result<T>`), `utils/logger.ts`, `utils/constants.ts`, `src/types/` (`PipelineContext`, `TaskType`, `Complexity` enums)
- **Story 1.2** (Knowledge Store): Provides `store/` module with `readTaskHistory()` for checking historical model performance
- **Story 2.1** (Pipeline Orchestrator & Task Analyzer): Provides `ClassificationResult` from analyzer and pipeline orchestrator that calls the router
- **Story 2.2** (File Predictor): Provides `PredictionResult` — router can optionally use predicted file count as a complexity signal

### Default Routing Matrix

| Task Type | Simple | Medium | Complex |
|---|---|---|---|
| bugfix | Haiku | Sonnet | Sonnet |
| feature | Haiku | Sonnet | Opus |
| refactor | Sonnet | Sonnet | Opus |
| research | Haiku | Haiku | Sonnet |
| learning | Haiku | Haiku | Sonnet |
| documentation | Haiku | Haiku | Sonnet |
| writing | Haiku | Sonnet | Sonnet |
| unknown | Sonnet | Sonnet | Opus |

### Performance Budget

- Model Router total: <50ms
- Routing is purely computational — lookup rules + check history + build rationale
- No file I/O during routing — history data pre-loaded from store

### References

- [Source: architecture.md#Core Architectural Decisions] — AD-02, AD-03, AD-04
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — All naming, structure, format patterns
- [Source: architecture.md#Complete Project Directory Structure] — router/ placement
- [Source: architecture.md#API & Communication Patterns] — PipelineContext data flow
- [Source: epics.md#Story 2.3] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
None — clean implementation with no blocking issues.

### Completion Notes List
- Implemented Model Router with Haiku/Sonnet/Opus tier selection based on task type + complexity
- Complete routing rules matrix covering all TaskType x Complexity combinations
- Historical failure override: checks task history for failure patterns, escalates when failure rate > 40% on 2+ tasks
- Escalation chain: Haiku → Sonnet → Opus (Opus is ceiling)
- Human-readable rationale strings included in every RoutingResult
- Performance instrumented with `performance.now()`, warns if >50ms
- `DEFAULT_ROUTING` fail-open fallback defaults to Sonnet
- Updated `RoutingResult` type in `types/pipeline.ts` to use full definition from `router/types.ts`
- Integrated router into pipeline as Stage 3 with `withFailOpen` wrapper
- 23 new tests covering all routing rules, escalation, overrides, transparency, and performance
- All 380 tests pass, typecheck and lint clean

### Implementation Plan
- Types in `src/router/types.ts`: `ModelTier` enum, `RoutingResult`, `RoutingRule`, `ESCALATION_MAP`, `FAILURE_RATE_THRESHOLD`
- Core logic in `src/router/model-router.ts`: `selectModel()`, `escalate()`, `DEFAULT_ROUTING_RULES` lookup map, `checkHistoricalFailures()`, `buildRationale()`
- Barrel export in `index.ts`: `selectModel`, `DEFAULT_ROUTING`, `ModelTier`, types

### Change Log
- 2026-03-04: Initial implementation of Story 2.3 — Model Router with complexity-based routing and historical override
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean

### File List
- `src/router/index.ts` (NEW) — barrel export
- `src/router/types.ts` (NEW) — ModelTier enum, RoutingResult, RoutingRule, ESCALATION_MAP
- `src/router/model-router.ts` (NEW) — selectModel(), escalate(), routing rules, history override
- `src/types/pipeline.ts` (MODIFIED) — updated RoutingResult to import from router/types
- `src/pipeline.ts` (MODIFIED) — integrated router as Stage 3 with withFailOpen
- `tests/router/model-router.test.ts` (NEW) — 23 tests
- `tests/pipeline/pipeline.test.ts` (MODIFIED) — updated to expect routing result
