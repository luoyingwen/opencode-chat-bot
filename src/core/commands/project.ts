import { logger } from "../../utils/logger.js";
import type { CommandContext, CommandHandler, CommandResult } from "./types.js";

export class ProjectCommandHandler implements CommandHandler {
  readonly command = "project";

  async handle(context: CommandContext): Promise<CommandResult> {
    const trimmedArg = context.command.args.trim();

    if (!trimmedArg) {
      return {
        outputs: [
          {
            text: "❌ Please provide a project number or path. Use `/projects` to see the list or provide an absolute path.",
          },
        ],
      };
    }

    const index = Number.parseInt(trimmedArg, 10);
    if (!Number.isNaN(index) && index >= 1) {
      try {
        const projects = await context.gateway.listProjects();

        if (index > projects.length) {
          return {
            outputs: [
              {
                text: `❌ Project #${index} not found. Only ${projects.length} projects available.`,
              },
            ],
          };
        }

        const selected = projects[index - 1];
        await context.runtime.update(context.route, {
          currentProject: {
            id: selected.id,
            worktree: selected.worktree,
            name: selected.name || selected.worktree,
          },
          currentSession: null,
        });

        return {
          outputs: [
            {
              text: `✅ Project selected: **${selected.name || selected.worktree}**\n\`${selected.worktree}\``,
              format: "markdown",
            },
          ],
          effects: { projectChanged: true },
        };
      } catch (error) {
        logger.error("[CoreCommands] Error selecting project by index", error);
        return {
          outputs: [{ text: "❌ Failed to select project." }],
        };
      }
    }

    try {
      const { project, isNew, pathCreated } = await context.gateway.ensureProjectByPath(trimmedArg);
      await context.runtime.update(context.route, {
        currentProject: {
          id: project.id,
          worktree: project.worktree,
          name: project.name || project.worktree,
        },
        currentSession: null,
      });

      let message = "";
      if (isNew) {
        message = "✅ **New project created and selected**\n\n";
        if (pathCreated) {
          message += `📁 Directory created: \`${project.worktree}\`\n`;
        } else {
          message += `📁 Directory: \`${project.worktree}\`\n`;
        }
        message += `📝 Project: **${project.name || project.worktree}**`;
      } else {
        message = "✅ **Project selected**\n\n";
        if (pathCreated) {
          message += `📁 Directory created: \`${project.worktree}\`\n`;
        }
        message += `📝 Project: **${project.name || project.worktree}**\n`;
        message += `\`${project.worktree}\``;
      }

      return {
        outputs: [{ text: message, format: "markdown" }],
        effects: { projectChanged: true },
      };
    } catch (error) {
      logger.error("[CoreCommands] Error selecting project by path", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        outputs: [{ text: `❌ Failed to select project:\n\`\`\`\n${errorMessage}\n\`\`\`` }],
      };
    }
  }
}