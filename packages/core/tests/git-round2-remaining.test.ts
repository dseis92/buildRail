import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { inspectDiff, inspectHead, inspectWorkingTree, matchProtectedPaths, resolveRepository, type ProtectedSystem } from "@buildrail/core";
import { withGitExecutionProbe } from "#internal/git/internal/exec.js";
import { createGitFixture, commitAll, writeFile } from "./helpers/git-fixture.js";

for (const [label, pattern, matching, excluded] of [
  ["star", "src/*", "src/a", "src/deep/a"], ["globstar", "src/**", "src/deep/a", "other/a"],
  ["question", "a?b", "axb", "a/b"], ["backslash escape", "a\\*b", "a*b", "axb"],
  ["quoted literal", '"a*b"', "a*b", "axb"], ["leading dot slash", "./src/**", "./src/a", "other/a"],
  ["leading slash", "/src/**", "/src/a", "other/a"],
]) test(`Round2 protected grammar: ${label}`, () => {
  const systems: ProtectedSystem[] = [{ name: "system", status: "locked", paths: [pattern!] }];
  const r = matchProtectedPaths([{ path: matching!, origin: "current" }, { path: excluded!, origin: "current" }], systems);
  assert.deepEqual(r.matches.map(m => m.path), [matching]); assert.deepEqual(r.invalidPatterns, []);
});

test("Round2 protected ordering: same names, status, paths, origins and final original-index tie", () => {
  const systems: ProtectedSystem[] = [
    { name: "same", status: "locked", paths: ["**"] },
    { name: "same", status: "frozen", paths: ["**"] },
    { name: "same", status: "locked", paths: ["*"] },
    { name: "same", status: "locked", paths: ["**"] },
  ];
  const inputs = [{ path: "b", origin: "old_side_of_rename" as const }, { path: "a", origin: "current" as const }, { path: "b", origin: "current" as const }];
  const result = matchProtectedPaths(inputs, systems);
  assert.equal(result.matches.length, 12);
  assert.deepEqual(result, matchProtectedPaths([...inputs].reverse(), systems));
  assert.deepEqual(result.matches.slice(0, 4).map(m => systems.indexOf(m.system)), [1, 2, 0, 3]);
  assert.deepEqual(result.matches.slice(4, 8).map(m => m.matchedVia), ["path", "path", "path", "path"]);
  assert.deepEqual(result.matches.slice(8).map(m => m.matchedVia), ["oldPath", "oldPath", "oldPath", "oldPath"]);
  assert.equal(result.matches[2]!.system, systems[0]); assert.equal(result.matches[3]!.system, systems[3]);
});

for (const axis of ["staged", "unstaged"]) test(`Round2 working tree: ${axis} type change and exact unusual paths`, async t => {
  if (process.platform === "win32") return t.skip("POSIX symlink fixture.");
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "file", "content"); const a = await commitAll(fx, "base"); fs.rmSync(path.join(fx.root, "file")); fs.symlinkSync("target", path.join(fx.root, "file"));
    if (axis === "staged") await fx.git(["add", "file"]);
    const r = await inspectWorkingTree(fx.root); assert.equal(r.ok, true); if (r.ok) assert.deepEqual(r.value.entries, [{ kind: `${axis}_type_change`, path: "file" }]);
    const b = await commitAll(fx, "type"); const diff = await inspectDiff(fx.root, { fromRef: a, toRef: b }); assert.equal(diff.ok, true); if (diff.ok) assert.deepEqual(diff.value.changes, [{ kind: "type_changed", path: "file" }]);
    for (const name of ["space name", "tab\tname", "line\nname", "café-日本語"]) writeFile(fx.root, name, name);
    const unusual = await inspectWorkingTree(fx.root); assert.equal(unusual.ok, true); if (unusual.ok) assert.deepEqual(unusual.value.entries.map(e => e.path), ["café-日本語", "line\nname", "space name", "tab\tname"]);
  } finally { fx.cleanup(); }
});
for (const mutation of ["delete", "type change"]) test(`Round2 working tree: staged rename plus unstaged ${mutation}`, async t => {
  if (process.platform === "win32" && mutation === "type change") return t.skip("POSIX symlink fixture.");
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "old", "base content\n"); await commitAll(fx, "base"); await fx.git(["mv", "old", "new"]); fs.rmSync(path.join(fx.root, "new"));
    if (mutation === "type change") fs.symlinkSync("target", path.join(fx.root, "new"));
    const raw = (await fx.git(["status", "--porcelain=v2", "-z"])).stdout; assert.ok(raw.startsWith(mutation === "delete" ? "2 RD " : "2 RT "));
    const r = await inspectWorkingTree(fx.root); assert.equal(r.ok, true); if (r.ok) assert.deepEqual(r.value.entries.map(e => e.kind), ["staged_rename", mutation === "delete" ? "unstaged_delete" : "unstaged_type_change"]);
  } finally { fx.cleanup(); }
});
for (const intent of [false, true]) test(`Round2 working tree: below threshold ${intent ? "intent add" : "untracked"}`, async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "old", "old content a\n".repeat(200)); await commitAll(fx, "base"); fs.rmSync(path.join(fx.root, "old")); writeFile(fx.root, "new", "entirely different z\n".repeat(300));
    if (intent) await fx.git(["add", "-N", "new"]);
    const r = await inspectWorkingTree(fx.root); assert.equal(r.ok, true); if (r.ok) assert.deepEqual(r.value.entries.map(e => e.kind).sort(), ["unstaged_delete", intent ? "unstaged_add" : "untracked"].sort());
  } finally { fx.cleanup(); }
});

