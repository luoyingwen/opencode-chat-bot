import { readFile } from "node:fs/promises";

import { getCurrentProject, loadSettings, setCurrentProject } from "../settings/manager.js";
import { processManager } from "../process/manager.js";
import { warmupSessionDirectoryCache } from "../session/cache-manager.js";
import { getRuntimeMode } from "../runtime/mode.js";
import { getRuntimePaths } from "../runtime/paths.js";
import { getLogFilePath, initializeLogger, logger } from "../utils/logger.js";
import { config } from "../config.js";
import { opencodeClient } from "../opencode/client.js";
import { getProjects } from "../project/manager.js";
import { scheduledTaskRuntime } from "../scheduled-task/runtime.js";

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

  const hasDingTalk = !!(
    config.dingtalk.appKey &&
    config.dingtalk.appSecret &&
    config.dingtalk.allowedUserId
  );
  const hasFeishu = !!(config.feishu.appId && config.feishu.appSecret);

  if (!hasDingTalk && !hasFeishu) {
    throw new Error(
      "No bot platform configured. Set DINGTALK_APP_KEY + DINGTALK_APP_SECRET + DINGTALK_ALLOWED_USER_ID, or FEISHU_APP_ID + FEISHU_APP_SECRET.",
    );
  }

  logger.info(`Starting OpenCode Bot v${version}...`);
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

  await loadSettings();
  await processManager.initialize();

  try {
    const { data, error } = await opencodeClient.global.health();
    if (error) {
      logger.warn(`[App] OpenCode API health check failed: ${String(error)}`);
    } else {
      logger.info(`[App] OpenCode API connection OK (${config.opencode.apiUrl})`, data);
    }
  } catch (error) {
    logger.warn(`[App] OpenCode API unreachable at ${config.opencode.apiUrl}`, error);
  }

  await warmupSessionDirectoryCache();

  // ─── Auto-select project if none is set ──────────────────────────
  if (!getCurrentProject()) {
    try {
      const projects = await getProjects();
      if (projects.length === 0) {
        logger.warn(
          "[App] No projects found. Use /projects to select one after creating a project.",
        );
      } else {
        const selected = projects[0];
        setCurrentProject(selected);
        logger.info(
          `[App] Auto-selected project: ${selected.name ?? selected.worktree} (${selected.id})` +
            (projects.length > 1
              ? ` — ${projects.length} projects available, picked most recent`
              : ""),
        );
      }
    } catch (error) {
      logger.warn("[App] Failed to auto-select project", error);
    }
  } else {
    const current = getCurrentProject();
    logger.debug(`[App] Project already set: ${current?.name ?? current?.worktree}`);
  }

  // ─── Initialize scheduled task runtime ────────────────────────────
  try {
    await scheduledTaskRuntime.initialize();
    logger.info("[App] Scheduled task runtime initialized");
  } catch (err) {
    logger.error("[App] Failed to initialize scheduled task runtime:", err);
  }

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
