import { execFile as execFileCb } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFileCb);

export interface GitFixture {
  root: string;
  git(args: string[], opts?: { cwd?: string }): Promise<{ stdout: string; stderr: string }>;
  cleanup(): void;
}

/**
 * Creates a fresh, ephemeral temp-directory Git repository (§20) with a
 * fixed, deterministic user.name/user.email local-config override, and
 * returns a handle for running further Git commands and tearing it down.
 */
export async function createGitFixture(options: { bare?: boolean } = {}): Promise<GitFixture> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "br3-fixture-"));

  async function git(args: string[], opts: { cwd?: string } = {}): Promise<{ stdout: string; stderr: string }> {
    const result = await execFileAsync("git", args, { cwd: opts.cwd ?? root });
    return { stdout: result.stdout, stderr: result.stderr };
  }

  if (options.bare) {
    await execFileAsync("git", ["init", "-q", "--bare", root]);
  } else {
    await execFileAsync("git", ["init", "-q", root]);
    await git(["config", "user.email", "br3-test@example.com"]);
    await git(["config", "user.name", "BR3 Test"]);
  }

  return {
    root,
    git,
    cleanup(): void {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

export function writeFile(root: string, relPath: string, content: string): void {
  const full = path.join(root, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

export async function commitAll(fixture: GitFixture, message: string): Promise<string> {
  await fixture.git(["add", "-A"]);
  await fixture.git(["commit", "-q", "-m", message]);
  const { stdout } = await fixture.git(["rev-parse", "HEAD"]);
  return stdout.trim();
}
