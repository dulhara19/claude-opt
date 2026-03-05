# claude-opt

Intelligent token optimizer for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Reduces context window usage through smart file prediction, prompt compression, and adaptive learning — so you get better results while spending fewer tokens.

## Features

- **Smart File Prediction** — Predicts which files Claude needs based on task type, dependency graphs, and co-occurrence patterns
- **Prompt Compression** — Strips filler words, redundant patterns, and injects only relevant context
- **Model Routing** — Selects the optimal Claude model (Opus/Sonnet/Haiku) based on task complexity
- **Adaptive Learning** — Tracks prediction accuracy and self-corrects weights over time
- **Token Budget Management** — Tracks usage, estimates remaining window, and warns before budget overruns
- **Project Scanning** — Builds a dependency graph, keyword index, and file map of your codebase
- **CLAUDE.md Generation** — Auto-generates project context files from scan results
- **Starter Packs** — Pre-built knowledge packs for common stacks (React, Node, Python, etc.)
- **Doctor & Diagnostics** — Health checks, accuracy reports, and supervised/autonomous fix modes
- **Inline Feedback** — Correct predictions on the fly with `co correct` and `co forget`

## Requirements

- Node.js >= 20

## Installation

```bash
npm install -g claude-opt
```

This makes two commands available globally: `claude-opt` and `co` (shorthand).

## Quick Start

```bash
# Initialize in your project directory
co init

# Run a task through the optimizer
co "add user authentication to the login page"

# Preview what the optimizer would do (no side effects)
co --dry-run "refactor the database layer"
```

## Commands

| Command | Description |
|---------|-------------|
| `co <task>` | Run the optimization pipeline for a task |
| `co init` | Initialize claude-opt in the current project |
| `co scan` | Re-scan project files (use `--full` for full rescan) |
| `co stats` | View prediction accuracy and usage statistics |
| `co budget` | View token budget status and consumption |
| `co knowledge` | Inspect the knowledge store contents |
| `co doctor` | Run diagnostics and health checks |
| `co config` | View and edit configuration |
| `co correct` | Provide feedback on the last prediction |
| `co forget <file>` | Remove a file from predictions |

## Global Options

| Flag | Description |
|------|-------------|
| `--verbose` | Enable debug-level output |
| `--quiet` | Suppress info-level output |
| `--dry-run` | Preview changes without writing |
| `--version` | Display version |
| `--help` | Display help |

## Configuration

```bash
# View current config
co config

# Set token budget (default: 44,000)
co config token-budget 60000

# Set budget window duration in hours (default: 5h)
co config window-duration 8

# Set inline warning threshold (0.0-1.0)
co config budget-warn-inline 0.7

# Set blocking warning threshold (0.0-1.0)
co config budget-warn-blocking 0.9

# Set doctor mode: supervised | autonomous
co config doctor-mode autonomous
```

## Doctor & Diagnostics

```bash
# Pre-flight health check
co doctor --checkup

# Full diagnostic report
co doctor

# Focus on a specific domain
co doctor --domain authentication

# Report only (no fix proposals)
co doctor --report-only

# Deep analysis with archived history
co doctor --deep
```

## How It Works

1. **Scan** — Parses your project to build a file map, dependency graph, and keyword index
2. **Classify** — Analyzes your task to determine type, complexity, and domain
3. **Predict** — Scores files by relevance using dependency signals, keyword matches, and learned patterns
4. **Route** — Selects the optimal Claude model based on task complexity
5. **Compress** — Strips unnecessary tokens and injects only relevant context
6. **Learn** — Tracks outcomes and adjusts prediction weights for future tasks

## Development

```bash
# Install dependencies
npm install

# Run in dev mode
npm run dev

# Build
npm run build

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run format
```

## Tech Stack

- **TypeScript** (strict mode) with Node.js >= 20
- **Commander.js** — CLI framework
- **Chalk** — Terminal styling
- **tsup** — Build tooling (esbuild-powered)
- **Vitest** — Testing framework

## License

ISC
