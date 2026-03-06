import { DWClient, type DWClientDownStream, TOPIC_ROBOT, type RobotMessage } from "dingtalk-stream";
import { logger } from "../utils/logger.js";

type MessageHandler = (data: {
  userId: string;
  text: string;
  conversationId: string;
  sessionWebhook: string;
  messageId: string;
}) => void;

export class DingTalkClient {
  private client: DWClient;
  private messageHandler: MessageHandler | null = null;

  constructor(config: { appKey: string; appSecret: string }) {
    this.client = new DWClient({
      clientId: config.appKey,
      clientSecret: config.appSecret,
      debug: false,
    });
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

    await this.client.connect();
    logger.info("[DingTalk] Stream mode connected successfully");
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
