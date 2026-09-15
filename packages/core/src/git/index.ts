export { resolveRepository } from "./repository.js";
export { inspectHead } from "./head.js";
export { inspectWorkingTree } from "./workingTree.js";
export { inspectDiff } from "./diff.js";
export { matchProtectedPaths } from "./protectedPaths.js";

export type { GitError, GitErrorCode, GitResult } from "./errors.js";
export type {
  RepositoryInfo,
  HeadInfo,
  UpstreamInfo,
  WorkingTreeStatus,
  WorkingTreeEntry,
  WorkingTreeEntryKind,
  SubmoduleState,
  DiffRequest,
  DiffResult,
  DiffChange,
  DiffChangeKind,
  ProtectedPathCheckInput,
  ProtectedPathMatch,
  ProtectedPathMatchResult,
} from "./types.js";
