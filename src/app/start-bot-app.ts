import { readFile } from "node:fs/promises";

import { createBot } from "../bot/index.js";
import { getCurrentProject, loadSettings, setCurrentProject } from "../settings/manager.js";
import { processManager } from "../process/manager.js";
import { warmupSessionDirectoryCache } from "../session/cache-manager.js";
import { getRuntimeMode } from "../runtime/mode.js";
import { logger } from "../utils/logger.js";
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
  const mode = getRuntimeMode();
  const version = await getBotVersion();

  const hasTelegram = !!config.telegram.token;
  const hasSlack = !!(config.slack.botToken && config.slack.appToken);
  const hasDingTalk = !!(config.dingtalk.appKey && config.dingtalk.appSecret);

  if (!hasTelegram && !hasSlack && !hasDingTalk) {
    throw new Error(
      "No bot platform configured. Set TELEGRAM_BOT_TOKEN, SLACK_BOT_TOKEN + SLACK_APP_TOKEN, or DINGTALK_APP_KEY + DINGTALK_APP_SECRET.",
    );
  }

  logger.info(`Starting OpenCode Bot v${version}...`);
  logger.debug(`[Runtime] Application start mode: ${mode}`);
  logger.info(`[App] OpenCode API: ${config.opencode.apiUrl}`);
  logger.info(
    `[App] Platforms: Telegram=${hasTelegram ? "enabled" : "disabled"}, Slack=${hasSlack ? "enabled" : "disabled"}, DingTalk=${hasDingTalk ? "enabled" : "disabled"}`,
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

  // ─── Start Telegram bot (if configured) ────────────────────────────
  if (hasTelegram) {
    logger.info(`Allowed Telegram User ID: ${config.telegram.allowedUserId}`);

    const bot = createBot();

    const webhookInfo = await bot.api.getWebhookInfo();
    if (webhookInfo.url) {
      logger.info(`[Bot] Webhook detected: ${webhookInfo.url}, removing...`);
      await bot.api.deleteWebhook();
      logger.info("[Bot] Webhook removed, switching to long polling");
    }

    await bot.start({
      onStart: (botInfo) => {
        logger.info(`Bot @${botInfo.username} started!`);
      },
    });

    // Initialize scheduled task runtime with Telegram bot
    try {
      await scheduledTaskRuntime.initialize(bot);
      logger.info("[App] Scheduled task runtime initialized with Telegram");
    } catch (err) {
      logger.error("[App] Failed to initialize scheduled task runtime:", err);
    }
  } else {
    logger.info("[App] Telegram not configured, skipping");
  }

  // Initialize scheduled task runtime without Telegram (for DingTalk-only mode)
  if (!hasTelegram) {
    try {
      await scheduledTaskRuntime.initialize();
      logger.info("[App] Scheduled task runtime initialized");
    } catch (err) {
      logger.error("[App] Failed to initialize scheduled task runtime:", err);
    }
  }

  // ─── Start Slack bot (if configured) ───────────────────────────────
  if (hasSlack) {
    try {
      const { initializeSlackHandler, sendSlackStartupMessage } =
        await import("../slack/handler.js");
      const slackApp = await initializeSlackHandler();
      await sendSlackStartupMessage(slackApp);
      logger.info("[App] Slack bot started");
    } catch (err) {
      logger.error("[App] Failed to start Slack bot:", err);
      // If Slack is the only platform and it failed, re-throw
      if (!hasTelegram) throw err;
    }
  } else {
    logger.debug("[App] Slack not configured, skipping");
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
      if (!hasTelegram && !hasSlack) throw err;
    }
  } else {
    logger.debug("[App] DingTalk not configured, skipping");
  }
}
