import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { scanDirectory, summarizeScan } from '../logic/scan.js';

export default function StepScan({ source, dryRun, onComplete, onError }) {
  const [scanning, setScanning] = useState(true);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;

    scanDirectory(source)
      .then((files) => {
        if (cancelled) return;

        const sum = summarizeScan(files);
        setSummary(sum);

        if (files.length === 0) {
          onError('No supported files found in source directory.');
          return;
        }

        setScanning(false);

        // Brief delay so user can see the summary
        setTimeout(() => {
          if (!cancelled) {
            onComplete({ files, summary: sum });
          }
        }, 1200);
      })
      .catch((err) => {
        if (!cancelled) onError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const strategy =
    summary && summary.totalChars > 150_000
      ? {
          label: 'map-reduce',
          detail: `${Math.ceil(summary.totalChars / 100_000)} batches`,
          color: 'yellow',
        }
      : summary
        ? { label: 'single-shot', detail: '1 API call', color: 'green' }
        : null;

  return (
    <Box flexDirection="column">
      <Box>
        {scanning ? (
          <Text color="cyan">
            <Spinner type="dots" />{' '}
          </Text>
        ) : (
          <Text color="green">✓ </Text>
        )}
        <Text bold>{scanning ? 'Scanning source directory...' : 'Scan complete'}</Text>
      </Box>

      <Box marginLeft={2} flexDirection="column">
        <Text dimColor>{source}</Text>

        {summary ? (
          <Box flexDirection="column" marginTop={1}>
            <Text>
              Found <Text bold color="cyan">{summary.totalFiles}</Text> file
              {summary.totalFiles !== 1 ? 's' : ''} ({formatBytes(summary.totalSize)},{' '}
              {formatChars(summary.totalChars)})
            </Text>
            <Box gap={2}>
              {Object.entries(summary.byExtension).map(([ext, count]) => (
                <Text key={ext} dimColor>
                  {ext}: {count}
                </Text>
              ))}
            </Box>
            {!dryRun && strategy ? (
              <Box marginTop={1}>
                <Text dimColor>Strategy: </Text>
                <Text color={strategy.color} bold>
                  {strategy.label}
                </Text>
                <Text dimColor> ({strategy.detail})</Text>
              </Box>
            ) : null}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
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
