import type { BuildRailError } from "../result.js";

export type PolicyErrorCode =
  | "AUTHORIZATION_MISSING"
  | "AUTHORIZATION_INACTIVE"
  | "AUTHORIZATION_REVOKED"
  | "AUTHORIZATION_PHASE_MISMATCH";

export interface PolicyError extends BuildRailError {
  code: PolicyErrorCode;
}

export type PolicyResult = { ok: true } | { ok: false; error: PolicyError };
