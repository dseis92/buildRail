import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { inspectDiff, inspectHead, inspectWorkingTree, resolveRepository, matchProtectedPaths } from "@buildrail/core";
import { withGitExecutionProbe } from "#internal/git/internal/exec.js";
import { createGitFixture, commitAll, writeFile } from "./helpers/git-fixture.js";

// Real Git tree/index byte fixtures work even on filesystems that reject byte filenames.
for (const operation of ["status", "diff"]) test(`Round2 raw path: invalid UTF8 ${operation} from real Git metadata`, async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "base", "base"); const from = await commitAll(fx, "base");
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: fx.root, input: "content", encoding: "utf8" }).slice(0, -1);
    const rawName = Buffer.from([0x62, 0x61, 0x64, 0x2d, 0xff]);
    const record = Buffer.concat([Buffer.from(`100644 ${blob}\t`), rawName, Buffer.from([0])]);
    execFileSync("git", ["update-index", "-z", "--index-info"], { cwd: fx.root, input: record });
    const rawIndex = execFileSync("git", ["ls-files", "-z"], { cwd: fx.root });
    assert.ok(rawIndex.includes(rawName));
    let result;
    if (operation === "status") result = await inspectWorkingTree(fx.root);
    else {
      const tree = execFileSync("git", ["write-tree"], { cwd: fx.root, encoding: "utf8" }).slice(0, -1);
      const to = execFileSync("git", ["commit-tree", tree, "-p", from, "-m", "raw path"], { cwd: fx.root, encoding: "utf8" }).slice(0, -1);
      const rawDiff = execFileSync("git", ["diff", "--name-status", "-z", from, to], { cwd: fx.root });
      assert.ok(rawDiff.includes(rawName));
      result = await inspectDiff(fx.root, { fromRef: from, toRef: to });
    }
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("Invalid byte paths must fail the complete operation");
    assert.equal(result.error.code, "MALFORMED_GIT_OUTPUT");
  } finally { fx.cleanup(); }
});

test("Round2 attributes: exact space Unicode triple and scan ownership including empty index", async () => {
  const fx = await createGitFixture();
  try {
    const calls: string[][] = [];
    await withGitExecutionProbe(e => { calls.push(e.args); }, () => inspectWorkingTree(fx.root));
    assert.equal(calls.filter(a => a.includes("check-attr")).length, 1);
    const name = "space café.txt";
    writeFile(fx.root, name, "base"); const a = await commitAll(fx, "base");
    writeFile(fx.root, name, "changed"); const b = await commitAll(fx, "next");
    const marker = path.join(fx.root, ".git", "marker");
    const script = path.join(fx.root, ".git", "helper");
    fs.writeFileSync(script, `#!/bin/sh\ntouch '${marker}'\ncat\n`, { mode: 0o755 });
    await fx.git(["config", "filter.driver.clean", script]);
    writeFile(fx.root, ".gitattributes", '"space café.txt" filter=driver\n');
    const raw = execFileSync("git", ["check-attr", "--stdin", "-z", "filter"], { cwd: fx.root, input: Buffer.from(name + "\0") });
    assert.deepEqual(raw, Buffer.from(`${name}\0filter\0driver\0`));
    assert.equal(fs.existsSync(marker), false);
    for (const op of [() => resolveRepository(fx.root), () => inspectHead(fx.root), () => inspectDiff(fx.root, { fromRef: a, toRef: b })]) {
      calls.length = 0;
      const result = await withGitExecutionProbe<{ ok: boolean }>(e => { calls.push(e.args); }, op);
      assert.equal(result.ok, true);
      assert.equal(calls.some(args => args.includes("check-attr")), false);
    }
    calls.length = 0;
    const result = await withGitExecutionProbe(e => { calls.push(e.args); }, () => inspectWorkingTree(fx.root));
    assert.equal(result.ok, false);
    if (!result.ok) { assert.equal(result.error.code, "EXTERNAL_GIT_FILTER_UNSUPPORTED"); assert.ok(JSON.stringify(result.error.details).includes(name)); }
    assert.equal(calls.some(args => args.includes("status")), false);
    assert.equal(fs.existsSync(marker), false);
  } finally { fx.cleanup(); }
});

test("Round2 ref backend: malformed files and reftable plus plain directory discriminated together", async () => {
  const fixtures = [];
  try {
    const plain = await createGitFixture(); fixtures.push(plain); fs.rmSync(path.join(plain.root, ".git"), { recursive: true });
    const ordinary = await createGitFixture(); fixtures.push(ordinary);
    const bare = await createGitFixture({ bare: true }); fixtures.push(bare);
    const table = await createGitFixture({ bare: true }); fixtures.push(table);
    await table.git(["refs", "migrate", "--ref-format=reftable"]);
    for (const [fx, relative] of [[ordinary, ".git/config"], [bare, "config"], [table, "config"]] as const) fs.appendFileSync(path.join(fx.root, relative), "\n[broken\n");
    for (const fx of fixtures) { const r = await resolveRepository(fx.root); assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error.code, fx === plain ? "NOT_A_GIT_REPOSITORY" : "GIT_COMMAND_FAILED"); }
  } finally { for (const fx of fixtures) fx.cleanup(); }
});

test("Round2 protected rename: only current side matches", () => {
  const r = matchProtectedPaths([{ path: "new/file", origin: "current" }, { path: "old/file", origin: "old_side_of_rename" }], [{ name: "new", status: "locked", paths: ["new/**"] }]);
  assert.equal(r.matches.length, 1); assert.equal(r.matches[0]?.matchedVia, "path");
});

for (const token of ["Ajunk", "M\n", "D ", "Tgarbage"]) test(`Round2 malformed ordinary diff token: ${JSON.stringify(token)}`, async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f", "base"); await commitAll(fx, "base");
    const r = await withGitExecutionProbe(e => e.args[0] === "diff" ? { ok: true, code: 0, stdout: Buffer.from(`${token}\0f\0`), stderr: Buffer.alloc(0) } : undefined, () => inspectDiff(fx.root, { fromRef: "HEAD", toRef: "HEAD" }));
    assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error.code, "MALFORMED_GIT_OUTPUT");
  } finally { fx.cleanup(); }
});

test("Round2 malformed stage header: trailing newline cannot pass full grammar", async () => {
  const fx = await createGitFixture();
  try {
    const r = await withGitExecutionProbe(e => e.args.includes("ls-files") ? { ok: true, code: 0, stdout: Buffer.from(`100644 ${"a".repeat(40)} 0\n\tf\0`), stderr: Buffer.alloc(0) } : undefined, () => inspectWorkingTree(fx.root));
    assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error.code, "MALFORMED_GIT_OUTPUT");
  } finally { fx.cleanup(); }
});
