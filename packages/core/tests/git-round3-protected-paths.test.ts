import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProtectedPaths, type ProtectedSystem } from "@buildrail/core";

function check(pattern: string, input: string, expected: boolean) {
  const system: ProtectedSystem = { name: "protected", status: "locked", paths: [pattern] };
  const result = matchProtectedPaths([{ path: input, origin: "current" }], [system]);
  assert.deepEqual(result.invalidInputs, []);
  assert.deepEqual(result.invalidPatterns, []);
  assert.deepEqual(result.matches, expected ? [{ system, path: input, matchedVia: "path" }] : []);
}

test("Round3 protected paths: bracket range matches inside and rejects outside", () => {
  check("[a-z].ts", "m.ts", true);
  check("[a-z].ts", "7.ts", false);
});

test("Round3 protected paths: question mark matches exactly one non-separator character", () => {
  check("a?b", "axb", true);
  check("a?b", "ab", false);
  check("a?b", "axxb", false);
  check("a?b", "a/b", false);
});

test("Round3 protected paths: leading dot slash normalizes a one-sided prefix", () => {
  check("src/**", "./src/file.ts", true);
  check("./src/**", "src/file.ts", true);
});

test("Round3 protected paths: leading slash normalizes a one-sided prefix", () => {
  check("src/**", "/src/file.ts", true);
  check("/src/**", "src/file.ts", true);
});
