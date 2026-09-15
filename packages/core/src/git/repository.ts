import * as fs from "node:fs";
import * as path from "node:path";
import type { GitError, GitResult } from "./errors.js";
import { gitFail, gitOk } from "./errors.js";
import { commandFailedError, prepareGitOperation, runGit, typedError, type GitOperationContext, type ExecOutcome } from "./internal/exec.js";
import { removeTrailingNewline, strictDecode } from "./internal/git-parse.js";
import type { RepositoryInfo } from "./types.js";

function realpathOrSelf(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

function hasNonBareShape(dir: string): boolean {
  const dotGit = path.join(dir, ".git");
  let st: fs.Stats;
  try {
    st = fs.lstatSync(dotGit);
  } catch {
    return false;
  }
  if (st.isFile()) return true;
  if (st.isDirectory()) {
    return fs.existsSync(path.join(dotGit, "HEAD"));
  }
  return false;
}

function hasBareShape(dir: string): boolean {
  const headPath = path.join(dir, "HEAD");
  let headStat: fs.Stats;
  try {
    headStat = fs.statSync(headPath);
  } catch {
    return false;
  }
  if (!headStat.isFile()) return false;

  const objectsPath = path.join(dir, "objects");
  let objectsStat: fs.Stats;
  try {
    objectsStat = fs.statSync(objectsPath);
  } catch {
    return false;
  }
  if (!objectsStat.isDirectory()) return false;

  const refsPath = path.join(dir, "refs");
  try {
    if (fs.statSync(refsPath).isDirectory()) return true;
  } catch {
    // fall through to reftable check
  }
  const reftableTablesList = path.join(dir, "reftable", "tables.list");
  try {
    return fs.statSync(reftableTablesList).isFile();
  } catch {
    return false;
  }
}

interface AncestorMarker {
  ancestorPath: string;
  shape: "non-bare" | "bare";
}

/**
 * Walks projectRoot's own ancestor chain looking for a plausible
 * repository marker (§8, Round 16/17 review findings). Stops at the
 * first mount-point boundary it encounters (device id change), never
 * before that boundary and never claiming filesystem-root equivalence
 * with Git's own, config-sensitive discovery behavior.
 */
function findAncestorMarker(startDir: string): AncestorMarker | null {
  let current = realpathOrSelf(startDir);
  let currentDev: number | undefined;
  try {
    currentDev = fs.statSync(current).dev;
  } catch {
    return null;
  }

  for (;;) {
    if (hasNonBareShape(current)) {
      return { ancestorPath: current, shape: "non-bare" };
    }
    if (hasBareShape(current)) {
      return { ancestorPath: current, shape: "bare" };
    }

    const parent = path.dirname(current);
    if (parent === current) {
      // Reached the filesystem root.
      return null;
    }

    let parentDev: number;
    try {
      parentDev = fs.statSync(parent).dev;
    } catch {
      return null;
    }
    if (parentDev !== currentDev) {
      // Mount-point boundary — stop here, matching Git's own default
      // (cross-filesystem-discovery-disabled) behavior.
      return null;
    }

    current = parent;
    currentDev = parentDev;
  }
}

async function classifyBareCheckFailure(projectRoot: string, outcome: ExecOutcome): Promise<GitError> {
  if (hasNonBareShape(projectRoot) || hasBareShape(projectRoot)) {
    return typedError(
      "GIT_COMMAND_FAILED",
      "git rev-parse --is-bare-repository failed against a repository whose shape is present at projectRoot.",
      outcome.stderr.toString("utf-8") || outcome.errno || `exit code ${outcome.code}`,
    );
  }

  const marker = findAncestorMarker(path.dirname(projectRoot));
  if (marker !== null) {
    return typedError(
      "GIT_COMMAND_FAILED",
      `git rev-parse --is-bare-repository failed, but a plausible ${marker.shape} repository marker was found in projectRoot's ancestor chain.`,
      { ancestorPath: marker.ancestorPath, shape: marker.shape },
    );
  }

  return typedError("NOT_A_GIT_REPOSITORY", "projectRoot is not inside any Git repository, bare or non-bare.");
}

async function resolveGitDirs(
  ctx: GitOperationContext,
  cwd: string,
): Promise<GitResult<{ gitDir: string; gitCommonDir: string }>> {
  const gitDirOutcome = await runGit(ctx, ["rev-parse", "--git-dir"], cwd);
  if (!gitDirOutcome.ok) {
    return { ok: false, error: commandFailedError("rev-parse --git-dir", gitDirOutcome) };
  }
  const gitCommonDirOutcome = await runGit(ctx, ["rev-parse", "--git-common-dir"], cwd);
  if (!gitCommonDirOutcome.ok) {
    return { ok: false, error: commandFailedError("rev-parse --git-common-dir", gitCommonDirOutcome) };
  }

  let gitDirRaw: string;
  let gitCommonDirRaw: string;
  try {
    gitDirRaw = removeTrailingNewline(strictDecode(gitDirOutcome.stdout));
    gitCommonDirRaw = removeTrailingNewline(strictDecode(gitCommonDirOutcome.stdout));
  } catch {
    return gitFail("MALFORMED_GIT_OUTPUT", "git-dir/git-common-dir output was not valid UTF-8.");
  }

  const gitDir = path.isAbsolute(gitDirRaw) ? gitDirRaw : path.resolve(cwd, gitDirRaw);
  const gitCommonDir = path.isAbsolute(gitCommonDirRaw) ? gitCommonDirRaw : path.resolve(cwd, gitCommonDirRaw);

  return gitOk({ gitDir: realpathOrSelf(gitDir), gitCommonDir: realpathOrSelf(gitCommonDir) });
}

/** Complete post-capability repository resolution, shared by every public Git operation. */
export async function resolveRepositoryWithContext(
  ctx: GitOperationContext,
  candidateRoot: string,
): Promise<GitResult<RepositoryInfo>> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(candidateRoot);
  } catch {
    return gitFail("PROJECT_ROOT_NOT_FOUND", "projectRoot does not exist.");
  }
  if (!stat.isDirectory()) {
    return gitFail("PROJECT_ROOT_NOT_FOUND", "projectRoot is not a directory.");
  }

  const isBareOutcome = await runGit(ctx, ["rev-parse", "--is-bare-repository"], candidateRoot);
  if (!isBareOutcome.ok) {
    const error = await classifyBareCheckFailure(candidateRoot, isBareOutcome);
    return { ok: false, error };
  }

  let isBareText: string;
  try {
    isBareText = removeTrailingNewline(strictDecode(isBareOutcome.stdout));
  } catch {
    return gitFail("MALFORMED_GIT_OUTPUT", "--is-bare-repository output was not valid UTF-8.");
  }

  if (isBareText === "true") {
    return gitFail("BARE_REPOSITORY_UNSUPPORTED", "projectRoot is a bare repository.");
  }
  if (isBareText !== "false") {
    return gitFail("MALFORMED_GIT_OUTPUT", `Unexpected --is-bare-repository output: ${isBareText}`);
  }

  const toplevelOutcome = await runGit(ctx, ["rev-parse", "--show-toplevel"], candidateRoot);
  if (!toplevelOutcome.ok) {
    return { ok: false, error: commandFailedError("rev-parse --show-toplevel", toplevelOutcome) };
  }
  let toplevelRaw: string;
  try {
    toplevelRaw = removeTrailingNewline(strictDecode(toplevelOutcome.stdout));
  } catch {
    return gitFail("MALFORMED_GIT_OUTPUT", "--show-toplevel output was not valid UTF-8.");
  }

  const resolvedToplevel = realpathOrSelf(toplevelRaw);
  const resolvedCandidateRoot = realpathOrSelf(candidateRoot);
  if (resolvedToplevel !== resolvedCandidateRoot) {
    return gitFail("PROJECT_ROOT_MISMATCH", "projectRoot is inside a real Git repository, but is not that repository's root.", {
      actualToplevel: resolvedToplevel,
    });
  }

  const dirsResult = await resolveGitDirs(ctx, candidateRoot);
  if (!dirsResult.ok) return dirsResult;
  const { gitDir, gitCommonDir } = dirsResult.value;

  const objectFormatOutcome = await runGit(ctx, ["rev-parse", "--show-object-format"], candidateRoot);
  if (!objectFormatOutcome.ok) {
    return { ok: false, error: commandFailedError("rev-parse --show-object-format", objectFormatOutcome) };
  }
  let objectFormat: string;
  try {
    objectFormat = removeTrailingNewline(strictDecode(objectFormatOutcome.stdout));
  } catch {
    return gitFail("MALFORMED_GIT_OUTPUT", "--show-object-format output was not valid UTF-8.");
  }
  if (objectFormat !== "sha1") {
    return gitFail("UNSUPPORTED_OBJECT_FORMAT", `Unsupported object format: ${objectFormat}`, objectFormat);
  }

  const refStorageOutcome = await runGit(ctx, ["config", "--get", "extensions.refStorage"], candidateRoot);
  if (!refStorageOutcome.ok) {
    if (refStorageOutcome.code === 1) {
      // Key genuinely absent — the ordinary, supported case.
    } else {
      return { ok: false, error: commandFailedError("config --get extensions.refStorage", refStorageOutcome) };
    }
  } else {
    let refStorageValue: string;
    try {
      refStorageValue = removeTrailingNewline(strictDecode(refStorageOutcome.stdout));
    } catch {
      return gitFail("MALFORMED_GIT_OUTPUT", "extensions.refStorage output was not valid UTF-8.");
    }
    if (refStorageValue !== "files") {
      return gitFail("UNSUPPORTED_REF_FORMAT", `Unsupported ref storage format: ${refStorageValue}`, refStorageValue);
    }
  }

  return gitOk({
    root: resolvedCandidateRoot,
    gitDir,
    gitCommonDir,
    isWorktree: gitDir !== gitCommonDir,
  });
}

export async function resolveRepository(projectRoot: string): Promise<GitResult<RepositoryInfo>> {
  const prep = await prepareGitOperation();
  if (!prep.ok) return { ok: false, error: prep.error };
  const ctx = prep.value;

  return resolveRepositoryWithContext(ctx, projectRoot);
}
