import { buildConversationRouteKey } from "../core/runtime/route-key.js";
import {
  clearTextTaskFlow,
  handleTextTaskCommand,
  handleTextTaskInput,
  isTextTaskFlowActive,
} from "../core/text-interactions/task-flow.js";

function getFlowKey(userId: string): string {
  return buildConversationRouteKey({ channelId: "dingtalk", accountId: userId });
}

export async function handleTaskCommand(userId: string): Promise<string> {
  return handleTextTaskCommand(getFlowKey(userId));
}

export async function handleTaskTextInput(userId: string, text: string): Promise<string | null> {
  return handleTextTaskInput(getFlowKey(userId), text);
}

export function isUserInTaskFlow(userId: string): boolean {
  return isTextTaskFlowActive(getFlowKey(userId));
}

export function clearDingTalkTaskState(userId: string): void {
  clearTextTaskFlow(getFlowKey(userId));
}
