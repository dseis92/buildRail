import type { Authorization, Baseline, BuildRailState } from "../state/types.js";
import type { LifecycleState } from "../state/types.js";
import { checkImplementationAllowed, validateAuthorizationFields } from "../policy/index.js";
import type { Result } from "../result.js";
import {
  Actor,
  isDedicatedOperationEdge,
  isAuthorizationGatedEdge,
  isLegalTransition as graphIsLegalTransition,
  requiredActor as graphRequiredActor,
} from "./graph.js";
import type { TransitionError } from "./errors.js";

export type { Actor, TransitionRule } from "./graph.js";
export { TRANSITION_RULES } from "./graph.js";
export type { LifecycleError, LifecycleErrorCode, TransitionError } from "./errors.js";

export function isLegalTransition(from: LifecycleState, to: LifecycleState): boolean {
  return graphIsLegalTransition(from, to);
}

export function requiredActor(from: LifecycleState, to: LifecycleState): Actor | null | undefined {
  return graphRequiredActor(from, to);
}

const BASELINE_SHA_PATTERN = /^[0-9a-f]{40}$/;

/**
 * Pure, non-mutating: executes the 24 generic-apply edges of the 26-edge
 * legal graph. Fails with LIFECYCLE_TRANSITION_ILLEGAL if the pair isn't
 * graph-legal, LIFECYCLE_DEDICATED_OPERATION_REQUIRED for either of the 2
 * dedicated-operation edges, LIFECYCLE_AUTHORITY_REQUIRED if the actor is
 * wrong, or an AUTHORIZATION_* PolicyError for one of the 11
 * authorization-gated edges when the active-authorization check fails.
 */
export function applyTransition(
  state: BuildRailState,
  to: LifecycleState,
  actor: Actor,
): Result<BuildRailState, TransitionError> {
  const from = state.current.lifecycle_state;

  if (!graphIsLegalTransition(from, to)) {
    return {
      ok: false,
      error: { code: "LIFECYCLE_TRANSITION_ILLEGAL", message: `${from} -> ${to} is not a legal transition.` },
    };
  }

  const dedicatedOperation = isDedicatedOperationEdge(from, to);
  if (dedicatedOperation) {
    return {
      ok: false,
      error: {
        code: "LIFECYCLE_DEDICATED_OPERATION_REQUIRED",
        message: `${from} -> ${to} requires the dedicated operation ${dedicatedOperation}, not a generic applyTransition call.`,
        details: dedicatedOperation,
      },
    };
  }

  const requiredActorForEdge = graphRequiredActor(from, to);
  if (requiredActorForEdge !== null && requiredActorForEdge !== undefined && requiredActorForEdge !== actor) {
    return {
      ok: false,
      error: {
        code: "LIFECYCLE_AUTHORITY_REQUIRED",
        message: `${from} -> ${to} requires actor "${requiredActorForEdge}", not "${actor}".`,
      },
    };
  }

  if (isAuthorizationGatedEdge(from, to)) {
    const policyResult = checkImplementationAllowed(state, state.current.development_phase);
    if (!policyResult.ok) {
      return { ok: false, error: policyResult.error };
    }
  }

  return {
    ok: true,
    value: {
      ...state,
      current: { ...state.current, lifecycle_state: to },
    },
  };
}

/**
 * The dedicated operation for SPECIFIED -> AUTHORIZED. Pure, non-mutating.
 */
export function authorizeSpecifiedWork(
  state: BuildRailState,
  authorization: Authorization,
  actor: Actor,
): Result<BuildRailState, TransitionError> {
  if (state.current.lifecycle_state !== "SPECIFIED") {
    return {
      ok: false,
      error: { code: "LIFECYCLE_TRANSITION_ILLEGAL", message: "authorizeSpecifiedWork requires lifecycle_state SPECIFIED." },
    };
  }
  if (actor !== "human_owner") {
    return {
      ok: false,
      error: { code: "LIFECYCLE_AUTHORITY_REQUIRED", message: "authorizeSpecifiedWork requires actor human_owner." },
    };
  }
  const semanticResult = validateAuthorizationFields(authorization);
  if (!semanticResult.ok) {
    return { ok: false, error: semanticResult.error };
  }
  if (authorization.status !== "authorized") {
    return { ok: false, error: { code: "AUTHORIZATION_INACTIVE", message: 'authorization.status must be "authorized".' } };
  }
  if (authorization.id !== state.current.development_phase) {
    return {
      ok: false,
      error: { code: "AUTHORIZATION_PHASE_MISMATCH", message: "authorization.id must match current.development_phase." },
    };
  }

  return {
    ok: true,
    value: {
      ...state,
      current: { ...state.current, lifecycle_state: "AUTHORIZED" },
      authorization: { ...authorization },
    },
  };
}

export interface PhaseActivationRequest {
  newPhaseId: string;
  newAuthorization: Authorization;
}

function hasNoInFlightCandidate(state: BuildRailState): boolean {
  const candidate = state.candidate;
  if (candidate === undefined) return true;
  return candidate.branch === null && candidate.base_sha === null && candidate.candidate_sha === null;
}

