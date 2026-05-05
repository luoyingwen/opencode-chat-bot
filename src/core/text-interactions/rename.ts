import { opencodeClient } from "../../opencode/client.js";
import { isTextInteractionCancelInput } from "./cancel.js";
import { t } from "../../i18n/index.js";
import { renameManager } from "../../rename/manager.js";
import { interactionManager } from "../../interaction/manager.js";
import { updateConversationState } from "../../settings/manager.js";
import { logger } from "../../utils/logger.js";

export interface RenameSessionInfo {
  sessionId: string;
  directory: string;
  currentTitle: string;
}

export interface CurrentSessionInfo {
  id: string;
  title: string;
  directory: string;
}

export async function renameSessionTitle(
  flowKey: string,
  sessionInfo: RenameSessionInfo,
  text: string,
): Promise<string> {
  const newTitle = text.trim();
  if (isTextInteractionCancelInput(newTitle)) {
    renameManager.clear(flowKey);
    return t("rename.cancelled");
  }

  if (!newTitle) {
    return t("rename.empty_title");
  }

  logger.info(
    `[RenameFlow] Renaming session ${sessionInfo.sessionId} for ${flowKey} to: ${newTitle}`,
  );

  try {
    const { data: updatedSession, error } = await opencodeClient.session.update({
      sessionID: sessionInfo.sessionId,
      directory: sessionInfo.directory,
      title: newTitle,
    });

    if (error || !updatedSession) {
      throw error ?? new Error("Failed to update session");
    }

    updateConversationState(flowKey, {
      currentSession: {
        id: sessionInfo.sessionId,
        title: newTitle,
        directory: sessionInfo.directory,
      },
    });

    renameManager.clear(flowKey);
    return t("rename.success", { title: newTitle });
  } catch (error) {
    logger.error(`[RenameFlow] Error renaming session for ${flowKey}`, error);
    renameManager.clear(flowKey);
    return t("rename.error");
  }
}

export async function handleRenameTextInput(flowKey: string, text: string): Promise<string | null> {
  const sessionInfo = renameManager.getSessionInfo(flowKey);
  if (!sessionInfo) {
    return null;
  }

  return renameSessionTitle(flowKey, sessionInfo, text);
}

export async function handleRenameFlowSetup(
  routeKey: string,
  currentSession: CurrentSessionInfo,
  userId: string,
  titleArg?: string,
): Promise<string> {
  const nextTitle = titleArg?.trim();

  if (nextTitle) {
    return renameSessionTitle(
      routeKey,
      {
        sessionId: currentSession.id,
        directory: currentSession.directory,
        currentTitle: currentSession.title,
      },
      nextTitle,
    );
  }

  renameManager.startWaiting(
    currentSession.id,
    currentSession.directory,
    currentSession.title,
    routeKey,
  );

  interactionManager.start({
    kind: "rename",
    expectedInput: "text",
    metadata: {
      sessionId: currentSession.id,
      userId: userId,
    },
  });

  return `${t("rename.prompt", { title: currentSession.title })}\n\n💡 ${t("rename.hint_abort")}`;
}
