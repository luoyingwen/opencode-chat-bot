/**
 * Shared commands flow logic for DingTalk and Feishu
 * Platform-agnostic core implementation
 */

import { opencodeClient } from "../opencode/client.js";
import { isTextInteractionCancelInput } from "../core/text-interactions/cancel.js";
import { getConversationState } from "../settings/manager.js";
import { logger } from "../utils/logger.js";
import { t } from "../i18n/index.js";

export interface CommandItem {
  name: string;
  description: string;
}

export interface CommandsFlowState {
  stage: "list";
  projectDirectory: string;
  commands: CommandItem[];
  lastActivity: number;
}

export interface CommandsFlowResult {
  type: "message" | "execute" | "null";
  message: string | null;
  commandName: string | null;
  args: string | null;
}

export type ExecuteCommandCallback = (commandName: string, args: string) => Promise<void>;

const STATE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const commandsCache = new Map<string, CommandItem[]>();

function getCommandsCache(cacheKey: string): CommandItem[] | null {
  return commandsCache.get(cacheKey) ?? null;
}

function setCommandsCache(cacheKey: string, commands: CommandItem[]): void {
  commandsCache.set(cacheKey, commands);
}

function getProjectDirectory(routeKey: string): string | null {
  const currentProject = getConversationState(routeKey)?.currentProject;
  return currentProject?.worktree ?? null;
}

function getCurrentSessionId(routeKey: string): string | null {
  return getConversationState(routeKey)?.currentSession?.id ?? null;
}

