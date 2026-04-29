interface SummaryAggregatorPrivateState {
  onCompleteCallback: null;
  onPartialCallback: null;
  onToolCallback: null;
  onToolFileCallback: null;
  onQuestionCallback: null;
  onQuestionErrorCallback: null;
  onThinkingCallback: null;
  onTokensCallback: null;
  onSessionCompactedCallback: null;
  onSessionErrorCallback: null;
  onSessionRetryCallback: null;
  onIdleCallback: null;
  onPermissionCallback: null;
  onSessionDiffCallback: null;
  onFileChangeCallback: null;
}

interface ProcessManagerPrivateState {
  state: {
    process: null;
    pid: null;
    startTime: null;
    isRunning: boolean;
  };
}

export async function resetSingletonState(): Promise<void> {
  const [
    { questionManager },
    { permissionManager },
    { renameManager },
    { interactionManager },
    { summaryAggregator },
    { processManager },
    { stopEventListening },
    { __resetSessionDirectoryCacheForTests },
    loggerModule,
  ] = await Promise.all([
    import("../../src/question/manager.js"),
    import("../../src/permission/manager.js"),
    import("../../src/rename/manager.js"),
    import("../../src/interaction/manager.js"),
    import("../../src/summary/aggregator.js"),
    import("../../src/process/manager.js"),
    import("../../src/opencode/events.js"),
    import("../../src/session/cache-manager.js"),
    import("../../src/utils/logger.js"),
  ]);

  stopEventListening();
  questionManager.clear();
  permissionManager.clear();
  renameManager.clear();
  interactionManager.clear("test_reset");
  summaryAggregator.clear();

  const aggregator = summaryAggregator as unknown as SummaryAggregatorPrivateState;
  aggregator.onCompleteCallback = null;
  aggregator.onPartialCallback = null;
  aggregator.onToolCallback = null;
  aggregator.onToolFileCallback = null;
  aggregator.onQuestionCallback = null;
  aggregator.onQuestionErrorCallback = null;
  aggregator.onThinkingCallback = null;
  aggregator.onTokensCallback = null;
  aggregator.onSessionCompactedCallback = null;
  aggregator.onSessionErrorCallback = null;
  aggregator.onSessionRetryCallback = null;
  aggregator.onIdleCallback = null;
  aggregator.onPermissionCallback = null;
  aggregator.onSessionDiffCallback = null;
  aggregator.onFileChangeCallback = null;

  const process = processManager as unknown as ProcessManagerPrivateState;
  process.state = {
    process: null,
    pid: null,
    startTime: null,
    isRunning: false,
  };

  __resetSessionDirectoryCacheForTests();

  if (
    "__resetLoggerForTests" in loggerModule &&
    typeof loggerModule.__resetLoggerForTests === "function"
  ) {
    loggerModule.__resetLoggerForTests();
  }
}
