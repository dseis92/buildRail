import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Compiled from packages/core/tests/package-integration.test.ts to
// packages/core/dist-tests/tests/package-integration.test.js, so the repo
// root is four levels up from this compiled file's directory.
const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(moduleDir, "..", "..", "..", "..");

test("packages/core/package.json matches the approved §20.4 target contract", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "packages", "core", "package.json"), "utf8"));
  assert.equal(pkg.type, "module");
  assert.equal(pkg.main, "dist/index.js");
  assert.equal(pkg.types, "dist/index.d.ts");
  assert.equal(pkg.engines?.node, ">=22");
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}).sort(), ["ajv", "picomatch", "yaml"]);
  assert.ok(pkg.devDependencies?.typescript, "typescript must be a devDependency");
  assert.ok(pkg.devDependencies?.["@types/node"], "@types/node must be a devDependency");
  assert.equal(pkg.dependencies?.["ajv-formats"], undefined, "ajv-formats must never be a dependency");
});

test("packages/cli/package.json depends on @buildrail/core via the workspace protocol", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "packages", "cli", "package.json"), "utf8"));
  assert.ok(pkg.dependencies?.["@buildrail/core"], "@buildrail/cli must depend on @buildrail/core");
});

test("root package.json orders typecheck/build so @buildrail/core is built before @buildrail/cli is type-checked", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const typecheckScript: string = pkg.scripts.typecheck;
  const coreBuildIndex = typecheckScript.indexOf("build --workspace=@buildrail/core");
  const cliTypecheckIndex = typecheckScript.indexOf("typecheck --workspace=@buildrail/cli");
  assert.ok(coreBuildIndex >= 0, "root typecheck must build @buildrail/core");
  assert.ok(cliTypecheckIndex >= 0, "root typecheck must typecheck @buildrail/cli");
  assert.ok(
    coreBuildIndex < cliTypecheckIndex,
    "@buildrail/core must be built before @buildrail/cli is type-checked (the clean-typecheck fix)",
  );
});

function listTsFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listTsFilesRecursive(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

test("nothing in packages/cli/src/** imports a path under packages/core/src/** directly", () => {
  const cliSrcDir = join(repoRoot, "packages", "cli", "src");
  const files = listTsFilesRecursive(cliSrcDir);
  assert.ok(files.length > 0, "expected to find CLI source files to inspect");
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    assert.doesNotMatch(
      content,
      /['"][^'"]*core\/src[^'"]*['"]/,
      `${file} must not import a path under packages/core/src directly — use @buildrail/core instead`,
    );
  }
});
