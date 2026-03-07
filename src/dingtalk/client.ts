import { DWClient, type DWClientDownStream, TOPIC_ROBOT, type RobotMessage } from "dingtalk-stream";
import { logger } from "../utils/logger.js";

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

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

export class DingTalkClient {
  private client: DWClient;
  private messageHandler: MessageHandler | null = null;
  private connectionStatusHandler: ConnectionStatusHandler | null = null;
  private reconnectAttempts = 0;
  private connectionCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: { appKey: string; appSecret: string }) {
    this.client = new DWClient({
      clientId: config.appKey,
      clientSecret: config.appSecret,
      debug: false,
    });
    logger.info("[DingTalk] Client instance created");
  }

  onConnectionStatus(handler: ConnectionStatusHandler): void {
    this.connectionStatusHandler = handler;
  }

  async getAccessToken(): Promise<string> {
    const token = await this.client.getAccessToken();
    return token;
  }

  async sendTextMessage(sessionWebhook: string, userId: string, text: string): Promise<void> {
    const accessToken = await this.getAccessToken();

    const body = {
      at: {
        atUserIds: [userId],
        isAtAll: false,
      },
      text: {
        content: text,
      },
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
      at: {
        atUserIds: [userId],
        isAtAll: false,
      },
      markdown: {
        title,
        text: markdown,
      },
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

    try {
      await this.client.connect();
      logger.info("[DingTalk] Stream mode connected successfully");
      this.reconnectAttempts = 0;
    } catch (err) {
      logger.error("[DingTalk] Failed to connect stream:", err);
      throw err;
    }
  }

  private startConnectionMonitor(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    let lastConnected = false;
    let lastRegistered = false;
    let lastReconnecting = false;

    this.connectionCheckInterval = setInterval(() => {
      const { connected, registered, reconnecting } = this.client;

      // Detect and log state changes
      if (connected !== lastConnected) {
        if (connected) {
          logger.info("[DingTalk] Connection established");
          this.reconnectAttempts = 0;
        } else {
          logger.warn("[DingTalk] Connection lost");
        }
      }

      if (registered !== lastRegistered && registered) {
        logger.info("[DingTalk] Client registered with DingTalk server");
      }

      if (reconnecting !== lastReconnecting) {
        if (reconnecting) {
          this.reconnectAttempts++;
          const delay = this.getReconnectDelayMs(this.reconnectAttempts);
          logger.warn(
            `[DingTalk] Reconnecting... (attempt #${this.reconnectAttempts}, next in ${delay}ms)`,
          );
        } else if (connected && registered) {
          logger.info(
            `[DingTalk] Reconnected successfully after ${this.reconnectAttempts} attempts`,
          );
          this.reconnectAttempts = 0;
        }
      }

      // Notify handler of status changes
      if (
        connected !== lastConnected ||
        registered !== lastRegistered ||
        reconnecting !== lastReconnecting
      ) {
        this.connectionStatusHandler?.({ connected, registered, reconnecting });
      }

      lastConnected = connected;
      lastRegistered = registered;
      lastReconnecting = reconnecting;
    }, 500);

    logger.debug("[DingTalk] Connection monitor started");
  }

  private getReconnectDelayMs(attempt: number): number {
    const exponentialDelay = RECONNECT_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1));
    return Math.min(exponentialDelay, RECONNECT_MAX_DELAY_MS);
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
      const { messageId, topic } = res.headers;

      if (topic !== TOPIC_ROBOT) {
        return;
      }

      const msgData = JSON.parse(res.data) as RobotMessage;
      const { senderStaffId, sessionWebhook, conversationId } = msgData;

      let text = "";
      if (msgData.msgtype === "text" && msgData.text?.content) {
        text = msgData.text.content;
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
