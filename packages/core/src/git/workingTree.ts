import type { GitResult } from "./errors.js";
import { gitFail, gitOk } from "./errors.js";
import { commandFailedError, prepareGitOperation, runGit, typedError } from "./internal/exec.js";
import { scanForActiveFilters } from "./internal/filter-scan.js";
import { splitNulFields, strictDecode } from "./internal/git-parse.js";
import { resolveRepositoryWithContext } from "./repository.js";
import type { SubmoduleState, WorkingTreeEntry, WorkingTreeEntryKind, WorkingTreeStatus } from "./types.js";

const KIND_RANK: Record<WorkingTreeEntryKind, number> = {
  conflicted: 0,
  staged_add: 1,
  staged_delete: 2,
  staged_modify: 3,
  staged_rename: 4,
  staged_type_change: 5,
  unstaged_add: 6,
  unstaged_delete: 7,
  unstaged_modify: 8,
  unstaged_rename: 9,
  unstaged_type_change: 10,
  untracked: 11,
};

function yKindOf(y: string): WorkingTreeEntryKind | null {
  switch (y) {
    case "A":
      return "unstaged_add";
    case "M":
      return "unstaged_modify";
    case "D":
      return "unstaged_delete";
    case "T":
      return "unstaged_type_change";
    default:
      return null;
  }
}

function xKindOf(x: string): WorkingTreeEntryKind | null {
  switch (x) {
    case "A":
      return "staged_add";
    case "M":
      return "staged_modify";
    case "D":
      return "staged_delete";
    case "T":
      return "staged_type_change";
    default:
      return null;
  }
}

// S<c><m><u> — c: commitChanged, m: tracked-file modification, u: untracked content
function decodeSub(sub: string): SubmoduleState | "invalid" | undefined {
  if (sub === "N...") return undefined;
  if (sub.length !== 4 || sub[0] !== "S") {
    return "invalid";
  }
  const c = sub[1]!;
  const m = sub[2]!;
  const u = sub[3]!;
  // Validate exact grammar: c must be 'C' or '.', m must be 'M' or '.', u must be 'U' or '.'
  if ((c !== "C" && c !== ".") || (m !== "M" && m !== ".") || (u !== "U" && u !== ".")) {
    return "invalid";
  }
  return {
    commitChanged: c === "C",
    hasModifiedContent: m === "M",
    hasUntrackedContent: u === "U",
  };
}

class MalformedStatusOutput extends Error {
  constructor(message: string) {
    super(message);
  }
}

function splitFields(bytesFields: string): string[] {
  return bytesFields.split(" ");
}

function validFixed(parts: string[], modeStart: number, modeCount: number, shaStart: number, shaCount: number): boolean {
  return parts.slice(modeStart, modeStart + modeCount).every(v => v.length === 6 && /^(?:000000|100644|100755|120000|160000)$/.test(v)) &&
    parts.slice(shaStart, shaStart + shaCount).every(v => v.length === 40 && /^[0-9a-f]{40}$/.test(v));
}

