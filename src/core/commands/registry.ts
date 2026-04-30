import { ProjectCommandHandler } from "./project.js";
import { ProjectsCommandHandler } from "./projects.js";
import { SessionCommandHandler } from "./session.js";
import { SessionsCommandHandler } from "./sessions.js";
import { StatusCommandHandler } from "./status.js";
import { StopCommandHandler } from "./stop.js";
import type { CommandContext, CommandHandler, CommandResult } from "./types.js";

export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();

  register(handler: CommandHandler): void {
    this.handlers.set(handler.command.toLowerCase(), handler);
  }

  async execute(context: CommandContext): Promise<CommandResult | null> {
    const handler = this.handlers.get(context.command.name.toLowerCase());
    if (!handler) {
      return null;
    }

    return handler.handle(context);
  }
}

export function createDefaultCommandRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  registry.register(new StatusCommandHandler());
  registry.register(new StopCommandHandler());
  registry.register(new SessionsCommandHandler());
  registry.register(new SessionCommandHandler());
  registry.register(new ProjectsCommandHandler());
  registry.register(new ProjectCommandHandler());
  return registry;
}