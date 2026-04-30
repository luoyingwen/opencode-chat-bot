import { buildConversationRouteKey } from "../core/runtime/route-key.js";
import type { OpenClawPluginEventContext, OpenClawRoute } from "./types.js";

function normalizeRoutePart(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

export function createOpenClawRoute(
  event: unknown,
  context: OpenClawPluginEventContext,
): OpenClawRoute {
  const record = event && typeof event === "object" ? (event as Record<string, unknown>) : {};

  return {
    channelId: normalizeRoutePart(context.channelId ?? record.channel, "openclaw"),
    accountId: normalizeRoutePart(context.accountId, "unknown-account"),
    conversationId: normalizeRoutePart(context.conversationId, "unknown-conversation"),
  };
}

export function getOpenClawRouteKey(route: OpenClawRoute): string {
  return buildConversationRouteKey(route);
}

export function getOpenClawFlowKey(route: OpenClawRoute): string {
  return getOpenClawRouteKey(route);
}
