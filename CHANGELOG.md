# Changelog

All notable changes to this project will be documented in this file.

## [0.1.1] - 2026-03-11

### Added

- `--vibe` flag to control creativity level: `focused`, `balanced` (default), `wild`
- Truncated JSON recovery for large batch responses (handles unclosed `\`\`\`json` fences)

### Changed

- Extract `maxTokens` increased from 8192 to 16384 (fixes lost ideas on large batches)
- Synthesize `maxTokens` increased from 8192 to 16384 (room for more goals)
- Extract prompt encourages broader idea capture by default
- Synthesize prompt targets 5-20 goals instead of 1-10

## [0.1.0] - 2025-03-11

### Added

- Interactive TUI wizard (Ink/React) with 6-step flow
- Headless mode (`--source`) for scripting and CI
- Single-shot analysis for small sources (< 150K chars)
- Map-reduce pipeline for large sources (parallel batch extraction + synthesis)
- JSON, markdown, and YAML output formats
- Guiding context (`--context`, `--context-file`) to steer goal generation
- Dry-run mode (`--dry-run`) for scanning without AI
- macOS TCC fallback for iCloud/protected directories
- Configurable model selection (`--model`)
- 12 unit tests for scan logic
