# BR2 — Governance Engine

## 1. Status

**SPECIFIED — NOT IMPLEMENTATION AUTHORIZED.**

This document is a detailed, implementation-grade specification for BR2.
Writing it does not authorize implementation. BR2 remains
`PLANNED — NOT IMPLEMENTATION AUTHORIZED` in `.buildrail/state.yml` until
the human owner explicitly grants a separate implementation authorization,
following independent review of this specification and a governance
activation step mirroring BR1's (`.buildrail/config.yml` quality-gate
policy update, `.buildrail/state.yml` authorization record) — see §27.

## 2. Goal

Turn BR0's governance model and JSON Schema drafts into real, tested,
provider-neutral TypeScript that BuildRail (and, through it, the BR1 CLI)
can rely on to:

- load and validate `.buildrail/config.yml`
- load and validate `.buildrail/state.yml` (including its nested
  `authorization` record)
- resolve the schema cross-reference between `state.schema.json` and
  `authorization.schema.json` deterministically, locally, without network
  access
- determine, from loaded state alone, whether an authorization is
  currently active and what it covers
- validate lifecycle transitions against `docs/STATE_MACHINE.md`'s legal
  transition graph, including which transitions require which actor role
- expose this through `buildrail status`, replacing BR1's placeholder
  boundary message with real, governance-backed output

BR2 makes BuildRail's governance model *real* without making it
*Git-aware* or *verification-aware* — those remain BR3 and BR4.

## 3. Current Repository Reality

As of the BR1 frozen baseline (`36f7b0a569eeee0cd1c5d7472cf176763c818a2e`,
merged as `3b695399eae01720804ec496e7735d636edaed41`), confirmed by direct
inspection immediately before drafting this specification:

- `packages/core/src/` contains only `index.ts` (an `export {}`
  placeholder) and five empty subdirectories (`config/`, `state/`,
  `lifecycle/`, `policy/`, `git/`, `verification/`), each holding only a
  `.gitkeep`. No governance logic exists.
- `packages/core/package.json` declares `"main": "src/index.ts"`, no
  dependencies, no build/test scripts, and its description still says "No
  functional implementation yet (BR0)" — stale, to be corrected as part of
  BR2 implementation (not this spec).
- `packages/core/schemas/` contains five JSON Schema drafts, all
  `"$schema": "https://json-schema.org/draft/2020-12/schema"`, all with
  absolute `$id` values under `https://buildrail.dev/schemas/`:
  `config.schema.json`, `state.schema.json`, `authorization.schema.json`,
  `verification-report.schema.json`, `handoff.schema.json`.
