import { getDateLocale, t } from "../../i18n/index.js";
import { isTextInteractionCancelInput } from "./cancel.js";
import { formatTaskListBadge } from "../../scheduled-task/display.js";
import { scheduledTaskRuntime } from "../../scheduled-task/runtime.js";
import {
  getScheduledTask,
  listScheduledTasks,
  removeScheduledTask,
} from "../../scheduled-task/store.js";
import type { ScheduledTask } from "../../scheduled-task/types.js";
import { logger } from "../../utils/logger.js";

interface TaskListState {
  stage: "list" | "detail";
  taskId: string | null;
  lastActivity: number;
}

const taskListStates = new Map<string, TaskListState>();
const STATE_TIMEOUT_MS = 5 * 60 * 1000;

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

function sortTasks(tasks: ScheduledTask[]): ScheduledTask[] {
  return [...tasks].sort((left, right) => {
    const leftNextRun = left.nextRunAt ? Date.parse(left.nextRunAt) : Number.POSITIVE_INFINITY;
    const rightNextRun = right.nextRunAt ? Date.parse(right.nextRunAt) : Number.POSITIVE_INFINITY;

    if (leftNextRun !== rightNextRun) {
      return leftNextRun - rightNextRun;
    }

    return left.createdAt.localeCompare(right.createdAt);
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

function formatTaskListItem(index: number, task: ScheduledTask): string {
  const badge = formatTaskListBadge(task);
  const prompt = task.prompt.replace(/\s+/g, " ").trim();
  const truncatedPrompt = prompt.length > 50 ? `${prompt.slice(0, 47)}...` : prompt;
  return `${index}. [${badge}] ${truncatedPrompt}`;
}

function clearTaskListState(flowKey: string, reason: string): void {
  if (taskListStates.has(flowKey)) {
    taskListStates.delete(flowKey);
    logger.debug(`[TextTaskListFlow] Cleared state for ${flowKey}: ${reason}`);
  }
}

function getTaskListState(flowKey: string): TaskListState | null {
  const state = taskListStates.get(flowKey);
  if (!state) {
    return null;
  }

  if (Date.now() - state.lastActivity > STATE_TIMEOUT_MS) {
    clearTaskListState(flowKey, "timeout");
    return null;
  }

  return state;
}

export async function handleTextTaskListCommand(flowKey: string): Promise<string> {
  try {
    const tasks = sortTasks(listScheduledTasks());
    if (tasks.length === 0) {
      return t("tasklist.empty");
    }

    clearTaskListState(flowKey, "new_list_viewed");

    const lines: string[] = [t("tasklist.select"), ""];
    tasks.forEach((task, index) => {
      lines.push(formatTaskListItem(index + 1, task));
    });
    lines.push("");
    lines.push("输入任务编号查看详情，或输入“取消”或 /cancel 退出");

    taskListStates.set(flowKey, {
      stage: "list",
      taskId: null,
      lastActivity: Date.now(),
    });

    return lines.join("\n");
  } catch (error) {
    logger.error(`[TextTaskListFlow] Failed to load task list for ${flowKey}`, error);
    return t("tasklist.load_error");
  }
}

export async function handleTextTaskListInput(flowKey: string, text: string): Promise<string | null> {
  const state = getTaskListState(flowKey);
  if (!state) {
    return null;
  }

  const trimmedText = text.trim();
  if (isTextInteractionCancelInput(trimmedText)) {
    clearTaskListState(flowKey, "user_cancelled");
    return t("tasklist.cancelled_callback");
  }

  if (state.stage === "list") {
    const taskNumber = Number.parseInt(trimmedText, 10);
    if (Number.isNaN(taskNumber) || taskNumber < 1) {
      return "⚠️ 请输入有效的任务编号（数字），或输入“取消”或 /cancel 退出";
    }

    const tasks = sortTasks(listScheduledTasks());
    if (taskNumber > tasks.length) {
      return `⚠️ 任务 #${taskNumber} 不存在。共有 ${tasks.length} 个任务。`;
    }

    const task = tasks[taskNumber - 1];
    taskListStates.set(flowKey, {
      stage: "detail",
      taskId: task.id,
      lastActivity: Date.now(),
    });

    return `${formatTaskDetails(task)}\n\n输入“删除”删除此任务，或输入“取消”或 /cancel 返回列表`;
  }

  if (state.stage === "detail") {
    if (!state.taskId) {
      clearTaskListState(flowKey, "missing_task_id");
      return t("tasklist.inactive_callback");
    }

    if (trimmedText === "删除" || trimmedText === "delete") {
      try {
        const task = getScheduledTask(state.taskId);
        if (!task) {
          clearTaskListState(flowKey, "task_not_found");
          return t("tasklist.inactive_callback");
        }

        await removeScheduledTask(state.taskId);
        scheduledTaskRuntime.removeTask(state.taskId);
        clearTaskListState(flowKey, "task_deleted");
        return t("tasklist.deleted_callback");
      } catch (error) {
        logger.error(`[TextTaskListFlow] Failed to delete task for ${flowKey}`, error);
        return "❌ 删除任务失败";
      }
    }

    return "⚠️ 请输入“删除”删除此任务，或输入“取消”或 /cancel 退出";
  }

  return null;
}

export function isTextTaskListFlowActive(flowKey: string): boolean {
  return getTaskListState(flowKey) !== null;
}

export function clearTextTaskListFlow(flowKey: string): void {
  clearTaskListState(flowKey, "manual_clear");
}

export function clearAllTextTaskListFlows(): void {
  taskListStates.clear();
}