import type { GitError, GitResult } from "./errors.js";
import { gitFail, gitOk } from "./errors.js";
import { commandFailedError, prepareGitOperation, runGit, typedError, type GitOperationContext } from "./internal/exec.js";
import { decodeNulFieldsStrict, strictDecode } from "./internal/git-parse.js";
import { resolveRepository } from "./repository.js";
import type { HeadInfo, UpstreamInfo } from "./types.js";

const SHA_RE = /^[0-9a-f]{40}$/;

async function resolveUpstream(ctx: GitOperationContext, cwd: string, branch: string): Promise<GitResult<UpstreamInfo | null>> {
  const remoteOutcome = await runGit(ctx, ["config", "-z", "--get", `branch.${branch}.remote`], cwd);
  if (!remoteOutcome.ok) {
    if (remoteOutcome.code === 1) {
      return gitOk(null);
    }
    return { ok: false, error: commandFailedError(`config --get branch.${branch}.remote`, remoteOutcome) };
  }

  const mergeOutcome = await runGit(ctx, ["config", "-z", "--get-all", `branch.${branch}.merge`], cwd);
  if (!mergeOutcome.ok) {
    if (mergeOutcome.code === 1) {
      return gitOk(null);
    }
    return { ok: false, error: commandFailedError(`config --get-all branch.${branch}.merge`, mergeOutcome) };
  }

  let remote: string;
  let mergeValues: string[];
  try {
    const remoteFields = decodeNulFieldsStrict(remoteOutcome.stdout);
    remote = remoteFields[0] ?? "";
    mergeValues = decodeNulFieldsStrict(mergeOutcome.stdout);
  } catch {
    return gitFail("MALFORMED_GIT_OUTPUT", "branch.<b>.remote/.merge config output was not valid UTF-8.");
  }

  if (mergeValues.length === 0) {
    return gitOk(null);
  }

  const mergeRef = mergeValues[0]!;
  const branchName = mergeRef.startsWith("refs/heads/") ? mergeRef.slice("refs/heads/".length) : null;

  const shaOutcome = await runGit(ctx, ["rev-parse", "--verify", "-q", "--end-of-options", `${branch}@{upstream}`], cwd);
  const refOutcome = await runGit(ctx, ["rev-parse", "--verify", "-q", "--symbolic-full-name", "--end-of-options", `${branch}@{upstream}`], cwd);

  if (shaOutcome.ok && refOutcome.ok) {
    let sha: string;
    let ref: string;
    try {
      sha = strictDecode(shaOutcome.stdout).trim();
      ref = strictDecode(refOutcome.stdout).trim();
    } catch {
      return gitFail("MALFORMED_GIT_OUTPUT", "@{upstream} resolution output was not valid UTF-8.");
    }
    return gitOk({ remote, mergeRef, branch: branchName, ref, sha });
  }

  if (
    (!shaOutcome.ok && shaOutcome.code !== 1) ||
    (!refOutcome.ok && refOutcome.code !== 1)
  ) {
    const failed = !shaOutcome.ok && shaOutcome.code !== 1 ? shaOutcome : refOutcome;
    return { ok: false, error: commandFailedError(`rev-parse --verify @{upstream} for branch ${branch}`, failed) };
  }

  return gitOk({ remote, mergeRef, branch: branchName, ref: null, sha: null });
}

