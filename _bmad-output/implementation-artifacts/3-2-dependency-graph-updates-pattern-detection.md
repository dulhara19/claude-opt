# Story 3.2: Dependency Graph Updates & Pattern Detection

Status: done
Epic: 3 - Learning & Self-Improvement
Story: 3.2
Date: 2026-03-04
Complexity: Medium-High
Estimated Scope: Dependency graph learning edges, co-occurrence detection, task-type-to-file affinity, convention discovery

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the optimizer to discover new file relationships and patterns from each task,
So that predictions improve through real usage data, not just static analysis.

## Acceptance Criteria (BDD)

### AC1: Dependency Graph Updates with Discovered Edges
**Given** Claude used files [B, C, D] during a task but the dependency graph had no edge between C and D
**When** the Learner updates the dependency graph
**Then** a new edge is added between C and D (discovered co-usage relationship)
**And** dependency-graph.json is updated via the store module
**And** the new edge has a lower initial weight than statically-discovered edges (import-based)

### AC2: Co-Occurrence Pattern Detection
**Given** files [auth.ts, middleware.ts] appear together in 5+ task outcomes
**When** the pattern detector runs
**Then** a co-occurrence pattern is detected and stored in patterns.json
**And** the pattern includes: file pair, occurrence count, and confidence score
**And** the File Predictor can use this pattern for co-occurrence boosting in future tasks

### AC3: Task-Type-to-File Affinity Detection
**Given** tasks of type `bugfix` consistently use files in the `tests/` directory
**When** the pattern detector analyzes task-type-to-file affinity
**Then** a type-file affinity pattern is detected (bugfix -> test files)
**And** future bugfix tasks will have test files boosted in predictions

### AC4: Convention Pattern Detection
**Given** Claude consistently follows a convention (e.g., "imports use .js extension", "components use default exports")
**When** the Learner detects recurring conventions across tasks
**Then** new conventions are stored in the patterns.json conventions section
**And** the Prompt Compressor can inject these conventions in future sessions

### AC5: Fail-Open Error Handling
**Given** the pattern detector encounters an error during graph update or pattern detection
**When** `withFailOpen()` catches the error
**Then** the task still completes successfully — pattern detection failure never blocks the user
**And** the error is logged for later Doctor analysis

## Tasks / Subtasks

