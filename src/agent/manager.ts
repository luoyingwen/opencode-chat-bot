import { opencodeClient } from "../opencode/client.js";
import { buildConversationRouteKey } from "../core/runtime/route-key.js";
import type { ConversationRoute } from "../core/runtime/types.js";
import {
  getConversationState,
  getCurrentAgent,
  getCurrentProject,
  setCurrentAgent,
  updateConversationState,
} from "../settings/manager.js";
import { getCurrentSession } from "../session/manager.js";
import { logger } from "../utils/logger.js";
import type { AgentInfo } from "./types.js";

function getRouteState(route?: ConversationRoute) {
  if (!route) {
    return undefined;
  }

  return getConversationState(buildConversationRouteKey(route));
}

function getProjectForRoute(route?: ConversationRoute) {
  return route ? getRouteState(route)?.currentProject : getCurrentProject();
}

function getSessionForRoute(route?: ConversationRoute) {
  return route ? getRouteState(route)?.currentSession : getCurrentSession();
}

function getAgentForRoute(route?: ConversationRoute) {
  return route ? getRouteState(route)?.currentAgent : getCurrentAgent();
}

function setAgentForRoute(agentName: string, route?: ConversationRoute): void {
  if (route) {
    updateConversationState(buildConversationRouteKey(route), { currentAgent: agentName });
    return;
  }

  setCurrentAgent(agentName);
}

/**
 * Get list of available agents from OpenCode API
 * @returns Array of available agents (filtered by mode and hidden flag)
 */
export async function getAvailableAgents(route?: ConversationRoute): Promise<AgentInfo[]> {
  try {
    const project = getProjectForRoute(route);
    const { data: agents, error } = await opencodeClient.app.agents(
      project ? { directory: project.worktree } : undefined,
    );

    if (error) {
      logger.error("[AgentManager] Failed to fetch agents:", error);
      return [];
    }

    if (!agents) {
      return [];
    }

    // Filter out hidden agents and subagents (only show primary and all)
    const filtered = agents.filter(
      (agent) => !agent.hidden && (agent.mode === "primary" || agent.mode === "all"),
    );

    logger.debug(`[AgentManager] Fetched ${filtered.length} available agents`);
    return filtered;
  } catch (err) {
    logger.error("[AgentManager] Error fetching agents:", err);
    return [];
  }
}

const DEFAULT_AGENT = "build";

function pickFallbackAgent(agents: AgentInfo[]): string {
  const defaultAgent = agents.find((agent) => agent.name === DEFAULT_AGENT);
  if (defaultAgent) {
    return defaultAgent.name;
  }

  return agents[0]?.name ?? DEFAULT_AGENT;
}

export async function resolveProjectAgent(
  preferredAgent?: string,
  route?: ConversationRoute,
): Promise<string> {
  const requestedAgent = preferredAgent ?? getAgentForRoute(route) ?? DEFAULT_AGENT;
  const project = getProjectForRoute(route);

  if (!project) {
    return requestedAgent;
  }

  const agents = await getAvailableAgents(route);
  if (agents.length === 0) {
    return requestedAgent;
  }

  if (agents.some((agent) => agent.name === requestedAgent)) {
    return requestedAgent;
  }

  const fallbackAgent = pickFallbackAgent(agents);
  logger.warn(
    `[AgentManager] Agent "${requestedAgent}" is not available for project ${project.worktree}. Falling back to "${fallbackAgent}".`,
  );
  setAgentForRoute(fallbackAgent, route);
  return fallbackAgent;
}

/**
 * Get current agent from last session message or settings.
 * Falls back to "build" if nothing is stored.
 * @returns Current agent name
 */
export async function fetchCurrentAgent(route?: ConversationRoute): Promise<string> {
  const storedAgent = getAgentForRoute(route);
  const session = getSessionForRoute(route);
  const project = getProjectForRoute(route);

  if (!project) {
    // No active project, return stored agent from settings
    return storedAgent ?? DEFAULT_AGENT;
  }

  if (!session) {
    return resolveProjectAgent(storedAgent ?? DEFAULT_AGENT, route);
  }

  try {
    const { data: messages, error } = await opencodeClient.session.messages({
      sessionID: session.id,
      directory: project.worktree,
      limit: 1,
    });

    if (error || !messages || messages.length === 0) {
      logger.debug("[AgentManager] No messages found, using stored agent");
      return resolveProjectAgent(storedAgent ?? DEFAULT_AGENT, route);
    }

    const lastAgent = messages[0].info.agent;
    logger.debug(`[AgentManager] Current agent from session: ${lastAgent}`);

    // If user explicitly selected an agent in bot settings, prefer it.
    // Session messages may contain stale agent until next prompt is sent.
    if (storedAgent && lastAgent !== storedAgent) {
      logger.debug(
        `[AgentManager] Using stored agent "${storedAgent}" instead of session agent "${lastAgent}"`,
      );
      return resolveProjectAgent(storedAgent, route);
    }

    // No stored agent yet: sync from session history
    if (lastAgent && lastAgent !== storedAgent) {
      setAgentForRoute(lastAgent, route);
    }

    return resolveProjectAgent(lastAgent || storedAgent || DEFAULT_AGENT, route);
  } catch (err) {
    logger.error("[AgentManager] Error fetching current agent:", err);
    return resolveProjectAgent(storedAgent ?? DEFAULT_AGENT, route);
  }
}

/**
 * Select agent and persist to settings
 * @param agentName Name of the agent to select
 */
export function selectAgent(agentName: string, route?: ConversationRoute): void {
  logger.info(`[AgentManager] Selected agent: ${agentName}`);
  setAgentForRoute(agentName, route);
}

/**
 * Get stored agent from settings (synchronous)
 * @returns Current agent name or default "build"
 */
export function getStoredAgent(route?: ConversationRoute): string {
  return getAgentForRoute(route) ?? "build";
}
