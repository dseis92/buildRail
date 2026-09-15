import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveRepository } from "@buildrail/core";
import { createGitFixture, commitAll } from "./helpers/git-fixture.js";

test("resolveRepository: valid repository root resolves successfully", async () => {
  const fx = await createGitFixture();
  try {
    const r = await resolveRepository(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(fs.realpathSync(r.value.root), fs.realpathSync(fx.root));
      assert.equal(r.value.isWorktree, false);
      assert.equal(r.value.gitDir, r.value.gitCommonDir);
    }
  } finally {
    fx.cleanup();
  }
});

test("resolveRepository: nonexistent projectRoot -> PROJECT_ROOT_NOT_FOUND", async () => {
  const r = await resolveRepository("/tmp/br3-does-not-exist-xyz-123");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.code, "PROJECT_ROOT_NOT_FOUND");
});

test("resolveRepository: plain non-Git directory -> NOT_A_GIT_REPOSITORY", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "br3-plain-"));
  try {
    const r = await resolveRepository(dir);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "NOT_A_GIT_REPOSITORY");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveRepository: subdirectory of a real repo, not its root -> PROJECT_ROOT_MISMATCH", async () => {
  const fx = await createGitFixture();
  try {
    fs.mkdirSync(path.join(fx.root, "sub"));
    const r = await resolveRepository(path.join(fx.root, "sub"));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.error.code, "PROJECT_ROOT_MISMATCH");
      assert.equal(fs.realpathSync(String((r.error.details as { actualToplevel: string }).actualToplevel)), fs.realpathSync(fx.root));
    }
  } finally {
    fx.cleanup();
  }
});

test("resolveRepository: bare repository -> BARE_REPOSITORY_UNSUPPORTED", async () => {
  const fx = await createGitFixture({ bare: true });
  try {
    const r = await resolveRepository(fx.root);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "BARE_REPOSITORY_UNSUPPORTED");
  } finally {
    fx.cleanup();
  }
});

test("resolveRepository: malformed .git/config (non-bare) -> GIT_COMMAND_FAILED, not NOT_A_GIT_REPOSITORY", async () => {
  const fx = await createGitFixture();
  try {
    fs.appendFileSync(path.join(fx.root, ".git", "config"), "\n[section\n");
    const r = await resolveRepository(fx.root);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "GIT_COMMAND_FAILED");
  } finally {
    fx.cleanup();
  }
});

test("resolveRepository: malformed bare repository root -> GIT_COMMAND_FAILED", async () => {
  const fx = await createGitFixture({ bare: true });
  try {
    fs.appendFileSync(path.join(fx.root, "config"), "\n[section\n");
    const r = await resolveRepository(fx.root);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "GIT_COMMAND_FAILED");
  } finally {
    fx.cleanup();
  }
});

test("resolveRepository: nested projectRoot beneath a malformed NON-BARE parent -> GIT_COMMAND_FAILED, never NOT_A_GIT_REPOSITORY/PROJECT_ROOT_MISMATCH", async () => {
  const fx = await createGitFixture();
  try {
    fs.mkdirSync(path.join(fx.root, "sub", "dir"), { recursive: true });
    fs.appendFileSync(path.join(fx.root, ".git", "config"), "\n[section\n");
    const r = await resolveRepository(path.join(fx.root, "sub", "dir"));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "GIT_COMMAND_FAILED");
  } finally {
    fx.cleanup();
  }
});

test("resolveRepository: nested projectRoot beneath a malformed BARE parent -> GIT_COMMAND_FAILED, never NOT_A_GIT_REPOSITORY", async () => {
  const fx = await createGitFixture({ bare: true });
  try {
    fs.mkdirSync(path.join(fx.root, "sub", "dir"), { recursive: true });
    fs.appendFileSync(path.join(fx.root, "config"), "\n[section\n");
    const r = await resolveRepository(path.join(fx.root, "sub", "dir"));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "GIT_COMMAND_FAILED");
  } finally {
    fx.cleanup();
  }
});

test("resolveRepository: nested projectRoot beneath a HEALTHY bare repository -> BARE_REPOSITORY_UNSUPPORTED, secondary classifier never reached", async () => {
  const fx = await createGitFixture({ bare: true });
  try {
    fs.mkdirSync(path.join(fx.root, "sub", "dir"), { recursive: true });
    const r = await resolveRepository(path.join(fx.root, "sub", "dir"));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "BARE_REPOSITORY_UNSUPPORTED");
  } finally {
    fx.cleanup();
  }
});

test("resolveRepository: linked worktree reports isWorktree: true, gitDir !== gitCommonDir", async () => {
  const fx = await createGitFixture();
  try {
    fs.writeFileSync(path.join(fx.root, "f.txt"), "hi");
    await commitAll(fx, "init");
    const wtDir = fs.mkdtempSync(path.join(os.tmpdir(), "br3-wt-"));
    fs.rmSync(wtDir, { recursive: true, force: true });
    await fx.git(["worktree", "add", "-q", wtDir, "-b", "wtbranch"]);
    try {
      const r = await resolveRepository(wtDir);
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.equal(r.value.isWorktree, true);
        assert.notEqual(r.value.gitDir, r.value.gitCommonDir);
      }
    } finally {
      fs.rmSync(wtDir, { recursive: true, force: true });
    }
  } finally {
    fx.cleanup();
  }
});

test("resolveRepository: submodule checkout reports isWorktree: false", async () => {
  const src = await createGitFixture();
  const superproject = await createGitFixture();
  try {
    fs.writeFileSync(path.join(src.root, "sf.txt"), "base");
    await commitAll(src, "sub base");
    await superproject.git(["-c", "protocol.file.allow=always", "submodule", "add", "-q", src.root, "sub"]);
    await commitAll(superproject, "add submodule");
    const r = await resolveRepository(path.join(superproject.root, "sub"));
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.isWorktree, false);
      assert.equal(r.value.gitDir, r.value.gitCommonDir);
    }
  } finally {
    src.cleanup();
    superproject.cleanup();
  }
});
