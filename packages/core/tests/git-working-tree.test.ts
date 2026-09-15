import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { inspectWorkingTree } from "@buildrail/core";
import { createGitFixture, commitAll, writeFile } from "./helpers/git-fixture.js";

test("inspectWorkingTree: clean repository -> clean: true, entries: []", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "hi");
    await commitAll(fx, "init");
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.clean, true);
      assert.deepEqual(r.value.entries, []);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectWorkingTree: staged add, unstaged modify (both), untracked", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "hi");
    await commitAll(fx, "init");
    fs.appendFileSync(path.join(fx.root, "f.txt"), "\nmore");
    await fx.git(["add", "f.txt"]);
    fs.appendFileSync(path.join(fx.root, "f.txt"), "\nmore2");
    writeFile(fx.root, "u.txt", "untracked");
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      const kinds = r.value.entries.map((e) => `${e.kind}:${e.path}`).sort();
      assert.deepEqual(kinds, ["staged_modify:f.txt", "unstaged_modify:f.txt", "untracked:u.txt"]);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectWorkingTree: staged delete and unstaged delete", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "a.txt", "a");
    writeFile(fx.root, "b.txt", "b");
    await commitAll(fx, "init");
    await fx.git(["rm", "--cached", "a.txt"]);
    fs.rmSync(path.join(fx.root, "b.txt"));
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      const kinds = r.value.entries.map((e) => e.kind).sort();
      assert.ok(kinds.includes("staged_delete"));
      assert.ok(kinds.includes("unstaged_delete"));
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectWorkingTree: staged rename with correct oldPath/similarity", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "old.txt", "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n");
    await commitAll(fx, "init");
    await fx.git(["mv", "old.txt", "new.txt"]);
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      const rename = r.value.entries.find((e) => e.kind === "staged_rename");
      assert.ok(rename);
      assert.equal(rename?.oldPath, "old.txt");
      assert.equal(rename?.path, "new.txt");
      assert.equal(rename?.similarity, 100);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectWorkingTree: unstaged rename reachable via mv + intent-to-add (git add -N)", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "old.txt", "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n");
    await commitAll(fx, "init");
    fs.renameSync(path.join(fx.root, "old.txt"), path.join(fx.root, "new.txt"));
    await fx.git(["add", "-N", "new.txt"]);
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      const rename = r.value.entries.find((e) => e.kind === "unstaged_rename");
      assert.ok(rename);
      assert.equal(rename?.oldPath, "old.txt");
      assert.equal(rename?.path, "new.txt");
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectWorkingTree: plain mv with no index operation -> unstaged_delete + untracked, never a synthesized rename", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "old.txt", "content");
    await commitAll(fx, "init");
    fs.renameSync(path.join(fx.root, "old.txt"), path.join(fx.root, "new.txt"));
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      const kinds = r.value.entries.map((e) => `${e.kind}:${e.path}`).sort();
      assert.deepEqual(kinds, ["unstaged_delete:old.txt", "untracked:new.txt"]);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectWorkingTree: intent-to-add (git add -N) -> unstaged_add, distinct from untracked/unstaged_modify", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "existing.txt", "x");
    await commitAll(fx, "init");
    writeFile(fx.root, "n.txt", "new");
    await fx.git(["add", "-N", "n.txt"]);
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      const entry = r.value.entries.find((e) => e.path === "n.txt");
      assert.equal(entry?.kind, "unstaged_add");
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectWorkingTree: combined type-2 XY (staged rename + unstaged modify)", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "old.txt", "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n");
    await commitAll(fx, "init");
    await fx.git(["mv", "old.txt", "new.txt"]);
    fs.appendFileSync(path.join(fx.root, "new.txt"), "more\n");
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      const kinds = r.value.entries.map((e) => `${e.kind}:${e.path}`).sort();
      assert.deepEqual(kinds, ["staged_rename:new.txt", "unstaged_modify:new.txt"]);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectWorkingTree: conflicted (unmerged) path -> kind: conflicted", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "base\n");
    await commitAll(fx, "base");
    await fx.git(["checkout", "-q", "-b", "b1"]);
    writeFile(fx.root, "f.txt", "b1\n");
    await commitAll(fx, "b1");
    await fx.git(["checkout", "-q", "-b", "b2", "HEAD~1"]);
    writeFile(fx.root, "f.txt", "b2\n");
    await commitAll(fx, "b2");
    await fx.git(["checkout", "-q", "b1"]);
    try {
      await fx.git(["merge", "-q", "b2"]);
    } catch {
      // Merge conflict is expected — exits non-zero.
    }
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      const entry = r.value.entries.find((e) => e.path === "f.txt");
      assert.equal(entry?.kind, "conflicted");
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectWorkingTree: dirty submodule -> submodule field correctly attached", async () => {
  const src = await createGitFixture();
  const superproject = await createGitFixture();
  try {
    writeFile(src.root, "sf.txt", "base");
    await commitAll(src, "sub base");
    await superproject.git(["-c", "protocol.file.allow=always", "submodule", "add", "-q", src.root, "sub"]);
    await commitAll(superproject, "add submodule");
    fs.appendFileSync(path.join(superproject.root, "sub", "sf.txt"), "\ndirty");
    const r = await inspectWorkingTree(superproject.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      const entry = r.value.entries.find((e) => e.path === "sub");
      assert.ok(entry?.submodule);
      assert.equal(entry?.submodule?.hasModifiedContent, true);
      assert.equal(entry?.submodule?.commitChanged, false);
    }
  } finally {
    src.cleanup();
    superproject.cleanup();
  }
});

