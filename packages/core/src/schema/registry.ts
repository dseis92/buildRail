import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
// Ajv v8's default export is Draft-07 only; Draft 2020-12 support (which
// every BR2-registered schema declares via "$schema") requires importing
// the dedicated 2020-12 entry point, via its named `Ajv2020` export.
import { SchemaReferenceUnresolvedError, SchemaSetupError } from "./errors.js";

/**
 * The closed set of schema $ids BR2's registry actually registers. A typed
 * caller (loadConfig, loadState) can only ever pass one of these three
 * values — TypeScript rejects anything else at compile time.
 */
export type Br2SchemaId =
  | "https://buildrail.dev/schemas/config.schema.json"
  | "https://buildrail.dev/schemas/state.schema.json"
  | "https://buildrail.dev/schemas/authorization.schema.json";

export const CONFIG_SCHEMA_ID: Br2SchemaId = "https://buildrail.dev/schemas/config.schema.json";
export const STATE_SCHEMA_ID: Br2SchemaId = "https://buildrail.dev/schemas/state.schema.json";
export const AUTHORIZATION_SCHEMA_ID: Br2SchemaId =
  "https://buildrail.dev/schemas/authorization.schema.json";

export interface SchemaValidationErrorDetail {
  path: string;
  message: string;
  keyword: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationErrorDetail[];
}

/**
 * Runtime result distinguishes "schema not registered" from an ordinary
 * document-invalid outcome — these are different failure classes and must
 * not be conflated.
 */
export type SchemaValidateResult =
  | { registered: true; result: SchemaValidationResult }
  | { registered: false };

export interface SchemaRegistry {
  validate(schemaId: Br2SchemaId, data: unknown): SchemaValidateResult;
}

const REGISTERED_SCHEMA_FILENAMES = [
  "authorization.schema.json",
  "config.schema.json",
  "state.schema.json",
] as const;

function schemasDir(): string {
  // Compiles to packages/core/dist/schema/registry.js — package-relative,
  // never process.cwd()-relative, so changing the invoking shell's cwd
  // never changes which schema files get loaded.
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return join(moduleDir, "..", "..", "schemas");
}

function normalizeAjvErrors(errors: ErrorObject[] | null | undefined): SchemaValidationErrorDetail[] {
  if (!errors) return [];
  return errors.map((error) => {
    const segments = error.instancePath
      .split("/")
      .filter((segment) => segment.length > 0);
    // For a `required`-keyword failure, Ajv's instancePath points at the
    // *containing* object (e.g. "/authorization"), not the missing
    // property itself — the missing property's name is instead in
    // error.params.missingProperty (e.g. "granted_by"). Append it so the
    // normalized path names the actual missing field
    // ("authorization.granted_by"), not merely its container
    // ("authorization"). Every other validation-keyword's path is left
    // exactly as instancePath alone produces.
    if (error.keyword === "required") {
      const missingProperty = (error.params as { missingProperty?: string } | undefined)?.missingProperty;
      if (typeof missingProperty === "string" && missingProperty.length > 0) {
        segments.push(missingProperty);
      }
    }
    return {
      path: segments.join("."),
      message: error.message ?? "",
      keyword: error.keyword,
    };
  });
}

/**
 * Registers exactly the three BR2-scoped schemas
 * (config/state/authorization) via Ajv2020, resolving state.schema.json's
 * relative $ref to authorization.schema.json through the validator's own
 * registry — no schema file text is rewritten.
 *
 * Throws `SchemaReferenceUnresolvedError` when every schema file loaded and
 * parsed fine but an internal `$ref` among them could not be resolved.
 * Throws `SchemaSetupError` for every other registration-time failure
 * (missing/unreadable/malformed schema file).
 *
 * This is the real registration algorithm; it is intentionally NOT
 * exported from `schema/index.ts` or the package's public `index.ts`
 * barrel — only reachable via a direct relative import into this file
 * (e.g. from test code). This keeps the schema *directory* itself
 * entirely out of the public API surface: the public `createRegistry()`
 * below always calls this with the package's own real `schemasDir()`,
 * with no way for any public caller to redirect it elsewhere.
 */
export function createRegistryFromDir(dir: string): SchemaRegistry {
  const ajv = new Ajv2020({ allErrors: true });

  const compiled = new Map<Br2SchemaId, ValidateFunction>();

  for (const filename of REGISTERED_SCHEMA_FILENAMES) {
    const filePath = join(dir, filename);
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf8");
    } catch (error) {
      throw new SchemaSetupError(`Unable to read schema asset: ${filename}`, error);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new SchemaSetupError(`Schema asset is not valid JSON: ${filename}`, error);
    }

    try {
      ajv.addSchema(parsed as Record<string, unknown>);
    } catch (error) {
      throw new SchemaSetupError(`Failed to register schema asset: ${filename}`, error);
    }
  }

  for (const [schemaId, filename] of [
    [CONFIG_SCHEMA_ID, "config.schema.json"],
    [STATE_SCHEMA_ID, "state.schema.json"],
    [AUTHORIZATION_SCHEMA_ID, "authorization.schema.json"],
  ] as const) {
    let validateFn: ValidateFunction | undefined;
    try {
      validateFn = ajv.getSchema(schemaId);
    } catch (error) {
      throw new SchemaReferenceUnresolvedError(
        `Unable to resolve $ref while compiling ${filename}`,
        error,
      );
    }
    if (!validateFn) {
      throw new SchemaReferenceUnresolvedError(
        `Schema ${schemaId} (${filename}) failed to compile — an internal $ref could not be resolved`,
      );
    }
    compiled.set(schemaId, validateFn);
  }

  return {
    validate(schemaId: Br2SchemaId, data: unknown): SchemaValidateResult {
      const validateFn = compiled.get(schemaId);
      if (!validateFn) {
        return { registered: false };
      }
      const valid = validateFn(data);
      return {
        registered: true,
        result: {
          valid: Boolean(valid),
          errors: normalizeAjvErrors(validateFn.errors),
        },
      };
    },
  };
}

/**
 * The public, documented entry point: takes no arguments and always
 * registers BuildRail's own package-relative schemas
 * (`packages/core/schemas/`) via `schemasDir()` — never `process.cwd()`,
 * never a caller-supplied directory. There is no way to redirect schema
 * loading elsewhere through this function's public signature.
 */
export function createRegistry(): SchemaRegistry {
  return createRegistryFromDir(schemasDir());
}
