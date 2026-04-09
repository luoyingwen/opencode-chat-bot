export interface ToolCallStatus {
  name: string;
  status: "running" | "complete" | "error";
}

export function hasComplexMarkdown(text: string): boolean {
  if (/```[\s\S]*?```/.test(text)) return true;
  if (/\|.+\|[\r\n]+\|[-:| ]+\|/.test(text)) return true;
  return false;
}

export function preprocessFeishuMarkdown(text: string): string {
  return text.replace(/([^\n])```/g, "$1\n```");
}

export function buildCardContent(text: string): string {
  return JSON.stringify({
    schema: "2.0",
    config: { wide_screen_mode: true },
    body: {
      elements: [{ tag: "markdown", content: text }],
    },
  });
}

export function buildPostContent(text: string): string {
  return JSON.stringify({
    zh_cn: { content: [[{ tag: "md", text }]] },
  });
}

export function htmlToFeishuMarkdown(html: string): string {
  return html
    .replace(/<b>(.*?)<\/b>/gi, "**$1**")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<i>(.*?)<\/i>/gi, "*$1*")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<code>(.*?)<\/code>/gi, "`$1`")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildToolProgressMarkdown(tools: ToolCallStatus[]): string {
  if (tools.length === 0) return "";
  const lines = tools.map((tc) => {
    const icon = tc.status === "running" ? "🔄" : tc.status === "complete" ? "✅" : "❌";
    return `${icon} \`${tc.name}\``;
  });
  return lines.join("\n");
}

export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const min = Math.floor(sec / 60);
  const remSec = Math.floor(sec % 60);
  return `${min}m ${remSec}s`;
}

export function buildStreamingContent(text: string, tools: ToolCallStatus[]): string {
  let content = text || "";
  const toolMd = buildToolProgressMarkdown(tools);
  if (toolMd) {
    content = content ? `${content}\n\n${toolMd}` : toolMd;
  }
  return content || "💭 Thinking...";
}

export function buildFinalCardJson(
  text: string,
  tools: ToolCallStatus[],
  footer?: { status: string; elapsed: string } | null,
): string {
  const elements: Array<Record<string, unknown>> = [];

  let content = preprocessFeishuMarkdown(text);
  const toolMd = buildToolProgressMarkdown(tools);
  if (toolMd) {
    content = content ? `${content}\n\n${toolMd}` : toolMd;
  }

  if (content) {
    elements.push({
      tag: "markdown",
      content,
      text_align: "left",
      text_size: "normal",
    });
  }

  if (footer) {
    const parts: string[] = [];
    if (footer.status) parts.push(footer.status);
    if (footer.elapsed) parts.push(footer.elapsed);
    if (parts.length > 0) {
      elements.push({ tag: "hr" });
      elements.push({
        tag: "markdown",
        content: parts.join(" · "),
        text_size: "notation",
      });
    }
  }

  return JSON.stringify({
    schema: "2.0",
    config: { wide_screen_mode: true },
    body: { elements },
  });
}

export function buildPermissionCard(text: string, permId: string, chatId?: string): string {
  const buttons = [
    { label: "Allow", type: "primary", action: "allow" },
    { label: "Allow Session", type: "default", action: "allow_session" },
    { label: "Deny", type: "danger", action: "deny" },
  ];

  const buttonColumns = buttons.map((btn) => ({
    tag: "button",
    text: { tag: "plain_text", content: btn.label },
    type: btn.type,
    size: "medium",
    value: {
      callback_data: `perm:${btn.action}:${permId}`,
      ...(chatId ? { chatId } : {}),
    },
  }));

  return JSON.stringify({
    schema: "2.0",
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: "🔐 Permission Required" },
      template: "orange",
    },
    body: {
      elements: [
        { tag: "markdown", content: text, text_size: "normal" },
        {
          tag: "markdown",
          content: "⏱ This request will expire in 5 minutes",
          text_size: "notation",
        },
        { tag: "hr" },
        {
          tag: "action",
          actions: buttonColumns,
        },
        { tag: "hr" },
        {
          tag: "markdown",
          content: "Or reply: `1` Allow · `2` Allow Session · `3` Deny",
          text_size: "notation",
        },
      ],
    },
  });
}
