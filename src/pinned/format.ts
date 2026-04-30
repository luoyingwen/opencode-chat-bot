// Format utilities (extracted from pinned module)

export const DEFAULT_CONTEXT_LIMIT = 100000;

export function formatModelDisplayName(providerID?: string, modelID?: string): string {
  if (!providerID || !modelID) {
    return "Unknown Model";
  }
  return `${providerID}/${modelID}`;
}
