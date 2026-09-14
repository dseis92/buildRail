import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig } from "@buildrail/core";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(moduleDir, "..", "..", "tests", "fixtures");

test("valid config loads and validates successfully", async () => {
  const result = await loadConfig(join(fixturesDir, "valid-project"));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.value.project.name, "FixtureProject");
    assert.deepEqual(result.value.diagnostics, []);
  }
});

test("missing config file -> CONFIG_NOT_FOUND", async () => {
  const result = await loadConfig(join(fixturesDir, "does-not-exist"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "CONFIG_NOT_FOUND");
});

test("malformed YAML syntax -> CONFIG_YAML_INVALID", async () => {
  const result = await loadConfig(join(fixturesDir, "invalid-config-malformed-yaml"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "CONFIG_YAML_INVALID");
});

test("empty YAML document -> CONFIG_YAML_INVALID", async () => {
  const result = await loadConfig(join(fixturesDir, "empty-config"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "CONFIG_YAML_INVALID");
});

test("wrong root type -> CONFIG_SCHEMA_INVALID, not CONFIG_YAML_INVALID", async () => {
  const result = await loadConfig(join(fixturesDir, "wrong-root-type-config"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "CONFIG_SCHEMA_INVALID");
});

test("missing a required field -> CONFIG_SCHEMA_INVALID", async () => {
  const result = await loadConfig(join(fixturesDir, "invalid-config-missing-field"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "CONFIG_SCHEMA_INVALID");
});

test("invalid enum value (git.force_push: sometimes) -> CONFIG_SCHEMA_INVALID", async () => {
  const result = await loadConfig(join(fixturesDir, "invalid-config-enum"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "CONFIG_SCHEMA_INVALID");
});

test("invalid protected_systems entry (missing required paths) -> CONFIG_SCHEMA_INVALID", async () => {
  const result = await loadConfig(join(fixturesDir, "invalid-config-protected-system"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "CONFIG_SCHEMA_INVALID");
});

test("valid protected_systems entry validates successfully (positive case, via valid-project's existing single entry)", async () => {
  const result = await loadConfig(join(fixturesDir, "valid-project"));
  assert.equal(result.ok, true);
  if (result.ok) {
    const protectedSystems = result.value.value.protected_systems;
    assert.ok(
      Array.isArray(protectedSystems) && protectedSystems.length === 1,
      "valid-project's config.yml carries exactly one well-formed protected_systems entry, which this test confirms loads/validates successfully",
    );
  }
});

test("YAML warning (unresolved custom tag) loads successfully with a captured diagnostic", async () => {
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  let consoleCalled = false;
  console.log = (...args: unknown[]) => {
    consoleCalled = true;
    originalConsoleLog(...args);
  };
  console.warn = (...args: unknown[]) => {
    consoleCalled = true;
    originalConsoleWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    consoleCalled = true;
    originalConsoleError(...args);
  };

  let result;
  try {
    result = await loadConfig(join(fixturesDir, "warning-yaml"));
  } finally {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  }

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.diagnostics.length, 1);
    assert.equal(result.value.diagnostics[0]?.severity, "warning");
  }
  assert.equal(consoleCalled, false, "no console output as a side effect of parsing (proves logLevel: 'error' suppresses the library's own emission)");
});

test("resource-exhaustion (alias-count) fixture fails safely as CONFIG_YAML_INVALID", async () => {
  const result = await loadConfig(join(fixturesDir, "alias-limit"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "CONFIG_YAML_INVALID");
});
