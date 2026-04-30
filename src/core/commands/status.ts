import { fetchCurrentAgent } from "../../agent/manager.js";
import { getAgentDisplayName } from "../../agent/types.js";
import { fetchCurrentModel } from "../../model/manager.js";
import { formatModelForDisplay } from "../../model/types.js";
import { isAutoConfirmEnabled } from "../../permission/auto-confirm.js";
import { processManager } from "../../process/manager.js";
import { logger } from "../../utils/logger.js";
import type { CommandContext, CommandHandler, CommandResult } from "./types.js";

export class StatusCommandHandler implements CommandHandler {
  readonly command = "status";

  async handle(context: CommandContext): Promise<CommandResult> {
    try {
      const currentAgent = await fetchCurrentAgent(context.route);
      const currentModel = fetchCurrentModel(context.route);
      const health = await context.gateway.health();

      if (!health) {
        return {
          outputs: [{ text: "❌ OpenCode server is unavailable." }],
        };
      }

      const healthLabel = health.healthy ? "✅ Healthy" : "❌ Unhealthy";
      const lines: string[] = [];
      lines.push("# OpenCode Status");
      lines.push("");
      lines.push(`**Health:** ${healthLabel}`);

      if (health.version) {
        lines.push(`**Version:** \`${health.version}\``);
      }

      if (processManager.isRunning()) {
        const uptime = processManager.getUptime();
        const uptimeStr = uptime ? Math.floor(uptime / 1000) : 0;
        lines.push(`**Process:** managed (PID ${processManager.getPID() ?? "-"}, uptime ${uptimeStr}s)`);
      }

      if (currentAgent) {
        lines.push(`**Agent:** ${getAgentDisplayName(currentAgent)}`);
      }

      lines.push(`**Model:** ${formatModelForDisplay(currentModel.providerID, currentModel.modelID)}`);

      const state = await context.runtime.get(context.route);
      lines.push("");
      if (state.currentProject) {
        lines.push(`**Project:** ${state.currentProject.name || state.currentProject.worktree}`);
      } else {
        lines.push("No project selected. Use `/projects` to choose one.");
      }

      if (state.currentSession) {
        lines.push(`**Session:** ${state.currentSession.title}`);
        const autoConfirmStatus = isAutoConfirmEnabled(state.currentSession.id);
        lines.push(`**Auto_confirm:** ${autoConfirmStatus ? "✅ ON" : "❌ OFF"}`);
      } else {
        lines.push("No active session. Send a message to create one.");
      }

      return {
        outputs: [{ text: lines.join("\n\n"), format: "markdown" }],
      };
    } catch (error) {
      logger.error("[CoreCommands] Error in status command", error);
      return {
        outputs: [{ text: "❌ Failed to fetch status." }],
      };
    }
  }
}