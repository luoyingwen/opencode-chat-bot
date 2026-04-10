/**
 * Slack bot handler — Socket Mode integration for OpenCode.
 *
 * Runs alongside the existing Telegram bot, sharing the same OpenCode
 * session/project state (single-user design).  Authentication is based
 * on a single allowed channel ID.
 */

import { randomUUID } from "node:crypto";
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
import { getStoredAgent, getAvailableAgents, selectAgent } from "../agent/manager.js";
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
import { interactionManager } from "../interaction/manager.js";
import { renameManager } from "../rename/manager.js";
import { processManager } from "../process/manager.js";
import { getLocalizedBotCommands } from "../bot/commands/definitions.js";
import { logger } from "../utils/logger.js";
import { t, getDateLocale } from "../i18n/index.js";
import { parseTaskSchedule } from "../scheduled-task/schedule-parser.js";
import {
  addScheduledTask,
  listScheduledTasks,
  removeScheduledTask,
  getScheduledTask,
} from "../scheduled-task/store.js";
import { scheduledTaskRuntime } from "../scheduled-task/runtime.js";
import {
  createScheduledTaskModel,
  type ParsedTaskSchedule,
  type ScheduledTask,
  type ScheduledTaskModel,
} from "../scheduled-task/types.js";
import { formatTaskListBadge } from "../scheduled-task/display.js";
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

// ─── Task State Management ────────────────────────────────────────────────

interface SlackTaskState {
  stage: "awaiting_schedule" | "awaiting_prompt";
  projectId: string;
  projectWorktree: string;
  model: ScheduledTaskModel;
  scheduleText: string;
  parsedSchedule: ParsedTaskSchedule | null;
  lastActivity: number;
}

const slackTaskStates = new Map<string, SlackTaskState>();
const TASK_STATE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes timeout

function isTaskLimitReached(): boolean {
  return listScheduledTasks().length >= config.bot.taskLimit;
}

function getSlackTaskState(userId: string): SlackTaskState | null {
  const state = slackTaskStates.get(userId);
  if (!state) return null;
  if (Date.now() - state.lastActivity > TASK_STATE_TIMEOUT_MS) {
    slackTaskStates.delete(userId);
    return null;
  }
  return state;
}

function setSlackTaskState(userId: string, state: SlackTaskState): void {
  slackTaskStates.set(userId, state);
}

function clearSlackTaskState(userId: string): void {
  slackTaskStates.delete(userId);
}

function isUserInTaskFlow(userId: string): boolean {
  return getSlackTaskState(userId) !== null;
}

// ─── TaskList State Management ────────────────────────────────────────────

interface TaskListState {
  stage: "list" | "detail";
  taskId: string | null;
  lastActivity: number;
}

const slackTaskListStates = new Map<string, TaskListState>();
const TASK_LIST_STATE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes timeout

function getSlackTaskListState(userId: string): TaskListState | null {
  const state = slackTaskListStates.get(userId);
  if (!state) return null;
  if (Date.now() - state.lastActivity > TASK_LIST_STATE_TIMEOUT_MS) {
    slackTaskListStates.delete(userId);
    return null;
  }
  return state;
}

function setSlackTaskListState(userId: string, state: TaskListState): void {
  slackTaskListStates.set(userId, state);
}

function clearSlackTaskListState(userId: string): void {
  slackTaskListStates.delete(userId);
}

function isUserInTaskListFlow(userId: string): boolean {
  return getSlackTaskListState(userId) !== null;
}

