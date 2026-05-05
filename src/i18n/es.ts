import type { I18nDictionary } from "./en.js";

export const es: I18nDictionary = {
  "cmd.description.status": "Estado del servidor y de la sesión",
  "cmd.description.new": "Crear una sesión nueva",
  "cmd.description.stop": "Detener la acción actual",
  "cmd.description.sessions": "Listar sesiones",
  "cmd.description.session_number": "Seleccionar sesión por número",
  "cmd.description.projects": "Listar proyectos",
  "cmd.description.project_number": "Seleccionar proyecto por número",
  "cmd.description.task": "Crear tarea programada",
  "cmd.description.tasks": "Ver tareas programadas",
  "cmd.description.commands": "Comandos personalizados",
  "cmd.description.command_number": "Ejecutar comando por número",
  "cmd.description.auto_confirm": "Activar/desactivar confirmación automática",
  "cmd.description.permission": "Mostrar estado de solicitudes de permiso",
  "cmd.description.exit": "Salir de la aplicación del bot",
  "cmd.description.help": "Ayuda",
  "cmd.description.agents": "Listar agentes disponibles",
  "cmd.description.agent_number": "Cambiar a agente por número",
  "cmd.description.rename": "Renombrar la sesión actual con /session rename",
  "cmd.description.opencode": "Entrar en modo OpenCode",
  "error.load_agents": "❌ No se pudo cargar la lista de agentes",
  "error.generic": "🔴 Algo salió mal.",

  "common.unknown_error": "error desconocido",

  "bot.thinking": "💭 Pensando...",
  "bot.project_not_selected":
    "🏗 No hay un proyecto seleccionado.\n\nPrimero selecciona un proyecto con /projects.",
  "bot.session_error": "🔴 OpenCode devolvió un error: {message}",
  "bot.session_retry":
    "🔁 {message}\n\nEl proveedor devuelve el mismo error en intentos repetidos. Usa /abort para detenerlo.",
  "status.session_not_selected": "Sesión actual: no seleccionada",
  "exit.stopping": "🛑 Cerrando la aplicación del bot...",

  "agent.list.title":
    "🤖 **Agentes disponibles**\n\nActual: {current}\n\n{list}\n\nUsa `/agent <número>` para cambiar",
  "agent.list.empty": "⚠️ No hay agentes disponibles",
  "agent.switch.success": "✅ Agente cambiado a: {name}",
  "agent.switch.error": "❌ No se pudo cambiar el agente",
  "agent.switch.invalid_index": "❌ Número inválido. Usa `/agent` para ver la lista",

  "pinned.line.model": "Modelo: {model}",
  "subagent.line.task": "Tarea: {task}",
  "subagent.line.agent": "Agente: {agent}",
  "subagent.working": "Trabajando...",
  "subagent.completed": "Completada",
  "subagent.failed": "Error de tarea",
  "tool.todo.overflow": "*({count} tareas más)*",
  "tool.file_header.write":
    "Escribir archivo/ruta: {path}\n============================================================\n\n",
  "tool.file_header.edit":
    "Editar archivo/ruta: {path}\n============================================================\n\n",

  "runtime.wizard.ask_language":
    "Selecciona el idioma de la interfaz.\nIntroduce el número del idioma de la lista o el código de locale.\nPulsa Enter para mantener el idioma por defecto: {defaultLocale}\n{options}\n> ",
  "runtime.wizard.language_invalid":
    "Introduce un número de idioma de la lista o un código de locale compatible.\n",
  "runtime.wizard.language_selected": "Idioma seleccionado: {language}\n",
  "runtime.wizard.start": "Configuración de OpenCode Chat Bot.\n",
  "runtime.wizard.saved": "Configuración guardada:\n- {envPath}\n- {settingsPath}\n",
  "runtime.wizard.not_configured_starting":
    "La aplicación aún no está configurada. Iniciando el asistente...\n",
  "runtime.wizard.tty_required":
    "El asistente interactivo requiere un terminal TTY. Ejecuta `opencode-chat-bot config` en una shell interactiva.",

  "rename.no_session": "⚠️ No hay una sesión activa. Crea o selecciona una sesión primero.",
  "rename.prompt": "📝 Introduce un nuevo título para la sesión:\n\nActual: {title}",
  "rename.empty_title": "⚠️ El título no puede estar vacío.",
  "rename.success": "✅ Sesión renombrada a: {title}",
  "rename.error": "🔴 No se pudo renombrar la sesión.",
  "rename.cancelled": "❌ Cambio de nombre cancelado.",
  "rename.hint_abort": "Escribe \"cancel\", \"取消\" o /cancel para cancelar el cambio de nombre.",

  "task.prompt.schedule":
    "⏰ Envía el horario de la tarea en lenguaje natural.\n\nEjemplos:\n- cada 5 minutos\n- cada día a las 17:00\n- mañana a las 12:00",
  "task.schedule_empty": "⚠️ El horario no puede estar vacío.",
  "task.parse_error":
    "🔴 No se pudo interpretar el horario.\n\n{message}\n\nEnvía el periodo otra vez de forma más clara.",
  "task.schedule_preview":
    "✅ Horario interpretado\n\nEntendido como: {summary}\n{cronLine}Zona horaria: {timezone}\nTipo: {kind}\nPróxima ejecución: {nextRunAt}",
  "task.schedule_preview.cron": "Cron: {cron}",
  "task.prompt.body": "📝 Ahora envía lo que el bot debe hacer según este horario.",
  "task.hint_cancel": "Escribe \"cancel\", \"取消\" o /cancel para cancelar.",
  "task.prompt_empty": "⚠️ El texto de la tarea no puede estar vacío.",
  "task.created":
    "✅ Tarea programada creada\n\nTarea: {description}\nProyecto: {project}\nModelo: {model}\nHorario: {schedule}\n{cronLine}Próxima ejecución: {nextRunAt}",
  "task.created.cron": "Cron: {cron}",
  "task.cancelled": "❌ Creación de la tarea programada cancelada.",
  "task.inactive": "⚠️ La creación de la tarea programada no está activa. Ejecuta /task otra vez.",
  "task.limit_reached":
    "⚠️ Se alcanzó el límite de tareas ({limit}). Primero elimina una tarea programada existente.",
  "task.schedule_too_frequent":
    "El horario recurrente es demasiado frecuente. El intervalo mínimo permitido es una vez cada 5 minutos.",
  "task.kind.cron": "recurrente",
  "task.kind.once": "única",
  "task.model.default": "predeterminado",
  "task.run.success": "⏰ Tarea programada completada: {description}",
  "task.run.error": "🔴 La tarea programada falló: {description}\n\nError: {error}",
  "task.run.error.interactive_question":
    "La tarea programada solicitó una pregunta interactiva y no puede continuar sin supervisión.",
  "task.run.error.interactive_permission":
    "La tarea programada solicitó un permiso interactivo y no puede continuar sin supervisión.",

  "tasklist.empty": "📭 Aún no hay tareas programadas.",
  "tasklist.select": "Elige una tarea programada:",
  "tasklist.select_hint": "Escribe el número de la tarea para ver detalles, o \"cancel\", \"取消\" o /cancel para salir.",
  "tasklist.details":
    "⏰ Tarea programada\n\nTarea: {prompt}\nProyecto: {project}\nHorario: {schedule}\nModelo: {model}\n{cronLine}Zona horaria: {timezone}\nPróxima ejecución: {nextRunAt}\nÚltima ejecución: {lastRunAt}\nNúmero de ejecuciones: {runCount}",
  "tasklist.details.cron": "Cron: {cron}",
  "tasklist.deleted_callback": "Eliminada",
  "tasklist.cancelled_callback": "Cancelado",
  "tasklist.inactive_callback": "Este menú de tareas programadas está inactivo",
  "tasklist.load_error": "🔴 No se pudieron cargar las tareas programadas.",
  "tasklist.invalid_number": "⚠️ Introduce un número de tarea válido, o \"cancel\", \"取消\" o /cancel para salir.",
  "tasklist.not_found": "⚠️ La tarea #{number} no existe. Hay {count} tareas en total.",
  "tasklist.hint_detail": "Escribe \"delete\" o \"删除\" para eliminar esta tarea, o \"cancel\", \"取消\" o /cancel para volver.",
  "tasklist.delete_error": "❌ No se pudo eliminar la tarea.",

  "commands.empty": "📭 No hay comandos de OpenCode disponibles para este proyecto.",
  "commands.fetch_error": "🔴 No se pudieron cargar los comandos de OpenCode.",
  "commands.no_description": "Sin descripción",
  "commands.cancelled_callback": "Cancelado",
  "commands.executing_prefix": "⚡ Ejecutando comando:",
  "commands.execute_error": "🔴 No se pudo ejecutar el comando de OpenCode.",
  "commands.hint_select": '💡 Usa `/command <número>` para ejecutar un comando o `/command <número> [args]` para ejecutarlo con argumentos.',
  "commands.invalid_number": "Introduce número válido ({min}-{max}).",

  "cli.usage":
    "Uso:\n  opencode-chat-bot [start] [--mode sources|installed]\n  opencode-chat-bot status\n  opencode-chat-bot stop\n  opencode-chat-bot config\n\nNotas:\n  - Sin comando, el valor por defecto es `start`\n  - `--mode` actualmente solo se admite para `start`",
  "cli.placeholder.status":
    "El comando `status` es actualmente un marcador de posición. Las comprobaciones reales de estado se agregarán en la capa de servicio (Fase 5).",
  "cli.placeholder.stop":
    "El comando `stop` es actualmente un marcador de posición. La detención real del proceso en segundo plano se agregará en la capa de servicio (Fase 5).",
  "cli.placeholder.unavailable": "El comando no esta disponible.",
  "cli.error.prefix": "Error de CLI: {message}",
  "cli.args.unknown_command": "Comando desconocido: {value}",
  "cli.args.mode_requires_value": "La opción --mode requiere un valor: sources|installed",
  "cli.args.invalid_mode": "Valor de --mode inválido: {value}. Se espera sources|installed",
  "cli.args.unknown_option": "Opción desconocida: {value}",
  "cli.args.mode_only_start": "La opción --mode solo se admite para el comando start",

  "openclaw.processing":
    "⚙️ Procesando...\n\n💡 Estás en el modo intercept de OpenCode. Ingresa /exit para salir.",

  "openclaw.permission_hint":
    "🔐 **Solicitud de permiso**\n\nPor favor responda:\n/1 - Permitir una vez\n/2 - Permitir siempre\n/3 - Rechazar",

  "auto_lock.success": "✅ Bot bloqueado a tu cuenta ({userId}). Otros usuarios no pueden acceder.",
  "auto_lock.race_rejected": "❌ Bot bloqueado por otro usuario. Acceso denegado.",
  "permission.denied": "❌ Acceso denegado.",
};
