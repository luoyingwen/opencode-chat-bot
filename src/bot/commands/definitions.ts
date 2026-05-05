import { t } from "../../i18n/index.js";
import type { I18nKey } from "../../i18n/en.js";

export interface BotCommandDefinition {
  command: string;
  description: string;
}

export interface BotCommandI18nDefinition {
  command: string;
  descriptionKey: I18nKey;
}

const SHARED_COMMANDS: BotCommandI18nDefinition[] = [
  { command: "status", descriptionKey: "cmd.description.status" },
  { command: "stop", descriptionKey: "cmd.description.stop" },
  { command: "sessions", descriptionKey: "cmd.description.sessions" },
  { command: "session <number>", descriptionKey: "cmd.description.session_number" },
  { command: "session new", descriptionKey: "cmd.description.new" },
  { command: "session rename [title]", descriptionKey: "cmd.description.rename" },
  { command: "projects", descriptionKey: "cmd.description.projects" },
  { command: "project <number>", descriptionKey: "cmd.description.project_number" },
  { command: "models", descriptionKey: "cmd.description.models" },
  { command: "model <number>", descriptionKey: "cmd.description.model_number" },
  { command: "agents", descriptionKey: "cmd.description.agents" },
  { command: "agent <number>", descriptionKey: "cmd.description.agent_number" },
  { command: "commands", descriptionKey: "cmd.description.commands" },
  { command: "command <number>", descriptionKey: "cmd.description.command_number" },
  { command: "auto_confirm [on|off]", descriptionKey: "cmd.description.auto_confirm" },
  { command: "task", descriptionKey: "cmd.description.task" },
  { command: "tasks", descriptionKey: "cmd.description.tasks" },
  { command: "permission", descriptionKey: "cmd.description.permission" },
  { command: "exit", descriptionKey: "cmd.description.exit" },
  { command: "help", descriptionKey: "cmd.description.help" },
];

const OPENCLAW_ONLY_COMMANDS: BotCommandI18nDefinition[] = [
  { command: "opencode", descriptionKey: "cmd.description.opencode" },
];

export function getSharedCommands(): BotCommandDefinition[] {
  return SHARED_COMMANDS.map((def) => ({
    command: def.command,
    description: t(def.descriptionKey),
  }));
}

export function getOpenClawCommands(): BotCommandDefinition[] {
  return [...OPENCLAW_ONLY_COMMANDS, ...SHARED_COMMANDS].map((def) => ({
    command: def.command,
    description: t(def.descriptionKey),
  }));
}

export function getValidCommands(): string[] {
  return [
    "status",
    "stop",
    "sessions",
    "session",
    "projects",
    "project",
    "models",
    "model",
    "agents",
    "agent",
    "commands",
    "command",
    "auto_confirm",
    "task",
    "tasks",
    "permission",
    "exit",
    "help",
  ];
}

export function getOpenClawValidCommands(): string[] {
  return ["opencode", ...getValidCommands()];
}
