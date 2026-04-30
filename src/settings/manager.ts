import type { ModelInfo } from "../model/types.js";
import { cloneScheduledTask, type ScheduledTask } from "../scheduled-task/types.js";
import path from "node:path";
import { getRuntimePaths } from "../runtime/paths.js";
import { logger } from "../utils/logger.js";

export interface ProjectInfo {
  id: string;
  worktree: string;
  name?: string;
}

export interface SessionInfo {
  id: string;
  title: string;
  directory: string;
}

export interface ConversationSettingsState {
  currentProject?: ProjectInfo;
  currentSession?: SessionInfo;
  currentAgent?: string;
  currentModel?: ModelInfo;
  interceptMode?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ConversationSettingsStatePatch {
  currentProject?: ProjectInfo | null;
  currentSession?: SessionInfo | null;
  currentAgent?: string | null;
  currentModel?: ModelInfo | null;
  interceptMode?: boolean | null;
  metadata?: Record<string, unknown> | null;
}

export interface ServerProcessInfo {
  pid: number;
  startTime: string; // ISO string
}

export interface SessionDirectoryCacheInfo {
  version: 1;
  lastSyncedUpdatedAt: number;
  directories: Array<{
    worktree: string;
    lastUpdated: number;
  }>;
}

export interface UserChatMapping {
  chatId: string;
  lastUpdated: number; // timestamp
}

export interface Settings {
  currentProject?: ProjectInfo;
  currentSession?: SessionInfo;
  currentAgent?: string;
  currentModel?: ModelInfo;
  conversationStates?: Record<string, ConversationSettingsState>;
  pinnedMessageId?: number;
  ttsEnabled?: boolean;
  serverProcess?: ServerProcessInfo;
  sessionDirectoryCache?: SessionDirectoryCacheInfo;
  scheduledTasks?: ScheduledTask[];
  userChatMappings?: Record<string, UserChatMapping>; // userId -> mapping
}

function cloneScheduledTasks(tasks: ScheduledTask[] | undefined): ScheduledTask[] | undefined {
  return tasks?.map((task) => cloneScheduledTask(task));
}

function cloneConversationState(
  state: ConversationSettingsState | undefined,
): ConversationSettingsState | undefined {
  if (!state) {
    return undefined;
  }

  return {
    currentProject: state.currentProject ? { ...state.currentProject } : undefined,
    currentSession: state.currentSession ? { ...state.currentSession } : undefined,
    currentAgent: state.currentAgent,
    currentModel: state.currentModel ? { ...state.currentModel } : undefined,
    interceptMode: state.interceptMode,
    metadata: state.metadata ? { ...state.metadata } : undefined,
  };
}

function buildLegacyConversationState(settings: Settings): ConversationSettingsState | undefined {
  const state: ConversationSettingsState = {
    currentProject: settings.currentProject ? { ...settings.currentProject } : undefined,
    currentSession: settings.currentSession ? { ...settings.currentSession } : undefined,
    currentAgent: settings.currentAgent,
    currentModel: settings.currentModel ? { ...settings.currentModel } : undefined,
  };

  return isConversationStateEmpty(state) ? undefined : state;
}

function isConversationStateEmpty(state: ConversationSettingsState | undefined): boolean {
  if (!state) {
    return true;
  }

  return (
    !state.currentProject &&
    !state.currentSession &&
    !state.currentAgent &&
    !state.currentModel &&
    state.interceptMode === undefined &&
    (!state.metadata || Object.keys(state.metadata).length === 0)
  );
}

const DEFAULT_CONVERSATION_ROUTE_KEY = "global:global";

function syncLegacyConversationState(routeKey: string): void {
  if (routeKey !== DEFAULT_CONVERSATION_ROUTE_KEY) {
    return;
  }

  const state = currentSettings.conversationStates?.[routeKey];
  currentSettings.currentProject = state?.currentProject ? { ...state.currentProject } : undefined;
  currentSettings.currentSession = state?.currentSession ? { ...state.currentSession } : undefined;
  currentSettings.currentAgent = state?.currentAgent;
  currentSettings.currentModel = state?.currentModel ? { ...state.currentModel } : undefined;
}

function ensureConversationStates(): Record<string, ConversationSettingsState> {
  if (!currentSettings.conversationStates) {
    currentSettings.conversationStates = {};
  }

  return currentSettings.conversationStates;
}

function getSettingsFilePath(): string {
  return getRuntimePaths().settingsFilePath;
}

async function readSettingsFile(): Promise<Settings> {
  try {
    const fs = await import("fs/promises");
    const content = await fs.readFile(getSettingsFilePath(), "utf-8");
    return JSON.parse(content) as Settings;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error("[SettingsManager] Error reading settings file:", error);
    }
    return {};
  }
}

