import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProtectedPaths } from "@buildrail/core";
import type { ProtectedSystem } from "@buildrail/core";

function sys(overrides: Partial<ProtectedSystem> & { name: string; paths: string[] }): ProtectedSystem {
  return { status: "frozen", ...overrides } as ProtectedSystem;
}

test("matchProtectedPaths: basic match reported", () => {
  const r = matchProtectedPaths(
    [{ path: "src/auth/login.ts", origin: "current" }],
    [sys({ name: "auth", paths: ["src/auth/**"] })],
  );
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0]?.matchedVia, "path");
});

test("matchProtectedPaths: no match for unrelated path", () => {
  const r = matchProtectedPaths(
    [{ path: "src/other/file.ts", origin: "current" }],
    [sys({ name: "auth", paths: ["src/auth/**"] })],
  );
  assert.equal(r.matches.length, 0);
});

test("matchProtectedPaths: overlapping systems produce one match per (input, system) pair", () => {
  const r = matchProtectedPaths(
    [{ path: "src/auth/login.ts", origin: "current" }],
    [sys({ name: "broad", paths: ["src/**"] }), sys({ name: "narrow", paths: ["src/auth/**"] })],
  );
  assert.equal(r.matches.length, 2);
});

test("matchProtectedPaths: rename — old-side-of-rename matches via matchedVia=oldPath", () => {
  const r = matchProtectedPaths(
    [
      { path: "src/other/login.ts", origin: "current" },
      { path: "src/auth/login.ts", origin: "old_side_of_rename" },
    ],
    [sys({ name: "auth", paths: ["src/auth/**"] })],
  );
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0]?.matchedVia, "oldPath");
});

test("matchProtectedPaths: input containing .. is excluded, reported via invalidInputs", () => {
  const r = matchProtectedPaths(
    [{ path: "src/../etc/passwd", origin: "current" }],
    [sys({ name: "auth", paths: ["src/auth/**"] })],
  );
  assert.equal(r.matches.length, 0);
  assert.equal(r.invalidInputs.length, 1);
});

test("matchProtectedPaths: pattern containing .. is excluded, reported via invalidPatterns", () => {
  const r = matchProtectedPaths(
    [{ path: "src/auth/login.ts", origin: "current" }],
    [sys({ name: "bad", paths: ["src/../auth/**"] })],
  );
  assert.equal(r.matches.length, 0);
  assert.equal(r.invalidPatterns.length, 1);
});

test("matchProtectedPaths: case-sensitive matching", () => {
  const r = matchProtectedPaths(
    [{ path: "SRC/auth/login.ts", origin: "current" }],
    [sys({ name: "auth", paths: ["src/auth/**"] })],
  );
  assert.equal(r.matches.length, 0);
});

test("matchProtectedPaths: dotfiles not special-cased", () => {
  const r = matchProtectedPaths(
    [{ path: ".buildrail/specs/foo.md", origin: "current" }],
    [sys({ name: "specs", paths: [".buildrail/specs/**"] })],
  );
  assert.equal(r.matches.length, 1);
});

test("matchProtectedPaths: negation pattern (!) matched literally, not as negation", () => {
  const r = matchProtectedPaths(
    [
      { path: "!weird.ts", origin: "current" },
      { path: "other.ts", origin: "current" },
    ],
    [sys({ name: "weird", paths: ["!weird.ts"] })],
  );
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0]?.path, "!weird.ts");
});

test("matchProtectedPaths: extglob pattern matched literally, not as extglob syntax", () => {
  const r = matchProtectedPaths(
    [{ path: "+(a|b)", origin: "current" }],
    [sys({ name: "ext", paths: ["+(a|b)"] })],
  );
  assert.equal(r.matches.length, 1);
});

test("matchProtectedPaths: bracket expression and brace expansion both match as expected", () => {
  const r = matchProtectedPaths(
    [
      { path: "src/auth/x.ts", origin: "current" },
      { path: "src/payments/y.ts", origin: "current" },
    ],
    [sys({ name: "multi", paths: ["src/{auth,payments}/**"] })],
  );
  assert.equal(r.matches.length, 2);
});

test("matchProtectedPaths: overlong pattern is caught and reported via invalidPatterns, never thrown", () => {
  const overlong = "a".repeat(70000);
  assert.doesNotThrow(() => {
    const r = matchProtectedPaths([{ path: "src/x.ts", origin: "current" }], [sys({ name: "bad", paths: [overlong] })]);
    assert.equal(r.invalidPatterns.length, 1);
  });
});

test("matchProtectedPaths: canonical result ordering is stable across identical calls", () => {
  const inputs = [
    { path: "b.ts", origin: "current" as const },
    { path: "a.ts", origin: "current" as const },
  ];
  const systems = [sys({ name: "z", paths: ["*.ts"] }), sys({ name: "a", paths: ["*.ts"] })];
  const r1 = matchProtectedPaths(inputs, systems);
  const r2 = matchProtectedPaths(inputs, systems);
  assert.deepEqual(r1.matches, r2.matches);
  assert.equal(r1.matches[0]?.path, "a.ts");
});
