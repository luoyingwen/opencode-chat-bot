import type { I18nDictionary } from "./en.js";

export const ru: I18nDictionary = {
  "cmd.description.status": "Статус сервера и сессии",
  "cmd.description.new": "Создать новую сессию",
  "cmd.description.stop": "Прервать текущее действие",
  "cmd.description.sessions": "Список сессий",
  "cmd.description.session_number": "Выбрать сессию по номеру",
  "cmd.description.projects": "Список проектов",
  "cmd.description.project_number": "Выбрать проект по номеру",
  "cmd.description.task": "Создать задачу по расписанию",
  "cmd.description.tasks": "Список задач по расписанию",
  "cmd.description.commands": "Пользовательские команды",
  "cmd.description.command_number": "Выполнить команду по номеру",
  "cmd.description.auto_confirm": "Включить/выключить авто-подтверждение",
  "cmd.description.permission": "Показать статус запросов разрешений",
  "cmd.description.exit": "Завершить приложение бота",
  "cmd.description.help": "Справка",
  "cmd.description.agents": "Список доступных агентов",
  "cmd.description.agent_number": "Сменить агента по номеру",
  "cmd.description.rename": "Переименовать текущую сессию через /session rename",
  "cmd.description.opencode": "Войти в режим OpenCode",
  "error.load_agents": "❌ Ошибка при загрузке списка агентов",
  "error.generic": "🔴 Произошла ошибка.",

  "common.unknown_error": "неизвестная ошибка",

  "bot.thinking": "💭 Думаю...",
  "bot.project_not_selected": "🏗 Проект не выбран.\n\nСначала выберите проект командой /projects.",
  "bot.session_error": "🔴 OpenCode вернул ошибку: {message}",
  "bot.session_retry":
    "🔁 {message}\n\nПровайдер возвращает одну и ту же ошибку при повторных запросах. Используйте /abort для остановки.",
  "status.session_not_selected": "Текущая сессия: не выбрана",
  "exit.stopping": "🛑 Завершение приложения бота...",

  "agent.list.title":
    "🤖 **Доступные агенты**\n\nТекущий: {current}\n\n{list}\n\nИспользуйте `/agent <номер>` для смены",
  "agent.list.empty": "⚠️ Нет доступных агентов",
  "agent.switch.success": "✅ Агент изменен на: {name}",
  "agent.switch.error": "❌ Не удалось сменить агента",
  "agent.switch.invalid_index": "❌ Неверный номер. Используйте `/agent` для просмотра списка",

  "pinned.line.model": "Модель: {model}",
  "subagent.line.task": "Задача: {task}",
  "subagent.line.agent": "Агент: {agent}",
  "subagent.working": "В работе...",
  "subagent.completed": "Завершена",
  "subagent.failed": "Ошибка задачи",
  "tool.todo.overflow": "*(ещё {count} задач)*",
  "tool.file_header.write":
    "Write File/Path: {path}\n============================================================\n\n",
  "tool.file_header.edit":
    "Edit File/Path: {path}\n============================================================\n\n",

  "runtime.wizard.ask_language":
    "Выберите язык интерфейса.\nВведите номер языка из списка или код локали.\nНажмите Enter, чтобы оставить язык по умолчанию: {defaultLocale}\n{options}\n> ",
  "runtime.wizard.language_invalid":
    "Введите номер языка из списка или поддерживаемый код локали.\n",
  "runtime.wizard.language_selected": "Выбран язык: {language}\n",
  "runtime.wizard.start": "Настройка OpenCode Bot.\n",
  "runtime.wizard.saved": "Конфигурация сохранена:\n- {envPath}\n- {settingsPath}\n",
  "runtime.wizard.not_configured_starting":
    "Приложение еще не сконфигурировано. Запускаю wizard...\n",
  "runtime.wizard.tty_required":
    "Интерактивный wizard требует TTY-терминал. Запустите `opencode-bot config` в интерактивной оболочке.",

  "rename.no_session": "⚠️ Нет активной сессии. Сначала создайте или выберите сессию.",
  "rename.prompt": "📝 Введите новое название сессии:\n\nТекущее: {title}",
  "rename.empty_title": "⚠️ Название не может быть пустым.",
  "rename.success": "✅ Сессия переименована в: {title}",
  "rename.error": "🔴 Не удалось переименовать сессию.",
  "rename.cancelled": "❌ Переименование отменено.",
  "rename.hint_abort": "Введите \"cancel\", \"取消\" или /cancel, чтобы отменить переименование.",

  "task.prompt.schedule":
    "⏰ Отправьте расписание задачи обычным языком.\n\nПримеры:\n- каждые 5 минут\n- каждый день в 17:00\n- завтра в 12:00",
  "task.schedule_empty": "⚠️ Расписание не может быть пустым.",
  "task.parse_error":
    "🔴 Не удалось распознать расписание.\n\n{message}\n\nОтправьте период еще раз в более явном виде.",
  "task.schedule_preview":
    "✅ Расписание распознано\n\nКак я понял: {summary}\n{cronLine}Часовой пояс: {timezone}\nТип: {kind}\nСледующий запуск: {nextRunAt}",
  "task.schedule_preview.cron": "Cron: {cron}",
  "task.prompt.body": "📝 Теперь отправьте текст задачи, которую нужно выполнять по расписанию.",
  "task.hint_cancel": "Введите \"cancel\", \"取消\" или /cancel, чтобы отменить.",
  "task.prompt_empty": "⚠️ Текст задачи не может быть пустым.",
  "task.created":
    "✅ Задача по расписанию создана\n\nЗадача: {description}\nПроект: {project}\nМодель: {model}\nРасписание: {schedule}\n{cronLine}Следующий запуск: {nextRunAt}",
  "task.created.cron": "Cron: {cron}",
  "task.cancelled": "❌ Создание задачи по расписанию отменено.",
  "task.inactive": "⚠️ Сценарий создания задачи неактивен. Запустите /task снова.",
  "task.limit_reached":
    "⚠️ Достигнут лимит задач ({limit}). Сначала удалите одну из существующих задач по расписанию.",
  "task.schedule_too_frequent":
    "Повторяющееся расписание слишком частое. Минимально допустимый интервал - один запуск в 5 минут.",
  "task.kind.cron": "повторяющаяся",
  "task.kind.once": "однократная",
  "task.run.success": "⏰ Задача по расписанию выполнена: {description}",
  "task.run.error": "🔴 Ошибка выполнения задачи по расписанию: {description}\n\nОшибка: {error}",
  "task.run.error.interactive_question":
    "Задача по расписанию задала интерактивный вопрос и не может продолжить выполнение без участия пользователя.",
  "task.run.error.interactive_permission":
    "Задача по расписанию запросила интерактивное разрешение и не может продолжить выполнение без участия пользователя.",

  "tasklist.empty": "📭 Задач по расписанию пока нет.",
  "tasklist.select": "Выберите задачу по расписанию:",
  "tasklist.select_hint": "Введите номер задачи, чтобы посмотреть детали, или \"cancel\", \"取消\" или /cancel для выхода.",
  "tasklist.details":
    "⏰ Задача по расписанию\n\nЗадача: {prompt}\nПроект: {project}\nРасписание: {schedule}\nМодель: {model}\n{cronLine}Часовой пояс: {timezone}\nСледующий запуск: {nextRunAt}\nПоследний запуск: {lastRunAt}\nКоличество запусков: {runCount}",
  "tasklist.details.cron": "Cron: {cron}",
  "tasklist.deleted_callback": "Удалено",
  "tasklist.cancelled_callback": "Отменено",
  "tasklist.inactive_callback": "Это меню задач по расписанию уже неактивно",
  "tasklist.load_error": "🔴 Не удалось загрузить задачи по расписанию.",
  "tasklist.invalid_number": "⚠️ Введите корректный номер задачи, или \"cancel\", \"取消\" или /cancel для выхода.",
  "tasklist.not_found": "⚠️ Задача #{number} не существует. Всего задач: {count}.",
  "tasklist.hint_detail": "Введите \"delete\" или \"删除\", чтобы удалить эту задачу, или \"cancel\", \"取消\" или /cancel для возврата.",
  "tasklist.delete_error": "❌ Не удалось удалить задачу.",

  "commands.empty": "📭 Для этого проекта нет доступных команд OpenCode.",
  "commands.fetch_error": "🔴 Не удалось загрузить список команд OpenCode.",
  "commands.no_description": "Без описания",
  "commands.cancelled_callback": "Отменено",
  "commands.executing_prefix": "⚡ Выполнение команды:",
  "commands.execute_error": "🔴 Не удалось выполнить команду OpenCode.",
  "commands.hint_select": '💡 Используйте `/command <номер>` для запуска команды или `/command <номер> [аргументы]` для запуска с аргументами.',
  "commands.invalid_number": "Введите правильный номер ({min}-{max}).",

  "cli.usage":
    "Использование:\n  opencode-bot [start] [--mode sources|installed]\n  opencode-bot status\n  opencode-bot stop\n  opencode-bot config\n\nЗаметки:\n  - Без команды по умолчанию используется `start`\n  - `--mode` сейчас поддерживается только для `start`",
  "cli.placeholder.status":
    "Команда `status` пока работает как заглушка. Реальная проверка статуса появится на этапе service-слоя (Этап 5).",
  "cli.placeholder.stop":
    "Команда `stop` пока работает как заглушка. Реальная остановка фонового процесса появится на этапе service-слоя (Этап 5).",
  "cli.placeholder.unavailable": "Команда недоступна.",
  "cli.error.prefix": "CLI error: {message}",
  "cli.args.unknown_command": "Неизвестная команда: {value}",
  "cli.args.mode_requires_value": "Опция --mode требует значение: sources|installed",
  "cli.args.invalid_mode": "Некорректное значение --mode: {value}. Ожидается sources|installed",
  "cli.args.unknown_option": "Неизвестная опция: {value}",
  "cli.args.mode_only_start": "Опция --mode поддерживается только для команды start",

  "openclaw.processing":
    "⚙️ Обработка...\n\n💡 Вы в режиме intercept OpenCode. Введите /exit для выхода.",
};
