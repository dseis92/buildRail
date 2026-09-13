import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const execFileAsync = promisify(execFile);

// Compiled from packages/cli/tests/cli.test.ts to
// packages/cli/dist-tests/tests/cli.test.js, so the package root is two
// levels up from this compiled file's directory.
const moduleDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(moduleDir, "..", "..");
const cliEntry = join(packageRoot, "dist", "index.js");
const packageJsonPath = join(packageRoot, "package.json");
const expectedVersion = (
  JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string }
).version;

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCli(args: string[]): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliEntry, ...args]);
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
      exitCode: execError.code ?? 1,
    };
  }
}

test("buildrail --help prints usage and exits 0", async () => {
  const result = await runCli(["--help"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /buildrail <command> \[options\]/);
});

test("buildrail -h prints usage and exits 0", async () => {
  const result = await runCli(["-h"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Usage:/);
});

test("buildrail help prints usage and exits 0", async () => {
  const result = await runCli(["help"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Usage:/);
});

test("buildrail --version prints the package version and exits 0", async () => {
  const result = await runCli(["--version"]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), expectedVersion);
});

test("buildrail -v prints the package version and exits 0", async () => {
  const result = await runCli(["-v"]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), expectedVersion);
});

test("buildrail init reports it is unavailable and exits 1", async () => {
  const result = await runCli(["init"]);
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /not available yet/i);
  assert.doesNotMatch(result.stdout, /created/i);
  assert.doesNotMatch(result.stdout, /initialized/i);
});

test("buildrail init --help shows command help and exits 0", async () => {
  const result = await runCli(["init", "--help"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /buildrail init/);
});

test("buildrail status reports it is unavailable and exits 1", async () => {
  const result = await runCli(["status"]);
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /requires the governance engine/i);
});

test("buildrail status --help shows command help and exits 0", async () => {
  const result = await runCli(["status", "--help"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /buildrail status/);
});

test("unknown command produces a clear error and exits 2", async () => {
  const result = await runCli(["banana"]);
  assert.equal(result.exitCode, 2);
  assert.match(result.stdout, /Unknown command: banana/);
  assert.match(result.stdout, /buildrail --help/);
});

test("unsupported option produces a clear error and exits 2", async () => {
  const result = await runCli(["--bogus"]);
  assert.equal(result.exitCode, 2);
  assert.match(result.stdout, /Unsupported option/);
});

test("invalid argument to a known command exits 2", async () => {
  const result = await runCli(["init", "--bogus"]);
  assert.equal(result.exitCode, 2);
  assert.match(result.stdout, /BuildRail could not run this command/);
});
