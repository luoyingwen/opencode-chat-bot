import {
  clearConversationState,
  getConversationState,
  updateConversationState,
} from "../../settings/manager.js";
import type {
  ConversationRoute,
  ConversationRuntime,
  ConversationState,
  ConversationStatePatch,
} from "./types.js";

export class SettingsConversationRuntime implements ConversationRuntime {
  getRouteKey(route: ConversationRoute): string {
    const parts = [route.channelId ?? "global", route.accountId ?? "global"];

    if (route.conversationId) {
      parts.push(route.conversationId);
    }

    return parts.join(":");
  }

  async get(route: ConversationRoute): Promise<ConversationState> {
    const state = getConversationState(this.getRouteKey(route));

    return {
      routeKey: this.getRouteKey(route),
      currentProject: state?.currentProject,
      currentSession: state?.currentSession,
      currentAgent: state?.currentAgent,
      currentModel: state?.currentModel,
      interceptMode: state?.interceptMode,
      metadata: state?.metadata,
    };
  }

  async update(route: ConversationRoute, patch: ConversationStatePatch): Promise<ConversationState> {
    updateConversationState(this.getRouteKey(route), patch);
    return this.get(route);
  }

  async clear(route: ConversationRoute): Promise<void> {
    clearConversationState(this.getRouteKey(route));
  }
}

export const settingsConversationRuntime = new SettingsConversationRuntime();