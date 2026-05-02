import type { ToolInfo, TokensInfo, SessionRetryInfo } from "../../summary/aggregator.js";
import type { PermissionRequest } from "../../permission/types.js";

export interface OriginalCallbacks {
  onComplete: ((sessionId: string, messageId: string, messageText: string) => void) | null;
  onTool: ((toolInfo: ToolInfo) => void) | null;
  onThinking: ((sessionId: string) => void) | null;
  onTokens: ((tokens: TokensInfo) => void) | null;
  onSessionError: ((sessionId: string, message: string) => void) | null;
  onSessionRetry: ((retryInfo: SessionRetryInfo) => void) | null;
  onSessionIdle: ((sessionId: string) => void) | null;
  onPermission: ((request: PermissionRequest) => void) | null;
}

export const createEmptyOriginalCallbacks = (): OriginalCallbacks => ({
  onComplete: null,
  onTool: null,
  onThinking: null,
  onTokens: null,
  onSessionError: null,
  onSessionRetry: null,
  onSessionIdle: null,
  onPermission: null,
});

export interface PlatformEventTarget {
  sessionId: string;
}