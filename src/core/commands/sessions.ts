import { logger } from "../../utils/logger.js";
import type { CommandContext, CommandHandler, CommandResult } from "./types.js";

function sortSessionsByRecent<T extends { time?: { updated?: number } }>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => {
    const timeA = a.time?.updated ?? 0;
    const timeB = b.time?.updated ?? 0;
    return timeB - timeA;
  });
}

export class SessionsCommandHandler implements CommandHandler {
  readonly command = "sessions";

  async handle(context: CommandContext): Promise<CommandResult> {
    try {
      const state = await context.runtime.get(context.route);
      const currentProject = state.currentProject;

      if (!currentProject) {
        return {
          outputs: [{ text: "❌ No project selected. Use `/projects` first." }],
        };
      }

      const sessions = await context.gateway.listSessions(currentProject.worktree);
      if (sessions.length === 0) {
        return {
          outputs: [{ text: "No sessions found. Send a message to create one." }],
        };
      }

      const displayed = sortSessionsByRecent(sessions).slice(0, context.projectsListLimit);
      let message = `# Sessions (${displayed.length}/${sessions.length})\n\n`;
      for (let i = 0; i < displayed.length; i++) {
        const session = displayed[i];
        const isActive = state.currentSession?.id === session.id;
        const marker = isActive ? " ✅" : "";
        message += `${i + 1}. **${session.title || session.id}**${marker}\n`;
      }

      if (sessions.length > context.projectsListLimit) {
        message += `\n_…and ${sessions.length - context.projectsListLimit} more_`;
      }

      message += "\n\nUse `/session <number>` to select a session.";
      return { outputs: [{ text: message, format: "markdown" }] };
    } catch (error) {
      logger.error("[CoreCommands] Error listing sessions", error);
      return {
        outputs: [{ text: "❌ Failed to load sessions." }],
      };
    }
  }
}