import { ensureOpenCodeEventSubscription } from "../core/execution/event-subscription.js";
import { getConversationState } from "../settings/manager.js";
import { executeCommandByIndexForRoute, listCommandsForRoute } from "../shared/commands-flow.js";
import { summaryAggregator } from "../summary/aggregator.js";
import type { OpenClawRoute } from "./types.js";
import { getOpenClawFlowKey, getOpenClawRouteKey } from "./route.js";
import { installOpenClawEventRouting, setOpenClawActive } from "./events.js";

export async function handleOpenClawCommandsCommand(route: OpenClawRoute): Promise<string> {
  const flowKey = getOpenClawFlowKey(route);
  return listCommandsForRoute(flowKey, getOpenClawRouteKey(route));
}

export async function handleOpenClawCommandByIndex(
  route: OpenClawRoute,
  indexStr: string,
  args: string = "",
): Promise<string> {
  const flowKey = getOpenClawFlowKey(route);
  const routeKey = getOpenClawRouteKey(route);
  await prepareOpenClawCommandExecution(route, routeKey);
  return executeCommandByIndexForRoute(flowKey, routeKey, indexStr, args);
}

async function prepareOpenClawCommandExecution(
  route: OpenClawRoute,
  routeKey: string,
): Promise<void> {
  const currentSession = getConversationState(routeKey)?.currentSession;
  if (!currentSession) {
    return;
  }

  await ensureOpenCodeEventSubscription("OpenClaw", currentSession.directory);
  installOpenClawEventRouting();
  summaryAggregator.setSession(currentSession.id);
  setOpenClawActive({
    route,
    routeKey,
    sessionId: currentSession.id,
    directory: currentSession.directory,
  });
}
