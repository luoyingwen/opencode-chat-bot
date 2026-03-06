const DINGTALK_MESSAGE_LIMIT = 20000;

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

export function formatForDingTalk(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const parts = splitText(text, DINGTALK_MESSAGE_LIMIT);
  return parts.filter((p) => p.trim().length > 0);
}
