import type { GitError, GitResult } from "../errors.js";
import { gitOk } from "../errors.js";
import { commandFailedError, runGit, typedError, type GitOperationContext } from "./exec.js";
import { splitNulFields, strictDecode } from "./git-parse.js";
import { enumerateInitializedSubmodules } from "./submodules.js";

async function listTrackedPaths(ctx: GitOperationContext, cwd: string): Promise<GitResult<string[]>> {
  const outcome = await runGit(ctx, ["ls-files", "--stage", "-z"], cwd);
  if (!outcome.ok) {
    return { ok: false, error: commandFailedError("ls-files --stage -z", outcome) };
  }
  if (outcome.stdout.length && outcome.stdout.at(-1) !== 0) return { ok: false, error: typedError("MALFORMED_GIT_OUTPUT", "Missing ls-files NUL.") };
  const fields = splitNulFields(outcome.stdout);
  const paths: string[] = [];
  for (const f of fields) {
    try {
      const text = strictDecode(f);
      const match = /^(?:100644|100755|120000|160000) [0-9a-f]{40} [0-3]\t([\s\S]+)$/.exec(text);
      if (!match) return { ok: false, error: typedError("MALFORMED_GIT_OUTPUT", "Invalid ls-files stage record.") };
      if (!paths.includes(match[1]!)) paths.push(match[1]!);
    } catch {
      return { ok: false, error: typedError("MALFORMED_GIT_OUTPUT", "ls-files -z output was not valid UTF-8.") };
    }
  }
  return gitOk(paths);
}

async function scanOneRepo(ctx: GitOperationContext, cwd: string): Promise<GitError | null> {
  const pathsResult = await listTrackedPaths(ctx, cwd);
  if (!pathsResult.ok) return pathsResult.error;

  const stdinBuf = Buffer.concat(pathsResult.value.map((p) => Buffer.concat([Buffer.from(p, "utf-8"), Buffer.from([0])])));

  const outcome = await runGit(ctx, ["check-attr", "--stdin", "-z", "filter"], cwd, stdinBuf);
  if (!outcome.ok) {
    return commandFailedError("check-attr --stdin -z filter", outcome);
  }

  const fields = splitNulFields(outcome.stdout);

  // Validate complete three-field record groups (path, attr, value)
  if ((outcome.stdout.length > 0 && outcome.stdout.at(-1) !== 0) || fields.length !== pathsResult.value.length * 3) {
    return typedError("MALFORMED_GIT_OUTPUT", `check-attr output has incomplete record group: ${fields.length} fields is not divisible by 3.`);
  }

  const activePaths: string[] = [];
  for (let i = 0; i < fields.length; i += 3) {
    let p: string;
    let attr: string;
    let value: string;
    try {
      p = strictDecode(fields[i]!);
      attr = strictDecode(fields[i + 1]!);
      value = strictDecode(fields[i + 2]!);
    } catch {
      return typedError("MALFORMED_GIT_OUTPUT", "check-attr --stdin -z output was not valid UTF-8.");
    }
    // Validate expected attribute name
    if (attr !== "filter" || p !== pathsResult.value[i / 3]) {
      return typedError("MALFORMED_GIT_OUTPUT", `check-attr returned unexpected attribute name: ${attr}`);
    }
    if (value !== "unspecified" && value !== "unset") {
      activePaths.push(p);
    }
  }

  if (activePaths.length > 0) {
    return typedError("EXTERNAL_GIT_FILTER_UNSUPPORTED", "An active filter attribute was found on one or more tracked paths.", {
      paths: activePaths,
    });
  }

  return null;
}

/**
 * Runs a fresh, complete, recursive effective-filter-attribute scan
 * against projectRoot and every initialized submodule (§18). Gates
 * inspectWorkingTree's status invocation exclusively — never cached
 * across separate top-level calls.
 */
export async function scanForActiveFilters(
  ctx: GitOperationContext,
  projectRoot: string,
  gitDir: string,
  gitCommonDir: string,
): Promise<GitError | null> {
  const rootError = await scanOneRepo(ctx, projectRoot);
  if (rootError !== null) return rootError;

  const submodulesResult = await enumerateInitializedSubmodules(ctx, projectRoot, gitDir, gitCommonDir);
  if (!submodulesResult.ok) return submodulesResult.error;

  for (const sub of submodulesResult.value) {
    const subError = await scanOneRepo(ctx, sub.workingTreeRoot);
    if (subError !== null) return subError;
  }

  return null;
}
