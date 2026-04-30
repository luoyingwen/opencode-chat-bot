import type { OpenClawEventContext, OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { ConversationRoute } from "../core/runtime/types.js";

export interface OpenClawRoute extends ConversationRoute {
  channelId: string;
  accountId: string;
  conversationId: string;
}

export interface OpenClawScopeContext {
  channelId?: string;
  accountId?: string;
  conversationId?: string;
}

export interface OpenClawRuntimeConfig {
  enabled: boolean;
  channels: string[];
  accountIds: string[];
  conversationIds: string[];
}

export interface OpenClawPluginConfigInput {
  enabled?: boolean;
  channels?: string[];
  accountIds?: string[];
  conversationIds?: string[];
}

export interface OpenClawClientOptions {
  api: OpenClawPluginApi;
  config: OpenClawRuntimeConfig;
}

export interface OpenClawInboundMessage {
  text: string;
  route: OpenClawRoute;
}

export interface OpenClawDispatchResult {
  handled: true;
  text: string;
}

export type OpenClawPluginEventContext = OpenClawEventContext;
