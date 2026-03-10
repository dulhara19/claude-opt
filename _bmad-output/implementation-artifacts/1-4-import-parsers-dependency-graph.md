# Story 1.4: Import Parsers & Dependency Graph

Status: done
Epic: 1 - Project Initialization & Scanning
Story: 1.4
Date: 2026-03-04
Complexity: Large
Estimated Scope: Parser extensibility system, TS/JS import parser, Markdown heading/link parser, Python import parser, dependency graph builder, keyword extractor, keyword-index.json and dependency-graph.json generation

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want the optimizer to understand file relationships through import analysis and keyword extraction,
So that it can predict related files and traverse the dependency graph when I describe a task.

## Acceptance Criteria (BDD)

### AC1: TypeScript/JavaScript Import Parsing
**Given** a TypeScript/JavaScript project
**When** the import parser processes source files
**Then** all `import` and `require` statements are parsed
**And** resolved to relative file paths within the project
**And** external package imports are identified but not included in the dependency graph

### AC2: Markdown Heading & Link Parsing
**Given** a markdown-heavy project (research, thesis, documentation)
**When** the markdown parser processes `.md` files
**Then** heading structure (H1, H2+) is extracted
**And** internal links (`[text](path)`) and reference-style links are parsed
**And** cross-document references are identified as dependency edges

### AC3: Parser Extensibility
**Given** a new language parser needs to be added (e.g., Python)
**When** a contributor implements the `ImportParser` interface
**Then** they only need to create one file in `src/scanner/parsers/`
**And** register it in the parser registry
**And** the scanner automatically uses it for matching file extensions

### AC4: Dependency Graph Generation
**Given** parsed imports from all files
**When** the dependency graph builder runs
**Then** a directed graph is created with edges from importing file to imported file
**And** the graph is stored as adjacency lists in dependency-graph.json via the store module

### AC5: Keyword Extraction & Index
**Given** the keyword extractor runs on project files
**When** processing file content and file names
**Then** meaningful keywords are extracted (identifiers, function names, class names, heading text)
**And** a bidirectional keyword-to-file index is stored in keyword-index.json via the store module

## Tasks / Subtasks

