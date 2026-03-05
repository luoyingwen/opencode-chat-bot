# Slack Bot 設定指南 (GPT)

## Prompt:

設定 slack bot 和取得 bot\_token, app\_token 的方法

## Response:

要建立一個 **Slack Bot** 並取得 `bot_token` (xoxb-…) 與 `app_token` (xapp-…)，可以依照以下完整流程進行。

---

# 一、建立 Slack App

1. 打開\
   <https://api.slack.com/apps>
2. 點擊 **Create New App**
3. 選擇\
   **From scratch**
4. 填寫：
   - **App Name**：例如 `my-slack-bot`
   - **Workspace**：選擇要安裝的 workspace

建立後會進入 App 設定頁。

---

# 二、設定 Bot 使用權限 (OAuth Scope)

左側選單：

**OAuth & Permissions**

在 **Bot Token Scopes** 新增權限，例如：

常見 Bot 權限：

| Scope               | 用途              |
| ------------------- | --------------- |
| `chat:write`        | 發送訊息            |
| `channels:read`     | 讀取 channel      |
| `channels:history`  | 讀取 channel 訊息   |
| `groups:read`       | private channel |
| `im:read`           | 讀取 DM           |
| `im:write`          | 發送 DM           |
| `app_mentions:read` | 接收 @bot         |

最基本通常只需要：

```
chat:write
app_mentions:read
```

---

# 三、安裝 App 到 Workspace

在 **OAuth & Permissions** 頁面

點擊：

```
Install to Workspace
```

授權完成後會看到：

```
Bot User OAuth Token
```

例如：

```
xoxb-1234567890-xxxxxxxxxxxx
```

這就是 **bot\_token**

---

# 四、取得 App Token (Socket Mode)

如果你的 bot **不想開 public webhook server**，建議使用 **Socket Mode**

## 1 開啟 Socket Mode

左側選單：

```
Socket Mode
```

打開：

```
Enable Socket Mode
```

---

## 2 建立 App Token

按：

```
Generate Token and Scopes
```

設定：

Token Name

```
socket-token
```

Scopes：

```
connections:write
```

產生後會得到：

```
xapp-1-xxxxxx
```

這就是 **app\_token**

---

# 五、建立 Bot User

左側：

```
App Home
```

設定：

```
App Display Name
Bot Username
```

例如：

```
copilot-bot
```

---

# 六、訂閱 Events (讓 Bot 接收訊息)

左側：

```
Event Subscriptions
```

開啟：

```
Enable Events
```

如果使用 Socket Mode：

不需要填 Request URL

新增 Bot Event：

```
app_mention
message.channels
message.im
```

---

# 七、邀請 Bot 進 Channel

在 Slack channel 輸入：

```
/invite @your-bot-name
```

---

# 八、Token 使用範例

例如 Node.js + Slack Bolt

先安裝：

```
npm install @slack/bolt
```

程式：

```js
const { App } = require("@slack/bolt");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true
});

app.message("hello", async ({ message, say }) => {
  await say(`Hello <@${message.user}>`);
});

(async () => {
  await app.start();
  console.log("Slack bot running");
})();
```

環境變數：

```bash
SLACK_BOT_TOKEN=xoxb-xxxx
SLACK_APP_TOKEN=xapp-xxxx
```

---

# 九、Token 總結

| Token      | 用途             | 格式      |
| ---------- | -------------- | ------- |
| Bot Token  | API 呼叫、發送訊息    | `xoxb-` |
| App Token  | Socket Mode 連線 | `xapp-` |
| User Token | 使用者權限 API      | `xoxp-` |

---

# 十、開發 Bot 的常見架構

常見組合：

```
Slack
   │
Slack Bot
   │
Webhook / Socket Mode
   │
Backend
   │
AI / Copilot / API
```

如果你的目的是：

**Slack + GitHub Copilot / AI Agent**

推薦架構：

```
Slack
   │
Slack Bot
   │
Socket Mode
   │
Node.js / Python
   │
Copilot SDK / OpenAI / MCP
```

---
