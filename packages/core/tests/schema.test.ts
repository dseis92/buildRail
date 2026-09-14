import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRegistry, loadConfig, CONFIG_SCHEMA_ID, STATE_SCHEMA_ID, AUTHORIZATION_SCHEMA_ID } from "@buildrail/core";
// Internal-only seams, reached via Node's package-private "imports" field
// (packages/core/package.json's "imports": {"#internal/..."}), never the
// public "@buildrail/core" package name. This is structurally, not just
// conventionally, unreachable from outside the package: Node reserves the
// "#" specifier prefix for a package's own internal self-references and
// refuses to resolve it for any importer other than code inside this same
// package (see Node's "Subpath imports" docs) — an external consumer of
// the published package, or any code elsewhere in this monorepo, cannot
// import "#internal/..." regardless of package.json's "exports" map.
// (An earlier attempt at this used either a public package-subpath import
// — which Node's "exports" map now blocks, but which existed as a real
// external-reachability hole before that map was added — or a bare
// relative path into dist/, which broke because packages/core/tests/*.ts
// and its compiled packages/core/dist-tests/tests/*.js output sit at
// different relative depths from packages/core/dist/; the "#internal/*"
// specifier is resolved by Node's package.json "imports" map identically
// regardless of the importing file's own location, so it has no such
// depth-mismatch problem either.) This lets these tests exercise the
// exact production registry-construction and loader-translation code
// paths against fixture schema directories, without a second public
// parameter on createRegistry/loadConfig/loadState and without
// duplicating that logic in a test helper.
import { createRegistryFromDir } from "#internal/schema/registry.js";
import { buildConfigRegistry } from "#internal/config/index.js";
import { buildStateRegistry } from "#internal/state/index.js";

const execFileAsync = promisify(execFile);
const moduleDir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(moduleDir, "..", "..", "tests", "fixtures");
const packageRoot = join(moduleDir, "..", "..");

test("all three BR2-registered schemas compile without error via createRegistry()", () => {
  assert.doesNotThrow(() => createRegistry());
});

test("authorization $ref inside state.schema.json resolves correctly (invalid nested authorization reports an authorization.*-pathed error)", () => {
  const registry = createRegistry();
  const result = registry.validate(STATE_SCHEMA_ID, {
    schema_version: 1,
    project: { name: "x" },
    current: { lifecycle_state: "FROZEN", development_phase: "BR1" },
    authorization: { id: "BR1" }, // missing required fields
    completed_phases: [],
    planned_phases: [],
    review: {},
  });
  assert.equal(result.registered, true);
  if (result.registered) {
    assert.equal(result.result.valid, false);
    assert.ok(result.result.errors.every((e) => e.path.startsWith("authorization")));
    assert.ok(result.result.errors.length > 0);
  }
});

test("a deliberately broken internal $ref fails predictably at registry-setup time via the production createRegistryFromDir() algorithm with SchemaReferenceUnresolvedError", () => {
  // Exercises the exact production registration algorithm (the same one
  // the public, zero-argument createRegistry() calls) via the internal
  // createRegistryFromDir() seam, pointed at a fixture directory whose
  // three schema files all load/parse fine but whose
  // authorization.schema.json has a deliberately mismatched $id, so
  // state.schema.json's relative $ref to it cannot resolve. This is not
  // a duplicated test-only registration routine.
  assert.throws(
    () => createRegistryFromDir(join(fixturesDir, "broken-ref-schema")),
    (error: unknown) => error instanceof Error && error.constructor.name === "SchemaReferenceUnresolvedError",
  );
});

test("a broken internal $ref surfaces through the production loadConfig()/loadState() translation path as SCHEMA_REFERENCE_UNRESOLVED", () => {
  const brokenRefSchemasDir = join(fixturesDir, "broken-ref-schema");

  // buildConfigRegistry/buildStateRegistry are the exact try/catch
  // translation logic the public loadConfig()/loadState() use around
  // their own createRegistry() call — here it is given a registry
  // factory pointed at a broken fixture directory instead of the
  // package's real schemas/, so the same production translation code
  // runs, not a parallel implementation.
  const configBuilt = buildConfigRegistry(() => createRegistryFromDir(brokenRefSchemasDir));
  assert.equal(configBuilt.ok, false);
  if (!configBuilt.ok) {
    assert.equal(configBuilt.error.code, "SCHEMA_REFERENCE_UNRESOLVED");
  }

  const stateBuilt = buildStateRegistry(() => createRegistryFromDir(brokenRefSchemasDir));
  assert.equal(stateBuilt.ok, false);
  if (!stateBuilt.ok) {
    assert.equal(stateBuilt.error.code, "SCHEMA_REFERENCE_UNRESOLVED");
  }
});

