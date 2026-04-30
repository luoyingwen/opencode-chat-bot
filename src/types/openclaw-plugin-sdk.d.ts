declare module "openclaw/plugin-sdk/core" {
  export interface PluginLogger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
  }

  export interface OpenClawOutboundAdapter {
    sendPayload?(params: {
      cfg?: unknown;
      to: string;
      accountId?: string;
      text: string;
      payload: { text: string };
    }): Promise<void>;
  }

  export interface OpenClawPluginApi {
    logger: PluginLogger;
    pluginConfig?: unknown;
    config?: unknown;
    runtime: {
      channel: {
        outbound: {
          loadAdapter(channelId: string): Promise<OpenClawOutboundAdapter | null | undefined>;
        };
      };
    };
    on(
      eventName: "before_dispatch",
      handler: (event: unknown, context: OpenClawEventContext) => Promise<unknown> | unknown,
    ): void;
    on(
      eventName: "message_received",
      handler: (event: unknown, context: OpenClawEventContext) => Promise<void> | void,
    ): void;
  }

  export interface OpenClawEventContext {
    channelId?: string;
    accountId?: string;
    conversationId?: string;
  }
}

declare module "openclaw/plugin-sdk/plugin-entry" {
  import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

  export interface OpenClawPluginEntry {
    id: string;
    name: string;
    description?: string;
    configSchema?: unknown;
    register(api: OpenClawPluginApi): void;
  }

  export function definePluginEntry<T extends OpenClawPluginEntry>(entry: T): T;
}
