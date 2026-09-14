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
- determine the upstream identity and upstream SHA, when one exists
  (revised — corrects Round 4 review finding #7, reconciling this
  summary line with §9/§10's terminology, which already distinguishes a
  remote-tracking upstream from a local-branch upstream as two named
  subcases — see §10), without ever contacting the network
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
- Upstream identity and upstream SHA detection (covering both the
  ordinary remote-tracking subcase and the local-branch subcase — §9,
  §10; revised, corrects Round 4 review finding #7), entirely from local
  repository state — no network access (§9, §10)
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
  remote, and never blocks on network I/O (§6), including Git's own
  automatic promisor-object lazy-fetch mechanism, disabled unconditionally
  via `GIT_NO_LAZY_FETCH=1` (§19, Round 5 review finding #1).
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
  | "unstaged_add" | "unstaged_modify" | "unstaged_delete" | "unstaged_rename" | "unstaged_type_change"
  | "untracked"
  | "conflicted";
  // "unstaged_add" added, Round 8 review finding #1 — the intent-to-add
  // case (porcelain v2 `1 .A`, per §11): a path staged via `git add -N`
  // (content itself not staged) has no real committed/staged blob to
  // compare against yet, so Git reports it via the ordinary-changed
  // record type with Y=A, distinct from both `untracked` (no index
  // entry at all) and `unstaged_modify` (a real staged blob exists to
  // compare against).

interface WorkingTreeEntry {
  kind: WorkingTreeEntryKind;
  path: string;              // repository-relative, normalized per §8's path rules
  oldPath?: string;            // present only for staged_rename/unstaged_rename —
                                // unstaged_rename added, Round 6 review finding #6
  similarity?: number;         // present only for staged_rename/unstaged_rename — see §14
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

**Canonical result ordering — new, mandatory (Round 4 review finding
#1):** `git status --porcelain=v2` does not document or guarantee a
stable output order across repository states, and `matchProtectedPaths`'s
own output order would otherwise depend directly on the caller-supplied
`inputs`/`protectedSystems` arrays' own order — meaning
`WorkingTreeStatus.entries`, `DiffResult.changes`, and
`ProtectedPathMatchResult.matches` were, before this round, unordered
arrays whose element order silently depended on incidental factors,
violating §19's determinism promise at the array-ordering level (even
though each individual entry's content was already correct). BR3 now
applies an exact, total, stable sort to each of these three result
arrays as the **last step** of the corresponding function — after all
parsing/classification is complete, immediately before return, never
interleaved with parsing — so two semantically-identical repository
states (or semantically-identical `matchProtectedPaths` inputs) always
produce deep-equal, identically-ordered arrays:

- **`WorkingTreeStatus.entries`:** sorted by, in order: (1) `path`,
  compared as a plain ordinal/byte-order string comparison (`<`/`>`/`===`
  on the JS string, **never** locale-aware comparison via
  `Intl.Collator`/`String.prototype.localeCompare` — locale-aware
  comparison would reintroduce exactly the kind of environment-dependent
  behavior §19 exists to eliminate, since collation rules vary by
  configured locale); (2) `kind`, ranked by this fixed, total,
  alphabetical order over every `WorkingTreeEntryKind` value: `conflicted`,
  `staged_add`, `staged_delete`, `staged_modify`, `staged_rename`,
  `staged_type_change`, `unstaged_add`, `unstaged_delete`,
  `unstaged_modify`, `unstaged_rename`, `unstaged_type_change`,
  `untracked` (alphabetical by the literal string value — simple, total,
  and requires no separate hand-maintained priority table to keep in
  sync as kinds are added; `unstaged_rename` added, Round 6 review
  finding #6; `unstaged_add` added, Round 8 review finding #1A); (3)
  `oldPath` (present only for
  `staged_rename`/`unstaged_rename`; treated as the empty string `""` for
  every entry where it is absent, so this key is always comparable) —
  handling, for total-order completeness, the theoretical case of two
  `staged_rename` (or two `unstaged_rename`) entries sharing the same
  `path` but differing `oldPath`, even though no real Git repository
  state has been found to produce this. No further tie-breaker is
  needed: `path` + `kind` + `oldPath` uniquely identifies every possible
  `WorkingTreeEntry` this specification defines (a given `path` can
  appear at most once per `kind`, since Git's own porcelain v2 output
  never emits two records of the identical kind for the identical path).
- **`DiffResult.changes`:** sorted identically in structure — by (1)
  `path` (ordinal string comparison), (2) `kind`, ranked by this fixed
  alphabetical order over every `DiffChangeKind` value: `added`,
  `deleted`, `modified`, `renamed`, `type_changed`, (3) `oldPath` (present
  only for `kind: "renamed"`; `""` when absent).
- **`ProtectedPathMatchResult.matches`:** sorted by (1) `path` (ordinal
  string comparison), (2) `matchedVia`, with `"path"` ordered before
  `"oldPath"` (matching this document's own consistent ordering
  convention of presenting the current-side case before the
  old-side-of-rename case throughout §7a/§12), (3) `system.name` (ordinal
  string comparison), (4) `system.status` (ordinal string comparison over
  the fixed `ProtectedSystemStatus` value, e.g. `"frozen"` vs. `"guarded"`
  vs. `"locked"` vs. `"open"`), (5) `system.paths`, canonicalized as a
  single string by joining each entry (each individually normalized: `/`
  separators, no leading `./`, no leading `/` — the identical
  normalization §12 already applies to matching input, applied here
  purely for comparison purposes and never mutating the `system` value
  actually returned) with a single `\n` separator, compared ordinally,
  (6) the matched `ProtectedSystem`'s own original index within the
  caller-supplied `protectedSystems` array, as the final tie-break —
  **corrected, Round 5 review finding #3: `system.name` is *not*
  guaranteed unique.** An earlier draft of this section asserted
  `config.schema.json`'s `protectedSystem` shape (§3) guarantees
  `system.name` uniqueness; it does not — §3's schema excerpt requires
  only that `name` be a non-empty string, imposes no `uniqueItems`-style
  constraint across `protected_systems`, and separately permits
  `additionalProperties: true` on each entry, so two distinct,
  legitimately-configured `ProtectedSystem` entries can share an
  identical `name` while differing in `status`, `paths`, or any
  additional, schema-permitted property. Keys (1)–(3) alone are
  therefore not a total ordering: two matches with identical `path`,
  `matchedVia`, and `system.name` — but drawn from two distinct
  `ProtectedSystem` entries — would previously compare equal, leaving
  their relative order in the returned `matches` array dependent on
  whatever order the underlying sort happened to preserve for equal
  keys, rather than on any key this specification actually defines.
  Keys (4) and (5) resolve every tie two distinct `ProtectedSystem`
  entries can produce through any of their *schema-meaningful*, own
  fields this specification's `ProtectedPathMatch.system` value exposes;
  key (6), the original `protectedSystems` array index, is the final,
  unconditional tie-break for the residual case where two entries are
  identical across (3)–(5) as well (identical `name`, `status`, and
  `paths`, differing only in some `additionalProperties` field this
  specification does not itself inspect for sorting purposes) — this
  is possible precisely because the schema's `additionalProperties: true`
  (§3) means BR3 cannot enumerate every field a caller's config might
  legitimately set. **Using original array index as this final
  tie-breaker is a deliberate design choice, not an oversight:**
  `protected_systems` array order is, by this choice, considered part of
  the caller's own input state and is therefore stable, and part of the
  matching result's contract, for one identical `protectedSystems`
  array/config across repeated `matchProtectedPaths` calls — exactly
  mirroring how `WorkingTreeStatus.entries`/`DiffResult.changes`'s own
  determinism guarantee (§19) is scoped to "identical repository state
  produces identical output," not "output is independent of every
  possible input representation." A caller that reorders its own
  `protected_systems` config between two calls is supplying a genuinely
  different `protectedSystems` array, and this specification makes no
  claim of index-independent output stability across that kind of input
  change — only across repeated calls with the *same* array. This
  document does **not** add a schema-level uniqueness constraint on
  `protected_systems[].name` — the config schema is BR0/BR2-owned, and
  changing it is outside this specification-only correction (§1); BR3
  instead defines a total ordering that remains correct and fully
  deterministic regardless of whether any future schema change ever adds
  such a constraint.

This sort is pure, synchronous, in-process array sorting — it requires no
additional Git invocation, no additional I/O, and is independently unit
testable against hand-constructed input arrays with zero Git/filesystem
setup, exactly mirroring `matchProtectedPaths`'s own existing purity
(§16). For `matchProtectedPaths` specifically, this final sort is the
one and only place its result order is decided — the function's own
internal matching loop may process `inputs`/`protectedSystems` in
whatever order is convenient; only the returned `matches` array's order
is contractually canonical. §20 adds the required tests.

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

0. **Git capability floor check — new, Round 6 review finding #3, binding
   corrected Round 7 review finding #3, runs before every other step,
   including the `fs.stat` in step 1:** confirm the installed `git`
   binary satisfies BR3's minimum supported version before relying on any
   version-dependent behavior this specification assumes
   (`GIT_NO_LAZY_FETCH`/`--no-lazy-fetch`, in particular — §19). See the
   dedicated "Git Capability Floor" subsection immediately below for the
   exact mechanism, verified evidence, and the complete list of BR3
   features reviewed against the chosen minimum version. On failure:
   `GIT_VERSION_UNSUPPORTED` (§17) — distinct from
   `GIT_EXECUTABLE_UNAVAILABLE` (a `git` binary that cannot be found/
   spawned at all vs. one that is found, spawns, and reports a version
   BR3 does not support) and distinct from every other `resolveRepository`
   outcome (this check does not depend on `projectRoot` being a
   repository, or even existing, at all — it is a property of the `git`
   binary itself). **This check, and every subsequent Git invocation in
   the same `resolveRepository` call (and every I/O-performing BR3
   function that call's success unlocks), is bound to the identical
   resolved executable identity** — the capability result is never
   trusted for a later call whose own resolved `git` executable path
   differs from the one actually validated (see the "Git Capability
   Floor" subsection's binding-mechanism correction below); this is what
   makes it structurally impossible for `resolveRepository` to validate
   one Git binary and have a later step silently execute a different,
   unvalidated one.
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
   - **If the command fails (non-zero exit), a secondary, filesystem-based
     classification runs to distinguish a plain non-Git directory from a
     real-but-malformed/damaged repository (new — corrects Round 4 review
     finding #4, which found that every non-zero exit from this command
     was previously collapsed into `NOT_A_GIT_REPOSITORY` unconditionally,
     even though a genuinely real repository can also make this exact
     command fail non-zero, for reasons unrelated to "this directory isn't
     a Git repository at all"):** verified directly — a repository with a
     syntactically-malformed `.git/config` (an unterminated `[section`
     line) produces **the identical exit code (128)** as a plain
     non-Git directory:
     ```
     $ git rev-parse --is-bare-repository   # malformed .git/config in a real repo
     fatal: bad config line 8 in file .git/config
     exit=128
     $ git rev-parse --is-bare-repository   # a plain, non-Git directory
     fatal: not a git repository (or any of the parent directories): .git
     exit=128
     ```
     **The exit code alone cannot distinguish these two cases** — per
     §19/§9's determinism discipline, BR3 never inspects stderr text to
     tell them apart either. The distinguishing signal instead comes from
     a filesystem-shape check performed *after* this Git command has
     already failed (this is explicitly not a reintroduction of the
     Round-2-removed early `.git`-existence precheck, which ran *before*
     any authoritative Git command and could short-circuit
     `BARE_REPOSITORY_UNSUPPORTED`/`PROJECT_ROOT_MISMATCH` detection; this
     check runs only as a fallback once step 2's own Git invocation has
     already, authoritatively, failed):
     - **Check two distinct candidate repository shapes — corrected,
       Round 5 review finding #4: the previous version of this check
       recognized only the non-bare shape, which made a malformed
       *bare* repository (one with no `.git` child at all, by
       definition) incorrectly fall through to
       `NOT_A_GIT_REPOSITORY`, even though it is a real, existing Git
       repository, exactly the false-negative category this secondary
       classifier exists to catch:**
       - **Non-bare shape:** `<projectRoot>/.git` exists at all (as
         either a directory or a file — covering both an ordinary
         repository and a worktree/submodule-style `.git` file) **and**,
         if it is a directory, whether it has the basic shape of a real
         Git directory (at minimum, a `HEAD` entry directly inside it —
         verified present in an ordinary repository's `.git/`, including
         the malformed-config fixture above, whose `.git/HEAD` remains
         perfectly intact even though `.git/config` is broken).
       - **Bare shape — new, Round 5 review finding #4, corrected to be
         ref-backend-aware, Round 6 review finding #5:** a real bare
         repository (`git init --bare`) has **no** `.git` child at all —
         its own metadata (`HEAD`, `objects/`, and its ref storage,
         `config`) sits directly inside `projectRoot` itself. So,
         independently of the non-bare check above, also check whether
         `projectRoot` itself has the shape of a bare repository root:
         `projectRoot/HEAD` exists as a file, **and** `projectRoot/objects`
         exists as a directory, **and** `projectRoot` has ref storage in
         **either** of the two ref-backend shapes Git supports — never
         `HEAD` alone, which is too weak a signal on its own to
         distinguish a genuine bare-repository root from an unrelated
         directory that merely happens to contain a file named `HEAD` for
         some other reason; this mirrors the same "real Git directory
         shape, not just one filename" discipline the non-bare check
         already applies to `.git/`, now correctly generalized across
         both ref backends instead of assuming only one:
         - **Traditional (`files`) ref backend:** `projectRoot/refs`
           exists as a directory — the shape Round 5 of this
           specification originally, and correctly for that backend,
           checked.
         - **`reftable` ref backend — new, Round 6 review finding #5:** a
           bare repository initialized with the `reftable` ref storage
           format (`git init --bare --ref-format=reftable`, available at
           BR3's 2.45.0 capability floor — the "Git Capability Floor"
           subsection above) does **not** store refs as a populated tree
           of loose files under `refs/heads/`/`refs/tags/`/etc. the way
           the traditional backend does; instead, ref data lives in
           `projectRoot/reftable/` (containing a `tables.list` index file
           plus one or more `.ref` table files). Git still creates an
           empty `projectRoot/refs/` directory alongside `reftable/` for
           structural/compatibility reasons in current Git versions, so
           `refs/`'s mere *presence* does not by itself distinguish the
           two backends — the reftable-specific, positively-identifying
           signal checked here is `projectRoot/reftable` existing as a
           directory containing a `tables.list` file, checked as an
           **alternative** ref-storage signal alongside (not replacing)
           the traditional `refs/`-directory check: `projectRoot` is
           recognized as a bare-repository-root shape if `HEAD` and
           `objects/` are present **and** (`refs/` is present **or**
           `reftable/tables.list` is present) — an "either ref backend"
           combination, not a single hardcoded assumption about which
           backend a real bare repository uses.
         **Verified directly, for the traditional-backend case:** a real
         bare repository created via `git init --bare`, then malformed by
         truncating/breaking its own `config` file (an unterminated
         `[section` line, the identical malformation technique used for
         the non-bare fixture above), reproduces the identical failure
         shape as the non-bare case — `git rev-parse --is-bare-repository`
         run against it fails with exit 128, `<projectRoot>/.git` is
         (correctly, for a bare repository) absent, yet `projectRoot/HEAD`
         remains present (bare-repository config damage does not touch
         `HEAD`, exactly as non-bare config damage does not touch
         `.git/HEAD`) alongside intact `objects/`/`refs/` directories —
         so the bare-shape check above positively identifies this as a
         real, malformed repository rather than a plain non-Git
         directory. **The identical reasoning applies to a `reftable`-backend
         bare repository malformed the same way** (`config` broken,
         `HEAD`/`objects/`/`reftable/tables.list` left intact by that
         specific malformation) — verified by the same construction
         technique, substituting `--ref-format=reftable` at `git init
         --bare` time and checking for `reftable/tables.list` instead of
         a populated `refs/` tree.
         - **Healthy `reftable` repositories: BR3 v0.1 does not support
           them, decided now, not deferred — Round 7 review finding #1.**
           This bare-shape classifier's own job (the post-Git-failure
           secondary check) remains narrow and unchanged by this
           decision: it exists only to correctly attribute an
           *already-failed* `--is-bare-repository` call to "real but
           malformed repository" rather than "no repository at all,"
           and it already, correctly, recognizes a malformed `reftable`
           repository via the `reftable/tables.list` alternative above.
           A **healthy** `reftable` repository — one where
           `--is-bare-repository`/`--show-toplevel`/etc. all succeed
           normally — is a **separate** case this classifier never even
           reaches (it only ever runs after a Git command has already
           failed); that case is handled by a new, dedicated,
           positive ref-storage-format check added to `resolveRepository`'s
           main algorithm itself — see step 5b below, immediately after
           the object-format check (step 5a).
     - If **neither** the non-bare shape **nor** the bare shape is
       present: this is a genuine plain non-Git directory →
       `NOT_A_GIT_REPOSITORY` (unchanged from before).
     - If **either** shape is present (non-bare `<projectRoot>/.git`, or
       bare `projectRoot/HEAD`+`objects/`+(`refs/` or
       `reftable/tables.list`)) but the authoritative
       `--is-bare-repository` call still failed: this is a real, existing
       Git repository — bare or non-bare — that BR3 cannot successfully
       inspect for a specific, different reason — malformed local config
       being the verified case for both shapes, filesystem-permission
       failures reading the repository's own metadata being a
       structurally identical unverified-but-plausible case for either.
       This is reported as `GIT_COMMAND_FAILED` (§17's existing catch-all
       code — deliberately **not** a new, more specific code, and
       deliberately the *same* code for both the bare and non-bare
       malformed subcase, since BR3 has no more specific, actionable
       response to offer a caller for one shape than the other: the
       underlying cause is open-ended, exactly matching
       `GIT_COMMAND_FAILED`'s existing "Expected as a result shape, but
       the underlying cause is inherently open-ended" definition), with
       `details` carrying the captured stderr for diagnosis. Note this is
       deliberately **not** `BARE_REPOSITORY_UNSUPPORTED` — that code is
       reserved for step 2's *successful* `true` result (§8's "Bare
       repositories" decision below), i.e. a bare repository BR3 can
       positively confirm is bare and simply does not support; a bare
       repository whose config is too damaged for `--is-bare-repository`
       to even complete is, instead, "a real repository exists here, but
       BR3 cannot safely determine anything about it, bare or not" —
       `GIT_COMMAND_FAILED` is the honest classification, not a
       confident-but-unverified `BARE_REPOSITORY_UNSUPPORTED` guess.
       `resolveRepository` never proceeds past this point once this
       outcome is reached — no later step assumes a Git command that has
       already failed this way can somehow still succeed.
     - **Unsafe/dubious ownership** (Git's own "detected dubious ownership
       in repository at ..." safety feature, triggered when the
       repository directory's owner differs from the current process
       user — common in CI/container environments where a repository is
       mounted from a different UID) is, by Git's own well-documented,
       stable behavior, a further instance of this same
       real-repository-that-fails category: `<projectRoot>/.git` genuinely
       exists and has the correct shape, yet `--is-bare-repository` (and
       every other Git command against that `cwd`) fails, deterministically,
       until the directory is added to `safe.directory` — a config-layer
       decision this specification does not make on a caller's behalf.
       **This scenario could not be constructed as a real, portable
       fixture in this correction round** (it requires genuinely differing
       file ownership, which is not reliably constructible in an ordinary
       development/CI sandbox) — its typed behavior is specified directly
       from Git's own documented, stable error contract rather than a
       fresh verified repro: it folds into the same `<projectRoot>/.git`-exists-but-command-failed
       bucket above (`GIT_COMMAND_FAILED`), not a distinct code, since
       BR3 has no more specific, actionable response to offer a caller
       for it than for a malformed-config repository — both are "a real
       repository exists here, but BR3 cannot safely proceed," and BR3
       does not attempt to auto-remediate either (e.g. by writing to a
       caller's global `safe.directory` config itself, which would be a
       mutation squarely outside BR3's read-only boundary, §4/§6).
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
   - **If this fails: `GIT_COMMAND_FAILED`, not `NOT_A_GIT_REPOSITORY`
     — corrected, Round 6 review finding #7.** An earlier draft of this
     algorithm classified an unexpected step-3 failure as
     `NOT_A_GIT_REPOSITORY`, reasoning it "should not be reachable" — but
     that classification is internally inconsistent, not merely
     defensive: step 2 has, by this point, already **positively and
     successfully** established, via an authoritative Git call, that
     `projectRoot` **is** a real, non-bare Git repository
     (`--is-bare-repository` printed `false`, exit 0). `NOT_A_GIT_REPOSITORY`
     asserts the opposite — that `projectRoot` is not inside any Git
     repository at all — which cannot be true at this point without
     contradicting step 2's own, already-accepted result. An unexpected
     `--show-toplevel` failure this late in the algorithm is instead a
     signal that something about this *already-confirmed-real* repository
     is now failing in a way BR3 did not more specifically anticipate —
     exactly `GIT_COMMAND_FAILED`'s existing "a real repository exists,
     but BR3 cannot successfully inspect it for a specific, different
     reason" definition (§17, the same definition step 2's own malformed-
     repository secondary classification already relies on), not a
     "no repository" outcome. This remains a defensive, not-expected-to-
     be-reached fallback for an edge case step 2 does not itself
     anticipate — only its *typed outcome* changes, from
     `NOT_A_GIT_REPOSITORY` to `GIT_COMMAND_FAILED`. `NOT_A_GIT_REPOSITORY`
     remains reserved, throughout this entire algorithm, for the genuine
     no-repository case §8's post-step-2-failure secondary classification
     determines (steps 2's own failure branch above) — never for a
     failure reached only after Git itself has already confirmed a real
     repository exists.
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
5a. **Object-format (SHA-1 vs. SHA-256) validation — new, Round 6 review
    finding #4.** Run `git rev-parse --show-object-format` (same `cwd`) —
    a machine-readable, single-word Git fact (`sha1` or `sha256`,
    available from Git 2.29, below BR3's 2.45.0 floor — see the "Git
    Capability Floor" subsection above) naming the repository's actual
    configured object hash algorithm (`git init --object-format=sha256`
    creates a genuinely different repository shape, where every object ID
    — commit/tree/blob SHA — is a 64-hex-character string, not the
    40-hex-character string this specification's public types (`HeadInfo.
    headSha`, `UpstreamInfo.sha`, `DiffResult.fromSha`/`.toSha`, §7a) and
    BuildRail's own existing BR0/BR2 `state.schema.json` (which
    constrains approved baseline SHAs to the `^[0-9a-f]{40}$` pattern)
    both already, contractually assume). **BR3 v0.1 supports SHA-1
    repositories only** — this is a deliberate, narrow scope decision,
    not an oversight: broadening every BR3 SHA-shaped field (and, by
    extension, BuildRail's own baseline-SHA governance model in
    `state.schema.json`) to accommodate 64-character SHA-256 object IDs
    is a cross-phase, BR0/BR2-governance-affecting change this
    specification-only correction round does not have authorization to
    make (§1) — it would require separate Human Owner authorization,
    exactly as a `config.schema.json`/`state.schema.json` change would
    for any other phase. `state.schema.json` is **not** modified by this
    correction, and no 40-character-SHA contract anywhere in this
    document is silently broadened to also accept 64 characters.
    - If `--show-object-format` prints exactly `sha1`: continue —
      `resolveRepository` proceeds exactly as this specification
      otherwise documents.
    - If it prints `sha256`, or any other value BR3 does not recognize as
      `sha1`: fail with the new, dedicated `UNSUPPORTED_OBJECT_FORMAT`
      error code (§17), with `details` naming the actual reported object
      format. `resolveRepository` never proceeds past this point for such
      a repository — no later step (`inspectHead`, `inspectWorkingTree`,
      `inspectDiff`) is ever reached against a non-SHA-1 repository, so
      no BR3 public field can ever silently receive a 64-character value
      truncated, mistaken for, or otherwise confused with a 40-character
      SHA-1 value.
    - This check runs once per `resolveRepository`-validated
      `projectRoot`, after the worktree/submodule shape determination
      (step 5) and before `resolveRepository` returns success — a
      repository's object format is a fixed, per-repository property
      that cannot meaningfully change between BR3 calls against the same
      `projectRoot` within one process lifetime, so this is a
      per-repository check, not a per-operation one (implementation may
      cache it alongside the other `resolveRepository`-derived facts for
      that `projectRoot`).
5b. **Ref storage format validation — new, Round 7 review finding #1,
    resolving Round 6's deferred question now.** BR3's chosen minimum
    Git version (≥2.45.0, §8's "Git Capability Floor" subsection) is at
    or above the Git release that integrated the `reftable` ref-storage
    backend as a selectable, healthy repository format
    (`git init --ref-format=reftable`), which stores ref data in
    `reftable/` table files instead of the traditional per-ref loose
    files under `refs/heads/`/`refs/tags/`/etc. **BR3 v0.1's final
    decision: healthy `reftable`-backend repositories are explicitly,
    positively rejected, not silently misclassified and not silently
    treated as ordinary, fully-supported repositories.** This is a
    deliberate v0.1 scope decision, chosen for the same reason as the
    SHA-1-only decision above (step 5a): BR3's working-tree/HEAD/diff
    inspection mechanisms throughout this specification (porcelain v2
    parsing, `@{upstream}` resolution, `symbolic-ref`, etc.) have not
    been independently re-verified against a `reftable`-backend
    repository, and this correction round does not have the scope to
    perform that verification — narrowing to a known-supported ref
    backend (the traditional `files` backend, universally what every
    existing verified example, fixture, and reproduction in this entire
    specification already uses) is the honest, conservative choice,
    exactly mirroring the SHA-1-only rationale.
    - **Detection mechanism:** run `git config --get
      extensions.refStorage` (same `cwd`, genuinely read-only — a bare
      `--get`, already the identical config-query primitive §9/§10/§18
      use elsewhere in this specification) — Git records a repository's
      selected ref-storage backend in this repository-local config key;
      its absence (exit 1, no stdout — the ordinary case for the
      traditional backend, which does not need to declare itself) means
      `files`, and a value of `reftable` means the `reftable` backend is
      active. This is a genuinely machine-readable, single-value config
      fact — not a porcelain/human-oriented Git output — read via the
      same `config --get` mechanism and read-only discipline this
      specification already applies throughout (§9, §10, §18).
    - **Fail-closed decision contract — corrected, mandatory, Round 8
      review finding #5.** An earlier draft of this step defined only
      two outcomes (absent/`files` → supported, `reftable` →
      `UNSUPPORTED_REF_FORMAT`), leaving undefined behavior for any
      value this Git floor's future evolution might introduce. BR3's
      supported floor is `Git ≥ 2.45.0` **with no maximum version** — a
      future Git release may introduce a third (or later) ref-storage
      backend BR3 has never heard of, and `git config --get
      extensions.refStorage` would then report that new value verbatim.
      **BR3 must not have undefined behavior, and must not silently
      proceed, for any such value.** The complete, exhaustive decision
      contract:
      - **Key absent** (exit 1, no stdout): supported — the ordinary,
        traditional `files` backend, which does not need to declare
        itself via this key. `resolveRepository` proceeds exactly as
        this specification otherwise documents.
      - **Value exactly `files`** (exit 0, stdout `files`): supported —
        the traditional backend, explicitly declared. `resolveRepository`
        proceeds identically to the absent-key case.
      - **Any present value other than `files`** — including `reftable`,
        and including **any future backend value this specification does
        not yet know about** (e.g. a hypothetical `future-backend`
        string a later Git release might introduce): `UNSUPPORTED_REF_FORMAT`
        (§17), with `details` containing the actual reported value
        verbatim. `resolveRepository` never proceeds past this point for
        any such repository — no later step (`inspectHead`,
        `inspectWorkingTree`, `inspectDiff`) is ever reached. This is a
        **fail-closed, allowlist-shaped decision** (`files` is the only
        value that passes; everything else — known or not-yet-invented
        — fails) rather than a **fail-open, denylist-shaped** one
        (`reftable` is the only value that fails; an unrecognized future
        value would otherwise silently pass) — the allowlist shape is
        what makes this correct against Git versions and ref-storage
        backends that do not exist yet, without requiring a future
        correction round merely to keep pace with Git's own evolution.
      - **The `git config --get extensions.refStorage` command itself
        fails for any reason other than the ordinary "key absent" exit-1
        result** (e.g. a config-read failure distinct from simple
        absence): `GIT_COMMAND_FAILED` (§17) — **BR3 never infers
        `files`-backend support from an arbitrary command failure**; a
        failure this step does not specifically recognize as "key
        genuinely absent" is reported as the general, open-ended
        catch-all, exactly mirroring how every other BR3 config/rev-parse
        query in this specification already distinguishes "genuinely
        absent" from "command failed for an unanticipated reason" (§9,
        §10, §17).
    - **Malformed repository where Git cannot read its config at all
      (the post-Git-failure case):** unaffected by this step — this
      check only runs once Git has already positively recognized
      `projectRoot` as a real, non-bare repository (i.e., after step 2
      has already succeeded), so a repository whose config is too
      damaged for Git to answer this query at all is instead classified
      by the existing, already-ref-backend-aware post-Git-failure
      secondary classifier (step 2's own failure branch, above), which
      continues to recognize both the `files`-backend
      (`<projectRoot>/.git`-based) and `reftable`-backend
      (`reftable/tables.list`-based) malformed-bare shapes and reports
      `GIT_COMMAND_FAILED`, never `NOT_A_GIT_REPOSITORY` — this step
      never overrides or races against that earlier, distinct
      classification path, since this step is unreached whenever that
      earlier path has already determined the outcome.
    - This check runs once per `resolveRepository`-validated
      `projectRoot`, immediately after step 5a's object-format check
      (the two share the same "positively-recognized, healthy repository,
      narrow-v0.1-scope-decision" character and are naturally sequenced
      together) and before `resolveRepository` returns success — a
      repository's ref-storage format is a fixed, per-repository property,
      so this is a per-repository check, not a per-operation one
      (implementation may cache it alongside step 5a's result).
6. If the Git executable itself cannot be located/spawned at any point
   in steps 2–5b (`ENOENT` from the underlying `child_process` call, or
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

**Git Capability Floor — new, Round 6 review finding #3, binding
mechanism and version wording corrected, Round 7 review finding #3.**
BR3's own security/correctness guarantees increasingly depend on
specific Git *features*, not merely "some Git is installed" — most
acutely, `GIT_NO_LAZY_FETCH`/`--no-lazy-fetch` (§19, Round 5 review
finding #1), which is available starting in the Git 2.45 release —
**not** a later 2.46-only feature; the previous draft of this section
incorrectly described it as first appearing in "the Git 2.46 release
cycle" while simultaneously choosing 2.45.0 as the floor, an internally
inconsistent statement this round corrects. `--no-lazy-fetch`/
`GIT_NO_LAZY_FETCH` genuinely exists at 2.45.0 itself, so the chosen
floor is exact, not merely a nearby approximation with an unexplained
margin. **Setting `GIT_NO_LAZY_FETCH=1` in the environment of an older
`git` binary that does not understand it is not a safe no-op to rely on
implicitly** — an unrecognized environment variable is simply ignored by
an older Git, meaning the lazy-fetch network-suppression guarantee this
specification makes (§6, §19) would silently not hold against such a
binary, with no error, no signal, and no way for a caller to know. BR3
must not merely set the variable and assume the installed Git
understands and enforces it; it must **positively confirm** the
installed Git is new enough before relying on that guarantee (or any
other version-dependent behavior) at all — and, per this round's
correction below, confirm it against the *exact same* `git` binary every
subsequent command in that operation actually invokes, not merely
*some* `git` that once resolved via `PATH`.

- **Chosen floor: Git ≥ 2.45.0.** This is BR3 v0.1's supported Git
  floor — exact, not approximate — chosen as the precise version at
  which every version-dependent feature this specification currently
  relies on (enumerated in the reviewed-features list below) is already
  available, with no feature requiring a later version.
- **Detection mechanism: deterministic version parsing of `git
  --version`'s machine-readable-enough numeric output — not a feature
  probe.** `git --version` prints a single line whose format is stable
  and simple enough to parse safely and deterministically (`git version
  X.Y.Z` or `git version X.Y.Z.<platform-suffix>` on some distributions),
  unlike the general run of "human-oriented" Git porcelain output this
  specification otherwise forbids parsing (§13, §19) — it is a single,
  short, version-numbering line with a long-stable, documented format,
  not free-form diagnostic text whose *content* some other BR3 decision
  would depend on. **This is the one, narrow, explicitly-named exemption
  to this specification's "no human-oriented Git output is ever parsed"
  rule (§13)** — every path-bearing repository fact BR3 reports still
  comes exclusively from machine-readable, NUL-safe, or exit-code-only
  sources (porcelain v2, `-z`-delimited output, `--stage` index records,
  exit codes); only this one, narrowly-scoped, non-path-bearing,
  version-string line is parsed, and only to extract a dotted numeric
  version for a `>=` comparison, never to branch on arbitrary diagnostic
  text content.
  - **Parsing algorithm:** extract the numeric `X.Y.Z` (or `X.Y.Z.W`)
    sequence following the literal prefix `git version `, and compare
    `(X, Y, Z)` against `(2, 45, 0)` component-wise (major, then minor,
    then patch — `Z`/`W` beyond the third component is ignored for
    comparison purposes, since BR3's floor is expressed to the patch
    level only). A version at or above `2.45.0` passes; anything below
    fails.
  - **Malformed/unexpected version output:** if `git --version`'s stdout
    does not match the expected `git version <digits>.<digits>.<digits>`
    prefix shape at all (an unrecognized/non-standard build string,
    packaging metadata BR3 did not anticipate, etc.), this is **not**
    silently treated as either "supported" or "unsupported" by guessing —
    it is reported as `GIT_VERSION_UNSUPPORTED` as well (§17), with
    `details` naming the actual unparseable output for diagnosis. BR3
    never assumes an unrecognized version string is new enough merely
    because it failed to parse; failing closed (refusing to proceed) is
    the only safe default when the capability floor itself cannot be
    confirmed.
  - **Command failure/executable unavailable remains distinct:** if `git
    --version` itself cannot be spawned (`ENOENT`), this is
    `GIT_EXECUTABLE_UNAVAILABLE`, exactly as for any other BR3 Git
    invocation (§17) — never conflated with `GIT_VERSION_UNSUPPORTED`,
    which requires the binary to have actually run and reported *some*
    version output.
  - **No repository mutation during this check:** `git --version` reads
    no repository state at all, so this check has no interaction with
    `.git/index`/`GIT_OPTIONAL_LOCKS`/any other read-only guarantee this
    specification makes elsewhere.
  - **`cwd` — an explicit, narrow exception in the shared exec primitive,
    corrected, Round 7 review finding #3 (the previous draft's "no `cwd`
    requirement" claim directly contradicted §18's own "every `execFile`
    call uses `cwd: projectRoot`" contract, which the capability check —
    running *before* `projectRoot` is even confirmed to exist, per step
    0 below — cannot possibly satisfy):** the shared `internal/exec.ts`
    helper (§18) treats the capability-check invocation as one explicit,
    narrowly-scoped exception to its otherwise-universal `cwd:
    projectRoot` contract, using `cwd: process.cwd()` (or any fixed,
    caller-independent directory) instead, since `git --version` reads no
    repository state and genuinely has no dependency on any particular
    working directory. This is documented as a single, named exception
    in the exec primitive's own contract (§18) — not a silent,
    unstated inconsistency between §8 and §18 — precisely because this
    is the *only* BR3 Git invocation that runs before a `projectRoot` is
    available to serve as `cwd` at all.
  - **Binding to the exact executable identity actually invoked —
    corrected again, mandatory, Round 8 review finding #2 (Round 7's
    "resolved executable path" framing is not implementable as stated
    and is withdrawn):** Round 7 of this specification proposed keying
    the capability-result cache on "the resolved executable path"
    `execFile("git", [...])` produces, describing this as something the
    shared exec primitive could "observe and record" from Node's own
    internal resolution with no new resolution step. **This is false for
    Node's `child_process` API and is withdrawn:** **verified directly**
    against Node 22.16.0 — `execFile("git", ["--version"], cb)`'s
    returned `ChildProcess` exposes `spawnfile === "git"` and
    `spawnargs[0] === "git"`, the literal, unresolved command string —
    Node does **not** expose the absolute, `PATH`-resolved executable
    target anywhere on the object it returns; Node's own documented
    behavior is that executable lookup happens using
    `options.env.PATH`/the platform's own resolution rules internally,
    with the resolved absolute path never surfaced back to the caller.
    There is nothing to "observe" — Round 7's mechanism has no data
    source.

    **A second, independent problem with resolving identity from `PATH`
    alone:** a `PATH` containing a *relative* entry (e.g. `.`) can
    resolve the identical literal command `"git"` to genuinely different
    executables depending solely on the child process's `cwd` —
    **verified directly**: with `PATH=.`, `cwd=/tmp/A` resolves `./git`
    to one binary while `cwd=/tmp/B` resolves `./git` to a different
    one, with the `PATH` *string* itself completely unchanged between
    the two calls. Since §18's `cwd` genuinely does vary per call
    (`projectRoot` for ordinary repository operations, a fixed directory
    for the capability probe itself — the very `cwd` exception this
    round's predecessor introduced), a stable `PATH` string alone is
    insufficient to guarantee two calls invoke the same executable
    whenever a relative `PATH` entry is in play.

    **The corrected, implementable contract:** BR3 resolves the `git`
    executable **itself, in process, to one absolute path, before ever
    invoking `execFile`** — not by inspecting anything `execFile`
    returns, but by performing the resolution as an explicit, first-class
    step using Node's own filesystem/path facilities (`node:fs`,
    `node:path`, `node:os` — see §18's dependency note below), and then
    invoking that one resolved absolute path for every subsequent Git
    command, never the literal string `"git"` again for the remainder of
    that resolution's validity:
    1. **Build BR3's sanitized child environment first** (§19's `env`
       construction algorithm — unchanged, still runs first, since
       executable resolution must use the *same* effective `PATH`/
       environment the actual subprocess will run under, not the parent
       Node process's own, potentially different, environment).
    2. **Resolve `git` to one absolute executable path in process**,
       before any `execFile` call, walking the sanitized environment's
       effective `PATH` entries in order and testing each candidate for
       existence/executability (`fs.stat`/`fs.access` with the
       appropriate execute-permission check on POSIX) — this is
       ordinary, safe filesystem inspection, not a subprocess spawn, and
       does not itself invoke `which`/`where`/a shell/any external
       helper (BR3's subprocess boundary remains Git-only, per §18's
       core discipline — resolution is pure Node code, not a delegated
       external lookup).
    3. **Resolution must obey the exact effective child `PATH` semantics
       the actual `execFile` calls will use** — the same sanitized
       environment from step 1, not `process.env` directly, and the same
       relative-vs-absolute `PATH`-entry handling Node/the OS itself
       would apply (a relative `PATH` entry is resolved against the
       *same* `cwd` value that specific invocation will actually use —
       see the `cwd`-dependency note below).
    4. **Windows-specific correctness, explicit:** on Windows, resolution
       must correctly account for (a) the `PATH`/`Path`/`path` environment-
       key **casing** ambiguity (Windows environment variable names are
       case-insensitive; resolution reads whichever casing is actually
       present, never assuming a single canonical spelling — see §19's
       Windows-casing correction below, which this depends on); (b)
       `PATHEXT` (Windows resolves a bare `git` command to a specific
       executable file by trying each extension in `PATHEXT`, e.g.
       `git.exe`, `git.cmd` — BR3's resolution must replicate this, not
       assume a POSIX-style bare-filename match); (c) that the resolved
       candidate is genuinely executable in the platform-appropriate
       sense (an execute-permission check on POSIX; an extension-match
       against `PATHEXT` on Windows, since Windows has no POSIX execute
       bit).
    5. **Canonicalize the selected executable** (`fs.realpath`, resolving
       any symlink in the resolved path itself) where the platform
       supports it, so two `PATH` entries that resolve to the same
       underlying binary via different symlink chains are correctly
       recognized as the identical executable identity.
    6. **Invoke that one resolved, canonicalized, absolute executable
       path — never the literal string `"git"` — for every Git command
       in the same top-level BR3 operation once resolution has
       succeeded:** the capability-floor check itself (`--version`),
       every `resolveRepository` Git call, `inspectHead`,
       `inspectWorkingTree`, `inspectDiff`, `ls-files`, `check-attr`, and
       every nested submodule Git call performed during the same
       top-level operation (§18's recursive submodule enumeration) all
       use the identical resolved path. This is what makes "validate one
       Git binary, execute a different one" structurally impossible —
       there is no second, independent resolution step for any later
       call to diverge through; every later `execFile` call's first argv
       element **is** the already-resolved absolute path, not a fresh
       `"git"` string for Node to resolve again.
    7. **Capability-result caching, if retained, is keyed by this
       resolved, canonicalized executable path** — exactly Round 7's
       intent, now grounded in a value BR3 itself actually computes and
       controls (step 2's own resolution output) rather than a value
       Round 7 incorrectly assumed `execFile` would expose. A subsequent
       top-level BR3 operation **re-resolves** the executable (step 2)
       before deciding whether a cached capability result applies —
       resolution itself is cheap, in-process filesystem inspection, not
       a subprocess spawn, so re-running it per top-level operation is
       not a meaningful cost; only the *capability check itself*
       (`git --version`, an actual subprocess spawn) is worth caching,
       and only against the freshly-resolved path.
- **BR3 features reviewed against the chosen 2.45.0 floor** (every
  version-dependent mechanism this specification relies on, confirmed
  available at or before this floor):
  - `GIT_NO_LAZY_FETCH`/`--no-lazy-fetch` (§19) — the floor-setting
    feature; available from Git 2.45.0 itself (corrected, Round 7 review
    finding #3 — not a later 2.46-only feature).
  - `--end-of-options` (`rev-parse --verify --end-of-options`, §9, §13,
    §18) — a long-stable Git feature, available well before this floor;
    already independently verified working in this specification's own
    correction history (§18), and, as of this round, also applied to
    repository-derived upstream resolution (§9, §10, Round 7 review
    finding #6).
  - Porcelain v2 (`git status --porcelain=v2`, §11) — introduced in Git
    2.11 (2016), far below this floor.
  - `--show-object-format` (`git rev-parse --show-object-format`, §8 step
    5a, Round 6 review finding #4) — available from Git 2.29 (2020), below
    this floor.
  - `extensions.refStorage` config key (§8 step 5b, Round 7 review
    finding #1) — a repository-local config key, readable via the
    already-established `config --get` mechanism at any Git version
    within this floor; no separate version dependency of its own beyond
    the floor already required for `reftable` itself to exist as a
    selectable backend.
  - `git ls-files --stage -z` (§18, Round 6 review finding #2) — a
    long-stable plumbing primitive, available well before this floor.
  - `git check-attr --stdin -z` (§18, Round 7 review finding #4) — a
    long-stable plumbing primitive (NUL-delimited `check-attr` support
    predates this floor by many releases), available well before this
    floor.
  - No ref-backend inspection mechanism beyond ordinary, already-covered
    `--git-dir`/`--git-common-dir`/`--is-bare-repository` machinery is
    introduced by this round (§8's ref-backend-awareness correction,
    Round 6 review finding #5, relies only on filesystem-shape
    inspection of already-established Git-reported directories, not a
    new Git subcommand with its own version floor).
  - No BR3-relied-upon feature in this specification requires a Git
    version above 2.45.0; if a future correction round introduces one,
    that round must either confirm it is already covered by this floor
    or explicitly raise the floor and update this list.

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
| Corrupt HEAD (symbolic-ref resolves to a branch name, but that branch ref does not point at a real, existing commit object) | branch name (from `symbolic-ref`, still reported — the ref name itself is knowable even though it does not resolve to a real commit) | `false` | `false` | `null` | `null` | (see `HEAD_UNAVAILABLE`, below) |

**Determination method — exit codes and machine-readable facts only,
never stderr-text matching (revised — corrects Round 1 review finding
#5, and revised again — corrects Round 4 review finding #5, which found
that `git rev-parse --verify -q HEAD` alone does not actually prove HEAD
resolves to a real, existing commit object: `rev-parse --verify` on a
bare ref only validates that the ref *resolves to some SHA-shaped
string*, not that the SHA names a real object in the object database;
each step below verified against real scratch repositories during this
correction round):**

- **Branch vs. detached vs. genuinely unavailable:** `git symbolic-ref -q
  HEAD` — succeeds (exit 0, prints the branch ref, e.g. `refs/heads/main`)
  for a normal branch (including unborn, and including the newly-added
  corrupt-but-symbolic case below); fails with **exit 1** (**no
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
- **HEAD resolves to a real commit — `HEAD^{commit}`, not bare `HEAD`
  (revised — corrects Round 4 review finding #5):** `git rev-parse
  --verify -q HEAD^{commit}` — the `^{commit}` peel operator forces Git to
  actually dereference whatever SHA HEAD (or the branch it points at)
  names to a real commit object, failing cleanly if that object does not
  exist. This replaces the previous bare `HEAD` form, which does **not**
  provide this guarantee. Verified directly: after manually overwriting a
  repository's branch ref file with the literal all-zeros SHA
  (`0000000000000000000000000000000000000000`, which does not exist as a
  real object),
  ```
  $ git rev-parse --verify -q HEAD; echo "exit=$?"
  0000000000000000000000000000000000000000
  exit=0                     # FALSE SUCCESS — the ref "resolves" to a
                              # SHA-shaped string, but that string names
                              # no real object
  $ git rev-parse --verify -q 'HEAD^{commit}'; echo "exit=$?"
  exit=1                      # correctly detects the corruption
  ```
  and, confirming this does **not** change the unborn-branch exit code
  (a fresh, uncorrupted, zero-commit repository):
  ```
  $ git init && git symbolic-ref -q HEAD; echo "exit=$?"
  refs/heads/main
  exit=0
  $ git rev-parse --verify -q 'HEAD^{commit}'; echo "exit=$?"
  exit=1                     # same exit code as the previous bare-HEAD
                              # form — the ^{commit} change does not alter
                              # unborn detection
  ```
- **Distinguishing "unborn" from "corrupt-but-symbolic" — the genuinely
  distinguishing signal (new — Round 4 review finding #5):** both the
  unborn case and the corrupt-but-symbolic case produce the *identical*
  exit code from `symbolic-ref -q HEAD` (0) and from `rev-parse --verify
  -q HEAD^{commit}` (1) — verified directly, these two checks alone
  **cannot** tell the two cases apart. A third check, against the
  resolved branch ref name itself (the exact string `symbolic-ref -q
  HEAD` printed, e.g. `refs/heads/main`), **without** the `^{commit}`
  peel and **without** going through `HEAD` at all, is required and is
  genuinely distinguishing: `git rev-parse --verify -q <resolved-ref-name>`
  fails (exit 1, no stderr) when the ref file genuinely does not exist yet
  (unborn — nothing has ever been committed to create it), but succeeds
  (exit 0, printing the raw stored SHA) when the ref file exists and
  contains *some* SHA-shaped value, even a non-existent one (corrupt).
  Verified directly, against both cases, from the exact same starting
  point (a fresh `symbolic-ref -q HEAD` resolution of `refs/heads/main`):
  ```
  # case: genuinely unborn (fresh git init, zero commits)
  $ git rev-parse --verify -q refs/heads/main; echo "exit=$?"
  exit=1                      # ref file does not exist — unborn

  # case: corrupted symbolic (one commit made, then the branch ref file
  # itself overwritten with the all-zeros SHA)
  $ git rev-parse --verify -q refs/heads/main; echo "exit=$?"
  0000000000000000000000000000000000000000
  exit=0                      # ref file exists, resolves to *something*
                              # (even though that something is not a real
                              # object) — corrupt, not unborn
  $ git rev-parse --verify -q refs/heads/main^{commit}; echo "exit=$?"
  exit=1                      # confirms it is not a real commit either
  ```
  This third check is only ever needed to disambiguate the unborn-vs-corrupt
  case (i.e., only when `symbolic-ref -q HEAD` succeeded and `rev-parse
  --verify -q HEAD^{commit}` failed) — it is never run for the ordinary
  normal-branch or detached-HEAD outcomes, which are already fully
  determined by the first two checks alone.
- **Complete decision table, exit codes only:**
  1. `symbolic-ref -q HEAD` exit 0, `rev-parse --verify -q HEAD^{commit}`
     exit 0 → **normal branch with commits**.
  2. `symbolic-ref -q HEAD` exit 1 (detached signature) — `rev-parse
     --verify -q HEAD^{commit}` will succeed for an ordinary detached HEAD
     (it always points at a real commit in ordinary use) → **detached**.
     If, in this branch, `rev-parse --verify -q HEAD^{commit}` were to
     also fail, that is direct/detached HEAD pointing at a non-existent
     object — see case 5 below.
  3. `symbolic-ref -q HEAD` exit 0, `rev-parse --verify -q HEAD^{commit}`
     exit 1, and `rev-parse --verify -q <resolved-ref-name>` (no
     `^{commit}`) also exit 1 → **unborn branch** (`headSha: null`,
     `unborn: true`).
  4. `symbolic-ref -q HEAD` exit 0, `rev-parse --verify -q HEAD^{commit}`
     exit 1, but `rev-parse --verify -q <resolved-ref-name>` (no
     `^{commit}`) exits **0** → **corrupt HEAD**: the branch ref exists
     and is symbolic, but does not resolve to a real commit object. This
     is a new, explicit, reachable outcome (see `HEAD_UNAVAILABLE`,
     below) — not folded into either "unborn" or "normal branch."
  5. **Detached HEAD pointing at a non-existent object** (direct HEAD —
     `symbolic-ref -q HEAD` exit 1 — where `rev-parse --verify -q
     HEAD^{commit}` *also* fails): equally a corrupt-HEAD outcome, folded
     into the same `HEAD_UNAVAILABLE` classification as case 4 — see
     below.
  6. `symbolic-ref -q HEAD` exit anything other than 0 or 1 (e.g. 128) →
     **`HEAD_UNAVAILABLE`**, checked before any of the above
     interpretations is attempted (unchanged from Round 1's fix).

  Cases 4, 5, and 6 are, together, the **complete** trigger definition for
  `HEAD_UNAVAILABLE` (§17) — extended in this round beyond Round 1's
  `symbolic-ref`-exit-code-only definition to also cover "HEAD resolves
  (directly or symbolically) to something, but that something is not a
  real commit object." `LC_ALL=C` (§19) may still be set globally for
  whatever diagnostic text ends up in `GitError.details` for these
  genuinely unanticipated cases, but — stated explicitly here as the
  corrected contract — **no BR3 control-flow branch is ever gated on
  inspecting stderr content; every classification above is derived purely
  from exit codes and/or separate machine-readable stdout.** Any
  remaining wording elsewhere in this document suggesting detached HEAD
  is valid "regardless of rev-parse" is superseded by this section:
  detached HEAD's validity is conditional on `rev-parse --verify -q
  HEAD^{commit}` succeeding (case 2 above), not assumed unconditionally.

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
   `git rev-parse --verify -q --end-of-options <branch>@{upstream}` for
   the SHA, and `git rev-parse --verify -q --symbolic-full-name
   --end-of-options <branch>@{upstream}` for the resolved ref name (both
   genuinely read-only; both added to §27's read-only command allowlist)
   — **`--end-of-options` included, corrected, Round 7 review finding #6:
   `<branch>` is repository-controlled input (the current branch name,
   from `symbolic-ref`/`HEAD`), not BR3-authored, and a valid Git ref
   name can itself be flag-shaped** (e.g. `refs/heads/-foo` is a
   syntactically valid ref name — **construction wording corrected, Round
   8 review finding #7A: `git branch -foo` is not itself a valid way to
   create such a branch**, since Git's own porcelain `branch` subcommand
   parses a leading-`-foo` argument as an option, not a branch name to
   create; the underlying safety case remains fully real regardless — a
   branch named `-foo` is constructed for testing via a plumbing/manual
   mechanism instead, e.g. `git symbolic-ref HEAD refs/heads/-foo`
   combined with directly writing the corresponding config keys, or an
   equivalent direct, controlled fixture-setup technique that does not
   rely on a porcelain command misinterpreting its own argument),
   producing a revision expression like `-foo@{upstream}` that Git's
   argument parser can otherwise misinterpret as an option rather than a
   positional revision — the identical hazard class §13 already defends
   against for caller-supplied `DiffRequest.fromRef`/`.toRef`, now
   recognized as equally applicable here since the branch name is not
   BR3-authored either. **Verified directly:** a fixture repository
   constructed via the plumbing technique above, with `HEAD` pointing at
   a branch literally named `-foo`, `branch.-foo.remote` set to `"."`,
   and `branch.-foo.merge` set to `refs/heads/main` — `git rev-parse
   --verify -q '-foo@{upstream}'`/`--symbolic-full-name
   '-foo@{upstream}'` (without `--end-of-options`) **fail**, while the
   identical revision expressions **succeed** once `--end-of-options` is
   inserted immediately before the revision argument, confirming
   `--end-of-options`' option ordering (`rev-parse --verify -q
   [--symbolic-full-name] --end-of-options <expr>`) is correct against
   BR3's supported Git floor (§8, ≥2.45.0). This is not a hypothetical
   concern specific to this construction — it is the general rule that
   *every* repository-derived revision expression BR3 constructs and
   passes to `rev-parse`/`diff` must receive the same argument-safety
   treatment as a caller-derived one, since BR3 does not control what a
   real repository's branch names, ref names, or other identifiers are.
   No other BR3-constructed revision expression currently exists besides
   this one and the already-protected `DiffRequest`-derived ones (§13);
   a future correction round introducing a new one must apply
   `--end-of-options` there too.
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
(branch/HEAD/upstream-SHA/working-tree/diff/protected-paths — revised,
corrects Round 4 review finding #7) and
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
Round 1 review finding #6; further revised — corrects Round 4 review
finding #3, adding the mandatory `core.fsmonitor`-suppressing `-c`
override described in §18; further revised — corrects Round 6 review
finding #1, replacing the withdrawn filter-driver suppression overrides
with a pre-invocation discovery-and-refuse gate):**

```
git -c core.fsmonitor= status --porcelain=v2 -z --find-renames=50% --untracked-files=all --ignore-submodules=none
```

run with `cwd` at `projectRoot`, **and only ever run at all once §18's
effective-filter-attribute scan (`check-attr --stdin -z filter` over
every relevant tracked path, superproject and every initialized
submodule recursively) has confirmed no path in scope carries an active
`filter` attribute** — a discovered active attribute produces
`EXTERNAL_GIT_FILTER_UNSUPPORTED` (§17) instead, before this invocation
ever runs (§18, Round 6 review finding #1, detection mechanism corrected
Round 7 review finding #4; this replaces Round 4/5's now-withdrawn `-c
filter.<name>.clean=`/`-c filter.<name>.process=` suppression overrides,
which must not appear in this command, and supersedes relying on
config-enumeration alone, which Round 7 proved insufficient against a
globally-defined driver). The `-c core.fsmonitor=` override is always
present, unconditionally, for both the superproject and every
initialized submodule Git itself inspects internally during this call.
This exact invocation — verified to accept all five `status`-level flags
together without error — is what §18 (process execution safety), §19
(determinism), §20 (test plan), and §27
(independent review) all reference; no section states a different or
partial form of this command. Each `status`-level flag is individually
required, not incidental:

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
| `1 .A ...` (intent-to-add, `git add -N`) | `unstaged_add` — **new, Round 8 review finding #1A.** A real, independently-reproducible porcelain v2 state, not previously represented: `git add -N <path>` (intent-to-add) records an index entry for `<path>` with no content staged — Git reports this via the ordinary-changed record type with `X=.`/`Y=A`, distinct from `? <path>` (`untracked` — no index entry exists at all for a genuinely untracked path) and from `1 .M` (`unstaged_modify` — requires a real staged blob already present to compare the working-tree content against, which intent-to-add does not create). BR3 must not classify `1 .A` as either `untracked` or `unstaged_modify` — both would misrepresent the actual index state a caller might reasonably need to distinguish (e.g. "is this path known to the index at all"). |
| `1 .M ...` | `unstaged_modify` |
| `1 .D ...` | `unstaged_delete` |
| `1 .T ...` | `unstaged_type_change` |
| `2 R. ... <score> <path>\0<origPath>\0` (staged rename) | `staged_rename` (with `oldPath`, `similarity` from `<score>`) |
| `2 .R ... <score> <path>\0<origPath>\0` (unstaged rename) | `unstaged_rename` (with `oldPath`, `similarity` from `<score>`) — **corrected, Round 6 review finding #6: no longer under-classified; reachability corrected, Round 7 review finding #2.** An earlier draft of this specification represented this record as a plain `unstaged_modify` on the new path, deliberately discarding the `oldPath`/`similarity` data this exact porcelain v2 record type already carries in the identical positions as the staged-rename record above. `unstaged_rename` remains a first-class `WorkingTreeEntryKind` (§7a), populated identically to `staged_rename`, whenever BR3's own documented `status` invocation (§11) actually emits this record. **A plain, ordinary filesystem rename with no accompanying index operation does *not*, by itself, reliably produce `2 .R`** — this earlier draft's implied reachability claim ("a plain filesystem rename... causes Git to emit `2 .R`") is corrected: **verified directly**, starting from a committed, tracked `old.txt` with no other changes, a plain `mv old.txt new.txt` with zero index operations, under BR3's exact `status` invocation, instead produces two independent records — `1 .D ... old.txt` (`unstaged_delete`) and `? new.txt` (`untracked`) — **never** `2 .R`. Porcelain v2's unstaged-rename detection requires the new path to already be represented in the index in some form for Git's rename-pairing heuristic to have anything to pair the deletion against; a genuinely untracked new path gives Git no such pairing signal. **A real, reachable `2 .R` state was independently verified** via `mv old.txt new.txt` followed by `git add -N new.txt` (an intent-to-add index entry — no content staged, the change remains fully unstaged) — BR3's exact `status` invocation against that state emits `2 .R ... R100 new.txt\0old.txt\0`, confirming `unstaged_rename` is genuinely reachable, just not via the naive "plain rename" construction an earlier draft implied. §11/§14/§20/§27 are corrected accordingly: BR3 reports whatever Git actually emits for a given repository state and never synthesizes a rename relationship Git itself did not provide — a plain, unstaged, non-intent-to-added filesystem rename is correctly, truthfully reported as `unstaged_delete`(old) + `untracked`(new), two independent facts, not a rename. |
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

**Rename representation (working tree, staged and unstaged) — corrected,
Round 6 review finding #6, no longer staged-only:** both `staged_rename`
(porcelain v2 record type `2 R.`) and `unstaged_rename` (porcelain v2
record type `2 .R`) carry `oldPath` and `similarity` (0–100, from
porcelain v2's own score field, present in the identical position for
both record types) — see §14 for the shared rename-representation
contract with `inspectDiff`. BR3 never discards the `oldPath`/`similarity`
data a `2 .R` record already supplies merely because the rename is
unstaged; an earlier draft of this specification did exactly that (under-
classifying `2 .R` as a plain `unstaged_modify`), which Round 6 corrects.

**Reachability of `2 .R` — corrected, Round 7 review finding #2:** a
plain, ordinary filesystem rename (`mv old.txt new.txt`) with no
accompanying index operation does **not**, by itself, produce `2 .R`
under BR3's exact `status` invocation — verified directly, it instead
produces `unstaged_delete` on the old path plus `untracked` on the new
path, two independent facts with no rename relationship between them,
because porcelain v2's unstaged-rename pairing heuristic needs the new
path already represented in the index in some form to have anything to
pair the deletion against. `2 .R` **is** genuinely reachable — verified
directly via `mv old.txt new.txt` followed by `git add -N new.txt`
(intent-to-add: an index entry with no staged content, so the change
remains entirely unstaged) — but this specific construction is
meaningfully different from an ordinary, untouched-index rename. BR3
itself never performs this or any other index operation; the
intent-to-add step is exclusively test/fixture setup code demonstrating
a real, reachable repository state, never something BR3's own
`inspectWorkingTree` implementation does. **BR3 reports exactly what Git
emits for whatever state a repository is actually in, and never
synthesizes a rename relationship Git itself did not provide:** a plain,
non-intent-to-added unstaged rename is correctly, truthfully reported as
`unstaged_delete`(old) + `untracked`(new) — this is not a gap or a
missed classification, it is the accurate reflection of what Git itself
considers knowable about that specific repository state.

**Combined type-2 record XY states — new, mandatory, Round 8 review
finding #1B.** Porcelain v2's type-2 (rename/copy) record carries the
identical X/Y two-character status field as type-1 records (§11's
"Same-path staged+unstaged case," above), and Git genuinely emits a
type-2 record with **both** X and Y populated — not merely `R.`
(staged-only) or `.R` (unstaged-only) — whenever a path has a staged
rename **and** an additional, distinct unstaged change on the new path.
An earlier draft of this specification defined only the two single-axis
cases (`2 R.` → `staged_rename`, `2 .R` → `unstaged_rename`), silently
assuming X and Y could not both be independently populated for a type-2
record — **verified false directly**, against BR3's exact `status`
invocation:

```
# staged rename + unstaged content modification
$ git mv old.txt new.txt && echo more >> new.txt
$ git status --porcelain=v2 -z --find-renames=50% --untracked-files=all --ignore-submodules=none
2 RM ... R100 new.txt\0old.txt\0

# staged rename + unstaged deletion
$ git mv old.txt new.txt && rm new.txt
2 RD ... R100 new.txt\0old.txt\0
```

**Corrected contract: X and Y are interpreted independently for every
type-2 record, exactly as they already are for type-1 records — BR3
never discards either axis when both are populated.** A type-2 record
with a non-`.` X **always** produces a `staged_rename` entry (`path`,
`oldPath`, `similarity` — from the record's own score field, X-side);
a type-2 record with a non-`.` Y **additionally** produces a **second**,
independent `WorkingTreeEntry` for the *new* path only (no `oldPath`/
`similarity` — the unstaged-side change is relative to the already-staged
new path, not a second rename), whose kind is determined by Y exactly as
the type-1 Y-mapping table above already defines. The complete, explicit
matrix for every `X ∈ {R}`/`Y` combination reachable under BR3's
supported Git floor:

| Record | Emitted `WorkingTreeEntry` objects |
|---|---|
| `2 R.` | `staged_rename` only (`path`=new, `oldPath`, `similarity`) |
| `2 RM` | `staged_rename` (`path`=new, `oldPath`, `similarity`) **and** `unstaged_modify` (`path`=new) |
| `2 RD` | `staged_rename` (`path`=new, `oldPath`, `similarity`) **and** `unstaged_delete` (`path`=new) |
| `2 RT` | `staged_rename` (`path`=new, `oldPath`, `similarity`) **and** `unstaged_type_change` (`path`=new) — reachable in principle (a staged rename followed by replacing the new path with a different filesystem entry type, e.g. a symlink); not independently re-verified in this correction round beyond the RM/RD cases directly reproduced above, since the underlying rule (Y is interpreted identically to its type-1 meaning, regardless of X) is the same rule already verified for RM/RD, not a distinct mechanism requiring separate proof |
| `2 .R` | `unstaged_rename` only (`path`=new, `oldPath`, `similarity`) |
| Any other `X`/`Y` combination where `X ∈ {R}` and `Y` is a recognized type-1 Y-value (`M`/`D`/`T`) | Follows the identical two-entry pattern: `staged_rename` (X-side) plus the corresponding Y-mapped kind (Y-side), both on the new path |

BR3 does not attempt copy-detection (`--find-copies` is never passed,
§13), so `X ∈ {C}` is not a state BR3's own invocation can produce and
is not part of this matrix. An `X`/`Y` combination this matrix does not
recognize (neither a defined single-axis nor combined-axis shape) is
reported as `MALFORMED_GIT_OUTPUT` (§17) — but only once the complete,
valid state matrix above has been checked and found not to match; this
specification does not fall back to `MALFORMED_GIT_OUTPUT` for any
record shape this matrix already defines.

**Submodule state:** porcelain v2's submodule marker (`S<c><m><u>` in the
XY-adjacent field) is decoded into `SubmoduleState { commitChanged,
hasUntrackedContent, hasModifiedContent }` and attached to the relevant
entry's `submodule` field. BR3 surfaces this because porcelain v2
provides it essentially for free (no extra command), but does **not**
recurse into the submodule itself for BuildRail's *own* higher-level
inspection — that would require a second, separate
`resolveRepository`/`inspectWorkingTree` call by the *caller*, against
the submodule's own path as a new `projectRoot`, which BR3's existing
API already supports without special-casing submodules further. **Git
itself, however, genuinely does inspect each initialized submodule's own
working tree internally** to determine `hasUntrackedContent`/
`hasModifiedContent` truthfully under `--ignore-submodules=none` (this
document's own deliberate flag choice, above) — which means a
submodule-local content-filter driver is reachable during this single
`status` invocation even though BR3 never issues a second, explicit
command against the submodule. §18's filter-discovery mechanism is
therefore extended to discover filter drivers configured inside every
initialized submodule's own config, recursively (via the NUL-safe
`ls-files --stage -z`-based gitlink enumeration, never
`git submodule status --recursive` — §18, Round 6 review finding #2), not
only the superproject's, and — corrected, Round 6 review finding #1 — a
discovered driver anywhere in that scope causes BR3 to **refuse**
(`EXTERNAL_GIT_FILTER_UNSUPPORTED`) rather than execute `status` at all,
never to silently suppress the driver and proceed. See §18's "detect,
never execute, refuse safely" correction for the complete mechanism.

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
input (revised — corrects Round 1 review finding #4; extended to cover
`unstaged_rename` — Round 6 review finding #6):** for a
`DiffChange`/`WorkingTreeEntry` with `kind: "renamed"`/`"staged_rename"`/
`"unstaged_rename"`, the caller constructs **two** `ProtectedPathCheckInput` entries — one
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

**No human-oriented Git output is ever parsed for any path-bearing or
repository-fact-bearing purpose.** Every BR3 Git invocation that could
involve a path uses `-z` (NUL-delimited records) specifically to avoid
the ambiguity of newline-delimited output when paths themselves could
contain newlines, and to avoid any quoting/escaping ambiguity for paths
containing spaces, tabs, or quote characters (Git's default
human-oriented path quoting — octal-escaping "unusual" characters inside
double quotes — is exactly the kind of format this specification forbids
parsing). Submodule enumeration is no exception: it uses the NUL-safe
`git ls-files --stage -z` plumbing primitive (§18, Round 6 review finding
#2), never the line-oriented `git submodule status --recursive`.

**The one, narrow, explicitly-named exemption — Git capability-version
parsing (new, Round 6 review finding #3):** `git --version`'s single,
short, long-stable numeric-version line (§8's "Git Capability Floor"
subsection) is parsed, but only to extract a dotted `X.Y.Z` version for a
`>=` comparison against BR3's supported floor — never to branch on
arbitrary diagnostic text content, and never as a source of any
path-bearing or repository-state fact. This is the sole exception to the
"no human-oriented output" rule in this entire specification; every
actual repository fact (paths, statuses, SHAs, branch/upstream identity)
continues to come exclusively from machine-readable, NUL-safe, or
exit-code-only sources.

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
3. **The diff itself (revised — corrects Round 4 review finding #3;
   further revised — corrects Round 6 review finding #1, replacing the
   withdrawn filter-driver suppression overrides with the same
   pre-invocation discovery-and-refuse gate §11/§18 describe for
   `status`; `core.fsmonitor` is not relevant to `diff`, which does not
   consult it):**
   `git diff --no-color --no-ext-diff -z --name-status
   --find-renames=<threshold> <fromSha> <toSha>` (threshold per §14),
   **run only once §18's effective-filter-attribute scan (`check-attr
   --stdin -z filter`, superproject and every initialized submodule
   recursively) has confirmed no path in scope carries an active
   `filter` attribute** — a discovered active attribute produces
   `EXTERNAL_GIT_FILTER_UNSUPPORTED` (§17) instead, before this invocation
   ever runs. `--name-status` (not the
   default patch format) gives exactly a status-letter-plus-path(s)
   record per changed file, `-z` NUL-delimits records and (for renames)
   the two-path pairs within a record.
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
`staged_rename` **and `unstaged_rename`** cases (§11, `unstaged_rename`
added — Round 6 review finding #6) — porcelain v2 uses the same
underlying similarity-index algorithm as `diff --find-renames` for both
the staged (`2 R.`) and unstaged (`2 .R`) record shapes, and its
detection threshold is controlled by the same `-M`/`--find-renames`
mechanism when passed to `git status`, identically for both.

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
and `similarity` (0–100 integer, Git's own percentage score) on
`DiffChange` (kind: `"renamed"`) and on `WorkingTreeEntry` for **both**
`kind: "staged_rename"` **and** `kind: "unstaged_rename"` (the latter
added — Round 6 review finding #6) — see §7a's type definitions.

**`unstaged_rename` reachability — corrected, Round 7 review finding #2:**
Git's porcelain v2 unstaged-rename pairing (`2 .R`) requires the new path
to already be represented in the index in some form (e.g. via `git add
-N`/intent-to-add) for Git's heuristic to have a basis to pair it against
the old path's deletion — a plain, ordinary filesystem rename with no
accompanying index operation is instead reported as an independent
`unstaged_delete` + `untracked` pair, never `2 .R`. This is not a BR3
limitation; it is Git's own porcelain v2 behavior, faithfully reported.
See §11's "Reachability of `2 .R`" subsection for the full verified
reproduction.

**Below-threshold pairs remain delete+add-shaped — never forced into a
low-confidence rename.** If Git's own similarity index computes less
than 50% similarity between a deleted path and an added path, Git itself
does not report a rename for that pair (this is Git's own behavior, not
something BR3 additionally filters) — BR3 faithfully reports whatever
Git's `--find-renames=50%`/porcelain-v2-with-default-threshold actually
returns, as two independent records, with no attempt by BR3 to
second-guess or re-correlate them into a synthetic rename BR3's own logic
invented. BR3 never runs its own similarity heuristic in JavaScript — it
relies entirely on Git's already-correct, already-tested C
implementation, invoked with an explicit, documented threshold. The
exact shape of the two independent records depends on which inspection
surface and which index state produced them (corrected, Round 8 review
finding #1, reconciled with §11's now-complete state model):
- **`inspectDiff`** (committed-diff, both sides fully resolved against
  real commits): `DiffChange { kind: "deleted", path: <old> }` and
  `DiffChange { kind: "added", path: <new> }` — unambiguous, since a
  committed diff has no partial/intent-to-add state to consider.
- **`inspectWorkingTree`**, staged (both sides staged via `git add`,
  below threshold): `WorkingTreeEntry { kind: "staged_delete", path:
  <old> }` and `WorkingTreeEntry { kind: "staged_add", path: <new> }`.
- **`inspectWorkingTree`**, unstaged, **without** an intent-to-add on the
  new path (the ordinary "plain `mv`" case, §11's "Reachability of `2
  .R`" subsection): `WorkingTreeEntry { kind: "unstaged_delete", path:
  <old> }` and `WorkingTreeEntry { kind: "untracked", path: <new> }` —
  the new path has no index entry of any kind, so `untracked`, not
  `unstaged_add`, is the correct kind.
- **`inspectWorkingTree`**, unstaged, **with** an intent-to-add on the
  new path (`git add -N`) but below the similarity threshold:
  `WorkingTreeEntry { kind: "unstaged_delete", path: <old> }` and
  `WorkingTreeEntry { kind: "unstaged_add", path: <new> }` (§11's `1 .A`
  mapping, new — Round 8 review finding #1A) — the new path has a real,
  intent-to-add index entry, so `unstaged_add` is the correct kind, not
  `untracked`.

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
  - `"..."` — double-quoted literal region (glob metacharacters inside
    the quotes match literally) — **added explicitly, Round 4 review
    finding #6, Part A**; likewise baseline `picomatch` grammar, not
    independently toggleable

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
- **Double-quote literal-matching semantics — added, closing a
  previously undocumented gap (Round 4 review finding #6, Part A):**
  `picomatch` treats a `"..."` region inside a pattern as a
  literal-matching span — every character between a pair of double
  quotes is matched literally, with glob metacharacters inside the quoted
  region losing their special meaning. **Verified directly** against the
  installed `picomatch@4.0.7` source (`lib/parse.js`): a character inside
  an open double-quote region (`state.quotes === 1`) is passed through
  `utils.escapeRegex` rather than picomatch's ordinary
  metacharacter-dispatch logic, and this behavior is unconditional — not
  gated by `nonegate`/`noextglob`/any other option this specification
  sets, and not independently toggleable via any documented `picomatch`
  option at all. Verified behaviorally: a pattern
  `src/"a*b"/x.ts` matches the literal path `src/a*b/x.ts` but does
  **not** match `src/aZZZb/x.ts` (the glob-expanded form `*` would
  otherwise produce), confirming quoting genuinely suppresses
  metacharacter interpretation rather than merely being accepted without
  erroring. **Decision: Option A — document and support it**, for the
  identical reasoning Round 3 chose Option A for `?`/backslash-escaping:
  this is baseline, always-active `picomatch` parser grammar, not a
  feature a pattern author opts into or out of, so Option B's
  alternative (pre-validating and rejecting any pattern containing `"`
  via `invalidPatterns`) would require BR3 to hand-roll a detection pass
  ahead of `picomatch` for a construct that poses no comparable audit
  risk to negation/extglobs — quoting can only ever narrow what a pattern
  matches (forcing literal interpretation of characters that would
  otherwise be glob metacharacters), never broaden or invert a match, the
  same narrow-only characteristic that justified keeping `?`/brackets/braces
  enabled. BR3's supported pattern grammar (§12 cross-reference) therefore
  additionally includes: **`"..."` — double-quoted literal region**
  (glob metacharacters inside the quotes are matched literally; the
  quotes themselves are consumed, not matched as literal quote
  characters, per `picomatch`'s default `keepQuotes: false` behavior,
  which BR3 does not override). A dedicated test is required (§20).
- **Non-throwing contract for matcher-compilation failures — new,
  mandatory (Round 4 review finding #6, Part B):** `picomatch` throws a
  `SyntaxError` for a pattern exceeding its own internal maximum input
  length. **Verified directly** against the installed `picomatch@4.0.7`
  source (`lib/constants.js`/`lib/parse.js`): `MAX_LENGTH = 1024 * 64`
  (65536 characters) is the hardcoded ceiling (`opts.maxLength` can only
  ever *lower* this via `Math.min(MAX_LENGTH, opts.maxLength)`, never
  raise it); a pattern of exactly 65536 characters compiles without
  error, while a pattern of 65537 characters throws
  `SyntaxError: Input length: 65537, exceeds maximum allowed length: 65536`.
  **Confirmed:** `packages/core/schemas/config.schema.json`'s
  `#/$defs/protectedSystem.paths` items definition (§3) declares only
  `{ "type": "string", "minLength": 1 }` for each pattern string — **no**
  `maxLength` constraint — meaning nothing at the schema-validation layer
  prevents an absurdly long pattern string from reaching
  `matchProtectedPaths` and triggering this internal `picomatch` guard.
  Since `matchProtectedPaths` is fully synchronous and pure and never
  returns a `GitResult` (§17's established boundary, re-confirmed here:
  it has no `GitErrorCode`-shaped channel to report a compilation failure
  through even if one were added), an uncaught `SyntaxError` escaping
  `matchProtectedPaths` would be a genuine contract violation — a
  schema-valid config value causing a pure function to throw. **Required
  fix:** the pattern-compilation step BR3 performs (compiling each
  declared `ProtectedSystem` path pattern into a `picomatch` matcher
  function once, per §16's existing "compile once, memoized" design) is
  wrapped in a `try`/`catch`; any exception thrown during compilation —
  the overlong-pattern `SyntaxError` verified above, or any other
  `picomatch`-internal compilation failure — results in that specific
  pattern string being added to `ProtectedPathMatchResult.invalidPatterns`
  (the same, already-established result-channel §12/§17 define for
  `..`-containing patterns) rather than propagating out of
  `matchProtectedPaths` uncaught. **Stated explicitly as BR3's
  contract:** no schema-valid protected-path pattern string can cause
  `matchProtectedPaths` to throw an uncaught exception — every
  compilation failure, of any kind, is caught and reported via
  `invalidPatterns`. This is not a new `GitErrorCode` and does not
  involve `GitResult` at all — it uses the identical, already-established
  `invalidPatterns` mechanism, consistent with `matchProtectedPaths`'s
  pure/synchronous boundary (§17). Dedicated tests are required (§20): an
  overlong pattern (exceeding 65536 characters) reported via
  `invalidPatterns`, not thrown; and a general "matcher compilation
  failure does not escape as an uncaught exception" test category,
  independent of the specific overlong-pattern case, proving the
  try/catch wrapping is a structural guarantee, not a special case for
  length alone.
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
  | "GIT_VERSION_UNSUPPORTED"
  | "PROJECT_ROOT_NOT_FOUND"
  | "NOT_A_GIT_REPOSITORY"
  | "PROJECT_ROOT_MISMATCH"
  | "BARE_REPOSITORY_UNSUPPORTED"
  | "UNSUPPORTED_OBJECT_FORMAT"
  | "UNSUPPORTED_REF_FORMAT"
  | "EXTERNAL_GIT_FILTER_UNSUPPORTED"
  | "UNSAFE_SUBMODULE_PATH"
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
| `GIT_VERSION_UNSUPPORTED` | **New — Round 6 review finding #3.** The installed `git` binary spawns successfully but reports a version below BR3's supported floor (2.45.0), or `git --version`'s output does not match the expected `git version X.Y.Z` prefix shape at all (§8's "Git Capability Floor" subsection) — checked before any other `resolveRepository` step | Expected — distinct from `GIT_EXECUTABLE_UNAVAILABLE` (binary not found at all vs. found and run, but too old/unrecognized); `details` names the actual reported version string |
| `PROJECT_ROOT_NOT_FOUND` | `projectRoot` does not exist or is not a directory | Expected |
| `NOT_A_GIT_REPOSITORY` | **Revised — corrects Round 4 review finding #4, further revised — corrects Round 5 review finding #4 and Round 6 review findings #5 and #7.** `git rev-parse --is-bare-repository` (§8 step 2) fails **and** the filesystem-based secondary check (§8) confirms **neither** candidate repository shape is present — `<projectRoot>/.git` does not exist (non-bare shape) **and** `projectRoot` itself lacks the `HEAD`+`objects/`+(`refs/` or `reftable/tables.list`) bare-repository-root shape (bare shape, either ref backend) — i.e. `projectRoot` is genuinely not inside any Git repository, bare or non-bare, under either ref backend. A `--is-bare-repository` failure where **either** shape **is** present (malformed config, permission failure, dubious ownership) is `GIT_COMMAND_FAILED` instead — see that row and §8. **`--show-toplevel` (§8 step 3) failing after step 2 already succeeded with `false` is no longer classified here at all — corrected, Round 6 review finding #7:** step 2 having already, positively, successfully established that Git recognizes `projectRoot` as a non-bare repository makes "no repository exists here" truthfully unreachable at that point; an unexpected step-3 failure is instead classified as `GIT_COMMAND_FAILED` (see that row) | Expected |
| `PROJECT_ROOT_MISMATCH` | `projectRoot` is inside a real Git repository, but is not that repository's root (§8 step 3) | Expected — `details` names the actual resolved toplevel |
| `BARE_REPOSITORY_UNSUPPORTED` | `git rev-parse --is-bare-repository` reports `true` for `projectRoot` (§8 step 2) | Expected |
| `UNSUPPORTED_OBJECT_FORMAT` | **New — Round 6 review finding #4.** `git rev-parse --show-object-format` (§8 step 5a) reports anything other than `sha1` for `projectRoot` (e.g. `sha256`, for a repository created via `git init --object-format=sha256`) | Expected — BR3 v0.1 supports SHA-1 repositories only, a deliberate scope decision (§8); `details` names the actual reported object format; `resolveRepository` fails before any SHA-producing BR3 function can be reached for that repository |
| `UNSUPPORTED_REF_FORMAT` | **New — Round 7 review finding #1, made fail-closed Round 8 review finding #5.** `git config --get extensions.refStorage` (§8 step 5b) successfully reports any value other than `files` for `projectRoot` (a healthy repository using a ref-storage backend BR3 does not support) — this includes `reftable` **and any other, including future/unrecognized, backend value** the key might report; BR3 v0.1's contract is an allowlist of exactly one supported value (`files`, or the key's ordinary absence), not a denylist of `reftable` specifically | Expected — BR3 v0.1 supports the traditional `files` ref-storage backend only, a deliberate scope decision (§8); `details` contains the actual reported value verbatim; `resolveRepository` fails before any later step is reached for that repository. Distinct from a **malformed** repository (either ref backend), which is `GIT_COMMAND_FAILED` via the post-Git-failure secondary classifier (§8) — this code is reserved for a positively-recognized, *healthy* repository reporting an unsupported format; also distinct from the `extensions.refStorage` query itself failing for a reason other than ordinary key-absence, which is likewise `GIT_COMMAND_FAILED`, never inferred as `files`-backend support (§8) |
| `EXTERNAL_GIT_FILTER_UNSUPPORTED` | **New — Round 6 review finding #1, detection mechanism corrected Round 7 review finding #4.** BR3's repository-effective-attribute scan (`git check-attr --stdin -z filter` over every relevant tracked path, superproject and every initialized submodule recursively — §18) finds at least one path with an active `filter` attribute, run *before* any `status`/`diff` invocation that could trigger the corresponding driver — regardless of whether that driver's command definition is repository-local, global/user-level (and therefore otherwise hidden by BR3's own `GIT_CONFIG_GLOBAL`-neutralized inspection environment), or currently undefined. BR3 refuses to proceed rather than execute the external filter or suppress it and risk returning a false working-tree/diff fact (§18) | Expected — a real, anticipated repository-configuration condition; `details` names the affected path(s)/attribute value(s); the `status`/`diff` invocation that could trigger the filter is never run |
| `UNSAFE_SUBMODULE_PATH` | **New — Round 7 review finding #5, extended to cover repository-metadata identity and the parent→child relationship, Round 8 review finding #3.** A gitlink working-tree path (mode `160000` in `git ls-files --stage -z`, §18) discovered during initialized-submodule enumeration is itself a symbolic link (detected via `lstat`, never a symlink-following `stat`); **or** its canonical working-tree root **or** its canonical `(gitDir, gitCommonDir)` metadata identity has already been visited earlier in the same recursive enumeration (a cycle/alias, reachable even when the working-tree roots are themselves canonically distinct — §18 step 4a); **or** its resolved `.git` pointer names a location outside the three explicitly-recognized legitimate parent→child submodule shapes (§18 step 4a) — in particular, a pointer resolving to the parent's own `--git-dir`/`--git-common-dir`, or to a location outside the parent's own `--git-common-dir` tree entirely | Expected — a real, anticipated adversarial-or-corrupted-repository condition; BR3 fails safely rather than recursing into a symlink-redirected, cyclic, aliased, or externally-pointed submodule path, and never recursively inspects the aliased/external repository before the refusal is produced; `details` names the offending gitlink path |
| `HEAD_UNAVAILABLE` | **Complete, final trigger condition (revised — corrects Round 4 review finding #5, which extended this beyond Round 1's `symbolic-ref`-exit-code-only definition): EITHER (a)** `git symbolic-ref -q HEAD` (§9) exits with a code other than 0 (normal/unborn/corrupt-but-symbolic) or 1 (detached) — verified as exit 128 for genuine `.git/HEAD` corruption — **OR (b)** `git symbolic-ref -q HEAD` succeeds (exit 0) but `git rev-parse --verify -q HEAD^{commit}` fails AND the resolved branch ref name itself (`git rev-parse --verify -q <resolved-ref-name>`, no `^{commit}`) exits 0 — i.e. HEAD is genuinely symbolic and points at a branch ref that exists, but that ref's stored value does not name a real commit object (§9's "corrupt HEAD" case; distinguished from the unborn case, where the same ref-name check exits 1) — **OR (c)** HEAD is direct/detached (`symbolic-ref -q HEAD` exits 1) but `git rev-parse --verify -q HEAD^{commit}` also fails (a detached HEAD pointing at a non-existent object). These three conditions are the exact, complete trigger set §9 defines; there is no fourth, undocumented path to this code | Exceptional — this indicates repository corruption BR3 cannot meaningfully recover from; still returned as a typed `GitResult` failure (never a raw uncaught exception reaching a caller), but callers should treat it as unusual, not routine |
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
**It additionally depends on `node:fs`, `node:path`, and `node:os` —
corrected, Round 8 review finding #2, Round 8 review finding #7C** —
for the in-process executable-resolution mechanism (§8's "Git
Capability Floor" subsection) that determines the exact, absolute `git`
executable path every Git command in a given top-level operation
invokes; an earlier draft of this specification's implementation plan
(§20b) described this helper as depending only on
`node:child_process`/`node:util`, which was accurate for Round 6 but is
no longer accurate now that executable resolution is a first-class,
in-process mechanism this helper itself performs.

- **Primitive: `execFile` (promisified), never `spawn` directly, never
  `exec`.** `execFile` takes the command and its arguments as a separate
  `command: string, args: string[]` pair — never a single shell-interpreted
  command string — which structurally forbids shell interpolation: there
  is no shell in the invocation path at all (`execFile` does not spawn a
  shell intermediary the way `exec` does), so there is no injection
  surface via argument content, regardless of what a caller-supplied ref
  string contains. **The `command` argument is always the already-resolved,
  absolute, canonicalized `git` executable path from §8's Capability
  Floor subsection's in-process resolution mechanism — never the bare
  literal string `"git"`** (corrected, Round 8 review finding #2): once
  resolution has succeeded for a given top-level BR3 operation, every
  subsequent `execFile` call in that operation (the capability check
  itself, `resolveRepository`, `inspectHead`, `inspectWorkingTree`,
  `inspectDiff`, `ls-files`, `check-attr`, and every nested submodule
  call) passes that identical resolved path as `command`, so there is no
  second, independent `PATH`-resolution step for any later call that
  could diverge from the one the capability check itself validated.
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
  requirement, satisfied directly by `execFile`'s own `cwd` option. **The
  one, explicit, narrowly-scoped exception: the Git capability-floor
  check (`git --version`, §8 step 0), which runs before any
  `projectRoot` is confirmed to exist and therefore cannot use it as
  `cwd`** — corrected, Round 7 review finding #3 (an earlier draft of
  this specification stated both "every `execFile` call uses `cwd:
  projectRoot`" here and "`git --version` has no `cwd` requirement" in
  §8's Capability Floor subsection, an unreconciled contradiction). This
  one invocation instead uses `cwd: process.cwd()` (or any fixed,
  caller-independent directory) since it reads no repository state and
  has no dependency on any particular working directory; this is the
  shared exec primitive's own, single named exception, not a silent gap
  in the `cwd: projectRoot` contract.
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
- **External-helper execution — new, mandatory per-invocation `-c`
  overrides (Round 4 review finding #3):** `execFile`'s argv-array,
  no-shell, deterministic-`env` discipline above governs the *one*
  process BR3 itself spawns (`git` itself), but Git can, depending on
  repository-local configuration, spawn **further, arbitrary external
  programs of its own** as part of executing an otherwise-ordinary
  read-oriented subcommand — completely bypassing every one of BR3's own
  process-safety guarantees, since it is *Git itself*, not BR3's
  `execFile` call, that performs the spawn. This is a structurally
  different threat class from the environment-variable mitigations in
  §19: these are **per-invocation `-c` config overrides on the argv
  itself**, not environment variables, because the threat is
  repository-local `.git/config`/`.gitattributes` content, which
  environment sanitization alone does not address.
  - **`core.fsmonitor` hook:** a repository can configure an arbitrary
    executable (`git config core.fsmonitor <path>`) that Git invokes
    automatically during `git status`. **Verified directly:** a test
    hook script that writes a proof file to disk when invoked was
    genuinely, automatically invoked by an ordinary `git status
    --porcelain=v2 -z` call against a repository with that hook
    configured. **Verified fix:** passing `-c core.fsmonitor=` (an
    empty-value override, applied per-invocation via `execFile`'s argv,
    not an environment variable) to the specific `git status` invocation
    reliably prevented the configured hook from running, regardless of
    what `.git/config` actually declares. **Mandatory requirement:**
    every BR3 `git status` invocation (§11) includes `-c
    core.fsmonitor=` in its argv, unconditionally — this is a fixed,
    always-present argv entry, not a conditional one applied only when a
    hook happens to be configured (unconditional application is simpler,
    equally correct when no hook is configured — the override is then
    inert — and avoids a detect-then-decide race against a
    concurrently-modified `.git/config`).
  - **`filter.<driver>.clean` / `filter.<driver>.process` content-filter
    drivers — corrected, Round 6 review finding #1: BR3 does not disable
    and mask these; it detects them and refuses.** A repository can
    configure, via `.gitattributes` + `.git/config`, an arbitrary external
    program that transforms file content during certain
    content-comparison operations. Round 5 of this specification
    suppressed this via unconditional `-c filter.<name>.clean=`/`-c
    filter.<name>.process=` overrides — **that design is withdrawn in
    this round, because it is not, in general, semantics-preserving, and
    BR3 must never report a working-tree/diff fact it cannot stand
    behind as true:**
    1. **A clean filter can define a path's canonical committed
       representation.** Git's `clean` filter transforms working-tree
       content into the form that gets compared against (and, on commit,
       stored as) the blob — the canonical example is a filter that
       normalizes `hello` (working tree) to `HELLO` (clean-filtered/
       committed form). With the real filter active, Git can correctly
       determine such a path is clean (unmodified) even though its raw
       working-tree bytes differ from the committed blob's raw bytes.
       **With the filter suppressed** (`-c filter.<name>.clean=`, an
       empty/no-op override), Git instead compares the raw, unfiltered
       working-tree bytes directly against the committed blob and can
       report that same path as **modified** — a fact that is simply
       false relative to the repository's own, real, configured
       definition of "changed." BR3's `inspectWorkingTree`/`inspectDiff`
       would silently return this false `modified`/`staged_modify`/
       `unstaged_modify` fact to a caller with no signal that it might be
       wrong.
    2. **`filter.<driver>.required = true` makes Git itself treat a
       missing/failing filter as a hard error**, not a silent pass-
       through — Git's own documented behavior for a required filter that
       cannot run is to fail the operation invoking it outright. An
       unconditional empty-value override does not "gracefully disable"
       such a filter; it produces a Git-level failure Round 5's design
       did not account for as a distinct, anticipated case (it would
       surface as an undifferentiated `GIT_COMMAND_FAILED`, indistinguishable
       from any other unanticipated Git failure).

       Both failure modes — a silently wrong fact (case 1) and an
       opaque, undifferentiated failure (case 2, for `required = true`
       drivers specifically) — are unacceptable for a tool whose entire
       purpose (§2) is *trustworthy* fact-gathering. BR3 cannot claim
       simultaneously that it (a) never executes an arbitrary external
       filter helper and (b) always returns faithful working-tree/diff
       facts — for a repository with a real, active clean/process filter,
       these two guarantees are in direct tension, and §6's "never
       executes arbitrary external code" guarantee wins: BR3 refuses
       rather than fabricates.
    - **Round 6's config-enumeration discovery has its own blind spot —
      corrected, Round 7 review finding #4.** Round 6 of this
      specification discovered configured filter drivers via `git config
      --get-regexp '^filter\..*\.(clean|process|smudge)$'`, run under
      BR3's own sanitized execution environment (§19) — specifically,
      with `GIT_CONFIG_GLOBAL` pointed at a null device, which is
      required, independently, to neutralize an untrusted global
      `core.excludesFile`/etc. (§19, Round 3 review finding #2). **This
      is genuinely insufficient on its own:** a repository's
      `.gitattributes` can declare `*.txt filter=canon` while the
      corresponding `filter.canon.clean` driver *command* is defined only
      in the **global** Git config — a config layer BR3's own
      `GIT_CONFIG_GLOBAL=<null device>` deliberately hides from the
      config-enumeration query. The enumeration therefore sees no driver
      configured at all and lets `status`/`diff` proceed — but those
      commands, run under the identical sanitized environment, encounter
      an *attribute* that names a filter Git cannot find a driver command
      for. **Verified directly:** a fixture with a repository
      `.gitattributes` declaring `*.txt filter=canon`, a **global**
      config (visible only when `GIT_CONFIG_GLOBAL` is *not* overridden)
      declaring `filter.canon.clean=<uppercase-normalizer>` and
      `filter.canon.required=true`, a committed canonical blob `HELLO`,
      and working-tree content `hello` — ordinary Git, with the real
      global filter visible, correctly reports the path clean; the
      identical repository, inspected with `GIT_CONFIG_GLOBAL=/dev/null`
      (BR3's own mandatory isolation), instead reports the path
      **modified** — a false working-tree fact, reached *even with*
      Round 6's config-enumeration discovery in place, since that
      discovery (also run under the same neutralized global config) finds
      no `filter.canon.clean` key at all and never triggers a refusal.
      Config-enumeration alone cannot close this gap, because the very
      isolation BR3 correctly applies for its *actual* inspection
      commands is what hides the driver definition from the discovery
      step too.
    - **The corrected contract: detect repository-*effective* filter
      *attribute usage*, not merely visible driver *definitions* —
      never execute, refuse safely.** Instead of (or in addition to —
      see below) asking "is a filter driver defined," BR3 asks the more
      fundamental, correctly-scoped question: **"does any path this
      inspection would touch have an active `filter` attribute at all,"**
      using Git's own non-executing attribute-resolution machinery,
      which answers this truthfully regardless of whether the
      corresponding driver command is visible, defined, or even exists:
      1. **Enumerate the relevant tracked paths** using the same
         NUL-safe `git ls-files --stage -z` primitive already used for
         submodule discovery (§18) — every tracked path is a candidate,
         since any of them could carry a `filter` attribute via
         `.gitattributes`.
      2. **Query each path's repository-effective `filter` attribute,
         under BR3's own sanitized execution environment — wording
         corrected, Round 8 review finding #6A** via `git check-attr
         --stdin -z filter`, fed the NUL-delimited path list from step 1
         on stdin, with `--stdin -z` requested for both input and output
         (Git supports NUL-delimited stdin/output for `check-attr`
         specifically for this kind of bulk, path-safe query). This is
         Git's own documented, **non-executing** attribute-resolution
         query — `check-attr` reports what attribute value(s) apply to
         each path exactly as Git's own internal machinery would resolve
         them, **without ever invoking the filter driver itself** — it
         answers "what filter, if any, is attached to this path," never
         "run the filter and show me the result." **The accurate
         contract, stated precisely: `check-attr` resolves
         repository-effective attributes under BR3's own sanitized
         execution environment (§19) — never "exactly mirroring ordinary
         Git behavior" as an earlier draft of this section imprecisely
         claimed.** BR3 deliberately runs every Git invocation, including
         this one, with `GIT_ATTR_NOSYSTEM=1` and an empty, BR3-controlled
         `XDG_CONFIG_HOME`, and with global Git configuration neutralized
         via `GIT_CONFIG_GLOBAL=<null device>` (§19) — so `check-attr`
         under this environment **honors exactly the repository-local
         attribute sources BR3 intentionally preserves** (a tracked
         `.gitattributes`, `.git/info/attributes`), and correctly does
         **not** see any global/system-level attribute source BR3
         intentionally neutralizes for every other inspection command —
         it would be inconsistent, and simply false, for this one query
         to somehow still consult sources the rest of BR3's own
         environment sanitization deliberately hides. **This is exactly
         the behavior the Round 7 global-driver-definition case actually
         needs, not a gap in it:** a repository's `.gitattributes`
         declaring `*.txt filter=canon` remains fully visible to
         `check-attr` under BR3's sanitized environment (it is
         repository-local, never neutralized), even though a global Git
         config's `filter.canon.clean=...` *driver definition* is
         correctly, separately hidden from BR3's actual inspection
         commands by the identical `GIT_CONFIG_GLOBAL` neutralization —
         the attribute (what §7a's mechanism detects) and the driver
         command (what config-enumeration alone insufficiently tried to
         discover, §18's Round 7 correction) are two different things,
         and only the first is what this mechanism's correctness actually
         depends on. Parsed via the identical byte-first, NUL-split,
         strict-UTF-8 pipeline §13 already defines for every other
         path-bearing BR3 command.
      2a. **Exact NUL output shape — new, mandatory, Round 8 review
         finding #6C.** For a single requested attribute (`filter`, as
         BR3 requests it here), `git check-attr --stdin -z filter`
         emits, for each queried path, a NUL-delimited **triple**:
         `<path>\0<attribute>\0<value>\0` — e.g., for a path `a.txt`
         with an active `canon` filter, the literal byte sequence
         `a.txt\0filter\0canon\0`. BR3 parses this triple structure
         explicitly (not merely splitting on NUL and assuming a
         path-per-record shape, which would misalign since each queried
         path produces **three** NUL-terminated fields, not one) —
         `<path>` (byte-first, NUL-split, strict-UTF-8-decoded exactly
         as every other path-bearing BR3 output), the literal, constant
         `<attribute>` field (always `filter`, since that is the only
         attribute BR3 ever requests — a sanity-checkable constant, not
         itself meaningfully variable), and `<value>` — the attribute's
         resolved value for that path. **The exact values Git's
         `check-attr` contract defines as inactive/unset**, none of
         which trigger a refusal: the literal string `unspecified` (the
         attribute is not set for this path at all — Git's own,
         documented "no attribute" signal) and the literal string
         `unset` (the attribute is explicitly unset, e.g. via a `-filter`
         `.gitattributes` rule). **Any other `<value>`** — in particular,
         but not limited to, the literal string `set` (the attribute is
         active with no specific value, e.g. a bare `filter`
         `.gitattributes` rule) or any named value (e.g. `canon`, the
         driver name) — is an **active** `filter` attribute and triggers
         the refusal in step 3 below. This exact value taxonomy (
         `unspecified`/`unset` = inactive, everything else = active) is
         tested directly (§20), not merely asserted.
      3. **If any queried path reports an active `filter` attribute**
         (a value other than Git's own `unspecified`/unset signal) —
         **fail before any `status`/`diff` invocation** with
         `EXTERNAL_GIT_FILTER_UNSUPPORTED` (§17), naming the affected
         path(s)/attribute value(s) in `details`. This refusal applies
         **unconditionally, regardless of where the corresponding driver
         command is or isn't defined** — repository-local, included from
         another config file, global/user-level (and therefore
         intentionally hidden by BR3's own sanitized inspection
         environment), or not defined anywhere at all (an attribute
         naming a driver Git cannot even resolve, which — left
         unaddressed — Git itself would likely fail on anyway, but BR3
         does not rely on that failure to catch this case; the refusal
         happens regardless). **The conservative refusal is always
         preferred to silently proceeding and risking a changed content
         semantics interpretation** — BR3 does not attempt to determine
         whether a given attribute's driver would, in this specific
         instance, actually alter the result; any active `filter`
         attribute is sufficient grounds for refusal.
      4. **The check itself never executes the filter** — `check-attr`
         is, by Git's own design and documentation, a pure
         attribute-resolution query with no content-transformation
         side effect; this is what makes it safe to run
         unconditionally, on every tracked path, before deciding whether
         `status`/`diff` may proceed at all.
      5. **`GIT_CONFIG_GLOBAL=<null device>` is preserved, unmodified,
         for the actual BR3 inspection commands (`status`/`diff`
         themselves) — this correction does not re-enable arbitrary
         global Git config to make filter discovery possible.** The
         `check-attr` query runs under the identical sanitized
         environment as every other BR3 Git invocation (§19); it does
         not need to see the global config to answer "does this path
         have an active filter attribute," since `.gitattributes`
         (repository-local, always visible) is what declares the
         attribute in the first place — only the corresponding *driver
         command definition* can live in the hidden global layer, and
         this mechanism no longer depends on seeing that definition at
         all, since it asks about attribute *usage*, not driver
         *availability*.
      6. **The `check-attr` effective-attribute scan is mandatory before
         every `status`/`diff` operation that could otherwise trigger a
         content filter — corrected, mandatory, Round 8 review finding
         #6B (the previous "optional fast path" framing is circular and
         withdrawn).** An earlier draft of this section suggested a
         repository with "zero declared filter drivers *and* zero active
         filter attributes" could skip the `check-attr` scan as a cheap
         fast path — but **"zero active filter attributes" is exactly
         the fact only the `check-attr` scan itself establishes**; no
         other mechanism this specification defines proves that fact
         independently and non-executingly, so treating it as a
         precondition for skipping the very check that determines it is
         circular reasoning, not a real optimization. **This is
         withdrawn: there is no skip condition.** The `check-attr`
         effective-attribute scan runs, unconditionally, before every
         `status`/`diff` invocation that could otherwise trigger a
         content filter — full stop. Config-enumeration (the
         `filter.<name>.clean=` etc. key search) may still be retained
         **purely as supplementary diagnostic information** (e.g. to
         enrich `details` with a driver name when one happens to be
         discoverable) — but it is never, under any circumstance, treated
         as sufficient grounds to skip or short-circuit the mandatory
         `check-attr` scan; config-enumeration alone is explicitly
         documented as insufficient, per the verified global-config gap
         above, and must never be treated as sufficient on its own, for
         any purpose, by a future maintenance change.
      7. **Recursion into every initialized submodule, identically —
         unchanged in scope from Round 6, corrected in mechanism:** the
         identical `ls-files --stage -z` enumeration → `check-attr
         --stdin -z filter` query sequence runs, recursively, against
         every **initialized** submodule's own tracked paths (first-level
         and nested — via the submodule-enumeration mechanism below,
         itself corrected by Round 6 review finding #2 to use a NUL-safe,
         non-human-oriented command, and by Round 7 review finding #5 to
         be symlink/cycle-safe), since a submodule-local `.gitattributes`
         rule is exactly as reachable during BR3's
         `--ignore-submodules=none` status inspection (§11) as a
         superproject-local one.
      - **`core.fsmonitor` is unaffected by this correction and remains
        suppressed via `-c core.fsmonitor=`, never refused.** `fsmonitor`
        is a pure filesystem-change-detection *optimization hook* — Git's
        own documented contract is that a configured `fsmonitor`
        response can only ever narrow which paths Git bothers to
        `lstat`/re-check; it has no authority to redefine what "clean" or
        "modified" *means* for any path's content the way a clean filter
        does, and Git's own status/diff computation does not treat a
        missing or suppressed `fsmonitor` response as anything other
        than "assume everything might have changed, fall back to a full
        recheck" — i.e. suppressing it can only make Git do *more*
        verification work, never report a different, incorrect
        clean/modified verdict. Disabling it therefore cannot manufacture
        a false working-tree fact the way disabling a clean filter can,
        so the existing `-c core.fsmonitor=` suppression (above) is
        retained exactly as previously specified, for both the
        superproject and every initialized submodule.
    - **No mutation, no execution, no masking:** at no point does this
      corrected mechanism run a discovered driver, run a no-op
      replacement and present its output as equivalent, or otherwise
      attempt to "safely" execute or emulate the filter. Neither the
      config-enumeration query (`config --get-regexp`, read-only
      configuration text only) nor `check-attr --stdin -z` (a pure,
      non-executing attribute-resolution query, by Git's own design)
      ever triggers the filter itself — a content filter is only ever
      reachable through an actual content-comparison operation
      (`status`/`diff`/`checkout`), none of which run before the refusal
      is decided.
    - **Caching:** implementation may perform this discovery once per
      `resolveRepository`-validated `projectRoot` (tracked-path/attribute
      configuration is not expected to change mid-call) rather than once
      per `status`/`diff` call — this is an internal implementation
      choice, not a caller-visible contract, exactly mirroring Round 5's
      identical caching note for the (withdrawn) suppression mechanism.
- **Initialized-submodule enumeration — corrected mechanism, Round 6
  review finding #2: `git submodule status --recursive` is withdrawn.**
  Round 5 of this specification enumerated initialized submodules
  (recursively, for both the fsmonitor/filter discovery above and
  `SubmoduleState` reasoning generally) via `git submodule status
  --recursive`. **That command is removed from BR3's design entirely —
  it must never be invoked.** It is a human-oriented porcelain command:
  its output is a line-per-submodule mixture of a one-character status
  prefix, an object ID, a display path, and optional parenthesized
  `git describe`-style text, with **no NUL-delimited or otherwise
  path-safe output mode at all** — directly contradicting two of this
  specification's own, already-established, non-negotiable rules: "no
  human-oriented Git output is ever parsed" and "every path-bearing Git
  command uses NUL-delimited output" (§13, §19). A submodule path
  containing a space, a Unicode character, a tab, or (where the
  filesystem/Git permit it) a newline is exactly the kind of input this
  specification otherwise goes to considerable lengths (§13's `-z`
  parsing, buffer-first decoding) to handle safely everywhere else — a
  line-oriented submodule enumeration would silently reintroduce the
  identical class of parsing hazard in exactly one place.

  **The corrected mechanism — a path-safe plumbing design, using `git
  ls-files --stage -z` (already NUL-delimited, already machine-readable,
  already one of the read-only plumbing primitives this specification's
  discipline favors):**
  1. Run `git ls-files --stage -z` with `cwd` at the repository whose
     immediate (first-level only) submodule paths are being enumerated —
     `projectRoot` for the top-level call, or a previously-confirmed
     initialized submodule's own working-tree path for a recursive call
     (step 5 below). This lists every path in the index, NUL-delimited,
     each record `<mode> <object> <stage>\t<path>\0` — parsed via the
     identical byte-first, NUL-split, strict-UTF-8-per-path pipeline §13
     already defines for every other path-bearing BR3 command (no new
     parsing discipline is introduced; this command is folded into the
     existing one).
  2. **Identify gitlinks by index mode `160000`** — Git's own,
     unambiguous, machine-readable marker for "this path is a submodule
     reference, not an ordinary blob," independent of any porcelain
     rendering. Every other mode is not a submodule path and is ignored
     for this enumeration's purposes.
  3. For each gitlink path found, **determine whether it is genuinely
     initialized (its working tree actually populated) without
     initializing or mutating it and without executing anything inside
     it — and, corrected, Round 7 review finding #5, without ever
     following a symlink at the gitlink working-tree path itself:**
     - **First, `lstat` (never a symlink-following `stat`/`fs.stat`) the
       gitlink working-tree path itself** — the plain filesystem entry at
       `<gitlinkPath>`. **If this entry is a symbolic link, it is never
       treated as an initialized submodule checkout, unconditionally, no
       matter what it resolves to.** This is a deliberate, mandatory
       safety rule, not an incidental check: **verified directly** —
       replacing a real, previously-checked-out submodule's own working-
       tree directory (`sub`) with a symlink `sub -> .` (pointing back at
       the *superproject's own root*) leaves `git ls-files --stage`
       still, correctly, reporting `sub` as mode `160000` (the gitlink
       entry lives in the index, unaffected by what currently occupies
       the working-tree path), while `sub/.git` now resolves (through the
       symlink) to the *superproject's own* `.git`, and a Git command run
       with `cwd=sub` genuinely operates against the superproject itself
       — a naive "does `<gitlinkPath>/.git` exist" check, without first
       `lstat`-checking `<gitlinkPath>` itself, would treat this as a
       valid, initialized submodule and recurse into validating and
       enumerating the *superproject's own repository* as if it were a
       distinct child — the exact unbounded-recursion hazard this
       correction closes. A symlinked gitlink path can equally target a
       wholly unrelated external repository elsewhere on disk, letting
       recursive submodule enumeration escape the intended repository
       tree entirely. **Fail safely rather than silently follow it:** a
       gitlink path whose `lstat` reports a symbolic link produces
       `UNSAFE_SUBMODULE_PATH` (§17) for the enclosing enumeration —
       exactly the same "fail rather than silently skip a potentially
       executable/unsafe configuration" principle §18's filter-discovery
       mechanism already applies, now extended to a structurally
       different but equally real hazard (path redirection/traversal,
       not helper execution).
     - **Only if `lstat` reports an ordinary directory at `<gitlinkPath>`
       itself — corrected, Round 8 review finding #7B: the checkout/
       worktree *root* is always a directory; only its own internal
       `.git` *entry* may be either a directory or a `gitdir:` pointer
       file.** An earlier draft of this section imprecisely suggested the
       gitlink working-tree path itself could be "a regular file, for a
       worktree-style checkout" — this conflated the root with its own
       `.git` entry one level down; the working-tree root a caller
       navigates into is always a directory, exactly as §8's own
       `RepositoryInfo`/root-validation model already assumes for every
       other `projectRoot`. Only once `<gitlinkPath>` itself is confirmed
       an ordinary directory does BR3 check, via plain, ordinary
       filesystem inspection (no Git invocation against the submodule
       path yet), whether `<gitlinkPath>/.git` exists (file or
       directory). An uninitialized
       submodule (`git submodule update --init` never run, or explicitly
       deinitialized) has **no** `.git` entry at all — its directory is
       empty or absent from the working tree — so this check alone,
       performed with zero Git subprocess invocations against the
       submodule path, safely and conclusively distinguishes "nothing to
       inspect here" from "a real checkout exists here" before BR3 ever
       runs a Git command with `cwd` inside it. A gitlink path whose
       `.git` entry is absent is excluded from every further step below
       — consistent with Round 5's original intent ("an uninitialized
       submodule has no checked-out working tree... BR3 does not
       initialize it itself"), now reached via a safe filesystem check
       instead of parsing a human-oriented status-line prefix character.
  4. For each gitlink path confirmed initialized (and confirmed
     **not** itself a symlink) by step 3, **validate it safely** before
     treating it as a nested repository to enumerate into: run
     `resolveRepository`-equivalent validation (§8) with that path as the
     candidate root — i.e. the same Git-first
     `--is-bare-repository`/`--git-dir`/`--git-common-dir` sequence
     already defined for any other `projectRoot`, **retaining the
     resolved `--git-dir` and `--git-common-dir` values themselves, not
     merely the pass/fail outcome — corrected, Round 8 review finding
     #3A**, since step 4a below needs them. If this validation fails for
     any reason (the `.git` entry exists but is itself malformed,
     dangling, or otherwise unsafe to inspect), the enclosing enumeration
     does **not** silently skip that submodule and proceed as if it had
     no filter/config to contribute — it surfaces the corresponding typed
     `GitError` (§17) from that nested validation, causing the overall
     filter-discovery (or other submodule-aware) operation to fail rather
     than silently treat an uninspectable submodule as safe. This is the
     deliberate, explicit choice this round's finding requires: "if a
     child repository cannot be safely inspected, return the appropriate
     typed failure rather than silently skipping a potentially executable
     configuration."
  4a. **Cycle/alias guard — corrected, mandatory, Round 7 review finding
     #5, extended to cover repository-metadata identity, not only
     working-tree roots, Round 8 review finding #3A.** Round 7's guard
     tracked only each child's canonical **working-tree root**
     (`fs.realpath` on the gitlink path itself) — **this is insufficient
     on its own**, because a gitlink working-tree path can be an
     ordinary, non-symlinked directory (passing step 3 cleanly) whose
     `.git` **entry** is itself a text file containing a `gitdir:`
     pointer that redirects Git's actual metadata resolution (`--git-dir`/
     `--git-common-dir`) to a *different* location entirely — a
     mechanism step 3's `lstat`-on-the-working-tree-path check does not
     inspect at all, since the working-tree path itself is never a
     symlink in this construction. **Verified directly, two independent
     reproductions:**
     - A `parent/fake/.git` file containing `gitdir: /tmp/unrelated/.git`
       (an entirely unrelated repository elsewhere on disk): `git -C
       parent/fake rev-parse --show-toplevel` reports `parent/fake` (a
       plausible-looking working-tree root), while `--git-dir` and
       `--git-common-dir` both resolve to `/tmp/unrelated/.git` — the
       *metadata* belongs to a wholly different repository than the
       working-tree root suggests.
     - A `parent/sub/.git` file containing `gitdir: ../.git` (the
       *parent's own* `.git`, not a distinct submodule directory under
       `.git/modules/`): `git -C sub rev-parse --show-toplevel` reports
       `parent/sub`, but `--git-dir`/`--git-common-dir` both resolve to
       the *parent repository's own* `.git`, and `git -C sub ls-files
       --stage` genuinely reads the **parent's own index** — `sub` is
       not a distinct repository at all, it is the parent repository
       viewed through a redirected metadata pointer.

     In both reproductions, Round 7's working-tree-root-only visited set
     sees two genuinely distinct canonical *working-tree* roots
     (`parent` and `parent/fake`/`parent/sub`) and therefore never
     detects the alias — the cycle/escape is invisible at the
     working-tree-root level because it exists at the *metadata* level.

     **The corrected guard tracks canonical metadata identity, not only
     canonical working-tree roots:** maintain a **visited set of
     canonical `(gitDir, gitCommonDir)` pairs** (each individually
     resolved via `fs.realpath`, exactly as §8 already canonicalizes
     every other filesystem path this specification compares) alongside
     the existing canonical-working-tree-root visited set from Round 7 —
     both sets are maintained together, seeded with the top-level
     `projectRoot`'s own values before recursion begins. **Before
     recursing into a step-4-validated child, check its canonical
     `gitDir`/`gitCommonDir` (retained from step 4's own validation)
     against the metadata-identity visited set — independently of the
     working-tree-root check.** If either the child's canonical
     working-tree root **or** its canonical `gitDir`/`gitCommonDir` pair
     is already present in the corresponding visited set, the enumeration
     fails deterministically with `UNSAFE_SUBMODULE_PATH` (§17) **before
     any further inspection of that child proceeds** — the aliased/
     external repository is never recursively inspected. Only once both
     checks pass are the child's canonical working-tree root and its
     canonical metadata identity added to their respective visited sets,
     and recursion (step 5) performed.

     **Parent→child relationship validation — new, mandatory, Round 8
     review finding #3B.** Passing Git's own operational validation
     (§8) and the visited-set checks above is **necessary but not
     sufficient** — BR3 does not accept an arbitrary `.git` pointer
     merely because Git itself can operate against it; it additionally
     requires the child's resolved metadata to sit in a
     **relationship this specification explicitly recognizes as a
     legitimate parent→child submodule shape**, one of:
     1. **Old-form submodule:** the child's working-tree path is an
        ordinary directory, and its `.git` entry is itself an ordinary
        **directory** (not a pointer file) — the child is fully
        self-contained.
     2. **Absorbed gitdir layout** (the modern, `git submodule add`
        default): the child's `.git` entry is a pointer **file**, and
        the `gitdir:` target it names resolves to a location **beneath
        the parent repository's own `--git-common-dir`** (conventionally
        `<parent-git-common-dir>/modules/<name>`, but recognized by the
        resolved-path relationship, not by pattern-matching the literal
        conventional path string) — i.e. the child's metadata is
        genuinely owned by, and stored inside, the parent repository's
        own Git directory, not borrowed from anywhere else.
     3. **Legitimate nested submodule:** the identical relationship
        (case 2, recursively) between a nested child and its own
        immediate parent (itself an already-validated submodule).

     **Any `.git` pointer shape outside these explicitly-recognized
     relationships is rejected as `UNSAFE_SUBMODULE_PATH`** — in
     particular, and explicitly: a child `.git` pointer resolving to the
     *parent's own* `--git-dir`/`--git-common-dir` (reproduction 2
     above — the child is not a distinct repository at all); a child
     `.git` pointer resolving to any location **outside** the parent's
     own `--git-common-dir` tree (reproduction 1 above — an unrelated
     external repository); and a child whose metadata identity is
     already in the visited set (the cycle/alias guard above). **BR3
     never recursively inspects the aliased or external repository
     before this refusal is produced** — the parent→child relationship
     check runs on the *already-resolved* `gitDir`/`gitCommonDir` values
     from step 4's own validation, before step 5's recursion step is
     ever reached for that child.
  5. **Recurse:** for each child that has passed step 3 (not a symlink),
     step 4 (Git-validated), step 4a's visited-set checks (working-tree
     root **and** metadata identity, neither already visited), and step
     4a's parent→child relationship validation (a recognized legitimate
     shape), repeat step 1 (`git ls-files --stage -z`, `cwd` at that
     submodule's own path) to discover any further, nested gitlinks,
     applying steps 2–4a identically at each level. This naturally walks
     the full nested submodule tree using only the same safe,
     NUL-delimited primitive at every depth — there is no separate
     "nested" mechanism, exactly mirroring how Round 5's `--recursive`
     flag was intended to cover nesting, but now achieved through
     recursion over a path-safe command instead of a single
     human-oriented command's own built-in recursion, and now bounded by
     both the working-tree-root and metadata-identity visited sets rather
     than relying on the nested tree being acyclic by assumption.
  6. **`git submodule foreach` is never used, anywhere in BR3, for this
     or any other purpose.** It evaluates a caller/config-supplied
     command string *inside* each submodule's own context — a
     fundamentally different, mutation-shaped, arbitrary-execution
     primitive that violates §18's core subprocess-boundary discipline
     (BR3 spawns exactly `git` itself, with a fixed, BR3-controlled argv;
     it never asks Git to itself evaluate a further, separate command).
  7. **This enumeration mechanism is the single, shared primitive** for
     every BR3 need that requires knowing "which submodule paths are
     initialized" — both the filter/fsmonitor-driver discovery above and
     any other BR3 behavior that reasons about initialized submodules —
     so there is exactly one place this logic could regress, not a
     duplicated implementation per caller. This includes the symlink
     rejection (step 3), the working-tree-root-and-metadata-identity
     cycle/alias guard, and the parent→child relationship validation
     (step 4a): every BR3 consumer of this enumeration mechanism
     automatically inherits all three protections, since they are
     internal to the one shared mechanism, not a per-caller
     responsibility.
  8. **Legitimate shapes remain fully supported, precisely the three
     shapes step 4a's relationship validation explicitly recognizes:**
     an old-form submodule (child `.git` is its own directory); the
     standard, modern absorbed-gitdir layout `git submodule add`
     produces (child `.git` is a pointer file resolving beneath the
     parent's own `--git-common-dir`); and a nested submodule using the
     identical absorbed-gitdir relationship one level deeper. All three
     pass step 3 (never symlinks), step 4 (Git-validated), step 4a's
     visited-set checks (genuinely distinct working-tree roots and
     metadata identities at every level), and step 4a's relationship
     validation (metadata genuinely owned by the immediate parent) —
     exactly as before this round's correction. Only a genuinely
     symlinked gitlink path, a genuine working-tree-root or
     metadata-identity revisit, or a `.git` pointer resolving outside the
     recognized parent→child relationship triggers `UNSAFE_SUBMODULE_PATH`.

  **Command allowlist correction:** this specification's Git-subcommand
  allowlist (§5, §6, §27, and every place this document names "the
  commands BR3 invokes") is corrected to add `ls-files` and `check-attr`
  alongside `status`, `diff`, `rev-parse`, `symbolic-ref`, `config` — it
  is no longer accurate to state BR3's implementation contains only the
  original five read-only subcommands. `ls-files --stage -z` is
  read-only (it reads the index; it performs no working-tree scan and
  triggers no content-filter invocation — `--stage` reports the index's
  own recorded mode/object/stage for each path directly, with no content
  comparison at all) and fits the identical "argv-array, NUL-delimited,
  machine-readable plumbing" discipline every other allowlisted command
  already follows. `check-attr --stdin -z filter` (added — Round 7
  review finding #4, the effective-filter-attribute detection mechanism
  above) is likewise read-only and non-executing by Git's own design —
  it resolves attribute values for supplied paths without ever invoking
  a content filter — and follows the identical NUL-delimited,
  machine-readable-input/output discipline.

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
     the prefix `GIT_`, matched case-insensitively — corrected, Round 8
     review finding #4 (a case-sensitive filter is a real gap on
     Windows).** Windows environment variable names are case-insensitive
     — a key spelled `git_dir`, `Git_Dir`, or `gIt_InDeX_fIlE` in the
     parent process's own environment is, from Windows' and Git's own
     perspective, the identical variable as `GIT_DIR`/`GIT_INDEX_FILE`,
     but a naive `k.startsWith("GIT_")` JS-string check (case-sensitive
     by default) would fail to match any of these differently-cased
     spellings and silently let them survive the strip — exactly the
     `GIT_DIR`-redirection hazard this section exists to close,
     reachable again through nothing more than a case difference. **The
     corrected filter normalizes each key before testing it**:
     `Object.fromEntries(Object.entries(process.env).filter(([k]) =>
     !k.toUpperCase().startsWith("GIT_")))` — `key.toUpperCase()` is a
     single, simple, platform-uniform normalization applied on every
     platform (not merely gated behind a Windows-only code path), so the
     identical logic is correct and equally safe on POSIX systems, where
     environment variable names are case-sensitive and this
     normalization is simply a no-op for the common case (`GIT_*`
     already uppercase). This remains **not** an enumerated blocklist of
     specific variable names — `GIT_DIR`, `GIT_WORK_TREE`,
     `GIT_INDEX_FILE`, `GIT_COMMON_DIR`, `GIT_OBJECT_DIRECTORY`,
     `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_CEILING_DIRECTORIES`,
     `GIT_DISCOVERY_ACROSS_FILESYSTEM`, `GIT_CONFIG`,
     `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_*`/
     `GIT_CONFIG_VALUE_*`, `GIT_CONFIG_GLOBAL`, and `GIT_CONFIG_SYSTEM`
     are the specific threats this section verifies below, but they are
     **illustrative of the threat class, not an exhaustive list this
     filter enumerates** — Git adds new `GIT_*`-prefixed environment
     variables across releases, and a name-by-name blocklist would need
     updating every time one is added; a blanket, case-insensitive
     prefix strip has no such maintenance burden and no such gap, on
     either platform.
  2a. **Normalize the effective `PATH` key to exactly one, deterministic
     entry — new, mandatory, Round 8 review finding #4.** Node
     documents special handling when a supplied `env` object contains
     multiple case variants of the same logical variable (e.g. both
     `PATH` and `Path`) — only one case-insensitive match is actually
     passed through to the subprocess, selected according to Node's own
     internal key-handling behavior, which BR3 does not control and must
     not rely on implicitly. Since §8's in-process executable-resolution
     mechanism (the "Git Capability Floor" subsection, Round 8 review
     finding #2) depends on walking the effective `PATH` value BR3
     itself will hand to `execFile`, an ambiguous, multi-cased `PATH`
     input would make resolution and actual subprocess execution
     potentially disagree about which `PATH` value is in effect. BR3
     therefore normalizes `process.env`'s `PATH`-family keys to exactly
     one, canonically-cased key (`PATH` on every platform, matching
     Node's own convention) before constructing the sanitized child
     environment: if multiple case variants are present in
     `process.env`, one deterministic value is selected (implementation's
     choice of which, but applied identically to both the value BR3's
     in-process executable-resolution mechanism reads and the value
     passed to `execFile` — the two must never diverge), and every other
     case variant is removed from the constructed environment object
     entirely, so the object BR3 builds contains exactly one `PATH`-family
     key, never two ambiguous ones.
  3. **Explicitly re-add only the specific `GIT_*` variables BR3 itself
     sets and controls**, listed individually below — never restoring any
     of the stripped, inherited values, and **added in exactly one
     canonical-case form (`GIT_*`, uppercase) with no differently-cased
     duplicate ever present alongside them** — corrected, Round 8 review
     finding #4: since step 2's strip is now case-insensitive, BR3's own
     re-added variables are the *only* `GIT_*`-shaped keys that can
     survive into the constructed environment, and they are always
     written in the same canonical uppercase form, eliminating any
     possibility of a case-variant collision between an inherited
     (now-stripped) key and a BR3-controlled one.
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
  - **`GIT_ATTR_NOSYSTEM: "1"`** — **new (Round 4 review finding #2)**;
    the direct `.gitattributes`-equivalent of `GIT_CONFIG_NOSYSTEM` —
    prevents an unusual machine-wide system-level Git attributes file
    from silently altering behavior (e.g. a path's `-text`/`-diff`
    attribute), for the identical rationale as `GIT_CONFIG_NOSYSTEM`
    above.
  - **`GIT_NO_LAZY_FETCH: "1"`** — **new (Round 5 review finding #1)**;
    closes the partial-clone/promisor-remote network gap. A partial
    clone (`git clone --filter=...`) or any repository with one or more
    configured promisor remotes can be missing objects locally by
    design; by default, when a BR3-invoked Git command (`status`,
    `diff`, `rev-parse`, etc.) needs an object that is not present
    locally, Git automatically attempts to **fetch it on demand from the
    configured promisor remote** — a genuine network operation triggered
    transparently from inside an otherwise read-only, "local-only"
    command, and exactly the kind of hidden network access §6's "no
    network access of any kind" guarantee exists to rule out.
    `GIT_NO_LAZY_FETCH=1` (Git's own documented environment-variable
    mechanism, equivalent to the global `--no-lazy-fetch` flag) instructs
    Git to **never** perform this on-demand fetch, failing the local
    operation instead when a required object is genuinely absent. This
    protection must be BR3's own, unconditionally re-added variable, not
    merely inherited from the caller's environment: **§19's own
    unconditional `GIT_*`-prefix strip (step 2 above) removes any
    inherited `GIT_NO_LAZY_FETCH` a caller may have already set**, so
    without re-adding it explicitly as one of BR3's own controlled
    variables, a caller who protected themselves against lazy-fetch would
    silently lose that protection the moment BR3 invoked Git on their
    behalf. `GIT_NO_LAZY_FETCH` is therefore added to the same explicit,
    re-added set as `GIT_OPTIONAL_LOCKS`/`GIT_CONFIG_NOSYSTEM`/
    `GIT_CONFIG_GLOBAL`/`GIT_ATTR_NOSYSTEM` above — applied unconditionally
    to every BR3 Git subprocess, not merely the ones expected to touch
    promisor objects, for the identical "one place, no detect-then-decide
    race" rationale §18's `core.fsmonitor=` override already establishes.

  This brings the controlled `GIT_*` variable count to **seven** (not six,
  as of Round 4) — every occurrence of "six" describing this set
  elsewhere in this document is updated to "seven" as part of this
  round's correction.

  Together, steps 1–4 mean the final `env` passed to every BR3 `execFile`
  call is `process.env` **minus every `GIT_*`-prefixed key, unconditionally**,
  **plus** exactly the seven `GIT_*` keys named above **plus** `LC_ALL`/
  `LANG` **plus** the `XDG_CONFIG_HOME` override described immediately
  below (which is not itself a `GIT_*`-prefixed variable, and is counted
  separately) — never a wholesale `{ ...process.env }` spread with ad-hoc
  additions layered on top. This is constructed once, in the one shared
  `internal/exec.ts` helper (§18) — not per call site — so there is
  exactly one place in the codebase this sanitization could regress.

- **User-level global ignore/attributes isolation — new (Round 4 review
  finding #2):** `GIT_CONFIG_GLOBAL` (above) neutralizes the
  `~/.gitconfig`-equivalent global **config** file, but Git independently
  consults a **separate** pair of user-level default locations for a
  global ignore file and a global attributes file —
  `$XDG_CONFIG_HOME/git/ignore` (falling back to `$HOME/.config/git/ignore`
  when `XDG_CONFIG_HOME` is unset) and `$XDG_CONFIG_HOME/git/attributes`
  (falling back to `$HOME/.config/git/attributes`) respectively — neither
  of which `GIT_CONFIG_GLOBAL` touches at all, and neither of which is a
  `GIT_*`-prefixed environment variable (so the blanket `GIT_*` strip
  above does not address them either). **Verified directly**, in a real
  fixture repository with one untracked file:
  ```
  $ git status --porcelain=v2 --untracked-files=all
  ? secret-untracked.txt                              # reported, baseline

  $ echo "secret-untracked.txt" > $FAKE_XDG/git/ignore
  $ XDG_CONFIG_HOME=$FAKE_XDG git status --porcelain=v2 --untracked-files=all
                                                        # (empty — the file
                                                        #  vanished from output)
  ```
  and, confirming the `$HOME` fallback independently (with `XDG_CONFIG_HOME`
  genuinely unset, not merely empty):
  ```
  $ echo "secret-untracked.txt" > $FAKE_HOME/.config/git/ignore
  $ env -u XDG_CONFIG_HOME HOME=$FAKE_HOME git status --porcelain=v2 --untracked-files=all
                                                        # (empty — the
                                                        #  $HOME fallback
                                                        #  path is
                                                        #  genuinely
                                                        #  consulted too)
  ```
  and, for the attributes file specifically, using `git check-attr` as the
  observable proof mechanism (chosen because it directly reports which
  attributes are in effect for a path, rather than requiring an indirect,
  diff-visible side effect):
  ```
  $ git check-attr text -- test.bin
  test.bin: text: unspecified                          # baseline

  $ echo "*.bin -text" > $FAKE_XDG/git/attributes
  $ XDG_CONFIG_HOME=$FAKE_XDG git check-attr text -- test.bin
  test.bin: text: unset                                 # attribute IS
                                                          # being read from
                                                          # the fake XDG
                                                          # location
  ```
  **The fix, verified directly:** pointing `XDG_CONFIG_HOME` at a
  fresh, empty directory (one BR3's own exec helper controls, containing
  no `git/ignore` or `git/attributes` file) fully neutralizes **both** the
  `XDG_CONFIG_HOME`-direct path and the `$HOME`-fallback path
  simultaneously — verified by re-running the exact `$HOME`-fallback
  reproduction above with `XDG_CONFIG_HOME` additionally set to an empty
  directory (while `$HOME` still points at the fixture containing the
  real ignore file):
  ```
  $ XDG_CONFIG_HOME=$EMPTY_DIR HOME=$FAKE_HOME git status --porcelain=v2 --untracked-files=all
  ? secret-untracked.txt                                # REAPPEARS — the
                                                          # empty
                                                          # XDG_CONFIG_HOME
                                                          # suppresses the
                                                          # $HOME fallback
                                                          # too, not merely
                                                          # its own direct
                                                          # path
  ```
  and the same for attributes:
  ```
  $ XDG_CONFIG_HOME=$EMPTY_DIR git check-attr text -- test.bin
  test.bin: text: unspecified                            # back to baseline
                                                          # — neutralized
  ```
  This single mechanism therefore fully addresses both the
  `XDG_CONFIG_HOME`-direct and `$HOME`-fallback cases with one override —
  BR3 does **not** additionally need to override `HOME` itself. The
  mechanism: **`XDG_CONFIG_HOME` is unconditionally set to a fresh, empty
  directory** BR3's own exec helper creates/controls (implementation may
  reuse a single such directory across the process lifetime rather than
  creating one per invocation — it need only be empty and contain no
  `git/` subdirectory) as part of the same `env` construction algorithm
  above (added as a non-`GIT_*` override, alongside `LC_ALL`/`LANG`, not
  counted among the seven `GIT_*` variables above since it is not itself
  `GIT_*`-prefixed).
  - **Repository-local `.git/info/exclude` — explicitly decided: honored
    (verified directly, alongside repository-local `.gitignore` below).**
    This is a third, distinct ignore mechanism (neither the repository's
    own tracked `.gitignore` nor the neutralized global ignore file) —
    but it is genuinely repository-local state, exactly like `.gitignore`
    itself, and BR3's stated goal throughout this section is to honor
    repository-local state while neutralizing user/global state. BR3 does
    not suppress it.
  - **Repository-local `.gitignore`/`.gitattributes` remain fully
    honored — verified directly**, with the `XDG_CONFIG_HOME` override
    from this fix applied simultaneously:
    ```
    $ echo "local-ignored.txt" > .gitignore   # tracked, repo-local
    $ echo "info-excluded.txt" >> .git/info/exclude
    $ XDG_CONFIG_HOME=$EMPTY_DIR git status --porcelain=v2 --untracked-files=all
                                                # neither local-ignored.txt
                                                # nor info-excluded.txt
                                                # appear — both
                                                # repository-local
                                                # mechanisms remain fully
                                                # effective
    ```
  - **Repository-local `.git/config` remains fully available —
    unaffected by this mechanism** (confirmed explicitly for completeness,
    consistent with Round 3's `GIT_CONFIG_GLOBAL` design): `XDG_CONFIG_HOME`
    only ever influences Git's *global-default-location* ignore/attributes
    file discovery, never `.git/config` resolution (which is governed by
    `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM`/the repository's own
    `.git/config` path directly, none of which `XDG_CONFIG_HOME` touches)
    — §9/§10's `branch.<b>.remote`/`.merge` reads continue to work
    unaffected, exactly as before this fix.
  - Four dedicated regression tests (inherited `XDG_CONFIG_HOME`-based
    ignore, inherited `XDG_CONFIG_HOME`-based attributes, `GIT_ATTR_NOSYSTEM`
    disabling system attributes, and repository-local ignore/attributes
    behavior remaining intact) are required (§20).

- **Partial-clone / promisor lazy-fetch network isolation — new (Round 5
  review finding #1):** §6's "no network access of any kind" guarantee,
  and this section's own `GIT_TERMINAL_PROMPT=0`/read-only mechanisms
  above, address every *explicit* network-contacting Git command
  (`fetch`, `pull`, `push` — none of which BR3 ever invokes, §5/§6), but
  do not by themselves address Git's **implicit, automatic** promisor
  object lazy-fetch mechanism: a partial clone (`git clone
  --filter=blob:none`, etc.) or any repository with a configured
  promisor remote can have objects that exist only on that remote, not
  locally, by design — and by Git's own default behavior, an ordinary
  read-oriented command (`status`, `diff`, `rev-parse`, anything that
  needs to read a missing object's content) silently triggers an
  on-demand fetch from the configured promisor remote to retrieve it,
  entirely transparently to the caller. This is a genuine, hidden network
  operation reachable from inside what this specification otherwise
  documents as purely local, read-only Git invocations — exactly the gap
  §6's guarantee must also cover, not only the commands BR3 itself
  chooses to run.

  **The fix:** `GIT_NO_LAZY_FETCH=1` (re-added centrally, alongside
  `GIT_OPTIONAL_LOCKS=0`, as one of the seven controlled `GIT_*`
  variables above — not a separate mechanism) is Git's own documented
  environment-variable equivalent of the global `--no-lazy-fetch` flag:
  it instructs Git to never perform this on-demand promisor fetch,
  regardless of what any repository's local or global configuration
  declares. Because this is applied via the same unconditional,
  always-present `env` construction §19 already uses for every other
  controlled `GIT_*` variable (never a conditional, "only when a partial
  clone is detected" override), it applies identically whether or not
  `projectRoot` is actually a partial/promisor repository — inert, and
  harmless, in the ordinary case; load-bearing whenever it is not.

  **Required behavior:** a partial/promisor repository missing a locally
  required object must **fail the local BR3 operation** rather than
  silently causing a network fetch. No new `GitErrorCode` is introduced
  for this case — the resulting Git subprocess failure (a required
  object cannot be read because it is neither present locally nor
  fetchable) is reported through the existing `GIT_COMMAND_FAILED`
  catch-all (§17), consistent with that code's existing "the underlying
  cause is inherently open-ended" definition; a more specific code is
  not clearly justified here, since a caller's only actionable response
  to either "object missing, lazy-fetch disabled" or any other
  unanticipated Git failure is the same: this is not a repository shape
  BR3 documents as supported without a complete local object set. A
  dedicated regression test (§20) constructs a real local partial-clone
  fixture (a full-content local "origin" fixture repository plus a
  `--filter=blob:none` local clone of it, so no real network access is
  ever required to construct or exercise the fixture) missing at least
  one blob's content locally, then asserts BR3's Git invocation fails
  deterministically (`GIT_COMMAND_FAILED`) rather than transparently
  fetching that blob from the local "origin" — proving lazy-fetch is
  genuinely disabled, not merely documented as disabled.

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
  a subset, always preceded by the mandatory `-c core.fsmonitor=`
  override (§11, §18, Round 4 review finding #3) — and only ever run at
  all once BR3's effective-filter-attribute scan (`git check-attr --stdin
  -z filter` over every relevant tracked path, superproject and every
  initialized submodule recursively — §18, Round 6 review finding #1,
  detection mechanism corrected Round 7 review finding #4) has confirmed
  no path in scope has an active `filter` attribute; a discovered active
  attribute produces `EXTERNAL_GIT_FILTER_UNSUPPORTED` instead, before
  this invocation ever runs (§17, §18)** (§11 — restated here so this
  section, §11, §20, and §27 all name the identical command with no drift
  between them).
- **No reliance on Git aliases:** every BR3 Git invocation uses a
  first-argument literal plumbing/porcelain subcommand name
  (`status`, `diff`, `rev-parse`, `symbolic-ref`, `config`, `ls-files`,
  `check-attr`) that ships with Git itself — never a user-configurable
  alias name — so a local `~/.gitconfig`'s `[alias]` section can never
  redirect a BR3 invocation to different, unexpected behavior. (`config`
  is used read-only, for `--get branch.<branch>.remote`/`.merge` —
  §9/§10's upstream-identity determination, and for the
  filter/fsmonitor-driver-command enumeration query — §18; `ls-files
  --stage -z` is used read-only, for initialized-submodule discovery —
  §18's corrected submodule-enumeration mechanism, Round 6 review finding
  #2; `check-attr --stdin -z filter` is used read-only and
  non-executing, for effective-filter-attribute detection — §18, Round 7
  review finding #4.)
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
- **Malformed `.git/config` (real repository, syntactically-broken local
  config, e.g. an unterminated `[section` line) — new, Round 4 review
  finding #4** → `GIT_COMMAND_FAILED`, genuinely distinct from
  `NOT_A_GIT_REPOSITORY` — the specific regression test proving this
  case (verified: `--is-bare-repository` fails with the identical exit
  code, 128, as a plain non-Git directory) is correctly classified via
  the filesystem-based secondary check (`<projectRoot>/.git` exists and
  has the shape of a real Git directory), not collapsed into
  `NOT_A_GIT_REPOSITORY`
- **Ordinary non-Git directory, re-asserted as its own fixture alongside
  the malformed-config fixture above — new, Round 4 review finding #4**
  → `NOT_A_GIT_REPOSITORY`, proven distinct from the malformed-`.git/config`
  case even though both produce the identical underlying Git exit code
  (128) — the two fixtures run side-by-side in the same test to prove the
  filesystem-based secondary check genuinely discriminates them
- **Malformed bare repository (real bare repository created via `git init
  --bare`, then its own `config` file syntactically broken — an
  unterminated `[section` line, identical technique to the non-bare
  malformed-config fixture above) — new, Round 5 review finding #4** →
  `GIT_COMMAND_FAILED`, genuinely distinct from `NOT_A_GIT_REPOSITORY` —
  the specific regression test proving this case (verified:
  `--is-bare-repository` fails with exit 128, identical to both the
  malformed-non-bare-config case and the plain-non-Git-directory case;
  `<projectRoot>/.git` is, correctly, absent for a bare repository; yet
  `projectRoot/HEAD` remains present alongside intact `objects/`/`refs/`
  directories) is correctly classified via the bare-shape branch of the
  filesystem-based secondary check (§8), not collapsed into
  `NOT_A_GIT_REPOSITORY` the way it would have been under the
  Round-4-only non-bare-shape-only check — this fixture and the
  malformed-non-bare-config fixture above run side-by-side with the
  ordinary-non-Git-directory fixture in the same test to prove the
  secondary check correctly discriminates all three
- **Unsafe/dubious-ownership repository — not added as a fixture in this
  round (Round 4 review finding #4):** this scenario requires genuinely
  differing file ownership between the repository directory and the
  test-runner process, which could not be reliably or portably
  constructed in this environment; its typed behavior
  (`GIT_COMMAND_FAILED`, per §8) is specified directly from Git's own
  documented, stable dubious-ownership error contract rather than a
  fresh verified repro. If a future environment can construct this
  fixture (e.g. a container-based CI runner with a deliberately
  mismatched UID), adding it is a straightforward extension of this test
  category, not a design change.
- **`--show-toplevel` unexpected-failure reclassification — mandatory,
  new (Round 6 review finding #7):** construct a fixture where step 2
  (`--is-bare-repository`) succeeds with `false` but step 3
  (`--show-toplevel`) can be made to fail (e.g. by corrupting/removing
  `HEAD`/refs state in a way that leaves `--is-bare-repository` still
  answerable but breaks toplevel resolution, if such a fixture is
  practically constructible; otherwise this is proven at minimum by a
  focused unit test against the algorithm's own error-mapping logic,
  independent of a real, hard-to-construct Git failure combination) →
  `GIT_COMMAND_FAILED`, never `NOT_A_GIT_REPOSITORY` — proving the
  corrected error-taxonomy rule that `NOT_A_GIT_REPOSITORY` is
  unreachable once step 2 has already positively confirmed a real,
  non-bare repository exists.

**Git Capability Floor (§8) — mandatory, new, Round 6 review finding #3**
- **Supported version** (any real `git` binary at or above 2.45.0,
  i.e. whatever version the test environment's own Git satisfies, which
  is expected to already be within the supported floor) →
  `resolveRepository` proceeds normally, no `GIT_VERSION_UNSUPPORTED`
- **Unsupported version** (the capability-floor check's own parsing
  logic tested directly against a fabricated `git --version`-shaped
  string below 2.45.0, e.g. `git version 2.30.0`, via a focused unit
  test against the version-parsing/comparison function itself, rather
  than requiring an actual pre-2.45 Git binary to be installed in the
  test environment) → `GIT_VERSION_UNSUPPORTED`
- **Malformed/unexpected version response** (a fabricated string that
  does not match the expected `git version X.Y.Z` prefix shape at all,
  e.g. empty output or an unrecognized format, tested the same way as
  the unsupported-version case above) → `GIT_VERSION_UNSUPPORTED`, never
  silently treated as supported
- **Git executable unavailable remains distinct** (`PATH` manipulated so
  `git` cannot be found, exactly as the existing
  `GIT_EXECUTABLE_UNAVAILABLE` test already does) → `GIT_EXECUTABLE_UNAVAILABLE`,
  never `GIT_VERSION_UNSUPPORTED` — proving the two codes are reached via
  genuinely distinct conditions (binary not found vs. binary found but
  version rejected)
- **No repository mutation during capability detection** — `git
  --version` produces no `.git/index`/ref/config changes, confirmed by
  the same byte-level snapshot technique the existing index-mutation
  regression test (§20) already uses
- **Capability probe `cwd` behavior — new, Round 7 review finding #3**
  (asserted at the `internal/exec.ts` call-site level, e.g. by recording
  the actual `cwd` option passed for the `git --version` invocation) →
  confirms this one invocation genuinely uses the documented, explicit
  exception (`process.cwd()`/a fixed directory), never `projectRoot`
  (which is not yet known to exist at the point this check runs), and
  that every other BR3 `execFile` call continues to use `cwd:
  projectRoot` exactly as before — proving §8 and §18 no longer state
  contradictory `cwd` contracts
- **In-process executable resolution — mandatory, corrected mechanism,
  Round 8 review finding #2 (supersedes Round 7's "observe the resolved
  path from `execFile`" design, which is not implementable — Node's
  `child_process` API never exposes it):**
  - **Ordinary stable executable** (an ordinary, single-entry `PATH`
    pointing at one real, supported `git`) → resolution succeeds,
    produces the expected absolute path, and every subsequent Git
    command in the operation is invoked with that exact resolved path as
    `command` — asserted directly (e.g. by intercepting/recording the
    `command` argument passed to `execFile` at the shared exec
    primitive's own call site) rather than merely asserting the
    operation's semantic result.
  - **`PATH` changes between top-level BR3 calls** (a test-controlled
    `PATH` with two distinct fixture `git`-named executables — a real,
    supported `git` at one `PATH` entry for the first call, and a
    second, distinct executable at a different `PATH` entry after the
    test rewrites `PATH` mid-test — never uninstalling the real system
    Git) → the first call resolves and validates the first executable,
    succeeding; the second, subsequent top-level BR3 operation
    **re-resolves** `git` against the now-changed `PATH` (asserted via a
    call-count/invocation assertion on the resolution step itself, not
    merely the capability-check subprocess) and revalidates capability
    against the newly-resolved executable — proving a stale capability
    result is never silently reused across a `PATH`/executable-identity
    change.
  - **Second executable is below the Git floor** — a variant of the
    above where the second, newly-resolved executable is itself a
    below-floor (or malformed-version-string) stand-in → the second
    call's revalidation genuinely re-rejects, producing
    `GIT_VERSION_UNSUPPORTED`, even though the first call, against the
    first executable, succeeded — proving revalidation is genuinely
    enforced, not merely re-run-but-still-trusting-the-old-result.
  - **Capability gets revalidated, not merely re-cached** — confirmed by
    the two cases directly above; no separate test needed beyond them.
  - **Relative `PATH` entries cannot make the capability probe and a
    repository command execute different Git binaries — new, mandatory,
    Round 8 review finding #2** (a test-controlled `PATH` containing a
    relative entry, e.g. `.`, with two distinct fixture `git`-named
    executables placed such that the relative entry resolves to
    different binaries depending on `cwd` — verified directly during
    this round's reproduction to be a real hazard: `cwd=/tmp/A` resolves
    `./git` to one binary, `cwd=/tmp/B` to a different one, with the
    `PATH` string itself unchanged) → asserts that BR3's in-process
    resolution mechanism resolves the relative entry against the
    *correct*, call-appropriate `cwd` (the capability probe's own fixed
    `cwd` exception vs. an ordinary operation's `projectRoot`) each time,
    and that the resulting resolved absolute path is used consistently —
    proving a relative `PATH` entry cannot cause the capability check and
    a subsequent repository operation to silently execute different
    binaries under the same nominal `PATH` string.
  - **Windows executable-resolution semantics, where testable** (on a
    Windows test runner, or via a focused unit test against the
    resolution function's own Windows-specific branch, independent of
    the actual test-runner OS) — covers: (i) `PATHEXT`-based extension
    resolution (`git` resolving to `git.exe`/`git.cmd` per `PATHEXT`,
    not a bare-filename match); (ii) `PATH`/`Path`/`path`
    environment-key casing (resolution reads whichever casing is
    actually present in the sanitized child environment, per §19's
    Windows-casing correction); (iii) a resolved candidate is only
    accepted when it is genuinely executable in the Windows sense (an
    extension match against `PATHEXT`, not a POSIX execute-bit check).

**Object format / SHA width (§8) — mandatory, new, Round 6 review
finding #4**
- **Normal SHA-1 repository** (ordinary `git init`, the default object
  format on any Git within BR3's supported floor) → `resolveRepository`
  succeeds, `git rev-parse --show-object-format` reports `sha1`, no
  `UNSUPPORTED_OBJECT_FORMAT`
- **`git init --object-format=sha256` repository** →
  `UNSUPPORTED_OBJECT_FORMAT`, with `resolveRepository` failing before
  any later step (`inspectHead`/`inspectWorkingTree`/`inspectDiff`) is
  ever reached against that repository
- **No ambiguous truncation or 40-character assumption on SHA-256 data**
  — proven structurally: because `UNSUPPORTED_OBJECT_FORMAT` is produced
  at `resolveRepository` time, before any SHA-producing BR3 function
  runs, no test can construct a `HeadInfo.headSha`/`UpstreamInfo.sha`/
  `DiffResult.fromSha`/`.toSha` value derived from a SHA-256 repository
  at all — this is asserted by confirming every such field-producing
  function is provably unreached (e.g. via a call-count assertion or
  equivalent) once `resolveRepository` has already failed with
  `UNSUPPORTED_OBJECT_FORMAT` for that `projectRoot`

**Ref storage format (§8) — mandatory, new, Round 7 review finding #1,
made fail-closed Round 8 review finding #5**
- **Absent key → supported** (ordinary `git init`, no
  `extensions.refStorage` config key set) → `resolveRepository` succeeds,
  no `UNSUPPORTED_REF_FORMAT`
- **Explicit `files` → supported** (`extensions.refStorage` explicitly
  set to the literal value `files`) → `resolveRepository` succeeds
  identically to the absent-key case
- **`reftable` → `UNSUPPORTED_REF_FORMAT`** (`git init
  --ref-format=reftable` on a Git version within BR3's supported floor)
  → `resolveRepository` fails before any later step is ever reached
  against that repository — proving BR3 v0.1's reftable-rejection
  decision is genuinely enforced, not merely stated
- **Focused parser/decision test for an arbitrary future value — new,
  mandatory, Round 8 review finding #5** (a fabricated
  `extensions.refStorage` value the decision logic has never seen before,
  e.g. the literal string `future-backend`, tested directly against the
  decision function itself rather than requiring a real future Git
  release that supports such a backend) → `UNSUPPORTED_REF_FORMAT` —
  proving the contract is genuinely an allowlist of exactly `files`
  (fail-closed against anything else), not a denylist of `reftable`
  specifically that would silently pass an unrecognized value
- **Unexpected config-command failure → `GIT_COMMAND_FAILED`, never
  inferred as supported — new, mandatory, Round 8 review finding #5** (a
  fixture where `git config --get extensions.refStorage` fails for a
  reason distinct from ordinary key-absence — e.g. a permissions failure
  reading `.git/config`, or any other non-exit-1-clean failure
  constructible in the test environment) → `GIT_COMMAND_FAILED` — proving
  BR3 never treats an arbitrary command failure as equivalent to "key
  absent, `files`-backend supported"
- **Malformed `reftable`-backend repository remains `GIT_COMMAND_FAILED`,
  never conflated with `UNSUPPORTED_REF_FORMAT`** — re-asserted here
  against the malformed-bare-`reftable` fixture below, confirming the two
  codes are reached via genuinely distinct paths (one via the
  post-Git-failure secondary classifier when Git itself cannot answer at
  all, the other via a positive, successful config read reporting an
  unsupported value)

**Ref-backend-aware malformed-repository classification (§8) —
mandatory, new, Round 6 review finding #5**
- **Malformed ordinary (non-bare) `files`-backend repository** — the
  existing malformed-`.git/config` fixture above, re-asserted here as
  the `files`-backend baseline this category's other fixtures are
  contrasted against
- **Malformed bare `files`-backend repository** — the existing
  malformed-bare fixture above (Round 5), re-asserted here as the
  bare/`files`-backend baseline
- **Malformed bare `reftable`-backend repository** (a real bare
  repository created via `git init --bare --ref-format=reftable` on a
  Git version within BR3's supported floor that offers this flag,
  then malformed identically — its own `config` file broken the same
  way) → `GIT_COMMAND_FAILED`, genuinely distinct from
  `NOT_A_GIT_REPOSITORY` — proving the bare-shape secondary classifier's
  `reftable/tables.list`-alternative check (§8) correctly recognizes this
  repository as real-but-malformed even though it has no populated
  `refs/` tree, the way the `files`-backend bare fixture does
- **Plain non-repository directory** — re-asserted alongside the three
  fixtures above in the same test, proving all four are correctly,
  mutually discriminated by the corrected secondary classifier

**Branch + HEAD (§9, §10) — determination method revised, corrects Round
1 review findings #2 and #5, Round 2 review finding #2 (upstream
resolution redesigned again to use `@{upstream}` rather than a
hand-constructed `refs/remotes/<remote>/<branch>` path), and Round 4
review finding #5 (HEAD-resolves-to-a-real-commit validation via
`HEAD^{commit}` peeling, and the new corrupt-HEAD outcome)**
- Normal branch with commits → correct `branch`, `headSha`, `detached: false`, `unborn: false`
- Detached HEAD (checked out to a SHA) → `branch: null`, `detached: true`, correct `headSha`
- Unborn branch (fresh `git init`, zero commits) → `unborn: true`,
  `headSha: null`, correct pending `branch` name — the specific
  regression test proving this is derived from
  `symbolic-ref -q HEAD`/`rev-parse --verify -q HEAD^{commit}` exit codes
  alone (§9), not from any stderr text
- **Direct/detached HEAD pointing at a nonexistent object — new, Round 4
  review finding #5** (constructed by writing a non-existent, all-zeros
  SHA directly into a detached `.git/HEAD` file) → `HEAD_UNAVAILABLE`
  (§9's case 5, §17) — the specific regression test proving `rev-parse
  --verify -q HEAD` alone (bare, no `^{commit}`) is insufficient: it
  would incorrectly report exit 0 for this fixture, while `rev-parse
  --verify -q HEAD^{commit}` correctly fails
- **Symbolic branch ref pointing at an invalid/missing object — new,
  Round 4 review finding #5** (`.git/HEAD` says `ref: refs/heads/<name>`,
  but `.git/refs/heads/<name>` itself is overwritten with a non-existent,
  all-zeros SHA) → `HEAD_UNAVAILABLE` (§9's case 4, §17), with `branch`
  still reporting the ref name from `symbolic-ref` — the specific
  regression test proving this is distinguished from the unborn case
  (§9's case 3) via the third, ref-name-only `rev-parse --verify -q
  <resolved-ref-name>` check (exit 0 with a printed SHA here, vs. exit 1
  for a genuinely unborn branch, both starting from the same
  `symbolic-ref`-exit-0/`HEAD^{commit}`-exit-1 state) — not by naively
  comparing two identical exit-1 results
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
- **Flag-shaped branch name with a valid upstream — mandatory, new, Round
  7 review finding #6, fixture construction corrected Round 8 review
  finding #7A** (a real fixture constructed via a plumbing/manual
  mechanism — e.g. `git symbolic-ref HEAD refs/heads/-foo` plus directly
  writing `branch.-foo.remote`/`.merge` via `git config`, never via `git
  branch -foo`, which does not create a branch literally named `-foo` at
  all since the porcelain `branch` subcommand parses a leading-`-foo`
  argument as an option — `HEAD` pointing at a branch literally named
  `-foo`, with `branch.-foo.remote` set to `"."` and `branch.-foo.merge`
  set to `refs/heads/main` against a real local `main` branch) →
  `inspectHead` correctly resolves `upstream.sha`/`upstream.ref` for this
  branch, proving `--end-of-options` in the upstream-resolution commands
  (§9, §10) genuinely prevents Git from misinterpreting `-foo@{upstream}`
  as a flag-shaped argument — first confirmed, in the test's own setup,
  that the identical revision expression **without** `--end-of-options`
  fails against this exact fixture (establishing the hazard is real, not
  hypothetical), then that `inspectHead` itself succeeds
- No network operation occurs during any BR3 test (asserted structurally,
  e.g. by running in an environment with no network access, or by
  confirming no test ever configures a real, reachable remote URL)
- **Partial-clone/promisor lazy-fetch disabled — new, Round 5 review
  finding #1** (a real, fully local fixture: a full-content "origin"
  repository, then a `--filter=blob:none` local clone of it via a
  `file://`/local-path remote — never a real network remote — with at
  least one blob subsequently made locally unreachable, e.g. by removing
  the "origin" fixture or the specific object before the BR3 operation
  under test runs) → the BR3 operation fails deterministically
  (`GIT_COMMAND_FAILED`), proving `GIT_NO_LAZY_FETCH=1` (§19) genuinely
  prevents Git's automatic on-demand promisor fetch rather than BR3
  silently succeeding via a hidden local-remote fetch

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
- **Renamed (unstaged, above the 50% threshold) — new, Round 6 review
  finding #6, fixture corrected, Round 7 review finding #2** (a tracked
  file renamed on disk via a plain filesystem rename (`mv old.txt
  new.txt`), content preserved above the similarity threshold, followed
  by `git add -N new.txt` — intent-to-add, a test/fixture-setup-only
  index operation that stages no content and leaves the change fully
  unstaged; BR3 itself never performs this or any other index operation)
  → `unstaged_rename` with correct `oldPath`/`similarity`, proving the
  previously-discarded `2 .R` porcelain v2 record data is now genuinely
  surfaced, not collapsed into a plain `unstaged_modify`
- **Plain filesystem rename with no index operation remains correctly
  reported as delete + untracked, never a synthesized rename — new,
  mandatory, Round 7 review finding #2** (the identical `mv old.txt
  new.txt` as the fixture above, but **without** the `git add -N`
  intent-to-add step) → `unstaged_delete` on the old path and
  `untracked` on the new path, as two independent entries — first
  confirmed, in the test's own setup, that BR3's exact `status`
  invocation against this exact state genuinely does **not** produce
  `2 .R`/`unstaged_rename` (establishing this as the real, verified
  reachability boundary, not an assumption) — proving BR3 never
  synthesizes a rename relationship Git itself did not provide
- Renamed below the 50% threshold → represented as separate delete + add,
  never forced into a synthetic rename (all four subcases: staged;
  unstaged without intent-to-add → delete + `untracked`; unstaged with
  intent-to-add → delete + `unstaged_add`; committed diff)
- **Intent-to-add standalone (`1 .A`) — new, mandatory, Round 8 review
  finding #1A** (a committed repository, then `echo hello > new.txt &&
  git add -N new.txt` — no rename involved, just a plain intent-to-add on
  a genuinely new path) → a single `unstaged_add` entry for `new.txt`,
  proving `1 .A` is correctly distinguished from both `untracked` (no
  index entry) and `unstaged_modify` (would require a real staged blob)
- **Combined type-2 record: staged rename + unstaged modification (`2
  RM`) — new, mandatory, Round 8 review finding #1B** (`git mv old.txt
  new.txt` followed by `echo more >> new.txt`, content preserved above
  the similarity threshold) → **two** entries: `staged_rename` (`path:
  new.txt`, correct `oldPath`/`similarity`) **and** `unstaged_modify`
  (`path: new.txt`) — proving BR3 does not discard the Y-axis unstaged
  change merely because the X-axis is a rename
- **Combined type-2 record: staged rename + unstaged deletion (`2 RD`) —
  new, mandatory, Round 8 review finding #1B** (`git mv old.txt new.txt`
  followed by `rm new.txt`) → **two** entries: `staged_rename` (`path:
  new.txt`, correct `oldPath`/`similarity`) **and** `unstaged_delete`
  (`path: new.txt`)
- **Combined type-2 record: staged rename + unstaged type change (`2 RT`)
  — new, Round 8 review finding #1B, constructed if portably reachable in
  the test environment** (`git mv old.txt new.txt` followed by replacing
  `new.txt` with a different filesystem entry type the test platform
  supports, e.g. a symlink on POSIX) → **two** entries: `staged_rename`
  (`path: new.txt`, correct `oldPath`/`similarity`) **and**
  `unstaged_type_change` (`path: new.txt`) — if not portably
  constructible in the test environment, this specific combination is
  documented as unverified-but-following-the-same-rule (§14), not
  silently omitted from the specification's contract
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
- **Canonical result ordering — mandatory, new (Round 4 review finding
  #1):** a fixture with multiple simultaneous working-tree changes across
  several paths (e.g. an added file, a deleted file, and an untracked
  file, with `path` values deliberately not already in sorted order
  relative to Git's own likely emission sequence) → `WorkingTreeStatus.entries`
  is returned sorted per §7a's exact `path`/`kind`/`oldPath` key order —
  asserted directly against the expected sorted sequence, not merely
  checked for content correctness irrespective of order

**Diff inspection (§13, §14, §15)**
- Two valid refs/SHAs → correct `fromSha`/`toSha` and changed-path list
- Added / modified / deleted / renamed (above threshold) / type-changed
  classification, each as its own test
- **Canonical result ordering — mandatory, new (Round 4 review finding
  #1):** a fixture diff with multiple simultaneous changes across several
  paths (added, modified, deleted, at minimum) → `DiffResult.changes` is
  returned sorted per §7a's exact `path`/`kind`/`oldPath` key order
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
- **Double-quoted literal region — new, Round 4 review finding #6, Part
  A, Option A:** a declared pattern containing a `"..."` region (e.g.
  `src/"a*b"/x.ts`) matches the literal quoted content exactly
  (`src/a*b/x.ts`) and does **not** match the glob-expanded form the
  quoted metacharacter would otherwise have produced (`src/aZZZb/x.ts`)
  — confirming quoting genuinely suppresses metacharacter interpretation
  within the quoted region
- **Overlong pattern — new, Round 4 review finding #6, Part B:** a
  declared `ProtectedSystem` path pattern exceeding `picomatch`'s
  internal maximum length (65536 characters, verified from source) is
  reported via `ProtectedPathMatchResult.invalidPatterns`, **not** thrown
  as an uncaught `SyntaxError` — the specific regression test proving
  `matchProtectedPaths`'s compilation step is wrapped in try/catch, not
  left to propagate a `picomatch`-internal exception directly
- **Matcher-compilation failure does not escape as an uncaught exception
  — new, Round 4 review finding #6, Part B, general case:** independent
  of the specific overlong-pattern case above, a dedicated test confirms
  `matchProtectedPaths` never throws for any input, asserting the
  function's return value is always a well-formed
  `ProtectedPathMatchResult` object (never a thrown exception reaching
  the caller) across every declared pattern this test suite exercises,
  including the deliberately-invalid ones
- `matchProtectedPaths` is confirmed **pure**: calling it twice with the
  same (deep-equal, but not reference-equal) `inputs`/`protectedSystems`
  arguments produces deep-equal outputs, and neither input array/object
  is mutated (snapshot-before/assert-unchanged-after, mirroring BR2's
  established purity-test pattern)
- **Canonical result ordering — mandatory, new (Round 4 review finding
  #1):** construct two `inputs` arrays that are permutations of one
  another (the same set of `ProtectedPathCheckInput` entries, deliberately
  supplied in different orders — including at least one case producing
  multiple matches across different `ProtectedSystem` entries for the
  identical `path`/`matchedVia`, to exercise the `system.name`/
  `system.status`/`system.paths`/original-index tie-breakers) against the
  same `protectedSystems`, and assert `matchProtectedPaths` returns
  **deep-equal, identically-ordered** `matches` arrays for both — proving
  the output order is a function of the matched content alone, never of
  input array order. This is directly controllable (no reliance on Git's
  own emission order, which was confirmed during this round's
  verification to already track path order under ordinary porcelain v2
  output in the fixtures tested, making it an unreliable basis for a
  targeted regression test) and fully exercises §7a's documented sort
  keys (`path`, then `matchedVia`, then `system.name`, then
  `system.status`, then canonical `system.paths`, then original
  `protectedSystems` index).
- **Duplicate-name tie-break — mandatory, new (Round 5 review finding
  #3):** construct at least two distinct `ProtectedSystem` entries in
  `protectedSystems` that **share an identical `name`** but differ in
  `status` and/or `paths` (a schema-legal configuration, since
  `config.schema.json` imposes no uniqueness constraint on `name` — §3,
  §7a), each matching the same input `path`/`matchedVia`, and assert both
  resulting `ProtectedPathMatch` entries appear in `matches`, in the
  order §7a's full tie-break chain (`system.status`, then canonical
  `system.paths`, then original `protectedSystems` array index) defines —
  proving `system.name` alone is not assumed to be a total ordering, and
  that two same-named systems are still deterministically, correctly
  ordered rather than left dependent on incidental array processing
  order. A second case additionally constructs two entries identical in
  `name`, `status`, **and** `paths` (differing only in some
  schema-permitted `additionalProperties` field), asserting the two
  resulting matches are ordered by original `protectedSystems` index —
  the final, unconditional tie-break.

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
- **`core.fsmonitor` suppression — mandatory, unchanged in mechanism from
  Round 4 review finding #3 (still suppression, not refusal — §18, Round
  6 review finding #1 explicitly retains this):** configure a fixture
  repository's `core.fsmonitor` to point at a real script that writes a
  distinctive marker file to disk when invoked (proving, first, in the
  test's own setup, that an ordinary `git status` call *without* BR3's
  override genuinely does invoke it — establishing the threat is real,
  not hypothetical); then call `inspectWorkingTree` against that same
  fixture and assert the marker file was **not** created **and** the
  operation still succeeds with a correct result — proving BR3's own
  `-c core.fsmonitor=` override (§18) genuinely suppresses the hook
  without requiring a refusal, consistent with fsmonitor's status as a
  pure optimization hook that cannot alter clean/modified semantics.
- **External content-filter refusal — corrected mechanism, mandatory,
  Round 6 review finding #1, detection mechanism corrected Round 7 review
  finding #4 (supersedes Round 4/5's suppression-based tests for
  `filter.<driver>.clean`/`.process`; withdrawn suppression behavior must
  not reappear; supersedes reliance on config-enumeration alone, proven
  insufficient by case D below):**
  - **(A) Ordinary external clean filter → typed refusal, marker never
    executed:** configure a fixture repository with a `.gitattributes`
    rule assigning a `filter=<name>` attribute to a path, and
    `filter.<name>.clean` pointing at a real, marker-writing script (no
    `required` key set). Call `resolveRepository`/`inspectWorkingTree`
    against that fixture and assert: (i) the result is
    `EXTERNAL_GIT_FILTER_UNSUPPORTED` (§17), naming the affected path(s)
    in `details`; (ii) the marker file was **not** created — proving BR3
    never ran `git status`/`git diff` at all for this repository, not
    merely that it ran them with the filter suppressed.
  - **(B) `filter.<driver>.required = true` → identical deterministic
    refusal, never a raw/undifferentiated Git failure:** identical setup
    to (A), plus `filter.<name>.required = true`. Assert the result is
    still the same, deterministic `EXTERNAL_GIT_FILTER_UNSUPPORTED` —
    never an undifferentiated `GIT_COMMAND_FAILED` reflecting Git's own
    required-filter-failure behavior, and never the marker file being
    created — proving BR3's refusal happens *before* Git would even
    attempt (and, for a `required` driver, fail on) the filter, so the
    `required` key's presence makes no observable difference to BR3's
    typed outcome.
  - **(C) `filter.<driver>.process` → refusal:** identical to (A), but
    the driver is configured via the single-process-filter protocol
    (`filter.<name>.process`) instead of the two-command `clean`/`smudge`
    pair → same `EXTERNAL_GIT_FILTER_UNSUPPORTED` result, marker never
    created.
  - **(D) `.gitattributes` references a driver defined ONLY in a fake
    global Git config → refusal before status, even though
    `GIT_CONFIG_GLOBAL` is neutralized for actual inspection — mandatory,
    new, Round 7 review finding #4, the specific regression case proving
    config-enumeration alone is insufficient:** a fixture repository's
    `.gitattributes` declares `*.txt filter=canon`; a **global** Git
    config (constructed in the test's own setup, visible only when
    `GIT_CONFIG_GLOBAL` is *not* overridden) declares
    `filter.canon.clean=<marker-writing, uppercase-normalizing script>`
    and `filter.canon.required=true`; the repository's own local config
    declares no filter at all. First confirm, in the test's own setup,
    that BR3's config-enumeration query (`git config --get-regexp
    '^filter\..*\.(clean|process|smudge)$'`) run under BR3's own
    sanitized (`GIT_CONFIG_GLOBAL=<null device>`) environment genuinely
    finds **zero** matches for this fixture (establishing that
    config-enumeration alone would incorrectly conclude "no filter,
    proceed" — the exact gap this round closes). Then call
    `resolveRepository`/`inspectWorkingTree` and assert:
    `EXTERNAL_GIT_FILTER_UNSUPPORTED` is still produced, and the marker
    script is **not** executed — proving the `check-attr`-based
    effective-attribute scan catches this case where config-enumeration
    alone would not.
  - **(E) Marker proves the filter never executes, including via the
    check-attr scan itself:** across every fixture above, assert the
    marker file is never created at any point during the entire
    `resolveRepository`/`inspectWorkingTree`/`inspectDiff` call sequence
    — including confirming `check-attr --stdin -z filter` itself,
    run directly against a filter-attributed path in isolation, does not
    trigger the marker (proving `check-attr` is genuinely non-executing,
    not merely "didn't happen to trigger it in these particular
    fixtures").
  - **(F) First-level submodule attribute → refusal:** a superproject
    with one initialized submodule; the submodule's **own**
    `.gitattributes` (verified set inside the submodule's own checkout,
    not the superproject's) assigns `filter=<name>` to a path, with
    `filter.<name>.clean` defined (repository-locally, for this case)
    pointing at a real marker-writing script; the superproject itself
    declares no such attribute anywhere. Call `inspectWorkingTree`
    against the superproject's `projectRoot` and assert
    `EXTERNAL_GIT_FILTER_UNSUPPORTED`, marker file **not** created —
    proving the submodule-scoped `check-attr` scan (§18) discovers the
    submodule-local attribute and causes a refusal, not merely a
    suppressed-but-still-run invocation.
  - **(G) Nested submodule attribute → refusal:** identical to (F), but
    the `filter`-attributed path is inside a submodule-of-a-submodule
    rather than the first-level submodule directly → identical
    `EXTERNAL_GIT_FILTER_UNSUPPORTED` result, proving the recursive,
    NUL-safe submodule enumeration (§18, Round 6 review finding #2)
    genuinely walks the full nested tree for effective-attribute
    detection, not only one level deep.
  - **(H) Repository with no filter attribute remains inspectable:** a
    fixture with zero `filter`-attributed tracked paths anywhere
    (superproject and any initialized submodules) →
    `resolveRepository`/`inspectWorkingTree`/`inspectDiff` all succeed
    normally, proving the discovery-and-refuse mechanism does not
    introduce a false-positive refusal for the ordinary, filter-free case
    that constitutes the overwhelming majority of real repositories.
  - **`check-attr` mandatory, never skipped — mandatory, new, Round 8
    review finding #6B:** a call-count/invocation assertion on the shared
    exec primitive confirms `check-attr --stdin -z filter` genuinely runs
    for **every** `resolveRepository`/`inspectWorkingTree`/`inspectDiff`
    call, including case (H) above (zero filter attributes) — proving
    there is no "skip the scan when config-enumeration finds nothing"
    fast path anywhere in the implementation.
  - **Exact NUL output shape parsing — mandatory, new, Round 8 review
    finding #6C:** a fixture with a real, active `filter` attribute on
    one path asserts the parsed result correctly interprets the
    triple-field `<path>\0filter\0<value>\0` record shape (not merely a
    flat NUL-split assuming one field per path) — including a path
    containing a space and a Unicode character, reusing §13's NUL-safe
    fixture paths, confirming the three-fields-per-path structure is
    parsed correctly even when the path itself contains a NUL-adjacent-
    looking byte sequence that could be misparsed by a naive
    single-field-per-NUL splitter.
  - **Inactive-value taxonomy — mandatory, new, Round 8 review finding
    #6C:** dedicated fixtures for `unspecified` (no `.gitattributes` rule
    at all for the path) and `unset` (an explicit `-filter` rule) both
    → no refusal (inactive); and dedicated fixtures for `set` (a bare
    `filter` rule, no specific driver name) and a named value (`filter=
    canon`) both → refusal (active) — proving BR3's exact-value
    classification matches Git's own documented `check-attr` contract,
    not an approximation.
  - **`check-attr` honors repository-local attribute sources and
    correctly does not see neutralized global/system sources —
    mandatory, new, Round 8 review finding #6A:** a fixture with a
    repository-local `.gitattributes` declaring an active `filter`
    attribute (no global config involved at all) → refusal, proving
    repository-local sources are genuinely honored; **and**, separately,
    a fixture with a **global**-only `.gitattributes`-equivalent
    system/global attributes source (reachable only when
    `GIT_ATTR_NOSYSTEM`/`XDG_CONFIG_HOME` isolation is *not* applied) and
    **no** repository-local attribute declaration at all → **no**
    refusal when run under BR3's actual sanitized environment, proving
    `check-attr` genuinely does not see the neutralized global/system
    source — confirming the corrected wording (§18) accurately describes
    what the mechanism does, not the false "mirrors ordinary Git
    behavior including global sources" claim an earlier draft made.
  - **`core.fsmonitor` suppression remains effective inside submodule
    inspection — restated for the new submodule-enumeration mechanism:**
    a superproject with one initialized submodule; the submodule's own
    `.git/config` (not the superproject's) configures `core.fsmonitor`
    pointing at a real marker-writing script. Call `inspectWorkingTree`
    against the superproject's `projectRoot` and assert the marker file
    was **not** created **and** the operation succeeds (no refusal,
    consistent with fsmonitor remaining a suppression, never a refusal
    trigger) — confirming the existing `-c core.fsmonitor=` mitigation
    (§18) still genuinely propagates into submodule inspection under the
    corrected, `ls-files`-based submodule-enumeration mechanism.
- **Submodule-enumeration path safety — mandatory, new (Round 6 review
  finding #2):** the NUL-safe `git ls-files --stage -z`-based
  submodule-enumeration mechanism (§18) is exercised against initialized
  submodule paths containing, at minimum:
  - a space
  - a Unicode character (valid UTF-8, e.g. an accented letter or
    non-Latin script character)
  - a tab character, if the test-runner filesystem and Git both permit
    creating a submodule at such a path
  - a newline character, if the test-runner filesystem and Git both
    permit creating a submodule at such a path

  For each constructible case, assert the gitlink path is correctly,
  losslessly identified and round-tripped through the NUL-delimited
  `ls-files --stage -z` parsing pipeline (§13's existing byte-first,
  strict-UTF-8-per-path discipline, reused here rather than a
  second, separate parser), and that submodule-scoped filter/fsmonitor
  discovery (case (D)/(E)/(G) above) still correctly reaches a submodule
  at such a path. No line-oriented parsing of any kind is present in this
  mechanism at any point — confirmed by static inspection of the
  submodule-enumeration implementation in addition to these behavioral
  fixtures.
- **`git submodule status --recursive`/`git submodule foreach` are never
  invoked — mandatory, new (Round 6 review finding #2):** confirmed by
  literally searching the implementation for these exact command
  strings, asserting neither appears anywhere in
  `packages/core/src/git/`.
- **Submodule-enumeration symlink and cycle safety — mandatory, new,
  Round 7 review finding #5:**
  - **Normal initialized submodule succeeds** — a plain, ordinary
    initialized submodule (standard absorbed-gitdir layout, no symlink
    anywhere in the path) → enumeration succeeds, no
    `UNSAFE_SUBMODULE_PATH`, re-asserting the ordinary case is unaffected
    by this round's correction.
  - **Nested normal submodule succeeds** — a submodule-of-a-submodule,
    both ordinary directories → enumeration succeeds and recurses two
    levels deep, no `UNSAFE_SUBMODULE_PATH`.
  - **Gitlink path replaced by a symlink to the superproject itself**
    (the verified reproduction: a real initialized submodule's own
    working-tree directory removed and replaced with a symlink
    `sub -> .`, so `sub/.git` resolves back to the superproject's own
    `.git`) → `UNSAFE_SUBMODULE_PATH`, with **no recursion loop** —
    proven by asserting the enumeration terminates (e.g. within a bounded
    call-count or time budget) rather than hanging or exhausting stack/
    memory, and that the symlink is detected via `lstat` before any Git
    command is ever run with `cwd` inside it.
  - **Gitlink path replaced by a symlink to an unrelated external
    repository** (a symlink pointing at a second, separate, real Git
    repository fixture elsewhere on disk, unrelated to the superproject
    under test) → `UNSAFE_SUBMODULE_PATH`, with the external repository
    **never** recursively inspected — proven by asserting no Git
    subprocess is ever invoked with `cwd` inside the external
    repository's own directory tree, confirming the symlink rejection
    happens before any such invocation, not merely that its results are
    discarded afterward.
  - **Gitlink ordinary directory whose `.git` pointer names the parent's
    own metadata — mandatory, new, Round 8 review finding #3** (the
    verified reproduction: `parent/sub` is an ordinary, non-symlinked
    directory; `parent/sub/.git` is a text file containing `gitdir:
    ../.git` — the parent repository's own `.git`, not a distinct
    submodule metadata directory) → `UNSAFE_SUBMODULE_PATH`, proving
    step 4a's metadata-identity visited-set check (and/or the
    parent→child relationship validation) catches this case even though
    step 3's symlink check and Round 7's working-tree-root-only visited
    set would both, on their own, incorrectly treat `parent/sub` as a
    genuinely distinct, newly-visited child — first confirmed, in the
    test's own setup, that `git -C parent/sub rev-parse --git-dir`/
    `--git-common-dir` genuinely resolve to the parent's own `.git` (and
    that `git -C parent/sub ls-files --stage` genuinely reads the
    parent's own index), establishing the hazard is real.
  - **Gitlink ordinary directory whose `.git` pointer names an unrelated
    external repository — mandatory, new, Round 8 review finding #3**
    (the verified reproduction: `parent/fake` is an ordinary,
    non-symlinked directory; `parent/fake/.git` is a text file
    containing `gitdir: <absolute path to a second, separate, real Git
    repository fixture elsewhere on disk>`) → `UNSAFE_SUBMODULE_PATH`,
    with the external repository **never** recursively inspected —
    proven by asserting no Git subprocess is ever invoked with `cwd`
    inside the external repository's own directory tree, confirming the
    parent→child relationship validation (§18 step 4a — the resolved
    `gitDir` lies outside the parent's own `--git-common-dir` tree)
    rejects this case before any such invocation, not merely that its
    results are discarded afterward.
  - **Metadata-identity alias/collision terminates safely — mandatory,
    new, Round 8 review finding #3** (a fixture engineered so two
    distinct-looking gitlink paths, at genuinely distinct canonical
    working-tree roots, both resolve — via `.git` pointer files — to the
    identical canonical `(gitDir, gitCommonDir)` pair) →
    `UNSAFE_SUBMODULE_PATH` for the second occurrence, proving the
    metadata-identity visited set (§18 step 4a) is checked independently
    of, and in addition to, the working-tree-root visited set — neither
    alone is treated as sufficient.
  - **Cycle via a non-symlink, non-`.git`-pointer mechanism, if
    constructible** (e.g. a bind-mount-based configuration engineered so
    a validated child repository's own canonical working-tree root
    equals an already-visited root) → `UNSAFE_SUBMODULE_PATH` via the
    working-tree-root visited-set guard (step 4a, §18), independently of
    the symlink-specific check and the metadata-identity guard above —
    proving all relevant safety mechanisms are genuinely independent
    layers, not a single check doing double duty.
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
  - **(E) Inherited `XDG_CONFIG_HOME`-based global ignore cannot hide an
    untracked path — new, Round 4 review finding #2:** with a fixture
    repository containing one untracked file, and a fixture
    `$XDG_CONFIG_HOME/git/ignore` file (pointed at via an inherited
    `XDG_CONFIG_HOME` environment variable in the test's own setup)
    declaring a pattern matching that untracked file, call
    `inspectWorkingTree` twice — once with that fabricated global ignore
    file reachable in the inherited environment, once without — and
    assert **identical** results both times (the untracked file reported
    in both cases), proving BR3's own `XDG_CONFIG_HOME`-override
    mechanism (§19) neutralizes it regardless of the inherited
    environment. Include the `$HOME`-fallback subcase (a fixture
    `$HOME/.config/git/ignore` file, with `XDG_CONFIG_HOME` itself unset
    in the inherited environment) as part of this same test, since the
    fix mechanism must neutralize both paths.
  - **(F) Inherited `XDG_CONFIG_HOME`-based global attributes cannot alter
    facts — new, Round 4 review finding #2:** analogous to (E), but with a
    fixture `$XDG_CONFIG_HOME/git/attributes` file declaring an attribute
    (e.g. `-text`) for a fixture file, using `git check-attr` (or an
    equivalent observable effect BR3 actually relies on) as the proof
    mechanism, asserting BR3's own `XDG_CONFIG_HOME`-override neutralizes
    it.
  - **(G) `GIT_ATTR_NOSYSTEM=1` disables system-wide attributes — new,
    Round 4 review finding #2:** confirms the `GIT_ATTR_NOSYSTEM: "1"`
    environment variable (§19) is genuinely present in every BR3
    `execFile` call's `env` (a structural/unit-level check against the
    shared `internal/exec.ts` helper's constructed `env` object, since a
    genuine machine-wide system attributes file is not portably
    constructible as a test fixture, mirroring how `GIT_CONFIG_NOSYSTEM`
    is verified elsewhere in this document).
  - **(H) Repository-local ignore/attribute behavior remains intact — new,
    Round 4 review finding #2:** with the `XDG_CONFIG_HOME`-override fix
    applied, a fixture repository's own tracked `.gitignore`, its
    `.git/info/exclude`, and its own `.gitattributes` each continue to
    correctly affect `inspectWorkingTree`'s reported result exactly as
    they would with no BR3 involvement at all — proving the XDG isolation
    mechanism neutralizes only user/global state, never repository-local
    state.
  - **(I) Inherited lowercase `git_dir` cannot redirect Git — new,
    mandatory, Round 8 review finding #4:** identical in structure to
    case (A), but the inherited environment variable is set as `git_dir`
    (all-lowercase) rather than `GIT_DIR` — asserted, first, in the
    test's own setup, that a bare `git rev-parse HEAD` genuinely honors
    this lowercase-spelled variable on the test platform (establishing
    the case-insensitivity threat is real, not hypothetical, at least on
    platforms where it applies — e.g. Windows, or any environment where
    the underlying `child_process`/OS layer itself treats the variable
    case-insensitively); then confirm BR3's own `resolveRepository`/
    `inspectHead` result reflects the correct, first repository, never
    redirected — proving the case-insensitive prefix strip (§19, step 2)
    genuinely catches this spelling, not only the canonical uppercase one.
  - **(J) Inherited mixed-case `Git_Index_File` cannot redirect the
    index — new, mandatory, Round 8 review finding #4:** identical in
    structure to case (B), but the inherited environment variable is set
    as `Git_Index_File` (mixed case) rather than `GIT_INDEX_FILE` — same
    two-step verify-the-threat-then-verify-the-fix structure as case (I).
  - **(K) Duplicate/case-varied `PATH`/`Path` inputs normalize to one
    deterministic effective `PATH` — new, mandatory, Round 8 review
    finding #4:** a test-constructed `process.env`-shaped object
    containing both a `PATH` key and a differently-cased `Path` key with
    genuinely different values → asserts BR3's constructed child
    environment contains **exactly one** `PATH`-family key (never both),
    and that the in-process executable-resolution mechanism (§8, Round 8
    review finding #2) and the actual `execFile` invocation both use the
    identical, single normalized value — proving resolution and actual
    subprocess execution cannot silently disagree about which `PATH` is
    in effect.

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
  precheck (§8, Round 2 review finding #1). A malformed **bare**
  repository (a real `git init --bare` repository with a broken `config`
  file — no `.git` child by definition), under **either** the traditional
  `files` ref backend or the `reftable` ref backend, is correctly
  classified as `GIT_COMMAND_FAILED`, not `NOT_A_GIT_REPOSITORY`, via the
  secondary classifier's ref-backend-aware bare-shape check
  (`HEAD`+`objects/`+(`refs/` or `reftable/tables.list`) directly at
  `projectRoot`), exactly mirroring the already-established malformed
  non-bare case (§8, Round 5 review finding #4, extended to be
  ref-backend-aware by Round 6 review finding #5). An unexpected
  `--show-toplevel` failure occurring *after* `--is-bare-repository` has
  already succeeded with `false` is classified as `GIT_COMMAND_FAILED`,
  never `NOT_A_GIT_REPOSITORY` (§8, Round 6 review finding #7). `git
  --version` is checked against BR3's 2.45.0 capability floor, and `git
  rev-parse --show-object-format` is confirmed `sha1`, before any other
  `resolveRepository` work proceeds — `GIT_VERSION_UNSUPPORTED`/
  `UNSUPPORTED_OBJECT_FORMAT` are each genuinely reachable and correctly
  typed (§8, Round 6 review findings #3 and #4).
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
  distinguishing staged/unstaged/both-on-the-same-path/added(including
  intent-to-add `unstaged_add`, §11, Round 8 review finding #1A)/deleted/
  renamed(staged and unstaged, above and below threshold — `unstaged_rename`
  correctly populated with `oldPath`/`similarity`, not under-classified as
  a plain `unstaged_modify`, Round 6 review finding #6)/combined type-2
  staged-rename-plus-unstaged-change states (`RM`/`RD`/`RT`, correctly
  emitting both a `staged_rename` and an independent Y-mapped entry,
  never discarding either axis — §11, Round 8 review finding #1B)/
  untracked/conflicted/submodule states, using the exact command `git
  status --porcelain=v2 -z --find-renames=50% --untracked-files=all
  --ignore-submodules=none` (§11), with §11/§19/§20/§27 all agreeing on
  that exact command — and never runs this command at all for a
  repository where the effective-filter-attribute scan (§18) found an
  active `filter` attribute anywhere in scope, superproject- or
  initialized-submodule-local, producing `EXTERNAL_GIT_FILTER_UNSUPPORTED`
  instead (Round 6 review finding #1, Round 7 review finding #4).
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
  dropping them, correctly implements the final, complete picomatch
  feature grammar (negation and extglobs disabled; `*`, `**`, `?`,
  backslash-escaping, double-quoted literal regions, brace expansion, and
  bracket expressions all enabled — §16, Round 3 review finding #4 and
  Round 4 review finding #6, both Option A), and returns its `matches`
  array in canonical sorted order — including the full `system.name`/
  `system.status`/`system.paths`/original-index tie-break chain for two
  distinct, schema-legally same-named `ProtectedSystem` matches (§7a,
  Round 4 review finding #1, Round 5 review finding #3) — and never
  throws an uncaught exception for any schema-valid input,
  including an overlong pattern — every compilation failure reported via
  `invalidPatterns` instead (§16, Round 4 review finding #6, Part B)
  (§7a, §12, §16,
  §17).
- **H.** Zero Git mutation occurs anywhere in the implementation — every
  Git subcommand string used is one of `status`, `diff`, `rev-parse`,
  `symbolic-ref`, `config` (read-only `--get`/`--get-regexp` only),
  `ls-files` (read-only `--stage -z` only, for submodule enumeration —
  §18, Round 6 review finding #2), `check-attr` (read-only,
  non-executing, `--stdin -z filter` only, for effective-filter-attribute
  detection — §18, Round 7 review finding #4) — **corrected, Round 8
  review finding #6D: an earlier draft of this criterion omitted
  `check-attr`, directly contradicting §18/§19/criterion T, which already
  required it** — and no others (§5, §6, §27); `git submodule status
  --recursive` and `git submodule foreach` are never invoked anywhere
  (Round 6 review finding #2); **and** the read-only guarantee is
  genuinely mechanically
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
  stripped via a **case-insensitive** prefix filter (corrected, Round 8
  review finding #4 — a case-sensitive filter leaves a real gap on
  Windows, where `git_dir`/`Git_Dir`/etc. are the identical variable as
  `GIT_DIR`), with only BR3's own seven controlled `GIT_*` variables
  (`GIT_PAGER`, `GIT_TERMINAL_PROMPT`, `GIT_OPTIONAL_LOCKS`,
  `GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL`, `GIT_ATTR_NOSYSTEM`,
  `GIT_NO_LAZY_FETCH` — the last new in Round 5), always added in one
  canonical uppercase form with no case-variant duplicate ever present,
  re-added, `XDG_CONFIG_HOME` overridden to a fresh empty directory (new
  in Round 4, §19), the effective `PATH` key normalized to exactly one
  deterministic value even when `process.env` itself contains multiple
  case variants (new, Round 8 review finding #4), and global
  (non-repository-local) Git config is neutralized via `GIT_CONFIG_GLOBAL`
  pointed at a null device — proven by the environment-sanitization
  regression tests (§20, Round 3 review finding #2: inherited `GIT_DIR`,
  inherited `GIT_INDEX_FILE`, `GIT_CONFIG_COUNT`-style injection,
  fabricated global `core.excludesFile`; Round 8 review finding #4:
  inherited lowercase `git_dir`, inherited mixed-case
  `Git_Index_File`, and duplicate-cased `PATH`/`Path` normalization —
  none of which may alter BR3's result or produce an ambiguous effective
  `PATH`); **and** an inherited `XDG_CONFIG_HOME`/`$HOME`-fallback-based
  global ignore file and global attributes file are likewise neutralized
  (Round 4 review finding #2), with repository-local `.gitignore`/
  `.git/info/exclude`/`.gitattributes`/`.git/config` all remaining fully
  honored — proven by the four dedicated regression tests §20 adds for
  that round; **and** `GIT_NO_LAZY_FETCH=1` is genuinely re-added after
  the strip so a partial/promisor repository missing a locally required
  object fails the local BR3 operation deterministically instead of
  silently performing an on-demand network fetch of that object (new,
  Round 5 review finding #1) — proven by the dedicated real local
  partial-clone regression test §20 adds for this round.
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
- **O.** — new, Round 5 review findings #1 and #2, (ii) corrected by
  Round 6 review finding #1, detection mechanism further corrected by
  Round 7 review finding #4. **(i)** `GIT_NO_LAZY_FETCH=1` is genuinely
  re-added, unconditionally, to every BR3 Git subprocess after §19's
  `GIT_*`-prefix strip, and a real, fully-local partial-clone fixture
  missing a required object fails deterministically (`GIT_COMMAND_FAILED`)
  rather than triggering a silent on-demand promisor fetch (§6, §19,
  §20). **(ii)** The `core.fsmonitor` suppression, and effective-
  filter-attribute **detection** (via `git check-attr --stdin -z
  filter` over every relevant tracked path — corrected, Round 7 review
  finding #4, superseding reliance on config-enumeration of
  `clean`/`process`/`smudge` driver *definitions* alone, which is
  insufficient against a driver defined only in a global config BR3's
  own sanitized environment intentionally hides — leading to a typed
  `EXTERNAL_GIT_FILTER_UNSUPPORTED` refusal rather than a suppressing
  override), each genuinely extend to every initialized submodule's own
  tracked paths, recursively through nested submodules — not only the
  superproject's — discovered via the NUL-safe, `git ls-files --stage
  -z`-based gitlink-enumeration mechanism (never `git submodule status
  --recursive`/`git submodule foreach` — Round 6 review finding #2, made
  symlink/cycle-safe by Round 7 review finding #5), with an uninitialized
  submodule correctly excluded from the enumeration rather than
  initialized by BR3 itself, proven by the dedicated first-level and
  nested-submodule marker-script regression tests, including the
  global-config-blind-spot case (§11, §18, §20).
- **P.** — new, Round 6 review findings #3, #4, #5, and #7. **(i)** A
  `git` binary below BR3's 2.45.0 capability floor, or one reporting an
  unparseable `--version` string, is rejected as `GIT_VERSION_UNSUPPORTED`
  before any other `resolveRepository` work proceeds, distinctly from
  `GIT_EXECUTABLE_UNAVAILABLE`, with zero repository mutation during the
  check (§8, §20). **(ii)** A repository whose object format is not
  `sha1` (e.g. `git init --object-format=sha256`) is rejected as
  `UNSUPPORTED_OBJECT_FORMAT` at `resolveRepository` time, before any
  SHA-producing BR3 function can be reached against it, and
  `state.schema.json`'s existing 40-character SHA contract is not
  silently broadened anywhere in this document (§8, §20). **(iii)** The
  post-Git-failure malformed-bare-repository secondary classifier
  correctly recognizes both the traditional `files` ref backend
  (`refs/`) and the `reftable` ref backend (`reftable/tables.list`) as
  alternative, equally valid bare-repository-root ref-storage shapes,
  proven by dedicated malformed-bare fixtures for both backends plus the
  existing malformed-non-bare and plain-non-repository fixtures, all
  mutually discriminated in one test (§8, §20). **(iv)** An unexpected
  `--show-toplevel` failure occurring after `--is-bare-repository` has
  already succeeded with `false` is classified as `GIT_COMMAND_FAILED`,
  never `NOT_A_GIT_REPOSITORY` — `NOT_A_GIT_REPOSITORY` remains reachable
  only via the genuine no-repository path (§8, §20).
- **Q.** — new, Round 7 review finding #1, made fail-closed Round 8
  review finding #5. `resolveRepository`'s ref-storage-format decision
  (§8 step 5b) is a fail-closed allowlist of exactly one supported value
  — `git config --get extensions.refStorage` absent, or explicitly
  `files`, is supported; **any other present value — `reftable`, or any
  future/unrecognized backend value — is `UNSUPPORTED_REF_FORMAT`**, with
  `details` containing the actual value; a command failure distinct from
  ordinary key-absence is `GIT_COMMAND_FAILED`, never inferred as
  `files`-backend support. A **malformed** repository (either ref
  backend) continues to be correctly classified as `GIT_COMMAND_FAILED`
  via the existing, ref-backend-aware post-Git-failure secondary
  classifier (§8), never conflated with the new, distinct
  `UNSUPPORTED_REF_FORMAT` code reserved for a healthy repository
  reporting an unsupported format (§8, §20).
- **R.** — new, Round 7 review finding #2. `unstaged_rename` is genuinely
  reachable only via the verified construction (a plain filesystem rename
  plus `git add -N` intent-to-add against the new path — test/fixture
  setup only) — a plain filesystem rename **without** that step is
  correctly, separately proven to produce `unstaged_delete` + `untracked`
  rather than a synthesized rename, and no statement anywhere in this
  document any longer implies an ordinary filesystem rename alone
  reliably produces porcelain v2's `2 .R` record (§11, §14, §20).
- **S.** — new, Round 7 review finding #3, mechanism corrected Round 8
  review finding #2. BR3 resolves the `git` executable itself, in
  process (never by inspecting anything `execFile` exposes, which does
  not surface the resolved path — Node's `spawnfile`/`spawnargs` report
  only the literal, unresolved command string), to one absolute,
  canonicalized path **before** invoking it, using the identical
  sanitized child environment/`PATH` every subsequent Git command will
  use, correctly obeying relative-`PATH`-entry/`cwd` semantics and
  Windows `PATHEXT`/environment-casing rules; every Git command in one
  top-level BR3 operation — the capability check itself,
  `resolveRepository`, `inspectHead`, `inspectWorkingTree`, `inspectDiff`,
  `ls-files`, `check-attr`, and every nested submodule call — is invoked
  with that identical resolved path, never the bare literal `"git"`
  again; a subsequent top-level operation re-resolves and revalidates
  rather than trusting a capability result cached against a since-changed
  `PATH`/resolution outcome (§8, §18, §20).
- **T.** — new, Round 7 review finding #4. BR3's external-filter
  detection genuinely determines repository-*effective* filter-attribute
  usage (via `git check-attr --stdin -z filter` over every relevant
  tracked path, superproject and every initialized submodule recursively)
  before any `status`/`diff` invocation — not merely whether a filter
  *driver command* remains visible after `GIT_CONFIG_GLOBAL` is
  neutralized for the actual inspection commands — so a `.gitattributes`
  rule whose corresponding driver is defined only in a global config BR3
  intentionally hides still produces `EXTERNAL_GIT_FILTER_UNSUPPORTED`,
  never a silently-wrong working-tree fact (§18, §20).
- **U.** — new, Round 7 review finding #5, extended to cover repository
  metadata identity and the parent→child relationship, Round 8 review
  finding #3. Recursive initialized-submodule enumeration (§18) is
  genuinely safe against: a gitlink working-tree path replaced by a
  symbolic link (detected via `lstat`, never followed); a repository
  working-tree-root cycle (via a visited-canonical-working-tree-root
  set); a `.git` pointer file that redirects a genuinely non-symlinked,
  ordinary-directory gitlink path's metadata (`--git-dir`/
  `--git-common-dir`) to the parent's own metadata, to an unrelated
  external repository, or to an already-visited metadata identity (via
  an independent visited-canonical-metadata-identity set, checked
  whether or not the working-tree root itself is already known); and a
  `.git` pointer resolving outside the three explicitly-recognized
  legitimate parent→child submodule shapes — failing deterministically
  with `UNSAFE_SUBMODULE_PATH` rather than looping indefinitely, aliasing
  an already-visited repository undetected, or escaping into an
  unrelated, externally-targeted repository, and never recursively
  inspecting the aliased/external repository before the refusal is
  produced (§18, §20).
- **V.** — new, Round 7 review finding #6. Every repository-derived (not
  merely caller-derived) revision expression BR3 constructs — in
  particular `<branch>@{upstream}` in upstream resolution — is protected
  by `--end-of-options` exactly as caller-supplied `DiffRequest` refs
  already are, proven by a real fixture using a branch literally named
  `-foo` with a valid local upstream (§9, §10, §20).

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
   applying the determinism env/flags (§19) in one place. Depends on step
   1's error types (to translate `child_process` failures into
   `GitError` shapes) and Node's own `node:child_process`/`node:util`
   **plus `node:fs`, `node:path`, and `node:os` — corrected, Round 8
   review finding #7C** (an earlier draft of this step listed only
   `node:child_process`/`node:util`, which was accurate before this
   round's corrections but is no longer accurate now that this module
   also performs in-process `git` executable resolution — §8's Capability
   Floor subsection, Round 8 review finding #2 — requiring filesystem
   inspection (`fs.stat`/`fs.access`/`fs.realpath`), path manipulation
   (`path.join`/`path.delimiter` for splitting `PATH` entries), and
   platform detection (`os.platform()` for the POSIX-vs-Windows
   `PATHEXT`/casing branches, §19's Windows-casing correction) — none of
   which `node:child_process`/`node:util` alone provide). Every
   I/O-performing module below depends on this.
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

**Minimum supported Git version: 2.45.0 — new, Round 6 review finding
#3.** This is a separate, independent baseline from the Node.js version
above — a property of the `git` binary on the host, not of the Node
runtime. See §8's "Git Capability Floor" subsection for the complete
mechanism, rationale, and the enumerated list of BR3 features reviewed
against this floor. `GIT_VERSION_UNSUPPORTED` (§17) is the typed outcome
for a `git` binary below this floor.

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
2. **Caller-configurable rename-detection threshold.** Fixed at 50%
   (§14) for this iteration; a future phase could add an optional
   parameter to `DiffRequest` (and an equivalent for
   `inspectWorkingTree`) if a genuine need for a different threshold is
   identified.
3. **Copy detection.** Explicitly disabled (§13) for cost and
   no-identified-need reasons; `--find-copies` could be added as an
   opt-in future extension.
4. **Submodule recursion.** BR3 surfaces top-level submodule *state*
   (§11) but does not recurse into a submodule's own repository
   automatically — a caller wanting that already has the tools to do it
   themselves (call `resolveRepository`/etc. again with the submodule's
   path as a new `projectRoot`), but BR3 does not automate the
   recursion.
5. **Consumption of BR3 facts by BR2's policy layer or `docs/STATE_MACHINE.md`'s
   `PREFLIGHT` "protected-system awareness" check.** BR3 supplies the
   facts (`matchProtectedPaths`'s output); actually wiring that into a
   lifecycle-gating decision (e.g. `applyTransition`'s composition logic
   consulting BR3 before permitting `AUTHORIZED → PREFLIGHT`) is not part
   of this specification and is not assumed to be BR3's, BR4's, or any
   other specific future phase's responsibility yet — it is an open
   design question for whichever future specification actually proposes
   that wiring.
6. **CLI surfacing of any BR3 fact.** Explicitly deferred to whichever
   future phase (most likely BR4, alongside `buildrail verify`) decides
   it needs to show Git facts to a human via the CLI — see §21.
7. **Full `reftable` ref-backend repository support.** BR3 v0.1's final
   decision (§8 step 5b, Round 7 review finding #1) is to explicitly
   reject a healthy `reftable`-backend repository with
   `UNSUPPORTED_REF_FORMAT` — this is a resolved, enforced, tested
   contract, not an open question. A future phase wishing to add genuine
   `reftable` support would need to independently re-verify every BR3
   mechanism (porcelain v2 parsing, `@{upstream}` resolution,
   `symbolic-ref`, HEAD inspection, working-tree/diff inspection) against
   real `reftable`-backend fixtures and then remove or relax step 5b's
   rejection — that verification work, not the decision of whether to
   defer it, is what remains deferred here.

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
  (via a **case-insensitive** prefix filter, not an enumerated blocklist
  and not a case-sensitive comparison — corrected, Round 8 review finding
  #4) and re-adding only BR3's own seven controlled `GIT_*` variables, in
  one canonical uppercase form with no case-variant duplicate — never a
  wholesale `{ ...process.env }` spread — proven by the dedicated real
  regression tests (§20, Round 3 review finding #2, extended Round 8
  review finding #4): an inherited `GIT_DIR` (and, new this round, its
  lowercase spelling `git_dir`) cannot redirect `resolveRepository`/
  `inspectHead` to a different repository; an inherited `GIT_INDEX_FILE`
  (and its mixed-case spelling `Git_Index_File`) cannot redirect
  `inspectWorkingTree` to a different index; `GIT_CONFIG_COUNT`-style
  environment-based config injection has no effect on any BR3 result;
  and a fabricated global `core.excludesFile`, reachable via
  `GIT_CONFIG_GLOBAL`, does not change `inspectWorkingTree`'s
  untracked-path reporting; **and** whether a `process.env` containing
  both `PATH` and a differently-cased `Path` key normalizes to exactly
  one deterministic effective `PATH` value, used identically by both the
  in-process executable-resolution mechanism (§8, Round 8 review finding
  #2) and the actual `execFile` invocation — with repository-local Git
  config (e.g.
  `branch.<b>.remote`/`.merge`) still correctly read in every case; **and**
  (new, Round 4 review finding #2) whether an inherited `XDG_CONFIG_HOME`/
  `$HOME`-fallback-reachable global ignore file and global attributes
  file are likewise neutralized via the `XDG_CONFIG_HOME`-override
  mechanism (§19) and `GIT_ATTR_NOSYSTEM=1`, proven by the four dedicated
  regression tests §20 adds for this round, with repository-local
  `.gitignore`/`.git/info/exclude`/`.gitattributes` still fully honored in
  every case
- Whether `GIT_NO_LAZY_FETCH=1` (new, Round 5 review finding #1) is
  genuinely re-added, unconditionally, after §19's `GIT_*`-prefix strip —
  not merely inherited from a caller's own environment, which the strip
  itself would otherwise remove — and whether a real local partial-clone
  fixture missing a locally required object genuinely fails BR3's
  operation (`GIT_COMMAND_FAILED`) rather than silently performing an
  on-demand promisor fetch, proven by the dedicated regression test §20
  adds for this round, not merely documented as disabled
- Whether every BR3 `git status`/`git diff --name-status` invocation
  genuinely includes the mandatory `-c core.fsmonitor=` override (still a
  suppression, never a refusal trigger — §18, Round 6 review finding #1
  explicitly retains this), proven by the dedicated real marker-script
  regression test §20 adds — not merely documented as suppressed
- **Withdrawn-mechanism regression check — new, Round 6 review finding
  #1:** whether `-c filter.<name>.clean=`/`-c filter.<name>.process=`
  suppressing overrides (Round 4/5's design) are genuinely **absent**
  from the implementation entirely — confirmed by literally searching the
  implementation for these exact flag strings, which must not appear
  anywhere `status`/`diff` argv is constructed — and whether, in their
  place, effective-filter-attribute detection causes a genuine,
  deterministic `EXTERNAL_GIT_FILTER_UNSUPPORTED` refusal **before** the
  corresponding `status`/`diff` invocation ever runs — proven by the
  dedicated real marker-script regression tests §20 adds (cases A–H),
  including: an ordinary clean filter (marker never executed, typed
  refusal returned); a `filter.<driver>.required=true` driver producing
  the identical typed refusal rather than an undifferentiated
  `GIT_COMMAND_FAILED`; a `process`-protocol driver; a filter-free
  repository remaining fully, normally inspectable (no false-positive
  refusal); and whether an attribute configured solely inside a
  first-level or nested **initialized** submodule's own `.gitattributes`
  is discovered and also produces the refusal on the single top-level
  `status`/`diff` invocation — not merely by the superproject-only case
  continuing to pass unmodified — and whether an uninitialized submodule
  is correctly excluded from this enumeration (checked via plain
  filesystem inspection of the submodule's own `.git` entry, never by
  initializing it)
- **Global content-filter blind-spot fix — new, mandatory, Round 7 review
  finding #4:** whether BR3's filter-detection mechanism genuinely
  determines repository-*effective* filter-attribute usage — via `git
  check-attr --stdin -z filter` over every relevant tracked path,
  superproject and every initialized submodule recursively — rather than
  relying on config-enumeration (`git config --get-regexp
  '^filter\..*\.(clean|process|smudge)$'`) alone to discover driver
  *definitions*, which Round 6's design left insufficient. Proven by the
  dedicated regression fixture (case D) where a repository's
  `.gitattributes` declares a `filter=<name>` attribute while the
  corresponding driver command is defined **only** in a fake **global**
  Git config (never repository-local) — confirming BR3 still produces
  `EXTERNAL_GIT_FILTER_UNSUPPORTED` for this case, **even though**
  `GIT_CONFIG_GLOBAL=<null device>` (§19) correctly, and unrelatedly,
  neutralizes that global config for BR3's own actual inspection commands
  — proving the refusal is driven by attribute *usage*, not by whether a
  driver *definition* happens to still be visible under BR3's sanitized
  environment. Also confirms: `check-attr` itself never executes the
  filter (proven by the marker-writing fixtures showing the marker is
  never created merely from running the attribute check); and that
  `GIT_CONFIG_GLOBAL=<null device>` remains fully in force, unmodified,
  for the actual `status`/`diff` inspection commands — this correction
  does not re-enable arbitrary global Git config to make filter
  discovery possible, it changes what question discovery asks
- **Filter-discovery contract completeness — new, mandatory, Round 8
  review finding #6:** whether §18's description of `check-attr`'s
  attribute-source behavior is now accurate — stating that `check-attr`
  resolves repository-effective attributes **under BR3's own sanitized
  execution environment** (honoring repository-local sources BR3
  intentionally preserves, never claiming to "mirror ordinary Git
  behavior including inherited global/system-level attribute sources,"
  which BR3 deliberately neutralizes via `GIT_ATTR_NOSYSTEM=1`/empty
  `XDG_CONFIG_HOME`/`GIT_CONFIG_GLOBAL`) — proven by the dedicated
  regression fixtures §20 adds confirming repository-local attributes are
  honored and neutralized global/system attribute sources are genuinely
  not seen; **and** whether the "config-enumeration as an optional fast
  path to skip `check-attr`" language has been fully removed (it was
  circular — "zero active filter attributes" is exactly what `check-attr`
  itself establishes) — proven by the dedicated call-count/invocation
  test confirming `check-attr` runs unconditionally on every
  `status`/`diff`-preceding check, including the zero-filter-attribute
  case; **and** whether the exact NUL-delimited `check-attr --stdin -z
  filter` output shape (`<path>\0filter\0<value>\0` triples per queried
  path, never a flat one-field-per-NUL assumption) is explicitly defined
  and correctly parsed, with the exact inactive-value taxonomy
  (`unspecified`/`unset` = inactive; `set`/any named value = active)
  tested directly, not merely asserted
- **Submodule-enumeration mechanism — new, Round 6 review finding #2:**
  whether initialized-submodule discovery (for filter-driver discovery
  and any other BR3 need) genuinely uses the NUL-safe `git ls-files
  --stage -z` gitlink-enumeration mechanism (§18) — identifying gitlinks
  by index mode `160000`, checking initialization via plain filesystem
  inspection of each gitlink path's own `.git` entry (no Git subprocess
  against an unconfirmed-initialized path), recursing via the identical
  primitive for nested submodules — and whether `git submodule status
  --recursive` and `git submodule foreach` are genuinely **absent** from
  the implementation entirely (confirmed by literally searching for these
  exact command strings), with dedicated regression tests proving correct
  behavior for submodule paths containing a space, a Unicode character,
  and (where constructible) a tab or newline, parsed via the identical
  byte-first, NUL-split, strict-UTF-8 pipeline §13 already defines for
  every other path-bearing command — never a separate, line-oriented
  parser
- **Submodule-enumeration symlink and cycle safety — new, Round 7 review
  finding #5, extended to metadata identity and the parent→child
  relationship, Round 8 review finding #3:** whether every gitlink
  working-tree path is genuinely `lstat`-checked (never a symlink-following
  `stat`) before being treated as a potential submodule checkout, with a
  symlinked gitlink path unconditionally producing `UNSAFE_SUBMODULE_PATH`
  rather than being followed — proven by the dedicated real fixture
  reproducing a gitlink path replaced with a symlink back to the
  superproject itself (`sub -> .`), confirming no recursion loop occurs
  and no Git command is ever run with `cwd` inside the symlink-resolved
  location; **and** whether a second fixture, a gitlink path symlinked to
  an unrelated external repository, is also rejected with the external
  repository genuinely never recursively inspected (confirmed by
  asserting no subprocess is ever invoked with `cwd` inside it); **and**
  — the Round 8 correction — whether a genuinely non-symlinked, ordinary-
  directory gitlink path whose own `.git` entry is a pointer *file*
  redirecting metadata (`--git-dir`/`--git-common-dir`) to the parent's
  own metadata, or to an unrelated external repository, is independently
  caught by the metadata-identity visited set and/or the parent→child
  relationship validation (§18 step 4a) — proven by the two dedicated
  `.git`-pointer-redirection fixtures §20 adds, confirming this class of
  hazard (invisible to a working-tree-root-only visited set, since the
  working-tree roots involved are themselves genuinely, canonically
  distinct) is genuinely caught, not merely asserted to be covered by the
  symlink check alone; **and** whether a visited-set-based cycle guard,
  keyed on **both** each validated child repository's canonicalized
  working-tree root **and** its canonicalized `(gitDir, gitCommonDir)`
  metadata identity, independently prevents an unbounded-recursion,
  aliasing, or DoS outcome for any cycle not caught by the symlink check
  alone — proven by the dedicated metadata-alias-collision fixture §20
  adds
- Whether the command allowlist actually enforced and tested matches this
  document's own stated allowlist exactly — `status`, `diff`,
  `rev-parse`, `symbolic-ref`, `config` (`--get`/`--get-regexp` only),
  `ls-files` (`--stage -z` only), `check-attr` (`--stdin -z filter`
  only) — corrected, Round 8 review finding #6D — and no others (§5,
  §6, §18, §27, Round 6 review finding #2, Round 7 review finding #4) —
  with no stale reference anywhere in the specification still asserting
  only the original five, or the six omitting `check-attr`
- Whether `resolveRepository`'s `NOT_A_GIT_REPOSITORY`/`GIT_COMMAND_FAILED`
  classification (§8, Round 4 review finding #4, extended by Round 5
  review finding #4 and made ref-backend-aware by Round 6 review finding
  #5) genuinely distinguishes a plain non-Git directory from a
  real-but-malformed repository (e.g. a syntactically-broken
  `.git/config`) via the filesystem-based secondary check, not merely by
  `--is-bare-repository`'s exit code alone (verified identical, 128, for
  both cases) — proven by the dedicated malformed-config and
  ordinary-non-repository fixtures §20 adds; **and** whether that
  secondary check genuinely recognizes **both** the non-bare shape
  (`<projectRoot>/.git`) **and** the bare-repository-root shape
  (`projectRoot/HEAD`+`objects/`+ either the traditional `refs/`
  directory **or** `reftable/tables.list`, directly at `projectRoot`,
  with no single-filename check and no single-ref-backend assumption
  standing in for the full combination) — proven by the dedicated
  malformed-**bare**-repository fixtures §20 adds for **both** ref
  backends, correctly producing `GIT_COMMAND_FAILED` rather than
  `NOT_A_GIT_REPOSITORY` for a real bare repository (either backend) with
  a broken `config` file, and never `BARE_REPOSITORY_UNSUPPORTED` (that
  code remains reserved for a bare repository `--is-bare-repository` can
  positively, successfully confirm — §8)
- **Healthy `reftable` rejection, made fail-closed — new, Round 7 review
  finding #1, resolving Round 6's deferral, corrected Round 8 review
  finding #5:** whether `resolveRepository` genuinely checks `git config
  --get extensions.refStorage` (§8 step 5b) and rejects a healthy
  `reftable`-backend repository as `UNSUPPORTED_REF_FORMAT`, distinctly
  from the malformed-`reftable` case (`GIT_COMMAND_FAILED`, via the
  unrelated post-Git-failure secondary classifier) — proven by dedicated
  fixtures for both a healthy `files`-backend repository (unaffected), a
  healthy `reftable`-backend repository (rejected), and confirming §26's
  Deferred Items no longer states an unresolved "future round will
  decide" position for this question; **and** — the Round 8 correction —
  whether the decision contract is genuinely an **allowlist** of exactly
  `files` (absent or explicit) rather than a **denylist** of `reftable`
  specifically, proven by the dedicated focused-parser test against a
  fabricated, never-before-seen value (e.g. `future-backend`), confirming
  it is also rejected as `UNSUPPORTED_REF_FORMAT` rather than silently
  passing; and whether a `git config --get extensions.refStorage` failure
  distinct from ordinary key-absence is genuinely reported as
  `GIT_COMMAND_FAILED`, never silently treated as equivalent to
  `files`-backend support
- **Git Capability Floor — new, Round 6 review finding #3, binding
  mechanism corrected Round 7 review finding #3, made implementable
  Round 8 review finding #2:** whether `resolveRepository` genuinely
  checks `git --version` against BR3's 2.45.0 floor before any other
  step (including `fs.stat` on `projectRoot`), whether an unsupported or
  unparseable version genuinely produces `GIT_VERSION_UNSUPPORTED`
  distinctly from `GIT_EXECUTABLE_UNAVAILABLE`, whether this check
  performs zero repository mutation, and whether §13's "no human-oriented
  Git output is ever parsed" rule correctly, explicitly carves out only
  this one narrow exemption — with every actual repository fact still
  derived exclusively from machine-readable/NUL-safe/exit-code sources —
  proven by the dedicated regression tests §20 adds (supported,
  unsupported, malformed-response, and executable-unavailable-
  remains-distinct cases); **and** whether the capability check's `cwd`
  behavior is genuinely documented as a single, explicit, named
  exception to §18's otherwise-universal `cwd: projectRoot` contract,
  with no remaining contradiction between §8 and §18's stated `cwd`
  behavior; **and** — corrected in Round 8, since Round 7's own proposed
  mechanism was not implementable — whether `git` is genuinely resolved
  to one absolute, canonicalized executable path **in process**, before
  any `execFile` call (never by inspecting `execFile`'s own return value,
  which Node does not populate with the resolved path at all — confirmed
  directly against Node's `spawnfile`/`spawnargs` fields, both of which
  report only the literal, unresolved command string), with that
  identical resolved path — never the bare literal `"git"` — passed as
  `execFile`'s `command` argument for every Git invocation in the same
  top-level operation; whether resolution correctly handles a relative
  `PATH` entry's `cwd`-dependence (proven by the dedicated regression
  test constructing exactly this hazard — verified independently
  reproducible: an identical `PATH` string resolving to different
  binaries under different `cwd` values) and Windows `PATHEXT`/
  environment-key-casing semantics; and whether a `PATH`/executable-
  identity change between two top-level BR3 operations causes the second
  operation to re-resolve and revalidate rather than silently trusting a
  capability result validated against a now-different binary — and
  confirming the Git 2.45/2.46 version-history wording no longer
  contradicts the chosen 2.45.0 floor (`--no-lazy-fetch` correctly stated
  as available at 2.45.0 itself)
- **Object format / SHA width — new, Round 6 review finding #4:**
  whether `resolveRepository` genuinely checks `git rev-parse
  --show-object-format` and rejects anything other than `sha1` as
  `UNSUPPORTED_OBJECT_FORMAT`, before any SHA-producing BR3 function
  (`inspectHead`/`inspectDiff`) can be reached against that repository —
  proven by the dedicated `git init --object-format=sha256` regression
  fixture — and whether `state.schema.json`'s existing `^[0-9a-f]{40}$`
  baseline-SHA contract, and every BR3 public type's 40-hex-character SHA
  assumption, remain completely unmodified and unbroadened anywhere in
  this specification (§1, §8)
- Whether `inspectHead`'s corrupt-HEAD handling (§9, new — Round 4 review
  finding #5) genuinely uses `HEAD^{commit}` peeling (not bare `HEAD`) to
  validate HEAD resolves to a real commit object, and genuinely
  distinguishes "unborn" from "corrupt-but-symbolic" via the third,
  ref-name-only `rev-parse --verify -q <resolved-ref-name>` check — proven
  by the dedicated dangling-direct-HEAD and dangling-symbolic-branch-ref
  fixtures §20 adds for this round, and whether §17's `HEAD_UNAVAILABLE`
  row states the complete, three-part trigger condition this round
  defines, not merely the Round 1 `symbolic-ref`-exit-code-only subset
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
- **`--show-toplevel` error-taxonomy fix — new, Round 6 review finding
  #7:** whether an unexpected `--show-toplevel` failure occurring *after*
  step 2 (`--is-bare-repository`) has already succeeded with `false`
  genuinely produces `GIT_COMMAND_FAILED`, never `NOT_A_GIT_REPOSITORY`
  — since step 2 has, by that point, already positively established
  `projectRoot` is a real, non-bare repository, making
  `NOT_A_GIT_REPOSITORY`'s "no repository exists here" claim truthfully
  unreachable at that point — and whether `NOT_A_GIT_REPOSITORY` remains
  reserved, throughout the entire algorithm, exclusively for the genuine
  no-repository case the post-step-2-failure secondary classification
  determines
- Whether `inspectHead`'s upstream resolution (§9, §10) uses
  `git rev-parse --verify -q --end-of-options <branch>@{upstream}` (and
  `--symbolic-full-name --end-of-options <branch>@{upstream}`) for
  tracking-ref resolution — never a hand-constructed
  `refs/remotes/<remote>/<branch>` path, including on the failure path
  (i.e., a configured-but-unresolvable upstream produces `ref: null`, not
  a fallback-constructed guess) — proven by a real fixture using a custom
  `remote.<name>.fetch` refspec and a second real fixture using a
  local-branch upstream (`branch.<name>.remote = "."`), both resolving
  correctly, plus three further real fixtures — an ordinary, a
  custom-refspec, and a local-branch upstream, each with its resolution
  target subsequently deleted — each correctly producing `ref: null`/
  `sha: null` with `remote`/`branch` still populated, never a
  reconstructed path
- **`--end-of-options` on repository-derived upstream resolution — new,
  Round 7 review finding #6:** whether `<branch>` (the current branch
  name, itself repository-controlled input, not BR3-authored) is
  protected by `--end-of-options` in both upstream-resolution commands
  exactly as caller-supplied `DiffRequest` refs already are (§13) —
  proven by the dedicated regression fixture with a real branch literally
  named `-foo` (with a valid local `remote="."` upstream configured)
  correctly resolving instead of Git misinterpreting the revision
  expression as a flag; and whether every other repository-derived
  revision expression BR3 constructs anywhere in this specification has
  been reviewed for the identical hazard and found either already safe by
  construction (e.g. `refs/heads/<name>`-prefixed strings, which can
  never begin with `-`) or protected the same way
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
- Whether zero Git mutation occurs anywhere in BR3's implementation —
  confirmed by literally searching the implementation for every
  Git-subcommand string used, and cross-checking each one against the
  explicit read-only allowlist implied by §5's Scope and §6's Out-of-Scope
  (i.e., `status`, `diff`, `rev-parse`, `symbolic-ref`, `config`
  (read-only `--get`/`--get-regexp` only), `ls-files` (read-only
  `--stage -z` only, for submodule enumeration — §18, Round 6 review
  finding #2), `check-attr` (read-only, non-executing, `--stdin -z
  filter` only, for effective-filter-attribute detection — §18, Round 7
  review finding #4), and no others)
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
  double-quoted literal regions, bracket expressions, and brace expansion
  all genuinely functional, with negation and extglobs genuinely disabled
  (matched literally, not thrown, not silently no-op) — proven by
  dedicated fixtures for each, including `?`'s never-crosses-`/` behavior
  and backslash-escape's literal-match behavior specifically (Round 3
  review finding #4), and double-quoted literal-region behavior
  specifically (Round 4 review finding #6, Part A)
- Whether `matchProtectedPaths` genuinely never throws an uncaught
  exception for any schema-valid input — including a pattern exceeding
  `picomatch`'s internal 65536-character compilation limit, which must be
  reported via `invalidPatterns`, not propagated as an uncaught
  `SyntaxError` (§16, §20, Round 4 review finding #6, Part B)
- Whether `WorkingTreeStatus.entries`, `DiffResult.changes`, and
  `ProtectedPathMatchResult.matches` are each returned in the exact
  canonical sorted order §7a defines (`path`, then kind/`matchedVia`,
  then `oldPath`/`system.name`, then — for `matches` specifically —
  `system.status`, canonical `system.paths`, and original
  `protectedSystems` index as further tie-breaks), proven by a dedicated
  fixture constructing semantically-identical-but-differently-ordered
  inputs and asserting deep-equal, identically-ordered output (§7a, §20,
  Round 4 review finding #1)
- Whether `ProtectedPathMatchResult.matches`'s sort genuinely does **not**
  rely on `system.name` being unique — proven by a dedicated fixture with
  two distinct, schema-legally same-named `ProtectedSystem` entries
  (differing in `status`/`paths`) both matching the same input, correctly
  and deterministically ordered via the `system.status`/`system.paths`/
  original-index tie-break chain rather than left order-dependent on
  incidental processing order (§7a, §20, Round 5 review finding #3), and
  whether this document's earlier, incorrect claim that
  `config.schema.json` guarantees `system.name` uniqueness has been fully
  removed, with no BR0/BR2 schema change proposed to manufacture that
  uniqueness instead
- Whether copy detection is genuinely disabled (`--find-copies` never
  passed) — confirmed by a fixture proving a copy-shaped change is
  reported as a plain `added` entry, not by reading the specification's
  claim
- Whether the rename-detection threshold (§14) is exactly 50%,
  consistently applied to both `inspectDiff` and `inspectWorkingTree`'s
  rename detection (staged **and** unstaged working-tree renames alike),
  and whether a below-threshold pair is genuinely reported as delete+add
  rather than a synthetic rename
- **Unstaged rename preservation — new, Round 6 review finding #6,
  reachability corrected Round 7 review finding #2:** whether porcelain
  v2's `2 .R` record is genuinely mapped to a first-class
  `unstaged_rename` `WorkingTreeEntryKind`, with `oldPath`/`similarity`
  correctly populated from the record's own score field — not
  under-classified as a plain `unstaged_modify` with the rename
  relationship discarded — proven by a dedicated real fixture using the
  **genuinely reachable** construction (a tracked file renamed on disk
  via a plain filesystem rename, then `git add -N` intent-to-add against
  the new path — test/fixture setup only, never something BR3 itself
  performs — content preserved above the 50% threshold); **and** whether
  a plain filesystem rename **without** that intent-to-add step is
  correctly, separately proven to produce `unstaged_delete` + `untracked`
  rather than `2 .R`/`unstaged_rename` — confirming the specification no
  longer asserts that an ordinary filesystem rename alone reliably
  reaches this porcelain v2 record; and whether protected-path matching
  (§12) genuinely checks both sides of an `unstaged_rename` exactly as it
  does for `staged_rename`
- **Complete porcelain-v2 working-tree state model — new, mandatory,
  Round 8 review finding #1:** whether `1 .A` (intent-to-add) is
  genuinely mapped to a first-class `unstaged_add` `WorkingTreeEntryKind`
  — never misclassified as `untracked` or `unstaged_modify` — proven by
  the dedicated real `git add -N` fixture; **and** whether a type-2
  record with both X and Y populated (`2 RM`, `2 RD`, and `2 RT` if
  constructible) genuinely emits **both** a `staged_rename` entry (X-side)
  **and** an independent, correctly Y-mapped entry on the new path
  (unstaged-side) — never discarding either axis — proven by the
  dedicated `git mv` + subsequent-unstaged-change fixtures for `RM` and
  `RD` at minimum; and whether the canonical sort order (§7a) and §14's
  below-threshold delete/add wording were both updated consistently to
  include `unstaged_add` and to distinguish the `untracked`-vs-
  `unstaged_add` below-threshold subcases correctly
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
