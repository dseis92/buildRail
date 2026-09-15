import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { inspectDiff } from "@buildrail/core";
import { createGitFixture, commitAll, writeFile } from "./helpers/git-fixture.js";

test("inspectDiff: added/modified/deleted/renamed/type-changed classification", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "mod.txt", "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n");
    writeFile(fx.root, "del.txt", "gone");
    writeFile(fx.root, "old.txt", "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n");
    const fromSha = await commitAll(fx, "c1");
    fs.appendFileSync(path.join(fx.root, "mod.txt"), "more\n");
    fs.rmSync(path.join(fx.root, "del.txt"));
    fs.renameSync(path.join(fx.root, "old.txt"), path.join(fx.root, "new.txt"));
    writeFile(fx.root, "add.txt", "new file");
    const toSha = await commitAll(fx, "c2");

    const r = await inspectDiff(fx.root, { fromRef: fromSha, toRef: toSha });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.fromSha, fromSha);
      assert.equal(r.value.toSha, toSha);
      const byPath = Object.fromEntries(r.value.changes.map((c) => [c.path, c]));
      assert.equal(byPath["mod.txt"]?.kind, "modified");
      assert.equal(byPath["del.txt"]?.kind, "deleted");
      assert.equal(byPath["add.txt"]?.kind, "added");
      assert.equal(byPath["new.txt"]?.kind, "renamed");
      assert.equal(byPath["new.txt"]?.oldPath, "old.txt");
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectDiff: below-threshold rename remains delete+add, never forced into a rename", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "old.txt", "aaaaaaaaaa");
    const fromSha = await commitAll(fx, "c1");
    fs.rmSync(path.join(fx.root, "old.txt"));
    writeFile(fx.root, "new.txt", "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
    const toSha = await commitAll(fx, "c2");
    const r = await inspectDiff(fx.root, { fromRef: fromSha, toRef: toSha });
    assert.equal(r.ok, true);
    if (r.ok) {
      const kinds = r.value.changes.map((c) => c.kind).sort();
      assert.deepEqual(kinds, ["added", "deleted"]);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectDiff: nonexistent ref -> REF_NOT_FOUND", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "x");
    const sha = await commitAll(fx, "c1");
    const r = await inspectDiff(fx.root, { fromRef: "does-not-exist-xyz", toRef: sha });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "REF_NOT_FOUND");
  } finally {
    fx.cleanup();
  }
});

test("inspectDiff: nonexistent option-shaped ref string -> REF_NOT_FOUND, never interpreted as a flag", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "x");
    const sha = await commitAll(fx, "c1");
    const r = await inspectDiff(fx.root, { fromRef: "--upload-pack=x", toRef: sha });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "REF_NOT_FOUND");
  } finally {
    fx.cleanup();
  }
});

test("inspectDiff: genuinely valid option-shaped ref (refs/heads/-foo) resolves correctly, never rejected", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "x");
    const sha1 = await commitAll(fx, "c1");
    writeFile(fx.root, "f.txt", "y");
    const sha2 = await commitAll(fx, "c2");
    await fx.git(["update-ref", "refs/heads/-foo", sha1]);
    const r = await inspectDiff(fx.root, { fromRef: "-foo", toRef: sha2 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.fromSha, sha1);
      assert.equal(r.value.toSha, sha2);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectDiff: copy detection is disabled — a near-duplicate new file is reported as added, never copied", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "orig.txt", "shared content shared content shared content");
    const fromSha = await commitAll(fx, "c1");
    writeFile(fx.root, "dup.txt", "shared content shared content shared content");
    const toSha = await commitAll(fx, "c2");
    const r = await inspectDiff(fx.root, { fromRef: fromSha, toRef: toSha });
    assert.equal(r.ok, true);
    if (r.ok) {
      const dup = r.value.changes.find((c) => c.path === "dup.txt");
      assert.equal(dup?.kind, "added");
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectDiff: diff.ignoreSubmodules=all repository-local config cannot suppress a changed gitlink", async () => {
  const src = await createGitFixture();
  const superproject = await createGitFixture();
  try {
    writeFile(src.root, "sf.txt", "1");
    const srcSha1 = await commitAll(src, "sub c1");
    writeFile(src.root, "sf.txt", "2");
    const srcSha2 = await commitAll(src, "sub c2");

    await superproject.git(["-c", "protocol.file.allow=always", "submodule", "add", "-q", src.root, "sub"]);
    await superproject.git(["-C", "sub", "checkout", "-q", srcSha1]);
    await superproject.git(["add", "sub"]);
    const fromSha = await commitAll(superproject, "base");
    await superproject.git(["-C", "sub", "checkout", "-q", srcSha2]);
    await superproject.git(["add", "sub"]);
    const toSha = await commitAll(superproject, "bump sub");

    await superproject.git(["config", "diff.ignoreSubmodules", "all"]);
    assert.equal((await superproject.git(["diff", "--name-status", fromSha, toSha])).stdout, "");
    const r = await inspectDiff(superproject.root, { fromRef: fromSha, toRef: toSha });
    assert.equal(r.ok, true);
    if (r.ok) {
      const subChange = r.value.changes.find((c) => c.path === "sub");
      assert.ok(subChange, "gitlink change must not be suppressed by repository-local diff.ignoreSubmodules");
      assert.equal(subChange?.kind, "modified");
    }
  } finally {
    src.cleanup();
    superproject.cleanup();
  }
});

