import { getCurrentProject, loadSettings, setCurrentProject } from "../settings/manager.js";
import { warmupSessionDirectoryCache } from "../session/cache-manager.js";
import { config } from "../config.js";
import { opencodeClient } from "../opencode/client.js";
import { getProjects } from "../project/manager.js";
import { scheduledTaskRuntime } from "../scheduled-task/runtime.js";
import { logger } from "../utils/logger.js";

let initializationPromise: Promise<void> | null = null;

async function autoSelectProjectIfNeeded(): Promise<void> {
  if (getCurrentProject()) {
    const current = getCurrentProject();
    logger.debug(`[App] Project already set: ${current?.name ?? current?.worktree}`);
    return;
  }

  try {
    const projects = await getProjects();
    if (projects.length === 0) {
      logger.warn("[App] No projects found. Use /projects to select one after creating a project.");
      return;
    }

    const selected = projects[0];
    setCurrentProject(selected);
    logger.info(
      `[App] Auto-selected project: ${selected.name ?? selected.worktree} (${selected.id})` +
        (projects.length > 1 ? ` - ${projects.length} projects available, picked most recent` : ""),
    );
  } catch (error) {
    logger.warn("[App] Failed to auto-select project", error);
  }
}

async function checkOpenCodeApiHealth(): Promise<void> {
  try {
    const { data, error } = await opencodeClient.global.health();
    if (error) {
      logger.warn(`[App] OpenCode API health check failed: ${String(error)}`);
      return;
    }

    logger.info(`[App] OpenCode API connection OK (${config.opencode.apiUrl})`, data);
  } catch (error) {
    logger.warn(`[App] OpenCode API unreachable at ${config.opencode.apiUrl}`, error);
  }
}

async function initializeScheduledTaskRuntime(): Promise<void> {
  try {
    await scheduledTaskRuntime.initialize();
    logger.info("[App] Scheduled task runtime initialized");
  } catch (error) {
    logger.error("[App] Failed to initialize scheduled task runtime:", error);
  }
}

export async function initializeSharedRuntime(): Promise<void> {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    await loadSettings();
    await checkOpenCodeApiHealth();
    await warmupSessionDirectoryCache();
    await autoSelectProjectIfNeeded();
    await initializeScheduledTaskRuntime();
  })();

  return initializationPromise;
}

export function __resetSharedRuntimeInitializationForTests(): void {
  initializationPromise = null;
}
