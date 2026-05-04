import type { I18nDictionary } from "./en.js";

export const de: I18nDictionary = {
  "cmd.description.status": "Server- und Sitzungsstatus",
  "cmd.description.new": "Neue Sitzung erstellen",
  "cmd.description.stop": "Aktuelle Aktion stoppen",
  "cmd.description.sessions": "Sitzungen auflisten",
  "cmd.description.session_number": "Sitzung nach Nummer auswählen",
  "cmd.description.projects": "Projekte auflisten",
  "cmd.description.project_number": "Projekt nach Nummer auswählen",
  "cmd.description.task": "Geplante Aufgabe erstellen",
  "cmd.description.tasks": "Geplante Aufgaben anzeigen",
  "cmd.description.commands": "Benutzerdefinierte Befehle",
  "cmd.description.command_number": "Befehl nach Nummer ausführen",
  "cmd.description.auto_confirm": "Auto-Bestätigung für aktuelle Sitzung umschalten",
  "cmd.description.permission": "Status ausstehender Permission-Anfragen anzeigen",
  "cmd.description.exit": "Bot-Anwendung beenden",
  "cmd.description.help": "Hilfe",
  "cmd.description.agents": "Verfügbare Agenten auflisten",
  "cmd.description.agent_number": "Agent nach Nummer wechseln",
  "cmd.description.rename": "Aktuelle Sitzung mit /session rename umbenennen",
  "cmd.description.opencode": "OpenCode-Modus aktivieren",
  "error.load_agents": "❌ Agentenliste konnte nicht geladen werden",
  "error.generic": "🔴 Etwas ist schiefgelaufen.",

  "common.unknown_error": "unbekannter Fehler",

  "bot.thinking": "💭 Denke...",
  "bot.project_not_selected":
    "🏗 Projekt ist nicht ausgewählt.\n\nWähle zuerst ein Projekt mit /projects.",
  "bot.session_error": "🔴 OpenCode meldete einen Fehler: {message}",
  "bot.session_retry":
    "🔁 {message}\n\nDer Provider liefert bei wiederholten Versuchen immer wieder denselben Fehler. Mit /abort abbrechen.",
  "status.session_not_selected": "Aktuelle Sitzung: nicht ausgewählt",
  "exit.stopping": "🛑 Bot-Anwendung wird beendet...",

  "agent.list.title":
    "🤖 **Verfügbare Agenten**\n\nAktuell: {current}\n\n{list}\n\nVerwende `/agent <Nummer>` zum Wechseln",
  "agent.list.empty": "⚠️ Keine Agenten verfügbar",
  "agent.switch.success": "✅ Agent geändert zu: {name}",
  "agent.switch.error": "❌ Agent konnte nicht geändert werden",
  "agent.switch.invalid_index": "❌ Ungültige Nummer. Verwende `/agent` zum Anzeigen der Liste",

  "pinned.line.model": "Modell: {model}",
  "subagent.line.task": "Aufgabe: {task}",
  "subagent.line.agent": "Agent: {agent}",
  "subagent.working": "Arbeitet...",
  "subagent.completed": "Abgeschlossen",
  "subagent.failed": "Aufgabe fehlgeschlagen",
  "tool.todo.overflow": "*({count} weitere Aufgaben)*",
  "tool.file_header.write":
    "Datei/Pfad schreiben: {path}\n============================================================\n\n",
  "tool.file_header.edit":
    "Datei/Pfad bearbeiten: {path}\n============================================================\n\n",

  "runtime.wizard.ask_language":
    "Oberflächensprache auswählen.\nGib die Sprach-Nummer aus der Liste oder den Locale-Code ein.\nDrücke Enter, um die Standardsprache beizubehalten: {defaultLocale}\n{options}\n> ",
  "runtime.wizard.language_invalid":
    "Gib eine Sprach-Nummer aus der Liste oder einen unterstützten Locale-Code ein.\n",
  "runtime.wizard.language_selected": "Ausgewählte Sprache: {language}\n",
  "runtime.wizard.start": "OpenCode Bot Einrichtung.\n",
  "runtime.wizard.saved": "Konfiguration gespeichert:\n- {envPath}\n- {settingsPath}\n",
  "runtime.wizard.not_configured_starting":
    "Anwendung ist noch nicht konfiguriert. Starte Assistent...\n",
  "runtime.wizard.tty_required":
    "Der interaktive Assistent erfordert ein TTY-Terminal. Führe `opencode-chat-bot config` in einer interaktiven Shell aus.",

  "rename.no_session": "⚠️ Keine aktive Sitzung. Erstelle oder wähle zuerst eine Sitzung.",
  "rename.prompt": "📝 Neuen Titel für die Sitzung eingeben:\n\nAktuell: {title}",
  "rename.empty_title": "⚠️ Titel darf nicht leer sein.",
  "rename.success": "✅ Sitzung umbenannt in: {title}",
  "rename.error": "🔴 Sitzung konnte nicht umbenannt werden.",
  "rename.cancelled": "❌ Umbenennen abgebrochen.",
  "rename.hint_abort": "Gib \"cancel\", \"取消\" oder /cancel ein, um das Umbenennen abzubrechen.",

  "task.prompt.schedule":
    "⏰ Sende den Zeitplan der Aufgabe in natürlicher Sprache.\n\nBeispiele:\n- alle 5 Minuten\n- jeden Tag um 17:00\n- morgen um 12:00",
  "task.schedule_empty": "⚠️ Der Zeitplan darf nicht leer sein.",
  "task.parse_error":
    "🔴 Zeitplan konnte nicht erkannt werden.\n\n{message}\n\nSende den Zeitraum bitte noch einmal klarer formuliert.",
  "task.schedule_preview":
    "✅ Zeitplan erkannt\n\nVerstanden als: {summary}\n{cronLine}Zeitzone: {timezone}\nTyp: {kind}\nNächster Lauf: {nextRunAt}",
  "task.schedule_preview.cron": "Cron: {cron}",
  "task.prompt.body": "📝 Sende jetzt, was der Bot nach Zeitplan tun soll.",
  "task.hint_cancel": "Gib \"cancel\", \"取消\" oder /cancel ein, um abzubrechen.",
  "task.prompt_empty": "⚠️ Der Aufgabentext darf nicht leer sein.",
  "task.created":
    "✅ Geplante Aufgabe erstellt\n\nAufgabe: {description}\nProjekt: {project}\nModell: {model}\nZeitplan: {schedule}\n{cronLine}Nächster Lauf: {nextRunAt}",
  "task.created.cron": "Cron: {cron}",
  "task.cancelled": "❌ Erstellung der geplanten Aufgabe abgebrochen.",
  "task.inactive": "⚠️ Die Erstellung geplanter Aufgaben ist nicht aktiv. Starte /task erneut.",
  "task.limit_reached":
    "⚠️ Aufgabenlimit erreicht ({limit}). Lösche zuerst eine bestehende geplante Aufgabe.",
  "task.schedule_too_frequent":
    "Der wiederkehrende Zeitplan ist zu häufig. Das minimale erlaubte Intervall ist einmal alle 5 Minuten.",
  "task.kind.cron": "wiederkehrend",
  "task.kind.once": "einmalig",
  "task.model.default": "Standard",
  "task.run.success": "⏰ Geplante Aufgabe abgeschlossen: {description}",
  "task.run.error": "🔴 Geplante Aufgabe fehlgeschlagen: {description}\n\nFehler: {error}",
  "task.run.error.interactive_question":
    "Geplante Aufgabe hat eine interaktive Frage gestellt und kann unbeaufsichtigt nicht fortfahren.",
  "task.run.error.interactive_permission":
    "Geplante Aufgabe hat eine interaktive Berechtigung angefordert und kann unbeaufsichtigt nicht fortfahren.",

  "tasklist.empty": "📭 Noch keine geplanten Aufgaben.",
  "tasklist.select": "Wähle eine geplante Aufgabe:",
  "tasklist.select_hint": "Gib eine Aufgabennummer ein, um Details zu sehen, oder \"cancel\", \"取消\" bzw. /cancel zum Beenden.",
  "tasklist.details":
    "⏰ Geplante Aufgabe\n\nAufgabe: {prompt}\nProjekt: {project}\nZeitplan: {schedule}\nModell: {model}\n{cronLine}Zeitzone: {timezone}\nNächster Lauf: {nextRunAt}\nLetzter Lauf: {lastRunAt}\nAnzahl Läufe: {runCount}",
  "tasklist.details.cron": "Cron: {cron}",
  "tasklist.deleted_callback": "Gelöscht",
  "tasklist.cancelled_callback": "Abgebrochen",
  "tasklist.inactive_callback": "Dieses Menü für geplante Aufgaben ist inaktiv",
  "tasklist.load_error": "🔴 Geplante Aufgaben konnten nicht geladen werden.",
  "tasklist.invalid_number": "⚠️ Gib eine gültige Aufgabennummer ein oder \"cancel\", \"取消\" bzw. /cancel zum Beenden.",
  "tasklist.not_found": "⚠️ Aufgabe #{number} existiert nicht. Es gibt insgesamt {count} Aufgaben.",
  "tasklist.hint_detail": "Gib \"delete\" oder \"删除\" ein, um diese Aufgabe zu löschen, oder \"cancel\", \"取消\" bzw. /cancel zum Zurückgehen.",
  "tasklist.delete_error": "❌ Aufgabe konnte nicht gelöscht werden.",

  "commands.empty": "📭 Für dieses Projekt sind keine OpenCode-Befehle verfügbar.",
  "commands.fetch_error": "🔴 OpenCode-Befehle konnten nicht geladen werden.",
  "commands.no_description": "Keine Beschreibung",
  "commands.cancelled_callback": "Abgebrochen",
  "commands.executing_prefix": "⚡ Befehl wird ausgeführt:",
  "commands.execute_error": "🔴 OpenCode-Befehl konnte nicht ausgeführt werden.",
  "commands.hint_select": '💡 Verwende `/command <Nummer>` zum Ausführen oder `/command <Nummer> [Argumente]` für Ausführung mit Argumenten.',
  "commands.invalid_number": "Bitte gültige Befehlsnummer eingeben ({min}-{max}).",

  "cli.usage":
    "Verwendung:\n  opencode-chat-bot [start] [--mode sources|installed]\n  opencode-chat-bot status\n  opencode-chat-bot stop\n  opencode-chat-bot config\n\nHinweise:\n  - Ohne Befehl wird standardmäßig `start` verwendet\n  - `--mode` wird derzeit nur für `start` unterstützt",
  "cli.placeholder.status":
    "Befehl `status` ist derzeit ein Platzhalter. Echte Statusprüfungen werden in der Service-Schicht hinzugefügt (Phase 5).",
  "cli.placeholder.stop":
    "Befehl `stop` ist derzeit ein Platzhalter. Ein echter Stop des Hintergrundprozesses wird in der Service-Schicht hinzugefügt (Phase 5).",
  "cli.placeholder.unavailable": "Befehl ist nicht verfügbar.",
  "cli.error.prefix": "CLI-Fehler: {message}",
  "cli.args.unknown_command": "Unbekannter Befehl: {value}",
  "cli.args.mode_requires_value": "Option --mode erfordert einen Wert: sources|installed",
  "cli.args.invalid_mode": "Ungültiger Wert für --mode: {value}. Erwartet sources|installed",
  "cli.args.unknown_option": "Unbekannte Option: {value}",
  "cli.args.mode_only_start": "Option --mode wird nur für den start-Befehl unterstützt",

  "openclaw.processing":
    "⚙️ Bearbeitung...\n\n💡 Sie befinden sich im OpenCode-Intercept-Modus. Geben Sie /exit ein, um zu beenden.",

  "openclaw.permission_hint":
    "🔐 **Berechtigungsanfrage**\n\nBitte antworten:\n/1 - Einmal erlauben\n/2 - Immer erlauben\n/3 - Ablehnen",

  "auto_lock.success": "✅ Bot auf Ihr Konto ({userId}) gesperrt. Andere Benutzer können nicht zugreifen.",
  "auto_lock.race_rejected": "❌ Bot von anderem Benutzer gesperrt. Zugriff verweigert.",
  "permission.denied": "❌ Zugriff verweigert.",
};

