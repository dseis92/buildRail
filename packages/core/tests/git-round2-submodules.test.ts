import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { inspectWorkingTree } from "@buildrail/core";
import { withGitExecutionProbe } from "#internal/git/internal/exec.js";
import { createGitFixture, commitAll, writeFile } from "./helpers/git-fixture.js";

for (const shape of ["old-form", "absorbed", "nested", "space path", "Unicode path", "tab path", "newline path", "uninitialized", "external", "parent", "linked-worktree", "root symlink", "root parent symlink", "dotgit symlink", "duplicate metadata"]) test(`Round2 submodule: ${shape}`, async t => {
  if (process.platform === "win32" && /symlink|tab|newline/.test(shape)) return t.skip("Fixture requires POSIX symlinks/control-character filenames.");
  const src = await createGitFixture(); const fx = await createGitFixture();
  try {
    writeFile(src.root, "file", "base"); const sha = await commitAll(src, "base");
    const name = shape === "space path" ? "sub space" : shape === "Unicode path" ? "sub-café" : shape === "tab path" ? "sub\ttab" : shape === "newline path" ? "sub\nline" : "sub";
    const child = path.join(fx.root, name);
    if (shape === "old-form") {
      await fx.git(["clone", "-q", src.root, child]);
      await fx.git(["update-index", "--add", "--cacheinfo", `160000,${sha},${name}`]);
    } else {
      await fx.git(["-c", "protocol.file.allow=always", "submodule", "add", "-q", "--name", "safe-name", src.root, name]);
    }
    await commitAll(fx, "add sub");
    assert.equal(fs.lstatSync(path.join(child, ".git")).isDirectory(), shape === "old-form");
    if (shape === "nested") {
      await fx.git(["-C", name, "-c", "protocol.file.allow=always", "submodule", "add", "-q", src.root, "nested"]);
      await fx.git(["-C", name, "-c", "user.name=Test", "-c", "user.email=t@t", "commit", "-qam", "nested"]);
      await commitAll(fx, "nested pointer");
    }
    if (shape === "uninitialized") {
      await fx.git(["submodule", "deinit", "-f", "--", name]);
      assert.equal(fs.existsSync(path.join(child, ".git")), false);
    }
    const unsafe = ["external", "parent", "linked-worktree", "root symlink", "root parent symlink", "dotgit symlink", "duplicate metadata"].includes(shape);
    if (shape === "external" || shape === "parent") {
      const target = shape === "external" ? path.join(src.root, ".git") : path.join(fx.root, ".git");
      fs.writeFileSync(path.join(child, ".git"), `gitdir: ${target}\n`);
      const actual = (await fx.git(["-C", name, "rev-parse", "--absolute-git-dir"])).stdout.slice(0, -1);
      assert.equal(fs.realpathSync(actual), fs.realpathSync(target));
      if (shape === "parent") assert.equal((await fx.git(["-C", name, "ls-files", "--stage"])).stdout, (await fx.git(["ls-files", "--stage"])).stdout);
    }
    if (shape === "linked-worktree") {
      await fx.git(["worktree", "add", "-qb", "worktree", path.join(fx.root, "wt")]);
      fs.writeFileSync(path.join(child, ".git"), `gitdir: ${path.join(fx.root, ".git", "worktrees", "wt")}\n`);
      const gd = (await fx.git(["-C", name, "rev-parse", "--git-dir"])).stdout;
      const gc = (await fx.git(["-C", name, "rev-parse", "--git-common-dir"])).stdout;
      assert.notEqual(gd, gc);
      assert.equal((await fx.git(["-C", name, "rev-parse", "--is-bare-repository"])).stdout, "false\n");
      assert.equal((await fx.git(["-C", name, "ls-files", "--stage"])).stdout, (await fx.git(["-C", "wt", "ls-files", "--stage"])).stdout);
    }
    if (shape === "root symlink" || shape === "root parent symlink") { fs.rmSync(child, { recursive: true }); fs.symlinkSync(shape === "root symlink" ? src.root : fx.root, child); }
    if (shape === "dotgit symlink") { fs.rmSync(path.join(child, ".git")); fs.symlinkSync(path.join(src.root, ".git"), path.join(child, ".git")); }
    if (shape === "duplicate metadata") {
      await fx.git(["-C", name, "config", "--unset", "core.worktree"]);
      const second = path.join(fx.root, "sub2"); fs.mkdirSync(second);
      fs.copyFileSync(path.join(child, ".git"), path.join(second, ".git"));
      await fx.git(["update-index", "--add", "--cacheinfo", `160000,${sha},sub2`]);
      assert.equal((await fx.git(["-C", "sub2", "rev-parse", "--absolute-git-dir"])).stdout, (await fx.git(["-C", name, "rev-parse", "--absolute-git-dir"])).stdout);
    }
    const recursiveCalls: string[] = [];
    const r = await withGitExecutionProbe(e => { if (e.args.some(arg => ["ls-files", "check-attr"].includes(arg))) recursiveCalls.push(e.cwd); }, () => inspectWorkingTree(fx.root));
    if (unsafe) {
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.error.code, "UNSAFE_SUBMODULE_PATH");
      assert.ok(!recursiveCalls.includes(src.root));
      if (shape !== "duplicate metadata") assert.ok(!recursiveCalls.includes(child));
    } else {
      assert.equal(r.ok, true);
      if (shape === "uninitialized") assert.ok(!recursiveCalls.includes(child));
      else assert.ok(recursiveCalls.includes(child));
      if (shape === "nested") assert.ok(recursiveCalls.includes(path.join(child, "nested")));
    }
  } finally { src.cleanup(); fx.cleanup(); }
});

test("Round2 submodule: non-symlink bind-mount working-root cycle", t => {
  t.skip(`${process.platform}: this runner provides no authorized bind-mount fixture facility; §20 makes this case conditional on constructibility. Symlink cycles and metadata aliases have independent real-Git tests.`);
});
