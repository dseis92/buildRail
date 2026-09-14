import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadState } from "@buildrail/core";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(moduleDir, "..", "..", "tests", "fixtures");

test("valid state loads and validates successfully (reproduces BuildRail's own BR0+BR1-frozen shape)", async () => {
  const result = await loadState(join(fixturesDir, "valid-project"));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.value.current.lifecycle_state, "FROZEN");
    assert.equal(result.value.value.current.development_phase, "BR1");
    assert.equal(result.value.value.authorization?.status, "completed");
    assert.deepEqual(result.value.value.completed_phases, ["BR0", "BR1"]);
  }
});

test("missing state file -> STATE_NOT_FOUND", async () => {
  const result = await loadState(join(fixturesDir, "does-not-exist"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "STATE_NOT_FOUND");
});

test("malformed YAML syntax -> STATE_YAML_INVALID", async () => {
  const result = await loadState(join(fixturesDir, "invalid-state-malformed-yaml"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "STATE_YAML_INVALID");
});

test("wrong root type -> STATE_SCHEMA_INVALID, not STATE_YAML_INVALID", async () => {
  const result = await loadState(join(fixturesDir, "wrong-root-type-state"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "STATE_SCHEMA_INVALID");
});

test("missing a required field (current) -> STATE_SCHEMA_INVALID", async () => {
  const result = await loadState(join(fixturesDir, "invalid-state-missing-field"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "STATE_SCHEMA_INVALID");
});

test("empty YAML document -> STATE_YAML_INVALID", async () => {
  const result = await loadState(join(fixturesDir, "empty-state"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "STATE_YAML_INVALID");
});

test("invalid lifecycle_state value (not in the enum) -> STATE_SCHEMA_INVALID", async () => {
  const result = await loadState(join(fixturesDir, "invalid-lifecycle-state"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "STATE_SCHEMA_INVALID");
});

test("invalid authorization.status value -> STATE_SCHEMA_INVALID with an authorization.-pathed error", async () => {
  const result = await loadState(join(fixturesDir, "invalid-authorization-status"));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "STATE_SCHEMA_INVALID");
    const details = result.error.details as Array<{ path: string }>;
    assert.ok(details.some((d) => d.path.startsWith("authorization")));
  }
});

test("nested authorization missing a required field (granted_by) -> STATE_SCHEMA_INVALID with path authorization.granted_by exactly", async () => {
  const result = await loadState(join(fixturesDir, "authorization-missing-granted-by"));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "STATE_SCHEMA_INVALID");
    const details = result.error.details as Array<{ path: string }>;
    // Exact match, not a startsWith("authorization") prefix check: Ajv's
    // `required`-keyword instancePath alone only points at the containing
    // object ("authorization"); the missing property name comes from
    // error.params.missingProperty and must be appended by
    // normalizeAjvErrors() to name the actual missing field.
    assert.ok(details.some((d) => d.path === "authorization.granted_by"));
  }
});

test("candidate with all three fields null validates successfully", async () => {
  const result = await loadState(join(fixturesDir, "valid-project"));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.value.candidate, { branch: null, base_sha: null, candidate_sha: null });
  }
});

test("state.yml with no authorization key at all loads and validates successfully", async () => {
  const result = await loadState(join(fixturesDir, "missing-authorization"));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.value.authorization, undefined);
  }
});

test("state fixture with authorization.status: completed loads successfully", async () => {
  const result = await loadState(join(fixturesDir, "completed-authorization"));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.value.authorization?.status, "completed");
  }
});

test("state fixture with authorization.status: revoked loads successfully", async () => {
  const result = await loadState(join(fixturesDir, "revoked-authorization"));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.value.authorization?.status, "revoked");
  }
});
