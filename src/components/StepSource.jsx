import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { resolve } from 'node:path';

export default function StepSource({ onComplete }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (val) => {
    const trimmed = val.trim();
    if (!trimmed) {
      setError('Source path is required');
      return;
    }
    const resolved = resolve(process.cwd(), trimmed);
    onComplete(resolved);
  };

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan" bold>
          ?{' '}
        </Text>
        <Text bold>Source folder </Text>
        <TextInput
          value={value}
          onChange={(v) => {
            setValue(v);
            setError('');
          }}
          onSubmit={handleSubmit}
        />
      </Box>
      <Text dimColor>
        {' '}
        Path to a folder with text files, markdown, notes, etc.
      </Text>
      {error ? <Text color="red"> {error}</Text> : null}
    </Box>
  );
}
