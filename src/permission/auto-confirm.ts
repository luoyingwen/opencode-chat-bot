/**
 * Session-based auto-confirmation for permission requests
 *
 * Users can toggle auto-confirmation per session using /auto_confirm command.
 * When enabled, all permission requests are automatically approved with "always".
 * State is session-scoped and resets when switching sessions or bot restarts.
 */

import { logger } from "../utils/logger.js";

// Map<sessionId, enabled>
const autoConfirmState = new Map<string, boolean>();

/**
 * Check if auto-confirm is enabled for a session
 */
export function isAutoConfirmEnabled(sessionId: string): boolean {
  return autoConfirmState.get(sessionId) ?? false;
}

/**
 * Enable or disable auto-confirm for a session
 */
export function setAutoConfirm(sessionId: string, enabled: boolean): void {
  autoConfirmState.set(sessionId, enabled);
  logger.info(`[AutoConfirm] Session ${sessionId}: ${enabled ? "enabled" : "disabled"}`);
}

/**
 * Clear auto-confirm state for a session (called when session ends/switches)
 */
export function clearAutoConfirm(sessionId: string): void {
  if (autoConfirmState.has(sessionId)) {
    autoConfirmState.delete(sessionId);
    logger.debug(`[AutoConfirm] Cleared state for session ${sessionId}`);
  }
}

/**
 * Get all sessions with auto-confirm enabled (for debugging)
 */
export function getAutoConfirmSessions(): string[] {
  return Array.from(autoConfirmState.entries())
    .filter(([, enabled]) => enabled)
    .map(([sessionId]) => sessionId);
}
