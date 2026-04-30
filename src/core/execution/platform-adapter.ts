export interface PromptExecutionTarget {
  routeKey: string;
  sessionId: string;
  directory: string;
}

export interface TextPromptExecutionPlatform {
  name: string;
  promptTaskName: string;
  sessionMismatchReason: string;
  sendMessage(text: string): Promise<void>;
  ensureEventSubscription(directory: string): Promise<void>;
  installEventRouting(): void;
  onBeforePrompt(target: PromptExecutionTarget): Promise<void>;
  clearActiveTarget(): void;
  clearConversationState(reason: string): void;
  stopEventListening(): void;
}