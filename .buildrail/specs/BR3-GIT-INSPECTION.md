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

**Concurrency/TOCTOU scope boundary — new, explicit, mandatory, Round 10
review finding #3.** BR3's external-content-filter-execution guarantee
(§18's `check-attr`-then-`status` mechanism, §17's
`EXTERNAL_GIT_FILTER_UNSUPPORTED`) assumes the repository/index/
working-tree configuration relevant to one `inspectWorkingTree` call is
not concurrently, adversarially mutated *during* that one call's own
internal sequence of Git subprocesses. **BR3 does not claim, and cannot
mechanically enforce, an atomic filesystem snapshot across the multiple,
genuinely separate Git processes one BR3 function call spawns** — the
`check-attr` scan and the subsequent `status` invocation are two
distinct OS processes, not one atomic operation, and a repository
mutated by a concurrent, adversarial actor in the narrow window between
them is out of scope for BR3 v0.1's guarantee. Under a repository that is
genuinely stable for the duration of one call — the ordinary case this
specification's guarantees are scoped to — the guarantee holds exactly
as stated elsewhere in this document. Closing the narrower,
adversarial-concurrent-mutation case would require an atomic/sandboxed
inspection mechanism (a filesystem snapshot, a lock held across multiple
subprocesses) explicitly deferred to a future phase (§26), should a
concrete threat model ever require it — this specification does not
pretend the current detect-then-run sequence is race-free against a
deliberately hostile, concurrently-mutating actor.

**The identical concurrency boundary applies to the resolved Git
executable itself, within one top-level operation — new, explicit,
mandatory, Round 12 review finding #1C.** BR3 resolves `git` to one
absolute, canonicalized path once per top-level operation (§8) and
reuses that identical path for every Git invocation within that
operation — this is what makes "resolve one Git binary via a filesystem
path, then have a *different path resolution* silently select a
different binary" structurally impossible within one operation (§8).
**It does not, and cannot, mean the file occupying that resolved path is
mechanically frozen against replacement for the duration of the
operation** — a portable, path-string-based resolver operating within
BR3's Node-only process contract (§18 — BR3 itself never requests a
shell; see below for the precise scope of that guarantee) has no
mechanism to pin an OS-level file identity (an inode, a content hash)
across multiple, separate `execFile` invocations; it can only pin the
*pathname* it invokes. **BR3 therefore assumes the resolved Git
executable file is not replaced or mutated during one top-level BR3
operation** — the ordinary case, and the only case this specification's
guarantees are scoped to. BR3 resolves the executable once, validates
its version once, and uses that absolute path throughout the operation,
but does not claim this creates an atomic, OS-level executable-identity
snapshot against a concurrently, adversarially replacing actor operating
specifically in the narrow window between BR3's own `--version` check
and a later Git invocation within the same operation. Closing that
stronger, adversarial-executable-replacement case would require an
execution/image-identity mechanism (e.g. verifying a content hash or
inode identity immediately before each invocation, or an OS-level
file-locking primitive) outside BR3 v0.1's current portable Node
contract — explicitly deferred to a future phase (§26), should a
concrete threat model ever require it.

**The resolved Git executable is a trusted environment dependency, not
an authenticated one — new, explicit, mandatory, Round 13 review finding
#1.** BR3 verifies the resolved executable's *reported* version (§8's
Capability Floor) but does **not**, and cannot, cryptographically or
otherwise authenticate that the resolved executable genuinely is an
unmodified Git binary — a malicious native binary occupying a resolved
`git`/`git.exe` pathname could report any `--version` output it chooses.
BR3's own process-security guarantees are precisely: it never requests a
shell or performs shell-string interpolation of its own arguments; Git's
arguments are always a literal argv array, never caller/repository-
controlled text; it never falls back to `exec()`, `shell: true`,
`cmd.exe`, or PowerShell under any circumstance; and, once resolved, the
executable at that path is invoked directly and trusted as an
environment dependency, exactly as BR3 already trusts the OS kernel,
the filesystem, and Node itself — BR3 does not sandbox, does not
authenticate, and does not guarantee that the trusted Git executable's
own implementation, OS-level loader, or execution semantics never
launches a further interpreter or subprocess of its own (§18's dedicated
correction documents a concrete, verified instance of this: an
executable text file without a shebang, satisfying every one of BR3's
own POSIX candidate-validity rules, can still, on some platforms, run
through an interpreter fallback — the kernel itself only reports
`ENOEXEC` for an unsuitable executable image, and it is the
`execvp`-family/libuv/runtime execution path, not the kernel, that may
then act on that report by re-attempting the fallback — entirely outside
anything Node's `shell: false` `execFile` contract governs; §18's
correction attributes this precisely — corrected, mandatory, Round 14
review finding #5). **This is a
categorically different, and separately, fully mandatory, threat
boundary from the repository-controlled external-helper protections
this specification already requires** (content-filter refusal,
`core.fsmonitor` suppression, `--no-ext-diff` — §6, §18): those exist
because repository-supplied *data* could otherwise cause the
*already-trusted* Git binary to itself spawn an arbitrary,
repository-selected helper — a hazard entirely independent of whether
the initial Git executable itself is trustworthy, and one this round's
correction does not relax in any way.

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

// Every repository-controlled textual field below (RepositoryInfo.root/
// gitDir/gitCommonDir, HeadInfo.branch, UpstreamInfo.remote/ref/branch,
// and every other JS-string field derived from a Git plumbing call
// whose *content* is repository/config-controlled, not fixed by Git's
// own machine-token grammar) is decoded via the strict
// `TextDecoder("utf-8", { fatal: true })` pipeline §13's byte-semantics
// subsection defines (Category 2 — corrected, Round 10 review finding
// #1: these are not "guaranteed ASCII"; Git genuinely permits
// non-UTF-8 ref-name bytes). A value that fails strict decoding
// produces `MALFORMED_GIT_OUTPUT` for the containing operation, never a
// silently-substituted replacement character.

interface RepositoryInfo {
  root: string;           // absolute, resolved path — the confirmed repository root;
                            // strict-UTF-8-decoded (§13 Category 2) — a filesystem
                            // path is not guaranteed ASCII either
  gitDir: string;          // absolute, resolved --git-dir (per-checkout Git directory;
                            // resolved target of a .git *file* for worktrees/submodules);
                            // strict-UTF-8-decoded (§13 Category 2)
  gitCommonDir: string;     // absolute, resolved --git-common-dir (the shared/common Git
                            // directory — identical to gitDir except for a linked
                            // worktree, where it points at the primary checkout's own
                            // .git; see §8's isWorktree derivation); strict-UTF-8-decoded
                            // (§13 Category 2)
  isWorktree: boolean;      // gitDir !== gitCommonDir — true only for a linked worktree,
                            // never true for an ordinary repository or a submodule
                            // checkout (both have gitDir === gitCommonDir) — see §8
}

function resolveRepository(projectRoot: string): Promise<GitResult<RepositoryInfo>>;

// ---- head.ts ----

interface HeadInfo {
  // Exactly one of these two is populated, per §9's branch/detached model:
  branch: string | null;         // current branch name, or null if detached;
                                   // strict-UTF-8-decoded (§13 Category 2) —
                                   // Git permits non-UTF-8 bytes in a branch
                                   // name; such a branch produces
                                   // MALFORMED_GIT_OUTPUT, never a lossy decode
  detached: boolean;
  unborn: boolean;                 // true if HEAD points to a branch with no commits yet
  headSha: string | null;          // 40-hex-char commit SHA, or null if unborn
  upstream: UpstreamInfo | null;   // null if no upstream is configured
}

// UpstreamInfo — corrected, mandatory, Round 13 review finding #3
// (replaces an earlier draft's `branch: string`, which assumed a
// configured upstream is always a branch under refs/heads/ — false in
// general: Git permits branch.<name>.merge to name ANY ref, e.g.
// refs/tags/v1 or an arbitrary refs/custom/foo namespace, and
// @{upstream} resolves such a configuration correctly. Verified
// directly: a real repository with branch.<current>.remote="." and
// branch.<current>.merge=refs/tags/v1 resolves
// `<current>@{upstream}` to refs/tags/v1 successfully via
// `git rev-parse --symbolic-full-name --verify -q --end-of-options`,
// with the SHA resolving correctly too — the same succeeds for an
// arbitrary refs/custom/foo namespace. Calling this a "branch" would be
// simply false for these real, valid configurations.)
interface UpstreamInfo {
  remote: string;    // e.g. "origin", or "." for a local-branch upstream (§9/§10),
                     // populated directly from branch.<b>.remote config —
                     // independent of whether the upstream actually resolves;
                     // strict-UTF-8-decoded (§13 Category 2)
  mergeRef: string;  // the exact, complete, FIRST configured
                     // branch.<current>.merge value (§9/§10, Round 9
                     // review finding #2's first-value semantics,
                     // preserved unchanged) — read NUL-safely (Round 13
                     // review finding #2) and never shortened, never
                     // assumed to live under refs/heads/, and never
                     // reinterpreted: e.g. "refs/heads/main",
                     // "refs/tags/v1", or "refs/custom/foo" are all
                     // valid, faithfully preserved values — populated
                     // directly from config, independent of whether the
                     // upstream actually resolves; strict-UTF-8-decoded
                     // (§13 Category 2)
  branch: string | null; // the short branch name (e.g. "main"), populated
                         // ONLY when mergeRef is genuinely under
                         // refs/heads/ (i.e. mergeRef === "refs/heads/" +
                         // branch) — null whenever the configured
                         // upstream target is a tag, a custom-namespace
                         // ref, or any other non-refs/heads/ target;
                         // BR3 never calls a tag or a custom ref a
                         // "branch" (§9/§10, Round 13 review finding #3)
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
                      // a guess presented as fact. When non-null,
                      // strict-UTF-8-decoded (§13 Category 2).
  sha: string | null; // the RAW object ID returned by
                      // `git rev-parse --verify -q --end-of-options
                      // <branch>@{upstream}` — no `^{commit}` peel, no
                      // additional dereferencing beyond what that exact,
                      // bare command performs (§9/§10, Round 14 review
                      // finding #2). This is NOT guaranteed to be a
                      // commit SHA whenever mergeRef/ref names a
                      // non-branch ref: for a local ANNOTATED tag
                      // target, this is the tag OBJECT's own SHA, a
                      // different object ID than the peeled commit SHA
                      // `<branch>@{upstream}^{commit}` would return —
                      // BR3 never performs that peel. For a lightweight
                      // tag or an ordinary refs/heads/*-or-remote-tracking
                      // branch target, the raw SHA already IS a commit
                      // SHA (no distinct tag object exists to peel
                      // through) — but that is a property of the target,
                      // never of this field's own definition, which is
                      // namespace-general and identical for every
                      // supported mergeRef shape. null exactly when ref
                      // is null: whenever @{upstream} itself fails to
                      // resolve locally (§9's "configured but
                      // unresolvable" case) — ref and sha are
                      // null/non-null together, never independently. Do
                      // NOT call this field "commit SHA," "branch tip
                      // commit," or "resolved commit" except when a
                      // statement is specifically scoped to a
                      // refs/heads/*-or-remote-tracking-branch target.
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
     - **If neither shape is present at `projectRoot` itself, check the
       ancestor chain before concluding `NOT_A_GIT_REPOSITORY` — new,
       mandatory, Round 16 review finding #4 (an earlier draft of this
       classifier checked only `projectRoot` itself, never accounting for
       Git's own ordinary parent-directory repository discovery, which
       step 2's authoritative `--is-bare-repository` invocation itself
       already relies on).** `git rev-parse --is-bare-repository`
       normally walks up from `cwd` to find the enclosing repository — a
       `projectRoot` nested inside a real repository's own working tree
       (e.g. `projectRoot = /repo/sub`, with the real repository rooted
       at `/repo`) is genuinely, truthfully inside a Git repository, even
       though `/repo/sub` itself has neither candidate shape. **Verified
       directly:** a real repository at `/repo` with its own
       `/repo/.git/config` deliberately malformed (the identical
       unterminated-`[section` technique already used above), and
       `projectRoot` set to a plain, non-repository subdirectory
       `/repo/sub` (no `/repo/sub/.git` of any kind) — `git
       rev-parse --is-bare-repository` run with `cwd=/repo/sub` fails
       with exit 128 (Git's own discovery walks up to `/repo`, finds the
       real repository, then fails reading its malformed `config`); at
       `projectRoot` itself, neither the non-bare shape
       (`/repo/sub/.git` — absent) nor the bare shape
       (`/repo/sub/HEAD`+`objects/`+ref-storage — absent) is present, so
       the pre-Round-16 classifier above would incorrectly conclude
       `NOT_A_GIT_REPOSITORY` — **false**, since `projectRoot` is
       demonstrably inside a real repository; Git was merely unable to
       inspect it successfully. **The corrected check:** walk
       `projectRoot`'s own ancestor chain (`path.dirname`, repeated, up
       to and including the filesystem root — the identical directory
       Git's own repository discovery would itself traverse), and at
       each ancestor, apply the **identical** non-bare-shape check
       already defined above (`<ancestor>/.git` exists, as file or
       directory, with the same `HEAD`-entry shape discipline when it is
       a directory) — **ancestor-chain discovery only ever looks for the
       non-bare shape, never the bare shape**, since a bare repository is
       never itself an ancestor directory of some other, different
       `projectRoot` in the way a non-bare repository's root can be (a
       bare repository has no working tree for a `projectRoot` to be
       nested inside in the first place). **If a plausible ancestor
       repository marker is found:** `resolveRepository` cannot
       positively distinguish "this ancestor repository is real and
       healthy, but `projectRoot` itself is simply not inside it
       correctly" from "this ancestor repository is real but itself
       malformed" from a filesystem check alone — but it does not need
       to, because either way, Git already, authoritatively, failed
       before establishing a toplevel, and a repository marker genuinely
       exists in the discovery ancestry. The correct classification is
       `GIT_COMMAND_FAILED` (**not** `NOT_A_GIT_REPOSITORY`, and,
       critically, **not** `PROJECT_ROOT_MISMATCH` either) — `details`
       naming the ancestor path where the marker was found, for caller
       diagnosis. **Why not `PROJECT_ROOT_MISMATCH`:** that code is
       reserved exclusively for the healthy path — Git successfully,
       authoritatively resolves a real `--show-toplevel`, and that
       resolved toplevel differs from `projectRoot` (§8, below) — a case
       that requires Git to have actually, successfully told BR3 what the
       real toplevel is. Here, Git failed *before* `--show-toplevel`
       could ever run, let alone succeed — BR3 knows a real repository
       marker exists somewhere in the discovery ancestry, but cannot
       truthfully claim to know the exact repository root Git would have
       authoritatively accepted had the repository been healthy, so it
       must not claim `PROJECT_ROOT_MISMATCH`'s more specific meaning.
       **If no ancestor marker is found anywhere up to the filesystem
       root:** this is a genuine plain non-Git directory, not nested
       inside anything Git would itself have discovered →
       `NOT_A_GIT_REPOSITORY`, exactly as below. **The same reasoning
       applies to an ancestor repository Git cannot inspect for another
       already-recognized reason, such as dubious ownership (above),
       where practical** — the ancestor-marker check is purely
       filesystem-shape-based and does not depend on knowing *why* Git's
       own discovery ultimately failed, only that a real repository
       marker exists somewhere between `projectRoot` and the filesystem
       root. This ancestor-chain check runs **only** as this
       already-existing fallback's own extension — it does not run before
       step 2's authoritative Git invocation, does not change when this
       fallback itself runs (only after step 2 has already, authoritatively,
       failed), and does not reintroduce any early, non-authoritative
       precheck of any kind (the Round 2 correction removing the original
       `<projectRoot>/.git`-existence precheck is fully preserved — this
       check exists exclusively inside the post-failure secondary
       classifier, never before it).
     - If **neither** the non-bare shape **nor** the bare shape is
       present at `projectRoot` itself, **and** no plausible ancestor
       repository marker is found in the chain above: this is a genuine
       plain non-Git directory → `NOT_A_GIT_REPOSITORY` (unchanged from
       before).
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
    - **This check runs fresh on every top-level `resolveRepository`
      call against `projectRoot`, after the worktree/submodule shape
      determination (step 5) and before `resolveRepository` returns
      success — never cached across separate top-level operations
      merely because `projectRoot` is the same path string — corrected,
      mandatory, Round 12 review finding #1B (the previous "cache
      alongside other `resolveRepository`-derived facts for that
      `projectRoot`" framing is withdrawn — see step 5b's identical
      correction immediately below for the full rationale: `projectRoot`
      is a filesystem path, not a repository identity, and the
      repository actually occupying that path can change entirely
      between two separate top-level operations).** This fact may be
      computed once and shared *within* one top-level operation, but is
      never persisted or reused across a subsequent, separate one.
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
    - **This check runs fresh on every top-level `resolveRepository`
      call against `projectRoot`, immediately after step 5a's
      object-format check (the two share the same
      "positively-recognized, healthy repository,
      narrow-v0.1-scope-decision" character and are naturally sequenced
      together) and before `resolveRepository` returns success — never
      cached across separate top-level operations merely because
      `projectRoot` is the same path string — corrected, mandatory,
      Round 12 review finding #1B (an earlier draft of this bullet
      permitted caching this result "per-repository," described as safe
      because ref-storage format is "a fixed, per-repository property" —
      that framing conflates the repository as a logical entity with
      `projectRoot` as a mere filesystem path string, which are not the
      same thing).** `projectRoot` names a filesystem location, not a
      repository identity — the repository actually occupying that
      location between two separate top-level BR3 operations can change
      entirely (the `.git` directory deleted and reinitialized with a
      different ref-storage backend, a different repository bind-mounted
      or swapped into place at the identical path, etc.), and a
      `projectRoot`-keyed cache would incorrectly reuse an earlier,
      no-longer-applicable "supported" verdict for a repository BR3 has
      never actually validated. **This check, like every other
      `resolveRepository`-derived safety/capability fact (object format,
      ref-storage format, the repository-root/bare/worktree/submodule
      relationship itself, `gitDir`/`gitCommonDir`), is recomputed fresh
      on every top-level operation** — it may be computed once and
      shared *within* that one operation (§8's existing "share within
      one call" principle, already established for the filter-attribute
      scan, §6/§18), but never persisted or reused across a subsequent,
      separate top-level call, regardless of how little wall-clock time
      has elapsed or whether `projectRoot`'s own path string is
      unchanged.
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
       effective `PATH` entries in order and testing each candidate
       against the exact, platform-specific validity contract defined
       below — corrected, mandatory, Round 12 review finding #2 (an
       earlier draft's vague "`fs.stat`/`fs.access` with the appropriate
       execute-permission check" left the candidate's required
       *filesystem shape* undefined, which is a real gap, not an
       implementation detail) — this is ordinary, safe filesystem
       inspection, not a subprocess spawn, and does not itself invoke
       `which`/`where`/a shell/any external helper (BR3's subprocess
       boundary remains Git-only, per §18's core discipline — resolution
       is pure Node code, not a delegated
       external lookup).
    3. **Resolution `cwd` — one single, explicit, fixed resolver `cwd`
       for the entire top-level operation, never a per-call `cwd` —
       corrected, mandatory, Round 9 review finding #3A (a genuine
       internal contradiction in the previous draft, now removed).** An
       earlier draft of this step said a relative `PATH` entry is
       "resolved against the same `cwd` value that specific invocation
       will actually use," while step 6 (below) simultaneously required
       selecting **one** absolute executable path and reusing it for
       every Git command in the operation — including `resolveRepository`/
       `inspectHead`/`inspectWorkingTree`/`inspectDiff` (whose `execFile`
       `cwd` is `projectRoot`) and nested submodule calls (whose `cwd` is
       each submodule's own path) — **these two requirements are mutually
       exclusive whenever `PATH` contains a relative entry**: **verified
       directly**, with `PATH=.`, `cwd=/tmp/A` resolves `./git` to one
       binary while `cwd=/tmp/B` resolves the identical relative entry to
       a genuinely different binary, with the `PATH` string itself
       completely unchanged — so "resolve per-call `cwd`" and "reuse one
       resolved path across all calls, which have different `cwd`
       values" cannot both hold. **The corrected, single, exact rule:**
       resolution uses **exactly one, explicitly chosen resolver `cwd`
       for the entire top-level operation** — `process.cwd()` (the Node
       process's own current working directory at the moment resolution
       runs), fixed and explicit, never `projectRoot` and never any
       later call's own `cwd` — and **every** `PATH` entry, relative or
       absolute, is normalized to an absolute path **against that one
       resolver `cwd`** (`path.resolve(resolverCwd, pathEntry)`) before
       being searched. Resolution then walks this fully-absolute-path
       list once, selects/canonicalizes one executable (steps 4–5
       below), and that single result is what step 6 reuses across every
       later call regardless of that call's own, different `cwd` —
       resolution itself no longer varies per call, so there is no
       remaining contradiction: the *executable identity* is fixed once,
       up front, against one fixed resolver `cwd`; individual Git
       commands' own `cwd` (`projectRoot`, a submodule path, etc.)
       continues to vary exactly as this specification already requires
       for repository-targeting purposes, entirely independently of
       executable resolution. **Empty `PATH` entries** (a leading,
       trailing, or doubled `PATH`-separator producing a zero-length
       entry — POSIX conventionally treats this as `.`, the resolver
       `cwd` itself) are normalized identically, to the resolver `cwd`
       itself, for the same reason. `git --version`'s own `cwd` (the
       capability probe's already-established exception, above) may
       differ from the resolver `cwd` used for resolution — resolution
       determines *which executable*, the probe's own `cwd` is merely
       where that already-resolved executable happens to run from,
       exactly as for any other already-resolved call.
    4. **Windows-specific resolution — a deliberate, stricter,
       BR3-specific resolver, not a claimed mirror of Node/libuv's own
       bare-command lookup — corrected, mandatory, Round 11 review
       finding #2 (the previous draft's PATHEXT-based model is factually
       wrong about how shell-free `execFile` actually resolves a bare
       command on Windows, and is replaced entirely, not merely
       amended).** An earlier draft of this step claimed Windows
       resolves a bare `git` command by walking `PATHEXT` in order
       (conventionally `.COM;.EXE;.BAT;.CMD;...`), with BR3's resolver
       filtering `.cmd`/`.bat` out of that walk. **This is not the
       lookup model shell-free Node/libuv `execFile` actually uses**:
       libuv's Windows process-spawning implementation does **not**
       consult `PATHEXT` for its own executable search at all — its
       native, shell-free lookup handles candidate resolution through
       its own mechanism, entirely independent of the `PATHEXT`
       environment variable. Continuing to describe BR3's resolver as
       "mirroring Node/libuv's own lookup, filtered to exclude
       `.cmd`/`.bat`" is therefore not just imprecise, it is describing a
       lookup model that does not exist in the runtime BR3 actually
       depends on. **BR3 does not attempt to replicate whatever Node/
       libuv's actual internal Windows lookup does** (which is, in any
       case, not the concern — BR3 does not rely on a bare `"git"`
       command ever reaching `execFile` at all, per step 6 below); BR3
       instead defines its **own**, explicit, simpler, and deliberately
       stricter resolver, stated as such:
       - **BR3's Windows resolver is intentionally stricter than
         whatever Node/libuv's own bare-command lookup would do, and
         this is a deliberate, explicit v0.1 design choice, not an
         approximation of Node's behavior.** This is safe precisely
         *because* BR3 always resolves to one absolute path itself and
         then invokes that absolute path directly (step 6) — Node/libuv's
         own bare-command lookup is therefore never actually exercised
         by BR3 for `git` at all, on any platform, so there is no
         "matching Node's behavior" obligation to satisfy in the first
         place; BR3's resolver only needs to be correct and safe on its
         own terms.
       1. Construct/sanitize the effective Windows `PATH` key first,
          using the already-established Windows-only, case-insensitive,
          ordinally-first-wins key-selection rule (§19) — this is
          unchanged from the existing Windows `PATH`-key-selection
          correction and applies identically here.
       2. **Search only the directories named in that sanitized `PATH`
          value, in `PATH` order** — nothing else. In particular:
       3. **No implicit current-working-directory search** — BR3's
          resolver never checks the resolver `cwd` itself (or any other
          directory not explicitly listed in the sanitized `PATH`
          value) as an implicit candidate location, regardless of
          whatever behavior an ordinary Windows command-line shell
          might otherwise exhibit for a bare command.
       4. **`PATHEXT` is not consulted at all, for any purpose.** BR3's
          resolver does not read the `PATHEXT` environment variable, does
          not walk any extension list it might contain, and is
          structurally unaffected by its presence, absence, or content
          (an unusual or reordered `PATHEXT` value has zero effect on
          BR3's resolution — see the dedicated test below).
       5. **Exactly one accepted candidate filename: `git.exe`.** For
          each directory in the sanitized `PATH`, in order, BR3 checks
          only for a file literally named `git.exe` (case-insensitive
          filename match, per ordinary Windows filesystem semantics).
          **No other candidate name or extension is ever accepted** —
          not `git.cmd`, not `git.bat`, not `git.com`, not `git` with no
          extension, not any other `PATHEXT`-style variant. This is a
          narrow, explicit allowlist of exactly one filename, not an
          extension-preference ordering. (This is narrower than Round
          9/10's earlier "`.exe`/`.com` both acceptable" framing — Round
          11 narrows further, to `git.exe` alone, as the one, simplest,
          unambiguous, universally-applicable Git-for-Windows target,
          removing any remaining need to reason about whether a `.com`
          candidate is genuinely safe in a given installation.)
       6. **The first directory (in sanitized `PATH` order) containing a
          *valid* `git.exe` candidate wins** — resolution stops there;
          later `PATH` entries are not consulted once a genuinely valid
          candidate is found. **"Valid" means both the exact-filename
          match (step 5) and the filesystem-shape requirement (step 10,
          below) are satisfied** — a directory entry merely *named*
          `git.exe` that fails the shape requirement does not stop the
          search; resolution continues to later `PATH` entries exactly
          as it would for a directory containing no `git.exe`-named
          entry at all.
       7. **The reason `.cmd`/`.bat`/any other indirect-execution format
          is categorically excluded, restated precisely:** BR3's entire
          process-execution contract (§18) is `execFile` with **no
          shell** (`shell: false`, the `execFile` default) — Node's
          `execFile` spawns the named executable directly, via the OS's
          own process-creation API, with no command interpreter in the
          invocation path at all. A `.cmd`/`.bat` file is not itself a
          binary the OS can directly execute — running one requires a
          command interpreter (`cmd.exe`) to parse and execute its
          script contents, which is exactly the shell-execution path
          BR3's `shell: false`/no-shell discipline (§18) forbids
          categorically, for the identical injection-surface reasons
          that discipline exists in the first place. A resolver that
          selected `git.cmd` (some Git-for-Windows installations, or
          wrapper tooling, may place a `.cmd` shim on `PATH`) and then
          handed it to shell-free `execFile` would either fail outright
          or — worse, depending on the Node version and OS `execFile`
          internals for `.cmd`/`.bat` specifically — silently and
          implicitly invoke a shell-like interpreter path, reintroducing
          exactly the interpretation/injection surface §18's no-shell
          contract exists to close. BR3 v0.1's resolver therefore never
          considers `.cmd`/`.bat` (or any extension other than the
          literal `git.exe` filename) a candidate at all — not "filtered
          out after being found," but never checked for in the first
          place, per step 5's narrow allowlist.
       8. **If no `git.exe` is found in any sanitized `PATH` directory:
          exactly `GIT_EXECUTABLE_UNAVAILABLE` (§17) — one exact result,
          no alternative.** An earlier draft of this section described
          this outcome as "`GIT_EXECUTABLE_UNAVAILABLE` (or a deliberate,
          equally distinct resolution-failure typed outcome —
          implementation's choice of exact code)." **That
          "implementation's choice" framing is removed — there is
          exactly one typed result for this case, `GIT_EXECUTABLE_UNAVAILABLE`,
          identical to the outcome for `git` being entirely absent from
          the system.** From BR3's perspective, a `git` that is only
          reachable via a shell-requiring wrapper (or not reachable at
          all under this resolver's narrow allowlist) is not usable,
          full stop — there is no second, softer typed outcome for "found
          something, but it wasn't acceptable."
       9. **Never falls back to** `cmd.exe`, PowerShell, `shell: true`,
          `exec()`, `spawn` with `shell: true`, or any `PATHEXT`-style
          wrapper-execution mechanism, under any circumstance, for any
          reason — resolution either finds a directly-executable
          `git.exe` candidate via the exact steps above, or it fails
          with `GIT_EXECUTABLE_UNAVAILABLE`; there is no third path.
       10. **Exact Windows candidate filesystem-shape requirement — new,
           mandatory, Round 12 review finding #2 (step 5's "literal
           `git.exe` filename" rule defined the required *name* but not
           the required filesystem *shape*, a real, distinct gap).** A
           directory entry literally named `git.exe` is **not**, by
           that name alone, a valid candidate — the entry must
           additionally resolve, after ordinary Windows symlink/junction
           resolution, to a **non-directory, regular-file executable
           target suitable for direct, shell-free `execFile` use.** At
           minimum: a **directory** named `git.exe` is never a valid
           candidate (a directory can share a name with what would
           otherwise be an executable file, and a naive existence check
           alone cannot distinguish them); a **broken link** (a
           reparse point/junction whose target does not exist, or which
           cannot be resolved) is never a valid candidate; any other
           filesystem object that is not, after resolution, an ordinary,
           directly-executable regular file is never a valid candidate.
           **If the entry at a given `PATH` directory named `git.exe` is
           invalid under this shape requirement, resolution does not
           stop and fail there — it continues searching subsequent
           `PATH` entries in order**, exactly as an invalid/absent entry
           at any other step already causes the search to continue
           (never converting one directory's invalid candidate into the
           final, overall resolution failure while a later, valid
           candidate exists further down `PATH`).
       - **(c)** — POSIX resolution, exact candidate filesystem-shape
         requirement — corrected, mandatory, Round 12 review finding #2
         (an earlier draft's "an execute-permission check" alone left
         the required filesystem *shape* undefined — POSIX execute/search
         permission can legitimately exist on a **directory** as well as
         a file, which a permission-only check cannot distinguish).**
         For each `PATH` directory, in order, the candidate is
         `<dir>/git`. This candidate is usable **only if all three**
         hold:
         1. **It exists.**
         2. **After ordinary symlink resolution (POSIX `stat`, not
            `lstat`, semantics — a symlink is followed to its ultimate
            target before this check), the resolved target is a
            **regular file** — never a directory, a FIFO, a socket, a
            device node (block or character special), or any other
            non-regular filesystem object.** A symlink itself is
            therefore permitted as a `PATH`-directory entry, but only
            when — and exactly because — its *resolved target* is
            itself a regular, executable file; the symlink's mere
            presence is never sufficient on its own.
         3. **It passes the appropriate POSIX executable-permission
            check** for the current process's effective user/group (the
            existing execute-permission check this specification already
            required, now explicitly conditioned on step 2's regular-file
            requirement having already been confirmed, not evaluated
            independently of it).
         **A broken symlink** (resolving to a target that does not
         exist) **fails step 1** and is rejected. **A directory named
         `git`** (a real, concrete hazard: an earlier `PATH` entry
         containing a subdirectory literally named `git`, which — under
         ordinary POSIX permission bits — can legitimately carry
         execute/search permission, since that is exactly the
         permission bit that makes a directory *traversable*, and is
         therefore trivially, and incorrectly, mistaken for
         "executable" by a permission-only check that skips the
         regular-file test) **fails step 2** and is rejected — this is
         precisely the case a naive `fs.access(candidate, X_OK)`-only
         implementation would incorrectly accept, since a directory's
         own execute bit governs traversal permission, not "can this
         path be spawned as a program." **A non-executable regular
         file** fails step 3 and is rejected. **In every rejection
         case, resolution continues searching later `PATH` entries in
         order** — it never stops at, and never converts into the
         overall resolution outcome, an invalid candidate merely
         because it was the first `PATH` entry examined; a later,
         genuinely valid `git` executable further down `PATH` is still
         found and selected. **If no candidate anywhere in the
         effective POSIX search path satisfies all three conditions:
         `GIT_EXECUTABLE_UNAVAILABLE`.**
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
       use the identical resolved path, **regardless of that specific
       call's own, separately-varying `cwd`** (`projectRoot`, a
       submodule's own path, etc. — resolution's own fixed resolver
       `cwd` from step 3 is entirely independent of, and never
       conflated with, each individual Git command's own targeting
       `cwd`). **This is what makes "resolve one Git binary via one
       filesystem path string, then have a *different* filesystem-path
       resolution silently select a different binary" structurally
       impossible within one top-level operation — corrected, mandatory,
       Round 12 review finding #1C (an earlier draft overclaimed this
       as making "validate one Git binary, execute a different one"
       structurally impossible in the absolute sense, which is too
       strong).** There is no second, independent *resolution* step for
       any later call within the same operation to diverge through —
       every later `execFile` call's first argv element **is** the
       already-resolved absolute path, not a fresh `"git"` string for
       Node to resolve again. **This does not, however, mean the
       underlying file at that resolved path is mechanically frozen for
       the duration of the operation.** A portable, path-string-based
       resolver — the only mechanism available within BR3's Node-only,
       shell-free process contract — cannot, on its own, prevent a
       separate, concurrent process from replacing or overwriting the
       file at that exact resolved pathname between BR3's own
       `--version` check and a later Git invocation within the same
       operation (a genuinely narrow race, structurally identical in
       kind to §6's already-stated `check-attr`-then-`status`
       concurrency boundary — see below for the parallel, explicit
       scope statement this specification makes for exactly this case).
       **No BR3 code path anywhere constructs an `execFile("git", ...)`
       call with the bare, literal string `"git"` once resolution has
       succeeded for a given top-level operation; every actual
       `execFile` call site uses the resolved path exclusively**
       (corrected, Round 9 review finding #3D — a stale, literal
       `execFile("git", [...])` example elsewhere in this document,
       predating this mechanism, is removed — see §18).
    7. **No cross-top-level-operation caching of the capability result —
       corrected, mandatory, Round 12 review finding #1A (Round 7/8's
       "cache by resolved path, reuse across operations" permission is
       withdrawn entirely — it is not a safe implementation choice).**
       An earlier draft of this step permitted the capability-check
       result (`git --version`'s outcome) to be cached, keyed by the
       resolved, canonicalized executable path, and reused by a
       **later, separate top-level BR3 operation** whenever resolution
       against that later operation happened to produce the identical
       path string — describing this as safe because "resolution itself
       is cheap... only the capability check itself is worth caching."
       **This is unsafe: a canonical filesystem path is not proof that
       the file occupying it is still the same binary.** Verified
       reasoning: a binary at an exact path can be replaced, upgraded,
       downgraded, or overwritten between two separate top-level BR3
       operations (a package-manager upgrade, a version-manager switch,
       a deliberately hostile actor) with no change to the path string
       itself — a later operation's resolver would produce the
       identical canonical path, and a path-keyed cache would then
       incorrectly reuse the *earlier* operation's "supported" verdict
       for a *now different*, potentially below-floor binary — silently
       skipping the fresh `--version` check this specification's
       capability floor exists to enforce, and, since BR3's `GIT_NO_LAZY_FETCH`/
       network-suppression guarantee depends on running at or above that
       floor (§8's Capability Floor subsection), this is not merely a
       stale-version-reporting defect — it can silently invalidate the
       no-network guarantee itself. **The corrected, mandatory v0.1
       contract: the capability-check result is never cached across
       separate top-level BR3 operations, under any keying scheme.**
       Every top-level BR3 operation, independently: (i) builds/sanitizes
       its own environment; (ii) resolves `git` to one canonical
       absolute path (steps 1–5); (iii) runs `git --version` against
       that freshly-resolved path; (iv) verifies the result is ≥2.45.0;
       (v) reuses that validated path — and only that path's already-
       obtained, already-fresh capability verdict — for every nested
       call *within that same top-level operation* (`resolveRepository`,
       `inspectHead`, `inspectWorkingTree`, `inspectDiff`, submodule
       enumeration, `check-attr`, `ls-files`). **The capability result
       expires the moment that top-level operation ends; the next
       top-level call always starts fresh**, with no shortcut available
       merely because a previous operation's resolved path string
       happens to match. This is not a meaningful performance
       regression — resolution and the version check both remain cheap
       relative to the substantive Git operations BR3 performs — and it
       is the only contract that actually upholds the capability floor's
       own security/correctness purpose.
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
| Detached HEAD (checked out to a SHA/tag directly) | `null` | `true` | `false` | 40-hex SHA | `null` (detached HEAD never has an upstream — there is no current branch name for §10's `branch.<name>` config lookup to key on at all) |
| Unborn branch (fresh `git init`, zero commits) | branch name (the to-be-created branch, from `git symbolic-ref HEAD` — this resolves even with no commits) | `false` | `true` | `null` | **per below — corrected, Round 13 review finding #4A and Round 14 review finding #1: not unconditionally `null`, and unborn status alone does not force `ref`/`sha` null either** |
| Corrupt HEAD (symbolic-ref resolves to a branch name, but that branch ref does not point at a real, existing commit object) | branch name (from `symbolic-ref`, still reported — the ref name itself is knowable even though it does not resolve to a real commit) | `false` | `false` | `null` | `null` | (see `HEAD_UNAVAILABLE`, below) |

**Unborn-branch upstream semantics — corrected, mandatory, Round 13
review finding #4A, corrected again, mandatory, Round 14 review finding
#1 (an earlier draft of this table unconditionally reported
`upstream: null` for every unborn branch, reasoning "no commit exists
yet to have an upstream relationship against" — that reasoning conflates
two genuinely distinct BR3 concepts this specification already,
elsewhere, carefully separates: whether an upstream is *configured* at
all, versus whether it currently *resolves*).** A symbolic, unborn
branch (HEAD points at `refs/heads/<name>`, but that ref file does not
yet exist because nothing has been committed) can still have both
`branch.<name>.remote` and `branch.<name>.merge` **genuinely configured**
in `.git/config` — most commonly because a fresh repository was cloned
from a template, or because a caller/tool explicitly set up tracking
before the first commit. This is a real, **configured** upstream
identity — exactly the "configured but currently unresolvable" shape
§9/§10 already define and require for other cases (a deleted
remote-tracking ref, a deleted local-upstream target) whenever
resolution genuinely fails, not a "nothing is configured" shape. Treating
every unborn branch's upstream as unconditionally `null` — regardless of
what `.git/config` actually declares — would silently discard a real,
configured fact, which directly contradicts this specification's own,
already-established "configured but unresolvable is not the same as not
configured" principle (§9/§10, corrected in earlier rounds specifically
to stop BR3 from conflating these two states for other cases).

**Round 13's own correction still contained a further false assumption,
now withdrawn — mandatory, Round 14 review finding #1.** Round 13 assumed
`<name>@{upstream}` categorically *cannot* resolve while the current
branch itself remains unborn, and therefore hard-coded `ref: null`,
`sha: null` for every unborn-with-configured-upstream case. **That
assumption is false and independently reproducible.** `@{upstream}`
resolution keys on the **configured tracking relationship**
(`branch.<name>.remote`/`.merge`), not on the current branch ref's own
existence — Git can resolve `<name>@{upstream}` to a real object as long
as the *configured target* itself exists, regardless of whether `<name>`
itself has ever been committed to. Verified reproduction against a real
scratch repository (Git 2.47.3): with a normal repository already
containing a commit on `master`, running `git symbolic-ref HEAD
refs/heads/new` points HEAD at a `new` branch ref that does not yet
exist (HEAD is genuinely unborn — `git symbolic-ref -q HEAD` succeeds,
`git rev-parse --verify -q refs/heads/new` fails); configuring
`branch.new.remote=.` and `branch.new.merge=refs/heads/master` and then
running `git rev-parse --verify -q --end-of-options 'new@{upstream}'`
**succeeds**, printing `master`'s commit SHA, and
`git rev-parse --verify -q --symbolic-full-name --end-of-options
'new@{upstream}'` **succeeds**, printing `refs/heads/master`. The
existence of the current local branch ref is therefore **not** a
precondition for Git to resolve its configured upstream identity — only
the existence of the *target* the configuration points at matters, which
is exactly the same "configured but currently resolves" vs. "configured
but currently fails to resolve" distinction §9/§10 already apply to every
other case in this specification.

**The corrected, complete decision table for `upstream` across every
`branch`/`detached`/`unborn` combination — Round 14 revision:**
- **Detached HEAD:** `upstream: null` — unconditionally, always; there is
  no current branch name at all for §10's `branch.<name>.remote`/`.merge`
  config lookup to key on (unchanged from the existing, correct
  behavior).
- **Symbolic branch (normal or unborn), no `branch.<name>.remote`/`.merge`
  configured:** `upstream: null` — the ordinary "no upstream configured"
  case, determined purely by config-key absence (§10 step 1), unaffected
  by whether the branch is unborn.
- **Symbolic branch (normal or unborn), `branch.<name>.remote`/`.merge`
  configured:** `UpstreamInfo` is returned, **not** `null`, and **the
  identical resolution procedure runs regardless of whether the current
  branch is normal or unborn — corrected, Round 14 review finding #1**:
  `remote`/`mergeRef`/`branch` populated exactly as §10 step 1 specifies
  (directly from config, independent of resolution and independent of
  unborn status); `<name>@{upstream}` is then **attempted** (both the
  plain-SHA and `--symbolic-full-name` resolution calls, §10 step 2) —
  **never skipped merely because the branch is unborn**. If both
  resolution calls succeed (the configured target genuinely exists,
  whether or not the current branch itself has any commits), `ref`/`sha`
  are populated from the result exactly as the normal-branch case already
  specifies. If resolution genuinely fails (the configured target itself
  does not exist, or does not yet exist, for any reason — including but
  not limited to the current branch being unborn with a self-referential
  or otherwise-unresolvable target), `ref: null`, `sha: null` — the
  identical "configured but unresolvable" shape §9/§10 already define.
  **Unborn status by itself is never sufficient reason to force `ref`/
  `sha` null** — only a genuine `@{upstream}` resolution failure is.

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

1. **Configured identity, independent of the tracking ref's existence —
   corrected to use `--get-all` for `.merge`, mandatory, Round 9 review
   finding #2; made NUL-safe, mandatory, Round 13 review finding #2:**
   `git config -z --get branch.<branch>.remote` and `git config -z
   --get-all branch.<branch>.merge` (both genuinely read-only —
   `--get`/`--get-all`, never `--set`/`--add`; both already on §27's
   read-only command allowlist, `--get-all` and `-z` both named
   explicitly). `<branch>` is the branch name from the branch/detached
   determination above (this step is skipped entirely, `upstream: null`,
   if HEAD is detached — a detached HEAD has no branch name to look up
   config for).

   **Why `-z` is mandatory for `--get-all`, not merely a stylistic
   preference — new, mandatory, Round 13 review finding #2 (this is
   implementation-blocking, not cosmetic):** a Git config value can
   itself contain an **embedded newline** — the value is not required to
   be a single line of text. Plain, newline-delimited `git config
   --get-all branch.<b>.merge` output is therefore **fundamentally
   ambiguous** for any consumer, including BR3, that needs to recover
   the exact number and content of configured values, not merely a
   flattened stream of lines. **Verified directly:** a fixture where the
   **first** `branch.<b>.merge` value's own content is literally
   `refs/heads/foo\nrefs/heads/bar` (i.e. one configured value whose text
   contains an embedded newline) and the **second**, separate, genuinely
   distinct configured value is `refs/heads/bar` — plain `git config
   --get-all branch.<b>.merge` output is byte-for-byte indistinguishable
   from a **three**-separate-value configuration
   (`refs/heads/foo`, `refs/heads/bar`, `refs/heads/bar`); a line-based
   parser cannot tell these two genuinely different configurations apart
   from the output alone. `git config -z --get-all branch.<b>.merge`,
   by contrast, correctly emits each **complete** value NUL-terminated
   (`<first complete value, embedded newline included>\0<second complete
   value>\0`), which is unambiguous. Since BR3's upstream contract
   specifically depends on identifying the exact **first** configured
   `.merge` value (below), this ambiguity is not a cosmetic parsing
   nicety — a line-based parser could silently misidentify which value
   is "first" whenever an earlier value contains an embedded newline.
   **The corrected parsing pipeline, mirroring §13's existing byte-first
   discipline exactly (never a second, separate lossy policy):** `git
   config -z --get branch.<branch>.remote`/`-z --get-all
   branch.<branch>.merge` are invoked with `encoding: "buffer"` (§18,
   universal for every BR3 Git call); the raw `Buffer` output is
   NUL-split (`Buffer.prototype.indexOf(0x00)`/`.subarray()`, never
   `buffer.toString().split(...)`, exactly as §13 already requires for
   working-tree/diff path output); each complete, isolated value's byte
   range is then strict-UTF-8-decoded individually (§13 Category 2) —
   never decoding the whole buffer first and splitting the resulting
   string, which would already have discarded the byte-exact record
   boundaries `-z` exists to preserve.

   **Why `--get-all`, not a bare `--get`, is additionally required for
   `.merge` (unchanged from Round 9, restated with `-z` now included):**
   Git explicitly permits **multiple** `branch.<name>.merge` values —
   an octopus-merge-style configuration — and a bare `git config --get
   branch.<branch>.merge` against a multi-valued key returns only the
   **last** configured value, silently discarding every earlier one.
   **Verified directly:** a fixture with `branch.master.remote = "."`
   and two `branch.master.merge` values configured in order
   (`refs/heads/foo` then `refs/heads/bar`, both local branches
   existing) —
   ```
   $ git config --get branch.master.merge
   refs/heads/bar                          # last value only
   $ git config -z --get-all branch.master.merge
   refs/heads/foo\0refs/heads/bar\0        # both complete values, in order, NUL-safe
   $ git rev-parse --symbolic-full-name master@{upstream}
   refs/heads/foo                          # @{upstream} uses the FIRST value
   ```
   **An earlier draft of this specification, using bare `--get`, would
   report `branch: "bar"` while `ref`/`sha` (derived via `@{upstream}`
   in step 2, unaffected by this bug) describe `refs/heads/foo`** — a
   single `UpstreamInfo` object internally describing two different
   targets, which is a genuine correctness defect, not merely an edge
   case: the reported merge target and `ref`/`sha` must always describe
   the *same* upstream.

   **The corrected mapping from Git's multi-valued `.merge` configuration
   to BR3's single `UpstreamInfo` object:**
   - **Zero merge values** (`-z --get-all` exits 1, no stdout — the
     ordinary case): `upstream: null`, subject to the same remote-key
     rules already established (both `.remote` and `.merge` must be
     present for anything to be configured at all). **Not** an error —
     this is the ordinary "no upstream configured" case, determined by
     config-key absence, not by any ref resolution having been attempted.
   - **One merge value:** identical to this specification's existing,
     already-correct behavior — that one, complete, NUL-delimited value
     is used directly, with no ambiguity.
   - **Multiple merge values:** BR3 uses the **same** merge entry Git's
     own `@{upstream}` shorthand represents — **verified against BR3's
     supported Git floor to be the first configured value** (the
     reproduction above; `refs/heads/foo`, the first of the two
     configured values, not the last) — so `mergeRef` is derived from
     that **first** NUL-delimited `--get-all` record specifically, never
     the last (bare `--get`'s behavior) and never an arbitrary/unspecified
     pick among the set. This is what makes `UpstreamInfo.mergeRef`/
     `.branch`, `UpstreamInfo.ref`, and `UpstreamInfo.sha` — the latter
     two derived via `@{upstream}` in step 2, which Git itself already
     resolves against this same first value — describe the **same**
     upstream, consistently, in every case.

   Once the first `.merge` value (for the single- or multi-valued case
   alike) is identified, BR3 has the remote name (from
   `branch.<branch>.remote`, e.g. `origin` or `.`) and the merge ref —
   from which `UpstreamInfo.mergeRef` is populated with that **exact,
   complete, unaltered** value (§7a, Round 13 review finding #3 —
   never shortened, never assumed to be a branch name, whatever its
   actual namespace: `refs/heads/main`, `refs/tags/v1`, and
   `refs/custom/foo` are all preserved verbatim). `UpstreamInfo.branch`
   is then derived, separately, **only** when `mergeRef` genuinely
   begins with the literal prefix `refs/heads/` — in that case `branch`
   is the remainder of the string after that prefix (e.g. `"main"` for
   `mergeRef: "refs/heads/main"`); for any other `mergeRef` namespace
   (`refs/tags/...`, `refs/custom/...`, or anything else), `branch` is
   `null` — BR3 never calls a tag or a custom-namespace ref a "branch."
   The `ref` field reported to callers (§7a) remains the resolved
   tracking ref **as Git itself resolves it** — see step 2, not a
   BR3-constructed path, and (as already established) never re-derived
   from a different merge entry than the one `mergeRef` itself names.
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
     - **Non-branch local upstream target — new, mandatory, Round 13
       review finding #3; `sha`'s exact meaning corrected, mandatory,
       Round 14 review finding #2.** `branch.<name>.remote = "."` does
       not require the configured `.merge` target to itself be a
       branch — Git equally supports a local tag or an arbitrary local
       ref namespace as the configured upstream. **Verified directly:** a
       real repository with `branch.<current>.remote = "."` and
       `branch.<current>.merge = refs/tags/v1` — `git rev-parse
       --symbolic-full-name --verify -q --end-of-options
       '<current>@{upstream}'` successfully resolves to `refs/tags/v1`,
       with the SHA resolving correctly too; the identical mechanism
       succeeds equally for an arbitrary `refs/custom/foo` namespace.
       In both cases `ref` is the exact, faithfully-resolved target
       (`refs/tags/v1`/`refs/custom/foo`), and `UpstreamInfo.mergeRef`
       (step 1) already preserves the identical, unshortened configured
       value — `UpstreamInfo.branch` is correctly `null` for both, since
       neither target lives under `refs/heads/` (§7a). **`sha` is the
       raw object ID `git rev-parse --verify -q --end-of-options
       <branch>@{upstream}` itself returns — never assumed to be a
       commit SHA for these non-branch cases.** For `v1` created as a
       genuine **annotated** tag (`git tag -a`), the raw SHA is the
       **annotated tag object's own SHA** — verified directly to differ
       from `git rev-parse '<current>@{upstream}^{commit}'`'s peeled
       commit SHA, a command BR3 never runs. For a **lightweight** tag
       (a plain ref with no tag object), the raw SHA already is the
       commit SHA it points at directly — not a special case in the
       command, merely a property of that particular target. For an
       arbitrary `refs/custom/foo` namespace pointing at any object type
       (commit, tag, tree, or blob), the raw SHA is faithfully returned
       exactly as Git resolves it, with BR3 never asserting or assuming
       the object's type. See §10's dedicated `UpstreamInfo.sha` exact-meaning
       correction for the complete, namespace-general definition that
       applies uniformly to every subcase in this section.

     **This is the entirety of what "upstream SHA" means in BR3, for
     any subcase** — the SHA `@{upstream}`'s own already-resolved
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

**§10's `UpstreamInfo` shape — reconciled with §7a's Round 13
`UpstreamInfo` interface, mandatory, Round 14 review finding #3 (this
section had fallen stale after Round 13 updated §7a's interface to add
`mergeRef` and make `branch` nullable; §10 still described the earlier,
superseded `{ remote, ref, branch, sha }` shape and claimed
`remote`/`branch` "remain populated" for every configured-but-unresolvable
upstream — no longer universally true now that `branch` is deliberately
`null` for any `mergeRef` outside `refs/heads/*`). There is exactly
**one** authoritative `UpstreamInfo` shape in this specification —
defined once in §7a, restated identically (never abbreviated in a way
that omits `mergeRef` without saying so) everywhere else it appears:**

