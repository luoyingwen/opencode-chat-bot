import dotenv from "dotenv";
import { getRuntimePaths } from "./runtime/paths.js";
import { normalizeLocale, type Locale } from "./i18n/index.js";
import { logger } from "./utils/logger.js";

const runtimePaths = getRuntimePaths();
dotenv.config({ path: runtimePaths.envFilePath, quiet: true });

export type MessageFormatMode = "raw" | "markdown";

function getEnvVar(key: string, required: boolean = true): string {
  const value = process.env[key];
  if (required && !value) {
    throw new Error(
      `Missing required environment variable: ${key} (expected in ${runtimePaths.envFilePath})`,
    );
  }
  return value || "";
}

function getOptionalPositiveIntEnvVar(key: string, defaultValue: number): number {
  const value = getEnvVar(key, false);

  if (!value) {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(value, 10);
  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    return defaultValue;
  }

  return parsedValue;
}

function getOptionalLocaleEnvVar(key: string, defaultValue: Locale): Locale {
  const value = getEnvVar(key, false);
  return normalizeLocale(value, defaultValue);
}

function getOptionalBooleanEnvVar(key: string, defaultValue: boolean): boolean {
  const value = getEnvVar(key, false);

  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function getOptionalMessageFormatModeEnvVar(
  key: string,
  defaultValue: MessageFormatMode,
): MessageFormatMode {
  const value = getEnvVar(key, false);

  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "raw" || normalized === "markdown") {
    return normalized;
  }

  return defaultValue;
}

function buildConfig() {
  return {
    opencode: {
      apiUrl: getEnvVar("OPENCODE_API_URL", false) || "http://localhost:4096",
      username: getEnvVar("OPENCODE_SERVER_USERNAME", false) || "opencode",
      password: getEnvVar("OPENCODE_SERVER_PASSWORD", false),
      model: {
        provider: getEnvVar("OPENCODE_MODEL_PROVIDER", false),
        modelId: getEnvVar("OPENCODE_MODEL_ID", false),
      },
    },
    server: {
      logLevel: getEnvVar("LOG_LEVEL", false) || "info",
    },
    bot: {
      sessionsListLimit: getOptionalPositiveIntEnvVar("SESSIONS_LIST_LIMIT", 10),
      projectsListLimit: getOptionalPositiveIntEnvVar("PROJECTS_LIST_LIMIT", 10),
      commandsListLimit: getOptionalPositiveIntEnvVar("COMMANDS_LIST_LIMIT", 10),
      taskLimit: getOptionalPositiveIntEnvVar("TASK_LIMIT", 10),
      responseStreamThrottleMs: getOptionalPositiveIntEnvVar("RESPONSE_STREAM_THROTTLE_MS", 500),
      bashToolDisplayMaxLength: getOptionalPositiveIntEnvVar("BASH_TOOL_DISPLAY_MAX_LENGTH", 128),
      locale: getOptionalLocaleEnvVar("BOT_LOCALE", "en"),
      hideThinkingMessages: getOptionalBooleanEnvVar("HIDE_THINKING_MESSAGES", false),
      hideToolCallMessages: getOptionalBooleanEnvVar("HIDE_TOOL_CALL_MESSAGES", false),
      hideToolFileMessages: getOptionalBooleanEnvVar("HIDE_TOOL_FILE_MESSAGES", false),
      messageFormatMode: getOptionalMessageFormatModeEnvVar("MESSAGE_FORMAT_MODE", "markdown"),
    },
    files: {
      maxFileSizeKb: parseInt(getEnvVar("CODE_FILE_MAX_SIZE_KB", false) || "100", 10),
    },
    dingtalk: {
      appKey: getEnvVar("DINGTALK_APP_KEY", false),
      appSecret: getEnvVar("DINGTALK_APP_SECRET", false),
      allowedUserId: getEnvVar("DINGTALK_ALLOWED_USER_ID", false),
    },
    feishu: {
      appId: getEnvVar("FEISHU_APP_ID", false),
      appSecret: getEnvVar("FEISHU_APP_SECRET", false),
      domain: getEnvVar("FEISHU_DOMAIN", false) || "feishu",
      allowedUserId: getEnvVar("FEISHU_ALLOWED_USER_ID", false),
    },
  };
}

const _config = buildConfig();

export function reloadConfig(): void {
  dotenv.config({ path: runtimePaths.envFilePath, override: true });
  _config.dingtalk.allowedUserId = getEnvVar("DINGTALK_ALLOWED_USER_ID", false);
  _config.feishu.allowedUserId = getEnvVar("FEISHU_ALLOWED_USER_ID", false);
  logger.info("[Config] Configuration reloaded from .env");
}

export const config = _config;
