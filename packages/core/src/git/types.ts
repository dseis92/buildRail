export interface RepositoryInfo {
  root: string;
  gitDir: string;
  gitCommonDir: string;
  isWorktree: boolean;
}

export interface UpstreamInfo {
  remote: string;
  mergeRef: string;
  branch: string | null;
  ref: string | null;
  sha: string | null;
}

export interface HeadInfo {
  branch: string | null;
  detached: boolean;
  unborn: boolean;
  headSha: string | null;
  upstream: UpstreamInfo | null;
}

export type WorkingTreeEntryKind =
  | "staged_add"
  | "staged_modify"
  | "staged_delete"
  | "staged_rename"
  | "staged_type_change"
  | "unstaged_add"
  | "unstaged_modify"
  | "unstaged_delete"
  | "unstaged_rename"
  | "unstaged_type_change"
  | "untracked"
  | "conflicted";

export interface SubmoduleState {
  commitChanged: boolean;
  hasUntrackedContent: boolean;
  hasModifiedContent: boolean;
}

export interface WorkingTreeEntry {
  kind: WorkingTreeEntryKind;
  path: string;
  oldPath?: string;
  similarity?: number;
  submodule?: SubmoduleState;
}

export interface WorkingTreeStatus {
  clean: boolean;
  entries: WorkingTreeEntry[];
}

export interface DiffRequest {
  fromRef: string;
  toRef: string;
}

export type DiffChangeKind = "added" | "modified" | "deleted" | "renamed" | "type_changed";

export interface DiffChange {
  kind: DiffChangeKind;
  path: string;
  oldPath?: string;
  similarity?: number;
}

export interface DiffResult {
  fromSha: string;
  toSha: string;
  changes: DiffChange[];
}

export interface ProtectedPathCheckInput {
  path: string;
  origin: "current" | "old_side_of_rename";
}

export interface ProtectedPathMatch {
  path: string;
  matchedVia: "path" | "oldPath";
  system: import("../config/types.js").ProtectedSystem;
}

export interface ProtectedPathMatchResult {
  matches: ProtectedPathMatch[];
  invalidInputs: ProtectedPathCheckInput[];
  invalidPatterns: string[];
}
