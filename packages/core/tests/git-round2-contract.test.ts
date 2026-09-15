import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { inspectDiff, inspectHead, inspectWorkingTree, resolveRepository } from "@buildrail/core";
import { withGitExecutionProbe, withGitResolutionProbe, type GitExecutionEvent } from "#internal/git/internal/exec.js";
import { parseNameStatus } from "#internal/git/diff.js";
import { parseStatusOutput } from "#internal/git/workingTree.js";
import { createGitFixture, commitAll, writeFile } from "./helpers/git-fixture.js";

const operations = { resolveRepository, inspectHead, inspectWorkingTree, inspectDiff: (root: string) => inspectDiff(root, { fromRef: "HEAD", toRef: "HEAD" }) };
function failCode(r: { ok: boolean; error?: { code: string } }, code: string) { assert.equal(r.ok, false); assert.equal(r.error?.code, code); }
for (const [name, operation] of Object.entries(operations)) {
  for (const shape of ["missing", "file"]) test(`Round2 resolver: ${name} ${shape} root`, async () => {
    const fx = await createGitFixture();
    try {
      const root = path.join(fx.root, shape);
      if (shape === "file") fs.writeFileSync(root, "file");
      failCode(await operation(root), "PROJECT_ROOT_NOT_FOUND");
    } finally { fx.cleanup(); }
  });
  test(`Round2 context: ${name} prepares once, reuses identity, prepares fresh next call`, async () => {
    const fx = await createGitFixture();
    const src = await createGitFixture();
    try {
      writeFile(src.root, "f", "content"); await commitAll(src, "source");
      await fx.git(["-c", "protocol.file.allow=always", "submodule", "add", "-q", src.root, "sub"]);
      await commitAll(fx, "base");
      const calls: GitExecutionEvent[] = [];
      let resolutions = 0;
      await withGitResolutionProbe(() => { resolutions++; }, () => withGitExecutionProbe(e => { calls.push(e); }, async () => {
        assert.equal((await operation(fx.root)).ok, true);
        assert.equal(resolutions, 1);
        const first = calls.splice(0);
        assert.equal(first.filter(e => e.args[0] === "--version").length, 1);
        assert.ok(first.length > 1);
        assert.ok(first.every(e => e.ctx === first[0]!.ctx && e.ctx.execPath === first[0]!.ctx.execPath));
        if (name === "inspectWorkingTree") { assert.ok(first.some(e => e.cwd === path.join(fx.root, "sub"))); assert.ok(first.some(e => e.args.includes("check-attr"))); }
        assert.equal((await operation(fx.root)).ok, true);
        assert.equal(calls.filter(e => e.args[0] === "--version").length, 1);
        assert.notEqual(calls[0]!.ctx, first[0]!.ctx);
        assert.notEqual(calls[0]!.ctx.env.XDG_CONFIG_HOME, first[0]!.ctx.env.XDG_CONFIG_HOME);
        assert.equal(resolutions, 2);
        if (name === "inspectWorkingTree") assert.ok(calls.some(e => e.args.includes("check-attr")));
      }));
    } finally { src.cleanup(); fx.cleanup(); }
  });
}

for (const [label, suffix] of [["space", " "], ["tab", "\t"], ["newline", "\n"], ["embedded newline", "a\nb"], ["Unicode", "café-日本語"]]) {
  test(`Round2 exact root: ${label}`, async t => {
    if (process.platform === "win32" && /[\t\n ]$/.test(suffix!)) return t.skip("Win32 filename normalization disallows these trailing characters.");
    const fx = await createGitFixture();
    try {
      const root = path.join(fx.root, `repo-${suffix}`);
      fs.mkdirSync(root);
      await fx.git(["init", "-q", root]);
      const r = await resolveRepository(root);
      assert.equal(r.ok, true);
      assert.equal(r.value.root, fs.realpathSync(root));
      assert.equal(r.value.gitDir, fs.realpathSync(path.join(root, ".git")));
      assert.equal(r.value.gitCommonDir, r.value.gitDir);
    } finally { fx.cleanup(); }
  });
}

test("Round2 XDG: contamination from one operation cannot hide files in the next", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "visible", "untracked");
    let oldDir = ""; let newDir = "";
    await withGitExecutionProbe(e => { oldDir = e.ctx.env.XDG_CONFIG_HOME!; }, async () => { assert.equal((await inspectWorkingTree(fx.root)).ok, true); });
    fs.mkdirSync(path.join(oldDir, "git"));
    fs.writeFileSync(path.join(oldDir, "git", "ignore"), "visible\n");
    fs.writeFileSync(path.join(oldDir, "git", "attributes"), "* filter=hostile\n");
    const r = await withGitExecutionProbe(e => { newDir = e.ctx.env.XDG_CONFIG_HOME!; }, () => inspectWorkingTree(fx.root));
    assert.notEqual(oldDir, newDir);
    assert.deepEqual(fs.readdirSync(newDir), []);
    assert.equal(r.ok, true);
    if (r.ok) assert.ok(r.value.entries.some(e => e.path === "visible"));
  } finally { fx.cleanup(); }
});

