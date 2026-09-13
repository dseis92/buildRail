# BR1 — CLI Skeleton

## Status

**APPROVED SPECIFICATION**

This document is the approved BR1 implementation contract. Current
implementation authorization is tracked canonically in
`.buildrail/state.yml`; this specification does not grant authorization by
itself — see the Authorization section below.

## Authorization

- **Specification authored under:** BR0 governance (BR0 is `COMPLETE +
  INDEPENDENTLY APPROVED + FROZEN` at baseline
  `04c93767510c51916fcc51f60b85b674c7d6f1cc`, governance closure
  `530cf9fce46c11eeb5b603884e1ec3ba3f9df135`).
- **This document's role:** the approved implementation contract for BR1.
  It does not itself grant or revoke implementation authorization.
  Implementation authorization is granted only by the human owner, and its
  current status is recorded canonically in `.buildrail/state.yml`
  (`current.lifecycle_state`, `current.development_phase`, and
  `authorization`) — consult that file, not this document's prose, for the
  live authorization status.
- **Granted by (specification approval):** human, following independent
  review.

## Goal

Establish an executable `buildrail` command-line shell with real argument
parsing, command routing, help, version, and predictable exit behavior —
without implementing any governance logic. BR1 creates the CLI boundary
that later phases (BR2 governance engine, BR3 Git inspection, BR4
verification, BR5+ skills/adapters) will plug into via Core APIs, not by
embedding logic directly in CLI command files.

## Problem Being Solved

BR0 established package/workspace structure and placeholder command files
(`export {}` stubs), but there is no way to actually run `buildrail` as a
program. `packages/cli/package.json` currently points `bin` directly at a
TypeScript source file (`src/index.ts`), which is not a viable execution
model without requiring every user to have a TypeScript runtime (`tsx`,
`ts-node`, Bun, Deno) installed globally. BR1 solves both problems: it
gives BuildRail a real, compiled, executable CLI shell, and it establishes
the compile → dist → bin pipeline that makes `buildrail` runnable via
plain Node.

## Architectural Boundary

### BR1 owns