test("Round2 partial clone: required missing tree fails locally without lazy fetch", async () => {
  const origin = await createGitFixture(); const holder = await createGitFixture();
  try {
    writeFile(origin.root, "f", "base"); const a = await commitAll(origin, "base"); writeFile(origin.root, "f", "next"); const b = await commitAll(origin, "next");
    const tree = (await origin.git(["rev-parse", "HEAD^{tree}"])).stdout.slice(0, -1);
    await origin.git(["config", "uploadpack.allowFilter", "true"]);
    const clone = path.join(holder.root, "clone"); await holder.git(["clone", "-q", "--no-checkout", "--filter=tree:0", `file://${origin.root}`, clone]);
    assert.equal((await holder.git(["config", "--get", "remote.origin.promisor"], { cwd: clone })).stdout, "true\n");
    const missing = () => assert.throws(() => execFileSync("git", ["cat-file", "-e", tree], { cwd: clone, env: { ...process.env, GIT_NO_LAZY_FETCH: "1" }, stdio: "pipe" }));
    missing();
    const packs = path.join(clone, ".git", "objects", "pack"); const before = fs.readdirSync(packs).sort();
    const r = await inspectDiff(clone, { fromRef: a, toRef: b }); assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error.code, "GIT_COMMAND_FAILED");
    missing(); assert.deepEqual(fs.readdirSync(packs).sort(), before);
    assert.ok((await holder.git(["diff", "--name-status", a, b], { cwd: clone })).stdout.includes("f"));
    execFileSync("git", ["cat-file", "-e", tree], { cwd: clone, env: { ...process.env, GIT_NO_LAZY_FETCH: "1" } });
  } finally { origin.cleanup(); holder.cleanup(); }
});

for (const kind of ["config", "symbolic ref"]) test(`Round2 byte safety: real invalid UTF8 ${kind}`, async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f", "base"); const fixtureSha = await commitAll(fx, "base"); await fx.git(["branch", "-M", "current"]);
    if (kind === "config") {
      fs.appendFileSync(path.join(fx.root, ".git", "config"), Buffer.concat([Buffer.from('\n[branch "current"]\n remote = "'), Buffer.from([0xff]), Buffer.from('"\n merge = refs/heads/current\n')]));
      const raw = execFileSync("git", ["config", "-z", "--get", "branch.current.remote"], { cwd: fx.root }); assert.ok(raw.includes(0xff));
    } else {
      fs.writeFileSync(path.join(fx.root, ".git", "HEAD"), Buffer.concat([Buffer.from("ref: refs/heads/bad-"), Buffer.from([0xff]), Buffer.from("\n")]));
      fs.writeFileSync(path.join(fx.root, ".git", "packed-refs"), Buffer.concat([Buffer.from(`${fixtureSha} refs/heads/bad-`), Buffer.from([0xff]), Buffer.from("\n")]));
      const raw = execFileSync("git", ["symbolic-ref", "-q", "HEAD"], { cwd: fx.root }); assert.ok(raw.includes(0xff));
      assert.equal(execFileSync("git", ["rev-parse", "--verify", "-q", "HEAD^{commit}"], { cwd: fx.root, encoding: "utf8" }), fixtureSha + "\n");
    }
    const r = await inspectHead(fx.root); assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error.code, "MALFORMED_GIT_OUTPUT");
  } finally { fx.cleanup(); }
});

