import type { TextPromptExecutionPlatform } from "../core/execution/platform-adapter.js";
import { ensureOpenCodeEventSubscription } from "../core/execution/event-subscription.js";
import { clearAllInteractionState } from "../interaction/cleanup.js";
import { stopEventListening } from "../opencode/events.js";
import { logger } from "../utils/logger.js";
import { clearDingTalkActive, installDingTalkEventRouting, setDingTalkActive } from "./events.js";

export function createDingTalkTextPromptPlatform(params: {
  userId: string;
  sendMessage(text: string): Promise<void>;
}): TextPromptExecutionPlatform {
  return {
    name: "DingTalk",
    promptTaskName: "dingtalk.session.prompt",
    sessionMismatchReason: "dingtalk_session_mismatch",
    sendMessage: params.sendMessage,
    ensureEventSubscription: async (directory: string) => {
      await ensureOpenCodeEventSubscription("DingTalk", directory);
    },
    installEventRouting: installDingTalkEventRouting,
    onBeforePrompt: async (target) => {
      logger.info(`[DingTalk] Sending "Processing..." message to user ${params.userId}`);
      await params.sendMessage("⚙️ Processing…");
      setDingTalkActive({ userId: params.userId, ...target });
    },
    clearActiveTarget: clearDingTalkActive,
    clearConversationState: clearAllInteractionState,
    stopEventListening,
  };
}
