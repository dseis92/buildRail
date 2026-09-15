import { execFile as execFileCb } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { gitError, type GitError, type GitErrorCode } from "../errors.js";

const execFileAsync = promisify(execFileCb);

const MAX_BUFFER = 64 * 1024 * 1024;

// -------------------------------------------------------------------------
// Sanitized environment construction (§19)
// -------------------------------------------------------------------------

interface SanitizedEnv {
  env: NodeJS.ProcessEnv;
  /** The effective PATH value used for in-process executable resolution (§8). */
  effectivePath: string | undefined;
}

/**
 * Builds BR3's sanitized child environment: strips every inherited GIT_*
 * key (case-insensitively), re-adds exactly BR3's eight controlled GIT_*
 * variables, normalizes PATH per the platform-specific rule, and adds the
 * non-GIT_* determinism overrides (LC_ALL/LANG/XDG_CONFIG_HOME).
 */
function buildSanitizedEnv(xdgConfigHomeDir: string): SanitizedEnv {
  const isWindows = os.platform() === "win32";

  const stripped: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key.toUpperCase().startsWith("GIT_")) continue;
    stripped[key] = value;
  }

  // PATH-key normalization (§19 step 2a).
  let effectivePath: string | undefined;
  if (isWindows) {
    const pathKeys = Object.keys(stripped).filter((k) => k.toUpperCase() === "PATH");
    if (pathKeys.length > 0) {
      const sortedKeys = [...pathKeys].sort();
      const winningKey = sortedKeys[0]!;
      effectivePath = stripped[winningKey];
      for (const key of pathKeys) {
        delete stripped[key];
      }
      stripped.PATH = effectivePath;
    }
  } else {
    // POSIX: exact key "PATH" only, no case-folding.
    effectivePath = stripped.PATH;
  }

  const env: NodeJS.ProcessEnv = {
    ...stripped,
    GIT_PAGER: "cat",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_ATTR_NOSYSTEM: "1",
    GIT_NO_LAZY_FETCH: "1",
    GIT_NO_REPLACE_OBJECTS: "1",
    LC_ALL: "C",
    LANG: "C",
    XDG_CONFIG_HOME: xdgConfigHomeDir,
  };

  return { env, effectivePath };
}

// -------------------------------------------------------------------------
// XDG_CONFIG_HOME neutralization directory
// -------------------------------------------------------------------------

/**
 * Creates a fresh, empty XDG_CONFIG_HOME directory for one top-level
 * operation. Never reuses a directory from a previous operation, ensuring
 * that any contamination (e.g., git/config or git/attributes written by
 * Git during the previous operation) cannot affect subsequent operations
 * (Finding 5 correction).
 */
function getEmptyXdgConfigHomeDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "buildrail-git-xdg-"));
}

// -------------------------------------------------------------------------
// In-process Git executable resolution (§8 "Git Capability Floor")
// -------------------------------------------------------------------------

function splitPath(pathValue: string): string[] {
  return pathValue.split(path.delimiter);
}

function normalizePathEntries(pathValue: string, resolverCwd: string): string[] {
  const entries = splitPath(pathValue);
  return entries.map((entry) => (entry === "" ? resolverCwd : path.resolve(resolverCwd, entry)));
}

function isRegularFileAfterSymlinkResolution(candidate: string): boolean {
  try {
    const st = fs.statSync(candidate);
    return st.isFile();
  } catch {
    return false;
  }
}

