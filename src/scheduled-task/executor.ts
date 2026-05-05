import { getSessionModel } from "../model/session-model.js";
import { opencodeClient } from "../opencode/client.js";
import { t } from "../i18n/index.js";
import { logger } from "../utils/logger.js";
import type { ScheduledTask, ScheduledTaskExecutionResult, ScheduledTaskModel } from "./types.js";

const SCHEDULED_TASK_SESSION_TITLE = "Scheduled task run";

export const SCHEDULED_TASK_AGENT = "build";

const INTERACTIVE_PERMISSION_REJECT_MESSAGE =
  "Scheduled task cannot continue because it requires interactive permission.";

type InteractiveRequestKind = "question" | "permission";

type PendingQuestionRequest = {
  id: string;
  sessionID: string;
  questions?: unknown[];
};

type PendingPermissionRequest = {
  id: string;
  sessionID: string;
  permission?: string;
  patterns?: string[];
};

type PendingInteractiveRequest =
  | { kind: "question"; request: PendingQuestionRequest }
  | { kind: "permission"; request: PendingPermissionRequest };

class ScheduledTaskInteractiveRequestError extends Error {
  constructor(kind: InteractiveRequestKind) {
    super(
      t(
        kind === "question"
          ? "task.run.error.interactive_question"
          : "task.run.error.interactive_permission",
      ),
    );
    this.name = "ScheduledTaskInteractiveRequestError";
  }
}

function collectResponseText(
  parts: Array<{ type?: string; text?: string; ignored?: boolean }>,
): string {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string" && !part.ignored)
    .map((part) => part.text)
    .join("")
    .trim();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return "Unknown scheduled task execution error";
}

async function loadPendingInteractiveRequest(
  sessionId: string,
  directory: string,
): Promise<PendingInteractiveRequest | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const questionsResult = await (opencodeClient.question as any).list?.({ directory });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const permissionsResult = await (opencodeClient.permission as any).list?.({ directory });

  if (questionsResult?.error) {
    logger.warn(
      `[ScheduledTaskExecutor] Failed to list pending questions: sessionId=${sessionId}`,
      questionsResult.error,
    );
  }

  const question = questionsResult?.data?.find(
    (request: PendingQuestionRequest) => request.sessionID === sessionId,
  );
  if (question) {
    return { kind: "question", request: question };
  }

  if (permissionsResult?.error) {
    logger.warn(
      `[ScheduledTaskExecutor] Failed to list pending permissions: sessionId=${sessionId}`,
      permissionsResult.error,
    );
  }

  const permission = permissionsResult?.data?.find(
    (request: PendingPermissionRequest) => request.sessionID === sessionId,
  );
  if (permission) {
    return { kind: "permission", request: permission };
  }

  return null;
}

async function rejectInteractiveRequest(
  request: PendingInteractiveRequest,
  directory: string,
): Promise<void> {
  try {
    if (request.kind === "question") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (opencodeClient.question as any).reject?.({
        requestID: request.request.id,
        directory,
      });

      if (error) {
        logger.warn(
          `[ScheduledTaskExecutor] Failed to reject pending question: requestId=${request.request.id}`,
          error,
        );
      }

      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (opencodeClient.permission as any).reply?.({
      requestID: request.request.id,
      directory,
      reply: "reject",
      message: INTERACTIVE_PERMISSION_REJECT_MESSAGE,
    });

    if (error) {
      logger.warn(
        `[ScheduledTaskExecutor] Failed to reject pending permission: requestId=${request.request.id}`,
        error,
      );
    }
  } catch (error) {
    logger.warn(
      `[ScheduledTaskExecutor] Failed to reject pending interactive request: requestId=${request.request.id}`,
      error,
    );
  }
}

