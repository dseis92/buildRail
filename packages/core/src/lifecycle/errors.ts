import type { BuildRailError } from "../result.js";
import type { PolicyError } from "../policy/errors.js";

export type LifecycleErrorCode =
  | "LIFECYCLE_TRANSITION_ILLEGAL"
  | "LIFECYCLE_DEDICATED_OPERATION_REQUIRED"
  | "LIFECYCLE_AUTHORITY_REQUIRED"
  | "BASELINE_SHA_INVALID"
  | "INTERNAL_UNSUPPORTED";

export interface LifecycleError extends BuildRailError {
  code: LifecycleErrorCode;
}

/**
 * The one, explicit error-type union used by every lifecycle-engine
 * function that can fail for either a graph/authority reason or an
 * authorization-policy reason.
 */
export type TransitionError = LifecycleError | PolicyError;
