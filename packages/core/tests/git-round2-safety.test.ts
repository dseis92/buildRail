import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { inspectDiff, inspectHead, inspectWorkingTree, resolveRepository } from "@buildrail/core";
import { withGitExecutionProbe } from "#internal/git/internal/exec.js";
import { createGitFixture, commitAll, writeFile } from "./helpers/git-fixture.js";

function envWith(values: NodeJS.ProcessEnv, action: () => Promise<void>): Promise<void> {
  const old = { ...process.env };
  for (const [k,v] of Object.entries(values)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  return action().finally(() => { for (const k of Object.keys(process.env)) if (!(k in old)) delete process.env[k]; Object.assign(process.env, old); });
}
for (const source of ["XDG", "HOME fallback", "global excludes", "config injection"]) test(`Round2 isolation: ${source} cannot change repository facts`, async () => {
  const fx = await createGitFixture(); const global = await createGitFixture();
  try {
    writeFile(fx.root, "tracked", "base"); await commitAll(fx, "base"); await fx.git(["branch", "-M", "current"]);
    writeFile(fx.root, "visible", "untracked");
    const xdg = source === "HOME fallback" ? path.join(global.root, ".config") : path.join(global.root, "xdg");
    fs.mkdirSync(path.join(xdg, "git"), { recursive: true });
    fs.writeFileSync(path.join(xdg, "git", "ignore"), "visible\n");
    fs.writeFileSync(path.join(xdg, "git", "attributes"), "tracked filter=hostile\n");
    const config = path.join(global.root, "global-config");
    fs.writeFileSync(config, `[core]\n excludesFile = ${path.join(xdg, "git", "ignore")}\n`);
    const values = source === "XDG" ? { XDG_CONFIG_HOME: xdg } : source === "HOME fallback" ? { HOME: global.root, XDG_CONFIG_HOME: undefined } : source === "global excludes" ? { GIT_CONFIG_GLOBAL: config } : { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "branch.current.remote", GIT_CONFIG_VALUE_0: "injected" };
    const baseline = await inspectWorkingTree(fx.root);
    await envWith(values, async () => {
      if (source === "config injection") assert.equal((await fx.git(["config", "--get", "branch.current.remote"])).stdout, "injected\n");
      else {
        assert.ok(!(await fx.git(["status", "--porcelain"])).stdout.includes("visible"), "unmitigated ignore hazard");
        if (source === "XDG" || source === "HOME fallback") assert.equal((await fx.git(["check-attr", "filter", "--", "tracked"])).stdout, "tracked: filter: hostile\n");
      }
      const h = await inspectHead(fx.root); assert.equal(h.ok, true); if (h.ok) assert.equal(h.value.upstream, null);
      const r = await inspectWorkingTree(fx.root); assert.deepEqual(r, baseline); assert.equal(r.ok, true); if (r.ok) assert.deepEqual(r.value.entries, [{ kind: "untracked", path: "visible" }]);
    });
  } finally { fx.cleanup(); global.cleanup(); }
});

test("Round2 local sources: gitignore, info/exclude, attributes and config remain effective", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, ".gitignore", "ignored\n"); writeFile(fx.root, "tracked", "base"); await commitAll(fx, "base");
    fs.writeFileSync(path.join(fx.root, ".git", "info", "exclude"), "excluded\n");
    writeFile(fx.root, "ignored", "x"); writeFile(fx.root, "excluded", "x"); writeFile(fx.root, "visible", "x");
    const r = await inspectWorkingTree(fx.root); assert.equal(r.ok, true); if (r.ok) assert.deepEqual(r.value.entries, [{ kind: "untracked", path: "visible" }]);
    writeFile(fx.root, ".gitattributes", "tracked filter=local\n");
    const blocked = await inspectWorkingTree(fx.root); assert.equal(blocked.ok, false); if (!blocked.ok) assert.equal(blocked.error.code, "EXTERNAL_GIT_FILTER_UNSUPPORTED");
  } finally { fx.cleanup(); }
});
for (const value of ["unspecified", "unset", "set", "named"]) test(`Round2 effective filter: ${value}`, async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f", "base"); const sha = await commitAll(fx, "base");
    writeFile(fx.root, ".gitattributes", value === "unspecified" ? "f !filter\n" : value === "unset" ? "f -filter\n" : value === "set" ? "f filter\n" : "f filter=named\n");
    const expected = value === "named" ? "named" : value;
    assert.equal((await fx.git(["check-attr", "-z", "filter", "--", "f"])).stdout, `f\0filter\0${expected}\0`);
    let scans = 0;
    const r = await withGitExecutionProbe(e => { if (e.args.includes("check-attr")) scans++; }, () => inspectWorkingTree(fx.root));
    assert.ok(scans > 0); assert.equal(r.ok, value === "unspecified" || value === "unset");
    if (!r.ok) assert.equal(r.error.code, "EXTERNAL_GIT_FILTER_UNSUPPORTED");
    assert.equal((await resolveRepository(fx.root)).ok, true); assert.equal((await inspectHead(fx.root)).ok, true);
    scans = 0;
    assert.equal((await withGitExecutionProbe(e => { if (e.args.includes("check-attr")) scans++; }, () => inspectDiff(fx.root, { fromRef: sha, toRef: sha }))).ok, true);
    assert.equal(scans, 0);
  } finally { fx.cleanup(); }
});
for (const driver of ["clean", "process", "required", "global-only"]) test(`Round2 helper safety: filter ${driver} never executed`, async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f", "base"); await commitAll(fx, "base");
    const marker = path.join(fx.root, "marker"); const script = path.join(fx.root, ".git", "helper");
    fs.writeFileSync(script, `#!/bin/sh\ntouch '${marker}'\n${driver === "global-only" ? "tr '[:lower:]' '[:upper:]'" : "cat"}\n`, { mode: 0o755 });
    writeFile(fx.root, ".gitattributes", "f filter=driver\n");
    const global = path.join(fx.root, ".git", "fake-global");
    if (driver === "global-only") fs.writeFileSync(global, `[filter "driver"]\n clean = ${script}\n required = true\n`);
    else { await fx.git(["config", driver === "process" ? "filter.driver.process" : "filter.driver.clean", script]); if (driver === "required") await fx.git(["config", "filter.driver.required", "true"]); }
    await envWith(driver === "global-only" ? { GIT_CONFIG_GLOBAL: global } : {}, async () => {
      if (driver === "global-only") {
        assert.throws(() => execFileSync("git", ["config", "--get-regexp", "^filter\\..*\\.(clean|process|smudge)$"], { cwd: fx.root, env: { ...process.env, GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" }, stdio: "pipe" }), (error: unknown) => (error as { status: number }).status === 1);
      }
      assert.equal((await resolveRepository(fx.root)).ok, true);
      assert.equal((await fx.git(["check-attr", "filter", "--", "f"])).stdout, "f: filter: driver\n"); assert.equal(fs.existsSync(marker), false);
      const r = await inspectWorkingTree(fx.root); assert.equal(r.ok, false); if (!r.ok) assert.equal(r.error.code, "EXTERNAL_GIT_FILTER_UNSUPPORTED");
      assert.equal(fs.existsSync(marker), false);
    });
  } finally { fx.cleanup(); }
});
for (const depth of [1, 2]) for (const helper of ["filter", "fsmonitor"]) test(`Round2 recursive helper: ${helper} depth ${depth}`, async () => {
  const fx = await createGitFixture(); const src = await createGitFixture();
  try {
    writeFile(src.root, "f", "base"); await commitAll(src, "base");
    await fx.git(["-c", "protocol.file.allow=always", "submodule", "add", "-q", src.root, "sub"]); await commitAll(fx, "sub");
    let cwd = path.join(fx.root, "sub");
    if (depth === 2) { await fx.git(["-c", "protocol.file.allow=always", "submodule", "add", "-q", src.root, "nested"], { cwd }); cwd = path.join(cwd, "nested"); }
    const marker = path.join(fx.root, ".git", "marker"); const script = path.join(fx.root, ".git", "helper");
    fs.writeFileSync(script, `#!/bin/sh\ntouch '${marker}'\nprintf '\\0'\n`, { mode: 0o755 });
    if (helper === "filter") { writeFile(cwd, ".gitattributes", "f filter=driver\n"); await fx.git(["config", "filter.driver.clean", script], { cwd }); }
    else { await fx.git(["config", "core.fsmonitor", script], { cwd }); await fx.git(["status", "--porcelain"], { cwd }); assert.ok(fs.existsSync(marker)); fs.rmSync(marker); }
    writeFile(cwd, "f", "changed");
    const r = await inspectWorkingTree(fx.root); assert.equal(r.ok, helper !== "filter"); if (!r.ok) assert.equal(r.error.code, "EXTERNAL_GIT_FILTER_UNSUPPORTED");
    assert.equal(fs.existsSync(marker), false);
  } finally { fx.cleanup(); src.cleanup(); }
});

test("Round2 helper safety: root fsmonitor, textconv and external diff marker", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f", "base"); const a = await commitAll(fx, "base"); writeFile(fx.root, "f", "changed"); const b = await commitAll(fx, "next");
    const marker = path.join(fx.root, ".git", "marker"); const script = path.join(fx.root, ".git", "helper");
    fs.writeFileSync(script, `#!/bin/sh\ntouch '${marker}'\nprintf '\\0'\n`, { mode: 0o755 });
    await fx.git(["config", "core.fsmonitor", script]); await fx.git(["status", "--porcelain"]); assert.ok(fs.existsSync(marker)); fs.rmSync(marker);
    assert.equal((await inspectWorkingTree(fx.root)).ok, true); assert.equal(fs.existsSync(marker), false);
    await fx.git(["config", "--unset", "core.fsmonitor"]);
    writeFile(fx.root, ".gitattributes", "f diff=driver\n"); await fx.git(["config", "diff.driver.textconv", script]);
    await fx.git(["diff", a, b]); assert.ok(fs.existsSync(marker)); fs.rmSync(marker);
    assert.equal((await inspectDiff(fx.root, { fromRef: a, toRef: b })).ok, true); assert.equal(fs.existsSync(marker), false);
    await fx.git(["config", "diff.external", script]); await fx.git(["diff", a, b]); assert.ok(fs.existsSync(marker)); fs.rmSync(marker);
    assert.equal((await inspectDiff(fx.root, { fromRef: a, toRef: b })).ok, true); assert.equal(fs.existsSync(marker), false);
  } finally { fx.cleanup(); }
});