test("inspectDiff: repository-local diff.renameLimit cannot suppress rename detection (-l0 pinned)", async () => {
  const fx = await createGitFixture();
  try {
    for (let i = 0; i < 4; i++) {
      writeFile(fx.root, `f${i}.txt`, Array.from({ length: 20 }, (_, j) => `line${j}-${i}`).join("\n"));
    }
    const fromSha = await commitAll(fx, "c1");
    for (let i = 0; i < 4; i++) {
      fs.renameSync(path.join(fx.root, `f${i}.txt`), path.join(fx.root, `r${i}.txt`));
    }
    await fx.git(["config", "diff.renameLimit", "1"]);
    const toSha = await commitAll(fx, "c2");
    const r = await inspectDiff(fx.root, { fromRef: fromSha, toRef: toSha });
    assert.equal(r.ok, true);
    if (r.ok) {
      const renames = r.value.changes.filter((c) => c.kind === "renamed");
      assert.equal(renames.length, 4);
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectDiff: independent of current working-tree state and active filter attributes", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "hello");
    const fromSha = await commitAll(fx, "c1");
    fs.appendFileSync(path.join(fx.root, "f.txt"), "\nchanged");
    const toSha = await commitAll(fx, "c2");
    // Add an active filter attribute to the working tree AFTER both commits exist.
    const markerPath = path.join(fx.root, "..", `marker2-${path.basename(fx.root)}.txt`);
    writeFile(fx.root, ".gitattributes", "*.txt filter=canon\n");
    await fx.git(["config", "filter.canon.clean", `sh -c 'touch "${markerPath}" && cat'`]);
    await fx.git(["config", "filter.canon.smudge", "cat"]);
    const r = await inspectDiff(fx.root, { fromRef: fromSha, toRef: toSha });
    assert.equal(r.ok, true, "inspectDiff must succeed despite a working-tree filter attribute unrelated to the diffed commits");
    assert.equal(fs.existsSync(markerPath), false, "inspectDiff must never trigger a content filter");
    fs.rmSync(markerPath, { force: true });
  } finally {
    fx.cleanup();
  }
});

test("inspectDiff: replacement objects do not alter reported diff content", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f.txt", "base");
    const fromSha = await commitAll(fx, "base");
    writeFile(fx.root, "f.txt", "real-change");
    const toSha = await commitAll(fx, "real change");

    // Build a replacement commit for toSha with a deliberately different tree.
    writeFile(fx.root, "f.txt", "replacement-content-not-real");
    await fx.git(["add", "f.txt"]);
    const replacementTree = (await fx.git(["write-tree"])).stdout.trim();
    const replacementSha = (await fx.git(["commit-tree", replacementTree, "-p", fromSha, "-m", "replacement"])).stdout.trim();
    await fx.git(["checkout", "-q", "-f", "-"]).catch(() => {});
    await fx.git(["reset", "-q", "--hard", toSha]);
    await fx.git(["replace", toSha, replacementSha]);

    const r = await inspectDiff(fx.root, { fromRef: fromSha, toRef: toSha });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.toSha, toSha);
      const change = r.value.changes.find((c) => c.path === "f.txt");
      assert.equal(change?.kind, "modified");
    }
  } finally {
    fx.cleanup();
  }
});
