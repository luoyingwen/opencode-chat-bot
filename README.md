# OpenCode Chat Bot

fork from <https://github.com/grinev/opencode-telegram-bot>


This project differs from the original project in the following ways:

It can run as an OpenClaw plugin, deeply integrates with the OpenClaw ecosystem, and leverages OpenClaw message Channels to support almost all major IM platforms.
For standalone use, this project supports both Feishu and DingTalk as independent platforms.
Because this project differs significantly from the original and cannot verify Telegram app operation, support for Telegram has been removed. If you need Telegram support, please use the original project directly. <https://github.com/grinev/opencode-telegram-bot>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

OpenCode Chat Bot is a secure multi-platform client for [OpenCode](https://opencode.ai) CLI that runs on your local machine. It supports **DingTalk** and **Feishu** as standalone chat bots, and **OpenClaw** through a plugin entrypoint.

Run AI coding tasks, monitor progress, switch models, and manage sessions from your phone.

For DingTalk and Feishu, no public inbound port is required. The bot communicates with your local OpenCode server and the platform APIs. OpenClaw support is loaded by the OpenClaw plugin runtime.

Scheduled tasks are supported across the shared runtime. OpenClaw integration is intentionally implemented as a thin adapter that reuses the same command, prompt, session, permission, and scheduled-task modules as the standalone bots.

Platforms: macOS, Windows, Linux

Languages: English (`en`), Deutsch (`de`), Español (`es`), Русский (`ru`), 简体中文 (`zh`), 繁體中文 (`zh-TW`)

[Demo gif](assets/screencast.gif)

## Features

- **Multi-platform support** — DingTalk and Feishu standalone bots, plus OpenClaw plugin runtime support
- **Shared OpenClaw adapter** — OpenClawCode functionality is rebuilt on top of the existing shared core instead of duplicating command or session logic
- **Remote coding** — send text prompts to OpenCode from chat and receive aggregated results
- **Session management** — create new sessions or continue existing ones, just like in the TUI
- **Live status** — pinned message with current project, model, context usage, and changed files list, updated in real time
- **Model switching** — pick models from OpenCode favorites and recent history directly in the chat (favorites are shown first)
- **Agent modes** — switch between Plan and Build modes on the fly
- **Subagent activity** — watch live subagent progress in chat, including the current task, agent, model, and active tool step
- **Custom Commands** — run OpenCode custom commands (and built-ins like `init`/`review`) from an inline menu with confirmation
- **Interactive Q&A** — answer agent questions and approve permissions through chat interactions
- **Permission controls** — allow once, always allow, reject, or enable auto-confirmation for a session
- **Scheduled tasks** — schedule prompts to run later or on a recurring interval; see [Scheduled Tasks](#scheduled-tasks)
- **Context control** — compact context when it gets too large, right from the chat
- **Input flow control** — when an interactive flow is active, the bot accepts only relevant input to keep context consistent and avoid accidental actions
- **Security** — optional DingTalk/Feishu user allowlists restrict access
- **Localization** — UI localization is supported for multiple languages (`BOT_LOCALE`)
- **File logging** — logs are written to files with automatic rotation and retention

Current message input support is text-first. DingTalk and Feishu non-text messages such as images, files, voice, audio, and media are currently reported as unsupported by the platform handlers.

Planned features currently in development are listed in [Current Task List](PRODUCT.md#current-task-list).

## Prerequisites

- **Node.js 20+** — [download](https://nodejs.org)
- **OpenCode** — install from [opencode.ai](https://opencode.ai) or [GitHub](https://github.com/sst/opencode)
- **Bot Platform** — at least one of:
  - DingTalk Robot (see [DingTalk Bot](#dingtalk-bot))
  - Feishu Bot (see [Feishu Bot](#feishu-bot))
  - OpenClaw plugin runtime (see [OpenClaw Plugin Commands](#openclaw-plugin-commands))

## Quick Start

### 1. Choose an Integration

Use one or more of these integration modes:

- **DingTalk standalone bot** — configure `DINGTALK_APP_KEY` and `DINGTALK_APP_SECRET`
- **Feishu standalone bot** — configure `FEISHU_APP_ID` and `FEISHU_APP_SECRET`
- **OpenClaw plugin** — build this package and let OpenClaw load `dist/openclaw-plugin.js`

For standalone mode, at least one of DingTalk or Feishu must be configured.

### 2. Start OpenCode Server

Start the OpenCode server:

```bash
opencode serve
```

The bot connects to the OpenCode API at `http://localhost:4096` by default. Override it with `OPENCODE_API_URL`.

### 3. Install from npm

The package is published on npm as `@luoyingwen/opencode-chat-bot`.

#### OpenClaw Plugin

```bash
openclaw plugins install @luoyingwen/opencode-chat-bot
openclaw config set plugins.entries.opencode-chat-bot.config.enabled true
openclaw gateway restart
```

Send `/opencode` in the conversation to enter OpenCode mode, then send prompts or commands.

#### Standalone Bot

```bash
npm install -g @luoyingwen/opencode-chat-bot
opencode-chat-bot config
opencode-chat-bot start
```

The config wizard will guide you through selecting a language and configuring Feishu or DingTalk credentials.

For Linux `systemd` setup, see [docs/LINUX_SYSTEMD_SETUP.md](docs/LINUX_SYSTEMD_SETUP.md).

### 4. Run From Source

```bash
git clone https://github.com/luoyingwen/opencode-chat-bot.git
cd opencode-chat-bot
npm install
cp .env.example .env
# Edit .env with your OpenCode model and platform credentials
npm run dev
```

### 5. OpenClaw Local Plugin Install

For local development and testing, build and install the plugin from source:

```bash
npm install
npm run build:openclaw
npm run openclaw:install -- local
openclaw config set plugins.entries.opencode-chat-bot.enabled true
```

For local iteration, use link mode instead:

```bash
npm run openclaw:install -- link
```

### 6. Installed CLI Mode

When installed globally via npm, use the CLI commands directly:

```bash
opencode-chat-bot config
opencode-chat-bot start
```

On first launch, the interactive wizard asks for interface language and platform credentials.

## Supported Platforms (Node.js)

| Platform | Status                                       |
| -------- | -------------------------------------------- |
| macOS    | Fully supported                              |
| Windows  | Fully supported                              |
| Linux    | Fully supported (tested on Ubuntu 24.04 LTS) |

## Bot Commands

### Shared Commands (All Platforms)

All platforms support the same core command set:

| Command                   | Description                                             |
| ------------------------- | ------------------------------------------------------- |
| `/status`                 | Server health, current project, session, and model info |
| `/stop`                   | Stop the current task                                   |
| `/sessions`               | Browse recent sessions                                  |
| `/session <n>`            | Select a session by number                              |
| `/session new`            | Create a new session                                    |
| `/session rename [title]` | Rename the current session                              |
| `/projects`               | Browse available projects                               |
| `/project <n>`            | Select a project by number                              |
| `/project <path>`         | Create/select a project by absolute path                |
| `/agents`                 | Browse available agents                                 |
| `/agent <n>`              | Select an agent by number                               |
| `/commands`               | Browse and run custom commands                          |
| `/command <n> [args]`     | Run a listed OpenCode command                           |
| `/auto_confirm [on\|off]` | Toggle permission auto-confirm for the current session  |
| `/task`                   | Create a scheduled task                                 |
| `/tasks`                  | Browse and delete scheduled tasks                       |
| `/permission`             | Show pending permission state                           |
| `/help`                   | Show available commands                                 |

Permission quick replies (all platforms):
| Command | Description                          |
| ------- | ------------------------------------ |
| `/1`    | Allow once                           |
| `/2`    | Always allow                         |
| `/3`    | Reject                               |

Any regular text message is sent as a prompt to the coding agent only when no blocking interaction is active.

### Platform-Specific Commands

| Platform        | Command     | Description                                     |
| --------------- | ----------- | ----------------------------------------------- |
| OpenClaw        | `/opencode` | Enter OpenCode mode for this conversation       |
| DingTalk/Feishu | `/exit`     | Stop the standalone bot process                 |
| OpenClaw        | `/exit`     | Leave OpenCode mode for this conversation       |

> **Note:** DingTalk and Feishu currently support text and markdown messages. Image, voice, and file messages will show a "not supported" notice.

Under normal usage, start `opencode serve` yourself before launching the standalone bot. OpenClaw users should send `/opencode` in the conversation before sending OpenCode commands or prompts.

### OpenClaw Plugin Setup

OpenClaw loads `./dist/openclaw-plugin.js` and reuses the same shared command, prompt, task, permission, and route-scoped state modules as DingTalk and Feishu. Use `/opencode` in a conversation to enter OpenCode mode. While active, OpenClaw commands and normal text are handled by OpenCode. Use `/exit` to leave OpenCode mode for that conversation.

Build the OpenClaw plugin entrypoint with either command below. The original OpenClawCode build script was `tsc`; in this merged repository the normal build compiles the standalone bot and the OpenClaw plugin together.

```bash
npm run build
# or, for an explicit plugin-oriented alias:
npm run build:openclaw
```

For local OpenClaw testing, install the built plugin with the migrated install script:

```bash
npm run openclaw:install -- local

# or link this working tree while iterating:
npm run openclaw:install -- link
```

After building, OpenClaw can discover the plugin from `package.json` under `openclaw.extensions`, from the `./openclaw-plugin` export, or from `openclaw.plugin.json` for runtimes that read plugin metadata files.

Example OpenClaw configuration:

```bash
openclaw config set plugins.entries.opencode-chat-bot.enabled true
```

## DingTalk Bot Setup

DingTalk uses **Stream Mode** (no webhook server required) for real-time message reception.

### Step 1: Create a DingTalk Robot

1. Log in to [DingTalk Developer Platform](https://open.dingtalk.com/)
2. Create an **Enterprise Internal Application** (企业内部应用)
3. Go to **Robot & Message** (机器人与消息推送) section
4. Create a **Stream Mode Robot** (Stream 模式机器人)

### Step 2: Get Credentials

From the application details page:

- **AppKey** → `DINGTALK_APP_KEY`
- **AppSecret** → `DINGTALK_APP_SECRET`

### Step 3: Configure User Access

Bot automatically locks to the first user who sends a message.

- **If unset**: Auto-lock to first user
- **If set**: Only matching user can access

Set `DINGTALK_ALLOWED_USER_ID` to pre-configure a specific DingTalk staff ID.

### Step 4: Configure Environment

Add to your `.env`:

```env
DINGTALK_APP_KEY=your-app-key
DINGTALK_APP_SECRET=your-app-secret
# DINGTALK_ALLOWED_USER_ID= (optional, auto-locks to first user if unset)
```

### Step 5: Test

1. Start the bot: `npm run dev`
2. Find the robot in DingTalk and send a message
3. Use `/status` to verify connection

### Proactive Messaging

The bot supports **proactive messaging** via DingTalk's `oToMessages/batchSend` API. This allows:

- **Scheduled task notifications** — receive alerts without sending a message first
- **Push notifications** — bot can message you proactively

**Permission Requirements:**

In DingTalk Developer Platform, ensure your app has:

- `ChatBot.SendMessage` — Send bot messages to users

If permissions are missing, the bot will fall back gracefully and log a warning.

> **Note:** DingTalk currently supports text and markdown messages. Image, voice, and file messages will show a "not supported" notice.

## Feishu Bot

Feishu uses **Stream Mode** for real-time message reception.

### Step 1: Create a Feishu Bot

1. Log in to [Feishu Developer Platform](https://open.feishu.cn/)
2. Create a **Custom App** (自定义应用)
3. Go to **Robot** (机器人) section and enable robot capability

### Step 2: Get Credentials

From the application details page:

- **App ID** → `FEISHU_APP_ID`
- **App Secret** → `FEISHU_APP_SECRET`

### Step 3: Configure User Access

Bot automatically locks to the first user who sends a message.

- **If unset**: Auto-lock to first user  
- **If set**: Only matching user can access

Set `FEISHU_ALLOWED_USER_ID` to pre-configure a specific Feishu user ID (open ID).

### Step 4: Configure Environment

Add to your `.env`:

```env
FEISHU_APP_ID=your-app-id
FEISHU_APP_SECRET=your-app-secret
# FEISHU_ALLOWED_USER_ID= (optional, auto-locks to first user if unset)
```

### Step 5: Test

1. Start the bot: `npm run dev`
2. Find the bot in Feishu and send a message
3. Use `/status` to verify connection

> **Note:** Feishu currently supports text and markdown-style post content. Image, file, audio, and media messages show a "not supported" notice.

## Scheduled Tasks

Scheduled tasks let you prepare prompts in advance and run them automatically later or on a recurring schedule. This is useful for periodic checks, routine code maintenance, or tasks you want OpenCode to execute while you are away from your computer. Use `/task` to create a scheduled task and `/tasks` to review or delete existing ones.

- Each task is created from the currently selected OpenCode project and model
- Scheduled executions currently always run with the `build` agent
- Tasks run outside your active chat session, so they do not interrupt or affect the current session flow
- The minimum recurring interval is 5 minutes
- Up to 10 scheduled tasks can exist at once by default; change this with `TASK_LIMIT` in your `.env`

## Configuration

### Localization

- Supported locales: `en`, `de`, `es`, `ru`, `zh`, `zh-TW`
- The setup wizard asks for language first
- You can change locale later with `BOT_LOCALE`

### Environment Variables

When installed via npm, the configuration wizard handles the initial setup. The `.env` file is stored in your platform's app data directory:

- **macOS:** `~/Library/Application Support/opencode-chat-bot/.env`
- **Windows:** `%APPDATA%\opencode-chat-bot\.env`
- **Linux:** `~/.config/opencode-chat-bot/.env`

| Variable                       | Description                                                                        | Required | Default                  |
| ------------------------------ | ---------------------------------------------------------------------------------- | :------: | ------------------------ |
| `DINGTALK_APP_KEY`             | DingTalk App Key                                                                   |   No\*   | —                        |
| `DINGTALK_APP_SECRET`          | DingTalk App Secret                                                                |   No\*   | —                        |
| `DINGTALK_ALLOWED_USER_ID`     | Locked DingTalk staff ID (unset = auto-lock)  |    No    | —                        |
| `FEISHU_APP_ID`                | Feishu App ID                                                                      |   No\*   | —                        |
| `FEISHU_APP_SECRET`            | Feishu App Secret                                                                  |   No\*   | —                        |
| `FEISHU_DOMAIN`                | Feishu API domain (`feishu` or compatible SDK domain)                              |    No    | `feishu`                 |
| `FEISHU_ALLOWED_USER_ID`       | Locked Feishu user ID (unset = auto-lock)     |    No    | —                        |
| `LOG_LEVEL`                    | Log level (`debug`, `info`, `warn`, `error`)                                       |    No    | `info`                   |
| `LOG_RETENTION`                | Number of log files to keep: launch files in `sources`, daily files in `installed` |    No    | `10`                     |

> **\*At least one standalone bot platform must be configured when running `opencode-chat-bot start`:** DingTalk (`DINGTALK_APP_KEY` + `DINGTALK_APP_SECRET`) or Feishu (`FEISHU_APP_ID` + `FEISHU_APP_SECRET`). OpenClaw is loaded separately by the OpenClaw plugin runtime.

> **Keep your `.env` file private.** It contains your bot tokens. Never commit it to version control.

Logs are written to `./logs` when running from sources and to the runtime config directory `logs/` folder in `installed` mode. Log rotation depends on runtime mode: `sources` creates one file per bot launch, while `installed` appends to one file per day. Old log files are removed according to `LOG_RETENTION`.

### Model Configuration

The model picker uses OpenCode local model state (`favorite` + `recent`):

- Favorites are shown first, then recent
- Models already in favorites are not duplicated in recent
- Current model is marked with `✅`
- Default model from `OPENCODE_MODEL_PROVIDER` + `OPENCODE_MODEL_ID` is always included in favorites

To add a model to favorites, open OpenCode TUI (`opencode`), go to model selection, and press **Cmd+F/Ctrl+F** on the model.

## Security

The bot enforces strict **user whitelists**:

- **DingTalk**: Auto-locked to first user, or matches `DINGTALK_ALLOWED_USER_ID` if pre-configured
- **Feishu**: Auto-locked to first user, or matches `FEISHU_ALLOWED_USER_ID` if pre-configured

Messages from unauthorized sources are silently ignored and logged.

Since the bot runs locally on your machine and connects to your local OpenCode server, there is no external attack surface beyond the platform APIs.

### Available Scripts

| Script                             | Description                          |
| ---------------------------------- | ------------------------------------ |
| `npm run dev`                      | Build and start (development)        |
| `npm run build`                    | Compile TypeScript                   |
| `npm run build:openclaw`           | Compile TypeScript for OpenClaw use  |
| `npm run openclaw:install -- help` | Show OpenClaw install script help    |
| `npm start`                        | Run compiled code                    |
| `npm run release:notes:preview`    | Preview auto-generated release notes |
| `npm run lint`                     | ESLint check (zero warnings policy)  |
| `npm run format`                   | Format code with Prettier            |
| `npm test`                         | Run tests (Vitest)                   |
| `npm run test:coverage`            | Tests with coverage report           |

> **Note:** No file watcher or auto-restart is used. The bot maintains persistent SSE and long-polling connections — automatic restarts would break them mid-task. After making changes, restart manually with `npm run dev`.

## Troubleshooting

**Bot doesn't respond to messages**

- Make sure user/channel ID matches your actual ID
- Verify the bot token/credentials are correct

**"OpenCode server is not available"**

- Ensure `opencode serve` is running in your project directory
- Check that `OPENCODE_API_URL` points to the correct address (default: `http://localhost:4096`)

**No models in model picker**

- Add models to your OpenCode favorites: open OpenCode TUI, go to model selection, press **Ctrl+F** on desired models
- Verify `OPENCODE_MODEL_PROVIDER` and `OPENCODE_MODEL_ID` point to an available model in your setup

**DingTalk not receiving messages**

- Verify robot is created with Stream Mode enabled
- Check `DINGTALK_APP_KEY` and `DINGTALK_APP_SECRET` are correct
- Ensure the robot is published and available to users

**Feishu not receiving messages**

- Verify bot is enabled and webhook URL is configured correctly
- Check `FEISHU_APP_ID` and `FEISHU_APP_SECRET` are correct
- Check `FEISHU_ALLOWED_USER_ID` if access is restricted
- Ensure the bot is published and available to users

**OpenClaw plugin does not respond**

- Build first with `npm run build:openclaw`
- Install or link locally with `npm run openclaw:install -- local` or `npm run openclaw:install -- link`
- Enable the plugin with `openclaw config set plugins.entries.opencode-chat-bot.enabled true`
- Send `/opencode` in the conversation before sending OpenCode commands or prompts
- Check scope filters in `channels`, `accountIds`, and `conversationIds`

**Linux: permission denied errors**

- Make sure the CLI binary has execute permission: `chmod +x $(which opencode-chat-bot)`
- Check that the config directory is writable: `~/.config/opencode-chat-bot/`

## Contributing

Please follow commit and release note conventions in [CONTRIBUTING.md](CONTRIBUTING.md).

## Community

Have questions, want to share your experience using the bot, or have an idea for a feature? Join the conversation in [GitHub Discussions](https://github.com/luoyingwen/opencode-chat-bot/discussions).

## License

[MIT](LICENSE) © Tony Lee
