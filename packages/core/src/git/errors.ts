import type { BuildRailError } from "../result.js";

export type GitErrorCode =
  | "GIT_EXECUTABLE_UNAVAILABLE"
  | "GIT_VERSION_UNSUPPORTED"
  | "PROJECT_ROOT_NOT_FOUND"
  | "NOT_A_GIT_REPOSITORY"
  | "PROJECT_ROOT_MISMATCH"
  | "BARE_REPOSITORY_UNSUPPORTED"
  | "UNSUPPORTED_OBJECT_FORMAT"
  | "UNSUPPORTED_REF_FORMAT"
  | "EXTERNAL_GIT_FILTER_UNSUPPORTED"
  | "UNSAFE_SUBMODULE_PATH"
  | "HEAD_UNAVAILABLE"
  | "REF_NOT_FOUND"
  | "GIT_COMMAND_FAILED"
  | "MALFORMED_GIT_OUTPUT";

export interface GitError extends BuildRailError {
  code: GitErrorCode;
}

export type GitResult<T> = { ok: true; value: T } | { ok: false; error: GitError };

export function gitError(code: GitErrorCode, message: string, details?: unknown): GitError {
  return details === undefined ? { code, message } : { code, message, details };
}

export function gitOk<T>(value: T): GitResult<T> {
  return { ok: true, value };
}

export function gitFail<T>(code: GitErrorCode, message: string, details?: unknown): GitResult<T> {
  return { ok: false, error: gitError(code, message, details) };
}
