import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { executeOpenCodeCommand } from "../core/commands/index.js";
import {
  executeAgentListCommand,
  executeAgentSwitchCommand,
  executeAutoConfirmCommand,
} from "../core/commands/shared-handlers.js";
import { executeTextPrompt } from "../core/execution/text-prompt.js";
import { defaultOpenCodeGateway } from "../core/opencode/default-gateway.js";
import { settingsConversationRuntime } from "../core/runtime/settings-runtime.js";
import { handleRenameTextInput, handleRenameFlowSetup } from "../core/text-interactions/rename.js";
import { interactionManager } from "../interaction/manager.js";
import { clearAllInteractionState } from "../interaction/cleanup.js";
import { stopEventListening } from "../opencode/events.js";
import { renameManager } from "../rename/manager.js";
import { setScheduledTaskNotificationCallback } from "../scheduled-task/runtime.js";
import { summaryAggregator } from "../summary/aggregator.js";
import { t } from "../i18n/index.js";
import { logger } from "../utils/logger.js";
import { initializeSharedRuntime } from "../app/initialize-shared-runtime.js";
import { getOpenClawLastRoute, setOpenClawLastRoute } from "../settings/manager.js";
import { initOpenClawClient, sendOpenClawMessage } from "./client.js";
import {
  clearOpenClawActive,
  handleOpenClawPermissionReply,
  hasOpenClawPendingPermission,
} from "./events.js";
import { createOpenClawTextPromptPlatform } from "./prompt-platform.js";
import { createOpenClawRoute, getOpenClawRouteKey } from "./route.js";
import type {
  OpenClawDispatchResult,
  OpenClawPluginEventContext,
  OpenClawRoute,
} from "./types.js";
import { handleOpenClawCommandByIndex, handleOpenClawCommandsCommand } from "./commands.js";
import {
  clearOpenClawTaskState,
  handleOpenClawTaskCommand,
  handleOpenClawTaskTextInput,
  isOpenClawTaskFlowActive,
} from "./task.js";
import {
  clearOpenClawTaskListState,
  handleOpenClawTaskListCommand,
  handleOpenClawTaskListTextInput,
  isOpenClawTaskListFlowActive,
} from "./tasklist.js";

const ENTER_OPENCODE_COMMAND = "opencode";
const LEAVE_OPENCODE_COMMAND = "exit";

let runtimeReady: Promise<void> | null = null;
let lastNotificationRoute: OpenClawRoute | null = null;

interface SlashCommand {
  name: string;
  args: string;
}

export function initializeOpenClawHandler(params: {
  api: OpenClawPluginApi;
}): void {
  initOpenClawClient({ api: params.api });

  setScheduledTaskNotificationCallback("OpenClaw", async (text: string) => {
    if (!lastNotificationRoute) {
      logger.warn("[OpenClaw] Scheduled task notification skipped: no route has been seen yet");
      return;
    }

    await sendOpenClawMessage(lastNotificationRoute, text);
  });

  runtimeReady = initializeSharedRuntime().then(() => {
    const persisted = getOpenClawLastRoute();
    if (persisted) {
      lastNotificationRoute = persisted;
      logger.info(
        `[OpenClaw] Restored last notification route: ${persisted.channelId}/${persisted.accountId}/${persisted.conversationId}`,
      );
    }
  });

  logger.info("[OpenClaw] Handler initialized");
}

export async function handleOpenClawMessageReceived(
  _event: unknown,
  _context: OpenClawPluginEventContext,
): Promise<void> {}

export async function handleOpenClawBeforeDispatch(
  event: unknown,
  context: OpenClawPluginEventContext,
): Promise<OpenClawDispatchResult | undefined> {
  const route = createOpenClawRoute(event, context);

  await runtimeReady;

  const text = extractOpenClawText(event);
  if (!text) {
    return undefined;
  }

  lastNotificationRoute = route;
  void setOpenClawLastRoute(route);
  const resultText = await processOpenClawText(route, text);
  return resultText ? { handled: true, text: resultText } : undefined;
}

