import type { LifecycleState } from "../state/types.js";

export type Actor = "human_owner" | "independent_reviewer" | "implementation_agent";

export interface TransitionRule {
  from: LifecycleState;
  to: LifecycleState;
  requiredActor: Actor | null;
}

/**
 * The complete, authoritative TransitionRule[] table from BR2
 * specification §15 — exactly 26 legal directed edges: 13 primary-path +
 * 5 BLOCKED entries + 5 BLOCKED returns + 2 CORRECTION_REQUIRED entries +
 * 1 CORRECTION_REQUIRED return.
 */
export const TRANSITION_RULES: TransitionRule[] = [
  // Primary path (13 edges)
  { from: "IDEA", to: "SPECIFIED", requiredActor: null },
  { from: "SPECIFIED", to: "AUTHORIZED", requiredActor: "human_owner" },
  { from: "AUTHORIZED", to: "PREFLIGHT", requiredActor: "implementation_agent" },
  { from: "PREFLIGHT", to: "IMPLEMENTING", requiredActor: "implementation_agent" },
  { from: "IMPLEMENTING", to: "IMPLEMENTED", requiredActor: "implementation_agent" },
  { from: "IMPLEMENTED", to: "VERIFYING", requiredActor: "implementation_agent" },
  { from: "VERIFYING", to: "PENDING_REVIEW", requiredActor: "implementation_agent" },
  { from: "PENDING_REVIEW", to: "REVIEW_APPROVED", requiredActor: "independent_reviewer" },
  { from: "REVIEW_APPROVED", to: "HUMAN_QA", requiredActor: "human_owner" },
  { from: "HUMAN_QA", to: "MERGE_AUTHORIZED", requiredActor: "human_owner" },
  { from: "MERGE_AUTHORIZED", to: "MERGED", requiredActor: null },
  { from: "MERGED", to: "PRODUCTION_VERIFIED", requiredActor: "human_owner" },
  { from: "PRODUCTION_VERIFIED", to: "FROZEN", requiredActor: "human_owner" },

  // BLOCKED entries (5)
  { from: "PREFLIGHT", to: "BLOCKED", requiredActor: "implementation_agent" },
  { from: "IMPLEMENTING", to: "BLOCKED", requiredActor: "implementation_agent" },
  { from: "IMPLEMENTED", to: "BLOCKED", requiredActor: "implementation_agent" },
  { from: "VERIFYING", to: "BLOCKED", requiredActor: "implementation_agent" },
  { from: "PENDING_REVIEW", to: "BLOCKED", requiredActor: "implementation_agent" },

  // BLOCKED returns (5)
  { from: "BLOCKED", to: "PREFLIGHT", requiredActor: "human_owner" },
  { from: "BLOCKED", to: "IMPLEMENTING", requiredActor: "human_owner" },
  { from: "BLOCKED", to: "IMPLEMENTED", requiredActor: "human_owner" },
  { from: "BLOCKED", to: "VERIFYING", requiredActor: "human_owner" },
  { from: "BLOCKED", to: "PENDING_REVIEW", requiredActor: "human_owner" },

  // CORRECTION_REQUIRED entries (2)
  { from: "PENDING_REVIEW", to: "CORRECTION_REQUIRED", requiredActor: "independent_reviewer" },
  { from: "HUMAN_QA", to: "CORRECTION_REQUIRED", requiredActor: "human_owner" },

  // CORRECTION_REQUIRED return (1)
  { from: "CORRECTION_REQUIRED", to: "IMPLEMENTING", requiredActor: "implementation_agent" },
];

/** The 2 edges that are graph-legal but require a dedicated operation. */
export const DEDICATED_OPERATION_EDGES: ReadonlyArray<{ from: LifecycleState; to: LifecycleState; operation: string }> = [
  { from: "SPECIFIED", to: "AUTHORIZED", operation: "authorizeSpecifiedWork" },
  { from: "PRODUCTION_VERIFIED", to: "FROZEN", operation: "completeAndFreezePhase" },
];

/** The 11 edges for which applyTransition composes checkImplementationAllowed. */
export const AUTHORIZATION_GATED_EDGES: ReadonlyArray<{ from: LifecycleState; to: LifecycleState }> = [
  { from: "AUTHORIZED", to: "PREFLIGHT" },
  { from: "PREFLIGHT", to: "IMPLEMENTING" },
  { from: "IMPLEMENTING", to: "IMPLEMENTED" },
  { from: "IMPLEMENTED", to: "VERIFYING" },
  { from: "VERIFYING", to: "PENDING_REVIEW" },
  { from: "BLOCKED", to: "PREFLIGHT" },
  { from: "BLOCKED", to: "IMPLEMENTING" },
  { from: "BLOCKED", to: "IMPLEMENTED" },
  { from: "BLOCKED", to: "VERIFYING" },
  { from: "BLOCKED", to: "PENDING_REVIEW" },
  { from: "CORRECTION_REQUIRED", to: "IMPLEMENTING" },
];

function ruleFor(from: LifecycleState, to: LifecycleState): TransitionRule | undefined {
  return TRANSITION_RULES.find((rule) => rule.from === from && rule.to === to);
}

export function isLegalTransition(from: LifecycleState, to: LifecycleState): boolean {
  return ruleFor(from, to) !== undefined;
}

export function requiredActor(from: LifecycleState, to: LifecycleState): Actor | null | undefined {
  const rule = ruleFor(from, to);
  if (!rule) return undefined;
  return rule.requiredActor;
}

export function isDedicatedOperationEdge(from: LifecycleState, to: LifecycleState): string | undefined {
  const edge = DEDICATED_OPERATION_EDGES.find((e) => e.from === from && e.to === to);
  return edge?.operation;
}

export function isAuthorizationGatedEdge(from: LifecycleState, to: LifecycleState): boolean {
  return AUTHORIZATION_GATED_EDGES.some((e) => e.from === from && e.to === to);
}