export async function inspectHead(projectRoot: string): Promise<GitResult<HeadInfo>> {
  const repoResult = await resolveRepository(projectRoot);
  if (!repoResult.ok) return { ok: false, error: repoResult.error };

  const prep = await prepareGitOperation();
  if (!prep.ok) return { ok: false, error: prep.error };
  const ctx = prep.value;
  const cwd = projectRoot;

  const symbolicOutcome = await runGit(ctx, ["symbolic-ref", "-q", "HEAD"], cwd);

  if (symbolicOutcome.ok) {
    // Symbolic (normal or unborn) — including possibly corrupt.
    let resolvedRefName: string;
    try {
      resolvedRefName = strictDecode(symbolicOutcome.stdout).trim();
    } catch {
      return gitFail("MALFORMED_GIT_OUTPUT", "symbolic-ref HEAD output was not valid UTF-8.");
    }

    const headCommitOutcome = await runGit(ctx, ["rev-parse", "--verify", "-q", "HEAD^{commit}"], cwd);

    if (headCommitOutcome.ok) {
      // Normal branch with commits.
      let headSha: string;
      try {
        headSha = strictDecode(headCommitOutcome.stdout).trim();
      } catch {
        return gitFail("MALFORMED_GIT_OUTPUT", "HEAD^{commit} output was not valid UTF-8.");
      }
      if (!SHA_RE.test(headSha)) {
        return gitFail("MALFORMED_GIT_OUTPUT", `Unexpected HEAD^{commit} output: ${headSha}`);
      }
      const branch = resolvedRefName.startsWith("refs/heads/") ? resolvedRefName.slice("refs/heads/".length) : resolvedRefName;
      const upstreamResult = await resolveUpstream(ctx, cwd, branch);
      if (!upstreamResult.ok) return { ok: false, error: upstreamResult.error };
      return gitOk({ branch, detached: false, unborn: false, headSha, upstream: upstreamResult.value });
    }

    if (headCommitOutcome.code !== 1) {
      return { ok: false, error: commandFailedError("rev-parse --verify -q HEAD^{commit}", headCommitOutcome) };
    }

    // symbolic-ref succeeded, HEAD^{commit} failed with exit 1: unborn vs. corrupt.
    const refNameOutcome = await runGit(ctx, ["rev-parse", "--verify", "-q", resolvedRefName], cwd);
    if (refNameOutcome.ok) {
      // Corrupt HEAD: the ref exists but doesn't resolve to a real commit.
      return gitFail("HEAD_UNAVAILABLE", "HEAD is symbolic but its target ref does not resolve to a real commit object.");
    }
    if (refNameOutcome.code !== 1) {
      return { ok: false, error: commandFailedError(`rev-parse --verify -q ${resolvedRefName}`, refNameOutcome) };
    }

    // Unborn branch.
    const branch = resolvedRefName.startsWith("refs/heads/") ? resolvedRefName.slice("refs/heads/".length) : resolvedRefName;
    const upstreamResult = await resolveUpstream(ctx, cwd, branch);
    if (!upstreamResult.ok) return { ok: false, error: upstreamResult.error };
    return gitOk({ branch, detached: false, unborn: true, headSha: null, upstream: upstreamResult.value });
  }

  if (symbolicOutcome.code === 1) {
    // Detached HEAD.
    const headCommitOutcome = await runGit(ctx, ["rev-parse", "--verify", "-q", "HEAD^{commit}"], cwd);
    if (headCommitOutcome.ok) {
      let headSha: string;
      try {
        headSha = strictDecode(headCommitOutcome.stdout).trim();
      } catch {
        return gitFail("MALFORMED_GIT_OUTPUT", "HEAD^{commit} output was not valid UTF-8.");
      }
      if (!SHA_RE.test(headSha)) {
        return gitFail("MALFORMED_GIT_OUTPUT", `Unexpected HEAD^{commit} output: ${headSha}`);
      }
      return gitOk({ branch: null, detached: true, unborn: false, headSha, upstream: null });
    }
    if (headCommitOutcome.code === 1) {
      return gitFail("HEAD_UNAVAILABLE", "Detached HEAD points at a non-existent object.");
    }
    return { ok: false, error: commandFailedError("rev-parse --verify -q HEAD^{commit} (detached)", headCommitOutcome) };
  }

  // symbolic-ref exit code other than 0 or 1: HEAD itself cannot be read.
  return gitFail("HEAD_UNAVAILABLE", "HEAD could not be read.");
}