let settingsWriteQueue: Promise<void> = Promise.resolve();

function writeSettingsFile(settings: Settings): Promise<void> {
  settingsWriteQueue = settingsWriteQueue
    .catch(() => {
      // Keep write queue alive after failed writes.
    })
    .then(async () => {
      try {
        const fs = await import("fs/promises");
        const settingsFilePath = getSettingsFilePath();
        await fs.mkdir(path.dirname(settingsFilePath), { recursive: true });
        await fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 2));
      } catch (err) {
        logger.error("[SettingsManager] Error writing settings file:", err);
      }
    });

  return settingsWriteQueue;
}

let currentSettings: Settings = {};

export function getDefaultConversationRouteKey(): string {
  return DEFAULT_CONVERSATION_ROUTE_KEY;
}

export function getConversationState(routeKey: string): ConversationSettingsState | undefined {
  const state = currentSettings.conversationStates?.[routeKey];
  if (state) {
    return cloneConversationState(state);
  }

  if (routeKey === DEFAULT_CONVERSATION_ROUTE_KEY) {
    return cloneConversationState(buildLegacyConversationState(currentSettings));
  }

  return undefined;
}

export function updateConversationState(
  routeKey: string,
  patch: ConversationSettingsStatePatch,
): ConversationSettingsState {
  const conversationStates = ensureConversationStates();
  const nextState = cloneConversationState(conversationStates[routeKey]) ?? {};

  if (Object.prototype.hasOwnProperty.call(patch, "currentProject")) {
    nextState.currentProject = patch.currentProject ? { ...patch.currentProject } : undefined;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "currentSession")) {
    nextState.currentSession = patch.currentSession ? { ...patch.currentSession } : undefined;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "currentAgent")) {
    nextState.currentAgent = patch.currentAgent ?? undefined;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "currentModel")) {
    nextState.currentModel = patch.currentModel ? { ...patch.currentModel } : undefined;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "interceptMode")) {
    nextState.interceptMode = patch.interceptMode ?? undefined;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "metadata")) {
    nextState.metadata = patch.metadata ? { ...patch.metadata } : undefined;
  }

  if (isConversationStateEmpty(nextState)) {
    delete conversationStates[routeKey];
  } else {
    conversationStates[routeKey] = nextState;
  }

  syncLegacyConversationState(routeKey);
  void writeSettingsFile(currentSettings);

  return cloneConversationState(conversationStates[routeKey]) ?? {};
}

export function clearConversationState(routeKey: string): void {
  if (!currentSettings.conversationStates?.[routeKey]) {
    if (routeKey === DEFAULT_CONVERSATION_ROUTE_KEY) {
      currentSettings.currentProject = undefined;
      currentSettings.currentSession = undefined;
      currentSettings.currentAgent = undefined;
      currentSettings.currentModel = undefined;
      void writeSettingsFile(currentSettings);
    }
    return;
  }

  delete currentSettings.conversationStates[routeKey];
  syncLegacyConversationState(routeKey);
  void writeSettingsFile(currentSettings);
}

export function getCurrentProject(): ProjectInfo | undefined {
  return getConversationState(DEFAULT_CONVERSATION_ROUTE_KEY)?.currentProject;
}

export function setCurrentProject(projectInfo: ProjectInfo): void {
  updateConversationState(DEFAULT_CONVERSATION_ROUTE_KEY, { currentProject: projectInfo });
}

export function clearProject(): void {
  updateConversationState(DEFAULT_CONVERSATION_ROUTE_KEY, { currentProject: null });
}

export function getCurrentSession(): SessionInfo | undefined {
  return getConversationState(DEFAULT_CONVERSATION_ROUTE_KEY)?.currentSession;
}

export function setCurrentSession(sessionInfo: SessionInfo): void {
  updateConversationState(DEFAULT_CONVERSATION_ROUTE_KEY, { currentSession: sessionInfo });
}

export function clearSession(): void {
  updateConversationState(DEFAULT_CONVERSATION_ROUTE_KEY, { currentSession: null });
}

export function isTtsEnabled(): boolean {
  return currentSettings.ttsEnabled === true;
}

export function setTtsEnabled(enabled: boolean): void {
  currentSettings.ttsEnabled = enabled;
  void writeSettingsFile(currentSettings);
}

export function getCurrentAgent(): string | undefined {
  return getConversationState(DEFAULT_CONVERSATION_ROUTE_KEY)?.currentAgent;
}

export function setCurrentAgent(agentName: string): void {
  updateConversationState(DEFAULT_CONVERSATION_ROUTE_KEY, { currentAgent: agentName });
}

