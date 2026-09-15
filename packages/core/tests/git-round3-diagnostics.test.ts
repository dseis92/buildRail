import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveRepository } from "@buildrail/core";
import { withGitExecutionProbe } from "#internal/git/internal/exec.js";
import { createGitFixture } from "./helpers/git-fixture.js";

for (const bare of [false, true]) {
  test(`Round3 diagnostics: malformed ${bare ? "bare" : "non-bare"} root preserves Git stderr`, async () => {
    const fx = await createGitFixture({ bare });
    try {
      const metadata = bare ? fx.root : path.join(fx.root, ".git");
      assert.ok(fs.statSync(metadata).isDirectory());
      assert.ok(fs.statSync(path.join(metadata, "HEAD")).isFile());
      for (const dir of ["objects", "refs"]) assert.ok(fs.statSync(path.join(metadata, dir)).isDirectory());
      fs.appendFileSync(path.join(metadata, "config"), "\n[broken\n");
      const raw = spawnSync("git", ["rev-parse", "--is-bare-repository"], {
        cwd: fx.root, env: { ...process.env, LC_ALL: "C", LANG: "C" },
      });
      assert.equal(raw.error, undefined);
      assert.notEqual(raw.status, 0);
      assert.ok(raw.stderr.length > 0);
      const result = await resolveRepository(fx.root);
      assert.equal(result.ok, false);
      if (result.ok) assert.fail("Malformed repository must fail");
      assert.equal(result.error.code, "GIT_COMMAND_FAILED");
      assert.equal(result.error.details, raw.stderr.toString("utf-8"));
    } finally { fx.cleanup(); }
  });

  test(`Round3 diagnostics: malformed ${bare ? "bare" : "non-bare"} ancestor retains marker details`, async () => {
    const fx = await createGitFixture({ bare });
    try {
      fs.appendFileSync(path.join(fx.root, bare ? "config" : ".git/config"), "\n[broken\n");
      const child = path.join(fx.root, "child"); fs.mkdirSync(child);
      const result = await resolveRepository(child);
      assert.equal(result.ok, false);
      if (result.ok) assert.fail("Malformed ancestor must fail");
      assert.equal(result.error.code, "GIT_COMMAND_FAILED");
      assert.deepEqual(result.error.details, { ancestorPath: fs.realpathSync(fx.root), shape: bare ? "bare" : "non-bare" });
    } finally { fx.cleanup(); }
  });
}

test("Round3 diagnostics: captured stderr is preserved verbatim without locale classification", async () => {
  const fx = await createGitFixture();
  try {
    const diagnostic = " diagnostic contrôlé\t\nsecond line\n";
    let injected = 0;
    const result = await withGitExecutionProbe(e => {
      if (!e.args.includes("--is-bare-repository")) return;
      injected++;
      return { ok: false, code: 128, stdout: Buffer.alloc(0), stderr: Buffer.from(diagnostic) };
    }, () => resolveRepository(fx.root));
    assert.equal(injected, 1);
    assert.equal(result.ok, false);
    if (result.ok) assert.fail("Injected command failure must propagate");
    assert.equal(result.error.code, "GIT_COMMAND_FAILED");
    assert.equal(result.error.details, diagnostic);
  } finally { fx.cleanup(); }
});
