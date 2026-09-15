import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveRepository, inspectWorkingTree, inspectHead } from "@buildrail/core";
import { buildSanitizedEnv, resolveGitExecutable, parseGitVersion, withGitExecutionProbe, withGitResolutionProbe } from "#internal/git/internal/exec.js";
import { createGitFixture, commitAll, writeFile } from "./helpers/git-fixture.js";

function temporaryEnv(values: Record<string, string | undefined>): () => void {
  const before = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(values)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  return () => { for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
}
for (const [name, version, code] of [["unavailable", null, "GIT_EXECUTABLE_UNAVAILABLE"], ["below floor", "git version 2.44.9\n", "GIT_VERSION_UNSUPPORTED"], ["malformed version", "not git\n", "GIT_VERSION_UNSUPPORTED"]] as const) test(`Round2 capability: ${name}`, async () => {
  const fx = await createGitFixture(); const bin = path.join(fx.root, "bin"); fs.mkdirSync(bin);
  if (version) fs.writeFileSync(path.join(bin, "git"), `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(version)});`, { mode: 0o755 });
  const restore = temporaryEnv({ PATH: bin });
  try { const r = await resolveRepository(path.join(fx.root, "does-not-exist")); assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error.code, code); }
  finally { restore(); fx.cleanup(); }
});

test("Round2 capability: same-path executable replacement forces fresh version check", async () => {
  const fx = await createGitFixture(); const real = resolveGitExecutable(process.cwd(), process.env.PATH)!;
  const bin = path.join(fx.root, "bin"); fs.mkdirSync(bin); const executable = path.join(bin, "git");
  const script = (version: string) => `#!${process.execPath}\nconst cp = require('node:child_process'); if(process.argv[2]==='--version') process.stdout.write(${JSON.stringify(version)}); else {const r=cp.spawnSync(${JSON.stringify(real)},process.argv.slice(2),{stdio:'inherit'});process.exit(r.status??1);}`;
  fs.writeFileSync(executable, script("git version 2.50.1\n"), { mode: 0o755 });
  const restore = temporaryEnv({ PATH: bin });
  try {
    const versions: string[] = [];
    await withGitExecutionProbe(e => { if (e.args[0] === "--version") versions.push(e.ctx.execPath); }, async () => {
      assert.equal((await resolveRepository(fx.root)).ok, true);
      fs.writeFileSync(executable, script("git version 2.44.0\n"));
      const r = await resolveRepository(fx.root); assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.error.code, "GIT_VERSION_UNSUPPORTED");
    });
    assert.deepEqual(versions, [fs.realpathSync(executable), fs.realpathSync(executable)]);
  }
  finally { restore(); fx.cleanup(); }
});

