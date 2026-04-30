import type { ModelInfo } from "../../model/types.js";
import type { ProjectInfo, SessionInfo } from "../../settings/manager.js";

export interface ConversationRoute {
  channelId?: string;
  accountId?: string;
  conversationId?: string;
}

export interface ConversationState {
  routeKey: string;
  currentProject?: ProjectInfo;
  currentSession?: SessionInfo;
  currentAgent?: string;
  currentModel?: ModelInfo;
  interceptMode?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ConversationStatePatch {
  currentProject?: ProjectInfo | null;
  currentSession?: SessionInfo | null;
  currentAgent?: string | null;
  currentModel?: ModelInfo | null;
  interceptMode?: boolean | null;
  metadata?: Record<string, unknown> | null;
}

export interface ConversationRuntime {
  get(route: ConversationRoute): Promise<ConversationState>;
  update(route: ConversationRoute, patch: ConversationStatePatch): Promise<ConversationState>;
  clear(route: ConversationRoute): Promise<void>;
  getRouteKey(route: ConversationRoute): string;
}