/**
 * Slack bot handler — Socket Mode integration for OpenCode.
 *
 * Runs alongside the existing Telegram bot, sharing the same OpenCode
 * session/project state (single-user design).  Authentication is based
 * on a single allowed channel ID.
 */

import pkg from "@slack/bolt";
const { App, LogLevel } = pkg;

import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";

import { config } from "../config.js";
import { opencodeClient } from "../opencode/client.js";
import { getCurrentSession, setCurrentSession } from "../session/manager.js";
import { ingestSessionInfoForCache } from "../session/cache-manager.js";
import { getCurrentProject, setCurrentProject } from "../settings/manager.js";
import { getProjects } from "../project/manager.js";
import { getStoredAgent } from "../agent/manager.js";
import { getStoredModel } from "../model/manager.js";
import { fetchCurrentAgent } from "../agent/manager.js";
import { getAgentDisplayName } from "../agent/types.js";
import { fetchCurrentModel } from "../model/manager.js";
import { formatModelForDisplay } from "../model/types.js";
import { summaryAggregator } from "../summary/aggregator.js";
import { subscribeToEvents, stopEventListening } from "../opencode/events.js";
import { safeBackgroundTask } from "../utils/safe-background-task.js";
import { formatErrorDetails } from "../utils/error-format.js";
import { clearAllInteractionState } from "../interaction/cleanup.js";
import { processManager } from "../process/manager.js";
import { getLocalizedBotCommands } from "../bot/commands/definitions.js";
import { logger } from "../utils/logger.js";
import { t } from "../i18n/index.js";
import {
  setSlackApp,
  setSlackActive,
  clearSlackActive,
  installSlackEventRouting,
} from "./events.js";

import type { App as SlackApp } from "@slack/bolt";

let slackAppRef: SlackApp | null = null;

// ─── Helpers ────────────────────────────────────────────────────────────

function isChannelAllowed(channelId: string): boolean {
  const allowed = config.slack.allowedChannelId;
  if (!allowed) return true; // No restriction configured
  return channelId === allowed;
}

/**
 * Ensure SSE event subscription is active for the given directory.
 * This is the Slack-side equivalent of ensureEventSubscription in bot/index.ts.
 * It re-uses the same subscribeToEvents / summaryAggregator pipeline — the
 * event routing layer (slack/events.ts) handles directing output to Slack.
 */
async function ensureEventSubscription(directory: string): Promise<void> {
  if (!directory) {
    logger.error("[Slack] No directory found for event subscription");
    return;
  }

  logger.info(`[Slack] Subscribing to OpenCode events for project: ${directory}`);
  await subscribeToEvents(directory, (event) => {
    if (event.type === "session.created" || event.type === "session.updated") {
      const info = (
        event.properties as { info?: { directory?: string; time?: { updated?: number } } }
      ).info;

      if (info?.directory) {
        safeBackgroundTask({
          taskName: `session.cache.${event.type}`,
          task: () => ingestSessionInfoForCache(info),
        });
      }
    }

    summaryAggregator.processEvent(event);
  });
}

async function waitForServerReady(maxWaitMs: number = 10000): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const { data, error } = await opencodeClient.global.health();
      if (!error && data?.healthy) {
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return false;
}

// ─── Slack bot initialization ───────────────────────────────────────────