for (const shape of ["directory", "non-executable", "broken symlink", "executable symlink"]) test(`Round2 PATH candidate: ${shape}`, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "br3-path-"));
  const real = resolveGitExecutable(process.cwd(), process.env.PATH)!;
  try {
    const earlier = path.join(root, "first"); const later = path.join(root, "last"); fs.mkdirSync(earlier); fs.mkdirSync(later);
    fs.symlinkSync(real, path.join(later, "git"));
    const candidate = path.join(earlier, "git");
    if (shape === "directory") fs.mkdirSync(candidate);
    if (shape === "non-executable") fs.writeFileSync(candidate, "not executable", { mode: 0o644 });
    if (shape === "broken symlink") fs.symlinkSync(path.join(root, "missing"), candidate);
    if (shape === "executable symlink") fs.symlinkSync(real, candidate);
    const result = resolveGitExecutable(root, `${earlier}${path.delimiter}${later}`);
    assert.equal(result, shape === "executable symlink" ? candidate : path.join(later, "git"));
    if (shape !== "executable symlink") assert.equal(resolveGitExecutable(root, earlier), null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
for (const entry of [".", "", "relative-bin"]) test(`Round2 PATH: fixed resolver cwd with ${JSON.stringify(entry)}`, async () => {
  const fx = await createGitFixture(); const originalCwd = process.cwd(); const real = resolveGitExecutable(originalCwd, process.env.PATH)!;
  const dir = entry === "relative-bin" ? path.join(fx.root, entry) : fx.root;
  if (dir !== fx.root) fs.mkdirSync(dir);
  fs.symlinkSync(real, path.join(dir, "git"));
  const restore = temporaryEnv({ PATH: entry });
  try {
    process.chdir(fx.root);
    const target = path.join(fx.root, "project"); fs.mkdirSync(target);
    // Setup uses the independently resolved real binary because fixture.git's PATH is deliberately changed.
    const { execFileSync } = await import("node:child_process"); execFileSync(real, ["init", "-q", target]);
    fs.writeFileSync(path.join(target, "git"), `#!${process.execPath}\nprocess.exit(99);`, { mode: 0o755 });
    const calls: string[] = [];
    const r = await withGitExecutionProbe(e => { calls.push(e.ctx.execPath); if (e.args[0] === "--version") assert.equal(e.cwd, fs.realpathSync(fx.root)); }, () => resolveRepository(target));
    assert.equal(r.ok, true); assert.ok(calls.length > 1); assert.ok(calls.every(p => p === fs.realpathSync(real)));
  } finally { process.chdir(originalCwd); restore(); fx.cleanup(); }
});

test("Round2 environment: POSIX PATH exactness, absent PATH default and unrelated Path", () => {
  const a = buildSanitizedEnv("/empty", { PATH: "/correct", Path: "/wrong" }, "linux"); assert.equal(a.effectivePath, "/correct"); assert.equal(a.env.Path, "/wrong");
  const b = buildSanitizedEnv("/empty", { Path: "/wrong" }, "linux"); assert.equal(b.effectivePath, undefined); assert.equal(b.env.PATH, undefined);
  const visited: string[] = [];
  assert.equal(resolveGitExecutable("/cwd", undefined, "linux", p => { visited.push(p); return p === "/bin/git"; }), "/bin/git");
  assert.deepEqual(visited, ["/usr/bin/git", "/bin/git"]);
  assert.equal(resolveGitExecutable("/cwd", undefined, "linux", () => false), null);
});

test("Round2 environment: Windows git.exe only, PATH casing, no PATHEXT or implicit cwd", () => {
  const { env, effectivePath } = buildSanitizedEnv("C:\\empty", { Path: "C:\\wrong", PATH: "C:\\first;C:\\last", path: "C:\\wrong2", PATHEXT: ".CMD;.BAT;.COM", git_dir: "evil", Git_Index_File: "evil" }, "win32");
  assert.equal(effectivePath, "C:\\first;C:\\last"); assert.deepEqual(Object.keys(env).filter(k => k.toUpperCase() === "PATH"), ["PATH"]);
  assert.equal(env.git_dir, undefined); assert.equal(env.Git_Index_File, undefined);
  const visited: string[] = [];
  const found = resolveGitExecutable("C:\\cwd", effectivePath, "win32", p => { visited.push(p); return p === "C:\\last\\git.exe"; });
  assert.equal(found, "C:\\last\\git.exe"); assert.deepEqual(visited, ["C:\\first\\git.exe", "C:\\last\\git.exe"]);
  assert.equal(resolveGitExecutable("C:\\cwd", "C:\\only-cmd", "win32", p => p.endsWith("git.cmd")), null);
  assert.equal(resolveGitExecutable("C:\\cwd", undefined, "win32", () => true), null);
  assert.equal(resolveGitExecutable("C:\\cwd", "C:\\other", "win32", p => p === "C:\\cwd\\git.exe"), null);
});

test("Round2 environment: exactly eight controlled GIT variables survive case-insensitive stripping", () => {
  const { env } = buildSanitizedEnv("/isolated", { GIT_DIR: "evil", git_dir: "evil", Git_Dir: "evil", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "x", GIT_CONFIG_VALUE_0: "y" }, "linux");
  assert.deepEqual(Object.keys(env).filter(k => /^git_/i.test(k)).sort(), ["GIT_ATTR_NOSYSTEM", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_NO_LAZY_FETCH", "GIT_NO_REPLACE_OBJECTS", "GIT_OPTIONAL_LOCKS", "GIT_PAGER", "GIT_TERMINAL_PROMPT"]);
  assert.equal(env.GIT_ATTR_NOSYSTEM, "1"); assert.equal(env.GIT_CONFIG_NOSYSTEM, "1"); assert.equal(env.GIT_NO_LAZY_FETCH, "1"); assert.equal(env.GIT_NO_REPLACE_OBJECTS, "1"); assert.equal(env.LC_ALL, "C");
});
for (const variable of ["GIT_DIR", "git_dir", "Git_Dir", "GIT_INDEX_FILE", "Git_Index_File"]) test(`Round2 inherited environment: ${variable}`, async () => {
  const fx = await createGitFixture(); const other = await createGitFixture();
  try {
    writeFile(fx.root, "correct", "base"); const sha = await commitAll(fx, "correct"); writeFile(other.root, "wrong", "base"); await commitAll(other, "wrong");
    const value = path.join(other.root, ".git", /index/i.test(variable) ? "index" : "");
    const restore = temporaryEnv({ [variable]: value });
    try {
      const h = await inspectHead(fx.root); assert.equal(h.ok, true); if (h.ok) assert.equal(h.value.headSha, sha);
      const r = await inspectWorkingTree(fx.root); assert.equal(r.ok, true); if (r.ok) assert.deepEqual(r.value.entries, []);
    } finally { restore(); }
  } finally { other.cleanup(); fx.cleanup(); }
});

test("Round2 version grammar: supported vendor suffix and malformed responses", () => {
  for (const value of ["git version 2.45.0\n", "git version 2.50.1 (Apple Git-155)\n", "git version 2.45.0.windows.1\n"]) assert.ok(parseGitVersion(value));
  for (const value of [" garbage", "git version 2.45.0garbage", " git version 2.45.0\n", "git version 2.45.0\njunk", "git version 2.45.0\n\n"]) assert.equal(parseGitVersion(value), null);
});

for (const supported of [true, false]) test(`Round2 PATH: changed executable between operations supported=${supported}`, async () => {
  const fx = await createGitFixture(); const real = resolveGitExecutable(process.cwd(), process.env.PATH)!;
  const one = path.join(fx.root, "one"); const two = path.join(fx.root, "two"); fs.mkdirSync(one); fs.mkdirSync(two);
  const make = (dir: string, version: string) => fs.writeFileSync(path.join(dir, "git"), `#!${process.execPath}\nconst cp=require('node:child_process');if(process.argv[2]==='--version')process.stdout.write(${JSON.stringify(version)});else{const r=cp.spawnSync(${JSON.stringify(real)},process.argv.slice(2),{stdio:'inherit'});process.exit(r.status??1);}`, { mode: 0o755 });
  make(one, "git version 2.50.1\n"); make(two, supported ? "git version 2.50.1\n" : "git version 2.30.0\n");
  const restore = temporaryEnv({ PATH: one });
  try {
    const seen: string[] = [];
    const paths: (string | undefined)[] = [];
    await withGitResolutionProbe(e => { paths.push(e.effectivePath); }, () => withGitExecutionProbe(e => { if (e.args[0] === "--version") seen.push(e.ctx.execPath); }, async () => {
      assert.equal((await resolveRepository(fx.root)).ok, true); process.env.PATH = two;
      const r = await resolveRepository(fx.root); assert.equal(r.ok, supported); if (!r.ok) assert.equal(r.error.code, "GIT_VERSION_UNSUPPORTED");
    }));
    assert.deepEqual(paths, [one, two]);
    assert.deepEqual(seen, [fs.realpathSync(path.join(one, "git")), fs.realpathSync(path.join(two, "git"))]);
  } finally { restore(); fx.cleanup(); }
});

test("Round2 PATH: absent POSIX PATH uses actual system Git, never differently cased Path", async () => {
  const fx = await createGitFixture(); const restore = temporaryEnv({ PATH: undefined, Path: fx.root });
  try {
    const expected = resolveGitExecutable(process.cwd(), undefined)!; assert.ok(expected);
    const { execFileSync } = await import("node:child_process");
    assert.match(execFileSync("git", ["--version"], { env: { Path: fx.root }, encoding: "utf8" }), /^git version /);
    await withGitExecutionProbe(e => { assert.equal(e.ctx.execPath, fs.realpathSync(expected)); assert.equal(e.ctx.env.PATH, undefined); }, async () => { assert.equal((await resolveRepository(fx.root)).ok, true); });
  } finally { restore(); fx.cleanup(); }
});

test("Round2 Windows candidate shape: directory and broken link rejected, regular target accepted", async () => {
  const { windowsCandidateIsValid } = await import("#internal/git/internal/exec.js");
  const fx = await createGitFixture();
  try {
    const dir = path.join(fx.root, "directory.git.exe"); fs.mkdirSync(dir); assert.equal(windowsCandidateIsValid(dir), false);
    const broken = path.join(fx.root, "broken.git.exe"); fs.symlinkSync(path.join(fx.root, "missing"), broken); assert.equal(windowsCandidateIsValid(broken), false);
    const file = path.join(fx.root, "git.exe"); fs.writeFileSync(file, "fixture"); assert.equal(windowsCandidateIsValid(file), true);
  } finally { fx.cleanup(); }
});
