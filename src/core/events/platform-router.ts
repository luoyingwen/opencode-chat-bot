import { summaryAggregator } from "../../summary/aggregator.js";
import type { OriginalCallbacks } from "./types.js";
import { createEmptyOriginalCallbacks } from "./types.js";
import { logger } from "../../utils/logger.js";
import type { Question } from "../../question/types.js";

export interface PlatformRouterConfig {
  platformName: string;
  isActive: () => boolean;
  handlers: {
    onComplete: (sessionId: string, messageId: string, messageText: string) => void;
    onTool: (toolInfo: import("../../summary/aggregator.js").ToolInfo) => void;
    onThinking: (sessionId: string) => void;
    onTokens: (tokens: import("../../summary/aggregator.js").TokensInfo) => void;
    onSessionError: (sessionId: string, message: string) => void;
    onSessionRetry: (retryInfo: import("../../summary/aggregator.js").SessionRetryInfo) => void;
    onSessionIdle: (sessionId: string) => void;
    onPermission: (request: import("../../permission/types.js").PermissionRequest) => void;
    onQuestion: (questions: Question[], requestID: string) => void;
    onQuestionError: () => void;
  };
}

type EventCallbackSetter = (callback: OriginalCallbacks[keyof OriginalCallbacks]) => void;

export class PlatformEventRouter {
  private config: PlatformRouterConfig;
  private originalCallbacks: OriginalCallbacks;
  private callbacksInstalled: boolean = false;

  constructor(config: PlatformRouterConfig) {
    this.config = config;
    this.originalCallbacks = createEmptyOriginalCallbacks();
  }

  install(): void {
    if (this.callbacksInstalled) return;
    this.callbacksInstalled = true;

    this.patchCallback("setOnComplete", "onComplete", this.config.handlers.onComplete);
    this.patchCallback("setOnTool", "onTool", this.config.handlers.onTool);
    this.patchCallback("setOnThinking", "onThinking", this.config.handlers.onThinking);
    this.patchCallback("setOnTokens", "onTokens", this.config.handlers.onTokens);
    this.patchCallback("setOnSessionError", "onSessionError", this.config.handlers.onSessionError);
    this.patchCallback("setOnSessionRetry", "onSessionRetry", this.config.handlers.onSessionRetry);
    this.patchCallback("setOnSessionIdle", "onSessionIdle", this.config.handlers.onSessionIdle);
    this.patchCallback("setOnPermission", "onPermission", this.config.handlers.onPermission);
    this.patchCallback("setOnQuestion", "onQuestion", this.config.handlers.onQuestion);
    this.patchCallback(
      "setOnQuestionError",
      "onQuestionError",
      this.config.handlers.onQuestionError,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aggregator = summaryAggregator as any;
    aggregator.setOnComplete(null);
    aggregator.setOnTool(null);
    aggregator.setOnThinking(null);
    aggregator.setOnTokens(null);
    aggregator.setOnSessionError(null);
    aggregator.setOnSessionRetry(null);
    aggregator.setOnSessionIdle(null);
    aggregator.setOnPermission(null);
    aggregator.setOnQuestion(null);
    aggregator.setOnQuestionError(null);

    logger.info(`[${this.config.platformName}] Event routing callbacks installed`);
  }

  private patchCallback<K extends keyof OriginalCallbacks>(
    setterName: string,
    callbackKey: K,
    platformHandler: OriginalCallbacks[K] extends ((...args: infer A) => void) | null
      ? (...args: A) => void
      : never,
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aggregator = summaryAggregator as any;
    const originalSetter: EventCallbackSetter = aggregator[setterName].bind(aggregator);

    aggregator[setterName] = (otherCallback: OriginalCallbacks[K]) => {
      this.originalCallbacks[callbackKey] = otherCallback;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      originalSetter((...args: any[]) => {
        if (this.config.isActive()) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (platformHandler as (...a: any[]) => void)(...args);
        } else if (otherCallback) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (otherCallback as (...a: any[]) => void)(...args);
        }
      });
    };
  }

  getOriginalCallbacks(): OriginalCallbacks {
    return this.originalCallbacks;
  }
}