async function fetchCommands(directory: string): Promise<CommandItem[] | null> {
  const { data, error } = await opencodeClient.command.list({
    directory: directory.replace(/\\/g, "/"),
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  const commands = data
    .filter((cmd) => typeof cmd.name === "string" && cmd.name.trim().length > 0)
    .map((cmd) => ({
      name: cmd.name,
      description: cmd.description?.trim() || t("commands.no_description"),
    }));

  return commands.length > 0 ? commands : null;
}

export async function listCommandsForRoute(cacheKey: string, routeKey: string): Promise<string> {
  const projectDirectory = getProjectDirectory(routeKey);
  if (!projectDirectory) {
    return t("bot.project_not_selected");
  }

  try {
    const commands = await fetchCommands(projectDirectory);
    if (!commands) {
      return t("commands.empty");
    }

    setCommandsCache(cacheKey, commands);
    return formatCommandsList(commands);
  } catch (err) {
    logger.error("[CommandsFlow] Error fetching commands:", err);
    return t("commands.fetch_error");
  }
}

export async function executeCommandByIndexForRoute(
  cacheKey: string,
  routeKey: string,
  indexStr: string,
  args: string = "",
): Promise<string> {
  const projectDirectory = getProjectDirectory(routeKey);
  if (!projectDirectory) {
    return t("bot.project_not_selected");
  }

  const currentSessionId = getCurrentSessionId(routeKey);
  if (!currentSessionId) {
    return t("status.session_not_selected");
  }

  const index = parseInt(indexStr.trim(), 10);
  if (isNaN(index) || index < 1) {
    return t("commands.invalid_number", { min: "1", max: "?" });
  }

  try {
    let commands = getCommandsCache(cacheKey);
    if (!commands) {
      commands = await fetchCommands(projectDirectory);
      if (!commands) {
        return t("commands.fetch_error");
      }

      setCommandsCache(cacheKey, commands);
    }

    if (index > commands.length) {
      return t("commands.invalid_number", { min: "1", max: String(commands.length) });
    }

    const command = commands[index - 1];
    return executeResolvedCommand(routeKey, projectDirectory, currentSessionId, command.name, args);
  } catch (err) {
    logger.error("[CommandsFlow] Execution error:", err);
    return t("commands.execute_error");
  }
}

export async function executeCommandByNameForRoute(
  routeKey: string,
  commandName: string,
  args: string = "",
): Promise<string> {
  const projectDirectory = getProjectDirectory(routeKey);
  if (!projectDirectory) {
    return t("bot.project_not_selected");
  }

  const currentSessionId = getCurrentSessionId(routeKey);
  if (!currentSessionId) {
    return t("status.session_not_selected");
  }

  try {
    return executeResolvedCommand(routeKey, projectDirectory, currentSessionId, commandName, args);
  } catch (err) {
    logger.error("[CommandsFlow] Execution error:", err);
    return t("commands.execute_error");
  }
}

async function executeResolvedCommand(
  routeKey: string,
  projectDirectory: string,
  currentSessionId: string,
  commandName: string,
  args: string,
): Promise<string> {
  const trimmedArgs = args.trim();

  await opencodeClient.session.command({
    sessionID: currentSessionId,
    directory: projectDirectory,
    command: commandName,
    arguments: trimmedArgs,
  });

  logger.info(`[CommandsFlow] Executed route=${routeKey} command=/${commandName}`);
  return formatExecutingMessage(commandName, trimmedArgs);
}

/**
 * Generic state manager for commands flow
 */
export class CommandsFlowManager {
  private states = new Map<string, CommandsFlowState>();

  getState(userId: string): CommandsFlowState | null {
    const state = this.states.get(userId);
    if (!state) return null;

    if (Date.now() - state.lastActivity > STATE_TIMEOUT_MS) {
      this.states.delete(userId);
      return null;
    }

    return state;
  }

  setState(userId: string, state: CommandsFlowState): void {
    this.states.set(userId, state);
  }

  clearState(userId: string): void {
    this.states.delete(userId);
  }

  isInFlow(userId: string): boolean {
    return this.getState(userId) !== null;
  }

  updateActivity(userId: string): void {
    const state = this.getState(userId);
    if (state) {
      state.lastActivity = Date.now();
    }
  }
}

/**
 * Start commands flow - returns the initial list message
 */
export async function startCommandsFlow(
  manager: CommandsFlowManager,
  flowKey: string,
  routeKey: string,
): Promise<string> {
  const projectDirectory = getProjectDirectory(routeKey);
  if (!projectDirectory) {
    return t("bot.project_not_selected");
  }

  try {
    const commands = await fetchCommands(projectDirectory);
    if (!commands) {
      return t("commands.empty");
    }

    setCommandsCache(flowKey, commands);

    manager.setState(flowKey, {
      stage: "list",
      projectDirectory,
      commands,
      lastActivity: Date.now(),
    });

    return formatCommandsList(commands);
  } catch (err) {
    logger.error("[CommandsFlow] Error starting flow:", err);
    return t("commands.fetch_error");
  }
}

/**
 * Handle text input in list stage
 */
function handleListStage(
  manager: CommandsFlowManager,
  userId: string,
  state: CommandsFlowState,
  input: string,
): CommandsFlowResult {
  const trimmedInput = input.trim().toLowerCase();

  // Check cancel
  if (isTextInteractionCancelInput(trimmedInput)) {
    manager.clearState(userId);
    return {
      type: "message",
      message: t("commands.cancelled_callback"),
      commandName: null,
      args: null,
    };
  }

  // Parse command number
  const cmdNumber = parseInt(input.trim(), 10);
  if (isNaN(cmdNumber) || cmdNumber < 1 || cmdNumber > state.commands.length) {
    return {
      type: "message",
      message: `⚠️ ${t("commands.invalid_number", { min: "1", max: String(state.commands.length) })}`,
      commandName: null,
      args: null,
    };
  }

  const selectedCommand = state.commands[cmdNumber - 1];

  manager.clearState(userId);

  return {
    type: "execute",
    message: formatExecutingMessage(selectedCommand.name, ""),
    commandName: selectedCommand.name,
    args: "",
  };
}

/**
 * Process text input in commands flow
 */
export function processCommandsInput(
  manager: CommandsFlowManager,
  userId: string,
  input: string,
): CommandsFlowResult {
  const state = manager.getState(userId);
  if (!state) {
    return { type: "null", message: null, commandName: null, args: null };
  }

  manager.updateActivity(userId);

  if (state.stage === "list") {
    return handleListStage(manager, userId, state, input);
  }

  return { type: "null", message: null, commandName: null, args: null };
}

/**
 * Format commands list message
 */
function formatCommandsList(commands: CommandItem[]): string {
  const lines: string[] = [];
  lines.push(`📋 **OpenCode Commands** (${commands.length} available)\n`);

  commands.forEach((cmd, index) => {
    lines.push(`${index + 1}. /${cmd.name} — ${cmd.description}`);
  });

  lines.push("");
  lines.push(t("commands.hint_select"));

  return lines.join("\n");
}

/**
 * Format executing message
 */
function formatExecutingMessage(commandName: string, args: string): string {
  const cmdText = args ? `/${commandName} ${args}` : `/${commandName}`;
  return `⚡ ${t("commands.executing_prefix")}\n\`${cmdText}\``;
}
