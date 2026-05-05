import type { TextPromptExecutionPlatform } from "../core/execution/platform-adapter.js";
import { ensureOpenCodeEventSubscription } from "../core/execution/event-subscription.js";
import { clearAllInteractionState } from "../interaction/cleanup.js";
import { stopEventListening } from "../opencode/events.js";
import { clearFeishuActive, installFeishuEventRouting, setFeishuActive } from "./events.js";
import { getFeishuClient } from "./client.js";

export function createFeishuTextPromptPlatform(params: {
  userId: string;
  chatId: string;
  sendMessage(text: string): Promise<void>;
}): TextPromptExecutionPlatform {
  return {
    name: "Feishu",
    promptTaskName: "feishu.session.prompt",
    sessionMismatchReason: "feishu_session_mismatch",
    sendMessage: params.sendMessage,
    ensureEventSubscription: async (directory: string) => {
      await ensureOpenCodeEventSubscription("Feishu", directory);
    },
    installEventRouting: installFeishuEventRouting,
    onBeforePrompt: async (target) => {
      setFeishuActive({ userId: params.userId, chatId: params.chatId, ...target });

      const client = getFeishuClient();
      const lastMsgId = client.getLastIncomingMessageId(params.chatId);
      if (lastMsgId) {
        await client.addTypingReaction(lastMsgId);
      }
    },
    clearActiveTarget: clearFeishuActive,
    clearConversationState: clearAllInteractionState,
    stopEventListening,
  };
}
