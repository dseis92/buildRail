export type ProtectedSystemStatus = "open" | "guarded" | "frozen" | "locked";

export interface ProtectedSystem {
  name: string;
  status: ProtectedSystemStatus;
  paths: string[];
  [key: string]: unknown;
}

export interface QualityGate {
  command: string;
  required: boolean;
  note?: string;
  [key: string]: unknown;
}

export interface BuildRailConfig {
  schema_version: number;
  project: { name: string; default_branch: string; [key: string]: unknown };
  git?: {
    force_push?: "allowed" | "forbidden";
    destructive_reset?: "allowed" | "forbidden";
    direct_default_branch_push?: "allowed" | "forbidden";
    [key: string]: unknown;
  };
  change_control?: {
    additive_by_default?: boolean;
    unexpected_deletion?: "allow" | "stop" | "warn";
    unexpected_rename?: "allow" | "stop" | "warn";
    [key: string]: unknown;
  };
  review?: {
    require_independent_review?: boolean;
    require_exact_candidate_sha?: boolean;
    self_approval?: "allowed" | "forbidden";
    [key: string]: unknown;
  };
  human_qa?: { enabled?: boolean; [key: string]: unknown };
  quality_gates?: Record<string, QualityGate>;
  protected_systems?: ProtectedSystem[];
  [key: string]: unknown;
}