- [x] Task 1: Implement dependency graph update logic in `knowledge-learner.ts` (AC: #1)
  - [x] Create `updateDependencyGraph()` function accepting `actualFiles: string[]` from the task outcome
  - [x] Read current dependency-graph.json via `readDependencyGraph()` from store
  - [x] For each pair of files in `actualFiles`, check if an edge already exists
  - [x] For each missing pair, create a new edge with:
    - `type: "cooccurrence"` (distinguishing from `"import"` edges created by Scanner)
    - `weight: 0.3` (lower initial weight than static import edges which default to 1.0)
    - `discoveredBy: "learner"`
  - [x] For existing co-occurrence edges, increment weight by 0.1 (capped at 0.9, never reaching import-level 1.0)
  - [x] Update the adjacency lists to include new edges in both `out` and `in` arrays (undirected for co-occurrence)
  - [x] Write updated graph via `writeDependencyGraph()` from store
  - [x] Normalize all file paths with `toInternal()` before storing

- [x] Task 2: Implement `pattern-detector.ts` core structure (AC: #2, #3, #4)
  - [x] Create `PatternDetector` class or set of functions in `src/learner/pattern-detector.ts`
  - [x] Define `detectPatterns()` entry function accepting task history entries and current patterns
  - [x] Implement three detection passes called sequentially:
    1. `detectCoOccurrences()` — file pair frequency analysis
    2. `detectTypeAffinities()` — task-type-to-file correlation
    3. `detectConventions()` — recurring convention extraction
  - [x] Return a combined `PatternDetectionResult` with updates for each category

- [x] Task 3: Implement co-occurrence detection in `pattern-detector.ts` (AC: #2)
  - [x] Read recent task history entries (last N tasks, configurable, default 50)
  - [x] For each task, extract the list of actual files used
  - [x] Build a file-pair frequency map: count how often each pair of files appears together
  - [x] Threshold for pattern creation: 5+ co-occurrences (configurable via `CO_OCCURRENCE_THRESHOLD`)
  - [x] For qualifying pairs, create or update a co-occurrence entry in patterns.json:
    - `id`: `co_{sequence}` format
    - `files`: [fileA, fileB] (sorted alphabetically for consistency)
    - `frequency`: occurrence count
    - `confidence`: `frequency / totalTasksAnalyzed` (capped at 1.0)
    - `lastSeen`: timestamp of most recent co-occurrence
    - `discoveredAt`: timestamp of first detection (only set on creation)
    - `decayFactor`: 1.0 (fresh pattern, no decay yet)
  - [x] For existing co-occurrence patterns, update `frequency`, `confidence`, and `lastSeen`
  - [x] Write updated patterns via `writePatterns()` from store

- [x] Task 4: Implement task-type-to-file affinity detection in `pattern-detector.ts` (AC: #3)
  - [x] Group recent task history entries by classification type (bugfix, feature, refactor, etc.)
  - [x] For each task type, count how often each file appears in that type's outcomes
  - [x] Calculate affinity weight: `fileOccurrencesInType / totalTasksOfType` (0.0-1.0)
  - [x] Threshold for affinity creation: file appears in 3+ tasks of that type AND weight >= 0.3
  - [x] For qualifying type-file affinities, update `typeAffinities` in patterns.json:
    - Key: task type string (e.g., "bugfix")
    - Value: object mapping file paths to `{ weight, occurrences }`
  - [x] Merge new affinities with existing, recalculating weights

- [x] Task 5: Implement convention detection in `pattern-detector.ts` (AC: #4)
  - [x] Analyze adapter output across recent tasks for recurring patterns
  - [x] Detect conventions from file naming patterns (e.g., test file co-location pattern)
  - [x] Detect conventions from import patterns observed in actual files (e.g., `.js` extension usage)
  - [x] Threshold for convention creation: pattern observed in 5+ tasks with confidence >= 0.7
  - [x] For qualifying conventions, create or update entries in patterns.json conventions array:
    - `id`: `conv_{sequence}` format
    - `pattern`: human-readable description of the convention
    - `confidence`: proportion of tasks where convention holds
    - `evidenceCount`: number of tasks providing evidence
    - `examples`: array of example file paths demonstrating the convention
  - [x] Avoid duplicate conventions — match on `pattern` field similarity

- [x] Task 6: Integrate pattern detection into `captureOutcome()` flow (AC: #1, #2, #3, #4, #5)
  - [x] In `knowledge-learner.ts`, after writing the task history entry (Story 3.1):
    - Call `updateDependencyGraph(actualFiles)` with files from the outcome
    - Call `detectPatterns(recentHistory, currentPatterns)` from pattern-detector
    - Write updated patterns to store if any changes detected
  - [x] Wrap all pattern detection calls with try/catch for fail-open behavior
  - [x] Log pattern detection results at debug level
  - [x] Ensure total capture time (including pattern detection) stays within <500ms budget

- [x] Task 7: Wire pattern-detector exports through barrel (AC: #2, #3, #4)
  - [x] Export `detectPatterns` from `src/learner/pattern-detector.ts`
  - [x] Re-export types (`PatternDetectionResult`, `CoOccurrence`, `TypeAffinity`, `Convention`) from `src/learner/index.ts`
  - [x] Ensure types align with patterns.json schema from PRD

- [x] Task 8: Write unit tests for dependency graph updates (AC: #1)
  - [x] Create `tests/learner/pattern-detector.test.ts`
  - [x] Test: new co-occurrence edge added when no edge exists between files
  - [x] Test: new edge has `type: "cooccurrence"`, `weight: 0.3`, `discoveredBy: "learner"`
  - [x] Test: existing co-occurrence edge weight incremented by 0.1
  - [x] Test: co-occurrence edge weight capped at 0.9 (never reaches import-level 1.0)
  - [x] Test: existing import edges are NOT modified by the Learner
  - [x] Test: adjacency lists updated correctly for both directions
  - [x] Test: file paths normalized to POSIX before storing

- [x] Task 9: Write unit tests for co-occurrence detection (AC: #2)
  - [x] Test: no pattern created with fewer than 5 co-occurrences
  - [x] Test: pattern created at exactly 5 co-occurrences with correct fields
  - [x] Test: confidence calculated correctly (frequency / totalTasks)
  - [x] Test: existing pattern updated with new frequency and lastSeen
  - [x] Test: file pair sorted alphabetically in pattern entry
  - [x] Test: decayFactor initialized to 1.0 for new patterns
  - [x] Test: pattern ID follows `co_{sequence}` format

- [x] Task 10: Write unit tests for task-type affinity detection (AC: #3)
  - [x] Test: bugfix tasks using test files creates bugfix->test affinity
  - [x] Test: affinity weight calculated correctly (occurrences / total tasks of type)
  - [x] Test: affinity not created below threshold (< 3 occurrences or weight < 0.3)
  - [x] Test: multiple task types tracked independently
  - [x] Test: existing affinities updated with recalculated weights

- [x] Task 11: Write unit tests for convention detection (AC: #4)
  - [x] Test: recurring test co-location pattern detected as convention
  - [x] Test: convention not created below threshold (< 5 tasks or confidence < 0.7)
  - [x] Test: convention includes examples array
  - [x] Test: duplicate conventions not created (pattern similarity check)
  - [x] Test: convention ID follows `conv_{sequence}` format

- [x] Task 12: Write integration test for full pattern detection flow (AC: #1, #2, #3, #4, #5)
  - [x] Build mock task history with 10+ entries spanning multiple task types
  - [x] Run full `detectPatterns()` flow
  - [x] Verify dependency graph has new co-occurrence edges
  - [x] Verify patterns.json has co-occurrence, affinity, and convention entries
  - [x] Verify fail-open behavior: inject error in pattern detection, confirm task completes
  - [x] Verify total execution time within budget

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-02 | Typed Pipeline — Learner reads `adapterResult.filesUsed` and `classification.type` from PipelineContext | [Source: architecture.md#Core Architectural Decisions] |
| AD-03 | Single Store Module — `readDependencyGraph()`, `writeDependencyGraph()`, `readPatterns()`, `writePatterns()`, `readTaskHistory()` from store | [Source: architecture.md#Core Architectural Decisions] |
| AD-04 | `withFailOpen()` — pattern detection wrapped so failure never blocks user | [Source: architecture.md#Core Architectural Decisions] |
| AD-05 | POSIX Internal paths — all file paths in dependency-graph.json and patterns.json stored as POSIX | [Source: architecture.md#Core Architectural Decisions] |
| AD-10 | Multi-Signal Weighted Scoring — the patterns produced here feed into signal source (4) co-occurrence boosting in the File Predictor | [Source: architecture.md#Core Architectural Decisions] |

### Module Access Matrix (Learner - Story 3.2 additions)

| Store File | Access | Operations |
|---|---|---|
| task-history.json | READ | Read recent entries for pattern analysis |
| dependency-graph.json | READ + WRITE | Read current graph; write new co-occurrence edges |
| patterns.json | READ + WRITE | Read current patterns; write new co-occurrences, affinities, conventions |
| project-map.json | READ only | Read file metadata for context |

### Key Types and Interfaces

**Dependency Graph Edge (from PRD schema):**
```typescript
interface DependencyEdge {
  source: string;                    // POSIX file path
  target: string;                    // POSIX file path
  type: 'import' | 'reference' | 'link' | 'cooccurrence';
  weight: number;                    // 0.0-1.0
  discoveredBy: 'scanner' | 'learner';
}
```

**Co-Occurrence Pattern (from patterns.json schema):**
```typescript
interface CoOccurrence {
  id: string;                        // "co_001"
  files: [string, string];           // Sorted POSIX paths
  frequency: number;                 // Times seen together
  confidence: number;                // 0.0-1.0
  lastSeen: string;                  // ISO 8601
  discoveredAt: string;              // ISO 8601
  decayFactor: number;               // 1.0 = fresh, decays toward 0
}
```

**Type Affinity (from patterns.json schema):**
```typescript
interface TypeAffinities {
  [taskType: string]: {
    [filePath: string]: {
      weight: number;                // 0.0-1.0
      occurrences: number;
    };
  };
}
```

**Convention (from patterns.json schema):**
```typescript
interface Convention {
  id: string;                        // "conv_001"
  pattern: string;                   // Human-readable description
  confidence: number;                // 0.0-1.0
  evidenceCount: number;
  examples: string[];                // Example file paths
}
```

**PatternDetectionResult (new in this story):**
```typescript
interface PatternDetectionResult {
  newCoOccurrences: CoOccurrence[];
  updatedCoOccurrences: CoOccurrence[];
  newAffinities: TypeAffinities;
  newConventions: Convention[];
  updatedConventions: Convention[];
}
```

### JSON Schema Examples

**dependency-graph.json (with learner-discovered edge):**
```json
{
  "schemaVersion": "1.0.0",
  "updatedAt": "2026-03-04T14:30:00Z",
  "edges": [
    {
      "source": "src/index.ts",
      "target": "src/analyzer.ts",
      "type": "import",
      "weight": 1.0,
      "discoveredBy": "scanner"
    },
    {
      "source": "src/auth.ts",
      "target": "src/middleware.ts",
      "type": "cooccurrence",
      "weight": 0.3,
      "discoveredBy": "learner"
    }
  ],
  "adjacency": {
    "src/auth.ts": {
      "out": ["src/middleware.ts"],
      "in": ["src/middleware.ts"]
    },
    "src/middleware.ts": {
      "out": ["src/auth.ts"],
      "in": ["src/auth.ts"]
    }
  }
}
```

**patterns.json (full example):**
```json
{
  "schemaVersion": "1.0.0",
  "coOccurrences": [
    {
      "id": "co_001",
      "files": ["src/auth.ts", "src/middleware.ts"],
      "frequency": 8,
      "confidence": 0.82,
      "lastSeen": "2026-03-04T14:00:00Z",
      "discoveredAt": "2026-03-01T10:00:00Z",
      "decayFactor": 1.0
    }
  ],
  "typeAffinities": {
    "bugfix": {
      "src/utils.ts": { "weight": 0.6, "occurrences": 5 },
      "tests/utils.test.ts": { "weight": 0.8, "occurrences": 7 }
    }
  },
  "conventions": [
    {
      "id": "conv_001",
      "pattern": "Test files co-located in __tests__/ subdirectory",
      "confidence": 0.92,
      "evidenceCount": 12,
      "examples": ["src/__tests__/analyzer.test.ts"]
    }
  ]
}
```

### Configurable Constants

```typescript
const CO_OCCURRENCE_THRESHOLD = 5;         // Minimum co-occurrences to create pattern
const AFFINITY_MIN_OCCURRENCES = 3;        // Minimum occurrences for type-file affinity
const AFFINITY_MIN_WEIGHT = 0.3;           // Minimum weight for affinity creation
const CONVENTION_MIN_EVIDENCE = 5;         // Minimum tasks for convention detection
const CONVENTION_MIN_CONFIDENCE = 0.7;     // Minimum confidence for convention creation
const LEARNER_EDGE_INITIAL_WEIGHT = 0.3;   // Initial weight for learner-discovered edges
const LEARNER_EDGE_INCREMENT = 0.1;        // Weight increment per additional co-occurrence
const LEARNER_EDGE_MAX_WEIGHT = 0.9;       // Cap for learner-discovered edge weights
const RECENT_HISTORY_WINDOW = 50;          // Number of recent tasks to analyze for patterns
```

These should be defined in `src/learner/types.ts` or a `src/learner/constants.ts` file and exported through the barrel.

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `pattern-detector.ts`, `knowledge-learner.ts` |
| Test files | kebab-case.test.ts | `tests/learner/pattern-detector.test.ts` |
| Functions | camelCase | `detectPatterns()`, `detectCoOccurrences()`, `updateDependencyGraph()` |
| Variables | camelCase | `filePairFrequency`, `coOccurrenceThreshold`, `typeAffinities` |
| Types/Interfaces | PascalCase | `CoOccurrence`, `TypeAffinities`, `Convention`, `PatternDetectionResult` |
| Constants | UPPER_SNAKE_CASE | `CO_OCCURRENCE_THRESHOLD`, `LEARNER_EDGE_INITIAL_WEIGHT` |
| Booleans | is/has/should prefix | `isNewEdge`, `hasExistingPattern`, `shouldCreateConvention` |
| JSON fields | camelCase | `coOccurrences`, `typeAffinities`, `discoveredBy`, `decayFactor` |
| IDs in JSON | entity prefix | `co_001` (co-occurrence), `conv_001` (convention) |

### Code Patterns (MUST FOLLOW)

**Result<T> Pattern:**
```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
```

**Co-occurrence Edge Weight Logic:**
```typescript
// New learner edge: always lower than scanner-discovered edges
const LEARNER_EDGE_INITIAL_WEIGHT = 0.3;

// Increment on repeated co-usage, but never reach import-level
function incrementEdgeWeight(currentWeight: number): number {
  return Math.min(currentWeight + LEARNER_EDGE_INCREMENT, LEARNER_EDGE_MAX_WEIGHT);
}
```

**File Pair Key (canonical form):**
```typescript
// Always sort alphabetically so [A,B] and [B,A] produce the same key
function filePairKey(fileA: string, fileB: string): string {
  const sorted = [fileA, fileB].sort();
  return `${sorted[0]}::${sorted[1]}`;
}
```

**Confidence Scores:** Always 0.0-1.0 float in data, convert to percentage only for display.

### Import Rules (MUST FOLLOW)

- Import from `store/` ONLY through barrel: `import { readDependencyGraph, writeDependencyGraph, readPatterns, writePatterns, readTaskHistory } from '../store/index.js';`
- Import shared types from `src/types/`: `import { type PipelineContext, type TaskType } from '../types/index.js';`
- Import utils: `import { toInternal, logger } from '../utils/index.js';`
- Internal learner imports: `pattern-detector.ts` may import from `./types.js` directly (same module)
- `knowledge-learner.ts` imports from `./pattern-detector.js` (same module internal import is allowed)
- Other modules import from `../learner/index.js` only

### Dependencies (Prerequisites)

| Dependency | Module | What This Story Needs |
|---|---|---|
| Story 1.1 | `src/utils/` | `toInternal()`, `withFailOpen()`, `logger` |
| Story 1.2 | `src/store/` | `readDependencyGraph()`, `writeDependencyGraph()`, `readPatterns()`, `writePatterns()`, `readTaskHistory()` |
| Story 3.1 | `src/learner/` | `captureOutcome()` integration point, `LearningOutcome` type, task-history entries written by 3.1 |
| Story 2.x | `src/analyzer/` | `ClassificationResult.type` for task-type affinity analysis |

### Performance Budget

- Dependency graph update: <50ms (single read + edge computation + single write)
- Co-occurrence detection: <100ms (iterate recent history, build frequency map)
- Type affinity detection: <50ms (group by type, count files)
- Convention detection: <100ms (analyze recent task outputs)
- Total pattern detection budget: <300ms (fits within overall <500ms capture budget from Story 3.1)

### Project Structure (Files Created/Modified by This Story)

```
src/learner/
├── index.ts                  # Updated: add pattern detection exports
├── types.ts                  # Updated: add CoOccurrence, TypeAffinities, Convention, PatternDetectionResult types
├── knowledge-learner.ts      # Updated: add updateDependencyGraph(), integrate detectPatterns() call
├── weight-correction.ts      # Placeholder (unchanged) — implemented in Story 3.3
└── pattern-detector.ts       # IMPLEMENTED: detectPatterns(), detectCoOccurrences(), detectTypeAffinities(), detectConventions()

tests/learner/
├── knowledge-learner.test.ts # Updated: add dependency graph update tests
└── pattern-detector.test.ts  # NEW: co-occurrence, affinity, convention detection tests
```

### What This Story Does NOT Create

- `weight-correction.ts` implementation — Story 3.3
- Self-correcting weights / boost-decay logic — Story 3.3
- Stale entry decay — Story 3.3
- Token tracking integration — Epic 4
- Doctor stale pattern analysis — Epic 7
- Prompt Compressor convention injection — Epic 2 (reads patterns.json)

### Design Notes

**Edge Weight Hierarchy:**
The system maintains a clear hierarchy of edge weights by discovery source:
- Scanner-discovered (import) edges: weight 1.0 (highest confidence)
- Learner-discovered (co-occurrence) edges: weight 0.3-0.9 (usage-based, grows with evidence)
This ensures static analysis always has higher baseline confidence than learned patterns, but repeated usage can close the gap.

**Pattern vs Edge:**
Co-occurrence patterns in patterns.json and co-occurrence edges in dependency-graph.json serve different purposes:
- Edges: used by the File Predictor's graph traversal signal (signal source 2)
- Patterns: used by the File Predictor's co-occurrence boosting signal (signal source 4)
Both are updated from the same task outcome data but through separate code paths.

### References

- [Source: architecture.md#Core Architectural Decisions] — AD-02, AD-03, AD-04, AD-05, AD-10
- [Source: architecture.md#Implementation Patterns & Consistency Rules] — Naming, structure, format patterns
- [Source: architecture.md#Complete Project Directory Structure] — `src/learner/pattern-detector.ts`
- [Source: architecture.md#Project Structure & Boundaries] — Learner has read-write access to dependency-graph.json and patterns.json
- [Source: prd.md#Knowledge Learner] — KL-03, KL-04 requirements
- [Source: prd.md#Schema Definitions] — dependency-graph.json, patterns.json schemas with examples
- [Source: epics.md#Story 3.2] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- No errors encountered during implementation

### Completion Notes List
- Implemented `updateDependencyGraph()` in knowledge-learner.ts with co-occurrence edge creation, weight increment (capped at 0.9), and bidirectional adjacency list updates
- Created full `pattern-detector.ts` with three detection passes: co-occurrence (5+ threshold), task-type affinity (3+ occurrences, 0.3+ weight), and convention detection (5+ evidence, 0.7+ confidence)
- Integrated pattern detection into `captureOutcome()` with try/catch fail-open wrapping
- Extended store types: `DependencyEdge` (weight, discoveredBy), `CoOccurrence` (id, frequency, lastSeen, discoveredAt, decayFactor), `TypeAffinity` (fileWeights), `Convention` (id, confidence, evidenceCount) — all backward-compatible with optional fields
- Added learner constants (thresholds, weights) and `PatternDetectionResult`/`TypeAffinities` types
- Wired all exports through barrel files
- 28 new tests covering all ACs; 514 total tests pass with zero regressions

### Change Log
- 2026-03-05: Implemented Story 3.2 — dependency graph updates and pattern detection (all 12 tasks)
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean

### File List
- src/learner/pattern-detector.ts (new — full pattern detection implementation)
- src/learner/knowledge-learner.ts (modified — added updateDependencyGraph(), integrated pattern detection into captureOutcome())
- src/learner/types.ts (modified — added PatternDetectionResult, TypeAffinities, and all learner constants)
- src/learner/index.ts (modified — added new exports for pattern detection)
- src/types/store.ts (modified — extended DependencyEdge, CoOccurrence, TypeAffinity, Convention with new optional fields)
- src/types/index.ts (modified — added TypeAffinityEntry export)
- tests/learner/pattern-detector.test.ts (new — 28 tests for all acceptance criteria)
