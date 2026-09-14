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
   — `matchProtectedPaths(inputs, protectedSystems)`, a **pure function**
   with no Git or filesystem access, matching a caller-supplied list of
   `ProtectedPathCheckInput` entries against already-loaded
   `ProtectedSystem[]` declarations (§7a, §12, §16).
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
└── protectedPaths.ts        # matchProtectedPaths(inputs, systems) — pure,
                             # no Git/filesystem access (§7a, §12, §16)
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
  root: string;           // absolute, resolved path — the confirmed repository root
  gitDir: string;          // absolute, resolved --git-dir (per-checkout Git directory;
                            // resolved target of a .git *file* for worktrees/submodules)
  gitCommonDir: string;     // absolute, resolved --git-common-dir (the shared/common Git
                            // directory — identical to gitDir except for a linked
                            // worktree, where it points at the primary checkout's own
                            // .git; see §8's isWorktree derivation)
  isWorktree: boolean;      // gitDir !== gitCommonDir — true only for a linked worktree,
                            // never true for an ordinary repository or a submodule
                            // checkout (both have gitDir === gitCommonDir) — see §8
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
// This is the one, final, authoritative signature — corrects Round 1
// review finding #4, which found this function defined with two
// different, contradictory signatures (an earlier draft here, and a
// second one later in §17). Only this definition exists now; see §17
// for the error-code implication.

interface ProtectedPathCheckInput {
  path: string;                             // repository-relative
  origin: "current" | "old_side_of_rename"; // see §12's renamed-file handling —
                                              // this field is what lets matchedVia
                                              // be *derived*, not guessed, since a
                                              // flat string[] cannot itself carry
                                              // this provenance
}

interface ProtectedPathMatch {
  path: string;                    // the input's own `path` field, echoed back
  matchedVia: "path" | "oldPath";   // derived directly from the matching input's
                                     // `origin`: "current" -> "path",
                                     // "old_side_of_rename" -> "oldPath" — never
                                     // inferred or guessed by matchProtectedPaths
  system: ProtectedSystem;           // the full matched ProtectedSystem record
                                      // (ProtectedSystem/ProtectedSystemStatus already
                                      // exported from @buildrail/core by BR2 — §3)
}

interface ProtectedPathMatchResult {
  matches: ProtectedPathMatch[];
  invalidInputs: ProtectedPathCheckInput[]; // inputs excluded for containing ".."
  invalidPatterns: string[];                 // declared ProtectedSystem path patterns
                                               // excluded for containing ".."
}

function matchProtectedPaths(
  inputs: ProtectedPathCheckInput[],
  protectedSystems: ProtectedSystem[]
): ProtectedPathMatchResult;
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

