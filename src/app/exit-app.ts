import { logger } from "../utils/logger.js";

const EXIT_SUCCESS = 0;
const EXIT_DELAY_MS = 300;

export async function exitApplication(source: string): Promise<void> {
  logger.info(`[App] Exit requested by ${source}`);

  setTimeout(() => {
    process.exit(EXIT_SUCCESS);
  }, EXIT_DELAY_MS);
}
