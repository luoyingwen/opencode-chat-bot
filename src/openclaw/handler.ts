import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { executeOpenCodeCommand } from "../core/commands/index.js";
import { executeTextPrompt } from "../core/execution/text-prompt.js";
import { defaultOpenCodeGateway } from "../core/opencode/default-gateway.js";
import { settingsConversationRuntime } from "../core/runtime/settings-runtime.js";
import { handleRenameTextInput, renameSessionTitle } from "../core/text-interactions/rename.js";
import { interactionManager } from "../interaction/manager.js";
import { clearAllInteractionState } from "../interaction/cleanup.js";
import { getAvailableAgents, getStoredAgent, selectAgent } from "../agent/manager.js";
import { getAgentDisplayName } from "../agent/types.js";
import { isAutoConfirmEnabled, setAutoConfirm } from "../permission/auto-confirm.js";
import { stopEventListening } from "../opencode/events.js";
import { renameManager } from "../rename/manager.js";
import { setScheduledTaskNotificationCallback } from "../scheduled-task/runtime.js";
import { summaryAggregator } from "../summary/aggregator.js";
import { t } from "../i18n/index.js";
import { logger } from "../utils/logger.js";
import { initializeSharedRuntime } from "../app/initialize-shared-runtime.js";
import { initOpenClawClient, sendOpenClawMessage } from "./client.js";
import {
  explainOpenClawScopeMismatch,
  matchesOpenClawScope,
  readOpenClawPluginConfig,
  resolveOpenClawRuntimeConfig,
} from "./config.js";
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
  OpenClawRuntimeConfig,
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

let runtimeConfig: OpenClawRuntimeConfig | null = null;
let runtimeReady: Promise<void> | null = null;
let lastNotificationRoute: OpenClawRoute | null = null;

interface SlashCommand {
  name: string;
  args: string;
}

export function initializeOpenClawHandler(params: {
  api: OpenClawPluginApi;
  pluginConfig?: unknown;
}): void {
  const pluginConfig = readOpenClawPluginConfig(params.pluginConfig);
  runtimeConfig = resolveOpenClawRuntimeConfig(pluginConfig);
  initOpenClawClient({ api: params.api, config: runtimeConfig });

  setScheduledTaskNotificationCallback("OpenClaw", async (text: string) => {
    if (!lastNotificationRoute) {
      logger.warn("[OpenClaw] Scheduled task notification skipped: no route has been seen yet");
      return;
    }

    await sendOpenClawMessage(lastNotificationRoute, text);
  });

  runtimeReady = initializeSharedRuntime();
  logger.info(
    `[OpenClaw] Handler initialized enabled=${runtimeConfig.enabled} channels=${runtimeConfig.channels.join(",") || "all"}`,
  );
}

export async function handleOpenClawMessageReceived(
  event: unknown,
  context: OpenClawPluginEventContext,
): Promise<void> {
  const config = getRuntimeConfig();
  const route = createOpenClawRoute(event, context);
  const mismatch = explainOpenClawScopeMismatch(config, route);
  if (mismatch) {
    logger.debug(`[OpenClaw] Ignoring message_received: ${mismatch}`);
  }
}

export async function handleOpenClawBeforeDispatch(
  event: unknown,
  context: OpenClawPluginEventContext,
): Promise<OpenClawDispatchResult | undefined> {
  const config = getRuntimeConfig();

  const route = createOpenClawRoute(event, context);
  if (!matchesOpenClawScope(config, route)) {
    return undefined;
  }

  await runtimeReady;

  const text = extractOpenClawText(event);
  if (!text) {
    return undefined;
  }

  lastNotificationRoute = route;
  const resultText = await processOpenClawText(route, text);
  return resultText ? { handled: true, text: resultText } : undefined;
}

function getRuntimeConfig(): OpenClawRuntimeConfig {
  if (!runtimeConfig) {
    runtimeConfig = resolveOpenClawRuntimeConfig();
  }

  return runtimeConfig;
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

  const nextTitle = args.trim();
  if (nextTitle) {
    return renameSessionTitle(
      routeKey,
      {
        sessionId: state.currentSession.id,
        directory: state.currentSession.directory,
        currentTitle: state.currentSession.title,
      },
      nextTitle,
    );
  }

  renameManager.startWaiting(
    state.currentSession.id,
    state.currentSession.directory,
    state.currentSession.title,
    routeKey,
  );
  interactionManager.start({
    kind: "rename",
    expectedInput: "text",
    metadata: { sessionId: state.currentSession.id, userId: route.accountId },
  });

  return `${t("rename.prompt", { title: state.currentSession.title })}\n\n${t("rename.hint_abort")}`;
}

async function handleAutoConfirmCommand(route: OpenClawRoute, args: string): Promise<string> {
  const state = await settingsConversationRuntime.get(route);
  if (!state.currentSession) {
    return "❌ No active session";
  }

  const arg = args.trim().toLowerCase();
  if (arg === "on") {
    setAutoConfirm(state.currentSession.id, true);
    return "✅ Auto_confirm enabled";
  } else if (arg === "off") {
    setAutoConfirm(state.currentSession.id, false);
    return "✅ Auto_confirm disabled";
  } else {
    const status = isAutoConfirmEnabled(state.currentSession.id);
    return `Auto_confirm status: ${status ? "ON" : "OFF"}`;
  }
}

async function handleAgentListCommand(route: OpenClawRoute): Promise<string> {
  const agents = await getAvailableAgents(route);
  if (agents.length === 0) {
    return t("agent.list.empty");
  }

  const currentAgent = getStoredAgent(route);
  const list = agents
    .map((agent, index) => {
      const marker = agent.name === currentAgent ? " ✅" : "";
      return `${index + 1}. ${getAgentDisplayName(agent.name)}${marker}`;
    })
    .join("\n");

  return t("agent.list.title", {
    current: getAgentDisplayName(currentAgent),
    list,
  });
}

async function handleAgentSwitchCommand(route: OpenClawRoute, args: string): Promise<string> {
  const index = Number.parseInt(args.trim(), 10);
  if (Number.isNaN(index) || index < 1) {
    return t("agent.switch.invalid_index");
  }

  const agents = await getAvailableAgents(route);
  if (index > agents.length) {
    return t("agent.switch.invalid_index");
  }

  const selectedAgent = agents[index - 1];
  selectAgent(selectedAgent.name, route);
  return t("agent.switch.success", { name: getAgentDisplayName(selectedAgent.name) });
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