export async function parseStatusOutput(stdout: Buffer): Promise<WorkingTreeEntry[] | MalformedStatusOutput> {
  const entries: WorkingTreeEntry[] = [];
  if (stdout.length && stdout.at(-1) !== 0) return new MalformedStatusOutput("Missing final NUL.");
  const fields = splitNulFields(stdout);

  let i = 0;
  while (i < fields.length) {
    let headerStr: string;
    try {
      headerStr = strictDecode(fields[i]!);
    } catch {
      return new MalformedStatusOutput("status record header was not valid UTF-8.");
    }

    const recordType = headerStr[0];

    if (recordType === "1") {
      // "1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>"
      const parts = splitFields(headerStr);
      if (parts[0] !== "1" || parts.length < 9) return new MalformedStatusOutput(`Malformed type-1 record: ${headerStr}`);
      const xy = parts[1]!;
      const sub = parts[2]!;
      const pathStr = parts.slice(8).join(" ");
      if (!pathStr || !validFixed(parts, 3, 3, 6, 2)) return new MalformedStatusOutput("Invalid type-1 fields.");
      if (xy.length !== 2) {
        return new MalformedStatusOutput(`Invalid XY field length in type-1 record: ${headerStr}`);
      }
      const x = xy[0]!;
      const y = xy[1]!;
      const submodule = decodeSub(sub);
      if (submodule === "invalid") {
        return new MalformedStatusOutput(`Invalid submodule field in type-1 record: ${headerStr}`);
      }

      let matched = false;
      if (x !== ".") {
        const kind = xKindOf(x);
        if (kind === null) return new MalformedStatusOutput(`Unrecognized X status: ${x} in ${headerStr}`);
        const entry: WorkingTreeEntry = { kind, path: pathStr };
        if (submodule) entry.submodule = submodule;
        entries.push(entry);
        matched = true;
      }
      if (y !== ".") {
        const kind = yKindOf(y);
        if (kind === null) return new MalformedStatusOutput(`Unrecognized Y status: ${y} in ${headerStr}`);
        const entry: WorkingTreeEntry = { kind, path: pathStr };
        if (submodule) entry.submodule = submodule;
        entries.push(entry);
        matched = true;
      }
      if (!matched) {
        return new MalformedStatusOutput(`Type-1 record with no X or Y status: ${headerStr}`);
      }
      i += 1;
      continue;
    }

    if (recordType === "2") {
      // "2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X score> <path>" then NUL then "<origPath>"
      const parts = splitFields(headerStr);
      if (parts[0] !== "2" || parts.length < 10) return new MalformedStatusOutput(`Malformed type-2 record: ${headerStr}`);
      const xy = parts[1]!;
      const sub = parts[2]!;
      const scoreField = parts[8]!;
      const pathStr = parts.slice(9).join(" ");
      if (!pathStr || !validFixed(parts, 3, 3, 6, 2)) return new MalformedStatusOutput("Invalid type-2 fields.");
      if (!/^(?:R[.MDT]|\.R)$/.test(xy)) return new MalformedStatusOutput("Invalid type-2 XY.");
      if (i + 1 >= fields.length) return new MalformedStatusOutput(`Type-2 record missing oldPath field: ${headerStr}`);
      let oldPathStr: string;
      try {
        oldPathStr = strictDecode(fields[i + 1]!);
      } catch {
        return new MalformedStatusOutput("Type-2 record oldPath was not valid UTF-8.");
      }
      if (!oldPathStr || xy.length !== 2) {
        return new MalformedStatusOutput(`Invalid XY field length in type-2 record: ${headerStr}`);
      }
      const x = xy[0]!;
      const y = xy[1]!;
      const submodule = decodeSub(sub);
      if (submodule === "invalid") {
        return new MalformedStatusOutput(`Invalid submodule field in type-2 record: ${headerStr}`);
      }
      // Validate rename score format: must be "R" followed by digits
      if (/[\r\n\u2028\u2029]/.test(scoreField) || !/^R(?:[0-9]{1,2}|0[0-9]{2}|100)$/.test(scoreField)) {
        return new MalformedStatusOutput(`Invalid rename score format in type-2 record: ${headerStr}`);
      }
      const similarity = Number(scoreField.slice(1));
      if (isNaN(similarity) || similarity < 0 || similarity > 100) {
        return new MalformedStatusOutput(`Invalid rename similarity value in type-2 record: ${headerStr}`);
      }

      if (x !== "R" && x !== ".") {
        return new MalformedStatusOutput(`Unexpected type-2 X status: ${x} in ${headerStr}`);
      }
      if (y !== "R" && y !== "." && x === ".") {
        return new MalformedStatusOutput(`Unexpected type-2 record with no rename axis: ${headerStr}`);
      }

      if (x === "R") {
        const renameEntry: WorkingTreeEntry = {
          kind: "staged_rename",
          path: pathStr,
          oldPath: oldPathStr,
          similarity,
        };
        if (submodule) renameEntry.submodule = submodule;
        entries.push(renameEntry);

        if (y === "R") {
          return new MalformedStatusOutput(`Unexpected type-2 record with both X and Y as R: ${headerStr}`);
        }
        if (y !== ".") {
          const kind = yKindOf(y);
          if (kind === null) return new MalformedStatusOutput(`Unrecognized type-2 Y status: ${y} in ${headerStr}`);
          const entry: WorkingTreeEntry = { kind, path: pathStr };
          if (submodule) entry.submodule = submodule;
          entries.push(entry);
        }
      } else if (y === "R") {
        // "2 .R" — unstaged rename only, no staged-side change.
        const renameEntry: WorkingTreeEntry = {
          kind: "unstaged_rename",
          path: pathStr,
          oldPath: oldPathStr,
          similarity,
        };
        if (submodule) renameEntry.submodule = submodule;
        entries.push(renameEntry);
      }

      i += 2;
      continue;
    }

    if (recordType === "u") {
      // "u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>"
      const parts = splitFields(headerStr);
      if (parts[0] !== "u" || parts.length < 11) return new MalformedStatusOutput(`Malformed unmerged record: ${headerStr}`);
      const sub = parts[2]!;
      const pathStr = parts.slice(10).join(" ");
      if (!pathStr || !/^(?:DD|AU|UD|UA|DU|AA|UU)$/.test(parts[1]!) || !validFixed(parts, 3, 4, 7, 3)) return new MalformedStatusOutput("Invalid unmerged fields.");
      const submodule = decodeSub(sub);
      if (submodule === "invalid") {
        return new MalformedStatusOutput(`Invalid submodule field in unmerged record: ${headerStr}`);
      }
      const entry: WorkingTreeEntry = { kind: "conflicted", path: pathStr };
      if (submodule) entry.submodule = submodule;
      entries.push(entry);
      i += 1;
      continue;
    }

    if (recordType === "?") {
      const pathStr = headerStr.slice(2);
      if (!headerStr.startsWith("? ") || !pathStr) return new MalformedStatusOutput("Invalid untracked record.");
      entries.push({ kind: "untracked", path: pathStr });
      i += 1;
      continue;
    }

    return new MalformedStatusOutput(`Unrecognized porcelain v2 record type: ${headerStr}`);
  }

  return entries;
}

