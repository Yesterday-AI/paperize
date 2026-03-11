import React, { useState } from 'react';
import { Box, useApp } from 'ink';
import Header from './components/Header.jsx';
import StepSource from './components/StepSource.jsx';
import StepScan from './components/StepScan.jsx';
import StepContext from './components/StepContext.jsx';
import StepAnalyze from './components/StepAnalyze.jsx';
import StepGoals from './components/StepGoals.jsx';
import StepDone from './components/StepDone.jsx';

const STEPS = {
  SOURCE: 'SOURCE',
  SCAN: 'SCAN',
  CONTEXT: 'CONTEXT',
  ANALYZE: 'ANALYZE',
  GOALS: 'GOALS',
  DONE: 'DONE',
};

const STEP_ORDER = ['SOURCE', 'SCAN', 'CONTEXT', 'ANALYZE', 'GOALS', 'DONE'];

export default function App({
  initialSource,
  context: initialContext,
  contextFile,
  model,
  maxGoals,
  output,
  format,
  dryRun,
}) {
  const { exit } = useApp();

  const firstStep = initialSource ? STEPS.SCAN : STEPS.SOURCE;

  const [step, setStep] = useState(firstStep);
  const [source, setSource] = useState(initialSource || '');
  const [files, setFiles] = useState([]);
  const [scanSummary, setScanSummary] = useState(null);
  const [context, setContext] = useState(initialContext || '');
  const [goals, setGoals] = useState([]);
  const [outputPath, setOutputPath] = useState(output || null);
  const [error, setError] = useState(null);

  const stepIndex = STEP_ORDER.indexOf(step) + 1;
  const totalSteps = dryRun ? 3 : 5;

  const handleError = (msg) => {
    setError(msg);
    exit();
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header step={Math.min(stepIndex, totalSteps)} totalSteps={totalSteps} />

      {error ? (
        <Box>
          <Box marginLeft={1}>
            <Box flexDirection="column">
              <Box>Error: {error}</Box>
            </Box>
          </Box>
        </Box>
      ) : null}

      {step === STEPS.SOURCE ? (
        <StepSource
          onComplete={(sourcePath) => {
            setSource(sourcePath);
            setStep(STEPS.SCAN);
          }}
        />
      ) : null}

      {step === STEPS.SCAN ? (
        <StepScan
          source={source}
          dryRun={dryRun}
          onComplete={({ files: scannedFiles, summary }) => {
            setFiles(scannedFiles);
            setScanSummary(summary);
            if (dryRun) {
              setStep(STEPS.DONE);
            } else {
              setStep(STEPS.CONTEXT);
            }
          }}
          onError={handleError}
        />
      ) : null}

      {step === STEPS.CONTEXT ? (
        <StepContext
          initialContext={context}
          onComplete={(ctx) => {
            setContext(ctx);
            setStep(STEPS.ANALYZE);
          }}
        />
      ) : null}

      {step === STEPS.ANALYZE ? (
        <StepAnalyze
          files={files}
          context={context}
          model={model}
          onComplete={(generatedGoals) => {
            setGoals(generatedGoals.slice(0, maxGoals));
            setStep(STEPS.GOALS);
          }}
          onError={handleError}
        />
      ) : null}

      {step === STEPS.GOALS ? (
        <StepGoals
          goals={goals}
          output={outputPath}
          format={format}
          onConfirm={({ goals: finalGoals, writtenTo }) => {
            setGoals(finalGoals);
            if (writtenTo) setOutputPath(writtenTo);
            setStep(STEPS.DONE);
          }}
          onCancel={() => {
            exit();
          }}
        />
      ) : null}

      {step === STEPS.DONE ? (
        <StepDone
          source={source}
          scanSummary={scanSummary}
          goals={goals}
          outputPath={outputPath}
          format={format}
          dryRun={dryRun}
          onComplete={() => exit()}
          onError={handleError}
        />
      ) : null}
    </Box>
  );
}
