# OpenCode Telegram, Slack, DingTalk Bot

fork from <https://github.com/grinev/opencode-telegram-bot>

新增：支援 Slack, DingTalk, proxy, zh-TW

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

OpenCode Bot is a secure multi-platform client for [OpenCode](https://opencode.ai) CLI that runs on your local machine. Supports **Telegram**, **Slack**, and **DingTalk**.

Run AI coding tasks, monitor progress, switch models, and manage sessions from your phone.

No open ports, no exposed APIs. The bot communicates with your local OpenCode server and the platform APIs only.

Scheduled tasks support. Turns the bot into a lightweight OpenClaw alternative for OpenCode users.

Platforms: macOS, Windows, Linux

Languages: English (`en`), Deutsch (`de`), Español (`es`), Русский (`ru`), 简体中文 (`zh`), 繁體中文 (`zh-TW`)

[Demo gif](assets/screencast.gif)

## Features

- **Multi-platform support** — works with Telegram, Slack, and DingTalk simultaneously or individually
- **Remote coding** — send prompts to OpenCode from anywhere, receive complete results with code sent as files
- **Session management** — create new sessions or continue existing ones, just like in the TUI
- **Live status** — pinned message with current project, model, context usage, and changed files list, updated in real time
- **Model switching** — pick models from OpenCode favorites and recent history directly in the chat (favorites are shown first)
- **Agent modes** — switch between Plan and Build modes on the fly
- **Subagent activity** — watch live subagent progress in chat, including the current task, agent, model, and active tool step
- **Custom Commands** — run OpenCode custom commands (and built-ins like `init`/`review`) from an inline menu with confirmation
- **Interactive Q&A** — answer agent questions and approve permissions via inline buttons
- **Voice prompts** — send voice/audio messages, transcribe them via a Whisper-compatible API, and optionally enable spoken replies with `/tts` (Telegram only)
- **File attachments** — send images, PDF documents, and any text-based files to OpenCode (code, logs, configs etc.)
- **Scheduled tasks** — schedule prompts to run later or on a recurring interval; see [Scheduled Tasks](#scheduled-tasks)
- **Context control** — compact context when it gets too large, right from the chat
- **Input flow control** — when an interactive flow is active, the bot accepts only relevant input to keep context consistent and avoid accidental actions
- **Security** — strict user/channel whitelist; no one else can access your bot
- **Localization** — UI localization is supported for multiple languages (`BOT_LOCALE`)

Planned features currently in development are listed in [Current Task List](PRODUCT.md#current-task-list).

## Prerequisites

- **Node.js 20+** — [download](https://nodejs.org)
- **OpenCode** — install from [opencode.ai](https://opencode.ai) or [GitHub](https://github.com/sst/opencode)
- **Bot Platform** — at least one of:
  - Telegram Bot (create one during setup)
  - Slack App (see [Slack Bot](#slack-bot))
  - DingTalk Robot (see [DingTalk Bot](#dingtalk-bot))

## Quick Start

### 1. Create a Bot

#### Telegram Bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram and send `/newbot`
2. Follow the prompts to choose a name and username
3. Copy the **bot token** you receive (e.g. `123456:ABC-DEF1234...`)

You'll also need your **Telegram User ID** — send any message to [@userinfobot](https://t.me/userinfobot) and it will reply with your numeric ID.

#### Slack Bot

See [Slack Bot Setup Guide](./slack_bot.md) for detailed instructions on creating a Slack App and obtaining:

- `SLACK_BOT_TOKEN` (xoxb-...)
- `SLACK_APP_TOKEN` (xapp-...)
- `SLACK_SIGNING_SECRET`

#### DingTalk Bot

See [DingTalk Bot Setup Guide](#dingtalk-bot) below for instructions on creating a DingTalk Robot and obtaining:

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

> Quick start is for npm usage. You do not need to clone this repository. If you run this command from the source directory (repository root), it may fail with `opencode-telegram: not found`. To run from sources, use the [Development](#development) section.

On first launch, an interactive wizard will guide you through the configuration — it asks for interface language first, then your bot token(s), user ID(s), OpenCode API URL, and optional OpenCode server credentials (username/password). After that, you're ready to go. Open your bot and start sending tasks.

#### Alternative: Global Install

```bash
git clone https://github.com/bigheadfjuee/opencode-telegram-slack-bot.git
cd opencode-telegram-slack-bot
npm install
cp .env.example .env
# Edit .env with your bot tokens, user IDs, and model settings
```

Build and run:

```bash
npm run dev
```

## Supported Platforms (Node.js)

| Platform | Status                                       |
| -------- | -------------------------------------------- |
| macOS    | Fully supported                              |
| Windows  | Fully supported                              |
| Linux    | Fully supported (tested on Ubuntu 24.04 LTS) |

## Bot Commands

### Telegram Commands

| Command           | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `/status`         | Server health, current project, session, and model info |
| `/new`            | Create a new session                                    |
| `/abort`          | Abort the current task                                  |
| `/sessions`       | Browse and switch between recent sessions               |
| `/projects`       | Switch between OpenCode projects                        |
| `/tts`            | Toggle audio replies                                    |
| `/rename`         | Rename the current session                              |
| `/commands`       | Browse and run custom commands                          |
| `/task`           | Create a scheduled task                                 |
| `/tasklist`       | Browse and delete scheduled tasks                       |
| `/opencode_start` | Start the OpenCode server remotely                      |
| `/opencode_stop`  | Stop the OpenCode server remotely                       |
| `/help`           | Show available commands                                 |

### Slack / DingTalk Commands

| Command           | Description                                             |
| ----------------- | ------------------------------------------------------- |
| `/status`         | Server health, current project, session, and model info |
| `/new`            | Create a new session                                    |
| `/stop`           | Stop the current task (DingTalk/Slack equivalent)       |
| `/sessions`       | Browse recent sessions                                  |
| `/session <n>`    | Select a session by number                              |
| `/projects`       | Browse available projects                               |
| `/project <n>`    | Select a project by number                              |
| `/rename`         | Rename the current session                              |
| `/commands`       | Browse and run custom commands                          |
| `/task`           | Create a scheduled task                                 |
| `/tasklist`       | Browse and delete scheduled tasks                       |
| `/opencode_start` | Start the OpenCode server remotely                      |
| `/opencode_stop`  | Stop the OpenCode server remotely                       |
| `/help`           | Show available commands                                 |

Any regular text message is sent as a prompt to the coding agent only when no blocking interaction is active. Voice/audio messages are transcribed and then sent as prompts when STT is configured (Telegram only).

> `/opencode_start` and `/opencode_stop` are intended as emergency commands — for example, if you need to restart a stuck server while away from your computer. Under normal usage, start `opencode serve` yourself before launching the bot.

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

- **macOS:** `~/Library/Application Support/opencode-telegram-bot/.env`
- **Windows:** `%APPDATA%\opencode-telegram-bot\.env`
- **Linux:** `~/.config/opencode-telegram-bot/.env`

| Variable                        | Description                                                                                    | Required | Default                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------- | :------: | ------------------------ |
| `TELEGRAM_BOT_TOKEN`            | Bot token from @BotFather                                                                      |   No\*   | —                        |
| `TELEGRAM_ALLOWED_USER_ID`      | Your numeric Telegram user ID                                                                  |    No    | —                        |
| `TELEGRAM_PROXY_URL`            | Proxy URL for Telegram API (SOCKS5/HTTP)                                                       |    No    | —                        |
| `SLACK_BOT_TOKEN`               | Slack Bot Token (xoxb-...)                                                                     |   No\*   | —                        |
| `SLACK_APP_TOKEN`               | Slack App Token for Socket Mode (xapp-...)                                                     |   No\*   | —                        |
| `SLACK_SIGNING_SECRET`          | Slack App Signing Secret                                                                       |    No    | —                        |
| `SLACK_ALLOWED_CHANNEL_ID`      | Allowed Slack channel ID                                                                       |    No    | —                        |
| `SLACK_PROXY_URL`               | Proxy URL for Slack API                                                                        |    No    | —                        |
| `DINGTALK_APP_KEY`              | DingTalk App Key                                                                               |   No\*   | —                        |
| `DINGTALK_APP_SECRET`           | DingTalk App Secret                                                                            |   No\*   | —                        |
| `DINGTALK_AGENT_ID`             | DingTalk Agent ID                                                                              |    No    | —                        |
| `DINGTALK_ALLOWED_USER_ID`      | Allowed DingTalk staff ID                                                                      |    No    | —                        |
| `DINGTALK_DEBUG`                | Enable DingTalk SDK debug logs                                                                 |    No    | `false`                  |
| `OPENCODE_API_URL`              | OpenCode server URL                                                                            |    No    | `http://localhost:4096`  |
| `OPENCODE_SERVER_USERNAME`      | Server auth username                                                                           |    No    | `opencode`               |
| `OPENCODE_SERVER_PASSWORD`      | Server auth password                                                                           |    No    | —                        |
| `OPENCODE_MODEL_PROVIDER`       | Default model provider                                                                         |   Yes    | `opencode`               |
| `OPENCODE_MODEL_ID`             | Default model ID                                                                               |   Yes    | `big-pickle`             |
| `BOT_LOCALE`                    | Bot UI language (e.g. `en`, `de`, `es`, `ru`, `zh`, `zh-TW`)                                   |    No    | `en`                     |
| `SESSIONS_LIST_LIMIT`           | Sessions per page in `/sessions`                                                               |    No    | `10`                     |
| `PROJECTS_LIST_LIMIT`           | Projects per page in `/projects`                                                               |    No    | `10`                     |
| `COMMANDS_LIST_LIMIT`           | Commands per page in `/commands`                                                               |    No    | `10`                     |
| `TASK_LIMIT`                    | Maximum scheduled tasks at once                                                                |    No    | `10`                     |
| `BASH_TOOL_DISPLAY_MAX_LENGTH`  | Max displayed length for bash tool commands (truncated if longer)                              |    No    | `128`                    |
| `SERVICE_MESSAGES_INTERVAL_SEC` | Service messages interval (thinking + tool calls); `>=2` to avoid rate limits, `0` = immediate |    No    | `5`                      |
| `HIDE_THINKING_MESSAGES`        | Hide `💭 Thinking...` service messages                                                         |    No    | `false`                  |
| `HIDE_TOOL_CALL_MESSAGES`       | Hide tool-call service messages (`💻 bash ...`, `📖 read ...`, etc.)                           |    No    | `false`                  |
| `RESPONSE_STREAMING`            | Stream assistant replies while generated                                                       |    No    | `true`                   |
| `RESPONSE_STREAM_THROTTLE_MS`   | Stream edit throttle (ms) for updates                                                          |    No    | `500`                    |
| `MESSAGE_FORMAT_MODE`           | Assistant reply formatting: `markdown` (Telegram MarkdownV2) or `raw`                          |    No    | `markdown`               |
| `CODE_FILE_MAX_SIZE_KB`         | Max file size (KB) to send as document                                                         |    No    | `100`                    |
| `STT_API_URL`                   | Whisper-compatible API base URL (enables voice transcription)                                  |    No    | —                        |
| `STT_API_KEY`                   | API key for STT provider                                                                       |    No    | —                        |
| `STT_MODEL`                     | STT model name                                                                                 |    No    | `whisper-large-v3-turbo` |
| `STT_LANGUAGE`                  | Optional language hint for STT                                                                 |    No    | —                        |
| `TTS_API_URL`                   | TTS API base URL                                                                               |    No    | —                        |
| `TTS_API_KEY`                   | TTS API key                                                                                    |    No    | —                        |
| `TTS_MODEL`                     | TTS model name                                                                                 |    No    | `gpt-4o-mini-tts`        |
| `TTS_VOICE`                     | OpenAI-compatible TTS voice name                                                               |    No    | `alloy`                  |
| `LOG_LEVEL`                     | Log level (`debug`, `info`, `warn`, `error`)                                                   |    No    | `info`                   |

> **\*At least one platform must be configured:** Telegram (`TELEGRAM_BOT_TOKEN`), Slack (`SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN`), or DingTalk (`DINGTALK_APP_KEY` + `DINGTALK_APP_SECRET`).

> **Keep your `.env` file private.** It contains your bot tokens. Never commit it to version control.

### Voice and Audio Transcription (Optional - Telegram Only)

If `STT_API_URL` and `STT_API_KEY` are set, the bot will:

1. Accept `voice` and `audio` Telegram messages
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

The bot enforces strict **user/channel whitelists**:

- **Telegram:** Only the user whose ID matches `TELEGRAM_ALLOWED_USER_ID` can interact
- **Slack:** Only messages from `SLACK_ALLOWED_CHANNEL_ID` are processed
- **DingTalk:** Only the user whose staff ID matches `DINGTALK_ALLOWED_USER_ID` can interact (if set)

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

**Linux: permission denied errors**

- Make sure the CLI binary has execute permission: `chmod +x $(which opencode-telegram)`
- Check that the config directory is writable: `~/.config/opencode-telegram-bot/`

## Contributing

Please follow commit and release note conventions in [CONTRIBUTING.md](CONTRIBUTING.md).

## Community

Have questions, want to share your experience using the bot, or have an idea for a feature? Join the conversation in [GitHub Discussions](https://github.com/bigheadfjuee/opencode-telegram-slack-bot/discussions).

## License

[MIT](LICENSE) © Tony Lee