/**
 * The dedicated cross-phase rollover operation — NOT a lifecycle-graph
 * edge. Pure, non-mutating. Requires the full closure-invariant
 * precondition of the current work item, with no BR0-bootstrap exception.
 */
export function activatePhase(
  state: BuildRailState,
  request: PhaseActivationRequest,
  actor: Actor,
): Result<BuildRailState, TransitionError> {
  if (actor !== "human_owner") {
    return { ok: false, error: { code: "LIFECYCLE_AUTHORITY_REQUIRED", message: "activatePhase requires actor human_owner." } };
  }

  const currentPhase = state.current.development_phase;
  const closureSatisfied =
    state.current.lifecycle_state === "FROZEN" &&
    state.authorization !== undefined &&
    state.authorization.status === "completed" &&
    state.authorization.id === currentPhase &&
    state.completed_phases.includes(currentPhase) &&
    state.baselines !== undefined &&
    state.baselines[currentPhase] !== undefined &&
    state.baselines[currentPhase]!.status === "frozen" &&
    hasNoInFlightCandidate(state);

  if (!closureSatisfied) {
    return {
      ok: false,
      error: { code: "LIFECYCLE_TRANSITION_ILLEGAL", message: "The current phase has not been fully closed; activatePhase requires complete closure invariants." },
    };
  }

  const newPhaseId = request.newPhaseId;
  if (
    (state.baselines !== undefined && state.baselines[newPhaseId] !== undefined) ||
    state.completed_phases.includes(newPhaseId)
  ) {
    return {
      ok: false,
      error: { code: "LIFECYCLE_TRANSITION_ILLEGAL", message: `Phase ${newPhaseId} has already been completed/baselined and cannot be reactivated.` },
    };
  }

  const newAuthorization = request.newAuthorization;
  const semanticResult = validateAuthorizationFields(newAuthorization);
  if (!semanticResult.ok) {
    return { ok: false, error: semanticResult.error };
  }
  if (newAuthorization.status !== "authorized") {
    return { ok: false, error: { code: "AUTHORIZATION_INACTIVE", message: 'newAuthorization.status must be "authorized".' } };
  }
  if (newAuthorization.id !== newPhaseId) {
    return { ok: false, error: { code: "AUTHORIZATION_PHASE_MISMATCH", message: "newAuthorization.id must equal request.newPhaseId." } };
  }

  const plannedPhases = state.planned_phases.filter((phase) => phase !== newPhaseId);

  return {
    ok: true,
    value: {
      ...state,
      current: { ...state.current, development_phase: newPhaseId, lifecycle_state: "AUTHORIZED" },
      authorization: { ...newAuthorization },
      planned_phases: plannedPhases,
    },
  };
}

export interface PhaseClosureRequest {
  approvedSha: string;
}

/**
 * The dedicated operation for PRODUCTION_VERIFIED -> FROZEN. Pure,
 * non-mutating. Composes checkImplementationAllowed verbatim as its
 * authorization check (phase A), then performs closure-specific checks
 * (phase B).
 */
export function completeAndFreezePhase(
  state: BuildRailState,
  request: PhaseClosureRequest,
  actor: Actor,
): Result<BuildRailState, TransitionError> {
  const phaseId = state.current.development_phase;

  // (A) Canonical authorization-policy check — composed, not reimplemented.
  const policyResult = checkImplementationAllowed(state, phaseId);
  if (!policyResult.ok) {
    return { ok: false, error: policyResult.error };
  }

  // (B) Closure-specific checks.
  if (state.current.lifecycle_state !== "PRODUCTION_VERIFIED") {
    return {
      ok: false,
      error: { code: "LIFECYCLE_TRANSITION_ILLEGAL", message: "completeAndFreezePhase requires lifecycle_state PRODUCTION_VERIFIED." },
    };
  }
  if (actor !== "human_owner") {
    return { ok: false, error: { code: "LIFECYCLE_AUTHORITY_REQUIRED", message: "completeAndFreezePhase requires actor human_owner." } };
  }
  if (state.completed_phases.includes(phaseId)) {
    return {
      ok: false,
      error: { code: "LIFECYCLE_TRANSITION_ILLEGAL", message: `Phase ${phaseId} is already present in completed_phases.` },
    };
  }
  if (state.baselines !== undefined && state.baselines[phaseId] !== undefined) {
    return {
      ok: false,
      error: { code: "LIFECYCLE_TRANSITION_ILLEGAL", message: `Phase ${phaseId} already has a baseline entry.` },
    };
  }
  if (!BASELINE_SHA_PATTERN.test(request.approvedSha)) {
    return { ok: false, error: { code: "BASELINE_SHA_INVALID", message: "request.approvedSha must match ^[0-9a-f]{40}$." } };
  }

  const newBaseline: Baseline = { approved_sha: request.approvedSha, status: "frozen" };
  const existingBaselines = state.baselines ?? {};

  return {
    ok: true,
    value: {
      ...state,
      current: { ...state.current, lifecycle_state: "FROZEN" },
      authorization: { ...(state.authorization as Authorization), status: "completed" },
      completed_phases: [...state.completed_phases, phaseId],
      baselines: { ...existingBaselines, [phaseId]: newBaseline },
      candidate: { branch: null, base_sha: null, candidate_sha: null },
    },
  };
}