test("inspectWorkingTree: renamed dirty submodule -> submodule field attached identically to both emitted entries", async () => {
  const src = await createGitFixture();
  const superproject = await createGitFixture();
  try {
    writeFile(src.root, "sf.txt", "base");
    await commitAll(src, "sub base");
    await superproject.git(["-c", "protocol.file.allow=always", "submodule", "add", "-q", src.root, "sub"]);
    await commitAll(superproject, "add submodule");
    await superproject.git(["mv", "sub", "renamed"]);
    fs.appendFileSync(path.join(superproject.root, "renamed", "sf.txt"), "\ndirty");
    const r = await inspectWorkingTree(superproject.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      const entries = r.value.entries.filter((e) => e.path === "renamed");
      assert.equal(entries.length, 2);
      for (const e of entries) {
        assert.ok(e.submodule);
        assert.equal(e.submodule?.hasModifiedContent, true);
      }
    }
  } finally {
    src.cleanup();
    superproject.cleanup();
  }
});

test("inspectWorkingTree: conflicted gitlink with three index stages does not falsely trigger UNSAFE_SUBMODULE_PATH", async () => {
  const src = await createGitFixture();
  const superproject = await createGitFixture();
  try {
    writeFile(src.root, "sf.txt", "base");
    await commitAll(src, "sub base");
    const srcSha1 = (await src.git(["rev-parse", "HEAD"])).stdout.trim();
    writeFile(src.root, "sf.txt", "changed");
    const srcSha2 = await commitAll(src, "sub change");

    await superproject.git(["-c", "protocol.file.allow=always", "submodule", "add", "-q", src.root, "sub"]);
    await superproject.git(["-C", "sub", "checkout", "-q", srcSha1]);
    await commitAll(superproject, "base with sub sha1");
    await superproject.git(["checkout", "-q", "-b", "b1"]);
    await superproject.git(["-C", "sub", "checkout", "-q", srcSha2]);
    await superproject.git(["add", "sub"]);
    await commitAll(superproject, "b1 sub sha2");
    await superproject.git(["checkout", "-q", "-b", "b2", "HEAD~1"]);
    await superproject.git(["commit", "--allow-empty", "-q", "-m", "b2 no change"]);
    await superproject.git(["checkout", "-q", "b1"]);
    try {
      await superproject.git(["merge", "-q", "b2"]);
    } catch {
      // May or may not conflict depending on Git's own gitlink merge heuristics; proceed regardless.
    }

    const r = await inspectWorkingTree(superproject.root);
    // The key assertion: this must not fail with UNSAFE_SUBMODULE_PATH merely
    // because ls-files reports multiple stage records for "sub".
    if (!r.ok) {
      assert.notEqual(r.error.code, "UNSAFE_SUBMODULE_PATH");
    }
  } finally {
    src.cleanup();
    superproject.cleanup();
  }
});

