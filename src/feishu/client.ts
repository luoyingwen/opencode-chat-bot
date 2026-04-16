import * as lark from "@larksuiteoapi/node-sdk";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import {
  hasComplexMarkdown,
  buildCardContent,
  buildPostContent,
  preprocessFeishuMarkdown,
  buildStreamingContent,
  buildFinalCardJson,
  formatElapsed,
} from "./markdown.js";

const DEDUP_MAX = 1000;
const CARD_THROTTLE_MS = 200;
const TYPING_EMOJI = "Typing";
const STALE_CONNECTION_THRESHOLD_MS = 600000; // 10 minutes
const CONNECTION_CHECK_INTERVAL_MS = 30000; // 30 seconds

interface FeishuCardState {
  cardId: string;
  messageId: string;
  sequence: number;
  startTime: number;
  toolCalls: Array<{ name: string; status: "running" | "complete" | "error" }>;
  thinking: boolean;
  pendingText: string | null;
  lastUpdateAt: number;
  throttleTimer: ReturnType<typeof setTimeout> | null;
}

type FeishuMessageEventData = {
  sender: {
    sender_id?: {
      open_id?: string;
      union_id?: string;
      user_id?: string;
    };
    sender_type: string;
    tenant_key?: string;
  };
  message: {
    message_id: string;
    chat_id: string;
    chat_type: string;
    message_type: string;
    content: string;
    create_time: string;
    mentions?: Array<{
      key: string;
      id: { open_id?: string; union_id?: string; user_id?: string };
      name: string;
    }>;
  };
};

export type MessageHandler = (data: {
  userId: string;
  chatId: string;
  text: string;
  messageId: string;
}) => void;

export type CardActionHandler = (data: {
  userId: string;
  chatId: string;
  messageId: string;
  callbackData: string;
}) => void;

