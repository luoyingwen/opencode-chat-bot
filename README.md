# OpenCode DingTalk, Feishu Bot

fork from <https://github.com/grinev/opencode-chat-bot>

新增：支援 DingTalk, Feishu, proxy, zh-TW, 文件日志

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

OpenCode Bot is a secure multi-platform client for [OpenCode](https://opencode.ai) CLI that runs on your local machine. Supports **DingTalk**, **Feishu**, and **OpenClaw**.

Run AI coding tasks, monitor progress, switch models, and manage sessions from your phone.

No open ports, no exposed APIs. The bot communicates with your local OpenCode server and the platform APIs only.

Scheduled tasks support. Turns the bot into a lightweight OpenClaw alternative for OpenCode users.

Platforms: macOS, Windows, Linux

Languages: English (`en`), Deutsch (`de`), Español (`es`), Русский (`ru`), 简体中文 (`zh`), 繁體中文 (`zh-TW`)

[Demo gif](assets/screencast.gif)

## Features

- **Multi-platform support** — works with DingTalk and Feishu as standalone bots, plus OpenClaw through a plugin entrypoint
- **Remote coding** — send prompts to OpenCode from anywhere, receive complete results with code sent as files
- **Session management** — create new sessions or continue existing ones, just like in the TUI
- **Live status** — pinned message with current project, model, context usage, and changed files list, updated in real time
- **Model switching** — pick models from OpenCode favorites and recent history directly in the chat (favorites are shown first)
- **Agent modes** — switch between Plan and Build modes on the fly
- **Subagent activity** — watch live subagent progress in chat, including the current task, agent, model, and active tool step
- **Custom Commands** — run OpenCode custom commands (and built-ins like `init`/`review`) from an inline menu with confirmation
- **Interactive Q&A** — answer agent questions and approve permissions via inline buttons
- **Voice prompts** — voice/audio messages can be transcribed via a Whisper-compatible API when the platform supports them
- **File attachments** — send images, PDF documents, and any text-based files to OpenCode (code, logs, configs etc.)
- **Scheduled tasks** — schedule prompts to run later or on a recurring interval; see [Scheduled Tasks](#scheduled-tasks)
- **Context control** — compact context when it gets too large, right from the chat
- **Input flow control** — when an interactive flow is active, the bot accepts only relevant input to keep context consistent and avoid accidental actions
- **Security** — strict user whitelist; no one else can access your bot
- **Localization** — UI localization is supported for multiple languages (`BOT_LOCALE`)
- **File logging** — logs are written to files with automatic rotation and retention

Planned features currently in development are listed in [Current Task List](PRODUCT.md#current-task-list).

## Prerequisites

- **Node.js 20+** — [download](https://nodejs.org)
- **OpenCode** — install from [opencode.ai](https://opencode.ai) or [GitHub](https://github.com/sst/opencode)
- **Bot Platform** — at least one of:
  - DingTalk Robot (see [DingTalk Bot](#dingtalk-bot))
  - Feishu Bot (see [Feishu Bot](#feishu-bot))
  - OpenClaw plugin runtime (see [OpenClaw Plugin Commands](#openclaw-plugin-commands))

## Quick Start

### 1. Create a Bot

#### Feishu Bot

See [Feishu Bot Setup Guide](#feishu-bot) below for instructions on creating a Feishu bot application and obtaining:

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_ENCRYPT_KEY` (optional)

- `DINGTALK_APP_KEY`
- `DINGTALK_APP_SECRET`
- `DINGTALK_AGENT_ID` (optional)

### 2. Start OpenCode Server

Start the OpenCode server:

```bash
opencode serve
```

> The bot connects to the OpenCode API at `http://localhost:4096` by default.

### 3. Development

> Quick start is for npm usage. You do not need to clone this repository. If you run this command from the source directory (repository root), it may fail with `opencode-bot: not found`. To run from sources, use the [Development](#development) section.

On first launch, an interactive wizard will guide you through the configuration — it asks for interface language first, then your bot token(s), user ID(s), OpenCode API URL, and optional OpenCode server credentials (username/password). After that, you're ready to go. Open your bot and start sending tasks.

#### Alternative: Global Install

```bash
git clone https://github.com/bigheadfjuee/opencode-chat-bot.git
cd opencode-chat-bot
npm install
cp .env.example .env
# Edit .env with your bot credentials, user IDs, and model settings
```

Build and run:

```bash
npm run dev
```

> Built-in daemon mode is intended for standalone npm installs without an external supervisor. For `systemd`, `pm2`, or Docker, keep using `opencode-bot start` without `--daemon`.

For Linux `systemd` setup, see [`docs/LINUX_SYSTEMD_SETUP.md`](./docs/LINUX_SYSTEMD_SETUP.md).

To reconfigure at any time:

```bash
opencode-bot config
```

## Supported Platforms (Node.js)

| Platform | Status                                       |
| -------- | -------------------------------------------- |
| macOS    | Fully supported                              |
| Windows  | Fully supported                              |
| Linux    | Fully supported (tested on Ubuntu 24.04 LTS) |

## Bot Commands

### DingTalk / Feishu Commands

| Command                   | Description                                             |
| ------------------------- | ------------------------------------------------------- |
| `/status`                 | Server health, current project, session, and model info |
| `/session new`            | Create a new session                                    |
| `/stop`                   | Stop the current task                                   |
| `/sessions`               | Browse recent sessions                                  |
| `/session <n>`            | Select a session by number                              |
| `/projects`               | Browse available projects                               |
| `/project <n>`            | Select a project by number                              |
| `/project <path>`         | Create/select a project by path (DingTalk/Feishu only)  |
| `/agents`                 | Browse available agents                                 |
| `/agent <n>`              | Select an agent by number                               |
| `/session rename [title]` | Rename the current session                              |
| `/commands`               | Browse and run custom commands                          |
| `/task`                   | Create a scheduled task                                 |
| `/tasklist`               | Browse and delete scheduled tasks                       |
| `/opencode_start`         | Start the OpenCode server remotely                      |
| `/opencode_stop`          | Stop the OpenCode server remotely                       |
| `/help`                   | Show available commands                                 |

Any regular text message is sent as a prompt to the coding agent only when no blocking interaction is active.

> **Note:** DingTalk and Feishu currently support text and markdown messages. Image, voice, and file messages will show a "not supported" notice.

> `/opencode_start` and `/opencode_stop` are intended as emergency commands — for example, if you need to restart a stuck server while away from your computer. Under normal usage, start `opencode serve` yourself before launching the bot.

### OpenClaw Plugin Commands

OpenClaw loads `./dist/openclaw-plugin.js` and reuses the same shared command, prompt, task, permission, and route-scoped state modules as DingTalk and Feishu. Use `/opencode` in a conversation to enter OpenCode mode, then send commands or regular prompts. Use `/exit` to leave OpenCode mode.

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

After building, configure OpenClaw to load `./dist/openclaw-plugin.js` from this package. The same path is declared in `package.json` under `openclaw.extensions`, exported as `./openclaw-plugin`, and described by `openclaw.plugin.json` for runtimes that read plugin metadata files.

| Command                     | Description                                    |
| --------------------------- | ---------------------------------------------- | -------------------------- |
| `/opencode`                 | Enter OpenCode mode for the conversation       |
| `/exit`                     | Leave OpenCode mode                            |
| `/status`                   | Server health, current project, session, model |
| `/projects`                 | Browse available projects                      |
| `/project <n                | path>`                                         | Select or create a project |
| `/sessions`                 | Browse recent sessions                         |
| `/session <n>`              | Select a session                               |
| `/session new` or `/new`    | Create a new session                           |
| `/rename [title]`           | Rename the current session                     |
| `/agents`, `/agent <n>`     | List or select agents                          |
| `/models`, `/model <n>`     | List or select models                          |
| `/commands`, `/command <n>` | Browse or run OpenCode commands                |
| `/task`, `/tasklist`        | Create or manage scheduled tasks               |
| `/stop` or `/abort`         | Abort current task or cancel active flow       |

OpenClaw plugin config can restrict the adapter by channel, account, or conversation. Environment fallback values are available as `OPENCLAW_ENABLED`, `OPENCLAW_CHANNELS`, `OPENCLAW_ACCOUNT_IDS`, and `OPENCLAW_CONVERSATION_IDS`; OpenClaw runtime plugin config takes precedence.

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
- **AgentId** (optional) → `DINGTALK_AGENT_ID`

### Step 3: Configure User Access

Set `DINGTALK_ALLOWED_USER_ID` to restrict access to a specific DingTalk user ID (staff ID). If not set, all users who can message the robot will be allowed.

### Step 4: Configure Environment

Add to your `.env`:

```env
DINGTALK_APP_KEY=your-app-key
DINGTALK_APP_SECRET=your-app-secret
DINGTALK_AGENT_ID=your-agent-id
DINGTALK_ALLOWED_USER_ID=your-staff-id
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

Feishu uses **Webhook Mode** for real-time message reception.

### Step 1: Create a Feishu Bot

1. Log in to [Feishu Developer Platform](https://open.feishu.cn/)
2. Create a **Custom App** (自定义应用)
3. Go to **Robot** (机器人) section and enable robot capability

### Step 2: Get Credentials

From the application details page:

- **App ID** → `FEISHU_APP_ID`
- **App Secret** → `FEISHU_APP_SECRET`
- **Encrypt Key** (optional) → `FEISHU_ENCRYPT_KEY`

### Step 3: Configure User Access

Set `FEISHU_ALLOWED_USER_ID` to restrict access to a specific Feishu user ID (open ID). If not set, all users who can message the bot will be allowed.

### Step 4: Configure Environment

Add to your `.env`:

```env
FEISHU_APP_ID=your-app-id
FEISHU_APP_SECRET=your-app-secret
FEISHU_ENCRYPT_KEY=your-encrypt-key
FEISHU_ALLOWED_USER_ID=your-user-id
```

### Step 5: Test

1. Start the bot: `npm run dev`
2. Find the bot in Feishu and send a message
3. Use `/status` to verify connection

> **Note:** Feishu currently supports text and markdown messages. Image, voice, and file messages will show a "not supported" notice.

## Scheduled Tasks

Scheduled tasks let you prepare prompts in advance and run them automatically later or on a recurring schedule. This is useful for periodic checks, routine code maintenance, or tasks you want OpenCode to execute while you are away from your computer. Use `/task` to create a scheduled task and `/tasklist` to review or delete existing ones.

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

| Variable                        | Description                                                                                    | Required | Default                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | :------: | ------------------------ |
| `DINGTALK_APP_KEY`              | DingTalk App Key                                                                               |   No\*   | —                        |
| `DINGTALK_APP_SECRET`           | DingTalk App Secret                                                                            |   No\*   | —                        |
| `DINGTALK_AGENT_ID`             | DingTalk Agent ID                                                                              |    No    | —                        |
| `DINGTALK_ALLOWED_USER_ID`      | Allowed DingTalk staff ID                                                                      |    No    | —                        |
| `DINGTALK_DEBUG`                | Enable DingTalk SDK debug logs                                                                 |    No    | `false`                  |
| `FEISHU_APP_ID`                 | Feishu App ID                                                                                  |   No\*   | —                        |
| `FEISHU_APP_SECRET`             | Feishu App Secret                                                                              |   No\*   | —                        |
| `FEISHU_ENCRYPT_KEY`            | Feishu Encrypt Key                                                                             |    No    | —                        |
| `FEISHU_ALLOWED_USER_ID`        | Allowed Feishu user ID                                                                         |    No    | —                        |
| `OPENCODE_API_URL`              | OpenCode server URL                                                                            |    No    | `http://localhost:4096`  |
| `OPENCODE_SERVER_USERNAME`      | Server auth username                                                                           |    No    | `opencode`               |
| `OPENCODE_SERVER_PASSWORD`      | Server auth password                                                                           |    No    | —                        |
| `OPENCODE_MODEL_PROVIDER`       | Default model provider                                                                         |   Yes    | `opencode`               |
| `OPENCODE_MODEL_ID`             | Default model ID                                                                               |   Yes    | `big-pickle`             |
| `BOT_LOCALE`                    | Bot UI language (e.g. `en`, `de`, `es`, `ru`, `zh`, `zh-TW`)                                   |    No    | `en`                     |
| `SESSIONS_LIST_LIMIT`           | Sessions per page in `/sessions`                                                               |    No    | `10`                     |
| `PROJECTS_LIST_LIMIT`           | Projects per page in `/projects`                                                               |    No    | `10`                     |
| `OPEN_BROWSER_ROOTS`            | Comma-separated paths `/open` is allowed to browse (supports `~`)                              |    No    | `~` (home directory)     |
| `COMMANDS_LIST_LIMIT`           | Commands per page in `/commands`                                                               |    No    | `10`                     |
| `TASK_LIMIT`                    | Maximum scheduled tasks at once                                                                |    No    | `10`                     |
| `BASH_TOOL_DISPLAY_MAX_LENGTH`  | Max displayed length for bash tool commands (truncated if longer)                              |    No    | `128`                    |
| `SERVICE_MESSAGES_INTERVAL_SEC` | Service messages interval (thinking + tool calls); `>=2` to avoid rate limits, `0` = immediate |    No    | `5`                      |
| `HIDE_THINKING_MESSAGES`        | Hide `💭 Thinking...` service messages                                                         |    No    | `false`                  |
| `HIDE_TOOL_CALL_MESSAGES`       | Hide tool-call service messages (`💻 bash ...`, `📖 read ...`, etc.)                           |    No    | `false`                  |
| `HIDE_TOOL_FILE_MESSAGES`       | Hide file edit documents sent as `.txt` attachments (`edit_*.txt`, `write_*.txt`)              |    No    | `false`                  |
| `RESPONSE_STREAMING`            | Stream assistant replies while generated                                                       |    No    | `true`                   |
| `RESPONSE_STREAM_THROTTLE_MS`   | Stream edit throttle (ms) for updates                                                          |    No    | `500`                    |
| `MESSAGE_FORMAT_MODE`           | Assistant reply formatting: `markdown` (MarkdownV2) or `raw`                                   |    No    | `markdown`               |
| `CODE_FILE_MAX_SIZE_KB`         | Max file size (KB) to send as document                                                         |    No    | `100`                    |
| `STT_API_URL`                   | Whisper-compatible API base URL (enables voice transcription)                                  |    No    | —                        |
| `STT_API_KEY`                   | API key for STT provider                                                                       |    No    | —                        |
| `STT_MODEL`                     | STT model name                                                                                 |    No    | `whisper-large-v3-turbo` |
| `STT_LANGUAGE`                  | Optional language hint for STT                                                                 |    No    | —                        |
| `TTS_API_URL`                   | TTS API base URL                                                                               |    No    | —                        |
| `TTS_API_KEY`                   | TTS API key                                                                                    |    No    | —                        |
| `TTS_MODEL`                     | TTS model name passed to `/audio/speech`                                                       |    No    | `gpt-4o-mini-tts`        |
| `TTS_VOICE`                     | OpenAI-compatible TTS voice name                                                               |    No    | `alloy`                  |
| `LOG_LEVEL`                     | Log level (`debug`, `info`, `warn`, `error`)                                                   |    No    | `info`                   |
| `LOG_RETENTION`                 | Number of log files to keep: launch files in `sources`, daily files in `installed`             |    No    | `10`                     |

> **\*At least one platform must be configured:** DingTalk (`DINGTALK_APP_KEY` + `DINGTALK_APP_SECRET`) or Feishu (`FEISHU_APP_ID` + `FEISHU_APP_SECRET`).

> **Keep your `.env` file private.** It contains your bot tokens. Never commit it to version control.

Logs are written to `./logs` when running from sources and to the runtime config directory `logs/` folder in `installed` mode. Log rotation depends on runtime mode: `sources` creates one file per bot launch, while `installed` appends to one file per day. Old log files are removed according to `LOG_RETENTION`.

### Voice and Audio Transcription (Optional)

If `STT_API_URL` and `STT_API_KEY` are set, the bot will:

1. Accept supported voice and audio messages
2. Transcribe them via `POST {STT_API_URL}/audio/transcriptions`
3. Show recognized text in chat
4. Send the recognized text to OpenCode as a normal prompt

If TTS credentials are configured, you can toggle spoken replies globally with `/tts`. The preference is stored in `settings.json` and persists across restarts.

TTS configuration example:

```env
TTS_API_URL=https://api.openai.com/v1
TTS_API_KEY=your-tts-api-key
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=alloy
```

Supported provider examples (Whisper-compatible):

- **OpenAI**
  - `STT_API_URL=https://api.openai.com/v1`
  - `STT_MODEL=whisper-1`
- **Groq**
  - `STT_API_URL=https://api.groq.com/openai/v1`
  - `STT_MODEL=whisper-large-v3-turbo`
- **Together**
  - `STT_API_URL=https://api.together.xyz/v1`
  - `STT_MODEL=openai/whisper-large-v3`

If STT variables are not set, voice/audio transcription is disabled and the bot will ask you to configure STT.

### Model Configuration

The model picker uses OpenCode local model state (`favorite` + `recent`):

- Favorites are shown first, then recent
- Models already in favorites are not duplicated in recent
- Current model is marked with `✅`
- Default model from `OPENCODE_MODEL_PROVIDER` + `OPENCODE_MODEL_ID` is always included in favorites

To add a model to favorites, open OpenCode TUI (`opencode`), go to model selection, and press **Cmd+F/Ctrl+F** on the model.

## Security

The bot enforces strict **user whitelists**:

- **DingTalk:** Only the user whose staff ID matches `DINGTALK_ALLOWED_USER_ID` can interact (if set)
- **Feishu:** Only the user whose open ID matches `FEISHU_ALLOWED_USER_ID` can interact (if set)

Messages from unauthorized sources are silently ignored and logged.

Since the bot runs locally on your machine and connects to your local OpenCode server, there is no external attack surface beyond the platform APIs.

### Available Scripts

| Script                          | Description                          |
| ------------------------------- | ------------------------------------ |
| `npm run dev`                   | Build and start (development)        |
| `npm run build`                 | Compile TypeScript                   |
| `npm start`                     | Run compiled code                    |
| `npm run release:notes:preview` | Preview auto-generated release notes |
| `npm run lint`                  | ESLint check (zero warnings policy)  |
| `npm run format`                | Format code with Prettier            |
| `npm test`                      | Run tests (Vitest)                   |
| `npm run test:coverage`         | Tests with coverage report           |

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
- Ensure the bot is published and available to users

**Linux: permission denied errors**

- Make sure the CLI binary has execute permission: `chmod +x $(which opencode-bot)`
- Check that the config directory is writable: `~/.config/opencode-chat-bot/`

## Contributing

Please follow commit and release note conventions in [CONTRIBUTING.md](CONTRIBUTING.md).

## Community

Have questions, want to share your experience using the bot, or have an idea for a feature? Join the conversation in [GitHub Discussions](https://github.com/bigheadfjuee/opencode-chat-bot/discussions).

## License

[MIT](LICENSE) © Tony Lee
