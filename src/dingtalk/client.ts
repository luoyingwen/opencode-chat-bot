import { DWClient, type DWClientDownStream, TOPIC_ROBOT, type RobotMessage } from "dingtalk-stream";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import {
  recordProactiveRisk,
  getProactiveRisk,
  deleteProactiveRisk,
  isProactivePermissionError,
} from "./proactive-risk-registry.js";

const DINGTALK_PROACTIVE_API = "https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend";

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

async function retryWithBackoff<T>(fn: () => Promise<T>, context: string): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const details = extractNetworkErrorDetails(err);

      if (attempt < RETRY_MAX_ATTEMPTS) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        logger.warn(
          `[DingTalk] ${context} failed (attempt ${attempt}/${RETRY_MAX_ATTEMPTS}), retrying in ${delay}ms:\n${details}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        logger.error(
          `[DingTalk] ${context} failed after ${RETRY_MAX_ATTEMPTS} attempts:\n${details}`,
        );
      }
    }
  }

  throw lastError;
}

function extractNetworkErrorDetails(err: unknown): string {
  if (err instanceof Error) {
    const details: string[] = [`Error: ${err.message}`];

    if (err instanceof AggregateError) {
      details.push(`AggregateError with ${err.errors.length} underlying errors:`);
      for (const subErr of err.errors) {
        details.push(`  - ${subErr instanceof Error ? subErr.message : String(subErr)}`);
        if (subErr instanceof Error && subErr.cause) {
          details.push(`    Cause: ${subErr.cause}`);
        }
      }
    }

    const axiosErr = err as { code?: string; config?: { url?: string } };
    if (axiosErr.code) {
      details.push(`Error code: ${axiosErr.code}`);
    }
    if (axiosErr.config?.url) {
      details.push(`Target URL: ${axiosErr.config.url}`);
    }

    const cause = (err as { cause?: unknown }).cause;
    if (cause) {
      details.push(`Cause: ${cause instanceof Error ? cause.message : String(cause)}`);
    }

    return details.join("\n");
  }
  return String(err);
}

export function formatDingTalkNetworkError(err: unknown): string {
  return extractNetworkErrorDetails(err);
}

type MessageHandler = (data: {
  userId: string;
  text: string;
  conversationId: string;
  sessionWebhook: string;
  messageId: string;
}) => void;

type ConnectionStatusHandler = (status: {
  connected: boolean;
  registered: boolean;
  reconnecting: boolean;
}) => void;

// Force reconnect if no message for 10 minutes (increased to avoid interrupting long tasks)
const STALE_CONNECTION_THRESHOLD_MS = 600000;
const DISCONNECTED_RETRY_INTERVAL_MS = 30000;

export class DingTalkClient {
  private client: DWClient;
  private messageHandler: MessageHandler | null = null;
  private connectionStatusHandler: ConnectionStatusHandler | null = null;
  private connectionCheckInterval: ReturnType<typeof setInterval> | null = null;
  private lastMessageTime = 0;

  constructor(clientConfig: { appKey: string; appSecret: string }) {
    this.client = new DWClient({
      clientId: clientConfig.appKey,
      clientSecret: clientConfig.appSecret,
      debug: false,
      keepAlive: true,
    });
    logger.info("[DingTalk] Client instance created (keepAlive=true)");
  }

  onConnectionStatus(handler: ConnectionStatusHandler): void {
    this.connectionStatusHandler = handler;
  }

  async getAccessToken(): Promise<string> {
    return await this.client.getAccessToken();
  }

  async sendTextMessage(sessionWebhook: string, userId: string, text: string): Promise<void> {
    const accessToken = await retryWithBackoff(
      () => this.getAccessToken(),
      "getAccessToken for text message",
    );
    const body = {
      at: { atUserIds: [userId], isAtAll: false },
      text: { content: text },
      msgtype: "text",
    };

    const response = await fetch(sessionWebhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-acs-dingtalk-access-token": accessToken,
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as { errcode?: number; errmsg?: string };
    if (data.errcode && data.errcode !== 0) {
      throw new Error(`Failed to send text message: ${data.errmsg || JSON.stringify(data)}`);
    }
  }

  async sendMarkdownMessage(
    sessionWebhook: string,
    userId: string,
    title: string,
    markdown: string,
  ): Promise<void> {
    const accessToken = await retryWithBackoff(
      () => this.getAccessToken(),
      "getAccessToken for markdown message",
    );
    const body = {
      at: { atUserIds: [userId], isAtAll: false },
      markdown: { title, text: markdown },
      msgtype: "markdown",
    };

    const response = await fetch(sessionWebhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-acs-dingtalk-access-token": accessToken,
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as { errcode?: number; errmsg?: string };
    if (data.errcode && data.errcode !== 0) {
      throw new Error(`Failed to send markdown message: ${data.errmsg || JSON.stringify(data)}`);
    }
  }

  async sendProactiveTextMessage(
    userId: string,
    text: string,
  ): Promise<{ ok: boolean; error?: string }> {
    let accessToken: string;
    try {
      accessToken = await retryWithBackoff(
        () => this.getAccessToken(),
        "getAccessToken for proactive text",
      );
    } catch (err) {
      const details = extractNetworkErrorDetails(err);
      return { ok: false, error: `Network error after retries: ${details.split("\n")[0]}` };
    }
    const robotCode = config.dingtalk.appKey;

    const body = {
      robotCode,
      msgKey: "sampleText",
      msgParam: JSON.stringify({ content: text }),
      userIds: [userId],
    };

    try {
      const response = await fetch(DINGTALK_PROACTIVE_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-acs-dingtalk-access-token": accessToken,
        },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as {
        errcode?: number;
        errmsg?: string;
        processQueryKey?: string;
      };

      if (data.errcode && data.errcode !== 0) {
        const errCode = String(data.errcode);
        if (isProactivePermissionError(errCode)) {
          recordProactiveRisk({
            accountId: config.dingtalk.appKey,
            targetId: userId,
            level: "high",
            reason: errCode,
            source: "proactive-api",
          });
        }
        return { ok: false, error: data.errmsg || `Error code: ${data.errcode}` };
      }

      deleteProactiveRisk(config.dingtalk.appKey, userId);
      logger.debug(
        `[DingTalk] Proactive text sent to ${userId}, processQueryKey=${data.processQueryKey}`,
      );
      return { ok: true };
    } catch (err) {
      const details = extractNetworkErrorDetails(err);
      logger.error(`[DingTalk] Failed to send proactive text:\n${details}`);
      return { ok: false, error: details.split("\n")[0] };
    }
  }

  async sendProactiveMarkdownMessage(
    userId: string,
    title: string,
    markdown: string,
  ): Promise<{ ok: boolean; error?: string }> {
    let accessToken: string;
    try {
      accessToken = await retryWithBackoff(
        () => this.getAccessToken(),
        "getAccessToken for proactive markdown",
      );
    } catch (err) {
      const details = extractNetworkErrorDetails(err);
      return { ok: false, error: `Network error after retries: ${details.split("\n")[0]}` };
    }
    const robotCode = config.dingtalk.appKey;

    const body = {
      robotCode,
      msgKey: "sampleMarkdown",
      msgParam: JSON.stringify({ title, text: markdown }),
      userIds: [userId],
    };

    try {
      const response = await fetch(DINGTALK_PROACTIVE_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-acs-dingtalk-access-token": accessToken,
        },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as {
        errcode?: number;
        errmsg?: string;
        processQueryKey?: string;
      };

      if (data.errcode && data.errcode !== 0) {
        const errCode = String(data.errcode);
        if (isProactivePermissionError(errCode)) {
          recordProactiveRisk({
            accountId: config.dingtalk.appKey,
            targetId: userId,
            level: "high",
            reason: errCode,
            source: "proactive-api",
          });
        }
        return { ok: false, error: data.errmsg || `Error code: ${data.errcode}` };
      }

      deleteProactiveRisk(config.dingtalk.appKey, userId);
      logger.debug(
        `[DingTalk] Proactive markdown sent to ${userId}, processQueryKey=${data.processQueryKey}`,
      );
      return { ok: true };
    } catch (err) {
      const details = extractNetworkErrorDetails(err);
      logger.error(`[DingTalk] Failed to send proactive markdown:\n${details}`);
      return { ok: false, error: details.split("\n")[0] };
    }
  }

  hasProactiveRisk(userId: string): boolean {
    const risk = getProactiveRisk(config.dingtalk.appKey, userId);
    return risk !== null;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  async connectStream(): Promise<void> {
    this.client.registerCallbackListener(TOPIC_ROBOT, (res: DWClientDownStream) => {
      this.handleRobotMessage(res);
    });

    this.startConnectionMonitor();
    this.lastMessageTime = Date.now();

    try {
      await this.client.connect();
      logger.info("[DingTalk] Stream mode connected successfully");
    } catch (err) {
      logger.error("[DingTalk] Failed to connect stream:", err);
      // Don't throw - let the connection monitor handle reconnection
    }
  }

  private startConnectionMonitor(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    let lastConnected = false;
    let lastRegistered = false;

    this.connectionCheckInterval = setInterval(() => {
      const { connected, registered } = this.client;
      const now = Date.now();
      const timeSinceLastMessage = now - this.lastMessageTime;

      // Log current state every 30 seconds
      logger.debug(
        `[DingTalk] Connection state: connected=${connected}, registered=${registered}, lastMessage=${timeSinceLastMessage > 0 ? `${Math.floor(timeSinceLastMessage / 1000)}s ago` : "n/a"}`,
      );

      // Detect connection state changes
      if (connected !== lastConnected) {
        if (connected) {
          logger.info("[DingTalk] Connection established");
        } else {
          logger.warn("[DingTalk] Connection lost (SDK will auto-reconnect)");
        }
      }

      if (registered !== lastRegistered && registered) {
        logger.info("[DingTalk] Client registered with DingTalk server");
      }

      // Log warnings for stale connections (SDK handles reconnection automatically)
      if (!connected && timeSinceLastMessage > DISCONNECTED_RETRY_INTERVAL_MS) {
        logger.warn(
          `[DingTalk] Connection down for ${Math.floor(timeSinceLastMessage / 1000)}s - SDK auto-reconnect in progress...`,
        );
      } else if (connected && timeSinceLastMessage > STALE_CONNECTION_THRESHOLD_MS) {
        logger.warn(
          `[DingTalk] Connection stale: no message for ${Math.floor(timeSinceLastMessage / 1000)}s - SDK will reconnect if needed`,
        );
      }

      // Notify handler of status changes
      if (connected !== lastConnected || registered !== lastRegistered) {
        this.connectionStatusHandler?.({
          connected,
          registered,
          reconnecting: this.client.reconnecting,
        });
      }

      lastConnected = connected;
      lastRegistered = registered;
    }, 30000);

    logger.debug(
      "[DingTalk] Connection monitor started (checking every 30s, SDK handles reconnection)",
    );
  }

  private stopConnectionMonitor(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
      logger.debug("[DingTalk] Connection monitor stopped");
    }
  }

  private handleRobotMessage(res: DWClientDownStream): void {
    try {
      this.lastMessageTime = Date.now();
      const { messageId, topic } = res.headers;

      if (topic !== TOPIC_ROBOT) return;

      const msgData = JSON.parse(res.data) as RobotMessage;
      const { senderStaffId, sessionWebhook, conversationId } = msgData;

      logger.info(`[DingTalk] Received message: type=${msgData.msgtype}, from=${senderStaffId}`);

      let text = "";
      const msgType = msgData.msgtype;

      if (msgType === "text") {
        text = msgData.text?.content || "";
      } else if (msgType === "markdown") {
        text = (msgData as { markdown?: { text?: string } }).markdown?.text || "";
      } else if (msgType === "richText") {
        // 富文本消息，尝试提取文本内容
        // 结构: content: { richText: [{ text: "xxx" }, { text: "yyy" }] }
        const content = (msgData as { content?: { richText?: Array<{ text?: string }> } }).content;
        if (content?.richText && Array.isArray(content.richText)) {
          text = content.richText
            .map((item) => item.text)
            .filter(Boolean)
            .join("\n");
          logger.debug(`[DingTalk] richText extracted: ${text}`);
        } else {
          logger.warn(
            `[DingTalk] richText content structure unexpected: ${JSON.stringify(content)}`,
          );
        }
      } else if (msgType === "image" || msgType === "voice" || msgType === "file") {
        // 图片、语音、文件消息，记录日志并提示用户
        logger.info(
          `[DingTalk] Received ${msgType} message from ${senderStaffId}, not supported yet`,
        );
        this.messageHandler?.({
          userId: senderStaffId,
          text: `⚠️ 暂不支持的 ${msgType} 消息类型，请发送文本消息`,
          conversationId,
          sessionWebhook,
          messageId,
        });
        this.client.socketCallBackResponse(messageId, { success: true });
        return;
      } else {
        // 其他未知消息类型
        logger.warn(`[DingTalk] Received unknown message type: ${msgType}`);
      }

      if (senderStaffId && text && sessionWebhook) {
        logger.debug(`[DingTalk] Received message from ${senderStaffId}: ${text}`);
        this.messageHandler?.({
          userId: senderStaffId,
          text,
          conversationId,
          sessionWebhook,
          messageId,
        });
      }

      this.client.socketCallBackResponse(messageId, { success: true });
    } catch (err) {
      logger.error("[DingTalk] Error handling robot message:", err);
    }
  }

  disconnect(): void {
    logger.info("[DingTalk] Disconnecting...");
    this.stopConnectionMonitor();
    this.client.disconnect();
    logger.info("[DingTalk] Disconnected");
  }
}

let dingTalkClientInstance: DingTalkClient | null = null;

export function getDingTalkClient(): DingTalkClient {
  if (!dingTalkClientInstance) {
    throw new Error("DingTalk client not initialized");
  }
  return dingTalkClientInstance;
}

export function initDingTalkClient(config: { appKey: string; appSecret: string }): DingTalkClient {
  dingTalkClientInstance = new DingTalkClient(config);
  return dingTalkClientInstance;
}
