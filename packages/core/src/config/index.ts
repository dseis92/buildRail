import { join } from "node:path";
import { createRegistry, CONFIG_SCHEMA_ID, type SchemaRegistry } from "../schema/index.js";
import { SchemaReferenceUnresolvedError, SchemaSetupError } from "../schema/errors.js";
import { loadYamlDocument } from "../internal/load-yaml-document.js";
import type { LoadResult } from "../result.js";
import type { BuildRailConfig } from "./types.js";
import type { ConfigError } from "./errors.js";

/**
 * Constructs a SchemaRegistry via `registryFactory` and translates any
 * thrown registration-time exception into the corresponding typed
 * ConfigError, exactly as the public `loadConfig()` does — this is the
 * one, real implementation of that try/catch translation. NOT exported
 * from the package's public `index.ts` barrel. Test code reaches it via
 * the package-private `#internal/config/index.js` specifier, defined in
 * `packages/core/package.json`'s `"imports"` field, which Node resolves
 * only for code inside this package — never for an external consumer of
 * the published package. `registryFactory` lets tests inject
 * `() => createRegistryFromDir(fixtureDir)` (reached the same way, via
 * `#internal/schema/registry.js`) to exercise this exact translation
 * logic against deliberately broken fixture schemas, without a second
 * public parameter on `loadConfig` and without duplicating this logic.
 */
export function buildConfigRegistry(
  registryFactory: () => SchemaRegistry,
): { ok: true; registry: SchemaRegistry } | { ok: false; error: ConfigError } {
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

export type { BuildRailConfig } from "./types.js";
export type { ConfigError, ConfigErrorCode } from "./errors.js";

/**
 * The real implementation, parameterized over an already-constructed
 * `SchemaRegistry`. NOT exported from the package's public `index.ts`
 * barrel. Test code reaches it via the package-private
 * `#internal/config/index.js` specifier (see `buildConfigRegistry`'s
 * comment above), using `createRegistryFromDir` (via
 * `#internal/schema/registry.js`) to build a registry against fixture
 * schemas. This lets tests exercise the exact same downstream
 * loading/translation logic production uses, without a second public
 * parameter on `loadConfig` and without duplicating this function's body.
 */
export async function loadConfigWithRegistry(
  projectRoot: string,
  registry: SchemaRegistry,
): Promise<LoadResult<BuildRailConfig, ConfigError>> {
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

/**
 * The public, documented entry point: exactly one argument, `projectRoot`.
 * Always constructs its schema registry via the public, zero-argument
 * `createRegistry()` — BuildRail's own package-relative schemas, never a
 * caller-redirectable directory.
 */
export async function loadConfig(
  projectRoot: string,
): Promise<LoadResult<BuildRailConfig, ConfigError>> {
  const built = buildConfigRegistry(createRegistry);
  if (!built.ok) {
    return built;
  }
  return loadConfigWithRegistry(projectRoot, built.registry);
}
