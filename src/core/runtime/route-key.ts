import type { ConversationRoute } from "./types.js";

export function buildConversationRouteKey(route: ConversationRoute): string {
  const parts = [route.channelId ?? "global", route.accountId ?? "global"];

  if (route.conversationId) {
    parts.push(route.conversationId);
  }

  return parts.join(":");
}
