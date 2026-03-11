import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export default function StepDone({
  source,
  scanSummary,
  goals,
  outputPath,
  format,
  dryRun,
  onComplete,
  onError,
}) {
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Write output file if specified
        if (outputPath && goals.length > 0 && !dryRun) {
          const absPath = resolve(process.cwd(), outputPath);
          const content = formatGoals(goals, format);
          await writeFile(absPath, content, 'utf-8');
        }

        if (!cancelled) {
          setFinished(true);
          setTimeout(() => {
            if (!cancelled) onComplete();
          }, 1500);
        }
      } catch (err) {
        if (!cancelled) onError(err.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (dryRun) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={1}>
        <Text color="green" bold>
          Dry run complete
        </Text>
        <Text>
          Scanned <Text bold>{scanSummary?.totalFiles || 0}</Text> files from{' '}
          <Text dimColor>{source}</Text>
        </Text>
        <Text dimColor>No AI analysis performed. Remove --dry-run to generate goals.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={1}>
      <Text color="green" bold>
        Done
      </Text>
      <Text> </Text>
      <Text>
        <Text color="green" bold>
          {goals.length}
        </Text>{' '}
        goal{goals.length !== 1 ? 's' : ''} distilled from{' '}
        <Text bold>{scanSummary?.totalFiles || '?'}</Text> source files
      </Text>

      {goals.map((g, i) => (
        <Text key={i} dimColor>
          {'  '}
          {i + 1}. {g.title}
        </Text>
      ))}

      {outputPath ? (
        <Box marginTop={1}>
          <Text>
            <Text color="green">✓</Text> Saved to <Text bold>{outputPath}</Text>{' '}
            <Text dimColor>({format})</Text>
          </Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text dimColor>Tip: use --output goals.json to save results to a file.</Text>
        </Box>
      )}
    </Box>
  );
}

function formatGoals(goals, format) {
  switch (format) {
    case 'markdown':
      return goals.map((g) => `## ${g.title}\n\n${g.description}\n`).join('\n');
    case 'yaml': {
      const lines = ['goals:'];
      for (const g of goals) {
        lines.push(`  - title: ${yamlString(g.title)}`);
        if (g.description) {
          lines.push(`    description: |`);
          for (const line of g.description.split('\n')) {
            lines.push(`      ${line}`);
          }
        }
      }
      return lines.join('\n') + '\n';
    }
    default:
      return JSON.stringify(goals, null, 2);
  }
}

function yamlString(s) {
  if (/[:#{}[\],&*?|>!%@`]/.test(s) || s.startsWith("'") || s.startsWith('"')) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}