- [x] Task 1: Define parser interface and registry in `src/scanner/parsers/index.ts` (AC: #3)
  - [x] Define `ImportParser` interface:
    ```typescript
    interface ImportParser {
      /** File extensions this parser handles (e.g., ['.ts', '.tsx', '.js', '.jsx']) */
      extensions: string[];
      /** Parse imports/references from file content */
      parseImports(filePath: string, content: string, projectRoot: string): ParsedImport[];
      /** Extract keywords from file content */
      extractKeywords(filePath: string, content: string): string[];
    }
    ```
  - [x] Define `ParsedImport` interface:
    ```typescript
    interface ParsedImport {
      /** The raw import specifier as written in source */
      raw: string;
      /** Resolved relative POSIX path within project (null for external packages) */
      resolved: string | null;
      /** Whether this is an external package import */
      isExternal: boolean;
      /** Type of import relationship */
      type: 'import' | 'require' | 'reference' | 'link';
    }
    ```
  - [x] Implement parser registry:
    ```typescript
    const parserRegistry: Map<string, ImportParser> = new Map();
    function registerParser(parser: ImportParser): void;
    function getParserForFile(filePath: string): ImportParser | null;
    ```
  - [x] Register built-in parsers: TypeScript, Markdown, Python

- [x] Task 2: Implement TypeScript/JavaScript import parser in `src/scanner/parsers/typescript.ts` (AC: #1)
  - [x] Implement `TypeScriptParser` conforming to `ImportParser` interface
  - [x] Parse ES module imports: `import { x } from './path'`, `import x from './path'`, `import './path'`
  - [x] Parse dynamic imports: `import('./path')`
  - [x] Parse CommonJS requires: `require('./path')`, `const x = require('./path')`
  - [x] Parse re-exports: `export { x } from './path'`, `export * from './path'`
  - [x] Use regex-based parsing (no AST needed — fast, lightweight):
    ```typescript
    // ES import/export patterns
    /(?:import|export)\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g
    // Dynamic import
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    // CommonJS require
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
    ```
  - [x] Resolve relative imports to project file paths:
    - `./foo` -> try `foo.ts`, `foo.tsx`, `foo/index.ts`, `foo.js`, `foo/index.js`
    - `../bar` -> resolve relative then try extensions
  - [x] Identify external package imports (no `.` or `..` prefix) — set `isExternal: true`
  - [x] Extract keywords: exported function names, class names, interface names, type names
    - Use regex: `/export\s+(?:default\s+)?(?:function|class|interface|type|const|let|var|enum)\s+(\w+)/g`
  - [x] Register for extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`

- [x] Task 3: Implement Markdown heading/link parser in `src/scanner/parsers/markdown.ts` (AC: #2)
  - [x] Implement `MarkdownParser` conforming to `ImportParser` interface
  - [x] Parse heading structure:
    - H1: `/^#\s+(.+)$/m` — document title
    - H2+: `/^#{2,6}\s+(.+)$/gm` — section headings
  - [x] Parse internal links: `/\[([^\]]+)\]\(([^)]+)\)/g`
    - Resolve relative paths to project files
    - Skip external URLs (http://, https://)
  - [x] Parse reference-style links: `/\[([^\]]+)\]:\s*(\S+)/g`
  - [x] Create dependency edges for cross-document references (internal links between .md files)
  - [x] Extract keywords from headings text and bold text (`**keyword**`)
  - [x] Register for extensions: `.md`, `.mdx`

- [x] Task 4: Implement Python import parser in `src/scanner/parsers/python.ts` (AC: #3)
  - [x] Implement `PythonParser` conforming to `ImportParser` interface
  - [x] Parse Python imports:
    - `import module` pattern: `/^import\s+(\S+)/gm`
    - `from module import ...` pattern: `/^from\s+(\S+)\s+import/gm`
  - [x] Resolve relative imports (dot notation):
    - `from . import foo` -> sibling module
    - `from ..utils import bar` -> parent module
  - [x] Identify external package imports (no dot prefix)
  - [x] Extract keywords: function/class definitions
    - `/(?:def|class)\s+(\w+)/g`
  - [x] Register for extensions: `.py`
  - [x] Note: This parser demonstrates extensibility — the pattern makes adding Go, Rust, etc. straightforward

- [x] Task 5: Implement dependency graph builder in `src/scanner/dependency-graph.ts` (AC: #4)
  - [x] Implement `buildDependencyGraph(projectRoot: string, projectMap: ProjectMap, parsers: ParserRegistry): Result<DependencyGraph>`
  - [x] For each file in project map:
    - Get the appropriate parser via `getParserForFile()`
    - Read file content
    - Call `parser.parseImports()` to get parsed imports
    - Create edges for resolved internal imports
  - [x] Build edge list:
    ```typescript
    interface DependencyEdge {
      source: string;     // POSIX relative path of importing file
      target: string;     // POSIX relative path of imported file
      type: 'import' | 'reference' | 'link' | 'cooccurrence';
      weight: 1.0;        // Default weight, learner adjusts later
      discoveredBy: 'scanner';
    }
    ```
  - [x] Build adjacency map for O(1) lookups:
    ```typescript
    adjacency: {
      [filePath: string]: {
        out: string[];  // files this file imports
        in: string[];   // files that import this file
      }
    }
    ```
  - [x] Write dependency-graph.json via `writeDependencyGraph()` from store module
  - [x] Skip files with no parser or unparseable content (fail-open)

- [x] Task 6: Implement keyword extractor in `src/scanner/keyword-extractor.ts` (AC: #5)
  - [x] Implement `buildKeywordIndex(projectRoot: string, projectMap: ProjectMap, parsers: ParserRegistry): Result<KeywordIndex>`
  - [x] For each file in project map:
    - Extract keywords from file name (split on `-`, `_`, `.`, camelCase boundaries)
    - Get the appropriate parser via `getParserForFile()`
    - If parser exists: call `parser.extractKeywords()` for content-based keywords
    - Filter out noise: common words, single characters, numbers-only
  - [x] Build bidirectional index:
    ```typescript
    keywordToFiles: { [keyword: string]: string[] }   // keyword -> list of file paths
    fileToKeywords: { [filePath: string]: string[] }   // file -> list of keywords
    ```
  - [x] Normalize keywords: lowercase, trim whitespace
  - [x] Write keyword-index.json via `writeKeywordIndex()` from store module

- [x] Task 7: Integrate parsers with scanner (AC: #1, #2, #4, #5)
  - [x] Update `src/scanner/scanner.ts` to call dependency graph builder after file walking
  - [x] Update `src/scanner/scanner.ts` to call keyword extractor after file walking
  - [x] Update `src/scanner/index.ts` to export `buildDependencyGraph` and `buildKeywordIndex`
  - [x] Update `ScanResult` type to include `dependencyEdges: number` and `keywordsExtracted: number`
  - [x] Ensure parsers run within the scan timing budget

- [x] Task 8: Update FileEntry with keywords and headings (AC: #2, #5)
  - [x] During scanning, populate `FileEntry.keywords` field from keyword extractor
  - [x] For markdown files, populate `FileEntry.headings` field from markdown parser
  - [x] These fields were defined in Story 1.2's ProjectMap schema — now they get populated

- [x] Task 9: Write tests (AC: #1, #2, #3, #4, #5)
  - [x] Create `tests/scanner/typescript-parser.test.ts`
    - [x] Test ES import parsing: named, default, namespace, side-effect imports
    - [x] Test dynamic import parsing
    - [x] Test CommonJS require parsing
    - [x] Test re-export parsing
    - [x] Test relative path resolution with extension fallbacks
    - [x] Test external package identification
    - [x] Test keyword extraction from TypeScript exports
  - [x] Create `tests/scanner/markdown-parser.test.ts`
    - [x] Test heading extraction (H1, H2-H6)
    - [x] Test internal link parsing
    - [x] Test reference-style link parsing
    - [x] Test external URL filtering (skip http://)
    - [x] Test keyword extraction from headings
  - [x] Create `tests/scanner/python-parser.test.ts`
    - [x] Test `import module` parsing
    - [x] Test `from module import` parsing
    - [x] Test relative import resolution
    - [x] Test external package identification
  - [x] Create `tests/scanner/dependency-graph.test.ts`
    - [x] Test graph building from parsed imports
    - [x] Test adjacency list generation (out and in edges)
    - [x] Test external imports excluded from graph
    - [x] Test edge types correctly assigned
  - [x] Create `tests/scanner/keyword-extractor.test.ts`
    - [x] Test keyword extraction from file names
    - [x] Test keyword extraction from file content
    - [x] Test bidirectional index building
    - [x] Test keyword normalization (lowercase, dedup)
    - [x] Test noise word filtering
  - [x] Add/update test fixtures:
    - [x] `tests/fixtures/sample-project/src/index.ts` — add import statements
    - [x] `tests/fixtures/sample-project/src/utils.ts` — add exports
    - [x] `tests/fixtures/research-project/chapter-1.md` — add links and headings
  - [x] Verify all tests pass: `npm run test`

## Dev Notes

### Architecture Decisions to Follow

| Decision | Requirement | Source |
|---|---|---|
| AD-03 | Single Store Module — dependency graph and keyword index written via store module | [Source: architecture.md#Core Architectural Decisions] |
| AD-05 | POSIX Internal — all paths in edges and index use POSIX format | [Source: architecture.md#Core Architectural Decisions] |
| AD-06 | TypeScript Type Guards for validation | [Source: architecture.md#Core Architectural Decisions] |

### Scanner Requirements Mapping

| Requirement | Coverage in This Story | Source |
|---|---|---|
| SC-01 | Import parsing for JS/TS — full coverage | [Source: prd.md#Project Scanner] |
| SC-02 | Markdown heading/link parsing — full coverage | [Source: prd.md#Project Scanner] |
| SC-04 | Dependency graph generation — full coverage | [Source: prd.md#Project Scanner] |
| NF-06 | Extensible parser interface — full coverage | [Source: prd.md#Non-Functional Requirements] |

### Naming Conventions (MUST FOLLOW)

| Element | Convention | Example |
|---|---|---|
| Source files | kebab-case.ts | `typescript.ts`, `markdown.ts`, `dependency-graph.ts`, `keyword-extractor.ts` |
| Test files | kebab-case.test.ts | `tests/scanner/typescript-parser.test.ts` |
| Functions | camelCase | `parseImports()`, `buildDependencyGraph()`, `extractKeywords()` |
| Variables | camelCase | `parsedImport`, `adjacencyMap`, `keywordToFiles` |
| Types/Interfaces | PascalCase | `ImportParser`, `ParsedImport`, `DependencyEdge` |
| Constants | UPPER_SNAKE_CASE | `NOISE_WORDS`, `IMPORT_PATTERN` |
| Booleans | is/has/should/can prefix | `isExternal`, `hasParser` |
| JSON fields | camelCase | `discoveredBy`, `keywordToFiles`, `fileToKeywords` |
| Directories | kebab-case | `src/scanner/parsers/` |

[Source: architecture.md#Naming Patterns]

### Code Patterns (MUST FOLLOW)

**ImportParser Interface Pattern:**
```typescript
interface ImportParser {
  extensions: string[];
  parseImports(filePath: string, content: string, projectRoot: string): ParsedImport[];
  extractKeywords(filePath: string, content: string): string[];
}
```

**Parser Registration Pattern:**
```typescript
// src/scanner/parsers/index.ts
import { TypeScriptParser } from './typescript.js';
import { MarkdownParser } from './markdown.js';
import { PythonParser } from './python.js';

const parserRegistry = new Map<string, ImportParser>();

function registerParser(parser: ImportParser): void {
  for (const ext of parser.extensions) {
    parserRegistry.set(ext, parser);
  }
}

function getParserForFile(filePath: string): ImportParser | null {
  const ext = path.extname(filePath).toLowerCase();
  return parserRegistry.get(ext) ?? null;
}

// Register built-in parsers
registerParser(new TypeScriptParser());
registerParser(new MarkdownParser());
registerParser(new PythonParser());
```

**Import Resolution Pattern (TypeScript):**
```typescript
function resolveImport(importPath: string, sourceFile: string, projectRoot: string): string | null {
  if (!importPath.startsWith('.')) return null; // external

  const sourceDir = path.dirname(path.join(projectRoot, sourceFile));
  const basePath = path.resolve(sourceDir, importPath);
  const relativePath = toInternal(path.relative(projectRoot, basePath));

  // Try extensions: .ts, .tsx, .js, .jsx, /index.ts, /index.js
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
  for (const ext of extensions) {
    const candidate = relativePath + ext;
    if (existsSync(path.join(projectRoot, candidate))) {
      return candidate;
    }
  }
  // Try exact path (already has extension)
  if (existsSync(path.join(projectRoot, relativePath))) {
    return relativePath;
  }
  return null;
}
```

**Dependency Graph Building Pattern:**
```typescript
function buildDependencyGraph(
  projectRoot: string,
  projectMap: ProjectMap,
  parsers: ParserRegistry
): Result<DependencyGraph> {
  const edges: DependencyEdge[] = [];
  const adjacency: Record<string, { out: string[]; in: string[] }> = {};

  for (const [filePath, entry] of Object.entries(projectMap.files)) {
    const parser = getParserForFile(filePath);
    if (!parser) continue;

    const content = readFileSync(toOS(join(projectRoot, filePath)), 'utf-8');
    const imports = parser.parseImports(filePath, content, projectRoot);

    for (const imp of imports) {
      if (imp.isExternal || !imp.resolved) continue;

      edges.push({
        source: filePath,
        target: imp.resolved,
        type: imp.type === 'require' ? 'import' : imp.type,
        weight: 1.0,
        discoveredBy: 'scanner',
      });

      // Build adjacency
      if (!adjacency[filePath]) adjacency[filePath] = { out: [], in: [] };
      if (!adjacency[imp.resolved]) adjacency[imp.resolved] = { out: [], in: [] };
      adjacency[filePath].out.push(imp.resolved);
      adjacency[imp.resolved].in.push(filePath);
    }
  }

  const graph: DependencyGraph = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    edges,
    adjacency,
  };

  return writeDependencyGraph(projectRoot, graph);
}
```

**Result<T> Pattern:** All functions that can fail return `Result<T>`.

[Source: architecture.md#Format Patterns, architecture.md#Parser Boundary]

### JSON Schema References

**dependency-graph.json:**
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
    }
  ],
  "adjacency": {
    "src/index.ts": {
      "out": ["src/analyzer.ts", "src/router.ts"],
      "in": []
    },
    "src/analyzer.ts": {
      "out": ["src/classifier.ts"],
      "in": ["src/index.ts"]
    }
  }
}
```

**keyword-index.json:**
```json
{
  "schemaVersion": "1.0.0",
  "updatedAt": "2026-03-04T14:30:00Z",
  "keywordToFiles": {
    "auth": ["src/auth.ts", "src/middleware.ts", "tests/auth.test.ts"],
    "biomarker": ["docs/chapter-3.md", "docs/lit-notes/biomarkers.md"]
  },
  "fileToKeywords": {
    "src/auth.ts": ["auth", "login", "token", "session"],
    "docs/chapter-3.md": ["biomarker", "coral", "bleaching"]
  }
}
```

[Source: prd.md#Schema Definitions]

### Import Rules (MUST FOLLOW)

- Parsers are leaf modules: they receive file content and return parsed data. They do NOT access the store or other modules directly
- `dependency-graph.ts` and `keyword-extractor.ts` import from store for writing
- All parser files import from `parsers/index.ts` for the `ImportParser` interface
- Scanner orchestrates: calls parsers, then calls graph builder, then calls keyword extractor

[Source: architecture.md#Parser Boundary]

### Library Versions (Verified March 2026)

| Package | Version | Notes |
|---|---|---|
| Node.js built-ins | node:fs, node:path, node:crypto | File reading, path resolution |
| typescript | 5.9.3 | Strict mode enabled |
| vitest | 4.0.18 | Testing framework |

No external dependencies needed — all regex-based parsing. Parsers are deliberately lightweight (no AST libraries) to meet the <10s scan target.

### Project Structure Notes

This story creates the following files and directories:

```
claude-opt/
├── src/
│   └── scanner/
│       ├── parsers/
│       │   ├── index.ts          # UPDATED: ImportParser interface + registry (from placeholder)
│       │   ├── typescript.ts     # TS/JS import + keyword parser
│       │   ├── markdown.ts       # Markdown heading/link + keyword parser
│       │   └── python.ts         # Python import + keyword parser
│       ├── dependency-graph.ts   # Build directed graph from parsed imports
│       └── keyword-extractor.ts  # Build bidirectional keyword-to-file index
├── tests/
│   └── scanner/
│       ├── typescript-parser.test.ts
│       ├── markdown-parser.test.ts
│       ├── python-parser.test.ts
│       ├── dependency-graph.test.ts
│       └── keyword-extractor.test.ts
```

### What This Story Does NOT Create

- `src/scanner/starter-packs.ts` — Created in Story 1.6
- Incremental scanning / content hash comparison — Created in Story 1.5
- CLAUDE.md generation — Created in Story 1.5
- The `co init` or `co scan` CLI commands — Created in Story 1.6
- Co-occurrence edges in dependency graph — Created by Learner in Epic 3 (only scanner-discovered edges here)

### Dependencies on Previous Stories

- **Story 1.1 (Project Scaffold & Core Utilities):** This story depends on:
  - `src/utils/paths.ts` — `toInternal()`, `toOS()` for path normalization
  - `src/utils/errors.ts` — `ok()`, `err()`, `Result<T>` for error handling
  - `src/utils/logger.ts` — logging parser and graph building progress
  - `src/utils/constants.ts` — `SCHEMA_VERSION`

- **Story 1.2 (Knowledge Store I/O Layer):** This story depends on:
  - `src/store/index.ts` — `writeDependencyGraph()`, `writeKeywordIndex()` to persist results
  - `src/types/store.ts` — `DependencyGraph`, `DependencyEdge`, `KeywordIndex`, `ProjectMap`, `FileEntry` types

- **Story 1.3 (Project Scanner & File Map):** This story depends on:
  - `src/scanner/scanner.ts` — file walking, project map generation (parsers integrate with the scanner)
  - `src/scanner/types.ts` — `ScanResult`, `ScanOptions` types
  - `src/scanner/ignore.ts` — ignore pattern handling
  - `tests/fixtures/sample-project/` — test fixture for scanner integration tests

### References

- [Source: architecture.md#Core Architectural Decisions] — AD-03 (Store), AD-05 (Paths), AD-06 (Type Guards)
- [Source: architecture.md#Complete Project Directory Structure] — Parser file tree
- [Source: architecture.md#Project Structure & Boundaries] — Parser boundary, scanner boundary
- [Source: prd.md#Project Scanner] — SC-01, SC-02, SC-04 requirements
- [Source: prd.md#Non-Functional Requirements] — NF-06 (extensible parsers)
- [Source: prd.md#Schema Definitions] — dependency-graph.json and keyword-index.json schemas
- [Source: epics.md#Story 1.4] — Original story definition and acceptance criteria

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- All 150 tests pass (13 suites)
- TypeScript strict: zero errors
- ESLint: zero errors
- Build: clean CJS output

### Change Log
- 2026-03-05: Code review passed — all ESLint errors fixed, all tests passing, build clean

### Completion Notes List
- Task 1: Parser interface (ImportParser, ParsedImport) and registry with registerParser/getParserForFile in parsers/index.ts
- Task 2: TypeScriptParser — regex-based ES import/export, dynamic import, CommonJS require, extension resolution, keyword extraction from exports
- Task 3: MarkdownParser — inline links, reference-style links, heading/bold keyword extraction, external URL filtering
- Task 4: PythonParser — import/from-import parsing, dot-notation relative import resolution, def/class keyword extraction
- Task 5: buildDependencyGraph — reads files, calls parsers, builds edges + adjacency (imports/importedBy), writes via store
- Task 6: buildKeywordIndex — file name keyword extraction (camelCase/kebab split), content keywords via parsers, noise filtering, bidirectional index, writes via store
- Task 7: Scanner integration — scanProject calls buildDependencyGraph and buildKeywordIndex with withFailOpen; ScanResult extended with dependencyEdges and keywordsExtracted; scanner/index.ts exports new modules
- Task 8: FileEntry keywords populated via keyword extractor during scan
- Task 9: 57 new tests across 5 test files (typescript-parser, markdown-parser, python-parser, dependency-graph, keyword-extractor); updated test fixtures with imports/links

### File List
- src/scanner/parsers/index.ts (updated — interface + registry)
- src/scanner/parsers/typescript.ts (new)
- src/scanner/parsers/markdown.ts (new)
- src/scanner/parsers/python.ts (new)
- src/scanner/dependency-graph.ts (new)
- src/scanner/keyword-extractor.ts (new)
- src/scanner/scanner.ts (updated — integration)
- src/scanner/index.ts (updated — exports)
- src/scanner/types.ts (updated — ScanResult fields)
- tests/scanner/typescript-parser.test.ts (new)
- tests/scanner/markdown-parser.test.ts (new)
- tests/scanner/python-parser.test.ts (new)
- tests/scanner/dependency-graph.test.ts (new)
- tests/scanner/keyword-extractor.test.ts (new)
- tests/fixtures/sample-project/src/index.ts (updated)
- tests/fixtures/sample-project/src/utils.ts (updated)
- tests/fixtures/research-project/chapter-1.md (updated)
- tests/fixtures/research-project/chapter-2.md (updated)
