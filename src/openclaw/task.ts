import {
  clearTextTaskFlow,
  handleTextTaskCommand,
  handleTextTaskInput,
  isTextTaskFlowActive,
} from "../core/text-interactions/task-flow.js";
import type { OpenClawRoute } from "./types.js";
import { getOpenClawFlowKey } from "./route.js";

export async function handleOpenClawTaskCommand(route: OpenClawRoute): Promise<string> {
  return handleTextTaskCommand(getOpenClawFlowKey(route));
}

export async function handleOpenClawTaskTextInput(
  route: OpenClawRoute,
  text: string,
): Promise<string | null> {
  return handleTextTaskInput(getOpenClawFlowKey(route), text);
}

export function isOpenClawTaskFlowActive(route: OpenClawRoute): boolean {
  return isTextTaskFlowActive(getOpenClawFlowKey(route));
}

export function clearOpenClawTaskState(route: OpenClawRoute): void {
  clearTextTaskFlow(getOpenClawFlowKey(route));
}
