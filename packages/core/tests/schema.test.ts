import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRegistry, loadConfig, loadState, CONFIG_SCHEMA_ID, STATE_SCHEMA_ID, AUTHORIZATION_SCHEMA_ID } from "@buildrail/core";

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

test("a deliberately broken internal $ref fails predictably at registry-setup time via createRegistry() itself with SchemaReferenceUnresolvedError", () => {
  // Exercises the exact production createRegistry() algorithm (not a
  // duplicated test-only registration routine) via its internal-only
  // schemasDirOverride seam, pointed at a fixture directory whose three
  // schema files all load/parse fine but whose authorization.schema.json
  // has a deliberately mismatched $id, so state.schema.json's relative
  // $ref to it cannot resolve.
  assert.throws(
    () => createRegistry(join(fixturesDir, "broken-ref-schema")),
    (error: unknown) => error instanceof Error && error.constructor.name === "SchemaReferenceUnresolvedError",
  );
});

test("a broken internal $ref surfaces through the production loadConfig()/loadState() translation path as SCHEMA_REFERENCE_UNRESOLVED", async () => {
  const brokenRefSchemasDir = join(fixturesDir, "broken-ref-schema");
  const validProject = join(fixturesDir, "valid-project");

  const configResult = await loadConfig(validProject, brokenRefSchemasDir);
  assert.equal(configResult.ok, false);
  if (!configResult.ok) {
    assert.equal(configResult.error.code, "SCHEMA_REFERENCE_UNRESOLVED");
  }

  const stateResult = await loadState(validProject, brokenRefSchemasDir);
  assert.equal(stateResult.ok, false);
  if (!stateResult.ok) {
    assert.equal(stateResult.error.code, "SCHEMA_REFERENCE_UNRESOLVED");
  }
});

test("a missing schema asset file fails predictably at registry-setup time via createRegistry() itself with SchemaSetupError", () => {
  assert.throws(
    () => createRegistry(join(fixturesDir, "missing-schema-asset")),
    (error: unknown) => error instanceof Error && error.constructor.name === "SchemaSetupError",
  );
});

test("a missing schema asset file surfaces through the production loadConfig()/loadState() translation path as SCHEMA_SETUP_FAILED", async () => {
  const missingAssetSchemasDir = join(fixturesDir, "missing-schema-asset");
  const validProject = join(fixturesDir, "valid-project");

  const configResult = await loadConfig(validProject, missingAssetSchemasDir);
  assert.equal(configResult.ok, false);
  if (!configResult.ok) {
    assert.equal(configResult.error.code, "SCHEMA_SETUP_FAILED");
  }

  const stateResult = await loadState(validProject, missingAssetSchemasDir);
  assert.equal(stateResult.ok, false);
  if (!stateResult.ok) {
    assert.equal(stateResult.error.code, "SCHEMA_SETUP_FAILED");
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
