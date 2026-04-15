/**
 * Feishu commands implementation
 * /commands - list available commands
 * /command <index> - execute command by index
 */

import { opencodeClient } from "../opencode/client.js";
import { getCurrentSession } from "../session/manager.js";
import { getCurrentProject } from "../settings/manager.js";
import { logger } from "../utils/logger.js";
import { t } from "../i18n/index.js";

export interface CommandItem {
  name: string;
  description: string;
}

// In-memory cache for command lists (userId -> commands)
const commandsCache = new Map<string, CommandItem[]>();

/**
 * Get cached commands for user
 */
export function getCachedCommands(userId: string): CommandItem[] | null {
  return commandsCache.get(userId) ?? null;
}

/**
 * Cache commands for user
 */
export function cacheCommands(userId: string, commands: CommandItem[]): void {
  commandsCache.set(userId, commands);
}

/**
 * Clear cached commands for user
 */
export function clearCommandsCache(userId: string): void {
  commandsCache.delete(userId);
}

/**
 * Handle /commands command - returns formatted list
 */
export async function handleCommandsCommand(chatId: string, userId: string): Promise<string> {
  const currentProject = getCurrentProject();
  if (!currentProject) {
    return t("bot.project_not_selected");
  }

  try {
    const { data, error } = await opencodeClient.command.list({
      directory: currentProject.worktree.replace(/\\/g, "/"),
    });

    if (error || !data || data.length === 0) {
      return t("commands.empty");
    }

    const commands: CommandItem[] = data
      .filter((cmd) => typeof cmd.name === "string" && cmd.name.trim().length > 0)
      .map((cmd) => ({
        name: cmd.name,
        description: cmd.description?.trim() || t("commands.no_description"),
      }));

    if (commands.length === 0) {
      return t("commands.empty");
    }

    // Cache commands for later selection
    cacheCommands(userId, commands);

    return formatCommandsList(commands);
  } catch (err) {
    logger.error("[Feishu Commands] Error fetching commands:", err);
    return t("commands.fetch_error");
  }
}

/**
 * Handle /command <index> - execute command by index
 */
export async function handleCommandByIndex(
  chatId: string,
  userId: string,
  indexStr: string,
  args: string = "",
): Promise<string> {
  const currentProject = getCurrentProject();
  if (!currentProject) {
    return t("bot.project_not_selected");
  }

  const currentSession = getCurrentSession();
  if (!currentSession) {
    return t("status.session_not_selected");
  }

  // Parse index
  const index = parseInt(indexStr.trim(), 10);
  if (isNaN(index) || index < 1) {
    return t("commands.invalid_number", { min: "1", max: "?" });
  }

  // Get cached commands or fetch new
  let commands = getCachedCommands(userId);
  if (!commands) {
    try {
      const { data, error } = await opencodeClient.command.list({
        directory: currentProject.worktree.replace(/\\/g, "/"),
      });

      if (error || !data) {
        return t("commands.fetch_error");
      }

      commands = data
        .filter((cmd) => typeof cmd.name === "string" && cmd.name.trim().length > 0)
        .map((cmd) => ({
          name: cmd.name,
          description: cmd.description?.trim() || t("commands.no_description"),
        }));

      cacheCommands(userId, commands);
    } catch (err) {
      logger.error("[Feishu Commands] Error fetching commands:", err);
      return t("commands.fetch_error");
    }
  }

  if (index > commands.length) {
    return t("commands.invalid_number", { min: "1", max: String(commands.length) });
  }

  const command = commands[index - 1];

  try {
    // Send executing message
    const cmdText = args.trim() ? `/${command.name} ${args.trim()}` : `/${command.name}`;

    // Execute command
    await opencodeClient.session.command({
      sessionID: currentSession.id,
      directory: currentProject.worktree,
      command: command.name,
      arguments: args.trim(),
    });

    logger.info(`[Feishu Commands] Executed: ${cmdText}`);

    return `⚡ ${t("commands.executing_prefix")}\n\`${cmdText}\``;
  } catch (error) {
    logger.error("[Feishu Commands] Execution error:", error);
    return t("commands.execute_error");
  }
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
  lines.push("Use `/command <number>` to execute a command.");
  lines.push("Use `/command <number> [args]` to execute with arguments.");

  return lines.join("\n");
}
