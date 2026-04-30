import { config } from "../config.js";
import type {
  OpenClawPluginConfigInput,
  OpenClawRuntimeConfig,
  OpenClawScopeContext,
} from "./types.js";

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((item) => normalizeText(item)?.toLowerCase())
    .filter((item): item is string => Boolean(item));

  return items.length > 0 ? items : undefined;
}

export function readOpenClawPluginConfig(value: unknown): OpenClawPluginConfigInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : undefined,
    channels: normalizeStringList(record.channels),
    accountIds: normalizeStringList(record.accountIds),
    conversationIds: normalizeStringList(record.conversationIds),
  };
}

function normalizeEnvList(values: string[]): string[] {
  return values.map((value) => value.toLowerCase()).filter((value) => value.length > 0);
}

export function resolveOpenClawRuntimeConfig(
  pluginConfig: OpenClawPluginConfigInput = {},
): OpenClawRuntimeConfig {
  return {
    enabled: pluginConfig.enabled ?? config.openclaw.enabled,
    channels: pluginConfig.channels ?? normalizeEnvList(config.openclaw.channels),
    accountIds: pluginConfig.accountIds ?? normalizeEnvList(config.openclaw.accountIds),
    conversationIds:
      pluginConfig.conversationIds ?? normalizeEnvList(config.openclaw.conversationIds),
  };
}

export function matchesOpenClawScope(
  runtimeConfig: OpenClawRuntimeConfig,
  context: OpenClawScopeContext,
): boolean {
  const channelId = normalizeText(context.channelId)?.toLowerCase();
  const accountId = normalizeText(context.accountId)?.toLowerCase();
  const conversationId = normalizeText(context.conversationId)?.toLowerCase();

  if (
    runtimeConfig.channels.length > 0 &&
    (!channelId || !runtimeConfig.channels.includes(channelId))
  ) {
    return false;
  }

  if (
    runtimeConfig.accountIds.length > 0 &&
    (!accountId || !runtimeConfig.accountIds.includes(accountId))
  ) {
    return false;
  }

  if (
    runtimeConfig.conversationIds.length > 0 &&
    (!conversationId || !runtimeConfig.conversationIds.includes(conversationId))
  ) {
    return false;
  }

  return true;
}

export function explainOpenClawScopeMismatch(
  runtimeConfig: OpenClawRuntimeConfig,
  context: OpenClawScopeContext,
): string | undefined {
  const channelId = normalizeText(context.channelId)?.toLowerCase();
  const accountId = normalizeText(context.accountId)?.toLowerCase();
  const conversationId = normalizeText(context.conversationId)?.toLowerCase();

  if (
    runtimeConfig.channels.length > 0 &&
    (!channelId || !runtimeConfig.channels.includes(channelId))
  ) {
    return `channel mismatch current=${channelId ?? "unknown"} expected=${runtimeConfig.channels.join(",")}`;
  }

  if (
    runtimeConfig.accountIds.length > 0 &&
    (!accountId || !runtimeConfig.accountIds.includes(accountId))
  ) {
    return `account mismatch current=${accountId ?? "unknown"} expected=${runtimeConfig.accountIds.join(",")}`;
  }

  if (
    runtimeConfig.conversationIds.length > 0 &&
    (!conversationId || !runtimeConfig.conversationIds.includes(conversationId))
  ) {
    return `conversation mismatch current=${conversationId ?? "unknown"} expected=${runtimeConfig.conversationIds.join(",")}`;
  }

  return undefined;
}
