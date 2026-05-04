import type { I18nDictionary } from "./en.js";

export const zh: I18nDictionary = {
  "cmd.description.status": "服务器和会话状态",
  "cmd.description.new": "创建新会话",
  "cmd.description.stop": "停止当前操作",
  "cmd.description.sessions": "列出会话",
  "cmd.description.session_number": "按序号选择会话",
  "cmd.description.projects": "列出项目",
  "cmd.description.project_number": "按序号选择项目",
  "cmd.description.task": "创建定时任务",
  "cmd.description.tasks": "查看定时任务",
  "cmd.description.commands": "自定义命令",
  "cmd.description.command_number": "按序号执行命令",
  "cmd.description.auto_confirm": "切换当前会话的自动确认",
  "cmd.description.permission": "显示待处理权限请求状态",
  "cmd.description.exit": "退出机器人应用",
  "cmd.description.help": "帮助",
  "cmd.description.agents": "列出可用 Agent",
  "cmd.description.agent_number": "按序号切换 Agent",
  "cmd.description.rename": "通过 /session rename 重命名当前会话",
  "cmd.description.opencode": "进入 OpenCode 模式",

  "error.load_agents": "❌ 加载代理列表失败",
  "error.generic": "🔴 出现了一些问题。",

  "common.unknown_error": "未知错误",

  "bot.thinking": "💭 思考中...",
  "bot.project_not_selected": "🏗 未选择项目。\n\n请先使用 /projects 选择一个项目。",
  "bot.session_error": "🔴 OpenCode 返回错误：{message}",
  "bot.session_retry": "🔁 {message}\n\n提供方在重复重试时持续返回同一错误。使用 /abort 可停止。",
  "status.session_not_selected": "当前会话：未选择",
  "exit.stopping": "🛑 正在退出机器人应用...",

  "agent.list.title":
    "🤖 **可用 Agent 列表**\n\n当前: {current}\n\n{list}\n\n使用 `/agent <序号>` 切换",
  "agent.list.empty": "⚠️ 当前没有可用的 Agent",
  "agent.switch.success": "✅ Agent 已切换为: {name}",
  "agent.switch.error": "❌ 切换 Agent 失败",
  "agent.switch.invalid_index": "❌ 无效的序号。请使用 `/agent` 查看列表",

  "pinned.line.model": "模型: {model}",
  "subagent.line.task": "任务: {task}",
  "subagent.line.agent": "代理: {agent}",
  "subagent.working": "执行中...",
  "subagent.completed": "已完成",
  "subagent.failed": "任务失败",
  "tool.todo.overflow": "*(还有 {count} 个任务)*",
  "tool.file_header.write":
    "写入文件/路径: {path}\n============================================================\n\n",
  "tool.file_header.edit":
    "编辑文件/路径: {path}\n============================================================\n\n",

  "runtime.wizard.ask_language":
    "请选择界面语言。\n输入列表中的语言编号或 locale code。\n按 Enter 保持默认语言：{defaultLocale}\n{options}\n> ",
  "runtime.wizard.language_invalid": "请输入列表中的语言编号或受支持的 locale code。\n",
  "runtime.wizard.language_selected": "已选择语言：{language}\n",
  "runtime.wizard.start": "OpenCode Bot 设置。\n",
  "runtime.wizard.saved": "配置已保存：\n- {envPath}\n- {settingsPath}\n",
  "runtime.wizard.not_configured_starting": "应用尚未配置。正在启动向导...\n",
  "runtime.wizard.tty_required":
    "交互式向导需要 TTY 终端。请在交互式 shell 中运行 `opencode-chat-bot config`。",

  "rename.no_session": "⚠️ 没有活动会话。请先创建或选择一个会话。",
  "rename.prompt": "📝 请输入会话的新标题：\n\n当前：{title}",
  "rename.empty_title": "⚠️ 标题不能为空。",
  "rename.success": "✅ 会话已重命名为：{title}",
  "rename.error": "🔴 重命名会话失败。",
  "rename.cancelled": "❌ 重命名已取消。",
  "rename.hint_abort": "输入“取消”、\"cancel\" 或 /cancel 取消重命名。",

  "task.prompt.schedule":
    "⏰ 请用自然语言发送任务的时间安排。\n\n示例：\n- 每 5 分钟\n- 每天 17:00\n- 明天 12:00",
  "task.schedule_empty": "⚠️ 时间安排不能为空。",
  "task.parse_error": "🔴 无法解析时间安排。\n\n{message}\n\n请用更清晰的方式重新发送。",
  "task.schedule_preview":
    "✅ 时间安排已解析\n\n理解为：{summary}\n{cronLine}时区：{timezone}\n类型：{kind}\n下次运行：{nextRunAt}",
  "task.schedule_preview.cron": "Cron: {cron}",
  "task.prompt.body": "📝 现在发送机器人按此时间安排需要执行的内容。",
  "task.hint_cancel": "输入“取消”、\"cancel\" 或 /cancel 可退出。",
  "task.prompt_empty": "⚠️ 任务文本不能为空。",
  "task.created":
    "✅ 定时任务已创建\n\n任务：{description}\n项目：{project}\n模型：{model}\n时间安排：{schedule}\n{cronLine}下次运行：{nextRunAt}",
  "task.created.cron": "Cron: {cron}",
  "task.cancelled": "❌ 定时任务创建已取消。",
  "task.inactive": "⚠️ 定时任务创建流程未激活。请重新运行 /task。",
  "task.limit_reached": "⚠️ 已达到任务数量上限（{limit}）。请先删除一个现有定时任务。",
  "task.schedule_too_frequent": "重复任务过于频繁。最小允许间隔为每 5 分钟一次。",
  "task.kind.cron": "重复",
  "task.kind.once": "一次性",
  "task.model.default": "默认",
  "task.run.success": "⏰ 定时任务已完成: {description}",
  "task.run.error": "🔴 定时任务执行失败: {description}\n\n错误: {error}",
  "task.run.error.interactive_question":
    "定时任务请求了交互式问题，无法在无人值守时继续。",
  "task.run.error.interactive_permission":
    "定时任务请求了交互式权限，无法在无人值守时继续。",

  "tasklist.empty": "📭 还没有定时任务。",
  "tasklist.select": "请选择一个定时任务：",
  "tasklist.select_hint": "输入任务编号查看详情，或输入“取消”、\"cancel\" 或 /cancel 退出。",
  "tasklist.details":
    "⏰ 定时任务\n\n任务：{prompt}\n项目：{project}\n计划：{schedule}\n模型：{model}\n{cronLine}时区：{timezone}\n下次运行：{nextRunAt}\n上次运行：{lastRunAt}\n运行次数：{runCount}",
  "tasklist.details.cron": "Cron: {cron}",
  "tasklist.deleted_callback": "已删除",
  "tasklist.cancelled_callback": "已取消",
  "tasklist.inactive_callback": "此定时任务菜单已失效",
  "tasklist.load_error": "🔴 无法加载定时任务。",
  "tasklist.invalid_number": "⚠️ 请输入有效的任务编号，或输入“取消”、\"cancel\" 或 /cancel 退出。",
  "tasklist.not_found": "⚠️ 任务 #{number} 不存在。当前共有 {count} 个任务。",
  "tasklist.hint_detail": "输入“删除”或 \"delete\" 删除此任务，或输入“取消”、\"cancel\" 或 /cancel 返回。",
  "tasklist.delete_error": "❌ 删除任务失败。",

  "commands.empty": "📭 当前项目没有可用的 OpenCode 命令。",
  "commands.fetch_error": "🔴 加载 OpenCode 命令失败。",
  "commands.no_description": "无描述",
  "commands.cancelled_callback": "已取消",
  "commands.executing_prefix": "⚡ 执行命令:",
  "commands.execute_error": "🔴 执行 OpenCode 命令失败。",
  "commands.hint_select": "💡 使用 `/command <编号>` 执行命令，或使用 `/command <编号> [参数]` 携带参数执行。",
  "commands.invalid_number": "请输入有效的命令编号（{min}-{max}）。",

  "cli.usage":
    "用法:\n  opencode-chat-bot [start] [--mode sources|installed]\n  opencode-chat-bot status\n  opencode-chat-bot stop\n  opencode-chat-bot config\n\n注意:\n  - 无命令时默认为 `start`\n  - `--mode` 当前仅支持 `start`",
  "cli.placeholder.status": "`status` 命令当前为占位符。实际状态检查将在服务层中添加（第5阶段）。",
  "cli.placeholder.stop":
    "`stop` 命令当前为占位符。实际后台进程停止功能将在服务层中添加（第5阶段）。",
  "cli.placeholder.unavailable": "命令不可用。",
  "cli.error.prefix": "CLI 错误：{message}",
  "cli.args.unknown_command": "未知命令：{value}",
  "cli.args.mode_requires_value": "选项 --mode 需要一个值：sources|installed",
  "cli.args.invalid_mode": "无效的 --mode 值：{value}。期望 sources|installed",
  "cli.args.unknown_option": "未知选项：{value}",
  "cli.args.mode_only_start": "选项 --mode 仅支持 start 命令",

  "openclaw.processing":
    "⚙️ 处理中...\n\n💡 您正处于 OpenCode 拦截模式，输入 /exit 退出。",
};