export async function initializeSlackHandler(): Promise<SlackApp> {
  const { botToken, appToken, signingSecret, proxyUrl } = config.slack;

  if (!botToken || !appToken) {
    throw new Error("SLACK_BOT_TOKEN and SLACK_APP_TOKEN are required for Slack integration");
  }

  // Build clientOptions with optional proxy agent (same pattern as Telegram)
  let clientOptions:
    | { agent: InstanceType<typeof HttpsProxyAgent> | InstanceType<typeof SocksProxyAgent> }
    | undefined;
  if (proxyUrl) {
    const agent = proxyUrl.startsWith("socks")
      ? new SocksProxyAgent(proxyUrl)
      : new HttpsProxyAgent(proxyUrl);
    clientOptions = { agent };
    logger.info(`[Slack] Using proxy: ${proxyUrl.replace(/\/\/.*@/, "//***@")}`);
  }

  const app = new App({
    token: botToken,
    appToken: appToken,
    signingSecret: signingSecret || undefined,
    socketMode: true,
    ...(clientOptions && { clientOptions }),
    logLevel: LogLevel.INFO,
    logger: {
      debug: (...msgs: unknown[]) => logger.debug("[Slack]", ...msgs),
      info: (...msgs: unknown[]) => logger.info("[Slack]", ...msgs),
      warn: (...msgs: unknown[]) => logger.warn("[Slack]", ...msgs),
      error: (...msgs: unknown[]) => logger.error("[Slack]", ...msgs),
      setLevel: () => {},
      getLevel: () => LogLevel.INFO,
      setName: () => {},
    },
  });

  setSlackApp(app);
  slackAppRef = app;

  // ─── Command: /status ───────────────────────────────────────────────

  app.command("/status", async ({ command, ack, say }) => {
    await ack();

    if (!isChannelAllowed(command.channel_id)) {
      await say("⛔ This channel is not authorized.");
      return;
    }

    try {
      const { data, error } = await opencodeClient.global.health();

      if (error || !data) {
        await say("❌ OpenCode server is unavailable.");
        return;
      }

      const healthLabel = data.healthy ? "✅ Healthy" : "❌ Unhealthy";
      let message = `*OpenCode Status*\n\nHealth: ${healthLabel}\n`;

      if (data.version) {
        message += `Version: \`${data.version}\`\n`;
      }

      if (processManager.isRunning()) {
        const uptime = processManager.getUptime();
        const uptimeStr = uptime ? Math.floor(uptime / 1000) : 0;
        message += `Process: managed (PID ${processManager.getPID() ?? "-"}, uptime ${uptimeStr}s)\n`;
      }

      const currentAgent = await fetchCurrentAgent();
      if (currentAgent) {
        message += `Agent: ${getAgentDisplayName(currentAgent)}\n`;
      }

      const currentModel = fetchCurrentModel();
      message += `Model: ${formatModelForDisplay(currentModel.providerID, currentModel.modelID)}\n`;

      const currentProject = getCurrentProject();
      if (currentProject) {
        message += `\nProject: *${currentProject.name || currentProject.worktree}*\n`;
      } else {
        message += "\nNo project selected. Use `/projects` to choose one.\n";
      }

      const currentSession = getCurrentSession();
      if (currentSession) {
        message += `Session: *${currentSession.title}*\n`;
      } else {
        message += "No active session. Send a message to create one.\n";
      }

      await say({ text: message, mrkdwn: true });
    } catch (err) {
      logger.error("[Slack] Error in /status:", err);
      await say("❌ Failed to fetch status.");
    }
  });

  // ─── Command: /new ──────────────────────────────────────────────────

  app.command("/new", async ({ command, ack, say }) => {
    await ack();

    if (!isChannelAllowed(command.channel_id)) {
      await say("⛔ This channel is not authorized.");
      return;
    }

    try {
      const currentProject = getCurrentProject();
      if (!currentProject) {
        await say(t("new.project_not_selected"));
        return;
      }

      const { data: session, error } = await opencodeClient.session.create({
        directory: currentProject.worktree,
      });

      if (error || !session) {
        await say("❌ Failed to create session.");
        return;
      }

      logger.info(`[Slack] Created new session: id=${session.id}, title="${session.title}"`);

      setCurrentSession({
        id: session.id,
        title: session.title,
        directory: currentProject.worktree,
      });

      summaryAggregator.clear();
      clearAllInteractionState("slack_session_created");
      await ingestSessionInfoForCache(session);

      await say({
        text: `✅ New session created: *${session.title}*`,
        mrkdwn: true,
      });
    } catch (err) {
      logger.error("[Slack] Error in /new:", err);
      await say("❌ Failed to create session.");
    }
  });

  // ─── Command: /stop ─────────────────────────────────────────────────

  app.command("/stop", async ({ command, ack, say }) => {
    await ack();

    if (!isChannelAllowed(command.channel_id)) {
      await say("⛔ This channel is not authorized.");
      return;
    }

    try {
      clearSlackActive();
      stopEventListening();
      summaryAggregator.clear();
      clearAllInteractionState("slack_stop_command");

      const currentSession = getCurrentSession();
      if (!currentSession) {
        await say(t("stop.no_active_session"));
        return;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const { error: abortError } = await opencodeClient.session.abort(
          {
            sessionID: currentSession.id,
            directory: currentSession.directory,
          },
          { signal: controller.signal },
        );

        clearTimeout(timeoutId);

        if (abortError) {
          logger.warn("[Slack] Abort request failed:", abortError);
          await say("⚠️ Stop signal sent, but server did not confirm abort.");
          return;
        }

        await say("✅ Session stopped.");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          await say("⚠️ Stop request timed out. The session may still be running.");
        } else {
          throw err;
        }
      }
    } catch (err) {
      logger.error("[Slack] Error in /stop:", err);
      await say("❌ Failed to stop session.");
    }
  });

  // ─── Command: /sessions ─────────────────────────────────────────────

  app.command("/sessions", async ({ command, ack, say }) => {
    await ack();

    if (!isChannelAllowed(command.channel_id)) {
      await say("⛔ This channel is not authorized.");
      return;
    }

    try {
      const currentProject = getCurrentProject();
      if (!currentProject) {
        await say("❌ No project selected. Use `/projects` first.");
        return;
      }

      const { data: sessions, error } = await opencodeClient.session.list({
        directory: currentProject.worktree,
      });

      if (error || !sessions) {
        await say("❌ Failed to load sessions.");
        return;
      }

      if (sessions.length === 0) {
        await say("No sessions found. Send a message to create one.");
        return;
      }

      const limit = config.bot.sessionsListLimit;
      const sorted = [...sessions].sort((a, b) => {
        const timeA = a.time?.updated ?? a.time?.created ?? 0;
        const timeB = b.time?.updated ?? b.time?.created ?? 0;
        return timeB - timeA;
      });
      const displayed = sorted.slice(0, limit);
      const currentSession = getCurrentSession();

      let message = `*Sessions* (${displayed.length}/${sessions.length})\n\n`;
      for (const session of displayed) {
        const isActive = currentSession?.id === session.id;
        const marker = isActive ? " ✅" : "";
        message += `• \`${session.title || session.id}\`${marker}\n`;
      }

      if (sessions.length > limit) {
        message += `\n_…and ${sessions.length - limit} more_`;
      }

      await say({ text: message, mrkdwn: true });
    } catch (err) {
      logger.error("[Slack] Error in /sessions:", err);
      await say("❌ Failed to load sessions.");
    }
  });

  // ─── Command: /projects ─────────────────────────────────────────────

  app.command("/projects", async ({ command, ack, say }) => {
    await ack();

    if (!isChannelAllowed(command.channel_id)) {
      await say("⛔ This channel is not authorized.");
      return;
    }

    try {
      const projects = await getProjects();

      if (projects.length === 0) {
        await say("No projects found. Make sure OpenCode server is running.");
        return;
      }

      const currentProject = getCurrentProject();
      const limit = config.bot.projectsListLimit;
      const displayed = projects.slice(0, limit);

      let message = `*Projects* (${displayed.length}/${projects.length})\n\n`;
      for (let i = 0; i < displayed.length; i++) {
        const project = displayed[i];
        const isActive = currentProject?.worktree === project.worktree;
        const marker = isActive ? " ✅" : "";
        message += `${i + 1}. *${project.name || project.worktree}*${marker}\n   \`${project.worktree}\`\n`;
      }

      message += "\nUse `/project <number>` to select a project.";

      await say({ text: message, mrkdwn: true });
    } catch (err) {
      logger.error("[Slack] Error in /projects:", err);
      await say("❌ Failed to load projects.");
    }
  });

  // ─── Command: /project <number> ─────────────────────────────────────

  app.command("/project", async ({ command, ack, say }) => {
    await ack();

    if (!isChannelAllowed(command.channel_id)) {
      await say("⛔ This channel is not authorized.");
      return;
    }

    const args = (command.text || "").trim();

    if (!args) {
      await say("Usage: `/project <number>` — select a project by its number from `/projects`.");
      return;
    }

    const index = parseInt(args, 10);
    if (isNaN(index) || index < 1) {
      await say("❌ Please provide a valid project number. Use `/projects` to see the list.");
      return;
    }

    try {
      const projects = await getProjects();

      if (index > projects.length) {
        await say(`❌ Project #${index} not found. Only ${projects.length} projects available.`);
        return;
      }

      const selected = projects[index - 1];

      setCurrentProject({
        id: selected.id,
        worktree: selected.worktree,
        name: selected.name || selected.worktree,
      });

      // Clear session when switching projects
      summaryAggregator.clear();
      clearAllInteractionState("slack_project_switch");

      await say({
        text: `✅ Project selected: *${selected.name || selected.worktree}*\n\`${selected.worktree}\``,
        mrkdwn: true,
      });

      logger.info(`[Slack] Project selected: ${selected.name || selected.worktree}`);
    } catch (err) {
      logger.error("[Slack] Error in /project:", err);
      await say("❌ Failed to select project.");
    }
  });

  // ─── Command: /rename ───────────────────────────────────────────────

  app.command("/rename", async ({ command, ack, say }) => {
    await ack();

    if (!isChannelAllowed(command.channel_id)) {
      await say("⛔ This channel is not authorized.");
      return;
    }

    try {
      const currentSession = getCurrentSession();
      if (!currentSession) {
        await say(t("rename.no_session"));
        return;
      }

      await say(t("rename.prompt", { title: currentSession.title }));
    } catch (err) {
      logger.error("[Slack] Error in /rename:", err);
      await say(t("rename.error"));
    }
  });

  // ─── Command: /commands ─────────────────────────────────────────────

  app.command("/commands", async ({ command, ack, say }) => {
    await ack();

    if (!isChannelAllowed(command.channel_id)) {
      await say("⛔ This channel is not authorized.");
      return;
    }

    try {
      const currentProject = getCurrentProject();
      if (!currentProject) {
        await say(t("bot.project_not_selected"));
        return;
      }

      const { data, error } = await opencodeClient.command.list({
        directory: currentProject.worktree.replace(/\\/g, "/"),
      });

      if (error || !data || data.length === 0) {
        await say(t("commands.empty"));
        return;
      }

      const filtered = data.filter(
        (cmd) => typeof cmd.name === "string" && cmd.name.trim().length > 0,
      );
      if (filtered.length === 0) {
        await say(t("commands.empty"));
        return;
      }

      const lines = filtered.map((cmd) => {
        const desc = cmd.description?.trim() || t("commands.no_description");
        return `• /\`${cmd.name}\` — ${desc}`;
      });

      await say({
        text: `📋 *OpenCode Commands* (${filtered.length} available)\n\n${lines.join("\n")}`,
        mrkdwn: true,
      });
    } catch (err) {
      logger.error("[Slack] Error in /commands:", err);
      await say(t("commands.fetch_error"));
    }
  });

  // ─── Command: /opencode_start ─────────────────────────────────────────

  app.command("/opencode_start", async ({ command, ack, say }) => {
    await ack();

    if (!isChannelAllowed(command.channel_id)) {
      await say("⛔ This channel is not authorized.");
      return;
    }

    try {
      if (processManager.isRunning()) {
        const uptime = processManager.getUptime();
        const uptimeStr = uptime ? Math.floor(uptime / 1000) : 0;
        await say(
          t("opencode_start.already_running_managed", {
            pid: processManager.getPID() ?? "-",
            seconds: uptimeStr,
          }),
        );
        return;
      }

      try {
        const { data, error } = await opencodeClient.global.health();
        if (!error && data?.healthy) {
          await say(
            t("opencode_start.already_running_external", {
              version: data.version || t("common.unknown"),
            }),
          );
          return;
        }
      } catch {
        // Continue with start
      }

      await say(t("opencode_start.starting"));

      const { success, error } = await processManager.start();

      if (!success) {
        await say(t("opencode_start.start_error", { error: error || t("common.unknown_error") }));
        return;
      }

      const ready = await waitForServerReady(10000);
      if (!ready) {
        await say(t("opencode_start.started_not_ready", { pid: processManager.getPID() ?? "-" }));
        return;
      }

      const { data: health } = await opencodeClient.global.health();
      await say(
        t("opencode_start.success", {
          pid: processManager.getPID() ?? "-",
          version: health?.version || t("common.unknown"),
        }),
      );

      logger.info(`[Slack] OpenCode server started, PID=${processManager.getPID()}`);
    } catch (err) {
      logger.error("[Slack] Error in /opencode_start:", err);
      await say(t("opencode_start.error"));
    }
  });

  // ─── Command: /opencode_stop ─────────────────────────────────────────

  app.command("/opencode_stop", async ({ command, ack, say }) => {
    await ack();

    if (!isChannelAllowed(command.channel_id)) {
      await say("⛔ This channel is not authorized.");
      return;
    }

    try {
      if (!processManager.isRunning()) {
        try {
          const { data, error } = await opencodeClient.global.health();
          if (!error && data?.healthy) {
            await say(t("opencode_stop.external_running"));
            return;
          }
        } catch {
          // Server not accessible
        }
        await say(t("opencode_stop.not_running"));
        return;
      }

      const pid = processManager.getPID();
      await say(t("opencode_stop.stopping", { pid: pid ?? "-" }));

      const { success, error } = await processManager.stop(5000);

      if (!success) {
        await say(t("opencode_stop.stop_error", { error: error || t("common.unknown_error") }));
        return;
      }

      await say(t("opencode_stop.success"));
      logger.info("[Slack] OpenCode server stopped");
    } catch (err) {
      logger.error("[Slack] Error in /opencode_stop:", err);
      await say(t("opencode_stop.error"));
    }
  });

  // ─── Command: /help ─────────────────────────────────────────────────

  app.command("/help", async ({ command, ack, say }) => {
    await ack();

    if (!isChannelAllowed(command.channel_id)) {
      await say("⛔ This channel is not authorized.");
      return;
    }

    const commands = getLocalizedBotCommands();
    const lines = commands.map((item) => `/${item.command} - ${item.description}`);
    const message = `📖 *Commands*\n\n${lines.join("\n")}\n\n_Tip: Select a project with \`/projects\` and \`/project <number>\`_`;

    await say({ text: message, mrkdwn: true });
  });

  // ─── Regular messages (prompts) ─────────────────────────────────────

  app.message(async ({ message, say }) => {
    // Skip bot messages, edits, subtypes
    const msg = message as unknown as Record<string, unknown>;
    if (msg.subtype || msg.bot_id) return;
    if (typeof msg.text !== "string" || !msg.text) return;
    if (typeof msg.channel !== "string") return;

    const channelId = msg.channel as string;
    if (!isChannelAllowed(channelId)) return;

    const userMessage = msg.text as string;

    try {
      const currentProject = getCurrentProject();
      if (!currentProject) {
        await say("❌ No project selected. Use `/projects` and `/project <number>` first.");
        return;
      }

      let currentSession = getCurrentSession();

      // Create session if none exists, or if it's for a different project
      if (!currentSession || currentSession.directory !== currentProject.worktree) {
        if (currentSession && currentSession.directory !== currentProject.worktree) {
          logger.warn(`[Slack] Session/project mismatch. Clearing session context.`);
          stopEventListening();
          summaryAggregator.clear();
          clearAllInteractionState("slack_session_mismatch");
        }

        const { data: session, error } = await opencodeClient.session.create({
          directory: currentProject.worktree,
        });

        if (error || !session) {
          await say("❌ Failed to create session.");
          return;
        }

        logger.info(`[Slack] Auto-created session: id=${session.id}, title="${session.title}"`);

        currentSession = {
          id: session.id,
          title: session.title,
          directory: currentProject.worktree,
        };

        setCurrentSession(currentSession);
        await ingestSessionInfoForCache(session);
        await say({
          text: `📝 New session: *${session.title}*`,
          mrkdwn: true,
        });
      }

      // Check if session is busy
      try {
        const { data: statusData } = await opencodeClient.session.status({
          directory: currentSession.directory,
        });

        if (statusData) {
          const sessionStatus = (statusData as Record<string, { type?: string }>)[
            currentSession.id
          ];
          if (sessionStatus?.type === "busy") {
            await say(
              "⏳ Session is busy. Please wait for the current task to finish, or use `/stop`.",
            );
            return;
          }
        }
      } catch (err) {
        logger.warn("[Slack] Failed to check session status:", err);
      }

      // Ensure event subscription
      await ensureEventSubscription(currentSession.directory);

      // Install Slack event routing (idempotent)
      installSlackEventRouting();

      // Set aggregator session
      summaryAggregator.setSession(currentSession.id);

      // Send processing indicator
      const processingResult = await say({
        text: "⚙️ Processing…",
        mrkdwn: true,
      });

      const processingTs =
        processingResult && "ts" in processingResult ? (processingResult.ts as string) : undefined;

      // Mark Slack as active target BEFORE sending prompt
      setSlackActive(channelId, processingTs);

      // Build prompt options
      const currentAgent = getStoredAgent();
      const storedModel = getStoredModel();

      const promptOptions: {
        sessionID: string;
        directory: string;
        parts: Array<{ type: "text"; text: string }>;
        model?: { providerID: string; modelID: string };
        agent?: string;
        variant?: string;
      } = {
        sessionID: currentSession.id,
        directory: currentSession.directory,
        parts: [{ type: "text", text: userMessage }],
        agent: currentAgent,
      };

      if (storedModel.providerID && storedModel.modelID) {
        promptOptions.model = {
          providerID: storedModel.providerID,
          modelID: storedModel.modelID,
        };

        if (storedModel.variant) {
          promptOptions.variant = storedModel.variant;
        }
      }

      logger.info(
        `[Slack] Sending prompt (fire-and-forget): agent=${currentAgent}, session=${currentSession.id}`,
      );

      // Fire and forget — response arrives via SSE events → aggregator → Slack routing
      safeBackgroundTask({
        taskName: "slack.session.prompt",
        task: () => opencodeClient.session.prompt(promptOptions),
        onSuccess: ({ error }) => {
          if (error) {
            const details = formatErrorDetails(error, 6000);
            logger.error("[Slack] session.prompt API error:", details);

            void postMessageToChannel(
              channelId,
              "❌ Failed to send prompt. Check logs for details.",
            );

            clearSlackActive();
            return;
          }

          logger.info("[Slack] session.prompt completed");
        },
        onError: (error) => {
          const details = formatErrorDetails(error, 6000);
          logger.error("[Slack] session.prompt background failure:", details);

          void postMessageToChannel(channelId, "❌ Prompt failed. Check logs for details.");

          clearSlackActive();
        },
      });
    } catch (err) {
      logger.error("[Slack] Error processing message:", err);
      await say("❌ An error occurred. Please try again.");
      clearSlackActive();
    }
  });

  // Start the app in Socket Mode
  await app.start();
  logger.info("[Slack] Bot started (Socket Mode)");

  return app;
}

/**
 * Send a startup notification to the allowed Slack channel.
 */
export async function sendSlackStartupMessage(app: SlackApp): Promise<void> {
  const channelId = config.slack.allowedChannelId;
  if (!channelId) {
    logger.debug("[Slack] No allowed channel ID configured, skipping startup message");
    return;
  }

  try {
    await app.client.chat.postMessage({
      channel: channelId,
      text: "🚀 *OpenCode Bot started!*\n\nUse `/status` to check status, or send a message to begin.",
      mrkdwn: true,
    });
    logger.info(`[Slack] Startup message sent to channel ${channelId}`);
  } catch (err) {
    logger.error("[Slack] Failed to send startup message:", err);
  }
}

/**
 * Helper to post a message to a channel (used in fire-and-forget callbacks).
 */
async function postMessageToChannel(channel: string, text: string): Promise<void> {
  if (!slackAppRef) {
    logger.error("[Slack] Cannot post message: app not initialized");
    return;
  }

  try {
    await slackAppRef.client.chat.postMessage({
      channel,
      text,
      mrkdwn: true,
    });
  } catch (err) {
    logger.error("[Slack] Failed to post message to channel:", err);
  }
}
