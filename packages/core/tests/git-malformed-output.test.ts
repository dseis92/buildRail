import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { inspectWorkingTree } from "@buildrail/core";
import { createGitFixture, commitAll, writeFile } from "./helpers/git-fixture.js";

test("inspectWorkingTree: unusual-but-legal characters in a filename are decoded exactly", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "normal.txt", "base");
    await commitAll(fx, "init");
    writeFile(fx.root, "unicode-café-日本語.txt", "content");
    writeFile(fx.root, "with spaces and tabs.txt", "content");
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, true);
    if (r.ok) {
      const paths = r.value.entries.map((e) => e.path);
      assert.ok(paths.includes("unicode-café-日本語.txt"));
      assert.ok(paths.includes("with spaces and tabs.txt"));
    }
  } finally {
    fx.cleanup();
  }
});

test("inspectWorkingTree: a filename with an invalid-UTF-8 byte sequence -> MALFORMED_GIT_OUTPUT, never silent corruption", async (t) => {
  if (process.platform === "win32") return t.skip("Windows paths use Unicode; raw POSIX byte names are unavailable.");
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "base.txt", "base");
    await commitAll(fx, "init");
    // Construct a filename containing a raw, invalid UTF-8 byte via Node's Buffer-based fs APIs.
    const badNameBytes = Buffer.concat([Buffer.from("bad-"), Buffer.from([0xff]), Buffer.from(".txt")]);
    const rawPath = Buffer.concat([Buffer.from(fx.root + path.sep), badNameBytes]);
    try { fs.writeFileSync(rawPath, "x"); }
    catch (error) {
      if (process.platform === "darwin" && (error as NodeJS.ErrnoException).code === "EILSEQ") return t.skip("Darwin filesystem rejects raw 0xff filenames with EILSEQ (verified outside sandbox).");
      throw error;
    }
    const names = fs.readdirSync(fx.root, { encoding: "buffer" });
    assert.ok(names.some(name => name.equals(badNameBytes) && name.includes(0xff)), "raw 0xff fixture precondition");
    const r = await inspectWorkingTree(fx.root);
    assert.equal(r.ok, false);
    if (r.ok) assert.fail("Invalid UTF-8 must fail the whole operation");
    assert.equal(r.error.code, "MALFORMED_GIT_OUTPUT");
  } finally {
    fx.cleanup();
  }
});