- Executable BuildRail CLI entry point
- CLI compilation/build path (TypeScript → JavaScript)
- Package `bin` wiring to compiled output
- Command routing/dispatch
- Command registration
- Global help (`--help`, `-h`, `help`)
- Command-specific help (`init --help`, `status --help`)
- Version output (`--version`, `-v`)
- Predictable exit-code behavior
- Initial `init` command shell (registration + explicit "not implemented
  yet" behavior)
- Initial `status` command shell (registration + explicit "not
  implemented yet" behavior)
- CLI-level error formatting for unknown commands/invalid usage
- A small, documented architecture for how future commands attach

### BR1 does not own

- Governance state loading (`.buildrail/state.yml`)
- Governance config loading (`.buildrail/config.yml`)
- YAML parsing
- JSON Schema validation
- Authorization evaluation
- Lifecycle transition logic
- Protected-path enforcement
- Git inspection (branch, SHA, working tree, diff)
- Remote SHA verification
- Quality gate execution
- Verification report generation
- Handoff generation
- Agent adapter installation (Claude Code, Codex)
- Skill implementation
- CI / GitHub Actions
- Git hooks
- npm publishing

All of the above remain owned by BR2 (governance engine), BR3 (Git
inspection), BR4 (verification), BR5 (skills), BR6/BR7 (adapters), or BR8
(dogfood), per `docs/ROADMAP.md`. CLI command handlers implemented in BR1
must be written so that, when those later phases exist, the handlers call
into `packages/core` APIs rather than growing governance logic in place.
BR1 handlers may contain only: argument interpretation, dispatch, and
literal "not implemented until phase X" messaging — no partial or
simulated governance behavior.

## User-Facing Command Surface

After BR1 implementation, exactly these entry points must exist:

- `buildrail --help`
- `buildrail -h`
- `buildrail help`
- `buildrail --version`
- `buildrail -v`
- `buildrail init`
- `buildrail init --help`
- `buildrail status`
- `buildrail status --help`

No other commands are registered in BR1. Commands such as `buildrail new`,
`buildrail authorize`, `buildrail preflight`, `buildrail verify`, and
`buildrail handoff` (listed as the v0.1 CLI vision in
`docs/BUILDRAIL_V0.1_SPEC.md` §17) remain unregistered future work. They
may be referenced in documentation/help text only as forward-looking
examples of where BuildRail is headed, never as callable commands, and
never implied to exist via unlisted/hidden registration.

## Command Behavior

### `buildrail --help` / `-h` / `help`

Must print concise, deterministic usage text along these lines (exact
wording may be refined during implementation, but must stay concise and
approachable for nontechnical users, and must not claim functionality that
doesn't exist):

```
BuildRail

Governance for AI-assisted software development.

Usage:
  buildrail <command> [options]

Commands:
  init        Show initialization availability
  status      Show status availability
  help        Show help

Options:
  --help, -h       Show help
  --version, -v    Show version

Build with AI agents without losing control of project state,
authorization, verification, or approved work.
```

Command descriptions in global help must accurately represent what the
command does *in BR1* — they must never claim or imply that `init`
actually initializes a project or that `status` actually reports project
status, since neither is implemented yet (see `buildrail init` and
`buildrail status` below). Future phases must update these descriptions
once the underlying operations become real.

### `buildrail --version` / `-v`

Must print the running package's version and exit `0`. For BR1 this is
expected to be `0.1.0`. The version string must be read from
`packages/cli/package.json` at build or run time — it must not be
hard-coded as a separate literal elsewhere in source. The specification
requires the implementation to document exactly where the single source
of truth lives (e.g. read via Node's JSON import/`require` of the CLI
package's own `package.json`, or injected at build time) so there is one
place that can drift, not two.

### `buildrail init`

Must be registered and callable, but BR1 must not implement the
initialization engine. A truthful BR1 response communicates the
boundary explicitly, conceptually:

```
BuildRail initialization is not available yet.

The CLI shell is installed successfully.
Project initialization is implemented in a later BuildRail phase.
```

`buildrail init` during BR1 must NOT create `.buildrail/`, `AGENTS.md`,
skill files, adapter files, config, or state — in this repository or in
any target project. It must not simulate, partially perform, or imply
that initialization occurred. Because the command could not perform the
operation the user actually requested (initializing a project), it must
exit with code `1` (see Exit Code Contract) — BuildRail must not
communicate programmatic success for an operation it did not perform.
`buildrail init --help` is a distinct, successful operation (showing help)
and exits `0`.

**Open roadmap question (not resolved by this spec):** which future phase
formally owns implementing real `buildrail init` scaffolding — BR2
(governance engine, since it owns state/config loading) or a later phase.
This must be explicitly assigned before that phase begins implementation;
it is not assigned by BR1.

### `buildrail status`

Must be registered and callable, but BR1 must not implement state/config
loading. A truthful BR1 response communicates the boundary explicitly,
conceptually:

```
BuildRail status requires the governance engine.

CLI command routing is working.
State inspection will become available after the governance engine is
implemented.
```

`buildrail status` during BR1 must NOT parse `.buildrail/state.yml`, infer
project state manually, return fabricated status, or add a YAML dependency
for this purpose. It must not implement any partial slice of BR2 behavior.
Because the command could not perform the operation the user actually
requested (reporting real project status), it must exit with code `1` (see
Exit Code Contract) — BuildRail must not communicate programmatic success
for an operation it did not perform. `buildrail status --help` is a
distinct, successful operation (showing help) and exits `0`.

### Command-specific help

`buildrail init --help` and `buildrail status --help` must each print
short, accurate help text describing what the command does *in BR1* (i.e.
that it currently only reports its BR1 boundary), not aspirational future
behavior presented as current.

### Unknown commands

`buildrail banana` (or any unregistered command) must:

- produce a clear, non-stack-trace error
- suggest `buildrail --help`
- exit with the invalid-usage exit code (see Exit Code Contract)
- never be silently ignored or silently no-op

## CLI Architecture

Conceptual shape (implementation may adjust file layout if investigation
during implementation shows good reason, but the layering below is a
requirement, not merely a suggestion):

```
packages/cli/src/
├── index.ts          # thin entry point; wires argv to cli.ts and sets process.exitCode
├── cli.ts             # argument parsing, command dispatch, top-level help/version
├── commands/
│   ├── init.ts        # BR1: registration + boundary message only
│   └── status.ts      # BR1: registration + boundary message only
└── output/
    └── ...             # formatting helpers (help text, error text) shared across commands
```

Layering requirement:

- The **CLI layer** (`packages/cli`) handles argument parsing, command
  dispatch, terminal output formatting, and exit codes.
- The **Core layer** (`packages/core`) will, starting in BR2+, own state,
  config, lifecycle, policy, Git inspection, and verification.
- CLI command handlers must be structured so that when Core APIs exist,
  handlers call them rather than reimplementing governance logic inline.
  BR1 handlers for `init`/`status` should be written as thin functions
  that print a fixed boundary message — not as growing stand-ins for real
  behavior — precisely so BR2+ can replace their internals without
  restructuring the CLI layer.
- Other currently-placeholder command files under `packages/cli/src/commands/`
  (`authorize.ts`, `handoff.ts`, `new.ts`, `preflight.ts`, `verify.ts`) are
  explicitly **out of scope for BR1** and must remain untouched
  `export {}` placeholders — they are not registered in the BR1 command
  router.

## Build / Execution Model

Current state (BR0): `packages/cli/package.json` sets
`"bin": {"buildrail": "src/index.ts"}`, pointing directly at TypeScript
source. This is not a viable production execution model and BR1 must
resolve it.

Required model:

```
TypeScript source (packages/cli/src/**/*.ts)
        ↓ compile (tsc)
JavaScript output (packages/cli/dist/**/*.js)
        ↓
package "bin" points at compiled JavaScript (packages/cli/dist/index.js)
```

Requirements:

- The compiled entry point (`packages/cli/dist/index.js`, exact path to be
  finalized during implementation) must begin with a Node shebang
  (`#!/usr/bin/env node`) so it is directly executable once made
  executable/symlinked by npm's `bin` mechanism.
- End users must not be required to have `tsx`, `ts-node`, Bun, or Deno
  installed. Normal supported usage is: install via npm (workspace-local
  during development), run compiled JavaScript via plain Node.
- `package.json#bin` must point at the compiled JavaScript path, never at
  a `.ts` file.

## Build Strategy

Prefer the TypeScript compiler (`tsc`) for BR1 rather than introducing a
bundler (`tsup`, `esbuild`, `rollup`, `webpack`). The CLI's BR1 surface is
small (an entry point, a dispatcher, two command stubs, small output
helpers) and does not yet justify bundler complexity. A bundler may be
reconsidered in a later phase if genuine need arises (e.g. single-file
distribution, tree-shaking a much larger dependency graph) — that
decision is out of scope for BR1 and must not be made preemptively here.

Implementation must determine and document, but this specification does
not itself decide:

- CLI-specific `tsconfig.json` (extending `tsconfig.base.json`) — output
  directory (`outDir`), module format consistent with
  `tsconfig.base.json`'s existing `NodeNext`/`ES2022` settings, and
  whether `rootDir` needs to be set explicitly
- Root workspace script wiring — whether `npm run build` at the repo root
  (currently a placeholder echo per `package.json`) should be updated to
  actually invoke the CLI package's build, and whether `packages/cli`
  needs its own `build`/`clean` scripts
- Whether `packages/core` needs a parallel build step in BR1, or whether
  it remains schema/placeholder-only until BR2 introduces real source

This specification requires that build output be excluded from version
control (`dist/` is already present in the root `.gitignore` from BR0) and
that a documented `clean` step exists conceptually, even if implementation
details are decided during BR1 implementation itself.

Regardless of how the exact `tsconfig`/`outDir`/`rootDir` layout is
decided, root-level `npm run build`, `npm test`, and `npm run typecheck`
must, by BR1 completion, actually execute real BR1 CLI build/test/typecheck
behavior — not remain BR0's placeholder echo scripts. This does not
require `packages/core` to become implemented; root scripts may continue
to no-op (or skip) for packages that still have no real source, but they
must not continue to no-op for `packages/cli`. This requirement exists
specifically so that a package-local command (e.g. `cd packages/cli && npm
run build`) cannot be used to satisfy Acceptance Criterion A while the
root-level commands remain fake. No lint tooling is introduced solely to
satisfy this requirement — `lint` remains governed by the Quality Gates §
above.

## Runtime Support

**Minimum supported Node version: Node.js 22.**

Rationale: Node 22 is a currently supported LTS release (Node 20 has
reached end-of-life and must not be adopted as BuildRail's minimum
baseline), supports the language/runtime features `tsconfig.base.json`
already targets (`ES2022`, `NodeNext` module resolution) as well as the
Node APIs BR1 needs (including the built-in `util.parseArgs` evaluated
under Dependency Policy below), and is a conservative, currently-maintained
baseline that avoids requiring BuildRail's nontechnical/semi-technical
target audience to install an unusually new Node version while also
avoiding an already-EOL runtime. Implementation must document this
baseline via an `engines.node` field on `packages/cli/package.json` (e.g.
`">=22"`, without pinning an exact minor/patch version absent a specific
justification), and a note in `packages/cli/README.md`, rather than
leaving it undocumented or silently assumed.

BuildRail is conceptually cross-platform (macOS, Linux, Windows). The CLI
must not introduce shell-dependent behavior (e.g. POSIX-only shell
invocations, hard-coded path separators, reliance on Unix-only utilities).
Node's built-in `path`, `process`, and `fs` APIs must be used in a
platform-neutral way.

## Dependency Policy

BR1 must prefer the smallest reasonable dependency surface. Implementation
must first evaluate whether Node's built-in `util.parseArgs` (stable since
Node 18.3, well within the Runtime Support baseline above) is sufficient
for BR1's small, fixed command surface (two commands, help, version, no
subcommand trees, no complex flag types).

A CLI framework (`commander`, `yargs`, `oclif`, `clipanion`, or similar)
must NOT be introduced automatically merely because such frameworks are
common. If implementation proposes an external dependency, the
implementation plan must explicitly justify:

- why `util.parseArgs` or comparable built-in behavior is insufficient
- maintenance implications of the added dependency
- package size/complexity added to the CLI's install footprint
- what concrete future BuildRail need (not yet in BR1) the dependency
  unlocks that built-ins cannot

Given BR1's fixed, small surface (`--help`/`-h`/`help`,
`--version`/`-v`, `init`, `status`, each with only a `--help` flag), a
dependency-free CLI built on `util.parseArgs` plus hand-written dispatch
is expected to be sufficient and is preferred absent a demonstrated need
otherwise.

## Exit Code Contract

| Code | Meaning |
|------|---------|
| `0` | Successful operation — the command actually performed what the user asked. Examples: `--help`, `-h`, `help`, `--version`, `-v`, `init --help`, `status --help`. |
| `1` | Recognized command could not perform the requested operation. During BR1 this includes `buildrail init` and `buildrail status` — the commands exist and are registered, but the real operation they name (initializing a project, reporting real project status) is not implemented yet. |
| `2` | Invalid CLI usage — unknown command, unsupported option, or invalid argument. |

BuildRail must not communicate programmatic success (exit `0`) for an
operation it did not perform. `buildrail init` and `buildrail status`
truthfully report their BR1 boundary, but because that boundary message
means the requested operation was *not* carried out, both commands must
exit `1`, not `0`. This is distinct from `buildrail init --help` and
`buildrail status --help`, which succeed at the operation they actually
perform (showing help) and correctly exit `0`. No BR1 command's output or
exit code may imply a governance operation occurred when it did not.

## Output Contract

BuildRail output must be readable by both humans and AI coding agents.
Output must be:

- deterministic (same input → same output, no timestamps/randomness in
  BR1 output)
- concise
- readable in a plain terminal
- stable enough for an agent to interpret without a dedicated parser
- free of any claim that governance operations occurred when they did not

BR1 must NOT add a JSON/machine-readable output mode. There are no real
governance commands yet whose output would benefit from structured
machine consumption; introducing one now would be speculative design for
BR2+ concerns. This may be revisited once BR2–BR4 introduce commands whose
output benefits from structured consumption (e.g. `buildrail status`,
`buildrail verify`).

Decorative output (ASCII art, spinners, excessive color/formatting) must
be avoided where it would make output harder to parse or read in
non-interactive/CI-like contexts, even though CI itself is out of scope
for BR1.

## Error Contract

Errors must identify, in this order:

1. **What** failed
2. **Why** it matters / what the error means
3. **What** the user can do next

Conceptual format:

```
BuildRail could not run this command.

Reason:
Unknown command: frobnicate

Try:
buildrail --help
```

Ordinary user mistakes (unknown command, invalid flag) must never produce
a raw stack trace. Unexpected internal exceptions may be exposed with more
diagnostic detail in future development/debug contexts (e.g. a future
`--debug` flag or `DEBUG` environment variable), but BR1 itself is not
required to build that mechanism — it only must ensure ordinary usage
errors are handled cleanly and do not crash with a raw trace.

## Testing Strategy

BR1 must introduce real, executable tests — the first real BuildRail
quality gates. Required acceptance-test coverage, at minimum:

1. `buildrail --help` — prints expected usage text, exits `0`
2. `buildrail -h` — same as `--help`
3. `buildrail help` — same as `--help`
4. `buildrail --version` — prints version matching `package.json`, exits `0`
5. `buildrail -v` — same as `--version`
6. `buildrail init` — registered, prints truthful BR1 boundary/unavailable message, exits `1`
7. `buildrail init --help` — prints command-specific help, exits `0`
8. `buildrail status` — registered, prints truthful BR1 boundary/unavailable message, exits `1`
9. `buildrail status --help` — prints command-specific help, exits `0`
10. `buildrail <unknown-command>` — prints error + suggests `--help`, exits `2`
11. Invalid argument handling (e.g. an unrecognized flag) — clean error, exits `2`
12. Exit codes verified for each case above against the Exit Code Contract

Tests must exercise the CLI's public seam — invoking the built executable
as a subprocess (or an equivalent black-box entry point) and asserting on
stdout/stderr/exit code — rather than being tightly coupled to internal
argument-parsing implementation details. This keeps tests valid even if
the internal parser (built-in vs. a future dependency) changes later.
Tests live under `packages/cli/tests/` (currently only a `.gitkeep`
placeholder from BR0).

## Quality Gates

Once BR1 introduces real executable TypeScript, the following gates become
real and required for BR1 completion:

| Gate | BR1 requirement |
|------|------------------|
| `tests` | Required — must pass against the acceptance criteria in Testing Strategy above |
| `typecheck` | Required — `tsc --noEmit` (or equivalent) must pass with no errors |
| `build` | Required — compiled output must be produced successfully and be executable |
| `lint` | Required **only if** BR1 implementation deliberately introduces lint configuration. If no lint config is introduced, this gate remains `NOT_CONFIGURED`, not `PASS` and not silently omitted. |

The distinction between `NOT_CONFIGURED` and `PASS` must be preserved
explicitly in any BR1 completion/verification reporting, per
`docs/QUALITY_GATES.md`'s existing evidence model (`NOT_CHECKED` is the
canonical term used there; `NOT_CONFIGURED` here refers specifically to
"no lint tooling exists to run," which is a form of `NOT_CHECKED`). A gate
must never be reported as passing when it was never configured or never
run.

