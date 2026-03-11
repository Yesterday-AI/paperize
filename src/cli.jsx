import React from 'react';
import { render } from 'ink';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import App from './app.jsx';
import { runHeadless } from './headless.js';

function expandHome(p) {
  if (p.startsWith('~/') || p === '~') return join(homedir(), p.slice(1));
  return p;
}

const HELP = `
  Paperize — Distill unstructured sources into qualified goals

  Usage:
    paperize [options]

  Source options:
    --source <path>            Path to folder with source material
    --context <text>           Guiding context/prompt for goal generation
    --context-file <path>      Read guiding context from a file

  AI options:
    --model <model>            LLM model (default: claude-sonnet-4-6)
    --max-goals <n>            Maximum goals to generate (default: 10)

  Output options:
    --output <path>            Write goals to file
    --format <fmt>             Output format: json, markdown, yaml (default: json)
    --dry-run                  Scan and show file summary, skip AI analysis

  Examples:
    paperize --source ~/notes
    paperize --source ~/notes --context "Focus on SaaS product ideas"
    paperize --source ./research --model claude-opus-4-6 --output goals.json
    paperize --source ~/notes --format markdown --output goals.md
    paperize --source ~/notes --format yaml --output goals.yaml
    paperize --source ~/notes --dry-run

  Environment:
    ANTHROPIC_API_KEY            Required for AI analysis

  -h, --help                   Show this help
`;

function parseArgs(argv) {
  const args = argv.slice(2);
  const config = {
    source: null,
    context: null,
    contextFile: null,
    model: null,
    maxGoals: 10,
    output: null,
    format: 'json',
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '-h':
      case '--help':
        console.log(HELP);
        process.exit(0);
        break;
      case '--source':
        config.source = next;
        i++;
        break;
      case '--context':
        config.context = next;
        i++;
        break;
      case '--context-file':
        config.contextFile = next;
        i++;
        break;
      case '--model':
        config.model = next;
        i++;
        break;
      case '--max-goals':
        config.maxGoals = parseInt(next, 10) || 10;
        i++;
        break;
      case '--output':
        config.output = next;
        i++;
        break;
      case '--format':
        config.format = next;
        i++;
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      default:
        // If no flag prefix and no source yet, treat as source path
        if (!arg.startsWith('-') && !config.source) {
          config.source = arg;
        }
        break;
    }
  }

  return config;
}

async function main() {
  const config = parseArgs(process.argv);

  // Resolve source to absolute path
  if (config.source) {
    config.source = resolve(process.cwd(), expandHome(config.source));
  }

  // Headless mode: --source provided (non-interactive)
  if (config.source) {
    await runHeadless(config);
    return;
  }

  // Interactive wizard (Ink)
  const app = render(
    <App
      initialSource={config.source}
      context={config.context}
      contextFile={config.contextFile}
      model={config.model}
      maxGoals={config.maxGoals}
      output={config.output}
      format={config.format}
      dryRun={config.dryRun}
    />,
  );

  await app.waitUntilExit();
}

main().catch((err) => {
  console.error(`\n  Error: ${err.message}\n`);
  process.exit(1);
});
