import { permissionManager } from "../permission/manager.js";
import { questionManager } from "../question/manager.js";
import { renameManager } from "../rename/manager.js";
import { clearPendingTextPermission, hasAnyPendingTextPermission } from "../core/text-interactions/permission.js";
import { clearAllTextTaskFlows } from "../core/text-interactions/task-flow.js";
import { clearAllTextTaskListFlows } from "../core/text-interactions/tasklist-flow.js";
import { taskCreationManager } from "../scheduled-task/creation-manager.js";
import { interactionManager } from "./manager.js";
import { logger } from "../utils/logger.js";

export function clearAllInteractionState(reason: string): void {
  const questionActive = questionManager.isActive();
  const permissionActive = permissionManager.isActive();
  const textPermissionActive = hasAnyPendingTextPermission();
  const renameActive = renameManager.isWaitingForName();
  const taskCreationActive = taskCreationManager.isActive();
  const interactionSnapshot = interactionManager.getSnapshot();

  questionManager.clear();
  permissionManager.clear();
  clearPendingTextPermission();
  renameManager.clear();
  clearAllTextTaskFlows();
  clearAllTextTaskListFlows();
  taskCreationManager.clear();
  interactionManager.clear(reason);

  const hasAnyActiveState =
    questionActive ||
    permissionActive ||
    textPermissionActive ||
    renameActive ||
    taskCreationActive ||
    interactionSnapshot !== null;

  const message =
    `[InteractionCleanup] Cleared state: reason=${reason}, ` +
    `questionActive=${questionActive}, permissionActive=${permissionActive}, ` +
    `textPermissionActive=${textPermissionActive}, ` +
    `renameActive=${renameActive}, taskCreationActive=${taskCreationActive}, ` +
    `interactionKind=${interactionSnapshot?.kind || "none"}`;

  if (hasAnyActiveState) {
    logger.info(message);
    return;
  }

  logger.debug(message);
}
