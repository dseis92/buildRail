import type { GitError, GitResult } from "./errors.js";
import { gitFail, gitOk } from "./errors.js";
import { commandFailedError, prepareGitOperation, runGit } from "./internal/exec.js";
import { removeTrailingNewline, splitNulFields, strictDecode } from "./internal/git-parse.js";
import { resolveRepositoryWithContext } from "./repository.js";
import type { DiffChange, DiffChangeKind, DiffRequest, DiffResult } from "./types.js";

const SHA_RE = /^[0-9a-f]{40}$/;

async function resolveRef(
  ctx: Parameters<typeof runGit>[0],
  projectRoot: string,
  ref: string,
): Promise<{ ok: true; sha: string } | { ok: false; error: GitError }> {
  const outcome = await runGit(ctx, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], projectRoot);
  if (!outcome.ok) {
    if (outcome.code === 128 || outcome.code === 1) {
      return { ok: false, error: { code: "REF_NOT_FOUND", message: `Ref did not resolve to a commit: ${ref}` } };
    }
    return { ok: false, error: commandFailedError(`rev-parse --verify --end-of-options ${ref}^{commit}`, outcome) };
  }
  let sha: string;
  try {
    sha = removeTrailingNewline(strictDecode(outcome.stdout));
  } catch {
    return { ok: false, error: { code: "MALFORMED_GIT_OUTPUT", message: `Ref resolution output was not valid UTF-8: ${ref}` } };
  }
  if ((sha.length !== 40 || !SHA_RE.test(sha))) {
    return { ok: false, error: { code: "MALFORMED_GIT_OUTPUT", message: `Unexpected rev-parse output for ref: ${ref}` } };
  }
  return { ok: true, sha };
}

const KIND_RANK: Record<DiffChangeKind, number> = {
  added: 0,
  deleted: 1,
  modified: 2,
  renamed: 3,
  type_changed: 4,
};

function sortChanges(changes: DiffChange[]): DiffChange[] {
  return [...changes].sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    const rankA = KIND_RANK[a.kind];
    const rankB = KIND_RANK[b.kind];
    if (rankA !== rankB) return rankA - rankB;
    const oldA = a.oldPath ?? "";
    const oldB = b.oldPath ?? "";
    if (oldA !== oldB) return oldA < oldB ? -1 : 1;
    return 0;
  });
}

class MalformedDiffOutput extends Error {}

export function parseNameStatus(stdout: Buffer): DiffChange[] | MalformedDiffOutput {
  if (stdout.length && stdout.at(-1) !== 0) return new MalformedDiffOutput("Missing final NUL.");
  const fields = splitNulFields(stdout);
  const changes: DiffChange[] = [];
  let i = 0;
  while (i < fields.length) {
    let statusField: string;
    try {
      statusField = strictDecode(fields[i]!);
    } catch {
      return new MalformedDiffOutput("diff status field was not valid UTF-8.");
    }

    // Validate complete status token for single-letter statuses
    if (statusField === "A" || statusField === "M" || statusField === "D" || statusField === "T") {
      if (i + 1 >= fields.length) return new MalformedDiffOutput(`Missing path for status ${statusField}`);
      let pathStr: string;
      try {
        pathStr = strictDecode(fields[i + 1]!);
      } catch {
        return new MalformedDiffOutput("diff path field was not valid UTF-8.");
      }
      if (!pathStr) return new MalformedDiffOutput("Empty diff path.");
      const kind: DiffChangeKind = statusField === "A" ? "added" : statusField === "M" ? "modified" : statusField === "D" ? "deleted" : "type_changed";
      changes.push({ kind, path: pathStr });
      i += 2;
      continue;
    }

    // Validate rename status token (R followed by similarity score)
    if (!/[\r\n\u2028\u2029]/.test(statusField) && /^R(?:[0-9]{1,2}|0[0-9]{2}|100)$/.test(statusField)) {
      const similarity = Number(statusField.slice(1));
      if (isNaN(similarity) || similarity < 0 || similarity > 100) {
        return new MalformedDiffOutput(`Invalid rename similarity value: ${statusField}`);
      }
      if (i + 2 >= fields.length) return new MalformedDiffOutput(`Missing paths for rename status ${statusField}`);
      let oldPathStr: string;
      let newPathStr: string;
      try {
        oldPathStr = strictDecode(fields[i + 1]!);
        newPathStr = strictDecode(fields[i + 2]!);
      } catch {
        return new MalformedDiffOutput("diff rename path field was not valid UTF-8.");
      }
      if (!oldPathStr || !newPathStr) return new MalformedDiffOutput("Empty rename path.");
      changes.push({ kind: "renamed", path: newPathStr, oldPath: oldPathStr, similarity });
      i += 3;
      continue;
    }

    return new MalformedDiffOutput(`Unrecognized diff status token: ${statusField}`);
  }
  return changes;
}

export async function inspectDiff(projectRoot: string, request: DiffRequest): Promise<GitResult<DiffResult>> {
  const prep = await prepareGitOperation();
  if (!prep.ok) return { ok: false, error: prep.error };
  const ctx = prep.value;

  const repoResult = await resolveRepositoryWithContext(ctx, projectRoot);
  if (!repoResult.ok) return { ok: false, error: repoResult.error };

  const fromResolved = await resolveRef(ctx, projectRoot, request.fromRef);
  if (!fromResolved.ok) {
    if (fromResolved.error.code === "REF_NOT_FOUND") {
      return gitFail("REF_NOT_FOUND", fromResolved.error.message, { which: "fromRef" });
    }
    return { ok: false, error: fromResolved.error };
  }
  const toResolved = await resolveRef(ctx, projectRoot, request.toRef);
  if (!toResolved.ok) {
    if (toResolved.error.code === "REF_NOT_FOUND") {
      return gitFail("REF_NOT_FOUND", toResolved.error.message, { which: "toRef" });
    }
    return { ok: false, error: toResolved.error };
  }

  const fromSha = fromResolved.sha;
  const toSha = toResolved.sha;

  const outcome = await runGit(
    ctx,
    [
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--ignore-submodules=none",
      "-z",
      "--name-status",
      "--find-renames=50%",
      "-l0",
      fromSha,
      toSha,
    ],
    projectRoot,
  );
  if (!outcome.ok) {
    return { ok: false, error: commandFailedError("diff --name-status", outcome) };
  }

  const parsed = parseNameStatus(outcome.stdout);
  if (parsed instanceof MalformedDiffOutput) {
    return gitFail("MALFORMED_GIT_OUTPUT", parsed.message);
  }

  return gitOk({ fromSha, toSha, changes: sortChanges(parsed) });
}
