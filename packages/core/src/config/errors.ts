import type { BuildRailError } from "../result.js";

export type ConfigErrorCode =
  | "CONFIG_NOT_FOUND"
  | "CONFIG_READ_FAILED"
  | "CONFIG_YAML_INVALID"
  | "CONFIG_SCHEMA_INVALID"
  | "SCHEMA_SETUP_FAILED"
  | "SCHEMA_REFERENCE_UNRESOLVED";

export interface ConfigError extends BuildRailError {
  code: ConfigErrorCode;
}
