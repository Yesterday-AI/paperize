import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export default function StepGoals({ goals, output, format, onConfirm, onCancel }) {
  const [selected, setSelected] = useState(() => goals.map(() => true));
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((c) => (c > 0 ? c - 1 : goals.length - 1));
    } else if (key.downArrow) {
      setCursor((c) => (c < goals.length - 1 ? c + 1 : 0));
    } else if (input === ' ') {
      setSelected((prev) => {
        const next = [...prev];
        next[cursor] = !next[cursor];
        return next;
      });
    } else if (key.return) {
      const finalGoals = goals.filter((_, i) => selected[i]);
      if (finalGoals.length === 0) {
        onCancel();
        return;
      }
      onConfirm({ goals: finalGoals, writtenTo: output });
    } else if (input === 'n' || input === 'N') {
      onCancel();
    } else if (input === 'a' || input === 'A') {
      // Toggle all
      const allSelected = selected.every(Boolean);
      setSelected(goals.map(() => !allSelected));
    }
  });

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
        <Text bold color="cyan">
          Generated Goals
        </Text>
        <Text> </Text>

        {goals.map((goal, i) => {
          const isSelected = selected[i];
          const isCursor = cursor === i;

          return (
            <Box key={i} flexDirection="column">
              <Box>
                <Text color={isCursor ? 'cyan' : undefined}>
                  {isCursor ? '>' : ' '} {isSelected ? '[x]' : '[ ]'}{' '}
                </Text>
                <Text bold={isCursor}>{goal.title}</Text>
              </Box>
              {isCursor && goal.description ? (
                <Box marginLeft={6}>
                  <Text dimColor wrap="wrap">
                    {goal.description.slice(0, 200)}
                    {goal.description.length > 200 ? '...' : ''}
                  </Text>
                </Box>
              ) : null}
            </Box>
          );
        })}
      </Box>

      <Box marginLeft={1} marginTop={1} flexDirection="column">
        <Text dimColor>
          Up/Down: navigate | Space: toggle | A: toggle all | Enter: confirm | N: cancel
        </Text>
      </Box>
    </Box>
  );
}
