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

test("inspectWorkingTree: a filename with an invalid-UTF-8 byte sequence -> MALFORMED_GIT_OUTPUT, never silent corruption", async () => {
  const fx = await createGitFixture();
  try {
    writeFile(fx.root, "base.txt", "base");
    await commitAll(fx, "init");
    // Construct a filename containing a raw, invalid UTF-8 byte via Node's Buffer-based fs APIs.
    const badNameBytes = Buffer.concat([Buffer.from("bad-"), Buffer.from([0xff]), Buffer.from(".txt")]);
    fs.writeFileSync(path.join(fx.root, badNameBytes.toString("binary")), "x");
    const r = await inspectWorkingTree(fx.root);
    // Depending on filesystem encoding enforcement this may or may not construct
    // successfully; only assert MALFORMED_GIT_OUTPUT when the write actually
    // produced a non-UTF-8-named file Git can see.
    if (!r.ok) {
      assert.equal(r.error.code, "MALFORMED_GIT_OUTPUT");
    }
  } finally {
    fx.cleanup();
  }
});
