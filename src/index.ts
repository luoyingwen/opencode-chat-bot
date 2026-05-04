// Clear HTTP proxy env vars to avoid WebSocket proxy issues
// dingtalk-stream uses ws library which doesn't work well with HTTP proxies
const proxyEnvVars = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "http_proxy",
  "https_proxy",
  "ALL_PROXY",
  "all_proxy",
  "NO_PROXY",
  "no_proxy",
];
for (const key of proxyEnvVars) {
  delete process.env[key];
}

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

  const { initializeLogger } = await import("./utils/logger.js");
  await initializeLogger();

  logger.info("[Proxy] HTTP proxy env vars cleared for WebSocket compatibility");

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
