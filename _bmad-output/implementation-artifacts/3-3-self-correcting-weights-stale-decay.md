# Story 3.3: Self-Correcting Weights & Stale Decay

Status: done
Epic: 3 - Learning & Self-Improvement
Story: 3.3
Date: 2026-03-04
Complexity: Medium
Estimated Scope: Weight boost/decay for predictions, stale entry decay, transparent weight audit trail in patterns.json

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want prediction weights to automatically adjust based on accuracy feedback,
So that the system self-corrects without requiring manual intervention.

## Acceptance Criteria (BDD)

### AC1: Boost Accurate Predictions
**Given** a file was predicted with high confidence and was actually used
**When** the weight correction runs after the task
**Then** the file's prediction weight is boosted (positive reinforcement)
**And** the boost magnitude is proportional to the prediction confidence

### AC2: Decay Inaccurate Predictions
**Given** a file was predicted with high confidence but was NOT used
**When** the weight correction runs after the task
**Then** the file's prediction weight is decayed (negative reinforcement)
**And** the decay is gradual — a single miss does not eliminate a file from predictions

### AC3: Stale Entry Decay
**Given** a file/pattern appeared frequently in historical tasks but has not appeared in the last N sessions
**When** the stale entry decay runs
**Then** its weight is gradually reduced over time
**And** files not seen in recent sessions become less likely to be predicted
**And** fully stale entries (weight near zero) are flagged for potential Doctor analysis

### AC4: Measurable Improvement Over Time
**Given** the self-correcting weight system operates
**When** a user runs 10+ tasks over multiple sessions
**Then** prediction precision measurably improves over time
**And** the weight adjustments are transparent — stored in patterns.json with evidence counts

### AC5: Fail-Open Error Handling
**Given** the weight correction system encounters an error
**When** `withFailOpen()` catches the error
**Then** the task still completes successfully — weight correction failure never blocks the user
**And** the error is logged for later Doctor analysis

## Tasks / Subtasks

