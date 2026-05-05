import { config } from "../../config.js";
import { defaultOpenCodeGateway } from "../opencode/default-gateway.js";
import { settingsConversationRuntime } from "../runtime/settings-runtime.js";
import type { ConversationRoute } from "../runtime/types.js";
import { createDefaultCommandRegistry } from "./registry.js";
import type { CommandResult } from "./types.js";

const commandRegistry = createDefaultCommandRegistry();

export async function executeOpenCodeCommand(params: {
  route: ConversationRoute;
  userId: string;
  locale?: string;
  name: string;
  args?: string;
  rawText?: string;
}): Promise<CommandResult | null> {
  return commandRegistry.execute({
    route: params.route,
    userId: params.userId,
    locale: params.locale ?? config.bot.locale,
    command: {
      name: params.name,
      args: params.args ?? "",
      rawText: params.rawText ?? `/${params.name}${params.args ? ` ${params.args}` : ""}`,
    },
    runtime: settingsConversationRuntime,
    gateway: defaultOpenCodeGateway,
    projectsListLimit: config.bot.projectsListLimit,
  });
}
