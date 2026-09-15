import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { inspectHead, resolveRepository } from "@buildrail/core";
import { createGitFixture, commitAll, writeFile } from "./helpers/git-fixture.js";

for (const shape of ["origin", "custom refspec", "local"]) test(`Round2 upstream: ${shape} real target and subsequently deleted target`, async () => {
  const origin = await createGitFixture(); const fx = await createGitFixture();
  try {
    writeFile(origin.root, "f", "origin"); const sha = await commitAll(origin, "origin");
    await origin.git(["branch", "-M", "source"]);
    writeFile(fx.root, "f", "local"); await commitAll(fx, "local"); await fx.git(["branch", "-M", "current"]);
    const ref = shape === "custom refspec" ? "refs/tracking/origin/source" : shape === "local" ? "refs/heads/source" : "refs/remotes/origin/source";
    await fx.git(["remote", "add", "origin", origin.root]);
    await fx.git(["config", "remote.origin.fetch", `+refs/heads/*:${shape === "custom refspec" ? "refs/tracking/origin" : shape === "local" ? "refs/heads" : "refs/remotes/origin"}/*`]);
    await fx.git(["fetch", "-q", "origin"]);
    const remote = shape === "local" ? "." : "origin";
    if (shape === "local") await fx.git(["remote", "remove", "origin"]);
    await fx.git(["config", "branch.current.remote", remote]);
    await fx.git(["config", "branch.current.merge", "refs/heads/source"]);
    assert.equal((await fx.git(["rev-parse", "--symbolic-full-name", "@{upstream}"])).stdout.slice(0, -1), ref);
    const r = await inspectHead(fx.root); assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.value.upstream, { remote, mergeRef: "refs/heads/source", branch: "source", ref, sha });
    await fx.git(["update-ref", "-d", ref]);
    const missing = await inspectHead(fx.root); assert.equal(missing.ok, true);
    if (missing.ok) assert.deepEqual(missing.value.upstream, { remote, mergeRef: "refs/heads/source", branch: "source", ref: null, sha: null });
  } finally { origin.cleanup(); fx.cleanup(); }
});

test("Round2 upstream: first merge value controls all fields and no fallback after deletion", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f", "base"); const first = await commitAll(fx, "base");
    await fx.git(["branch", "-M", "current"]); await fx.git(["branch", "one"]);
    writeFile(fx.root, "f", "changed"); const second = await commitAll(fx, "second"); await fx.git(["branch", "two"]);
    assert.notEqual(first, second);
    await fx.git(["config", "branch.current.remote", "."]);
    await fx.git(["config", "branch.current.merge", "refs/heads/one"]);
    await fx.git(["config", "--add", "branch.current.merge", "refs/heads/two"]);
    assert.equal((await fx.git(["config", "--get", "branch.current.merge"])).stdout, "refs/heads/two\n");
    assert.equal((await fx.git(["config", "-z", "--get-all", "branch.current.merge"])).stdout, "refs/heads/one\0refs/heads/two\0");
    const r = await inspectHead(fx.root); assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.value.upstream, { remote: ".", mergeRef: "refs/heads/one", branch: "one", ref: "refs/heads/one", sha: first });
    await fx.git(["update-ref", "-d", "refs/heads/one"]);
    const gone = await inspectHead(fx.root); assert.equal(gone.ok, true);
    if (gone.ok) { assert.equal(gone.value.upstream?.sha, null); assert.equal(gone.value.upstream?.mergeRef, "refs/heads/one"); }
  } finally { fx.cleanup(); }
});

test("Round2 upstream: option-shaped current branch resolves local upstream", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f", "base"); const sha = await commitAll(fx, "base");
    await fx.git(["branch", "target"]); await fx.git(["update-ref", "refs/heads/-foo", sha]); await fx.git(["symbolic-ref", "HEAD", "refs/heads/-foo"]);
    await fx.git(["config", "branch.-foo.remote", "."]); await fx.git(["config", "branch.-foo.merge", "refs/heads/target"]);
    const r = await inspectHead(fx.root); assert.equal(r.ok, true);
    if (r.ok) { assert.equal(r.value.branch, "-foo"); assert.equal(r.value.upstream?.sha, sha); }
  } finally { fx.cleanup(); }
});
for (const shape of ["symbolic", "detached"]) test(`Round2 HEAD: dangling ${shape} object is unavailable`, async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f", "base"); const sha = await commitAll(fx, "base");
    if (shape === "detached") await fx.git(["checkout", "-q", "--detach", sha]);
    fs.rmSync(path.join(fx.root, ".git", "objects", sha.slice(0, 2), sha.slice(2)));
    const r = await inspectHead(fx.root); assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, "HEAD_UNAVAILABLE");
  } finally { fx.cleanup(); }
});
for (const format of ["sha256", "reftable"]) test(`Round2 repository: ${format} and fresh repository facts at same path`, async () => {
  const fx = await createGitFixture();
  try {
    assert.equal((await resolveRepository(fx.root)).ok, true);
    fs.rmSync(path.join(fx.root, ".git"), { recursive: true });
    await fx.git(["init", "-q", format === "sha256" ? "--object-format=sha256" : "--ref-format=reftable"]);
    const r = await resolveRepository(fx.root); assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, format === "sha256" ? "UNSUPPORTED_OBJECT_FORMAT" : "UNSUPPORTED_REF_FORMAT");
  } finally { fx.cleanup(); }
});
for (const bare of [false, true]) test(`Round2 repository: malformed reftable ${bare ? "bare" : "non-bare"} root and ancestor`, async () => {
  const fx = await createGitFixture({ bare });
  try {
    await fx.git(["refs", "migrate", "--ref-format=reftable"]);
    fs.appendFileSync(path.join(fx.root, bare ? "config" : ".git/config"), "\n[broken\n");
    const nested = path.join(fx.root, "nested"); fs.mkdirSync(nested);
    for (const root of [fx.root, nested]) { const r = await resolveRepository(root); assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error.code, "GIT_COMMAND_FAILED"); }
  } finally { fx.cleanup(); }
});