export function extractOpenClawText(event: unknown): string | null {
  if (typeof event === "string") {
    return event.trim() || null;
  }

  if (!event || typeof event !== "object") {
    return null;
  }

  const record = event as Record<string, unknown>;
  const candidates = [record.content, record.text, record.message];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }

    if (candidate && typeof candidate === "object") {
      const nested = candidate as Record<string, unknown>;
      if (typeof nested.text === "string" && nested.text.trim()) {
        return nested.text.trim();
      }
    }
  }

  return null;
}

async function processOpenClawText(route: OpenClawRoute, text: string): Promise<string | null> {
  const routeKey = getOpenClawRouteKey(route);
  const state = await settingsConversationRuntime.get(route);

  if (text === `/${ENTER_OPENCODE_COMMAND}`) {
    await settingsConversationRuntime.update(route, {
      interceptMode: true,
      metadata: { enteredAt: new Date().toISOString() },
    });
    return t("openclaw.mode.entered");
  }

  if (text === `/${LEAVE_OPENCODE_COMMAND}`) {
    const wasActive = state.interceptMode === true;
    await settingsConversationRuntime.update(route, { interceptMode: null, metadata: null });
    clearOpenClawActive();
    return wasActive ? t("openclaw.mode.exited") : t("openclaw.mode.inactive");
  }

  if (!state.interceptMode) {
    return null;
  }

  const permissionReply = await maybeHandlePermissionReply(route, text);
  if (permissionReply) {
    return permissionReply;
  }

  const interactionReply = await maybeHandleTextInteraction(route, routeKey, text);
  if (interactionReply !== null) {
    return interactionReply;
  }

  const command = parseSlashCommand(text);
  if (command) {
    return handleSlashCommand(route, routeKey, command);
  }

  void executeOpenClawPrompt(route, text);
  return t("openclaw.processing");
}

async function maybeHandlePermissionReply(
  route: OpenClawRoute,
  text: string,
): Promise<string | null> {
  if (text !== "/1" && text !== "/2" && text !== "/3") {
    return null;
  }

  if (!hasOpenClawPendingPermission(route)) {
    return t("openclaw.no_pending_permission");
  }

  const replyMap: Record<string, "once" | "always" | "reject"> = {
    "/1": "once",
    "/2": "always",
    "/3": "reject",
  };

  return handleOpenClawPermissionReply(route, replyMap[text]);
}

async function maybeHandleTextInteraction(
  route: OpenClawRoute,
  routeKey: string,
  text: string,
): Promise<string | null> {
  if (isOpenClawTaskFlowActive(route)) {
    const response = await handleOpenClawTaskTextInput(route, text);
    if (response !== null) {
      return response;
    }
  }

  if (isOpenClawTaskListFlowActive(route)) {
    const response = await handleOpenClawTaskListTextInput(route, text);
    if (response !== null) {
      return response;
    }
  }

  if (renameManager.isWaitingForName(routeKey)) {
    const response = await handleRenameTextInput(routeKey, text);
    if (interactionManager.getSnapshot()?.kind === "rename") {
      interactionManager.clear("rename_completed");
    }
    return response;
  }

  return null;
}

async function handleSlashCommand(
  route: OpenClawRoute,
  routeKey: string,
  command: SlashCommand,
): Promise<string> {
  switch (command.name) {
    case "help":
      return formatOpenClawHelp();
    case "status":
    case "projects":
    case "project":
    case "sessions":
      return executeSharedCommand(route, command.name, command.args);
    case "session":
      if (command.args.trim().toLowerCase().startsWith("rename")) {
        return handleRenameCommand(route, routeKey, command.args.trim().slice(6).trim());
      }
      return executeSharedCommand(route, command.name, command.args);
    case "stop":
      return handleStopCommand(route, command.args);
    case "auto_confirm":
      return handleAutoConfirmCommand(route, command.args);
    case "agents":
      return handleAgentListCommand(route);
    case "agent":
      return handleAgentSwitchCommand(route, command.args);
    case "commands":
      return handleOpenClawCommandsCommand(route);
    case "command":
      return handleOpenClawCommandCommand(route, command.args);
    case "task":
      return handleOpenClawTaskCommand(route);
    case "tasks":
    case "tasklist":
      return handleOpenClawTaskListCommand(route);
    case "permission":
      return handlePermissionStatusCommand(route);
    default:
      return t("openclaw.unknown_command", { command: command.name, help: formatOpenClawHelp() });
  }
}

