import { logger } from "../utils/logger.js";

interface RenameState {
  isWaiting: boolean;
  sessionId: string | null;
  sessionDirectory: string | null;
  currentTitle: string | null;
  messageId: number | null;
}

class RenameManager {
  private readonly states = new Map<string, RenameState>();
  private readonly defaultKey = "global";

  private createState(sessionId: string, directory: string, currentTitle: string): RenameState {
    return {
      isWaiting: true,
      sessionId,
      sessionDirectory: directory,
      currentTitle,
      messageId: null,
    };
  }

  private resolveKey(flowKey?: string): string | null {
    if (flowKey) {
      return flowKey;
    }

    if (this.states.size === 0) {
      return null;
    }

    if (this.states.has(this.defaultKey)) {
      return this.defaultKey;
    }

    return this.states.keys().next().value ?? null;
  }

  startWaiting(sessionId: string, directory: string, currentTitle: string, flowKey?: string): void {
    const key = flowKey ?? this.defaultKey;
    logger.info(`[RenameManager] Starting rename flow: key=${key}, session=${sessionId}`);
    this.states.set(key, this.createState(sessionId, directory, currentTitle));
  }

  setMessageId(messageId: number, flowKey?: string): void {
    const key = this.resolveKey(flowKey);
    if (!key) {
      return;
    }

    const state = this.states.get(key);
    if (!state) {
      return;
    }

    state.messageId = messageId;
  }

  getMessageId(flowKey?: string): number | null {
    const key = this.resolveKey(flowKey);
    if (!key) {
      return null;
    }

    return this.states.get(key)?.messageId ?? null;
  }

  isActiveMessage(messageId: number | null, flowKey?: string): boolean {
    const key = this.resolveKey(flowKey);
    if (!key) {
      return false;
    }

    const state = this.states.get(key);
    return Boolean(state?.isWaiting && state.messageId !== null && state.messageId === messageId);
  }

  isWaitingForName(flowKey?: string): boolean {
    if (flowKey) {
      return this.states.get(flowKey)?.isWaiting ?? false;
    }

    return this.states.size > 0;
  }

  getSessionInfo(
    flowKey?: string,
  ): { sessionId: string; directory: string; currentTitle: string } | null {
    const key = this.resolveKey(flowKey);
    if (!key) {
      return null;
    }

    const state = this.states.get(key);
    if (!state?.isWaiting || !state.sessionId) {
      return null;
    }

    return {
      sessionId: state.sessionId,
      directory: state.sessionDirectory!,
      currentTitle: state.currentTitle!,
    };
  }

  clear(flowKey?: string): void {
    if (flowKey) {
      logger.debug(`[RenameManager] Clearing rename state for key=${flowKey}`);
      this.states.delete(flowKey);
      return;
    }

    logger.debug("[RenameManager] Clearing all rename state");
    this.states.clear();
  }
}

export const renameManager = new RenameManager();
