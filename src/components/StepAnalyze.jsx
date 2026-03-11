import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { generateGoals } from '../logic/analyze.js';

export default function StepAnalyze({ files, context, model, onComplete, onError }) {
  const [log, setLog] = useState([]);
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState(null); // { phase, label, elapsed }
  const startRef = useRef(Date.now());

  // Tick total elapsed time every second while running
  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [done]);

  useEffect(() => {
    let cancelled = false;

    generateGoals({
      files,
      context: context || undefined,
      model: model || undefined,
      onProgress: (line) => {
        if (!cancelled) {
          setLog((prev) => [...prev, line]);
        }
      },
      onStatus: (s) => {
        if (!cancelled) {
          setStatus(s.phase === 'idle' ? null : s);
        }
      },
    })
      .then((goals) => {
        if (!cancelled) {
          setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
          setDone(true);
          setStatus(null);
          onComplete(goals);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          onError(err.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const displayModel = model || 'claude-sonnet-4-6';

  return (
    <Box flexDirection="column">
      <Box>
        {done ? (
          <Text color="green">✓ </Text>
        ) : (
          <Text color="cyan">
            <Spinner type="dots" />{' '}
          </Text>
        )}
        <Text bold>{done ? 'Analysis complete' : 'Analyzing sources with AI...'}</Text>
        {elapsed > 0 ? <Text dimColor> ({formatElapsed(elapsed)})</Text> : null}
      </Box>

      <Box marginLeft={2} flexDirection="column">
        <Text dimColor>Model: {displayModel}</Text>
        {context ? (
          <Text dimColor>
            Context: {context.slice(0, 60)}
            {context.length > 60 ? '...' : ''}
          </Text>
        ) : null}
      </Box>

      <Box flexDirection="column" marginLeft={2} marginTop={1}>
        {log.map((line, i) => (
          <Text key={i} color={colorForLine(line)}>
            {line}
          </Text>
        ))}
      </Box>

      {status ? (
        <Box marginLeft={2} marginTop={0}>
          <Text color="cyan">
            <Spinner type="dots" />{' '}
          </Text>
          <Text dimColor>
            {status.label}
            {status.elapsed > 0 ? ` (${formatElapsed(status.elapsed)})` : ''}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}

function colorForLine(line) {
  if (line.includes('✓')) return 'green';
  if (line.includes('⚠')) return 'yellow';
  if (line.includes('Phase')) return 'cyan';
  if (line.includes('Extracted') || line.includes('Synthesiz')) return 'cyan';
  return undefined;
}

function formatElapsed(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s}s`;
}
