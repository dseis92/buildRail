# BR3 — Git Inspection

## 1. Status

**SPECIFIED — NOT IMPLEMENTATION AUTHORIZED.**

This document is a detailed, implementation-grade specification for BR3.
Writing it does not authorize implementation, dependency installation, or
BR3 activation. BR3 remains `PLANNED — NOT IMPLEMENTATION AUTHORIZED` in
`.buildrail/state.yml` until the human owner explicitly grants a separate
implementation authorization, following independent review of this
specification and a governance activation step mirroring BR1's and BR2's
(`.buildrail/config.yml` policy update if needed, `.buildrail/state.yml`
authorization record) — see §27.

## 2. Goal

Give BuildRail deterministic, provider-neutral, **read-only** knowledge of
actual Git repository state, so later phases (BR4's evidence binding, BR5's
skills, and governance policy generally) can reason about what actually
changed rather than relying on an agent's self-report.

Concretely, BR3 must let a caller, from a given `@buildrail/core` API
surface:

- confirm a directory is a Git repository (and exactly which one)
- determine the current branch, or detached-HEAD state
- determine the current HEAD commit SHA
- determine the upstream (remote-tracking) branch's identity and SHA,
  when one exists, without ever contacting the network
- inspect the working tree: staged changes, unstaged changes, untracked
  paths, conflicts — as a structured per-path model, not a single
  clean/dirty boolean
- compute the changed-path diff between two resolved refs/SHAs, with
  added/modified/deleted/renamed classification
- match a set of changed paths against `.buildrail/config.yml`'s
  `protected_systems` declarations, and report every intersection

BR3 makes BuildRail's model of "what actually changed" *real* without
deciding what that means for authorization — that remains BR2's policy
layer — and without executing anything (tests, builds, verification) —
that remains BR4.

## 3. Current Repository Reality

As of the BR2 frozen baseline (`720abf34d80933714475ec56ab43fd39fa82f484`,
merged to `main`), confirmed by direct inspection immediately before
drafting this specification:

- `packages/core/src/git/` contains only a `.gitkeep` placeholder — no
  functional Git implementation exists yet, at any level.
- `packages/core/package.json`'s current runtime `dependencies` are
  exactly `ajv` (^8.20.0) and `yaml` (^2.9.1); `devDependencies` are
  `typescript` and `@types/node`. It declares an `"exports"` map
  restricting `@buildrail/core`'s publicly resolvable surface to `.`
  only, and an `"imports"` map with `#internal/*` package-private
  specifiers (`#internal/schema/registry.js`, `#internal/config/index.js`,
  `#internal/state/index.js`) that Node resolves only for code inside the
  package itself, used exclusively by test code to reach internal,
  non-barrel-exported helper functions. This is BR2's established,
  independently-reviewed pattern for keeping test-only seams out of the
  public API surface — **BR3 must follow the same pattern** for any
  internal-only test seam it needs (§17's schema-error-taxonomy-style
  boundary does not apply here, but the exports/imports discipline does).
- `packages/core/src/index.ts` is the public barrel. It selectively
  re-exports named values from each module's own `index.ts` (e.g.
  `export { loadConfig } from "./config/index.js"`), plus separate
  `export type {...}` blocks per module. BR2's established per-module
  file layout is `<module>/index.ts` (public + some internal-but-exported
  functions), `<module>/errors.ts` (error-code union + error interface +
  `Result` type alias), `<module>/types.ts` where a module needs its own
  domain types. **BR3 follows this same module-per-concern structure —
  see §7.**
- `packages/core/src/result.ts` defines the shared `Result<T, E>` and
  `BuildRailError { code, message, path?, details? }` shapes, plus a
  `LoadResult<T, E>` / `LoadSuccess<T>` wrapper (carrying a
  `diagnostics: GovernanceDiagnostic[]` array) used specifically by
  `loadConfig`/`loadState` for non-fatal warnings. Each domain module
  defines its own `<Domain>ErrorCode` union and `<Domain>Error extends
  BuildRailError` interface. **BR3 defines its own `GitErrorCode`/
  `GitError`/`GitResult` (§16) following this identical pattern** — no
  new base `Result` shape is introduced.
- `packages/core/src/policy/index.ts` demonstrates BR2's established
  pattern for sharing logic across modules without expanding the public
  API: `validateAuthorizationFields` is exported from `policy/index.ts`
  but is **not** re-exported through the public `index.ts` barrel;
  `lifecycle/index.ts` imports it directly by relative path
  (`../policy/index.js`). **BR3's pure protected-path-matching logic
  follows this same convention** where it needs to be reused internally
  without becoming public API (§7, §12).
- `.buildrail/config.yml`'s actual current `protected_systems: []` is
  empty (no protected systems declared yet for BuildRail itself), but
  `config.schema.json`'s `#/$defs/protectedSystem` — already established
  in BR0, unchanged since — requires exactly:
  ```json
  {
    "type": "object",
    "required": ["name", "status", "paths"],
    "properties": {
      "name": { "type": "string", "minLength": 1 },
      "status": { "type": "string", "enum": ["open", "guarded", "frozen", "locked"] },
      "paths": { "type": "array", "items": { "type": "string", "minLength": 1 } }
    },
    "additionalProperties": true
  }
  ```
  BR3 does not change this schema. BR3 consumes it as already loaded and
  validated by BR2's `loadConfig` (`ProtectedSystem`/`ProtectedSystemStatus`
  types are already exported from `@buildrail/core`, per §3's inspection
  of `packages/core/src/index.ts`).
- `docs/PROTECTED_SYSTEMS.md` describes the intended model precisely:
  protection levels `OPEN`/`GUARDED`/`FROZEN`/`LOCKED`, glob-style path
  patterns declared per named system, Git inspection (BR3) does the
  matching, governance policy (BR2) decides what a match *means*. BR3
  **reports intersections only** — see §4, §12.
- `docs/GOVERNANCE.md` states: "Enforcement of these rules by tooling...
  is not implemented until BR2 (policy) and BR3 (Git inspection)" —
  confirming BR2 (done, frozen) owns policy, BR3 (this document) owns
  Git-fact-gathering.
- `docs/STATE_MACHINE.md` names `PREFLIGHT` as where "branch state,
  dependencies, protected-system awareness" get checked before work
  starts — one anticipated future *consumer* of BR3's facts. Implementing
  that consumption is explicitly **not** part of BR3 (§6) — BR3 only
  supplies the facts; wiring them into a lifecycle-gating decision is a
  future phase's concern.
- `docs/development/BR3.md` (the existing one-paragraph roadmap stub)
  lists BR3's scope as branch detection, HEAD/remote SHA detection,
  working-tree inspection, diff inspection, protected-path detection,
  deletion detection, rename detection — consistent with, but far less
  detailed than, this document.
- Node version baseline across the whole project remains `>=22` (BR1's
  established minimum, carried through BR2, carried through BR3).
- Testing convention established by BR2: `node:test` + `node:assert/strict`,
  real fixture files/directories under `packages/core/tests/fixtures/*/`,
  shared helper modules under `packages/core/tests/helpers/*.ts` — not
  tautological self-referencing constants. **BR3 additionally requires
  real, ephemeral, temporary Git repositories** for any test that touches
  actual Git behavior (§20) — not mocked Git command output.

## 4. Architectural Boundary

### BR3 owns

- Repository-root validation: confirming a given directory *is* the root
  of a Git working tree BR3 will operate against (§8)
- Current branch / detached-HEAD / unborn-branch detection (§9)
- HEAD commit SHA detection (§9)
- Upstream (remote-tracking) branch identity and SHA detection, entirely
  from local repository state — no network access (§9, §10)
- Working-tree status inspection as a structured, per-path model (§11)
- Diff inspection between two resolved refs/SHAs, including
  added/modified/deleted/renamed classification (§13)
- Rename detection with an explicit, documented threshold (§14)
- Deletion detection, represented identically whether the deletion is
  committed (diff) or currently staged/unstaged (working tree) (§13, §15)
- Deterministic matching of a set of repository-relative paths against
  `config.schema.json`-shaped `protected_systems` glob patterns, as a
  pure function independent of any live Git call (§16)
- A structured, typed error/result model for all of the above (§17)

### BR3 does not own

- Deciding what a protected-path match *means* for authorization — that
  is BR2's policy layer. BR3 reports facts; it never returns an
  "allowed"/"denied" verdict.
- Executing quality gates, `buildrail verify`, or producing
  `verification-report.schema.json`-shaped evidence — that is BR4.
- Binding evidence/verification results to an exact candidate SHA — BR4.
- Any Git *mutation*: `checkout`, `reset`, `clean`, `stash`, `fetch`,
  `pull`, `push`, `commit`, `rebase`, `merge`, branch creation/deletion,
  tag creation/deletion, remote configuration changes, or any other
  command that changes refs, the index, the working tree, remotes, or
  repository configuration (§5).
- Network access of any kind — BR3 never fetches, never contacts a
  remote, and never blocks on network I/O (§6).
- Agent skills becoming CLI-backed (BR5).
- Claude Code / Codex adapters (BR6/BR7).
- Any new `buildrail` CLI command (§21) — BR3 is a `@buildrail/core`
  library addition only, per the same "library first, CLI wiring is a
  separate, explicit decision" pattern BR2 established.
- Real `buildrail init` scaffolding — unaffected by BR3, exactly as it
  was unaffected by BR2.

## 5. Scope

1. **Repository/root validation** (`packages/core/src/git/repository.ts`
   or equivalent, per §7) — confirm `projectRoot` is exactly the root of
   a Git working tree BR3 will operate against; typed rejection for every
   case enumerated in §8.
2. **Branch/HEAD inspection** (`packages/core/src/git/head.ts`) —
   `inspectHead(projectRoot)` returning branch/detached/unborn state, HEAD
   SHA, upstream identity, and upstream SHA (§9, §10).
