import type { I18nDictionary } from "./en.js";

export const zhTW: I18nDictionary = {
  "cmd.description.status": "伺服器與工作階段狀態",
  "cmd.description.new": "建立新工作階段",
  "cmd.description.stop": "停止目前操作",
  "cmd.description.sessions": "列出工作階段",
  "cmd.description.session_number": "依序號選擇工作階段",
  "cmd.description.projects": "列出專案",
  "cmd.description.project_number": "依序號選擇專案",
  "cmd.description.task": "建立排程任務",
  "cmd.description.tasks": "列出排程任務",
  "cmd.description.commands": "自訂命令",
  "cmd.description.command_number": "依序號執行命令",
  "cmd.description.auto_confirm": "切換目前工作階段的自動確認",
  "cmd.description.permission": "顯示待處理權限請求狀態",
  "cmd.description.exit": "結束機器人應用程式",
  "cmd.description.help": "說明",
  "cmd.description.agents": "列出可用模式",
  "cmd.description.agent_number": "依序號切換模式",
  "cmd.description.rename": "透過 /session rename 重新命名目前工作階段",
  "cmd.description.opencode": "進入 OpenCode 模式",
  "error.load_agents": "❌ 載入代理清單失敗",
  "error.generic": "🔴 發生了一些問題。",

  "common.unknown_error": "未知錯誤",

  "bot.thinking": "💭 思考中...",
  "bot.project_not_selected": "🏗 尚未選擇專案。\n\n請先使用 /projects 選擇一個專案。",
  "bot.session_error": "🔴 OpenCode 回傳錯誤：{message}",
  "bot.session_retry": "🔁 {message}\n\n供應商在重複重試時持續回傳同一錯誤。使用 /stop 可停止。",
  "status.session_not_selected": "📋 目前工作階段：未選擇",
  "exit.stopping": "🛑 正在結束機器人應用程式...",

  "agent.list.title":
    "🤖 **可用模式列表**\n\n目前: {current}\n\n{list}\n\n使用 `/agent <序號>` 切換",
  "agent.list.empty": "⚠️ 目前沒有可用的模式",
  "agent.switch.success": "✅ 模式已切換為: {name}",
  "agent.switch.error": "❌ 切換模式失敗",
  "agent.switch.invalid_index": "❌ 無效的序號。請使用 `/agent` 查看列表",

  "pinned.line.model": "模型：{model}",
  "subagent.line.task": "任務: {task}",
  "subagent.line.agent": "代理: {agent}",
  "subagent.working": "執行中...",
  "subagent.completed": "已完成",
  "subagent.failed": "任務失敗",
  "tool.todo.overflow": "*（還有 {count} 個任務）*",
  "tool.file_header.write":
    "寫入檔案/路徑：{path}\n============================================================\n\n",
  "tool.file_header.edit":
    "編輯檔案/路徑：{path}\n============================================================\n\n",

  "runtime.wizard.ask_language":
    "請選擇介面語言。\n輸入清單中的語言編號或 locale code。\n按 Enter 保持預設語言：{defaultLocale}\n{options}\n> ",
  "runtime.wizard.language_invalid": "請輸入清單中的語言編號或受支援的 locale code。\n",
  "runtime.wizard.language_selected": "已選擇語言：{language}\n",
  "runtime.wizard.start": "OpenCode Bot 設定。\n",
  "runtime.wizard.saved": "設定已儲存：\n- {envPath}\n- {settingsPath}\n",
  "runtime.wizard.not_configured_starting": "應用程式尚未設定。正在啟動精靈...\n",
  "runtime.wizard.tty_required":
    "互動式精靈需要 TTY 終端。請在互動式 shell 中執行 `opencode-bot config`。",

  "rename.no_session": "⚠️ 沒有作用中的工作階段。請先建立或選擇一個工作階段。",
  "rename.prompt": "📝 請輸入工作階段的新標題：\n\n目前：{title}",
  "rename.empty_title": "⚠️ 標題不可為空。",
  "rename.success": "✅ 工作階段已重新命名為：{title}",
  "rename.error": "🔴 重新命名工作階段失敗。",
  "rename.cancelled": "❌ 重新命名已取消。",
  "rename.hint_abort": "輸入「取消」、\"cancel\" 或 /cancel 取消重新命名。",

  "task.prompt.schedule":
    "⏰ 以自然語言傳送任務排程。\n\n範例：\n- 每 5 分鐘\n- 每天 17:00\n- 明天 12:00",
  "task.schedule_empty": "⚠️ 排程不可為空。",
  "task.parse_error": "🔴 解析排程失敗。\n\n{message}\n\n請以更清楚的形式重新傳送排程。",
  "task.schedule_preview":
    "✅ 排程已解析\n\n我的理解：{summary}\n{cronLine}時區：{timezone}\n類型：{kind}\n下次執行：{nextRunAt}",
  "task.schedule_preview.cron": "Cron：{cron}",
  "task.prompt.body": "📝 現在傳送排程時機器人應該執行的內容。",
  "task.hint_cancel": "輸入「取消」、\"cancel\" 或 /cancel 可退出。",
  "task.prompt_empty": "⚠️ 任務文字不可為空。",
  "task.created":
    "✅ 排程任務已建立\n\n任務：{description}\n專案：{project}\n模型：{model}\n排程：{schedule}\n{cronLine}下次執行：{nextRunAt}",
  "task.created.cron": "Cron：{cron}",
  "task.cancelled": "❌ 排程任務建立已取消。",
  "task.inactive": "⚠️ 排程任務建立未啟用。請再次執行 /task。",
  "task.limit_reached": "⚠️ 已達任務上限（{limit}）。請先刪除現有的排程任務。",
  "task.schedule_too_frequent": "循環排程太頻繁。允許的最小間隔為每 5 分鐘一次。",
  "task.kind.cron": "循環",
  "task.kind.once": "一次性",
  "task.run.success": "⏰ 排程任務完成：{description}",
  "task.run.error": "🔴 排程任務失敗：{description}\n\n錯誤：{error}",

  "tasklist.empty": "📭 目前沒有排程任務。",
  "tasklist.select": "請選擇一個排程任務：",
  "tasklist.select_hint": "輸入任務編號查看詳情，或輸入「取消」、\"cancel\" 或 /cancel 退出。",
  "tasklist.details":
    "⏰ 排程任務\n\n任務：{prompt}\n專案：{project}\n排程：{schedule}\n模型：{model}\n{cronLine}時區：{timezone}\n下次執行：{nextRunAt}\n上次執行：{lastRunAt}\n執行次數：{runCount}",
  "tasklist.details.cron": "Cron：{cron}",
  "tasklist.deleted_callback": "已刪除",
  "tasklist.cancelled_callback": "已取消",
  "tasklist.inactive_callback": "此排程任務選單已失效",
  "tasklist.load_error": "🔴 載入排程任務失敗。",
  "tasklist.invalid_number": "⚠️ 請輸入有效的任務編號，或輸入「取消」、\"cancel\" 或 /cancel 退出。",
  "tasklist.not_found": "⚠️ 任務 #{number} 不存在。目前共有 {count} 個任務。",
  "tasklist.hint_detail": "輸入「刪除」或 \"delete\" 刪除此任務，或輸入「取消」、\"cancel\" 或 /cancel 返回。",
  "tasklist.delete_error": "❌ 刪除任務失敗。",

  "commands.empty": "📭 目前專案沒有可用的 OpenCode 命令。",
  "commands.fetch_error": "🔴 載入 OpenCode 命令失敗。",
  "commands.no_description": "無描述",
  "commands.cancelled_callback": "已取消",
  "commands.executing_prefix": "⚡ 執行命令：",
  "commands.execute_error": "🔴 執行 OpenCode 命令失敗。",
  "commands.hint_select": "💡 使用 `/command <編號>` 執行命令，或使用 `/command <編號> [參數]` 攜帶參數執行。",
  "commands.invalid_number": "請輸入有效的命令編號（{min}-{max}）。",

  "cli.usage":
    "用法：\n  opencode-bot [start] [--mode sources|installed]\n  opencode-bot status\n  opencode-bot stop\n  opencode-bot config\n\n說明：\n  - 不帶命令時預設執行 `start`\n  - `--mode` 目前僅支援 `start` 命令",
  "cli.placeholder.status":
    "命令 `status` 目前是佔位符。真實狀態檢查將會在 service 層（階段 5）加入。",
  "cli.placeholder.stop":
    "命令 `stop` 目前是佔位符。真實的背景程序停止將會在 service 層（階段 5）加入。",
  "cli.placeholder.unavailable": "命令不可用。",
  "cli.error.prefix": "CLI 錯誤：{message}",
  "cli.args.unknown_command": "未知命令：{value}",
  "cli.args.mode_requires_value": "選項 --mode 需要一個值：sources|installed",
  "cli.args.invalid_mode": "無效的 --mode 值：{value}。預期 sources|installed",
  "cli.args.unknown_option": "未知選項：{value}",
  "cli.args.mode_only_start": "選項 --mode 僅支援 start 命令",

  "openclaw.processing":
    "⚙️ 處理中...\n\n💡 您目前處於 OpenCode 拦截模式，輸入 /exit 退出。",
};
