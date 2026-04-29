// File change types (extracted from pinned module)

export interface FileChange {
  path?: string;
  file?: string;
  diff?: string;
  status?: string;
  additions?: number;
  deletions?: number;
}
