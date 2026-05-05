const TEXT_CANCEL_INPUTS = new Set([
  "cancel",
  "/cancel",
  "取消",
  "abbrechen",
  "annuler",
  "cancelar",
  "отмена",
]);

const TEXT_DELETE_INPUTS = new Set([
  "delete",
  "删除",
  "刪除",
  "löschen",
  "eliminar",
  "supprimer",
  "удалить",
]);

export function isTextInteractionCancelInput(text: string): boolean {
  return TEXT_CANCEL_INPUTS.has(text.trim().toLowerCase());
}

export function isTextInteractionDeleteInput(text: string): boolean {
  return TEXT_DELETE_INPUTS.has(text.trim().toLowerCase());
}
