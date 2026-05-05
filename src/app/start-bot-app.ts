import { readFile } from "node:fs/promises";

import { getRuntimeMode } from "../runtime/mode.js";
import { getRuntimePaths } from "../runtime/paths.js";
import { getLogFilePath, initializeLogger, logger } from "../utils/logger.js";
import { config } from "../config.js";
import { initializeSharedRuntime } from "./initialize-shared-runtime.js";

async function getBotVersion(): Promise<string> {
  try {
    const packageJsonPath = new URL("../../package.json", import.meta.url);
    const packageJsonContent = await readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent) as { version?: string };

    return packageJson.version ?? "unknown";
  } catch (error) {
    logger.warn("[App] Failed to read bot version", error);
    return "unknown";
  }
}

export async function startBotApp(): Promise<void> {
  await initializeLogger();

  const mode = getRuntimeMode();
  const runtimePaths = getRuntimePaths();
  const version = await getBotVersion();
  const logFilePath = getLogFilePath();

  const hasDingTalk = !!(config.dingtalk.appKey && config.dingtalk.appSecret);
  const hasFeishu = !!(config.feishu.appId && config.feishu.appSecret);

  if (!hasDingTalk && !hasFeishu) {
    throw new Error(
      "No bot platform configured. Set DINGTALK_APP_KEY + DINGTALK_APP_SECRET, or FEISHU_APP_ID + FEISHU_APP_SECRET.",
    );
  }

  logger.info(`Starting OpenCode Chat Bot v${version}...`);
  logger.info(`Config loaded from ${runtimePaths.envFilePath}`);
  if (logFilePath) {
    logger.info(`Logs are written to ${logFilePath}`);
  }
  logger.info(
    `Allowed User ID: DingTalk=${config.dingtalk.allowedUserId ?? "disabled"}`,
  );
  logger.debug(`[Runtime] Application start mode: ${mode}`);
  logger.info(`[App] OpenCode API: ${config.opencode.apiUrl}`);
  logger.info(
    `[App] Platforms: DingTalk=${hasDingTalk ? "enabled" : "disabled"}, Feishu=${hasFeishu ? "enabled" : "disabled"}`,
  );

  await initializeSharedRuntime();

  // ─── Start DingTalk bot (if configured) ─────────────────────────────
  if (hasDingTalk) {
    try {
      const { initializeDingTalkHandler, sendDingTalkStartupMessage } =
        await import("../dingtalk/handler.js");
      await initializeDingTalkHandler();
      await sendDingTalkStartupMessage();
      logger.info("[App] DingTalk bot started");
    } catch (err) {
      logger.error("[App] Failed to start DingTalk bot:", err);
      if (!hasFeishu) throw err;
    }
  } else {
    logger.debug("[App] DingTalk not configured, skipping");
  }

  // ─── Start Feishu bot (if configured) ────────────────────────────────
  if (hasFeishu) {
    try {
      const { initializeFeishuHandler, sendFeishuStartupMessage } =
        await import("../feishu/handler.js");
      await initializeFeishuHandler();
      await sendFeishuStartupMessage();
      logger.info("[App] Feishu bot started");
    } catch (err) {
      logger.error("[App] Failed to start Feishu bot:", err);
      if (!hasDingTalk) throw err;
    }
  } else {
    logger.debug("[App] Feishu not configured, skipping");
  }
}
