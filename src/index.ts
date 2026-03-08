import { resolveRuntimeMode, setRuntimeMode } from "./runtime/mode.js";
import { logger } from "./utils/logger.js";

const EXIT_RUNTIME_ERROR = 1;
const EXIT_INVALID_ARGS = 2;

// Global error handlers to prevent crashes from uncaught errors
process.on("unhandledRejection", (reason: unknown) => {
  logger.error("[Global] Unhandled Promise rejection:", reason);
  // Don't exit - let the app continue running
});

process.on("uncaughtException", (error: Error) => {
  logger.error("[Global] Uncaught exception:", error);
  // Give logger time to flush, then exit
  setTimeout(() => {
    process.exit(EXIT_RUNTIME_ERROR);
  }, 1000);
});

async function main(): Promise<void> {
  const modeResult = resolveRuntimeMode({
    defaultMode: "sources",
    argv: process.argv.slice(2),
  });

  if (modeResult.error) {
    process.stderr.write(`${modeResult.error}\n`);
    process.exit(EXIT_INVALID_ARGS);
    return;
  }

  setRuntimeMode(modeResult.mode);

  const { startBotApp } = await import("./app/start-bot-app.js");
  await startBotApp();
}

void main().catch((error: unknown) => {
  if (error instanceof Error) {
    process.stderr.write(`Failed to start bot: ${error.message}\n`);
  } else {
    process.stderr.write(`Failed to start bot: ${String(error)}\n`);
  }

  process.exit(EXIT_RUNTIME_ERROR);
});
