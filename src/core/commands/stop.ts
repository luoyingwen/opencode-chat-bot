import { logger } from "../../utils/logger.js";
import type { CommandContext, CommandHandler, CommandResult } from "./types.js";

export class StopCommandHandler implements CommandHandler {
  readonly command = "stop";

  async handle(context: CommandContext): Promise<CommandResult> {
    try {
      const state = await context.runtime.get(context.route);
      const currentSession = state.currentSession;

      if (!currentSession) {
        return {
          outputs: [{ text: "❌ No active session." }],
        };
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const { error } = await context.gateway.abortSession({
          sessionID: currentSession.id,
          directory: currentSession.directory,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (error) {
          return {
            outputs: [{ text: "⚠️ Stop signal sent, but server did not confirm abort." }],
          };
        }

        return {
          outputs: [{ text: "✅ Session stopped." }],
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return {
            outputs: [{ text: "⚠️ Stop request timed out. The session may still be running." }],
          };
        }

        throw error;
      }
    } catch (error) {
      logger.error("[CoreCommands] Error stopping session", error);
      return {
        outputs: [{ text: "❌ Failed to stop session." }],
      };
    }
  }
}
