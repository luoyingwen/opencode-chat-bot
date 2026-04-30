import { logger } from "../../utils/logger.js";
import type { CommandContext, CommandHandler, CommandResult } from "./types.js";

export class ProjectsCommandHandler implements CommandHandler {
  readonly command = "projects";

  async handle(context: CommandContext): Promise<CommandResult> {
    try {
      const projects = await context.gateway.listProjects();

      if (projects.length === 0) {
        return {
          outputs: [{ text: "No projects found. Make sure OpenCode server is running." }],
        };
      }

      const state = await context.runtime.get(context.route);
      const displayed = projects.slice(0, context.projectsListLimit);

      let message = `# Projects (${displayed.length}/${projects.length})\n\n`;
      for (let index = 0; index < displayed.length; index++) {
        const project = displayed[index];
        const isActive = state.currentProject?.worktree === project.worktree;
        const marker = isActive ? " ✅" : "";
        message += `${index + 1}. **${project.name || project.worktree}**${marker}\n   \`${project.worktree}\`\n`;
      }

      message += "\nUse `/project <number>` to select a project.";

      return {
        outputs: [{ text: message, format: "markdown" }],
      };
    } catch (error) {
      logger.error("[CoreCommands] Error in projects command", error);
      return {
        outputs: [{ text: "❌ Failed to load projects." }],
      };
    }
  }
}