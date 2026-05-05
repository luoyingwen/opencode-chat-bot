import { opencodeClient } from "../opencode/client.js";
import { logger } from "../utils/logger.js";
import type { FavoriteModel } from "./types.js";

interface SessionModel {
  providerID: string;
  modelID: string;
  variant?: string;
}

interface SessionInfo {
  id: string;
  model?: SessionModel;
}

interface MessageInfo {
  id: string;
  role: "user" | "assistant";
  model?: SessionModel;
  modelID?: string;
  providerID?: string;
}

interface MessageWithParts {
  info: MessageInfo;
  parts: unknown[];
}

interface ConfigResponse {
  model?: string;
}

interface ProviderListResponse {
  all: Array<{ id: string }>;
  default: Record<string, string>;
  connected: string[];
}

export interface SessionModelResult {
  model: FavoriteModel;
  isExplicit: boolean;
}

export async function getSessionModel(sessionId: string): Promise<SessionModelResult | null> {
  try {
    const sessionResult = await opencodeClient.session.get({ sessionID: sessionId });
    if (sessionResult.data) {
      const session = sessionResult.data as SessionInfo;
      if (session.model) {
        logger.debug(
          `[SessionModel] Found model in session ${sessionId}: ${session.model.providerID}/${session.model.modelID}`,
        );
        return {
          model: {
            providerID: session.model.providerID,
            modelID: session.model.modelID,
          },
          isExplicit: true,
        };
      }
    }

    const messagesResult = await opencodeClient.session.messages({ sessionID: sessionId });
    if (messagesResult.data && Array.isArray(messagesResult.data)) {
      const messages = messagesResult.data as MessageWithParts[];
      const userMessages = messages.filter((m) => m.info?.role === "user");

      if (userMessages.length > 0) {
        const lastUserMessage = userMessages[userMessages.length - 1];
        if (lastUserMessage.info?.model) {
          logger.debug(
            `[SessionModel] Found model in last user message for session ${sessionId}: ${lastUserMessage.info.model.providerID}/${lastUserMessage.info.model.modelID}`,
          );
          return {
            model: {
              providerID: lastUserMessage.info.model.providerID,
              modelID: lastUserMessage.info.model.modelID,
            },
            isExplicit: true,
          };
        }
      }
    }

    const configResult = await opencodeClient.config.get();
    if (configResult.data) {
      const config = configResult.data as ConfigResponse;
      if (config.model) {
        const parsed = parseModelString(config.model);
        if (parsed) {
          logger.debug(
            `[SessionModel] Found model in config for session ${sessionId}: ${parsed.providerID}/${parsed.modelID}`,
          );
          return {
            model: parsed,
            isExplicit: false,
          };
        }
      }
    }

    const providersResult = await opencodeClient.provider.list();
    if (providersResult.data) {
      const providers = providersResult.data as ProviderListResponse;
      if (providers.connected.length > 0) {
        const firstConnected = providers.connected[0];
        const defaultModelID = providers.default[firstConnected];
        if (defaultModelID) {
          logger.debug(
            `[SessionModel] Using provider default for session ${sessionId}: ${firstConnected}/${defaultModelID}`,
          );
          return {
            model: {
              providerID: firstConnected,
              modelID: defaultModelID,
            },
            isExplicit: false,
          };
        }
      }
    }

    logger.warn(`[SessionModel] No model found for session ${sessionId}`);
    return null;
  } catch (error) {
    logger.error(`[SessionModel] Error getting model for session ${sessionId}:`, error);
    return null;
  }
}

function parseModelString(modelStr: string): FavoriteModel | null {
  if (!modelStr) {
    return null;
  }

  const parts = modelStr.split("/");
  if (parts.length === 2) {
    return {
      providerID: parts[0],
      modelID: parts[1],
    };
  }

  return {
    providerID: "unknown",
    modelID: modelStr,
  };
}

export function formatModelDisplay(model: FavoriteModel | null): string {
  if (!model) {
    return "unknown";
  }
  return `${model.providerID}/${model.modelID}`;
}
