import * as fs from "node:fs";
import * as path from "node:path";
import type { GitError, GitResult } from "../errors.js";
import { gitFail, gitOk } from "../errors.js";
import { commandFailedError, runGit, typedError, type GitOperationContext } from "./exec.js";
import { splitNulFields, strictDecode } from "./git-parse.js";
import { resolveRepositoryWithContext } from "../repository.js";

const GITLINK_MODE = "160000";
const TAB = 0x09;

class MalformedSubmoduleOutput extends Error {}

async function parseGitlinkPaths(ctx: GitOperationContext, cwd: string): Promise<GitResult<string[]>> {
  const outcome = await runGit(ctx, ["ls-files", "--stage", "-z"], cwd);
  if (!outcome.ok) {
    return { ok: false, error: commandFailedError("ls-files --stage -z", outcome) };
  }

  if (outcome.stdout.length && outcome.stdout.at(-1) !== 0) return gitFail("MALFORMED_GIT_OUTPUT", "Missing ls-files NUL.");
  const fields = splitNulFields(outcome.stdout);
  const paths = new Set<string>();
  const order: string[] = [];

  for (const field of fields) {
    // Each field is: mode SP object SP stage TAB path
    const tabIdx = field.indexOf(TAB);
    if (tabIdx === -1) return gitFail("MALFORMED_GIT_OUTPUT", "Missing ls-files tab.");
    const headerBytes = field.subarray(0, tabIdx);
    const pathBytes = field.subarray(tabIdx + 1);

    let header: string;
    let p: string;
    try {
      header = strictDecode(headerBytes);
      p = strictDecode(pathBytes);
    } catch {
      throw new MalformedSubmoduleOutput();
    }

    if (header.length !== 49 || !/^(?:100644|100755|120000|160000) [0-9a-f]{40} [0-3]$/.test(header) || !p) return gitFail("MALFORMED_GIT_OUTPUT", "Invalid ls-files stage fields.");
    const mode = header.split(" ")[0];
    if (mode !== GITLINK_MODE) continue;

    if (!paths.has(p)) {
      paths.add(p);
      order.push(p);
    }
  }

  return gitOk(order);
}

export interface InitializedSubmodule {
  path: string;
  workingTreeRoot: string;
  gitDir: string;
  gitCommonDir: string;
}

interface EnumerationState {
  visitedWorkingTreeRoots: Set<string>;
  visitedMetadataIdentities: Set<string>;
}

function realpathOrSelf(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

function metadataKey(gitDir: string, gitCommonDir: string): string {
  return JSON.stringify([gitDir, gitCommonDir]);
}

function isLegitimateParentChildRelationship(
  parentGitCommonDir: string,
  childGitDir: string,
  childGitCommonDir: string,
  ownDotGit: string,
  dotGitIsDirectory: boolean,
): boolean {
  // Reject linked-worktree metadata (§18 step 4a)
  if (childGitDir !== childGitCommonDir) {
    return false;
  }

  // Reject if child metadata equals parent metadata (§18 step 4a)
  if (childGitDir === parentGitCommonDir) {
    return false;
  }

  if (dotGitIsDirectory) return childGitDir === realpathOrSelf(ownDotGit);

  // Accept pointer files only if child metadata is beneath parent's gitCommonDir tree (§18 step 4a)
  const parentPrefix = parentGitCommonDir.endsWith(path.sep) ? parentGitCommonDir : parentGitCommonDir + path.sep;
  return childGitDir.startsWith(parentPrefix);
}

function lstatSafe(p: string): fs.Stats | null {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

async function enumerateRecursive(
  ctx: GitOperationContext,
  enumerationRoot: string,
  state: EnumerationState,
  out: InitializedSubmodule[],
): Promise<GitError | null> {
  let pathsResult: GitResult<string[]>;
  try {
    pathsResult = await parseGitlinkPaths(ctx, enumerationRoot);
  } catch (e) {
    if (e instanceof MalformedSubmoduleOutput) {
      return typedError("MALFORMED_GIT_OUTPUT", "ls-files --stage -z output was not valid UTF-8.");
    }
    throw e;
  }
  if (!pathsResult.ok) return pathsResult.error;

  const parentValidation = await resolveRepositoryWithContext(ctx, enumerationRoot);
  if (!parentValidation.ok) {
    return parentValidation.error;
  }
  const parentGitCommonDir = parentValidation.value.gitCommonDir;

  for (const relPath of pathsResult.value) {
    const gitlinkPath = path.join(enumerationRoot, relPath);

    const linkStat = lstatSafe(gitlinkPath);
    if (linkStat === null) continue;
    if (linkStat.isSymbolicLink()) {
      return typedError("UNSAFE_SUBMODULE_PATH", `Gitlink working-tree path is a symbolic link: ${relPath}`);
    }
    if (!linkStat.isDirectory()) continue;

    const dotGitPath = path.join(gitlinkPath, ".git");
    const dotGitLstat = lstatSafe(dotGitPath);
    if (dotGitLstat === null) continue;
    if (dotGitLstat.isSymbolicLink()) {
      return typedError("UNSAFE_SUBMODULE_PATH", `Submodule .git entry is a symbolic link: ${relPath}`);
    }

    if (!dotGitLstat.isDirectory() && !dotGitLstat.isFile()) return typedError("UNSAFE_SUBMODULE_PATH", "Invalid .git entry shape.");

    const validation = await resolveRepositoryWithContext(ctx, gitlinkPath);
    if (!validation.ok) {
      return validation.error.code === "PROJECT_ROOT_MISMATCH"
        ? typedError("UNSAFE_SUBMODULE_PATH", "Submodule metadata redirects to another working tree.")
        : validation.error;
    }
    const { gitDir, gitCommonDir } = validation.value;

    const workingTreeRootCanonical = realpathOrSelf(gitlinkPath);
    const metaKey = metadataKey(gitDir, gitCommonDir);

    if (state.visitedWorkingTreeRoots.has(workingTreeRootCanonical) || state.visitedMetadataIdentities.has(metaKey)) {
      return typedError("UNSAFE_SUBMODULE_PATH", `Submodule cycle/alias detected: ${relPath}`);
    }

    if (!isLegitimateParentChildRelationship(parentGitCommonDir, gitDir, gitCommonDir, dotGitPath, dotGitLstat.isDirectory())) {
      return typedError("UNSAFE_SUBMODULE_PATH", `Submodule .git pointer does not resolve to a recognized parent-child relationship: ${relPath}`);
    }

    state.visitedWorkingTreeRoots.add(workingTreeRootCanonical);
    state.visitedMetadataIdentities.add(metaKey);

    out.push({ path: relPath, workingTreeRoot: gitlinkPath, gitDir, gitCommonDir });

    const nestedError = await enumerateRecursive(ctx, gitlinkPath, state, out);
    if (nestedError !== null) return nestedError;
  }

  return null;
}

export async function enumerateInitializedSubmodules(
  ctx: GitOperationContext,
  projectRoot: string,
  seedGitDir: string,
  seedGitCommonDir: string,
): Promise<GitResult<InitializedSubmodule[]>> {
  const state: EnumerationState = {
    visitedWorkingTreeRoots: new Set([realpathOrSelf(projectRoot)]),
    visitedMetadataIdentities: new Set([metadataKey(seedGitDir, seedGitCommonDir)]),
  };
  const out: InitializedSubmodule[] = [];
  const error = await enumerateRecursive(ctx, projectRoot, state, out);
  if (error !== null) return { ok: false, error };
  return gitOk(out);
}
