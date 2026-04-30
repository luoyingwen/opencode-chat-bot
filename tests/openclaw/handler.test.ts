import { describe, expect, it } from "vitest";
import { extractOpenClawText } from "../../src/openclaw/handler.js";

describe("openclaw handler", () => {
  it("extracts text from common OpenClaw event shapes", () => {
    expect(extractOpenClawText({ content: " /status " })).toBe("/status");
    expect(extractOpenClawText({ text: " hello " })).toBe("hello");
    expect(extractOpenClawText({ message: { text: " nested " } })).toBe("nested");
  });

  it("returns null when no text exists", () => {
    expect(extractOpenClawText({ content: "   " })).toBeNull();
    expect(extractOpenClawText({ message: {} })).toBeNull();
  });
});
