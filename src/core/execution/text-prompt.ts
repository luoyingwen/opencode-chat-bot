import { ingestSessionInfoForCache } from "../../session/cache-manager.js";
import { summaryAggregator } from "../../summary/aggregator.js";
import { formatErrorDetails } from "../../utils/error-format.js";
import { logger } from "../../utils/logger.js";
import { safeBackgroundTask } from "../../utils/safe-background-task.js";
import type { OpenCodeGateway, OpenCodePromptOptions } from "../opencode/types.js";
import type { TextPromptExecutionPlatform } from "./platform-adapter.js";
import type { ConversationRoute, ConversationRuntime } from "../runtime/types.js";

interface ExecuteTextPromptParams {
  route: ConversationRoute;
  userId: string;
  text: string;
  runtime: ConversationRuntime;
  gateway: OpenCodeGateway;
  platform: TextPromptExecutionPlatform;
}

function isPromptTransportTermination(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message?.includes("terminated") ||
      error.message?.includes("Connection") ||
      error.message?.includes("aborted"))
  );
}

function buildPromptOptions(
  sessionId: string,
  directory: string,
  text: string,
  agent?: string,
  model?: { providerID: string; modelID: string; variant?: string },
): OpenCodePromptOptions {
  const promptOptions: OpenCodePromptOptions = {
    sessionID: sessionId,
    directory,
    parts: [{ type: "text", text }],
    agent,
  };

  if (model?.providerID && model?.modelID) {
    promptOptions.model = {
      providerID: model.providerID,
      modelID: model.modelID,
    };

    if (model.variant) {
      promptOptions.variant = model.variant;
    }
  }

  return promptOptions;
}

export async function executeTextPrompt(params: ExecuteTextPromptParams): Promise<void> {
  const { route, userId, text, runtime, gateway, platform } = params;

  const state = await runtime.get(route);
  const currentProject = state.currentProject;

  logger.debug(
    `[${platform.name}] Current project: ${currentProject ? currentProject.worktree : "null"}`,
  );

  if (!currentProject) {
    logger.warn(`[${platform.name}] No project selected for user ${userId}`);
    await platform.sendMessage(
      "❌ No project selected. Use `/projects` and `/project <number>` first.",
    );
    return;
  }

  let currentSession = state.currentSession;

  if (!currentSession || currentSession.directory !== currentProject.worktree) {
    if (currentSession && currentSession.directory !== currentProject.worktree) {
      logger.warn(`[${platform.name}] Session/project mismatch. Clearing session context.`);
      platform.stopEventListening();
      summaryAggregator.clear();
      platform.clearConversationState(platform.sessionMismatchReason);
    }

    try {
      const session = await gateway.createSession(currentProject.worktree);

      logger.info(
        `[${platform.name}] Auto-created session: id=${session.id}, title="${session.title}"`,
      );

      currentSession = {
        id: session.id,
        title: session.title,
        directory: currentProject.worktree,
      };

      await runtime.update(route, { currentSession });
      await ingestSessionInfoForCache(session);
      await platform.sendMessage(`📝 New session: **${session.title}**`);
    } catch (error) {
      logger.error(`[${platform.name}] Failed to create session`, error);
      await platform.sendMessage("❌ Failed to create session.");
      return;
    }
  }

  try {
    const statusData = await gateway.getSessionStatus(currentSession.directory);
    if (statusData) {
      const sessionStatus = statusData[currentSession.id];
      if (sessionStatus?.type === "busy") {
        await platform.sendMessage(
          "⏳ Session is busy. Please wait for the current task to finish, or use `/stop`.",
        );
        return;
      }
    }
  } catch (error) {
    logger.warn(`[${platform.name}] Failed to check session status:`, error);
  }

  await platform.ensureEventSubscription(currentSession.directory);
  logger.debug(`[${platform.name}] Event subscription completed for ${currentSession.directory}`);

  platform.installEventRouting();
  summaryAggregator.setSession(currentSession.id);
  await platform.onBeforePrompt({
    routeKey: state.routeKey,
    sessionId: currentSession.id,
    directory: currentSession.directory,
  });

  const promptOptions = buildPromptOptions(
    currentSession.id,
    currentSession.directory,
    text,
    state.currentAgent,
    state.currentModel,
  );

  logger.info(
    `[${platform.name}] Sending prompt (fire-and-forget): agent=${state.currentAgent}, session=${currentSession.id}, text="${text.substring(0, 50)}..."`,
  );

  safeBackgroundTask({
    taskName: platform.promptTaskName,
    task: () => {
      logger.debug(`[${platform.name}] Executing session.prompt in background task`);
      return gateway.promptSession(promptOptions);
    },
    onSuccess: ({ error }) => {
      logger.debug(
        `[${platform.name}] session.prompt onSuccess called, error=${error ? "yes" : "no"}`,
      );
      if (error) {
        const details = formatErrorDetails(error, 1500);
        logger.error(`[${platform.name}] session.prompt API error:`, details);
        void platform.sendMessage(
          `❌ Failed to send prompt.\n\nError details:\n\`\`\`\n${details}\n\`\`\``,
        );
        return;
      }

      logger.info(`[${platform.name}] session.prompt completed successfully`);
    },
    onError: (error) => {
      const details = formatErrorDetails(error, 1500);

      if (isPromptTransportTermination(error)) {
        logger.warn(
          `[${platform.name}] session.prompt connection terminated (network issue):`,
          details,
        );
        return;
      }

      logger.error(`[${platform.name}] session.prompt background failure:`, details);
      void platform.sendMessage(`❌ Prompt failed.\n\nError details:\n\`\`\`\n${details}\n\`\`\``);
      platform.clearActiveTarget();
    },
  });

  logger.debug(`[${platform.name}] safeBackgroundTask for session.prompt dispatched`);
}
