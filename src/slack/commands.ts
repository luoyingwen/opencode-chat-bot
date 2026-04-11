/**
 * Slack commands implementation
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
export async function handleCommandsCommand(userId: string): Promise<string> {
  return startCommandsFlow(commandsManager, userId);
}

/**
 * Handle text input in commands flow - returns message to send or null if not in flow
 */
export async function handleCommandsTextInput(
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
          await executeSlackCommand(userId, result.commandName, result.args ?? "");
          return result.message;
        } catch (error) {
          logger.error("[Slack Commands] Execution error:", error);
          return t("commands.execute_error");
        }
      }
      return result.message;

    default:
      return null;
  }
}

/**
 * Execute OpenCode command for Slack
 */
async function executeSlackCommand(
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

  logger.info(`[Slack Commands] Executed: /${commandName} ${args}`);
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
export function clearSlackCommandsState(userId: string): void {
  commandsManager.clearState(userId);
}
