import {
  getCurrentSession as getSettingsSession,
  setCurrentSession as setSettingsSession,
  clearSession as clearSettingsSession,
  SessionInfo,
} from "../settings/manager.js";
import { clearAutoConfirm } from "../permission/auto-confirm.js";

export type { SessionInfo };

export function setCurrentSession(sessionInfo: SessionInfo): void {
  setSettingsSession(sessionInfo);
}

export function getCurrentSession(): SessionInfo | null {
  return getSettingsSession() ?? null;
}

export function clearSession(): void {
  const currentSession = getCurrentSession();
  if (currentSession) {
    clearAutoConfirm(currentSession.id);
  }
  clearSettingsSession();
}