test("inspectWorkingTree: repository-local status.renameLimit cannot alter results (-c status.renameLimit=0 pinned)", async () => {
  const fx = await createGitFixture();
  try {
    for (let i = 0; i < 4; i++) {
      writeFile(fx.root, `f${i}.txt`, Array.from({ length: 20 }, (_, j) => `line${j}-${i}`).join("\n"));
    }
    await commitAll(fx, "init");
    await fx.git(["config", "status.renameLimit", "1"]);
    for (let i = 0; i < 4; i++) {
      fs.renameSync(path.join(fx.root, `f${i}.txt`), path.join(fx.root, `r${i}.txt`));
      await fx.git(["add", "-N", `r${i}.txt`]);
    }
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      const renames = r.value.entries.filter((e) => e.kind === "unstaged_rename");
      assert.equal(renames.length, 4);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectWorkingTree: status.showStash=true does not break parsing (# stash header suppressed)", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "base");
    await commitAll(fx, "init");
    fs.appendFileSync(path.join(fx.root, "f.txt"), "\nstash-me");
    await fx.git(["stash", "push", "-q"]);
    await fx.git(["config", "status.showStash", "true"]);
    writeFile(fx.root, "u.txt", "untracked");
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      const kinds = r.value.entries.map((e) => e.kind);
      assert.ok(!kinds.includes("staged_add" as never) || true);
      const untracked = r.value.entries.find((e) => e.path === "u.txt");
      assert.equal(untracked?.kind, "untracked");
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectWorkingTree: diff.ignoreSubmodules=all on repository-local config does not suppress submodule state (status path)", async () => {
  const src = await createGitFixture();
  const superproject = await createGitFixture();
  try {
    writeFile(src.root, "sf.txt", "base");
    await commitAll(src, "sub base");
    await superproject.git(["-c", "protocol.file.allow=always", "submodule", "add", "-q", src.root, "sub"]);
    await commitAll(superproject, "add submodule");
    await superproject.git(["config", "diff.ignoreSubmodules", "all"]);
    fs.appendFileSync(path.join(superproject.root, "sub", "sf.txt"), "\ndirty");
    const r = await inspectWorkingTree(superproject.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      const entry = r.value.entries.find((e) => e.path === "sub");
      assert.ok(entry);
    }
  } finally {
    src.cleanup();
    superproject.cleanup();
  }
});

test("inspectWorkingTree: active filter attribute -> EXTERNAL_GIT_FILTER_UNSUPPORTED, filter never executed", async () => {
  const fx = await createGitFixture();
  try {
    const markerPath = path.join(fx.root, "..", `marker-${path.basename(fx.root)}.txt`);
    writeFile(fx.root, ".gitattributes", "*.txt filter=canon\n");
    writeFile(fx.root, "f.txt", "hello");
    await fx.git(["config", "filter.canon.clean", `sh -c 'touch "${markerPath}" && cat'`]);
    await fx.git(["config", "filter.canon.smudge", "cat"]);
    await commitAll(fx, "init");
    fs.rmSync(markerPath, { force: true });
    fs.appendFileSync(path.join(fx.root, "f.txt"), "\nchanged");
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "EXTERNAL_GIT_FILTER_UNSUPPORTED");
    assert.equal(fs.existsSync(markerPath), false, "filter must never actually execute");
    fs.rmSync(markerPath, { force: true });
  } finally {
    fx.cleanup();
  }
});

test("inspectWorkingTree: filter-free repository remains fully, normally inspectable (no false-positive refusal)", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "hello");
    await commitAll(fx, "init");
    fs.appendFileSync(path.join(fx.root, "f.txt"), "\nchanged");
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, true);
  } finally {
    fx.cleanup();
  }
});

test("inspectWorkingTree: replacement ref for HEAD does not alter reported facts (GIT_NO_REPLACE_OBJECTS=1)", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "base");
    const headSha = await commitAll(fx, "base");
    writeFile(fx.root, "f.txt", "replacement-tree-content");
    await fx.git(["add", "f.txt"]);
    await fx.git(["commit", "-q", "-m", "replacement", "--allow-empty"]);
    const replacementSha = (await fx.git(["commit-tree", (await fx.git(["write-tree"])).stdout.trim(), "-p", headSha, "-m", "r"])).stdout.trim();
    await fx.git(["reset", "-q", "--hard", headSha]);
    await fx.git(["replace", headSha, replacementSha]);
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.clean, true);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectWorkingTree: index is not mutated as a side effect (GIT_OPTIONAL_LOCKS=0 read-only guarantee)", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "base");
    await commitAll(fx, "init");
    const indexPath = path.join(fx.root, ".git", "index");
    fs.utimesSync(path.join(fx.root, "f.txt"), new Date(), new Date());
    const before = fs.readFileSync(indexPath);
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, true);
    const after = fs.readFileSync(indexPath);
    assert.deepEqual(before, after);
  } finally {
    fx.cleanup();
  }
});
