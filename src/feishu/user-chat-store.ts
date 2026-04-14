/**
 * Feishu User-Chat Mapping Store
 *
 * Manages persistent storage of userId -> chatId mappings for proactive messaging.
 * This enables sending messages to users even when they haven't recently interacted.
 */

import {
  getUserChatMapping,
  setUserChatMapping,
  getAllUserChatMappings,
  clearUserChatMapping,
} from "../settings/manager.js";
import { logger } from "../utils/logger.js";

// Runtime cache for quick lookups
const runtimeUserChatMap = new Map<string, string>();

let initialized = false;

/**
 * Initialize the user-chat store from persistent settings.
 * Should be called once at startup.
 */
export async function initUserChatStore(): Promise<void> {
  if (initialized) {
    return;
  }

  const mappings = getAllUserChatMappings();
  for (const [userId, mapping] of Object.entries(mappings)) {
    runtimeUserChatMap.set(userId, mapping.chatId);
  }

  initialized = true;
  logger.info(
    `[FeishuUserChatStore] Initialized with ${runtimeUserChatMap.size} user-chat mappings`,
  );
}

/**
 * Store or update a user-chat mapping.
 * This persists to settings.json for durability across restarts.
 */
export async function storeUserChatMapping(userId: string, chatId: string): Promise<void> {
  if (!userId || !chatId) {
    logger.warn("[FeishuUserChatStore] Attempted to store invalid mapping", { userId, chatId });
    return;
  }

  // Update runtime cache
  runtimeUserChatMap.set(userId, chatId);

  // Persist to settings
  await setUserChatMapping(userId, chatId);

  logger.debug(`[FeishuUserChatStore] Stored mapping: ${userId} -> ${chatId}`);
}

/**
 * Get chatId for a given userId.
 * Returns undefined if no mapping exists.
 */
export function getChatIdForUser(userId: string): string | undefined {
  // Check runtime cache first
  const cached = runtimeUserChatMap.get(userId);
  if (cached) {
    return cached;
  }

  // Fall back to persistent storage
  const mapping = getUserChatMapping(userId);
  if (mapping) {
    // Update runtime cache
    runtimeUserChatMap.set(userId, mapping.chatId);
    return mapping.chatId;
  }

  return undefined;
}

/**
 * Check if a mapping exists for the given userId.
 */
export function hasUserChatMapping(userId: string): boolean {
  return runtimeUserChatMap.has(userId) || getUserChatMapping(userId) !== undefined;
}

/**
 * Get the first available user-chat mapping.
 * Useful when sending to any user in the allowed list.
 */
export function getFirstAvailableMapping(): { userId: string; chatId: string } | undefined {
  // Try runtime cache first
  for (const [userId, chatId] of runtimeUserChatMap) {
    return { userId, chatId };
  }

  // Fall back to persistent storage
  const mappings = getAllUserChatMappings();
  for (const [userId, mapping] of Object.entries(mappings)) {
    return { userId, chatId: mapping.chatId };
  }

  return undefined;
}

/**
 * Get all available user-chat mappings.
 */
export function getAllMappings(): Map<string, string> {
  // Merge runtime cache with persistent storage
  const result = new Map<string, string>(runtimeUserChatMap);

  const mappings = getAllUserChatMappings();
  for (const [userId, mapping] of Object.entries(mappings)) {
    if (!result.has(userId)) {
      result.set(userId, mapping.chatId);
    }
  }

  return result;
}

/**
 * Remove a user-chat mapping.
 */
export async function removeUserChatMapping(userId: string): Promise<void> {
  runtimeUserChatMap.delete(userId);
  await clearUserChatMapping(userId);
  logger.debug(`[FeishuUserChatStore] Removed mapping for user: ${userId}`);
}

/**
 * Clear all mappings (use with caution).
 */
export async function clearAllMappings(): Promise<void> {
  runtimeUserChatMap.clear();
  const mappings = getAllUserChatMappings();
  for (const userId of Object.keys(mappings)) {
    await clearUserChatMapping(userId);
  }
  logger.info("[FeishuUserChatStore] Cleared all mappings");
}
