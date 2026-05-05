import type { ProjectInfo, SessionInfo } from "../../settings/manager.js";

export interface OpenCodeHealth {
  healthy: boolean;
  version?: string;
}

export interface EnsureProjectByPathResult {
  project: ProjectInfo;
  isNew: boolean;
  pathCreated: boolean;
}

export interface GatewaySessionInfo extends SessionInfo {
  time?: { updated?: number };
}

export interface OpenCodePromptOptions {
  sessionID: string;
  directory: string;
  parts: Array<{ type: "text"; text: string }>;
  model?: { providerID: string; modelID: string };
  agent?: string;
  variant?: string;
}

export interface OpenCodeGateway {
  health(): Promise<OpenCodeHealth | null>;
  listProjects(): Promise<ProjectInfo[]>;
  ensureProjectByPath(inputPath: string): Promise<EnsureProjectByPathResult>;
  createSession(directory: string): Promise<GatewaySessionInfo>;
  listSessions(directory: string): Promise<GatewaySessionInfo[]>;
  getSession(directory: string, sessionID: string): Promise<GatewaySessionInfo>;
  abortSession(params: {
    sessionID: string;
    directory: string;
    signal?: AbortSignal;
  }): Promise<{ error?: unknown }>;
  getSessionStatus(directory: string): Promise<Record<string, { type?: string }> | null>;
  promptSession(options: OpenCodePromptOptions): Promise<{ error?: unknown }>;
}
