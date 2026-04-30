import { ingestSessionInfoForCache } from "../../session/cache-manager.js";
import { logger } from "../../utils/logger.js";
import type { CommandContext, CommandHandler, CommandResult } from "./types.js";

function sortSessionsByRecent<T extends { time?: { updated?: number } }>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => {
    const timeA = a.time?.updated ?? 0;
    const timeB = b.time?.updated ?? 0;
    return timeB - timeA;
  });
}

export class SessionCommandHandler implements CommandHandler {
  readonly command = "session";

  async handle(context: CommandContext): Promise<CommandResult> {
    if (context.command.args.trim().toLowerCase() === "new") {
      return this.createSession(context);
    }

    const index = Number.parseInt(context.command.args.trim(), 10);
    if (Number.isNaN(index) || index < 1) {
      return {
        outputs: [
          {
            text: "❌ Please provide a valid session number, or use `/session new`. Use `/sessions` to see the list.",
          },
        ],
      };
    }

    try {
      const state = await context.runtime.get(context.route);
      const currentProject = state.currentProject;

      if (!currentProject) {
        return {
          outputs: [{ text: "❌ No project selected. Use `/projects` first." }],
        };
      }

      const sessions = sortSessionsByRecent(
        await context.gateway.listSessions(currentProject.worktree),
      );

      if (index > sessions.length) {
        return {
          outputs: [
            {
              text: `❌ Session #${index} not found. Only ${sessions.length} sessions available.`,
            },
          ],
        };
      }

      const selected = sessions[index - 1];
      const session = await context.gateway.getSession(currentProject.worktree, selected.id);
      await context.runtime.update(context.route, {
        currentSession: {
          id: session.id,
          title: session.title,
          directory: currentProject.worktree,
        },
      });

      return {
        outputs: [{ text: `✅ Session selected: **${session.title}**`, format: "markdown" }],
        effects: { sessionChanged: true },
      };
    } catch (error) {
      logger.error("[CoreCommands] Error selecting session", error);
      return {
        outputs: [{ text: "❌ Failed to select session." }],
      };
    }
  }

  private async createSession(context: CommandContext): Promise<CommandResult> {
    try {
      const state = await context.runtime.get(context.route);
      const currentProject = state.currentProject;

      if (!currentProject) {
        return {
          outputs: [{ text: "❌ No project selected. Use `/projects` first." }],
        };
      }

      const session = await context.gateway.createSession(currentProject.worktree);
      await context.runtime.update(context.route, {
        currentSession: {
          id: session.id,
          title: session.title,
          directory: currentProject.worktree,
        },
      });
      await ingestSessionInfoForCache(session);

      return {
        outputs: [{ text: `✅ New session created: **${session.title}**`, format: "markdown" }],
        effects: { sessionChanged: true },
      };
    } catch (error) {
      logger.error("[CoreCommands] Error creating session", error);
      return {
        outputs: [{ text: "❌ Failed to create session." }],
      };
    }
  }
}