# AGENTS.md

Instructions for AI agents working on the Paperize codebase.

## Project Overview

Paperize is a CLI that distills unstructured text sources (notes, markdown, research) into qualified goals via AI. It has an interactive TUI (Ink/React) and a headless mode. Output: JSON, markdown, or YAML.

See `CLAUDE.md` for build commands and architecture details. See `doc/ROADMAP.md` for planned features.

## Stack

- **Runtime**: Node.js 20+, ESM
- **UI**: Ink 6 + React 19 (terminal UI)
- **Build**: esbuild → single `dist/cli.mjs` bundle
- **Test**: `node:test` (built-in runner), no framework deps
- **Lint/Format**: ESLint 9 flat config + Prettier
- **AI**: Anthropic Messages API (direct `fetch`, no SDK)

## Code Conventions

- JSX for Ink components (`.jsx`), plain JS for logic (`.js`)
- No TypeScript — plain JavaScript with JSDoc annotations where helpful
- Functional style: no classes. Logic files export pure functions.
- Components are one per file, named `Step<Name>.jsx`
- Logic lives in `src/logic/`, components in `src/components/`
- Single entry point: `src/cli.jsx` routes to `<App>` (interactive) or `runHeadless()` (headless)

## State Machine

The interactive app flows through steps. Each step is a React component that calls `onComplete(data)` to advance:

```
SOURCE → SCAN → CONTEXT → ANALYZE → GOALS → DONE
```

State lives in `src/app.jsx` as `useState` hooks. No external state management.

## Analysis Pipeline

Two modes, auto-selected by total char count:

- **Single-shot** (< 150K chars): one API call, `SINGLE_SHOT_SYSTEM` prompt
- **Map-reduce** (>= 150K chars):
  1. `buildBatches()` splits files into ~100K char batches
  2. Phase 1: `EXTRACT_SYSTEM` prompt per batch (parallel, up to 3)
  3. Phase 2: `SYNTHESIZE_SYSTEM` prompt on merged ideas

Each API call uses `callClaudeWithTicker()` which wraps the call with a 1-second timer emitting `onStatus` events for UI progress.

### Prompt Design Rules

- All prompts end with "You MUST respond with a valid JSON array"
- Prompts explicitly handle multilingual content (German, English, etc.)
- Response parsing: `parseIdeasJson()` and `parseGoalsJson()` extract JSON from markdown fences or raw text
- When 0 ideas are extracted, the raw AI response is logged for debugging

## Scanner

`src/logic/scan.js` — recursive file discovery with two paths:

1. **Node.js path**: `readdir` + `readFile` (default)
2. **Shell fallback**: `find` + `cat` via `execSync` (when Node.js is blocked by macOS TCC on iCloud/protected dirs)

Key constants: `SUPPORTED_EXTENSIONS`, `SKIP_DIRS`, `MAX_FILE_SIZE` (512 KB).

## Progress Callbacks

The analysis pipeline uses two callback patterns:

- `onProgress(line: string)` — permanent log lines (batch results, phase headers)
- `onStatus({ phase, label, elapsed })` — ephemeral status (spinner/ticker during API calls). Phase `'idle'` clears the status.

Both the Ink UI (`StepAnalyze.jsx`) and headless mode (`headless.js`) consume these differently — Ink renders React state, headless uses in-place terminal overwrite.

## Build Quirks

- esbuild banner injects `#!/usr/bin/env node` shebang + `createRequire` shim for CJS deps
- `react-devtools-core` aliased to `src/shims/empty.js` (Ink imports it, not needed in production)
- The bundle is a single ESM file — all deps are inlined

## Testing Guidelines

- Tests use `node:test` + `node:assert` (no external test framework)
- Test files: `*.test.js` next to the module they test
- Current coverage: `scan.test.js` (12 tests: scanDirectory, buildDocument, buildBatches, summarizeScan)
- Use `tmpdir` + real filesystem for scan tests (not mocks)
- For analyze tests: inject a mock `callFn` or intercept `fetch` — don't call the real API

## File Layout

```
paperize/
├── AGENTS.md              # You are here
├── CLAUDE.md              # Claude Code instructions
├── CHANGELOG.md           # Version history
├── LICENSE                # MIT
├── README.md              # Public-facing docs
├── package.json           # @yesterday-ai/paperize
├── esbuild.config.mjs     # Build config
├── eslint.config.mjs      # Lint config
├── .prettierrc             # Format config
├── .gitignore
├── doc/
│   └── ROADMAP.md         # Feature roadmap (v0.2–v0.5)
├── src/
│   ├── cli.jsx            # Entry point + flag parsing
│   ├── app.jsx            # Ink state machine
│   ├── headless.js        # Non-interactive mode
│   ├── shims/
│   │   └── empty.js       # Empty shim for react-devtools-core
│   ├── components/
│   │   ├── Header.jsx     # Progress bar with step labels
│   │   ├── StepSource.jsx # Folder input
│   │   ├── StepScan.jsx   # File discovery + strategy preview
│   │   ├── StepContext.jsx # Optional guiding context
│   │   ├── StepAnalyze.jsx# AI analysis with live progress
│   │   ├── StepGoals.jsx  # Multi-select goal reviewer
│   │   └── StepDone.jsx   # Output summary
│   └── logic/
│       ├── scan.js        # File scanner + batching
│       ├── scan.test.js   # Scanner tests (12)
│       └── analyze.js     # AI pipeline (extract → synthesize)
└── dist/
    └── cli.mjs            # Built bundle
```

## Do's and Don'ts

**Do:**
- Keep the single-bundle architecture — everything bundles into one `dist/cli.mjs`
- Use `onProgress` / `onStatus` for any long-running operation
- Test with real filesystem fixtures in `tmpdir`, not mocks, for scan logic
- Support both interactive and headless modes for every feature
- Handle multilingual content in prompts (user's vault may be mixed German/English)

**Don't:**
- Add Python dependencies — stay pure Node.js
- Add TypeScript — the project uses plain JS intentionally
- Use external test frameworks (jest, vitest, mocha) — `node:test` is sufficient
- Call the real Anthropic API in tests
- Assume TTY availability — headless mode must work in pipes and CI
