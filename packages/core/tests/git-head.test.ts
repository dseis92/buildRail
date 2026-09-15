import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectHead } from "@buildrail/core";
import * as fs from "node:fs";
import { createGitFixture, commitAll, writeFile } from "./helpers/git-fixture.js";

test("inspectHead: normal branch with commits", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "hi");
    const sha = await commitAll(fx, "init");
    const r = await inspectHead(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.detached, false);
      assert.equal(r.value.unborn, false);
      assert.equal(r.value.headSha, sha);
      assert.equal(r.value.upstream, null);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectHead: unborn branch, zero commits, no upstream configured", async () => {
  const fx = await createGitFixture();
  try {
    const r = await inspectHead(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.unborn, true);
      assert.equal(r.value.detached, false);
      assert.equal(r.value.headSha, null);
      assert.equal(r.value.upstream, null);
      assert.notEqual(r.value.branch, null);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectHead: detached HEAD -> upstream null", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "hi");
    const sha = await commitAll(fx, "init");
    await fx.git(["checkout", "-q", sha]);
    const r = await inspectHead(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.detached, true);
      assert.equal(r.value.branch, null);
      assert.equal(r.value.headSha, sha);
      assert.equal(r.value.upstream, null);
    }
  } finally {
    fx.cleanup();
  }
});

