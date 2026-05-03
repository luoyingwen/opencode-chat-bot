import { randomUUID } from "node:crypto";
import { config } from "../../config.js";
import { isTextInteractionCancelInput } from "./cancel.js";
import { getDateLocale, t } from "../../i18n/index.js";
import { getStoredModel } from "../../model/manager.js";
import { getSessionModel } from "../../model/session-model.js";
import { getConversationState } from "../../settings/manager.js";
import { parseTaskSchedule } from "../../scheduled-task/schedule-parser.js";
import { addScheduledTask, listScheduledTasks } from "../../scheduled-task/store.js";
import { scheduledTaskRuntime } from "../../scheduled-task/runtime.js";
import {
  createScheduledTaskModel,
  type ParsedTaskSchedule,
  type ScheduledTask,
  type ScheduledTaskModel,
} from "../../scheduled-task/types.js";
import { logger } from "../../utils/logger.js";

const TASK_PROMPT_PREVIEW_LENGTH = 100;
const STATE_TIMEOUT_MS = 5 * 60 * 1000;

interface TaskState {
  stage: "awaiting_schedule" | "awaiting_prompt";
  projectId: string;
  projectWorktree: string;
  model: ScheduledTaskModel;
  scheduleText: string;
  parsedSchedule: ParsedTaskSchedule | null;
  lastActivity: number;
}

const taskStates = new Map<string, TaskState>();

function isTaskLimitReached(): boolean {
  return listScheduledTasks().length >= config.bot.taskLimit;
}

function truncateTaskPrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (normalized.length <= TASK_PROMPT_PREVIEW_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, TASK_PROMPT_PREVIEW_LENGTH - 3)}...`;
}

function formatScheduledDate(dateIso: string, timezone: string): string {
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

function getTaskKindLabel(schedule: ParsedTaskSchedule): string {
  return schedule.kind === "cron" ? t("task.kind.cron") : t("task.kind.once");
}

function formatParsedScheduleMessage(schedule: ParsedTaskSchedule): string {
  const cronLine =
    schedule.kind === "cron" ? `${t("task.schedule_preview.cron", { cron: schedule.cron })}\n` : "";

  return t("task.schedule_preview", {
    summary: schedule.summary,
    cronLine,
    timezone: schedule.timezone,
    kind: getTaskKindLabel(schedule),
    nextRunAt: formatScheduledDate(schedule.nextRunAt, schedule.timezone),
  });
}

function formatTaskCreatedMessage(task: ScheduledTask): string {
  const variant = task.model.variant ? ` (${task.model.variant})` : "";
  const hasModel = task.model.providerID && task.model.modelID;
  const modelDisplay = hasModel
    ? `${task.model.providerID}/${task.model.modelID}${variant}`
    : t("task.model.default");
  const cronLine = task.kind === "cron" ? `${t("task.created.cron", { cron: task.cron })}\n` : "";

  return t("task.created", {
    description: truncateTaskPrompt(task.prompt),
    project: task.projectWorktree,
    model: modelDisplay,
    schedule: task.scheduleSummary,
    cronLine,
    nextRunAt: task.nextRunAt ? formatScheduledDate(task.nextRunAt, task.timezone) : "-",
  });
}

function expandCronMinuteField(field: string): number[] {
  const values = new Set<number>();

  for (const token of field.split(",")) {
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      throw new Error("Invalid cron minute field returned by parser");
    }

    for (const value of expandCronMinuteToken(trimmedToken)) {
      values.add(value);
    }
  }

  return Array.from(values).sort((left, right) => left - right);
}

function expandCronMinuteToken(token: string): number[] {
  const [rawBase, rawStep] = token.split("/");
  if (rawStep !== undefined) {
    const step = Number.parseInt(rawStep, 10);
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error("Invalid cron minute step returned by parser");
    }

    const baseValues = expandCronMinuteBase(rawBase);
    return baseValues.filter((_value, index) => index % step === 0);
  }

  return expandCronMinuteBase(rawBase);
}

function expandCronMinuteBase(base: string): number[] {
  if (base === "*") {
    return Array.from({ length: 60 }, (_, index) => index);
  }

  if (base.includes("-")) {
    const [rawStart, rawEnd] = base.split("-");
    const start = parseCronMinuteNumber(rawStart);
    const end = parseCronMinuteNumber(rawEnd);
    if (start > end) {
      throw new Error("Invalid cron minute range returned by parser");
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  return [parseCronMinuteNumber(base)];
}

function parseCronMinuteNumber(value: string): number {
  const parsedValue = Number.parseInt(value, 10);
  if (!Number.isInteger(parsedValue) || parsedValue < 0 || parsedValue > 59) {
    throw new Error("Invalid cron minute value returned by parser");
  }

  return parsedValue;
}

function validateCronMinutesFrequency(cron: string): void {
  const cronParts = cron.trim().split(/\s+/);
  if (cronParts.length < 5) {
    throw new Error("Invalid cron expression returned by parser");
  }

  const minuteValues = expandCronMinuteField(cronParts[0]);
  if (minuteValues.length <= 1) {
    return;
  }

  let minGap = 60;
  for (let index = 0; index < minuteValues.length; index++) {
    const currentValue = minuteValues[index];
    const nextValue = index === minuteValues.length - 1 ? minuteValues[0] + 60 : minuteValues[index + 1];
    minGap = Math.min(minGap, nextValue - currentValue);
  }

  if (minGap < 5) {
    throw new Error(t("task.schedule_too_frequent"));
  }
}

function validateParsedSchedule(parsedSchedule: ParsedTaskSchedule): void {
  if (parsedSchedule.kind === "cron") {
    validateCronMinutesFrequency(parsedSchedule.cron);
  }
}

function clearTaskState(flowKey: string, reason: string): void {
  if (taskStates.has(flowKey)) {
    taskStates.delete(flowKey);
    logger.debug(`[TextTaskFlow] Cleared state for ${flowKey}: ${reason}`);
  }
}

function buildScheduledTask(
  projectId: string,
  projectWorktree: string,
  model: ScheduledTaskModel,
  scheduleText: string,
  parsedSchedule: ParsedTaskSchedule,
  prompt: string,
): ScheduledTask {
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

async function resolveTaskModel(flowKey: string): Promise<ScheduledTaskModel> {
  const state = getConversationState(flowKey);
  const sessionId = state?.currentSession?.id;

  if (sessionId) {
    const sessionModelResult = await getSessionModel(sessionId);
    if (sessionModelResult?.model) {
      return {
        providerID: sessionModelResult.model.providerID,
        modelID: sessionModelResult.model.modelID,
        variant: null,
      };
    }
  }

  const storedModel = getStoredModel(flowKey);
  if (storedModel.providerID && storedModel.modelID) {
    return createScheduledTaskModel(storedModel);
  }

  return {
    providerID: "",
    modelID: "",
    variant: null,
  };
}

export async function handleTextTaskCommand(flowKey: string): Promise<string> {
  const currentProject = getConversationState(flowKey)?.currentProject;
  if (!currentProject) {
    return t("bot.project_not_selected");
  }

  if (isTaskLimitReached()) {
    return t("task.limit_reached", { limit: String(config.bot.taskLimit) });
  }

  clearTaskState(flowKey, "new_task_started");

  const model = await resolveTaskModel(flowKey);

  taskStates.set(flowKey, {
    stage: "awaiting_schedule",
    projectId: currentProject.id,
    projectWorktree: currentProject.worktree,
    model,
    scheduleText: "",
    parsedSchedule: null,
    lastActivity: Date.now(),
  });

  return t("task.prompt.schedule");
}

export async function handleTextTaskInput(flowKey: string, text: string): Promise<string | null> {
  const state = taskStates.get(flowKey);
  if (!state) {
    return null;
  }

  if (Date.now() - state.lastActivity > STATE_TIMEOUT_MS) {
    clearTaskState(flowKey, "timeout");
    return t("task.inactive");
  }

  const trimmedText = text.trim();
  if (isTextInteractionCancelInput(trimmedText)) {
    clearTaskState(flowKey, "user_cancelled");
    return t("task.cancelled");
  }

  state.lastActivity = Date.now();

  if (state.stage === "awaiting_schedule") {
    if (!trimmedText) {
      return t("task.schedule_empty");
    }

    try {
      const parsedSchedule = await parseTaskSchedule(trimmedText, state.projectWorktree);
      validateParsedSchedule(parsedSchedule);
      state.scheduleText = trimmedText;
      state.parsedSchedule = parsedSchedule;
      state.stage = "awaiting_prompt";

      return `${formatParsedScheduleMessage(parsedSchedule)}\n\n${t("task.prompt.body")}\n\n${t("task.hint_cancel")}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t("common.unknown_error");
      logger.warn(`[TextTaskFlow] Failed to parse schedule for ${flowKey}: ${errorMessage}`);
      return `${t("task.parse_error", { message: errorMessage })}\n\n${t("task.hint_cancel")}`;
    }
  }

  if (state.stage === "awaiting_prompt") {
    if (!trimmedText) {
      return t("task.prompt_empty");
    }

    if (!state.parsedSchedule) {
      clearTaskState(flowKey, "missing_schedule");
      return t("task.inactive");
    }

    try {
      if (isTaskLimitReached()) {
        clearTaskState(flowKey, "limit_reached");
        return t("task.limit_reached", { limit: String(config.bot.taskLimit) });
      }

      const task = buildScheduledTask(
        state.projectId,
        state.projectWorktree,
        state.model,
        state.scheduleText,
        state.parsedSchedule,
        trimmedText,
      );

      await addScheduledTask(task);
      scheduledTaskRuntime.registerTask(task);
      clearTaskState(flowKey, "task_completed");
      return formatTaskCreatedMessage(task);
    } catch (error) {
      logger.error(`[TextTaskFlow] Failed to save scheduled task for ${flowKey}`, error);
      return t("error.generic");
    }
  }

  return null;
}

export function isTextTaskFlowActive(flowKey: string): boolean {
  const state = taskStates.get(flowKey);
  if (!state) {
    return false;
  }

  if (Date.now() - state.lastActivity > STATE_TIMEOUT_MS) {
    clearTaskState(flowKey, "timeout_check");
    return false;
  }

  return true;
}

export function clearTextTaskFlow(flowKey: string): void {
  clearTaskState(flowKey, "manual_clear");
}

export function clearAllTextTaskFlows(): void {
  taskStates.clear();
}