import { DWClient, type DWClientDownStream, TOPIC_ROBOT, type RobotMessage } from "dingtalk-stream";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { opencodeClient } from "../opencode/client.js";
import { getCurrentSession } from "../session/manager.js";

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

// Force reconnect if no message for 2 minutes
const STALE_CONNECTION_THRESHOLD_MS = 120000;

export class DingTalkClient {
  private client: DWClient;
  private messageHandler: MessageHandler | null = null;
  private connectionStatusHandler: ConnectionStatusHandler | null = null;
  private connectionCheckInterval: ReturnType<typeof setInterval> | null = null;
  private lastMessageTime = 0;
  private isForceReconnecting = false;

  constructor(clientConfig: { appKey: string; appSecret: string }) {
    this.client = new DWClient({
      clientId: clientConfig.appKey,
      clientSecret: clientConfig.appSecret,
      debug: config.dingtalk.debug,
    });
    logger.info(`[DingTalk] Client instance created (debug=${config.dingtalk.debug})`);
  }

  onConnectionStatus(handler: ConnectionStatusHandler): void {
    this.connectionStatusHandler = handler;
  }

  async getAccessToken(): Promise<string> {
    return await this.client.getAccessToken();
  }

  async sendTextMessage(sessionWebhook: string, userId: string, text: string): Promise<void> {
    const accessToken = await this.getAccessToken();
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
    const accessToken = await this.getAccessToken();
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
          logger.warn("[DingTalk] Connection lost");
        }
      }

      if (registered !== lastRegistered && registered) {
        logger.info("[DingTalk] Client registered with DingTalk server");
      }

      // Core logic: Force reconnect if no message for 2 minutes
      if (
        timeSinceLastMessage > STALE_CONNECTION_THRESHOLD_MS &&
        connected &&
        !this.isForceReconnecting
      ) {
        logger.error(
          `[DingTalk] Connection stale (no message for ${Math.floor(timeSinceLastMessage / 1000)}s), forcing reconnect...`,
        );
        void this.forceReconnect();
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

    logger.debug("[DingTalk] Connection monitor started (checking every 30s)");
  }

  private async forceReconnect(): Promise<void> {
    if (this.isForceReconnecting) return;

    // Check if OpenCode session is busy
    const currentSession = getCurrentSession();
    if (currentSession) {
      try {
        const { data, error } = await opencodeClient.session.status({
          directory: currentSession.directory,
        });

        if (!error && data) {
          const sessionStatus = (data as Record<string, { type?: string }>)[currentSession.id];
          if (sessionStatus?.type === "busy") {
            logger.warn(
              `[DingTalk] OpenCode session ${currentSession.id} is busy, delaying reconnect...`,
            );
            return; // Skip reconnect, will try again in next interval
          }
        }
      } catch (err) {
        logger.warn("[DingTalk] Failed to check session status before reconnect:", err);
        // Continue with reconnect if we can't check status
      }
    }

    this.isForceReconnecting = true;

    try {
      logger.warn("[DingTalk] Force reconnect initiated");
      this.client.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      this.lastMessageTime = Date.now();
      await this.client.connect();
      logger.info("[DingTalk] Force reconnect completed successfully");
    } catch (err) {
      logger.error("[DingTalk] Force reconnect failed:", err);
    } finally {
      this.isForceReconnecting = false;
    }
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
