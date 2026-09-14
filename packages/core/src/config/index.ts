import { join } from "node:path";
import { createRegistry, CONFIG_SCHEMA_ID } from "../schema/index.js";
import { SchemaReferenceUnresolvedError, SchemaSetupError } from "../schema/errors.js";
import { loadYamlDocument } from "../internal/load-yaml-document.js";
import type { LoadResult } from "../result.js";
import type { BuildRailConfig } from "./types.js";
import type { ConfigError } from "./errors.js";

export type { BuildRailConfig } from "./types.js";
export type { ConfigError, ConfigErrorCode } from "./errors.js";

/**
 * `schemasDirOverride` is an internal-only test seam forwarded to
 * `createRegistry()` (see schema/registry.ts) — never part of the
 * documented public contract, never re-exported from the package's
 * public `index.ts` barrel. Every real caller invokes `loadConfig`
 * with a single `projectRoot` argument, unaffected by this parameter.
 */
export async function loadConfig(
  projectRoot: string,
  schemasDirOverride?: string,
): Promise<LoadResult<BuildRailConfig, ConfigError>> {
  let registry;
  try {
    registry = createRegistry(schemasDirOverride);
  } catch (error) {
    if (error instanceof SchemaReferenceUnresolvedError) {
      return {
        ok: false,
        error: {
          code: "SCHEMA_REFERENCE_UNRESOLVED",
          message: "BuildRail's schema installation has an unresolved internal reference.",
          details: error,
        },
      };
    }
    if (error instanceof SchemaSetupError) {
      return {
        ok: false,
        error: {
          code: "SCHEMA_SETUP_FAILED",
          message: "BuildRail's schema installation could not be constructed.",
          details: error,
        },
      };
    }
    throw error;
  }

  const filePath = join(projectRoot, ".buildrail", "config.yml");
  const outcome = await loadYamlDocument(filePath, {
    notFound: "CONFIG_NOT_FOUND" as const,
    readFailed: "CONFIG_READ_FAILED" as const,
    yamlInvalid: "CONFIG_YAML_INVALID" as const,
  });

  if (outcome.kind === "not-found") {
    return {
      ok: false,
      error: { code: outcome.code, message: ".buildrail/config.yml does not exist." },
    };
  }
  if (outcome.kind === "read-failed") {
    return {
      ok: false,
      error: {
        code: outcome.code,
        message: ".buildrail/config.yml could not be read.",
        details: outcome.details,
      },
    };
  }
  if (outcome.kind === "yaml-invalid") {
    return {
      ok: false,
      error: {
        code: outcome.code,
        message: ".buildrail/config.yml is not valid YAML.",
        details: outcome.details,
      },
    };
  }

  const validation = registry.validate(CONFIG_SCHEMA_ID, outcome.data);
  if (!validation.registered) {
    // Unreachable in practice: CONFIG_SCHEMA_ID is always registered by
    // createRegistry(). Surfaced distinctly rather than silently treated
    // as valid.
    return {
      ok: false,
      error: {
        code: "SCHEMA_SETUP_FAILED",
        message: "The config schema is not registered.",
      },
    };
  }
  if (!validation.result.valid) {
    return {
      ok: false,
      error: {
        code: "CONFIG_SCHEMA_INVALID",
        message: ".buildrail/config.yml does not satisfy config.schema.json.",
        details: validation.result.errors,
      },
    };
  }

  return {
    ok: true,
    value: { value: outcome.data as BuildRailConfig, diagnostics: outcome.diagnostics },
  };
}
