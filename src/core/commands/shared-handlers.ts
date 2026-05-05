import { getAvailableAgents, getStoredAgent, selectAgent } from "../../agent/manager.js";
import { getAgentDisplayName } from "../../agent/types.js";
import { settingsConversationRuntime } from "../runtime/settings-runtime.js";
import { setAutoConfirm, isAutoConfirmEnabled } from "../../permission/auto-confirm.js";
import { t } from "../../i18n/index.js";
import type { ConversationRoute } from "../runtime/types.js";

export interface CommandContext {
  route: ConversationRoute;
  sendMessage: (text: string) => Promise<void>;
  platformClearActive?: () => void;
}

export async function executeAgentListCommand(route: ConversationRoute): Promise<string> {
  try {
    const agents = await getAvailableAgents(route);
    if (agents.length === 0) {
      return t("agent.list.empty");
    }

    const currentAgent = getStoredAgent(route);
    const list = agents
      .map((agent: { name: string }, index: number) => {
        const marker = agent.name === currentAgent ? " ✅" : "";
        return `${index + 1}. ${getAgentDisplayName(agent.name)}${marker}`;
      })
      .join("\n");

    return t("agent.list.title", { current: getAgentDisplayName(currentAgent), list });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return `❌ Error listing agents: ${errorMessage}`;
  }
}

export async function executeAgentSwitchCommand(
  route: ConversationRoute,
  arg: string,
): Promise<string> {
  try {
    const index = Number.parseInt(arg, 10);
    if (Number.isNaN(index) || index < 1) {
      return t("agent.switch.invalid_index");
    }

    const agents = await getAvailableAgents(route);
    if (index > agents.length) {
      return t("agent.switch.invalid_index");
    }

    const selectedAgent = agents[index - 1];
    selectAgent(selectedAgent.name, route);

    return t("agent.switch.success", { name: getAgentDisplayName(selectedAgent.name) });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return `❌ Error switching agent: ${errorMessage}`;
  }
}

export async function executeAutoConfirmCommand(
  route: ConversationRoute,
  arg: string,
): Promise<string> {
  try {
    const state = await settingsConversationRuntime.get(route);
    if (!state.currentSession) {
      return "❌ No active session";
    }

    const sessionId = state.currentSession.id;
    const normalizedArg = arg.trim().toLowerCase();

    if (normalizedArg === "on") {
      setAutoConfirm(sessionId, true);
      return "✅ Auto_confirm enabled";
    }

    if (normalizedArg === "off") {
      setAutoConfirm(sessionId, false);
      return "✅ Auto_confirm disabled";
    }

    const status = isAutoConfirmEnabled(sessionId);
    return `Auto_confirm status: ${status ? "ON" : "OFF"}`;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return `❌ Error managing auto-confirm: ${errorMessage}`;
  }
}
