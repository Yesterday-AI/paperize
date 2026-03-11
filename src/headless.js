/**
 * Headless (non-interactive) mode for Paperize.
 * Scans source, generates goals via AI, outputs results.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateGoals } from './logic/analyze.js';
import { scanDirectory, summarizeScan } from './logic/scan.js';

/**
 * @param {object} opts
 * @param {string} opts.source - Absolute path to source directory
 * @param {string|null} opts.context - Guiding context text
 * @param {string|null} opts.contextFile - Path to context file
 * @param {string|null} opts.model - LLM model override
 * @param {number} opts.maxGoals - Max goals to generate
 * @param {string|null} opts.output - Output file path
 * @param {string} opts.format - Output format (json, markdown, yaml)
 * @param {boolean} opts.dryRun - Scan only, no AI
 */
export async function runHeadless(opts) {
  const log = (msg) => console.log(msg);
  const startTime = Date.now();

  log('');
  log('');
  log('   /$$$$$$$                                         /$$                     ');
  log('  | $$__  $$                                       |__/                     ');
  log('  | $$  \\ $$ /$$$$$$   /$$$$$$   /$$$$$$   /$$$$$$  /$$ /$$$$$$$$  /$$$$$$  ');
  log('  | $$$$$$$/|____  $$ /$$__  $$ /$$__  $$ /$$__  $$| $$|____ /$$/ /$$__  $$ ');
  log('  | $$____/  /$$$$$$$| $$  \\ $$| $$$$$$$$| $$  \\__/| $$   /$$$$/ | $$$$$$$$ ');
  log('  | $$      /$$__  $$| $$  | $$| $$_____/| $$      | $$  /$$__/  | $$_____/ ');
  log('  | $$     |  $$$$$$$| $$$$$$$/|  $$$$$$$| $$      | $$ /$$$$$$$$|  $$$$$$$ ');
  log('  |__/      \\_______/| $$____/  \\_______/|__/      |__/|________/ \\_______/ ');
  log('                     | $$                                                    ');
  log('                     | $$                                                    ');
  log('                     |__/                                                    ');
  log('');
  log('  \x1b[1m\x1b[35mPaperize\x1b[0m — Goal distillation from unstructured sources');
  log('');

  // 1. Resolve context
  let context = opts.context || null;
  if (!context && opts.contextFile) {
    const contextPath = resolve(process.cwd(), opts.contextFile);
    context = await readFile(contextPath, 'utf-8');
    log(`  Context loaded from: ${contextPath}`);
  }

  // 2. Scan source directory
  log(`  Scanning: ${opts.source}`);
  const files = await scanDirectory(opts.source);
  const summary = summarizeScan(files);

  log(
    `  Found \x1b[1m${summary.totalFiles}\x1b[0m files (${formatBytes(summary.totalSize)}, ${formatChars(summary.totalChars)})`,
  );
  const extParts = Object.entries(summary.byExtension)
    .map(([ext, count]) => `${ext}: ${count}`)
    .join('  ');
  log(`    ${extParts}`);

  if (summary.totalFiles === 0) {
    log('');
    log('  No supported files found. Exiting.');
    process.exit(1);
  }

  // Dry run — stop here
  if (opts.dryRun) {
    log('');
    if (summary.totalChars > 150_000) {
      log(
        `  Strategy: \x1b[33mmap-reduce\x1b[0m (${Math.ceil(summary.totalChars / 100_000)} batches)`,
      );
    } else {
      log('  Strategy: \x1b[32msingle-shot\x1b[0m (1 API call)');
    }
    log('');
    log('  Dry run — no AI analysis performed.');
    return;
  }

  // 3. Generate goals via AI (auto-selects single-shot or map-reduce)
  const displayModel = opts.model || 'claude-sonnet-4-6';
  log('');
  log(`  Model: ${displayModel}`);
  if (context) {
    log(`  Context: ${context.slice(0, 80)}${context.length > 80 ? '...' : ''}`);
  }
  log('');

  // Status line: overwrite in-place to show live progress during API calls
  let lastStatusLine = '';
  const clearStatus = () => {
    if (lastStatusLine) {
      process.stdout.write(`\r\x1b[2K`);
      lastStatusLine = '';
    }
  };

  const goals = await generateGoals({
    files,
    context,
    model: opts.model,
    onProgress: (line) => {
      clearStatus();
      // Color-code progress lines
      let colored = line;
      if (line.includes('✓')) colored = `\x1b[32m${line}\x1b[0m`;
      else if (line.includes('⚠')) colored = `\x1b[33m${line}\x1b[0m`;
      else if (line.includes('Phase') || line.includes('Extracted') || line.includes('Synthesiz'))
        colored = `\x1b[36m${line}\x1b[0m`;
      log(`  ${colored}`);
    },
    onStatus: (s) => {
      if (s.phase === 'idle') {
        clearStatus();
        return;
      }
      const elapsed = s.elapsed > 0 ? ` (${s.elapsed}s)` : '';
      const line = `  \x1b[2m⏳ ${s.label}${elapsed}\x1b[0m`;
      process.stdout.write(`\r\x1b[2K${line}`);
      lastStatusLine = line;
    },
  });
  clearStatus();

  const limited = goals.slice(0, opts.maxGoals);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log('');
  log(
    `  \x1b[32m\x1b[1m${limited.length}\x1b[0m goal${limited.length !== 1 ? 's' : ''} distilled from ${summary.totalFiles} files in ${elapsed}s`,
  );
  log('');

  for (let i = 0; i < limited.length; i++) {
    const g = limited[i];
    log(`  ${i + 1}. ${g.title}`);
    if (g.description) {
      const preview = g.description.slice(0, 120).replace(/\n/g, ' ');
      log(`     \x1b[2m${preview}${g.description.length > 120 ? '...' : ''}\x1b[0m`);
    }
  }

  // 4. Output
  if (opts.output) {
    const outputPath = resolve(process.cwd(), opts.output);
    const content = formatGoals(limited, opts.format);
    await writeFile(outputPath, content, 'utf-8');
    log('');
    log(`  \x1b[32m✓\x1b[0m Saved to ${outputPath} (${opts.format})`);
  }

  log('');
}

function formatGoals(goals, format) {
  switch (format) {
    case 'markdown':
      return goalsToMarkdown(goals);
    case 'yaml':
      return goalsToYaml(goals);
    default:
      return JSON.stringify(goals, null, 2);
  }
}

function goalsToMarkdown(goals) {
  const lines = ['# Generated Goals\n'];
  for (const g of goals) {
    lines.push(`## ${g.title}\n`);
    if (g.description) {
      lines.push(`${g.description}\n`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function goalsToYaml(goals) {
  const lines = ['goals:'];
  for (const g of goals) {
    lines.push(`  - title: ${yamlString(g.title)}`);
    if (g.description) {
      lines.push(`    description: |`);
      for (const line of g.description.split('\n')) {
        lines.push(`      ${line}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

function yamlString(s) {
  if (/[:#{}[\],&*?|>!%@`]/.test(s) || s.startsWith("'") || s.startsWith('"')) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatChars(chars) {
  if (chars < 1000) return `${chars} chars`;
  if (chars < 1_000_000) return `${(chars / 1000).toFixed(0)}K chars`;
  return `${(chars / 1_000_000).toFixed(1)}M chars`;
}
