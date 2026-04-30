import {
  clearTextTaskListFlow,
  handleTextTaskListCommand,
  handleTextTaskListInput,
  isTextTaskListFlowActive,
} from "../core/text-interactions/tasklist-flow.js";
import type { OpenClawRoute } from "./types.js";
import { getOpenClawFlowKey } from "./route.js";

export async function handleOpenClawTaskListCommand(route: OpenClawRoute): Promise<string> {
  return handleTextTaskListCommand(getOpenClawFlowKey(route));
}

export async function handleOpenClawTaskListTextInput(
  route: OpenClawRoute,
  text: string,
): Promise<string | null> {
  return handleTextTaskListInput(getOpenClawFlowKey(route), text);
}

export function isOpenClawTaskListFlowActive(route: OpenClawRoute): boolean {
  return isTextTaskListFlowActive(getOpenClawFlowKey(route));
}

export function clearOpenClawTaskListState(route: OpenClawRoute): void {
  clearTextTaskListFlow(getOpenClawFlowKey(route));
}
