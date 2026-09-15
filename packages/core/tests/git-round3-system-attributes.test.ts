import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { inspectWorkingTree } from "@buildrail/core";
import { buildSanitizedEnv, withGitExecutionProbe } from "#internal/git/internal/exec.js";
import { createGitFixture, commitAll, writeFile } from "./helpers/git-fixture.js";

test("Round3 system attributes: real Git suppresses system source and preserves repository-local attributes", async t => {
  assert.ok(process.platform === "darwin" || process.platform === "linux",
    "System-attribute behavior requires a POSIX loader fixture; this mandatory test cannot silently skip.");
  const fx = await createGitFixture();
  const holder = fs.mkdtempSync(path.join(os.tmpdir(), "br3-system-attributes-"));
  const originalPath = process.env.PATH;
  try {
    writeFile(fx.root, "probe", "base"); await commitAll(fx, "base");
    const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../tests/fixtures/git-system-attributes.c");
    const library = path.join(holder, process.platform === "darwin" ? "redirect.dylib" : "redirect.so");
    execFileSync(process.env.CC ?? "cc", process.platform === "darwin"
      ? ["-dynamiclib", source, "-o", library]
      : ["-shared", "-fPIC", source, "-o", library, "-ldl"], { stdio: "pipe" });
    const attributes = path.join(holder, "system-attributes");
    fs.writeFileSync(attributes, "probe filter=system-fixture\n");
    const xdg = path.join(holder, "xdg"); fs.mkdirSync(xdg);
    const { env } = buildSanitizedEnv(xdg);
    const loader = process.platform === "darwin" ? "DYLD_INSERT_LIBRARIES" : "LD_PRELOAD";
    const query = ["check-attr", "--stdin", "-z", "filter"];
    const input = Buffer.from("probe\0");
    const active = Buffer.from("probe\0filter\0system-fixture\0");
    const inactive = Buffer.from("probe\0filter\0unspecified\0");

    // Protected OS Git launchers can prohibit loader injection. Probe real Git
    // candidates already installed on PATH, or an explicit test-runner override.
    // No fabricated command output, wrapper attribute logic, or platform skip.
    const candidates = [process.env.BUILDRAIL_TEST_SYSTEM_GIT,
      ...(originalPath ?? "").split(path.delimiter).map(dir => path.resolve(dir, "git"))];
    let selected: { executable: string; systemPath: string } | undefined;
    for (const candidate of new Set(candidates.filter((v): v is string => !!v))) {
      const system = spawnSync(candidate, ["var", "GIT_ATTR_SYSTEM"], { env: { ...env, GIT_ATTR_NOSYSTEM: "0" }, encoding: "utf8" });
      if (system.status !== 0) continue;
      const systemPath = system.stdout.replace(/\n$/, "");
      if (!path.isAbsolute(systemPath)) continue;
      const observed = spawnSync(candidate, query, { cwd: fx.root, input,
        env: { ...env, [loader]: library, BR3_TEST_SYSTEM_PATH: systemPath,
          BR3_TEST_ATTRIBUTES: attributes, GIT_ATTR_NOSYSTEM: "0" } });
      if (observed.status === 0 && observed.stdout.equals(active)) {
        selected = { executable: fs.realpathSync(candidate), systemPath }; break;
      }
    }
    assert.ok(selected,
      "No installed Git permits the system-attribute filesystem seam. Provide BUILDRAIL_TEST_SYSTEM_GIT pointing to an injectable real Git; no acceptance skip is allowed.");
    t.diagnostic(`Behavioral fixture: ${selected.executable}; ${execFileSync(selected.executable, ["--version"], { encoding: "utf8" }).replace(/\n$/, "")}`);
    process.env.PATH = path.dirname(selected.executable);
    const fixtureEnv = { ...env, [loader]: library, BR3_TEST_SYSTEM_PATH: selected.systemPath,
      BR3_TEST_ATTRIBUTES: attributes };
    // The identical real source is active with system attributes enabled and
    // inactive with Git's real NOSYSTEM switch. The shim never reads that switch.
    assert.deepEqual(execFileSync(selected.executable, query, {
      cwd: fx.root, input, env: { ...fixtureEnv, GIT_ATTR_NOSYSTEM: "0" },
    }), active);
    assert.deepEqual(execFileSync(selected.executable, query, {
      cwd: fx.root, input, env: fixtureEnv,
    }), inactive);

    let scans = 0;
    const run = () => withGitExecutionProbe(e => {
      assert.equal(e.ctx.execPath, selected!.executable);
      // Inject only filesystem-location/loader configuration at the existing
      // package-private seam. Preserve BR3's constructed NOSYSTEM value and let
      // executeGit run the genuine subprocess normally (return no fake outcome).
      Object.assign(e.ctx.env, { [loader]: library, BR3_TEST_SYSTEM_PATH: selected!.systemPath,
        BR3_TEST_ATTRIBUTES: attributes });
      if (e.args.includes("check-attr")) scans++;
    }, () => inspectWorkingTree(fx.root));
    const systemOnly = await run();
    assert.equal(systemOnly.ok, true);
    if (systemOnly.ok) assert.deepEqual(systemOnly.value.entries, []);
    assert.equal(scans, 1);
    writeFile(fx.root, ".gitattributes", "probe filter=repository-local\n");
    assert.deepEqual(execFileSync(selected.executable, query, {
      cwd: fx.root, input, env: fixtureEnv,
    }), Buffer.from("probe\0filter\0repository-local\0"));
    const local = await run();
    assert.equal(local.ok, false);
    if (local.ok) assert.fail("Repository-local filter must remain visible");
    assert.equal(local.error.code, "EXTERNAL_GIT_FILTER_UNSUPPORTED");
    assert.equal(scans, 2);
  } finally {
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    fx.cleanup(); fs.rmSync(holder, { recursive: true, force: true });
  }
});
