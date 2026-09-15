import { promisify } from "node:util";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { inspectDiff, inspectHead, inspectWorkingTree, resolveRepository } from "@buildrail/core";
import { withGitExecutionProbe, resolveGitExecutable } from "#internal/git/internal/exec.js";
import { createGitFixture, commitAll, writeFile } from "./helpers/git-fixture.js";

for (const config of ["status.renameLimit", "diff.renameLimit"]) test(`Round2 rename hazard: ${config} inexact rename search`, async () => {
  const fx = await createGitFixture();
  try {
    for (let i = 0; i < 4; i++) writeFile(fx.root, `old${i}`, Array.from({ length: 100 }, (_, j) => `unique file ${i} line ${j}\n`).join(""));
    const a = await commitAll(fx, "base");
    for (let i = 0; i < 4; i++) { fs.renameSync(path.join(fx.root, `old${i}`), path.join(fx.root, `new${i}`)); fs.appendFileSync(path.join(fx.root, `new${i}`), "extra content\n"); }
    for (let i = 0; i < 4; i++) await fx.git(["add", "-N", `new${i}`]);
    await fx.git(["config", config, "1"]);
    const rawStatus = (await fx.git(["status", "--porcelain=v2", "-z", "--find-renames=50%"])).stdout;
    assert.equal(rawStatus.includes("2 .R"), false, "unmitigated status must actually lose rename detection");
    const r = await inspectWorkingTree(fx.root); assert.equal(r.ok, true); if (r.ok) assert.equal(r.value.entries.filter(e => e.kind === "unstaged_rename").length, 4);
    const b = await commitAll(fx, "renames"); await fx.git(["config", "diff.renameLimit", "1"]);
    const rawDiff = (await fx.git(["diff", "--name-status", "--find-renames=50%", a, b])).stdout;
    assert.equal(/^R/m.test(rawDiff), false, "unmitigated diff must actually lose rename detection");
    const low = await inspectDiff(fx.root, { fromRef: a, toRef: b }); assert.equal(low.ok, true); if (low.ok) assert.equal(low.value.changes.filter(e => e.kind === "renamed").length, 4);
    await fx.git(["config", "diff.renameLimit", "10000"]); assert.deepEqual(await inspectDiff(fx.root, { fromRef: a, toRef: b }), low);
  } finally { fx.cleanup(); }
});

test("Round2 replacement hazard: changed tree hidden by replacement remains visible to BR3", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f", "base"); const a = await commitAll(fx, "base");
    const baseTree = (await fx.git(["rev-parse", "HEAD^{tree}"])).stdout.slice(0,-1);
    writeFile(fx.root, "f", "changed"); const b = await commitAll(fx, "changed");
    const replacement = (await fx.git(["commit-tree", baseTree, "-p", a, "-m", "replacement"])).stdout.slice(0,-1);
    await fx.git(["replace", b, replacement]);
    assert.equal((await fx.git(["diff", "--name-status", a, b])).stdout, "");
    assert.ok((await fx.git(["status", "--porcelain=v2"])).stdout.includes("f"));
    const diff = await inspectDiff(fx.root, { fromRef: a, toRef: b }); assert.equal(diff.ok, true); if (diff.ok) assert.deepEqual(diff.value.changes, [{ kind: "modified", path: "f" }]);
    const status = await inspectWorkingTree(fx.root); assert.equal(status.ok, true); if (status.ok) assert.deepEqual(status.value.entries, []);
  } finally { fx.cleanup(); }
});

test("Round2 repository: all eight ancestor classifications side by side", async () => {
  const normal = await createGitFixture(); const bare = await createGitFixture({ bare: true });
  const plain = fs.mkdtempSync(path.join(path.dirname(normal.root), "br3-plain-"));
  try {
    const normalChild = path.join(normal.root, "child"); const bareChild = path.join(bare.root, "child"); fs.mkdirSync(normalChild); fs.mkdirSync(bareChild);
    assert.equal((await bare.git(["rev-parse", "--is-bare-repository"], { cwd: bareChild })).stdout, "true\n");
    const expectCode = async (root: string, code: string) => { const r = await resolveRepository(root); assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error.code, code); };
    await expectCode(normalChild, "PROJECT_ROOT_MISMATCH"); await expectCode(bare.root, "BARE_REPOSITORY_UNSUPPORTED"); await expectCode(bareChild, "BARE_REPOSITORY_UNSUPPORTED");
    fs.appendFileSync(path.join(normal.root, ".git/config"), "\n[broken\n"); fs.appendFileSync(path.join(bare.root, "config"), "\n[broken\n");
    for (const root of [normal.root, bare.root, normalChild, bareChild, plain]) {
      try { execFileSync("git", ["rev-parse", "--is-bare-repository"], { cwd: root, stdio: "pipe" }); assert.fail("Git must fail"); } catch (e) { assert.equal((e as {status:number}).status, 128); }
      await expectCode(root, root === plain ? "NOT_A_GIT_REPOSITORY" : "GIT_COMMAND_FAILED");
    }
  } finally { normal.cleanup(); bare.cleanup(); fs.rmSync(plain, { recursive: true, force: true }); }
});

