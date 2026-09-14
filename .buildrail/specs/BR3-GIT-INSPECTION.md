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
  remote: string;   // e.g. "origin", or "." for a local-branch upstream (§9/§10),
                    // populated directly from branch.<b>.remote config —
                    // independent of whether the upstream actually resolves
  ref: string | null; // the symbolic full name @{upstream} itself resolves to,
                      // e.g. "refs/remotes/origin/main" (an ordinary
                      // remote-tracking upstream), "refs/custom-ns/origin/main"
                      // (a custom-refspec remote-tracking upstream), or
                      // "refs/heads/main" (a local-branch upstream) — always
                      // exactly what Git itself resolves @{upstream} to, never
                      // a BR3-constructed path (revised — corrects Round 3
                      // review finding #3: an earlier draft of this
                      // specification fell back to a hand-constructed
                      // "refs/remotes/<remote>/<branch>" guess when @{upstream}
                      // failed to resolve; that guess is factually wrong for a
                      // custom-refspec or local (remote=".") upstream, whose
                      // real target never lives under refs/remotes/ at all —
                      // see §9/§10). null if @{upstream} itself fails to
                      // resolve locally (§9's "configured but unresolvable"
                      // case) — a truthful "the upstream is configured but
                      // BR3 cannot tell you where its data lives" state, never
                      // a guess presented as fact.
  branch: string;   // e.g. "main" (the remote-side branch name, from
                    // branch.<b>.merge), populated directly from config —
                    // independent of whether the upstream actually resolves
  sha: string | null; // resolved via @{upstream} — see §9/§10. null exactly
                      // when ref is null: whenever @{upstream} itself fails
                      // to resolve locally (§9's "configured but unresolvable"
                      // case) — ref and sha are null/non-null together, never
                      // independently
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

**Validation algorithm (revised — corrects Round 2 review finding #1,
which found that Round 1's `<projectRoot>/.git`-existence precheck,
despite being documented as "non-authoritative," actually made
`BARE_REPOSITORY_UNSUPPORTED` and `PROJECT_ROOT_MISMATCH` unreachable in
practice):** verified against real bare/nested-subdirectory/worktree/
submodule fixtures during this correction round; exact output quoted
below each step.

**Why the `.git`-child precheck was actively harmful, not just
imprecise:** verified directly — a bare repository (`git init --bare`)
has **no** `.git` subdirectory at all; the bare repository's own contents
(`HEAD`, `objects/`, `refs/`, `config`) sit directly inside the bare
repository's own directory, not nested one level down inside a `.git`.
Likewise, an ordinary subdirectory of a real repository that is *not*
that repository's root (the exact case `PROJECT_ROOT_MISMATCH` exists to
catch) has **no** `.git` of its own — only the true root does. So the old
step 2, checking whether `<projectRoot>/.git` exists, would **fail**
(and return `NOT_A_GIT_REPOSITORY`) for both a real bare repository and a
real nested subdirectory, before either the bare-repository check or the
toplevel-comparison check ever ran — silently pre-empting the two most
specific error codes this algorithm exists to produce. The corrected
algorithm below removes this precheck entirely and asks Git itself,
first, using only machine-readable facts:

1. Confirm `projectRoot` exists and is a directory (`fs.stat` — no Git
   invocation needed yet). If not: `PROJECT_ROOT_NOT_FOUND`.