test('inspectHead: local-branch upstream (remote=".") resolvable', async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "hi");
    await commitAll(fx, "init");
    await fx.git(["checkout", "-q", "-b", "other"]);
    writeFile(fx.root, "g.txt", "hi2");
    const otherSha = await commitAll(fx, "other commit");
    await fx.git(["checkout", "-q", "-"]);
    await fx.git(["branch", "--set-upstream-to=other"]);
    const r = await inspectHead(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.ok(r.value.upstream);
      assert.equal(r.value.upstream?.remote, ".");
      assert.equal(r.value.upstream?.mergeRef, "refs/heads/other");
      assert.equal(r.value.upstream?.branch, "other");
      assert.equal(r.value.upstream?.ref, "refs/heads/other");
      assert.equal(r.value.upstream?.sha, otherSha);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectHead: configured but unresolvable upstream -> ref/sha null, remote/mergeRef/branch populated", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "hi");
    await commitAll(fx, "init");
    await fx.git(["config", "branch.master.remote", "origin"]);
    await fx.git(["config", "branch.master.merge", "refs/heads/master"]);
    // Determine actual current branch name (could be main or master).
    const { stdout: branchName } = await fx.git(["symbolic-ref", "--short", "HEAD"]);
    const branch = branchName.trim();
    await fx.git(["config", `branch.${branch}.remote`, "origin"]);
    await fx.git(["config", `branch.${branch}.merge`, "refs/heads/nonexistent"]);
    const r = await inspectHead(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.ok(r.value.upstream);
      assert.equal(r.value.upstream?.remote, "origin");
      assert.equal(r.value.upstream?.mergeRef, "refs/heads/nonexistent");
      assert.equal(r.value.upstream?.branch, "nonexistent");
      assert.equal(r.value.upstream?.ref, null);
      assert.equal(r.value.upstream?.sha, null);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectHead: unborn branch with a RESOLVABLE configured upstream -> non-null ref/sha", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "base");
    await commitAll(fx, "base");
    const { stdout: masterName } = await fx.git(["symbolic-ref", "--short", "HEAD"]);
    await fx.git(["branch", "-m", masterName.trim(), "master"]);
    const masterSha = (await fx.git(["rev-parse", "master"])).stdout.trim();
    await fx.git(["symbolic-ref", "HEAD", "refs/heads/new"]);
    await fx.git(["config", "branch.new.remote", "."]);
    await fx.git(["config", "branch.new.merge", "refs/heads/master"]);
    const r = await inspectHead(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.unborn, true);
      assert.ok(r.value.upstream);
      assert.equal(r.value.upstream?.ref, "refs/heads/master");
      assert.equal(r.value.upstream?.sha, masterSha);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectHead: unborn branch with an UNRESOLVABLE configured upstream -> ref/sha null, never assumed from unborn status alone", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "base");
    await commitAll(fx, "base");
    await fx.git(["symbolic-ref", "HEAD", "refs/heads/new"]);
    await fx.git(["config", "branch.new.remote", "."]);
    await fx.git(["config", "branch.new.merge", "refs/heads/does-not-exist"]);
    const r = await inspectHead(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.unborn, true);
      assert.ok(r.value.upstream);
      assert.equal(r.value.upstream?.ref, null);
      assert.equal(r.value.upstream?.sha, null);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectHead: local lightweight tag upstream target -> branch null, sha equals commit SHA directly", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "base");
    const commitSha = await commitAll(fx, "base");
    await fx.git(["tag", "v1-lw"]);
    const { stdout: branchName } = await fx.git(["symbolic-ref", "--short", "HEAD"]);
    const branch = branchName.trim();
    await fx.git(["config", `branch.${branch}.remote`, "."]);
    await fx.git(["config", `branch.${branch}.merge`, "refs/tags/v1-lw"]);
    const r = await inspectHead(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.upstream?.mergeRef, "refs/tags/v1-lw");
      assert.equal(r.value.upstream?.branch, null);
      assert.equal(r.value.upstream?.ref, "refs/tags/v1-lw");
      assert.equal(r.value.upstream?.sha, commitSha);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectHead: local ANNOTATED tag upstream target -> sha is the raw, unpeeled tag object SHA, not the peeled commit SHA", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "base");
    const commitSha = await commitAll(fx, "base");
    await fx.git(["tag", "-a", "v1-ann", "-m", "annotated"]);
    const tagObjectSha = (await fx.git(["rev-parse", "refs/tags/v1-ann"])).stdout.trim();
    assert.notEqual(tagObjectSha, commitSha);
    const { stdout: branchName } = await fx.git(["symbolic-ref", "--short", "HEAD"]);
    const branch = branchName.trim();
    await fx.git(["config", `branch.${branch}.remote`, "."]);
    await fx.git(["config", `branch.${branch}.merge`, "refs/tags/v1-ann"]);
    const r = await inspectHead(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.upstream?.branch, null);
      assert.equal(r.value.upstream?.sha, tagObjectSha);
      assert.notEqual(r.value.upstream?.sha, commitSha);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectHead: arbitrary custom-namespace ref upstream target -> branch null, ref/mergeRef preserved verbatim", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "base");
    const commitSha = await commitAll(fx, "base");
    await fx.git(["update-ref", "refs/custom/foo", commitSha]);
    const { stdout: branchName } = await fx.git(["symbolic-ref", "--short", "HEAD"]);
    const branch = branchName.trim();
    await fx.git(["config", `branch.${branch}.remote`, "."]);
    await fx.git(["config", `branch.${branch}.merge`, "refs/custom/foo"]);
    const r = await inspectHead(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.upstream?.mergeRef, "refs/custom/foo");
      assert.equal(r.value.upstream?.branch, null);
      assert.equal(r.value.upstream?.ref, "refs/custom/foo");
      assert.equal(r.value.upstream?.sha, commitSha);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectHead: embedded-newline branch.<b>.merge value is recovered as one complete value via -z, never split", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "base");
    await commitAll(fx, "base");
    await fx.git(["branch", "foo"]);
    await fx.git(["branch", "bar"]);
    const { stdout: branchName } = await fx.git(["symbolic-ref", "--short", "HEAD"]);
    const branch = branchName.trim();
    await fx.git(["config", `branch.${branch}.remote`, "."]);
    // First configured value contains an embedded newline in its own content.
    await fx.git(["config", `branch.${branch}.merge`, "refs/heads/foo\nrefs/heads/bar"]);
    await fx.git(["config", "--add", `branch.${branch}.merge`, "refs/heads/bar"]);
    assert.equal((await fx.git(["config", "-z", "--get-all", `branch.${branch}.merge`])).stdout, "refs/heads/foo\nrefs/heads/bar\0refs/heads/bar\0");
    assert.equal((await fx.git(["config", "--get-all", `branch.${branch}.merge`])).stdout, "refs/heads/foo\nrefs/heads/bar\nrefs/heads/bar\n");
    const r = await inspectHead(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      // The first complete NUL-delimited value, embedded newline included, is used verbatim.
      assert.equal(r.value.upstream?.mergeRef, "refs/heads/foo\nrefs/heads/bar");
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectHead: no network operation occurs (partial-clone lazy-fetch disabled)", async () => {
  const origin = await createGitFixture();
  try {
    writeFile(origin.root, "big.txt", "x".repeat(1000));
    await commitAll(origin, "base");
    const clone = await createGitFixture();
    clone.cleanup();
    const cloneDir = clone.root;
    const { execFile: execFileCb } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFileCb);
    await execFileAsync("git", ["clone", "-q", "--filter=blob:none", "--no-local", `file://${origin.root}`, cloneDir]);
    await execFileAsync("git", ["config", "user.email", "t@t.com"], { cwd: cloneDir });
    await execFileAsync("git", ["config", "user.name", "T"], { cwd: cloneDir });
    // Remove the origin so any lazy-fetch attempt would fail loudly rather than silently succeed.
    await execFileAsync("git", ["remote", "remove", "origin"], { cwd: cloneDir });
    const r = await inspectHead(cloneDir);
    // HEAD itself should still resolve without needing blob content.
    assert.equal(r.ok, true);
    fs.rmSync(cloneDir, { recursive: true, force: true });
  } finally {
    origin.cleanup();
  }
});
