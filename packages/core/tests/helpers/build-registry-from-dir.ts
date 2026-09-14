import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { SchemaReferenceUnresolvedError, SchemaSetupError } from "@buildrail/core";

/**
 * Test-only helper mirroring createRegistry()'s registration logic
 * (§10/§11 of the BR2 specification), but pointed at an arbitrary
 * directory of schema files instead of the package's real
 * packages/core/schemas/. Used to exercise the schema error taxonomy
 * (SCHEMA_SETUP_FAILED / SCHEMA_REFERENCE_UNRESOLVED) against
 * deliberately broken fixture schemas without touching the real,
 * production schema registry.
 */
export function buildRegistryFromDir(
  dir: string,
  filenames: string[],
  targetSchemaId: string,
): void {
  const ajv = new Ajv2020({ allErrors: true });

  for (const filename of filenames) {
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

  let validateFn;
  try {
    validateFn = ajv.getSchema(targetSchemaId);
  } catch (error) {
    throw new SchemaReferenceUnresolvedError(`Unable to resolve $ref while compiling ${targetSchemaId}`, error);
  }
  if (!validateFn) {
    throw new SchemaReferenceUnresolvedError(`Schema ${targetSchemaId} failed to compile — an internal $ref could not be resolved`);
  }
}