async function abortSession(sessionId: string, directory: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (opencodeClient.session as any).abort?.({
      sessionID: sessionId,
      directory,
    });
    if (error) {
      logger.warn(
        `[ScheduledTaskExecutor] Failed to abort interactive scheduled task session: sessionId=${sessionId}`,
        error,
      );
    }
  } catch (error) {
    logger.warn(
      `[ScheduledTaskExecutor] Failed to abort interactive scheduled task session: sessionId=${sessionId}`,
      error,
    );
  }
}

async function failIfInteractiveRequest(
  taskId: string,
  sessionId: string,
  directory: string,
): Promise<void> {
  const interactiveRequest = await loadPendingInteractiveRequest(sessionId, directory);
  if (!interactiveRequest) {
    return;
  }

  logger.warn("[ScheduledTaskExecutor] Scheduled task requested interactive action", {
    taskId,
    sessionId,
    directory,
    kind: interactiveRequest.kind,
    requestId: interactiveRequest.request.id,
    ...(interactiveRequest.kind === "question"
      ? { questionCount: interactiveRequest.request.questions?.length ?? 0 }
      : {
          permission: interactiveRequest.request.permission,
          patterns: interactiveRequest.request.patterns,
        }),
  });

  await rejectInteractiveRequest(interactiveRequest, directory);
  await abortSession(sessionId, directory);
  throw new ScheduledTaskInteractiveRequestError(interactiveRequest.kind);
}

export async function executeScheduledTask(
  task: ScheduledTask,
): Promise<ScheduledTaskExecutionResult> {
  const startedAt = new Date().toISOString();
  let sessionId: string | null = null;
  let actualModel: ScheduledTaskModel | undefined;

  try {
    const { data: session, error: createError } = await opencodeClient.session.create({
      directory: task.projectWorktree,
      title: SCHEDULED_TASK_SESSION_TITLE,
    });

    if (createError || !session) {
      throw createError || new Error("Failed to create temporary scheduled task session");
    }

    sessionId = session.id;

    const promptOptions: {
      sessionID: string;
      directory: string;
      parts: Array<{ type: "text"; text: string }>;
      agent: string;
      model?: { providerID: string; modelID: string };
      variant?: string;
    } = {
      sessionID: session.id,
      directory: session.directory,
      parts: [{ type: "text", text: task.prompt }],
      agent: SCHEDULED_TASK_AGENT,
    };

    if (task.model.providerID && task.model.modelID) {
      promptOptions.model = {
        providerID: task.model.providerID,
        modelID: task.model.modelID,
      };
    }

    if (task.model.variant) {
      promptOptions.variant = task.model.variant;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: response, error: promptError } = await (opencodeClient.session as any).prompt(
      promptOptions,
    );

    if (promptError || !response) {
      throw promptError || new Error("Scheduled task prompt execution failed");
    }

    // Check if session needs user interaction
    await failIfInteractiveRequest(task.id, session.id, session.directory);

    const resultText = collectResponseText(response.parts);
    if (!resultText) {
      throw new Error("Scheduled task returned an empty assistant response");
    }

    const sessionModelResult = await getSessionModel(session.id);
    if (sessionModelResult?.model) {
      actualModel = {
        providerID: sessionModelResult.model.providerID,
        modelID: sessionModelResult.model.modelID,
        variant: null,
      };
    }

    return {
      taskId: task.id,
      status: "success",
      startedAt,
      finishedAt: new Date().toISOString(),
      resultText,
      errorMessage: null,
      actualModel,
    };
  } catch (error) {
    const errorMessage = toErrorMessage(error);
    logger.warn(
      `[ScheduledTaskExecutor] Task execution failed: id=${task.id}, message=${errorMessage}`,
    );

    return {
      taskId: task.id,
      status: "error",
      startedAt,
      finishedAt: new Date().toISOString(),
      resultText: null,
      errorMessage,
      actualModel,
    };
  } finally {
    if (sessionId) {
      try {
        await opencodeClient.session.delete({ sessionID: sessionId });
      } catch (error) {
        logger.warn(
          `[ScheduledTaskExecutor] Failed to delete temporary session: sessionId=${sessionId}`,
          error,
        );
      }
    }
  }
}