**Validation algorithm (revised — corrects Round 1 review finding #1):**
verified against real bare/worktree/submodule repositories before being
written here (commands run against scratch fixtures during this
correction round; exact output quoted below each step).

1. Confirm `projectRoot` exists and is a directory (`fs.stat` — no Git
   invocation needed yet). If not: `PROJECT_ROOT_NOT_FOUND`.
2. Confirm `<projectRoot>/.git` exists, as **either** a directory (the
   ordinary case) **or** a regular file (the linked-worktree / submodule
   case, where `.git` is a text file containing a `gitdir: <path>`
   pointer). If neither exists: `NOT_A_GIT_REPOSITORY`. This remains a
   fast pre-check only — every subsequent step re-derives the same facts
   from Git itself, so this step can never be the sole source of a
   BR3 conclusion.
3. **Bare-repository check FIRST, before anything that assumes a working
   tree:** run `git rev-parse --is-bare-repository` with `cwd` set to
   exactly `projectRoot`. This prints exactly `true` or `false` on stdout
   — an unambiguous, machine-readable fact requiring no error-path
   inference. Verified:
   ```
   $ git rev-parse --is-bare-repository   # run inside a real bare repo
   true
   $ git rev-parse --is-bare-repository   # run inside a real non-bare repo
   false
   ```
   If the command itself fails to run at all (not inside any Git
   repository): `NOT_A_GIT_REPOSITORY`. If it succeeds and prints `true`:
   `BARE_REPOSITORY_UNSUPPORTED` immediately (§8's "Bare repositories"
   decision below) — no further step runs, since every remaining step
   assumes a working tree a bare repository does not have. This
   **replaces** the previous design, which tried to infer "bare" from
   `--show-toplevel`'s *failure* — verified that a bare repository's
   `--show-toplevel` does fail (`fatal: this operation must be run in a
   work tree`, exit 128), but that failure is indistinguishable, by exit
   code alone, from "not a Git repository at all" without a further,
   separate, fragile error-text check. `--is-bare-repository` avoids that
   ambiguity entirely by asking Git the direct question.
4. If step 3 reports `false` (has a working tree), run
   `git rev-parse --show-toplevel` (same `cwd`).
   - If this fails: `NOT_A_GIT_REPOSITORY` (this should not be reachable
     if step 2's precheck passed and step 3 succeeded, but is retained as
     a defensive, correctly-typed fallback for an edge case neither step
     anticipates).
   - If it succeeds, compare its stdout (the resolved toplevel path,
     normalized for trailing separators and symlink resolution via
     `fs.realpath` on both sides before comparison) against `projectRoot`
     (itself passed through `fs.realpath` first, so symlinked project
     roots compare correctly). If they **do not match**, `projectRoot` is
     a subdirectory of a real Git repository but is **not** that
     repository's root: `PROJECT_ROOT_MISMATCH`, with `details` naming
     the actual resolved toplevel BR3 found. BR3 never silently operates
     against the parent repository in this case.
5. Run `git rev-parse --git-dir` and `git rev-parse --git-common-dir`
   (same `cwd`) to resolve both the per-checkout and the shared/common
   Git directory (this correctly resolves the `gitdir:` pointer for
   worktrees/submodules from step 2's file case). Resolve each to an
   absolute path relative to `projectRoot` if Git returns a relative one.
6. **Determine `isWorktree` by comparing `--git-dir` against
   `--git-common-dir` — corrects Round 1 review finding #1's submodule
   misclassification.** Verified directly against real fixtures:
   ```
   # ordinary repository
   --git-dir:        .git
   --git-common-dir: .git                    # IDENTICAL

   # linked worktree (git worktree add)
   --git-dir:        <primary>/.git/worktrees/<name>
   --git-common-dir: <primary>/.git           # DIFFERENT

   # submodule checkout (git submodule add)
   --git-dir:        <superproject>/.git/modules/<name>
   --git-common-dir: <superproject>/.git/modules/<name>   # IDENTICAL
   ```
   An ordinary repository and a submodule checkout both have `--git-dir
   === --git-common-dir` (a submodule's own `.git` file points at a
   dedicated, self-contained directory under the superproject's
   `.git/modules/`, which is that submodule's *own* complete Git
   directory — not a "shared with the primary checkout, this-one-is-a-
   worktree" relationship at all). A linked worktree is the **only** of
   the three shapes where `--git-dir` and `--git-common-dir` diverge,
   because a worktree deliberately shares one common object store
   (`--git-common-dir`, pointing at the primary checkout) while having
   its own per-worktree HEAD/index/refs directory (`--git-dir`). BR3
   therefore sets `isWorktree: (gitDir !== gitCommonDir)` — this is
   suffient on its own; no additional signal (such as
   `--show-superproject-working-tree`) is needed to distinguish these
   three cases, since a submodule and an ordinary repository already
   share the "identical" bucket and correctly both report
   `isWorktree: false`.
7. If the Git executable itself cannot be located/spawned at any point
   in steps 3–6 (`ENOENT` from the underlying `child_process` call, or
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

**Submodule checkouts are supported and correctly distinguished from
worktrees** — a submodule checkout's `.git` file (pointing into
`<superproject>/.git/modules/<name>`) is superficially similar to a
worktree's `.git` file (pointing into `<primary>/.git/worktrees/<name>`),
but step 6's `--git-dir`-vs-`--git-common-dir` comparison correctly
reports `isWorktree: false` for a submodule, since a submodule has no
common/shared object store relationship with any other checkout — it is,
from Git's own perspective, simply an independent repository that
happens to be nested inside another one's working tree.

## 9. Branch + HEAD Model

`inspectHead(projectRoot)` returns exactly one `HeadInfo` value covering
every case below — there is no separate function per case.

| Case | `branch` | `detached` | `unborn` | `headSha` | `upstream` |
|---|---|---|---|---|---|
| Normal branch, has commits | branch name | `false` | `false` | 40-hex SHA | per below |
| Detached HEAD (checked out to a SHA/tag directly) | `null` | `true` | `false` | 40-hex SHA | `null` (detached HEAD never has an upstream) |
| Unborn branch (fresh `git init`, zero commits) | branch name (the to-be-created branch, from `git symbolic-ref HEAD` — this resolves even with no commits) | `false` | `true` | `null` | `null` (no commit exists yet to have an upstream relationship against) |

**Determination method — exit codes and machine-readable facts only,
never stderr-text matching (revised — corrects Round 1 review finding
#5; each step below verified against real scratch repositories during
this correction round):**

- **Branch vs. detached vs. genuinely unavailable:** `git symbolic-ref -q
  HEAD` — succeeds (exit 0, prints the branch ref, e.g. `refs/heads/main`)
  for a normal branch (including unborn); fails with **exit 1** (**no
  stderr at all** with `-q`) for the ordinary "HEAD is not a symbolic
  ref" case, i.e. detached HEAD; fails with a **different, non-1 exit
  code** (verified: **exit 128**, with a fatal-error message on stderr,
  e.g. `fatal: not a git repository...`) when `HEAD` itself cannot be
  read at all — genuine repository damage (verified directly by deleting
  `.git/HEAD` from an otherwise-valid repository and re-running the same
  command). **This exit-code distinction (1 vs. 128), not any stderr text
  inspection, is what makes `HEAD_UNAVAILABLE` (§17) a reachable,
  well-defined outcome distinct from ordinary detached HEAD** — BR3 reads
  only the exit code to tell the two apart, never the fatal message's
  text content.
- **Unborn vs. has-commits:** `git rev-parse --verify -q HEAD` — succeeds
  (exit 0, prints the 40-hex SHA) once at least one commit exists; fails
  (exit 1, **no stderr at all** with `-q`) when the branch is unborn.
  Verified directly:
  ```
  $ git init && git symbolic-ref -q HEAD; echo "exit=$?"
  refs/heads/main
  exit=0
  $ git rev-parse --verify -q HEAD; echo "exit=$?"
  exit=1                    # (zero stderr output — nothing to match against)
  ```
  and, separately, for the exit-128 corruption case:
  ```
  $ rm .git/HEAD   # simulated corruption in an otherwise-valid repo
  $ git symbolic-ref -q HEAD; echo "exit=$?"
  fatal: not a git repository (or any of the parent directories): .git
  exit=128
  ```
  Combining `symbolic-ref -q HEAD`'s three-way exit code (0 / 1 / other)
  with `rev-parse --verify -q HEAD`'s two-way exit code (0 / 1) is
  sufficient to derive every branch/HEAD state with no error-text
  inspection anywhere: `symbolic-ref` exit 0 + `rev-parse --verify -q
  HEAD` exit 1 → unborn branch; `symbolic-ref` exit 0 + `rev-parse
  --verify -q HEAD` exit 0 → normal branch with commits; `symbolic-ref`
  exit 1 (regardless of `rev-parse`, which will succeed since a detached
  HEAD always points at a real commit) → detached; `symbolic-ref` exit
  anything other than 0 or 1 (e.g. 128) → `HEAD_UNAVAILABLE`, checked
  before either of the other two interpretations is attempted. `LC_ALL=C`
  (§19) may still be set globally for whatever diagnostic text ends up in
  `GitError.details` for this last, genuinely unanticipated case, but —
  stated explicitly here as the corrected contract — **no BR3
  control-flow branch is ever gated on inspecting stderr content; every
  classification above is derived purely from exit codes and/or separate
  machine-readable stdout.**

**Upstream determination — no network, ever (revised — corrects Round 1
review finding #2):**

`upstream` is populated entirely from **Git config** for the *configured*
identity, plus a **separate** `rev-parse --verify` check for whether the
local remote-tracking ref actually exists — never via `@{upstream}`,
which the previous draft incorrectly relied on:

**Why `@{upstream}` cannot be used:** `@{upstream}` is itself a *ref
expression* that Git resolves by first locating the remote-tracking ref
it names — if that tracking ref does not exist locally, resolving
`@{upstream}` fails *entirely*, indistinguishable by exit code or output
shape from "no upstream configured at all." Verified directly: with
`branch.main.remote`/`branch.main.merge` genuinely configured but the
corresponding `refs/remotes/origin/main` deleted,
`git rev-parse --abbrev-ref --symbolic-full-name @{upstream}` fails with
exit 128 — the exact same failure shape as when no upstream is configured
at all. The previous draft's claim that this command could distinguish
"no upstream configured" from "upstream configured, tracking ref absent"
was false.

**Corrected method:**

1. **Configured identity, independent of the tracking ref's existence:**
   `git config --get branch.<branch>.remote` and
   `git config --get branch.<branch>.merge` (both genuinely read-only —
   a bare `--get`, never `--set`/`--add`; added to §27's read-only
   command allowlist). `<branch>` is the branch name from the
   branch/detached determination above (this step is skipped entirely,
   `upstream: null`, if HEAD is detached — a detached HEAD has no branch
   name to look up config for).
   - If either config key is absent (`git config --get` exits 1 with no
     stdout): `upstream: null`. **Not** an error — this is the ordinary
     "no upstream configured" case, determined by config-key absence, not
     by any ref resolution having been attempted at all.
   - If both are present, BR3 has the remote name (from
     `branch.<branch>.remote`, e.g. `origin`) and the merge ref (from
     `branch.<branch>.merge`, e.g. `refs/heads/main`) — from which the
     remote-side branch name (`main`) and the full local tracking-ref
     path (`refs/remotes/<remote>/<branch>`, e.g.
     `refs/remotes/origin/main`) are constructed directly, with no
     further Git call needed to know the *identity*.
2. **Tracking-ref existence and SHA, checked separately:**
   `git rev-parse --verify -q refs/remotes/<remote>/<branch>` (the exact
   constructed path from step 1).
   - If this succeeds (exit 0): `sha` is populated with the printed SHA.
     **This is the entirety of what "remote SHA" means in BR3** — the SHA
     the local repository's remote-tracking ref already records, as of
     whenever it was last updated by an actual `git fetch` the *user*
     (not BR3) ran. BR3 never runs `git fetch` itself, under any
     circumstance.
   - If this fails (exit 1, no stderr with `-q`): `sha` is `null` while
     `remote`/`branch`/`ref` remain populated from step 1 — the explicit
     "configured but remote-tracking ref unavailable locally" case,
     genuinely distinct from step 1's "no upstream configured" `null`
     case, and now genuinely *reachable and distinguishable*, which the
     previous `@{upstream}`-based design could not achieve. Verified
     directly against a scratch repository with `branch.main.remote`/
     `.merge` configured but `refs/remotes/origin/main` deleted: step 1
     still reports the configured remote/branch (config keys are
     unaffected by the tracking ref's deletion), and step 2's
     `rev-parse --verify -q` on the now-absent ref fails cleanly with
     exit 1 and no stderr.

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

**Determination method — exact command (revised, fully explicit — corrects
Round 1 review finding #6):**

```
git status --porcelain=v2 -z --find-renames=50% --untracked-files=all --ignore-submodules=none
```

run with `cwd` at `projectRoot`. This exact invocation — verified to
accept all five flags together without error — is what §19
(determinism), §20 (test plan), and §27 (independent review) all
reference; no section states a different or partial form of this
command. Each flag is individually required, not incidental:

- **`--porcelain=v2`** (not v1): Git's own stable, unambiguous,
  machine-oriented status format — it distinguishes staged vs. unstaged
  changes to the *same* path as two separate XY-style status characters
  on one v2 record, natively reports renames with similarity scores,
  natively reports submodule state, and, per §13's requirement, correctly
  represents conflicted/unmerged paths without the caller needing to
  hand-parse v1's more ambiguous single-character-pair format.
- **`-z`**: NUL-delimited records (§13).
- **`--find-renames=50%`**: makes the rename-detection threshold explicit
  on the `status` invocation itself, rather than relying on porcelain v2
  "using the same algorithm as `diff --find-renames`" as an implicit,
  undocumented-on-this-specific-command-line default — this is the exact
  same 50% threshold §14 establishes for `inspectDiff`, applied
  identically here so the two functions' rename-detection behavior can
  never silently drift apart from one another.
- **`--untracked-files=all`**: forces deterministic, explicit untracked-file
  reporting. Git's *default* untracked-file behavior is controlled by the
  `status.showUntrackedFiles` config value, which can be set to `no`,
  `normal`, or `all` in any given repository's or user's Git config —
  leaving this unset would mean BR3's actual behavior silently depends on
  whatever config happens to be in effect wherever it runs, which directly
  violates §19's determinism requirement. `--untracked-files=all` forces
  the same, fully-recursive untracked-file listing (not just the
  top-level directory of an untracked directory) regardless of local
  config.
- **`--ignore-submodules=none`**: explicit, deterministic submodule-state
  behavior. Git's `--ignore-submodules` also has a config-controllable
  default (`submodule.<name>.ignore` / `diff.ignoreSubmodules`); `none`
  means "ignore nothing" — every kind of submodule state change
  (commit-changed, untracked content, modified content) is reported.
  This is the correct choice given `SubmoduleState { commitChanged,
  hasUntrackedContent, hasModifiedContent }` is part of BR3's public
  contract (§7a) specifically to surface this information — a
  config-dependent partial-ignore default would silently make some of
  those three fields permanently `false` in some environments and not
  others, which is exactly the kind of environment-dependent behavior
  §19 forbids.

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
NUL-delimited output (§13) so paths containing spaces, tabs, or quotes are
never corrupted or truncated, and — for the UTF-8-decodable paths that
are BR3's definitive contract (§13's "Path byte semantics" subsection) —
exactly round-tripped; a non-UTF-8 path instead produces
`MALFORMED_GIT_OUTPUT` for the whole `inspectWorkingTree` call, per §13.
See §12 for how these same normalized paths feed into protected-path
matching.

## 12. Protected-System Matching — Path Normalization Rules

`matchProtectedPaths(inputs, protectedSystems)` is pure (§7a, §16) and
receives already-normalized repository-relative paths, each wrapped in a
`ProtectedPathCheckInput { path, origin }` (§7a — revised, corrects Round
1 review finding #4; `origin` is `"current"` or `"old_side_of_rename"`)
as produced by the caller from `inspectWorkingTree`/`inspectDiff` output,
or supplied directly by a caller/test with the same normalization already
applied — the function does not re-derive normalization from a live Git
call, since it has none.

**Normalization contract, applied uniformly to both each input's `path`
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
  declared pattern containing a literal `..` path segment is **rejected
  outright** — excluded from matching and reported via
  `ProtectedPathMatchResult.invalidInputs`/`.invalidPatterns` (§17;
  revised, corrects Round 1 review finding #4 — this is no longer framed
  as a `GitErrorCode`, since `matchProtectedPaths` never returns a
  `GitResult` at all) — Git itself never emits a path containing `..` for
  a real repository-relative path, so an input path containing one
  indicates a caller bug, not a normalization case to silently resolve.
  This is a defense-in-depth measure: BR3 must never let a
  `..`-containing pattern be interpreted as "match paths outside the
  declared scope" via a naive glob engine that resolves it.
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

**Duplicate matches / overlapping protected systems:** if one input's
`path` matches patterns from **multiple** `ProtectedSystem` entries (e.g.
an overly-broad `**` system and a more specific nested system both
declare overlapping paths), `matchProtectedPaths` returns **one
`ProtectedPathMatch` per (input, system) pair** — i.e., a path matching
two systems produces two `ProtectedPathMatch` entries in `matches`, one
per system, never silently collapsed to "the most specific match" or
"the most restrictive status." **BR3 does not decide which match
"wins"** — that is a policy-layer decision (should the most restrictive
status apply? should all matched systems' rules apply simultaneously?)
squarely outside BR3's boundary (§4). BR3's job ends at reporting every
intersection completely and accurately.

**Renamed files — both sides checked, distinctly labeled via structured
input (revised — corrects Round 1 review finding #4):** for a
`DiffChange`/`WorkingTreeEntry` with `kind: "renamed"`/`staged_rename`,
the caller constructs **two** `ProtectedPathCheckInput` entries — one
`{ path: <new path>, origin: "current" }` and one
`{ path: <old path>, origin: "old_side_of_rename" }` — and includes both
in the `inputs` array passed to `matchProtectedPaths`. This structured
`origin` field is precisely what makes `matchedVia` on any resulting
`ProtectedPathMatch` a **derived fact, not a guess**: `origin: "current"`
producing a match always reports `matchedVia: "path"`; `origin:
"old_side_of_rename"` producing a match always reports `matchedVia:
"oldPath"` — a flat `string[]` (the earlier, now-removed design) could
never support this, since it has no way to know which of its strings
represented a rename's old side versus its current side. Both "a
protected system's content moved out of protection" (old-side input
matches, current-side input doesn't) and "previously-unprotected content
moved into a protected path" (current-side input matches, old-side
doesn't) are real, distinct, policy-relevant scenarios — reporting only
one side would lose information a future policy layer needs. **This is
still, ultimately, the caller's responsibility to invoke correctly** —
`matchProtectedPaths` itself has no special "this is a rename" logic; it
simply matches whatever `ProtectedPathCheckInput` entries it's given,
each independently, against `protectedSystems`. The caller (whichever
future BR2-policy or BR5-skill code eventually calls this) is responsible
for constructing two separate inputs, with the correct `origin` value
each, for any rename entry it wants checked on both sides. This
specification states the contract; it does not implement the caller.

**Deleted paths:** matched the same as any other path (`origin:
"current"`) — a deleted path that matches a protected pattern is
reported exactly like any other match; whether "a protected file was
deleted" is more or less concerning than "a protected file was modified"
is, again, a policy question outside BR3's boundary. `matchProtectedPaths`
has no `DiffChangeKind`/`WorkingTreeEntryKind` awareness at all — it only
ever sees `ProtectedPathCheckInput` entries (a `path` plus the
caller-supplied `origin`), never any richer change-kind context.

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
ambiguity for paths containing spaces, tabs, or quote characters (Git's
default human-oriented path quoting — octal-escaping "unusual" characters
inside double quotes — is exactly the kind of format this specification
forbids parsing).

**Path byte semantics — explicit, deliberate decision (revised — corrects
Round 1 review finding #7):** `-z` NUL-delimiting solves the *record/field
boundary* ambiguity (knowing exactly where one path ends and the next
byte sequence begins), but it does **not**, by itself, make arbitrary path
*bytes* losslessly representable in the JS-string-based API this
specification defines. A Git repository path is, at the filesystem/Git
object level, an arbitrary byte sequence with no guaranteed encoding —
but every BR3 field typed `string` (`path`, `oldPath` on
`WorkingTreeEntry`/`DiffChange`) is a JavaScript/Node string, which is
UTF-16 internally; decoding an arbitrary non-UTF-8 byte sequence as UTF-8
(the only sound way to turn `-z`-delimited raw bytes into a JS string)
either throws or silently substitutes U+FFFD replacement characters for
invalid byte sequences, depending on the decoding API used — neither is
"lossless."

**BR3's actual, definitive contract:** paths that are valid UTF-8 (the
overwhelming majority of real-world repositories, and the only case a
previous draft of this specification implicitly assumed) are decoded and
round-tripped **exactly** — this part of the earlier "not corrupted"
claim is accurate and remains true. For a path that is genuinely **not**
valid UTF-8, BR3 returns `MALFORMED_GIT_OUTPUT` (§17) for the *entire*
containing operation (`inspectWorkingTree`/`inspectDiff`) rather than
either (a) silently substituting replacement characters into a `path`
field and presenting the corrupted result as if it were the real path, or
(b) crashing with an uncaught decoding exception. This is a whole-operation
failure, not a per-entry exclusion (unlike `matchProtectedPaths`'s
`..`-rejection, §12/§17, which processes a batch and reports per-item —
a working-tree/diff snapshot with one invalid-UTF-8 path among many valid
ones is treated as a `MALFORMED_GIT_OUTPUT`-shaped anomaly for the whole
call, since presenting a partial, silently-filtered working-tree/diff
result to a caller could itself be a dangerous, misleading omission
in a governance context — a change to a non-UTF-8-named file must never
simply vanish from what BR3 reports). Implementation detects this by
attempting a strict UTF-8 decode (Node's `Buffer.prototype.toString("utf-8")`
does not throw on invalid sequences by default — implementation must use
a strict-validating decode path, e.g. `TextDecoder("utf-8", { fatal: true
})`, and catch the resulting `TypeError` to produce `MALFORMED_GIT_OUTPUT`
rather than silently accepting `TextDecoder`'s own default lossy
substitution behavior). A dedicated test case for this exact scenario is
required (§20).

**`inspectDiff(projectRoot, request: DiffRequest)`:**

1. **Ref resolution, always first (revised — corrects Round 1 review
   finding #3):** both `request.fromRef` and `request.toRef` are
   independently resolved via
   `git rev-parse --verify --end-of-options <ref>^{commit}` (the
   `^{commit}` suffix ensures the resolution fails cleanly for a ref that
   doesn't point at a commit, e.g. a blob SHA, rather than silently
   succeeding against the wrong object type; `--end-of-options` — verified
   working with the Git version this environment provides — tells Git's
   own argument parser to treat every subsequent argv entry as a
   positional revision specifier, never as a flag, closing the specific
   gap the previous draft's bare `--verify <ref>^{commit}` (with no
   end-of-options marker) left open). Verified directly:
   ```
   $ git rev-parse --verify --end-of-options main^{commit}
   c350ff0f8469a4972e7626a239be55917aef4df3   # resolves normally
   $ git rev-parse --verify --end-of-options -- '--upload-pack=x'^{commit}
   fatal: Needed a single revision   # exit 128 — rejected, never
                                       # reinterpreted as a flag
   ```
   If either fails to resolve: `REF_NOT_FOUND`, with `details` naming
   which of the two refs failed. **This validation happens before any
   diff command runs at all** — per §19's requirement that caller-provided
   refs never become arbitrary Git options.
2. **Resolved SHAs are always returned, and are the only thing the
   subsequent `diff` invocation ever receives (made explicit — corrects
   Round 1 review finding #3):** `DiffResult.fromSha`/`toSha` are the
   40-hex-char commit SHAs `rev-parse --verify` in step 1 printed — a
   caller receives back exactly which commit each input ref resolved to,
   not merely the caller's own original ref strings echoed back. **The
   `git diff` invocation in step 3 below is always constructed using
   these two already-resolved SHA strings — never `request.fromRef` or
   `request.toRef` directly, under any circumstance.** This is stated as
   an explicit, unambiguous requirement, not merely implied by the two
   steps running in sequence: even if step 1's resolution result were
   somehow cached or reused, the specific string values passed as `diff`'s
   final two positional arguments must always be the `fromSha`/`toSha`
   values step 1 produced, never the caller's original request fields.
   This matters both for the security reason above (a caller-supplied ref
   string, once resolved, can never re-enter the argv construction path
   as a flag-shaped string) and for BR4's eventual evidence-binding
   concern (explicitly out of BR3's scope, §23), which needs the *exact*
   SHA, not a symbolic reference that could resolve differently later.
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
  dot: true, nocase: false, windows: false, basename: false, nonegate: true,
  noextglob: true })` per input pattern (**feature-grammar options added
  — corrects Round 1 review finding #8**, see below) — `dot: true`
  disables the traditional shell-glob dotfile exclusion (§12), `nocase:
  false` enforces case-sensitive matching (§12), `windows: false` (the
  default; stated explicitly here for clarity) ensures `\` is never
  treated as an alternate path separator, consistent with §12's
  "separators: `/` only" decision, `basename: false` (the default;
  stated for clarity) ensures a pattern always matches against the full
  repository-relative path, never merely a basename. BR3 compiles each
  `ProtectedSystem` path pattern into a `picomatch` matcher function once
  (memoized per `matchProtectedPaths` call, or per `ProtectedSystem[]`
  array identity — implementation's choice, not a caller-visible
  contract) rather than recompiling per input path.
- **Protected-path pattern grammar — explicit decision (corrects Round 1
  review finding #8, which found this previously unstated):** BR3's
  declared-pattern grammar supports exactly `*` (single-segment
  wildcard), `**` (cross-segment wildcard, §12), bracket/character-class
  expressions (`[abc]`, `[a-z]`), and brace expansion (`{a,b}`, e.g.
  `src/{auth,payments}/**`) — and explicitly **disables** negation
  patterns (a leading `!`) and extglobs (`+(pattern)`, `@(pattern)`,
  `?(pattern)`, etc.), via `picomatch`'s own `nonegate: true` and
  `noextglob: true` options. **Rationale:** a *protected-path* matcher is
  security-relevant in exactly the way `docs/PROTECTED_SYSTEMS.md`
  describes (it exists so a change to a sensitive path is never silently
  missed) — negation and extglob semantics are the two picomatch
  features most likely to produce subtle, hard-to-audit behavior in this
  specific context (e.g. a pattern author writing `!src/auth/legacy/**`
  intending to narrow protection, but actually broadening what does *not*
  match in a way that isn't obvious from reading the pattern alone).
  Bracket expressions and brace expansion carry no comparable risk (they
  only ever narrow or enumerate exact character/string alternatives, never
  invert a match) and are plausibly useful for a `config.yml` author
  (`docs/PROTECTED_SYSTEMS.md`'s own example, `src/auth/**`, doesn't need
  them, but a multi-directory protected system like
  `src/{auth,payments}/**` is a reasonable real-world pattern), so they
  remain enabled. With `nonegate: true` set, `picomatch` itself rejects a
  pattern beginning with `!` by treating it as a literal (non-negating)
  character rather than special syntax — BR3 relies on this built-in
  behavior rather than pre-scanning patterns for a leading `!` itself.
- **TypeScript typings:** `picomatch` ships its own bundled `.d.ts`
  declarations as of its current major version line (it does not require
  a separate `@types/picomatch` package) — **implementation must confirm
  this fact against the exact `picomatch` version actually resolved in
  `package-lock.json` at install time** (per BR2's own "confirm generated
  facts against the real thing, not the spec's assumption" precedent,
  e.g. its Ajv-2020-export verification requirement), and add
  `@types/picomatch` as an additional `devDependency` only if that
  confirmation reveals it's genuinely needed. This specification does not
  assert bundled-typings as an unconditional fact implementation may skip
  verifying.
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
  | "MALFORMED_GIT_OUTPUT";

interface GitError extends BuildRailError {
  code: GitErrorCode;
}

type GitResult<T> = { ok: true; value: T } | { ok: false; error: GitError };
```

**`GitErrorCode` no longer includes `INVALID_PATH_PATTERN` (revised —
corrects Round 1 review finding #4).** An earlier draft of this
specification listed `INVALID_PATH_PATTERN` as a member of this union
*and*, separately, described `matchProtectedPaths` as reporting the same
condition through a dedicated result-channel field — meaning the code was
never actually returned as a `GitError` by anything, an unused/dead union
member. `matchProtectedPaths` is fully synchronous and pure (§7a); it
never returns a `Promise` and never returns a `GitResult` at all (the
`GitResult<T>` wrapper above only applies to the five async,
I/O-performing functions: `resolveRepository`, `inspectHead`,
`inspectWorkingTree`, `inspectDiff`, and the shared exec helper's own
internal error translation). A `..`-containing input or declared pattern
reaching `matchProtectedPaths` is instead excluded from matching and
reported via `ProtectedPathMatchResult.invalidInputs`/`.invalidPatterns`
(§7a, §12) — a distinct, non-`GitError`-shaped mechanism, not a
`GitErrorCode` value.

| Code | Meaning | Expected vs. exceptional |
|---|---|---|
| `GIT_EXECUTABLE_UNAVAILABLE` | The `git` binary could not be spawned (`ENOENT` or equivalent from the underlying `child_process` call) | Expected — a real, anticipated environment condition (Git not installed / not on `PATH`); always a typed `GitResult` failure, never an uncaught exception |
| `PROJECT_ROOT_NOT_FOUND` | `projectRoot` does not exist or is not a directory | Expected |
| `NOT_A_GIT_REPOSITORY` | `projectRoot` (or any parent) is not inside a Git working tree, per `git rev-parse --is-bare-repository`/`--show-toplevel`'s failure (§8) | Expected |
| `PROJECT_ROOT_MISMATCH` | `projectRoot` is inside a real Git repository, but is not that repository's root (§8 step 4) | Expected — `details` names the actual resolved toplevel |
| `BARE_REPOSITORY_UNSUPPORTED` | `git rev-parse --is-bare-repository` reports `true` for `projectRoot` (§8 step 3) | Expected |
| `HEAD_UNAVAILABLE` | `rev-parse --verify -q HEAD` fails for a reason other than "unborn branch" (e.g. a corrupted `.git` — genuinely unexpected repository damage) | Exceptional — this indicates repository corruption BR3 cannot meaningfully recover from; still returned as a typed `GitResult` failure (never a raw uncaught exception reaching a caller), but callers should treat it as unusual, not routine |
| `REF_NOT_FOUND` | Either `DiffRequest.fromRef` or `.toRef` failed to resolve via `rev-parse --verify --end-of-options <ref>^{commit}` (§13) | Expected — a caller can legitimately pass a ref that doesn't exist (e.g. a stale/mistyped SHA) |
| `GIT_COMMAND_FAILED` | A Git subprocess exited non-zero for a reason not covered by a more specific code above (i.e., the catch-all for a genuine, unanticipated Git failure) | Expected as a *result shape* (always returned via `GitResult`, never thrown), but the underlying cause is inherently open-ended — `details` carries the captured stderr for diagnosis |
| `MALFORMED_GIT_OUTPUT` | Git's own output did not match the expected machine-readable format this specification defines (e.g. an unrecognized porcelain v2 record type, an unparseable `--name-status` line, or a path that is not valid UTF-8 — §13) | Exceptional — this should be unreachable against a conforming Git version and well-formed repository content; exists so a genuinely unexpected format change (or a non-UTF-8 path, §13) fails loudly and specifically rather than silently misparsing |

**`matchProtectedPaths`'s own error-shaped handling (§7a is the single
authoritative signature; restated here only for the rationale, not a
second definition):** a pure function processing a batch of inputs,
where some subset might be malformed, is better served by "process what's
valid, report what wasn't" than by either (a) throwing on the first bad
input (which would make one malformed path in a large batch abort
matching for every other, valid input) or (b) silently dropping bad
inputs with no signal at all (which would hide a genuine caller bug).
This mirrors BR2's own established principle that thrown exceptions are
reserved for genuinely exceptional conditions, not routine per-item
validation
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
- **Caller-provided refs never become arbitrary Git options (revised —
  corrects Round 1 review finding #3):** because `execFile`'s argv
  entries are passed to the `git` process directly (never through a
  shell, and never re-parsed by Git as a single space-delimited string),
  a caller-supplied ref string like `--upload-pack=evil-command` passed
  as `request.fromRef` is received by Git as a single, literal argv
  entry — but Git's own argument parser can still, absent an explicit
  end-of-options marker, interpret a leading-`--`-shaped *positional*
  argument as a flag rather than a revision specifier. §13 step 1
  therefore requires resolving-and-verifying every caller-supplied ref
  via `git rev-parse --verify --end-of-options <ref>^{commit}` — the
  `--end-of-options` flag (verified working against this environment's
  Git version, §13) is the actual, confirmed-correct mechanism, not the
  bare `--` separator a previous draft of this specification proposed as
  an *additional* measure (verified, during this correction round, that
  `--` does not work correctly in this exact positional slot for
  `rev-parse --verify` — it produced `fatal: Needed a single revision`
  even for a genuinely valid ref, so it is not used at all in the final
  design; `--end-of-options` alone is the complete, sufficient safeguard).
  A string that `rev-parse --verify --end-of-options` does not resolve to
  a real commit object is rejected as `REF_NOT_FOUND` before it ever
  reaches `git diff`'s own argument parsing, and — per §13's explicit
  requirement — only the already-resolved SHA, never the original
  caller-supplied ref string, is ever passed to the subsequent `diff`
  invocation, closing off any possibility of a ref-shaped string
  reaching `git diff`'s argument parsing at all, not merely being
  rejected by it.
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
  output formats). `LC_ALL`/`LANG: "C"` forces the POSIX/C locale, purely
  for the **readability/determinism of diagnostic text** that might end
  up in `GitError.details` for a genuinely unanticipated failure —
  **stated explicitly (corrects Round 1 review finding #5): no BR3
  control-flow branch is ever gated on inspecting that text's content.**
  Every classification BR3 makes (unborn vs. has-commits, branch vs.
  detached, bare vs. non-bare, upstream configured vs. not, tracking-ref
  present vs. absent, ref resolves vs. not) is derived exclusively from
  exit codes and/or separately-parsed machine-readable stdout (§9, §10,
  §13) — `LC_ALL`/`LANG` exist only so that if a genuinely unanticipated
  Git failure's message text is ever surfaced to a human via `details`,
  that text is at least consistent across environments, not so BR3 itself
  can read it to make a decision.
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
- **`git status`'s exact flag set is `--porcelain=v2 -z --find-renames=50%
  --untracked-files=all --ignore-submodules=none`, always together, never
  a subset** (§11 — restated here so this section, §11, §20, and §27 all
  name the identical command with no drift between them).
- **No reliance on Git aliases:** every BR3 Git invocation uses a
  first-argument literal plumbing/porcelain subcommand name
  (`status`, `diff`, `rev-parse`, `symbolic-ref`, `config`) that ships
  with Git itself — never a user-configurable alias name — so a local
  `~/.gitconfig`'s `[alias]` section can never redirect a BR3 invocation
  to different, unexpected behavior. (`config` is used read-only, for
  `--get branch.<branch>.remote`/`.merge` — §9/§10's upstream-identity
  determination.)
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

**Repository root (§8) — three distinct required cases added, corrects
Round 1 review finding #1**
- Valid repository root resolves successfully
- Non-Git directory → `NOT_A_GIT_REPOSITORY`
- Directory that is a subdirectory of a real Git repository, but not its
  root → `PROJECT_ROOT_MISMATCH`, with `details` naming the actual
  toplevel
- **Bare repository** (created via `git init --bare`) →
  `BARE_REPOSITORY_UNSUPPORTED`, detected via `--is-bare-repository`
  reporting `true` — a genuinely distinct test fixture from the two
  below, not merely asserted by claim
- **Linked worktree** (created via `git worktree add` against a real
  fixture repository with at least one commit) → succeeds,
  `isWorktree: true`, and `gitDir !== gitCommonDir` in the returned
  `RepositoryInfo`
- **Submodule checkout** (created via `git submodule add` against a real
  fixture superproject + a separate fixture submodule source repository)
  → succeeds, **`isWorktree: false`** (the specific regression case this
  correction round exists to fix — an earlier draft's algorithm would
  have incorrectly reported `true` here), and `gitDir === gitCommonDir`
  in the returned `RepositoryInfo`
- Nonexistent `projectRoot` path → `PROJECT_ROOT_NOT_FOUND`

**Branch + HEAD (§9, §10) — determination method revised, corrects Round
1 review findings #2 and #5**
- Normal branch with commits → correct `branch`, `headSha`, `detached: false`, `unborn: false`
- Detached HEAD (checked out to a SHA) → `branch: null`, `detached: true`, correct `headSha`
- Unborn branch (fresh `git init`, zero commits) → `unborn: true`,
  `headSha: null`, correct pending `branch` name — the specific
  regression test proving this is derived from
  `symbolic-ref -q HEAD`/`rev-parse --verify -q HEAD` exit codes alone
  (§9), not from any stderr text
- No upstream configured (`branch.<branch>.remote`/`.merge` config both
  absent) → `upstream: null`
- Upstream configured with a real local remote-tracking ref present
  (e.g. `git remote add`, `git fetch` against a local bare repository
  used purely as an in-test fixture "remote," or an equivalent local
  setup — never a real network fetch) → correct `remote`/`branch`/`ref`/`sha`
- **Upstream configured (`branch.<branch>.remote`/`.merge` both present),
  remote-tracking ref subsequently removed** (e.g. via
  `git update-ref -d refs/remotes/<remote>/<branch>` in the fixture's own
  setup — this exact scenario is what a previous, `@{upstream}`-based
  design could not distinguish from "no upstream configured" at all) →
  `sha: null`, `remote`/`branch`/`ref` still correctly populated from
  config
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
- Filename containing Unicode characters (valid UTF-8) — confirmed
  correctly, exactly decoded via `-z` output
- Filename containing other unusual-but-Git-legal, UTF-8-valid characters
  (e.g. a literal `"` or tab byte) — confirmed correctly decoded via `-z`
  output, never corrupted/truncated
- **Filename containing a byte sequence that is not valid UTF-8**
  (constructed via Node's `Buffer`-based `fs` APIs, bypassing the shell —
  practical on the Linux/macOS filesystems this test suite targets; §13's
  final byte-semantics decision) → the defined typed outcome (§13) is
  produced, never silent corruption, never a crash, never a JS string
  containing Unicode replacement characters presented as if it were the
  real path

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

**Protected-path matching (§12, §16, §17) — pure, no Git/filesystem
fixture needed; test bullets updated for the final `ProtectedPathCheckInput`-based
signature, corrects Round 1 review finding #4**
- `OPEN` system match reported
- `GUARDED` system match reported
- `FROZEN` system match reported
- `LOCKED` system match reported
- Overlapping protected systems (one `{ path, origin: "current" }` input
  matches two `ProtectedSystem` entries) → two separate
  `ProtectedPathMatch` entries in `matches`, one per system
- An input whose `path` matches no protected system → absent from
  `matches`
- A rename represented as **two** inputs — `{ path: <new>, origin:
  "current" }` and `{ path: <old>, origin: "old_side_of_rename" }` —
  where only the old-side input matches a protected pattern →
  `matchedVia: "oldPath"` present in the result, no `"path"`-matched
  entry for that pair
- The same two-input rename shape where only the current-side input
  matches → `matchedVia: "path"` present, no `"oldPath"`-matched entry
- An input, or a declared `ProtectedSystem` path pattern, containing `..`
  → excluded from matching, reported in
  `ProtectedPathMatchResult.invalidInputs`/`.invalidPatterns`, never
  silently matched, never thrown
- Leading `./`, absolute-leading-`/`, dotfile paths, `**` cross-segment
  matching — each a dedicated case exercising §12's normalization rules
- A declared pattern beginning with `!` (negation) is matched **literally**
  (i.e. as a normal character, not special syntax), per `nonegate: true`
  (§16) — a dedicated regression test confirming negation is genuinely
  disabled, not merely documented as disabled
- A declared pattern using an extglob form (e.g. `+(a|b)`) is matched
  **literally**, per `noextglob: true` (§16)
- A declared pattern using brace expansion (`{a,b}`) and a declared
  pattern using a bracket expression (`[a-z]`) both match as expected —
  confirming these two features remain genuinely enabled, not
  accidentally disabled alongside negation/extglobs
- `matchProtectedPaths` is confirmed **pure**: calling it twice with the
  same (deep-equal, but not reference-equal) `inputs`/`protectedSystems`
  arguments produces deep-equal outputs, and neither input array/object
  is mutated (snapshot-before/assert-unchanged-after, mirroring BR2's
  established purity-test pattern)

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

## 20a. Acceptance Criteria

**Added — corrects Round 1 review finding #9, which found no
standalone, reviewer-ready checklist covering the complete BR3 contract
(only §27's narrative Independent Review Requirements existed).**
Numbered `20a` (mirroring §7a's precedent elsewhere in this document,
which similarly inserts a section between two already-numbered sections
without renumbering the rest of the document) and placed immediately
after §20's Test Plan, since each criterion below is proven by that test
plan. Mirrors BR2 specification §26's own lettered-checklist convention.

- **A.** `resolveRepository` correctly distinguishes all of: a valid
  repository root, a non-Git directory, a subdirectory of a real
  repository that is not its root, a bare repository, a linked worktree,
  and a submodule checkout — each as its own distinct, typed
  `RepositoryInfo`/`GitError` outcome (§8), with `isWorktree` correctly
  `true` only for a linked worktree and correctly `false` for both an
  ordinary repository and a submodule checkout, proven by dedicated real
  fixtures for each (§20).
- **B.** `inspectHead` correctly reports all three branch/HEAD states
  (normal, detached, unborn) and all three upstream states (not
  configured, configured with tracking ref present, configured with
  tracking ref absent), with every classification derived from exit
  codes and/or machine-readable output only — never from inspecting
  human-readable stderr text (§9, §10).
- **C.** "Remote SHA" is precisely and only the local remote-tracking
  ref's already-recorded SHA; no BR3 code path ever invokes `git fetch`
  or otherwise contacts a network endpoint, proven by running the full
  BR3 suite with network access disabled (§10, §20).
- **D.** `inspectWorkingTree` returns a structured, per-path
  `WorkingTreeEntry[]` — never a single boolean — correctly
  distinguishing staged/unstaged/both-on-the-same-path/added/deleted/
  renamed(above and below threshold)/untracked/conflicted/submodule
  states, using the exact command `git status --porcelain=v2 -z
  --find-renames=50% --untracked-files=all --ignore-submodules=none`
  (§11), with §11/§19/§20/§27 all agreeing on that exact command.
- **E.** `inspectDiff` correctly resolves both input refs via
  `git rev-parse --verify --end-of-options <ref>^{commit}` before any
  `diff` invocation runs, always constructs the subsequent `git diff`
  call using only the resolved SHAs (never the caller's original ref
  strings), and correctly classifies added/modified/deleted/renamed(above
  threshold)/type-changed changes while confirming copy detection is
  genuinely disabled (§13, §14, §15).
- **F.** A flag-shaped ref string (e.g. `--upload-pack=x`) passed as
  `DiffRequest.fromRef`/`.toRef` is genuinely rejected as `REF_NOT_FOUND`
  — proven by an actual regression test constructing exactly this input,
  not merely documented as rejected (§13, §18, §20).
- **G.** `matchProtectedPaths` is genuinely pure (no Git access, no
  filesystem access — confirmed by static inspection of its module's
  imports, not only by behavioral testing), uses the single, final
  `ProtectedPathCheckInput`-based signature consistently defined in §7a
  (with no contradictory second signature anywhere in this document),
  correctly derives `matchedVia` from each input's own `origin` field,
  correctly reports `..`-containing inputs/patterns via
  `invalidInputs`/`invalidPatterns` rather than throwing or silently
  dropping them, and correctly implements the final picomatch feature
  grammar (negation and extglobs disabled; brace expansion and bracket
  expressions enabled) (§7a, §12, §16, §17).
- **H.** Zero Git mutation occurs anywhere in the implementation — every
  Git subcommand string used is one of `status`, `diff`, `rev-parse`,
  `symbolic-ref`, `config` (read-only `--get` only), and no others (§5,
  §6, §27).
- **I.** Every Git subprocess is invoked via `execFile` with an argv
  array — never a shell, never string concatenation — with the exact
  determinism `env`/flags (§19) applied at exactly one shared call site
  (§18).
- **J.** A path that is not valid UTF-8 produces `MALFORMED_GIT_OUTPUT`
  for the containing operation — never silent corruption, never an
  uncaught decoding exception, and never a partial/filtered result
  presented as complete (§13).
- **K.** No dependency beyond `picomatch` was added (§16, §22); no
  `ajv-formats`-style scope creep occurred.
- **L.** BR3 adds no new `buildrail` CLI command and does not modify
  `packages/cli/src/commands/status.ts` or any other existing CLI
  command's behavior (§21).
- **M.** `npm test`, `npm run typecheck`, `npm run build` all pass at the
  repository root, covering `packages/cli` (BR1, unmodified),
  `packages/core`'s existing BR2 suites (unmodified/unweakened), and
  BR3's new test suite (§25).
- **N.** None of §6's out-of-scope items (Git mutation, quality-gate
  execution, evidence generation, agent skills, adapters, CI/network/
  deployment integration) leaked into the implementation.

## 20b. Implementation Plan

**Added — corrects Round 1 review finding #10, which found no ordered
implementation sequence (only §7's illustrative module tree existed).**

**Module/file structure:** reuses §7's proposed tree
(`packages/core/src/git/{index,errors,types,repository,head,workingTree,
diff,protectedPaths}.ts` plus `internal/exec.ts`) without modification —
see §7 for the full annotated listing.

**Ordered implementation sequence**, derived from actual dependency
relationships between the pieces (each step depends only on steps already
listed above it):

1. **`errors.ts` / `types.ts`** — the shared `GitErrorCode`/`GitError`/
   `GitResult` shapes (§17) and the domain types (`RepositoryInfo`,
   `HeadInfo`, `UpstreamInfo`, `WorkingTreeStatus`, `WorkingTreeEntry`,
   `SubmoduleState`, `DiffRequest`, `DiffResult`, `DiffChange`,
   `ProtectedPathCheckInput`, `ProtectedPathMatch`,
   `ProtectedPathMatchResult` — §7a). These have no runtime logic and no
   dependencies of their own; every other file depends on them.
2. **`internal/exec.ts`** — the one shared safe-exec primitive (§18),
   applying the determinism env/flags (§19) in one place. Depends only on
   step 1's error types (to translate `child_process` failures into
   `GitError` shapes) and Node's own `node:child_process`/`node:util`.
   Every I/O-performing module below depends on this.
3. **`repository.ts`** (`resolveRepository`) — depends on step 2 (exec
   primitive) and step 1 (types/errors). Implemented before `head.ts`/
   `workingTree.ts`/`diff.ts` because those three each call
   `resolveRepository` as their own mandatory first step (§8) — building
   it first, and testing it thoroughly in isolation (§20's repository-root
   test category, including the bare/worktree/submodule distinction),
   gives the other three modules a trustworthy foundation to build on
   rather than a stub.
4. **`head.ts`** (`inspectHead`) — depends on steps 1–3. No dependency on
   `workingTree.ts`/`diff.ts`; can be implemented and tested in either
   order relative to them.
5. **`workingTree.ts`** (`inspectWorkingTree`) — depends on steps 1–3.
   Independent of `head.ts`/`diff.ts`.
6. **`diff.ts`** (`inspectDiff`) — depends on steps 1–3. Independent of
   `head.ts`/`workingTree.ts`. (Steps 4–6 may be implemented in any
   relative order, or in parallel, once step 3 is complete and tested —
   listed sequentially here only for concreteness.)
7. **`protectedPaths.ts`** (`matchProtectedPaths`) — depends only on step
   1's types (`ProtectedPathCheckInput`/`ProtectedPathMatch`/
   `ProtectedPathMatchResult`, and the already-existing, BR2-provided
   `ProtectedSystem` type) and the `picomatch` dependency (§16) — has no
   dependency on steps 2–6 at all, and could technically be implemented
   first or in parallel with any of them, but is sequenced last here
   because it is the "policy-adjacent" piece most naturally reviewed
   alongside the other six modules' Git-fact-gathering behavior, not
   because of a genuine build-order requirement.
8. **`index.ts`** — the module's own internal barrel, and the specific
   subset re-exported from `packages/core/src/index.ts` (the package's
   public barrel, §7a) — depends on all of steps 1–7 existing.
9. **Test suite** (§20) — while individual modules' own unit tests are
   naturally written alongside steps 3–7 above (not deferred to the end),
   the full required test-category checklist (§20) is only completable
   once step 8's public barrel exists, since BR2's own established
   testing convention (§3) has tests import from `@buildrail/core`'s
   public surface, not from individual internal module files directly.

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
  (i.e., `status`, `diff`, `rev-parse`, `symbolic-ref`, `config`
  (read-only `--get` only), and no others)
- Whether `matchProtectedPaths` is genuinely pure — no Git access, no
  filesystem access, confirmed by a test asserting identical output for
  identical (deep-equal) input across repeated calls, and by static
  inspection of `protectedPaths.ts`'s imports (it must not import
  anything from `internal/exec.ts` or any Node `fs`/`child_process`
  module)
- Whether the `..`-rejection in `matchProtectedPaths` (§12, §17) is
  reachable and correctly reported via `invalidInputs`/`invalidPatterns`,
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
- Whether `git status --porcelain=v2 -z --find-renames=50%
  --untracked-files=all --ignore-submodules=none` (§11, §19) and
  `git diff --name-status -z` (with the exact flags §13/§19 specify) are
  the actual commands invoked — not `--porcelain` (v1), not a partial
  flag set, and not a patch-format diff requiring hunk-parsing
- Whether BR3 adds no new CLI command and does not modify
  `packages/cli/src/commands/status.ts` or any other existing CLI
  command's behavior (§21)
- Whether any of §6's out-of-scope items leaked into the implementation
- Whether test evidence is real (tests actually run against real,
  ephemeral, temporary Git repositories — not mocked Git command output)

This document does not itself authorize BR3 implementation — see §1.
