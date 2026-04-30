import { describe, expect, it } from "vitest";
import { createOpenClawRoute, getOpenClawRouteKey } from "../../src/openclaw/route.js";

describe("openclaw route", () => {
  it("builds a stable route from OpenClaw context", () => {
    const route = createOpenClawRoute(
      { channel: "telegram" },
      { accountId: "account-1", conversationId: "conversation-1" },
    );

    expect(route).toEqual({
      channelId: "telegram",
      accountId: "account-1",
      conversationId: "conversation-1",
    });
    expect(getOpenClawRouteKey(route)).toBe("telegram:account-1:conversation-1");
  });

  it("uses explicit context channel before event channel", () => {
    const route = createOpenClawRoute(
      { channel: "telegram" },
      { channelId: "discord", accountId: "account-1", conversationId: "conversation-1" },
    );

    expect(route.channelId).toBe("discord");
  });
});
