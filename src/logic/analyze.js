/**
 * AI-powered goal generation from unstructured text.
 *
 * Two modes:
 * - Single-shot: source fits in one context window (~150K chars) → one API call
 * - Map-reduce: large source → batch extract ideas → merge → synthesize goals
 */

import { buildDocument, buildBatches } from './scan.js';
import EXTRACT_SYSTEM from '../prompts/extract.md';
import SYNTHESIZE_SYSTEM from '../prompts/synthesize.md';
import SINGLE_SHOT_SYSTEM from '../prompts/single-shot.md';

// ── Threshold ──────────────────────────────────────────────────────

const SINGLE_SHOT_LIMIT = 150_000; // chars — below this, use single-shot

// ── Vibe presets ────────────────────────────────────────────────────

const VIBE_PRESETS = {
  focused: {
    extractSuffix:
      '\n\nBe selective — only extract ideas that are clearly articulated and actionable. Skip vague fragments and passing mentions. Quality over quantity.',
    synthesizeSuffix:
      '\n\nBe conservative — only produce goals with strong evidence from multiple sources. Merge aggressively. Aim for 1–5 high-confidence goals.',
    goalRange: '1–5',
  },
  balanced: {
    extractSuffix: '',
    synthesizeSuffix: '',
    goalRange: '5–15',
  },
  wild: {
    extractSuffix:
      '\n\nCast the widest possible net. Extract everything — half-baked ideas, wild speculation, tangential thoughts, creative leaps, even things that seem impractical. More is better. Tag speculative ideas as "weak" but still include them.',
    synthesizeSuffix:
      '\n\nBe expansive — preserve the full breadth of ideas. Don\'t merge aggressively. Let unusual, creative, or speculative ideas stand as their own goals. Aim for 10–20 goals. It\'s better to have too many interesting goals than to lose a diamond in the rough.',
    goalRange: '10–20',
  },
};

// ── Main entry point ───────────────────────────────────────────────

const RETRYABLE = /network error|rate limited|overloaded/i;

/**
 * Generate goals from scanned files.
 * Automatically chooses single-shot or map-reduce based on total content size.
 *
 * @param {object} opts
 * @param {Array} opts.files - Scanned files from scanDirectory()
 * @param {string} [opts.context] - Optional guiding context
 * @param {string} [opts.apiKey] - Anthropic API key
 * @param {string} [opts.model] - Model (default: claude-sonnet-4-6)
 * @param {number} [opts.concurrency] - Max parallel batch calls (default: 3)
 * @param {string} [opts.vibe] - Creativity level: focused, balanced, wild (default: balanced)
 * @param {(line: string) => void} [opts.onProgress] - Log line callback
 * @param {(status: object) => void} [opts.onStatus] - Live status updates (for spinners/tickers)
 * @returns {Promise<Array<{ title: string, description: string }>>}
 */
export async function generateGoals(opts) {
  const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required.\n' +
        'Set it with: export ANTHROPIC_API_KEY=sk-ant-...',
    );
  }

  const model = opts.model || 'claude-sonnet-4-6';
  const vibe = VIBE_PRESETS[opts.vibe] || VIBE_PRESETS.balanced;
  const onProgress = opts.onProgress || (() => {});
  const onStatus = opts.onStatus || (() => {});
  const concurrency = opts.concurrency || 3;
  const files = opts.files;

  // Calculate total content size
  const totalChars = files.reduce((sum, f) => sum + f.content.length, 0);

  if (totalChars <= SINGLE_SHOT_LIMIT) {
    return singleShot({ files, context: opts.context, apiKey, model, vibe, onProgress, onStatus });
  }

  return mapReduce({
    files,
    context: opts.context,
    apiKey,
    model,
    vibe,
    concurrency,
    onProgress,
    onStatus,
  });
}

// ── Single-shot mode ───────────────────────────────────────────────

async function singleShot({ files, context, apiKey, model, vibe, onProgress, onStatus }) {
  onProgress(`Single-shot mode (${files.length} files fit in one call)`);

  const { document } = buildDocument(files);
  let userMessage = document;
  if (context) {
    userMessage = `## Guiding context\n\n${context}\n\n## Source material\n\n${document}`;
  }

  onStatus({ phase: 'calling', label: 'Calling API...', elapsed: 0 });
  const text = await callClaudeWithTicker(
    {
      apiKey,
      model,
      system: SINGLE_SHOT_SYSTEM + vibe.synthesizeSuffix,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 4096,
    },
    { onProgress, onStatus, statusLabel: 'Analyzing' },
  );
  onStatus({ phase: 'idle' });

  onProgress('Parsing goals...');
  return parseGoalsJson(text);
}

