import { fetchCurrentAgent } from "../../agent/manager.js";
import { getAgentDisplayName } from "../../agent/types.js";
import { fetchCurrentModel } from "../../model/manager.js";
import { formatModelForDisplay } from "../../model/types.js";
import { isAutoConfirmEnabled } from "../../permission/auto-confirm.js";
import { logger } from "../../utils/logger.js";
import type { CommandContext, CommandHandler, CommandResult } from "./types.js";

export class StatusCommandHandler implements CommandHandler {
  readonly command = "status";

  async handle(context: CommandContext): Promise<CommandResult> {
    try {
      const currentAgent = await fetchCurrentAgent(context.route);
      const storedModel = fetchCurrentModel(context.route);
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

      if (currentAgent) {
        lines.push(`**Agent:** ${getAgentDisplayName(currentAgent)}`);
      }

      const state = await context.runtime.get(context.route);

      if (storedModel.providerID && storedModel.modelID) {
        lines.push(
          `**Model:** ${formatModelForDisplay(storedModel.providerID, storedModel.modelID)}`,
        );
      } else {
        lines.push("**Model:** Not configured");
      }

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

        const statusData = await context.gateway.getSessionStatus(
          state.currentProject?.worktree || "",
        );
        const sessionStatus = statusData?.[state.currentSession.id];
        if (sessionStatus?.type === "busy") {
          lines.push("**Status:** 🔄 Busy (processing)");
        } else if (sessionStatus?.type === "retry") {
          const retryStatus = sessionStatus as { type: "retry"; attempt: number };
          lines.push(`**Status:** 🔄 Retrying (attempt ${retryStatus.attempt})`);
        } else {
          lines.push("**Status:** ✅ Idle");
        }
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
