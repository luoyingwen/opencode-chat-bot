import type { I18nDictionary } from "./en.js";

export const fr: I18nDictionary = {
  "cmd.description.status": "Statut du serveur et de la session",
  "cmd.description.new": "Créer une nouvelle session",
  "cmd.description.stop": "Arrêter l'action en cours",
  "cmd.description.sessions": "Lister les sessions",
  "cmd.description.session_number": "Sélectionner une session par numéro",
  "cmd.description.projects": "Lister les projets",
  "cmd.description.project_number": "Sélectionner un projet par numéro",
  "cmd.description.task": "Créer une tâche planifiée",
  "cmd.description.tasks": "Afficher les tâches planifiées",
  "cmd.description.commands": "Commandes personnalisées",
  "cmd.description.command_number": "Exécuter une commande par numéro",
  "cmd.description.auto_confirm": "Activer/désactiver la confirmation automatique",
  "cmd.description.permission": "Afficher le statut des demandes de permission",
  "cmd.description.exit": "Quitter l'application du bot",
  "cmd.description.help": "Aide",
  "cmd.description.agents": "Lister les agents disponibles",
  "cmd.description.agent_number": "Changer d'agent par numéro",
  "cmd.description.rename": "Renommer la session actuelle via /session rename",
  "cmd.description.opencode": "Entrer en mode OpenCode",
  "error.load_agents": "❌ Impossible de charger la liste des modes",
  "error.generic": "🔴 Une erreur s'est produite.",

  "common.unknown_error": "erreur inconnue",

  "bot.thinking": "💭 Réflexion en cours...",
  "bot.project_not_selected":
    "🏗 Aucun projet n'est sélectionné.\n\nSélectionnez d'abord un projet avec /projects.",
  "bot.session_error": "🔴 OpenCode a renvoyé une erreur : {message}",
  "bot.session_retry":
    "🔁 {message}\n\nLe fournisseur renvoie la même erreur à chaque nouvelle tentative. Utilisez /abort pour arrêter.",
  "status.session_not_selected": "Session actuelle : non sélectionnée",
  "exit.stopping": "🛑 Arrêt de l'application du bot...",

  "agent.list.title":
    "🤖 **Agents disponibles**\n\nActuel : {current}\n\n{list}\n\nUtilisez `/agent <numéro>` pour changer",
  "agent.list.empty": "⚠️ Aucun agent disponible",
  "agent.switch.success": "✅ Agent défini sur : {name}",
  "agent.switch.error": "❌ Impossible de changer d'agent",
  "agent.switch.invalid_index": "❌ Numéro invalide. Utilisez `/agent` pour voir la liste",

  "pinned.line.model": "Modèle : {model}",
  "subagent.line.task": "Tache : {task}",
  "subagent.line.agent": "Agent : {agent}",
  "subagent.working": "En cours...",
  "subagent.completed": "Terminee",
  "subagent.failed": "Echec de la tache",
  "tool.todo.overflow": "*({count} tâches supplémentaires)*",
  "tool.file_header.write":
    "Écrire Fichier/Chemin : {path}\n============================================================\n\n",
  "tool.file_header.edit":
    "Modifier Fichier/Chemin : {path}\n============================================================\n\n",

  "runtime.wizard.ask_language":
    "Sélectionnez la langue de l'interface.\nEntrez le numéro de la langue dans la liste ou le code locale.\nAppuyez sur Entrée pour conserver la langue par défaut : {defaultLocale}\n{options}\n> ",
  "runtime.wizard.language_invalid":
    "Entrez un numéro de langue de la liste ou un code locale pris en charge.\n",
  "runtime.wizard.language_selected": "Langue sélectionnée : {language}\n",
  "runtime.wizard.start": "Configuration d'OpenCode Bot.\n",
  "runtime.wizard.saved": "Configuration enregistrée :\n- {envPath}\n- {settingsPath}\n",
  "runtime.wizard.not_configured_starting":
    "L'application n'est pas encore configurée. Lancement de l'assistant...\n",
  "runtime.wizard.tty_required":
    "L'assistant interactif nécessite un terminal TTY. Exécutez `opencode-bot config` dans un shell interactif.",

  "rename.no_session": "⚠️ Aucune session active. Créez ou sélectionnez d'abord une session.",
  "rename.prompt": "📝 Entrez le nouveau titre de la session :\n\nActuel : {title}",
  "rename.empty_title": "⚠️ Le titre ne peut pas être vide.",
  "rename.success": "✅ Session renommée en : {title}",
  "rename.error": "🔴 Impossible de renommer la session.",
  "rename.cancelled": "❌ Renommage annulé.",
  "rename.hint_abort": "Saisissez \"cancel\", \"取消\" ou /cancel pour annuler le renommage.",

  "task.prompt.schedule":
    "⏰ Envoyez le planning de la tâche en langage naturel.\n\nExemples :\n- toutes les 5 minutes\n- chaque jour à 17:00\n- demain à 12:00",
  "task.schedule_empty": "⚠️ Le planning ne peut pas être vide.",
  "task.parse_error":
    "🔴 Impossible d'interpréter le planning.\n\n{message}\n\nEnvoyez le créneau à nouveau de façon plus claire.",
  "task.schedule_preview":
    "✅ Planning interprété\n\nCompris comme : {summary}\n{cronLine}Fuseau horaire : {timezone}\nType : {kind}\nProchaine exécution : {nextRunAt}",
  "task.schedule_preview.cron": "Cron : {cron}",
  "task.prompt.body": "📝 Envoyez maintenant ce que le bot doit faire selon ce planning.",
  "task.hint_cancel": "Saisissez \"cancel\", \"取消\" ou /cancel pour annuler.",
  "task.prompt_empty": "⚠️ Le texte de la tâche ne peut pas être vide.",
  "task.created":
    "✅ Tâche planifiée créée\n\nTâche : {description}\nProjet : {project}\nModèle : {model}\nPlanning : {schedule}\n{cronLine}Prochaine exécution : {nextRunAt}",
  "task.created.cron": "Cron : {cron}",
  "task.cancelled": "❌ Création de la tâche planifiée annulée.",
  "task.inactive": "⚠️ La création de tâche planifiée n'est pas active. Relancez /task.",
  "task.limit_reached":
    "⚠️ Limite de tâches atteinte ({limit}). Supprimez d'abord une tâche planifiée existante.",
  "task.schedule_too_frequent":
    "Le planning récurrent est trop fréquent. L'intervalle minimum autorisé est d'une fois toutes les 5 minutes.",
  "task.kind.cron": "récurrente",
  "task.kind.once": "ponctuelle",
  "task.run.success": "⏰ Tâche planifiée terminée : {description}",
  "task.run.error": "🔴 Échec de la tâche planifiée : {description}\n\nErreur : {error}",

  "tasklist.empty": "📭 Aucune tâche planifiée pour le moment.",
  "tasklist.select": "Sélectionnez une tâche planifiée :",
  "tasklist.select_hint": "Saisissez le numéro de la tâche pour voir les détails, ou \"cancel\", \"取消\" ou /cancel pour quitter.",
  "tasklist.details":
    "⏰ Tâche planifiée\n\nTâche : {prompt}\nProjet : {project}\nPlanning : {schedule}\nModèle : {model}\n{cronLine}Fuseau horaire : {timezone}\nProchaine exécution : {nextRunAt}\nDernière exécution : {lastRunAt}\nNombre d'exécutions : {runCount}",
  "tasklist.details.cron": "Cron : {cron}",
  "tasklist.deleted_callback": "Supprimée",
  "tasklist.cancelled_callback": "Annulé",
  "tasklist.inactive_callback": "Ce menu des tâches planifiées est inactif",
  "tasklist.load_error": "🔴 Impossible de charger les tâches planifiées.",
  "tasklist.invalid_number": "⚠️ Saisissez un numéro de tâche valide, ou \"cancel\", \"取消\" ou /cancel pour quitter.",
  "tasklist.not_found": "⚠️ La tâche #{number} n'existe pas. Il y a {count} tâches au total.",
  "tasklist.hint_detail": "Saisissez \"delete\" ou \"删除\" pour supprimer cette tâche, ou \"cancel\", \"取消\" ou /cancel pour revenir.",
  "tasklist.delete_error": "❌ Impossible de supprimer la tâche.",

  "commands.empty": "📭 Aucune commande OpenCode n'est disponible pour ce projet.",
  "commands.fetch_error": "🔴 Impossible de charger les commandes OpenCode.",
  "commands.no_description": "Aucune description",
  "commands.cancelled_callback": "Annulé",
  "commands.executing_prefix": "⚡ Exécution de la commande :",
  "commands.execute_error": "🔴 Impossible d'exécuter la commande OpenCode.",
  "commands.hint_select": '💡 Utilisez `/command <numéro>` pour exécuter une commande, ou `/command <numéro> [args]` avec arguments.',
  "commands.invalid_number": "Entrez numéro valide ({min}-{max}).",

  "cli.usage":
    "Utilisation :\n  opencode-bot [start] [--mode sources|installed]\n  opencode-bot status\n  opencode-bot stop\n  opencode-bot config\n\nNotes :\n  - Sans commande, `start` est utilisé par défaut\n  - `--mode` n'est actuellement pris en charge que pour `start`",
  "cli.placeholder.status":
    "La commande `status` est actuellement un placeholder. Les vraies vérifications d'état seront ajoutées dans la couche service (Phase 5).",
  "cli.placeholder.stop":
    "La commande `stop` est actuellement un placeholder. Le véritable arrêt du processus en arrière-plan sera ajouté dans la couche service (Phase 5).",
  "cli.placeholder.unavailable": "Commande indisponible.",
  "cli.error.prefix": "Erreur CLI : {message}",
  "cli.args.unknown_command": "Commande inconnue : {value}",
  "cli.args.mode_requires_value": "L'option --mode nécessite une valeur : sources|installed",
  "cli.args.invalid_mode": "Valeur de mode invalide : {value}. Attendu : sources|installed",
  "cli.args.unknown_option": "Option inconnue : {value}",
  "cli.args.mode_only_start":
    "L'option --mode est prise en charge uniquement pour la commande start",

  "openclaw.processing":
    "⚙️ Traitement...\n\n💡 Vous êtes en mode intercept OpenCode. Entrez /exit pour quitter.",
};