3. **Working-tree inspection** (`packages/core/src/git/workingTree.ts`) —
   `inspectWorkingTree(projectRoot)` returning the full structured
   per-path status model (§11).
4. **Diff inspection** (`packages/core/src/git/diff.ts`) —
   `inspectDiff(projectRoot, request)` returning changed paths between two
   resolved refs/SHAs, with rename/deletion classification (§13, §14, §15).
5. **Protected-path matching** (`packages/core/src/git/protectedPaths.ts`)
   — `matchProtectedPaths(paths, protectedSystems)`, a **pure function**
   with no Git or filesystem access, matching a caller-supplied list of
   repository-relative paths against already-loaded `ProtectedSystem[]`
   declarations (§12, §16).
6. **Process execution primitive** (`packages/core/src/git/exec.ts` or
   `internal/`) — the one, shared, safe Git-subprocess-invocation helper
   every other BR3 module calls through; never exported publicly (§18,
   §19).
7. **Public API surface** (`packages/core/src/git/index.ts`,
   re-exported selectively from `packages/core/src/index.ts`) — see §7.

## 6. Explicit Out-of-Scope

Restating §4's boundary as an unambiguous checklist. BR3 implementation
must **not** include any of the following:

- Any Git command that mutates refs, the index, the working tree,
  remotes, or configuration (§5's exhaustive list; restated in full in
  §5 of this section — see the "Read-only guarantee" table)
- Quality gate execution (`npm test`/`typecheck`/`build` as *BuildRail's
  own product*, i.e., `buildrail verify`) — BR4
- `verification-report.schema.json`-shaped evidence generation — BR4
- Binding a verification result to an exact candidate SHA — BR4
- Ahead/behind commit-count computation relative to upstream — explicitly
  excluded from BR3; see §9's "Ahead/behind: excluded" subsection
- Any `packages/skills/*/SKILL.md` becoming backed by real CLI behavior
  (BR5)
- Any `adapters/claude-code/` or `adapters/codex/` packaging/installation
  logic (BR6/BR7)
- Deciding whether a protected-path match is *permitted* — BR3 reports
  the match; BR2's policy layer (or a future phase building on it)
  decides what to do about it
- Any new `buildrail` CLI subcommand (§21) — this specification proposes
  none
- CI configuration, GitHub Actions, GitHub API integration, npm
  publishing, deployment automation, telemetry/analytics, any network
  call, arbitrary shell/subprocess execution beyond the specific,
  argv-array Git subcommands this document enumerates

## 7. Proposed Module Structure

```
packages/core/src/git/
├── index.ts              # public API surface (re-exports below)
├── errors.ts              # GitErrorCode, GitError, GitResult
├── types.ts                # HeadInfo, WorkingTreeStatus, DiffResult,
│                            # ProtectedPathMatch, and related shapes
├── internal/
│   └── exec.ts             # the one shared safe-exec helper; never
│                            # exported through index.ts or the public
│                            # barrel — reached only by other files in
│                            # this directory via relative import
├── repository.ts           # resolveRepository(projectRoot) — root
│                            # validation (§8)
├── head.ts                 # inspectHead(projectRoot) (§9, §10)
├── workingTree.ts           # inspectWorkingTree(projectRoot) (§11)
├── diff.ts                  # inspectDiff(projectRoot, request) (§13–§15)
└── protectedPaths.ts        # matchProtectedPaths(paths, systems) — pure,
                             # no Git/filesystem access (§12, §16)
```

This tree is illustrative for reviewers, not exhaustive or binding —
actual implementation may reasonably adjust file boundaries as long as
the I/O-vs-pure-logic separation this tree embodies is preserved
(`repository.ts`/`head.ts`/`workingTree.ts`/`diff.ts` do Git-process I/O
and output parsing; `protectedPaths.ts` is pure, no I/O — see §14's
rationale) and the public API surface in §7's `index.ts` (detailed in §7
below) is delivered.

`internal/exec.ts` is the **only** file in this module that spawns a
child process. Every other file in `packages/core/src/git/` calls through
it rather than invoking `node:child_process` directly — this keeps the
"no shell interpolation, argv-array only, deterministic flags" contract
(§19) enforced in exactly one place, not re-implemented per file.

## 7a. Public API

**BR3's public API is exactly the following, re-exported from
`packages/core/src/index.ts`. Nothing else from `packages/core/src/git/`
is public — in particular, `internal/exec.ts`'s helper and any
test-only seam are never re-exported, following BR2's established
`#internal/*`-for-tests-only, package-private-`imports`-field convention
(§3).**

```ts
// ---- repository.ts ----

interface RepositoryInfo {
  root: string;       // absolute, resolved path — the confirmed repository root
  gitDir: string;      // absolute, resolved path to the .git directory (or the
                        // resolved target of a .git *file*, for worktrees/submodules)
  isWorktree: boolean;  // true if this is a linked worktree (not the primary checkout)
}

function resolveRepository(projectRoot: string): Promise<GitResult<RepositoryInfo>>;

// ---- head.ts ----

interface HeadInfo {
  // Exactly one of these two is populated, per §9's branch/detached model:
  branch: string | null;         // current branch name, or null if detached
  detached: boolean;
  unborn: boolean;                 // true if HEAD points to a branch with no commits yet
  headSha: string | null;          // 40-hex-char commit SHA, or null if unborn
  upstream: UpstreamInfo | null;   // null if no upstream is configured
}

interface UpstreamInfo {
  remote: string;        // e.g. "origin"
  ref: string;             // e.g. "refs/remotes/origin/main"
  branch: string;           // e.g. "main" (the remote-side branch name)
  sha: string | null;       // the local remote-tracking ref's SHA — see §10.
                            // null only if the remote-tracking ref itself is
                            // missing locally (§9's "configured but absent" case)
}

function inspectHead(projectRoot: string): Promise<GitResult<HeadInfo>>;

// ---- workingTree.ts ----

type WorkingTreeEntryKind =
  | "staged_add" | "staged_modify" | "staged_delete" | "staged_rename" | "staged_type_change"
  | "unstaged_modify" | "unstaged_delete" | "unstaged_type_change"
  | "untracked"
  | "conflicted";

interface WorkingTreeEntry {
  kind: WorkingTreeEntryKind;
  path: string;              // repository-relative, normalized per §8's path rules
  oldPath?: string;            // present only for staged_rename
  similarity?: number;         // present only for staged_rename — see §14
  submodule?: SubmoduleState;  // present only if this path is a submodule (§11)
}

interface SubmoduleState {
  commitChanged: boolean;
  hasUntrackedContent: boolean;
  hasModifiedContent: boolean;
}

interface WorkingTreeStatus {
  clean: boolean;             // true iff `entries` is empty
  entries: WorkingTreeEntry[];
}

function inspectWorkingTree(projectRoot: string): Promise<GitResult<WorkingTreeStatus>>;

// ---- diff.ts ----

interface DiffRequest {
  fromRef: string;   // any ref/SHA Git itself can resolve (branch, tag, SHA, HEAD~N, etc.)
  toRef: string;      // same
}

type DiffChangeKind = "added" | "modified" | "deleted" | "renamed" | "type_changed";

interface DiffChange {
  kind: DiffChangeKind;
  path: string;             // repository-relative, normalized — the "new" path for
                             // renamed/modified/added; the (only) path for deleted
  oldPath?: string;           // present only for kind: "renamed"
  similarity?: number;         // present only for kind: "renamed" — see §14
}

interface DiffResult {
  fromSha: string;    // the resolved 40-hex-char commit SHA for fromRef
  toSha: string;       // the resolved 40-hex-char commit SHA for toRef
  changes: DiffChange[];
}

function inspectDiff(projectRoot: string, request: DiffRequest): Promise<GitResult<DiffResult>>;

// ---- protectedPaths.ts (PURE — no Git, no filesystem access) ----

interface ProtectedPathMatch {
  path: string;               // the input path that matched
  matchedVia: "path" | "oldPath"; // see §12's renamed-file handling
  system: ProtectedSystem;      // the full matched ProtectedSystem record
                                 // (ProtectedSystem/ProtectedSystemStatus already
                                 // exported from @buildrail/core by BR2 — §3)
}

function matchProtectedPaths(
  paths: string[],
  protectedSystems: ProtectedSystem[]
): ProtectedPathMatch[];
```

