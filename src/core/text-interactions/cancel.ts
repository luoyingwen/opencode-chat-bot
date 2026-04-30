const TEXT_CANCEL_INPUTS = new Set(["取消", "cancel", "/cancel"]);

export function isTextInteractionCancelInput(text: string): boolean {
  return TEXT_CANCEL_INPUTS.has(text.trim().toLowerCase());
}