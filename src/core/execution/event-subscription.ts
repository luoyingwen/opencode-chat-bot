import { subscribeToEvents } from "../../opencode/events.js";
import { ingestSessionInfoForCache } from "../../session/cache-manager.js";
import { summaryAggregator } from "../../summary/aggregator.js";
import { logger } from "../../utils/logger.js";
import { safeBackgroundTask } from "../../utils/safe-background-task.js";

export async function ensureOpenCodeEventSubscription(
  platformName: string,
  directory: string,
): Promise<void> {
  if (!directory) {
    logger.error(`[${platformName}] No directory found for event subscription`);
    return;
  }

  logger.info(`[${platformName}] Subscribing to OpenCode events for project: ${directory}`);
  void subscribeToEvents(directory, (event) => {
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

  logger.debug(`[${platformName}] Event subscription initiated (running in background)`);
}