test("Round2 repository: unknown refStorage fails closed and config failure remains distinct", async () => {
  const fx = await createGitFixture();
  try {
    for (const outcome of [{ ok: true, code: 0, stdout: Buffer.from("future-backend\n"), stderr: Buffer.alloc(0) }, { ok: false, code: 3, stdout: Buffer.alloc(0), stderr: Buffer.from("failure") }]) {
      const r = await withGitExecutionProbe(e => e.args.includes("extensions.refStorage") ? outcome : undefined, () => resolveRepository(fx.root));
      assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error.code, outcome.ok ? "UNSUPPORTED_REF_FORMAT" : "GIT_COMMAND_FAILED");
    }
  } finally { fx.cleanup(); }
});

test("Round2 repository: unexpected show-toplevel failure stays GIT_COMMAND_FAILED", async () => {
  const fx = await createGitFixture();
  try {
    const r = await withGitExecutionProbe(e => e.args.includes("--show-toplevel") ? { ok: false, code: 128, stdout: Buffer.alloc(0), stderr: Buffer.from("failure") } : undefined, () => resolveRepository(fx.root));
    assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error.code, "GIT_COMMAND_FAILED");
  } finally { fx.cleanup(); }
});

for (const status of ["open", "guarded", "frozen", "locked"] as const) test(`Round2 protected status: ${status} reported without enforcement`, () => {
  const system = { name: "s", status, paths: ["new"] };
  const inputs = [{ path: "new", origin: "current" as const }, { path: "old", origin: "old_side_of_rename" as const }];
  assert.deepEqual(matchProtectedPaths(inputs, [system]).matches, [{ path: "new", matchedVia: "path", system }]);
});

test("Round2 protected purity: cloned inputs unchanged and all pattern failures contained", () => {
  const patterns = ["*", "**", "?", "[a-z]", "{a,b}", "a\\*b", 'src/"a*b"/x.ts', "!x", "+(a|b)", "../x", "[", "x".repeat(65537)];
  const systems: ProtectedSystem[] = patterns.map((p,i) => ({ name: String(i), status: "guarded", paths: [p] }));
  const inputs = [{ path: "a", origin: "current" as const }]; const snapshot = structuredClone({ inputs, systems });
  const r = matchProtectedPaths(inputs, systems);
  assert.deepEqual(r, matchProtectedPaths(structuredClone(inputs), structuredClone(systems))); assert.deepEqual({ inputs, systems }, snapshot);
  assert.ok(Array.isArray(r.matches) && Array.isArray(r.invalidPatterns) && Array.isArray(r.invalidInputs)); assert.ok(r.invalidPatterns.includes(patterns.at(-1)!));
});

test("Round2 repository: explicit files backend accepted", async () => {
  const fx = await createGitFixture();
  try { await fx.git(["config", "core.repositoryformatversion", "1"]); await fx.git(["config", "extensions.refStorage", "files"]); assert.equal((await resolveRepository(fx.root)).ok, true); }
  finally { fx.cleanup(); }
});

for (const kind of ["added", "modified", "deleted", "renamed"]) test(`Round2 diff classification: ${kind}`, async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f", "base\n"); const a = await commitAll(fx, "base");
    if (kind === "added") writeFile(fx.root, "a", "new\n");
    if (kind === "modified") writeFile(fx.root, "f", "changed\n");
    if (kind === "deleted") fs.rmSync(path.join(fx.root, "f"));
    if (kind === "renamed") fs.renameSync(path.join(fx.root, "f"), path.join(fx.root, "new"));
    await fx.git(["add", "-A"]);
    const working = await inspectWorkingTree(fx.root); assert.equal(working.ok, true);
    if (kind === "added" && working.ok) assert.deepEqual(working.value.entries, [{ kind: "staged_add", path: "a" }]);
    const b = await commitAll(fx, "next"); const r = await inspectDiff(fx.root, { fromRef: a, toRef: b }); assert.equal(r.ok, true); if (r.ok) { assert.equal(r.value.changes.length, 1); assert.equal(r.value.changes[0]?.kind, kind); }
  } finally { fx.cleanup(); }
});

test("Round2 working tree: staged below-threshold rename remains delete and add", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "old", "old\n".repeat(100)); await commitAll(fx, "base"); fs.rmSync(path.join(fx.root, "old")); writeFile(fx.root, "new", "different\n".repeat(150)); await fx.git(["add", "-A"]);
    const r = await inspectWorkingTree(fx.root); assert.equal(r.ok, true); if (r.ok) assert.deepEqual(r.value.entries, [{ kind: "staged_add", path: "new" }, { kind: "staged_delete", path: "old" }]);
  } finally { fx.cleanup(); }
});
