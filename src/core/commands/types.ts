import type { OpenCodeGateway } from "../opencode/types.js";
import type { ConversationRoute, ConversationRuntime } from "../runtime/types.js";

export type OutputFormat = "text" | "markdown";

export interface OutputItem {
  text: string;
  format?: OutputFormat;
}

export interface CommandEffects {
  projectChanged?: boolean;
  sessionChanged?: boolean;
}

export interface CommandResult {
  outputs: OutputItem[];
  effects?: CommandEffects;
}

export interface ParsedCommand {
  name: string;
  args: string;
  rawText: string;
}

export interface CommandContext {
  route: ConversationRoute;
  userId: string;
  locale: string;
  command: ParsedCommand;
  runtime: ConversationRuntime;
  gateway: OpenCodeGateway;
  projectsListLimit: number;
}

export interface CommandHandler {
  command: string;
  handle(context: CommandContext): Promise<CommandResult>;
}