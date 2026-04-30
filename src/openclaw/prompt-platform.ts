import type { TextPromptExecutionPlatform } from "../core/execution/platform-adapter.js";
import { ensureOpenCodeEventSubscription } from "../core/execution/event-subscription.js";
import { clearAllInteractionState } from "../interaction/cleanup.js";
import { stopEventListening } from "../opencode/events.js";
import { logger } from "../utils/logger.js";
import type { OpenClawRoute } from "./types.js";
import { sendOpenClawMessage } from "./client.js";
import { clearOpenClawActive, installOpenClawEventRouting, setOpenClawActive } from "./events.js";

export function createOpenClawTextPromptPlatform(
  route: OpenClawRoute,
): TextPromptExecutionPlatform {
  return {
    name: "OpenClaw",
    promptTaskName: "openclaw.session.prompt",
    sessionMismatchReason: "openclaw_session_mismatch",
    sendMessage: (text: string) => sendOpenClawMessage(route, text),
    ensureEventSubscription: async (directory: string) => {
      await ensureOpenCodeEventSubscription("OpenClaw", directory);
    },
    installEventRouting: installOpenClawEventRouting,
    onBeforePrompt: async (target) => {
      logger.info(
        `[OpenClaw] Prompt started channel=${route.channelId} account=${route.accountId} conversation=${route.conversationId}`,
      );
      setOpenClawActive({ route, ...target });
    },
    clearActiveTarget: clearOpenClawActive,
    clearConversationState: clearAllInteractionState,
    stopEventListening,
  };
}