// ── Map-reduce mode ────────────────────────────────────────────────

async function mapReduce({ files, context, apiKey, model, vibe, concurrency, onProgress, onStatus }) {
  const batches = buildBatches(files);
  onProgress(
    `Map-reduce mode: ${files.length} files → ${batches.length} batch${batches.length !== 1 ? 'es' : ''}`,
  );

  // Phase 1: Extract ideas from each batch (parallel with concurrency limit)
  onProgress('');
  onProgress('Phase 1/2 — Extracting ideas from batches...');
  const allIdeas = [];
  let completed = 0;

  const queue = [...batches];
  const workers = [];

  for (let w = 0; w < Math.min(concurrency, queue.length); w++) {
    workers.push(runWorker());
  }

  async function runWorker() {
    while (queue.length > 0) {
      const batch = queue.shift();
      const batchNum = batches.indexOf(batch) + 1;

      onProgress(
        `  Batch ${batchNum}/${batches.length} (${batch.fileCount} files, ${(batch.document.length / 1000).toFixed(0)}K chars)...`,
      );

      const text = await callClaudeWithTicker(
        {
          apiKey,
          model,
          system: EXTRACT_SYSTEM + vibe.extractSuffix,
          messages: [{ role: 'user', content: batch.document }],
          maxTokens: 16384,
        },
        { onProgress, onStatus, statusLabel: `Batch ${batchNum}/${batches.length}` },
      );

      const ideas = parseIdeasJson(text);
      allIdeas.push(...ideas);
      completed++;
      if (ideas.length === 0) {
        onProgress(
          `  ⚠ Batch ${batchNum}: 0 ideas — AI response: ${text.slice(0, 300).replace(/\n/g, '↵')}`,
        );
      } else {
        onProgress(`  ✓ Batch ${batchNum}: ${ideas.length} ideas extracted`);
      }
    }
  }

  await Promise.all(workers);

  onProgress(`Extracted ${allIdeas.length} ideas total from ${completed} batches`);

  if (allIdeas.length === 0) {
    onProgress('No ideas extracted — source material may be too sparse.');
    return [];
  }

  // Phase 2: Synthesize ideas into goals
  onProgress('');
  onProgress('Phase 2/2 — Synthesizing goals from ideas...');

  const ideasDocument = allIdeas
    .map(
      (idea, i) =>
        `${i + 1}. [${idea.weight}] ${idea.idea}${idea.source ? ` (from: ${idea.source})` : ''}`,
    )
    .join('\n');

  let synthesizeInput = ideasDocument;
  if (context) {
    synthesizeInput = `## Guiding context\n\n${context}\n\n## Extracted ideas\n\n${ideasDocument}`;
  }

  const text = await callClaudeWithTicker(
    {
      apiKey,
      model,
      system: SYNTHESIZE_SYSTEM + vibe.synthesizeSuffix,
      messages: [{ role: 'user', content: synthesizeInput }],
      maxTokens: 16384,
    },
    { onProgress, onStatus, statusLabel: 'Synthesizing' },
  );
  onStatus({ phase: 'idle' });

  onProgress('Parsing goals...');
  return parseGoalsJson(text);
}

// ── Claude API ─────────────────────────────────────────────────────

async function callClaude({ apiKey, model, system, messages, maxTokens = 4096 }) {
  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages,
        system,
      }),
    });
  } catch (err) {
    throw new Error(`Network error: ${err.message}`);
  }

  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      const parsed = JSON.parse(body);
      detail = parsed.error?.message || body;
    } catch {}

    if (response.status === 401) {
      throw new Error('Invalid API key. Check your ANTHROPIC_API_KEY.');
    }
    if (response.status === 429) {
      throw new Error('Rate limited by Anthropic API. Wait a moment and try again.');
    }
    if (response.status === 529) {
      throw new Error('Anthropic API is overloaded. Try again shortly.');
    }
    throw new Error(`Anthropic API error (${response.status}): ${detail}`);
  }

  const data = await response.json();

  if (data.stop_reason === 'refusal') {
    throw new Error(
      'Claude declined to respond — your content may have triggered a safety filter.',
    );
  }

  const text = data.content?.[0]?.text;
  if (!text) {
    const reason = data.stop_reason || 'unknown';
    throw new Error(`Empty response from Anthropic API (stop_reason: ${reason}, model: ${model})`);
  }
  return { text, stopReason: data.stop_reason };
}

