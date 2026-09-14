import type { BuildRailError } from "../result.js";

export type StateErrorCode =
  | "STATE_NOT_FOUND"
  | "STATE_READ_FAILED"
  | "STATE_YAML_INVALID"
  | "STATE_SCHEMA_INVALID"
  | "SCHEMA_SETUP_FAILED"
  | "SCHEMA_REFERENCE_UNRESOLVED";

export interface StateError extends BuildRailError {
  code: StateErrorCode;
}