**Split rationale (per the task's explicit A/B/C separation requirement):**

- **(A) Git/process I/O:** `resolveRepository`, `inspectHead`,
  `inspectWorkingTree`, `inspectDiff` — each spawns Git subprocesses (via
  the shared internal `exec.ts` helper) and parses their machine-readable
  output.
- **(B) Parsing/normalization:** folded into the same four functions
  above rather than split into a separate public layer — BR3's Git
  output parsing is tightly coupled to *which* Git command produced it
  (porcelain v2 status lines vs. `diff --name-status -z` records vs.
  `for-each-ref` output), so a caller-facing "parse this raw Git output"
  function would have no meaningful standalone use; the parsing logic is
  private to each of the four I/O functions' own implementation
  (§7's module tree — one file per concern, parsing lives inside the
  file that owns the corresponding Git command).
- **(C) Pure protected-path matching:** `matchProtectedPaths` — takes
  already-known paths and already-loaded `ProtectedSystem[]` records; no
  Git access, no filesystem access, fully unit-testable with plain
  objects and arrays (§14, §20).

No test-only seam appears in this list — the internal exec helper and any
fixture-only internals are reached exactly as BR2 established: via a
`#internal/*` entry in `packages/core/package.json`'s `"imports"` field
if a genuine external-reachability concern exists (mirroring BR2's
`#internal/schema/registry.js` pattern for `createRegistryFromDir`), or,
where no such concern exists, by direct relative import from test files
physically inside `packages/core/tests/` (mirroring how `policy/index.ts`'s
`validateAuthorizationFields` is reached by `lifecycle/index.ts` without
a public barrel export). Implementation must choose per-case using the
same reasoning BR2's Round 2/3 corrections established: if a helper's
exact directory (fixture Git repo path, etc.) could plausibly be misused
by external code to redirect BR3 away from its documented root-validation
behavior, it must go behind `#internal/*`, not a bare relative import
alone.

## 8. Repository Root Semantics

**`projectRoot` is an exact, caller-supplied absolute directory path.
BR3 never walks up parent directories to discover a repository** —
mirroring BR2's own established `process.cwd()`-exact, no-parent-walking
convention for config/state loading (BR2 spec §17.0). Changing the
caller's own working directory has no bearing on what `projectRoot` BR3
operates against; the caller always supplies it explicitly.

`resolveRepository(projectRoot)` is the mandatory first step every other
BR3 function (`inspectHead`, `inspectWorkingTree`, `inspectDiff`) calls
internally before doing anything else — no other BR3 I/O function may
skip this validation.

**Validation algorithm:**

1. Confirm `projectRoot` exists and is a directory (`fs.stat` — no Git
   invocation needed yet). If not: `PROJECT_ROOT_NOT_FOUND`.
2. Confirm `<projectRoot>/.git` exists, as **either** a directory (the
   ordinary case) **or** a regular file (the linked-worktree / submodule
   case, where `.git` is a text file containing a `gitdir: <path>`
   pointer). If neither exists: `NOT_A_GIT_REPOSITORY`.
3. Run `git rev-parse --show-toplevel` with `cwd` set to exactly
   `projectRoot` (via the shared internal exec helper, §18). This is the
   authoritative check — step 2 is a fast pre-check, not a substitute for
   asking Git itself.
   - If the command fails because `projectRoot` is not inside any Git
     work tree at all: `NOT_A_GIT_REPOSITORY`.
   - If the command fails because the repository is **bare** (no working
     tree) — Git reports this as `--show-toplevel` returning an error in
     a bare repo run from inside `.git` itself, or, for a bare repo
     invoked from the bare directory, an explicit "this operation must be
     run in a work tree" style error — BR3 returns `BARE_REPOSITORY_UNSUPPORTED`
     (§8's "Bare repositories" decision below).
   - If the command succeeds, compare its stdout (the resolved toplevel
     path, normalized for trailing separators and symlink resolution via
     `fs.realpath` on both sides before comparison) against `projectRoot`
     (itself passed through `fs.realpath` first, so symlinked project
     roots compare correctly). If they **do not match**, `projectRoot` is
     a subdirectory of a real Git repository but is **not** that
     repository's root: `PROJECT_ROOT_MISMATCH`, with `details` naming
     the actual resolved toplevel BR3 found. BR3 never silently operates
     against the parent repository in this case.
4. If step 3 succeeds and the toplevel matches, run
   `git rev-parse --git-dir` (same `cwd`) to resolve the actual `.git`
   directory (this correctly resolves the `gitdir:` pointer for
   worktrees/submodules from step 2's file case). Resolve it to an
   absolute path relative to `projectRoot` if Git returns a relative one.
5. Determine `isWorktree`: true if the resolved `--git-dir` path is
   **not** a direct child of `projectRoot` named `.git` — i.e., it points
   somewhere under a different repository's `.git/worktrees/<name>`
   directory. (Ordinary repositories: `--git-dir` resolves to exactly
   `<projectRoot>/.git`; linked worktrees: it resolves elsewhere.)
6. If the Git executable itself cannot be located/spawned at any point
   in steps 3–4 (`ENOENT` from the underlying `child_process` call, or
   equivalent): `GIT_EXECUTABLE_UNAVAILABLE`. This is checked structurally
   by the shared exec helper (§18) and surfaces identically from every
   BR3 entry point, not just `resolveRepository`.

**Bare repositories: explicitly unsupported for BR3's initial scope.**
BR3's entire model (working-tree inspection, checking out-free diffing
against an implicit working tree context) assumes a working tree exists.
A bare repository has no working tree by definition. `BARE_REPOSITORY_UNSUPPORTED`
is a distinct, documented error code (§17) rather than a confusing
downstream failure from `inspectWorkingTree` (which would have nothing to
inspect). `resolveRepository` fails fast with this code before any other
BR3 function is called, rather than letting each function independently
discover the same problem in its own way.

**Linked worktrees are supported** — `resolveRepository`'s `isWorktree`
field lets a caller know it's operating against a worktree, but all other
BR3 operations (`inspectHead`, `inspectWorkingTree`, `inspectDiff`) work
identically against a worktree's own working tree and its own HEAD;
Git's own `--git-dir` resolution already handles the shared-object-store
plumbing transparently, so BR3 does not need special-case logic beyond
correctly reporting `isWorktree` for caller awareness.

## 9. Branch + HEAD Model

`inspectHead(projectRoot)` returns exactly one `HeadInfo` value covering
every case below — there is no separate function per case.

| Case | `branch` | `detached` | `unborn` | `headSha` | `upstream` |
|---|---|---|---|---|---|
| Normal branch, has commits | branch name | `false` | `false` | 40-hex SHA | per below |
| Detached HEAD (checked out to a SHA/tag directly) | `null` | `true` | `false` | 40-hex SHA | `null` (detached HEAD never has an upstream) |
| Unborn branch (fresh `git init`, zero commits) | branch name (the to-be-created branch, from `git symbolic-ref HEAD` — this resolves even with no commits) | `false` | `true` | `null` | `null` (no commit exists yet to have an upstream relationship against) |

**Determination method:** `git symbolic-ref -q HEAD` determines
branch-vs-detached (succeeds with the branch ref for a normal branch;
fails for detached HEAD — a non-zero exit here, distinct from an actual
error, is the detection signal for `detached: true`, not a `GIT_COMMAND_FAILED`
error). `git rev-parse HEAD` determines `unborn` vs. having a `headSha`
(fails with a specific, recognizable "unknown revision" message when
unborn — BR3 distinguishes this specific failure from a genuine
`GIT_COMMAND_FAILED`, per §17's expected-vs-exceptional distinction).

**Upstream determination — no network, ever:**

`upstream` is populated by asking Git for the branch's configured
upstream **and its already-fetched local remote-tracking ref**, never by
contacting the remote:

1. `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}` (run
   with `cwd` at `projectRoot`, current branch implied by HEAD) resolves
   the *configured* upstream identity (`remote`, `branch`) without
   needing the remote-tracking ref itself to exist. If this fails (exit
   code non-zero, specific "no upstream configured" message), `upstream`
   is `null` — **not** an error; this is the ordinary "no upstream" case.
2. If step 1 succeeds, BR3 has `remote`/`branch`/`ref` (the full
   `refs/remotes/<remote>/<branch>` form). BR3 then runs
   `git rev-parse <ref>` to read the **local, already-recorded**
   remote-tracking SHA.
   - If this succeeds: `sha` is populated with that SHA. **This is the
     entirety of what "remote SHA" means in BR3** — the SHA the local
     repository's remote-tracking ref already records, as of whenever it
     was last updated by an actual `git fetch` the *user* (not BR3) ran.
     BR3 never runs `git fetch` itself, under any circumstance.
   - If this fails (the upstream is *configured* in `.git/config` but the
     remote-tracking ref itself doesn't exist locally — e.g. the remote
     branch was deleted, or the user never actually fetched after
     configuring the upstream by hand), `sha` is `null` while `remote`/
     `branch`/`ref` remain populated — this is the explicit "configured
     but remote-tracking ref unavailable locally" case, distinct from "no
     upstream configured" (case 1's `null` `upstream` altogether).

**"Remote SHA" is therefore precisely and only: the SHA currently
recorded by the local remote-tracking ref for the current branch's
configured upstream, if any, as already present in the local repository —
never a live query to an actual remote server, never triggering a
fetch.** If a caller wants a truly up-to-date remote SHA, running
`git fetch` themselves (outside BR3, which never mutates anything) before
calling `inspectHead` is the only way to get one — this is stated
explicitly so no caller misreads `upstream.sha` as always-current.

**Ahead/behind: explicitly excluded from BR3.** Commit-count-based
ahead/behind reporting (`git rev-list --left-right --count`) is a
reasonable future addition, but it is not part of BR3's stated scope
(branch/HEAD/remote-tracking-SHA/working-tree/diff/protected-paths) and
has no clear consumer defined yet — BR4 (verification/evidence) or a
later phase are more natural owners if this is ever needed, once there's
an actual governance decision that depends on it. Adding it here would be
speculative scope. This is a **deferred item** (§26), not an oversight.

## 10. Upstream/Remote-Tracking Precision

(Restating and cross-referencing §9's upstream determination as its own
short section, since the task explicitly requires "remote SHA" to never
be used ambiguously.)

- **No upstream configured:** `upstream: null`. Not an error.
- **Upstream configured, remote-tracking ref present locally:**
  `upstream: { remote, ref, branch, sha: <40-hex SHA> }`.
- **Upstream configured, remote-tracking ref absent locally:**
  `upstream: { remote, ref, branch, sha: null }`.
- **Repository has no remotes at all:** indistinguishable, from BR3's
  point of view, from "no upstream configured" (case 1 above) — a branch
  cannot have a configured upstream if no remote exists to name. No
  separate error code is needed; `upstream: null` covers it.
- **HEAD is detached:** `upstream: null` unconditionally — detached HEAD
  has no branch, and only branches have configured upstreams.

BR3 never fetches. This is restated as a hard, testable requirement in
§20 ("no network operation" is a mandatory test case) and §6.

## 11. Working Tree Model

`inspectWorkingTree(projectRoot)` returns a `WorkingTreeStatus` with a
`clean: boolean` convenience flag (`true` iff `entries` is empty) and the
full `entries: WorkingTreeEntry[]` array — **never reduced to a single
boolean as the primary output**, per the task's explicit requirement,
since later governance phases need the richer per-path detail (e.g. to
implement `change_control.unexpected_deletion`/`unexpected_rename`
policy, which needs to know *which* path and *what kind* of change, not
merely "something changed").

**Determination method: `git status --porcelain=v2 -z`**, run with `cwd`
at `projectRoot`. Porcelain v2 (not v1) is chosen because it is Git's own
stable, unambiguous, machine-oriented status format — it distinguishes
staged vs. unstaged changes to the *same* path as two separate XY-style
status characters on one v2 record, natively reports renames with
similarity scores, natively reports submodule state, and, per §13's
requirement, correctly represents conflicted/unmerged paths without the
caller needing to hand-parse v1's more ambiguous single-character-pair
format.

**Per-entry mapping from porcelain v2 record types to `WorkingTreeEntryKind`:**

| Porcelain v2 record | `WorkingTreeEntryKind` |
|---|---|
| `1 A. ...` (ordinary changed entry, staged=Added, unstaged=unmodified) | `staged_add` |
| `1 M. ...` | `staged_modify` |
| `1 D. ...` | `staged_delete` |
| `1 T. ...` (staged) | `staged_type_change` |
| `1 .M ...` | `unstaged_modify` |
| `1 .D ...` | `unstaged_delete` |
| `1 .T ...` | `unstaged_type_change` |
| `2 R. ... <score> <path>\0<origPath>\0` (staged rename) | `staged_rename` (with `oldPath`, `similarity` from `<score>`) |
| `2 .R ...` (unstaged rename) — Git detects this far less reliably without an explicit stage; BR3 represents it as `unstaged_modify` on the new path plus reliance on `staged_rename`'s richer data when the rename *is* staged. Unstaged-only renames are rare in practice (Git's working-tree rename heuristics are opportunistic) and are intentionally not given their own `WorkingTreeEntryKind` value in this first BR3 iteration — flagged as a deferred refinement (§26), not a silent gap: the path still appears as `unstaged_delete` (old path) + `untracked`/`unstaged_modify` (new path) in the worst case, so no change is ever silently dropped, only under-classified. | — |
| `u <xy> ... <path>` (unmerged) | `conflicted` |
| `? <path>` | `untracked` |
| `1 ..` with a `S...` submodule marker in the XY field | (combined with the base kind above) `submodule` populated per §11's submodule handling |

**Same-path staged+unstaged case (explicit, per the task's requirement):**
porcelain v2's ordinary-changed-entry record type `1` carries **two**
status characters (X = staged, Y = unstaged) on **one** record for one
path. When both are non-`.` (e.g. `MM` — staged-modified AND
subsequently-unstaged-modified again), BR3 emits **two separate
`WorkingTreeEntry` objects for the same `path`** — one `staged_modify`,
one `unstaged_modify` — rather than inventing a combined
`staged_and_unstaged_modify` kind. This keeps `WorkingTreeEntryKind`'s
union small and each entry's meaning unambiguous; a caller checking "does
this path have any staged change" filters by `path` across the array,
which is simpler than reasoning about a combinatorial kind space.

**Deletion representation:** `staged_delete` / `unstaged_delete` —
explicit, dedicated kinds, never folded into a generic "modified." This
directly supports §15's requirement and the future
`change_control.unexpected_deletion` consumer.

**Rename representation (working tree, staged only):** `staged_rename`
carries `oldPath` and `similarity` (0–100, from porcelain v2's own score
field) — see §14 for the shared rename-representation contract with
`inspectDiff`.

**Submodule state:** porcelain v2's submodule marker (`S<c><m><u>` in the
XY-adjacent field) is decoded into `SubmoduleState { commitChanged,
hasUntrackedContent, hasModifiedContent }` and attached to the relevant
entry's `submodule` field. BR3 surfaces this because porcelain v2
provides it essentially for free (no extra command), but does **not**
recurse into the submodule itself — that would require a second,
separate `resolveRepository`/`inspectWorkingTree` call by the *caller*,
against the submodule's own path as a new `projectRoot`, which BR3's
existing API already supports without special-casing submodules further.

**Path normalization:** every `path`/`oldPath` in `WorkingTreeEntry` is
the repository-relative path exactly as Git reports it (already relative
to the repository root, already using `/` separators regardless of
platform, since Git internally always uses `/`), decoded from the `-z`
NUL-delimited output (§13) so paths containing spaces, tabs, quotes, or
unusual bytes are never corrupted or truncated. See §12 for how these
same normalized paths feed into protected-path matching.

## 12. Protected-System Matching — Path Normalization Rules

`matchProtectedPaths(paths, protectedSystems)` is pure (§7a, §16) and
receives already-normalized repository-relative paths (as produced by
`inspectWorkingTree`/`inspectDiff`, or supplied directly by a caller/test
with the same normalization already applied — the function does not
re-derive normalization from a live Git call, since it has none).

**Normalization contract, applied uniformly to both the input `paths`
and each `protectedSystems[].paths` glob pattern before matching:**

- **Separators:** `/` only. BR3 targets the paths Git itself already
  reports (`/`-separated, per §11), and its own glob patterns in
  `config.yml` are written by a human as `/`-separated (matching the
  `docs/PROTECTED_SYSTEMS.md` example, `src/auth/**`). No `\`-to-`/`
  conversion is performed — Windows-style separators in a declared
  pattern are a configuration authoring error, not something BR3 silently
  repairs; a pattern containing `\` simply will not match anything
  (documented, not treated as a distinct error code, since it's a
  config-authoring concern, not a BR3-runtime one).
- **Leading `./`:** stripped from both input paths and patterns before
  matching (`./src/foo.ts` normalizes to `src/foo.ts`) — Git itself never
  emits a leading `./`, but a hand-authored pattern in `config.yml` might.
- **Absolute paths:** an input path or pattern beginning with `/` is
  treated as **already repository-root-relative with a redundant leading
  slash**, and the leading `/` is stripped before matching (`/src/foo.ts`
  → `src/foo.ts`) — BR3 never interprets a leading `/` as "the OS
  filesystem root," since every input BR3 receives is, by construction,
  already scoped to one repository.
- **`..` (parent-directory traversal):** a normalized input path or
  pattern containing a literal `..` path segment is **rejected outright**
  as `INVALID_PATH_PATTERN` (protected-path patterns) — Git itself never
  emits a path containing `..` for a real repository-relative path, so an
  input path containing one indicates a caller bug, not a normalization
  case to silently resolve. This is a defense-in-depth measure: BR3 must
  never let a `..`-containing pattern be interpreted as "match paths
  outside the declared scope" via a naive glob engine that resolves it.
- **Case sensitivity:** matching is **case-sensitive**, unconditionally —
  Git repository paths are byte-sequences and are case-sensitive on the
  vast majority of real-world Git hosting/CI environments (Linux); making
  BR3's matching case-insensitive on some platforms and not others would
  make protected-path detection non-deterministic across environments,
  directly violating §19's determinism requirement. A pattern author on
  a case-insensitive local filesystem (macOS default, Windows) must still
  write patterns matching the actual, case-sensitive, committed path.
- **Dotfiles:** not special-cased. A pattern like `.buildrail/**` matches
  dotfile-prefixed paths exactly as any other segment would — BR3 does
  not adopt shell-glob's traditional "a leading dot must be matched
  explicitly" convention, since config-declared protected systems
  routinely need to protect dotfile-prefixed directories (e.g.
  `.buildrail/specs/**` protecting BuildRail's own specs) and requiring
  pattern authors to remember a shell-specific dotfile exception would be
  a footgun, not a safety feature.
- **Directory patterns / `**`:** `**` matches across path-segment
  boundaries (zero or more full segments); a single `*` matches within
  one segment only (never crosses a `/`). `src/auth/**` matches
  `src/auth/login.ts` and `src/auth/oauth/token.ts` alike. This is
  standard glob semantics (§13's chosen library, §13, implements exactly
  this).

**Duplicate matches / overlapping protected systems:** if one input path
matches patterns from **multiple** `ProtectedSystem` entries (e.g. an
overly-broad `**` system and a more specific nested system both declare
overlapping paths), `matchProtectedPaths` returns **one
`ProtectedPathMatch` per (path, system) pair** — i.e., a path matching
two systems produces two `ProtectedPathMatch` entries in the returned
array, one per system, never silently collapsed to "the most specific
match" or "the most restrictive status." **BR3 does not decide which
match "wins"** — that is a policy-layer decision (should the most
restrictive status apply? should all matched systems' rules apply
simultaneously?) squarely outside BR3's boundary (§4). BR3's job ends at
reporting every intersection completely and accurately.

**Renamed files — both sides checked, distinctly labeled:** for a
`DiffChange`/`WorkingTreeEntry` with `kind: "renamed"`/`staged_rename`,
`matchProtectedPaths` is expected to be called by the caller with
**both** `path` (new) and `oldPath` (old) included in its input `paths`
array (BR3's pure matcher itself has no special "this is a rename" case —
it just matches whatever paths it's given); the `matchedVia: "path" |
"oldPath"` field on `ProtectedPathMatch` exists so a caller who does
supply both can distinguish which side of a rename matched, since "a
protected system's content moved out of protection" (old path matches,
new path doesn't) and "previously-unprotected content moved into a
protected path" (new path matches, old path doesn't) are both real,
distinct, policy-relevant scenarios — reporting only one side would lose
information a future policy layer needs. **This is BR3's own
responsibility to document clearly to callers, since `matchProtectedPaths`
itself is rename-agnostic** — the caller (whichever future BR2-policy or
BR5-skill code eventually calls this) is responsible for constructing its
`paths` input to include both `path` and `oldPath` for any rename entries
it wants checked on both sides. This specification states the contract;
it does not implement the caller.

**Deleted paths:** matched the same as any other path — a deleted path
that matches a protected pattern is reported exactly like any other
match; whether "a protected file was deleted" is more or less concerning
than "a protected file was modified" is, again, a policy question outside
BR3's boundary. `matchProtectedPaths` has no `DiffChangeKind`/
`WorkingTreeEntryKind` awareness at all — it only ever sees plain path
strings.

**Untracked paths:** matched identically — an untracked path that happens
to fall under a protected glob is reported the same as any tracked
match. (Whether "a new untracked file appeared under a frozen system"
should be treated with the same severity as "an existing tracked file
under a frozen system was modified" is, once again, outside BR3's scope
to decide — BR3 supplies the fact.)

## 13. Machine-Readable Git Output & Diff Inspection

**No human-oriented Git output is ever parsed.** Every BR3 Git
invocation that could involve a path uses `-z` (NUL-delimited records)
specifically to avoid the ambiguity of newline-delimited output when
paths themselves could contain newlines, and to avoid any quoting/escaping
ambiguity for paths containing spaces, tabs, quote characters, or
non-ASCII/Unicode bytes (Git's default human-oriented path quoting —
octal-escaping "unusual" characters inside double quotes — is exactly the
kind of format this specification forbids parsing).

**`inspectDiff(projectRoot, request: DiffRequest)`:**

1. **Ref resolution, always first:** both `request.fromRef` and
   `request.toRef` are independently resolved via
   `git rev-parse --verify <ref>^{commit}` (the `^{commit}` suffix
   ensures the resolution fails cleanly for a ref that doesn't point at a
   commit, e.g. a blob SHA, rather than silently succeeding against the
   wrong object type). If either fails to resolve: `REF_NOT_FOUND`, with
   `details` naming which of the two refs failed. **This validation
   happens before any diff command runs at all** — per §19's requirement
   that caller-provided refs never become arbitrary Git options,
   resolving-and-verifying first means a malformed or hostile `fromRef`/
   `toRef` string is rejected by `rev-parse` itself (which treats its
   argument as a revision specifier, never as a flag, when passed via
   argv — see §19) before it could ever reach a `diff` invocation.
2. **Resolved SHAs are always returned** (`DiffResult.fromSha`/`toSha`) —
   a caller receives back exactly which commit each input ref resolved
   to, not merely the caller's own original ref strings echoed back. This
   matters because `fromRef`/`toRef` may be symbolic (branch names,
   `HEAD~3`, etc.) and BR4's eventual evidence-binding concern (explicitly
   out of BR3's scope, §23) will need the *exact* SHA, not a symbolic
   reference that could resolve differently later.
3. **The diff itself:**
   `git diff --no-color --no-ext-diff -z --name-status --find-renames=<threshold>
   <fromSha> <toSha>` (threshold per §14). `--name-status` (not the
   default patch format) gives exactly a status-letter-plus-path(s) record
   per changed file, `-z` NUL-delimits records and (for renames) the
   two-path pairs within a record.
4. **Status-letter mapping** (Git's `diff --name-status` letters) to
   `DiffChangeKind`:

   | Letter | `DiffChangeKind` |
   |---|---|
   | `A` | `added` |
   | `M` | `modified` |
   | `D` | `deleted` |
   | `R<score>` | `renamed` (with `oldPath`, `similarity` from `<score>`) |
   | `T` | `type_changed` (e.g. a regular file became a symlink) |
   | `C<score>` | not emitted — copy detection is explicitly **disabled**, see below |

**Copy detection: explicitly excluded.** `git diff` can additionally
detect copies (`--find-copies`) — a new file whose content closely
matches an *existing, unchanged* file elsewhere in the tree. BR3 does
**not** enable this (`--find-copies` is never passed). Rationale: copy
detection is substantially more expensive (it must compare against the
*entire* tree, not just other changed paths, unlike rename detection
which only compares among files that changed in this diff), and BR3 has
no stated consumer need for it — protected-path matching, deletion
detection, and rename detection (all explicitly in scope) are fully
served by `--find-renames` alone. An unrecognized copy is simply reported
as a plain `added` entry for the new path, which is a strictly correct
(if less rich) fact. This is a deliberate, justified exclusion, not an
oversight — flagged in §26 as available for reconsideration if a future
phase demonstrates real need.

**Relationship to working-tree inspection:** `inspectDiff` and
`inspectWorkingTree` are **independent, separately-callable functions**
— `inspectDiff` operates purely on two already-committed refs/SHAs and
never considers uncommitted working-tree state; `inspectWorkingTree`
operates purely on the current working tree/index and never considers
historical commits. A caller wanting "what would change if I committed
my current working-tree state" is not directly served by either function
alone in this first iteration — combining them is a caller-side
concern (call both, correlate paths), not something BR3 does implicitly.
This mirrors §4's boundary discipline: each BR3 function answers one
precise, narrow question.

## 14. Rename Detection

**Rename detection is enabled via `--find-renames=<threshold>`**, both
for `inspectDiff` (committed-diff renames, §13) and implicitly via
porcelain v2's own built-in rename detection for `inspectWorkingTree`'s
`staged_rename` case (§11) — porcelain v2 uses the same underlying
similarity-index algorithm as `diff --find-renames`, and its detection
threshold is controlled by the same `-M`/`--find-renames` mechanism when
passed to `git status`.

**Threshold: fixed at Git's own conventional default, 50% (`-M50%`),
exposed as a fixed value, not a caller-configurable parameter, in this
first BR3 iteration.** Rationale: making the threshold caller-configurable
adds a parameter to both `DiffRequest` and (implicitly)
`inspectWorkingTree`'s signature for a tuning knob with no identified
consumer need yet — BR3's stated scope requires rename detection to
exist and be deterministic, not to be tunable. A fixed, documented,
Git-conventional default keeps behavior predictable across every BR3
caller without forcing every caller to make a similarity-threshold
policy decision it likely has no informed basis for. If a genuine future
need for caller-configurable thresholds emerges, adding an optional
parameter to `DiffRequest` (defaulting to 50%) is a backward-compatible
addition, not a breaking change — flagged as a possible future extension
in §26, not designed in now.

**Representation:** `oldPath` (the pre-rename repository-relative path)
and `similarity` (0–100 integer, Git's own percentage score) on both
`DiffChange` (kind: `"renamed"`) and `WorkingTreeEntry`
(kind: `"staged_rename"`) — see §7a's type definitions.

**Below-threshold pairs remain delete+add — never forced into a
low-confidence rename.** If Git's own similarity index computes less
than 50% similarity between a deleted path and an added path, Git itself
does not report a rename for that pair (this is Git's own behavior, not
something BR3 additionally filters) — BR3 faithfully reports whatever
Git's `--find-renames=50%`/porcelain-v2-with-default-threshold actually
returns: a `deleted` entry for the old path and an `added` entry for the
new path, as two independent `DiffChange`/`WorkingTreeEntry` records,
with no attempt by BR3 to second-guess or re-correlate them into a
synthetic rename BR3's own logic invented. BR3 never runs its own
similarity heuristic in JavaScript — it relies entirely on Git's
already-correct, already-tested C implementation, invoked with an
explicit, documented threshold.

## 15. Deletion Detection

Deletion is represented **identically in shape, distinctly in origin**,
across both inspection surfaces:

- **Committed diff** (`inspectDiff`): `DiffChange { kind: "deleted", path }`
  — the file existed at `fromSha` and does not exist at `toSha`.
- **Working tree** (`inspectWorkingTree`): `WorkingTreeEntry { kind:
  "staged_delete" | "unstaged_delete", path }` — the file is tracked and
  has been deleted in the index (staged) and/or the working tree
  (unstaged), per §11's same-path-staged+unstaged-both-emitted rule.

Both forms carry a plain `path: string` — never a null/undefined content
field, never a diff hunk — which is exactly the minimal, unambiguous fact
`change_control.unexpected_deletion` policy (currently `stop`, per
`.buildrail/config.yml` — read, not modified, by this specification)
needs to consume: "this exact repository-relative path was deleted,
here (committed) or here (working tree)." How that policy actually reacts
(stop/allow/warn, per `config.schema.json`'s `changeAction` enum) remains
entirely BR2's/governance's concern — BR3 supplies the fact both ways,
with no favoring of one representation as "more authoritative" than the
other; they answer different questions ("what changed between two
commits" vs. "what's uncommitted right now") and a caller is expected to
choose the one relevant to its own question.

## 16. Glob Implementation Decision

**Chosen dependency: `picomatch`.**

- **Why a dependency, not a hand-rolled matcher:** the task requires
  supporting `**` (cross-segment wildcard), `*` (single-segment
  wildcard), directory-pattern semantics, and correct behavior across
  the full normalization matrix in §12 (leading `./`, absolute-path
  stripping, `..` rejection, case sensitivity, dotfiles). A correct glob
  engine covering all of this is a well-solved problem with mature,
  widely-used, well-tested implementations; hand-rolling one for BR3
  would risk exactly the kind of subtle, security-relevant matching bug
  (e.g. an `**` that accidentally also matches outside its intended
  scope, or a dotfile-exclusion default that silently makes
  `.buildrail/**` unmatchable) this specification's §12 goes to
  considerable length to rule out by explicit, deliberate design choice.
  A protected-path matcher is exactly the kind of component where "looks
  right in the common case, wrong in an edge case" is not acceptable.
- **Why not reuse Git's own pathspec matching (`git diff -- <pathspec>`/
  `git ls-files <pathspec>`) instead of a JS-side glob engine:** BR3's
  `matchProtectedPaths` (§7a) must work as a **pure function** against an
  arbitrary, caller-supplied list of paths that did not necessarily come
  from a live Git call in the same invocation — critically, §14/§20's
  test requirements need this function testable with plain fixture path
  arrays with zero filesystem/Git setup per test case. Routing matching
  through a live `git` subprocess call would violate §14's pure-function
  requirement entirely (every match would become I/O, need a real
  repository, and lose the "independently testable as pure logic"
  property the task explicitly mandates) and would make matching
  measurably slower for the common "many candidate paths against a modest
  number of protected-system patterns" case, since it would require a
  process spawn per match check (or an unwieldy batch-pathspec
  invocation) rather than a single in-process JS function call.
- **Why `picomatch` specifically over `minimatch` (the other common
  choice):** `picomatch` has zero runtime dependencies of its own (a
  direct continuation of BR2's established "minimize the dependency
  surface, prefer zero-transitive-dependency libraries" precedent —
  `yaml` was chosen in BR2 partly for having zero transitive
  dependencies), is widely used (it's the glob engine underneath
  `micromatch`, which many popular tools like `webpack`, `eslint`, and
  `browserify` depend on transitively), and its default matching
  semantics already align with §12's normalization decisions (POSIX-style
  `**`/`*` semantics, no implicit dotfile exclusion when configured with
  `{ dot: true }`, which BR3 sets explicitly per §12's "dotfiles: not
  special-cased" decision). `minimatch` is a reasonable alternative but
  has no advantage over `picomatch` for BR3's specific needs, and
  introducing it would mean pulling in a library with a design history
  more tied to `node-glob`'s specific historical conventions than to the
  simple string-against-pattern matching BR3 actually needs.
- **Exact supported semantics BR3 relies on:** `picomatch(pattern, {
  dot: true, nocase: false, windows: false })` per input pattern — `dot:
  true` disables the traditional shell-glob dotfile exclusion (§12),
  `nocase: false` enforces case-sensitive matching (§12), `windows:
  false` (the default; stated explicitly here for clarity) ensures `\`
  is never treated as an alternate path separator, consistent with §12's
  "separators: `/` only" decision. BR3 compiles each `ProtectedSystem`
  path pattern into a `picomatch` matcher function once (memoized per
  `matchProtectedPaths` call, or per `ProtectedSystem[]` array identity —
  implementation's choice, not a caller-visible contract) rather than
  recompiling per input path.
- **Dependency added:** `picomatch` (pin an exact caret-range version at
  implementation time, per BR2's established "record the exact resolved
  version in `package-lock.json` at implementation time, not hard-coded
  in the spec" convention). **This specification proposes this
  dependency; it does not install it** (§18).

## 17. Error Model

All BR3 errors are discriminated-union-style typed objects (not thrown
strings), following BR2's established `BuildRailError` base shape
(`code`, `message`, `path?`, `details?`) with a BR3-specific
`GitErrorCode` union:

```ts
type GitErrorCode =
  | "GIT_EXECUTABLE_UNAVAILABLE"
  | "PROJECT_ROOT_NOT_FOUND"
  | "NOT_A_GIT_REPOSITORY"
  | "PROJECT_ROOT_MISMATCH"
  | "BARE_REPOSITORY_UNSUPPORTED"
  | "HEAD_UNAVAILABLE"
  | "REF_NOT_FOUND"
  | "GIT_COMMAND_FAILED"
  | "MALFORMED_GIT_OUTPUT"
  | "INVALID_PATH_PATTERN";

interface GitError extends BuildRailError {
  code: GitErrorCode;
}

type GitResult<T> = { ok: true; value: T } | { ok: false; error: GitError };
```

| Code | Meaning | Expected vs. exceptional |
|---|---|---|
| `GIT_EXECUTABLE_UNAVAILABLE` | The `git` binary could not be spawned (`ENOENT` or equivalent from the underlying `child_process` call) | Expected — a real, anticipated environment condition (Git not installed / not on `PATH`); always a typed `GitResult` failure, never an uncaught exception |
| `PROJECT_ROOT_NOT_FOUND` | `projectRoot` does not exist or is not a directory | Expected |
| `NOT_A_GIT_REPOSITORY` | `projectRoot` (or any parent) is not inside a Git working tree, per `git rev-parse --show-toplevel`'s failure | Expected |
| `PROJECT_ROOT_MISMATCH` | `projectRoot` is inside a real Git repository, but is not that repository's root (§8 step 3) | Expected — `details` names the actual resolved toplevel |
| `BARE_REPOSITORY_UNSUPPORTED` | `projectRoot` resolves to a bare repository (§8) | Expected |
| `HEAD_UNAVAILABLE` | `rev-parse HEAD` fails for a reason other than "unborn branch" (e.g. a corrupted `.git` — genuinely unexpected repository damage) | Exceptional — this indicates repository corruption BR3 cannot meaningfully recover from; still returned as a typed `GitResult` failure (never a raw uncaught exception reaching a caller), but callers should treat it as unusual, not routine |
| `REF_NOT_FOUND` | Either `DiffRequest.fromRef` or `.toRef` failed to resolve via `rev-parse --verify <ref>^{commit}` (§13) | Expected — a caller can legitimately pass a ref that doesn't exist (e.g. a stale/mistyped SHA) |
| `GIT_COMMAND_FAILED` | A Git subprocess exited non-zero for a reason not covered by a more specific code above (i.e., the catch-all for a genuine, unanticipated Git failure) | Expected as a *result shape* (always returned via `GitResult`, never thrown), but the underlying cause is inherently open-ended — `details` carries the captured stderr for diagnosis |
| `MALFORMED_GIT_OUTPUT` | Git's own output did not match the expected machine-readable format this specification defines (e.g. an unrecognized porcelain v2 record type, an unparseable `--name-status` line) | Exceptional — this should be unreachable against a conforming Git version; exists so a genuinely unexpected format change fails loudly and specifically rather than silently misparsing |
| `INVALID_PATH_PATTERN` | A `..`-containing path or pattern reached `matchProtectedPaths` (§12) | Expected — this is a pure, synchronous, non-`Promise`-wrapped failure mode for `matchProtectedPaths` specifically (see below) |

**`matchProtectedPaths` is the one BR3 function that is fully
synchronous and pure (§7a) — it does not return a `Promise`, and its
error handling is correspondingly different from the five async,
I/O-performing functions above.** Rather than returning a `GitResult`
wrapper (which would suggest an I/O-shaped failure mode it doesn't have),
`matchProtectedPaths` **filters out** any input path or pattern
containing an `INVALID_PATH_PATTERN`-triggering `..` segment (§12),
excluding it from matching entirely, and separately exposes *which*
inputs were excluded via an optional second return channel:

```ts
interface ProtectedPathMatchResult {
  matches: ProtectedPathMatch[];
  invalidPaths: string[];      // input paths excluded for containing ".."
  invalidPatterns: string[];    // pattern strings excluded for containing ".."
}

function matchProtectedPaths(
  paths: string[],
  protectedSystems: ProtectedSystem[]
): ProtectedPathMatchResult;
```

(This supersedes the bare `ProtectedPathMatch[]`-returning signature
sketched in §7a's first draft of the function — the type shown here, with
`invalidPaths`/`invalidPatterns` reported explicitly rather than silently
dropped or thrown, is `matchProtectedPaths`'s actual, final, authoritative
signature. §7a's public API listing must be read together with this
correction — implementation follows this section's shape.)

Rationale: a pure function processing a batch of inputs, where some
subset might be malformed, is better served by "process what's valid,
report what wasn't" than by either (a) throwing on the first bad input
(which would make one malformed path in a large batch abort matching
for every other, valid path) or (b) silently dropping bad inputs with no
signal at all (which would hide a genuine caller bug). This mirrors BR2's
own established principle that thrown exceptions are reserved for
genuinely exceptional conditions, not routine per-item validation
outcomes within an otherwise-successful batch operation.

## 18. Process Execution Safety

**The single shared internal helper (`internal/exec.ts`, §7) is the only
code in `packages/core/src/git/` that invokes `node:child_process`.**

- **Primitive: `execFile` (promisified), never `spawn` directly, never
  `exec`.** `execFile` takes the command and its arguments as a separate
  `command: string, args: string[]` pair — never a single shell-interpreted
  command string — which structurally forbids shell interpolation: there
  is no shell in the invocation path at all (`execFile` does not spawn a
  shell intermediary the way `exec` does), so there is no injection
  surface via argument content, regardless of what a caller-supplied ref
  string contains.
- **`maxBuffer` override: `64 * 1024 * 1024` (64 MiB), explicitly set on
  every `execFile` call, not left at Node's undocumented-feeling 1 MiB
  default.** Rationale: `inspectDiff`'s `--name-status` output for a
  very large changeset (thousands of changed files) or `inspectWorkingTree`'s
  status output for a very large working-tree change could plausibly
  exceed the 1 MiB default, and Node's default failure mode for exceeding
  `maxBuffer` (throwing/an `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`-class
  error) is exactly the kind of `MALFORMED_GIT_OUTPUT`-shaped surprise
  this specification's error model must anticipate rather than let
  crash uncontrolled. 64 MiB is chosen as generous enough for any
  realistic repository's status/diff output while still being a hard,
  documented, finite bound — never `Infinity`/unbounded. If a real-world
  repository's output ever exceeds even this bound,
  `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` is caught and translated to
  `GIT_COMMAND_FAILED` (with `details` naming the buffer-overflow cause)
  rather than an uncaught exception reaching the caller.
- **`cwd` is always `projectRoot`** (the exact, already-validated
  directory from §8) — never a shell `cd` prefix, never a relative path
  resolved against the Node process's own `process.cwd()`. This is the
  "project root supplied through cwd / equivalent safe mechanism"
  requirement, satisfied directly by `execFile`'s own `cwd` option.
- **No command-string construction, ever, anywhere in `packages/core/src/git/`.**
  Every Git invocation is `execFile("git", [<literal subcommand>, <literal
  flags>, ...<validated arguments>], { cwd: projectRoot, ... })` — the
  argv array's structure (which positions are fixed literals vs. which
  carry caller-supplied values) is fully determined by BR3's own code,
  never assembled via string concatenation/interpolation/template
  literals that mix fixed flags and caller data into one string later
  split or passed to a shell.
- **Caller-provided refs never become arbitrary Git options:** because
  `execFile`'s argv entries are passed to the `git` process directly
  (never through a shell, and never re-parsed by Git as a single
  space-delimited string), a caller-supplied ref string like
  `--upload-pack=evil-command` passed as `request.fromRef` is received by
  Git as a single, literal revision-specifier argument — Git's own
  `rev-parse`/`diff` argument parsing does distinguish a leading `--` as
  a flag *within a single argv position*, which is why §13 step 1
  requires resolving-and-verifying every caller-supplied ref via
  `rev-parse --verify <ref>^{commit}` **before** that ref is used in any
  subsequent `diff` invocation — a string that `rev-parse --verify` does
  not resolve to a real commit object is rejected as `REF_NOT_FOUND`
  before it ever reaches `git diff`'s own argument parsing, closing off
  any possibility of a ref-shaped string being reinterpreted as a `git
  diff` flag downstream. (Using `--` as an explicit end-of-options
  separator before any caller-supplied ref, in every invocation that
  accepts one, is additionally required as defense in depth, even though
  the `rev-parse --verify` pre-check above is the primary safeguard.)
- **Deterministic failure handling:** every `execFile` call site (via the
  shared helper) distinguishes exactly three outcomes: (1) success (exit
  0, expected output shape) → parsed and returned as `GitResult`
  success; (2) a specific, anticipated non-zero exit this specification
  names (e.g. `rev-parse HEAD` failing because the branch is unborn) →
  translated to the specific corresponding `GitErrorCode`; (3) any other
  non-zero exit, or a `child_process` error (`ENOENT`, `maxBuffer`
  overflow, etc.) not covered by (1)/(2) → `GIT_COMMAND_FAILED` (or
  `GIT_EXECUTABLE_UNAVAILABLE` specifically for `ENOENT`). No fourth,
  silent "swallow the error" path exists anywhere.

## 19. Determinism

Every `execFile` invocation (via the shared internal helper, §18)
includes, unconditionally:

- **`env` override**, not the inherited `process.env` verbatim:
  `{ ...process.env, LC_ALL: "C", LANG: "C", GIT_PAGER: "cat",
  GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1" }` (the last —
  `GIT_CONFIG_NOSYSTEM`, not strictly required for output-format
  determinism but included since it prevents an unusual machine-wide
  system-level Git config from silently altering behavior in a way this
  specification cannot anticipate; `~/.gitconfig`-level `[user]`-style
  config is left alone, since it does not affect any of BR3's read-only
  output formats). `LC_ALL`/`LANG: "C"` forces the POSIX/C locale,
  eliminating any locale-dependent formatting from ever appearing in
  output BR3 parses (this matters even for machine-readable formats,
  since some diagnostic/error text Git emits on `stderr` is
  locale-sensitive, and BR3's `GitError.details` may surface that text).
- **`--no-pager`** (or, for commands where the subcommand itself doesn't
  accept it directly, the `GIT_PAGER=cat` env override above, which
  applies universally) — BR3 never allows Git to invoke an interactive
  pager, since `execFile` has no attached TTY for one to interact with
  anyway, but explicit suppression avoids any possibility of a hang.
- **`--no-color`** where the invoked subcommand supports it (`git diff
  --no-color ...`, §13) — BR3 never parses colorized/ANSI-escaped
  output.
- **`--no-ext-diff`** (`git diff`, §13) — refuses to honor a user's
  locally-configured external diff driver, which could otherwise alter
  `git diff`'s invoked *tool* entirely (though not `--name-status`'s own
  output format, this is included as defense-in-depth against unusual
  local configuration).
- **No reliance on Git aliases:** every BR3 Git invocation uses a
  first-argument literal plumbing/porcelain subcommand name
  (`status`, `diff`, `rev-parse`, `symbolic-ref`) that ships with Git
  itself — never a user-configurable alias name — so a local
  `~/.gitconfig`'s `[alias]` section can never redirect a BR3 invocation
  to different, unexpected behavior.
- **`GIT_TERMINAL_PROMPT=0`:** ensures Git never attempts an interactive
  credential/host-key prompt, which is doubly redundant with §6's "no
  network access" guarantee (none of BR3's commands ever contact a
  remote in the first place) but included as defense-in-depth in case a
  future maintenance change accidentally introduces a command that could
  trigger one.

These are applied identically by the one shared `internal/exec.ts`
helper (§7, §18) — not re-specified per call site, so there is exactly
one place in the codebase where this determinism contract could
regress, and exactly one place a reviewer needs to check to confirm it's
honored everywhere.

## 20. Test Plan

`node:test` + `node:assert/strict`, matching BR1/BR2's established
convention. Tests live under `packages/core/tests/`, alongside BR2's
existing suites.

**Real, ephemeral, temporary Git repositories are mandatory for every
test that exercises actual Git behavior** — created via a shared test
helper (e.g. `packages/core/tests/helpers/git-fixture.ts`, following
BR2's `state-fixture.ts` naming convention) that creates a fresh
directory under the OS temp directory (`node:os`'s `tmpdir()`), runs
`git init` (with a fixed, deterministic `user.name`/`user.email`
local-config override so commits succeed in any CI environment without
relying on a global Git identity being configured), populates it with
whatever files/commits/branches/remotes the specific test needs, and
tears it down (`fs.rm(..., { recursive: true })`) after the test —
**never** a mocked/stubbed Git command output string. This directly
verifies the actual behavior BR3 exists to provide, not a hand-written
approximation of what Git output "should" look like.

Minimum required test categories (each bullet is a required test case):

**Repository root (§8)**
- Valid repository root resolves successfully
- Non-Git directory → `NOT_A_GIT_REPOSITORY`
- Directory that is a subdirectory of a real Git repository, but not its
  root → `PROJECT_ROOT_MISMATCH`, with `details` naming the actual
  toplevel
- Bare repository → `BARE_REPOSITORY_UNSUPPORTED`
- Linked worktree → succeeds, `isWorktree: true`
- `.git` as a file (worktree/submodule shape) → succeeds, `.git`-dir
  correctly resolved via the pointer
- Nonexistent `projectRoot` path → `PROJECT_ROOT_NOT_FOUND`

**Branch + HEAD (§9, §10)**
- Normal branch with commits → correct `branch`, `headSha`, `detached: false`, `unborn: false`
- Detached HEAD (checked out to a SHA) → `branch: null`, `detached: true`, correct `headSha`
- Unborn branch (fresh `git init`, zero commits) → `unborn: true`, `headSha: null`, correct pending `branch` name
- No upstream configured → `upstream: null`
- Upstream configured with a real local remote-tracking ref present
  (e.g. `git remote add`, `git fetch` against a local bare repository
  used purely as an in-test fixture "remote," or an equivalent local
  setup — never a real network fetch) → correct `remote`/`branch`/`ref`/`sha`
- Upstream configured, remote-tracking ref absent locally → `sha: null`,
  other fields populated
- No network operation occurs during any BR3 test (asserted structurally,
  e.g. by running in an environment with no network access, or by
  confirming no test ever configures a real, reachable remote URL)

**Working tree (§11)**
- Clean repository → `clean: true`, `entries: []`
- Staged modification only
- Unstaged modification only
- Staged **and** unstaged modification to the **same** path → two
  separate entries, `staged_modify` + `unstaged_modify`, same `path`
- Added (staged new file)
- Deleted (staged and, separately, unstaged)
- Renamed (staged, above the 50% threshold) → `staged_rename` with
  correct `oldPath`/`similarity`
- Renamed below the 50% threshold → represented as separate delete + add,
  never forced into a synthetic rename
- Untracked file
- Conflicted/unmerged path (constructed via a real merge conflict in the
  fixture repository)
- Filename containing spaces
- Filename containing Unicode characters
- Filename containing other unusual-but-Git-legal characters (e.g. a
  literal `"` or tab byte) — confirmed correctly decoded via `-z` output,
  never corrupted/truncated

**Diff inspection (§13, §14, §15)**
- Two valid refs/SHAs → correct `fromSha`/`toSha` and changed-path list
- Added / modified / deleted / renamed (above threshold) / type-changed
  classification, each as its own test
- Rename below threshold → delete + add, not a rename
- Nonexistent ref → `REF_NOT_FOUND`
- A ref string shaped like a Git option (e.g. `--upload-pack=x`) passed
  as `fromRef`/`toRef` → rejected as `REF_NOT_FOUND` (not interpreted as
  a flag) — the explicit command-injection-shaped regression test
- Copy detection is confirmed **disabled**: a new file with content
  closely matching an existing, unrelated, unchanged file is reported as
  a plain `added` entry, never a `copied`-shaped result (since no such
  `DiffChangeKind` value exists at all — confirmed by type-level
  exhaustiveness plus a runtime fixture)

**Protected-path matching (§12, §16) — pure, no Git/filesystem fixture needed**
- `OPEN` system match reported
- `GUARDED` system match reported
- `FROZEN` system match reported
- `LOCKED` system match reported
- Overlapping protected systems (one path matches two `ProtectedSystem`
  entries) → two separate `ProtectedPathMatch` entries, one per system
- A path that matches no protected system → absent from `matches`
- Renamed-path protection on the **old** side only (`oldPath` matches,
  `path` doesn't) → `matchedVia: "oldPath"` present, no `"path"` match
  for that pair
- Renamed-path protection on the **new** side only → `matchedVia: "path"`
- A path or pattern containing `..` → excluded, reported in
  `invalidPaths`/`invalidPatterns`, never silently matched, never thrown
- Leading `./`, absolute-leading-`/`, dotfile paths, `**` cross-segment
  matching — each a dedicated case exercising §12's normalization rules
- `matchProtectedPaths` is confirmed **pure**: calling it twice with the
  same (deep-equal, but not reference-equal) inputs produces deep-equal
  outputs, and neither input array/object is mutated (snapshot-before/
  assert-unchanged-after, mirroring BR2's established purity-test
  pattern)

**Process/command safety (§18, §19)**
- No BR3 test, across the entire suite, ever leaves a fixture repository
  in a state showing evidence of a mutating command having run beyond
  what the test itself explicitly set up via direct `git` calls in the
  test's own setup code (i.e., BR3's own functions never call a
  mutating command) — asserted by confirming `inspectHead`/
  `inspectWorkingTree`/`inspectDiff`/`resolveRepository`, called
  repeatedly against the same fixture, always return the same result
  (no side effect occurred)
- `GIT_EXECUTABLE_UNAVAILABLE` is reachable and correctly typed (e.g. by
  temporarily manipulating `PATH` in the test's own subprocess
  environment so `git` cannot be found — not by uninstalling Git from
  the actual test-runner environment)

## 21. CLI Boundary

**BR3 adds no new `buildrail` CLI command and changes no existing CLI
command's output.** BR3 is a `@buildrail/core` library addition only —
consistent with the established pattern that library capability and CLI
wiring are separate, explicitly-authorized decisions (BR2 itself was
implemented as a library first; wiring it into `buildrail status` was
one specific, deliberate part of BR2's own scope, not an automatic
consequence of the library existing).

No future phase's CLI needs are assumed or designed for here. In
particular, this specification does **not** invent `buildrail verify` —
that command, if and when it exists, belongs to BR4, under its own
future specification.

If a future phase (BR4 or later) determines that surfacing BR3 facts
through `buildrail status` or a new command is valuable, that is an
explicit, separate specification decision for that phase to make — not
an implicit consequence of BR3 merely existing.

## 22. Dependency Policy

**One new runtime dependency is proposed: `picomatch`** (§16), justified
above. No other new runtime or development dependency is proposed.
`@types/node` (already a `devDependency`) already covers
`node:child_process`'s TypeScript types — no separate `@types/*` package
is needed for `execFile`.

**This specification proposes this dependency. It does not install it.**
`npm install` for `picomatch` occurs only once BR3 implementation is
separately authorized, exactly mirroring BR2's own "§20.3: No
dependencies are installed by this specification" precedent.

## 23. Out-of-Scope / Phase Boundary (BR4)

Restating §4/§6 as an explicit BR4 hand-off list, since the task calls
this out specifically:

- **Executing quality gates** (`npm test`/`typecheck`/`build`/`lint` as
  *BuildRail's own governed product*) — BR4's `buildrail verify` (or
  whatever BR4's specification eventually names it)
- **`verification-report.schema.json`-shaped evidence generation** — BR4
- **Binding a verification/evidence result to an exact candidate SHA** —
  BR4. BR3's `inspectDiff` *does* return resolved commit SHAs (§13) as a
  deterministic fact, but BR3 has no concept of "this SHA is the approved
  candidate for phase X" — that binding is BR2's `state.yml`/`candidate`
  model (already real) combined with BR4's future verification-evidence
  model, neither of which BR3 touches or extends.
- **Pass/fail evidence records** — BR4
- Everything else already listed in §6

## 24. Runtime Compatibility

**Minimum supported Node version: Node.js `>=22`, unchanged from
BR1/BR2.** This specification does not reduce, raise, or otherwise alter
that baseline. No new `packages/core/package.json` `engines` field
change is proposed — it already declares `>=22` (§3).

`node:child_process`'s promisified `execFile` (via `node:util`'s
`promisify`, or the `node:child_process/promises`-style API if available
and stable at implementation time — implementation's choice, not a
caller-visible contract) is available throughout Node's `>=22` baseline;
no additional runtime capability beyond what BR2 already assumes is
required.

## 25. Quality Gates

BR3 implementation completion requires actual, passing results for the
same three gates BR2 established, extended to cover BR3's new code:

- `npm test` — BR3's new test suite passes alongside BR1's and BR2's
  existing suites (all three must pass; BR3 does not replace or weaken
  either)
- `npm run typecheck` — extended to cover BR3's new files (already
  included automatically, since `packages/core/tsconfig.json` already
  covers all of `packages/core/src/**`)
- `npm run build` — extended to cover BR3's new files (same automatic
  inclusion)

No change to the root-level script structure BR2 established (`build`/
`typecheck`/`test` already correctly order `@buildrail/core` before
`@buildrail/cli`, §20.5 of the BR2 specification) — BR3 adds files to an
already-correctly-wired package, it does not change the wiring itself.

`npm run lint` remains `NOT CONFIGURED` unless separately authorized —
BR3 does not introduce lint tooling.

## 26. Deferred Items

1. **Ahead/behind commit counts.** Explicitly excluded from BR3 (§9) —
   no stated consumer, no clear owner yet. A future phase (most likely
   BR4, or a later governance refinement) may add this as a new function
   or an extension to `HeadInfo`, at which point that phase's own
   specification defines the exact contract.
2. **Unstaged-only rename detection.** Porcelain v2's `2 .R` record type
   (§11) is intentionally under-classified in this first BR3 iteration —
   represented as separate delete/add-shaped entries rather than a
   dedicated `unstaged_rename` kind. No information is silently lost (the
   underlying delete and add/modify are both still reported), but the
   rename *relationship* between them is not surfaced for the
   unstaged-only case. A future refinement could add this, following the
   same `oldPath`/`similarity` shape already established for
   `staged_rename`.
3. **Caller-configurable rename-detection threshold.** Fixed at 50%
   (§14) for this iteration; a future phase could add an optional
   parameter to `DiffRequest` (and an equivalent for
   `inspectWorkingTree`) if a genuine need for a different threshold is
   identified.
4. **Copy detection.** Explicitly disabled (§13) for cost and
   no-identified-need reasons; `--find-copies` could be added as an
   opt-in future extension.
5. **Submodule recursion.** BR3 surfaces top-level submodule *state*
   (§11) but does not recurse into a submodule's own repository
   automatically — a caller wanting that already has the tools to do it
   themselves (call `resolveRepository`/etc. again with the submodule's
   path as a new `projectRoot`), but BR3 does not automate the
   recursion.
6. **Consumption of BR3 facts by BR2's policy layer or `docs/STATE_MACHINE.md`'s
   `PREFLIGHT` "protected-system awareness" check.** BR3 supplies the
   facts (`matchProtectedPaths`'s output); actually wiring that into a
   lifecycle-gating decision (e.g. `applyTransition`'s composition logic
   consulting BR3 before permitting `AUTHORIZED → PREFLIGHT`) is not part
   of this specification and is not assumed to be BR3's, BR4's, or any
   other specific future phase's responsibility yet — it is an open
   design question for whichever future specification actually proposes
   that wiring.
7. **CLI surfacing of any BR3 fact.** Explicitly deferred to whichever
   future phase (most likely BR4, alongside `buildrail verify`) decides
   it needs to show Git facts to a human via the CLI — see §21.

## 27. Independent Review Requirements

Mirroring BR0/BR1/BR2's established review discipline:

```
Implementation Agent
        ↓
Completion report with exact candidate SHA
        ↓
Independent review at that exact candidate SHA
        ↓
Corrections if necessary (return to implementation)
        ↓
Human authorization (merge/freeze decisions remain human-only)
```

The independent reviewer must specifically examine, for BR3:

- Whether every Git subprocess invocation genuinely uses `execFile` with
  an argv array — never a shell, never string concatenation — and
  whether the determinism env/flags (§19) are applied at exactly one
  shared call site, not duplicated (and potentially inconsistently
  applied) per file
- Whether a ref string shaped like a Git command-line option (e.g.
  `--upload-pack=...`) passed as `DiffRequest.fromRef`/`.toRef` is
  genuinely rejected as `REF_NOT_FOUND` before ever reaching a `diff`
  invocation — not merely documented as rejected
- Whether `resolveRepository`'s toplevel-mismatch check (§8) actually
  distinguishes "not a repository at all" from "inside a repository but
  not its root," with a real fixture directory structure proving the
  distinction, not merely a single collapsed test
- Whether zero Git mutation occurs anywhere in BR3's implementation —
  confirmed by literally searching the implementation for every
  Git-subcommand string used, and cross-checking each one against the
  explicit read-only allowlist implied by §5's Scope and §6's Out-of-Scope
  (i.e., `status`, `diff`, `rev-parse`, `symbolic-ref`, and no others)
- Whether `matchProtectedPaths` is genuinely pure — no Git access, no
  filesystem access, confirmed by a test asserting identical output for
  identical (deep-equal) input across repeated calls, and by static
  inspection of `protectedPaths.ts`'s imports (it must not import
  anything from `internal/exec.ts` or any Node `fs`/`child_process`
  module)
- Whether the `..`-rejection in `matchProtectedPaths` (§12, §17) is
  reachable and correctly reported via `invalidPaths`/`invalidPatterns`,
  not silently matched and not thrown
- Whether copy detection is genuinely disabled (`--find-copies` never
  passed) — confirmed by a fixture proving a copy-shaped change is
  reported as a plain `added` entry, not by reading the specification's
  claim
- Whether the rename-detection threshold (§14) is exactly 50%,
  consistently applied to both `inspectDiff` and `inspectWorkingTree`'s
  rename detection, and whether a below-threshold pair is genuinely
  reported as delete+add rather than a synthetic rename
- Whether `-z`/NUL-delimited output parsing correctly handles a filename
  containing a space, a Unicode character, and at least one other
  unusual-but-legal byte sequence, proven by real fixture files with
  those exact names — not merely asserted
- Whether the working-tree same-path-staged+unstaged case (§11) is
  genuinely represented as two separate entries, proven by a real fixture
  exercising it
- Whether `inspectHead`'s "remote SHA" is genuinely never derived from a
  network call — proven by running the full BR3 test suite with network
  access disabled (or an equivalent structural check) and confirming
  every upstream-SHA test still passes using only already-local
  remote-tracking refs
- Whether exactly the dependency proposed in §16/§22 (`picomatch`, and
  no other) was added
- Whether `git status --porcelain=v2 -z` and `git diff --name-status -z`
  (with the exact flags §13/§19 specify) are the actual commands
  invoked — not `--porcelain` (v1) or a patch-format diff requiring
  hunk-parsing
- Whether BR3 adds no new CLI command and does not modify
  `packages/cli/src/commands/status.ts` or any other existing CLI
  command's behavior (§21)
- Whether any of §6's out-of-scope items leaked into the implementation
- Whether test evidence is real (tests actually run against real,
  ephemeral, temporary Git repositories — not mocked Git command output)

This document does not itself authorize BR3 implementation — see §1.
