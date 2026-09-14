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

export interface Candidate {
  branch: string | null;
  base_sha: string | null;
  candidate_sha: string | null;
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