function posixCandidateIsValid(candidate: string): boolean {
  if (!isRegularFileAfterSymlinkResolution(candidate)) return false;
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function windowsCandidateIsValid(candidate: string): boolean {
  try {
    const st = fs.statSync(candidate);
    return st.isFile();
  } catch {
    return false;
  }
}

function resolveGitExecutable(resolverCwd: string, effectivePath: string | undefined): string | null {
  const isWindows = os.platform() === "win32";

  let searchDirs: string[];
  if (isWindows) {
    const pathValue = effectivePath ?? "";
    searchDirs = normalizePathEntries(pathValue, resolverCwd);
  } else {
    const pathValue = effectivePath !== undefined ? effectivePath : "/usr/bin:/bin";
    searchDirs = normalizePathEntries(pathValue, resolverCwd);
  }

  if (isWindows) {
    for (const dir of searchDirs) {
      const candidate = path.join(dir, "git.exe");
      if (windowsCandidateIsValid(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  for (const dir of searchDirs) {
    const candidate = path.join(dir, "git");
    if (posixCandidateIsValid(candidate)) {
      return candidate;
    }
  }
  return null;
}

function canonicalize(execPath: string): string {
  try {
    return fs.realpathSync(execPath);
  } catch {
    return execPath;
  }
}

// -------------------------------------------------------------------------
// Version floor check (§8)
// -------------------------------------------------------------------------

const MIN_GIT_VERSION: readonly [number, number, number] = [2, 45, 0];

function parseGitVersion(stdout: string): [number, number, number] | null {
  const match = /^git version (\d+)\.(\d+)\.(\d+)/.exec(stdout.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function versionAtLeast(v: [number, number, number], floor: readonly [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (v[i]! > floor[i]!) return true;
    if (v[i]! < floor[i]!) return false;
  }
  return true;
}

// -------------------------------------------------------------------------
// Top-level operation context
// -------------------------------------------------------------------------

export interface GitOperationContext {
  execPath: string;
  env: NodeJS.ProcessEnv;
}

export type PrepareResult = { ok: true; value: GitOperationContext } | { ok: false; error: GitError };

/**
 * Prepares one top-level BR3 operation: builds the sanitized environment,
 * resolves the Git executable in-process to one absolute path, and
 * verifies it satisfies BR3's minimum supported Git version. The result
 * MUST be used only for the single top-level operation it was built for —
 * never cached or reused across separate top-level calls (§8 Round 12
 * review finding #1A).
 */
export async function prepareGitOperation(): Promise<PrepareResult> {
  const xdgDir = getEmptyXdgConfigHomeDir();
  const { env, effectivePath } = buildSanitizedEnv(xdgDir);
  const resolverCwd = process.cwd();

  const resolved = resolveGitExecutable(resolverCwd, effectivePath);
  if (resolved === null) {
    return {
      ok: false,
      error: gitError("GIT_EXECUTABLE_UNAVAILABLE", "No usable git executable was found in the effective search path."),
    };
  }
  const execPath = canonicalize(resolved);

  let stdout: string;
  try {
    const result = await execFileAsync(execPath, ["--version"], {
      cwd: resolverCwd,
      env,
      encoding: "buffer",
      maxBuffer: MAX_BUFFER,
    });
    stdout = result.stdout.toString("utf-8");
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      return { ok: false, error: gitError("GIT_EXECUTABLE_UNAVAILABLE", "git executable could not be spawned.") };
    }
    return { ok: false, error: gitError("GIT_COMMAND_FAILED", "git --version failed.", String(nodeErr.message ?? nodeErr)) };
  }

  const parsed = parseGitVersion(stdout);
  if (parsed === null) {
    return {
      ok: false,
      error: gitError("GIT_VERSION_UNSUPPORTED", "git --version output did not match the expected format.", stdout),
    };
  }
  if (!versionAtLeast(parsed, MIN_GIT_VERSION)) {
    return {
      ok: false,
      error: gitError(
        "GIT_VERSION_UNSUPPORTED",
        `git version ${parsed.join(".")} is below BR3's supported floor (${MIN_GIT_VERSION.join(".")}).`,
        stdout.trim(),
      ),
    };
  }

  return { ok: true, value: { execPath, env } };
}

// -------------------------------------------------------------------------
// Shared execFile wrapper
// -------------------------------------------------------------------------

export interface ExecOutcome {
  ok: boolean;
  code: number | null;
  stdout: Buffer;
  stderr: Buffer;
  errno?: string;
}

/**
 * Runs one Git subcommand using the already-resolved executable path from
 * a GitOperationContext. Always uses argv arrays (never a shell), buffer
 * encoding, the 64 MiB maxBuffer override, and the sanitized env. `cwd`
 * must be supplied explicitly by the caller (projectRoot, a submodule
 * path, or the capability-probe's own fixed cwd) — there is no default.
 */
export async function runGit(ctx: GitOperationContext, args: string[], cwd: string, stdin?: Buffer): Promise<ExecOutcome> {
  if (stdin === undefined) {
    try {
      const result = await execFileAsync(ctx.execPath, args, {
        cwd,
        env: ctx.env,
        encoding: "buffer",
        maxBuffer: MAX_BUFFER,
      });
      return { ok: true, code: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { code?: number | string; stdout?: Buffer; stderr?: Buffer };
      if (typeof e.code === "number") {
        return {
          ok: false,
          code: e.code,
          stdout: (e.stdout as Buffer) ?? Buffer.alloc(0),
          stderr: (e.stderr as Buffer) ?? Buffer.alloc(0),
        };
      }
      return {
        ok: false,
        code: null,
        stdout: (e.stdout as Buffer) ?? Buffer.alloc(0),
        stderr: (e.stderr as Buffer) ?? Buffer.alloc(0),
        errno: typeof e.code === "string" ? e.code : e.errno !== undefined ? String(e.errno) : undefined,
      };
    }
  }

  return new Promise<ExecOutcome>((resolve) => {
    const child = execFileCb(
      ctx.execPath,
      args,
      { cwd, env: ctx.env, encoding: "buffer", maxBuffer: MAX_BUFFER } as Parameters<typeof execFileCb>[2],
      (err, stdout, stderr) => {
        const stdoutBuf = (stdout as unknown as Buffer) ?? Buffer.alloc(0);
        const stderrBuf = (stderr as unknown as Buffer) ?? Buffer.alloc(0);
        if (err === null) {
          resolve({ ok: true, code: 0, stdout: stdoutBuf, stderr: stderrBuf });
          return;
        }
        const e = err as NodeJS.ErrnoException & { code?: number | string };
        if (typeof e.code === "number") {
          resolve({ ok: false, code: e.code, stdout: stdoutBuf, stderr: stderrBuf });
          return;
        }
        resolve({
          ok: false,
          code: null,
          stdout: stdoutBuf,
          stderr: stderrBuf,
          errno: typeof e.code === "string" ? e.code : e.errno !== undefined ? String(e.errno) : undefined,
        });
      },
    );
    child.stdin?.end(stdin);
  });
}

export function commandFailedError(operation: string, outcome: ExecOutcome): GitError {
  if (outcome.errno === "ENOENT") {
    return gitError("GIT_EXECUTABLE_UNAVAILABLE", `git executable could not be spawned while running ${operation}.`);
  }
  const stderrText = outcome.stderr.toString("utf-8");
  return gitError("GIT_COMMAND_FAILED", `git ${operation} failed.`, stderrText || outcome.errno || `exit code ${outcome.code}`);
}

export function typedError(code: GitErrorCode, message: string, details?: unknown): GitError {
  return gitError(code, message, details);
}
