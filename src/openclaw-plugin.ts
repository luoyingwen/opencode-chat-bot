import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { initializeLogger, logger } from "./utils/logger.js";
import {
  handleOpenClawBeforeDispatch,
  handleOpenClawMessageReceived,
  initializeOpenClawHandler,
} from "./openclaw/handler.js";

const openClawPlugin = definePluginEntry({
  id: "openclawcode",
  name: "OpenClawCode",
  description: "OpenCode command handling for OpenClaw conversations",
  configSchema: {
    jsonSchema: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        channels: { type: "array", items: { type: "string" } },
        accountIds: { type: "array", items: { type: "string" } },
        conversationIds: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
  },
  register(api) {
    void initializeLogger().catch((error) => {
      api.logger.warn(`[OpenClaw] Logger initialization failed: ${String(error)}`);
    });

    initializeOpenClawHandler({ api, pluginConfig: api.pluginConfig });

    api.on("message_received", async (event, context) => {
      try {
        await handleOpenClawMessageReceived(event, context);
      } catch (error) {
        logger.error("[OpenClaw] message_received handler failed", error);
      }
    });

    api.on("before_dispatch", async (event, context) => {
      try {
        return await handleOpenClawBeforeDispatch(event, context);
      } catch (error) {
        logger.error("[OpenClaw] before_dispatch handler failed", error);
        return {
          handled: true,
          text: `OpenClawCode command failed: ${String(error)}`,
        };
      }
    });

    logger.info("[OpenClaw] Plugin registered");
  },
});

export default openClawPlugin;