`.buildrail/config.yml`'s existing `quality_gates` entries (currently all
`required: false`, each noting the condition under which they become
required — e.g. tests "Required beginning when executable product code
exists") must flip `tests`, `typecheck`, and `build` to `required: true`
**before** executable BR1 implementation begins, not at BR1 completion.
`lint` remains `required: false` unless lint tooling is explicitly
introduced. This specification does not perform that config change
itself; the intended governance sequence is:

```
BR1 specification approved
        ↓
Human authorizes BR1 implementation
        ↓
Governance authorization update sets BR1 active
AND updates .buildrail/config.yml quality_gates
(tests/typecheck/build → required: true)
        ↓
BR1 implementation begins
```

Setting these gates to `required: true` only at BR1 completion would let
implementation proceed against canonical policy that still describes BR1
as having no executable product code to check — a mismatch between
policy and reality for the entire duration of implementation. The gates
must be real and required from the moment BR1 implementation starts, so
that verification evidence produced during BR1 is measured against the
policy that actually governs it.

## Files Expected to Change During Implementation

This is a specification, not an implementation. When BR1 is separately
authorized for implementation, changes are expected in approximately:

- `packages/cli/src/index.ts` — entry point wiring
- `packages/cli/src/cli.ts` — new file: dispatch, help, version
- `packages/cli/src/commands/init.ts` — BR1 boundary implementation
- `packages/cli/src/commands/status.ts` — BR1 boundary implementation
- `packages/cli/src/output/` — new directory: output/formatting helpers
- `packages/cli/tests/` — new test files
- `packages/cli/package.json` — `bin` path, `main`, `engines.node`, build scripts
- `packages/cli/tsconfig.json` — new file, extending `tsconfig.base.json`
- Root `package.json` — possible script wiring (e.g. `build`/`test` no
  longer pure placeholders for the CLI workspace)