test("Round2 upstream: Unicode branch and non-commit custom namespace raw object", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f", "base"); await commitAll(fx, "base"); await fx.git(["branch", "-M", "café-日本語"]);
    const tree = (await fx.git(["rev-parse", "HEAD^{tree}"])).stdout.slice(0,-1);
    await fx.git(["update-ref", "refs/custom/tree", tree]); await fx.git(["config", "branch.café-日本語.remote", "."]); await fx.git(["config", "branch.café-日本語.merge", "refs/custom/tree"]);
    const r = await inspectHead(fx.root); assert.equal(r.ok, true); if (r.ok) { assert.equal(r.value.branch, "café-日本語"); assert.deepEqual(r.value.upstream, { remote: ".", mergeRef: "refs/custom/tree", branch: null, ref: "refs/custom/tree", sha: tree }); }
  } finally { fx.cleanup(); }
});

test("Round2 filter: fresh scan rejects attributes introduced between calls", async () => {
  const fx = await createGitFixture();
  try { writeFile(fx.root, "f", "base"); await commitAll(fx, "base"); assert.equal((await inspectWorkingTree(fx.root)).ok, true); const marker = path.join(fx.root, ".git", "fresh-marker"); const script = path.join(fx.root, ".git", "fresh-helper"); fs.writeFileSync(script, `#!/bin/sh\ntouch '${marker}'\ncat\n`, { mode: 0o755 }); await fx.git(["config", "filter.added.clean", script]); writeFile(fx.root, ".gitattributes", "f filter=added\n"); assert.equal((await fx.git(["check-attr", "filter", "--", "f"])).stdout, "f: filter: added\n"); const r = await inspectWorkingTree(fx.root); assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error.code, "EXTERNAL_GIT_FILTER_UNSUPPORTED"); assert.equal(fs.existsSync(marker), false); }
  finally { fx.cleanup(); }
});

test("Round2 process contract: exact status/diff argv, read-only allowlist, unchanged index, no public test seam", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f", "base"); await commitAll(fx, "base"); const before = fs.readFileSync(path.join(fx.root, ".git/index"));
    const calls: string[][] = [];
    await withGitExecutionProbe(e => { calls.push(e.args); assert.ok(path.isAbsolute(e.ctx.execPath)); }, async () => {
      assert.equal((await resolveRepository(fx.root)).ok, true); assert.equal((await inspectHead(fx.root)).ok, true); assert.equal((await inspectWorkingTree(fx.root)).ok, true); assert.equal((await inspectDiff(fx.root, { fromRef: "HEAD", toRef: "HEAD" })).ok, true);
    });
    assert.deepEqual(fs.readFileSync(path.join(fx.root, ".git/index")), before);
    for (const args of calls) {
      let start = 0; while (args[start] === "-c") start += 2;
      const a = args.slice(start);
      assert.ok(["--version", "rev-parse", "symbolic-ref", "config", "ls-files", "check-attr", "status", "diff"].includes(a[0]!));
      if (a[0] === "config") assert.ok(a.includes("--get") || a.includes("--get-all"));
      if (a[0] === "ls-files") assert.deepEqual(a, ["ls-files", "--stage", "-z"]);
      if (a[0] === "check-attr") assert.deepEqual(a, ["check-attr", "--stdin", "-z", "filter"]);
      assert.ok(!args.includes("--get-regexp"));
    }
    assert.deepEqual(calls.find(a => a.includes("status")), ["-c", "core.fsmonitor=", "-c", "status.renameLimit=0", "-c", "status.showStash=false", "status", "--porcelain=v2", "-z", "--find-renames=50%", "--untracked-files=all", "--ignore-submodules=none"]);
    assert.deepEqual(calls.find(a => a[0] === "diff")?.slice(0,8), ["diff", "--no-color", "--no-ext-diff", "--ignore-submodules=none", "-z", "--name-status", "--find-renames=50%", "-l0"]);
    const api = await import("@buildrail/core"); for (const name of ["withGitResolutionProbe", "withGitExecutionProbe", "resolveRepositoryWithContext", "parseStatusOutput", "parseNameStatus"]) assert.ok(!(name in api));
    const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
    const gitRoot = path.join(packageRoot, "src/git");
    const matcher = fs.readFileSync(path.join(gitRoot, "protectedPaths.ts"), "utf8"); assert.ok(!/node:fs|node:child_process|internal\/exec/.test(matcher));
    for (const file of fs.readdirSync(gitRoot).filter(f => f.endsWith(".ts"))) assert.ok(!fs.readFileSync(path.join(gitRoot, file), "utf8").includes(".trim("));
  } finally { fx.cleanup(); }
});