export class FeishuClient {
  private wsClient: lark.WSClient | null = null;
  private restClient: lark.Client | null = null;
  private messageHandler: MessageHandler | null = null;
  private cardActionHandler: CardActionHandler | null = null;
  private running = false;
  private seenMessageIds = new Map<string, boolean>();
  private botOpenId: string | null = null;
  private botIds = new Set<string>();
  private lastIncomingMessageId = new Map<string, string>();
  private typingReactions = new Map<string, string>();
  private activeCards = new Map<string, FeishuCardState>();
  private cardCreatePromises = new Map<string, Promise<boolean>>();
  private lastMessageTime = 0; // Track last message time for connection health
  private connectionCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(clientConfig: { appId: string; appSecret: string; domain: string }) {
    const domain = clientConfig.domain === "lark" ? lark.Domain.Lark : lark.Domain.Feishu;

    this.restClient = new lark.Client({
      appId: clientConfig.appId,
      appSecret: clientConfig.appSecret,
      domain,
    });

    logger.info(`[Feishu] Client instance created (domain=${clientConfig.domain})`);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  onCardAction(handler: CardActionHandler): void {
    this.cardActionHandler = handler;
  }

  private async resolveBotIdentity(
    appId: string,
    appSecret: string,
    domain: lark.Domain,
  ): Promise<void> {
    try {
      const baseUrl =
        domain === lark.Domain.Lark ? "https://open.larksuite.com" : "https://open.feishu.cn";

      const tokenRes = await fetch(`${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
        signal: AbortSignal.timeout(10_000),
      });
      const tokenData = (await (
        tokenRes as unknown as { json: () => Promise<{ tenant_access_token?: string }> }
      ).json()) as { tenant_access_token?: string };
      if (!tokenData.tenant_access_token) {
        logger.warn("[Feishu] Failed to get tenant access token");
        return;
      }

      const botRes = await fetch(`${baseUrl}/open-apis/bot/v3/info/`, {
        method: "GET",
        headers: { Authorization: `Bearer ${tokenData.tenant_access_token}` },
        signal: AbortSignal.timeout(10_000),
      });
      const botData = (await (
        botRes as unknown as {
          json: () => Promise<{ bot?: { open_id?: string; bot_id?: string } }>;
        }
      ).json()) as {
        bot?: { open_id?: string; bot_id?: string };
      };
      if (botData?.bot?.open_id) {
        this.botOpenId = botData.bot.open_id;
        this.botIds.add(botData.bot.open_id);
      }
      if (botData?.bot?.bot_id) {
        this.botIds.add(botData.bot.bot_id);
      }
      logger.info(`[Feishu] Bot identity resolved: openId=${this.botOpenId}`);
    } catch (err) {
      logger.warn(
        "[Feishu] Failed to resolve bot identity:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  async connect(): Promise<void> {
    if (this.running) return;

    const appId = config.feishu.appId;
    const appSecret = config.feishu.appSecret;
    const domainSetting = config.feishu.domain;
    const domain = domainSetting === "lark" ? lark.Domain.Lark : lark.Domain.Feishu;

    if (!appId || !appSecret) {
      throw new Error("FEISHU_APP_ID and FEISHU_APP_SECRET are required");
    }

    await this.resolveBotIdentity(appId, appSecret, domain);

    const dispatcher = new lark.EventDispatcher({}).register({
      "im.message.receive_v1": async (data) => {
        await this.handleIncomingEvent(data as FeishuMessageEventData);
      },
      "card.action.trigger": async (data: unknown) => {
        return await this.handleCardAction(data);
      },
    });

    this.wsClient = new lark.WSClient({
      appId,
      appSecret,
      domain,
      autoReconnect: true, // Let SDK handle reconnection automatically
    });
    logger.info(`[Feishu] WSClient created (autoReconnect=true)`);

    const wsClientAny = this.wsClient as unknown as {
      handleEventData: (data: unknown) => void;
    };
    if (typeof wsClientAny.handleEventData === "function") {
      const origHandleEventData = wsClientAny.handleEventData.bind(wsClientAny);
      wsClientAny.handleEventData = (data: unknown) => {
        const dataObj = data as { headers?: Array<{ key: string; value: string }> };
        const msgType = dataObj.headers?.find?.((h) => h.key === "type")?.value;
        if (msgType === "card") {
          logger.debug("[Feishu] handleEventData type: card (patched -> event)");
          const headers = dataObj.headers || [];
          const patchedData = {
            headers: headers.map((h) => (h.key === "type" ? { ...h, value: "event" } : h)),
          };
          return origHandleEventData(patchedData);
        }
        return origHandleEventData(data);
      };
    }

    this.wsClient.start({ eventDispatcher: dispatcher });
    this.running = true;
    this.lastMessageTime = Date.now();
    this.startConnectionMonitor();

    logger.info(`[Feishu] Started (botOpenId: ${this.botOpenId || "unknown"}, autoReconnect=true)`);
  }

  async disconnect(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.stopConnectionMonitor();

    if (this.wsClient) {
      try {
        this.wsClient.close({ force: true });
      } catch (err) {
        logger.warn("[Feishu] WSClient close error:", err instanceof Error ? err.message : err);
      }
      this.wsClient = null;
    }

    for (const [, state] of this.activeCards) {
      if (state.throttleTimer) clearTimeout(state.throttleTimer);
    }
    this.activeCards.clear();
    this.cardCreatePromises.clear();
    this.seenMessageIds.clear();
    this.lastIncomingMessageId.clear();
    this.typingReactions.clear();

    logger.info("[Feishu] Stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  getBotOpenId(): string | null {
    return this.botOpenId;
  }

  private addToDedup(messageId: string): void {
    this.seenMessageIds.set(messageId, true);
    if (this.seenMessageIds.size > DEDUP_MAX) {
      const excess = this.seenMessageIds.size - DEDUP_MAX;
      let removed = 0;
      for (const key of this.seenMessageIds.keys()) {
        if (removed >= excess) break;
        this.seenMessageIds.delete(key);
        removed++;
      }
    }
  }

  private isBotMentioned(mentions?: FeishuMessageEventData["message"]["mentions"]): boolean {
    if (!mentions || this.botIds.size === 0) return false;
    return mentions.some((m) => {
      const ids = [m.id.open_id, m.id.user_id, m.id.union_id].filter(Boolean) as string[];
      return ids.some((id) => this.botIds.has(id));
    });
  }

  private stripMentionMarkers(text: string): string {
    return text.replace(/@_user_\d+/g, "").trim();
  }

  private parseTextContent(content: string): string {
    try {
      const parsed = JSON.parse(content) as { text?: string };
      return parsed.text || "";
    } catch {
      return content;
    }
  }

  private extractFileKey(content: string): string | null {
    try {
      const parsed = JSON.parse(content) as {
        image_key?: string;
        file_key?: string;
        imageKey?: string;
        fileKey?: string;
      };
      return parsed.image_key || parsed.file_key || parsed.imageKey || parsed.fileKey || null;
    } catch {
      return null;
    }
  }

  private async handleIncomingEvent(data: FeishuMessageEventData): Promise<void> {
    try {
      this.lastMessageTime = Date.now(); // Track message time for connection health
      const msg = data.message;
      const sender = data.sender;

      if (sender.sender_type === "bot") return;

      if (this.seenMessageIds.has(msg.message_id)) return;
      this.addToDedup(msg.message_id);

      const chatId = msg.chat_id;
      const userId =
        sender.sender_id?.open_id || sender.sender_id?.user_id || sender.sender_id?.union_id || "";

      if (!userId) {
        logger.warn("[Feishu] No user ID in message");
        return;
      }

      const messageType = msg.message_type;
      let text = "";

      if (messageType === "text") {
        text = this.parseTextContent(msg.content);
      } else if (messageType === "post") {
        const { extractedText } = this.parsePostContent(msg.content);
        text = extractedText;
      } else if (
        messageType === "image" ||
        messageType === "file" ||
        messageType === "audio" ||
        messageType === "video" ||
        messageType === "media"
      ) {
        logger.info(`[Feishu] Received ${messageType} message, not supported yet`);
        return;
      } else {
        logger.warn(`[Feishu] Unsupported message type: ${messageType}`);
        return;
      }

      text = this.stripMentionMarkers(text);

      if (!text.trim()) return;

      this.lastIncomingMessageId.set(chatId, msg.message_id);

      this.messageHandler?.({
        userId,
        chatId,
        text: text.trim(),
        messageId: msg.message_id,
      });
    } catch (err) {
      logger.error(
        "[Feishu] Unhandled error in event handler:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  private parsePostContent(content: string): { extractedText: string; imageKeys: string[] } {
    const imageKeys: string[] = [];
    const textParts: string[] = [];

    try {
      const parsed = JSON.parse(content) as {
        title?: string;
        content?: Array<Array<{ tag: string; text?: string; image_key?: string }>>;
      };
      const title = parsed.title;
      if (title) textParts.push(title);

      const paragraphs = parsed.content;
      if (Array.isArray(paragraphs)) {
        for (const paragraph of paragraphs) {
          if (!Array.isArray(paragraph)) continue;
          for (const element of paragraph) {
            if (element.tag === "text" && element.text) {
              textParts.push(element.text);
            } else if (element.tag === "a" && element.text) {
              textParts.push(element.text);
            } else if (element.tag === "img") {
              const key = element.image_key;
              if (key) imageKeys.push(key);
            }
          }
          textParts.push("\n");
        }
      }
    } catch {
      // Failed to parse
    }

    return { extractedText: textParts.join("").trim(), imageKeys };
  }

  private async handleCardAction(data: unknown): Promise<unknown> {
    const FALLBACK_TOAST = { toast: { type: "info" as const, content: "已收到" } };

    try {
      const event = data as {
        action?: { value?: { callback_data?: string; chatId?: string } };
        context?: { open_chat_id?: string; open_message_id?: string };
        open_message_id?: string;
        operator?: { open_id?: string };
        open_id?: string;
      };
      const value = event?.action?.value ?? {};
      const callbackData = value.callback_data;
      if (!callbackData) return FALLBACK_TOAST;

      const chatId = event?.context?.open_chat_id || value.chatId || "";
      const messageId = event?.context?.open_message_id || event?.open_message_id || "";
      const userId = event?.operator?.open_id || event?.open_id || "";

      if (!chatId) return FALLBACK_TOAST;

      this.cardActionHandler?.({
        userId,
        chatId,
        messageId,
        callbackData,
      });

      return { toast: { type: "info" as const, content: "已收到，正在处理..." } };
    } catch (err) {
      logger.error("[Feishu] Card action handler error:", err instanceof Error ? err.message : err);
      return FALLBACK_TOAST;
    }
  }

  async sendTextMessage(
    chatId: string,
    text: string,
  ): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    if (!this.restClient) {
      return { ok: false, error: "Feishu client not initialized" };
    }

    try {
      const res = await this.restClient.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: chatId,
          msg_type: "text",
          content: JSON.stringify({ text }),
        },
      });

      if (res?.data?.message_id) {
        return { ok: true, messageId: res.data.message_id };
      }
      return { ok: false, error: res?.msg || "Send failed" };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Send failed",
      };
    }
  }

  async sendMarkdownMessage(
    chatId: string,
    text: string,
  ): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    if (!this.restClient) {
      return { ok: false, error: "Feishu client not initialized" };
    }

    const processedText = preprocessFeishuMarkdown(text);

    if (hasComplexMarkdown(processedText)) {
      return this.sendAsCard(chatId, processedText);
    }
    return this.sendAsPost(chatId, processedText);
  }

  private async sendAsCard(
    chatId: string,
    text: string,
  ): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    if (!this.restClient) {
      return { ok: false, error: "Feishu client not initialized" };
    }

    const cardContent = buildCardContent(text);

    try {
      const res = await this.restClient.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: chatId,
          msg_type: "interactive",
          content: cardContent,
        },
      });

      if (res?.data?.message_id) {
        return { ok: true, messageId: res.data.message_id };
      }
      logger.warn("[Feishu] Card send failed:", res?.msg, res?.code);
    } catch (err) {
      logger.warn(
        "[Feishu] Card send error, falling back to post:",
        err instanceof Error ? err.message : err,
      );
    }

    return this.sendAsPost(chatId, text);
  }

  private async sendAsPost(
    chatId: string,
    text: string,
  ): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    if (!this.restClient) {
      return { ok: false, error: "Feishu client not initialized" };
    }

    const postContent = buildPostContent(text);

    try {
      const res = await this.restClient.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: chatId,
          msg_type: "post",
          content: postContent,
        },
      });

      if (res?.data?.message_id) {
        return { ok: true, messageId: res.data.message_id };
      }
      logger.warn("[Feishu] Post send failed:", res?.msg, res?.code);
    } catch (err) {
      logger.warn(
        "[Feishu] Post send error, falling back to text:",
        err instanceof Error ? err.message : err,
      );
    }

    return this.sendTextMessage(chatId, text);
  }

  async replyToMessage(
    messageId: string,
    text: string,
  ): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    if (!this.restClient) {
      return { ok: false, error: "Feishu client not initialized" };
    }

    const processedText = preprocessFeishuMarkdown(text);

    try {
      const res = await this.restClient.im.message.reply({
        path: { message_id: messageId },
        data: {
          content: JSON.stringify({ text: processedText }),
          msg_type: "text",
        },
      });

      if (res?.data?.message_id) {
        return { ok: true, messageId: res.data.message_id };
      }
      return { ok: false, error: res?.msg || "Reply failed" };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Reply failed",
      };
    }
  }

  async addTypingReaction(messageId: string): Promise<void> {
    if (!this.restClient) return;

    try {
      const res = await this.restClient.im.messageReaction.create({
        path: { message_id: messageId },
        data: { reaction_type: { emoji_type: TYPING_EMOJI } },
      });
      const reactionId = (res as unknown as { data?: { reaction_id?: string } })?.data?.reaction_id;
      if (reactionId) {
        this.typingReactions.set(messageId, reactionId);
      }
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code !== 99991400 && code !== 99991403) {
        logger.warn("[Feishu] Typing indicator failed:", err instanceof Error ? err.message : err);
      }
    }
  }

  async removeTypingReaction(messageId: string): Promise<void> {
    if (!this.restClient) return;

    const reactionId = this.typingReactions.get(messageId);
    if (!reactionId) return;

    this.typingReactions.delete(messageId);

    try {
      await this.restClient.im.messageReaction.delete({
        path: { message_id: messageId, reaction_id: reactionId },
      });
    } catch {
      // Ignore
    }
  }

  hasActiveCard(chatId: string): boolean {
    return this.activeCards.has(chatId);
  }

  createStreamingCard(chatId: string, replyToMessageId?: string): Promise<boolean> {
    if (!this.restClient || this.activeCards.has(chatId)) return Promise.resolve(false);

    const existing = this.cardCreatePromises.get(chatId);
    if (existing) return existing;

    const promise = this._doCreateStreamingCard(chatId, replyToMessageId);
    this.cardCreatePromises.set(chatId, promise);
    promise.finally(() => this.cardCreatePromises.delete(chatId));
    return promise;
  }

  private async _doCreateStreamingCard(
    chatId: string,
    replyToMessageId?: string,
  ): Promise<boolean> {
    if (!this.restClient) return false;

    try {
      const cardBody = {
        schema: "2.0",
        config: {
          streaming_mode: true,
          wide_screen_mode: true,
          summary: { content: "思考中..." },
        },
        body: {
          elements: [
            {
              tag: "markdown",
              content: "💭 Thinking...",
              text_align: "left",
              text_size: "normal",
              element_id: "streaming_content",
            },
          ],
        },
      };

      const createResp = await (
        this.restClient as unknown as {
          cardkit: {
            v2: {
              card: {
                create: (opts: { data: { type: string; data: string } }) => Promise<{
                  data?: { card_id?: string };
                }>;
              };
            };
          };
        }
      ).cardkit.v2.card.create({
        data: { type: "card_json", data: JSON.stringify(cardBody) },
      });
      const cardId = createResp?.data?.card_id;
      if (!cardId) {
        logger.warn("[Feishu] Card create returned no card_id");
        return false;
      }

      const cardContent = JSON.stringify({ type: "card", data: { card_id: cardId } });
      let msgResp;

      if (replyToMessageId) {
        msgResp = await this.restClient.im.message.reply({
          path: { message_id: replyToMessageId },
          data: { content: cardContent, msg_type: "interactive" },
        });
      } else {
        msgResp = await this.restClient.im.message.create({
          params: { receive_id_type: "chat_id" },
          data: {
            receive_id: chatId,
            msg_type: "interactive",
            content: cardContent,
          },
        });
      }

      const messageId = msgResp?.data?.message_id;
      if (!messageId) {
        logger.warn("[Feishu] Card message send returned no message_id");
        return false;
      }

      this.activeCards.set(chatId, {
        cardId,
        messageId,
        sequence: 0,
        startTime: Date.now(),
        toolCalls: [],
        thinking: true,
        pendingText: null,
        lastUpdateAt: 0,
        throttleTimer: null,
      });

      logger.info(`[Feishu] Streaming card created: cardId=${cardId}, msgId=${messageId}`);
      return true;
    } catch (err) {
      logger.warn(
        "[Feishu] Failed to create streaming card:",
        err instanceof Error ? err.message : err,
      );
      return false;
    }
  }

  updateCardContent(
    chatId: string,
    text: string,
    toolCalls?: Array<{ name: string; status: "running" | "complete" | "error" }>,
  ): void {
    const state = this.activeCards.get(chatId);
    if (!state || !this.restClient) return;

    if (state.thinking && text.trim()) {
      state.thinking = false;
    }
    state.pendingText = text;
    if (toolCalls) {
      state.toolCalls = toolCalls;
    }

    const elapsed = Date.now() - state.lastUpdateAt;
    if (elapsed < CARD_THROTTLE_MS && state.lastUpdateAt > 0) {
      if (!state.throttleTimer) {
        state.throttleTimer = setTimeout(() => {
          const s = this.activeCards.get(chatId);
          if (s) {
            s.throttleTimer = null;
            this.flushCardUpdate(chatId);
          }
        }, CARD_THROTTLE_MS - elapsed);
      }
      return;
    }

    if (state.throttleTimer) {
      clearTimeout(state.throttleTimer);
      state.throttleTimer = null;
    }
    this.flushCardUpdate(chatId);
  }

  private flushCardUpdate(chatId: string): void {
    const state = this.activeCards.get(chatId);
    if (!state || !this.restClient) return;

    const content = buildStreamingContent(state.pendingText || "", state.toolCalls);

    state.sequence++;
    const seq = state.sequence;
    const cardId = state.cardId;

    (
      this.restClient as unknown as {
        cardkit: {
          v2: {
            card: {
              streamContent: (opts: {
                path: { card_id: string };
                data: { content: string; sequence: number };
              }) => Promise<void>;
            };
          };
        };
      }
    ).cardkit.v2.card
      .streamContent({
        path: { card_id: cardId },
        data: { content, sequence: seq },
      })
      .then(() => {
        state.lastUpdateAt = Date.now();
      })
      .catch((err: unknown) => {
        logger.warn("[Feishu] streamContent failed:", err instanceof Error ? err.message : err);
      });
  }

  async finalizeCard(
    chatId: string,
    status: "completed" | "interrupted" | "error",
    responseText: string,
  ): Promise<boolean> {
    const pending = this.cardCreatePromises.get(chatId);
    if (pending) {
      try {
        await pending;
      } catch {
        // creation failed
      }
    }

    const state = this.activeCards.get(chatId);
    if (!state || !this.restClient) return false;

    if (state.throttleTimer) {
      clearTimeout(state.throttleTimer);
      state.throttleTimer = null;
    }

    try {
      state.sequence++;
      await (
        this.restClient as unknown as {
          cardkit: {
            v2: {
              card: {
                settings: {
                  streamingMode: {
                    set: (opts: {
                      path: { card_id: string };
                      data: { streaming_mode: boolean; sequence: number };
                    }) => Promise<void>;
                  };
                };
              };
            };
          };
        }
      ).cardkit.v2.card.settings.streamingMode.set({
        path: { card_id: state.cardId },
        data: { streaming_mode: false, sequence: state.sequence },
      });

      const statusLabels: Record<string, string> = {
        completed: "✅ Completed",
        interrupted: "⚠️ Interrupted",
        error: "❌ Error",
      };
      const elapsedMs = Date.now() - state.startTime;
      const footer = {
        status: statusLabels[status] || status,
        elapsed: formatElapsed(elapsedMs),
      };

      const finalCardJson = buildFinalCardJson(responseText, state.toolCalls, footer);

      state.sequence++;
      await (
        this.restClient as unknown as {
          cardkit: {
            v2: {
              card: {
                update: (opts: {
                  path: { card_id: string };
                  data: { type: string; data: string; sequence: number };
                }) => Promise<void>;
              };
            };
          };
        }
      ).cardkit.v2.card.update({
        path: { card_id: state.cardId },
        data: { type: "card_json", data: finalCardJson, sequence: state.sequence },
      });

      logger.info(
        `[Feishu] Card finalized: cardId=${state.cardId}, status=${status}, elapsed=${formatElapsed(elapsedMs)}`,
      );
      return true;
    } catch (err) {
      logger.warn("[Feishu] Card finalize failed:", err instanceof Error ? err.message : err);
      return false;
    } finally {
      this.activeCards.delete(chatId);
    }
  }

  cleanupCard(chatId: string): void {
    this.cardCreatePromises.delete(chatId);
    const state = this.activeCards.get(chatId);
    if (!state) return;
    if (state.throttleTimer) {
      clearTimeout(state.throttleTimer);
    }
    this.activeCards.delete(chatId);
  }

  getLastIncomingMessageId(chatId: string): string | undefined {
    return this.lastIncomingMessageId.get(chatId);
  }

  // Connection health monitoring (SDK handles reconnection automatically)
  private startConnectionMonitor(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    this.connectionCheckInterval = setInterval(() => {
      const timeSinceLastMessage = Date.now() - this.lastMessageTime;

      logger.debug(
        `[Feishu] Connection health: lastMessage=${timeSinceLastMessage > 0 ? `${Math.floor(timeSinceLastMessage / 1000)}s ago` : "n/a"}, running=${this.running}`,
      );

      // Log warnings for stale connections (SDK handles reconnection automatically)
      if (this.running && timeSinceLastMessage > STALE_CONNECTION_THRESHOLD_MS) {
        logger.warn(
          `[Feishu] Connection stale: no message for ${Math.floor(timeSinceLastMessage / 1000)}s - SDK auto-reconnect in progress if needed`,
        );
      }
    }, CONNECTION_CHECK_INTERVAL_MS);

    logger.debug(
      "[Feishu] Connection monitor started (checking every 30s, SDK handles reconnection)",
    );
  }

  private stopConnectionMonitor(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
      logger.debug("[Feishu] Connection monitor stopped");
    }
  }
}

let feishuClientInstance: FeishuClient | null = null;

export function getFeishuClient(): FeishuClient {
  if (!feishuClientInstance) {
    throw new Error("Feishu client not initialized");
  }
  return feishuClientInstance;
}

export function initFeishuClient(config: {
  appId: string;
  appSecret: string;
  domain: string;
}): FeishuClient {
  feishuClientInstance = new FeishuClient(config);
  return feishuClientInstance;
}
