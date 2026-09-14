import type { Authorization, BuildRailState } from "../state/types.js";
import type { PolicyError, PolicyResult } from "./errors.js";

export type { PolicyError, PolicyErrorCode, PolicyResult } from "./errors.js";

const ACTIVE_STATUSES = new Set(["authorized", "in_progress"]);

/**
 * Returns whether state.authorization exists and its status is "authorized"
 * or "in_progress". Never returns, throws, or otherwise surfaces a
 * PolicyError code — "no authorization present" is simply `false`, the
 * same `false` as "an authorization is present but its status is
 * completed."
 */
export function isAuthorizationActive(state: BuildRailState): boolean {
  const authorization = state.authorization;
  if (!authorization) return false;
  return ACTIVE_STATUSES.has(authorization.status);
}

/**
 * Returns the authorization record if — and only if — it is active
 * ("authorized" or "in_progress"); otherwise `null`. Does not distinguish
 * among the various inactive reasons (absent, draft, completed, revoked).
 */
export function getActiveAuthorization(state: BuildRailState): Authorization | null {
  if (!isAuthorizationActive(state)) return null;
  return state.authorization ?? null;
}

/**
 * The single shared semantic-field validation path for an `Authorization`
 * record, checking ONLY: `specification` is a non-empty string, and
 * `granted_by === "human"`. Deliberately does not check `status` or `id`
 * — those are each caller's own operation-specific requirement (e.g.
 * `checkImplementationAllowed`'s active-status/phase-match checks,
 * `authorizeSpecifiedWork`'s `status === "authorized"` check,
 * `activatePhase`'s equivalent for `request.newAuthorization`).
 *
 * This is the one semantic-validation path shared by
 * `checkImplementationAllowed` (below), `authorizeSpecifiedWork`, and
 * `activatePhase` (both in `lifecycle/index.ts`, imported directly from
 * this module rather than duplicating this logic) — not part of the
 * package's public `index.ts` barrel; it is exported here only so
 * `lifecycle/index.ts` can import it directly.
 */
export function validateAuthorizationFields(authorization: Authorization): PolicyResult {
  if (typeof authorization.specification !== "string" || authorization.specification.length === 0) {
    return {
      ok: false,
      error: {
        code: "AUTHORIZATION_MISSING",
        message: "authorization.specification must be a non-empty string.",
      },
    };
  }
  if (authorization.granted_by !== "human") {
    return {
      ok: false,
      error: {
        code: "AUTHORIZATION_MISSING",
        message: "authorization.granted_by must be 'human'.",
        details: "authorization.granted_by must be 'human'",
      },
    };
  }
  return { ok: true };
}

function checkAuthorizationSemantics(authorization: Authorization, phaseId: string): PolicyResult {
  if (authorization.status === "revoked") {
    return {
      ok: false,
      error: { code: "AUTHORIZATION_REVOKED", message: "The authorization has been revoked." },
    };
  }
  if (!ACTIVE_STATUSES.has(authorization.status)) {
    return {
      ok: false,
      error: {
        code: "AUTHORIZATION_INACTIVE",
        message: `The authorization's status ("${authorization.status}") does not permit implementation.`,
      },
    };
  }
  if (authorization.id !== phaseId) {
    return {
      ok: false,
      error: {
        code: "AUTHORIZATION_PHASE_MISMATCH",
        message: `The active authorization (${authorization.id}) does not match the requested phase (${phaseId}).`,
      },
    };
  }
  return validateAuthorizationFields(authorization);
}

/**
 * Returns PolicyResult ok:true if an active authorization exists whose id
 * matches phaseId and whose semantic fields are well-formed; otherwise the
 * corresponding AUTHORIZATION_* failure — in the mandatory, mutually
 * exclusive order: MISSING -> REVOKED -> INACTIVE -> PHASE_MISMATCH ->
 * specification -> granted_by.
 */
export function authorizationCoversPhase(state: BuildRailState, phaseId: string): PolicyResult {
  const authorization = state.authorization;
  if (!authorization) {
    return {
      ok: false,
      error: { code: "AUTHORIZATION_MISSING", message: "No authorization is present." },
    };
  }
  return checkAuthorizationSemantics(authorization, phaseId);
}

/**
 * The composed, primary entry point. Performs the exact, mutually
 * exclusive check order from BR2 §13: MISSING -> REVOKED -> INACTIVE ->
 * PHASE_MISMATCH -> specification -> granted_by, returning the first
 * applicable failure or success if all pass.
 */
export function checkImplementationAllowed(state: BuildRailState, phaseId: string): PolicyResult {
  return authorizationCoversPhase(state, phaseId);
}