- `state.schema.json`'s `authorization` property is
  `{"$ref": "authorization.schema.json"}` — a bare relative reference
  (filename only, not the schema's own absolute `$id`). This is the
  cross-schema `$ref` issue deferred from BR0 review and carried forward
  by BR1's specification. **This document resolves it — see §11.**
- `packages/cli/` is fully implemented (BR1): a real, compiled,
  dependency-free CLI (`util.parseArgs`-based) with `--help`, `--version`,
  `init`, and `status`. `buildrail status` (`packages/cli/src/commands/status.ts`)
  currently always returns the fixed BR1 boundary message and exit code
  `1`, doing no I/O. `buildrail init` (`packages/cli/src/commands/init.ts`)
  behaves identically for its own boundary. Neither reads
  `.buildrail/state.yml` or `.buildrail/config.yml`, and neither imports
  `packages/core` in any way — the two packages are not yet wired
  together.
- `packages/cli/package.json` has real `devDependencies` (`typescript`,
  `@types/node`) and a `package-lock.json` exists at the repo root from
  that install. No YAML or JSON Schema validation library exists anywhere
  in the repository yet.
- `.buildrail/state.yml` and `.buildrail/config.yml` are hand-maintained
  YAML, validated only informally (by prompt discipline and this
  session's ad hoc `python3 -c "import yaml..."` checks during governance
  tasks) — no BuildRail tooling has ever parsed or validated them
  programmatically.
- Root `package.json` `build`/`test`/`typecheck` scripts currently invoke
  only `@buildrail/cli`'s workspace scripts
  (`npm run build --workspace=@buildrail/cli`, etc.); `@buildrail/core`
  has no scripts to invoke.

## 4. Architectural Boundary

### BR2 owns

- Config loading: file read, YAML parse, schema validation, typed return
- State loading: file read, YAML parse, schema validation (including
  resolving the nested `authorization` sub-schema), typed return
- The schema registry/validator subsystem shared by both loaders
- Deterministic, local-only `$ref` resolution across BuildRail's own
  schema files
- The active-vs-historical authorization model (§12) and the
  non-Git-aware authorization policy checks built on it (§13)
- The lifecycle transition engine: legality rules, actor/authority rules,
  and a pure `applyTransition`-style function that returns a new in-memory
  state value (not persistence — see §15–15)
- A structured, typed error/result model for all of the above (§18–18)
- Wiring `buildrail status` to real config/state loading and validation
  (§17)

### BR2 does not own

- Anything requiring Git: current branch, HEAD SHA, remote SHA, working
  tree cleanliness, diffs, deletions, renames, protected-path-vs-diff
  matching (all BR3)
- Executing configured quality gates (`npm test`, `npm run typecheck`,
  `npm run build` as *BuildRail's own product*, i.e. `buildrail verify`)
  or producing verification evidence reports (BR4)
- Agent skills becoming CLI-backed (BR5)
- Claude Code / Codex adapters (BR6/BR7)
- The full dogfood/reference-app lifecycle run (BR8)
- Real `buildrail init` project scaffolding — BR1 explicitly left this
  phase-ownership question open (`.buildrail/specs/BR1-CLI-SKELETON.md`
  §"Open roadmap question"). **This specification does not resolve that
  question and does not assign `init` to BR2** — see §17.4. `buildrail
  init` remains an unimplemented BR1-style boundary shell after BR2.
- Any actor authentication/identity system — "actor role" in BR2 is a
  plain string/enum value supplied by the caller (e.g. the CLI, or a
  future skill), never verified against a real identity provider (§16)
- CI, GitHub Actions, GitHub API calls, npm publishing, deployment,
  telemetry, arbitrary shell execution, network schema fetching

## 5. Scope

1. **Config loading** (`packages/core/src/config`) — read
   `.buildrail/config.yml` from a given project root, parse YAML, validate
   against `config.schema.json`, return a typed, validated `BuildRailConfig`
   object or a typed error.
2. **State loading** (`packages/core/src/state`) — read
   `.buildrail/state.yml`, parse YAML, validate against `state.schema.json`
   (which itself references `authorization.schema.json`), return a typed,
   validated `BuildRailState` object or a typed error.
3. **Schema registry** (`packages/core/src/schema`) — a shared subsystem
   that registers all BuildRail JSON Schemas by their absolute `$id`,
   compiles them once, resolves `$ref`s among them locally, and exposes a
   `validate(schemaId, data)` function returning a normalized result. Used
   by both config and state loaders (and, by design, reusable by BR4's
   verification-report/handoff validation later).
4. **Lifecycle engine** (`packages/core/src/lifecycle`) — the state graph
   from `docs/STATE_MACHINE.md` as data plus pure functions:
   `isLegalTransition`, `transitionActor` (which actor role, if any, a
   transition requires), and `applyTransition` (returns a new state value
   or a typed error; does not write files).
5. **Authorization policy** (`packages/core/src/policy`) — pure functions
   over an already-loaded `BuildRailState["authorization"]` value: is it
   active, does it cover a given phase, is it human-granted, etc. No
   filesystem or Git access.
6. **CLI integration** — `packages/cli/src/commands/status.ts` calls into
   `@buildrail/core`'s config/state loaders and prints real, structured
   output (§17). `packages/cli/package.json` gains a `dependencies` entry
   on `@buildrail/core` (workspace-local `"@buildrail/core": "*"` or
   equivalent npm workspace protocol — exact syntax decided at
   implementation time, not a BR2 spec-level decision).

## 6. Explicit Out-of-Scope

Restating §4's boundary as an unambiguous checklist. BR2 implementation
must **not** include any of the following:

- Git branch detection, HEAD/remote SHA reading, working-tree status,
  diffing, deletion/rename detection (BR3)
- Matching a Git diff's changed paths against `protected_systems` entries
  (BR3) — BR2 may *load and represent* `protected_systems` config, but
  must not compare it to any actual changed-file list, because BR2 has no
  way to obtain one
- Running `npm test` / `npm run typecheck` / `npm run build` *as a
  BuildRail governance feature* (i.e., there is no `buildrail verify` in
  BR2) or producing a `verification-report.schema.json`-shaped evidence
  document (BR4)
- Any `packages/skills/*/SKILL.md` becoming backed by real CLI behavior
  (BR5)
- Any `adapters/claude-code/` or `adapters/codex/` packaging/installation
  logic (BR6/BR7)
- A full authorize → preflight → implement → verify → review → merge
  lifecycle run against BuildRail's own repository or a reference demo app
  (BR8)
- Real `buildrail init` scaffolding (creating `.buildrail/`, `AGENTS.md`,
  skills, adapters, config, or state in a target project)
- CI configuration, GitHub Actions, GitHub API integration, npm
  publishing, deployment automation, telemetry/analytics, network calls of
  any kind, arbitrary shell/subprocess execution, actor authentication

## 7. Proposed Module Structure

```
packages/core/src/
├── index.ts                  # public API surface (re-exports below)
├── schema/
│   ├── index.ts               # registry + validate() + error types
│   ├── registry.ts            # schema loading/compilation
│   └── errors.ts               # SchemaValidationError, SchemaReferenceUnresolvedError
├── config/
│   ├── index.ts               # loadConfig(projectRoot) -> Result<BuildRailConfig, ConfigError>
│   ├── types.ts                # BuildRailConfig type (derived from schema)
│   └── errors.ts               # ConfigError union
├── state/
│   ├── index.ts               # loadState(projectRoot) -> Result<BuildRailState, StateError>
│   ├── types.ts                # BuildRailState, Authorization, Candidate, Baseline types
│   └── errors.ts               # StateError union
├── lifecycle/
│   ├── index.ts               # isLegalTransition, transitionActor, applyTransition
│   ├── graph.ts                 # the state machine as data (edges + required actor)
│   └── errors.ts               # LifecycleError union
└── policy/
    ├── index.ts                # authorization policy checks (pure)
    └── errors.ts                # PolicyError union
```

This tree is illustrative for reviewers, not exhaustive or binding — actual
implementation may reasonably adjust file boundaries as long as the
I/O-vs-pure-logic separation in §16 is preserved and the public API
surface in §8–§15 is delivered.

`packages/core/src/index.ts` becomes the package's public entry point,
re-exporting the loader functions, lifecycle functions, policy functions,
and their associated types/error classes — this is what `@buildrail/cli`
(and later BR4/BR5) import from.

## 8. Config Loading Contract

`loadConfig(projectRoot: string): Promise<Result<BuildRailConfig, ConfigError>>`

| Step | Behavior |
|---|---|
| File location | `<projectRoot>/.buildrail/config.yml`, always this exact relative path — no search/discovery logic, no walking up parent directories |
| Encoding | Read as UTF-8 |
| Missing file | Return `ConfigError` with code `CONFIG_NOT_FOUND` — never throw an unhandled exception, never treat as "no config = defaults" |
| Unreadable file (permissions, I/O error) | Return `ConfigError` with code `CONFIG_READ_FAILED`, wrapping the underlying `fs` error message in `details` |
| Empty file | Parses to `undefined`/`null` via the YAML parser; treated as `CONFIG_YAML_INVALID` (an empty document is not a valid config object) |
| Malformed YAML | Return `ConfigError` with code `CONFIG_YAML_INVALID`, `details` containing the parser's line/column if available |
| Parses to non-object (e.g. a YAML scalar or array at the root) | `CONFIG_SCHEMA_INVALID` — schema validation catches this (`"type": "object"` at the schema root), so this is not a separate code |
| Valid YAML, fails schema validation | Return `ConfigError` with code `CONFIG_SCHEMA_INVALID`, `details` populated from the schema validator's normalized error list (§9) |
| Valid YAML, passes schema validation | Return `Ok(config)` where `config` is a typed `BuildRailConfig` object |

**Unknown properties:** `config.schema.json`'s root and every nested
object use `"additionalProperties": true` except `qualityGate` and
`protectedSystem` (also `true`). BR2 must not silently tighten this to
`false` — the loader accepts and round-trips unknown properties rather
than stripping or rejecting them, consistent with the existing schema as
written. If a future phase wants stricter validation, that is a schema
change, not a BR2 loader behavior change.

## 9. State Loading Contract

`loadState(projectRoot: string): Promise<Result<BuildRailState, StateError>>`

Same file-location/encoding/missing/unreadable/empty rules as §8, with
state-specific error codes: `STATE_NOT_FOUND`, `STATE_READ_FAILED`,
`STATE_YAML_INVALID`, `STATE_SCHEMA_INVALID`.

Additional state-specific behavior:

| Concern | Behavior |
|---|---|
| Nested `authorization` validation | Validated as part of the single `state.schema.json` validation pass (§11) — not a separate second validation call. If `authorization` is present but invalid per `authorization.schema.json`, this surfaces as one `STATE_SCHEMA_INVALID` result whose `details` array includes an entry with `path` starting `authorization.` |
| `candidate` fields all `null` | Valid per schema (`"type": ["string", "null"]` on each field) — this is the expected shape when no implementation candidate is active (as on BR1's frozen main). Not an error. |
| `baselines` | Validated per `#/$defs/baseline` for each entry; `approved_sha` must match `^[0-9a-f]{40}$`. A `baselines` entry with a malformed SHA is `STATE_SCHEMA_INVALID`, not silently accepted. |
| `completed_phases` / `planned_phases` | Plain string arrays per schema; BR2 does not cross-validate phase IDs against a canonical phase list (e.g. rejecting `"BR99"`) — that would require domain knowledge the schema doesn't encode, and is out of scope for BR2's schema-driven validation. This is a known, accepted limitation (see §28). |
| Lifecycle state enum | Validated against the closed enum in `state.schema.json`'s `$defs.lifecycleState` (the 16 states from §12 of BR1's spec / `docs/STATE_MACHINE.md`) |
| Unresolved `authorization` `$ref` | If schema registration/compilation itself fails (not a data-validation failure — a schema-setup failure), this is `SCHEMA_REFERENCE_UNRESOLVED`, distinct from `STATE_SCHEMA_INVALID` (§18). This should be effectively unreachable once §11 is implemented correctly, but the distinct error code exists so a broken schema registration fails loudly and specifically rather than masquerading as a data problem. |
| "Contradictory state BR2 can deterministically detect" | BR2 detects exactly one class of this: `current.development_phase` not equal to `authorization.id` when `authorization.status` is `authorized` or `in_progress` (see §12) — surfaced as a `PolicyError`, not a `StateError`, since it's a policy-layer concern, not a schema-layer one. BR2 does **not** attempt to detect other forms of contradiction (e.g. "phase in both `completed_phases` and `planned_phases`") — flagged as a deferred item (§28) rather than invented ad hoc. |

## 10. Schema Registry

`packages/core/src/schema/` provides:

```ts
interface SchemaRegistry {
  validate(schemaId: string, data: unknown): SchemaValidationResult;
}

interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationErrorDetail[]; // empty when valid
}

interface SchemaValidationErrorDetail {
  path: string;      // JSON Pointer-style, e.g. "authorization.status"
  message: string;    // human-readable, from the validator, normalized
  keyword: string;    // the JSON Schema keyword that failed, e.g. "enum", "required"
}

function createRegistry(): SchemaRegistry; // throws only on registration-time failure (malformed schema file, unresolved $ref at setup)
```

- **Initialization:** `createRegistry()` reads and compiles all five
  schema files under `packages/core/schemas/` once, at call time (not
  module load time — so a broken schema file surfaces as a catchable
  error, not a crash on `import`). Registration order does not matter to
  the caller; internally, `authorization.schema.json` is registered before
  `state.schema.json` resolves its `$ref` to it (implementation detail of
  §11's resolution strategy, not a caller-visible contract).
- **Lookup:** `validate()` takes a schema identifier — BR2 uses each
  schema's own absolute `$id` (e.g.
  `"https://buildrail.dev/schemas/state.schema.json"`) as the identifier,
  not a bare filename — and the data to validate.
- **Compile strategy:** compile-once-per-registry-instance. `loadConfig`
  and `loadState` each create (or share, via a small module-level
  singleton — implementation's choice) one `SchemaRegistry` instance
  rather than recompiling schemas per call.
- **Failure behavior when a schema cannot be resolved:** `createRegistry()`
  throws a `SchemaReferenceUnresolvedError` (not a silent `undefined`
  validator) if any schema file is missing, malformed JSON, or has a `$ref`
  that cannot be resolved against the registered set. This is a
  registration-time failure, distinct from a validation-time
  `SchemaValidationResult` with `valid: false`.
- This layer has no knowledge of YAML, file paths under `.buildrail/`, or
  CLI output formatting — it operates purely on already-parsed JS
  values and schema identifiers, making it independently testable and
  reusable by BR4.

## 11. `$ref` Resolution Strategy

**This resolves the BR0-deferred cross-schema `$ref` issue.**

The problem: `state.schema.json`'s `authorization` property is
`{"$ref": "authorization.schema.json"}` — a bare relative filename, not an
absolute URI, and not a JSON Pointer fragment (`#/...`). A validator that
compiles `state.schema.json` in isolation, without knowing about
`authorization.schema.json`, cannot resolve this reference.

**Chosen strategy: schema registry with absolute `$id` resolution,
resolved via the validator's built-in reference registry — no
`$ref` text is rewritten in the schema files themselves.**

1. At `createRegistry()` time, every schema file under
   `packages/core/schemas/*.json` is read, `JSON.parse`d, and added to the
   JSON Schema validator instance via its schema-registration API (e.g.
   Ajv's `addSchema()`), keyed by each schema's own `$id` field. This
   happens for all five schemas, regardless of which are needed for the
   current validation call, so that any schema's relative `$ref` to any
   other BuildRail schema resolves correctly regardless of validation
   order.
2. The relative `$ref": "authorization.schema.json"` in `state.schema.json`
   is resolved by the *validator*, not by BR2 code, using standard JSON
   Schema reference resolution rules: a relative reference is resolved
   against the base URI of the schema containing it. Because
   `state.schema.json`'s own `$id` is
   `https://buildrail.dev/schemas/state.schema.json`, the relative
   reference `authorization.schema.json` resolves to
   `https://buildrail.dev/schemas/authorization.schema.json` — which
   matches `authorization.schema.json`'s own declared `$id` exactly. This
   is *already* how the schema files are written (per BR0 review, this was
   flagged as "requires a shared registry to resolve," not "is
   fundamentally malformed") — BR2's job is to build that registry
   correctly, not to rewrite the schema files.
3. **No schema file text changes are required or proposed by this BR2
   specification.** The existing `$ref` value is correct under standard
   JSON Schema resolution rules given a registry that knows both schemas'
   `$id`s; BR2 supplies that registry.
4. **Registration order:** does not matter for correctness with this
   strategy (all schemas are registered before any validation call), but
   implementation should register in a stable, deterministic order (e.g.
   alphabetical by filename) for reproducible error messages if
   registration itself fails.
5. **Validator configuration:** the validator instance must be configured
   to *not* attempt network resolution of any `$ref` — see §20. All
   `$ref`s BuildRail's own schemas use are either local fragments (`#/...`)
   or relative references to other files already present under
   `packages/core/schemas/`. If a schema (now or in a future phase)
   contains a `$ref` to an unregistered/unknown schema, `createRegistry()`
   fails at setup time (§10) rather than silently ignoring it or reaching
   out to the network.
6. **Failure behavior:** if `authorization.schema.json` is missing,
   unreadable, or fails to parse, `createRegistry()` throws before any
   `loadConfig`/`loadState` call can proceed — this is a BuildRail
   installation-integrity failure, not a per-project data problem, and
   must be surfaced distinctly (not folded into `CONFIG_SCHEMA_INVALID` or
   `STATE_SCHEMA_INVALID`).

## 12. Active/Historical Authorization Semantics

**This resolves the BR0-deferred active-vs-historical authorization
ambiguity, choosing one canonical model.**

### The model

- **Location:** the current, canonical authorization lives at exactly one
  place: `.buildrail/state.yml`'s top-level `authorization` object. There
  is no separate "authorization history" file or array in BR2 — see
  "Historical representation" below for how past authorizations remain
  visible without one.
- **Cardinality:** at most one authorization object exists in
  `current.authorization` at any time. BuildRail does not support multiple
  simultaneously-active authorizations in BR2 (this mirrors BR0/BR1's
  actual usage: one `authorization` block, replaced wholesale at each
  phase transition — compare BR0's closure, which changed `id: BR0` to
  `id: BR1` in one edit, not by adding a second block).
- **Active statuses:** `authorization.status` values `"authorized"` and
  `"in_progress"` are **active** — they gate implementation work. This is
  the *only* thing "active" means in BR2: policy (§13) treats an
  authorization as usable to justify starting/continuing implementation
  work if and only if its status is one of these two values.
- **`"completed"` meaning:** the authorization's scope was fulfilled and
  independently reviewed/approved; the work it covered is now recorded
  under `baselines.<phase-id>` and `completed_phases`. A `"completed"`
  authorization is **not active** — per §13, it must never be read as
  still gating new implementation work, even though it remains the value
  of `authorization` in `state.yml` (BuildRail does not clear it to `null`
  after a phase closes — see BR0's and BR1's actual closure commits, both
  of which kept `authorization` populated with `status: completed`).
- **`"revoked"` meaning:** the human owner withdrew an authorization before
  it was fulfilled (e.g. changed their mind about scope, or discovered the
  work should not proceed). A `"revoked"` authorization is **not active**
  and, unlike `"completed"`, does not correspond to any `baselines` entry
  (nothing was approved). BR2 does not yet have a governance flow that
  *produces* a `"revoked"` authorization (that's a future human-driven
  action, not BR2 machinery) — BR2 only needs to correctly treat one as
  inactive if it encounters it.
- **`"draft"` meaning:** a specification exists but has not yet been
  granted by the human owner — not active, and (unlike `"completed"`)
  there is no implementation work to have happened yet.
- **Historical representation:** past phases' authorization *records* are
  not retained verbatim (BR2 does not add an authorization-history array
  to the schema). Instead, history is reconstructed from two already-
  existing, already-correct fields: `completed_phases` (which phases
  finished) and `baselines` (the exact approved SHA and frozen status for
  each). This is deliberate — it avoids inventing new schema surface for
  something the existing BR0/BR1 closure pattern already represents
  adequately. `docs/concepts/authorization.md` is updated (as part of BR2
  implementation, not this spec — see §27) to state this explicitly.
- **BR1-style transition to a future BR2 authorization:** when BR2 itself
  is eventually authorized for implementation, the same wholesale-replace
  pattern applies: `authorization` moves from `{id: BR1, status:
  completed, ...}` to `{id: BR2, status: authorized, ...}` in one edit
  (exactly as BR0→BR1 did). No BR2-specific schema or logic change is
  needed to support this — it is already how the existing `state.yml`
  pattern works, and BR2's job is only to make the *validation and policy
  reasoning* around this pattern real, not to change the pattern itself.
- **No active phase:** if `authorization.status` is `"completed"` or
  `"revoked"` and no new authorization has been granted yet, BR2
  correctly reports "no active implementation authorization" — this is
  the exact state the repository is in right now (BR1 `completed`, BR2 not
  yet authorized). This is a normal, expected, non-error state, not a
  contradiction — `buildrail status` (§17) must represent it as such, not
  as a warning or failure.

### Summary table

| `authorization.status` | Active (gates implementation)? | Has a `baselines` entry? |
|---|---|---|
| `draft` | No | No |
| `authorized` | **Yes** | No (not yet) |
| `in_progress` | **Yes** | No (not yet) |
| `completed` | No | Yes |
| `revoked` | No | No |

## 13. Authorization Policy

`packages/core/src/policy/index.ts` — pure functions over an already-
loaded `BuildRailState`, no filesystem or Git access:

```ts
function isAuthorizationActive(state: BuildRailState): boolean;
function getActiveAuthorization(state: BuildRailState): Authorization | null;
function authorizationCoversPhase(state: BuildRailState, phaseId: string): PolicyResult;
function checkImplementationAllowed(state: BuildRailState, phaseId: string): PolicyResult;
```

`checkImplementationAllowed` is the composed, primary entry point,
performing these checks in order and returning the first failure (or
success if all pass):

| Check | Failure code |
|---|---|
| `authorization` is present at all | `AUTHORIZATION_MISSING` |
| `authorization.status` is `"authorized"` or `"in_progress"` (§12) | `AUTHORIZATION_INACTIVE` (covers both `completed` and `draft` cases — a `draft` authorization is not yet granted, so "inactive" is the correct, single code rather than a separate "not yet granted" code) |
| `authorization.status` is not `"revoked"` | `AUTHORIZATION_REVOKED` (checked as a distinct code from `AUTHORIZATION_INACTIVE` per §18, even though both mean "not active," because a revoked authorization is a materially different situation for a human reading the error — it was explicitly withdrawn, not merely not-yet-granted or already-finished) |
| `authorization.id` equals the requested `phaseId` | `AUTHORIZATION_PHASE_MISMATCH` |
| `authorization.specification` is a non-empty string | `AUTHORIZATION_MISSING` (schema already requires this field to exist per `authorization.schema.json`'s `required` array — this check exists for defense-in-depth in case a caller constructs a `BuildRailState` value outside the normal `loadState` path, e.g. in a test) |
| `authorization.granted_by === "human"` | `AUTHORIZATION_MISSING`, `details: "authorization.granted_by must be 'human'"` (this is BR2's concrete, checkable form of AGENTS.md's "granted_by: Who granted this authorization. Must be the human owner, not an agent" — BR2 does not invent an identity system to verify *who* actually typed the value, it only checks the recorded field equals the literal string `"human"`, consistent with how BR0/BR1's `authorization.granted_by` has always been populated) |

A `completed` authorization is explicitly **not** usable as active
implementation authority — this is the direct, testable consequence of
§12's model, and is the specific behavior the human owner's task
description called out as needing a canonical, checkable answer.

Protected-system policy reasoning (§14) is a separate module, also under
`packages/core/src/policy/`, but kept logically distinct from
authorization checks above (different failure modes, different callers).

## 14. Protected-System Boundary

Restating §4/§6's separation explicitly, as its own section, since this
is a boundary the human owner's task description called out as needing
unambiguous treatment.

**BR2 may:**

- Load `.buildrail/config.yml`'s `protected_systems` array (already part
  of `config.schema.json`'s existing shape — each entry has `name`,
  `status` (`open`/`guarded`/`frozen`/`locked`), and `paths`) as part of
  ordinary config loading (§8) — no new loader logic beyond what §8
  already specifies
- Represent protection levels as typed values (`ProtectedSystemStatus`,
  mirroring the schema's enum) once loaded
- Perform policy reasoning that depends only on already-loaded config/state
  — for example, "does this config declare any `frozen` or `locked`
  system at all" is answerable from config alone

**BR2 must NOT:**

- Inspect the Git working tree or any commit's changed paths
- Determine whether a specific candidate's diff touches a path matching a
  `protected_systems` entry's `paths` glob
- Perform any glob/path matching against real filesystem changes
- Expose a `checkProtectedPathViolation`-style function or equivalent —
  no such function exists in BR2's public API, because BR2 has no diff to
  check it against

All of the above (real path-matching enforcement) is explicitly BR3's
responsibility, per `docs/PROTECTED_SYSTEMS.md`'s own "Status" section
("Path-matching enforcement is not implemented as of BR0 — planned for
BR2/BR3") and `docs/ROADMAP.md`'s BR3 scope
("protected-path/deletion/rename detection"). BR2 implementation must not
attempt to anticipate or partially implement this — a policy module that
*looks like* it does path matching, even if incomplete or clearly marked
experimental, would blur this boundary and is disallowed.

`packages/core/schemas/config.schema.json`'s `protected_systems` schema
shape itself is not changed by BR2 — it was already established in BR0
and is loaded and validated as-is (§8's test matrix includes valid/invalid
`protected_systems` entries for exactly this reason).

## 15. Lifecycle Engine

`packages/core/src/lifecycle/`

### State graph

The 16 states from `docs/STATE_MACHINE.md` (14 primary-path states plus
`BLOCKED` and `CORRECTION_REQUIRED`) are represented as data:

```ts
interface TransitionRule {
  from: LifecycleState;
  to: LifecycleState;
  requiredActor: Actor | null; // null = any actor (e.g. the implementing agent) may perform it
}

type Actor = "human_owner" | "independent_reviewer" | "implementation_agent";
```

The primary path (`IDEA → SPECIFIED → AUTHORIZED → PREFLIGHT →
IMPLEMENTING → IMPLEMENTED → VERIFYING → PENDING_REVIEW →
REVIEW_APPROVED → HUMAN_QA → MERGE_AUTHORIZED → MERGED →
PRODUCTION_VERIFIED → FROZEN`) plus `BLOCKED`/`CORRECTION_REQUIRED` entries
are encoded exactly per `docs/STATE_MACHINE.md`'s "Primary transition
path," "Transitions requiring human authority," and "Transitions an agent
may perform within active authorization" sections — this specification
does not redefine the graph, only implements it as typed data. The exact
`TransitionRule[]` table is an implementation deliverable, cross-checked
against `docs/STATE_MACHINE.md` line-by-line in review (§28), not
reproduced in full here to avoid two documents drifting out of sync — the
existing markdown file remains authoritative for the *policy* and this
spec is authoritative for the *code shape* implementing it.

### API

```ts
function isLegalTransition(from: LifecycleState, to: LifecycleState): boolean;
function requiredActor(from: LifecycleState, to: LifecycleState): Actor | null; // undefined behavior (throws) if !isLegalTransition
function applyTransition(
  state: BuildRailState,
  to: LifecycleState,
  actor: Actor
): Result<BuildRailState, LifecycleError>;
```

- `isLegalTransition` and `requiredActor` are pure, synchronous, and
  total over the full `LifecycleState × LifecycleState` space (every pair
  either is or isn't legal — no exceptions for "unknown" states, since the
  schema enum is closed).
- `applyTransition` is pure (no file I/O — it returns a new in-memory
  `BuildRailState` value; *persisting* that value to
  `.buildrail/state.yml` is the caller's responsibility, consistent with
  §16's I/O/logic separation). It fails with:
  - `LIFECYCLE_TRANSITION_ILLEGAL` if `isLegalTransition(from, to)` is
    false
  - `LIFECYCLE_AUTHORITY_REQUIRED` if the transition requires an actor
    role other than the one supplied
- **Backwards transitions:** `docs/STATE_MACHINE.md`'s primary path is
  strictly forward; `applyTransition` rejects any `to` that is not either
  the next state on the primary path from `from`, or a legal
  `BLOCKED`/`CORRECTION_REQUIRED` entry/exit per the state machine doc.
  There is no generic "any state to any earlier state" allowance — each
  legal backwards-ish move (e.g. `CORRECTION_REQUIRED → IMPLEMENTING`) is
  an explicit table entry, not inferred.
- **Illegal forward skips:** e.g. `AUTHORIZED → IMPLEMENTED` (skipping
  `PREFLIGHT`/`IMPLEMENTING`) is illegal and must be rejected — this is
  the specific "selected illegal forward skips" case called out in the
  testing contract (§21).

## 16. Actor/Authority Rules

Restating `docs/STATE_MACHINE.md`'s existing division, made concrete as
the `Actor` type and `requiredActor()` function above:

| Actor | Example transitions it alone may perform |
|---|---|
| `human_owner` | `SPECIFIED → AUTHORIZED`, `HUMAN_QA → MERGE_AUTHORIZED`, `MERGED → PRODUCTION_VERIFIED` (unless a future pre-authorized deterministic check performs this — not built in BR2), any `* → FROZEN` |
| `independent_reviewer` | `PENDING_REVIEW → REVIEW_APPROVED` |
| `implementation_agent` | `AUTHORIZED → PREFLIGHT`, `PREFLIGHT → IMPLEMENTING`, `IMPLEMENTING → IMPLEMENTED`, `IMPLEMENTED → VERIFYING`, `VERIFYING → PENDING_REVIEW`, entering `BLOCKED`/`CORRECTION_REQUIRED` when detected |

**`Actor` is a plain governance input, not an authentication system.**
`applyTransition`'s `actor` parameter is whatever string the caller
supplies (e.g., a CLI flag, or a future skill's hardcoded role) — BR2 does
not verify that the caller *is* actually the human owner, an independent
reviewer, or an implementation agent in any cryptographic or
session-based sense. This mirrors how BR0–BR1's entire governance model
has worked so far (a human types "I authorize this" in a prompt; nothing
verifies their identity beyond the surrounding process). Building real
actor authentication is explicitly out of scope for BR2 (§6) and is not
assigned to any specific future phase by this specification — it is a
product question, not one this spec resolves.

## 17. CLI Integration

### 16.1 `buildrail status`

Replaces BR1's fixed placeholder with real governance-backed output.
`packages/cli/src/commands/status.ts` calls `@buildrail/core`'s
`loadConfig`/`loadState`, and (when both succeed) `policy`'s
`getActiveAuthorization`, and formats the result.

**Success output fields (at minimum):**

```
BuildRail status

Project: BuildRail
Development phase: BR1
Lifecycle state: FROZEN

Authorization:
  BR1 / CLI Skeleton — completed (not active)

Completed phases: BR0, BR1
Baselines:
  BR0 → 04c93767510c51916fcc51f60b85b674c7d6f1cc (frozen)
  BR1 → 36f7b0a569eeee0cd1c5d7472cf176763c818a2e (frozen)

Candidate: none

Governance documents: valid
```

Exact prose/formatting is an implementation detail (may be refined for
readability), but the **field set** is fixed: project name, development
phase, lifecycle state, active-or-not authorization summary (phase id,
title, status, and explicitly whether it is *active* per §12 — not just
its raw status string), current candidate metadata (or "none" when all
three candidate fields are `null`), a baseline summary, and confirmation
that config/state validated successfully against their schemas.

**Forbidden in BR2 `status` output** (explicitly, per the human owner's
task description): current Git branch, current HEAD SHA, working-tree
dirtiness, remote SHA, changed paths — any of these would be BR3 leakage,
since BR2 has no Git-inspection capability to produce them truthfully.

**Failure behavior:** if `loadConfig` or `loadState` returns an error,
`buildrail status` prints a deterministic, human-readable message derived
from the typed error (per §18's structured fields — `code`, `message`,
`path` where applicable) and exits `1` (matching BR1's existing exit-code
contract: "recognized command could not perform the requested operation").
No raw stack traces, no Node error objects printed directly — the CLI
translates the core error type to text, per §19's separation.

### 16.2 `buildrail status --help`

Its help text (currently: "BR1 status: state-backed status reporting is
not implemented yet...") must be updated in the same implementation work
to describe BR2's real behavior, since it would otherwise be a false,
stale claim the moment `status` itself becomes real — flagged here so it
isn't missed as a "just update the docstring" afterthought during
implementation.

### 16.3 Exit codes, help contract, unknown-command behavior

Unchanged from BR1 (`0`/`1`/`2` contract, `--help`/`-h`/`help`,
`--version`/`-v`, unknown-command handling) — BR2 does not touch
`packages/cli/src/cli.ts`'s dispatch logic, only `status.ts`'s body and,
by extension, adds a new dependency edge from `@buildrail/cli` to
`@buildrail/core`.

### 16.4 `buildrail init`

**Not changed by BR2.** Per §6 and BR1's own spec, real `init` ownership
was left an open roadmap question. This specification does not claim BR2
ownership of it, because neither `docs/ROADMAP.md` nor
`docs/development/BR2.md` (as they stand today) clearly establish that —
`docs/development/BR2.md`'s existing Scope section lists "Config loading,"
"State loading," "Lifecycle transition validation," "Policy checks," not
"project initialization." Per the human owner's explicit instruction not
to assign `init` to BR2 absent clear existing ownership, `buildrail init`
remains exactly the BR1 boundary shell it is today after BR2 ships. The
open roadmap question remains open, to be resolved explicitly before
whichever future phase does claim it.

## 18. Error Model

All BR2 errors are discriminated-union-style typed objects (not thrown
strings), each with at minimum:

```ts
interface BuildRailError {
  code: string;     // one of the codes below
  message: string;   // human-readable, safe to show a nontechnical user
  path?: string;      // JSON-Pointer-ish location within the document, when applicable
  details?: unknown;  // structured extra context (e.g. schema validator's raw error list, or underlying fs error), not guaranteed stable across versions
}
```

| Code | Layer | Meaning |
|---|---|---|
| `CONFIG_NOT_FOUND` | config | `.buildrail/config.yml` does not exist |
| `CONFIG_READ_FAILED` | config | File exists but could not be read (permissions, I/O error) |
| `CONFIG_YAML_INVALID` | config | File content is not valid YAML, or parses to a non-object |
| `CONFIG_SCHEMA_INVALID` | config | Valid YAML/object, fails `config.schema.json` validation |
| `STATE_NOT_FOUND` | state | `.buildrail/state.yml` does not exist |
| `STATE_READ_FAILED` | state | File exists but could not be read |
| `STATE_YAML_INVALID` | state | File content is not valid YAML, or parses to a non-object |
| `STATE_SCHEMA_INVALID` | state | Valid YAML/object, fails `state.schema.json` validation (including nested `authorization`) |
| `SCHEMA_REFERENCE_UNRESOLVED` | schema | Registry setup failed — a schema file is missing/malformed, or a `$ref` cannot be resolved against the registered set (registration-time, not validation-time) |
| `AUTHORIZATION_MISSING` | policy | No authorization present, or a required field (e.g. `granted_by`) fails BR2's defense-in-depth check |
| `AUTHORIZATION_INACTIVE` | policy | Authorization present but `status` is `draft` or `completed` (§12) |
| `AUTHORIZATION_REVOKED` | policy | Authorization present with `status: revoked` |
| `AUTHORIZATION_PHASE_MISMATCH` | policy | Active authorization's `id` does not match the requested phase |
| `LIFECYCLE_TRANSITION_ILLEGAL` | lifecycle | Requested `from → to` pair is not in the legal transition graph |
| `LIFECYCLE_AUTHORITY_REQUIRED` | lifecycle | Transition is legal but the supplied actor lacks authority to perform it |
| `INTERNAL_UNSUPPORTED` | any | Reserved catch-all for a genuinely unanticipated internal failure (e.g. an assertion that should be unreachable) — must not become a dumping ground for cases that deserve their own code; adding a new specific code is always preferred to reusing this one |

Ordinary governance failures (any of the above except `INTERNAL_UNSUPPORTED`
used correctly) must never surface as a raw stack trace through the CLI —
this extends BR1's existing Error Contract principle
("Ordinary user mistakes... must never produce a raw stack trace") to
governance-layer failures, not just CLI-usage failures.

## 19. Result/Error Propagation Strategy

**Chosen strategy: typed `Result<T, E>` objects, not thrown exceptions,
for all expected governance-domain failures.**

```ts
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

Rationale:

- Every failure enumerated in §18 is an *expected*, *anticipated* outcome
  of normal BuildRail usage (a missing file, invalid YAML, an
  inactive authorization) — not an exceptional program state. Modeling
  these as return values rather than thrown exceptions makes every call
  site handle them explicitly (TypeScript's type system forces the caller
  to check `ok` before accessing `value`), which directly serves BR2's
  goal of deterministic, non-crashing governance behavior.
- Actual exceptions (thrown `Error`/subclasses) are reserved for genuinely
  unexpected, programmer-error-class failures: `createRegistry()` throwing
  `SchemaReferenceUnresolvedError` is the one deliberate exception in this
  spec, because a broken schema file is a BuildRail installation defect,
  not a per-project data problem a caller should be expected to handle
  gracefully inline — it should fail loudly and immediately, ideally
  crashing a build/CI step rather than being silently caught.
- **CLI translation is a separate layer.** `packages/cli/src/commands/status.ts`
  receives `Result` values from `@buildrail/core` and is responsible for
  converting `{ok: false, error}` into BR1-contract-compliant stdout text
  and an exit code. `@buildrail/core` itself never formats CLI-style
  output, never calls `process.exit`, and never writes to `stdout`/`stderr`
  directly — preserving the CLI/Core layering `docs/ARCHITECTURE.md`
  already establishes and BR1's spec already required for its own command
  handlers.
- Ad hoc string-typed errors (`throw new Error("bad config")`) are
  explicitly disallowed for any of the §18 cases — every expected failure
  must map to exactly one of the typed codes.

## 20. Dependencies

### 19.1 YAML parser: `yaml` (eemeli/yaml)

| Aspect | Detail |
|---|---|
| Package name | `yaml` |
| Version strategy | Pin a caret range on the latest stable major at implementation time (currently 2.x) — exact version resolved and recorded in `package-lock.json` at implementation time, not hard-coded in this spec |
| Runtime dependency | Yes, in `packages/core/package.json` |
| Why chosen | Actively maintained, zero transitive dependencies, full YAML 1.2 support (the version the ecosystem has converged on), a documented, safe parsing API (`YAML.parse`) that does not execute arbitrary tags/constructors by default (unlike some `js-yaml` usage patterns, which historically required explicit care around `!!js/function` and similar unsafe schema extensions) |
| Node compatibility | Pure JS, no native bindings — compatible with Node `>=22` (BR1's established minimum, preserved unchanged per §24) |
| Maintenance status | Actively maintained as of this writing; widely used (transitively, by ESLint, `@typescript-eslint`, and many others), giving it a large de facto test surface beyond BuildRail's own usage |
| Security implications | See §20.3 — `YAML.parse` with default options does not construct arbitrary JS objects or execute code from document content; BR2 must not enable "custom tags" or `schema: "core"`-with-unsafe-extensions options |
| Feature scope | BR2 uses only `YAML.parse(text)` — no YAML *writing*/serialization is needed (BR2 never writes `.buildrail/state.yml` itself; persistence, if ever automated, is a later-phase concern), no custom tag registration, no document comments/CST manipulation |

**Alternative considered and rejected:** `js-yaml`. Also widely used and
actively maintained, but `yaml`'s API more naturally separates "safe by
default" parsing from opt-in advanced features, and BuildRail has no
existing dependency on `js-yaml`'s specific API shape — no migration cost
either way, so the safer-by-default option is preferred absent a
concrete reason to choose otherwise.

### 19.2 JSON Schema validator: `ajv` (+ `ajv-formats` if `format` keywords are used)

| Aspect | Detail |
|---|---|
| Package name | `ajv` |
| Runtime dependency | Yes, in `packages/core/package.json` |
| Supported draft | Ajv v8's default export supports Draft-07; **Draft 2020-12 support requires importing `ajv/dist/2020`** (the `Ajv2020` export), not the package's default entry point. This distinction must not be assumed away — implementation must explicitly use `import Ajv2020 from "ajv/dist/2020"` (or the equivalent for whatever exact major/minor is pinned at implementation time), verified against the installed version's actual export map before relying on it. |
| Compatibility with repo's schemas | All five `packages/core/schemas/*.json` files declare `"$schema": "https://json-schema.org/draft/2020-12/schema"` — the `Ajv2020` constructor is required for correct behavior; using default Ajv (Draft-07 semantics) against these schemas would silently misbehave on 2020-12-specific keywords/semantics and must not be used |
| `$id` handling | Ajv (`Ajv2020`) registers each schema under its own `$id` when passed to `addSchema()`; `$ref`s resolve against registered `$id`s per §11 |
| Relative `$ref` handling | Standard JSON Schema resolution (relative to the containing schema's base URI, i.e. its `$id`) — this is Ajv's default, documented behavior, not a special configuration BR2 must enable |
| Registry behavior | `new Ajv2020({ ...options })` instance holds the registry; `addSchema(schema)` registers each of the five files once at `createRegistry()` time (§10); `getSchema($id)` or `compile()` per-`$id` retrieves a validator function |
| Normalized validation errors | Ajv's `errors` array (`AjvError[]`, each with `instancePath`, `message`, `keyword`) is mapped to BR2's `SchemaValidationErrorDetail[]` (§10) — `instancePath` becomes `path` (JSON Pointer, converted to dot-notation for readability, e.g. `/authorization/status` → `authorization.status`), `message` passed through, `keyword` passed through |
| Node compatibility | Pure JS, compatible with Node `>=22` |
| Configuration required | `strict: false` is **not** proposed — implementation should default to Ajv's strict mode and only relax specific strict-mode warnings if a genuine, documented conflict with the existing schema files is found during implementation (none is currently known from inspection). `allErrors: true` **is** proposed, so `SchemaValidationResult.errors` reports every violation in one pass rather than only the first, which is more useful for a human reading `buildrail status` output. |

**`ajv-formats` (optional, conditional dependency):** none of the five
current schema files use the JSON Schema `format` keyword (checked by
direct inspection — `verification-report.schema.json`'s `timestamp` field
uses `"format": "date-time"`). Because `verification-report.schema.json`
*does* use `format: "date-time"`, and BR2's schema registry registers all
five schemas (§10) even though BR2 itself doesn't validate verification
reports yet, `ajv-formats` **is** required as a dependency so that
`format` validation doesn't silently no-op or throw under Ajv's strict
mode for a keyword it doesn't recognize by default.

**Alternative considered and rejected:** hand-rolled validation (no
JSON Schema library). Rejected because the schemas already exist,
are already Draft 2020-12, and reimplementing a validator would
duplicate well-tested logic for no benefit — directly contrary to BR1's
established "smallest reasonable dependency surface, but justify real
need" policy, which this *is* a real need for (schema-driven validation
is the explicit BR0/BR2 design, not an optional nicety).

### 19.3 No dependencies are installed by this specification

Per the human owner's explicit instruction, this document proposes exact
package choices and rationale but performs no `npm install` — that occurs
only once BR2 implementation is separately authorized.

## 21. Security

| Concern | BR2 requirement |
|---|---|
| YAML parser safety | `yaml`'s default `YAML.parse` used with no custom tags/schema extensions enabled — no arbitrary JS object construction or code execution from document content (§20.1) |
| Untrusted repository contents | `.buildrail/config.yml` / `state.yml` are treated as untrusted input even though they live in the same repository as BuildRail itself — validation must not assume "this repo controls its own config, so it's safe" |
| Prototype pollution | Neither `yaml` nor `ajv` (in their default configurations, as proposed) are known to be vulnerable to prototype-pollution-via-parsed-document in normal usage; BR2 implementation must not add `__proto__`/`constructor`/`prototype` special-casing logic of its own that could reintroduce such a class of bug, and must not merge parsed YAML into any object via unsafe deep-merge utilities |
| Schema validation limits | No BR2 code evaluates `$dynamicRef`, `$recursiveRef`, or other advanced 2020-12 keywords beyond what the five existing schema files actually use (checked by inspection: none currently use these) — if a future schema change introduces one, it must be revisited, not assumed to "just work" |
| No arbitrary code execution from YAML/config/state | Restated as a hard requirement: no `eval`, no `Function()` constructor, no dynamic `require`/`import` of a path derived from file content, anywhere in the config/state loading path |
| No evaluation of user-provided JavaScript | Same as above — nothing in `.buildrail/*.yml` is ever treated as executable code |
| No shell command execution for governance loading | `loadConfig`/`loadState` perform only `fs` reads and in-memory parsing — no `child_process`, no shelling out, for any reason |
| No network access to resolve local schemas | §11's resolution strategy is entirely local-file-based; `createRegistry()` must never make an HTTP request, even if a schema's `$id` looks like a resolvable URL (`https://buildrail.dev/schemas/...`) — that `$id` is an *identifier*, never dereferenced as an actual URL. Ajv is configured (or simply never given a network-capable loader) such that this is structurally true, not just a documented intention. |
| No remote schema fetching | Same as above, restated: BuildRail must never fetch an arbitrary schema from the network merely because a document contains a `$ref` — this applies to `authorization.schema.json`'s reference and to any future `$ref` a schema might add |
| Stable local-only `$ref` resolution | §11 in full — resolution is deterministic given the fixed set of files under `packages/core/schemas/`, with no external state affecting the outcome |

## 22. Test Architecture

`node:test` + `node:assert` (matching BR1's established testing
approach — no new test framework dependency introduced). Tests live under
`packages/core/tests/` (currently a `.gitkeep` placeholder, mirroring
BR1's `packages/cli/tests/` pattern before implementation).

Unlike BR1's CLI tests (which necessarily spawn the built executable as a
subprocess, since BR1's contract is observable CLI behavior), BR2's core
logic is tested as a **library**, in-process — `loadConfig`/`loadState`
are called directly against fixture files (§23), and `lifecycle`/`policy`
functions are called directly against in-memory fixture values, with no
subprocess spawning needed. This is possible and preferred specifically
*because* of the I/O/pure-logic separation in §7/§16 — lifecycle and
policy tests in particular need no filesystem setup at all.

Minimum required test categories (each bullet is a required test case,
not merely a suggested one):

**Config loading**
- Valid config loads and validates successfully
- Missing config file → `CONFIG_NOT_FOUND`
- Malformed YAML → `CONFIG_YAML_INVALID`
- Wrong root type (e.g. a YAML list at the document root) → `CONFIG_SCHEMA_INVALID`
- Missing a required field (e.g. no `schema_version`) → `CONFIG_SCHEMA_INVALID`
- Invalid enum value (e.g. `git.force_push: "sometimes"`) → `CONFIG_SCHEMA_INVALID`
- Valid `protected_systems` array with one well-formed entry validates
- Invalid `protected_systems` entry (missing required `name`/`status`/`paths`) → `CONFIG_SCHEMA_INVALID`

**State loading**
- Valid state loads and validates successfully
- Missing state file → `STATE_NOT_FOUND`
- Malformed YAML → `STATE_YAML_INVALID`
- Missing a required field (e.g. no `current`) → `STATE_SCHEMA_INVALID`
- Invalid `lifecycle_state` value (not in the enum) → `STATE_SCHEMA_INVALID`
- Invalid `authorization.status` value → `STATE_SCHEMA_INVALID`, `path` starting `authorization.`
- Nested authorization missing a required field (e.g. no `granted_by`) → `STATE_SCHEMA_INVALID`
- `candidate` with all three fields `null` validates successfully (the current real BR1-frozen-main shape)
- A fixture reproducing BuildRail's own actual BR0+BR1-frozen `state.yml` shape validates successfully end-to-end

**Schema system**
- All five registered schemas compile without error via `createRegistry()`
- `authorization` `$ref` inside `state.schema.json` resolves correctly (validating a state document with a deliberately invalid nested authorization correctly reports an `authorization.*`-pathed error, proving the nested schema was actually applied, not skipped)
- A deliberately broken/unregistered `$ref` (test-only fixture schema, not one of the five real files) fails predictably at registry-setup time with `SCHEMA_REFERENCE_UNRESOLVED`
- No network call is made during any schema test (asserted by running in an environment with no network access, or by a lightweight instrumentation check — implementation's choice of mechanism, but the assertion itself is required)

**Lifecycle**
- Each legal primary-path transition (`IDEA → SPECIFIED`, `SPECIFIED → AUTHORIZED`, ... `PRODUCTION_VERIFIED → FROZEN`) is individually tested as legal
- At least one illegal forward skip (e.g. `AUTHORIZED → IMPLEMENTED`) is rejected
- At least one illegal backwards transition on the primary path (e.g. `IMPLEMENTED → PREFLIGHT`) is rejected
- A human-owner-only transition (e.g. `SPECIFIED → AUTHORIZED`) succeeds with `actor: "human_owner"` and fails with `LIFECYCLE_AUTHORITY_REQUIRED` for `actor: "implementation_agent"`
- The independent-reviewer-only transition (`PENDING_REVIEW → REVIEW_APPROVED`) succeeds only for `actor: "independent_reviewer"`
- At least one implementation-agent-performable transition (e.g. `IMPLEMENTING → IMPLEMENTED`) succeeds for `actor: "implementation_agent"`
- Entering `BLOCKED` from at least one main-path state is legal for the implementation agent
- Entering `CORRECTION_REQUIRED` and the documented return transition (e.g. back to `IMPLEMENTING`) are both legal

**Authorization policy**
- An `authorized`-status record is accepted as active
- A `completed`-status record is rejected as active (`AUTHORIZATION_INACTIVE`) — the specific case the human owner's task called out
- A `revoked`-status record is rejected (`AUTHORIZATION_REVOKED`)
- A `draft`-status record is rejected as active (`AUTHORIZATION_INACTIVE`)
- No `authorization` present at all is rejected (`AUTHORIZATION_MISSING`)
- An active authorization whose `id` does not match the requested phase is rejected (`AUTHORIZATION_PHASE_MISMATCH`)
- `granted_by !== "human"` is rejected (`AUTHORIZATION_MISSING`) even if `status` is otherwise `authorized`

**CLI status integration**
- `buildrail status` against a valid, BR0+BR1-frozen-shaped fixture project prints the required field set (§17.1) and exits `0`
- `buildrail status` against a fixture with invalid config prints a deterministic error and exits `1`, with no raw stack trace in stdout/stderr
- `buildrail status` against a fixture with invalid state behaves the same way
- `buildrail status` against a fixture with missing `.buildrail/` files behaves the same way
- Output contains no Git-derived facts (branch, SHA, dirty-tree, remote SHA, changed paths) — asserted by absence, not merely "not observed to be present"

## 23. Fixtures

`packages/core/tests/fixtures/` (new directory), each fixture a small,
self-contained `.buildrail/`-shaped directory tree (or individual
`config.yml`/`state.yml` files, implementation's choice of granularity),
covering at minimum:

- `valid-project/` — a complete, schema-valid `config.yml` + `state.yml`
  pair, shaped like BuildRail's own actual BR0+BR1-frozen state (used for
  the "reproduces BuildRail's own real shape" test in §22, and for
  `buildrail status` success-path tests)
- `invalid-config-malformed-yaml/`
- `invalid-config-missing-field/`
- `invalid-state-malformed-yaml/`
- `invalid-state-missing-field/`
- `missing-authorization/` — state with no `authorization` key at all
- `completed-authorization/` — state with `authorization.status: completed` (the specific non-active case)
- `revoked-authorization/` — state with `authorization.status: revoked`
- `lifecycle-transitions/` — not a filesystem fixture; in-memory
  `BuildRailState`-shaped objects (or bare `LifecycleState` pairs) covering
  the transition matrix in §22's Lifecycle bullets

Tests must not depend exclusively on BuildRail's own live, currently-
committed `.buildrail/state.yml`/`config.yml` for their fixtures (per the
human owner's explicit instruction) — those files change over time as
BuildRail's own governance evolves, which would make tests fragile to
unrelated future edits. The one exception (§22, "reproduces BuildRail's
own actual... shape") is a deliberately *static, frozen copy* of the
current real shape, committed as its own fixture file, not a live read of
the actual `.buildrail/` directory at test time.

## 24. Quality Gates

BR2 implementation completion requires actual, passing results for:

- `npm test` — extended to include `packages/core`'s new test suite
  alongside BR1's existing `packages/cli` suite (both must pass; BR2 does
  not replace or weaken BR1's existing 14 tests)
- `npm run typecheck` — extended to include `packages/core`
- `npm run build` — extended to include `packages/core` (compiling
  `packages/core/src/**/*.ts` to `packages/core/dist/`, mirroring BR1's
  `packages/cli` build pipeline)

`npm run lint` remains `NOT CONFIGURED` unless separately authorized —
BR2 does not introduce lint tooling.

BR2 implementation must **extend** the real root-level scripts BR1
established (currently `npm run build --workspace=@buildrail/cli`, etc.)
to also invoke `@buildrail/core`'s equivalent scripts — not replace them,
and not reintroduce a placeholder-echo state for either package.

## 25. Runtime Compatibility

**Minimum supported Node version: Node.js `>=22`, unchanged from BR1.**
This specification does not reduce, raise, or otherwise alter that
baseline. `packages/core/package.json` gains an `engines.node: ">=22"`
field mirroring `packages/cli/package.json`'s existing one.

TypeScript expectations consistent with BR1: `packages/core` gets its own
`tsconfig.json` extending the shared `tsconfig.base.json` (same
`ES2022`/`NodeNext`/`strict` baseline BR1 established), with its own
`outDir: "dist"`, `rootDir: "src"`, mirroring `packages/cli/tsconfig.json`'s
existing shape exactly.

## 26. Acceptance Criteria

- **A.** `loadConfig` returns a valid, typed `BuildRailConfig` for a
  schema-valid `config.yml`, and a typed `ConfigError` (never an uncaught
  exception) for each failure category in §8.
- **B.** `loadState` returns a valid, typed `BuildRailState` for a
  schema-valid `state.yml` (including successful nested `authorization`
  validation), and a typed `StateError` for each failure category in §9.
- **C.** The cross-schema `authorization.schema.json` `$ref` inside
  `state.schema.json` resolves correctly via the schema registry (§11),
  proven by a test that validates a state document with a deliberately
  invalid nested authorization and confirms the error path is
  `authorization.*`, not a validator crash or silent pass.
- **D.** `createRegistry()` fails predictably and distinctly
  (`SCHEMA_REFERENCE_UNRESOLVED`) for a genuinely broken/unregistered
  `$ref`, proven by a test using a fixture schema, not one of the five
  real files.
- **E.** No schema resolution makes a network request, proven by the
  no-network-call test in §22.
- **F.** `isLegalTransition`/`requiredActor`/`applyTransition` correctly
  implement the full state graph from `docs/STATE_MACHINE.md`, proven by
  the transition test matrix in §22 (every primary-path edge, selected
  illegal skips, selected illegal backwards moves, all three actor-gated
  transition types, `BLOCKED`/`CORRECTION_REQUIRED` entry/exit).
- **G.** `checkImplementationAllowed` correctly distinguishes
  active/authorized, active/in-progress, inactive/completed,
  inactive/draft, and revoked authorization states, proven by the policy
  test matrix in §22 — specifically including the "completed authorization
  is not usable as active implementation authority" case the human owner's
  task explicitly required.
- **H.** `buildrail status` produces the required field set (§17.1) with
  no Git-derived facts, for a valid fixture project, and exits `0`.
- **I.** `buildrail status` produces a deterministic, non-stack-trace
  error and exits `1` for each of: invalid config, invalid state, missing
  files.
- **J.** `buildrail init` behavior is unchanged from BR1 (still the BR1
  boundary shell, per §17.4) — proven by re-running BR1's own existing
  `init`-related tests unmodified and passing against the BR2 candidate.
- **K.** `npm test`, `npm run typecheck`, `npm run build` all pass at the
  repository root, covering both `packages/cli` (BR1, unmodified) and
  `packages/core` (BR2, new).
- **L.** No Git inspection (branch, SHA, diff, deletion/rename detection)
  was implemented anywhere in `packages/core` or `packages/cli`.
- **M.** No quality-gate *execution engine* (`buildrail verify` or
  equivalent) was implemented.
- **N.** No agent skill, adapter, or dogfood-lifecycle work was performed.
- **O.** No real `buildrail init` scaffolding was implemented.
- **P.** No network calls occur anywhere in the BR2 implementation's
  normal operation (schema loading, config loading, state loading,
  `buildrail status`).
- **Q.** No dependency beyond `yaml`, `ajv`, and (conditionally)
  `ajv-formats` was added to `packages/core/package.json` without
  explicit justification recorded in the implementation's completion
  report, per BR1's established dependency-justification precedent.

## 27. Deferred Items

Carried forward from BR0/BR1, and newly identified by this specification;
**not** BR2 implementation responsibilities beyond what §11/§12 already
resolve at the *specification* level:

1. **BR2 governance activation sequencing.** Mirroring BR1's activation
   pattern exactly: before BR2 *implementation* may begin (not before this
   *specification* is reviewed), a separate governance-activation task
   must update `.buildrail/config.yml` (flipping any newly-relevant
   quality-gate `required` flags if applicable — likely none beyond what
   BR1 already set, since `tests`/`typecheck`/`build` are already
   `required: true`) and `.buildrail/state.yml` (`authorization.id: BR2`,
   `status: authorized`, `current.development_phase: BR2`,
   `current.lifecycle_state: AUTHORIZED`) — exactly as BR1's own
   `governance(BR1): authorize CLI skeleton implementation` commit did.
   This specification does not perform that activation.
2. **`buildrail init` real ownership.** Still unresolved (§17.4) —
   carried forward unchanged from BR1, not narrowed or assigned by this
   document.
3. **Phase-ID cross-validation.** BR2's schema-driven validation does not
   reject a `completed_phases`/`planned_phases` entry like `"BR99"` that
   isn't a real BuildRail phase — flagged in §9 as a known, accepted
   limitation rather than solved ad hoc. A future phase may choose to add
   an enum constraint to the schema itself if this is judged worth doing.
4. **Cross-field state contradiction detection beyond phase/authorization
   mismatch.** §9 defines exactly one deterministic contradiction check
   (development_phase vs. active authorization id). Other conceivable
   contradictions (e.g., a phase appearing in both `completed_phases` and
   `planned_phases` simultaneously) are not detected by BR2 — noted as a
   possible future policy addition, not invented here.
5. **`docs/concepts/authorization.md` prose update.** Should be updated
   during BR2 implementation to state the canonical active/historical
   model from §12 explicitly, replacing its current more general "Only one
   authorization is normally active at a time per work item" language with
   the concrete status-table from §12. This is a documentation-consistency
   task for BR2 *implementation*, not performed by this specification.
6. **Actor authentication.** Explicitly out of scope for BR2 (§6, §16)
   and not assigned to any future phase by this document — a genuinely
   open product question.

## 28. Independent Review Requirements

Mirroring BR0/BR1's established review discipline:

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

The independent reviewer must specifically examine, for BR2:

- Whether `$ref` resolution (§11) actually works as specified — not just
  "compiles," but correctly rejects an invalid nested authorization with
  an `authorization.*`-pathed error, and correctly fails predictably (not
  silently) for a genuinely broken reference
- Whether the active/historical authorization model (§12) was implemented
  exactly as specified, especially the "completed authorization is not
  active" case
- Whether the lifecycle transition graph faithfully matches
  `docs/STATE_MACHINE.md` (a line-by-line cross-check, not a spot-check)
- Whether `buildrail status` output is free of any Git-derived fact
- Whether the CLI/Core error-translation boundary (§19) is actually
  respected — no raw exceptions leaking to stdout/stderr, no `@buildrail/core`
  code calling `process.exit` or writing to stdout/stderr directly
- Whether any of §6's out-of-scope items leaked into the implementation
- Whether test evidence is real (tests actually run, results actually
  observed) and whether the fixture-independence requirement (§23) was
  honored
- Whether exactly the dependencies proposed in §20 (and no others, absent
  justification) were added

This document does not itself authorize BR2 implementation — see §1 and
§27 item 1.
