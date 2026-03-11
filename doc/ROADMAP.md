# Paperize Roadmap

## v0.2 — Rich Document Ingestion

Expand beyond plain text to support real-world knowledge bases: PDFs, Office docs, slides, images.

### File Format Expansion

| Format | Approach | Notes |
| :----- | :------- | :---- |
| **PDF** | `office-text-extractor` (npm, zero-dep) | Native Node.js, no Python needed |
| **DOCX, PPTX, XLSX** | `office-text-extractor` | Same package covers all Office formats |
| **Images (OCR)** | `markitdown-js` (npm port of Microsoft MarkItDown) | JS port of Microsoft's tool, supports OCR |
| **EPUB** | Custom extractor (ZIP + HTML parsing) | EPUB is a ZIP of HTML — straightforward |
| **HTML (fetched)** | `--source-url` flag to fetch + extract | Strip nav/footer, keep article content |

**Decision**: Start with `office-text-extractor` for PDF/Office (pure Node.js, no Python dep). Add `markitdown-js` for images/OCR as opt-in. Avoid Python-only tools (Docling, MarkItDown proper) to keep the install simple.

### Scan Architecture Changes

- `scan.js` gets a **converter registry**: `{ '.pdf': extractPdf, '.docx': extractDocx, ... }`
- Each converter returns `{ content: string, metadata?: object }`
- Text files use the current passthrough. Rich formats go through converters.
- New flag: `--include-binary` (opt-in for PDF/DOCX, off by default to keep existing behavior)

### Tasks

- [ ] Add `office-text-extractor` dependency
- [ ] Implement converter registry in `scan.js`
- [ ] Add PDF/DOCX/PPTX/XLSX extractors
- [ ] Add `markitdown-js` for image OCR (optional dep)
- [ ] Update `SUPPORTED_EXTENSIONS` and docs
- [ ] Tests for each converter (fixture files)

---

## v0.3 — Structured Analysis Pipeline

Replace the current two-phase (extract → synthesize) with a multi-pass pipeline grounded in established ideation methodologies.

### Pipeline: Extract → Cluster → Score → Refine → Synthesize

```
Source files
    │
    ▼
┌──────────┐
│ Extract  │  Phase 1: Atomic idea extraction (current, per batch)
└────┬─────┘
     │  raw ideas [{idea, source, weight}]
     ▼
┌──────────┐
│ Cluster  │  Phase 2: Affinity mapping — group related ideas (NEW)
└────┬─────┘  Inspired by KJ method / affinity diagrams.
     │  clusters [{theme, ideas[], strength}]
     ▼
┌──────────┐
│  Score   │  Phase 3: Rank clusters by evidence + relevance (NEW)
└────┬─────┘  Cross-reference: how many sources? How developed?
     │  scored clusters [{theme, ideas[], score, evidence}]
     ▼
┌──────────┐
│ Refine   │  Phase 4: Reflect-and-revise pass (NEW)
└────┬─────┘  LLM reviews its own clusters for gaps, overlaps, miscategorization.
     │        Pattern: "LITA" — identify ambiguous items, reassign.
     ▼
┌──────────┐
│Synthesize│  Phase 5: Generate goals from refined clusters (current)
└──────────┘  Each cluster → one goal with context, scope, success criteria.
```

### Why This Matters

The current two-phase approach has two weaknesses:
1. **No clustering** — the synthesize call must both cluster AND write goals in one step
2. **No quality gate** — whatever the LLM produces in one pass is final

The multi-pass approach is grounded in established research:
- **Affinity mapping / KJ method**: Group raw data by natural relationships before analyzing
- **Thematic analysis**: Code data → identify themes → review themes → define themes
- **Reflect-and-revise**: LLMs improve significantly when given a chance to review their own output (QWK +0.19–0.47 in studies)

### Implementation Notes

