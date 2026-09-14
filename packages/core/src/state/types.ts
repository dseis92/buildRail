export type LifecycleState =
  | "IDEA"
  | "SPECIFIED"
  | "AUTHORIZED"
  | "PREFLIGHT"
  | "IMPLEMENTING"
  | "IMPLEMENTED"
  | "VERIFYING"
  | "PENDING_REVIEW"
  | "REVIEW_APPROVED"
  | "HUMAN_QA"
  | "MERGE_AUTHORIZED"
  | "MERGED"
  | "PRODUCTION_VERIFIED"
  | "FROZEN"
  | "BLOCKED"
  | "CORRECTION_REQUIRED";

export type AuthorizationStatus = "draft" | "authorized" | "in_progress" | "completed" | "revoked";

export interface Authorization {
  id: string;
  type: string;
  title: string;
  status: AuthorizationStatus;
  specification: string;
  granted_by: string;
  [key: string]: unknown;
}

// state.schema.json's `candidate` object declares no `required` array, so
// branch/base_sha/candidate_sha are each individually schema-optional
// within a present `candidate` object (in addition to `candidate` itself
// being absent, per `BuildRailState["candidate"]` below) — this loader
// type reflects that actual schema permissiveness; it is a distinct,
// stricter question whether activatePhase's semantic closure-invariant
// check accepts a given shape (see hasNoInFlightCandidate in
// lifecycle/index.ts, which requires all three fields explicitly null,
// not merely schema-valid).
export interface Candidate {
  branch?: string | null;
  base_sha?: string | null;
  candidate_sha?: string | null;
  [key: string]: unknown;
}

export interface Baseline {
  approved_sha: string;
  status: "frozen";
  [key: string]: unknown;
}

export interface BuildRailState {
  schema_version: number;
  project: { name: string; [key: string]: unknown };
  current: {
    lifecycle_state: LifecycleState;
    development_phase: string;
    [key: string]: unknown;
  };
  authorization?: Authorization;
  candidate?: Candidate;
  completed_phases: string[];
  planned_phases: string[];
  baselines?: Record<string, Baseline>;
  protected_systems?: unknown[];
  review: {
    independent_review?: "required" | "not_required";
    self_approval?: "forbidden" | "allowed";
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
