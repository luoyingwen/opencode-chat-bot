import { buildConversationRouteKey } from "../core/runtime/route-key.js";
import {
  clearTextTaskListFlow,
  handleTextTaskListCommand,
  handleTextTaskListInput,
  isTextTaskListFlowActive,
} from "../core/text-interactions/tasklist-flow.js";

function getFlowKey(userId: string): string {
  return buildConversationRouteKey({ channelId: "dingtalk", accountId: userId });
}

export async function handleTaskListCommand(userId: string): Promise<string> {
  return handleTextTaskListCommand(getFlowKey(userId));
}

export async function handleTaskListTextInput(userId: string, text: string): Promise<string | null> {
  return handleTextTaskListInput(getFlowKey(userId), text);
}

export function isUserInTaskListFlow(userId: string): boolean {
  return isTextTaskListFlowActive(getFlowKey(userId));
}

export function clearDingTalkTaskListState(userId: string): void {
  clearTextTaskListFlow(getFlowKey(userId));
}
