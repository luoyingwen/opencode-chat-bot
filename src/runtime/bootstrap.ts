import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getRuntimePaths, type RuntimePaths } from "./paths.js";
import {
  getLocale,
  getLocaleOptions,
  resolveSupportedLocale,
  setRuntimeLocale,
  t,
  type Locale,
} from "../i18n/index.js";

const FALLBACK_MODEL_PROVIDER = "opencode";
const FALLBACK_MODEL_ID = "big-pickle";

interface ModelDefaults {
  provider: string;
  modelId: string;
}

interface EnvValidationResult {
  isValid: boolean;
  reason?: string;
}

export interface WizardEnvValues {
  BOT_LOCALE: Locale;
  DINGTALK_APP_KEY?: string;
  DINGTALK_APP_SECRET?: string;
  DINGTALK_ALLOWED_USER_ID?: string;
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_ALLOWED_USER_ID?: string;
  OPENCODE_API_URL?: string;
  OPENCODE_SERVER_USERNAME?: string;
  OPENCODE_SERVER_PASSWORD?: string;
  OPENCODE_MODEL_PROVIDER: string;
  OPENCODE_MODEL_ID: string;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateRuntimeEnvValues(values: Record<string, string>): EnvValidationResult {
  const hasDingTalk = !!(
    values.DINGTALK_APP_KEY?.trim() &&
    values.DINGTALK_APP_SECRET?.trim()
  );
  const hasFeishu = !!(
    values.FEISHU_APP_ID?.trim() &&
    values.FEISHU_APP_SECRET?.trim()
  );

  if (!hasDingTalk && !hasFeishu) {
    return {
      isValid: false,
      reason:
        "Missing supported platform credentials. Configure DingTalk or Feishu credentials.",
    };
  }

  if (!values.OPENCODE_MODEL_PROVIDER || values.OPENCODE_MODEL_PROVIDER.trim().length === 0) {
    return { isValid: false, reason: "Missing OPENCODE_MODEL_PROVIDER" };
  }

  if (!values.OPENCODE_MODEL_ID || values.OPENCODE_MODEL_ID.trim().length === 0) {
    return { isValid: false, reason: "Missing OPENCODE_MODEL_ID" };
  }

  const apiUrl = values.OPENCODE_API_URL?.trim();
  if (apiUrl && !isValidHttpUrl(apiUrl)) {
    return { isValid: false, reason: "Invalid OPENCODE_API_URL" };
  }

  return { isValid: true };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeEnvLineEndings(content: string): string[] {
  const lines = content.split(/\r?\n/).map((line) => line.replace(/\r$/, ""));

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

function removeEnvKey(lines: string[], key: string): string[] {
  const regex = new RegExp(`^\\s*(?:export\\s+)?${escapeRegex(key)}\\s*=`);
  return lines.filter((line) => !regex.test(line));
}

function finalizeEnvContent(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

export function buildEnvFileContent(existingContent: string, values: WizardEnvValues): string {
  let lines = normalizeEnvLineEndings(existingContent);

  const orderedUpdates: Array<[keyof WizardEnvValues, string | undefined]> = [
    ["BOT_LOCALE", values.BOT_LOCALE],
    ["DINGTALK_APP_KEY", values.DINGTALK_APP_KEY],
    ["DINGTALK_APP_SECRET", values.DINGTALK_APP_SECRET],
    ["DINGTALK_ALLOWED_USER_ID", values.DINGTALK_ALLOWED_USER_ID],
    ["FEISHU_APP_ID", values.FEISHU_APP_ID],
    ["FEISHU_APP_SECRET", values.FEISHU_APP_SECRET],
    ["FEISHU_ALLOWED_USER_ID", values.FEISHU_ALLOWED_USER_ID],
    ["OPENCODE_API_URL", values.OPENCODE_API_URL],
    ["OPENCODE_SERVER_USERNAME", values.OPENCODE_SERVER_USERNAME],
    ["OPENCODE_SERVER_PASSWORD", values.OPENCODE_SERVER_PASSWORD],
    ["OPENCODE_MODEL_PROVIDER", values.OPENCODE_MODEL_PROVIDER],
    ["OPENCODE_MODEL_ID", values.OPENCODE_MODEL_ID],
  ];

  for (const [key, value] of orderedUpdates) {
    lines = removeEnvKey(lines, key);

    if (value && value.trim().length > 0) {
      lines.push(`${key}=${value}`);
    }
  }

  return finalizeEnvContent(lines);
}

async function readEnvFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function writeFileAtomically(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const tempFilePath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempFilePath, content, "utf-8");
  await fs.rename(tempFilePath, filePath);
}

async function ensureSettingsFile(settingsFilePath: string): Promise<void> {
  try {
    await fs.access(settingsFilePath);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  await fs.mkdir(path.dirname(settingsFilePath), { recursive: true });
  await fs.writeFile(settingsFilePath, "{}\n", "utf-8");
}

function getEnvExamplePath(): string {
  const currentFilePath = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFilePath), "..", "..", ".env.example");
}

async function loadEnvExampleContent(): Promise<string> {
  return fs.readFile(getEnvExamplePath(), "utf-8");
}

async function loadModelDefaultsFromEnvExample(): Promise<ModelDefaults> {
  const fallbackDefaults: ModelDefaults = {
    provider: FALLBACK_MODEL_PROVIDER,
    modelId: FALLBACK_MODEL_ID,
  };

  try {
    const content = await fs.readFile(getEnvExamplePath(), "utf-8");
    const parsed = dotenv.parse(content);

    const provider = parsed.OPENCODE_MODEL_PROVIDER?.trim();
    const modelId = parsed.OPENCODE_MODEL_ID?.trim();

    if (!provider || !modelId) {
      return fallbackDefaults;
    }

    return {
      provider,
      modelId,
    };
  } catch {
    return fallbackDefaults;
  }
}

async function askVisible(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function askLocale(): Promise<Locale> {
  const localeOptions = getLocaleOptions();
  const defaultLocale = getLocale();
  const defaultLocaleOption =
    localeOptions.find((localeOption) => localeOption.code === defaultLocale) ?? localeOptions[0];
  const optionsText = localeOptions
    .map((localeOption, index) => `${index + 1} - ${localeOption.label} (${localeOption.code})`)
    .join("\n");

  const prompt = t("runtime.wizard.ask_language", {
    options: optionsText,
    defaultLocale: `${defaultLocaleOption.label} (${defaultLocaleOption.code})`,
  });

  for (;;) {
    const answer = await askVisible(prompt);

    if (!answer) {
      return defaultLocaleOption.code;
    }

    if (/^\d+$/.test(answer)) {
      const index = Number.parseInt(answer, 10) - 1;
      if (index >= 0 && index < localeOptions.length) {
        return localeOptions[index].code;
      }
    }

    const localeByCode = resolveSupportedLocale(answer);
    if (localeByCode) {
      return localeByCode;
    }

    process.stdout.write(t("runtime.wizard.language_invalid"));
  }
}

function ensureInteractiveTty(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(t("runtime.wizard.tty_required"));
  }
}

async function validateExistingEnv(envFilePath: string): Promise<EnvValidationResult> {
  const content = await readEnvFileIfExists(envFilePath);

  if (content === null) {
    return { isValid: false, reason: "Missing .env" };
  }

  const parsed = dotenv.parse(content);
  return validateRuntimeEnvValues(parsed);
}

async function initializeConfigTemplate(
  runtimePaths: RuntimePaths,
  locale: Locale,
): Promise<void> {
  const [existingContent, envExampleContent, modelDefaults] = await Promise.all([
    readEnvFileIfExists(runtimePaths.envFilePath),
    loadEnvExampleContent(),
    loadModelDefaultsFromEnvExample(),
  ]);

  const baseContent = existingContent ?? envExampleContent;
  const existingParsed = dotenv.parse(baseContent);
  const envValues: WizardEnvValues = {
    BOT_LOCALE: locale,
    DINGTALK_APP_KEY: existingParsed.DINGTALK_APP_KEY,
    DINGTALK_APP_SECRET: existingParsed.DINGTALK_APP_SECRET,
    DINGTALK_ALLOWED_USER_ID: existingParsed.DINGTALK_ALLOWED_USER_ID,
    FEISHU_APP_ID: existingParsed.FEISHU_APP_ID,
    FEISHU_APP_SECRET: existingParsed.FEISHU_APP_SECRET,
    FEISHU_ALLOWED_USER_ID: existingParsed.FEISHU_ALLOWED_USER_ID,
    OPENCODE_API_URL: existingParsed.OPENCODE_API_URL,
    OPENCODE_SERVER_USERNAME: existingParsed.OPENCODE_SERVER_USERNAME,
    OPENCODE_SERVER_PASSWORD: existingParsed.OPENCODE_SERVER_PASSWORD,
    OPENCODE_MODEL_PROVIDER: existingParsed.OPENCODE_MODEL_PROVIDER || modelDefaults.provider,
    OPENCODE_MODEL_ID: existingParsed.OPENCODE_MODEL_ID || modelDefaults.modelId,
  };

  const envContent = buildEnvFileContent(baseContent, envValues);
  await writeFileAtomically(runtimePaths.envFilePath, envContent);
  await ensureSettingsFile(runtimePaths.settingsFilePath);

  process.stdout.write(
    t("runtime.wizard.saved", {
      envPath: runtimePaths.envFilePath,
      settingsPath: runtimePaths.settingsFilePath,
    }),
  );
}

export async function ensureRuntimeConfigForStart(): Promise<void> {
  const runtimePaths = getRuntimePaths();

  if (runtimePaths.mode !== "installed") {
    return;
  }

  const validationResult = await validateExistingEnv(runtimePaths.envFilePath);
  if (validationResult.isValid) {
    await ensureSettingsFile(runtimePaths.settingsFilePath);
    return;
  }

  process.stdout.write(t("runtime.wizard.not_configured_starting"));
  await initializeConfigTemplate(runtimePaths, getLocale());
  throw new Error(
    `Bot platform credentials are missing or incomplete. Review ${runtimePaths.envFilePath} and rerun the command.`,
  );
}

export async function runConfigWizardCommand(): Promise<void> {
  const runtimePaths = getRuntimePaths();
  ensureInteractiveTty();
  const locale = await askLocale();
  setRuntimeLocale(locale);
  process.stdout.write("\n");
  const selectedLocaleOption =
    getLocaleOptions().find((localeOption) => localeOption.code === locale) ?? null;
  process.stdout.write(
    t("runtime.wizard.language_selected", {
      language:
        selectedLocaleOption !== null
          ? `${selectedLocaleOption.label} (${selectedLocaleOption.code})`
          : locale,
    }),
  );
  process.stdout.write("\n");
  process.stdout.write(t("runtime.wizard.start"));
  process.stdout.write("\n");
  await initializeConfigTemplate(runtimePaths, locale);
}
