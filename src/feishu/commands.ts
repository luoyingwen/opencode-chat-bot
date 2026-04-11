/**
 * Feishu commands implementation
 * Thin wrapper around shared commands flow logic
 */

import {
  CommandsFlowManager,
  startCommandsFlow,
  processCommandsInput,
} from "../shared/commands-flow.js";
import { getCurrentSession } from "../session/manager.js";
import { getCurrentProject } from "../settings/manager.js";
import { opencodeClient } from "../opencode/client.js";
import { logger } from "../utils/logger.js";
import { t } from "../i18n/index.js";

// Singleton manager instance
const commandsManager = new CommandsFlowManager();

/**
 * Handle /commands command - returns message to send
 */
export async function handleCommandsCommand(chatId: string, userId: string): Promise<string> {
  // chatId is not used in the flow but kept for API consistency
  return startCommandsFlow(commandsManager, userId);
}

/**
 * Handle text input in commands flow - returns message to send or null if not in flow
 */
export async function handleCommandsTextInput(
  chatId: string,
  userId: string,
  text: string,
): Promise<string | null> {
  const result = processCommandsInput(commandsManager, userId, text);

  switch (result.type) {
    case "null":
      return null;

    case "message":
      return result.message;

    case "execute":
      if (result.commandName) {
        try {
          await executeFeishuCommand(chatId, userId, result.commandName, result.args ?? "");
          return result.message ?? null;
        } catch (error) {
          logger.error("[Feishu Commands] Execution error:", error);
          return t("commands.execute_error");
        }
      }
      return result.message ?? null;

    default:
      return null;
  }
}

/**
 * Execute OpenCode command for Feishu
 */
async function executeFeishuCommand(
  chatId: string,
  userId: string,
  commandName: string,
  args: string,
): Promise<void> {
  const currentProject = getCurrentProject();
  if (!currentProject) {
    throw new Error("No project selected");
  }

  const currentSession = getCurrentSession();
  if (!currentSession) {
    throw new Error("No session available");
  }

  await opencodeClient.session.command({
    sessionID: currentSession.id,
    directory: currentProject.worktree,
    command: commandName,
    arguments: args,
  });

  logger.info(`[Feishu Commands] Executed: /${commandName} ${args}`);
}

/**
 * Check if user is in commands flow
 */
export function isUserInCommandsFlow(userId: string): boolean {
  return commandsManager.isInFlow(userId);
}

/**
 * Clear commands flow state for user
 */
export function clearFeishuCommandsState(userId: string): void {
  commandsManager.clearState(userId);
}
