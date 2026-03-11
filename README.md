<p align="center">
  <h1 align="center">Paperize</h1>
  <p align="center">
    <strong>Distill unstructured sources into qualified goals via AI.</strong>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/paperize"><img src="https://img.shields.io/npm/v/paperize?color=cb3837&label=npm" alt="npm version"></a>
    <a href="https://github.com/Yesterday-AI/paperize/actions/workflows/ci.yml"><img src="https://github.com/Yesterday-AI/paperize/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node.js"></a>
  </p>
</p>

---

Point Paperize at a folder of notes, ideas, research, markdown files &mdash; and it generates actionable goals, ready for any project management system.

Works with Obsidian vaults, Zettelkasten collections, research dumps, brainstorm folders, or any pile of text files. Handles hundreds of files through an intelligent map-reduce pipeline that never truncates your content.

> **One command:** `npx paperize --source ~/notes`

<br>

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Quick Start](#quick-start)
- [Install](#install)
- [Usage](#usage)
  - [Headless mode (non-interactive)](#headless-mode-non-interactive)
  - [Interactive mode (TUI wizard)](#interactive-mode-tui-wizard)
- [How It Works](#how-it-works)
  - [Small sources (\< 150K chars)](#small-sources--150k-chars)
  - [Large sources (\> 150K chars)](#large-sources--150k-chars)
- [Goal Format](#goal-format)
  - [Output formats](#output-formats)
- [Options](#options)
  - [Source](#source)
  - [AI](#ai)
  - [Output](#output)
  - [Environment variables](#environment-variables)
- [Supported File Types](#supported-file-types)
- [Development](#development)
- [Architecture](#architecture)
- [License](#license)

<br>

## Quick Start

```sh
npx paperize --source ~/notes
```

That's it. Scans your folder, calls Claude, outputs goals as JSON.

Requires an `ANTHROPIC_API_KEY` &mdash; pass it inline or export it:

```sh
# Inline
ANTHROPIC_API_KEY=sk-ant-... npx paperize --source ~/notes

# Or export once
export ANTHROPIC_API_KEY=sk-ant-...
```

<br>

## Install

```sh
npx paperize              # run directly (no install)
npm i -g paperize         # or install globally -> paperize
```

Requires **Node.js 20+**.

<br>

## Usage

### Headless mode (non-interactive)

Pass `--source` to skip the wizard. No TTY required &mdash; fully scriptable.

```sh
# Scan and generate goals
paperize --source ~/notes

# Steer the AI with guiding context
paperize --source ~/research --context "Focus on SaaS product ideas"

# Read context from a file
paperize --source ~/research --context-file brief.md

# Save output in different formats
paperize --source ./ideas --output goals.json
paperize --source ./ideas --output goals.md --format markdown
paperize --source ./ideas --output goals.yaml --format yaml

# Dry run — scan only, no AI
paperize --source ~/notes --dry-run

# Use a different model
paperize --source ~/notes --model claude-opus-4-6
```

### Interactive mode (TUI wizard)

```sh
paperize
```

The wizard walks you through six steps:

```text
$ paperize

  Paperize — Goal distillation from unstructured sources

  Step 1 of 6 — Source
  Enter path to source folder: ~/notes

  Step 2 of 6 — Scan
  Found 247 files (1.8 MB, 892K chars)
  .md: 201  .txt: 38  .yaml: 8

  Step 3 of 6 — Context
  Add guiding context (optional): Focus on product roadmap items

  Step 4 of 6 — Analyze
  Strategy: map-reduce (9 batches)
  ✓ Batch 1/9 — extracted 12 ideas
  ✓ Batch 2/9 — extracted 8 ideas
  ...
  ✓ Synthesized 73 ideas into 7 goals

  Step 5 of 6 — Goals
  ❯ ✓ Build a real-time collaboration engine
    ✓ Implement usage-based billing system
    ✓ Design onboarding flow for enterprise users
    ...

  Step 6 of 6 — Done
  ✓ Wrote 7 goals to goals.json
```

<br>

## How It Works

Paperize automatically chooses the right strategy based on source size:

### Small sources (&lt; 150K chars)

**Single-shot** &mdash; All files are combined into one document and sent to Claude in a single API call. Fast and cost-effective.

### Large sources (&gt; 150K chars)

**Map-reduce pipeline** &mdash; A two-phase approach that handles arbitrarily large sources without truncation:

```
┌──────────────────────────────────────────────────────┐
│                    Source files                      │
│           (hundreds/thousands of files)              │
└──────────┬───────────┬───────────┬───────────────────┘
           │           │           │
     ┌─────▼─────┐ ┌───▼───┐ ┌────▼────┐
     │  Batch 1  │ │ Bat 2 │ │ Batch N │   Phase 1: Extract
     │  ~100K ch │ │       │ │         │   (parallel, up to 3)
     └─────┬─────┘ └───┬───┘ └────┬────┘
           │           │           │
           │    ideas + weights    │
           │     + attribution     │
           └───────────┼───────────┘
                       │
                ┌──────▼──────┐
                │  Synthesize │                Phase 2: Synthesize
                │  cluster &  │                (single call)
                │  prioritize │
                └──────┬──────┘
                       │
                ┌──────▼──────┐
                │    Goals    │
                │  title +    │
                │  description│
                └─────────────┘
```

1. **Extract** &mdash; Files are split into ~100K-char batches. Each batch is processed in parallel to extract atomic ideas with source attribution and weight (strong/weak).

2. **Synthesize** &mdash; All extracted ideas are merged and clustered into coherent goals. Strong ideas are prioritized. Related ideas from different batches are combined.

<br>

## Goal Format

Each goal is self-contained and independently actionable:

```json
{
  "title": "Build a real-time collaboration engine",
  "description": "Context: Several notes mention the need for...\n\nScope: ...\n\nSuccess criteria: ..."
}
```

| Field | Description |
| :---- | :---------- |
| **title** | Concise, imperative voice, max ~80 chars |
| **description** | Context (why), scope (what), success criteria (how to measure) &mdash; max 2000 words |

### Output formats

**JSON** (default) &mdash; Array of goal objects.

**Markdown** &mdash; Each goal as an `## H2` with description body.

**YAML** &mdash; Structured YAML document with properly escaped strings.

<br>

## Options

### Source

| Flag | Description | Default |
| :--- | :---------- | :------ |
| `--source <path>` | Path to folder with source material | _(wizard prompt)_ |
| `--context <text>` | Guiding context/prompt for goal generation | &mdash; |
| `--context-file <path>` | Read guiding context from a file | &mdash; |

### AI

| Flag | Description | Default |
| :--- | :---------- | :------ |
| `--model <model>` | Claude model for analysis | `claude-sonnet-4-6` |
| `--max-goals <n>` | Maximum goals to generate | `10` |

### Output

| Flag | Description | Default |
| :--- | :---------- | :------ |
| `--output <path>` | Write goals to file | stdout |
| `--format <fmt>` | Output format: `json`, `markdown`, `yaml` | `json` |
| `--dry-run` | Scan files only, skip AI analysis | off |

### Environment variables

| Variable | Description |
| :--- | :---------- |
| `ANTHROPIC_API_KEY` | **Required** for AI analysis |

<br>

## Supported File Types

`.md` `.txt` `.text` `.markdown` `.org` `.rst` `.adoc` `.csv` `.json` `.yaml` `.yml` `.xml` `.html` `.htm`

Skips: hidden directories, `node_modules`, `.obsidian`, `.trash`, `__pycache__`. Max 512 KB per file.

<br>

## Development

```sh
git clone https://github.com/Yesterday-AI/paperize.git
cd paperize
npm install
npm run build        # esbuild: src/cli.jsx -> dist/cli.mjs
npm test             # node --test src/logic/*.test.js
npm run lint         # eslint src/
npm run format       # prettier --write src/
```

<br>

## Architecture

Ink/React terminal UI &mdash; React 19 state machine rendered via [Ink 6](https://github.com/vadimdemedes/ink):

```text
paperize/
├── src/
│   ├── cli.jsx              # Entry point, flag parsing, routing
│   ├── app.jsx              # Ink state machine (6 steps)
│   ├── headless.js          # Non-interactive mode
│   ├── components/
│   │   ├── Header.jsx       # Progress bar
│   │   ├── StepSource.jsx   # Folder input
│   │   ├── StepScan.jsx     # File discovery + summary
│   │   ├── StepContext.jsx  # Optional guiding context
│   │   ├── StepAnalyze.jsx  # AI analysis with progress
│   │   ├── StepGoals.jsx    # Multi-select goal reviewer
│   │   └── StepDone.jsx     # Output writer
│   └── logic/
│       ├── scan.js          # Recursive scanner, batching
│       ├── scan.test.js     # 12 tests
│       └── analyze.js       # Map-reduce pipeline (Claude API)
├── esbuild.config.mjs       # Bundle config
├── package.json
└── dist/
    └── cli.mjs              # Built bundle (single file)
```

Built with [esbuild](https://esbuild.github.io/) into a single ESM bundle. Ships as one file.

<br>

## License

[MIT](LICENSE) &mdash; [Yesterday](https://yesterday-ai.de)
