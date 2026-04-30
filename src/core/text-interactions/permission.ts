import { opencodeClient } from "../../opencode/client.js";
import type { PermissionReply, PermissionRequest } from "../../permission/types.js";

interface PendingTextPermission {
  request: PermissionRequest;
  directory: string;
}

const permissionRequestsByRoute = new Map<string, PendingTextPermission>();

const PERMISSION_EMOJI: Record<string, string> = {
  bash: "💻",
  edit: "✏️",
  write: "📝",
  read: "📖",
  webfetch: "🌐",
  websearch: "🔍",
  glob: "📁",
  grep: "🔎",
  list: "📋",
  task: "📌",
  lsp: "🔧",
  external_directory: "📂",
};

export function formatTextPermissionMessage(request: PermissionRequest): string {
  const emoji = PERMISSION_EMOJI[request.permission] || "🔐";
  const patterns = request.patterns.join("\n");

  return `🔐 **Permission Request**\n\n**Type:** ${emoji} ${request.permission}\n\n**Patterns:**\n\`\`\`\n${patterns}\n\`\`\`\n\nPlease reply with:\n**/1** - Allow once\n**/2** - Always allow\n**/3** - Reject`;
}

export function getPermissionEmoji(permission: string): string {
  return PERMISSION_EMOJI[permission] || "🔐";
}

export function setPendingTextPermission(
  routeKey: string,
  request: PermissionRequest,
  directory: string,
): void {
  permissionRequestsByRoute.set(routeKey, { request, directory });
}

export function getPendingTextPermission(routeKey: string): PermissionRequest | null {
  return permissionRequestsByRoute.get(routeKey)?.request ?? null;
}

export function getPendingTextPermissionDirectory(routeKey: string): string | null {
  return permissionRequestsByRoute.get(routeKey)?.directory ?? null;
}

export function clearPendingTextPermission(routeKey?: string): void {
  if (routeKey) {
    permissionRequestsByRoute.delete(routeKey);
    return;
  }

  permissionRequestsByRoute.clear();
}

export function hasPendingTextPermission(routeKey: string): boolean {
  return permissionRequestsByRoute.has(routeKey);
}

export function hasAnyPendingTextPermission(): boolean {
  return permissionRequestsByRoute.size > 0;
}

export async function replyToTextPermission(params: {
  routeKey: string;
  directory?: string;
  reply: PermissionReply;
}): Promise<{ ok: boolean; label: string }> {
  const pending = permissionRequestsByRoute.get(params.routeKey);
  if (!pending) {
    return { ok: false, label: "⚠️ No pending permission request." };
  }

  const directory = params.directory ?? pending.directory;
  if (!directory) {
    return { ok: false, label: "❌ Missing session directory for permission reply." };
  }

  const { error } = await opencodeClient.permission.reply({
    requestID: pending.request.id,
    directory,
    reply: params.reply,
  });

  if (error) {
    return { ok: false, label: "❌ Failed to send permission reply. Please try again." };
  }

  clearPendingTextPermission(params.routeKey);

  const replyLabels: Record<PermissionReply, string> = {
    once: "✅ Allowed once",
    always: "✅ Always allowed",
    reject: "❌ Rejected",
  };

  return { ok: true, label: replyLabels[params.reply] };
}