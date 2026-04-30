import { buildConversationRouteKey } from "../core/runtime/route-key.js";
import {
  handleTextTaskListCommand,
  handleTextTaskListInput,
  isTextTaskListFlowActive,
} from "../core/text-interactions/tasklist-flow.js";

function getFlowKey(userId: string, chatId: string): string {
  return buildConversationRouteKey({
    channelId: "feishu",
    accountId: userId,
    conversationId: chatId,
  });
}

export async function handleTaskListCommand(userId: string, chatId: string): Promise<string> {
  return handleTextTaskListCommand(getFlowKey(userId, chatId));
}

export async function handleTaskListTextInput(
  userId: string,
  chatId: string,
  text: string,
): Promise<string | null> {
  return handleTextTaskListInput(getFlowKey(userId, chatId), text);
}

export function isUserInTaskListFlow(userId: string, chatId: string): boolean {
  return isTextTaskListFlowActive(getFlowKey(userId, chatId));
}