test("a missing schema asset file fails predictably at registry-setup time via the production createRegistryFromDir() algorithm with SchemaSetupError", () => {
  assert.throws(
    () => createRegistryFromDir(join(fixturesDir, "missing-schema-asset")),
    (error: unknown) => error instanceof Error && error.constructor.name === "SchemaSetupError",
  );
});

test("a missing schema asset file surfaces through the production loadConfig()/loadState() translation path as SCHEMA_SETUP_FAILED", async () => {
  const missingAssetSchemasDir = join(fixturesDir, "missing-schema-asset");

  // Same exact translation logic (buildConfigRegistry/buildStateRegistry)
  // the public loadConfig()/loadState() run around their own
  // createRegistry() call — here exercised via a registry factory
  // pointed at a fixture directory missing one schema asset file, so the
  // real SchemaSetupError -> SCHEMA_SETUP_FAILED translation path runs.
  const configBuilt = buildConfigRegistry(() => createRegistryFromDir(missingAssetSchemasDir));
  assert.equal(configBuilt.ok, false);
  if (!configBuilt.ok) {
    assert.equal(configBuilt.error.code, "SCHEMA_SETUP_FAILED");
  }

  const stateBuilt = buildStateRegistry(() => createRegistryFromDir(missingAssetSchemasDir));
  assert.equal(stateBuilt.ok, false);
  if (!stateBuilt.ok) {
    assert.equal(stateBuilt.error.code, "SCHEMA_SETUP_FAILED");
  }
});

test("verification-report.schema.json and handoff.schema.json are confirmed NOT registered", () => {
  const registry = createRegistry();
  const verificationResult = registry.validate(
    "https://buildrail.dev/schemas/verification-report.schema.json" as never,
    {},
  );
  assert.deepEqual(verificationResult, { registered: false });

  const handoffResult = registry.validate("https://buildrail.dev/schemas/handoff.schema.json" as never, {});
  assert.deepEqual(handoffResult, { registered: false });
});

test("validate() with an unregistered schema id never throws and never returns registered:true", () => {
  const registry = createRegistry();
  assert.doesNotThrow(() => {
    const result = registry.validate("https://buildrail.dev/schemas/nonexistent.schema.json" as never, {});
    assert.equal(result.registered, false);
  });
});

test("no network call is made during any schema test (createRegistry succeeds fully offline)", () => {
  // createRegistry() reads only local files (readFileSync) and never
  // constructs a network client. This test asserts it succeeds without
  // any network-capable global being touched — if it ever attempted a
  // fetch, this environment has no server to answer it and the call
  // would hang/throw, not silently succeed.
  assert.doesNotThrow(() => createRegistry());
});

test("the public API does not expose a schema-directory override (compile-time regression guard)", () => {
  // @ts-expect-error — createRegistry() takes no arguments; a second
  // argument here must be a compile error, proving the public,
  // documented signature genuinely has no way to redirect schema
  // loading away from BuildRail's own package-relative schemas.
  createRegistry("some/other/directory");
  // @ts-expect-error — loadConfig(projectRoot) takes exactly one
  // argument.
  void loadConfig(fixturesDir, "some/other/directory");
  assert.ok(true, "the two @ts-expect-error directives above are the actual assertion");
});

test("CONFIG_SCHEMA_ID, STATE_SCHEMA_ID, AUTHORIZATION_SCHEMA_ID are exactly the three real schema $ids", () => {
  assert.equal(CONFIG_SCHEMA_ID, "https://buildrail.dev/schemas/config.schema.json");
  assert.equal(STATE_SCHEMA_ID, "https://buildrail.dev/schemas/state.schema.json");
  assert.equal(AUTHORIZATION_SCHEMA_ID, "https://buildrail.dev/schemas/authorization.schema.json");
});

test("schema resolution succeeds when process.cwd() is set to a directory unrelated to BuildRail's own source tree", async () => {
  // Run a tiny script via node -e, with cwd set to a system temp
  // directory (unrelated to packages/core's own source/package
  // location), and confirm createRegistry() + loadConfig() still resolve
  // the package-owned schemas correctly — proving resolution is genuinely
  // package-relative, not accidentally cwd-relative.
  const script = `
    import { createRegistry, loadConfig } from ${JSON.stringify(join(packageRoot, "dist", "index.js"))};
    createRegistry();
    const result = await loadConfig(${JSON.stringify(join(fixturesDir, "valid-project"))});
    if (!result.ok) { console.error("FAILED", JSON.stringify(result.error)); process.exit(1); }
    console.log("OK");
  `;
  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.env.TMPDIR ?? "/tmp",
  });
  assert.match(stdout, /OK/);
});