async function executeSharedCommand(
  route: OpenClawRoute,
  name: string,
  args: string,
): Promise<string> {
  const result = await executeOpenCodeCommand({
    route,
    userId: route.accountId,
    name,
    args,
    rawText: `/${name}${args ? ` ${args}` : ""}`,
  });

  if (!result) {
    return t("openclaw.command_failed");
  }

  if (result.effects?.projectChanged || result.effects?.sessionChanged) {
    summaryAggregator.clear();
    clearAllInteractionState("openclaw_state_switch");
  }

  return result.outputs.map((output) => output.text).join("\n\n");
}

async function handleStopCommand(route: OpenClawRoute, args: string): Promise<string> {
  if (isOpenClawTaskFlowActive(route)) {
    clearOpenClawTaskState(route);
    return t("openclaw.task_cancelled");
  }

  if (isOpenClawTaskListFlowActive(route)) {
    clearOpenClawTaskListState(route);
    return t("openclaw.tasklist_cancelled");
  }

  clearOpenClawActive();
  stopEventListening();
  summaryAggregator.clear();
  clearAllInteractionState("openclaw_stop_command");
  return executeSharedCommand(route, "stop", args);
}

async function handleRenameCommand(
  route: OpenClawRoute,
  routeKey: string,
  args: string,
): Promise<string> {
  const state = await settingsConversationRuntime.get(route);
  if (!state.currentSession) {
    return t("rename.no_session");
  }

  return handleRenameFlowSetup(routeKey, state.currentSession, route.accountId, args);
}

async function handleAutoConfirmCommand(route: OpenClawRoute, args: string): Promise<string> {
  return executeAutoConfirmCommand(route, args);
}

async function handleAgentListCommand(route: OpenClawRoute): Promise<string> {
  return executeAgentListCommand(route);
}

async function handleAgentSwitchCommand(route: OpenClawRoute, args: string): Promise<string> {
  return executeAgentSwitchCommand(route, args);
}

async function handleOpenClawCommandCommand(route: OpenClawRoute, args: string): Promise<string> {
  const parts = args.trim().split(/\s+/, 2);
  const index = parts[0] ?? "";
  const commandArgs = parts[1] ?? "";
  return handleOpenClawCommandByIndex(route, index, commandArgs);
}

function handlePermissionStatusCommand(route: OpenClawRoute): string {
  if (hasOpenClawPendingPermission(route)) {
    return t("openclaw.permission_pending");
  }

  return t("openclaw.permission_hint");
}

async function executeOpenClawPrompt(route: OpenClawRoute, text: string): Promise<void> {
  try {
    await executeTextPrompt({
      route,
      userId: route.accountId,
      text,
      runtime: settingsConversationRuntime,
      gateway: defaultOpenCodeGateway,
      platform: createOpenClawTextPromptPlatform(route),
    });
  } catch (error) {
    logger.error("[OpenClaw] Error processing prompt", error);
    await sendOpenClawMessage(route, t("openclaw.prompt_error"));
    clearOpenClawActive();
  }
}

function parseSlashCommand(text: string): SlashCommand | null {
  const match = /^\/([^\s]+)(?:\s+(.*))?$/u.exec(text.trim());
  if (!match) {
    return null;
  }

  return {
    name: match[1].toLowerCase(),
    args: match[2]?.trim() ?? "",
  };
}

function formatOpenClawHelp(): string {
  return t("openclaw.help");
}