// ─── SSE Event Subscription ───────────────────────────────────────────────

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

  // Build clientOptions with optional proxy agent.
  // Priority: SLACK_PROXY_URL > HTTPS_PROXY/HTTP_PROXY (system env)
  const effectiveProxyUrl =
    proxyUrl ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  let clientOptions:
    | { agent: InstanceType<typeof HttpsProxyAgent> | InstanceType<typeof SocksProxyAgent> }
    | undefined;
  if (effectiveProxyUrl) {
    const agent = effectiveProxyUrl.startsWith("socks")
      ? new SocksProxyAgent(effectiveProxyUrl)
      : new HttpsProxyAgent(effectiveProxyUrl);
    clientOptions = { agent };
    logger.info(`[Slack] Using proxy: ${effectiveProxyUrl.replace(/\/\/.*@/, "//***@")}`);
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: abortError } = await (opencodeClient.session.abort as any)(
          {
            sessionID: currentSession.id,
            directory: currentSession.directory,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { signal: controller.signal } as any,
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

      // Start rename flow and set up state management
      renameManager.startWaiting(currentSession.id, currentSession.directory, currentSession.title);
      interactionManager.start({
        kind: "rename",
        expectedInput: "text",
        metadata: {
          sessionId: currentSession.id,
          channelId: command.channel_id,
        },
      });

      // Send prompt message with abort hint
      const message =
        t("rename.prompt", { title: currentSession.title }) +
        "\n\n" +
        "💡 " +
        t("rename.hint_abort");
      await say(message);

      logger.info(`[Slack] Waiting for new title for session: ${currentSession.id}`);
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

  // ─── Command: /tasklist ─────────────────────────────────────────────

  app.command("/tasklist", async ({ command, ack, say }) => {
    await ack();

    if (!isChannelAllowed(command.channel_id)) {
      await say("⛔ This channel is not authorized.");
      return;
    }

    try {
      const tasks = listScheduledTasks();
      if (tasks.length === 0) {
        await say(t("tasklist.empty"));
        return;
      }

      const sortedTasks = [...tasks].sort((left, right) => {
        const leftNextRun = left.nextRunAt ? Date.parse(left.nextRunAt) : Number.POSITIVE_INFINITY;
        const rightNextRun = right.nextRunAt
          ? Date.parse(right.nextRunAt)
          : Number.POSITIVE_INFINITY;
        return leftNextRun - rightNextRun;
      });

      const lines: string[] = [t("tasklist.select"), ""];
      sortedTasks.forEach((task, index) => {
        const badge = formatTaskListBadge(task);
        const prompt = task.prompt.replace(/\s+/g, " ").trim();
        const truncatedPrompt = prompt.length > 50 ? `${prompt.slice(0, 47)}...` : prompt;
        lines.push(`${index + 1}. [${badge}] ${truncatedPrompt}`);
      });

      lines.push("");
      lines.push("Enter task number for details, or type 'cancel' to exit.");

      // Start interactive task list flow
      setSlackTaskListState(command.user_id, {
        stage: "list",
        taskId: null,
        lastActivity: Date.now(),
      });

      await say(lines.join("\n"));
    } catch (err) {
      logger.error("[Slack] Error listing tasks:", err);
      await say(t("tasklist.load_error"));
    }
  });

  // ─── Command: /task ─────────────────────────────────────────────────

  app.command("/task", async ({ command, ack, say }) => {
    await ack();

    if (!isChannelAllowed(command.channel_id)) {
      await say("⛔ This channel is not authorized.");
      return;
    }

    if (isTaskLimitReached()) {
      await say(t("task.limit_reached", { limit: config.bot.taskLimit }));
      return;
    }

    const currentProject = getCurrentProject();
    if (!currentProject) {
      await say("❌ No project selected. Use `/projects` first.");
      return;
    }

    const storedModel = getStoredModel();
    const model = createScheduledTaskModel(storedModel);

    // Start task creation flow
    const userId = command.user_id;
    setSlackTaskState(userId, {
      stage: "awaiting_schedule",
      projectId: currentProject.id,
      projectWorktree: currentProject.worktree,
      model,
      scheduleText: "",
      parsedSchedule: null,
      lastActivity: Date.now(),
    });

    await say(t("task.prompt.schedule"));
  });

  // ─── Command: /agents ───────────────────────────────────────────────

  app.command("/agents", async ({ command, ack, say }) => {
    await ack();

    if (!isChannelAllowed(command.channel_id)) {
      await say("⛔ This channel is not authorized.");
      return;
    }

    try {
      const agents = await getAvailableAgents();

      if (agents.length === 0) {
        await say(t("agent.list.empty"));
        return;
      }

      const currentAgent = getStoredAgent();
      const list = agents
        .map((agent, index) => {
          const marker = agent.name === currentAgent ? " ✅" : "";
          return `${index + 1}. ${getAgentDisplayName(agent.name)}${marker}`;
        })
        .join("\n");

      const message = t("agent.list.title", {
        current: getAgentDisplayName(currentAgent),
        list,
      });

      await say(message);
    } catch (err) {
      logger.error("[Slack] Error listing agents:", err);
      await say(t("error.load_agents"));
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

    // Check if user is in rename flow
    if (renameManager.isWaitingForName()) {
      const sessionInfo = renameManager.getSessionInfo();
      if (sessionInfo) {
        const newTitle = userMessage.trim();
        if (!newTitle) {
          await say(t("rename.empty_title"));
          return;
        }

        logger.info(`[Slack] Renaming session ${sessionInfo.sessionId} to: ${newTitle}`);

        try {
          const { data: updatedSession, error } = await opencodeClient.session.update({
            sessionID: sessionInfo.sessionId,
            directory: sessionInfo.directory,
            title: newTitle,
          });

          if (error || !updatedSession) {
            throw error || new Error("Failed to update session");
          }

          setCurrentSession({
            id: sessionInfo.sessionId,
            title: newTitle,
            directory: sessionInfo.directory,
          });

          await say(t("rename.success", { title: newTitle }));
          logger.info(`[Slack] Session renamed successfully: ${newTitle}`);
        } catch (err) {
          logger.error("[Slack] Error renaming session:", err);
          await say(t("rename.error"));
        }

        renameManager.clear();
        if (interactionManager.getSnapshot()?.kind === "rename") {
          interactionManager.clear("rename_completed");
        }
        return;
      }
    }

    // Get user ID from message
    const userId = (msg.user as string) || "";

    // Check if user is in task flow
    const taskState = getSlackTaskState(userId);
    if (taskState) {
      if (userMessage.trim().toLowerCase() === "cancel" || userMessage.trim() === "/cancel") {
        clearSlackTaskState(userId);
        await say(t("task.cancelled"));
        return;
      }

      if (taskState.stage === "awaiting_schedule") {
        const scheduleText = userMessage.trim();
        if (!scheduleText) {
          await say(t("task.schedule_empty"));
          return;
        }

        try {
          await say(t("task.parse.in_progress"));
          const parsedSchedule = await parseTaskSchedule(scheduleText, taskState.projectWorktree);

          // Update state to await prompt
          setSlackTaskState(userId, {
            ...taskState,
            stage: "awaiting_prompt",
            scheduleText,
            parsedSchedule,
            lastActivity: Date.now(),
          });

          await say(formatParsedScheduleMessage(parsedSchedule) + "\n\n" + t("task.prompt.body"));
          return;
        } catch (error) {
          logger.error("[Slack] Failed to parse schedule:", error);
          await say(
            t("task.parse_error", {
              message: error instanceof Error ? error.message : String(error),
            }),
          );
          return;
        }
      }

      if (taskState.stage === "awaiting_prompt") {
        const promptText = userMessage.trim();
        if (!promptText) {
          await say(t("task.prompt_empty"));
          return;
        }

        if (!taskState.parsedSchedule) {
          clearSlackTaskState(userId);
          await say("⚠️ Invalid task state. Please start over.");
          return;
        }

        try {
          const task = buildScheduledTask(
            taskState.projectId,
            taskState.projectWorktree,
            taskState.model,
            taskState.scheduleText,
            taskState.parsedSchedule,
            promptText,
          );

          await addScheduledTask(task);
          scheduledTaskRuntime.registerTask(task);
          clearSlackTaskState(userId);

          await say(formatTaskCreatedMessage(task));
          logger.info(`[Slack] Scheduled task created: ${task.id}`);
        } catch (error) {
          logger.error("[Slack] Failed to create task:", error);
          await say("❌ Failed to create task");
        }
        return;
      }
    }

    // Check if user is in task list flow
    const taskListState = getSlackTaskListState(userId);
    if (taskListState) {
      const trimmedText = userMessage.trim().toLowerCase();

      if (trimmedText === "cancel" || trimmedText === "/cancel") {
        clearSlackTaskListState(userId);
        await say(t("tasklist.cancelled_callback"));
        return;
      }

      if (taskListState.stage === "list") {
        const taskNumber = Number.parseInt(userMessage.trim(), 10);
        if (Number.isNaN(taskNumber) || taskNumber < 1) {
          await say("⚠️ Please enter a valid task number or type 'cancel' to exit.");
          return;
        }

        const tasks = listScheduledTasks();
        if (taskNumber > tasks.length) {
          await say(`⚠️ Task #${taskNumber} does not exist. There are ${tasks.length} tasks.`);
          return;
        }

        const task = tasks[taskNumber - 1];
        setSlackTaskListState(userId, {
          stage: "detail",
          taskId: task.id,
          lastActivity: Date.now(),
        });

        const details = formatTaskDetails(task);
        await say(`${details}\n\nType "delete" to remove this task, or "cancel" to go back.`);
        return;
      }

      if (taskListState.stage === "detail") {
        if (!taskListState.taskId) {
          clearSlackTaskListState(userId);
          await say(t("tasklist.inactive_callback"));
          return;
        }

        if (trimmedText === "delete") {
          try {
            const task = getScheduledTask(taskListState.taskId);
            if (!task) {
              clearSlackTaskListState(userId);
              await say(t("tasklist.inactive_callback"));
              return;
            }

            await removeScheduledTask(taskListState.taskId);
            scheduledTaskRuntime.removeTask(taskListState.taskId);
            clearSlackTaskListState(userId);

            await say(t("tasklist.deleted_callback"));
          } catch (error) {
            logger.error("[Slack] Failed to delete task:", error);
            await say("❌ Failed to delete task");
          }
          return;
        }

        await say('⚠️ Type "delete" to remove this task, or "cancel" to exit.');
        return;
      }
    }

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

// ─── Helper Functions for Task Management ────────────────────────────────

function formatParsedScheduleMessage(schedule: ParsedTaskSchedule): string {
  const cronLine =
    schedule.kind === "cron" ? `${t("task.schedule_preview.cron", { cron: schedule.cron })}\n` : "";

  return t("task.schedule_preview", {
    summary: schedule.summary,
    cronLine,
    timezone: schedule.timezone,
    kind: schedule.kind === "cron" ? t("task.kind.cron") : t("task.kind.once"),
    nextRunAt: formatDateTime(schedule.nextRunAt, schedule.timezone),
  });
}

function formatTaskCreatedMessage(task: ScheduledTask): string {
  const variant = task.model.variant ? ` (${task.model.variant})` : "";
  const model = `${task.model.providerID}/${task.model.modelID}${variant}`;
  const cronLine = task.kind === "cron" ? `${t("task.created.cron", { cron: task.cron })}\n` : "";

  const truncatedPrompt = task.prompt.length > 100 ? `${task.prompt.slice(0, 97)}...` : task.prompt;

  return t("task.created", {
    description: truncatedPrompt,
    project: task.projectWorktree,
    model,
    schedule: task.scheduleSummary,
    cronLine,
    nextRunAt: task.nextRunAt ? formatDateTime(task.nextRunAt, task.timezone) : "-",
  });
}

function formatTaskDetails(task: ScheduledTask): string {
  const cronLine =
    task.kind === "cron" ? `${t("tasklist.details.cron", { cron: task.cron })}\n` : "";

  return t("tasklist.details", {
    prompt: task.prompt,
    project: task.projectWorktree,
    schedule: task.scheduleSummary,
    cronLine,
    timezone: task.timezone,
    nextRunAt: formatDateTime(task.nextRunAt, task.timezone),
    lastRunAt: formatDateTime(task.lastRunAt, task.timezone),
    runCount: String(task.runCount),
  });
}

function formatDateTime(dateIso: string | null, timezone: string): string {
  if (!dateIso) {
    return "-";
  }

  try {
    return new Intl.DateTimeFormat(getDateLocale(), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(dateIso));
  } catch {
    return dateIso;
  }
}

function buildScheduledTask(
  projectId: string,
  projectWorktree: string,
  model: import("../scheduled-task/types.js").ScheduledTaskModel,
  scheduleText: string,
  parsedSchedule: import("../scheduled-task/types.js").ParsedTaskSchedule,
  prompt: string,
): import("../scheduled-task/types.js").ScheduledTask {
  const baseTask = {
    id: randomUUID(),
    projectId,
    projectWorktree,
    model,
    scheduleText,
    scheduleSummary: parsedSchedule.summary,
    timezone: parsedSchedule.timezone,
    prompt,
    createdAt: new Date().toISOString(),
    nextRunAt: parsedSchedule.nextRunAt,
    lastRunAt: null,
    runCount: 0,
    lastStatus: "idle" as const,
    lastError: null,
  };

  if (parsedSchedule.kind === "cron") {
    return {
      ...baseTask,
      kind: "cron",
      cron: parsedSchedule.cron,
    };
  }

  return {
    ...baseTask,
    kind: "once",
    runAt: parsedSchedule.runAt,
  };
}
