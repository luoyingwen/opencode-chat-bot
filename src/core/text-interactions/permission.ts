import { opencodeClient } from "../../opencode/client.js";
import type { PermissionReply, PermissionRequest } from "../../permission/types.js";
import { isAutoConfirmEnabled } from "../../permission/auto-confirm.js";
import { logger } from "../../utils/logger.js";

interface PendingTextPermission {
  request: PermissionRequest;
  directory: string;
}

// Store multiple pending permissions per route (keyed by request ID)
const permissionRequestsByRoute = new Map<string, Map<string, PendingTextPermission>>();

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
  if (!permissionRequestsByRoute.has(routeKey)) {
    permissionRequestsByRoute.set(routeKey, new Map());
  }
  const routeMap = permissionRequestsByRoute.get(routeKey)!;
  routeMap.set(request.id, { request, directory });
}

export function getPendingTextPermission(routeKey: string): PermissionRequest | null {
  const routeMap = permissionRequestsByRoute.get(routeKey);
  if (!routeMap || routeMap.size === 0) {
    return null;
  }
  // Return the most recently added permission (last entry in the map)
  const entries = Array.from(routeMap.values());
  return entries[entries.length - 1].request;
}

export function getPendingTextPermissionDirectory(routeKey: string): string | null {
  const routeMap = permissionRequestsByRoute.get(routeKey);
  if (!routeMap || routeMap.size === 0) {
    return null;
  }
  // Return directory for the most recently added permission
  const entries = Array.from(routeMap.values());
  return entries[entries.length - 1].directory;
}

export function clearPendingTextPermission(routeKey?: string, requestID?: string): void {
  if (routeKey && requestID) {
    // Clear specific permission request
    const routeMap = permissionRequestsByRoute.get(routeKey);
    if (routeMap) {
      routeMap.delete(requestID);
      if (routeMap.size === 0) {
        permissionRequestsByRoute.delete(routeKey);
      }
    }
    return;
  }

  if (routeKey) {
    // Clear all permissions for a route
    permissionRequestsByRoute.delete(routeKey);
    return;
  }

  // Clear all permissions
  permissionRequestsByRoute.clear();
}

export function hasPendingTextPermission(routeKey: string): boolean {
  const routeMap = permissionRequestsByRoute.get(routeKey);
  return routeMap !== undefined && routeMap.size > 0;
}

export function hasAnyPendingTextPermission(): boolean {
  for (const routeMap of permissionRequestsByRoute.values()) {
    if (routeMap.size > 0) {
      return true;
    }
  }
  return false;
}

export function getPendingTextPermissionCount(routeKey: string): number {
  return permissionRequestsByRoute.get(routeKey)?.size ?? 0;
}

export interface HandlePermissionResult {
  action: "auto-approved" | "needs-approval";
  permission: PermissionRequest;
  autoConfirmResult?: { ok: boolean; label: string; handledCount: number };
}

export async function handlePermissionRequest(params: {
  routeKey: string;
  request: PermissionRequest;
  directory: string;
  sessionId: string;
}): Promise<HandlePermissionResult> {
  const { routeKey, request, directory, sessionId } = params;

  // Store permission request FIRST (needed for both auto-confirm and manual reply)
  setPendingTextPermission(routeKey, request, directory);

  // Check if auto-confirm is enabled for this session
  if (isAutoConfirmEnabled(sessionId)) {
    // Auto-approve with "always"
    const result = await replyToTextPermission({
      routeKey,
      directory,
      reply: "always",
    });

    return {
      action: "auto-approved",
      permission: request,
      autoConfirmResult: {
        ok: result.ok,
        label: result.label,
        handledCount: result.ok ? 1 : 0,
      },
    };
  }

  // Manual approval needed
  return {
    action: "needs-approval",
    permission: request,
  };
}

export async function replyToTextPermission(params: {
  routeKey: string;
  directory?: string;
  reply: PermissionReply;
}): Promise<{ ok: boolean; label: string }> {
  const routeMap = permissionRequestsByRoute.get(params.routeKey);
  if (!routeMap || routeMap.size === 0) {
    return { ok: false, label: "⚠️ No pending permission request." };
  }

  // Get the most recently added permission (last entry)
  const entries = Array.from(routeMap.entries());
  const [, pending] = entries[entries.length - 1];
  const permissionType = pending.request.permission;

  // Find ALL pending requests with the same permission type
  const sameTypeRequests = entries.filter(
    ([_id, entry]) => entry.request.permission === permissionType,
  );

  const directory = params.directory ?? pending.directory;
  if (!directory) {
    return { ok: false, label: "❌ Missing session directory for permission reply." };
  }

  // Send replies for ALL requests with the same permission type (in parallel)
  const replyPromises = sameTypeRequests.map(([id, _entry]) =>
    opencodeClient.permission.reply({
      requestID: id,
      directory,
      reply: params.reply,
    }),
  );

  const results = await Promise.all(replyPromises);

  // Check if any failed
  const failedCount = results.filter((r) => r.error).length;
  if (failedCount > 0) {
    return {
      ok: false,
      label: `❌ Failed to send ${failedCount} of ${sameTypeRequests.length} permission replies. Please try again.`,
    };
  }

  // Clear all permissions of the same type
  for (const [id] of sameTypeRequests) {
    clearPendingTextPermission(params.routeKey, id);
  }

  const replyLabels: Record<PermissionReply, string> = {
    once: "✅ Allowed once",
    always: "✅ Always allowed",
    reject: "❌ Rejected",
  };

  const emoji = getPermissionEmoji(permissionType);
  const handledCount = sameTypeRequests.length;
  const remainingCount = getPendingTextPermissionCount(params.routeKey);

  let message = `${replyLabels[params.reply]} (${emoji} ${permissionType} - ${handledCount} request(s) handled)`;

  if (remainingCount > 0) {
    message += `\n\n⚠️ ${remainingCount} other permission request(s) pending (different type).`;
  }

  return { ok: true, label: message };
}

export interface HandlePermissionReplyParams {
  routeKey: string;
  reply: PermissionReply;
  platformName: string;
  sendMessage: (message: string) => Promise<void> | void;
}

export async function handlePermissionReply(
  params: HandlePermissionReplyParams,
): Promise<{ handled: boolean; result?: { ok: boolean; label: string } }> {
  const { routeKey, reply, platformName, sendMessage } = params;

  // Check if pending permission exists
  if (!hasPendingTextPermission(routeKey)) {
    logger.debug(`[${platformName}] No pending permission request for routeKey=${routeKey}`);
    return { handled: false };
  }

  logger.info(`[${platformName}] Sending permission reply: ${reply}, routeKey=${routeKey}`);

  // Send reply to OpenCode
  const result = await replyToTextPermission({ routeKey, reply });

  // Send result message to user
  await sendMessage(result.label);

  if (!result.ok) {
    logger.error(`[${platformName}] Failed to send permission reply`);
    return { handled: true, result };
  }

  logger.info(`[${platformName}] Permission reply sent successfully`);
  return { handled: true, result };
}