- **No upstream configured** (`branch.<b>.remote`/`.merge` config keys
  both absent — including, as one way this can happen, a repository with
  no remotes defined at all): `upstream: null`. Not an error.
- **Upstream configured, `@{upstream}` resolves:** `upstream: { remote,
  mergeRef, branch, ref, sha }`, where `mergeRef` is the exact, complete,
  first configured `branch.<b>.merge` value verbatim (§7a, §9, Round 9
  review finding #2's first-value semantics, Round 13 review finding #3's
  namespace-preserving contract), `branch` is `string | null` — populated
  only when `mergeRef` genuinely begins with the literal prefix
  `refs/heads/`, `null` for any other target namespace (a local tag, a
  custom-namespace ref, or anything else outside `refs/heads/*`) — `ref`
  is whatever symbolic full name `@{upstream}` itself resolves to
  (honoring custom fetch refspecs and the `remote="."` local-upstream
  case — see §9's corrected method) — never a BR3-constructed
  `refs/remotes/<remote>/<branch>` guess — and `sha` is the raw object ID
  `git rev-parse --verify -q --end-of-options <branch>@{upstream}`
  reports, defined exactly once, precisely, and namespace-generally —
  see the dedicated "`UpstreamInfo.sha` — exact meaning" correction below
  (mandatory, Round 14 review finding #2).
- **Upstream configured, `@{upstream}` fails to resolve (revised —
  corrects Round 3 review finding #3; `branch`'s nullability corrected,
  Round 14 review finding #3):** `upstream: { remote, mergeRef, branch,
  ref: null, sha: null }` — `remote`/`mergeRef` remain populated
  (config-key presence, independent of resolvability); `branch` remains
  populated **only when** `mergeRef` genuinely begins with
  `refs/heads/` — it is `null` whenever the configured target is outside
  that namespace, exactly as in the resolves-successfully case above,
  since `branch`'s nullability is purely a function of `mergeRef`'s
  namespace, never of resolvability. `ref` is `null`, **not** a
  fallback-constructed `refs/remotes/<remote>/<branch>` guess (an earlier
  draft of this specification used exactly that guess as a "best-effort
  label"; it is removed because it is simply false whenever the
  unresolvable upstream is a custom-refspec or local-branch upstream,
  neither of which has a real target anywhere under
  `refs/remotes/<remote>/<branch>`) — since Git itself has nothing to
  resolve in this case, BR3 reports that truthfully as `null` rather than
  presenting a guess as fact. **Unborn status of the current branch is
  never, by itself, a reason resolution is treated as having failed —
  see §9's corrected decision table (Round 14 review finding #1); this
  case is reached only by a genuine `@{upstream}` resolution failure,
  regardless of whether the current branch has any commits.**
- **Upstream is a local branch** (`branch.<name>.remote = "."`): fully
  supported, not a distinct case from BR3's caller's point of view —
  `@{upstream}` resolves such a configuration correctly (verified in
  §9), reporting `ref: refs/heads/<other-branch>` (a **local-branch
  upstream**, per §9's terminology — this SHA is a plain local branch
  ref's tip, never a remote-tracking ref, and this case requires no
  remote to be configured at all) and `sha` from that local branch's own
  current tip. `remote` is reported exactly as Git config stores it (the
  literal string `.`), since BR3 reports facts as Git records them rather
  than translating `.` into some other sentinel. `mergeRef` is the exact
  configured `refs/heads/<other-branch>` value; `branch` is populated
  (`<other-branch>`) since this target genuinely is under `refs/heads/`.
- **Upstream target is not a branch** (`mergeRef` outside `refs/heads/*`
  — e.g. a local annotated/lightweight tag, `branch.<name>.merge =
  refs/tags/v1`, or any other custom-namespace ref, `branch.<name>.merge
  = refs/custom/foo`): fully supported. `mergeRef` is the exact
  configured value verbatim; `branch` is `null` (this target is not a
  branch, and BR3 never mischaracterizes it as one, §7a Round 13 review
  finding #3); `ref` is the symbolic full name `@{upstream}` resolves to
  when resolution succeeds (`refs/tags/v1`, `refs/custom/foo`, verbatim);
  `sha` is the raw object ID `@{upstream}` resolves to — see the exact
  meaning correction immediately below, mandatory, Round 14 review
  finding #2.
- **HEAD is detached:** `upstream: null` unconditionally — detached HEAD
  has no branch, and only branches have configured upstreams.

**`UpstreamInfo.sha` — exact meaning, corrected, mandatory, Round 14
review finding #2 (an earlier draft of this section described the tag
case's `sha` as the target's "resolved commit," which is false for the
exact, bare `rev-parse` command this specification requires; do not call
this field a "commit SHA," "branch tip commit," or "resolved commit"
unless that statement is specifically scoped to a `refs/heads/*` or
ordinary remote-tracking-branch case, where the target genuinely is a
ref that points directly at a commit).** `sha` is defined, for every
supported `mergeRef` namespace, as exactly and only:

> **The raw SHA-1 object ID returned by
> `git rev-parse --verify -q --end-of-options <branch>@{upstream}`** —
> the object ID the resolved upstream ref *itself currently records*,
> with no additional peeling, dereferencing, or commit-resolution step
> performed beyond what that exact, bare command itself does.

This is **not guaranteed to identify a commit object** whenever
`mergeRef`/`ref` names a non-branch ref — BR3 performs no `^{commit}`
peel, and never silently changes this into one. **Verified
reproduction:** for a local **annotated** tag target
(`branch.<current>.merge = refs/tags/v1`, `v1` created via `git tag -a`,
a genuine annotated tag object distinct from the commit it points at),
`git rev-parse <current>@{upstream}` returns the **annotated tag
object's own SHA** — a different object ID than
`git rev-parse '<current>@{upstream}^{commit}'`, which returns the
**peeled commit SHA**. BR3's documented command is the former, never the
latter; `UpstreamInfo.sha` for this case is therefore the tag object's
SHA, not the commit it points at. For a **lightweight** tag (a plain ref
with no tag object of its own), the raw SHA and the commit SHA are
identical, since a lightweight tag ref points directly at the commit —
this is not a special case in the command, merely a case where the raw
object ID happens to already be a commit ID. For an arbitrary
`refs/custom/foo` target, the raw SHA is faithfully returned regardless
of what kind of object it names (commit, tag, tree, or blob) — BR3
reports whatever object ID Git's own bare `rev-parse` resolves to,
truthfully, without assuming or asserting the object's type. This
preserves BR3's long-standing meaning for the ordinary `refs/heads/*`
case — "the already-recorded local upstream SHA" — without inventing a
commit-peel the documented command does not perform. **If a future BR3
phase needs a guaranteed-commit upstream SHA, that must be a separately
named, separately defined field or a later API decision — this
correction does not introduce one, and `sha` must never be silently
redefined into a commit peel.**

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
with a pre-invocation discovery-and-refuse gate; further revised —
corrects Round 9 review finding #1, pinning rename-search-limit
semantics; further revised — corrects Round 16 review finding #2,
pinning `status.showStash`):**

```
git -c core.fsmonitor= -c status.renameLimit=0 -c status.showStash=false status --porcelain=v2 -z --find-renames=50% --untracked-files=all --ignore-submodules=none
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
globally-defined driver). The `-c core.fsmonitor=`, `-c
status.renameLimit=0`, and `-c status.showStash=false` overrides are
always present, unconditionally, for both the superproject and every
initialized submodule Git itself inspects internally during this call.
This exact invocation — verified to accept all six `status`-level flags
together without error — is what §18 (process execution safety), §19
(determinism), §20 (test plan), and §27 (independent review) all
reference; no section states a different or partial form of this
command. Each `status`-level flag is individually required, not
incidental:

- **`-c status.showStash=false` — new, mandatory, Round 16 review finding
  #2.** Repository-local config `status.showStash=true` causes Git's
  porcelain v2 `status` output to include an additional, non-path header
  record — `# stash <N>\0` — reporting the current stash count, which
  is **not** one of the path/status record shapes §11's parser contract
  otherwise recognizes. **Verified directly:** a fixture repository with
  one real stash entry and repository-local `status.showStash=true` set
  — BR3's exact, pre-correction `status` invocation genuinely emits a
  `# stash 1\0` record interleaved with the ordinary NUL-delimited
  path/status records. Since BR3's public `WorkingTreeStatus`/
  `WorkingTreeEntry` model (§7a) has no representation for stash state at
  all, and this specification's own parser contract treats any
  unrecognized porcelain v2 record shape as `MALFORMED_GIT_OUTPUT` (§13,
  §17), an ordinary, repository-local config setting a caller does not
  control — and BR3 never authors — could otherwise cause a
  perfectly healthy repository to fail working-tree inspection entirely.
  `-c status.showStash=false` (a per-invocation `-c` override, the
  identical mechanism already used for `core.fsmonitor`/
  `status.renameLimit`) unconditionally suppresses the `# stash` header
  record regardless of what `status.showStash` a repository's local
  config declares, restoring deterministic, stash-count-independent
  behavior — the simpler, v0.1-appropriate design, chosen over teaching
  the parser to additionally recognize and discard an unmodeled `#`
  header record, since stash state is not, and is not planned to become,
  part of BR3's public contract.
- **`-c status.renameLimit=0` — new, mandatory, Round 9 review finding
  #1.** A fixed `--find-renames=50%` similarity threshold alone does
  **not** make rename classification deterministic: Git separately caps
  how many candidate paths its rename-detection algorithm will
  exhaustively compare via `status.renameLimit` (defaulting to
  `diff.renameLimit`'s own value when `status.renameLimit` is itself
  unset), and once that limit is exceeded, Git intentionally abandons
  exhaustive rename pairing and reports the affected paths as plain
  delete+add facts instead of renames — **regardless of** how similar
  those paths actually are, and **regardless of** BR3's own
  `--find-renames=50%` flag, which only ever governs the *similarity
  threshold*, never the *search-space limit*. **Verified directly:** a
  fixture repository containing four renamed paths at ~90% similarity
  (safely above the 50% threshold) — with `status.renameLimit=1` set as
  repository-local config, BR3's exact (pre-correction) `status`
  invocation reports all four as independent delete+add pairs, never as
  renames; with `status.renameLimit=0` (Git's own documented "no limit,
  always exhaustive" sentinel value) set instead, the identical
  repository correctly reports all four as renames. **A repository-local
  config value BR3 does not control was therefore able to silently
  change BR3's own reported facts** — exactly the kind of
  environment-dependent behavior §19's determinism guarantee exists to
  eliminate, previously unaddressed because only the *threshold*
  (`--find-renames`), never the *limit* (`renameLimit`), had been pinned.
  `-c status.renameLimit=0` mandates Git's exhaustive rename search
  unconditionally, per-invocation (the identical per-invocation `-c`
  override mechanism §18 already uses for `core.fsmonitor`/filter
  refusal — not an environment variable, since `status.renameLimit` has
  no `GIT_*`-prefixed environment-variable equivalent), overriding
  whatever `status.renameLimit`/`diff.renameLimit` a repository's local
  config declares. **BR3 v0.1's chosen rename-limit policy: unlimited,
  exhaustive rename detection, always** — the simpler, fully
  deterministic contract (no repository-size-dependent silent
  degradation to delete+add), consistent with this specification's
  existing preference for explicit, non-config-dependent flags over
  implicit defaults (mirroring `--untracked-files=all`'s identical
  rationale, above).

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
| `1 <XY> <sub> ...` / `2 <XY> <sub> ...` / `u <XY> <sub> ...` — every porcelain v2 record type that carries the dedicated `<sub>` field, not type `1` alone — where `<sub>` is `S<c><m><u>` (a separate, dedicated field, present at its own fixed position in each of these three record types — never inside `<XY>` itself; see §11's submodule-field correction, Round 13 review finding #4B, extended to types `2`/`u`, Round 16 review finding #3B) | (combined with the base kind(s) derived from `<XY>` above, per record type) `submodule` populated per §11's submodule handling on **every** `WorkingTreeEntry` the source record produces |

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

**Submodule state — field layout corrected, mandatory, Round 13 review
finding #4B (an earlier draft of this document inconsistently described
the submodule marker's location: one table row said "in the XY field,"
this prose said "the XY-adjacent field" — neither is precise, and the
first is actively wrong).** Porcelain v2's ordinary-changed-entry record
(type `1`) has a fixed sequence of **distinct, separate, space-delimited
fields**, of which `<XY>` (the two-character staged/unstaged status
pair this section's earlier state-matrix discussion already covers in
full) and `<sub>` (the four-character submodule marker,
`S<c><m><u>` when the path is a submodule, or the literal `N...` when it
is not) are two of those separate fields — `<sub>` is never nested
inside, searched for within, or otherwise parsed out of `<XY>` itself;
they are two independent fields in the record's own fixed layout.
**Verified directly, a real dirty-submodule porcelain v2 record:**
```
1 .M S.M. <mode_H> <mode_I> <mode_W> <hH> <hI> <path>
```
— here `.M` is `<XY>` (unstaged-modified, ordinary type-1 meaning,
exactly as the earlier state matrix defines) and `S.M.` is the
**separate** `<sub>` field, immediately following `<XY>` as its own,
independent token — never a substring BR3 must search for or extract
from within `<XY>`'s own two characters. BR3's parser reads `<sub>` as
its own, dedicated field position in the record (after the mode/hash
fields already established elsewhere in this document's field-by-field
parsing description), decoding `S<c><m><u>` into `SubmoduleState {
commitChanged, hasUntrackedContent, hasModifiedContent }` and attaching
it to the relevant entry's `submodule` field, precisely when `<sub>`'s
first character is `S` (never `N`, the not-a-submodule sentinel). BR3
surfaces this because porcelain v2 provides it essentially for free (no
extra command), but does **not** recurse into the submodule itself for
BuildRail's *own* higher-level inspection — that would require a
second, separate `resolveRepository`/`inspectWorkingTree` call by the
*caller*, against
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

**`<sub>` is present on, and must be parsed from, every record type that
carries it — type `1`, type `2`, and unmerged `u` — never type `1`
alone — corrected, mandatory, Round 16 review finding #3B (an earlier
draft of this section's normative parsing contract was written centered
on type-1 records only, leaving type-2 and `u` records' own `<sub>`
field unaddressed).** Porcelain v2's dedicated `<sub>` field is not
type-1-exclusive — Git's own documented record layout places it at a
fixed position in type-2 (rename) and unmerged (`u`) records as well,
independently of `<XY>` exactly as already established for type-1 above.
**Verified directly, two further real record shapes:**
```
2 RM S.M. ... R100 renamed\0sub\0
```
(a **dirty submodule with a staged rename** — the submodule path itself
was renamed, and its child working tree independently carries an
unstaged content modification), and
```
u UU SC.. 160000 160000 160000 160000 <sha1> <sha2> <sha3> sub
```
(a **conflicted gitlink** — an unmerged submodule reference, §18's Round
16 review finding #3A dedup correction governs its *enumeration*
identity; this bullet governs its *status-record* `<sub>`-field parsing,
a separate concern). In both cases, `<sub>` occupies its own fixed field
position in the record, decoded via the identical `S<c><m><u>`/`N...`
rule already established for type-1 records — never searched for inside
`<XY>`, never assumed absent merely because the record is type `2` or
`u`.

**One porcelain record producing more than one `WorkingTreeEntry` —
exact `SubmoduleState` attachment rule, new, mandatory, Round 16 review
finding #3B.** A single source record can emit multiple
`WorkingTreeEntry` objects (the combined type-2 XY matrix above, §8
review finding #1B — e.g. `2 RM` emits both `staged_rename` and
`unstaged_modify`). **The decoded `SubmoduleState` belongs to the path
the source record describes, not to only one X/Y axis of that record —
BR3 attaches the identical, single decoded `SubmoduleState` to every
`WorkingTreeEntry` the source record produces whose `path` is that
submodule path.** For the example above, `2 RM S.M. ... R100
renamed\0sub\0` decodes `<sub>` once (`S.M.` →
`{ commitChanged: false, hasUntrackedContent: false, hasModifiedContent:
true }`) and attaches that **same** decoded value to **both** the
resulting `staged_rename` entry and the resulting `unstaged_modify`
entry — never decoded twice, never attached to only one of the two, and
never split or partitioned across the X/Y axes. This is consistent with
`SubmoduleState`'s own public contract (§7a): `submodule?: SubmoduleState`
is a property of the path's **current, overall submodule state** as Git
itself reports it for that one record, not a property scoped to a single
status axis — a caller reading either emitted entry for that path sees
the identical, correct submodule state regardless of which axis-derived
entry they inspect.

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
for every BR3 invocation.** §18's shared exec helper must call
`execFile` with `encoding: "buffer"` (equivalently, `encoding: null`)
for **every** BR3 Git invocation, without exception — including every
`resolveRepository` plumbing call, not merely `inspectWorkingTree`/
`inspectDiff`. **Two output categories, decoded differently — corrected,
mandatory, Round 10 review finding #1 (an earlier draft of this section
incorrectly claimed ref names are "guaranteed ASCII," which is false):**
- **Category 1 — fixed machine tokens:** a closed, small set of outputs
  whose *entire grammar* is fixed by Git's own plumbing contract, never
  by repository content — a 40-hex-character SHA-1 object ID, the
  literal string `true`/`false` (`--is-bare-repository`), the literal
  string `sha1`/`sha256` (`--show-object-format`), a status-letter
  character (`A`/`M`/`D`/`R`/`T`/`C`), a similarity score's digits, the
  fixed, BR3-supplied `check-attr` attribute-name field (always the
  literal `filter`, since that is the only attribute BR3 ever requests).
  These are validated against their exact, fixed ASCII grammar (e.g. a
  regex anchoring the full string, `/^[0-9a-f]{40}$/` for a SHA) — a
  value outside that grammar is `MALFORMED_GIT_OUTPUT`, never a
  plain-ASCII decode assumption. A `Buffer.prototype.toString("utf-8")`
  (or equivalently, a plain ASCII/hex-digit check on the raw bytes
  directly, without any decode step at all) is exact and lossless for
  these specific outputs precisely *because* their value is
  independently, exactly grammar-validated — not because Git guarantees
  every plumbing output is ASCII in general, which it does not.
- **Category 2 — repository-controlled text:** any output whose actual
  *content* is determined by the repository (or its configuration), not
  by a fixed Git-plumbing grammar — a symbolic ref name (`symbolic-ref`),
  a branch name, `@{upstream}`'s resolved symbolic full name, `git
  config --get`/`--get-all` values for `branch.<b>.remote`/`.merge`,
  `--show-toplevel`/`--git-dir`/`--git-common-dir` output (a filesystem
  path, which — like the working-tree paths §13 already treats
  strictly — is not guaranteed ASCII either), and any other
  repository/config-controlled textual identifier BR3's public API
  exposes as a JS string. **Git genuinely permits non-UTF-8 bytes in a
  ref name** — verified directly against Git 2.47.3: a ref name
  containing the raw byte `0xFF` is accepted by `git check-ref-format`,
  successfully created via `git update-ref`, successfully pointed to by
  `HEAD` via `git symbolic-ref`, and both `git symbolic-ref -q HEAD` and
  `git rev-parse --verify -q HEAD^{commit}` succeed against it — this is
  not a malformed-command-output edge case; it is ordinary,
  Git-supported ref-name behavior BR3's own supported floor exhibits.
  Category 2 outputs are decoded with the **identical** strict decoder
  §13 already establishes for working-tree/diff paths —
  `new TextDecoder("utf-8", { fatal: true })` — applied to the raw byte
  range Git actually returned, never a lossy default decode. Valid
  UTF-8, including non-ASCII Unicode (e.g. a branch literally named
  `café`), is supported exactly, round-tripping losslessly; invalid
  UTF-8 produces `MALFORMED_GIT_OUTPUT` for the containing operation,
  never a silent U+FFFD substitution. **This generalizes, rather than
  duplicates, the path-byte discipline §13 already establishes** — it is
  the identical strict-decode mechanism applied to every
  repository-controlled textual output, not a second, separate lossy
  policy invented for non-path values.

The resulting pipeline for the path-bearing (`inspectWorkingTree`/
`inspectDiff`) case specifically is:

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
   end-of-options marker) left open). **BR3 never adds a bare `--`
   alongside `--end-of-options` — corrected, mandatory, Round 15 review
   finding #4 (an earlier draft's own "Verified directly" example used
   exactly that combination, `--end-of-options -- '...'^{commit}`, which
   is a genuinely different, and broken, invocation shape: the bare `--`
   there is not a substitute or reinforcement for `--end-of-options`, and
   combining them causes `rev-parse` to fail even against a **valid**
   ref, which means that example proved nothing about option-safety — it
   merely used a command shape that also fails for legitimate input).**
   Verified directly (a genuinely valid, option-shaped branch name,
   created via plumbing to guarantee it is real and resolvable, not a
   nonexistent string):
   ```
   $ git checkout -q -b main2 && git commit --allow-empty -q -m x
   $ COMMIT_SHA=$(git rev-parse HEAD)
   $ git update-ref refs/heads/-foo "$COMMIT_SHA"
   $ git rev-parse --verify '-foo^{commit}'
   fatal: ambiguous argument '-foo^{commit}': unknown revision or path not in the working tree.
   # exit 128 — bare --verify alone misparses -foo as an option
   $ git rev-parse --verify --end-of-options '-foo^{commit}'
   <COMMIT_SHA>   # exit 0 — succeeds, resolves the real, valid ref
   $ git rev-parse --verify --end-of-options -- '-foo^{commit}'
   fatal: Needed a single revision   # exit 128 — FAILS even though
                                       # -foo is a genuinely valid,
                                       # existing ref; proves the bare
                                       # `--` combination is wrong for
                                       # this invocation shape, not a
                                       # stronger safety measure
   ```
   This is stronger evidence than a nonexistent, merely option-shaped
   string (e.g. `--upload-pack=x`, retained below purely as an
   additional, independent rejected-input case, never as the
   option-safety proof itself): it demonstrates BR3's exact, normative
   command (`--end-of-options`, with **no** additional bare `--`)
   correctly accepts a **genuinely valid** option-shaped ref rather than
   merely rejecting an invalid one, which a broken command shape could
   also do for the wrong reason. If either resolution fails: `REF_NOT_FOUND`,
   with `details` naming which of the two refs failed. **This validation
   happens before any diff command runs at all** — per §19's requirement
   that caller-provided refs never become arbitrary Git options.
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
   further revised — corrects Round 6 review finding #1 (withdrawn),
   then Round 9 review finding #5 (the filter-scan gate is removed
   entirely from `inspectDiff` — see below); further revised — corrects
   Round 9 review finding #1, pinning rename-search-limit semantics;
   further revised — corrects Round 15 review finding #1, pinning
   submodule/gitlink visibility; `core.fsmonitor` is not relevant to
   `diff`, which does not consult it):**
   `git diff --no-color --no-ext-diff --ignore-submodules=none -z
   --name-status --find-renames=<threshold> -l0 <fromSha> <toSha>`
   (threshold per §14). `--name-status` (not the default patch format)
   gives exactly a status-letter-plus-path(s) record per changed file,
   `-z` NUL-delimits records and (for renames) the two-path pairs within
   a record.
   - **`--ignore-submodules=none` — new, mandatory, Round 15 review
     finding #1.** The identical repository-local-config hazard §11
     already documents and defends against for `inspectWorkingTree`
     (`--ignore-submodules=none` there) applies equally to `inspectDiff`
     and was, until this correction, left unpinned here: Git's
     `diff.ignoreSubmodules` config value (independently of
     `--ignore-submodules` on the command line, which was previously
     omitted from this exact invocation) can suppress a changed
     gitlink/submodule path from `diff --name-status` output entirely.
     **Verified directly:** a fixture repository containing a gitlink
     whose recorded submodule commit changes between commit A and commit
     B — under the ordinary, pre-correction BR3 `diff` invocation (no
     `--ignore-submodules` flag at all), the changed gitlink path is
     correctly reported (`M\0sub\0`); with repository-local config
     `git config diff.ignoreSubmodules all` set, the identical,
     unmodified pre-correction command instead emits **nothing** for
     that path — a real, deterministic-fact failure: repository-local
     configuration BR3 does not control silently removes a changed path
     from `DiffResult`, exactly the kind of environment-dependent
     behavior §19's determinism guarantee exists to eliminate. Adding
     `--ignore-submodules=none` to the command line restores the correct
     `M\0sub\0` report regardless of what `diff.ignoreSubmodules`
     (or `submodule.<name>.ignore`) a repository's local config
     declares — the command-line flag always takes precedence over the
     config default. This mirrors `inspectWorkingTree`'s already-correct,
     identical `--ignore-submodules=none` policy (§11) exactly: `diff`
     must report gitlink changes between its two committed trees
     unconditionally, since `inspectDiff`'s own contract (§2, §7a) makes
     no distinction between an ordinary file change and a submodule
     pointer change — both are real, deterministic facts about what
     differs between `fromSha` and `toSha`, and neither may be silently
     suppressed by config BR3 does not author.
   - **`-l0` — new, mandatory, Round 9 review finding #1.** The
     identical `diff.renameLimit`/`status.renameLimit` hazard §11
     documents for `inspectWorkingTree` applies equally to `inspectDiff`
     — a repository-local `diff.renameLimit` below the actual number of
     renamed-pair candidates causes Git to abandon exhaustive rename
     pairing and report affected paths as plain `added`/`deleted` facts
     instead of `renamed`, regardless of `--find-renames`'s similarity
     threshold. `-l0` (`diff`'s own short-flag form of "no limit, always
     exhaustive," equivalent to `-c diff.renameLimit=0`) mandates
     Git's exhaustive rename search unconditionally, per-invocation,
     overriding whatever `diff.renameLimit` a repository's local config
     declares — the identical "unlimited, exhaustive, always" v0.1
     policy §11 establishes for `inspectWorkingTree`, applied
     consistently here so the two functions' rename-detection behavior
     can never silently diverge based on repository-local
     `renameLimit`-family config any more than it already cannot diverge
     based on threshold.
   - **No mandatory pre-invocation filter-attribute scan for
     `inspectDiff` — corrected, Round 9 review finding #5 (removes a
     genuine contradiction an earlier draft of this specification
     contained).** An earlier draft required the identical `check-attr`-based
     effective-filter-attribute scan (§18, originally introduced for
     `inspectWorkingTree`'s `status` invocation) to gate `inspectDiff`
     as well, before this `diff` invocation could run. **This
     contradicted this specification's own, already-stated
     `inspectDiff` contract** — "operates purely on two
     already-committed refs/SHAs and never considers uncommitted
     working-tree state" (§2) — since the `check-attr` scan reads the
     **current, live working-tree/index/`.gitattributes` state**, not
     the two already-resolved commits `fromSha`/`toSha` name: an
     unrelated `.gitattributes` change made to the working tree *after*
     both commits already exist could cause `inspectDiff(A, B)` to
     refuse with `EXTERNAL_GIT_FILTER_UNSUPPORTED` even though commits
     `A` and `B` themselves are completely unaffected by that change —
     a real violation of `inspectDiff`'s own stated independence from
     working-tree state, not merely a cosmetic inconsistency.
     **Verified directly** that this gate is unnecessary in the first
     place: a fixture with a `.gitattributes` rule assigning a real,
     marker-writing clean filter, and two real commits whose diff this
     exact `git diff --no-color --no-ext-diff --ignore-submodules=none
     -z --name-status --find-renames=<threshold> -l0 <fromSha> <toSha>`
     invocation computes — the marker script is **never invoked**, and
     the `--name-status` result is correct, for the same reason `--no-ext-diff`
     already, separately, defends against a different external-tool
     class: a commit-vs-commit `diff --name-status` compares **already-stored
     Git objects** (the two commits' own tree/blob contents), which
     requires no working-tree content canonicalization at all — the
     clean-filter hazard §18 documents is specifically a
     working-tree-vs-index/working-tree-vs-blob *content-comparison*
     hazard (`status`'s stat-cache-invalidation re-run, or a genuine
     working-tree content difference), neither of which a pure,
     both-sides-already-committed `diff` invocation ever performs.
     **`inspectDiff` therefore has no dependency on current working-tree/
     index/`.gitattributes` state of any kind** — not for filter
     detection, and (already established elsewhere in this
     specification) not for anything else either. The exact ownership,
     stated explicitly to prevent this contradiction from recurring:
     - **`resolveRepository`:** repository validation only — never
       refuses for a content-filter reason merely because some
       repository path happens to carry a `filter` attribute; that fact
       is irrelevant to whether `projectRoot` is a valid, inspectable
       repository.
     - **`inspectHead`:** HEAD/upstream facts only — no content-filter
       refusal; nothing it reads is a content-comparison operation.
     - **`inspectWorkingTree`:** the mandatory effective-filter-attribute
       scan (§18) gates this function's `status` invocation, exactly as
       already specified — working-tree content comparison is precisely
       where the clean-filter hazard is real.
     - **`inspectDiff`:** commit-vs-commit only, gated by nothing beyond
       the two ref-resolution steps above and the rename-limit pinning —
       no current-index/current-working-tree filter dependency, since no
       real, reproduced Git-invoked-external-helper hazard has been
       found for this exact, both-sides-committed invocation shape. A
       future correction round may revisit this if a genuine, verified
       hazard for this specific invocation shape is ever independently
       reproduced — this specification does not add a mitigation for a
       hazard it cannot demonstrate is real.
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
| `GIT_EXECUTABLE_UNAVAILABLE` | Either (a) the `git` binary could not be spawned (`ENOENT` or equivalent from the underlying `child_process` call), or (b) — corrected, Round 11 review finding #2, candidate validity made exact Round 12 review finding #2 — BR3's own in-process executable-resolution mechanism (§8) found no valid `git` candidate at all before ever attempting to spawn one: on POSIX, no candidate anywhere in the effective search path (`PATH`'s value when present; `/usr/bin:/bin` when `PATH` is absent — Round 11 review finding #1) that is simultaneously (i) present, (ii) a regular file after symlink resolution — never a directory, FIFO, socket, device node, or broken symlink, and (iii) executable; on Windows, no candidate anywhere in the sanitized `PATH` that is simultaneously (i) literally named `git.exe` (never `.cmd`/`.bat`/`.com`/any other name) and (ii) a non-directory, regular-file executable target after resolution — never a directory or broken link — with an invalid candidate at one `PATH` entry never terminating the search while a later, valid candidate exists further down `PATH` — this is the single, exact typed outcome for "no usable Git executable," never an alternative, implementation-chosen code | Expected — a real, anticipated environment condition (Git not installed / not resolvable under the applicable search path); always a typed `GitResult` failure, never an uncaught exception |
| `GIT_VERSION_UNSUPPORTED` | **New — Round 6 review finding #3.** The installed `git` binary spawns successfully but reports a version below BR3's supported floor (2.45.0), or `git --version`'s output does not match the expected `git version X.Y.Z` prefix shape at all (§8's "Git Capability Floor" subsection) — checked before any other `resolveRepository` step | Expected — distinct from `GIT_EXECUTABLE_UNAVAILABLE` (binary not found at all vs. found and run, but too old/unrecognized); `details` names the actual reported version string |
| `PROJECT_ROOT_NOT_FOUND` | `projectRoot` does not exist or is not a directory | Expected |
| `NOT_A_GIT_REPOSITORY` | **Revised — corrects Round 4 review finding #4, further revised — corrects Round 5 review finding #4 and Round 6 review findings #5 and #7, further revised — corrects Round 16 review finding #4 (ancestor-chain discovery).** `git rev-parse --is-bare-repository` (§8 step 2) fails **and** the filesystem-based secondary check (§8) confirms **neither** candidate repository shape is present at `projectRoot` itself — `<projectRoot>/.git` does not exist (non-bare shape) **and** `projectRoot` itself lacks the `HEAD`+`objects/`+(`refs/` or `reftable/tables.list`) bare-repository-root shape (bare shape, either ref backend) — **and** no plausible non-bare repository marker is found anywhere in `projectRoot`'s own ancestor chain up to the filesystem root (§8, Round 16 review finding #4) — i.e. `projectRoot` is genuinely not inside any Git repository, bare or non-bare, under either ref backend, and is not nested inside one either. A `--is-bare-repository` failure where **either** shape **is** present (malformed config, permission failure, dubious ownership) is `GIT_COMMAND_FAILED` instead — see that row and §8. **`--show-toplevel` (§8 step 3) failing after step 2 already succeeded with `false` is no longer classified here at all — corrected, Round 6 review finding #7:** step 2 having already, positively, successfully established that Git recognizes `projectRoot` as a non-bare repository makes "no repository exists here" truthfully unreachable at that point; an unexpected step-3 failure is instead classified as `GIT_COMMAND_FAILED` (see that row) | Expected |
| `PROJECT_ROOT_MISMATCH` | `projectRoot` is inside a real Git repository, but is not that repository's root (§8 step 3) — reserved exclusively for the healthy path, where Git successfully, authoritatively resolves a real `--show-toplevel` that differs from `projectRoot`; **never** used for the case where step 2's own `--is-bare-repository` call fails before any toplevel is established, even when a plausible ancestor repository marker exists — that case is `GIT_COMMAND_FAILED` instead (§8, Round 16 review finding #4) | Expected — `details` names the actual resolved toplevel |
| `BARE_REPOSITORY_UNSUPPORTED` | `git rev-parse --is-bare-repository` reports `true` for `projectRoot` (§8 step 2) | Expected |
| `UNSUPPORTED_OBJECT_FORMAT` | **New — Round 6 review finding #4.** `git rev-parse --show-object-format` (§8 step 5a) reports anything other than `sha1` for `projectRoot` (e.g. `sha256`, for a repository created via `git init --object-format=sha256`) | Expected — BR3 v0.1 supports SHA-1 repositories only, a deliberate scope decision (§8); `details` names the actual reported object format; `resolveRepository` fails before any SHA-producing BR3 function can be reached for that repository |
| `UNSUPPORTED_REF_FORMAT` | **New — Round 7 review finding #1, made fail-closed Round 8 review finding #5.** `git config --get extensions.refStorage` (§8 step 5b) successfully reports any value other than `files` for `projectRoot` (a healthy repository using a ref-storage backend BR3 does not support) — this includes `reftable` **and any other, including future/unrecognized, backend value** the key might report; BR3 v0.1's contract is an allowlist of exactly one supported value (`files`, or the key's ordinary absence), not a denylist of `reftable` specifically | Expected — BR3 v0.1 supports the traditional `files` ref-storage backend only, a deliberate scope decision (§8); `details` contains the actual reported value verbatim; `resolveRepository` fails before any later step is reached for that repository. Distinct from a **malformed** repository (either ref backend), which is `GIT_COMMAND_FAILED` via the post-Git-failure secondary classifier (§8) — this code is reserved for a positively-recognized, *healthy* repository reporting an unsupported format; also distinct from the `extensions.refStorage` query itself failing for a reason other than ordinary key-absence, which is likewise `GIT_COMMAND_FAILED`, never inferred as `files`-backend support (§8) |
| `EXTERNAL_GIT_FILTER_UNSUPPORTED` | **New — Round 6 review finding #1, detection mechanism corrected Round 7 review finding #4, scope narrowed to `inspectWorkingTree` only Round 9 review finding #5, ownership made exclusive and caching removed Round 10 review finding #3.** BR3's repository-effective-attribute scan (`git check-attr --stdin -z filter` over every relevant tracked path, superproject and every initialized submodule recursively — §18) finds at least one path with an active `filter` attribute, run fresh, unconditionally, on **every** `inspectWorkingTree` call — never cached or reused across separate calls — *before* that call's own `status` invocation, which could trigger the corresponding driver — regardless of whether that driver's command definition is repository-local, global/user-level (and therefore otherwise hidden by BR3's own `GIT_CONFIG_GLOBAL`-neutralized inspection environment), or currently undefined. BR3 refuses to proceed rather than execute the external filter or suppress it and risk returning a false working-tree fact (§18). **This code is returned by `inspectWorkingTree` exclusively** — `resolveRepository` never performs this scan and never returns this code merely because a repository's working tree contains an active filter attribute; `inspectHead` never performs it; `inspectDiff` never triggers this scan or returns this code at all (§13, Round 9 review finding #5) — a commit-vs-commit `diff` compares already-stored Git objects and performs no working-tree content canonicalization, so it has no dependency on current working-tree/index/`.gitattributes` state. This guarantee assumes the repository's relevant configuration is not concurrently, adversarially mutated during the brief window between the `check-attr` scan and the subsequent `status` invocation within one call (§18's stated concurrency boundary) | Expected — a real, anticipated repository-configuration condition; `details` names the affected path(s)/attribute value(s); the `status` invocation that could trigger the filter is never run |
| `UNSAFE_SUBMODULE_PATH` | **New — Round 7 review finding #5, extended to cover repository-metadata identity and the parent→child relationship, Round 8 review finding #3, tightened to exclude linked-worktree metadata and the `.git`-entry-itself symlink case, Round 9 review finding #4; explicitly never triggered merely by an unmerged gitlink's multiple index-stage records for one legitimate path, Round 16 review finding #3A.** A gitlink working-tree path (mode `160000` in `git ls-files --stage -z`, §18) discovered during initialized-submodule enumeration is itself a symbolic link (detected via `lstat`, never a symlink-following `stat`); **or** its own `.git` *entry* (one level inside an already-accepted, non-symlinked working-tree directory) is itself a symbolic link; **or** its canonical working-tree root **or** its canonical `(gitDir, gitCommonDir)` metadata identity has already been visited earlier in the same recursive enumeration (a cycle/alias, reachable even when the working-tree roots are themselves canonically distinct — §18 step 4a); **or** its resolved `.git` pointer names a location outside the three explicitly-recognized legitimate parent→child submodule shapes (§18 step 4a) — in particular, a pointer resolving to the parent's own `--git-dir`/`--git-common-dir`, to a location outside the parent's own `--git-common-dir` tree entirely, or to a location beneath the parent's `--git-common-dir` that is nonetheless a linked-worktree metadata directory rather than genuine, self-contained submodule metadata (`gitDir !== gitCommonDir` for the child) | Expected — a real, anticipated adversarial-or-corrupted-repository condition; BR3 fails safely rather than recursing into a symlink-redirected, cyclic, aliased, externally-pointed, or linked-worktree-redirected submodule path, and never recursively inspects the aliased/external/worktree repository before the refusal is produced; `details` names the offending gitlink path |
| `HEAD_UNAVAILABLE` | **Complete, final trigger condition (revised — corrects Round 4 review finding #5, which extended this beyond Round 1's `symbolic-ref`-exit-code-only definition): EITHER (a)** `git symbolic-ref -q HEAD` (§9) exits with a code other than 0 (normal/unborn/corrupt-but-symbolic) or 1 (detached) — verified as exit 128 for genuine `.git/HEAD` corruption — **OR (b)** `git symbolic-ref -q HEAD` succeeds (exit 0) but `git rev-parse --verify -q HEAD^{commit}` fails AND the resolved branch ref name itself (`git rev-parse --verify -q <resolved-ref-name>`, no `^{commit}`) exits 0 — i.e. HEAD is genuinely symbolic and points at a branch ref that exists, but that ref's stored value does not name a real commit object (§9's "corrupt HEAD" case; distinguished from the unborn case, where the same ref-name check exits 1) — **OR (c)** HEAD is direct/detached (`symbolic-ref -q HEAD` exits 1) but `git rev-parse --verify -q HEAD^{commit}` also fails (a detached HEAD pointing at a non-existent object). These three conditions are the exact, complete trigger set §9 defines; there is no fourth, undocumented path to this code | Exceptional — this indicates repository corruption BR3 cannot meaningfully recover from; still returned as a typed `GitResult` failure (never a raw uncaught exception reaching a caller), but callers should treat it as unusual, not routine |
| `REF_NOT_FOUND` | Either `DiffRequest.fromRef` or `.toRef` failed to resolve via `rev-parse --verify --end-of-options <ref>^{commit}` (§13) | Expected — a caller can legitimately pass a ref that doesn't exist (e.g. a stale/mistyped SHA) |
| `GIT_COMMAND_FAILED` | A Git subprocess exited non-zero for a reason not covered by a more specific code above (i.e., the catch-all for a genuine, unanticipated Git failure) — this includes, per §8's Round 16 review finding #4 correction, `resolveRepository`'s step-2 `--is-bare-repository` failure where a plausible non-bare repository marker is found either at `projectRoot` itself or anywhere in its ancestor chain, meaning a real repository genuinely exists but Git could not authoritatively establish a toplevel for it | Expected as a *result shape* (always returned via `GitResult`, never thrown), but the underlying cause is inherently open-ended — `details` carries the captured stderr for diagnosis (or, for the ancestor-marker case, the ancestor path where the marker was found) |
| `MALFORMED_GIT_OUTPUT` | Git's own output did not match the expected machine-readable format this specification defines (e.g. an unrecognized porcelain v2 record type, an unparseable `--name-status` line, a path that is not valid UTF-8, or — corrected, Round 10 review finding #1 — any Category 2 repository-controlled textual value (a ref/branch name, `config --get`/`--get-all` value, `--show-toplevel`/`--git-dir`/`--git-common-dir` output) that is not valid UTF-8 — §13) | Exceptional — this should be unreachable against a conforming Git version and well-formed repository content; exists so a genuinely unexpected format change, a non-UTF-8 path, or a non-UTF-8 ref/branch/config-derived textual value (§13) fails loudly and specifically rather than silently misparsing or substituting U+FFFD |

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
  command string — which structurally forbids shell interpolation of
  BR3's own argv construction. **The precise, honest guarantee — corrected,
  mandatory, Round 13 review finding #1 (an earlier draft overclaimed
  "there is no shell in the invocation path at all," which is false on
  POSIX):** BR3 itself never requests a shell (`shell: true` is never
  passed), never constructs a shell command string, and always supplies
  Git's arguments as a literal argv array to `execFile`'s `command`/`args`
  parameters — this is what "structurally forbids shell interpolation"
  actually, truthfully means: **BR3's own invocation path contains no
  shell**, not "no shell can ever become involved by any means
  whatsoever." **Verified directly**, Node 22.16.0 on Linux: a regular,
  executable text file (`#!`-less — literal shell-script text with no
  shebang line, made executable via `chmod +x`) invoked by its absolute
  path via `execFile(path, [], { shell: false })` succeeds and produces
  the script's own output — Node/libuv's POSIX execution path uses
  `execvp`-family semantics; **attributed precisely, corrected, mandatory,
  Round 14 review finding #5:** the OS kernel itself does not invoke a
  shell — for a non-binary, non-shebang executable text file, the kernel
  merely reports `ENOEXEC` ("exec format error") for the unsuitable
  executable image, and it is the C library's `execvp`-family fallback
  behavior (which libuv's process-spawning path relies on) that may, upon
  receiving that `ENOEXEC` report, itself re-attempt the exec via
  `/bin/sh`. This interpreter fallback happens entirely below Node's own
  `shell: false` contract and outside anything `execFile`'s own
  argument-passing discipline can prevent — BR3 never requests it, and it
  originates in the platform's C-library/libuv execution path acting on a
  kernel-reported condition, never in the kernel performing the fallback
  itself. **A candidate satisfying
  BR3's own resolver rules (§8: exists, a regular file after symlink
  resolution, executable) does not, on its own, prove the OS will treat
  it as a native binary with no interpreter fallback of its own** — this
  is a property of the resolved executable file's own contents and the
  OS's own execution semantics, not something `execFile`'s argv-array
  discipline governs at all. **BR3 therefore does not claim to eliminate
  every conceivable path by which *some* shell or interpreter could ever
  become involved in running the resolved executable — it claims,
  precisely, that BR3's own invocation never requests one and never
  constructs shell-interpretable text.** This is why the resolved Git
  executable is treated as a **trusted environment dependency** (see
  below), not as a target BR3 itself sandboxes against; and it is why
  the *separate*, genuinely different threat this specification's other
  mitigations exist for — repository-controlled data (a
  `.gitattributes` filter, `core.fsmonitor`, an external diff driver)
  causing the *already-trusted* Git binary to itself spawn a
  repository-selected helper — remains fully, independently mandatory
  (§6, §18) regardless of this correction, since that threat does not
  depend on whether the initial Git invocation path contains a shell at
  all.

  **The trust boundary, stated explicitly — new, mandatory, Round 13
  review finding #1:** BR3 verifies the resolved executable's *reported*
  version (§8's Capability Floor) but does **not**, and cannot,
  cryptographically or otherwise authenticate that the resolved
  executable is a genuine, unmodified Git binary — a malicious native
  binary named `git` (or occupying a resolved `git`/`git.exe` pathname)
  can report any `--version` output it chooses, exactly as a script
  could. BR3's actual, defensible guarantees are precisely these, no
  more and no less: (i) BR3 itself never requests a shell or performs
  shell-string interpolation of its own arguments; (ii) Git's arguments
  are always supplied as a literal argv array, never a caller/repository-
  controlled string capable of being reinterpreted as multiple
  arguments or flags (§13's `--end-of-options` protections remain fully
  in force, unaffected by this correction — a caller-supplied ref string
  never becomes shell text *or* a flag-shaped positional argument, for
  entirely separate reasons); (iii) BR3 never falls back to `exec()`,
  `shell: true`, `cmd.exe`, PowerShell, or any other explicit
  shell/interpreter invocation, under any circumstance; and (iv) once
  resolved, BR3 treats the executable at that path as a **trusted
  environment dependency** — BR3 does not guarantee that the trusted Git
  executable itself, its OS-level loader, or its own internal
  implementation never launches a further interpreter or subprocess of
  its own; that is outside what a portable, Node-only, no-shell process
  contract can mechanically verify. **The `command` argument is always the already-resolved,
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
  therefore requests raw `Buffer` output unconditionally — **corrected,
  Round 10 review finding #1: this is not merely "for uniformity" while
  only path-bearing calls are actually at risk** — an earlier draft of
  this bullet claimed ref names, `--show-toplevel`/`--git-dir` output,
  and similar plumbing values are "guaranteed ASCII," which is false:
  Git genuinely permits non-UTF-8 bytes in a ref name (verified directly
  against Git 2.47.3 — a ref name containing raw byte `0xFF` is accepted
  by `check-ref-format`, created via `update-ref`, and successfully
  resolved via `symbolic-ref`/`rev-parse`). §13's byte-semantics
  subsection now defines the complete two-category contract (fixed
  machine tokens — SHAs, `true`/`false`, `sha1`, status letters — vs.
  repository-controlled text — ref names, branch names, `config
  --get`/`--get-all` values, `--show-toplevel`/`--git-dir`/
  `--git-common-dir` output, and every other repository/config-controlled
  textual identifier BR3's API exposes) — Category 2 outputs require the
  identical strict `TextDecoder({fatal: true})` decode §13 already
  applies to working-tree/diff paths, never a plain
  `Buffer.prototype.toString("utf-8")` assumption. See §13 for the
  complete byte-first parsing pipeline and the full category
  definitions.
- **No command-string construction, ever, anywhere in `packages/core/src/git/`.**
  Every Git invocation is `execFile(<resolvedAbsoluteGitPath>,
  [<literal subcommand>, <literal flags>, ...<validated arguments>],
  { cwd: <call-appropriate cwd>, ... })` — **corrected, Round 9 review
  finding #3D:** an earlier draft of this bullet used the bare literal
  string `"git"` as the illustrative `command` argument, predating this
  specification's in-process executable-resolution mechanism (§8's "Git
  Capability Floor" subsection); the actual, current contract is that
  `command` is always the already-resolved, absolute, canonicalized `git`
  executable path that mechanism produces, never the bare literal string
  `"git"` — the argv array's structure (which positions are fixed
  literals vs. which carry caller-supplied values) is fully determined by
  BR3's own code, never assembled via string concatenation/interpolation/template
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
    BR3 must never report a working-tree fact it cannot stand behind as
    true (this hazard is specific to `inspectWorkingTree`'s `status`
    invocation — `inspectDiff` is unaffected, per §13's independence
    correction, Round 9 review finding #5):**
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
       filter helper and (b) always returns faithful working-tree facts
       — for a repository with a real, active clean/process filter,
       these two guarantees are in direct tension for `status`
       specifically (never for `diff` — §13's independence correction,
       Round 9 review finding #5, establishes `inspectDiff`'s
       commit-vs-commit invocation performs no working-tree content
       canonicalization and has no such tension to resolve), and §6's
       "never executes arbitrary external code" guarantee wins: BR3
       refuses `inspectWorkingTree` rather than fabricates.
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
         **fail before `inspectWorkingTree`'s `status` invocation —
         scope corrected, Round 9 review finding #5: this scan gates
         `inspectWorkingTree` only, never `inspectDiff`** (see §13's
         "No mandatory pre-invocation filter-attribute scan for
         `inspectDiff`" correction for the full rationale — a
         commit-vs-commit diff performs no working-tree content
         canonicalization and has no dependency on current
         working-tree/index/`.gitattributes` state) — with
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
         `inspectWorkingTree`'s own `status` invocation may proceed —
         **corrected, mandatory, Round 15 review finding #3 (an earlier
         draft of this bullet paired `status`/`diff` here, as though this
         scan gates both; it never has, and never gates `inspectDiff` at
         all — see this scan's own scope statement in step 3 above and
         §13's Round 9 review finding #5 independence correction, both of
         which already establish `inspectDiff` is never gated by this or
         any other filter-attribute scan)**.
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
         `status` invocation (`inspectWorkingTree` only — never
         `inspectDiff`, per §13's Round 9 review finding #5 correction)
         that could otherwise trigger a content filter — full stop.
         **Config-enumeration is entirely removed from BR3's contract —
         withdrawn, mandatory, Round 14 review finding #4 (an earlier
         draft of this bullet retained the `filter.<name>.clean=` etc.
         key search as "supplementary diagnostic information" to enrich
         `details` with a driver name when discoverable; that retention
         is itself withdrawn).** Config-enumeration was never Git's
         own machine-readable, NUL-delimited output — plain
         `config --get-regexp` is line-oriented, and a Git config value
         may legally contain an embedded newline, reintroducing exactly
         the record-boundary ambiguity Round 13 (review finding #2)
         already eliminated for `branch.<name>.merge` by moving to `-z`.
         Since config-enumeration is not the safety mechanism to begin
         with — `check-attr --stdin -z filter` alone fully determines
         whether `EXTERNAL_GIT_FILTER_UNSUPPORTED` applies, and does so
         correctly regardless of whether any driver definition is
         visible at all (this section's own Round 7 correction, above) —
         it earns its keep only as an optional diagnostic enrichment, and
         that enrichment is not worth reintroducing a NUL-unsafe parser,
         an extra Git subprocess/query, and additional command-surface
         for a purely cosmetic benefit. **BR3 v0.1 therefore removes
         `git config --get-regexp` entirely: no config-enumeration query
         of any kind runs, anywhere in BR3, for any purpose.** The sole,
         authoritative filter-safety mechanism is the `check-attr
         --stdin -z filter` scan already fully specified above — no
         driver-definition enumeration of any kind is needed to make the
         refusal decision. This also removes an entire class of
         maintenance risk: a future change could otherwise be tempted to
         treat a "no driver found via config-enumeration" result as
         meaningful, which — as this section's own Round 7 correction
         already proved — it is not.
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
      attempt to "safely" execute or emulate the filter. `check-attr
      --stdin -z` (a pure, non-executing attribute-resolution query, by
      Git's own design — the sole mechanism BR3 uses here, config-
      enumeration having been removed entirely, Round 14 review finding
      #4) never triggers the filter itself — a content filter is only
      ever reachable through an actual content-comparison operation
      (`status` — never `diff`/`checkout`, per §13's independence
      correction, Round 9 review finding #5), which does not run before
      the refusal is decided.
    - **No cross-call caching — corrected, mandatory, Round 10 review
      finding #3 (a real safety defect in the previous "cache once per
      `resolveRepository`-validated `projectRoot`" framing, not merely
      an internal-implementation nicety).** An earlier draft of this
      bullet permitted the effective-filter-attribute scan's result to
      be cached once per `resolveRepository`-validated `projectRoot` and
      reused across separate, later `inspectWorkingTree` calls against
      that same `projectRoot`, describing this as "an internal
      implementation choice, not a caller-visible contract." **This is
      unsafe and is withdrawn entirely — it is not a permissible
      implementation choice.** Consider: `inspectWorkingTree` call 1
      runs the scan, finds no active `filter` attribute, and (under the
      withdrawn caching permission) records this as a cached "safe"
      result; between call 1 and a later call 2 against the identical
      `projectRoot`, `.gitattributes` is legitimately edited (by the
      user, by another process, by a prior BR3 caller's own unrelated
      work) to declare an active filter attribute; call 2, if it trusted
      the stale cached result instead of scanning fresh, would proceed
      directly to `status` **without** ever re-running `check-attr` —
      running `status` against a repository state BR3's own scan was
      never actually run against, precisely the "BR3 executes an
      external content filter it specifically promised never to
      execute" outcome this entire mechanism exists to prevent. **The
      corrected, mandatory contract: `inspectWorkingTree` performs a
      fresh, complete recursive effective-filter-attribute scan on
      *every* top-level `inspectWorkingTree` call, unconditionally, with
      no result ever reused across two separate top-level calls** —
      implementation may share/memoize data *within* the scope of one
      single `inspectWorkingTree` call (e.g. reusing the same submodule
      enumeration pass for both filter discovery and `SubmoduleState`
      reasoning within that one call, §18's existing "single, shared
      primitive" principle), but must never persist or reuse a
      filter-scan verdict from one call into a subsequent, separate
      call, regardless of how little wall-clock time has elapsed between
      them.
    - **Concurrency/TOCTOU boundary — new, explicit, mandatory, Round 10
      review finding #3 (this specification does not claim a stronger
      guarantee than the mechanism can actually provide).** Even within
      one single `inspectWorkingTree` call, there is an unavoidable
      check-then-run boundary between the `check-attr` scan (one Git
      subprocess) and the subsequent `status` invocation (a second,
      separate Git subprocess) — two genuinely distinct OS processes,
      not one atomic operation. **BR3 inspection assumes the repository/
      index/working-tree configuration relevant to one inspection call
      is not concurrently mutated during that call** — an explicit,
      stated scope boundary, not an unstated assumption: BR3 does not
      claim, and cannot mechanically enforce, an atomic filesystem
      snapshot across the two separate Git processes one
      `inspectWorkingTree` call spawns. Under a repository that is
      genuinely stable for the duration of one call (the ordinary case,
      and the only case this specification's guarantees are scoped to),
      the `check-attr` scan's "no active filter" finding remains valid
      by the time `status` itself runs, immediately afterward, within
      the same call. A repository whose relevant configuration is
      deliberately or adversarially mutated **during** the brief window
      between those two specific subprocesses — a genuinely narrow race,
      not the ordinary cross-call staleness case the caching correction
      above already closes — is **out of scope for BR3 v0.1's
      guarantee**; closing that narrower race would require an
      atomic/sandboxed inspection mechanism (e.g. a filesystem snapshot,
      a lock held across both subprocesses) that is explicitly deferred
      to a future phase, should a concrete, adversarial-concurrent-mutation
      threat model ever require it (§26). This is a deliberately honest,
      narrower claim than "BR3 never executes an arbitrary content
      filter, under any circumstance whatsoever" — the claim this
      specification actually makes and can actually stand behind is "BR3
      never executes an arbitrary content filter against a repository
      that is not being concurrently, adversarially mutated during the
      single inspection call in question."
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
  2a. **Deduplicate to unique repository-relative candidate paths before
     any further processing — new, mandatory, Round 16 review finding
     #3A.** `git ls-files --stage -z`'s own documented output shape
     includes an explicit **stage** field, and a genuinely legitimate,
     real repository state — an **unmerged (conflicted) gitlink** — can
     produce **three separate index records for the identical
     repository-relative path**, one per conflict stage (`160000 <sha1>
     1\t<path>\0`, `160000 <sha2> 2\t<path>\0`, `160000 <sha3>
     3\t<path>\0`). **Verified directly:** a real, previously-initialized
     submodule checkout (its working tree still populated at `sub/`),
     with a genuine, unresolved merge conflict constructed on the
     gitlink entry itself — `git ls-files --stage -z` emits three
     distinct `160000`-mode records, all naming the identical path
     `sub`, differing only in stage number and object ID; the
     corresponding `status --porcelain=v2` record is a single unmerged
     (`u`) line, `u UU S C.. 160000 160000 160000 160000 <sha1> <sha2>
     <sha3> sub` — genuinely one legitimate conflicted path, not three
     distinct submodules or a cycle. **Index stage is metadata describing
     one conflicted path's multiple pending versions — it is never a
     recursion or enumeration identity, and the step 4a visited-set
     mechanism below must never be used, even incidentally, as a
     duplicate-index-record detector.** A literal implementation that
     processes each stage record independently — validating stage 1's
     `sub`, adding its working-tree root and metadata identity to the
     visited sets, then encountering stage 2's `sub` and finding that
     identical root/metadata already present — would **falsely** produce
     `UNSAFE_SUBMODULE_PATH` for a perfectly legitimate, merely
     conflicted path; this is not the cycle/alias condition step 4a
     exists to detect. **The corrected contract:** before step 3's
     `lstat`/initialization check, step 4's validation, or step 4a's
     visited-set/relationship checks ever run, the raw `160000`-mode
     records from step 2 are collapsed to their **unique
     repository-relative paths** — a path appearing at multiple stages
     contributes exactly **one** candidate to every subsequent step, not
     one per stage. **Mixed-mode conflict handling — at minimum:** when
     one or more unmerged stages for a path are mode `160000` and the
     current working-tree path is an initialized submodule checkout Git's
     own `status` may inspect, that working-tree location is safety-scanned
     (steps 3–5) **at most once** for that path — never once per
     conflicting stage record. The conflict's own stage-level detail
     (which specific object ID each stage names) is a `status`/`diff`
     content-reporting concern (§11, addressed separately by finding
     #3B's `<sub>`-field parsing below), never a submodule-enumeration
     concern; enumeration's only job is producing the correct, unique set
     of candidate working-tree paths to recurse into.
  3. For each **unique candidate** gitlink path produced by step 2a,
     **determine whether it is genuinely
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
     review finding #3B, tightened to exclude linked-worktree metadata,
     Round 9 review finding #4.** Passing Git's own operational validation
     (§8) and the visited-set checks above is **necessary but not
     sufficient** — BR3 does not accept an arbitrary `.git` pointer
     merely because Git itself can operate against it; it additionally
     requires the child's resolved metadata to sit in a
     **relationship this specification explicitly recognizes as a
     legitimate parent→child submodule shape**.

     **Round 8's "anywhere beneath the parent's `--git-common-dir`" rule
     was too broad — verified directly.** A parent repository with a
     linked worktree (`p/.git` plus worktree metadata under
     `p/.git/worktrees/wt`) has that worktree metadata genuinely located
     beneath the parent's own `--git-common-dir` — so an ordinary
     directory `p/fake` with `p/fake/.git` containing `gitdir:
     p/.git/worktrees/wt` satisfies Round 8's rule exactly:
     ```
     $ git -C p/fake rev-parse --show-toplevel
     p/fake
     $ git -C p/fake rev-parse --git-dir
     p/.git/worktrees/wt
     $ git -C p/fake rev-parse --git-common-dir
     p/.git
     $ git -C p/fake rev-parse --is-bare-repository
     false
     $ git -C p/fake ls-files --stage
                                    # reads the OTHER LINKED WORKTREE'S
                                    # OWN INDEX, not a submodule's
     ```
     `p/fake` passes every Round 8 check — the working-tree path is not a
     symlink, Git's own operational validation succeeds, the metadata
     pair (`p/.git/worktrees/wt`, `p/.git`) is genuinely distinct from
     the parent's own exact pair (`p/.git`, `p/.git`) so the visited-set
     guard alone does not catch it, and the resolved `gitDir` genuinely
     lies beneath the parent's `--git-common-dir` tree — **yet `p/fake`
     is not a submodule repository at all; it is the parent's *other
     linked worktree*, reached through a fabricated redirect.**

     **The corrected, tightened rule uses a fact this specification
     already establishes elsewhere (§8): an ordinary submodule checkout
     has `gitDir === gitCommonDir` (`isWorktree: false`), while a linked
     worktree, by definition, has `gitDir !== gitCommonDir`
     (`isWorktree: true`).** This distinguishing fact is added as a
     **mandatory, additional condition** on top of Round 8's
     beneath-`--git-common-dir` check, not a replacement for it — both
     conditions must hold:
     1. **Old-form submodule:** the child's working-tree path is an
        ordinary directory, and its `.git` entry is itself an ordinary
        **directory** (not a pointer file) — the child is fully
        self-contained, and, trivially, `gitDir === gitCommonDir` for
        such a child (a self-contained repository is never itself a
        linked worktree of something else).
     2. **Absorbed gitdir layout** (the modern, `git submodule add`
        default): the child's `.git` entry is a pointer **file**, the
        `gitdir:` target it names resolves to a location **beneath the
        parent repository's own `--git-common-dir`** (conventionally
        `<parent-git-common-dir>/modules/<name>`, recognized by the
        resolved-path relationship, not by pattern-matching the literal
        conventional path string), **and** the child's own resolved
        `gitDir` and `gitCommonDir` are **identical** (`isWorktree:
        false` for the child, by this specification's own existing
        derivation, §8) — i.e. the child's metadata is genuinely owned
        by, and self-contained inside, the parent repository's own Git
        directory, not merely *reachable through* it via a worktree
        redirect. The `p/fake` reproduction above fails exactly this
        added condition: its resolved `gitDir`
        (`p/.git/worktrees/wt`) and `gitCommonDir` (`p/.git`) are
        **not** identical, so it is correctly rejected despite
        satisfying the beneath-`--git-common-dir` location check alone.
     3. **Legitimate nested submodule:** the identical relationship
        (case 2, recursively, including its `gitDir === gitCommonDir`
        condition) between a nested child and its own immediate parent
        (itself an already-validated submodule).

     **Any `.git` pointer shape outside these explicitly-recognized
     relationships is rejected as `UNSAFE_SUBMODULE_PATH`** — in
     particular, and explicitly: a child `.git` pointer resolving to the
     *parent's own* `--git-dir`/`--git-common-dir` (the parent-metadata
     reproduction from Round 8 — the child is not a distinct repository
     at all); a child `.git` pointer resolving to any location
     **outside** the parent's own `--git-common-dir` tree (the unrelated-
     external-repository reproduction from Round 8); a child `.git`
     pointer resolving to a location **beneath** the parent's
     `--git-common-dir` that is nonetheless a **linked-worktree metadata
     directory rather than genuine, self-contained submodule metadata**
     — i.e. `gitDir !== gitCommonDir` for the child (the `p/fake`
     reproduction, new this round); and a child whose metadata identity
     is already in the visited set (the cycle/alias guard above). **BR3
     never recursively inspects the aliased, external, or
     linked-worktree-redirected repository before this refusal is
     produced** — the parent→child relationship check runs on the
     *already-resolved* `gitDir`/`gitCommonDir` values from step 4's own
     validation, before step 5's recursion step is ever reached for that
     child.

     **`.git` entry itself is also `lstat`-checked, never followed
     merely because a subsequent `stat` succeeds — new, mandatory, Round
     9 review finding #4.** Step 3, above, already `lstat`-checks the
     gitlink *working-tree path* itself and rejects it outright if that
     is a symlink. This is a **distinct** check: the `.git` **entry**
     one level inside an already-accepted, non-symlinked working-tree
     directory must itself also be `lstat`-checked before being treated
     as an ordinary directory or an ordinary pointer file — a `.git`
     entry that is itself a symbolic link (to an arbitrary directory, or
     to an arbitrary file whose contents BR3 would otherwise parse as a
     `gitdir:` pointer) must not be silently accepted as one of the two
     legitimate `.git`-entry shapes (case 1's plain directory, case 2/3's
     plain pointer file) merely because a symlink-following `stat` on it
     would report "directory" or "regular file." A `.git` entry that is
     itself a symlink is rejected as `UNSAFE_SUBMODULE_PATH`,
     unconditionally, exactly mirroring step 3's treatment of the
     working-tree path itself.
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
     entry, via one exact, documented, PLATFORM-SPECIFIC selection rule
     — corrected again, mandatory, Round 10 review finding #2 (Round 9's
     rule, `k.toUpperCase() === "PATH"` applied uniformly on every
     platform, is itself wrong on POSIX — a genuine regression this
     round removes, not merely an incomplete edge case).** Round 9
     correctly identified that leaving PATH-key selection as
     "implementation's choice" was non-deterministic, but its fix
     introduced a **new, different** bug: on POSIX, environment variable
     names are **case-sensitive** — `PATH`, `Path`, and `path` are three
     genuinely **distinct** environment variables, not case variants of
     one logical variable, and a `k.toUpperCase() === "PATH"` match
     would incorrectly treat a POSIX process's own, deliberately
     distinct `Path` variable (which has no special meaning to the OS's
     executable-search behavior at all) as if it were `PATH` itself.
     **Verified directly**, Node 22.16.0 on Linux, with `PATH` absent
     from the environment and `Path=/tmp/fake` present (where
     `/tmp/fake/git` is a fake, distinguishable executable): a real
     `execFile("git", ..., { env })` call does **not** execute
     `/tmp/fake/git` — Node/the OS's own ordinary POSIX executable-search
     behavior against this `env` object finds the real system `git`
     instead, `Path` having no bearing on the search at all. **Round 9's
     rule would have instead promoted `Path=/tmp/fake` into a
     constructed, canonical `PATH=/tmp/fake` and resolved a genuinely
     different Git executable than the one Node/the OS itself would
     actually invoke** — directly violating this specification's own
     stated guarantee that in-process resolution uses the identical
     effective executable-search semantics the child process itself
     uses (§8). **The corrected, platform-specific contract:**
     - **On POSIX** (`os.platform()` not `"win32"`): **only the exact
       key `"PATH"` (uppercase, no case-folding at all) is the process
       search path.** `Path`, `path`, `PaTh`, or any other differently-cased
       key present in `process.env` is treated as an ordinary,
       unrelated environment variable — **never** promoted into, merged
       with, or treated as an alternate spelling of `PATH`. If `PATH`
       (that exact key) is present, its value is used, verbatim, as the
       effective search path.
       - **If `PATH` is absent entirely — corrected, mandatory, Round 11
         review finding #1 (the previous draft's own normative rule
         directly contradicted the verified reproduction stated two
         paragraphs above it, in the same section):** an earlier draft
         of this rule claimed a `PATH`-absent environment gives BR3
         "nothing to search" and therefore produces
         `GIT_EXECUTABLE_UNAVAILABLE`, describing this as "mirroring
         what the real `execFile` call itself would encounter." **This
         is false, and directly contradicts this same section's own,
         already-verified reproduction just above it**: with `PATH`
         absent and `Path=/tmp/fake` present, a real
         `execFile("git", ..., { env })` call does **not** fail to find
         any executable — it successfully finds and runs the *real
         system* `git`, never `/tmp/fake/git`. Node's own documented
         `child_process` behavior for a supplied `env` lacking `PATH` is
         **not** "search nothing" — on Unix, Node/libuv fall back to a
         fixed, documented default command-search path,
         **`/usr/bin:/bin`**, for command lookup when the effective
         environment has no `PATH` key at all (Windows instead falls
         back to the current process's own inherited `PATH` for lookup
         purposes — a Windows-specific behavior, not this POSIX branch's
         concern). **The corrected contract:** when `PATH` (the exact
         key) is absent from the sanitized environment, BR3's in-process
         resolution uses the identical fixed default,
         **`/usr/bin:/bin`**, as its effective search path — **never**
         "nothing to search," and never a differently-cased `Path`/`path`
         value promoted in as a substitute (that remains forbidden,
         unchanged from the rule above). `GIT_EXECUTABLE_UNAVAILABLE` is
         produced only when `git` cannot actually be found within
         whichever effective search path applies — the explicit `PATH`
         value when `PATH` is present, or `/usr/bin:/bin` when it is
         absent — never merely because `PATH` itself happens to be
         absent.
       - **Distinguish the effective *lookup* path (used only to
         resolve the one, absolute Git executable) from the environment
         subsequently passed to that already-resolved executable —
         clarified, Round 11 review finding #1F.** `/usr/bin:/bin`
         (the POSIX-`PATH`-absent default above) governs *resolution*
         only — it is not itself injected into the constructed `env`
         object as a synthetic `PATH` value, and it creates no
         obligation for BR3 to fabricate a `PATH` key where the
         sanitized environment genuinely has none. Once resolution
         succeeds, every subsequent Git invocation in that same
         top-level operation uses the one, already-resolved, absolute,
         canonicalized executable path directly as `execFile`'s
         `command` argument (§18) — that invocation performs no further
         `PATH`-based lookup of its own at all (an absolute path bypasses
         `PATH` search entirely, on every platform), so whether or not a
         `PATH` key is present in the environment actually handed to
         `execFile` has no bearing on which binary runs, once resolution
         has already picked it. No other key is ever considered "the"
         `PATH` on POSIX, regardless of case.
     - **On Windows** (`os.platform() === "win32"`): environment
       variable names are genuinely case-insensitive at the OS level —
       `PATH`/`Path`/`path` **are** the identical logical variable, and
       Windows/Node's own env-object handling can pass through an
       ambiguous, arbitrary case-insensitive match when multiple
       differently-cased keys are present in a supplied `env` object
       (Node's own documented behavior). Here, and **only** here,
       collapse every key whose uppercase form equals `PATH` to one,
       deterministic value: **sort the matching key names ordinally
       (plain `<`/`>` JS string comparison, never locale-aware — the
       identical determinism discipline §7a's canonical-sort mechanism
       already establishes elsewhere in this specification) and select
       the value belonging to the ordinally-first key name** — an
       arbitrary-but-fixed, fully deterministic tiebreak; its specific
       choice matters less than that it is one documented rule every
       conforming implementation applies identically, so two conforming
       implementations facing the identical multi-cased Windows
       environment always resolve the identical Git executable.
     - **In both cases, the selected value (or its absence, on POSIX) is
       written into BR3's constructed environment under exactly one
       canonical key, `PATH`** (matching Node's own convention), **and,
       on Windows only, every other case variant is removed from the
       constructed environment object** (on POSIX, a differently-cased
       key like `Path` is never touched or removed at all — it is an
       unrelated variable, left exactly as `process.env` supplied it,
       since stripping it would itself be an unwarranted, undocumented
       behavior change to a variable BR3 has no reason to treat
       specially). This identical, single, canonical `PATH` value (or
       its absence) is what both §8's in-process executable-resolution
       mechanism reads and what is passed to `execFile` — the two are
       read from the same constructed object and can never diverge.
     - **`GIT_*`-prefix stripping remains case-insensitive on every
       platform, unaffected by this correction — clarified, Round 10
       review finding #2 (do not read this bullet's POSIX-`PATH`-exactness
       rule as implying environment variable names are case-insensitive
       generally, or that the `GIT_*` strip should therefore be
       narrowed).** The `GIT_*` case-insensitive strip (step 2, above)
       is a **deliberate, conservative safety choice**, chosen because
       stripping a POSIX variable that merely *happens* to be named
       `git_dir` has no downside (BR3 never needs to read or preserve an
       inherited `GIT_*`-shaped variable under any casing, so
       over-stripping costs nothing) — it is not evidence that POSIX
       environment variable names are case-insensitive, and it does not
       imply the `PATH`-key selection rule above should also fold case
       on POSIX. The two rules are independently justified: the `GIT_*`
       strip errs toward stripping more (safe, since nothing of value is
       lost), while `PATH` selection on POSIX must be **exact**, because
       treating an unrelated `Path` variable as `PATH` would select a
       genuinely different, potentially attacker-controlled executable
       search path — the opposite of conservative.
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
  - **`GIT_NO_REPLACE_OBJECTS: "1"`** — **new, mandatory, Round 16 review
    finding #1.** Git's replacement-refs mechanism (`git replace`,
    storing substitute objects under repository-local
    `refs/replace/<original-sha>`) can, by design, cause Git commands to
    **transparently substitute a different object's content** for the
    one a caller's SHA actually names — while `rev-parse`-family SHA
    resolution keeps reporting the *original*, requested object's own
    SHA, commands that actually read object *content* (`diff`, `status`
    internally comparing tree/blob content) silently operate on the
    *replacement* object's content instead. **This directly breaks one
    of BR3's most important contracts: the exact SHA BR3 reports may not
    identify the content BR3 actually inspected and reported facts
    about** — a governance-critical property, since later evidence
    binding (§23, explicitly out of BR3's own scope, but a documented
    reason this property matters now) relies on an exact candidate SHA
    truthfully identifying the object content it names. **Verified
    directly:** a repository with commit `A`, commit `B`, and a separate
    replacement commit `B2` with a deliberately different tree,
    installed via `git replace B B2` — `git rev-parse --verify
    B^{commit}` still reports `B`'s own, original, unchanged SHA (the
    replacement never alters SHA resolution), but BR3's exact,
    pre-correction `diff` invocation (`git diff --no-color --no-ext-diff
    --ignore-submodules=none -z --name-status --find-renames=50% -l0 A
    B`) reports changes computed against `B2`'s replacement tree, not
    `B`'s real, recorded tree — meaning `DiffResult.toSha` names `B`
    while `DiffResult.changes` actually describes `B2`'s content, a
    truthful-SHA/false-content mismatch. The identical hazard reaches
    `inspectWorkingTree`: with `HEAD` replaced by a commit whose tree
    differs from `HEAD`'s own real, recorded tree, BR3's exact,
    pre-correction `status` invocation reports false staged
    modified/deleted facts relative to the *replacement* tree, even
    though the index and working tree genuinely match the real `HEAD`
    commit content. **`GIT_NO_REPLACE_OBJECTS=1`** (Git's own documented
    environment-variable mechanism, equivalent to the global
    `--no-replace-objects` flag) instructs every Git command in the
    subprocess to ignore `refs/replace/*` entirely and operate only on
    real, original object content — verified directly to eliminate both
    reproductions above (the `diff` invocation correctly reports `B`'s
    real content; the `status` invocation correctly reports no false
    staged facts). This protection must be BR3's own, unconditionally
    re-added variable, for the identical reason `GIT_NO_LAZY_FETCH` is:
    **§19's own unconditional `GIT_*`-prefix strip (step 2 above) removes
    any inherited `GIT_NO_REPLACE_OBJECTS` a caller may have already
    set**, so without re-adding it explicitly, a caller who protected
    themselves against replacement objects would silently lose that
    protection the moment BR3 invoked Git on their behalf.
    `GIT_NO_REPLACE_OBJECTS` is added to the same explicit, re-added set
    as every other controlled `GIT_*` variable above — applied
    unconditionally to every BR3 Git subprocess, not merely ones expected
    to encounter a replacement ref, for the identical "one place, no
    detect-then-decide race" rationale.

  This brings the controlled `GIT_*` variable count to **eight** (not
  seven, as of Round 5) — every occurrence of "seven" describing this
  set elsewhere in this document is updated to "eight" as part of this
  round's correction.

  Together, steps 1–4 mean the final `env` passed to every BR3 `execFile`
  call is `process.env` **minus every `GIT_*`-prefixed key, unconditionally**,
  **plus** exactly the eight `GIT_*` keys named above **plus** `LC_ALL`/
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
  counted among the eight `GIT_*` variables above since it is not itself
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
  `GIT_OPTIONAL_LOCKS=0`, as one of the eight controlled `GIT_*`
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
  a subset, always preceded by the mandatory `-c core.fsmonitor=` **and**
  `-c status.renameLimit=0` overrides (§11, §18, Round 4 review finding
  #3; `-c status.renameLimit=0` added, Round 9 review finding #1 —
  **corrected here, Round 10 review finding #4: an earlier draft of this
  exact bullet restated only `-c core.fsmonitor=` and silently omitted
  `-c status.renameLimit=0`, contradicting §11's own, already-corrected
  exact command**) — and only ever run at all once BR3's
  effective-filter-attribute scan (`git check-attr --stdin -z filter`
  over every relevant tracked path, superproject and every initialized
  submodule recursively — §18, Round 6 review finding #1, detection
  mechanism corrected Round 7 review finding #4) has confirmed no path in
  scope has an active `filter` attribute; a discovered active attribute
  produces `EXTERNAL_GIT_FILTER_UNSUPPORTED` instead, before this
  invocation ever runs (§17, §18)** (§11 — restated here so this
  section, §11, §20, and §27 all name the identical command, `git -c
  core.fsmonitor= -c status.renameLimit=0 -c status.showStash=false
  status --porcelain=v2 -z --find-renames=50% --untracked-files=all
  --ignore-submodules=none`, with no drift between them).
- **No reliance on Git aliases:** every BR3 Git invocation uses a
  first-argument literal plumbing/porcelain subcommand name
  (`status`, `diff`, `rev-parse`, `symbolic-ref`, `config`, `ls-files`,
  `check-attr`) that ships with Git itself — never a user-configurable
  alias name — so a local `~/.gitconfig`'s `[alias]` section can never
  redirect a BR3 invocation to different, unexpected behavior. (`config`
  is used read-only, for `--get branch.<branch>.remote`/`--get-all
  branch.<branch>.merge` (`--get-all` required for the latter to
  correctly handle a multi-valued key — Round 9 review finding #2) —
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
- **Ancestor-chain repository discovery, four fixtures run side-by-side
  in the same test to prove correct four-way discrimination — mandatory,
  new, Round 16 review finding #4:**
  - **(A) Existing healthy nested directory** — a real, healthy
    repository at `/repo` with a plain, non-repository subdirectory
    `/repo/sub` used as `projectRoot` → `PROJECT_ROOT_MISMATCH`, `details`
    naming `/repo` as the actual resolved toplevel (the unchanged, healthy
    path — Git's `--is-bare-repository`/`--show-toplevel` both succeed).
  - **(B) Existing plain non-Git directory** — an entirely standalone
    directory with **no** repository anywhere in its own ancestor chain
    up to the filesystem root used as `projectRoot` →
    `NOT_A_GIT_REPOSITORY` (the ancestor-chain check runs and correctly
    finds no marker anywhere).
  - **(C) Existing malformed repository ROOT** — the malformed-bare and
    malformed-non-bare fixtures already above, `projectRoot` set directly
    to the malformed repository's own root → `GIT_COMMAND_FAILED`
    (unchanged from the existing fixtures above; re-asserted here
    explicitly alongside (D) to prove the new ancestor-chain logic does
    not alter this already-correct case).
  - **(D) NEW — malformed repository PARENT, nested `projectRoot` — the
    specific regression case this round's finding targets:** a real
    repository at `/repo` with its own `/repo/.git/config` deliberately
    malformed (the identical unterminated-`[section` technique used
    throughout this section), and `projectRoot` set to a plain,
    non-repository subdirectory `/repo/sub` (no `/repo/sub/.git` of any
    kind) → first confirm, in the test's own setup, that `git
    rev-parse --is-bare-repository` run with `cwd=/repo/sub` genuinely
    fails with exit 128 (Git's own discovery walks up to `/repo` and
    fails there); then call `resolveRepository("/repo/sub")` and assert
    `GIT_COMMAND_FAILED` — **never** `NOT_A_GIT_REPOSITORY` (the
    pre-Round-16 classifier's incorrect result) and **never**
    `PROJECT_ROOT_MISMATCH` (which would falsely claim Git successfully
    established a real toplevel) — `details` naming `/repo` as the
    ancestor path where the non-bare repository marker was found.
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
  - **Same executable path, different binary between top-level
    operations — mandatory, new, Round 12 review finding #1A** (a
    test-controlled, single, fixed `PATH` entry whose resolved candidate
    pathname does not change between calls): top-level call 1 resolves
    the executable at that pathname, the executable reports a
    genuinely-supported Git version, and the call succeeds; **between**
    call 1 and call 2, the file at that **exact same pathname** is
    replaced with a below-floor (or malformed-version-string) stand-in,
    with the `PATH` value and resolved candidate pathname themselves
    completely unchanged; top-level call 2 resolves to the identical
    canonical pathname as call 1 → asserts call 2 genuinely re-runs
    `--version` against the file now occupying that pathname (via a
    call-count/invocation assertion on the version-check subprocess
    itself, not merely the semantic result) and correctly rejects it as
    `GIT_VERSION_UNSUPPORTED` — proving same-pathname replacement
    between top-level operations can never silently hit a stale,
    path-keyed capability cache, closing the gap the identical-path
    `PATH`-unchanged case (distinct from the already-covered
    `PATH`-changes-between-calls case above) would otherwise leave open.
  - **Same `projectRoot`, different repository between top-level
    operations — mandatory, new, Round 12 review finding #1B** (a fixed
    `projectRoot` path used across two top-level calls): call 1 against
    a genuinely supported SHA-1, `files`-ref-backend repository at that
    path → `resolveRepository` succeeds; **between** call 1 and call 2,
    the repository metadata at that **exact same `projectRoot`** is
    replaced/reinitialized — one subcase reinitialized as a SHA-256
    repository, a second, separate subcase reinitialized with the
    `reftable` ref-storage backend; call 2 against the identical
    `projectRoot` path string → the SHA-256 subcase produces
    `UNSUPPORTED_OBJECT_FORMAT`, the `reftable` subcase produces
    `UNSUPPORTED_REF_FORMAT` — proving `projectRoot`-keyed reuse of an
    earlier operation's "supported" verdict never occurs, and that every
    `resolveRepository`-derived safety/capability fact (object format,
    ref-storage format, and, by the same principle, the repository-root/
    bare/worktree/submodule relationship and `gitDir`/`gitCommonDir`
    themselves) is genuinely recomputed fresh on every top-level
    operation, never cached merely because the `projectRoot` path
    string is unchanged.
  - **Relative `PATH` entries resolve against one fixed resolver `cwd`,
    never per-call `cwd` — corrected, mandatory, Round 9 review finding
    #3A (supersedes the previous, internally contradictory "resolved
    against each call's own cwd" framing)** (a test-controlled `PATH`
    containing a relative entry, e.g. `.`, with two distinct fixture
    `git`-named executables placed at two different directories — one
    matching the resolver `cwd` BR3 uses for resolution, one matching a
    *different* directory a subsequent repository operation's own
    `projectRoot`/`cwd` would use — verified directly during this
    round's reproduction to be a real hazard: `cwd=/tmp/A` resolves
    `./git` to one binary, `cwd=/tmp/B` to a genuinely different one,
    with the `PATH` string itself unchanged) → asserts that BR3's
    in-process resolution mechanism resolves the relative entry against
    its own single, fixed resolver `cwd` (`process.cwd()`) exactly once
    per top-level operation, and that the resulting resolved absolute
    executable path is then reused, unchanged, for every subsequent Git
    command in that operation **regardless of that command's own,
    separately-varying `cwd`** — proving BR3 deterministically chooses
    one executable according to the documented rule and never silently
    changes which binary it invokes merely because a later command's own
    targeting `cwd` (e.g. a different `projectRoot`, or a submodule path)
    differs from the resolver `cwd`.
  - **BR3's deliberate, stricter, BR3-specific Windows resolver — new
    resolver design, mandatory, corrected, Round 11 review finding #2
    (supersedes Round 9/10's PATHEXT-based model, which incorrectly
    claimed to mirror Node/libuv's own bare-command lookup):**
    - **(A) `git.exe` present in a sanitized `PATH` directory resolves
      successfully** — a fixture `PATH` entry containing a literal
      `git.exe`-named (real or stand-in, on a Windows test runner; or a
      focused unit test against the resolution function's Windows-specific
      branch, independent of the actual test-runner OS) executable →
      resolution succeeds, selecting it as the usable candidate.
    - **(B) An earlier `PATH` entry containing only `git.cmd`, with a
      later entry containing `git.exe`, resolves to the later `git.exe`
      — the earlier `git.cmd` is skipped entirely, not merely
      deprioritized** — a fixture `PATH` with two entries, in order:
      the first containing only a `git.cmd` file (no `git.exe`), the
      second containing a genuine `git.exe` → resolution skips the
      first entry's `git.cmd` (never considers it a candidate at all,
      per the resolver's exact-filename allowlist) and selects the
      second entry's `git.exe` — proving the resolver's per-directory
      search genuinely continues past a directory containing only a
      rejected candidate name, rather than stopping (successfully or
      not) at the first `PATH` entry that contains *anything*
      `git`-named.
    - **(C) A `PATH` containing only `git.cmd`/`git.bat` anywhere (no
      `git.exe` at all) → exactly `GIT_EXECUTABLE_UNAVAILABLE`, no
      alternative typed outcome** — a fixture `PATH` where the only
      `git`-matching candidates anywhere are `.cmd`/`.bat` files → 
      resolution fails with exactly `GIT_EXECUTABLE_UNAVAILABLE` — **not**
      "`GIT_EXECUTABLE_UNAVAILABLE` or a deliberate alternative,
      implementation's choice of code" (that framing is removed this
      round) — proving there is exactly one typed outcome for "no usable
      Git executable found," identical to the outcome for `git` being
      entirely absent from every `PATH` directory.
    - **(D) `PATHEXT` has zero effect on resolution, regardless of
      content or ordering** — a fixture with an unusual, reordered, or
      `.cmd`/`.bat`-prioritized `PATHEXT` value (e.g.
      `PATHEXT=.CMD;.BAT;.EXE`) alongside a `PATH` containing both a
      `git.cmd` and a `git.exe` in the same directory → resolution
      still selects `git.exe`, proving `PATHEXT` is never consulted by
      BR3's resolver at all — not read, not walked, not used to
      prioritize one candidate extension over another.
    - **(E) No implicit current-working-directory search** — a fixture
      where the resolver's own fixed resolver `cwd` (§8) contains a
      `git.exe`-named file, but that directory is **not** itself listed
      in the sanitized `PATH` value → resolution does **not** select
      the `cwd`-local file — proving BR3's resolver never implicitly
      searches the resolver `cwd` (or any other unlisted directory) the
      way an interactive shell prompt might.
    - **(F) `PATH`/`Path`/`path` duplicate-key fixture still applies the
      Windows-only deterministic selection rule** — re-asserting, under
      this corrected resolver design, the existing Windows
      case-insensitive-key-collapse test (§19) composes correctly:
      the sanitized `PATH` value the resolver searches is exactly the
      one Windows-rule-selected value, not a value read independently
      by this resolver from a different source.
    - **(G) The selected absolute executable identity is the exact path
      subsequently passed to `execFile` for every Git command** —
      re-asserting, under this corrected Windows resolver, the same
      single-resolution-reused-everywhere guarantee §8/§18 already
      establish (Round 8/9's executable-identity binding), confirming
      the Windows-specific resolver composes correctly with that
      existing, platform-independent guarantee.
    - **(H) A directory named `git.exe` is skipped, not selected —
      mandatory, new, Round 12 review finding #2** (a fixture `PATH`
      with two entries, in order: the first containing a **directory**
      literally named `git.exe` (not a file), the second containing a
      genuine `git.exe` file) → resolution skips the first entry's
      directory (it satisfies the exact-filename match but fails the
      required non-directory, regular-file shape) and selects the
      second entry's genuine executable — proving the resolver's
      filesystem-shape check, not merely its filename check, is
      genuinely enforced, and that an invalid-shape candidate does not
      terminate the search.
    - **(I) Only invalid candidates present anywhere on `PATH` →
      exactly `GIT_EXECUTABLE_UNAVAILABLE`** (a fixture `PATH` whose
      every entry contains only invalid-shape `git.exe`-named candidates
      — directories, broken links, or otherwise — with no genuinely
      valid candidate anywhere) → resolution fails with exactly
      `GIT_EXECUTABLE_UNAVAILABLE`, proving the shape-validation
      correction does not introduce a different, alternative failure
      outcome for this case.
    - **BR3 never falls back to `cmd.exe`/PowerShell/shell execution
      under any circumstance** — confirmed by static inspection of the
      resolution/exec implementation (no `shell: true`, no
      `cmd.exe`/`cmd /c`/PowerShell-shaped invocation anywhere in
      `packages/core/src/git/`) in addition to fixtures (C) above —
      proving the "no usable `git.exe` found, fail outright" behavior is
      never silently replaced by a shell-based execution path as an
      alternative.
  - **PATH key selection is exact, deterministic, AND platform-specific
    — corrected, mandatory, Round 10 review finding #2 (Round 9's
    uniform-on-every-platform rule was itself wrong on POSIX):**
    - **(A) POSIX: `PATH` and a differently-cased `Path` are genuinely
      distinct variables — the resolver uses `PATH` only** (a
      test-constructed `process.env`-shaped object with `PATH=<dir A>`
      and, separately, `Path=<dir B>`, both genuinely present, on a
      simulated/actual POSIX platform) → asserts BR3's constructed
      environment and in-process resolution both use `<dir A>`'s value
      exclusively — `Path`'s value never consulted, never merged in,
      never promoted into the canonical `PATH` key — proving `Path` is
      treated as an ordinary, unrelated environment variable on POSIX,
      not a case variant.
    - **(B) POSIX, absent `PATH`, system Git available under
      `/usr/bin`/`/bin`: fake `Path` is ignored, system Git resolves
      successfully — corrected, mandatory, Round 11 review finding #1**
      (`PATH` genuinely absent from `process.env`; `Path=<a fake Git
      directory>` present; a real, genuine `git` available at its
      ordinary system location under `/usr/bin` or `/bin`) → asserts
      BR3's resolution does **not** promote `Path`'s value into `PATH`,
      does **not** resolve the fake executable at that fake directory,
      and **does** successfully resolve the real system `git` via the
      `/usr/bin:/bin` default lookup path — the result is **not**
      `GIT_EXECUTABLE_UNAVAILABLE` — first confirmed, in the test's own
      setup (mirroring the reviewer's own verified reproduction), that a
      real `execFile("git", ..., { env })` call under this exact `env`
      object does not execute the fake `/tmp/fake/git` and instead
      successfully runs the real system `git`, establishing BR3's
      resolution must match that real, observed behavior — an earlier
      draft of this specification incorrectly asserted this case
      produces `GIT_EXECUTABLE_UNAVAILABLE` ("nothing to search"), which
      directly contradicted this exact, already-recorded reproduction;
      that assertion is corrected here.
    - **(B2) POSIX, absent `PATH`, no Git available anywhere under
      `/usr/bin`/`/bin` — mandatory, new, Round 11 review finding #1**
      (`PATH` genuinely absent; `Path=<a fake Git directory>` present;
      no real `git` executable present at `/usr/bin/git` or `/bin/git`
      in the test environment — constructed via a sandboxed/simulated
      filesystem view for the resolution function under test, not by
      actually removing Git from the real test-runner system) →
      resolution correctly fails with `GIT_EXECUTABLE_UNAVAILABLE` —
      proving the `/usr/bin:/bin` default is a genuine search path
      Git must actually be found within, not an unconditional
      "always succeeds" assumption.
    - **(C) Windows: `PATH`/`Path`/`path` variants collapse per the
      exact documented rule** (a test-constructed `process.env`-shaped
      object with three case variants, each a genuinely different
      value, on a simulated/actual Windows platform) → asserts the
      selected value is exactly the one belonging to the
      ordinally-first key name among the matching keys, under exactly
      one canonical `PATH` key, with every other case variant entirely
      absent from the constructed object — proving Windows collapsing
      remains a fixed, documented rule, not an unspecified "whichever
      Node happens to pick," while confirming this collapsing behavior
      is genuinely gated on the Windows branch only (case (A)/(B) above
      prove it does *not* fire on POSIX).
    - **(D) The resolved executable used for `--version` and every
      later command remains identical within one top-level operation**
      — re-asserting, under this corrected platform-specific PATH
      selection, the same single-resolution-reused-everywhere guarantee
      §8/§18 already establish (Round 8/9's executable-identity
      binding) — proving the PATH-selection correction composes
      correctly with, and does not regress, that existing guarantee.
    - **(E) Relative/empty `PATH`-entry behavior remains explicitly
      defined for the `PATH`-present case, unchanged by this round's
      `PATH`-absent correction** — re-asserting the existing relative-
      `PATH`-entry-resolves-against-the-fixed-resolver-`cwd` test above
      continues to apply identically whenever `PATH` (the exact key) is
      genuinely present, however it is populated (including a relative
      or empty entry within it) — this round's correction is scoped
      exclusively to the separate, `PATH`-**absent** case; it does not
      alter how a *present* `PATH` value (relative entries included) is
      searched.
  - **POSIX exact candidate filesystem-shape validation — mandatory,
    new, Round 12 review finding #2:**
    - **(A) A directory named `git` is skipped in favor of a later,
      genuine executable** (a two-entry `PATH`: `dirA/git` is a real
      directory — created with search/execute permission set, exactly
      the permission bit that legitimately makes a directory
      traversable and that a naive `fs.access(candidate, X_OK)`-only
      check would incorrectly accept as "executable" — and `dirB/git` is
      a real, valid executable) → resolution skips `dirA/git` (fails the
      required regular-file shape, despite passing a permission-only
      check) and selects `dirB/git` — proving the shape check, not
      merely the permission check, is genuinely, independently enforced.
    - **(B) A non-executable regular file is skipped in favor of a
      later, genuine executable** (a two-entry `PATH`: `dirA/git` is a
      real, regular file with no execute permission set; `dirB/git` is a
      real, valid executable) → resolution skips `dirA/git` and selects
      `dirB/git`.
    - **(C) A broken symlink is skipped** (a `PATH` entry whose `git`
      candidate is a symlink resolving to a nonexistent target, followed
      by an entry with a genuine executable) → resolution skips the
      broken symlink and selects the later, valid candidate.
    - **(D) A valid symlink to a genuine executable is accepted** (a
      `PATH` entry whose `git` candidate is a symlink resolving to a
      real, executable regular file elsewhere on disk) → resolution
      accepts it, proving symlinks are permitted exactly when, and only
      when, their resolved target satisfies the regular-file-and-executable
      requirement — not rejected outright merely for being a symlink.
    - **(E) Only invalid candidates present anywhere on `PATH` → exactly
      `GIT_EXECUTABLE_UNAVAILABLE`** (a `PATH` whose every entry
      contains only invalid-shape `git` candidates — directories,
      non-executable files, or broken symlinks, with no genuinely valid
      candidate anywhere) → resolution fails with exactly
      `GIT_EXECUTABLE_UNAVAILABLE`.
    - **(F) Documented Node behavior check: an executable text-file
      candidate is accepted by BR3's own resolver rules and does not
      itself prove "no shell involved" — new, mandatory, Round 13 review
      finding #1** (a regular, executable text file — `chmod +x`, no
      shebang line, literal shell-script text as its content — placed at
      a `PATH`-directory candidate location) → this candidate satisfies
      every one of BR3's own POSIX candidate-validity rules above
      (exists, regular file after symlink resolution, executable) and is
      therefore accepted by the resolver exactly as any other valid
      candidate would be; this test exists to document, not to assert a
      security boundary BR3 does not claim — it confirms the resolver's
      *filesystem-shape* validation behaves exactly as specified (this
      candidate genuinely is a regular, executable file, so accepting it
      is correct under §8's own stated contract), and separately, via a
      focused Node-behavior check (not a BR3 resolver behavior claim),
      confirms that invoking such a file's absolute path via
      `execFile(path, [], { shell: false })` can still succeed and
      execute the file's script contents (Node/libuv's own POSIX
      `execvp`-family/`ENOEXEC`-fallback semantics) — proving §8's
      trust-boundary wording is not merely descriptive prose but reflects
      genuine, verified runtime behavior this specification's guarantees
      are correctly scoped around.
  - **Windows environment-key casing during resolution, where testable**
    (on a Windows test runner, or via a focused unit test against the
    resolution function's own Windows-specific branch, independent of
    the actual test-runner OS) — confirms resolution reads whichever
    `PATH`/`Path`/`path` casing is actually present in the sanitized
    child environment, **on Windows only** (per §19's Windows-casing
    correction, and per §19's now-platform-specific `PATH`-key-selection
    rule above, since resolution must read the identical, already-normalized
    single `PATH` value
    §19's environment construction produces, never re-derive its own,
    separate answer to "which case variant wins").

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
- **Unborn symbolic branch with `branch.<name>.remote`/`.merge`
  genuinely configured, target RESOLVES — mandatory, new, Round 13 review
  finding #4A, corrected, Round 14 review finding #1** (a repository
  containing a real commit on `master`; `HEAD` repointed to an unborn
  `refs/heads/new` via `git symbolic-ref HEAD refs/heads/new`, verified
  unborn — `symbolic-ref -q HEAD` succeeds, `rev-parse --verify -q
  refs/heads/new` fails; `branch.new.remote=.`/`branch.new.merge=refs/heads/master`
  configured directly) → `unborn: true`, and `upstream` is a genuinely
  configured, non-null `UpstreamInfo` — `remote`/`mergeRef`/`branch`
  correctly populated directly from config, **and** `ref`/`sha` **both
  correctly resolved and non-null** (`ref: refs/heads/master`, `sha`:
  `master`'s tip) — proving `<new>@{upstream}` genuinely resolves even
  though the current branch itself remains unborn, since only the
  *configured target*'s existence matters, never the current branch ref's
  own existence — the specific regression test proving unborn status
  alone is never sufficient reason to force `ref`/`sha` null.
- **Unborn symbolic branch with `branch.<name>.remote`/`.merge`
  genuinely configured, target MISSING — mandatory, new, Round 13 review
  finding #4A, corrected, Round 14 review finding #1** (identical setup,
  but `branch.new.merge` points at a target that itself does not exist,
  e.g. `refs/heads/does-not-exist`) → `unborn: true`, `upstream` is a
  genuinely configured, non-null `UpstreamInfo` — `remote`/`mergeRef`/
  `branch` correctly populated directly from config — with `ref: null`,
  `sha: null`, since `@{upstream}` genuinely fails to resolve for this
  fixture (a real resolution failure, never an assumption based on
  unborn status) — proving BR3 does not conflate "configured but
  currently unresolvable" with "no upstream configured at all," the
  identical distinction §9/§10 already enforce for other
  configured-but-unresolvable shapes.
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
- **Ordinary single `branch.<branch>.merge` value — mandatory, new,
  Round 9 review finding #2** (re-asserted explicitly as the baseline
  the multi-valued fixtures below are contrasted against) → identical
  existing behavior, `mergeRef`/`branch`/`ref`/`sha` all correctly
  describing the one configured value (`branch` correctly non-null,
  since this baseline fixture's target is under `refs/heads/`).
- **Multi-valued `branch.<branch>.merge` (octopus-style config), both
  targets present — mandatory, new, Round 9 review finding #2, NUL-safe
  parsing corrected Round 13 review finding #2**
  (`branch.master.remote = "."`, `branch.master.merge` set to two
  values in order — `refs/heads/foo` then `refs/heads/bar` — both local
  branches existing) → `mergeRef` is derived from the **first**
  configured value (`"refs/heads/foo"`, with `branch: "foo"`), and
  `ref`/`sha` (via `@{upstream}`) correctly resolve to
  `refs/heads/foo`'s own target — proving all relevant fields describe
  the identical upstream, never a mix of the first and last configured
  values. First confirmed, in the test's own setup, that a bare `git
  config --get branch.master.merge` against this exact fixture returns
  only `refs/heads/bar` (the last value) while `git config -z
  --get-all` returns both, complete and NUL-delimited, and that `git
  rev-parse --symbolic-full-name master@{upstream}` resolves to
  `refs/heads/foo` (the first value) — establishing the bare-`--get`
  hazard is real, not hypothetical.
- **Multi-valued `branch.<branch>.merge`, first target missing/deleted —
  mandatory, new, Round 9 review finding #2** (identical to the fixture
  above, but the local branch `refs/heads/foo` — the first configured
  merge value — is subsequently deleted) → the configured-but-unresolvable
  semantics already established for the single-valued case apply
  identically: `ref: null`, `sha: null`, `remote`/`mergeRef`/`branch`
  still populated from config (`mergeRef` still reporting
  `"refs/heads/foo"`, `branch` still `"foo"`, the first configured
  value, even though it no longer resolves) — proving BR3 does not
  silently fall back to the second configured value merely because the
  first one stopped resolving, since `@{upstream}` itself does not fall
  back either.
- **Multi-valued `branch.<branch>.merge`, first value contains an
  embedded newline — mandatory, new, Round 13 review finding #2 (the
  specific, implementation-blocking regression this round's `-z`
  correction closes)** (`branch.master.remote = "."`; the **first**
  configured `branch.master.merge` value's own content is literally
  `refs/heads/foo\nrefs/heads/bar` — one value whose text contains a raw
  embedded newline, constructed via direct `.git/config` manipulation or
  an equivalent mechanism bypassing `git config`'s own value-quoting;
  the **second**, separate, genuinely distinct configured value is
  `refs/heads/bar`) → BR3 correctly recovers **exactly two** configured
  values (not three) — first confirmed, in the test's own setup, that
  plain, non-`-z` `git config --get-all branch.master.merge` output for
  this exact fixture is byte-for-byte indistinguishable from a
  three-separate-value configuration, establishing the ambiguity is
  real; then confirming BR3's own NUL-safe parsing genuinely recovers
  the correct value count and content via `git config -z --get-all`,
  never fabricating a third merge value out of the embedded newline.
- **Local lightweight-tag upstream target — mandatory, new, Round 13
  review finding #3** (`branch.<current>.remote = "."`,
  `branch.<current>.merge = refs/tags/v1`, `v1` a real **lightweight**
  local tag — a plain ref with no tag object of its own) → `mergeRef:
  "refs/tags/v1"`, `branch: null` (never treated as a branch name),
  `ref`/`sha` correctly resolved via `@{upstream}` to the tag's own
  target, and `sha` equal to the commit it directly points at (no tag
  object exists to distinguish it from) — proving BR3's upstream model
  correctly represents a non-branch upstream target rather than
  misrepresenting or rejecting it.
- **Local ANNOTATED-tag upstream target, `sha` object-ID distinctness —
  mandatory, new, Round 14 review finding #2** (identical structure, but
  `v1` created via `git tag -a` — a genuine annotated tag **object**
  distinct from the commit it points at) → `mergeRef: "refs/tags/v1"`,
  `branch: null`, `ref: "refs/tags/v1"`, and `UpstreamInfo.sha` asserted
  to equal `git rev-parse refs/tags/v1` (the **annotated tag object's
  own SHA**) — and explicitly asserted to **differ** from
  `git rev-parse refs/tags/v1^{commit}` (the peeled commit SHA) for the
  identical ref — the specific regression test proving BR3 never
  performs a `^{commit}` peel and never mischaracterizes the tag object's
  own SHA as a commit SHA.
- **Custom-namespace local upstream target, non-commit object — mandatory,
  new, Round 13 review finding #3, extended Round 14 review finding #2**
  (identical structure to the tag case, but `branch.<current>.merge =
  refs/custom/foo`, a real ref existing at that exact path and pointing
  at a **tree object** directly, not a commit) → `mergeRef:
  "refs/custom/foo"`, `branch: null`, `ref`/`sha` correctly resolved —
  `sha` asserted to be the tree object's own raw SHA, faithfully returned
  with no type assumption or commit-peel attempted — proving the same
  correctness for an arbitrary, non-conventional ref namespace pointing
  at a non-commit object, not merely the already-well-known
  branch/tag-to-commit cases.
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
- **Unicode branch name round-trips exactly — mandatory, new, Round 10
  review finding #1** (a real fixture repository with `HEAD` pointing at
  a branch literally named `café`, constructed via a plumbing/manual
  mechanism, e.g. `git symbolic-ref HEAD 'refs/heads/café'` plus a
  corresponding commit) → `inspectHead` succeeds, `branch` reports the
  exact string `"café"`, losslessly round-tripped through the strict
  UTF-8 decode (§13 Category 2) — proving non-ASCII, valid-UTF-8 branch
  names are fully supported, not merely tolerated.
- **Invalid-UTF-8 branch/ref name → `MALFORMED_GIT_OUTPUT` — mandatory,
  new, Round 10 review finding #1** (the verified reproduction: a ref
  name containing the raw byte `0xFF`, constructed via Node's
  `Buffer`-based `fs`/direct ref-file-writing APIs bypassing the shell —
  practical on the Linux/macOS filesystems this test suite targets —
  confirmed, in the test's own setup, that Git itself genuinely accepts
  and resolves this ref: `git check-ref-format` accepts it, `git
  update-ref` creates it, `git symbolic-ref` points `HEAD` at it, and
  both `git symbolic-ref -q HEAD` and `git rev-parse --verify -q
  HEAD^{commit}` succeed against it) → `inspectHead` returns
  `MALFORMED_GIT_OUTPUT`, never a JS string containing a U+FFFD
  replacement character presented as if it were the real branch name,
  and never a raw/uncaught decoding exception — proving BR3 does not
  silently corrupt or misreport a non-UTF-8 ref name Git itself
  genuinely resolves.
- **Strict decoding for repository-controlled upstream/config
  identifiers — mandatory, new, Round 10 review finding #1** (a fixture
  with a genuinely non-UTF-8 `branch.<branch>.remote` or
  `branch.<branch>.merge` config value, constructed by writing
  `.git/config` directly with raw bytes rather than through `git
  config`'s own value-quoting, if constructible; otherwise a focused
  unit test against the Category 2 decode step directly, using a
  synthetic non-UTF-8 byte buffer standing in for a `config --get`/
  `--get-all` result) → `MALFORMED_GIT_OUTPUT`, proving `UpstreamInfo.remote`/
  `.branch` are genuinely strict-decoded, not merely documented as such.
- **Fixed ASCII machine tokens remain validated separately from Category
  2 text — mandatory, new, Round 10 review finding #1** (a focused unit
  test asserting `--is-bare-repository`'s `true`/`false` output,
  `--show-object-format`'s `sha1`/`sha256` output, and a resolved commit
  SHA are each validated against their own fixed, exact grammar — e.g. a
  SHA failing `/^[0-9a-f]{40}$/` produces `MALFORMED_GIT_OUTPUT` — rather
  than passing through the Category 2 strict-UTF-8-decode path at all)
  → proving Category 1 and Category 2 are genuinely two distinct
  validation mechanisms, not the same mechanism applied inconsistently.
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
- **Replacement-object neutralization, `inspectDiff` — mandatory, new,
  Round 16 review finding #1(A)** (a real fixture: commit `A`, commit
  `B`, a separate replacement commit `B2` with a deliberately different
  tree, installed via `git replace B B2`) → first confirm, in the test's
  own setup, that an unmitigated `git diff` between `A` and `B` (without
  `GIT_NO_REPLACE_OBJECTS=1`) genuinely reports `B2`'s replacement
  content rather than `B`'s real, recorded tree (establishing the hazard
  is real); then call `inspectDiff(projectRoot, { fromRef: A, toRef: B
  })` and assert: `fromSha`/`toSha` are the actual, real `A`/`B` object
  IDs (unaffected either way, since `rev-parse` SHA resolution never
  consults replacement refs), **and** `changes` describes the real
  difference between `A` and `B`'s own, original trees — **never** `B2`'s
  replacement content — proving `GIT_NO_REPLACE_OBJECTS=1` (§19) is
  genuinely applied to BR3's `diff` invocation.
- **Replacement-object neutralization, `inspectWorkingTree` — mandatory,
  new, Round 16 review finding #1(B)** (a real fixture: repository index
  and working tree genuinely match the real `HEAD` commit's own content;
  a replacement ref installed for `HEAD`'s commit pointing at a separate
  commit with a deliberately different tree) → first confirm, in the
  test's own setup, that an unmitigated `git status` (without
  `GIT_NO_REPLACE_OBJECTS=1`) genuinely reports false staged
  modified/deleted facts relative to the replacement tree (establishing
  the hazard is real); then call `inspectWorkingTree(projectRoot)` and
  assert `clean: true`, `entries: []` — **no** replacement-induced staged
  facts appear — proving `GIT_NO_REPLACE_OBJECTS=1` (§19) is genuinely
  applied to BR3's `status` invocation as well, and that no
  `refs/replace/*` ref of any kind can alter any fact BR3 reports.

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
- **Rename-limit pinning (`-c status.renameLimit=0`) — mandatory, new,
  Round 9 review finding #1:**
  - **(B) Repository-local `status.renameLimit=1` cannot alter
    `inspectWorkingTree` output:** a fixture with several (e.g. four)
    unstaged, high-similarity (~90%) renamed-path pairs (each
    constructed via the verified `mv` + `git add -N` intent-to-add
    technique, §11), and repository-local config `status.renameLimit=1`
    set → first confirm, in the test's own setup, that BR3's own
    `status`-flag-shaped invocation *without* `-c status.renameLimit=0`
    genuinely degrades to delete+add-shaped records under this config;
    then call `inspectWorkingTree` and assert **all** pairs are correctly
    reported as `unstaged_rename` with correct `oldPath`/`similarity`,
    proving `-c status.renameLimit=0` overrides the repository-local
    limit.
  - **(C) Repository-local `diff.renameLimit=1` with no
    `status.renameLimit` set cannot alter `inspectWorkingTree` via the
    fallback relationship:** identical fixture to (B), but only
    `diff.renameLimit=1` is set (`status.renameLimit` itself absent —
    exercising `status.renameLimit`'s own documented fallback to
    `diff.renameLimit`'s value) → identical assertion (all pairs
    correctly reported as `unstaged_rename`), proving BR3's explicit
    `-c status.renameLimit=0` override is applied regardless of which of
    the two config keys a repository happens to set, closing the
    fallback path as a possible gap too.
- **`status.showStash` pinning (`-c status.showStash=false`) —
  mandatory, new, Round 16 review finding #2:** a fixture repository
  with one real stash entry (created via `git stash push`) and
  repository-local config `status.showStash=true` set → first confirm,
  in the test's own setup, that BR3's own `status`-flag-shaped invocation
  *without* `-c status.showStash=false` genuinely emits a `# stash 1\0`
  header record interleaved with the ordinary path/status records
  (establishing the hazard is real); then call `inspectWorkingTree` and
  assert: **no** `MALFORMED_GIT_OUTPUT` is produced, **no** stash
  pseudo-entry of any kind appears in `entries`, and every ordinary
  working-tree entry elsewhere in the identical fixture is still
  correctly reported — proving `-c status.showStash=false` (§11)
  unconditionally suppresses the `# stash` header regardless of
  repository-local config, and that a repository having a stash can
  never, by itself, cause `inspectWorkingTree` to fail.
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
- **Submodule state field parsing — mandatory, new, Round 13 review
  finding #4B** (a real initialized submodule made dirty — an unstaged
  modification to a tracked file inside the submodule's own working
  tree — producing the verified real record shape `1 .M S.M. ... <path>`
  under BR3's exact `status` invocation) → the resulting entry's
  `submodule` field correctly reports `SubmoduleState { commitChanged:
  false, hasUntrackedContent: false, hasModifiedContent: true }`,
  proving BR3's parser reads the `<sub>` field (`S.M.`) as its own,
  independent field position in the record — never by searching for an
  `S`-prefixed substring inside the separate `<XY>` field (`.M`) — and
  that the two fields are never confused with one another.
- **Submodule `<sub>`-field parsing on a type-2 (rename) record, with
  attachment to both emitted entries — mandatory, new, Round 16 review
  finding #3B** (a real initialized submodule, staged-renamed (`git mv`)
  to a new path, with its own working tree independently made dirty —
  producing the verified real record shape `2 RM S.M. ... R100
  renamed\0sub\0` under BR3's exact `status` invocation) →
  `inspectWorkingTree` returns **both** a `staged_rename` entry
  (`path: "renamed"`, `oldPath: "sub"`, correct `similarity`) and an
  `unstaged_modify` entry (`path: "renamed"`), and **both** entries carry
  the identical, correctly decoded `submodule: { commitChanged: false,
  hasUntrackedContent: false, hasModifiedContent: true }` — proving
  `<sub>` is genuinely parsed from a type-2 record (not only type-1) and
  is correctly attached to every `WorkingTreeEntry` the source record
  produces, never decoded twice or attached to only one axis.
- **Submodule `<sub>`-field parsing on an unmerged (`u`) record — real
  conflicted gitlink — mandatory, new, Round 16 review finding #3B** (a
  real initialized submodule left in a genuine, unresolved merge
  conflict on the gitlink entry itself, producing the verified real
  record shape `u UU SC.. 160000 160000 160000 160000 <sha1> <sha2>
  <sha3> sub` under BR3's exact `status` invocation) → the resulting
  `conflicted` entry correctly carries `submodule: { commitChanged: true,
  hasUntrackedContent: false, hasModifiedContent: false }` (decoded from
  `SC..`), proving `<sub>` is genuinely parsed from an unmerged `u`
  record, not only type-1/type-2 records.
- **Conflicted-gitlink enumeration does not falsely trigger
  `UNSAFE_SUBMODULE_PATH` — mandatory, new, Round 16 review finding #3A**
  (a real, previously-initialized submodule checkout, its working tree
  still populated at `sub/`, with genuine, unresolved stage-1/stage-2/
  stage-3 gitlink index entries constructed for the identical path `sub`
  — first confirmed, in the test's own setup, that `git ls-files --stage
  -z` genuinely emits three separate `160000`-mode records all naming
  `sub`) → `inspectWorkingTree(projectRoot)` (and any other
  submodule-enumeration-dependent operation, e.g. the filter-discovery
  scan, §18) does **not** return `UNSAFE_SUBMODULE_PATH` merely because
  the same conflicted path appeared at three index stages — the
  enumeration correctly collapses the three stage records to one unique
  candidate path, safety-scans `sub`'s working-tree location at most
  once, and the resulting status remains representable as a legitimate
  conflicted path (a `conflicted` `WorkingTreeEntry` for `sub`, per the
  fixture immediately above) — proving index stage is never mistaken for
  a recursion/cycle identity.

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
- A nonexistent, option-shaped ref string (e.g. `--upload-pack=x`)
  passed as `fromRef`/`toRef` → rejected as `REF_NOT_FOUND` (not
  interpreted as a flag) — a rejected-input regression test
- **A genuinely valid, option-shaped ref accepted safely — mandatory,
  new, Round 15 review finding #4 (the stronger proof; an earlier
  draft's only option-safety test used a nonexistent string, which
  cannot distinguish "correctly resolved a real ref" from "failed for
  any reason at all," and an earlier draft's own normative example
  additionally used a broken `--end-of-options --` combination that
  fails even against valid input):** a real branch `refs/heads/-foo`
  created via `git update-ref` (plumbing, not `git branch`, to guarantee
  the option-shaped name regardless of `git branch`'s own name
  validation), pointing at a real commit → first confirm, in the test's
  own setup, that a bare `git rev-parse --verify '-foo^{commit}'` (no
  `--end-of-options`) genuinely misparses `-foo` and fails; then confirm
  BR3's exact, normative form — `--end-of-options` with **no** additional
  bare `--` — succeeds and returns the expected commit SHA; then call
  `inspectDiff(projectRoot, { fromRef: "-foo", toRef: <other-ref> })`
  and assert it **successfully resolves** `-foo` to that exact commit
  SHA, never treating it as a Git option and never rejecting it
- Copy detection is confirmed **disabled**: a new file with content
  closely matching an existing, unrelated, unchanged file is reported as
  a plain `added` entry, never a `copied`-shaped result (since no such
  `DiffChangeKind` value exists at all — confirmed by type-level
  exhaustiveness plus a runtime fixture)
- **Rename-limit pinning (`-l0`) — mandatory, new, Round 9 review finding
  #1:**
  - **(A) Repository-local `diff.renameLimit=1` cannot alter
    `inspectDiff` output:** a fixture with two commits differing by
    several (e.g. four) high-similarity (~90%) renamed-path pairs, and
    repository-local config `diff.renameLimit=1` set → first confirm, in
    the test's own setup, that a bare `git diff --find-renames=50%`
    (without `-l0`) against this exact fixture genuinely degrades to
    delete+add facts under this config (establishing the hazard is real);
    then call `inspectDiff` and assert **all** pairs are correctly
    reported as `renamed` with correct `oldPath`/`similarity`, proving
    `-l0` overrides the repository-local limit.
  - **(D) The `-l0` override produces identical `inspectDiff` results
    regardless of local `diff.renameLimit`:** the identical fixture as
    (A), run twice — once with `diff.renameLimit=1` set, once with the
    config key entirely absent — asserts `inspectDiff`'s results are
    **deep-equal** in both cases, proving the explicit `-l0` override
    makes the local config value irrelevant to BR3's own output.
- **Submodule/gitlink visibility pinning (`--ignore-submodules=none`) —
  mandatory, new, Round 15 review finding #1:** a fixture repository
  containing a gitlink whose recorded submodule commit genuinely changes
  between commit A and commit B, with repository-local config `git
  config diff.ignoreSubmodules all` set → first confirm, in the test's
  own setup, that the unmitigated `git diff --no-color --no-ext-diff -z
  --name-status --find-renames=<threshold> -l0 <fromSha> <toSha>` form
  (without `--ignore-submodules=none`) genuinely emits **nothing** for
  the changed gitlink path under this exact fixture and config
  (establishing the suppression is real); then call
  `inspectDiff(projectRoot, { fromRef: A, toRef: B })` and assert the
  changed submodule/gitlink path **is** returned, as a `DiffChange` with
  `kind: "modified"` and the correct `path`, proving BR3's own
  `--ignore-submodules=none` flag overrides the repository-local
  `diff.ignoreSubmodules=all` default. A second assertion in the same
  fixture confirms ordinary, non-submodule file changes elsewhere in the
  identical commit pair remain correctly reported, unaffected by this
  correction.

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
  finding #4, ownership scoped to `inspectWorkingTree` exclusively Round
  10 review finding #3 (supersedes Round 4/5's suppression-based tests
  for `filter.<driver>.clean`/`.process`; withdrawn suppression behavior
  must not reappear; supersedes reliance on config-enumeration alone,
  proven insufficient by case D below):**
  - **(A) Ordinary external clean filter → `resolveRepository` succeeds,
    `inspectWorkingTree` refuses, marker never executed — ownership
    corrected, Round 10 review finding #3:** configure a fixture
    repository with a `.gitattributes` rule assigning a `filter=<name>`
    attribute to a path, and `filter.<name>.clean` pointing at a real,
    marker-writing script (no `required` key set). Assert: (i)
    `resolveRepository(projectRoot)` **succeeds** — a filter attribute
    is not a repository-validity concern, and `resolveRepository` never
    performs the effective-filter-attribute scan at all; (ii) calling
    `inspectWorkingTree(projectRoot)` against the same fixture produces
    `EXTERNAL_GIT_FILTER_UNSUPPORTED` (§17), naming the affected path(s)
    in `details`; (iii) the marker file was **not** created — proving
    BR3 never ran `git status` at all for this repository, not merely
    that it ran it with the filter suppressed. This is the corrected,
    two-step assertion pattern every case below follows: `resolveRepository`
    succeeds, `inspectWorkingTree` alone refuses — never a joint
    `resolveRepository`/`inspectWorkingTree` claim implying both
    functions own the refusal.
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
    a config-enumeration-based approach would have been insufficient
    (config-enumeration itself is not part of BR3's contract at all —
    withdrawn entirely, Round 14 review finding #4; this fixture's
    purpose is solely to prove `check-attr` catches what a
    config-enumeration-based design would have missed, not to exercise
    any BR3-internal config-enumeration mechanism, since none exists):**
    a fixture repository's `.gitattributes` declares `*.txt filter=canon`;
    a **global** Git config (constructed in the test's own setup, visible
    only when `GIT_CONFIG_GLOBAL` is *not* overridden) declares
    `filter.canon.clean=<marker-writing, uppercase-normalizing script>`
    and `filter.canon.required=true`; the repository's own local config
    declares no filter at all. First confirm, in the test's own setup
    only (a plain, ad hoc `git config --get-regexp
    '^filter\..*\.(clean|process|smudge)$'` invocation the test harness
    runs purely to document the premise — never a BR3 code path, and
    never run under BR3's own execution environment or command
    allowlist), that this query, run under a `GIT_CONFIG_GLOBAL=<null
    device>` environment, genuinely finds **zero** matches for this
    fixture (establishing that a config-enumeration-based approach would
    have incorrectly concluded "no filter, proceed" — the exact gap
    `check-attr` closes, and the reason config-enumeration was removed
    from BR3's contract rather than merely relegated to a diagnostic
    role). Then assert `resolveRepository(projectRoot)` succeeds, and
    calling `inspectWorkingTree(projectRoot)`:
    `EXTERNAL_GIT_FILTER_UNSUPPORTED` is produced, and the marker script
    is **not** executed — proving the `check-attr`-based
    effective-attribute scan, BR3's sole filter-safety mechanism, catches
    this case.
  - **(E) Marker proves the filter never executes, including via the
    check-attr scan itself:** across every fixture above, assert the
    marker file is never created at any point during
    `resolveRepository`'s validation or `inspectWorkingTree`'s inspection
    (`inspectWorkingTree` being the **only** function the
    effective-filter-attribute scan gates — Round 9 review finding #5,
    ownership made exclusive Round 10 review finding #3) — including
    confirming `check-attr --stdin -z filter` itself, run directly
    against a filter-attributed path in isolation, does not trigger the
    marker (proving `check-attr` is genuinely non-executing, not merely
    "didn't happen to trigger it in these particular fixtures").
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
    normally (each independently — `resolveRepository` because a filter
    attribute is never a repository-validity concern; `inspectWorkingTree`
    because its own scan finds nothing active; `inspectDiff` because it
    never scans at all), proving the discovery-and-refuse mechanism does
    not introduce a false-positive refusal for the ordinary, filter-free
    case that constitutes the overwhelming majority of real repositories.
  - **(I) `inspectDiff` is genuinely independent of current working-tree/
    index/`.gitattributes` state — mandatory, new, Round 9 review finding
    #5:** a fixture with two real, existing commits `A`/`B`, and a
    `.gitattributes` rule assigning a real, marker-writing clean filter,
    added to the repository **after** both `A` and `B` already exist
    (i.e. the working tree/index, not either commit, carries the filter
    attribution) → `inspectDiff(A, B)` **succeeds** with the correct
    committed diff, and the marker script is **never** created — proving
    an unrelated, post-commit working-tree/`.gitattributes` change cannot
    cause `inspectDiff` to refuse, unlike the identical change would for
    `inspectWorkingTree`. A companion fixture assigning a `textconv` diff
    driver (rather than a `clean`/`process` filter) to a path touched by
    the diff, with a real, marker-writing `textconv` helper script, then
    calling `inspectDiff(A, B)` with the exact, documented
    `--no-color --no-ext-diff --ignore-submodules=none -z --name-status
    --find-renames=<threshold> -l0` invocation → the marker is **never**
    created, confirming
    `--no-ext-diff`/`--name-status` genuinely prevent this specific
    invocation from invoking a configured `textconv` helper.
  - **(J) Per-function ownership, explicit cross-check on one shared
    filter-configured fixture — mandatory, new, Round 10 review finding
    #3:** against **one single fixture** (a repository with a real,
    active `filter=<name>` attribute and a real, marker-writing clean
    driver, plus two real, existing commits `A`/`B` unaffected by that
    attribute's presence) — `resolveRepository(projectRoot)` →
    **succeeds** (the repository is otherwise structurally valid;
    `resolveRepository` never inspects filter attributes at all);
    `inspectWorkingTree(projectRoot)` → `EXTERNAL_GIT_FILTER_UNSUPPORTED`;
    `inspectDiff(projectRoot, A, B)` → **succeeds**, with the correct
    committed diff and the marker never created — proving, on the
    identical fixture in one test, that exactly one of the three
    functions owns the refusal, never a pair or all three.
  - **(K) No cross-call filter-scan caching — mandatory, new, Round 10
    review finding #3:** call `inspectWorkingTree(projectRoot)` against a
    fixture with **no** active filter attribute (succeeds normally);
    then, between that call and a second one, add a `.gitattributes` rule
    declaring a real, active, marker-writing filter attribute; then call
    `inspectWorkingTree(projectRoot)` again against the same `projectRoot`
    → the **second** call produces `EXTERNAL_GIT_FILTER_UNSUPPORTED`,
    proving the scan is genuinely re-run fresh on every top-level call
    and that no prior "safe" verdict is cached or reused across the two,
    separate calls — first confirmed, in the test's own setup, that this
    sequencing genuinely changes the repository's effective filter
    configuration between the two calls (not merely two identical calls
    in a row).
  - **`check-attr` mandatory, never skipped, for `inspectWorkingTree` —
    mandatory, new, Round 8 review finding #6B, scope narrowed Round 9
    review finding #5:** a call-count/invocation assertion on the shared
    exec primitive confirms `check-attr --stdin -z filter` genuinely runs
    for **every** `inspectWorkingTree` call, including case (H) above
    (zero filter attributes) — proving there is no "skip the scan when
    config-enumeration finds nothing" fast path anywhere in the
    implementation; **and**, separately, confirms `check-attr` is
    genuinely **never** invoked for `inspectDiff`, at all, for any
    input — proving `inspectDiff`'s independence from working-tree/
    index/`.gitattributes` state is a structural property of the
    implementation, not merely a semantic coincidence of its reported
    results (§13, Round 9 review finding #5).
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
  - **Gitlink `.git` pointer redirecting to a parent's own linked-worktree
    metadata — mandatory, new, Round 9 review finding #4** (the verified
    reproduction: a real parent repository `p` with a genuine linked
    worktree, `p/.git/worktrees/wt`; an ordinary, non-symlinked directory
    `p/fake` whose own `.git` file contains `gitdir:
    p/.git/worktrees/wt`) → `UNSAFE_SUBMODULE_PATH`, produced **before**
    any recursive `ls-files`/`check-attr` inspection of `p/fake` — first
    confirmed, in the test's own setup, that `git -C p/fake
    rev-parse --git-dir`/`--git-common-dir` genuinely resolve to
    `p/.git/worktrees/wt`/`p/.git` respectively (a genuine
    `gitDir !== gitCommonDir` mismatch — the child resolves as a linked
    worktree, not a self-contained submodule), that `--is-bare-repository`
    reports `false`, and that `git -C p/fake ls-files --stage` genuinely
    reads the other linked worktree's own index — establishing that this
    fixture satisfies Round 8's beneath-`--git-common-dir` check alone
    and would have incorrectly passed under that check without the added
    `gitDir === gitCommonDir` requirement (Round 9's correction) — then
    confirming BR3 itself correctly rejects it.
  - **`.git` entry itself replaced by a symlink — mandatory, new, Round 9
    review finding #4** (an otherwise-ordinary, non-symlinked gitlink
    working-tree directory whose own internal `.git` entry — not the
    working-tree path itself — is replaced with a symbolic link, e.g.
    pointing at an arbitrary directory or at a crafted file elsewhere
    containing a `gitdir:` pointer) → `UNSAFE_SUBMODULE_PATH`, proving
    the `.git`-entry-level `lstat` check (distinct from, and in addition
    to, step 3's working-tree-path-level `lstat` check) genuinely
    catches this case rather than silently following the symlink because
    a symlink-following `stat` on it would report a plausible directory
    or file shape.
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
  typed (§8, Round 6 review findings #3 and #4). **Every
  `resolveRepository`-derived safety/capability fact — the root/bare/
  worktree/submodule relationship, `gitDir`/`gitCommonDir`, object
  format, ref-storage format — is genuinely recomputed fresh on every
  top-level `resolveRepository` call, never cached across separate
  top-level operations merely because `projectRoot`'s path string is
  unchanged** — corrected, mandatory, Round 12 review finding #1B —
  proven by the dedicated fixture (§20) where the repository metadata at
  one fixed `projectRoot` is replaced/reinitialized between two
  top-level calls (SHA-256 and `reftable` subcases), with the second
  call correctly producing `UNSUPPORTED_OBJECT_FORMAT`/
  `UNSUPPORTED_REF_FORMAT` rather than reusing the first call's
  "supported" verdict.
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
  human-readable stderr text (§9, §10). `branch.<branch>.merge` is
  genuinely read via `--get-all`, never a bare `--get` — corrected,
  Round 9 review finding #2 — so a legal, multi-valued `.merge`
  configuration (octopus-merge-style) yields a single, internally
  consistent `UpstreamInfo` where `branch` is derived from the same
  first configured value `ref`/`sha` (via `@{upstream}`) already
  resolve, never a mismatched combination of the first and last
  configured values.
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
  untracked/conflicted/submodule states, using the exact command `git -c
  core.fsmonitor= -c status.renameLimit=0 -c status.showStash=false
  status --porcelain=v2 -z --find-renames=50% --untracked-files=all
  --ignore-submodules=none` (§11, `-c status.renameLimit=0` added Round 9
  review finding #1, `-c status.showStash=false` added Round 16 review
  finding #2), with §11/§19/§20/§27 all agreeing on that exact command —
  and never runs
  this command at all for a repository where the effective-filter-attribute
  scan (§18) found an active `filter` attribute anywhere in scope,
  superproject- or initialized-submodule-local, producing `EXTERNAL_GIT_FILTER_UNSUPPORTED`
  instead (Round 6 review finding #1, Round 7 review finding #4).
- **E.** `inspectDiff` correctly resolves both input refs via
  `git rev-parse --verify --end-of-options <ref>^{commit}` before any
  `diff` invocation runs, always constructs the subsequent `git diff`
  call using only the resolved SHAs (never the caller's original ref
  strings), invokes `diff` with `-l0` so a repository-local
  `diff.renameLimit` cannot silently degrade a genuine rename into
  delete+add facts (§13, §14, Round 9 review finding #1), and correctly
  classifies added/modified/deleted/renamed(above threshold)/type-changed
  changes while confirming copy detection is genuinely disabled (§13,
  §14, §15) — **and genuinely depends on no current working-tree/index/
  `.gitattributes` state**: `inspectDiff` never runs, and never depends
  on the result of, the `check-attr`-based effective-filter-attribute
  scan §18 mandates for `inspectWorkingTree` — a `.gitattributes`
  change made to the working tree after both `fromSha`/`toSha` already
  exist as commits does not alter `inspectDiff`'s result (§13, Round 9
  review finding #5).
- **F.** A nonexistent, flag-shaped ref string (e.g. `--upload-pack=x`)
  passed as `DiffRequest.fromRef`/`.toRef` is genuinely rejected as
  `REF_NOT_FOUND` — proven by an actual regression test constructing
  exactly this input, not merely documented as rejected; **and,** the
  stronger proof — Round 15 review finding #4 — a genuinely **valid**,
  option-shaped ref (a real `refs/heads/-foo` created via `git
  update-ref`) is correctly **accepted and resolved**, never rejected or
  misinterpreted as a flag, by BR3's exact normative
  `--end-of-options`-with-no-additional-bare-`--` command form (§13,
  §18, §20).
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
  `symbolic-ref`, `config` (read-only `--get`/`--get-all` only —
  `--get-all` named explicitly, Round 9 review finding #2, for
  multi-valued `branch.<branch>.merge` reads; `--get-regexp` is not
  used anywhere in BR3's contract — config-enumeration is withdrawn
  entirely, Round 14 review finding #4), `ls-files` (read-only
  `--stage -z` only, for submodule enumeration — §18, Round 6 review
  finding #2), `check-attr` (read-only, non-executing, `--stdin -z
  filter` only, for effective-filter-attribute
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
  `GIT_DIR`), with only BR3's own eight controlled `GIT_*` variables
  (`GIT_PAGER`, `GIT_TERMINAL_PROMPT`, `GIT_OPTIONAL_LOCKS`,
  `GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL`, `GIT_ATTR_NOSYSTEM`,
  `GIT_NO_LAZY_FETCH`, `GIT_NO_REPLACE_OBJECTS` — the last new in Round
  16), always added in one
  canonical uppercase form with no case-variant duplicate ever present,
  re-added, `XDG_CONFIG_HOME` overridden to a fresh empty directory (new
  in Round 4, §19), the effective `PATH` key normalized via one
  exact, **platform-specific** rule — on POSIX, exactly the key `PATH`,
  never a differently-cased `Path`/`path` variable, which remains an
  untouched, unrelated variable; only on Windows are multiple case
  variants collapsed to one deterministic value (corrected, Round 8
  review finding #4, made platform-correct Round 10 review finding #2 —
  Round 8's uniform-case-insensitive rule was itself wrong on POSIX,
  where it could incorrectly promote an unrelated `Path` variable into
  the executable search path) — and global (non-repository-local) Git
  config is neutralized via `GIT_CONFIG_GLOBAL` pointed at a null
  device — proven by the environment-sanitization regression tests (§20,
  Round 3 review finding #2: inherited `GIT_DIR`, inherited
  `GIT_INDEX_FILE`, `GIT_CONFIG_COUNT`-style injection, fabricated
  global `core.excludesFile`; Round 8 review finding #4: inherited
  lowercase `git_dir`, inherited mixed-case `Git_Index_File`; Round 10
  review finding #2: POSIX `PATH`-vs-`Path` exactness, POSIX
  absent-`PATH`-never-filled-from-`Path`; Round 11 review finding #1:
  POSIX absent-`PATH` correctly falls back to the documented
  `/usr/bin:/bin` default, never "nothing to search"; and Windows
  duplicate-cased-`PATH` collapsing — none of which may alter BR3's
  result or produce an ambiguous effective
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
  check (§8, §20). **The capability-check result is never cached across
  separate top-level BR3 operations, under any keying scheme — including
  keying by the resolved, canonicalized executable path** — corrected,
  mandatory, Round 12 review finding #1A: a binary can be replaced at an
  unchanged pathname between two top-level operations, and reusing an
  earlier "supported" verdict for that unchanged path would silently
  bypass the fresh version check the capability floor exists to enforce
  — proven by the dedicated same-pathname-different-binary fixture (§20)
  showing a below-floor replacement at the identical resolved pathname is
  genuinely re-detected and rejected on the next top-level call. **(ii)** A repository whose object format is not
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
  reporting an unsupported format (§8, §20). **This decision is
  recomputed fresh on every top-level `resolveRepository` call against
  `projectRoot`, never cached across separate top-level operations
  merely because `projectRoot`'s path string is unchanged** — corrected,
  mandatory, Round 12 review finding #1B — proven by the dedicated
  fixture (§20) where the repository at one fixed `projectRoot` is
  reinitialized with the `reftable` backend between two top-level
  calls, with the second call correctly producing
  `UNSUPPORTED_REF_FORMAT` rather than reusing the first call's
  `files`-backend "supported" verdict.
- **R.** — new, Round 7 review finding #2. `unstaged_rename` is genuinely
  reachable only via the verified construction (a plain filesystem rename
  plus `git add -N` intent-to-add against the new path — test/fixture
  setup only) — a plain filesystem rename **without** that step is
  correctly, separately proven to produce `unstaged_delete` + `untracked`
  rather than a synthesized rename, and no statement anywhere in this
  document any longer implies an ordinary filesystem rename alone
  reliably produces porcelain v2's `2 .R` record (§11, §14, §20).
- **S.** — new, Round 7 review finding #3, mechanism corrected Round 8
  review finding #2, finalized Round 9 review finding #3, `PATH`-absent
  and Windows-resolver corrected Round 11 review findings #1/#2. BR3
  resolves the `git` executable itself, in process (never by inspecting
  anything `execFile` exposes, which does not surface the resolved path
  — Node's `spawnfile`/`spawnargs` report only the literal, unresolved
  command string), to one absolute, canonicalized path **before**
  invoking it, using the identical sanitized child environment/`PATH`
  every subsequent Git command will use. **(i)** Resolution uses exactly
  **one** fixed resolver `cwd` (`process.cwd()`) for the entire
  top-level operation — never a per-call `cwd` — with every `PATH`
  entry (relative, absolute, or empty) normalized against that single
  resolver `cwd` before being searched, resolving the Round 9
  contradiction between "resolve per-call" and "reuse one path across
  all calls" (§8). **(ii)** On POSIX, only the exact key `PATH` is ever
  consulted; when `PATH` is genuinely absent, resolution uses the
  documented Node/libuv default, `/usr/bin:/bin` — never "nothing to
  search," and never a promoted, differently-cased `Path`/`path` value
  (§8, §19, Round 11 review finding #1). **(iii)** On Windows, BR3
  deliberately implements its own, stricter resolver — not a claimed
  mirror of Node/libuv's own bare-command lookup, which does not consult
  `PATHEXT` at all — searching only the already-sanitized `PATH`
  directories, in order, for a literal `git.exe` filename exclusively;
  `.cmd`/`.bat`/any other extension is never accepted as a candidate,
  `PATHEXT` is never consulted, and no implicit current-working-directory
  search occurs; a `PATH` with no usable `git.exe` produces exactly
  `GIT_EXECUTABLE_UNAVAILABLE`, never an "implementation's choice"
  alternative code (§8, §18, Round 11 review finding #2). **(iv)**
  Ambiguous multi-cased `PATH`-family keys are resolved via one exact,
  documented selection rule (ordinally-first matching key name),
  **Windows-only** — never on POSIX, and never "implementation's
  choice" (§19). Every Git command in one top-level BR3 operation — the
  capability check itself, `resolveRepository`, `inspectHead`,
  `inspectWorkingTree`, `inspectDiff`, `ls-files`, `check-attr`, and
  every nested submodule call — is invoked with that identical resolved
  path, never the bare literal `"git"` again (§18 no longer contains a
  stale `execFile("git", ...)` example); a subsequent top-level
  operation re-resolves and revalidates rather than trusting a
  capability result cached against a since-changed `PATH`/resolution
  outcome (§8, §18, §20). **(v)** — new, Round 12 review finding #1.
  The capability result is never cached across separate top-level
  operations under any keying scheme, including by resolved executable
  path — a binary replaced at an unchanged pathname between two
  top-level calls is genuinely re-detected and revalidated, never
  silently trusted merely because the path string is unchanged; and
  this specification explicitly states that reusing one resolved path
  within an operation does not create a mechanically-enforced,
  OS-level executable-identity snapshot against a concurrently
  replacing actor — only an assumption of stability during one
  operation, exactly mirroring §6's identical, explicit
  `check-attr`-then-`status` concurrency boundary. **(vi)** — new,
  Round 12 review finding #2. Each `PATH`-directory candidate is
  validated against an exact filesystem-shape requirement, not merely a
  permission/existence check: on POSIX, a candidate must be a regular
  file (after symlink resolution) with execute permission — a directory
  (even one with execute/search permission set), a non-regular
  filesystem object, or a broken symlink is rejected and the search
  continues to later `PATH` entries; on Windows, a `git.exe`-named
  candidate must resolve to a non-directory, regular-file executable
  target — a directory or broken link named `git.exe` is rejected and
  the search likewise continues (§8, §20).
- **T.** — new, Round 7 review finding #4, scope narrowed to
  `inspectWorkingTree` only Round 9 review finding #5. BR3's
  external-filter detection genuinely determines repository-*effective*
  filter-attribute usage (via `git check-attr --stdin -z filter` over
  every relevant tracked path, superproject and every initialized
  submodule recursively) before `inspectWorkingTree`'s `status`
  invocation — never before `inspectDiff`'s commit-vs-commit `diff`
  invocation, which depends on no current working-tree/index state at
  all — not merely whether a filter *driver command* remains visible
  after `GIT_CONFIG_GLOBAL` is neutralized for the actual inspection
  commands — so a `.gitattributes` rule whose corresponding driver is
  defined only in a global config BR3 intentionally hides still produces
  `EXTERNAL_GIT_FILTER_UNSUPPORTED`, never a silently-wrong working-tree
  fact, while `inspectDiff(A, B)` remains genuinely unaffected by any
  current working-tree/index/`.gitattributes` state changed after `A`
  and `B` were committed (§13, §18, §20).
- **U.** — new, Round 7 review finding #5, extended to cover repository
  metadata identity and the parent→child relationship, Round 8 review
  finding #3, tightened to exclude linked-worktree metadata and the
  `.git`-entry-itself symlink case, Round 9 review finding #4. Recursive
  initialized-submodule enumeration (§18) is genuinely safe against: a
  gitlink working-tree path replaced by a symbolic link (detected via
  `lstat`, never followed); the gitlink's own `.git` *entry* (one level
  inside an accepted, non-symlinked working-tree directory) replaced by
  a symbolic link (detected via a second, independent `lstat`); a
  repository working-tree-root cycle (via a visited-canonical-working-tree-root
  set); a `.git` pointer file that redirects a genuinely non-symlinked,
  ordinary-directory gitlink path's metadata (`--git-dir`/
  `--git-common-dir`) to the parent's own metadata, to an unrelated
  external repository, to an already-visited metadata identity (via an
  independent visited-canonical-metadata-identity set, checked whether
  or not the working-tree root itself is already known), or to a
  location genuinely beneath the parent's own `--git-common-dir` that is
  nonetheless a **linked-worktree** metadata directory rather than
  self-contained submodule metadata (rejected via the added
  `gitDir === gitCommonDir` requirement on every accepted child, since a
  linked worktree has `gitDir !== gitCommonDir` by this specification's
  own existing derivation, §8) — failing deterministically with
  `UNSAFE_SUBMODULE_PATH` rather than looping indefinitely, aliasing an
  already-visited repository undetected, or escaping into an unrelated,
  externally-targeted, or linked-worktree-redirected repository, and
  never recursively inspecting the aliased/external/worktree repository
  before the refusal is produced (§18, §20).
- **V.** — new, Round 7 review finding #6. Every repository-derived (not
  merely caller-derived) revision expression BR3 constructs — in
  particular `<branch>@{upstream}` in upstream resolution — is protected
  by `--end-of-options` exactly as caller-supplied `DiffRequest` refs
  already are, proven by a real fixture using a branch literally named
  `-foo` with a valid local upstream (§9, §10, §20).
- **W.** — new, Round 9 review finding #1. Rename-search-limit semantics
  are pinned, not merely rename-similarity threshold: `inspectWorkingTree`'s
  `status` invocation includes `-c status.renameLimit=0` and
  `inspectDiff`'s `diff` invocation includes `-l0`, both mandatory and
  unconditional, so a repository-local `status.renameLimit`/
  `diff.renameLimit` config value (including `status.renameLimit`'s own
  fallback to `diff.renameLimit` when unset) can never cause BR3 to
  silently report a genuine, above-threshold rename as delete+add facts
  instead — proven by dedicated real fixtures for both functions, each
  first establishing the hazard is real (an unmitigated invocation
  against the identical fixture does degrade under the tested config
  value) before proving BR3's own, corrected invocation does not (§11,
  §13, §14, §20).
- **X.** — new, Round 9 review finding #5. `inspectDiff` is genuinely
  independent of current working-tree/index/`.gitattributes` state: it
  never runs, and never depends on the result of, the `check-attr`-based
  effective-filter-attribute scan §18 mandates for `inspectWorkingTree`
  only — proven by the dedicated real fixture where a `.gitattributes`
  rule assigning a real, marker-writing clean filter is added to the
  working tree *after* both diffed commits already exist, confirming
  `inspectDiff(A, B)` still succeeds with the correct committed diff and
  the marker is never created, and confirming, structurally, that
  `check-attr` is never invoked at all as part of `inspectDiff` (not
  merely that its result happens not to matter) (§13, §18, §20).
- **Y.** — new, Round 10 review finding #1. Every repository-controlled
  textual output BR3's public API exposes as a JS string (ref/branch
  names, `UpstreamInfo.remote`/`.ref`/`.branch`, `RepositoryInfo.root`/
  `.gitDir`/`.gitCommonDir`, and every other Category 2 value, §13) is
  decoded via the identical strict `TextDecoder({ fatal: true })`
  pipeline already established for working-tree/diff paths — never
  assumed to be "guaranteed ASCII." A valid-UTF-8, non-ASCII value (e.g.
  a branch named `café`) round-trips exactly; a genuinely non-UTF-8 ref/
  branch/config value (verified reachable — Git permits raw non-UTF-8
  bytes in a ref name) produces `MALFORMED_GIT_OUTPUT`, never a silent
  U+FFFD substitution. Fixed machine tokens (SHAs, `true`/`false`,
  `sha1`/`sha256`, status letters) remain validated against their own
  exact, fixed ASCII grammar, a genuinely distinct mechanism from the
  Category 2 strict decode (§13, §20).
- **Z.** — new, Round 10 review finding #2, `PATH`-absent behavior
  corrected Round 11 review finding #1. The `PATH`-key-normalization
  algorithm (§19) is genuinely platform-specific: on POSIX, only the
  exact key `PATH` is the process search path — a differently-cased
  `Path`/`path` key is an unrelated, untouched variable, never promoted
  into `PATH` under any circumstance, including when `PATH` itself is
  absent; only on Windows are multiple case-insensitive `PATH`-family
  keys collapsed to one deterministic value via one exact, documented
  rule. This corrects Round 9's own, itself-incorrect
  uniform-case-insensitive-on-every-platform rule, verified to silently
  promote an unrelated POSIX `Path` variable into the executable search
  path, contradicting a real `execFile` call's own observed behavior
  under the identical environment. **When `PATH` is genuinely absent on
  POSIX, resolution uses the fixed `/usr/bin:/bin` default — the
  documented Node/libuv fallback — never "nothing to search"** (Round
  11 review finding #1, correcting a direct self-contradiction: an
  earlier draft's own recorded reproduction already showed the real
  system `git` resolving successfully under exactly this condition,
  while its normative rule claimed `GIT_EXECUTABLE_UNAVAILABLE`
  instead) (§8, §19, §20).
- **AA.** — new, Round 10 review finding #3. The effective-filter-attribute
  scan is owned by `inspectWorkingTree` exclusively — `resolveRepository`
  and `inspectHead` never perform it and never return
  `EXTERNAL_GIT_FILTER_UNSUPPORTED`; `inspectDiff` never performs it and
  never returns this code for any input. The scan runs fresh,
  unconditionally, on every top-level `inspectWorkingTree` call, with no
  result ever cached or reused across two separate calls — proven by a
  dedicated fixture where an active filter attribute is legitimately
  added to `.gitattributes` between two `inspectWorkingTree` calls
  against the identical `projectRoot`, with the second call correctly
  refusing. This specification explicitly states its concurrency/TOCTOU
  scope boundary (§6): BR3 assumes the repository's relevant
  configuration is not concurrently, adversarially mutated during one
  `inspectWorkingTree` call's own internal `check-attr`-then-`status`
  subprocess sequence, and does not claim an atomic filesystem snapshot
  across those two separate Git processes (§6, §18, §20).
- **AB.** — new, Round 10 review finding #4, revised, Round 15 review
  finding #1, revised again, Round 16 review finding #2. Exactly one
  canonical `status` invocation (`git -c core.fsmonitor= -c
  status.renameLimit=0 -c status.showStash=false status --porcelain=v2
  -z --find-renames=50% --untracked-files=all --ignore-submodules=none`)
  and exactly one canonical `diff` invocation (`git diff --no-color
  --no-ext-diff --ignore-submodules=none -z --name-status
  --find-renames=<threshold> -l0 <fromSha> <toSha>`) are stated
  identically everywhere this document names "the exact command" — §11,
  §13, §19, §20, and §27 no longer contain a stale restatement omitting
  `-c status.renameLimit=0`, `-l0`, (Round 15) `diff`'s
  `--ignore-submodules=none`, or (Round 16) `status`'s `-c
  status.showStash=false`; and the command allowlist
  (`status`, `diff`, `rev-parse`, `symbolic-ref`, `config`
  (`--get`/`--get-all` only — `--get-regexp` removed entirely, Round 14
  review finding #4), `ls-files`, `check-attr`) is stated identically
  everywhere it appears, with no remaining reference to `config`
  supporting `--get-regexp` anywhere in the current contract (§11, §13,
  §18, §19, §20, §27).
- **AC.** — new, Round 13 review finding #1. §8/§18's process-security
  wording states the honest, narrower guarantee — "BR3 itself never
  requests a shell or performs shell-string interpolation; Git is
  invoked through a resolved executable path with a separate argv array"
  — never the overclaim "there is no shell in the invocation path at
  all," which is verifiably false on POSIX (a `chmod +x` executable text
  file with no shebang can still be run through an interpreter-fallback
  behavior when invoked via `execFile` with `shell: false` — attributed
  precisely, Round 14 review finding #5: the kernel itself only reports
  `ENOEXEC` for the unsuitable executable image; it is the
  `execvp`-family/libuv runtime execution path, never the kernel, that
  may act on that report by re-attempting the exec via an interpreter).
  The resolved Git executable is explicitly
  documented as a **trusted environment dependency** BR3 verifies the
  reported version of but does not authenticate — a categorically
  different, and separately still fully mandatory, threat boundary from
  the repository-controlled external-helper protections (content
  filters, `core.fsmonitor`, `--no-ext-diff`), which remain unweakened
  by this correction (§6, §18, §20).
- **AD.** — new, Round 13 review finding #2. Every repository-controlled,
  potentially multi-valued or embedded-newline-bearing Git config value
  BR3 consumes (`branch.<branch>.remote`/`.merge`) is read via `-z`, with
  raw `Buffer` output NUL-split before any decoding, then each complete
  value strict-UTF-8-decoded individually (§13 Category 2) — never
  line-split, and never assumed to be free of embedded newlines.
  `extensions.refStorage` (§8 step 5b) is a distinct, single-valued,
  fixed-machine-token config fact (§13 Category 1: its only meaningful
  outcomes are "absent," `files`, `reftable`, or another short,
  unrecognized token — never free-form repository-controlled text) and
  is correctly read via a bare `--get`, never requiring `-z`; this
  specification never conflates the two config-value categories or
  their differing read disciplines (§8, §13). A `branch.<branch>.merge`
  value whose own content contains an embedded newline is correctly
  recognized as
  one complete configured value, never fabricating an extra value out of
  the embedded newline (§9, §10, §20).
- **AE.** — new, Round 13 review finding #3. `UpstreamInfo` correctly
  models that a configured upstream target need not be a branch: `mergeRef`
  preserves the exact, complete, first configured `branch.<b>.merge`
  value verbatim, regardless of namespace (`refs/heads/...`,
  `refs/tags/...`, or any other `refs/...` path); `branch` is populated
  only when `mergeRef` genuinely begins with `refs/heads/`, and is
  `null` otherwise — a local tag or custom-namespace upstream target is
  never mischaracterized as a branch (§7a, §9, §10, §20).
- **AF.** — new, Round 13 review finding #4, revised, Round 14 review
  finding #1. **(A)** A symbolic branch — normal or unborn — with
  `branch.<name>.remote`/`.merge` genuinely configured in `.git/config`
  reports a non-null, genuinely configured `UpstreamInfo`; the identical
  `@{upstream}` resolution procedure is attempted regardless of unborn
  status — `ref`/`sha` are populated whenever that resolution genuinely
  succeeds (which does not require the current branch itself to have any
  commits, only that the *configured target* exists), and are `null`
  only when resolution genuinely fails — never collapsed to an
  undifferentiated `upstream: null`, which would conflate "configured but
  currently unresolvable" with "not configured at all," the identical
  distinction this specification already enforces for every other
  configured-but-unresolvable shape (§9, §20). **(B)** §11's porcelain v2
  submodule-marker table row and prose correctly describe `<sub>`
  (`S<c><m><u>`) as its own, independent, separate record field — never
  as residing "in" or "adjacent to" `<XY>` in a way that could be read as
  requiring a search within `<XY>` itself — with a real dirty-submodule
  fixture (`1 .M S.M. ...`) proving the parser reads the two fields
  independently (§11, §20).
- **AG.** — new, Round 14 review finding #1. §9/§10's `@{upstream}`
  resolution procedure runs identically for a normal or an unborn current
  branch — unborn status is never, by itself, treated as a resolution
  failure. `ref: null`/`sha: null` are reported only when
  `<branch>@{upstream}` genuinely fails to resolve (the configured
  target itself does not exist), proven by a fixture where an unborn
  current branch's configured upstream target genuinely exists
  (`upstream.ref`/`.sha` both populated) and a second fixture where it
  does not (`upstream.ref`/`.sha` both null) (§9, §20).
- **AH.** — new, Round 14 review finding #2. `UpstreamInfo.sha` has
  exactly one meaning for every supported `mergeRef` namespace: the raw
  object ID `git rev-parse --verify -q --end-of-options
  <branch>@{upstream}` returns, with no `^{commit}` peel performed or
  implied. Never called a "commit SHA," "branch tip commit," or
  "resolved commit" except when explicitly scoped to a
  `refs/heads/*`-or-remote-tracking-branch target — proven by a dedicated
  annotated-tag fixture where `sha` equals the tag object's own SHA and
  explicitly differs from the peeled commit SHA (§7a, §9, §10, §20).
- **AI.** — new, Round 14 review finding #3. §10 is fully reconciled with
  §7a's `UpstreamInfo` interface: no remaining restatement of the
  superseded `{ remote, ref, branch, sha }` shape omitting `mergeRef`,
  and no remaining claim that `remote`/`branch` "remain populated" for
  every configured-but-unresolvable upstream — `branch`'s nullability is
  purely a function of `mergeRef`'s namespace, independent of
  resolvability. Exactly one authoritative `UpstreamInfo` contract exists
  across §7a/§9/§10 (§20).
- **AJ.** — new, Round 14 review finding #4. `git config --get-regexp`
  filter-driver-definition enumeration is removed entirely from BR3's
  contract — not retained even as an optional diagnostic. The command
  allowlist (§5, §6, §18, §20, §27) lists only `config --get`/`--get-all`;
  `check-attr --stdin -z filter` is BR3's sole, self-sufficient
  filter-safety mechanism, requiring no driver-definition enumeration of
  any kind (§18, §20).
- **AK.** — new, Round 14 review finding #5 (wording cleanup only). §6/§8/§18
  never attribute an interpreter/shell fallback to the OS kernel itself —
  the kernel only reports `ENOEXEC` for an unsuitable executable image;
  the `execvp`-family/libuv runtime execution path is what may act on
  that report. The Round 13 trust-boundary conclusion itself (no shell
  requested, no shell interpolation, trusted-but-unauthenticated resolved
  executable) is unchanged (§6, §8, §18).
- **AL.** — new, Round 15 review finding #1. `inspectDiff`'s exact,
  canonical `diff` invocation includes `--ignore-submodules=none`,
  identically restated everywhere the command appears (§13, §19, §20,
  §20a, §20b, §27) — proven by the dedicated fixture where repository-local
  `diff.ignoreSubmodules=all` config is confirmed (in test setup) to
  suppress a changed gitlink path under the unmitigated command form,
  while BR3's actual `--ignore-submodules=none`-bearing invocation
  correctly reports it as a `modified` `DiffChange` (§13, §20).
- **AM.** — new, Round 15 review finding #2. No acceptance criterion or
  independent-review bullet anywhere in this specification restates
  Round 13's withdrawn "configured but currently unresolvable because
  the branch is unborn" assumption as current, normative behavior —
  every such passage reflects Round 14's corrected contract: unborn
  status alone never forces `ref`/`sha` null, only a genuine `@{upstream}`
  resolution failure does (§9, §10, §20, §27).
- **AN.** — new, Round 15 review finding #3. §18's `check-attr`
  filter-safety scan is described, everywhere it appears, as gating only
  `inspectWorkingTree`'s own `status` invocation — no remaining sentence
  pairs `status`/`diff` as though both are gated by this scan;
  `inspectDiff`'s independence from this scan (already established,
  §13's Round 9 review finding #5 correction) is unchanged and
  unweakened (§18, §20, §27).
- **AO.** — new, Round 15 review finding #4. §13's `inspectDiff`
  ref-resolution "Verified directly" example, and every restatement of
  it, use BR3's exact normative form — `--end-of-options` with **no**
  additional bare `--` — demonstrated against a genuinely valid,
  option-shaped ref (`refs/heads/-foo`, created via `git update-ref`),
  proving BR3 correctly accepts and resolves a real option-shaped ref
  rather than merely rejecting a nonexistent one. Zero remaining example
  anywhere in this document combines `--end-of-options` with an
  additional bare `--` as though that combination were BR3's own
  command or a stronger safety measure (§13, §20).
- **AP.** — new, Round 16 review finding #1. `GIT_NO_REPLACE_OBJECTS=1`
  is one of BR3's eight controlled `GIT_*` variables, unconditionally
  re-added after the `GIT_*`-prefix strip, applied to every BR3 Git
  subprocess. No `refs/replace/*` ref can alter any SHA, diff content, or
  working-tree fact BR3 reports — proven by dedicated fixtures for both
  `inspectDiff` (a replacement commit with a different tree) and
  `inspectWorkingTree` (a replacement ref for `HEAD`), each first
  confirming the unmitigated hazard is real, then confirming BR3's actual
  output is unaffected (§18, §19, §20).
- **AQ.** — new, Round 16 review finding #2. BR3's canonical `status`
  invocation includes `-c status.showStash=false`, unconditionally,
  identically restated everywhere the command appears (§11, §19, §20,
  §20a, §27). A repository having a real stash, with repository-local
  `status.showStash=true` set, never causes `inspectWorkingTree` to
  produce `MALFORMED_GIT_OUTPUT` or any stash-shaped pseudo-entry — proven
  by the dedicated fixture confirming the unmitigated `# stash` header
  hazard is real, then confirming BR3's actual invocation suppresses it
  (§11, §20).
- **AR.** — new, Round 16 review finding #3. **(A)** The initialized-submodule
  enumeration mechanism (§18) collapses `git ls-files --stage -z`'s
  gitlink records to unique repository-relative candidate paths before
  any `lstat`/validation/visited-set/recursion step runs — a legitimately
  conflicted gitlink represented at multiple index stages is
  safety-scanned at most once and never produces a false
  `UNSAFE_SUBMODULE_PATH`, proven by a real three-stage conflicted-gitlink
  fixture. **(B)** `<sub>` is parsed from every porcelain v2 record type
  that carries it — type `1`, type `2`, and unmerged `u` — not type `1`
  alone, with the decoded `SubmoduleState` attached identically to every
  `WorkingTreeEntry` one source record produces, proven by dedicated
  type-2-rename and unmerged-conflict fixtures in addition to the
  existing type-1 fixture (§11, §18, §20).
- **AS.** — new, Round 16 review finding #4. `resolveRepository`'s
  post-Git-failure secondary classifier checks `projectRoot`'s own
  ancestor chain, not only `projectRoot` itself, for a plausible non-bare
  repository marker before concluding `NOT_A_GIT_REPOSITORY` — a
  `projectRoot` nested inside a real repository whose own config is too
  malformed for Git to establish a toplevel correctly reports
  `GIT_COMMAND_FAILED`, never `NOT_A_GIT_REPOSITORY` and never
  `PROJECT_ROOT_MISMATCH` (reserved exclusively for the healthy path),
  proven by a dedicated four-fixture regression (healthy nested
  directory, plain non-Git directory, malformed repository root,
  malformed repository parent with a nested `projectRoot`) (§8, §17, §20).

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
   resolution-rule branches — the exact-`git.exe`-filename Windows
   resolver, §8, Round 11 review finding #2, and §19's Windows-casing
   correction; `PATHEXT` is never consulted, per §8's corrected Windows
   resolver) — none of which `node:child_process`/`node:util` alone
   provide). Every
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
8. **Adversarial-concurrent-mutation-safe content-filter detection.**
   BR3 v0.1's `EXTERNAL_GIT_FILTER_UNSUPPORTED` guarantee (§6, §18) is
   explicitly scoped to a repository that is not concurrently,
   adversarially mutated during one `inspectWorkingTree` call's own
   internal `check-attr`-then-`status` subprocess sequence — BR3 does not
   claim an atomic filesystem snapshot across those two separate Git
   processes. A future phase requiring a guarantee that holds even
   against a deliberately, concurrently hostile mutator during that
   narrow window would need an atomic/sandboxed inspection mechanism
   (e.g. a filesystem snapshot, or a lock held across both subprocesses)
   this specification does not define — this is a resolved, explicitly
   stated v0.1 scope boundary, not an unstated gap.

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
  #4) and re-adding only BR3's own eight controlled `GIT_*` variables, in
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
- Whether every BR3 `git status` invocation genuinely includes both the
  mandatory `-c core.fsmonitor=` override (still a suppression, never a
  refusal trigger — §18, Round 6 review finding #1 explicitly retains
  this) and the mandatory `-c status.renameLimit=0` override (§11, Round
  9 review finding #1, reconciled with §19's own restated exact command
  Round 10 review finding #4), proven by the dedicated real
  marker-script and rename-limit regression tests §20 adds — not merely
  documented
- **Withdrawn-mechanism regression check, ownership corrected — new,
  Round 6 review finding #1, ownership made exclusive to
  `inspectWorkingTree` Round 10 review finding #3:** whether `-c
  filter.<name>.clean=`/`-c filter.<name>.process=` suppressing overrides
  (Round 4/5's design) are genuinely **absent** from the implementation
  entirely — confirmed by literally searching the implementation for
  these exact flag strings, which must not appear anywhere `status`
  argv is constructed — and whether, in their place, effective-filter-attribute
  detection causes a genuine, deterministic `EXTERNAL_GIT_FILTER_UNSUPPORTED`
  refusal **before** `inspectWorkingTree`'s own `status` invocation ever
  runs — **never before an `inspectDiff` invocation, which never scans
  and never returns this code at all** — proven by the dedicated real
  marker-script regression tests §20 adds (cases A–K), including: an
  ordinary clean filter (marker never executed, typed refusal returned,
  with `resolveRepository` on the identical fixture succeeding — case
  A); a `filter.<driver>.required=true` driver producing the identical
  typed refusal rather than an undifferentiated `GIT_COMMAND_FAILED`; a
  `process`-protocol driver; a filter-free repository remaining fully,
  normally inspectable (no false-positive refusal); whether an attribute
  configured solely inside a first-level or nested **initialized**
  submodule's own `.gitattributes` is discovered and also produces the
  refusal on the single top-level `status` invocation — not merely by
  the superproject-only case continuing to pass unmodified; whether an
  uninitialized submodule is correctly excluded from this enumeration
  (checked via plain filesystem inspection of the submodule's own `.git`
  entry, never by initializing it); whether `resolveRepository`,
  `inspectWorkingTree`, and `inspectDiff` each independently produce the
  correct, function-specific result against one shared filter-configured
  fixture (case J); and whether the scan is genuinely re-run fresh on
  every top-level `inspectWorkingTree` call, with no cross-call caching
  of a prior "safe" verdict (case K)
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
  for `inspectWorkingTree`'s actual `status` invocation (and every other
  BR3 Git invocation) — this correction does not re-enable arbitrary
  global Git config to make filter discovery possible, it changes what
  question discovery asks
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
  test confirming `check-attr` runs unconditionally before every
  `inspectWorkingTree` call's own `status` invocation, including the
  zero-filter-attribute case, and genuinely never runs at all for
  `inspectDiff`; **and** whether the exact NUL-delimited `check-attr --stdin -z
  filter` output shape (`<path>\0filter\0<value>\0` triples per queried
  path, never a flat one-field-per-NUL assumption) is explicitly defined
  and correctly parsed, with the exact inactive-value taxonomy
  (`unspecified`/`unset` = inactive; `set`/any named value = active)
  tested directly, not merely asserted
- **Filter-scan ownership, caching, and concurrency boundary — new,
  mandatory, Round 10 review finding #3:** whether the
  effective-filter-attribute scan is genuinely owned by
  `inspectWorkingTree` **exclusively** — `resolveRepository` never
  performs it and never returns `EXTERNAL_GIT_FILTER_UNSUPPORTED` solely
  because a repository's working tree contains an active filter
  attribute; `inspectHead` never performs it; `inspectDiff` never
  performs it and never returns this code for any input — proven by the
  dedicated cross-function fixture (§20, case J) asserting all three
  functions' independent, correct results against one shared
  filter-configured repository; **and** whether the previous, withdrawn
  "cache the scan result once per `resolveRepository`-validated
  `projectRoot`" permission has been fully removed — a fresh,
  unconditional scan runs on **every** top-level `inspectWorkingTree`
  call, with no result ever reused across two separate calls — proven by
  the dedicated cross-call fixture (§20, case K), where `.gitattributes`
  is legitimately changed to add an active filter attribute between two
  `inspectWorkingTree` calls against the identical `projectRoot`, and the
  second call correctly refuses rather than trusting a stale, cached
  "safe" verdict from the first; **and** whether this specification
  explicitly, honestly states its concurrency/TOCTOU boundary — that BR3
  assumes the repository/index/working-tree configuration relevant to
  one `inspectWorkingTree` call is not concurrently, adversarially
  mutated *during* that one call's own internal
  `check-attr`-then-`status` subprocess sequence, and does not claim an
  atomic filesystem snapshot across those two separate Git processes —
  rather than silently implying a stronger, mechanically unenforceable
  guarantee
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
- **Linked-worktree metadata exclusion and `.git`-entry-itself symlink
  rejection — new, mandatory, Round 9 review finding #4 (tightens Round
  8's parent→child relationship validation, which was too broad):**
  whether the "child `.git` pointer resolves beneath the parent's
  `--git-common-dir`" acceptance rule (§18 step 4a) is genuinely
  supplemented with a mandatory `gitDir === gitCommonDir` check on the
  child itself — never accepting a child purely because its metadata
  location is beneath the parent's Git directory, since a parent's own
  linked-worktree metadata (`<parent-git-common-dir>/worktrees/<name>`)
  is *also* beneath that same directory but is not submodule metadata at
  all — proven by the dedicated real fixture (a parent repository with a
  genuine linked worktree, plus a fabricated ordinary-directory gitlink
  whose `.git` file points at that worktree's own metadata), confirming
  this fixture is correctly rejected as `UNSAFE_SUBMODULE_PATH` **before**
  any recursive `ls-files`/`check-attr` inspection proceeds against it,
  and confirming (in the test's own setup) that this exact fixture would
  have incorrectly passed under Round 8's beneath-`--git-common-dir`
  check alone, without the added `gitDir === gitCommonDir` requirement;
  **and** whether the gitlink's own `.git` *entry* (distinct from the
  working-tree path step 3 already `lstat`-checks) is independently
  `lstat`-checked before being treated as an ordinary directory or
  pointer file, with a symlinked `.git` entry unconditionally rejected
  rather than silently followed merely because a symlink-following
  `stat` on it would report a plausible shape
- Whether the command allowlist actually enforced and tested matches this
  document's own stated allowlist exactly — `status`, `diff`,
  `rev-parse`, `symbolic-ref`, `config` (`--get`/`--get-all` only —
  `--get-all` corrected in here, Round 10 review finding #4B, an
  earlier draft of this exact bullet omitted it despite Round 9 already
  requiring it for `branch.<branch>.merge`; `--get-regexp` removed
  entirely, Round 14 review finding #4 — config-enumeration is
  withdrawn, never part of BR3's contract), `ls-files` (`--stage -z`
  only), `check-attr` (`--stdin -z filter` only) — corrected, Round 8
  review finding #6D — and no others (§5, §6, §18, §27, Round 6 review
  finding #2, Round 7 review finding #4, Round 9 review finding #2,
  Round 14 review finding #4) — with no stale reference anywhere in the
  specification still asserting only the original five, the six omitting
  `check-attr`, the seven
  omitting `--get-all`, or an eight-command form still including
  `--get-regexp`
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
  top-level operation, with §18 itself containing no remaining stale
  `execFile("git", ...)` example (corrected, Round 9 review finding
  #3D); whether a `PATH`/executable-identity change between two
  top-level BR3 operations causes the second operation to re-resolve and
  revalidate rather than silently trusting a capability result validated
  against a now-different binary — and confirming the Git 2.45/2.46
  version-history wording no longer contradicts the chosen 2.45.0 floor
  (`--no-lazy-fetch` correctly stated as available at 2.45.0 itself)
- **Executable-resolution contract, finalized — new, mandatory, Round 9
  review finding #3 (resolves three remaining implementation
  contradictions Round 8's mechanism left open):**
  - **(3A) Fixed resolver `cwd`, not per-call `cwd`:** whether resolution
    genuinely uses exactly **one**, explicit, fixed resolver `cwd`
    (`process.cwd()`) for the entire top-level operation, with every
    `PATH` entry (relative, absolute, or empty) normalized against that
    single `cwd` before being searched — **never** resolved per-call
    against each individual Git command's own, separately-varying `cwd`
    (`projectRoot`, a submodule path, etc.) — proven by the dedicated
    regression test placing two distinct fixture `git`-named executables
    such that a relative `PATH` entry (`.`) would resolve to a different
    binary depending on which `cwd` were (incorrectly) used, confirming
    BR3 deterministically selects one executable per the documented rule
    and never silently changes which binary it invokes as later
    commands' own targeting `cwd` varies.
  - **(3B) BR3's deliberate, stricter, BR3-specific Windows resolver —
    corrected, Round 11 review finding #2 (Round 9/10's PATHEXT-based
    model is factually wrong about shell-free `execFile`'s actual
    Windows lookup behavior and is fully replaced, not merely
    amended):** whether §8's Windows resolution mechanism is now
    correctly, explicitly described as BR3's own **deliberate, stricter
    resolver** — never as "mirroring Node/libuv's own bare-command
    lookup, filtered to exclude `.cmd`/`.bat`," since libuv's actual
    Windows process-spawning implementation does not consult `PATHEXT`
    for its own search at all, making the previous "mirrors Node,
    filtered" framing simply inaccurate about the runtime BR3 depends
    on; whether the corrected resolver genuinely (i) searches only the
    already-sanitized `PATH` directories, in order, with no implicit
    current-working-directory search; (ii) never reads or is affected by
    `PATHEXT` in any way; (iii) accepts only a literal `git.exe` filename
    as a candidate — never `.cmd`/`.bat`/`.com`/any other extension; and
    (iv) produces exactly `GIT_EXECUTABLE_UNAVAILABLE` — never an
    "implementation's choice of alternative code" — when no `git.exe` is
    found anywhere in the sanitized `PATH` — proven by the dedicated
    fixtures (§20, cases A–G): a `git.exe` present resolves; an earlier
    `PATH` entry containing only `git.cmd` is skipped in favor of a
    later entry's genuine `git.exe`; a `PATH` containing only
    `.cmd`/`.bat` candidates fails with exactly
    `GIT_EXECUTABLE_UNAVAILABLE`; an unusual/reordered `PATHEXT` value
    has zero effect on the outcome; a `git.exe` present only in the
    resolver's own `cwd` (not listed in `PATH`) is not selected; and
    confirmed by static inspection that no `shell: true`/`cmd.exe`/
    PowerShell-shaped invocation exists anywhere in the implementation as
    a fallback.
  - **(3B2) POSIX `PATH`-absent resolution uses Node/libuv's own
    documented `/usr/bin:/bin` default, never "nothing to search" —
    new, mandatory, Round 11 review finding #1 (corrects a direct,
    internal contradiction in the previous draft — its own recorded,
    verified reproduction already showed the real system `git`
    successfully resolving under this exact condition, while its
    normative rule claimed the opposite):** whether `resolveRepository`'s
    in-process resolution, when `PATH` (the exact key) is genuinely
    absent from the sanitized environment on POSIX, uses the fixed
    `/usr/bin:/bin` default search path — the same default Node/libuv
    themselves document and exhibit — rather than concluding "no `PATH`,
    nothing to search, `GIT_EXECUTABLE_UNAVAILABLE`"; and whether a
    differently-cased `Path`/`path` variable is still never promoted
    into this search regardless of `PATH`'s absence (the POSIX
    exactness rule from Round 10 remains unchanged, composing correctly
    with this correction) — proven by the dedicated fixtures (§20, cases
    B and B2): `PATH` absent, `Path` pointing at a fake Git location,
    with a genuine system `git` present under `/usr/bin`/`/bin` →
    resolves the real system `git`, never the fake one, and never
    `GIT_EXECUTABLE_UNAVAILABLE`; the identical setup with no Git present
    anywhere under `/usr/bin`/`/bin` either → correctly fails with
    `GIT_EXECUTABLE_UNAVAILABLE`; **and** whether this specification
    correctly distinguishes the effective *lookup* path (used only to
    resolve the one absolute executable — `/usr/bin:/bin` when `PATH` is
    absent) from the environment subsequently handed to that
    already-resolved executable (which needs no synthetic `PATH`
    injected, since an absolute path bypasses `PATH` search entirely for
    every later invocation).
  - **(3C) Exact, deterministic, PLATFORM-SPECIFIC `PATH`-key selection
    — corrected again, Round 10 review finding #2:** whether §19's
    `PATH`-key-normalization algorithm is genuinely **platform-specific**
    — on POSIX, only the exact key `PATH` (no case-folding at all;
    `Path`/`path` are unrelated, untouched variables, never promoted
    into `PATH`, with an absent `PATH` never filled in from a
    differently-cased variable) — and only on Windows does it collapse
    every key whose uppercase form is `PATH` via one exact, documented
    rule (sort ordinally, select the first) — rather than either
    "implementation's choice" (Round 9's original gap) or a single,
    uniform case-insensitive rule applied identically on every platform
    (Round 9's own, itself-incorrect fix, since POSIX environment
    variable names are case-sensitive and `Path`/`path` are genuinely
    distinct variables there) — proven by the dedicated POSIX fixtures
    (a present, distinct `Path` alongside `PATH`; an absent `PATH` with
    only `Path` present, cross-checked against a real `execFile` call's
    own observed behavior under the identical `env`) and the dedicated
    Windows fixture (three differently-cased `PATH` keys collapsing to
    the documented ordinally-first winner).
  - **(3E) No cross-top-level-operation caching of capability or
    repository-validation facts — new, mandatory, Round 12 review
    finding #1:** whether the `git --version` capability result is
    genuinely re-obtained on **every** top-level BR3 operation — never
    cached across separate operations under any keying scheme, including
    keying by the resolved, canonicalized executable path (a binary can
    be replaced at an unchanged pathname between two operations, with no
    change to the path string a naive cache might key on) — proven by
    the dedicated same-pathname-different-binary fixture (§20), where a
    below-floor replacement at the identical resolved pathname is
    genuinely re-detected and rejected on the next top-level call, not
    silently accepted via a stale cached verdict; **and** whether every
    `resolveRepository`-derived safety/capability fact (object format,
    ref-storage format, and the repository-root/bare/worktree/submodule
    relationship and `gitDir`/`gitCommonDir` themselves) is likewise
    genuinely recomputed fresh on every top-level `resolveRepository`
    call, never cached merely because `projectRoot`'s path string is
    unchanged — `projectRoot` names a filesystem location, not a
    repository identity, and the repository actually occupying that
    location can change entirely between two separate top-level
    operations — proven by the dedicated same-`projectRoot`-different-repository
    fixture (§20, SHA-256 and `reftable` subcases); **and** whether this
    specification explicitly, correctly states that reusing one resolved
    executable path *within* a single top-level operation does not
    create a mechanically-enforced, OS-level executable-identity
    snapshot against a concurrently, adversarially replacing actor
    (§6) — an honest scope statement, not an overclaim that one resolved
    path makes "validate one binary, execute a different one"
    unconditionally, absolutely impossible.
  - **(3F) Exact executable-candidate filesystem-shape validity — new,
    mandatory, Round 12 review finding #2:** whether POSIX candidate
    validation genuinely requires, independently, (i) existence, (ii) a
    regular-file shape after symlink resolution — rejecting a directory
    (even one with execute/search permission, which a permission-only
    check cannot distinguish from a genuinely executable file), a FIFO,
    a socket, a device node, or a broken symlink — and (iii) execute
    permission, with an invalid candidate at one `PATH` entry never
    terminating the search while a valid candidate exists further down
    `PATH`; and whether Windows candidate validation genuinely requires,
    independently of the exact-`git.exe`-filename match, that the
    candidate resolve to a non-directory, regular-file executable target
    — rejecting a directory or broken link literally named `git.exe`,
    with the search likewise continuing to later `PATH` entries — proven
    by the dedicated fixtures (§20): a directory named `git`/`git.exe`
    skipped in favor of a later genuine executable; a non-executable
    regular file skipped; a broken symlink skipped; a valid symlink to a
    genuine executable accepted; and an all-invalid-candidates `PATH`
    producing exactly `GIT_EXECUTABLE_UNAVAILABLE`.
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
- **Multi-valued `branch.<branch>.merge` handling, made NUL-safe — new,
  mandatory, Round 9 review finding #2, NUL-safety corrected Round 13
  review finding #2:** whether `branch.<branch>.merge` is read via `git
  config -z --get-all`, never a bare `--get` and never without `-z` —
  proven by the dedicated regression fixture with two configured merge
  values, first confirming (in the test's own setup) that bare `--get`
  returns only the last value while `-z --get-all` returns both,
  complete, NUL-delimited, in order; **and** — the specific,
  implementation-blocking case `-z` closes — whether a fixture where the
  **first** configured merge value's own content contains an embedded
  newline is still correctly recovered as exactly **two** configured
  values, never fabricating a third value out of the embedded newline
  (proven by constructing this exact fixture and asserting the parsed
  value count and content); **and** whether `UpstreamInfo.mergeRef` is
  genuinely derived from the **same** first configured value that
  `ref`/`sha` (via `@{upstream}`) already resolve against — never a
  mismatched combination where `mergeRef` reflects the last configured
  value while `ref`/`sha` reflect the first — proven by asserting all
  relevant fields describe the identical target in the two-merge-value
  fixture; **and** whether the configured-but-unresolvable semantics
  (`ref: null`, `sha: null`, `remote`/`mergeRef` still populated) remain
  truthful when the *first* configured merge value's target is deleted,
  without silently falling back to resolving against the second
  configured value
- **`UpstreamInfo.mergeRef`/`.branch` data-model correctness — new,
  mandatory, Round 13 review finding #3:** whether `mergeRef` is
  genuinely the exact, complete, unaltered first configured
  `branch.<b>.merge` value regardless of its namespace — never assumed
  to be a branch name, never shortened, and never reinterpreted —
  proven by dedicated fixtures for a local-tag upstream
  (`branch.<b>.merge = refs/tags/v1`) and an arbitrary custom-namespace
  upstream (`refs/custom/foo`), both of which Git itself genuinely
  resolves via `@{upstream}` (verified independently reproducible);
  **and** whether `UpstreamInfo.branch` is correctly `null` for both of
  those non-`refs/heads/` cases, and correctly populated (the string
  after the `refs/heads/` prefix) only when `mergeRef` genuinely begins
  with that exact prefix — proving BR3 never calls a tag or a
  custom-namespace ref a "branch"
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
  (read-only `--get`/`--get-all` only — `--get-all` named explicitly,
  Round 9 review finding #2; `--get-regexp` is never used, Round 14
  review finding #4), `ls-files` (read-only
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
- **Rename-search-limit pinning — new, mandatory, Round 9 review finding
  #1:** whether `inspectWorkingTree`'s `status` invocation genuinely
  includes `-c status.renameLimit=0` and `inspectDiff`'s `diff`
  invocation genuinely includes `-l0`, both unconditionally, distinctly
  from (not a substitute for) the fixed 50% similarity threshold — proven
  by the dedicated real fixtures for both functions, each first
  confirming, in the test's own setup, that an unmitigated invocation
  against a genuinely high-similarity, above-threshold rename set
  degrades to delete+add facts under a repository-local
  `status.renameLimit=1`/`diff.renameLimit=1`, then confirming BR3's own,
  corrected invocation does not; and whether `status.renameLimit`'s own
  documented fallback to `diff.renameLimit` when `status.renameLimit`
  itself is unset is also correctly closed (a fixture setting only
  `diff.renameLimit=1`, not `status.renameLimit`, must not degrade
  `inspectWorkingTree`'s output either)
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
- Whether `git -c core.fsmonitor= -c status.renameLimit=0 -c
  status.showStash=false status --porcelain=v2 -z --find-renames=50%
  --untracked-files=all --ignore-submodules=none` (§11, §19, Round 9
  review finding #1's `-c status.renameLimit=0` included — corrected
  here, Round 10 review finding #4, since an earlier draft of this exact
  bullet omitted it; `-c status.showStash=false` included, Round 16
  review finding #2) and `git diff --no-color --no-ext-diff
  --ignore-submodules=none -z --name-status --find-renames=<threshold>
  -l0` (with the exact flags §13/§19 specify, including `-l0` and, Round
  15 review finding #1, `--ignore-submodules=none`) are the actual
  commands invoked — not
  `--porcelain` (v1), not a partial flag set, and not a patch-format
  diff requiring hunk-parsing
- Whether BR3 adds no new CLI command and does not modify
  `packages/cli/src/commands/status.ts` or any other existing CLI
  command's behavior (§21)
- Whether any of §6's out-of-scope items leaked into the implementation
- **Honest process-trust-boundary wording — new, mandatory, Round 13
  review finding #1:** whether §8/§18 state the precise, narrower
  guarantee — BR3 itself never requests a shell or performs
  shell-string interpolation, Git is invoked through a resolved
  executable path with a separate argv array — rather than the
  overclaim "there is no shell in the invocation path at all," verified
  false on POSIX (an executable text file with no shebang, satisfying
  every one of BR3's own candidate-validity rules, can still be run
  through an interpreter-fallback behavior under shell-free `execFile` —
  precisely attributed to the `execvp`-family/libuv runtime execution
  path acting on a kernel-reported `ENOEXEC` condition, never to the
  kernel itself performing the fallback, Round 14 review finding #5);
  whether the resolved Git executable is
  explicitly documented as a trusted environment dependency BR3 verifies
  the reported version of but does not cryptographically or otherwise
  authenticate; and whether the repository-controlled external-helper
  protections (content-filter refusal, `core.fsmonitor` suppression,
  `--no-ext-diff`) remain fully, separately mandatory and unweakened by
  this correction, since they defend a categorically different threat
  (repository data causing an already-trusted Git binary to spawn a
  repository-selected helper) — proven by the dedicated documented Node
  behavior check §20 adds
- **NUL-safe repository-controlled config consumption — new, mandatory,
  Round 13 review finding #2:** whether `branch.<branch>.remote`/`.merge`
  are genuinely read via `-z`, with raw `Buffer` output NUL-split before
  any decoding and each complete value strict-UTF-8-decoded individually
  (§13 Category 2) — never line-split; and whether `extensions.refStorage`
  (a distinct, single-valued, fixed-machine-token config fact, §13
  Category 1) is correctly documented as needing only a bare `--get`,
  never conflated with the `-z` discipline the genuinely
  repository-controlled, potentially multi-valued branch config values
  require — proven by the dedicated embedded-newline fixture (§20), where
  the **first** configured `branch.<b>.merge` value's own content contains a
  raw newline and BR3 must still recover exactly two configured values,
  not three, first confirming (in the test's own setup) that plain,
  non-`-z` output for this exact fixture is genuinely ambiguous between
  the two- and three-value readings
- **`UpstreamInfo` data-model correctness (`mergeRef` vs. `branch`) —
  new, mandatory, Round 13 review finding #3:** whether `mergeRef`
  genuinely preserves the exact, complete, first configured
  `branch.<b>.merge` value verbatim regardless of its ref namespace —
  proven by dedicated fixtures for a local-tag upstream
  (`refs/tags/v1`) and an arbitrary custom-namespace upstream
  (`refs/custom/foo`), both independently verified to be genuinely
  resolvable via `@{upstream}`; and whether `branch` is correctly `null`
  for both non-`refs/heads/` cases, populated only when `mergeRef`
  genuinely begins with the exact `refs/heads/` prefix — proving BR3
  never mischaracterizes a tag or custom-namespace ref as a branch
- **Unborn-branch configured-upstream semantics and porcelain v2
  submodule-field precision — new, mandatory, Round 13 review finding
  #4; upstream half corrected again, mandatory, Round 15 review finding
  #2 (this bullet previously restated Round 13's own since-withdrawn
  `ref: null`/`sha: null` assumption verbatim, contradicting §9/§10's
  and this document's own AG's Round 14 correction — fixed here rather
  than left as a stale duplicate):** whether a symbolic branch — normal
  or unborn — with `branch.<name>.remote`/`.merge` genuinely configured
  reports a non-null, genuinely configured `UpstreamInfo` rather than an
  undifferentiated `upstream: null`, with the identical `@{upstream}`
  resolution procedure attempted regardless of unborn status —
  `ref`/`sha` populated whenever that resolution genuinely succeeds
  (which requires only that the *configured target* exists, never that
  the current branch itself has any commits), and `null` only on a
  genuine resolution failure, **never** merely because the branch is
  unborn — proven by the dedicated fixture pair (§9, §20): one unborn
  branch whose configured upstream target genuinely exists
  (`ref`/`sha` both populated) and one whose configured target does not
  (`ref`/`sha` both null), confirming "configured but currently
  unresolvable" is represented identically to every other
  configured-but-unresolvable shape this specification already defines,
  never conflated with "not configured," and never assumed from unborn
  status alone; **and** whether §11's porcelain v2 record-layout
  description correctly treats `<sub>` (the submodule marker) as its own
  independent, separate field from `<XY>` — never described as residing
  within or merely "adjacent to" `<XY>` in a way that could be
  misread as requiring a search inside it — proven by the dedicated
  real dirty-submodule fixture (`1 .M S.M. ...`) confirming the two
  fields are parsed independently, never confused
- **Unborn-branch upstream RESOLUTION correctness — new, mandatory,
  Round 14 review finding #1 (corrects a further false assumption Round
  13's own correction introduced):** whether §9/§10 attempt the identical
  `@{upstream}` resolution procedure regardless of whether the current
  symbolic branch is normal or unborn — never skipping resolution, and
  never hard-coding `ref: null`/`sha: null`, merely because the current
  branch happens to be unborn. Proven by the dedicated fixture
  (configuring `branch.new.remote=.`/`branch.new.merge=refs/heads/master`
  on an unborn `new` branch pointing HEAD at a `refs/heads/new` that does
  not yet exist, against a repository with a real commit already on
  `master`) asserting `unborn: true` together with a fully resolved,
  non-null `upstream.ref`/`upstream.sha` — confirming unborn status alone
  never forces resolution failure; and by a second fixture where the
  configured target itself does not exist, asserting `unborn: true`
  together with a genuinely null `upstream.ref`/`upstream.sha` (a real
  resolution failure, not an assumed one) — proving both directions of
  the corrected contract are exercised, not merely the previously-assumed
  one
- **`UpstreamInfo.sha` exact object-ID meaning — new, mandatory, Round 14
  review finding #2:** whether `sha` is documented, everywhere it
  appears (§7a, §9, §10), as exactly and only the raw object ID
  `git rev-parse --verify -q --end-of-options <branch>@{upstream}`
  returns, with no `^{commit}` peel performed or implied — never called a
  "commit SHA," "branch tip commit," or "resolved commit" except when
  explicitly scoped to a `refs/heads/*`-or-remote-tracking-branch target.
  Proven by a dedicated annotated-tag fixture asserting
  `UpstreamInfo.sha` equals the tag object's own SHA (`git rev-parse
  refs/tags/v1`) and explicitly does **not** equal the peeled commit SHA
  (`git rev-parse refs/tags/v1^{commit}`) for the identical ref, plus a
  lightweight-tag fixture and a non-commit custom-ref fixture confirming
  the raw SHA is faithfully returned in each case with no type assumption
- **Single authoritative `UpstreamInfo` contract across §7a/§9/§10 — new,
  mandatory, Round 14 review finding #3:** whether §10 was fully
  reconciled with §7a's Round 13 `UpstreamInfo` interface — no remaining
  restatement of the superseded `{ remote, ref, branch, sha }` shape
  omitting `mergeRef`, and no remaining claim that `remote`/`branch`
  "remain populated" for every configured-but-unresolvable upstream
  (false now that `branch` is independently nullable by namespace,
  regardless of resolvability) — confirmed by a full-document sweep for
  `{ remote, ref, branch, sha }`, "remote/branch remain populated," and
  equivalent shorthand omitting `mergeRef` without explicitly flagging
  the omission as prose brevity
- **`config --get-regexp` filter-driver enumeration fully removed — new,
  mandatory, Round 14 review finding #4:** whether the implementation
  contains zero uses of `git config --get-regexp` anywhere, whether the
  command allowlist stated in every location it appears (§5, §6, §18,
  §20, §27) lists only `config --get`/`--get-all`, and whether
  `check-attr --stdin -z filter` is documented as BR3's sole,
  self-sufficient filter-safety mechanism, needing no driver-definition
  enumeration of any kind to decide `EXTERNAL_GIT_FILTER_UNSUPPORTED`.
  Proven by confirming the case-D regression fixture (§20) no longer
  exercises any BR3-internal config-enumeration code path (the fixture's
  own ad hoc `--get-regexp` check, if retained, exists solely as
  test-setup documentation of the premise, clearly marked as not a BR3
  code path) and that no acceptance criterion, implementation-plan step,
  or independent-review bullet anywhere still describes config-enumeration
  as retained, even as an optional diagnostic
- **POSIX kernel/runtime attribution precision — new, mandatory, Round 14
  review finding #5 (wording cleanup only; the Round 13 trust-boundary
  decision itself is unchanged and preserved):** whether §6/§8/§18 avoid
  the imprecise claim that "the OS kernel's `ENOEXEC` handling invokes a
  shell," correctly attributing the interpreter/shell fallback (when one
  occurs) to the `execvp`/libuv/runtime execution path that may act on a
  kernel-reported `ENOEXEC`, never to the kernel itself, which only
  reports that an executable image is unsuitable and performs no
  fallback of its own — while continuing to state, unchanged: BR3 itself
  never requests a shell, BR3 never shell-interpolates argv, the resolved
  executable is a trusted environment dependency, BR3 does not
  authenticate the Git executable, and BR3 does not claim the trusted
  executable can never itself launch an interpreter or subprocess
- **`inspectDiff` submodule/gitlink visibility pinning
  (`--ignore-submodules=none`) — new, mandatory, Round 15 review finding
  #1:** whether BR3's exact, canonical `diff` invocation includes
  `--ignore-submodules=none` everywhere it is restated (§13, §19, §20,
  §20a, §20b, §27), and whether the dedicated fixture (§20) proves
  repository-local `diff.ignoreSubmodules=all` config would otherwise
  silently suppress a changed gitlink path from `DiffResult` (confirmed
  in the test's own setup against the unmitigated command form) while
  BR3's actual `inspectDiff` call correctly reports it as a `modified`
  `DiffChange`, with ordinary non-submodule diff behavior unaffected
- **Withdrawal of the stale Round 13 unborn-upstream acceptance/review
  text — new, mandatory, Round 15 review finding #2:** whether every
  acceptance criterion and independent-review bullet describing unborn-
  branch upstream semantics (§20a, §27) reflects Round 14's corrected
  contract — unborn status never by itself forces `ref`/`sha` null; only
  a genuine `@{upstream}` resolution failure does — with **zero**
  remaining restatement of Round 13's withdrawn "configured but
  currently unresolvable because the branch is unborn" framing presented
  as current, normative behavior anywhere in the document (a historical
  mention of the withdrawn assumption, explicitly marked as withdrawn
  and false, remains acceptable; a normative restatement of it does not)
- **`check-attr` scope precision — `inspectWorkingTree`/`status` only,
  never `diff` — new, mandatory, Round 15 review finding #3:** whether
  §18's filter-safety mechanism is described, everywhere it appears, as
  gating only `inspectWorkingTree`'s own `status` invocation — with no
  remaining sentence pairing `status`/`diff` as though both are gated by
  the `check-attr` scan — while continuing to state, unchanged,
  `inspectDiff`'s already-correct independence (§13's Round 9 review
  finding #5 correction): `check-attr` is never invoked at all as part
  of `inspectDiff`, proven structurally, not merely by the scan's result
  happening not to matter
- **Option-safety proof uses a genuinely valid ref, with no extra bare
  `--` — new, mandatory, Round 15 review finding #4:** whether §13's
  `inspectDiff` ref-resolution "Verified directly" example, and every
  test/acceptance-criterion restatement of it (§20, §20a), use BR3's
  exact normative form (`--end-of-options`, with **no** additional bare
  `--`) against a genuinely valid, option-shaped ref created via `git
  update-ref` (e.g. `refs/heads/-foo`) — proving BR3 correctly accepts
  and resolves real option-shaped refs, not merely rejects a nonexistent
  one — with **zero** remaining example anywhere in the document
  combining `--end-of-options` with an additional bare `--`, a
  combination independently verified to fail even against a valid ref
  and therefore incapable of proving option-safety
- **`GIT_NO_REPLACE_OBJECTS=1` centrally re-added — new, mandatory, Round
  16 review finding #1:** whether the controlled `GIT_*` variable count
  is genuinely eight everywhere it is stated (§18, §19, §20a, §27, with
  no remaining "seven" describing this set), whether
  `GIT_NO_REPLACE_OBJECTS` is re-added unconditionally after the
  `GIT_*`-prefix strip for every BR3 Git subprocess, and whether the
  dedicated `inspectDiff`/`inspectWorkingTree` replacement-object
  fixtures (§20) each first confirm the unmitigated hazard is real (a
  replacement commit/ref genuinely alters diff content or produces false
  staged facts under an unprotected invocation) before confirming BR3's
  actual, protected invocation is unaffected — proving the exact SHA BR3
  reports always identifies the object content BR3 actually inspected
- **`status.showStash=false` pinned on the canonical `status` invocation
  — new, mandatory, Round 16 review finding #2:** whether every exact
  restatement of the canonical `status` command (§11, §19, §20, §20a,
  §27) includes `-c status.showStash=false` identically, with no older,
  two-`-c` form remaining anywhere, and whether the dedicated fixture
  (§20) first confirms, in test setup, that the unmitigated command
  genuinely emits a `# stash <N>` header record for a repository with a
  real stash and `status.showStash=true` set, before confirming BR3's
  actual invocation suppresses it with no `MALFORMED_GIT_OUTPUT` and no
  stash pseudo-entry
- **Conflicted-gitlink enumeration deduplication and `<sub>`-field
  parsing on every carrying record type — new, mandatory, Round 16
  review finding #3:** whether the initialized-submodule enumerator
  (§18) collapses `ls-files --stage -z`'s gitlink records to unique
  repository-relative candidate paths **before** any `lstat`/validation/
  visited-set step, proven by a real three-index-stage conflicted-gitlink
  fixture asserting `inspectWorkingTree` does **not** falsely return
  `UNSAFE_SUBMODULE_PATH` merely because the same path appears at
  multiple stages; **and** whether `<sub>` is genuinely parsed from
  type-2 (rename) and unmerged (`u`) porcelain v2 records, not only
  type-1, with the identical decoded `SubmoduleState` correctly attached
  to every `WorkingTreeEntry` one source record emits — proven by
  dedicated type-2-dirty-rename and unmerged-conflicted-submodule
  fixtures in addition to the existing type-1 fixture (§11, §18, §20)
- **Ancestor-chain repository discovery in the post-Git-failure secondary
  classifier — new, mandatory, Round 16 review finding #4:** whether
  `resolveRepository` correctly reports `GIT_COMMAND_FAILED` — never
  `NOT_A_GIT_REPOSITORY`, never `PROJECT_ROOT_MISMATCH` — for a
  `projectRoot` nested inside a real repository whose own, ancestor-level
  config is too malformed for Git's `--is-bare-repository` to
  authoritatively establish a toplevel, proven by the dedicated
  four-fixture regression (§20: healthy nested directory →
  `PROJECT_ROOT_MISMATCH`; plain non-Git directory → `NOT_A_GIT_REPOSITORY`;
  malformed repository root → `GIT_COMMAND_FAILED`; malformed repository
  parent with nested `projectRoot` → `GIT_COMMAND_FAILED`, never the
  other two codes) — and whether §8's own prose makes clear this
  ancestor-chain check runs only inside the existing post-failure
  fallback, never before step 2's authoritative Git invocation, and does
  not reintroduce the Round-2-removed early `.git`-existence precheck
- Whether test evidence is real (tests actually run against real,
  ephemeral, temporary Git repositories — not mocked Git command output)

This document does not itself authorize BR3 implementation — see §1.
