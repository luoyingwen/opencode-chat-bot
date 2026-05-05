# Linux systemd setup

This guide covers setting up the OpenCode Chat Bot with systemd on Linux.

**Supported Platforms:** This setup works for all supported platforms (DingTalk, Feishu). Make sure you have configured at least one platform in your `.env` file before starting the service.

## 1. Install and configure the bot

```bash
npm install -g @luoyingwen/opencode-chat-bot@latest
opencode-chat-bot config
```

## 2. Get the required paths

```bash
which node
which opencode-chat-bot
dirname "$(which node)"
```

Use these values in the service file:

- `<USER>`: your Linux user
- `<NODE_PATH>`: output of `which node`
- `<OPENCODE_BOT_PATH>`: output of `which opencode-chat-bot`
- `<NODE_BIN_DIR>`: output of `dirname "$(which node)"`

## 3. Create the service file

Create `/etc/systemd/system/opencode-chat-bot.service`:

```ini
[Unit]
Description=OpenCode Chat Bot
After=network.target

[Service]
Type=simple
User=<USER>
Environment=PATH=<NODE_BIN_DIR>:/usr/local/bin:/usr/bin:/bin
ExecStart=<NODE_PATH> <OPENCODE_BOT_PATH> start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Run the bot in foreground mode. Do not use `--daemon` under `systemd`.

## 4. Enable and start the service

```bash
sudo systemctl daemon-reload
sudo systemctl enable opencode-chat-bot
sudo systemctl start opencode-chat-bot
sudo systemctl status opencode-chat-bot
```

## 5. View logs

```bash
sudo journalctl -u opencode-chat-bot -f
```

## Example

This is a working example for an `nvm`-based setup:

`ExecStart` does not include `start` here because `start` is the default CLI command.

```ini
[Unit]
Description=OpenCode Chat Bot
After=network.target

[Service]
Type=simple
User=admin
Environment=PATH=/home/admin/.nvm/versions/node/v20.20.2/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/home/admin/.nvm/versions/node/v20.20.2/bin/node /home/admin/.nvm/versions/node/v20.20.2/bin/opencode-chat-bot
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