export function clearCurrentAgent(): void {
  updateConversationState(DEFAULT_CONVERSATION_ROUTE_KEY, { currentAgent: null });
}

export function getCurrentModel(): ModelInfo | undefined {
  return getConversationState(DEFAULT_CONVERSATION_ROUTE_KEY)?.currentModel;
}

export function setCurrentModel(modelInfo: ModelInfo): void {
  updateConversationState(DEFAULT_CONVERSATION_ROUTE_KEY, { currentModel: modelInfo });
}

export function clearCurrentModel(): void {
  updateConversationState(DEFAULT_CONVERSATION_ROUTE_KEY, { currentModel: null });
}

export function getPinnedMessageId(): number | undefined {
  return currentSettings.pinnedMessageId;
}

export function setPinnedMessageId(messageId: number): void {
  currentSettings.pinnedMessageId = messageId;
  void writeSettingsFile(currentSettings);
}

export function clearPinnedMessageId(): void {
  currentSettings.pinnedMessageId = undefined;
  void writeSettingsFile(currentSettings);
}

export function getServerProcess(): ServerProcessInfo | undefined {
  return currentSettings.serverProcess;
}

export function setServerProcess(processInfo: ServerProcessInfo): void {
  currentSettings.serverProcess = processInfo;
  void writeSettingsFile(currentSettings);
}

export function clearServerProcess(): void {
  currentSettings.serverProcess = undefined;
  void writeSettingsFile(currentSettings);
}

export function getSessionDirectoryCache(): SessionDirectoryCacheInfo | undefined {
  return currentSettings.sessionDirectoryCache;
}

export function setSessionDirectoryCache(cache: SessionDirectoryCacheInfo): Promise<void> {
  currentSettings.sessionDirectoryCache = cache;
  return writeSettingsFile(currentSettings);
}

export function clearSessionDirectoryCache(): void {
  currentSettings.sessionDirectoryCache = undefined;
  void writeSettingsFile(currentSettings);
}

export function getScheduledTasks(): ScheduledTask[] {
  return cloneScheduledTasks(currentSettings.scheduledTasks) ?? [];
}

export function setScheduledTasks(tasks: ScheduledTask[]): Promise<void> {
  currentSettings.scheduledTasks = cloneScheduledTasks(tasks);
  return writeSettingsFile(currentSettings);
}

// User-Chat Mappings for proactive messaging
export function getUserChatMapping(userId: string): UserChatMapping | undefined {
  return currentSettings.userChatMappings?.[userId];
}

export function setUserChatMapping(userId: string, chatId: string): Promise<void> {
  if (!currentSettings.userChatMappings) {
    currentSettings.userChatMappings = {};
  }
  currentSettings.userChatMappings[userId] = {
    chatId,
    lastUpdated: Date.now(),
  };
  return writeSettingsFile(currentSettings);
}

export function getAllUserChatMappings(): Record<string, UserChatMapping> {
  return currentSettings.userChatMappings ?? {};
}

export function clearUserChatMapping(userId: string): Promise<void> {
  if (currentSettings.userChatMappings?.[userId]) {
    delete currentSettings.userChatMappings[userId];
    return writeSettingsFile(currentSettings);
  }
  return Promise.resolve();
}

export function __resetSettingsForTests(): void {
  currentSettings = {};
  settingsWriteQueue = Promise.resolve();
}

export async function loadSettings(): Promise<void> {
  const loadedSettings = (await readSettingsFile()) as Settings & {
    toolMessagesIntervalSec?: unknown;
  };
  let shouldWrite = false;

  if ("toolMessagesIntervalSec" in loadedSettings) {
    delete loadedSettings.toolMessagesIntervalSec;
    shouldWrite = true;
  }

  const legacyConversationState = buildLegacyConversationState(loadedSettings);
  if (legacyConversationState) {
    if (!loadedSettings.conversationStates) {
      loadedSettings.conversationStates = {};
    }

    if (!loadedSettings.conversationStates[DEFAULT_CONVERSATION_ROUTE_KEY]) {
      loadedSettings.conversationStates[DEFAULT_CONVERSATION_ROUTE_KEY] = legacyConversationState;
      shouldWrite = true;
    }
  }

  currentSettings = loadedSettings;
  currentSettings.scheduledTasks = cloneScheduledTasks(loadedSettings.scheduledTasks) ?? [];

  if (currentSettings.conversationStates?.[DEFAULT_CONVERSATION_ROUTE_KEY]) {
    syncLegacyConversationState(DEFAULT_CONVERSATION_ROUTE_KEY);
  }

  if (shouldWrite) {
    void writeSettingsFile(currentSettings);
  }
}