const hash = "a".repeat(40); // Synthetic parser token, never reported as a repository SHA.
const fixed = `N... 100644 100644 100644 ${hash} ${hash}`;
for (const token of ["R", "R+50", "R50.5", "Rfoo", "R101", " R50", "R50 ", "R1e1", "R50\r", "R50\n", "R50\u2028", "R50\u2029"]) {
  test(`Round2 malformed: diff rename ${JSON.stringify(token)}`, () => assert.ok(parseNameStatus(Buffer.from(`${token}\0old\0new\0`)) instanceof Error));
  if (token !== "R50 ") test(`Round2 malformed: status rename ${JSON.stringify(token)}`, async () => assert.ok(await parseStatusOutput(Buffer.from(`2 R. ${fixed} ${token} new\0old\0`)) instanceof Error));
}
const malformedStatus = [
  `1 .M Nbad 100644 100644 100644 ${hash} ${hash} file\0`,
  `1 .M .... 100644 100644 100644 ${hash} ${hash} file\0`,
  `1 .M SXMU 100644 100644 100644 ${hash} ${hash} file\0`,
  `2 R. ${fixed} R100\0old\0`, `2 R. ${fixed} R100 new\0\0`,
  `2 .. ${fixed} R100 new\0old\0`, `2 RR ${fixed} R100 new\0old\0`,
  `2 RA ${fixed} R100 new\0old\0`, `2 R. N... nope 100644 100644 ${hash} ${hash} R100 new\0old\0`,
  `u ZZ N... 100644 100644 100644 100644 ${hash} ${hash} ${hash} file\0`,
  "! ignored\0", "? \0", "?file\0", "? file", "# stash 1\0",
];
for (const [i, record] of malformedStatus.entries()) test(`Round2 malformed: porcelain record ${i}`, async () => assert.ok(await parseStatusOutput(Buffer.from(record)) instanceof Error));
for (const marker of ["N...", "S...", "SC..", "S.M.", "S..U", "SCMU"]) test(`Round2 marker: ${marker}`, async () => {
  const r = await parseStatusOutput(Buffer.from(`1 .M ${marker} 100644 100644 100644 ${hash} ${hash} file\0`));
  assert.ok(Array.isArray(r));
  assert.equal(r[0]?.submodule !== undefined, marker.startsWith("S"));
});

for (const kind of ["diff ref", "upstream", "bare token", "object token", "check-attr"]) {
  for (const [label, bytes] of [["invalid UTF8", Buffer.from([0xff])], ["bad grammar", Buffer.from("nonsense\n")]] as const) {
    test(`Round2 malformed successful output: ${kind} ${label}`, async () => {
      const fx = await createGitFixture();
      try {
        writeFile(fx.root, "f", "base"); await commitAll(fx, "base");
        await fx.git(["config", "branch.master.remote", "."]);
        await fx.git(["config", "branch.master.merge", "refs/heads/master"]);
        await fx.git(["branch", "-M", "master"]);
        let injected = 0;
        const r = await withGitExecutionProbe<{ ok: boolean; error?: { code: string } }>(e => {
          const a = e.args;
          const hit = kind === "diff ref" ? a.includes("HEAD^{commit}") : kind === "upstream" ? a.includes("master@{upstream}") && !a.includes("--symbolic-full-name") : kind === "bare token" ? a.includes("--is-bare-repository") : kind === "object token" ? a.includes("--show-object-format") : a.includes("check-attr");
          if (hit) { injected++; return { ok: true, code: 0, stdout: bytes, stderr: Buffer.alloc(0) }; }
        }, () => kind === "diff ref" ? inspectDiff(fx.root, { fromRef: "HEAD", toRef: "HEAD" }) : kind === "check-attr" ? inspectWorkingTree(fx.root) : inspectHead(fx.root));
        assert.ok(injected > 0);
        failCode(r, kind === "object token" && label === "bad grammar" ? "UNSUPPORTED_OBJECT_FORMAT" : "MALFORMED_GIT_OUTPUT");
      } finally { fx.cleanup(); }
    });
  }
}
for (const data of ["f\0filter\0", "f\0filter\0unset\0trailer", "f\0other\0unset\0", "f\0filter\0unset", "", "other\0filter\0unset\0"]) test(`Round2 malformed check-attr: ${JSON.stringify(data)}`, async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "f", "base"); await commitAll(fx, "base");
    const r = await withGitExecutionProbe(e => e.args.includes("check-attr") ? { ok: true, code: 0, stdout: Buffer.from(data), stderr: Buffer.alloc(0) } : undefined, () => inspectWorkingTree(fx.root));
    failCode(r, "MALFORMED_GIT_OUTPUT");
  } finally { fx.cleanup(); }
});
