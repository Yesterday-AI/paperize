# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Paperize is a CLI that ingests unstructured information sources (folders of text files, markdown, notes, etc.) and uses AI to distill them into qualified goals. Each goal has a title and description (max 2000 words).

## Commands

```bash
npm run build       # esbuild: src/cli.jsx → dist/cli.mjs (single ESM bundle)
npm test            # node --test src/logic/*.test.js
node dist/cli.mjs   # Run built CLI

# Headless mode
node dist/cli.mjs --source ~/notes --output goals.json
node dist/cli.mjs --source ~/notes --dry-run
node dist/cli.mjs --source ~/notes --context "SaaS ideas" --model claude-opus-4-6
node dist/cli.mjs --source ~/notes --format yaml --output goals.yaml
```

## Architecture

**Ink/React CLI** — Same TUI architecture as Clipper. React state machine rendered in the terminal via Ink 6 + React 19. Wizard flows: SOURCE → SCAN → CONTEXT → ANALYZE → GOALS → DONE.

**Build** — esbuild bundles all JSX + deps into a single `dist/cli.mjs`. Banner injects shebang and `createRequire` shim for CJS dependencies. `react-devtools-core` aliased to empty shim.

### Source Layout

- `src/cli.jsx` — Entry point, CLI flag parsing, routes to `<App>` (interactive) or `runHeadless()`
- `src/app.jsx` — Main state machine, step transitions
- `src/headless.js` — Non-interactive mode: scans, analyzes, outputs with plain stdout
- `src/components/Header.jsx` — Progress bar (Step N of Total)
- `src/components/StepSource.jsx` — Source folder input
- `src/components/StepScan.jsx` — File scanning with spinner + summary
- `src/components/StepContext.jsx` — Optional guiding context input
- `src/components/StepAnalyze.jsx` — AI analysis with spinner + progress log
- `src/components/StepGoals.jsx` — Goal review with multi-select (toggle/confirm/cancel)
- `src/components/StepDone.jsx` — Output summary, writes file
- `src/logic/scan.js` — Recursive file discovery, content extraction, batching
- `src/logic/analyze.js` — Map-reduce goal generation pipeline (Claude API)

### Key Concepts

- **Headless mode** — When `--source` is provided, CLI skips the Ink wizard and runs via `src/headless.js`
- **Dry run** — `--dry-run` scans and shows file summary without calling the AI
- **Goal format** — Each goal is `{ title, description }`. Title is concise (~80 chars), description includes context, scope, and success criteria
- **Guiding context** — Optional prompt that steers the AI toward specific themes or domains
- **Output formats** — JSON (default), markdown, or YAML

### Analysis Pipeline

Automatically selects strategy based on source size:

- **Small sources (< 150K chars)** — Single-shot: all files combined into one document, one API call
- **Large sources (> 150K chars)** — Map-reduce:
  1. Files split into ~100K char batches
  2. Phase 1: Extract ideas from each batch (parallel, up to 3 concurrent calls)
  3. Phase 2: Synthesize extracted ideas into coherent goals (single call)

### Scan Logic

- Supported extensions: `.md`, `.txt`, `.text`, `.markdown`, `.org`, `.rst`, `.adoc`, `.csv`, `.json`, `.yaml`, `.yml`, `.xml`, `.html`, `.htm`
- Skips: hidden dirs, `node_modules`, `.obsidian`, `.trash`, `__pycache__`
- Max 512 KB per file, no file count limit
- Results sorted by relative path for deterministic output
- `buildBatches()` splits files into ~100K char batches for map-reduce
