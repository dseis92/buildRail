import { readFile } from "node:fs/promises";
import * as YAML from "yaml";
import type { GovernanceDiagnostic } from "../result.js";

const MAX_ALIAS_COUNT = 100;

export type YamlLoadOutcome<NotFoundCode extends string, ReadFailedCode extends string, YamlInvalidCode extends string> =
  | { kind: "not-found"; code: NotFoundCode }
  | { kind: "read-failed"; code: ReadFailedCode; details: unknown }
  | { kind: "yaml-invalid"; code: YamlInvalidCode; details: unknown }
  | { kind: "parsed"; data: unknown; diagnostics: GovernanceDiagnostic[] };

/**
 * Reads and parses a YAML file per the BR2 specification's YAML contract:
 * `YAML.parseDocument(text, { logLevel: "error" })` (never bare
 * `YAML.parse`), inspecting `doc.errors`/`doc.warnings` explicitly, and
 * `doc.toJS({ maxAliasCount: 100 })` for resource-exhaustion safety (never
 * `maxAliasCount: -1`). Never lets the library print anything to
 * stdout/stderr, and never lets a raw parser/conversion exception escape.
 */
export async function loadYamlDocument<
  NotFoundCode extends string,
  ReadFailedCode extends string,
  YamlInvalidCode extends string,
>(
  filePath: string,
  codes: { notFound: NotFoundCode; readFailed: ReadFailedCode; yamlInvalid: YamlInvalidCode },
): Promise<YamlLoadOutcome<NotFoundCode, ReadFailedCode, YamlInvalidCode>> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return { kind: "not-found", code: codes.notFound };
    }
    return { kind: "read-failed", code: codes.readFailed, details: err.message };
  }

  const doc = YAML.parseDocument(text, { logLevel: "error" });

  if (doc.errors.length > 0) {
    const first = doc.errors[0];
    return {
      kind: "yaml-invalid",
      code: codes.yamlInvalid,
      details: first ? first.message : "YAML parse error",
    };
  }

  let data: unknown;
  try {
    data = doc.toJS({ maxAliasCount: MAX_ALIAS_COUNT });
  } catch (error) {
    return {
      kind: "yaml-invalid",
      code: codes.yamlInvalid,
      details: error instanceof Error ? error.message : String(error),
    };
  }

  if (data === undefined || data === null) {
    return { kind: "yaml-invalid", code: codes.yamlInvalid, details: "Empty YAML document" };
  }

  const diagnostics: GovernanceDiagnostic[] = doc.warnings.map((warning) => ({
    severity: "warning" as const,
    message: warning.message,
    ...(warning.linePos
      ? { path: `line ${warning.linePos[0]?.line ?? "?"}` }
      : {}),
  }));

  return { kind: "parsed", data, diagnostics };
}
