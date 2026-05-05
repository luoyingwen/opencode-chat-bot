/**
 * DingTalk commands implementation
 * /commands - list available commands
 * /command <index> - execute command by index
 */

import { ensureOpenCodeEventSubscription } from "../core/execution/event-subscription.js";
import { buildConversationRouteKey } from "../core/runtime/route-key.js";
import { getConversationState } from "../settings/manager.js";
import { listCommandsForRoute, executeCommandByIndexForRoute } from "../shared/commands-flow.js";
import { summaryAggregator } from "../summary/aggregator.js";
import { installDingTalkEventRouting, setDingTalkActive } from "./events.js";

function getFlowKey(userId: string): string {
  return buildConversationRouteKey({ channelId: "dingtalk", accountId: userId });
}

/**
 * Handle /commands command - returns formatted list
 */
export async function handleCommandsCommand(userId: string): Promise<string> {
  const flowKey = getFlowKey(userId);
  return listCommandsForRoute(flowKey, flowKey);
}

/**
 * Handle /command <index> - execute command by index
 */
export async function handleCommandByIndex(
  userId: string,
  indexStr: string,
  args: string = "",
): Promise<string> {
  const flowKey = getFlowKey(userId);
  await prepareDingTalkCommandExecution(userId, flowKey);
  return executeCommandByIndexForRoute(flowKey, flowKey, indexStr, args);
}

async function prepareDingTalkCommandExecution(userId: string, routeKey: string): Promise<void> {
  const currentSession = getConversationState(routeKey)?.currentSession;
  if (!currentSession) {
    return;
  }

  await ensureOpenCodeEventSubscription("DingTalk", currentSession.directory);
  installDingTalkEventRouting();
  summaryAggregator.setSession(currentSession.id);
  setDingTalkActive({
    userId,
    routeKey,
    sessionId: currentSession.id,
    directory: currentSession.directory,
  });
}