- [x] Task 1: Define weight correction types in `src/learner/types.ts` (AC: #1, #2, #4)
  - [x] Define `WeightCorrection` interface: `file` (string), `previousWeight` (number), `newWeight` (number), `delta` (number), `reason` ('boost' | 'decay' | 'stale'), `predictionConfidence` (number), `taskId` (string)
  - [x] Define `StaleEntry` interface: `file` (string), `lastSeen` (string ISO 8601), `sessionsSinceLastSeen` (number), `currentDecayFactor` (number), `isFullyStale` (boolean)
  - [x] Define `WeightCorrectionResult` interface: `corrections` (WeightCorrection[]), `staleEntries` (StaleEntry[]), `patternsUpdated` (boolean), `graphUpdated` (boolean)
  - [x] Define weight correction constants: `BOOST_FACTOR`, `DECAY_FACTOR`, `STALE_DECAY_RATE`, `STALE_THRESHOLD_SESSIONS`, `FULLY_STALE_WEIGHT`

- [x] Task 2: Implement `correctWeights()` in `weight-correction.ts` (AC: #1, #2, #5)
  - [x] Accept predicted files, actual files, and per-file confidence scores
  - [x] Classify each predicted file into one of three categories:
    - **True positive** (predicted and used): apply boost
    - **False positive** (predicted but not used): apply decay
    - **False negative** (used but not predicted): no weight correction (handled by keyword-index update in 3.1)
  - [x] For each true positive file:
    - Read current weight from dependency-graph edges or type affinities
    - Calculate boost: `boost = BOOST_FACTOR * predictionConfidence` (proportional to how confident the prediction was)
    - New weight: `min(currentWeight + boost, 1.0)` (capped at 1.0)
    - Record `WeightCorrection` with reason `'boost'`
  - [x] For each false positive file:
    - Read current weight from dependency-graph edges or type affinities
    - Calculate decay: `decay = DECAY_FACTOR * predictionConfidence` (higher confidence misses penalized more)
    - New weight: `max(currentWeight - decay, 0.05)` (floor at 0.05, never zero from single miss)
    - Record `WeightCorrection` with reason `'decay'`
  - [x] Return array of `WeightCorrection` entries for transparency
  - [x] Wrap with try/catch for fail-open behavior

- [x] Task 3: Implement weight application to dependency graph (AC: #1, #2)
  - [x] Create `applyWeightCorrections()` function in `weight-correction.ts`
  - [x] Read current dependency-graph.json via store
  - [x] For each `WeightCorrection`:
    - Find matching edges where the corrected file is source or target
    - Update edge weight to `newWeight`
    - Only modify learner-discovered edges (`discoveredBy: "learner"`) — never modify scanner edges
  - [x] Write updated graph via store
  - [x] Log each correction at debug level for transparency

- [x] Task 4: Implement weight application to patterns.json (AC: #1, #2, #4)
  - [x] Create `applyWeightToPatterns()` function in `weight-correction.ts`
  - [x] Read current patterns.json via store
  - [x] For co-occurrence patterns: if a corrected file appears in a co-occurrence pair, adjust the pattern's `decayFactor`:
    - Boost: `decayFactor = min(decayFactor * 1.1, 1.0)`
    - Decay: `decayFactor = max(decayFactor * 0.9, 0.0)`
  - [x] For type affinities: if a corrected file appears in a type affinity entry, update the affinity `weight` directly
  - [x] Write updated patterns via store
  - [x] Ensure all weight adjustments are transparent — evidence counts and weights are visible in the JSON

- [x] Task 5: Implement stale entry decay in `weight-correction.ts` (AC: #3)
  - [x] Create `decayStaleEntries()` function accepting current session count
  - [x] Read current patterns.json via store
  - [x] Read recent task history to determine which files/patterns have been seen recently
  - [x] Build a `lastSeenMap`: for each file, record the most recent session where it appeared
  - [x] For each co-occurrence pattern in patterns.json:
    - Calculate `sessionsSinceLastSeen = currentSession - lastSeenSession`
    - If `sessionsSinceLastSeen > STALE_THRESHOLD_SESSIONS` (default: 10):
      - Apply stale decay: `decayFactor = decayFactor * STALE_DECAY_RATE` (default: 0.85 per session past threshold)
      - If `decayFactor < FULLY_STALE_WEIGHT` (default: 0.05): flag as fully stale (`isFullyStale: true`)
  - [x] For each type affinity entry:
    - If the file has not appeared in recent N sessions, reduce weight by `STALE_DECAY_RATE`
    - If weight drops below `FULLY_STALE_WEIGHT`, flag for Doctor analysis
  - [x] For dependency graph co-occurrence edges:
    - Read dependency-graph.json
    - Apply same stale decay logic to learner-discovered edges
    - Never decay scanner-discovered (import) edges — those are refreshed by project scan
  - [x] Write updated patterns and dependency graph via store
  - [x] Return list of `StaleEntry` objects for logging and Doctor analysis

- [x] Task 6: Implement stale flagging for Doctor (AC: #3)
  - [x] When entries become fully stale (`isFullyStale: true`), add them to a `staleFlags` list
  - [x] Store stale flags in a format the Doctor can consume (write to patterns.json or a dedicated section)
  - [x] Log stale entries at info level: "Flagged N stale entries for Doctor analysis"
  - [x] Do NOT remove stale entries — only flag them. Removal is Doctor's responsibility (Epic 7)

- [x] Task 7: Integrate weight correction into `captureOutcome()` flow (AC: #1, #2, #3, #4, #5)
  - [x] In `knowledge-learner.ts`, after pattern detection (Story 3.2):
    - Call `runWeightCorrection()` from weight-correction module (combines correctWeights, applyWeightCorrections, applyWeightToPatterns, decayStaleEntries)
  - [x] Wrap all weight correction calls with try/catch for fail-open behavior
  - [x] Log a summary: "Weight corrections: N boosts, M decays, K stale entries"
  - [x] Ensure total capture time (including weight correction) stays within <500ms budget

- [x] Task 8: Define configurable constants in `src/learner/types.ts` or `constants.ts` (AC: #1, #2, #3)
  - [x] `BOOST_FACTOR = 0.1` — base boost magnitude for correct predictions
  - [x] `DECAY_FACTOR = 0.05` — base decay magnitude for incorrect predictions (smaller than boost — asymmetric to avoid over-penalizing)
  - [x] `STALE_THRESHOLD_SESSIONS = 10` — sessions without seeing a file/pattern before stale decay starts
  - [x] `STALE_DECAY_RATE = 0.85` — multiplicative decay per session past threshold
  - [x] `FULLY_STALE_WEIGHT = 0.05` — weight below which entry is flagged as fully stale
  - [x] `WEIGHT_FLOOR = 0.05` — minimum weight after decay (prevents complete elimination from single miss)
  - [x] `WEIGHT_CEILING = 1.0` — maximum weight after boost
  - [x] Export all constants through the barrel

- [x] Task 9: Write unit tests for weight boost (AC: #1)
  - [x] Create `tests/learner/weight-correction.test.ts`
  - [x] Test: true positive with high confidence (0.9) gets proportionally large boost
  - [x] Test: true positive with low confidence (0.3) gets proportionally small boost
  - [x] Test: boosted weight capped at 1.0 (never exceeds ceiling)
  - [x] Test: boost applied to correct files only (no side effects on other files)
  - [x] Test: scanner-discovered edges never modified by boost

- [x] Task 10: Write unit tests for weight decay (AC: #2)
  - [x] Test: false positive with high confidence (0.9) gets larger decay penalty
  - [x] Test: false positive with low confidence (0.3) gets smaller decay penalty
  - [x] Test: decayed weight floored at 0.05 (single miss never eliminates file)
  - [x] Test: gradual decay — file predicted incorrectly 3 times still has positive weight
  - [x] Test: decay asymmetry — decay magnitude smaller than boost at same confidence (forgiving)

- [x] Task 11: Write unit tests for stale entry decay (AC: #3)
  - [x] Test: no decay applied when file seen within STALE_THRESHOLD_SESSIONS
  - [x] Test: entry flagged as fully stale when weight < FULLY_STALE_WEIGHT
  - [x] Test: scanner-discovered edges exempt from stale decay
  - [x] Test: stale entries NOT removed, only flagged

- [x] Task 12: Write unit tests for pattern weight updates (AC: #4)
  - [x] Test: co-occurrence decayFactor boosted when files are used together (confirmed)
  - [x] Test: co-occurrence decayFactor reduced when predicted pair not used together
  - [x] Test: type affinity weights updated correctly on boost/decay
  - [x] Test: weight changes visible in patterns.json (transparency check)

- [x] Task 13: Write integration test for self-improvement over time (AC: #4)
  - [x] Create test simulating 10+ tasks with consistent true positives
  - [x] Verify weight increases over time demonstrating improvement

- [x] Task 14: Write fail-open test (AC: #5)
  - [x] correctWeights() returns empty array when graph read fails (no throw)
  - [x] applyWeightCorrections() returns false when graph read fails (no throw)
  - [x] decayStaleEntries() returns empty result when reads fail (no throw)
  - [x] runWeightCorrection() handles errors gracefully and returns result

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-02 | Typed Pipeline — weight corrections run as part of post-task Learner stage in pipeline | [Source: architecture.md#Core Architectural Decisions] |
| AD-03 | Single Store Module — all weight updates go through `readPatterns()`, `writePatterns()`, `readDependencyGraph()`, `writeDependencyGraph()` | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | `withFailOpen()` — weight correction failure never blocks user | [Source: architecture.md#Core Architectural Decisions] |
| AD-05 | POSIX Internal paths — all file paths in patterns.json and dependency-graph.json stored as POSIX | [Source: architecture.md#Core Architectural Decisions] |

### Module Access Matrix (Learner - Story 3.3 additions)

| Store File | Access | Operations |
|---|---|---|
| task-history.json | READ | Read recent entries for stale entry analysis |
| dependency-graph.json | READ + WRITE | Read current edges; write weight corrections for learner edges |
| patterns.json | READ + WRITE | Read current patterns; write updated decayFactor, affinity weights, stale flags |
| metrics.json | READ | Read session count for stale threshold calculation |

### Key Types and Interfaces

**WeightCorrection (defined in this story):**
```typescript
interface WeightCorrection {
  file: string;                      // POSIX file path
  previousWeight: number;            // Weight before correction
  newWeight: number;                  // Weight after correction
  delta: number;                     // newWeight - previousWeight
  reason: 'boost' | 'decay' | 'stale';
  predictionConfidence: number;      // Original prediction confidence (0.0-1.0)
  taskId: string;                    // Task that triggered this correction
}
```

**StaleEntry (defined in this story):**
```typescript
interface StaleEntry {
  file: string;                      // POSIX file path
  lastSeen: string;                  // ISO 8601 timestamp
  sessionsSinceLastSeen: number;
  currentDecayFactor: number;        // Current decayFactor after decay
  isFullyStale: boolean;             // true when weight < FULLY_STALE_WEIGHT
}
```

**WeightCorrectionResult (defined in this story):**
```typescript
interface WeightCorrectionResult {
  corrections: WeightCorrection[];   // All boost/decay corrections applied
  staleEntries: StaleEntry[];        // Entries that received stale decay
  boostCount: number;                // Number of boosted files
  decayCount: number;                // Number of decayed files
  staleCount: number;                // Number of stale entries processed
  patternsUpdated: boolean;          // Whether patterns.json was modified
  graphUpdated: boolean;             // Whether dependency-graph.json was modified
}
```

### Weight Correction Algorithm

**Boost (True Positive):**
```
newWeight = min(currentWeight + BOOST_FACTOR * predictionConfidence, WEIGHT_CEILING)
```
- `BOOST_FACTOR = 0.1`
- Example: file predicted at 0.9 confidence and used -> boost = 0.09
- Example: file predicted at 0.5 confidence and used -> boost = 0.05

**Decay (False Positive):**
```
newWeight = max(currentWeight - DECAY_FACTOR * predictionConfidence, WEIGHT_FLOOR)
```
- `DECAY_FACTOR = 0.05` (asymmetric: smaller than boost)
- Example: file predicted at 0.9 confidence but not used -> decay = 0.045
- Example: file predicted at 0.5 confidence but not used -> decay = 0.025
- Asymmetric design rationale: the system should be more willing to boost (positive reinforcement) than to penalize (negative reinforcement), because a file not being used in one task does not necessarily mean it was a bad prediction

**Stale Decay:**
```
if sessionsSinceLastSeen > STALE_THRESHOLD_SESSIONS:
  decayFactor = decayFactor * STALE_DECAY_RATE ^ (sessionsSinceLastSeen - STALE_THRESHOLD_SESSIONS)
if decayFactor < FULLY_STALE_WEIGHT:
  isFullyStale = true  // flagged for Doctor
```
- `STALE_THRESHOLD_SESSIONS = 10`
- `STALE_DECAY_RATE = 0.85`
- `FULLY_STALE_WEIGHT = 0.05`
- Example: pattern not seen for 15 sessions -> 5 sessions past threshold -> decayFactor = 1.0 * 0.85^5 = 0.444
- Example: pattern not seen for 25 sessions -> 15 sessions past threshold -> decayFactor = 1.0 * 0.85^15 = 0.087

### Invariants and Safety Rules

1. **Scanner edges are sacred:** Never modify edges with `discoveredBy: "scanner"`. Only learner-discovered edges and patterns receive weight corrections.
2. **Weight floor:** No file weight ever reaches 0.0 from automated decay. Floor is `WEIGHT_FLOOR = 0.05`. Only manual `co forget` or Doctor can zero a weight.
3. **Stale entries are not deleted:** Fully stale entries are flagged, not removed. The Doctor Agent (Epic 7) handles cleanup decisions.
4. **Asymmetric boost/decay:** Boost factor (0.1) > Decay factor (0.05). The system is forgiving — a single miss is not heavily penalized.
5. **Proportional to confidence:** Both boost and decay scale with the original prediction confidence. Low-confidence predictions have smaller corrections.

### JSON Schema: patterns.json decayFactor

The `decayFactor` field in co-occurrence patterns is the key mechanism for stale decay:

```json
{
  "coOccurrences": [
    {
      "id": "co_001",
      "files": ["src/auth.ts", "src/middleware.ts"],
      "frequency": 8,
      "confidence": 0.82,
      "lastSeen": "2026-03-04T14:00:00Z",
      "discoveredAt": "2026-03-01T10:00:00Z",
      "decayFactor": 1.0
    },
    {
      "id": "co_002",
      "files": ["src/old-util.ts", "src/legacy.ts"],
      "frequency": 3,
      "confidence": 0.45,
      "lastSeen": "2026-02-15T10:00:00Z",
      "discoveredAt": "2026-02-10T10:00:00Z",
      "decayFactor": 0.08
    }
  ]
}
```

In the example above, `co_002` has a decayFactor of 0.08 because it has not been seen recently. If it drops below 0.05 on the next decay pass, it will be flagged as fully stale.

### Configurable Constants

```typescript
// Weight correction constants
const BOOST_FACTOR = 0.1;                   // Base boost for correct predictions
const DECAY_FACTOR = 0.05;                  // Base decay for incorrect predictions (asymmetric)
const WEIGHT_FLOOR = 0.05;                  // Minimum weight (never zero from auto-decay)
const WEIGHT_CEILING = 1.0;                 // Maximum weight

// Stale decay constants
const STALE_THRESHOLD_SESSIONS = 10;        // Sessions before stale decay begins
const STALE_DECAY_RATE = 0.85;              // Multiplicative decay per session past threshold
const FULLY_STALE_WEIGHT = 0.05;            // Below this = flagged for Doctor
```

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `weight-correction.ts` |
| Test files | kebab-case.test.ts | `tests/learner/weight-correction.test.ts` |
| Functions | camelCase | `correctWeights()`, `applyWeightCorrections()`, `decayStaleEntries()` |
| Variables | camelCase | `previousWeight`, `newWeight`, `decayFactor`, `staleEntries` |
| Types/Interfaces | PascalCase | `WeightCorrection`, `StaleEntry`, `WeightCorrectionResult` |
| Constants | UPPER_SNAKE_CASE | `BOOST_FACTOR`, `DECAY_FACTOR`, `STALE_THRESHOLD_SESSIONS` |
| Booleans | is/has/should prefix | `isFullyStale`, `hasDecayed`, `shouldFlagForDoctor` |
| JSON fields | camelCase | `decayFactor`, `previousWeight`, `newWeight` |

### Code Patterns (MUST FOLLOW)

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

**withFailOpen Pattern (wrapping weight correction):**
```typescript
// In knowledge-learner.ts
try {
  const corrections = correctWeights(learningOutcome);
  applyWeightCorrections(corrections);
  applyWeightToPatterns(corrections);
  const staleResult = decayStaleEntries(currentSessionCount);
  logger.debug('learner', `Weight corrections: ${corrections.boostCount} boosts, ${corrections.decayCount} decays, ${staleResult.staleCount} stale`);
} catch (error) {
  logger.error('learner', 'Weight correction failed, skipping', error);
  // Fail-open: task still completes
}
```

**Confidence Scores:** Always 0.0-1.0 float in data. Weights, boosts, decays, and decayFactors all use the same 0.0-1.0 range.

### Import Rules (MUST FOLLOW)

- Import from `store/` ONLY through barrel: `import { readDependencyGraph, writeDependencyGraph, readPatterns, writePatterns, readTaskHistory, readMetrics } from '../store/index.js';`
- Import shared types from `src/types/`: `import { type Result } from '../types/index.js';`
- Import utils: `import { toInternal, logger } from '../utils/index.js';`
- Internal learner imports: `weight-correction.ts` imports from `./types.js` (same module)
- `knowledge-learner.ts` imports from `./weight-correction.js` (same module internal)
- Other modules import from `../learner/index.js` only

### Dependencies (Prerequisites)

| Dependency | Module | What This Story Needs |
|---|---|---|
| Story 1.1 | `src/utils/` | `withFailOpen()`, `logger`, `Result<T>` |
| Story 1.2 | `src/store/` | `readDependencyGraph()`, `writeDependencyGraph()`, `readPatterns()`, `writePatterns()`, `readTaskHistory()`, `readMetrics()` |
| Story 3.1 | `src/learner/` | `LearningOutcome` type with predicted files, actual files, per-file confidence, task ID |
| Story 3.2 | `src/learner/` | patterns.json with `coOccurrences` (including `decayFactor` field), `typeAffinities`, dependency graph with learner edges |

### Performance Budget

- Weight classification (boost/decay): <10ms (simple comparison)
- Dependency graph weight update: <50ms (read + edge update + write)
- Patterns weight update: <50ms (read + pattern update + write)
- Stale decay calculation: <50ms (iterate patterns, compute decay)
- Total weight correction budget: <160ms (fits within overall <500ms capture budget)

### Project Structure (Files Created/Modified by This Story)

```
src/learner/
├── index.ts                  # Updated: export weight correction types
├── types.ts                  # Updated: add WeightCorrection, StaleEntry, WeightCorrectionResult, constants
├── knowledge-learner.ts      # Updated: integrate correctWeights() and decayStaleEntries() calls
├── weight-correction.ts      # IMPLEMENTED: correctWeights(), applyWeightCorrections(), applyWeightToPatterns(), decayStaleEntries()
└── pattern-detector.ts       # Unchanged (from Story 3.2)

tests/learner/
├── knowledge-learner.test.ts # Updated: add integration tests for full learning+correction flow
└── weight-correction.test.ts # IMPLEMENTED: boost, decay, stale, pattern weight, fail-open tests
```

### What This Story Does NOT Create

- Doctor stale entry cleanup — Epic 7 (Doctor reads stale flags, proposes removal)
- Manual `co forget` command — Epic 6 (zeros weight by user request)
- Token tracking integration — Epic 4
- User feedback processing that affects weights — Epic 6
- Convention weight correction — not applicable (conventions have `confidence` and `evidenceCount`, not per-file weights)

### Relationship to Doctor Agent (Epic 7)

This story's stale entry flagging is the Tier 1 (automatic) self-correction mechanism. When entries become fully stale, they are flagged but NOT removed. The Doctor Agent provides:
- **Tier 2 (Supervised):** Doctor diagnoses stale patterns, proposes removal, user approves
- **Tier 3 (Manual):** User runs `co forget <file>` to zero weights directly

The three tiers form a complete recovery hierarchy:
1. Tier 1 (this story): Automatic weight adjustment and stale flagging
2. Tier 2 (Epic 7): AI-powered diagnostics with human approval
3. Tier 3 (Epic 6): Direct user intervention

### References

- [Source: architecture.md#Core Architectural Decisions] — AD-02, AD-03, AD-04, AD-05
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — Naming, structure, format, error handling patterns
- [Source: architecture.md#Complete Project Directory Structure] — `src/learner/weight-correction.ts`
- [Source: architecture.md#Project Structure & Boundaries] — Learner read-write access to patterns.json, dependency-graph.json
- [Source: prd.md#Knowledge Learner] — KL-06 (self-correcting weights), KL-07 (stale entry decay)
- [Source: prd.md#Schema Definitions] — patterns.json `decayFactor` field, dependency-graph.json edge schema
- [Source: epics.md#Story 3.3] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- No errors encountered during implementation

### Completion Notes List
- Implemented `correctWeights()` — classifies predicted files as true/false positives, applies proportional boost/decay based on confidence
- Implemented `applyWeightCorrections()` — updates learner-discovered edges in dependency graph; scanner edges never modified
- Implemented `applyWeightToPatterns()` — adjusts co-occurrence decayFactor (boost: ×1.1, decay: ×0.9) and type affinity weights directly
- Implemented `decayStaleEntries()` — builds lastSeenMap from task history, applies multiplicative decay (0.85^n) past threshold, flags fully stale entries for Doctor
- Implemented `runWeightCorrection()` — orchestrates the full pipeline (correctWeights → applyWeightCorrections → applyWeightToPatterns → decayStaleEntries)
- Integrated into `captureOutcome()` with fail-open try/catch wrapping
- Added all types (WeightCorrection, StaleEntry, WeightCorrectionResult) and constants (BOOST_FACTOR, DECAY_FACTOR, etc.) to types.ts
- Exported all new functions and types through barrel files
- 23 new tests covering boost, decay, stale decay, pattern updates, integration, and fail-open; 537 total tests pass with zero regressions

### Change Log
- 2026-03-05: Implemented Story 3.3 — self-correcting weights and stale decay (all 14 tasks)
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean

### File List
- src/learner/weight-correction.ts (modified — full implementation of weight correction pipeline)
- src/learner/knowledge-learner.ts (modified — integrated runWeightCorrection() into captureOutcome())
- src/learner/types.ts (modified — added WeightCorrection, StaleEntry, WeightCorrectionResult types and all weight correction constants)
- src/learner/index.ts (modified — added new exports for weight correction)
- tests/learner/weight-correction.test.ts (new — 23 tests covering all acceptance criteria)