- `.buildrail/config.yml` — possible `quality_gates.*.required` flips
  (governance, not product, but plausibly touched at BR1 completion)
- `packages/cli/README.md` — status update once BR1 ships

This list is illustrative for reviewers, not exhaustive or binding; actual
implementation may reasonably touch a slightly different file set as long
as it stays within the Architectural Boundary above.

## Protected / Out-of-Scope Areas

Explicitly OUT OF SCOPE for BR1:

- Real `buildrail init` scaffolding (creating `.buildrail/`, `AGENTS.md`,
  skills, adapters, config, or state in any project)
- Loading `.buildrail/state.yml`
- Loading `.buildrail/config.yml`
- YAML parsing (no YAML dependency introduced in BR1)
- JSON Schema validation
- Lifecycle transition logic
- Authorization evaluation
- Git inspection (branch, SHA, working tree, diff)
- Protected-path checking
- Verification engine / quality gate execution logic (the CLI's own BR1
  tests are not the same thing as BuildRail's `buildrail verify` feature,
  which remains BR4)
- Independent review automation
- Handoff generation
- Agent plugin/adapter installation (Claude Code, Codex, generic)
- Claude Code integration
- Codex integration
- Git hooks
- GitHub Actions / CI configuration
- npm publishing
- Auto-update mechanisms
- Telemetry
- Web UI