- Each phase is a separate function with its own system prompt
- Phases 2–4 are single API calls (not batched) since they operate on compressed data
- The full pipeline runs only in map-reduce mode. Single-shot stays as-is for small sources.
- Add `--pipeline` flag: `fast` (current 2-phase) vs `deep` (5-phase). Default: `deep`.
- Cost estimate: ~2x more API calls than current, but each intermediate call is smaller

### Tasks

- [ ] Design system prompts for cluster, score, and refine phases
- [ ] Implement `clusterIdeas()`, `scoreCluster()`, `refineCluster()` in analyze.js
- [ ] Wire into map-reduce pipeline with `--pipeline` flag
- [ ] Add intermediate output (`--verbose` or `--debug` to dump intermediate JSON)
- [ ] Tests for each phase with fixture data
- [ ] Benchmark: compare 2-phase vs 5-phase output quality on sample vaults

---

## v0.4 — UX Polish

### Interactive Mode Enhancements

- [ ] **Goal detail view**: Press Enter on a goal in StepGoals to expand full description (scrollable)
- [ ] **Goal editing**: Press `e` to inline-edit a goal title or description
- [ ] **Re-analyze**: Press `r` in StepGoals to re-run analysis with different context
- [ ] **Source file preview**: In StepScan, arrow keys to browse discovered files, show content preview
- [ ] **Color themes**: Respect `NO_COLOR` env var, add `--no-color` flag
- [ ] **Config file**: `.paperizerc` or `paperize.config.json` for default flags (model, format, output dir)

### Headless Mode Enhancements

- [ ] **JSON progress output**: `--progress json` for machine-readable progress (for CI/pipelines)
- [ ] **Streaming output**: `--stream` to emit goals as they're synthesized (for piping)
- [ ] **Exit codes**: Distinct codes for: no files found (2), API error (3), no goals generated (4)

### Output Enhancements

- [ ] **HTML output**: `--format html` with styled goal cards
- [ ] **CSV output**: `--format csv` for spreadsheet import
- [ ] **Append mode**: `--append` to add to existing output file instead of overwriting
- [ ] **Goal metadata**: Include source files, idea count, confidence score per goal in output

---

## v0.5 — Test Coverage

### Unit Tests (node:test)

- [ ] **analyze.js**: Test each pipeline phase with fixture prompts/responses
  - Mock the Claude API (inject a `callFn` parameter)
  - Test `parseIdeasJson` with various LLM response formats (fenced, unfenced, prose+JSON, malformed)
  - Test `parseGoalsJson` same
  - Test single-shot vs map-reduce routing based on char count
- [ ] **scan.js**: Extend existing 12 tests
  - Shell fallback path (mock `execSync`)
  - Converter registry (v0.2)
  - Edge cases: empty dirs, permission errors, symlinks, very large files
- [ ] **headless.js**: Integration test with mocked API
  - Verify output format correctness (JSON, markdown, YAML)
  - Verify progress output
  - Verify error handling and exit codes

### E2E Tests

- [ ] **CLI flags**: Test all flag combinations with a small fixture vault
- [ ] **Dry run**: Verify no API calls are made
- [ ] **Output files**: Verify written files parse correctly
- [ ] **Interactive mode**: Snapshot tests for Ink components (ink-testing-library)

### CI

- [ ] GitHub Actions workflow: lint + test on push/PR
- [ ] Add `npm run test:ci` script (no TTY, exit on first failure)

---

## Someday / Maybe

- **Watch mode**: `--watch` to re-analyze when source files change
- **Diff mode**: Compare two analysis runs, show what changed
- **Plugin system**: Custom extractors and analyzers as npm packages
- **Multi-source**: `--source dir1 --source dir2` to combine multiple folders
- **Web UI**: Optional browser-based goal reviewer (serve locally)
- **Embeddings-based clustering**: Use embeddings instead of LLM for Phase 2 clustering (cheaper, deterministic)
- **Cost tracking**: Show estimated API cost after analysis
- **Template goals**: Pre-defined goal structures (OKR format, JTBD format, user story format)