test("Round2 executable trust: Node shell-free ENOEXEC interpreter fallback is not authentication", async t => {
  if (process.platform === "win32") return t.skip("POSIX ENOEXEC behavior does not apply on Windows.");
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "br3-trust-"));
  try {
    const script = path.join(root, "git"); fs.writeFileSync(script, "printf 'git version 2.50.1\\n'\n", { mode: 0o755 });
    assert.equal(resolveGitExecutable(root, root), script);
    try { assert.equal((await promisify(execFile)(script, [], { shell: false, encoding: "utf8" })).stdout, "git version 2.50.1\n"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOEXEC") return t.skip(`Node ${process.version} on ${process.platform} rejects executable text without a shebang with ENOEXEC; filesystem-shape acceptance was asserted separately.`);
      throw error;
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Round2 executable trust: regular executable text satisfies resolver shape contract", () => {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "br3-shape-"));
  try { const file = path.join(root, "git"); fs.writeFileSync(file, "printf 'text'\n", { mode: 0o755 }); assert.equal(resolveGitExecutable(root, root), file); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Round2 diff and status: canonical path order independent of file creation order", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "z-delete", "delete"); writeFile(fx.root, "m-modify", "base"); const a = await commitAll(fx, "base");
    writeFile(fx.root, "m-modify", "changed longer"); fs.rmSync(path.join(fx.root, "z-delete")); writeFile(fx.root, "a-added", "added"); await fx.git(["add", "-A"]);
    const r = await inspectWorkingTree(fx.root); assert.equal(r.ok, true); if (r.ok) assert.deepEqual(r.value.entries.map(e => e.path), ["a-added", "m-modify", "z-delete"]);
    const b = await commitAll(fx, "next"); const d = await inspectDiff(fx.root, { fromRef: a, toRef: b }); assert.equal(d.ok, true); if (d.ok) assert.deepEqual(d.value.changes.map(e => e.path), ["a-added", "m-modify", "z-delete"]);
  } finally { fx.cleanup(); }
});
for (const staged of [false, true]) test(`Round2 working tree: ${staged ? "staged" : "unstaged"} modification only`, async () => {
  const fx = await createGitFixture();
  try { writeFile(fx.root, "f", "base"); await commitAll(fx, "base"); writeFile(fx.root, "f", "changed longer"); if (staged) await fx.git(["add", "f"]); const r = await inspectWorkingTree(fx.root); assert.equal(r.ok, true); if (r.ok) assert.deepEqual(r.value.entries, [{ kind: staged ? "staged_modify" : "unstaged_modify", path: "f" }]); }
  finally { fx.cleanup(); }
});

test("Round2 partial clone: missing blobs required for rename detection cannot lazy fetch", async () => {
  const origin = await createGitFixture(); const holder = await createGitFixture();
  try {
    const content = Array.from({ length: 100 }, (_, i) => `line ${i}\n`).join("");
    writeFile(origin.root, "old", content); const a = await commitAll(origin, "base");
    const blob = (await origin.git(["rev-parse", "HEAD:old"])).stdout.slice(0, -1);
    fs.renameSync(path.join(origin.root, "old"), path.join(origin.root, "new")); fs.appendFileSync(path.join(origin.root, "new"), "more\n"); const b = await commitAll(origin, "next");
    await origin.git(["config", "uploadpack.allowFilter", "true"]);
    const clone = path.join(holder.root, "clone"); await holder.git(["clone", "-q", "--no-checkout", "--filter=blob:none", `file://${origin.root}`, clone]);
    const missing = () => assert.throws(() => execFileSync("git", ["cat-file", "-e", blob], { cwd: clone, env: { ...process.env, GIT_NO_LAZY_FETCH: "1" }, stdio: "pipe" }));
    missing(); const r = await inspectDiff(clone, { fromRef: a, toRef: b }); assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error.code, "GIT_COMMAND_FAILED"); missing();
    assert.match((await holder.git(["diff", "--name-status", "--find-renames=50%", a, b], { cwd: clone })).stdout, /^R/);
  } finally { origin.cleanup(); holder.cleanup(); }
});
