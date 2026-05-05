import type { PermissionRequest } from "../permission/types.js";
import type { Question } from "../question/types.js";
import type { OpenClawRoute } from "./types.js";
import { getOpenClawRouteKey } from "./route.js";
import { sendOpenClawMessage } from "./client.js";
import { PlatformEventRouter } from "../core/events/platform-router.js";
import type { PlatformEventTarget } from "../core/events/types.js";
import { createSharedEventHandlers } from "../core/events/shared-handlers.js";
import {
  hasPendingTextPermission,
  handlePermissionReply,
} from "../core/text-interactions/permission.js";

interface OpenClawResponseTarget extends PlatformEventTarget {
  route: OpenClawRoute;
  routeKey: string;
  directory: string;
}

let activeTarget: OpenClawResponseTarget | null = null;

export function isOpenClawActive(): boolean {
  return activeTarget !== null;
}

export function setOpenClawActive(target: OpenClawResponseTarget): void {
  activeTarget = target;
}

export function clearOpenClawActive(): void {
  activeTarget = null;
}

// Create shared event handlers with OpenClaw-specific configuration
const sharedHandlers = createSharedEventHandlers<OpenClawResponseTarget>({
  platformName: "OpenClaw",
  getActiveTarget: () => activeTarget,
  clearActiveTarget: () => {
    activeTarget = null;
  },
  sendMessage: (target, text) => sendOpenClawMessage(target.route, text),
});

// Create platform router
let eventRouter: PlatformEventRouter | null = null;

export function installOpenClawEventRouting(): void {
  if (eventRouter) return;

  eventRouter = new PlatformEventRouter({
    platformName: "OpenClaw",
    isActive: isOpenClawActive,
    handlers: {
      onComplete: sharedHandlers.handleComplete,
      onTool: sharedHandlers.handleTool,
      onThinking: sharedHandlers.handleThinking,
      onTokens: sharedHandlers.handleTokens,
      onSessionError: sharedHandlers.handleSessionError,
      onSessionRetry: sharedHandlers.handleSessionRetry,
      onSessionIdle: sharedHandlers.handleIdle,
      onPermission: (request: PermissionRequest) => {
        const target = activeTarget;
        if (!target) return;
        void sharedHandlers.handlePermission(request, target.routeKey, target.directory);
      },
      onQuestion: (questions: Question[], requestID: string) => {
        sharedHandlers.handleQuestion(questions, requestID);
      },
      onQuestionError: () => {
        sharedHandlers.handleQuestionError();
      },
    },
  });

  eventRouter.install();
}

export function hasOpenClawPendingPermission(route: OpenClawRoute): boolean {
  return hasPendingTextPermission(getOpenClawRouteKey(route));
}

export async function handleOpenClawPermissionReply(
  route: OpenClawRoute,
  reply: "once" | "always" | "reject",
): Promise<string> {
  const routeKey = getOpenClawRouteKey(route);

  const { handled, result } = await handlePermissionReply({
    routeKey,
    reply,
    platformName: "OpenClaw",
    sendMessage: (message) => sendOpenClawMessage(route, message),
  });

  if (!handled) {
    return "⚠️ No pending permission request.";
  }

  return result?.label ?? "❌ Failed to send permission reply.";
}
