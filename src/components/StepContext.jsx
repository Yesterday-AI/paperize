import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export default function StepContext({ initialContext, onComplete }) {
  const [value, setValue] = useState(initialContext || '');

  const handleSubmit = (val) => {
    onComplete(val.trim());
  };

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan" bold>
          ?{' '}
        </Text>
        <Text bold>Guiding context </Text>
        <Text dimColor>(optional) </Text>
        <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
      </Box>
      <Text dimColor>
        {' '}
        Focus the AI on specific themes, e.g. "SaaS product ideas" or "technical infrastructure".
        Press Enter to skip.
      </Text>
    </Box>
  );
}