`packages/core/**`, `packages/skills/**`, `adapters/**`, `templates/**`,
`packages/core/schemas/**`, and `examples/**` must not be modified by BR1
implementation.

## Security Constraints

BR1 must not:

- Read or print secrets or environment variable contents
- Execute arbitrary project commands (e.g. no shelling out to run a
  target project's own scripts)
- Access any network service
- Send telemetry or collect analytics
- Implement any account/authentication system

BR1 is a local, offline, side-effect-free (aside from its own stdout/stderr
and process exit code) command-line shell.

## Acceptance Criteria

- **A.** Build succeeds from a clean checkout using documented commands.
- **B.** The compiled CLI executable exists in the intended `dist` location.
- **C.** `package.json#bin` points to executable compiled JavaScript, not TypeScript source.
- **D.** `buildrail --help` works and matches the Output Contract.
- **E.** `buildrail -h` works.
- **F.** `buildrail help` works.
- **G.** `buildrail --version` works and returns the actual package version.
- **H.** `buildrail -v` works.
- **I.** `buildrail init` is registered, truthfully exposes only BR1 behavior (no scaffolding created), and exits `1` since it could not perform the requested operation.
- **J.** `buildrail status` is registered, truthfully exposes only BR1 behavior (no state parsed, no fabricated status), and exits `1` since it could not perform the requested operation.
- **K.** Command-specific help (`init --help`, `status --help`) works.
- **L.** Unknown commands produce a useful, non-stack-trace error and suggest `--help`.
- **M.** Exit codes match the documented Exit Code Contract in every tested case.
- **N.** Behavioral CLI tests (Testing Strategy §) pass, exercised against the built executable's public seam.
- **O.** TypeScript typecheck passes with no errors.
- **P.** Build passes and produces working compiled output.
- **Q.** No governance engine (state/config loading, lifecycle transitions, authorization evaluation) was implemented.
- **R.** No schema validation or lifecycle logic was implemented.
- **S.** No Git inspection was implemented.
- **T.** No BR2+ implementation occurred (verified by reviewing the diff against the Protected/Out-of-Scope Areas list).

## Independent Review Requirements

BR1 implementation must follow the same review discipline as BR0:

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

The implementing agent may report work as `IMPLEMENTED` but may not
self-approve, self-freeze, or self-authorize merge, per `AGENTS.md` and
`docs/GOVERNANCE.md`.

The independent reviewer must specifically examine:

- Actual CLI behavior (run the built executable, don't just read source)
- Scope compliance against this document's Architectural Boundary and
  Protected/Out-of-Scope Areas
- Package/bin correctness (compiled JS, not `.ts`, with correct shebang)
- Test evidence (tests actually run, results actually observed — not
  assumed passing)
- Absence of BR2+ leakage (no governance/state/config/Git logic embedded
  in CLI command handlers)
- Honesty of `init`/`status` output (no implied governance operations)

## Deferred Items

Carried forward from BR0 closure; **not** BR1 responsibilities:

1. **Cross-schema authorization `$ref` resolution.**
   `packages/core/schemas/state.schema.json`'s `authorization` property
   uses `"$ref": "authorization.schema.json"`, a bare relative reference
   requiring a shared schema registry/base URI to resolve. Target: BR2
   (schema validation implementation).
2. **Explicit active-vs-historical authorization semantics.**
   Future governance-engine logic must explicitly define that
   `authorization.status: authorized`/`in_progress` gates active
   implementation work, while `completed`/`revoked` are historical and
   non-gating. Target: BR2 policy/governance-engine work.

BR1 must not attempt to resolve either item.

## Entry Conditions

- BR0 is reviewed, approved, and frozen (baseline
  `04c93767510c51916fcc51f60b85b674c7d6f1cc`, closure
  `530cf9fce46c11eeb5b603884e1ec3ba3f9df135`)
- This specification exists and has been independently reviewed and
  approved
- BR1 is explicitly authorized for implementation by the human owner —
  this document does not itself grant that authorization; see
  `.buildrail/state.yml` for current, canonical authorization status
- As part of that authorization step (not as a separate follow-up, and not
  deferred to BR1 completion), `.buildrail/config.yml`'s `quality_gates`
  entries for `tests`, `typecheck`, and `build` are updated to
  `required: true` (see Quality Gates § above) — BR1 implementation must
  not begin while canonical policy still describes these gates as
  optional

## Exit Conditions

- All Acceptance Criteria (A–T) are met
- Independent review (per Independent Review Requirements) has approved
  the implementation at an exact candidate SHA
- Human owner explicitly approves BR1 completion
- `.buildrail/state.yml` is updated to reflect BR1 completion only after
  the above, by a separate, explicitly authorized governance-closure task
  (mirroring how BR0 closure was handled) — not as a side effect of
  implementation

## Non-Goals

- BR1 does not make BuildRail governance functional. It makes BuildRail
  *runnable* as a CLI shell.
- BR1 does not decide BuildRail's final CLI framework/dependency choice
  for all future phases — only that BR1 itself prefers a dependency-free
  approach absent demonstrated need.
- BR1 does not decide how `buildrail init` will ultimately be implemented
  in a later phase — only that it is not implemented now, and that BR1
  must not silently claim that decision by omission.
- BR1 does not publish an npm package, set up CI, or produce release
  automation.
