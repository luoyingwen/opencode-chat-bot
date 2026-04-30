import { buildConversationRouteKey } from "../core/runtime/route-key.js";
import {
  handleTextTaskCommand,
  handleTextTaskInput,
  isTextTaskFlowActive,
} from "../core/text-interactions/task-flow.js";

function getFlowKey(userId: string, chatId: string): string {
  return buildConversationRouteKey({
    channelId: "feishu",
    accountId: userId,
    conversationId: chatId,
  });
}

export async function handleTaskCommand(userId: string, chatId: string): Promise<string> {
  return handleTextTaskCommand(getFlowKey(userId, chatId));
}

export async function handleTaskTextInput(
  userId: string,
  chatId: string,
  text: string,
): Promise<string | null> {
  return handleTextTaskInput(getFlowKey(userId, chatId), text);
}

export function isUserInTaskFlow(userId: string, chatId: string): boolean {
  return isTextTaskFlowActive(getFlowKey(userId, chatId));
}
