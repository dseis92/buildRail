import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

// Compiled from packages/cli/tests/cli.test.ts to
// packages/cli/dist-tests/tests/cli.test.js, so the package root is two
// levels up from this compiled file's directory.
const moduleDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(moduleDir, "..", "..");
const cliEntry = join(packageRoot, "dist", "index.js");
const packageJsonPath = join(packageRoot, "package.json");
const fixturesDir = join(packageRoot, "tests", "fixtures");
const expectedVersion = (
  JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string }
).version;

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface RunOptions {
  cwd?: string;
}

async function runCli(args: string[], options: RunOptions = {}): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliEntry, ...args], {
      cwd: options.cwd,
    });
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

function makeScratchDir(): string {
  return mkdtempSync(join(tmpdir(), "buildrail-cli-test-"));
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

test("buildrail status reports CONFIG_NOT_FOUND and exits 1 when no governance files are present", async () => {
  const scratchDir = makeScratchDir();
  try {
    const result = await runCli(["status"], { cwd: scratchDir });
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /CONFIG_NOT_FOUND/);
    assert.doesNotMatch(result.stdout, /at Object\.|at Module\./);
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

test("buildrail status against a valid fixture project prints the required fields and exits 0", async () => {
  const result = await runCli(["status"], { cwd: join(fixturesDir, "valid-project") });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Project: FixtureProject/);
  assert.match(result.stdout, /Development phase: BR1/);
  assert.match(result.stdout, /Lifecycle state: FROZEN/);
  assert.match(result.stdout, /BR1 \/ CLI Skeleton — completed \(not active\)/);
  assert.match(result.stdout, /Completed phases: BR0, BR1/);
  assert.match(result.stdout, /BR0 → 04c93767510c51916fcc51f60b85b674c7d6f1cc \(frozen\)/);
  assert.match(result.stdout, /Candidate: none/);
  assert.match(result.stdout, /Governance documents: valid/);
});

test("buildrail status against a fixture with a populated candidate includes candidate fields", async () => {
  const result = await runCli(["status"], { cwd: join(fixturesDir, "populated-candidate") });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /branch: feature\/br3-git-inspection/);
  assert.match(result.stdout, /base_sha: 1111111111111111111111111111111111111111/);
  assert.match(result.stdout, /candidate_sha: 2222222222222222222222222222222222222222/);
});

test("buildrail status against a fixture with invalid config prints a deterministic error and exits 1", async () => {
  const result = await runCli(["status"], { cwd: join(fixturesDir, "invalid-config") });
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /CONFIG_SCHEMA_INVALID/);
  assert.doesNotMatch(result.stdout, /at Object\.|at Module\./);
});

test("buildrail status against a fixture with valid config but invalid state prints a deterministic error and exits 1", async () => {
  const result = await runCli(["status"], { cwd: join(fixturesDir, "invalid-state") });
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /STATE_SCHEMA_INVALID/);
  assert.doesNotMatch(result.stdout, /at Object\.|at Module\./);
});

test("buildrail status does not walk up parent directories to find .buildrail", async () => {
  const result = await runCli(["status"], { cwd: join(fixturesDir, "parent-only", "child") });
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /CONFIG_NOT_FOUND/);
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

test("buildrail init creates no files in the working directory", async () => {
  const scratchDir = makeScratchDir();
  try {
    const result = await runCli(["init"], { cwd: scratchDir });
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /not available yet/i);

    const entries = readdirSync(scratchDir);
    assert.ok(!entries.includes(".buildrail"));
    assert.ok(!entries.includes("AGENTS.md"));
    assert.ok(!entries.includes("config.yml"));
    assert.ok(!entries.includes("state.yml"));
    assert.deepEqual(entries, [], "init must not create any files or directories");
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});

test("buildrail status works without any BuildRail governance files present and creates none", async () => {
  const scratchDir = makeScratchDir();
  try {
    const before = readdirSync(scratchDir);
    assert.ok(!before.includes(".buildrail"));
    assert.deepEqual(before, [], "scratch directory must start empty");

    const result = await runCli(["status"], { cwd: scratchDir });
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /CONFIG_NOT_FOUND/);

    const after = readdirSync(scratchDir);
    assert.deepEqual(after, [], "status must not create any files or directories");
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
});