function sortEntries(entries: WorkingTreeEntry[]): WorkingTreeEntry[] {
  return [...entries].sort((a, b) => {
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

export async function inspectWorkingTree(projectRoot: string): Promise<GitResult<WorkingTreeStatus>> {
  const prep = await prepareGitOperation();
  if (!prep.ok) return { ok: false, error: prep.error };
  const ctx = prep.value;

  const repoResult = await resolveRepositoryWithContext(ctx, projectRoot);
  if (!repoResult.ok) return { ok: false, error: repoResult.error };
  const { gitDir, gitCommonDir } = repoResult.value;

  const filterError = await scanForActiveFilters(ctx, projectRoot, gitDir, gitCommonDir);
  if (filterError !== null) {
    return { ok: false, error: filterError };
  }

  const outcome = await runGit(
    ctx,
    [
      "-c",
      "core.fsmonitor=",
      "-c",
      "status.renameLimit=0",
      "-c",
      "status.showStash=false",
      "status",
      "--porcelain=v2",
      "-z",
      "--find-renames=50%",
      "--untracked-files=all",
      "--ignore-submodules=none",
    ],
    projectRoot,
  );
  if (!outcome.ok) {
    return { ok: false, error: commandFailedError("status --porcelain=v2", outcome) };
  }

  const parsed = await parseStatusOutput(outcome.stdout);
  if (parsed instanceof MalformedStatusOutput) {
    return gitFail("MALFORMED_GIT_OUTPUT", parsed.message);
  }

  const entries = sortEntries(parsed);
  return gitOk({ clean: entries.length === 0, entries });
}