2. **Bare-repository check FIRST, before any other Git call, and before
   any assumption that a working tree exists:** run
   `git rev-parse --is-bare-repository` with `cwd` set to exactly
   `projectRoot`. This prints exactly `true` or `false` on stdout — an
   unambiguous, machine-readable fact requiring no error-path inference.
   Verified directly against three distinct fixtures:
   ```
   $ git rev-parse --is-bare-repository   # inside a real bare repo
   true
   exit=0
   $ git rev-parse --is-bare-repository   # inside a real non-bare repo
   false
   exit=0
   $ git rev-parse --is-bare-repository   # in a plain, non-Git directory
   fatal: not a git repository (or any of the parent directories): .git
   exit=128
   ```
   - If the command fails because `projectRoot` is not inside any Git
     repository at all (the exit-128, fatal-message case above —
     detected by the command's non-zero exit alone, never by its stderr
     text, per §19/§9's determinism discipline): `NOT_A_GIT_REPOSITORY`.
   - If it succeeds and prints `true`: `BARE_REPOSITORY_UNSUPPORTED`
     immediately (§8's "Bare repositories" decision below) — no further
     step runs, since every remaining step assumes a working tree a bare
     repository does not have.
   - If it succeeds and prints `false`: continue to step 3.
3. Run `git rev-parse --show-toplevel` (same `cwd`). Verified: run from a
   subdirectory nested two levels inside a real repository, this
   correctly resolves to the true repository root, not the nested
   subdirectory itself — confirming the comparison in step 4 below is
   meaningful.
   - If this fails: `NOT_A_GIT_REPOSITORY` (should not be reachable if
     step 2 already succeeded with `false`, but retained as a defensive,
     correctly-typed fallback for an edge case step 2 does not
     anticipate).
   - If it succeeds, compare its stdout (the resolved toplevel path,
     normalized for trailing separators and symlink resolution via
     `fs.realpath` on both sides before comparison) against `projectRoot`
     (itself passed through `fs.realpath` first, so symlinked project
     roots compare correctly). If they **do not match**, `projectRoot` is
     a subdirectory of a real Git repository but is **not** that
     repository's root: `PROJECT_ROOT_MISMATCH`, with `details` naming
     the actual resolved toplevel BR3 found. BR3 never silently operates
     against the parent repository in this case. If they match, continue
     to step 4.
4. Run `git rev-parse --git-dir` and `git rev-parse --git-common-dir`
   (same `cwd`) to resolve both the per-checkout and the shared/common
   Git directory (this correctly resolves the `gitdir:` pointer for
   worktrees/submodules, whether `.git` at `projectRoot` is a directory or
   a file). Resolve each to an absolute path relative to `projectRoot` if
   Git returns a relative one.
5. **Determine `isWorktree` by comparing `--git-dir` against
   `--git-common-dir`** (unchanged from Round 1's already-correct
   derivation — re-verified during this round). Verified directly against
   real fixtures:
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
   sufficient on its own; no additional signal (such as
   `--show-superproject-working-tree`) is needed to distinguish these
   three cases, since a submodule and an ordinary repository already
   share the "identical" bucket and correctly both report
   `isWorktree: false`.
6. If the Git executable itself cannot be located/spawned at any point
   in steps 2–5 (`ENOENT` from the underlying `child_process` call, or
   equivalent): `GIT_EXECUTABLE_UNAVAILABLE`. This is checked structurally
   by the shared exec helper (§18) and surfaces identically from every
   BR3 entry point, not just `resolveRepository`.

**The `<projectRoot>/.git`-existence precheck from the previous draft is
removed entirely, not merely demoted** — it added no information step 2
doesn't already establish more precisely (via a real Git invocation
rather than a filesystem guess), and its presence, even as a documented
"non-authoritative fast pre-check," was concretely responsible for the
unreachability bug this round corrects. `resolveRepository` now asks Git
itself, via machine-readable facts, at every step — no step depends on
BR3's own filesystem-shape assumptions about what a repository "should"
look like.

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

**Upstream determination — no network, ever (revised — corrects Round 2
review finding #2, which found that Round 1's fix, constructing the
tracking-ref path as a hardcoded `refs/remotes/<remote>/<branch>` string,
is itself wrong for any non-default fetch refspec or a local-branch
upstream):**

`upstream` is populated from **Git config**, for the *configured*
identity, plus **`@{upstream}` itself** (not a hand-constructed path) for
whether the tracking data actually resolves and to what SHA. Round 1
correctly rejected using `@{upstream}` as the *sole* signal (it cannot
distinguish "no upstream configured" from "configured but the tracking
ref is absent," since both fail the same way) — that insight is
unchanged. What Round 1 got wrong was the *replacement*: hardcoding
`refs/remotes/<remote>/<branch>` assumes the default fetch refspec
(`+refs/heads/*:refs/remotes/<remote>/*`) and assumes the tracking ref
always lives under `refs/remotes/`, neither of which Git actually
guarantees.

**Why the hardcoded path is wrong:** `remote.<name>.fetch` is itself a
configurable refspec — a repository can configure a custom fetch refspec
that lands tracking refs anywhere (e.g. under a custom namespace instead
of `refs/remotes/<remote>/`), and Git also allows `branch.<name>.remote`
to be `.` (a literal dot), meaning "the upstream is a **local** branch in
this same repository," in which case there is no remote-tracking ref
under `refs/remotes/` at all — the upstream ref is a plain
`refs/heads/<other-branch>`. A hardcoded `refs/remotes/<remote>/<branch>`
construction silently produces the wrong path (or a path that happens
not to exist) in both cases, even though the upstream is genuinely and
correctly configured. `@{upstream}`, by contrast, is Git's own resolution
of "whatever the configured upstream actually points to right now,"
honoring both custom refspecs and the `remote="."` local-upstream case
correctly by construction — because it goes through the same resolution
logic Git itself uses for `git status`, `git push`, etc., rather than
BR3 re-deriving that logic independently and incompletely.

Verified directly, against three separate scratch fixtures, that
`git rev-parse --verify -q @{upstream}` resolves correctly in every case
where an upstream is genuinely configured, and fails cleanly (exit 1, no
stderr) only when it is genuinely absent:
```
# ordinary upstream (remote=origin, merge=refs/heads/main)
$ git rev-parse --verify -q @{upstream}
<sha>
exit=0

# custom fetch refspec (remote.origin.fetch rewritten to
# "+refs/heads/*:refs/custom-ns/origin/*" — no refs/remotes/origin/*
# exists at all after fetching under this refspec)
$ git rev-parse --verify -q @{upstream}
<sha>                    # resolves correctly via refs/custom-ns/origin/main
exit=0

# local upstream (branch.feature.remote=".", branch.feature.merge=refs/heads/main —
# set via: git branch --set-upstream-to=main feature)
$ git rev-parse --verify -q @{upstream}
<sha>                    # resolves correctly to refs/heads/main's own sha
exit=0

# upstream configured, tracking ref subsequently deleted
# (git config still reports branch.main.remote/merge; refs/remotes/origin/main removed)
$ git rev-parse --verify -q @{upstream}
exit=1                   # clean failure, no stderr — genuinely absent
```
No valid Git upstream configuration was found, across these tested
shapes, that `@{upstream}` fails to resolve correctly when the tracking
data is actually present.

**Corrected method:**

1. **Configured identity, independent of the tracking ref's existence:**
   `git config --get branch.<branch>.remote` and
   `git config --get branch.<branch>.merge` (both genuinely read-only —
   a bare `--get`, never `--set`/`--add`; already on §27's read-only
   command allowlist from Round 1). `<branch>` is the branch name from
   the branch/detached determination above (this step is skipped
   entirely, `upstream: null`, if HEAD is detached — a detached HEAD has
   no branch name to look up config for). **Unchanged from Round 1** —
   this remains the correct way to answer "is anything configured at
   all," since it depends on nothing but the config keys' presence, not
   on any ref actually resolving.
   - If either config key is absent (`git config --get` exits 1 with no
     stdout): `upstream: null`. **Not** an error — this is the ordinary
     "no upstream configured" case, determined by config-key absence, not
     by any ref resolution having been attempted at all.
   - If both are present, BR3 has the remote name (from
     `branch.<branch>.remote`, e.g. `origin` or `.`) and the merge ref
     (from `branch.<branch>.merge`, e.g. `refs/heads/main`) — from which
     the remote-side branch name (`main`) is known directly, with no
     further Git call needed. The `ref` field reported to callers (§7a)
     is the resolved tracking ref **as Git itself resolves it** — see
     step 2, not a BR3-constructed path.
2. **Upstream-SHA resolution, via `@{upstream}` itself, resolved
   in the context of `<branch>` (not whatever branch HEAD happens to
   currently be, so this remains correct if that ever diverges) — this
   step's result is called "upstream SHA" throughout this specification,
   an umbrella term covering two distinct subcases (revised — corrects
   Round 3 review finding #3, which found the previous uniform
   "remote-tracking ref SHA"/"remote SHA" terminology misleading for the
   local-upstream subcase below, whose SHA comes from a plain local
   branch ref under `refs/heads/`, never from anything under
   `refs/remotes/`):**
   `git rev-parse --verify -q <branch>@{upstream}` for the SHA, and
   `git rev-parse --verify -q --symbolic-full-name <branch>@{upstream}`
   for the resolved ref name (both genuinely read-only; both added to
   §27's read-only command allowlist).
   - If both succeed (exit 0): `sha` is populated with the printed SHA,
     and `ref` is populated with the printed symbolic full name — always
     exactly what Git itself reports, never a BR3 guess. Two subcases,
     both fully supported and both reachable in practice:
     - **Remote-tracking upstream** (the ordinary case, and the
       custom-fetch-refspec case): `ref` is something under `refs/remotes/`
       — e.g. `refs/remotes/origin/main` under Git's default fetch
       refspec, or `refs/custom-ns/origin/main` under a custom
       `remote.<name>.fetch` rewrite — and `sha` is that remote-tracking
       ref's own already-recorded SHA.
     - **Local-branch upstream** (`branch.<name>.remote` configured as
       the literal string `"."`, via `git branch
       --set-upstream-to=<other-local-branch>`): `ref` is
       `refs/heads/<other-branch>` — a plain local branch ref, never
       anything under `refs/remotes/` — and `sha` is that other local
       branch's own current tip.

     **This is the entirety of what "upstream SHA" means in BR3, for
     either subcase** — the SHA `@{upstream}`'s own already-resolved
     target already records locally, never a live query to an actual
     remote server. For a remote-tracking upstream specifically, that SHA
     is exactly as fresh as whenever the *user* (not BR3) last ran an
     actual `git fetch`; for a local-branch upstream, it is simply the
     other local branch's current tip. BR3 never runs `git fetch` itself,
     under any circumstance, for either subcase.
   - If either fails (exit 1, no stderr with `-q`): **both `sha` and `ref`
     are `null`** (revised — corrects Round 3 review finding #3: an
     earlier draft of this specification had `ref` fall back to a
     BR3-constructed conventional path,
     `refs/remotes/<remote>/<branch>`, described as a "best-effort
     label" — that fallback is removed entirely, since it is simply
     wrong whenever the unresolvable upstream is a custom-refspec or
     local-branch upstream, neither of which has any real target under
     `refs/remotes/<remote>/<branch>` at all; presenting a fabricated
     path as if it were a real, Git-resolved fact is worse than reporting
     nothing) — while `remote`/`branch` (populated directly from
     `branch.<b>.remote`/`.merge` config in step 1, independent of
     whether `@{upstream}` resolves) remain populated. This is the
     explicit "configured but unresolvable" case: BR3 truthfully reports
     "an upstream is configured, and its identity is `remote`/`branch`,
     but I cannot tell you where its data lives" rather than guessing —
     genuinely distinct from step 1's "no upstream configured" `null`
     case, where the entire `upstream` value is `null`. Verified directly
     against a scratch repository with `branch.main.remote`/`.merge`
     configured but `refs/remotes/origin/main` deleted: step 1 still
     reports the configured remote/branch (config keys are unaffected by
     the tracking ref's deletion), and step 2's `@{upstream}` resolution
     on the now-absent ref fails cleanly with exit 1 and no stderr.

**"Upstream SHA" is therefore precisely and only: the SHA already
recorded, locally, by whatever `@{upstream}` itself resolves to for the
current branch's configured upstream, if any — for the ordinary
remote-tracking-upstream subcase, the local remote-tracking ref's
already-recorded SHA; for the local-branch-upstream subcase, the other
local branch's own current tip — never a live query to an actual remote
server, never triggering a fetch, for either subcase** (revised —
"Remote SHA" is retired as the umbrella term, since it misdescribes the
local-branch-upstream subcase, whose SHA comes from a plain
`refs/heads/` ref, not anything under `refs/remotes/`; "remote-tracking
ref"/"remote SHA" remain the correct, precise terms for the ordinary
majority-case subcase specifically — see step 2 above). If a caller wants
a truly up-to-date remote-tracking-upstream SHA, running `git fetch`
themselves (outside BR3, which never mutates anything) before calling
`inspectHead` is the only way to get one — this is stated explicitly so
no caller misreads `upstream.sha` as always-current.

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

**Whether a branch has a configured upstream is purely a function of
`branch.<b>.remote`/`.merge` config-key presence (revised — corrects
Round 3 review finding #3, which found the previous "no remotes means no
upstream" bullet below a false blanket rule, not merely a restatement of
"no upstream configured"):** both keys present → upstream configured;
either or both absent → `upstream: null`. "No remotes configured at all"
is simply **one way** those keys can end up absent (with no remote
defined, there is usually nothing to point `branch.<b>.remote` at) — it
is not an independent, overriding rule, and it does **not** generalize to
"no remotes implies no upstream" as a blanket claim, because
`branch.<b>.remote` can legitimately be set to the literal string `"."`
(a local-branch upstream, below) with **zero** remotes configured in the
repository at all — a genuinely configured upstream that has nothing to
do with any remote. BR3 never special-cases "how many remotes exist" as
its own signal; it only ever reads the two `branch.<b>.*` config keys.

- **No upstream configured** (`branch.<b>.remote`/`.merge` config keys
  both absent — including, as one way this can happen, a repository with
  no remotes defined at all): `upstream: null`. Not an error.
- **Upstream configured, `@{upstream}` resolves:** `upstream: { remote,
  ref, branch, sha: <40-hex SHA> }`, where `ref` is whatever symbolic
  full name `@{upstream}` itself resolves to (honoring custom fetch
  refspecs and the `remote="."` local-upstream case — see §9's corrected
  method) — never a BR3-constructed `refs/remotes/<remote>/<branch>`
  guess.
- **Upstream configured, `@{upstream}` fails to resolve (revised —
  corrects Round 3 review finding #3):** `upstream: { remote, ref: null,
  branch, sha: null }` — `remote`/`branch` remain populated (config-key
  presence, independent of resolvability), but `ref` is `null`, **not** a
  fallback-constructed `refs/remotes/<remote>/<branch>` guess (an earlier
  draft of this specification used exactly that guess as a "best-effort
  label"; it is removed because it is simply false whenever the
  unresolvable upstream is a custom-refspec or local-branch upstream,
  neither of which has a real target anywhere under
  `refs/remotes/<remote>/<branch>`) — since Git itself has nothing to
  resolve in this case, BR3 reports that truthfully as `null` rather than
  presenting a guess as fact.
- **Upstream is a local branch** (`branch.<name>.remote = "."`): fully
  supported, not a distinct case from BR3's caller's point of view —
  `@{upstream}` resolves such a configuration correctly (verified in
  §9), reporting `ref: refs/heads/<other-branch>` (a **local-branch
  upstream**, per §9's terminology — this SHA is a plain local branch
  ref's tip, never a remote-tracking ref, and this case requires no
  remote to be configured at all) and `sha` from that local branch's own
  current tip. `remote` is reported exactly as Git config stores it (the
  literal string `.`), since BR3 reports facts as Git records them rather
  than translating `.` into some other sentinel.
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
  repairs. **`\` is never treated as an alternate path separator, but it
  is not inert either (revised — corrects Round 3 review finding #4,
  which found the previous "a pattern containing `\` simply will not
  match anything" claim factually wrong, and directly contradicted by
  §16's own documented `picomatch` grammar): `\` is standard glob
  backslash-escape syntax** — `\X` matches a literal `X`, consuming both
  characters as one unit, exactly as `picomatch` (and glob syntax
  generally) always treats it, independent of any of `picomatch`'s
  toggleable options (`nonegate`, `noextglob`, etc. — backslash-escaping
  is baseline grammar, not a feature `picomatch` allows disabling). A
  pattern author who writes a literal `\` intending it as a Windows-style
  separator gets escape semantics instead (e.g. `src\auth\**` is parsed
  as `srcauth` followed by `**`, each `\`-prefixed character consumed as
  an escaped literal) — a config-authoring error worth documenting
  clearly, but not "matches nothing." See §16 for the complete grammar
  this pattern-normalization rule feeds into.
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
- **`?` (single-character wildcard) — added explicitly (Round 3 review
  finding #4, Option A):** `?` matches exactly one character, and — like
  `*` — never crosses a `/`; `src/auth/?.ts` matches `src/auth/a.ts` but
  not `src/auth/ab.ts` or `src/auth/oauth/a.ts`. This is `picomatch`'s
  baseline grammar (not gated by any of the toggleable options this
  specification sets — see §16), and is now explicitly documented as part
  of BR3's supported pattern grammar, alongside `*`/`**`/brackets/braces
  (negation and extglobs remain disabled, §16).

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

**The byte-first parsing pipeline this actually requires (revised —
corrects Round 2 review finding #3, which found that the strict-decode
requirement above is unimplementable as previously written, since nothing
in this specification established that *raw bytes*, rather than an
already-lossily-decoded string, reach that decoding step):** Node's
`child_process.execFile` (§18), when given no `encoding` option (or
`encoding: "utf8"`, its default), decodes `stdout`/`stderr` from raw bytes
to a JS string **itself**, internally, using a **lossy** UTF-8 decode —
exactly the same lossy substitution behavior this section just ruled out,
except happening silently one layer below where a `TextDecoder({fatal:
true})` call could ever see or reject it. By the time `execFile`'s
callback/Promise hands BR3 a `string`, any invalid byte sequence in that
output has **already** been irreversibly replaced with U+FFFD — no
strict decode performed afterward can recover the original bytes or
detect that a replacement occurred, because the information is already
gone. A strict `TextDecoder` call downstream of a default-`encoding`
`execFile` call can therefore never actually fire on the invalid input it
exists to catch.

**The fix: request raw bytes from `execFile`, never pre-decoded strings,
for every BR3 invocation that returns path data.** §18's shared exec
helper must call `execFile` with `encoding: "buffer"` (equivalently,
`encoding: null`) for `resolveRepository`'s plumbing calls that only ever
return non-path data (SHAs, `true`/`false`, ref names — all guaranteed
ASCII, so decoding them via a plain `Buffer.prototype.toString("utf-8")`
afterward is always exact and lossless) *and*, critically, for every
`inspectWorkingTree`/`inspectDiff` invocation, whose stdout contains
actual repository paths. The resulting pipeline is:

1. `execFile(..., { encoding: "buffer" })` returns `stdout` as a raw
   Node `Buffer` — no decoding has happened yet at all.
2. **Byte-level record/field splitting, not string splitting:** the `-z`
   NUL-delimited output is split on byte value `0x00` using
   `Buffer.prototype.indexOf(0x00)` / `.subarray(start, end)` in a loop —
   never `buffer.toString().split("\0")`, which would force exactly the
   lossy whole-buffer decode this section exists to avoid before any
   strict, per-field check could run. Status letters and similarity
   scores (§13 step 4, always plain ASCII) can be read directly off the
   raw bytes (e.g. by comparing the first byte to the ASCII code for
   `A`/`M`/`D`/`R`/`T`/`C`) without decoding at all.
3. **Per-path-field strict decode, only once each field's exact byte
   range is known:** each individual path's byte range (a `Buffer`
   produced by `.subarray()` in step 2, never re-sliced from an
   already-decoded string) is decoded independently via
   `new TextDecoder("utf-8", { fatal: true }).decode(pathBytes)`.
4. **Failure handling:** a `TypeError` thrown by step 3's strict decode
   for any single path field aborts the *entire* containing operation
   (`inspectWorkingTree`/`inspectDiff`) with `MALFORMED_GIT_OUTPUT` — per
   the whole-operation-failure contract already stated above in this
   section (this does not change; only the mechanism producing the
   `TypeError` reliably is new).

This pipeline is **byte-first, not string-first**, end to end: no BR3
code path may call `.toString("utf-8")` (or rely on `execFile`'s default
string decoding) on any buffer that could contain a repository path,
because doing so performs the lossy decode this section forbids before
the strict per-field check ever has a chance to run. §18, §20, §20a, and
§20b are all written to agree with this buffer-first pipeline (not a
string-first one) — see each section for its own restatement.

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
- **Protected-path pattern grammar — explicit, complete, gap-free
  decision (corrects Round 1 review finding #8, which found this
  previously unstated; revised again — corrects Round 3 review finding
  #4, which found the grammar as stated through Round 2 still
  incomplete: it did not account for `picomatch`'s default-active `?`
  single-character wildcard or its standard backslash-escape semantics,
  and directly contradicted §12's then-current, since-corrected claim
  that a pattern containing `\` "simply will not match anything"):** BR3
  chose, deliberately, to **document and support** `?` and
  backslash-escaping as genuine grammar (Option A of the two choices
  Round 3's review raised, over Option B's alternative of pre-rejecting
  any pattern containing `?` or an unescaped `\` via
  `invalidPatterns`) — see the rationale paragraph below the complete
  grammar. BR3's declared-pattern grammar therefore supports **exactly**:
  - `*` — single-segment wildcard (never crosses `/`)
  - `**` — cross-segment wildcard (§12)
  - `?` — single-character wildcard (never crosses `/`) — **added
    explicitly, Round 3 review finding #4**; baseline `picomatch` grammar,
    not gated by any option this specification sets (§12 documents its
    exact matching behavior)
  - backslash-escaping (`\X` matches a literal `X`) — **added explicitly,
    Round 3 review finding #4**; likewise baseline `picomatch` grammar,
    not independently toggleable the way `nonegate`/`noextglob` are (§12
    documents its exact behavior, including the "authored as a Windows
    path separator" config-authoring-error case)
  - bracket/character-class expressions (`[abc]`, `[a-z]`)
  - brace expansion (`{a,b}`, e.g. `src/{auth,payments}/**`)

  and explicitly **disables**:
  - negation patterns (a leading `!`)
  - extglobs (`+(pattern)`, `@(pattern)`, `?(pattern)`, etc.)

  — the latter two via `picomatch`'s own `nonegate: true` and
  `noextglob: true` options. **Rationale for what's disabled:** a
  *protected-path* matcher is security-relevant in exactly the way
  `docs/PROTECTED_SYSTEMS.md` describes (it exists so a change to a
  sensitive path is never silently missed) — negation and extglob
  semantics are the two picomatch features most likely to produce subtle,
  hard-to-audit behavior in this specific context (e.g. a pattern author
  writing `!src/auth/legacy/**` intending to narrow protection, but
  actually broadening what does *not* match in a way that isn't obvious
  from reading the pattern alone). **Rationale for what's kept, including
  `?`/backslash-escape:** bracket expressions and brace expansion carry no
  comparable risk (they only ever narrow or enumerate exact
  character/string alternatives, never invert a match) and are plausibly
  useful for a `config.yml` author (`docs/PROTECTED_SYSTEMS.md`'s own
  example, `src/auth/**`, doesn't need them, but a multi-directory
  protected system like `src/{auth,payments}/**` is a reasonable
  real-world pattern), so they remain enabled. `?` carries the same
  narrow-only character as brackets/braces — it can only ever narrow what
  matches (one more required character), never broaden or invert a
  match — so it presents no comparable audit risk either, and excluding
  it (Option B) would mean adding a bespoke pre-validation step and
  rejecting patterns for a feature that poses no actual security concern,
  purely because it happened to be previously undocumented; documenting
  it accurately (Option A) is the more direct fix. Backslash-escaping is
  not a *feature* a pattern author opts into so much as unavoidable
  baseline glob syntax `picomatch` always applies — `picomatch` provides
  no option to disable it, so Option B's alternative (rejecting patterns
  containing an unescaped `\`) would require BR3 to hand-roll a
  detection pass ahead of `picomatch` for no corresponding safety gain,
  since an escaped literal character is, if anything, more precise (and
  more auditable) than the unescaped character alone would be. With
  `nonegate: true` set, `picomatch` itself rejects a pattern beginning
  with `!` by treating it as a literal (non-negating) character rather
  than special syntax — BR3 relies on this built-in
  behavior rather than pre-scanning patterns for a leading `!` itself.
- **TypeScript typings — final, unconditional decision (revised —
  corrects Round 2 review finding #4, which found the previous
  "implementation must confirm" hedge factually wrong, not merely
  cautious):** `picomatch` does **not** ship its own bundled `.d.ts`
  declarations. Verified directly: `npm view picomatch@4.0.7 --json`
  shows both `types` and `typings` fields absent from the published
  package manifest — there is no bundled-typings fact for implementation
  to "confirm," since the premise was false. The separately-published
  `@types/picomatch` package **does** exist and correctly declares
  `picomatch`'s types (`npm view @types/picomatch@latest version` —>
  `4.0.3`, `types: index.d.ts`). BR3's dependency decision is therefore
  firm and non-deferred: add both `picomatch` (runtime) and
  `@types/picomatch` (dev) — no implementation-time re-confirmation step
  is needed or requested; this specification asserts the fact directly,
  already verified.
- **Dependencies added:** `picomatch` as a **runtime** dependency, and
  `@types/picomatch` as a **development** dependency (pin exact
  caret-range versions at implementation time, per BR2's established
  "record the exact resolved version in `package-lock.json` at
  implementation time, not hard-coded in the spec" convention). **This
  specification proposes both dependencies; it does not install either**
  (§18, §22).

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
| `NOT_A_GIT_REPOSITORY` | `git rev-parse --is-bare-repository` (§8 step 2) fails because `projectRoot` is not inside any Git repository at all, or `--show-toplevel` (§8 step 3) fails unexpectedly after step 2 already succeeded | Expected |
| `PROJECT_ROOT_MISMATCH` | `projectRoot` is inside a real Git repository, but is not that repository's root (§8 step 3) | Expected — `details` names the actual resolved toplevel |
| `BARE_REPOSITORY_UNSUPPORTED` | `git rev-parse --is-bare-repository` reports `true` for `projectRoot` (§8 step 2) | Expected |
| `HEAD_UNAVAILABLE` | `git symbolic-ref -q HEAD` (§9) exits with a code other than 0 (normal branch) or 1 (detached HEAD) — verified as exit 128 for genuine `.git/HEAD` corruption. This is the exact same trigger §9 defines for this determination; there is no second, independent mechanism. `git rev-parse --verify -q HEAD` (also used by §9, for the unborn/has-commits distinction) fails identically (exit 128, same underlying corruption) for this same case, but `symbolic-ref -q HEAD` always runs first in §9's control flow and classifies it as `HEAD_UNAVAILABLE` before `rev-parse --verify -q HEAD` is even reached — verified directly, no additional or undiscovered failure mode exists beyond what `symbolic-ref`'s exit code already catches | Exceptional — this indicates repository corruption BR3 cannot meaningfully recover from; still returned as a typed `GitResult` failure (never a raw uncaught exception reaching a caller), but callers should treat it as unusual, not routine |
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
- **`encoding: "buffer"` (equivalently, `encoding: null`), explicitly set
  on every `execFile` call — added per Round 2 review finding #3.**
  `execFile`'s default (`encoding: "utf8"`, i.e. omitting the option)
  makes Node decode `stdout`/`stderr` from raw bytes to a JS string
  **internally, using a lossy UTF-8 decode that silently substitutes
  U+FFFD for invalid byte sequences** — before BR3's own code ever sees
  the output. This is exactly the kind of silent, irreversible data loss
  §13's path-byte-semantics contract forbids, and it happens one layer
  below where any downstream strict-decode check (`TextDecoder({fatal:
  true})`) could ever detect or reject it. Every BR3 `execFile` call
  therefore requests raw `Buffer` output unconditionally — including
  calls whose output is guaranteed ASCII (SHAs, `true`/`false`,
  `--is-bare-repository`'s output, etc.), where decoding the resulting
  buffer via a plain, non-strict `Buffer.prototype.toString("utf-8")`
  afterward is always exact and lossless (ASCII is a strict subset of
  UTF-8) — for uniformity of the shared helper's contract, not because
  those specific calls are at risk. Only the path-bearing calls
  (`inspectWorkingTree`, `inspectDiff`) actually exercise the
  strict-decode failure path (§13); see §13 for the full byte-first
  parsing pipeline this option exists to enable.
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

- **`env` construction — genuinely sanitized, not `{ ...process.env, ... }`
  spread verbatim (revised — corrects Round 3 review finding #2, which
  found the previous `{ ...process.env, LC_ALL: "C", ... }` design a real
  vulnerability: any inherited `GIT_*`-prefixed environment variable —
  `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_CONFIG_GLOBAL`, the
  `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_*`/`GIT_CONFIG_VALUE_*`
  config-injection mechanism, etc. — passes straight through a
  `process.env` spread into every BR3-invoked Git subprocess, silently
  overriding §8's already-validated `projectRoot`/`cwd`.** Verified
  directly, in a real two-repository fixture (`repoA`, a commit
  `172d99c...`; `repoB`, an unrelated repo with commit `7d9fc77...`), with
  `cwd` set to `repoA`:
  ```
  $ cd repoA && GIT_DIR=<repoB>/.git git rev-parse HEAD
  7d9fc77c574039219d3e2c66ff8b7ce8cecabade
  exit=0
  ```
  This is `repoB`'s HEAD, not `repoA`'s — a bare inherited `GIT_DIR`
  silently redirects every Git command BR3 issues to an entirely
  different repository than the one `projectRoot`/`cwd` names, undermining
  every root-validation (§8) and read-only guarantee this specification
  makes, since the redirected repository is never validated by §8 at all.
  A separately-verified inherited `GIT_INDEX_FILE` pointed at a second
  repository's index produces an immediate, confusing `fatal: unable to
  read <object>` failure when the two repositories' object stores don't
  overlap (verified directly) — and would silently read the wrong index
  entirely if they did — neither outcome is acceptable for a tool whose
  entire purpose is trustworthy repository inspection. The construction
  algorithm is therefore, unconditionally, in this exact order:
  1. **Start from `process.env`.**
  2. **Strip every inherited environment variable whose name begins with
     the literal prefix `GIT_`**, via a genuine prefix-based filter (e.g.
     `Object.fromEntries(Object.entries(process.env).filter(([k]) =>
     !k.startsWith("GIT_")))`) — **not** an enumerated blocklist of
     specific variable names. `GIT_DIR`, `GIT_WORK_TREE`,
     `GIT_INDEX_FILE`, `GIT_COMMON_DIR`, `GIT_OBJECT_DIRECTORY`,
     `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_CEILING_DIRECTORIES`,
     `GIT_DISCOVERY_ACROSS_FILESYSTEM`, `GIT_CONFIG`,
     `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_*`/
     `GIT_CONFIG_VALUE_*`, `GIT_CONFIG_GLOBAL`, and `GIT_CONFIG_SYSTEM`
     are the specific threats this section verifies below, but they are
     **illustrative of the threat class, not an exhaustive list this
     filter enumerates** — Git adds new `GIT_*`-prefixed environment
     variables across releases, and a name-by-name blocklist would need
     updating every time one is added; a blanket prefix strip has no such
     maintenance burden and no such gap.
  3. **Explicitly re-add only the specific `GIT_*` variables BR3 itself
     sets and controls**, listed individually below — never restoring any
     of the stripped, inherited values.
  4. **Add the non-`GIT_*` determinism variables** (`LC_ALL`, `LANG`)
     listed below.

  The final, explicit set of `GIT_*` variables BR3 re-adds after the strip
  (step 3 above) is:
  - **`GIT_PAGER: "cat"`** — see the no-pager bullet below.
  - **`GIT_TERMINAL_PROMPT: "0"`** — see the credential-prompt bullet
    below.
  - **`GIT_OPTIONAL_LOCKS: "0"`** — **new (Round 3 review finding #1)**;
    see the "Read-only guarantee" bullet immediately below for the exact
    mechanism and verified evidence.
  - **`GIT_CONFIG_NOSYSTEM: "1"`** — prevents an unusual machine-wide
    system-level Git config from silently altering behavior in a way this
    specification cannot anticipate.
  - **`GIT_CONFIG_GLOBAL: <a platform-appropriate null device, i.e.
    Node's `os.devNull`>`** — **new (Round 3 review finding #2)**; see the
    "Global Git config neutralization" bullet below for the exact
    mechanism and verified evidence.

  Together, steps 1–4 mean the final `env` passed to every BR3 `execFile`
  call is `process.env` **minus every `GIT_*`-prefixed key, unconditionally**,
  **plus** exactly the five `GIT_*` keys named above **plus** `LC_ALL`/
  `LANG` — never a wholesale `{ ...process.env }` spread with ad-hoc
  additions layered on top. This is constructed once, in the one shared
  `internal/exec.ts` helper (§18) — not per call site — so there is
  exactly one place in the codebase this sanitization could regress.

- **Read-only guarantee — the actual enforcement mechanism, named
  explicitly (revised — corrects Round 3 review finding #1, which found
  that BR3's "read-only" claim was previously aspirational/architectural
  only — restricting *which* Git subcommands are invoked — with no
  mechanism actually preventing one of those permitted subcommands,
  `status`, from silently mutating `.git/index` as an ordinary,
  documented Git side effect):** `git status` (and, more generally, any
  Git command that performs an "index refresh," updating the cached stat
  information — mtime, size — for tracked files whose content is
  unchanged but whose filesystem metadata has changed since the index was
  last written) rewrites `.git/index` on disk **even though no ref,
  working-tree content, or user-visible state changes** — Git's own
  well-known, documented opportunistic-write behavior, not a bug. Left
  unaddressed, this would make BR3's own read-only guarantee false for
  `inspectWorkingTree` specifically, in a way invisible to any
  semantic-output-based test (the *reported* `WorkingTreeStatus` is
  identical either way — only the raw index bytes on disk change).
  **Verified directly**, against a real fixture repository with one
  committed, unchanged file whose mtime is touched (content untouched)
  between each step:
  ```
  $ shasum -a 256 .git/index                     # baseline, after priming
  64703ebd...
  $ touch file.txt                                 # mtime only, content unchanged
  $ git status --porcelain=v2 -z >/dev/null        # no GIT_OPTIONAL_LOCKS override
  $ shasum -a 256 .git/index
  f7c99e90...                                       # CHANGED — index was rewritten
  $ touch file.txt                                 # mtime only, again
  $ GIT_OPTIONAL_LOCKS=0 git status --porcelain=v2 -z >/dev/null
  $ shasum -a 256 .git/index
  f7c99e90...                                       # UNCHANGED — no further rewrite
  ```
  **`GIT_OPTIONAL_LOCKS=0`** (re-added after the `GIT_*` strip above, per
  step 3) is the confirmed, sufficient mechanism: it instructs Git to skip
  every opportunistic lock-and-write it would otherwise perform
  automatically during operations like `status`, including the index
  refresh above. This is BR3's actual, mechanical read-only guarantee for
  `inspectWorkingTree` (and, defensively, every other BR3 Git
  invocation) — not merely "BR3 only calls read-oriented subcommands," but
  "every BR3 Git invocation is additionally instructed, at the process
  level, never to write anything to `.git/` as a side effect of running."
  A dedicated regression test detecting actual index-byte mutation (not
  merely semantic-result stability) is required (§20).
- **Global Git config neutralization — new (Round 3 review finding #2),
  while repository-local config remains honored:** stripping inherited
  `GIT_*` variables (above) closes the environment-injection surface, but
  a **file-based** `~/.gitconfig`/XDG global config is a separate,
  filesystem-resident source Git consults regardless of environment
  variables, and an unusual or malicious global config (e.g. a
  `core.excludesFile` entry) can silently alter BR3's own output (e.g.
  which paths `inspectWorkingTree` reports as untracked) in a way this
  specification's determinism guarantee (below) exists to rule out. The
  mechanism: **`GIT_CONFIG_GLOBAL` set to a platform-appropriate null
  device (Node's `os.devNull` — `/dev/null` on POSIX, `\\.\NUL` on
  Windows)** — this tells Git to read its "global" config layer from a
  location guaranteed to contain nothing, while leaving the
  repository-local `.git/config` layer (and any `-c`/environment-injected
  config BR3 does not itself use) completely untouched, since
  `GIT_CONFIG_GLOBAL` only ever substitutes for the global layer, never
  the local one. **Verified directly**, with a fixture "global" config
  containing a distinctive marker and a repo-local `user.email` override:
  ```
  $ GIT_CONFIG_GLOBAL=<fake-global-gitconfig> git config --get distinctive.marker
  FROM_FAKE_GLOBAL                                  # sanity check: the override IS read by default
  exit=0
  $ git config user.email local-repo-email@example.com   # set repo-local config
  $ GIT_CONFIG_GLOBAL=<fake-global-gitconfig> git config --get user.email
  local-repo-email@example.com                      # repo-local config still visible/wins
  $ GIT_CONFIG_GLOBAL=/dev/null git config --get distinctive.marker
  exit=1                                             # nothing printed — global config neutralized
  $ GIT_CONFIG_GLOBAL=/dev/null git config --get user.email
  local-repo-email@example.com                      # repo-local config STILL visible — unaffected
  ```
  and, specifically for the `core.excludesFile` scenario Round 3 review
  finding #2 names:
  ```
  $ echo "ignored-by-global.txt" > file.txt && git status --porcelain=v2 --untracked-files=all
  ? ignored-by-global.txt                            # untracked file correctly reported
  $ GIT_CONFIG_GLOBAL=<fake-global-config-declaring-core.excludesFile> \
      git status --porcelain=v2 --untracked-files=all
                                                       # (empty — the file vanished from output)
  $ GIT_CONFIG_GLOBAL=/dev/null git status --porcelain=v2 --untracked-files=all
  ? ignored-by-global.txt                            # correctly reported again once neutralized
  ```
  This confirms both halves: a fabricated global `core.excludesFile`
  genuinely does alter `inspectWorkingTree`-equivalent output when left
  unaddressed, and `GIT_CONFIG_GLOBAL=<null device>` genuinely restores
  correct, config-injection-free reporting. Repository-local Git config
  remains fully valid and continues to be read normally where BR3
  intentionally consumes it (e.g. `branch.<b>.remote`/`.merge`, §9/§10) —
  this mechanism only neutralizes the *global* layer, never the local one.
  Four dedicated regression tests (inherited `GIT_DIR`, inherited
  `GIT_INDEX_FILE`, `GIT_CONFIG_COUNT`-style env injection, and fabricated
  global `core.excludesFile`) are required (§20).
- **`LC_ALL: "C"`, `LANG: "C"`** — forces the POSIX/C locale, purely
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

**Repository root (§8) — required cases below prove reachability under
the corrected algorithm (Round 1 review finding #1's submodule
regression, and Round 2 review finding #1's bare-repository/
subdirectory-mismatch unreachability regression — both fixed in §8's
current validation algorithm)**
- Valid repository root resolves successfully
- Non-Git directory → `NOT_A_GIT_REPOSITORY`
- **Directory that is a subdirectory of a real Git repository, but not
  its root** → `PROJECT_ROOT_MISMATCH`, with `details` naming the actual
  toplevel — this specific case is the Round 2 regression test: under
  the previous (removed) `<projectRoot>/.git`-existence precheck, this
  fixture would have incorrectly produced `NOT_A_GIT_REPOSITORY` instead,
  since a non-root subdirectory has no `.git` of its own; this test
  proves `PROJECT_ROOT_MISMATCH` is genuinely reachable under the
  corrected §8 algorithm
- **Bare repository** (created via `git init --bare`) →
  `BARE_REPOSITORY_UNSUPPORTED`, detected via `--is-bare-repository`
  reporting `true` — also a Round 2 regression test: under the previous
  (removed) precheck, a bare repository (which has no `.git` subdirectory
  of its own — its own root directly contains `HEAD`/`objects`/`refs`)
  would have incorrectly produced `NOT_A_GIT_REPOSITORY` instead of ever
  reaching the bare-repository check at all; this test proves
  `BARE_REPOSITORY_UNSUPPORTED` is genuinely reachable under the
  corrected §8 algorithm
- **Linked worktree** (created via `git worktree add` against a real
  fixture repository with at least one commit) → succeeds,
  `isWorktree: true`, and `gitDir !== gitCommonDir` in the returned
  `RepositoryInfo`
- **Submodule checkout** (created via `git submodule add` against a real
  fixture superproject + a separate fixture submodule source repository)
  → succeeds, **`isWorktree: false`** (the Round 1 regression case — an
  earlier draft's algorithm would have incorrectly reported `true` here),
  and `gitDir === gitCommonDir` in the returned `RepositoryInfo`
- Nonexistent `projectRoot` path → `PROJECT_ROOT_NOT_FOUND`

**Branch + HEAD (§9, §10) — determination method revised, corrects Round
1 review findings #2 and #5, and Round 2 review finding #2 (upstream
resolution redesigned again to use `@{upstream}` rather than a
hand-constructed `refs/remotes/<remote>/<branch>` path)**
- Normal branch with commits → correct `branch`, `headSha`, `detached: false`, `unborn: false`
- Detached HEAD (checked out to a SHA) → `branch: null`, `detached: true`, correct `headSha`
- Unborn branch (fresh `git init`, zero commits) → `unborn: true`,
  `headSha: null`, correct pending `branch` name — the specific
  regression test proving this is derived from
  `symbolic-ref -q HEAD`/`rev-parse --verify -q HEAD` exit codes alone
  (§9), not from any stderr text
- No upstream configured (`branch.<branch>.remote`/`.merge` config both
  absent) → `upstream: null`
- **Repository has no remotes configured at all, but `branch.<b>.remote`
  is set to `"."` (a local-branch upstream)** → `upstream` is genuinely
  configured and resolves correctly (`remote: "."`, correct
  `branch`/`ref`/`sha`) — the specific Round 3 regression test proving
  "no remotes" is not treated as an overriding "no upstream" rule (§10)
- **Upstream configured with a real local remote-tracking ref present,
  under Git's default fetch refspec** (e.g. `git remote add`, `git fetch`
  against a local bare repository used purely as an in-test fixture
  "remote," or an equivalent local setup — never a real network fetch) →
  correct `remote`/`branch`/`ref`/`sha`, resolved via `@{upstream}` (§9)
- **Upstream configured under a custom fetch refspec** (e.g.
  `remote.origin.fetch` rewritten to land tracking refs under a
  non-standard namespace instead of `refs/remotes/<remote>/`, then
  fetched) → correct `sha`, with `ref` reflecting the actual custom
  namespace `@{upstream}` resolves to, not a `refs/remotes/...` guess —
  the specific Round 2 regression test proving the previous
  hardcoded-path design is not used
- **Upstream is a local branch** (`branch.<name>.remote` configured as
  `"."`, via `git branch --set-upstream-to=<other-local-branch>`) →
  correct `sha` (the other local branch's own tip) and `ref` reflecting
  the resolved `refs/heads/<other-branch>` path — the second Round 2
  regression test, proving the local-upstream case (which has no
  `refs/remotes/` entry at all) is correctly supported
- **Upstream configured (ordinary remote-tracking, default refspec),
  remote-tracking ref subsequently removed** (e.g. via
  `git update-ref -d refs/remotes/<remote>/<branch>` in the fixture's own
  setup — the exact scenario a naive `@{upstream}`-only design, with no
  separate config check, could not distinguish from "no upstream
  configured" at all) → `sha: null`, **`ref: null`** (revised — corrects
  Round 3 review finding #3; previously specified as falling back to a
  constructed `refs/remotes/<remote>/<branch>` guess), `remote`/`branch`
  still correctly populated from config (§9/§10)
- **Upstream configured under a custom fetch refspec, the custom-namespace
  tracking ref subsequently removed** (e.g. `remote.origin.fetch`
  rewritten to a non-standard namespace, fetched, then that
  custom-namespace ref deleted via `git update-ref -d`) → `sha: null`,
  `ref: null`, `remote`/`branch` still correctly populated — the specific
  Round 3 regression test proving the removed fallback is not
  reconstructed for the custom-refspec subcase either (§9/§10)
- **Upstream is a local branch (`remote="."`), the target local branch
  subsequently deleted** (`git branch --set-upstream-to=<other-branch>`,
  then `git branch -D <other-branch>`) → `sha: null`, `ref: null`,
  `remote: "."`/`branch` still correctly populated — the specific Round 3
  regression test proving the removed fallback is not reconstructed for
  the local-branch-upstream subcase either, which never had a
  `refs/remotes/` entry to begin with (§9/§10)
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
  final byte-semantics decision) → the defined typed outcome
  (`MALFORMED_GIT_OUTPUT`, §13) is produced, never silent corruption,
  never a crash, never a JS string containing Unicode replacement
  characters presented as if it were the real path. This test is only
  meaningful, and only reachable at all, because the shared exec helper
  requests `encoding: "buffer"` (§18) — a regression test should also
  confirm (e.g. via a focused unit test against the byte-splitting helper
  itself, independent of a real Git invocation) that raw, undecoded
  `Buffer` data reaches the strict per-path `TextDecoder` check, never an
  already-lossily-decoded string (Round 2 review finding #3)

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
- **`?` (single-character wildcard) — new, Round 3 review finding #4,
  Option A:** a declared pattern using `?` (e.g. `src/auth/?.ts`) matches
  a path with exactly one character in that position (`src/auth/a.ts`)
  and does **not** match zero or two-or-more characters there
  (`src/auth/.ts`, `src/auth/ab.ts`), and does **not** match across a `/`
  boundary (`src/auth/a/b.ts` does not match `src/auth/?.ts`) — three
  dedicated assertions within one test or as separate cases
- **Backslash-escape semantics — new, Round 3 review finding #4, Option
  A:** a declared pattern containing `\X` (e.g. `src/auth\-legacy/**`,
  escaping a literal hyphen) matches exactly the literal, unescaped
  string it encodes (`src/auth-legacy/**`'s target paths) — confirming
  `\` is genuinely treated as glob escape syntax, not as an inert
  separator-like character and not as "matches nothing" (the now-corrected
  claim §12 previously made)
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
- **Index-mutation regression — mandatory, new (Round 3 review finding
  #1):** against a fixture repository with one committed, unchanged
  tracked file, snapshot `.git/index`'s raw bytes (or a hash of them)
  before calling `inspectWorkingTree`; touch that tracked file's mtime
  without changing its content; call `inspectWorkingTree`; snapshot
  `.git/index` again and assert the bytes/hash are **byte-for-byte
  unchanged**. This detects actual index mutation directly — unlike the
  bullet above (which only proves BR3's *reported result* is stable
  across repeated calls), this test would fail if `inspectWorkingTree`
  silently rewrote `.git/index` on disk as a side effect even while still
  reporting the same semantic `WorkingTreeStatus` each time — exactly the
  gap `GIT_OPTIONAL_LOCKS=0` (§19) exists to close.
- **Environment-sanitization regressions — mandatory, new (Round 3 review
  finding #2), four dedicated cases:**
  - **(A) Inherited `GIT_DIR` cannot redirect repository inspection:**
    with two real, unrelated fixture repositories on disk, set an
    inherited `GIT_DIR` environment variable (in the *test process's*
    own environment, not passed through any BR3 API parameter) pointing
    at the second repository's `.git`, then call `resolveRepository`/
    `inspectHead` with `projectRoot` set to the first repository. Assert
    the result reflects the **first** repository (`projectRoot`'s own
    HEAD SHA, branch, etc.), never the second — proving BR3's `env`
    construction (§19) strips the inherited `GIT_DIR` before spawning
    Git, rather than letting it pass through.
  - **(B) Inherited `GIT_INDEX_FILE` cannot redirect working-tree
    inspection:** analogous to (A), but with an inherited `GIT_INDEX_FILE`
    pointing at a second repository's index, calling `inspectWorkingTree`
    against the first repository's `projectRoot`. Assert the reported
    `WorkingTreeEntry[]` reflects the first repository's own index/working
    tree, never the second's.
  - **(C) `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_0`/`GIT_CONFIG_VALUE_0`-style
    injected config has no effect:** first confirm, in the test's own
    setup (not as part of asserting BR3's behavior), that this
    environment-based config-injection mechanism genuinely works against
    a bare `git config` invocation when those three variables are set
    (proving the threat is real, not hypothetical); then call a BR3
    function (e.g. `inspectHead`, whose §9/§10 upstream determination
    reads `branch.<b>.remote`/`.merge` via `git config --get`) with those
    same three variables set in the inherited test-process environment,
    injecting a config value BR3 does not expect, and assert BR3's result
    is unaffected — proving BR3's `env` construction (§19) strips these
    before spawning Git.
  - **(D) A fabricated global `core.excludesFile` does not change
    untracked-path reporting:** with a fixture repository containing one
    untracked file, and a fixture "global" gitconfig file (pointed at via
    an inherited `GIT_CONFIG_GLOBAL`/`HOME`-style environment variable in
    the test's own setup, never a real machine-wide config) declaring a
    `core.excludesFile` that would exclude that untracked file, call
    `inspectWorkingTree` twice — once with that fabricated global config
    reachable in the inherited environment, once without — and assert
    **identical** results both times (the untracked file reported in
    both cases), proving BR3's own `GIT_CONFIG_GLOBAL=<null device>`
    override (§19) neutralizes the inherited global config regardless of
    what the surrounding environment supplies.

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
  fixtures for each (§20). In particular, `BARE_REPOSITORY_UNSUPPORTED`
  and `PROJECT_ROOT_MISMATCH` are each genuinely **reachable** — not
  pre-empted by an earlier, less-specific `NOT_A_GIT_REPOSITORY` result —
  under §8's algorithm, which asks Git itself (`--is-bare-repository`,
  `--show-toplevel`) rather than relying on any BR3-side filesystem-shape
  precheck (§8, Round 2 review finding #1).
- **B.** `inspectHead` correctly reports all three branch/HEAD states
  (normal, detached, unborn) and all upstream states — not configured,
  configured and resolving (both the remote-tracking and the
  local-branch subcase), and configured but unresolvable (`ref: null`,
  `sha: null`, `remote`/`branch` still populated — never a
  fallback-constructed `refs/remotes/<remote>/<branch>` guess, for any of
  the three configured-but-unresolvable shapes: ordinary remote-tracking,
  custom-refspec, or local-branch upstream) — and correctly treats
  "no remotes configured" as merely one way `branch.<b>.remote`/`.merge`
  can be absent, never as an overriding rule that a local-branch
  (`remote="."`) upstream with zero remotes configured is somehow not a
  real upstream — with every classification derived from exit codes
  and/or machine-readable output only — never from inspecting
  human-readable stderr text (§9, §10).
- **C.** "Upstream SHA" is precisely and only whatever `@{upstream}`
  itself already resolves to locally — the local remote-tracking ref's
  already-recorded SHA for the ordinary/custom-refspec subcase, or the
  other local branch's own tip for the local-branch-upstream subcase; no
  BR3 code path ever invokes `git fetch` or otherwise contacts a network
  endpoint, proven by running the full BR3 suite with network access
  disabled (§9, §10, §20).
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
  dropping them, and correctly implements the final, complete picomatch
  feature grammar (negation and extglobs disabled; `*`, `**`, `?`,
  backslash-escaping, brace expansion, and bracket expressions all
  enabled — §16, Round 3 review finding #4, Option A) (§7a, §12, §16,
  §17).
- **H.** Zero Git mutation occurs anywhere in the implementation — every
  Git subcommand string used is one of `status`, `diff`, `rev-parse`,
  `symbolic-ref`, `config` (read-only `--get` only), and no others (§5,
  §6, §27); **and** the read-only guarantee is genuinely mechanically
  enforced, not merely a consequence of subcommand choice — `.git/index`
  is byte-for-byte unchanged after `inspectWorkingTree` even when a
  tracked file's mtime (but not content) changed beforehand, proven by
  the dedicated index-mutation regression test (§20, Round 3 review
  finding #1), via `GIT_OPTIONAL_LOCKS=0` (§19).
- **I.** Every Git subprocess is invoked via `execFile` with an argv
  array — never a shell, never string concatenation — with the exact
  determinism `env`/flags (§19) applied at exactly one shared call site
  (§18); **and** that `env` is genuinely sanitized, not a wholesale
  `process.env` spread — every inherited `GIT_*`-prefixed variable is
  stripped via a prefix filter, with only BR3's own five controlled
  `GIT_*` variables (`GIT_PAGER`, `GIT_TERMINAL_PROMPT`,
  `GIT_OPTIONAL_LOCKS`, `GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL`)
  re-added, and global (non-repository-local) Git config is neutralized
  via `GIT_CONFIG_GLOBAL` pointed at a null device — proven by the four
  dedicated environment-sanitization regression tests (§20, Round 3
  review finding #2: inherited `GIT_DIR`, inherited `GIT_INDEX_FILE`,
  `GIT_CONFIG_COUNT`-style injection, fabricated global
  `core.excludesFile` — none of which may alter BR3's result).
- **J.** A path that is not valid UTF-8 produces `MALFORMED_GIT_OUTPUT`
  for the containing operation — never silent corruption, never an
  uncaught decoding exception, and never a partial/filtered result
  presented as complete (§13).
- **K.** No **runtime** dependency beyond `picomatch` was added, and no
  **development** dependency beyond `@types/picomatch` was added (§16,
  §22) — both were verified as genuinely required (picomatch ships no
  bundled types) rather than deferred/hedged decisions; no
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
   `ProtectedSystem` type) and the `picomatch` runtime dependency plus its
   `@types/picomatch` dev-dependency typings (§16, §22) — has no
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

**Runtime dependency:** exactly one new runtime dependency is proposed,
`picomatch` (§16), justified above. No other new runtime dependency is
proposed.

**Development dependency (revised — corrects Round 2 review finding #4,
which found the previous "no other dependency" claim incomplete):**
exactly one new development dependency is proposed, `@types/picomatch`
(§16) — required because `picomatch` itself ships no bundled TypeScript
declarations (verified directly, §16). `@types/node` (already a
`devDependency`) already covers `node:child_process`'s TypeScript types —
no separate `@types/*` package is needed for `execFile` itself.

**This specification proposes both dependencies. It does not install
either.** `npm install` for `picomatch` and `@types/picomatch` occurs
only once BR3 implementation is separately authorized, exactly mirroring
BR2's own "§20.3: No dependencies are installed by this specification"
precedent.

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
- Whether the shared exec helper's `env` (§18, §19) is genuinely
  constructed by stripping every inherited `GIT_*`-prefixed variable
  (via a prefix filter, not an enumerated blocklist) and re-adding only
  BR3's own five controlled `GIT_*` variables — never a wholesale
  `{ ...process.env }` spread — proven by the four dedicated real
  regression tests (§20, Round 3 review finding #2): an inherited
  `GIT_DIR` cannot redirect `resolveRepository`/`inspectHead` to a
  different repository; an inherited `GIT_INDEX_FILE` cannot redirect
  `inspectWorkingTree` to a different index; `GIT_CONFIG_COUNT`-style
  environment-based config injection has no effect on any BR3 result;
  and a fabricated global `core.excludesFile`, reachable via
  `GIT_CONFIG_GLOBAL`, does not change `inspectWorkingTree`'s
  untracked-path reporting — with repository-local Git config (e.g.
  `branch.<b>.remote`/`.merge`) still correctly read in every case
- Whether BR3's read-only guarantee is genuinely mechanically enforced
  via `GIT_OPTIONAL_LOCKS=0` (§19, Round 3 review finding #1), not merely
  a byproduct of which Git subcommands are invoked — proven by the
  dedicated index-mutation regression test (§20) asserting `.git/index`'s
  raw bytes are unchanged by `inspectWorkingTree` even when a tracked
  file's mtime (not content) changed beforehand — a check that inspects
  actual index bytes, not merely BR3's reported semantic result
- Whether a ref string shaped like a Git command-line option (e.g.
  `--upload-pack=...`) passed as `DiffRequest.fromRef`/`.toRef` is
  genuinely rejected as `REF_NOT_FOUND` before ever reaching a `diff`
  invocation — not merely documented as rejected
- Whether `resolveRepository`'s toplevel-mismatch check (§8) actually
  distinguishes "not a repository at all" from "inside a repository but
  not its root," with a real fixture directory structure proving the
  distinction, not merely a single collapsed test
- Whether `resolveRepository`'s validation algorithm (§8) genuinely asks
  Git itself at every step (`--is-bare-repository`, `--show-toplevel`,
  `--git-dir`/`--git-common-dir`) with no BR3-side filesystem-shape
  precheck (e.g. a `<projectRoot>/.git`-existence check) short-circuiting
  ahead of those Git calls — and whether `BARE_REPOSITORY_UNSUPPORTED`
  and `PROJECT_ROOT_MISMATCH` are each proven genuinely reachable by a
  dedicated real fixture (a true bare repository; a true non-root
  subdirectory), not merely asserted
- Whether `inspectHead`'s upstream resolution (§9, §10) uses
  `git rev-parse --verify -q @{upstream}` (and
  `--symbolic-full-name @{upstream}`) for tracking-ref resolution — never
  a hand-constructed `refs/remotes/<remote>/<branch>` path, including on
  the failure path (i.e., a configured-but-unresolvable upstream produces
  `ref: null`, not a fallback-constructed guess) — proven by a real
  fixture using a custom `remote.<name>.fetch` refspec and a second real
  fixture using a local-branch upstream (`branch.<name>.remote = "."`),
  both resolving correctly, plus three further real fixtures — an
  ordinary, a custom-refspec, and a local-branch upstream, each with its
  resolution target subsequently deleted — each correctly producing
  `ref: null`/`sha: null` with `remote`/`branch` still populated, never a
  reconstructed path
- Whether `inspectHead`'s "no upstream configured" determination (§10) is
  genuinely derived only from `branch.<b>.remote`/`.merge` config-key
  presence, never from "how many remotes exist" as an independent or
  overriding signal — proven by a real fixture with zero remotes
  configured but a local-branch upstream (`remote="."`) present, which
  must report a genuinely configured, resolving `upstream`, not `null`
- Whether every `execFile` call site in `packages/core/src/git/`
  (via the shared `internal/exec.ts` helper, §18) requests
  `encoding: "buffer"` — never the default lossy string decoding — and
  whether the working-tree/diff parsing pipeline (§13) genuinely operates
  byte-first (NUL-splitting on raw `Buffer` data, strict per-path
  `TextDecoder` decode only after byte-range isolation), never calling
  `.toString("utf-8")` on a buffer that could contain a repository path
  before that strict check runs
- Whether exactly the two dependencies proposed in §16/§22 —
  `picomatch` (runtime) and `@types/picomatch` (dev) — and no others,
  were added; and whether `@types/picomatch` was genuinely needed (i.e.
  `picomatch` itself ships no usable bundled `.d.ts`)
- Whether §17's `HEAD_UNAVAILABLE` error-table row states the same exact
  trigger §9 defines (`symbolic-ref -q HEAD` exiting with a code other
  than 0 or 1) — not a stale reference to a different command or
  mechanism
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
- Whether `matchProtectedPaths`'s pattern grammar (§12, §16) is exactly
  and completely the documented set — `*`, `**`, `?`, backslash-escaping,
  bracket expressions, and brace expansion all genuinely functional, with
  negation and extglobs genuinely disabled (matched literally, not
  thrown, not silently no-op) — proven by dedicated fixtures for each,
  including `?`'s never-crosses-`/` behavior and backslash-escape's
  literal-match behavior specifically (Round 3 review finding #4)
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
- Whether `inspectHead`'s "upstream SHA" (for either subcase —
  remote-tracking or local-branch) is genuinely never derived from a
  network call — proven by running the full BR3 test suite with network
  access disabled (or an equivalent structural check) and confirming
  every upstream-SHA test still passes using only already-local refs
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
