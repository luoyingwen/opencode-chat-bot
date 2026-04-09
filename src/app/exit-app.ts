import { processManager } from "../process/manager.js";
import { logger } from "../utils/logger.js";

const EXIT_SUCCESS = 0;
const EXIT_DELAY_MS = 300;

export async function exitApplication(source: string): Promise<void> {
  logger.info(`[App] Exit requested by ${source}`);

  if (processManager.isRunning()) {
    const pid = processManager.getPID();
    logger.info(`[App] Stopping managed OpenCode server before exit (PID=${pid ?? "-"})`);

    const { success, error } = await processManager.stop(5000);
    if (!success) {
      logger.warn(
        `[App] Failed to stop managed OpenCode server before exit: ${error ?? "unknown"}`,
      );
    }
  }

  setTimeout(() => {
    process.exit(EXIT_SUCCESS);
  }, EXIT_DELAY_MS);
}
