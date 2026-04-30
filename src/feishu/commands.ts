/**
 * Feishu commands implementation
 * /commands - list available commands
 * /command <index> - execute command by index
 */

import { ensureOpenCodeEventSubscription } from "../core/execution/event-subscription.js";
import { buildConversationRouteKey } from "../core/runtime/route-key.js";
import { getConversationState } from "../settings/manager.js";
import {
  listCommandsForRoute,
  executeCommandByIndexForRoute,
} from "../shared/commands-flow.js";
import { summaryAggregator } from "../summary/aggregator.js";
import { installFeishuEventRouting, setFeishuActive } from "./events.js";

function getFlowKey(chatId: string, userId: string): string {
  return buildConversationRouteKey({
    channelId: "feishu",
    accountId: userId,
    conversationId: chatId,
  });
}

/**
 * Handle /commands command - returns formatted list
 */
export async function handleCommandsCommand(chatId: string, userId: string): Promise<string> {
  const flowKey = getFlowKey(chatId, userId);
  return listCommandsForRoute(flowKey, flowKey);
}

/**
 * Handle /command <index> - execute command by index
 */
export async function handleCommandByIndex(
  chatId: string,
  userId: string,
  indexStr: string,
  args: string = "",
): Promise<string> {
  const flowKey = getFlowKey(chatId, userId);
  await prepareFeishuCommandExecution(chatId, userId, flowKey);
  return executeCommandByIndexForRoute(flowKey, flowKey, indexStr, args);
}

async function prepareFeishuCommandExecution(
  chatId: string,
  userId: string,
  routeKey: string,
): Promise<void> {
  const currentSession = getConversationState(routeKey)?.currentSession;
  if (!currentSession) {
    return;
  }

  await ensureOpenCodeEventSubscription("Feishu", currentSession.directory);
  installFeishuEventRouting();
  summaryAggregator.setSession(currentSession.id);
  setFeishuActive({
    chatId,
    userId,
    routeKey,
    sessionId: currentSession.id,
    directory: currentSession.directory,
  });
}

