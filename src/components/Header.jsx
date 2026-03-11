import React from 'react';
import { Box, Text } from 'ink';

const STEP_LABELS = {
  1: 'Source',
  2: 'Scan',
  3: 'Context',
  4: 'Analyze',
  5: 'Review',
  6: 'Done',
};

export default function Header({ step, totalSteps }) {
  const label = STEP_LABELS[step] || '';
  const bar = totalSteps
    ? Array.from({ length: totalSteps }, (_, i) => (i < step ? '█' : '░')).join('')
    : '';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="magenta">
          Paperize
        </Text>
        <Text dimColor> — Distill goals from unstructured sources</Text>
      </Box>
      {step && totalSteps ? (
        <Box gap={1}>
          <Text color="magenta">{bar}</Text>
          <Text dimColor>
            {step}/{totalSteps} {label}
          </Text>
        </Box>
      ) : null}
    </Box>
  );
}
