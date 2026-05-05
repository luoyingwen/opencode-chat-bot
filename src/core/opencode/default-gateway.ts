import { opencodeClient } from "../../opencode/client.js";
import { ensureProjectByPath, getProjects } from "../../project/manager.js";
import type { OpenCodeGateway, OpenCodeHealth, OpenCodePromptOptions } from "./types.js";

export class DefaultOpenCodeGateway implements OpenCodeGateway {
  async health(): Promise<OpenCodeHealth | null> {
    const { data, error } = await opencodeClient.global.health();
    if (error || !data) {
      return null;
    }

    return {
      healthy: data.healthy,
      version: data.version,
    };
  }

  async listProjects() {
    return getProjects();
  }

  async ensureProjectByPath(inputPath: string) {
    return ensureProjectByPath(inputPath);
  }

  async createSession(directory: string) {
    const { data, error } = await opencodeClient.session.create({ directory });
    if (error || !data) {
      throw error ?? new Error("Failed to create session.");
    }

    return {
      id: data.id,
      title: data.title,
      directory,
      time: data.time,
    };
  }

  async listSessions(directory: string) {
    const { data, error } = await opencodeClient.session.list({ directory });
    if (error || !data) {
      throw error ?? new Error("Failed to load sessions.");
    }

    return data.map((session) => ({
      id: session.id,
      title: session.title,
      directory,
      time: session.time,
    }));
  }

  async getSession(directory: string, sessionID: string) {
    const { data, error } = await opencodeClient.session.get({ sessionID, directory });
    if (error || !data) {
      throw error ?? new Error("Failed to get session details.");
    }

    return {
      id: data.id,
      title: data.title,
      directory,
      time: data.time,
    };
  }

  async abortSession(params: { sessionID: string; directory: string; signal?: AbortSignal }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (opencodeClient.session.abort as any)(
      {
        sessionID: params.sessionID,
        directory: params.directory,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params.signal ? ({ signal: params.signal } as any) : undefined,
    );
  }

  async getSessionStatus(directory: string): Promise<Record<string, { type?: string }> | null> {
    const { data } = await opencodeClient.session.status({ directory });
    return (data as Record<string, { type?: string }> | undefined) ?? null;
  }

  async promptSession(options: OpenCodePromptOptions): Promise<{ error?: unknown }> {
    return opencodeClient.session.prompt(options);
  }
}

export const defaultOpenCodeGateway = new DefaultOpenCodeGateway();
