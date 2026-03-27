/**
 * Slack mrkdwn formatter.
 *
 * Converts standard Markdown (as returned by OpenCode) into Slack's mrkdwn
 * dialect and splits long messages to stay within Slack's ~4000-char block limit.
 */

const SLACK_MESSAGE_LIMIT = 3900;

/**
 * Split text at natural boundaries (newlines) without exceeding maxLength.
 */
function splitText(text: string, maxLength: number): string[] {
  const parts: string[] = [];
  let currentIndex = 0;

  while (currentIndex < text.length) {
    let endIndex = currentIndex + maxLength;

    if (endIndex >= text.length) {
      parts.push(text.slice(currentIndex));
      break;
    }

    const breakPoint = text.lastIndexOf("\n", endIndex);
    if (breakPoint > currentIndex) {
      endIndex = breakPoint + 1;
    }

    parts.push(text.slice(currentIndex, endIndex));
    currentIndex = endIndex;
  }

  return parts;
}

/**
 * Convert standard Markdown to Slack mrkdwn.
 *
 * Handles: headings, bold/italic, inline code, code blocks, links,
 * horizontal rules, and checklists.  The conversion is intentionally
 * lightweight — Slack already renders code blocks and inline code the
 * same way as Markdown so most content passes through unchanged.
 */
export function markdownToMrkdwn(text: string): string {
  const lines = text.split("\n");
  const output: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    // Toggle code fence tracking
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      output.push(line);
      continue;
    }

    // Inside code blocks — pass through verbatim
    if (inCodeBlock) {
      output.push(line);
      continue;
    }

    let converted = line;

    // Headings → bold
    const headingMatch = converted.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/);
    if (headingMatch) {
      converted = `*${headingMatch[1]}*`;
      output.push(converted);
      continue;
    }

    // Horizontal rule → unicode line
    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(converted)) {
      output.push("──────────");
      continue;
    }

    // Checklist items
    const checklistMatch = converted.match(
      /^(\s*)(?:[-+*]|\d+\.)\s+\[( |x|X)\]\s+(.*)$/,
    );
    if (checklistMatch) {
      const marker = checklistMatch[2].toLowerCase() === "x" ? "✅" : "🔲";
      output.push(`${checklistMatch[1]}${marker} ${checklistMatch[3]}`);
      continue;
    }

    // Bold: **text** or __text__ → *text*  (Slack uses single asterisk)
    converted = converted.replace(/\*\*(.+?)\*\*/g, "*$1*");
    converted = converted.replace(/__(.+?)__/g, "*$1*");

    // Italic: *text* (single, non-bold) or _text_ → _text_  (Slack uses underscore)
    // Only convert single * that are NOT part of ** (already converted above)
    // Skip this for lines that only have single * from bold conversion
    // Slack already understands _italic_ so we only need to handle *italic*
    converted = converted.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "_$1_");

    // Links: [text](url) → <url|text>
    converted = converted.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      "<$2|$1>",
    );

    output.push(converted);
  }

  return output.join("\n");
}

/**
 * Format a message for Slack: convert markdown and split into parts.
 */
export function formatForSlack(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const converted = markdownToMrkdwn(text);
  const parts = splitText(converted, SLACK_MESSAGE_LIMIT);

  return parts.filter((p) => p.trim().length > 0);
}

/**
 * Format a tool info line for Slack (plain text, no markdown conversion needed).
 */
export function formatToolInfoForSlack(toolMessage: string): string {
  return toolMessage;
}
