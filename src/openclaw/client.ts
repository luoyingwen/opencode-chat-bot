import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { logger } from "../utils/logger.js";
import type { OpenClawClientOptions, OpenClawRoute } from "./types.js";

class OpenClawClient {
  constructor(private readonly api: OpenClawPluginApi) {}

  async sendMessage(route: OpenClawRoute, text: string): Promise<void> {
    const normalizedText = text.trim();
    if (!normalizedText) {
      logger.warn("[OpenClaw] Skipping empty outbound message");
      return;
    }

    const outbound = await this.api.runtime.channel.outbound.loadAdapter(route.channelId);
    if (!outbound?.sendPayload) {
      logger.warn(`[OpenClaw] Outbound adapter unavailable for channel=${route.channelId}`);
      return;
    }

    await outbound.sendPayload({
      cfg: this.api.config,
      to: route.conversationId,
      accountId: route.accountId,
      text: normalizedText,
      payload: { text: normalizedText },
    });

    logger.info(
      `[OpenClaw] Message sent channel=${route.channelId} account=${route.accountId} conversation=${route.conversationId}`,
    );
  }
}

let openClawClient: OpenClawClient | null = null;

export function initOpenClawClient(options: OpenClawClientOptions): OpenClawClient {
  openClawClient = new OpenClawClient(options.api);
  return openClawClient;
}

export function getOpenClawClient(): OpenClawClient {
  if (!openClawClient) {
    throw new Error("OpenClaw client has not been initialized");
  }
  return openClawClient;
}

export async function sendOpenClawMessage(route: OpenClawRoute, text: string): Promise<void> {
  const client = getOpenClawClient();
  await client.sendMessage(route, text);
}
