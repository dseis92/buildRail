import { join } from "node:path";
import { createRegistry, STATE_SCHEMA_ID, type SchemaRegistry } from "../schema/index.js";
import { SchemaReferenceUnresolvedError, SchemaSetupError } from "../schema/errors.js";
import { loadYamlDocument } from "../internal/load-yaml-document.js";
import type { LoadResult } from "../result.js";
import type { BuildRailState } from "./types.js";
import type { StateError } from "./errors.js";

export type {
  BuildRailState,
  Authorization,
  AuthorizationStatus,
  Candidate,
  Baseline,
  LifecycleState,
} from "./types.js";
export type { StateError, StateErrorCode } from "./errors.js";

/**
 * Constructs a SchemaRegistry via `registryFactory` and translates any
 * thrown registration-time exception into the corresponding typed
 * StateError, exactly as the public `loadState()` does — this is the
 * one, real implementation of that try/catch translation. NOT exported
 * from the package's public `index.ts` barrel; only reachable via a
 * direct relative import into this file. `registryFactory` lets tests
 * inject `() => createRegistryFromDir(fixtureDir)` (see
 * `../schema/registry.js`) to exercise this exact translation logic
 * against deliberately broken fixture schemas, without a second public
 * parameter on `loadState` and without duplicating this logic.
 */
export function buildStateRegistry(
  registryFactory: () => SchemaRegistry,
): { ok: true; registry: SchemaRegistry } | { ok: false; error: StateError } {
  try {
    return { ok: true, registry: registryFactory() };
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
}

/**
 * The real implementation, parameterized over an already-constructed
 * `SchemaRegistry`. NOT exported from the package's public `index.ts`
 * barrel — only reachable via a direct relative import into this file
 * (e.g. from test code, using `createRegistryFromDir` from
 * `../schema/registry.js` to build a registry against fixture schemas).
 * This lets tests exercise the exact same downstream loading/translation
 * logic production uses, without a second public parameter on
 * `loadState` and without duplicating this function's body.
 */
export async function loadStateWithRegistry(
  projectRoot: string,
  registry: SchemaRegistry,
): Promise<LoadResult<BuildRailState, StateError>> {
  const filePath = join(projectRoot, ".buildrail", "state.yml");
  const outcome = await loadYamlDocument(filePath, {
    notFound: "STATE_NOT_FOUND" as const,
    readFailed: "STATE_READ_FAILED" as const,
    yamlInvalid: "STATE_YAML_INVALID" as const,
  });

  if (outcome.kind === "not-found") {
    return {
      ok: false,
      error: { code: outcome.code, message: ".buildrail/state.yml does not exist." },
    };
  }
  if (outcome.kind === "read-failed") {
    return {
      ok: false,
      error: {
        code: outcome.code,
        message: ".buildrail/state.yml could not be read.",
        details: outcome.details,
      },
    };
  }
  if (outcome.kind === "yaml-invalid") {
    return {
      ok: false,
      error: {
        code: outcome.code,
        message: ".buildrail/state.yml is not valid YAML.",
        details: outcome.details,
      },
    };
  }

  const validation = registry.validate(STATE_SCHEMA_ID, outcome.data);
  if (!validation.registered) {
    return {
      ok: false,
      error: {
        code: "SCHEMA_SETUP_FAILED",
        message: "The state schema is not registered.",
      },
    };
  }
  if (!validation.result.valid) {
    return {
      ok: false,
      error: {
        code: "STATE_SCHEMA_INVALID",
        message: ".buildrail/state.yml does not satisfy state.schema.json.",
        details: validation.result.errors,
      },
    };
  }

  return {
    ok: true,
    value: { value: outcome.data as BuildRailState, diagnostics: outcome.diagnostics },
  };
}

/**
 * The public, documented entry point: exactly one argument, `projectRoot`.
 * Always constructs its schema registry via the public, zero-argument
 * `createRegistry()` — BuildRail's own package-relative schemas, never a
 * caller-redirectable directory.
 */
export async function loadState(
  projectRoot: string,
): Promise<LoadResult<BuildRailState, StateError>> {
  const built = buildStateRegistry(createRegistry);
  if (!built.ok) {
    return built;
  }
  return loadStateWithRegistry(projectRoot, built.registry);
}