async function callClaudeWithRetry(opts, { onProgress, retries = 2, delay = 3000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await callClaude(opts);
      if (result.stopReason === 'max_tokens' && onProgress) {
        onProgress('  ⚠ Response truncated (hit token limit) — parsing what we got');
      }
      return result.text;
    } catch (err) {
      if (attempt < retries && RETRYABLE.test(err.message)) {
        if (onProgress) onProgress(`  ⚠ ${err.message} — retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Wraps callClaudeWithRetry with a 1-second ticker that fires onStatus
 * while the API call is in flight — gives the UI something to render.
 */
async function callClaudeWithTicker(opts, { onProgress, onStatus, statusLabel = 'Working' } = {}) {
  const start = Date.now();
  const timer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    if (onStatus) onStatus({ phase: 'calling', label: statusLabel, elapsed });
  }, 1000);

  try {
    return await callClaudeWithRetry(opts, { onProgress });
  } finally {
    clearInterval(timer);
  }
}

// ── Parsing ────────────────────────────────────────────────────────

function parseIdeasJson(text) {
  // Try to extract JSON array directly from the full text first (greedy — handles nested fences)
  let jsonText = text.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*)```/);
  if (fenceMatch) {
    // Use the last ``` as the closing fence (greedy match)
    jsonText = fenceMatch[1].trim();
  } else {
    // Handle truncated responses that start with ```json but never close
    const openFence = text.match(/```(?:json)?\s*([\s\S]*)/);
    if (openFence) jsonText = openFence[1].trim();
  }

  const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
  // If no complete array found, try to fix truncated JSON starting with [
  if (!arrayMatch) {
    const partialArray = jsonText.match(/\[[\s\S]*/);
    if (partialArray) {
      const fixed = tryFixTruncatedJson(partialArray[0]);
      if (fixed) {
        try {
          const ideas = JSON.parse(fixed);
          if (!Array.isArray(ideas)) return [];
          return ideas
            .filter((i) => i && typeof i === 'object' && i.idea)
            .map((i) => ({
              idea: String(i.idea).trim(),
              source: i.source ? String(i.source).trim() : null,
              weight: i.weight === 'strong' ? 'strong' : 'weak',
            }));
        } catch { return []; }
      }
    }
    return [];
  }

  let ideas;
  try {
    ideas = JSON.parse(arrayMatch[0]);
  } catch {
    // If parse fails, try fixing truncated JSON by closing open brackets
    const fixed = tryFixTruncatedJson(arrayMatch[0]);
    if (!fixed) return [];
    try {
      ideas = JSON.parse(fixed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(ideas)) return [];

  return ideas
    .filter((i) => i && typeof i === 'object' && i.idea)
    .map((i) => ({
      idea: String(i.idea).trim(),
      source: i.source ? String(i.source).trim() : null,
      weight: i.weight === 'strong' ? 'strong' : 'weak',
    }));
}

function parseGoalsJson(text) {
  let jsonText = text.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*)```/);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    throw new Error(`No JSON array found in AI response:\n${text.slice(0, 500)}`);
  }

  let goals;
  try {
    goals = JSON.parse(arrayMatch[0]);
  } catch {
    throw new Error(`Failed to parse AI response as JSON:\n${arrayMatch[0].slice(0, 500)}`);
  }

  if (!Array.isArray(goals)) {
    throw new Error('AI response is not an array of goals.');
  }

  return goals
    .filter((g) => g && typeof g === 'object' && g.title)
    .map((g) => ({
      title: String(g.title).trim(),
      description: String(g.description || '').trim(),
    }));
}

/**
 * Try to fix truncated JSON arrays (from hitting max_tokens).
 * Removes the last incomplete element and closes brackets.
 */
function tryFixTruncatedJson(text) {
  // Find the last complete object (ends with })
  const lastComplete = text.lastIndexOf('}');
  if (lastComplete === -1) return null;

  const trimmed = text.slice(0, lastComplete + 1);
  // Remove any trailing comma after the last object
  const cleaned = trimmed.replace(/,\s*$/, '');
  // Ensure it starts with [ and close it
  if (!cleaned.trimStart().startsWith('[')) return null;
  return cleaned + ']';
}
