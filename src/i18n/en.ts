export const en = {
  "cmd.description.status": "Server and session status",
  "cmd.description.new": "Create a new session",
  "cmd.description.stop": "Stop current action",
  "cmd.description.sessions": "List sessions",
  "cmd.description.projects": "List projects",
  "cmd.description.task": "Create a scheduled task",
  "cmd.description.tasks": "List scheduled tasks",
  "cmd.description.commands": "Custom commands",
  "cmd.description.exit": "Exit the bot application",
  "cmd.description.help": "Help",
  "cmd.description.agents": "List available agents",
  "cmd.description.agent_number": "Switch to agent by number",

  "error.load_agents": "❌ Failed to load agents list",
  "error.generic": "🔴 Something went wrong.",

  "common.unknown_error": "unknown error",

  "bot.thinking": "💭 Thinking...",
  "bot.project_not_selected":
    "🏗 Project is not selected.\n\nFirst select a project with /projects.",
  "bot.session_error": "🔴 OpenCode returned an error: {message}",
  "bot.session_retry":
    "🔁 {message}\n\nProvider keeps returning the same error on repeated retries. Use /abort to abort.",
  "status.session_not_selected": "Current session: not selected",
  "exit.stopping": "🛑 Shutting down bot application...",

  "agent.list.title":
    "🤖 **Available Agents**\n\nCurrent: {current}\n\n{list}\n\nUse `/agent <number>` to switch",
  "agent.list.empty": "⚠️ No agents available",
  "agent.switch.success": "✅ Agent switched to: {name}",
  "agent.switch.error": "❌ Failed to switch agent",
  "agent.switch.invalid_index": "❌ Invalid index. Use `/agent` to see the list",

  "pinned.line.model": "Model: {model}",
  "subagent.line.task": "Task: {task}",
  "subagent.line.agent": "Agent: {agent}",
  "subagent.working": "Working...",
  "subagent.completed": "Completed",
  "subagent.failed": "Task failed",
  "tool.todo.overflow": "*({count} more tasks)*",
  "tool.file_header.write":
    "Write File/Path: {path}\n============================================================\n\n",
  "tool.file_header.edit":
    "Edit File/Path: {path}\n============================================================\n\n",

  "runtime.wizard.ask_language":
    "Select interface language.\nEnter the language number from the list or locale code.\nPress Enter to keep default language: {defaultLocale}\n{options}\n> ",
  "runtime.wizard.language_invalid":
    "Enter a language number from the list or a supported locale code.\n",
  "runtime.wizard.language_selected": "Selected language: {language}\n",
  "runtime.wizard.start": "OpenCode Bot setup.\n",
  "runtime.wizard.saved": "Configuration saved:\n- {envPath}\n- {settingsPath}\n",
  "runtime.wizard.not_configured_starting":
    "Application is not configured yet. Starting wizard...\n",
  "runtime.wizard.tty_required":
    "Interactive wizard requires a TTY terminal. Run `opencode-bot config` in an interactive shell.",

  "rename.no_session": "⚠️ No active session. Create or select a session first.",
  "rename.prompt": "📝 Enter new title for session:\n\nCurrent: {title}",
  "rename.empty_title": "⚠️ Title cannot be empty.",
  "rename.success": "✅ Session renamed to: {title}",
  "rename.error": "🔴 Failed to rename session.",
  "rename.cancelled": "❌ Rename cancelled.",
  "rename.hint_abort": 'Type "cancel", "取消", or /cancel to cancel renaming.',

  "task.prompt.schedule":
    "⏰ Send the task schedule in natural language.\n\nExamples:\n- every 5 minutes\n- every day at 17:00\n- tomorrow at 12:00",
  "task.schedule_empty": "⚠️ Schedule cannot be empty.",
  "task.parse_error":
    "🔴 Failed to parse schedule.\n\n{message}\n\nSend the schedule again in a clearer form.",
  "task.schedule_preview":
    "✅ Schedule parsed\n\nHow I understood it: {summary}\n{cronLine}Timezone: {timezone}\nType: {kind}\nNext run: {nextRunAt}",
  "task.schedule_preview.cron": "Cron: {cron}",
  "task.prompt.body": "📝 Now send what the bot should do on schedule.",
  "task.hint_cancel": 'Type "cancel", "取消", or /cancel to cancel.',
  "task.prompt_empty": "⚠️ Task text cannot be empty.",
  "task.created":
    "✅ Scheduled task created\n\nTask: {description}\nProject: {project}\nModel: {model}\nSchedule: {schedule}\n{cronLine}Next run: {nextRunAt}",
  "task.created.cron": "Cron: {cron}",
  "task.cancelled": "❌ Scheduled task creation cancelled.",
  "task.inactive": "⚠️ Scheduled task creation is not active. Run /task again.",
  "task.limit_reached": "⚠️ Task limit reached ({limit}). Delete an existing scheduled task first.",
  "task.schedule_too_frequent":
    "Recurring schedule is too frequent. The minimum allowed interval is once every 5 minutes.",
  "task.kind.cron": "recurring",
  "task.kind.once": "one-time",
  "task.run.success": "⏰ Scheduled task completed: {description}",
  "task.run.error": "🔴 Scheduled task failed: {description}\n\nError: {error}",

  "tasklist.empty": "📭 No scheduled tasks yet.",
  "tasklist.select": "Select a scheduled task:",
  "tasklist.select_hint":
    'Type a task number to view details, or "cancel", "取消", or /cancel to exit.',
  "tasklist.details":
    "⏰ Scheduled task\n\nTask: {prompt}\nProject: {project}\nSchedule: {schedule}\n{cronLine}Timezone: {timezone}\nNext run: {nextRunAt}\nLast run: {lastRunAt}\nRun count: {runCount}",
  "tasklist.details.cron": "Cron: {cron}",
  "tasklist.deleted_callback": "Deleted",
  "tasklist.cancelled_callback": "Cancelled",
  "tasklist.inactive_callback": "This scheduled task menu is inactive",
  "tasklist.load_error": "🔴 Failed to load scheduled tasks.",
  "tasklist.invalid_number":
    '⚠️ Enter a valid task number, or "cancel", "取消", or /cancel to exit.',
  "tasklist.not_found": "⚠️ Task #{number} does not exist. There are {count} tasks.",
  "tasklist.hint_detail":
    'Type "delete" or "删除" to delete this task, or "cancel", "取消", or /cancel to go back.',
  "tasklist.delete_error": "❌ Failed to delete task.",

  "commands.empty": "📭 No OpenCode commands are available for this project.",
  "commands.fetch_error": "🔴 Failed to load OpenCode commands.",
  "commands.no_description": "No description",
  "commands.cancelled_callback": "Cancelled",
  "commands.executing_prefix": "⚡ Executing command:",
  "commands.execute_error": "🔴 Failed to execute OpenCode command.",
  "commands.hint_select":
    "💡 Use `/command <number>` to execute a command, or `/command <number> [args]` to run it with arguments.",
  "commands.invalid_number": "Please enter a valid command number ({min}-{max}).",

  "openclaw.mode.entered": "✅ OpenCode mode enabled for this OpenClaw conversation.",
  "openclaw.mode.exited": "✅ OpenCode mode disabled for this OpenClaw conversation.",
  "openclaw.mode.inactive": "OpenCode mode was not active for this OpenClaw conversation.",
  "openclaw.no_pending_permission": "⚠️ No pending permission request.",
  "openclaw.permission_pending": "A permission request is pending. Reply with /1, /2, or /3.",
  "openclaw.permission_hint":
    "No pending permission request. When one appears, reply with /1, /2, or /3.",
  "openclaw.processing": "⚙️ Processing...",
  "openclaw.command_failed": "❌ Command failed.",
  "openclaw.task_cancelled": "✅ Scheduled task creation cancelled.",
  "openclaw.tasklist_cancelled": "✅ Scheduled task list flow cancelled.",
  "openclaw.models.header": "🤖 **Models**",
  "openclaw.models.favorites": "Favorites",
  "openclaw.models.recent": "Recent",
  "openclaw.models.current": "Current: {model}",
  "openclaw.models.select_hint": "Use `/model <number>` to select a model.",
  "openclaw.model.invalid_index": "❌ Please choose a model number between 1 and {max}.",
  "openclaw.model.selected": "✅ Model selected: {model}",
  "openclaw.server.already_started": "✅ OpenCode server is already managed (PID {pid}).",
  "openclaw.server.started": "✅ OpenCode server started (PID {pid}).",
  "openclaw.server.start_failed": "❌ Failed to start OpenCode server: {error}",
  "openclaw.server.not_managed": "OpenCode server is not managed by this bot.",
  "openclaw.server.stopped": "✅ OpenCode server stopped.",
  "openclaw.server.stop_failed": "❌ Failed to stop OpenCode server: {error}",
  "openclaw.prompt_error": "❌ An error occurred. Please try again.",
  "openclaw.help":
    "📖 **OpenClawCode Commands**\n\n/opencode - Enter OpenCode mode for this conversation\n/exit - Leave OpenCode mode\n/status - Show OpenCode status\n/projects - List projects\n/project <number or path> - Select or create a project\n/sessions - List sessions\n/session <number> - Select a session\n/session new or /new - Create a session\n/rename [title] - Rename the current session\n/agents and /agent <number> - List or select agents\n/models and /model <number> - List or select models\n/commands and /command <number> - Run OpenCode project commands\n/task and /tasklist - Create or manage scheduled tasks\n/stop or /abort - Abort the active task or cancel an active flow\n/opencode_start and /opencode_stop - Manage the local OpenCode server\n\nPermission replies: /1 allow once, /2 always allow, /3 reject.",
  "openclaw.unknown_command": "⚠️ Unknown command: /{command}\n\n{help}",

  "cmd.description.rename": "Rename current session via /session rename",

  "cli.usage":
    "Usage:\n  opencode-bot [start] [--mode sources|installed]\n  opencode-bot status\n  opencode-bot stop\n  opencode-bot config\n\nNotes:\n  - No command defaults to `start`\n  - `--mode` is currently supported for `start` only",
  "cli.placeholder.status":
    "Command `status` is currently a placeholder. Real status checks will be added in service layer (Phase 5).",
  "cli.placeholder.stop":
    "Command `stop` is currently a placeholder. Real background process stop will be added in service layer (Phase 5).",
  "cli.placeholder.unavailable": "Command is unavailable.",
  "cli.error.prefix": "CLI error: {message}",
  "cli.args.unknown_command": "Unknown command: {value}",
  "cli.args.mode_requires_value": "Option --mode requires a value: sources|installed",
  "cli.args.invalid_mode": "Invalid mode value: {value}. Expected sources|installed",
  "cli.args.unknown_option": "Unknown option: {value}",
  "cli.args.mode_only_start": "Option --mode is supported only for the start command",
} as const;

export type I18nKey = keyof typeof en;
export type I18nDictionary = Record<string, string>;
