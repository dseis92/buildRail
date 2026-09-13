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
  state value (not persistence — see §15)
- A structured, typed error/result model for all of the above (§18)
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
   that registers exactly the **three BR2-scoped** JSON Schemas
   (`config.schema.json`, `state.schema.json`,
   `authorization.schema.json` — see §10's "Registry scope"; **not**
   `verification-report.schema.json` or `handoff.schema.json`) by their
   absolute `$id`, compiles them once, resolves `$ref`s among them
   locally, and exposes a `validate(schemaId, data)` function returning a
   normalized result. Used by both config and state loaders. The registry
   mechanism/pattern (not the specific three-schema registration) is
   designed to be reusable by BR4/BR5 when they extend or introduce their
   own registration for verification-report/handoff validation — see
   §10's note on this.
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
│   ├── index.ts               # loadConfig(projectRoot) -> Promise<LoadResult<BuildRailConfig, ConfigError>>
│   ├── types.ts                # BuildRailConfig type (derived from schema)
│   └── errors.ts               # ConfigError union
├── state/
│   ├── index.ts               # loadState(projectRoot) -> Promise<LoadResult<BuildRailState, StateError>>
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
I/O-vs-pure-logic separation this tree embodies is preserved (`config/`
and `state/` do filesystem I/O plus parsing/validation; `lifecycle/` and
`policy/` are pure, no I/O — see §22's rationale for why this separation
matters for testability) and the public API surface in §8–§16 is
delivered.

`packages/core/src/index.ts` becomes the package's public entry point,
re-exporting the loader functions, lifecycle functions, policy functions,
and their associated types/error classes — this is what `@buildrail/cli`
(and later BR4/BR5) import from.

## 8. Config Loading Contract

`loadConfig(projectRoot: string): Promise<LoadResult<BuildRailConfig, ConfigError>>`
(`LoadResult`/`LoadSuccess` are defined in §20's "Typed warning-success
shape" — the success side wraps the config in `{ value, diagnostics }`
rather than returning it bare, so that YAML parser warnings, per §20,
have a documented place to go without inventing an undocumented field on
`BuildRailConfig` itself.)

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
| Valid YAML, passes schema validation | Return `{ ok: true, value: { value: config, diagnostics } }` (§20's `LoadResult`/`LoadSuccess`) where `config` is a typed `BuildRailConfig` object and `diagnostics` is a possibly-empty array of YAML parser warnings (§20) |

**Unknown properties:** `config.schema.json`'s root and every nested
object use `"additionalProperties": true` except `qualityGate` and
`protectedSystem` (also `true`). BR2 must not silently tighten this to
`false` — the loader accepts and round-trips unknown properties rather
than stripping or rejecting them, consistent with the existing schema as
written. If a future phase wants stricter validation, that is a schema
change, not a BR2 loader behavior change.

## 9. State Loading Contract

`loadState(projectRoot: string): Promise<LoadResult<BuildRailState, StateError>>`
(same `LoadResult`/`LoadSuccess` wrapper as `loadConfig` — see §8's note
and §20's "Typed warning-success shape.")

Same file-location/encoding/missing/unreadable/empty rules as §8, with
state-specific error codes: `STATE_NOT_FOUND`, `STATE_READ_FAILED`,
`STATE_YAML_INVALID`, `STATE_SCHEMA_INVALID`.

Additional state-specific behavior:

| Concern | Behavior |
|---|---|
| `authorization` absence | `authorization` is schema-optional (§12's "Optionality") — a `state.yml` with no `authorization` key loads successfully; `loadState` does not fail or fabricate a placeholder value. `BuildRailState["authorization"]` is `undefined` in this case. |
| Nested `authorization` validation (when present) | Validated as part of the single `state.schema.json` validation pass (§11) — not a separate second validation call. If `authorization` is present but invalid per `authorization.schema.json`, this surfaces as one `STATE_SCHEMA_INVALID` result whose `details` array includes an entry with `path` starting `authorization.` |
| `candidate` fields all `null` | Valid per schema (`"type": ["string", "null"]` on each field) — this is the expected shape when no implementation candidate is active (as on BR1's frozen main). Not an error. |
| `baselines` | Validated per `#/$defs/baseline` for each entry; `approved_sha` must match `^[0-9a-f]{40}$`. A `baselines` entry with a malformed SHA is `STATE_SCHEMA_INVALID`, not silently accepted. |
| `completed_phases` / `planned_phases` | Plain string arrays per schema; BR2 does not cross-validate phase IDs against a canonical phase list (e.g. rejecting `"BR99"`) — that would require domain knowledge the schema doesn't encode, and is out of scope for BR2's schema-driven validation. This is a known, accepted limitation (see §28). |
| Lifecycle state enum | Validated against the closed enum in `state.schema.json`'s `$defs.lifecycleState` (the 16 states from §12 of BR1's spec / `docs/STATE_MACHINE.md`) |
| Unresolved `authorization` `$ref` | If schema registration/compilation itself fails (not a data-validation failure — a schema-setup failure), this is `SCHEMA_REFERENCE_UNRESOLVED`, distinct from `STATE_SCHEMA_INVALID` (§18). This should be effectively unreachable once §11 is implemented correctly, but the distinct error code exists so a broken schema registration fails loudly and specifically rather than masquerading as a data problem. |
| "Contradictory state BR2 can deterministically detect" | BR2 detects exactly one class of this: **when `authorization` is present** and its `status` is `authorized` or `in_progress` (see §12), `current.development_phase` not equal to `authorization.id` — surfaced as a `PolicyError`, not a `StateError`, since it's a policy-layer concern, not a schema-layer one. This check is vacuously skipped when `authorization` is absent (there is no `authorization.id` to compare). BR2 does **not** attempt to detect other forms of contradiction (e.g. "phase in both `completed_phases` and `planned_phases`") — flagged as a deferred item (§28) rather than invented ad hoc. |

## 10. Schema Registry

`packages/core/src/schema/` provides:

```ts
// The closed set of schema $ids BR2's registry actually registers.
// A typed caller (loadConfig, loadState) can only ever pass one of these
// three values — TypeScript rejects anything else at compile time.
type Br2SchemaId =
  | "https://buildrail.dev/schemas/config.schema.json"
  | "https://buildrail.dev/schemas/state.schema.json"
  | "https://buildrail.dev/schemas/authorization.schema.json";

interface SchemaRegistry {
  validate(schemaId: Br2SchemaId, data: unknown): SchemaValidateResult;
}

// Runtime result distinguishes "schema not registered" from an ordinary
// document-invalid outcome — these are different failure classes and
// must not be conflated. This return type is deliberately NOT the bare
// SchemaValidationResult {valid, errors} shape alone, because that shape
// has no room to represent "I don't have this schema at all," which is a
// registry-lookup failure, not a document-validation failure.
type SchemaValidateResult =
  | { registered: true; result: SchemaValidationResult }
  | { registered: false }; // the schemaId, though it may be a valid Br2SchemaId string
                           // literal type-wise, was not found in this registry
                           // instance at runtime (see "Untyped caller" note below)

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

**Two layers of protection against an unknown-schema call, not one:**

1. **Compile-time (primary):** `validate()`'s first parameter is typed as
   `Br2SchemaId`, a closed string-literal union of exactly the three
   registered schemas' `$id`s. `loadConfig`/`loadState` — BR2's only
   internal callers — get a TypeScript compile error if they ever pass
   `verification-report.schema.json`'s or `handoff.schema.json`'s `$id`
   (or any other string), because those aren't members of the union. This
   is why nothing in BR2's own code can accidentally call `validate()`
   with an unregistered identifier — the type system forbids it before
   the code can even run.
2. **Runtime (defense-in-depth, for untyped/external callers):** despite
   (1), `SchemaValidateResult`'s `{ registered: false }` variant exists
   because TypeScript's type system is not enforced at runtime — a
   caller using plain JavaScript, a caller that received a string from
   an external source and asserted its type, or a future phase's code
   written against this registry before its own extension work is
   merged, could still invoke `validate()` with a string that isn't
   actually registered. In that case `validate()` returns
   `{ registered: false }` deterministically — it does **not** throw,
   does **not** return `{ registered: true, result: { valid: true,
   errors: [] } }` (which would be a false "it validated" claim), and
   does **not** reuse `SCHEMA_REFERENCE_UNRESOLVED` (§18) — that code is
   reserved specifically for *registration-time* failures inside
   `createRegistry()` (a schema file that itself fails to load or whose
   own internal `$ref` can't be resolved), which is a categorically
   different situation from *this* schema having loaded fine but a
   *different*, unregistered identifier being asked for at *validation*
   time. Reusing `SCHEMA_REFERENCE_UNRESOLVED` for "you asked for a
   schema I was never given" would blur those two meanings — a genuine
   BuildRail installation defect (the reserved meaning) versus a caller
   error (asking for something never registered) — so a distinct,
   dedicated `{ registered: false }` result is used instead. Callers
   (i.e., `loadConfig`/`loadState`) must check `registered` before
   reading `result`; `result` is present if and only if `registered` is
   `true`.

- **Initialization — registers exactly three schemas, not all five:**
  `createRegistry()` reads and compiles `config.schema.json`,
  `state.schema.json`, and `authorization.schema.json` — the three
  schemas BR2 actually validates against. **`verification-report.schema.json`
  and `handoff.schema.json` are deliberately NOT registered by BR2's
  registry** (see the "Registry scope" note below for why, and see §20.2
  for the resulting dependency consequence). Registration happens once,
  at call time (not module load time — so a broken schema file surfaces
  as a catchable error, not a crash on `import`). Registration order does
  not matter to the caller; internally, `authorization.schema.json` is
  registered before `state.schema.json` resolves its `$ref` to it
  (implementation detail of §11's resolution strategy, not a
  caller-visible contract).
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

### Registry scope: 3 schemas, not 5

**Chosen architecture (resolving a prior draft's internal contradiction
about whether `ajv-formats` is optional or required — see §20.2 for the
full rationale): BR2's registry registers only the schemas BR2 itself
validates against.**

BR2 validates `.buildrail/config.yml` (against `config.schema.json`) and
`.buildrail/state.yml` (against `state.schema.json`, which references
`authorization.schema.json`). BR2 does **not** validate a verification
report or a handoff document — those are BR4 and BR5 concerns
respectively (§6). Eagerly compiling and registering
`verification-report.schema.json` and `handoff.schema.json` during BR2
would mean BR2's registry does work for phases that don't exist yet, for
no BR2-visible benefit — and, concretely, it would force `ajv-formats` to
be a BR2 dependency merely because `verification-report.schema.json`
happens to use `"format": "date-time"`, a keyword no BR2 validation call
ever exercises.

**Consequence:** `packages/core/src/schema/registry.ts` reads only
`config.schema.json`, `state.schema.json`, and `authorization.schema.json`
from `packages/core/schemas/` — the other two files in that directory are
left on disk, untouched, unread by BR2 code, exactly as BR0 established
them. `validate()`'s `Br2SchemaId`-typed first parameter (§10's API
definition above) only accepts the `$id`s of these three schemas at
compile time; an untyped/external caller that nonetheless supplies
`verification-report.schema.json`'s or `handoff.schema.json`'s `$id`
receives the typed `{ registered: false }` result deterministically (§10),
never a thrown error and never a false `{ valid: true }` — this is not
expected to happen in BR2's own code paths (nothing in BR2 calls
`validate()` with those identifiers, and the type system prevents it), but
the registry's runtime behavior for it is still defined rather than
undefined, in case a future phase's code is written against BR2's
registry before that phase extends it to register the additional schemas
it needs.

BR4/BR5, when authorized, are expected to extend this registry (or
introduce their own, following the same pattern) to register
`verification-report.schema.json`/`handoff.schema.json` respectively, at
which point `ajv-formats` becomes that future phase's dependency to add,
justified by that phase's own actual validation need — not inherited
speculatively from BR2.

### Runtime schema asset resolution — package-relative, not cwd-relative

**Problem:** `createRegistry()` reads schema files from
`packages/core/schemas/*.json` at runtime. The compiled `@buildrail/core`
package executes from `packages/core/dist/**`, while the schema JSON
files live in a sibling directory, `packages/core/schemas/**` (schemas
are not copied into `dist/` — they remain a source-tree asset the
compiled code reads at runtime). Separately, `buildrail` (the CLI
consuming `@buildrail/core`) is invoked with an arbitrary process working
directory — whatever directory the user happens to run it from in their
own project, which is **not** BuildRail's own source tree.

**Requirement: schema file resolution is package-relative, computed from
the location of the executing module itself — never from
`process.cwd()`, never from the target project root, never from any
environment variable.** Changing the shell's current directory before
invoking `buildrail` must never change which schema files get loaded;
they are always BuildRail's own bundled schemas.

**Specified Node `>=22`-compatible mechanism:**

```ts
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Inside packages/core/src/schema/registry.ts (compiles to
// packages/core/dist/schema/registry.js):
const moduleDir = dirname(fileURLToPath(import.meta.url));
// dist/schema/registry.js -> ../../schemas is packages/core/schemas
const schemasDir = join(moduleDir, "..", "..", "schemas");
```

This is the exact pattern BR1 already established for its own analogous
problem (`packages/cli/src/output/version.ts` resolves
`packages/cli/package.json` the same way, relative to the compiled
module's own location, not `process.cwd()`) — BR2 is required to follow
the same established pattern, not invent a different one. The precise
relative path segments (`"..", ".."` above) depend on the final compiled
`dist/` layout chosen during implementation and must be verified against
that actual layout, not assumed from this illustrative sketch.

**Required test:** a test must invoke `loadConfig`/`loadState` (or
`createRegistry()` directly) with `process.cwd()` set to a directory
**unrelated to BuildRail's own source/package location** (e.g. a fixture
directory or a system temp directory, as already used elsewhere in §23's
fixture-based tests) and confirm the package-owned schemas under
`packages/core/schemas/` still resolve and validation still succeeds —
proving resolution is genuinely package-relative, not merely "worked in
the one directory the test happened to already be running from."

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

1. At `createRegistry()` time, each of the **three BR2-scoped schema
   files** (`config.schema.json`, `state.schema.json`,
   `authorization.schema.json` — per §10's "Registry scope," BR2 does
   **not** register `verification-report.schema.json` or
   `handoff.schema.json`) is read, `JSON.parse`d, and added to the JSON
   Schema validator instance via its schema-registration API (e.g. Ajv's
   `addSchema()`), keyed by each schema's own `$id` field. This happens
   for all three regardless of which is needed for the current validation
   call, so that any of the three schemas' relative `$ref` to another of
   the three resolves correctly regardless of validation order — this is
   sufficient for §11's problem (`state.schema.json`'s `$ref` to
   `authorization.schema.json`), since neither of the two out-of-scope
   schemas is referenced by any of the three registered ones.
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

- **Location:** the current, canonical authorization, when one exists,
  lives at exactly one place: `.buildrail/state.yml`'s **top-level
  `authorization` object** — a sibling of `current`, not nested inside
  it. **There is no `current.authorization` path anywhere in BuildRail's
  schema or actual `state.yml` shape, and no BR2 code may read or write
  `current.authorization`.** Any implementation that reads
  `state.current.authorization` (as opposed to `state.authorization`) is
  non-conformant with this specification and with the schema itself. This
  is the one canonical location — there is no separate "authorization
  history" file or array in BR2 either; see "Historical representation"
  below for how past authorizations remain visible without one.
- **Optionality (verified against the actual schema, not assumed):**
  `state.schema.json`'s top-level `required` array is exactly
  `["schema_version", "project", "current", "completed_phases",
  "planned_phases", "review"]` — **`authorization` is declared as a
  property but is NOT in that list, and is therefore schema-optional.**
  `current` (`{lifecycle_state, development_phase}`), by contrast, *is*
  required. This distinction is load-bearing: a `state.yml` document with
  no `authorization` key at all is schema-valid (`loadState` succeeds,
  returning a `BuildRailState` whose `authorization` field is `undefined`
  — not a schema validation failure), and it is exactly this
  schema-permitted absence that gives `AUTHORIZATION_MISSING` (§13, §18)
  something meaningful to report: a policy-layer condition on
  successfully-loaded state, not a schema-layer rejection. If
  `authorization` were schema-required, `AUTHORIZATION_MISSING` could
  never occur on validly-loaded state, which would make that error code
  meaningless — it is precisely *because* the schema permits absence that
  the policy layer must separately guard against it. This specification
  does not propose changing `state.schema.json` to make `authorization`
  required, and BR2 implementation must not do so either — the schema's
  existing optionality is exactly right for BR2's design.
- **Cardinality:** at most one authorization object exists at the
  top-level `authorization` key at any time (when present at all — see
  "Optionality" above). BuildRail does not support multiple
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

### Final contract (canonical, restated for unambiguous implementation)

- `state.yml`'s top-level shape has two relevant siblings:
  `current: {lifecycle_state, development_phase}` (**required** by
  `state.schema.json`) and `authorization: {...}` (**optional** by
  `state.schema.json` — present in every real state seen so far, but not
  schema-mandated).
- `authorization` is **never** nested inside `current`. `current` does not
  contain an `authorization` field, and BR2 code must never construct,
  read, or type a `current.authorization` path.
- There is at most one `authorization` object in the document, at the
  top level, at any time — and there may legitimately be zero (schema
  validation succeeds either way).
- No BR2 implementation may read `current.authorization` — every access
  goes through the top-level `authorization` key (e.g.
  `state.authorization`, matching `BuildRailState["authorization"]`'s
  actual position in the type in §13). `BuildRailState["authorization"]`'s
  TypeScript type is therefore `Authorization | undefined` — never
  defaulted to a synthetic empty object, never assumed present.
- The distinction between "authorization key absent" (schema-valid,
  reported by policy as `AUTHORIZATION_MISSING`) and "authorization key
  present but its value is schema-invalid" (a `STATE_SCHEMA_INVALID`
  loading failure, per §9, before policy ever runs) must be preserved —
  these are different layers catching different problems, not
  interchangeable.

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
performing these checks **in this exact, mutually exclusive order** and
returning the first failure (or success if all pass). The order matters:
each check assumes all prior checks already passed, and later checks must
never be reachable in a state that an earlier check should have already
caught (see the ordering rationale after the table).

| # | Check | Failure code |
|---|---|---|
| 1 | `authorization` is present at all | `AUTHORIZATION_MISSING` |
| 2 | `authorization.status === "revoked"` | `AUTHORIZATION_REVOKED` |
| 3 | `authorization.status` is `"authorized"` or `"in_progress"` (§12) | `AUTHORIZATION_INACTIVE` (at this point `status` is known not to be `"revoked"` — this check now only needs to distinguish `"authorized"`/`"in_progress"` from `"draft"`/`"completed"`, both of which correctly fall through to `AUTHORIZATION_INACTIVE`) |
| 4 | `authorization.id` equals the requested `phaseId` | `AUTHORIZATION_PHASE_MISMATCH` |
| 5 | `authorization.specification` is a non-empty string | `AUTHORIZATION_MISSING` (schema already requires this field to exist per `authorization.schema.json`'s `required` array — this check exists for defense-in-depth in case a caller constructs a `BuildRailState` value outside the normal `loadState` path, e.g. in a test) |
| 6 | `authorization.granted_by === "human"` | `AUTHORIZATION_MISSING`, `details: "authorization.granted_by must be 'human'"` (this is BR2's concrete, checkable form of AGENTS.md's "granted_by: Who granted this authorization. Must be the human owner, not an agent" — BR2 does not invent an identity system to verify *who* actually typed the value, it only checks the recorded field equals the literal string `"human"`, consistent with how BR0/BR1's `authorization.granted_by` has always been populated) |

**Why revoked is checked before the active-status check (step 2 before
step 3):** in the original ordering (checking "is status
authorized-or-in_progress" first), a `revoked` record would already fail
that check and return `AUTHORIZATION_INACTIVE` before a later
revoked-specific check could ever run — making `AUTHORIZATION_REVOKED`
structurally unreachable from this function, which contradicts §18
distinguishing it as its own code. Checking `revoked` explicitly and
first (immediately after presence) guarantees `AUTHORIZATION_REVOKED` is
always the result for a revoked record, and the subsequent
active-status check (step 3) no longer needs to special-case `revoked` at
all, since it's already been ruled out. This exact ordering
(`MISSING → REVOKED → INACTIVE → PHASE_MISMATCH → specification →
granted_by`) is mandatory, not merely a suggestion, and must be
reproduced exactly in implementation and in tests (§22, §26).

A `completed` authorization is explicitly **not** usable as active
implementation authority — this is the direct, testable consequence of
§12's model, and is the specific behavior the human owner's task
description called out as needing a canonical, checkable answer. A
`revoked` authorization is likewise never usable, and — per the ordering
above — is always reported as `AUTHORIZATION_REVOKED`, never silently
absorbed into `AUTHORIZATION_INACTIVE`.

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
  requiredActor: Actor | null; // null = intentionally actor-neutral; see table notes
}

type Actor = "human_owner" | "independent_reviewer" | "implementation_agent";
```

**This is the complete, authoritative `TransitionRule[]` table.** It is
not an implementation deliverable to be invented while coding —
implementation must encode exactly this table, verbatim. Where
`docs/STATE_MACHINE.md`'s prose is genuinely ambiguous ("most states,"
"an appropriate earlier state," "typically"), this specification makes
one explicit, documented interpretive choice per edge below, rather than
leaving the choice to whoever implements it. If a future correction to
`docs/STATE_MACHINE.md` changes the underlying policy, this table must be
updated to match — it is not self-authoritative independent of that
document, but it *is* the authoritative encoding of that document's
policy as of this specification.

#### Primary path (13 edges)

| From | To | Required actor | Note |
|---|---|---|---|
| `IDEA` | `SPECIFIED` | *(none)* | `docs/STATE_MACHINE.md` does not list this edge in either the "requires human authority" or "agent may perform" sections. Explicit choice: **actor-neutral** (`requiredActor: null`) — producing a specification from an idea is drafting work, not a decision requiring exclusive human or reviewer authority, and BuildRail's own practice (e.g. this very specification) has an implementation agent draft specifications for human review, not the human owner alone. `applyTransition` permits any of the three actor values for this edge. |
| `SPECIFIED` | `AUTHORIZED` | `human_owner` | Explicit in `docs/STATE_MACHINE.md` ("granting authorization"). **Performed via the dedicated `authorizeSpecifiedWork` function below, not a bare `applyTransition` call** — see "`SPECIFIED → AUTHORIZED` is a dedicated operation" immediately following this table. |
| `AUTHORIZED` | `PREFLIGHT` | `implementation_agent` | Explicit ("Transitions an agent may perform"). |
| `PREFLIGHT` | `IMPLEMENTING` | `implementation_agent` | Explicit. |
| `IMPLEMENTING` | `IMPLEMENTED` | `implementation_agent` | Explicit. |
| `IMPLEMENTED` | `VERIFYING` | `implementation_agent` | Explicit. |
| `VERIFYING` | `PENDING_REVIEW` | `implementation_agent` | Explicit. |
| `PENDING_REVIEW` | `REVIEW_APPROVED` | `independent_reviewer` | Explicit ("never by the implementing agent itself"). |
| `REVIEW_APPROVED` | `HUMAN_QA` | `human_owner` | Explicit ("entry is a human activity, not agent-driven"). |
| `HUMAN_QA` | `MERGE_AUTHORIZED` | `human_owner` | Explicit ("authorizing merge"). |
| `MERGE_AUTHORIZED` | `MERGED` | *(none)* | `docs/STATE_MACHINE.md` does not list this edge in either explicit list. Explicit choice: **actor-neutral** (`requiredActor: null`) — the human owner already made the merge *decision* at the prior edge (`HUMAN_QA → MERGE_AUTHORIZED`); actually recording that the merge happened (e.g. after a `git merge`/PR-merge completes) is a factual, mechanical follow-up, not a second independent human decision point, and mirrors BR1's own governance practice where the implementation agent recorded `MERGED`-equivalent state after an already-human-authorized merge completed. `applyTransition` permits any actor value for this edge. |
| `MERGED` | `PRODUCTION_VERIFIED` | `human_owner` | Explicit ("unless a deterministic, pre-authorized check performs this" — BR2 does not build such a check, so BR2's `requiredActor` for this edge is unconditionally `human_owner`; a future phase that adds a deterministic production-verification check would need to revisit this specific row, not BR2). |
| `PRODUCTION_VERIFIED` | `FROZEN` | `human_owner` | See "Resolving `* → FROZEN`" immediately below — **this is the only legal `X → FROZEN` edge in BR2's table.** |

#### Resolving `docs/STATE_MACHINE.md`'s `* → FROZEN` wildcard

`docs/STATE_MACHINE.md` lists `* → FROZEN` under "Transitions requiring
human authority," which read literally suggests *any* state — including
`BLOCKED` or `CORRECTION_REQUIRED` — could transition directly to
`FROZEN`. That literal reading is incompatible with this specification's
own design principle (§15's opening paragraph: "not an implementation
deliverable to be invented while coding... exactly this table, verbatim")
of an exhaustive, fully-enumerated edge set with no implicit wildcard
edges — an unenumerated "any state" edge cannot coexist with a table that
claims to be complete.

**Chosen resolution: the restricted interpretation. `FROZEN` is legally
reachable in BR2's lifecycle graph from exactly one state:
`PRODUCTION_VERIFIED`.** `docs/STATE_MACHINE.md`'s `* → FROZEN` is
reinterpreted, for BR2's purposes, as shorthand for "freezing is always a
`human_owner`-only decision, wherever it is legal" — a statement about
*authority*, not a claim that freezing is legal from *every* state. Under
this reading, `BLOCKED`/`CORRECTION_REQUIRED` do **not** have a legal
direct edge to `FROZEN` in BR2's 26-edge table (confirmed: no such row
exists in either subsection below), and the earlier draft's note claiming
they were "also subject to this same rule if ever entered from those
states" was itself the error being corrected here — that note
contradicted the table it was attached to and is now removed.

**This is a documented interpretive choice, not a silent one, and it
narrows `docs/STATE_MACHINE.md`'s literal wildcard.** Per §27 (Deferred
Items), reconciling `docs/STATE_MACHINE.md`'s wording with this
restricted interpretation — either by narrowing the doc's own language to
match, or by a future specification instead choosing to enumerate
additional `X → FROZEN` edges (e.g. `BLOCKED → FROZEN`,
`CORRECTION_REQUIRED → FROZEN`, for an "abandon and freeze in place"
administrative action) — is flagged as unresolved and is **not** decided
by BR2 implementation on its own initiative. BR2 implementation must
encode only the single `PRODUCTION_VERIFIED → FROZEN` edge; it must not
add any other `X → FROZEN` edge without a specification update
authorizing it.

#### `SPECIFIED → AUTHORIZED` is a dedicated operation, not a bare `applyTransition` call

**Problem this resolves:** `applyTransition`'s signature
(`state, to, actor`) has no parameter through which a new authorization
record could be supplied, yet `SPECIFIED → AUTHORIZED` is exactly the
transition that must *establish* `state.authorization` (it moves the
authorization from not-yet-existing/`draft` to `authorized`). A bare
`applyTransition(state, "AUTHORIZED", "human_owner")` call, using only
the generic API, cannot actually create or populate an authorization
record — it would have to either silently do nothing to
`state.authorization` (leaving `current.lifecycle_state: AUTHORIZED`
with no corresponding authorization — an inconsistent, ungoverned state)
or the specification would have to leave "how the authorization gets
attached" to implementation invention. Neither is acceptable.

**Chosen resolution (Option A — a dedicated operation, mirroring
`activatePhase`'s pattern below): `SPECIFIED → AUTHORIZED` is performed
by a separate function, `authorizeSpecifiedWork`, not by the generic
`applyTransition`. Ordinary `applyTransition(state, "AUTHORIZED", actor)`
calls are not a supported way to reach `AUTHORIZED` from `SPECIFIED` —
this specific edge is carved out of `applyTransition`'s generic handling
and always routed through this dedicated function instead.**

```ts
function authorizeSpecifiedWork(
  state: BuildRailState,
  authorization: Authorization,
  actor: Actor
): Result<BuildRailState, LifecycleError>;
```

**Contract**, performed atomically (all checks pass and both fields
change together, or nothing changes):

1. Requires `state.current.lifecycle_state === "SPECIFIED"` — otherwise
   `LIFECYCLE_TRANSITION_ILLEGAL` (mirroring what `applyTransition` would
   report for any other illegal `from` state).
2. Requires `actor === "human_owner"` — otherwise
   `LIFECYCLE_AUTHORITY_REQUIRED`, exactly matching
   `docs/STATE_MACHINE.md`'s explicit rule for this edge.
3. Validates the supplied `authorization` argument using the same
   validation §13 already performs (non-empty `specification`,
   `granted_by === "human"`) — a malformed argument fails with the
   corresponding `AUTHORIZATION_*` code (§18) before any state change is
   returned.
4. Requires `authorization.status === "authorized"` specifically (not
   `"in_progress"`, `"draft"`, `"completed"`, or `"revoked"`) — this
   operation's entire purpose is to grant a fresh authorization, so
   anything but the freshly-granted status is a caller error, reported as
   `AUTHORIZATION_INACTIVE` (the supplied record isn't in the one status
   this operation is meant to establish).
5. Requires `authorization.id` to match the phase/work item actually
   being authorized — concretely, `authorization.id ===
   state.current.development_phase` (the phase identity doesn't change
   at this transition; only its lifecycle state and authorization do) —
   otherwise `AUTHORIZATION_PHASE_MISMATCH`.
6. On success, returns a new `BuildRailState` with **both**
   `current.lifecycle_state` set to `"AUTHORIZED"` **and** the top-level
   `authorization` set to the validated `authorization` argument —
   changed together, never one without the other.
7. Pure, like `applyTransition`/`activatePhase` — no file I/O; persisting
   the result to `.buildrail/state.yml` remains the caller's
   responsibility (§7).

**`applyTransition`'s own behavior for this specific pair is now
precisely defined, not left ambiguous:** `applyTransition(state,
"AUTHORIZED", actor)` where `state.current.lifecycle_state ===
"SPECIFIED"` must itself fail with `LIFECYCLE_TRANSITION_ILLEGAL` (or an
equivalently distinct, documented rejection) rather than silently
performing a no-op lifecycle-only change — `applyTransition` does not
have an `authorization` parameter to populate the required field, so it
cannot legally complete this edge on its own, and must not pretend to.
`authorizeSpecifiedWork` is the one and only authoritative path for this
transition, exactly as `activatePhase` is the one and only authoritative
path for cross-phase rollover below.

#### `BLOCKED` entries and returns

`docs/STATE_MACHINE.md` says `BLOCKED` "can be entered from most states in
the main path" and returns "to an appropriate earlier state once
resolved" — both phrases are resolved explicitly below, not left
ambiguous.

**Entry into `BLOCKED`:** permitted from every primary-path state that an
`implementation_agent` actively occupies while doing agent-driven work —
i.e. every state from `PREFLIGHT` through `PENDING_REVIEW` inclusive
(the five states in "Transitions an agent may perform" plus the state
that immediately follows entering that set). `BLOCKED` is explicitly
**not** enterable from `IDEA`, `SPECIFIED`, `AUTHORIZED` (pre-implementation
states — nothing has begun yet for an agent to report as blocked),
`REVIEW_APPROVED`, `HUMAN_QA`, `MERGE_AUTHORIZED`, `MERGED`,
`PRODUCTION_VERIFIED`, or `FROZEN` (post-implementation states, where the
implementing agent is no longer the active party).

| From | To | Required actor |
|---|---|---|
| `PREFLIGHT` | `BLOCKED` | `implementation_agent` |
| `IMPLEMENTING` | `BLOCKED` | `implementation_agent` |
| `IMPLEMENTED` | `BLOCKED` | `implementation_agent` |
| `VERIFYING` | `BLOCKED` | `implementation_agent` |
| `PENDING_REVIEW` | `BLOCKED` | `implementation_agent` |

**Return from `BLOCKED`: BR2 adopts the minimal model — it does NOT claim
to enforce return to the exact state `BLOCKED` was entered from.**

The earlier draft of this specification asserted `BLOCKED` "returns to
exactly the state that most recently transitioned into it" and attributed
enforcement of that exact-origin invariant to "the caller," which already
"tracks" the necessary history. **That claim is false as written: nothing
in `BuildRailState` (per `state.schema.json`, §9) records which state
`BLOCKED` was entered from — no `previous_lifecycle_state`, no
`resume_state`, no transition-history field exists anywhere in the
persisted canonical state.** There is no undocumented ephemeral caller
memory this specification may responsibly assume into existence, and
BuildRail governance must not depend on state nothing actually persists.

**Chosen model (minimal, for BR2):**

- Each of the five `BLOCKED → X` return edges below is **independently
  legal** — `isLegalTransition(BLOCKED, X)` is `true` for all five,
  regardless of which state `BLOCKED` was entered from.
- Every return requires `human_owner` (below), consistent with
  `docs/STATE_MACHINE.md`'s explicit rule that resuming from `BLOCKED`
  requires human authority.
- **BR2 does NOT claim, and its `isLegalTransition`/`applyTransition`
  functions do NOT enforce, that the human owner's chosen return target
  `X` is the exact state `BLOCKED` was originally entered from.** A human
  owner resuming `BLOCKED → IMPLEMENTING` when the work was actually
  blocked while in `VERIFYING` is not rejected by BR2's lifecycle engine
  — this is a real, named limitation of BR2's minimal model, not an
  oversight, and not something implementation may silently attempt to
  paper over with undocumented history-tracking of its own invention.
- **Exact-origin tracking is explicitly deferred** (§27, deferred item
  8) until a future specification designs a persisted resume-state field
  (a `state.schema.json` change — out of scope for this document, which
  is instructed not to propose schema changes) and specifies how the
  lifecycle engine would read and enforce it. Until that exists, the
  human owner approving a `BLOCKED` return is the sole safeguard against
  resuming into the wrong state — the same trust model BR0/BR1 have
  operated under for every governance decision so far.

| From | To | Required actor |
|---|---|---|
| `BLOCKED` | `PREFLIGHT` | `human_owner` |
| `BLOCKED` | `IMPLEMENTING` | `human_owner` |
| `BLOCKED` | `IMPLEMENTED` | `human_owner` |
| `BLOCKED` | `VERIFYING` | `human_owner` |
| `BLOCKED` | `PENDING_REVIEW` | `human_owner` |

The return transition also requires `human_owner` per
`docs/STATE_MACHINE.md`'s explicit rule ("Any transition that would
resume from `BLOCKED`... by expanding or reinterpreting the original
authorization" requires human authority) — BR2 treats *every* resumption
from `BLOCKED` as requiring human confirmation that the block is actually
resolved, since a resumption inherently risks silently reinterpreting the
original authorization if left to the implementation agent alone. This
human-approval requirement is BR2's actual safeguard for `BLOCKED`
resumption — it is not a substitute for exact-origin tracking, but it is
what BR2 actually provides in its place.

#### `CORRECTION_REQUIRED` entries and returns

**Entry into `CORRECTION_REQUIRED`:** occurs when review or human QA finds
issues. Per `docs/STATE_MACHINE.md`'s state description ("Review or QA
found issues"), entry is permitted from exactly the two states where
review/QA occurs:

| From | To | Required actor |
|---|---|---|
| `PENDING_REVIEW` | `CORRECTION_REQUIRED` | `independent_reviewer` |
| `HUMAN_QA` | `CORRECTION_REQUIRED` | `human_owner` |

(Not from `REVIEW_APPROVED` — once independently approved, going back to
`CORRECTION_REQUIRED` would mean *human* QA found the issue, which is the
`HUMAN_QA → CORRECTION_REQUIRED` row above, not a `REVIEW_APPROVED`-
originating edge.)

**Return from `CORRECTION_REQUIRED`:** `docs/STATE_MACHINE.md` gives one
explicit example ("typically returns to `IMPLEMENTING`"), which this
specification adopts as the **only** legal return target — "typically"
is resolved to "always," for exactly the same reason `BLOCKED`'s return
targets are fixed rather than open-ended: an implementation-grade
specification cannot leave "or some other appropriate state" as
executable policy. If a future need for a different return target
emerges, that is a `docs/STATE_MACHINE.md` policy change, not a BR2
implementation choice.

| From | To | Required actor |
|---|---|---|
| `CORRECTION_REQUIRED` | `IMPLEMENTING` | `implementation_agent` |

This is not `human_owner`-gated like `BLOCKED`'s return, because
`docs/STATE_MACHINE.md`'s "resume from `BLOCKED` or `CORRECTION_REQUIRED`
by expanding or reinterpreting the original authorization" human-gate
applies to *scope-expanding* resumptions specifically — returning to
`IMPLEMENTING` to address reviewer/QA-identified issues *within* the
existing authorization's scope is the ordinary, expected agent-driven
correction loop, not a reinterpretation of authorization. (Contrast with
`BLOCKED`'s return, which BR2 conservatively always gates to
`human_owner` per §15's `BLOCKED` section above, since a block's cause is
more often genuinely ambiguous about whether resuming stays within
original scope.)

#### Total edge count

This specification defines exactly **26 legal directed edges**: 13
primary-path edges + 5 `BLOCKED` entries + 5 `BLOCKED` returns + 2
`CORRECTION_REQUIRED` entries + 1 `CORRECTION_REQUIRED` return. All other
`(from, to)` pairs among the 16 states — including every pair not listed
above, every reflexive pair (`X → X`), and every backwards primary-path
pair not listed as a `BLOCKED`/`CORRECTION_REQUIRED` edge — are illegal
(`isLegalTransition` returns `false`), and `requiredActor` for an illegal
pair is not meaningful to call (see the API note below).

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
  schema enum is closed). `isLegalTransition(from, to)` is `true` for
  exactly the 26 pairs enumerated above and `false` for every other pair.
- `requiredActor(from, to)` returns one of the three `Actor` values for
  every legal edge that names a required actor, and `null` for the two
  edges explicitly marked actor-neutral above (`IDEA → SPECIFIED`,
  `MERGE_AUTHORIZED → MERGED`) — `null` is a meaningful, deliberate return
  value for those two specific edges, not a generic "unspecified" default.
  For any pair where `isLegalTransition(from, to)` is `false`,
  `requiredActor(from, to)`'s return value is unspecified and must not be
  relied upon by callers — callers must check `isLegalTransition` first.
- `applyTransition` is pure (no file I/O — it returns a new in-memory
  `BuildRailState` value; *persisting* that value to
  `.buildrail/state.yml` is the caller's responsibility, consistent with
  §7's I/O-vs-pure-logic separation). It fails with:
  - `LIFECYCLE_TRANSITION_ILLEGAL` if `isLegalTransition(from, to)` is
    false
  - `LIFECYCLE_AUTHORITY_REQUIRED` if `requiredActor(from, to)` is
    non-`null` and does not equal the supplied `actor` (an actor-neutral
    edge, where `requiredActor` returns `null`, never produces this
    error — any of the three `Actor` values is accepted)
- **Backwards transitions:** `docs/STATE_MACHINE.md`'s primary path is
  strictly forward; `applyTransition` rejects any `to` that is not either
  the next state on the primary path from `from`, or one of the 13
  `BLOCKED`/`CORRECTION_REQUIRED` edges enumerated above. There is no
  generic "any state to any earlier state" allowance.
- **Illegal forward skips:** e.g. `AUTHORIZED → IMPLEMENTED` (skipping
  `PREFLIGHT`/`IMPLEMENTING`) is illegal and must be rejected — this is
  the specific "selected illegal forward skips" case called out in the
  testing contract (§22).

### Composition with authorization policy — the one authoritative path

**Problem this resolves:** `applyTransition` alone checks graph legality
(§15's table) and actor authority, but says nothing about whether an
*active authorization* actually exists for the phase whose lifecycle is
being advanced. Without composing in §13's authorization policy, a caller
could successfully call `applyTransition(state, "PREFLIGHT",
"implementation_agent")` even when `state.authorization` is missing,
`completed`, `revoked`, or for the wrong phase — silently advancing
lifecycle state past what authorization actually permits, *if* the
caller forgets to separately call `checkImplementationAllowed`. Making
this correctness property depend on every caller remembering to call two
unrelated functions in the right order is a governance-safety defect, not
an acceptable design.

**Resolution: `applyTransition` itself composes the authorization check
for the specific set of transitions where it matters — there is exactly
one authoritative function callers use to advance lifecycle state; there
is no second, authorization-unaware path that skips it.**

Which transitions require an active, phase-matching authorization (via
§13's `checkImplementationAllowed`) as part of `applyTransition`, and
which do not:

| Transition | Requires active authorization check? | Why |
|---|---|---|
| `AUTHORIZED → PREFLIGHT` | **Yes** | Beginning implementation work — the canonical point authorization must already be active |
| `PREFLIGHT → IMPLEMENTING` | **Yes** | Still within the implementation-phase work the authorization covers |
| `IMPLEMENTING → IMPLEMENTED` | **Yes** | Same |
| `IMPLEMENTED → VERIFYING` | **Yes** | Same |
| `VERIFYING → PENDING_REVIEW` | **Yes** | Same |
| `BLOCKED → PREFLIGHT` | **Yes** | Resumes agent-governed implementation work — see "Closing the resume bypass" below |
| `BLOCKED → IMPLEMENTING` | **Yes** | Same |
| `BLOCKED → IMPLEMENTED` | **Yes** | Same |
| `BLOCKED → VERIFYING` | **Yes** | Same |
| `BLOCKED → PENDING_REVIEW` | **Yes** | Same |
| `CORRECTION_REQUIRED → IMPLEMENTING` | **Yes** | Resumes agent-governed implementation work — see "Closing the resume bypass" below |
| `IDEA → SPECIFIED` | No | No authorization exists yet at this point by definition — requiring one would make this edge permanently unreachable |
| `SPECIFIED → AUTHORIZED` | N/A — not performed by `applyTransition` at all; see `authorizeSpecifiedWork` (§15) | This edge is carved out of `applyTransition`'s generic handling entirely — its own dedicated function performs its own validation (§15's "dedicated operation" section), which supersedes this table's generic composition rule for this one row |
| `PENDING_REVIEW → REVIEW_APPROVED` | No | Independent review of already-implemented work does not re-check implementation authorization — it checks the *work*, not whether work was allowed to start (that was already gated earlier in the same lifecycle run) |
| `PENDING_REVIEW → CORRECTION_REQUIRED` | No | Entering `CORRECTION_REQUIRED` doesn't itself resume implementation — it's the *return* to `IMPLEMENTING` that does, and that edge is gated above |
| `HUMAN_QA → CORRECTION_REQUIRED` | No | Same rationale |
| `REVIEW_APPROVED → HUMAN_QA` | No | Same rationale as the other non-resuming post-implementation edges |
| `HUMAN_QA → MERGE_AUTHORIZED` | No | Same rationale |
| `MERGE_AUTHORIZED → MERGED` | No | Same rationale |
| `MERGED → PRODUCTION_VERIFIED` | No | Same rationale |
| `PRODUCTION_VERIFIED → FROZEN` | No | Freezing is a human decision independent of the original authorization's active/inactive status — by this point the authorization is expected to become `completed` (§12), which is correctly *not* active, and `FROZEN` must still be reachable |

**Closing the resume bypass (correcting an earlier draft's governance
gap):** an earlier version of this specification exempted *all*
`BLOCKED`/`CORRECTION_REQUIRED` entries and returns from the authorization
check, on the reasoning that "the original transition into that state
already required an active authorization." That reasoning is wrong for
the *return* edges specifically, because authorization can change state
*while work sits in `BLOCKED`/`CORRECTION_REQUIRED`* — concretely:

1. Work enters `CORRECTION_REQUIRED` (from `PENDING_REVIEW`, while
   authorization is still active).
2. The human owner revokes the authorization
   (`authorization.status → "revoked"`) — an out-of-band state edit, not
   itself a lifecycle-graph transition this specification governs, but a
   real state change `checkImplementationAllowed` would detect if asked.
3. Without the fix below, `CORRECTION_REQUIRED → IMPLEMENTING` would
   still succeed (graph-legal, actor-correct), silently resuming
   implementation work under a revoked authorization.

This is now closed: **all 10 resume-into-active-workflow edges
(`BLOCKED → {PREFLIGHT, IMPLEMENTING, IMPLEMENTED, VERIFYING,
PENDING_REVIEW}` and `CORRECTION_REQUIRED → IMPLEMENTING`) require the
same active-authorization composition as the 5 original primary-path
edges — 11 gated edges in total, not 5.** `BLOCKED`/`CORRECTION_REQUIRED`
*entry* edges (`{PREFLIGHT, IMPLEMENTING, IMPLEMENTED, VERIFYING,
PENDING_REVIEW} → BLOCKED`, `PENDING_REVIEW → CORRECTION_REQUIRED`,
`HUMAN_QA → CORRECTION_REQUIRED`) remain ungated — entering a blocked/
correction state doesn't advance implementation progress, only *resuming
out of one into further implementation work* does, and that's precisely
the set now covered.

**Actor authority and authorization are separate, independently-enforced
checks — one does not substitute for the other.** A `human_owner` actor
performing a `BLOCKED → IMPLEMENTING` return still has that call fail
with an `AUTHORIZATION_*` code if the authorization is inactive —
`requiredActor` being satisfied does not imply `checkImplementationAllowed`
is skipped, and vice versa. If resuming genuinely requires expanding or
reinterpreting scope, `docs/STATE_MACHINE.md`'s existing rule already
requires that go through a fresh, separate human-owner authorization
decision — this composition does not create a new rule, it makes an
already-stated one actually enforceable by `applyTransition` instead of
depending on every caller remembering to check separately.

**Concretely:** `applyTransition`'s implementation, for all 11 "Yes" rows
above, must call `checkImplementationAllowed(state, phaseId)` (where
`phaseId` is `state.current.development_phase`) internally, before
returning success, and propagate any `PolicyError` it produces as
`applyTransition`'s own failure (mapped through the same
`Result<BuildRailState, LifecycleError>` return type — a `PolicyError`
occurring inside `applyTransition` is still reported via
`LifecycleError`'s union, not a separate untyped throw; the exact
sub-type mapping, e.g. wrapping `PolicyError` inside a
`LifecycleError` variant, is an implementation detail as long as the
caller can distinguish "graph-illegal," "authority-insufficient," and
"authorization-inactive/missing/revoked/mismatched" from each other in
the returned error).

**No second, unchecked path exists.** `checkImplementationAllowed` remains
independently exported and independently callable (e.g. a `buildrail
status` caller might want to check "is anything currently authorized?"
without attempting a lifecycle transition at all) — but nothing in BR2's
public API allows a caller to advance lifecycle state through one of the
11 "Yes" rows above *without* the composed check running, because
`applyTransition` is the only function that performs the state-advancing
side of the operation, and it always runs the check itself for those
rows. There is no `applyTransitionWithoutAuthorizationCheck` escape
hatch.

### Phase rollover (cross-phase activation) — NOT a lifecycle-graph edge

**This is not part of the 26-edge transition table above, and must not be
confused with it.** The table above governs transitions *within one unit
of work's* lifecycle (e.g. one phase's journey from `IDEA` to `FROZEN`).
It contains no `FROZEN → AUTHORIZED` edge, and none is added — `FROZEN`
is, correctly, a terminal state for the work item that reached it.

But BuildRail's actual observed practice (BR0 → BR1, and BR1 → the
not-yet-granted BR2) is a **separate, distinct operation**: closing one
phase's work item (ending at `FROZEN`) and, later, as a **separate human
decision**, beginning an entirely new work item (a new phase) starting
fresh at `AUTHORIZED`. These are two different `authorization` records
(different `id`, different `specification`) for two different units of
work — not one work item transitioning through `FROZEN` and back out
again.

This specification names this operation `activatePhase` and specifies it
as a function **distinct from `applyTransition`**, living in
`packages/core/src/lifecycle/` alongside it but not sharing its transition
table:

```ts
interface PhaseActivationRequest {
  newPhaseId: string;              // e.g. "BR2"
  newAuthorization: Authorization;  // status must be "authorized"; granted_by must be "human"
}

function activatePhase(
  state: BuildRailState,
  request: PhaseActivationRequest,
  actor: Actor
): Result<BuildRailState, LifecycleError>;
```

**`PhaseActivationRequest` deliberately contains only these two fields —
`activatePhase` itself derives every other change from `state` and
`request.newPhaseId`, rather than requiring the caller to also compute
and pass a modified `planned_phases` array.** (An earlier draft of this
specification said "`planned_phases` may have `newPhaseId` removed by the
caller constructing `request` appropriately," but `PhaseActivationRequest`
has no field through which the caller could supply a modified
`planned_phases` — that was an impossible contract, corrected below by
having `activatePhase` derive the change from `state.planned_phases`
directly instead of asking the caller to compute and pass it.)

**Contract:**

1. **Actor:** `activatePhase` requires `actor === "human_owner"`
   unconditionally — there is no actor-neutral or agent-performable
   version of this operation. Any other actor value fails with
   `LIFECYCLE_AUTHORITY_REQUIRED`, exactly as an under-authorized
   `applyTransition` call would.
2. **Precondition — closure state:** the *current* work item must
   already be at `current.lifecycle_state === "FROZEN"` (or, for the
   very first phase ever activated — BR0 — the precondition is instead
   "no prior authorization exists," a one-time bootstrap case).
   Attempting `activatePhase` from any other `lifecycle_state` fails with
   `LIFECYCLE_TRANSITION_ILLEGAL` — you cannot roll over to a new phase
   while the current one is still mid-flight.
3. **Precondition — no reactivating a closed phase ID:**
   `request.newPhaseId` must not already appear as a key in
   `state.baselines`, and must not already appear in
   `state.completed_phases`. If it does, `activatePhase` fails with
   `LIFECYCLE_TRANSITION_ILLEGAL` (the specific phase ID has already been
   independently reviewed, approved, and frozen — reusing it as a *new*
   activation target would silently conflate a fresh unit of work with an
   already-immutable one). **BR2 does not support reopening or revising
   an already-completed/frozen phase under its own original ID** — if a
   genuine need for that ever arises (e.g. correcting BR1 after BR2 is
   underway), it requires a distinct, explicitly-designed
   reopen/revision policy this specification does not define (flagged as
   a deferred item, §27) — `activatePhase` must not silently permit it by
   omission.
4. **Atomicity:** `activatePhase` returns a single new `BuildRailState`
   value with all of the following changed together, or none of them (it
   never returns a partially-updated state):
   - `current.development_phase` set to `request.newPhaseId`
   - `current.lifecycle_state` set to `"AUTHORIZED"`
   - `authorization` replaced wholesale with `request.newAuthorization`
     (this is the *only* place in BR2 where the top-level `authorization`
     object is replaced, not merely read — consistent with §12's
     "replaced wholesale at each phase transition" model)
   - `planned_phases` set to `state.planned_phases` **with
     `request.newPhaseId` removed, if present** — `activatePhase` derives
     this itself from the input state; the caller supplies only
     `newPhaseId` and `newAuthorization`, nothing else. If
     `request.newPhaseId` is not present in `state.planned_phases` (e.g.
     BR0's own bootstrap activation, where nothing was ever "planned"),
     `planned_phases` is left unchanged — removal is a no-op, not an
     error.
5. **Preserved unchanged (untouched by `activatePhase`):** `baselines`,
   `completed_phases`, `review`, `project`, `schema_version`,
   `protected_systems` — `activatePhase` must not remove or alter any
   entry in `baselines` or `completed_phases` (the record of what already
   finished), and must not itself add the *new* phase to either of those
   — adding to `completed_phases`/`baselines` only happens at that new
   phase's own eventual closure, not at its activation.
6. **Validation:** `request.newAuthorization` must itself be a
   schema-valid `Authorization` object (§13's `authorization.specification`
   non-empty and `granted_by === "human"` checks apply here too, at
   activation time, not deferred to a later `checkImplementationAllowed`
   call) — `activatePhase` calls the same validation logic §13 uses,
   rather than duplicating it, so a malformed new-authorization request
   fails the same way a malformed *existing* authorization would.
   `request.newAuthorization.status` must be `"authorized"` specifically
   (mirroring `authorizeSpecifiedWork`'s equivalent check above) —
   anything else fails with `AUTHORIZATION_INACTIVE`.
   `request.newAuthorization.id` must equal `request.newPhaseId` —
   otherwise `AUTHORIZATION_PHASE_MISMATCH`.
7. **Persistence:** exactly like `applyTransition`, `activatePhase` is
   pure — it returns a new in-memory `BuildRailState`; writing it to
   `.buildrail/state.yml` remains the caller's responsibility (§7's
   I/O-vs-pure-logic separation applies here identically).

**Why this must exist now, not be deferred:** without an explicit,
specified `activatePhase` operation, a future BR3 authorization would have
no governance-engine-sanctioned path to occur — the only alternative
would be a human or agent hand-editing `state.yml` directly, bypassing
BR2's own governance engine entirely (exactly the failure mode BR2 exists
to prevent). Specifying `activatePhase` now, even though BR2
implementation does not need to *call* it for BR2's own activation (BR2's
own activation, per §27 item 1, is itself performed by the same
hand-maintained pattern BR0→BR1 used, since BR2's governance engine does
not exist yet to perform its own activation), ensures BR3's eventual
authorization — and every phase after it — can go through
`activatePhase` instead of continuing to bypass the (by-then-existing)
governance engine.

## 16. Actor/Authority Rules

The complete, authoritative actor assignment for every legal edge is the
table in §15 ("State graph") — this section does not restate it as a
second, potentially-drifting table. Of the 26 total legal edges:

- **11 require `human_owner`:** 5 primary-path edges
  (`SPECIFIED → AUTHORIZED`, `REVIEW_APPROVED → HUMAN_QA`,
  `HUMAN_QA → MERGE_AUTHORIZED`, `MERGED → PRODUCTION_VERIFIED`,
  `PRODUCTION_VERIFIED → FROZEN`) + all 5 `BLOCKED` returns +
  the 1 `HUMAN_QA → CORRECTION_REQUIRED` entry edge (`= 5 + 5 + 1 = 11`)
- **11 require `implementation_agent`:** 5 primary-path edges
  (`AUTHORIZED → PREFLIGHT`, `PREFLIGHT → IMPLEMENTING`,
  `IMPLEMENTING → IMPLEMENTED`, `IMPLEMENTED → VERIFYING`,
  `VERIFYING → PENDING_REVIEW`) + all 5 `BLOCKED` entries + the 1
  `CORRECTION_REQUIRED → IMPLEMENTING` return (`= 5 + 5 + 1 = 11`)
- **2 require `independent_reviewer`:** `PENDING_REVIEW → REVIEW_APPROVED`
  (primary-path) and `PENDING_REVIEW → CORRECTION_REQUIRED` (entry edge)
- **2 are actor-neutral** (`requiredActor: null`): `IDEA → SPECIFIED`,
  `MERGE_AUTHORIZED → MERGED` (both primary-path)

`11 + 11 + 2 + 2 = 26`, matching §15's total edge count exactly. See §15
for the documented rationale for each of the non-obvious assignments.

**This summary is illustrative only; §15's table is authoritative.** If
this section and §15 ever disagree (e.g. after a future edit to one but
not the other), §15 governs.

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

### 17.1 `buildrail status`

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

**Allowed vs. forbidden — this distinction is load-bearing and must not
be collapsed into a blanket "no branch/SHA-shaped values" rule:**

**ALLOWED** — Git-*related* metadata that is already recorded inside
validated `state.yml`, read and reported exactly as loaded, with no live
Git inspection involved in producing it:
- `candidate.branch`, `candidate.base_sha`, `candidate.candidate_sha`
  (the example output above correctly shows `Candidate: none` for BR1's
  frozen state, where these are `null` — but for a project mid-BR3-or-later
  implementation, where these fields are populated, `buildrail status`
  **must** display them, since they are `state.yml`-recorded facts, not
  live Git facts)
- `baselines.<phase>.approved_sha` (shown in the example output above as
  `BR0 → 04c93767510c51916fcc51f60b85b674c7d6f1cc`)

**FORBIDDEN** — live Git inspection, i.e. anything BR2 would have to
actually run a Git command or read the `.git/` directory to produce:
- the actual current repository branch (as opposed to `candidate.branch`,
  which is a recorded string in `state.yml`, not queried from Git)
- the actual current `HEAD` SHA (as opposed to `candidate.candidate_sha`
  or `baselines.*.approved_sha`, both recorded strings)
- the actual current remote SHA
- actual working-tree dirtiness/cleanliness
- actual diff/changed-path information

The distinguishing test is not "does this look like a branch name or a
SHA" — it's "was this value obtained by reading already-validated
`state.yml` content, or by inspecting the real Git repository." BR2 has
no Git-inspection capability (§4, §6) and therefore *cannot* produce the
forbidden category truthfully — but it has every ability, and the
obligation, to report the allowed category, since that's ordinary
`loadState` output.

**Failure behavior:** if `loadConfig` or `loadState` returns an error,
`buildrail status` prints a deterministic, human-readable message derived
from the typed error (per §18's structured fields — `code`, `message`,
`path` where applicable) and exits `1` (matching BR1's existing exit-code
contract: "recognized command could not perform the requested operation").
No raw stack traces, no Node error objects printed directly — the CLI
translates the core error type to text, per §19's separation.

### 17.2 `buildrail status --help`

Its help text (currently: "BR1 status: state-backed status reporting is
not implemented yet...") must be updated in the same implementation work
to describe BR2's real behavior, since it would otherwise be a false,
stale claim the moment `status` itself becomes real — flagged here so it
isn't missed as a "just update the docstring" afterthought during
implementation.

### 17.3 Exit codes, help contract, unknown-command behavior

Unchanged from BR1 (`0`/`1`/`2` contract, `--help`/`-h`/`help`,
`--version`/`-v`, unknown-command handling) — BR2 does not touch
`packages/cli/src/cli.ts`'s dispatch logic, only `status.ts`'s body and,
by extension, adds a new dependency edge from `@buildrail/cli` to
`@buildrail/core`.

### 17.4 `buildrail init`

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
| `CONFIG_YAML_INVALID` | config | File content is not valid YAML syntax, or the YAML document is empty (parses to `undefined`/`null`). **Not** used for syntactically valid YAML that parses to the wrong type (e.g. a scalar or array at the root) — see `CONFIG_SCHEMA_INVALID`. |
| `CONFIG_SCHEMA_INVALID` | config | Syntactically valid, non-empty YAML that fails `config.schema.json` validation — including a root value of the wrong type (e.g. an array or scalar instead of an object), since schema validation (`"type": "object"` at the root) is what catches that case, not the YAML parser |
| `STATE_NOT_FOUND` | state | `.buildrail/state.yml` does not exist |
| `STATE_READ_FAILED` | state | File exists but could not be read |
| `STATE_YAML_INVALID` | state | File content is not valid YAML syntax, or the YAML document is empty. Same non-object-root exclusion as `CONFIG_YAML_INVALID` above — see `STATE_SCHEMA_INVALID`. |
| `STATE_SCHEMA_INVALID` | state | Syntactically valid, non-empty YAML that fails `state.schema.json` validation (including nested `authorization`), including a wrong-type root value |
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

**`applyTransition` can surface `AUTHORIZATION_*` codes, not just
`LIFECYCLE_*` ones.** Per §15's authorization-composition rule, calling
`applyTransition` for one of the 11 authorization-gated transitions
(the 5 forward-progress edges plus the 6 resume-into-active-workflow
edges — `BLOCKED`'s five returns and `CORRECTION_REQUIRED → IMPLEMENTING`)
can fail with any of `AUTHORIZATION_MISSING`, `AUTHORIZATION_INACTIVE`,
`AUTHORIZATION_REVOKED`, or `AUTHORIZATION_PHASE_MISMATCH` — these are
not exclusively `checkImplementationAllowed`'s own return codes; they are
shared codes that both functions can produce, because `applyTransition`
internally calls into the same policy logic for those specific
transitions (§15). A caller distinguishing "why did `applyTransition`
fail" must handle the full code set above, not only the two
`LIFECYCLE_*` codes.

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

### 20.1 YAML parser: `yaml` (eemeli/yaml)

| Aspect | Detail |
|---|---|
| Package name | `yaml` |
| Version strategy | Pin a caret range on the latest stable major at implementation time (currently 2.x) — exact version resolved and recorded in `package-lock.json` at implementation time, not hard-coded in this spec |
| Runtime dependency | Yes, in `packages/core/package.json` |
| Why chosen | Actively maintained, zero transitive dependencies, full YAML 1.2 support (the version the ecosystem has converged on), a documented, safe parsing API (`YAML.parseDocument`, per the "YAML diagnostics" section below) that does not execute arbitrary tags/constructors by default (unlike some `js-yaml` usage patterns, which historically required explicit care around `!!js/function` and similar unsafe schema extensions) |
| Node compatibility | Pure JS, no native bindings — compatible with Node `>=22` (BR1's established minimum, preserved unchanged per §24) |
| Maintenance status | Actively maintained as of this writing; widely used (transitively, by ESLint, `@typescript-eslint`, and many others), giving it a large de facto test surface beyond BuildRail's own usage |
| Security implications | See §21 — `YAML.parseDocument` with default options does not construct arbitrary JS objects or execute code from document content; BR2 must not enable "custom tags" or `schema: "core"`-with-unsafe-extensions options |
| Feature scope | BR2 uses only `YAML.parseDocument(text, { logLevel: "error" })` (see "YAML diagnostics" below for why `parseDocument` with this option, not bare `YAML.parse`) — no YAML *writing*/serialization is needed (BR2 never writes `.buildrail/state.yml` itself; persistence, if ever automated, is a later-phase concern), no custom tag registration, no document comments/CST manipulation |

**Alternative considered and rejected:** `js-yaml`. Also widely used and
actively maintained, but `yaml`'s API more naturally separates "safe by
default" parsing from opt-in advanced features, and BuildRail has no
existing dependency on `js-yaml`'s specific API shape — no migration cost
either way, so the safer-by-default option is preferred absent a
concrete reason to choose otherwise.

### YAML diagnostics (warnings/parse issues) — deterministic, never leaked to stderr

**Problem this resolves:** the `yaml` package's parsing can surface
non-fatal diagnostics (e.g. for unusual-but-tolerated constructs) in
addition to hard errors. §18/§19 already require BR2's governance loading
to be deterministic and to never have `@buildrail/core` write to
stdout/stderr directly (§19's CLI/Core separation) — an uncontrolled
warning print would violate both.

**Chosen approach: use the diagnostics-exposing parse API
(`YAML.parseDocument`) with an explicit `logLevel` option that silences
the library's own default warning output while preserving both
`errors`/`warnings` for BR2 to inspect and translate into its own typed
model explicitly — never allowing the library to print anything to
stdout/stderr on its own.**

**Why an explicit option is required, not merely switching APIs:**
switching from `YAML.parse` to `YAML.parseDocument` changes which object
is returned, but does **not** by itself change the `yaml` package's
default logging behavior — the library's parsing options default to
`logLevel: "warn"`, under which warnings are still emitted (by the
library, independently of whether the caller reads `doc.warnings`) unless
a stricter `logLevel` is explicitly set. **BR2 must pass
`{ logLevel: "error" }` explicitly to every `parseDocument` call — this
suppresses the library's own warning-level emission while still
surfacing errors, and `doc.warnings`/`doc.errors` remain populated and
inspectable regardless of `logLevel`, since `logLevel` controls the
library's own default output, not what ends up in those arrays.**
`logLevel: "silent"` is explicitly **not** used, because it also
suppresses genuine parse *errors*, which would let a malformed document
through undetected — `"error"` is the correct middle ground: quiet on
warnings, still loud (via the returned `errors` array — not via console
output either way) on errors.

1. `loadConfig`/`loadState` call
   `YAML.parseDocument(text, { logLevel: "error" })` (not bare
   `YAML.parse(text)`, and not `parseDocument` without the `logLevel`
   option), which returns a `Document` object exposing an `errors` array
   and a `warnings` array, instead of throwing on the first problem or
   emitting library-controlled console output for warnings.
2. **Any non-empty `errors` array** is treated as `CONFIG_YAML_INVALID`
   / `STATE_YAML_INVALID` (§8/§9) — the loader does not proceed to
   `.toJS()`/schema validation. The first error's message/position is
   surfaced in the returned `ConfigError`/`StateError`'s `details`.
3. **Any non-empty `warnings` array** does not by itself fail loading (a
   warning is not an error) — see "Typed warning-success shape" below for
   exactly where it goes in the return type. **BR2 itself does not print
   warnings to stdout/stderr automatically as a side effect of loading**,
   consistent with Core never writing output directly (§19).
4. **Unknown/custom tags:** `yaml`'s default parsing schema (`"core"`)
   does not silently invent custom tag support — an unknown/unresolvable
   tag falls back to normal scalar resolution and records a
   `YAMLWarning` in `doc.warnings` (not `doc.errors` — this is the real
   warning case used for testing, per "Real warning fixture" below),
   handled exactly as any other diagnostic (steps 2–3), not specially
   passed through or evaluated. BR2 does not enable `customTags` or any
   schema extension (§20.1's "Feature scope" already establishes this;
   this section makes the *failure-reporting* behavior for hitting one
   explicit too).
5. **Unsupported YAML constructs** (e.g. anchors/aliases forming a cycle,
   which `yaml` detects and reports as a diagnostic rather than looping
   forever) are handled the same way — routed through the `errors`/`warnings`
   arrays, never left to `yaml`'s own default console behavior.

**Typed warning-success shape — one typed contract, not implementation's
choice:**

```ts
interface GovernanceDiagnostic {
  severity: "warning";
  message: string;
  path?: string; // when the yaml library can attribute the warning to a location
}

interface LoadSuccess<T> {
  value: T;
  diagnostics: GovernanceDiagnostic[]; // empty array when there were no warnings
}

type LoadResult<T, E> =
  | { ok: true; value: LoadSuccess<T> }
  | { ok: false; error: E };
```

`loadConfig`/`loadState`'s return types (§8/§9) are
`Promise<LoadResult<BuildRailConfig, ConfigError>>` /
`Promise<LoadResult<BuildRailState, StateError>>` — this is one concrete,
fully-typed shape, defined once here and used consistently everywhere
else in this specification — not "an internal `_diagnostics` field"
bolted onto `BuildRailConfig`/`BuildRailState` themselves (schema-derived
governance objects must not carry undocumented, non-schema-derived
fields), and not left as an open implementation choice between two
incompatible designs. A caller that only cares about the loaded value
accesses `result.value.value`; diagnostics are always present (as a
possibly-empty
array) at `result.value.diagnostics`, never silently discarded and never
uncontrollably printed. If a future consumer (e.g. a `buildrail status
--verbose` flag) wants to surface warnings to a human, it reads
`diagnostics` explicitly — BR2 itself does not.

**YAML resource-exhaustion safety:** because `.buildrail/config.yml` and
`.buildrail/state.yml` are untrusted input (§21), `parseDocument` calls
must preserve `yaml`'s built-in finite alias-expansion limit
(`maxAliasCount`, which defaults to a bounded value in the library) —
**`maxAliasCount: -1` (unbounded) must never be set.** If conversion to a
JS value (`.toJS()`) throws due to exceeding this limit (a
resource-exhaustion protection tripping, not a normal parse error
surfaced via `doc.errors`), that exception is caught and translated into
`CONFIG_YAML_INVALID`/`STATE_YAML_INVALID` (§18) — a raw
`ReferenceError`/library exception must never propagate to the CLI as an
unhandled exception or stack trace.

**Required tests:**

1. **Real warning fixture (not duplicate-key):** a fixture containing an
   unresolved/unrecognized custom YAML tag (e.g. `!!unknown-tag some
   value`) — which `yaml` records as a `YAMLWarning` in `doc.warnings`
   while falling back to ordinary scalar resolution, **without** BR2
   enabling any custom tag support — is loaded and confirmed to: (a)
   `doc.errors` is empty, (b) the load still succeeds
   (`{ ok: true, ... }`), (c) `result.value.diagnostics` contains exactly
   one entry describing the warning, and (d) no stdout/stderr output
   occurs as a side effect of the call, proving `logLevel: "error"`
   actually suppresses the library's own emission. (A duplicate map key
   is explicitly **not** used as the warning fixture — under `yaml`'s
   default `uniqueKeys: true` behavior, a duplicate key is a parse
   *error*, appearing in `doc.errors`, not `doc.warnings` — using it
   would test the wrong code path.)
2. **Resource-exhaustion bounded test:** a fixture YAML document
   constructed to exceed the default `maxAliasCount` (a bounded,
   deliberately-crafted small-but-over-the-limit alias expansion — not an
   actually dangerous/unbounded "billion laughs"-style payload) is loaded
   and confirmed to fail with `CONFIG_YAML_INVALID`/`STATE_YAML_INVALID`
   (via the caught-exception path above), not an unhandled exception, not
   a hang, and not a raw stack trace surfaced through the CLI.

### 20.2 JSON Schema validator: `ajv` only — `ajv-formats` is explicitly NOT a BR2 dependency

| Aspect | Detail |
|---|---|
| Package name | `ajv` |
| Runtime dependency | Yes, in `packages/core/package.json` |
| Supported draft | Ajv v8's default export supports Draft-07; **Draft 2020-12 support requires importing `ajv/dist/2020`** (the `Ajv2020` export), not the package's default entry point. This distinction must not be assumed away — implementation must explicitly use `import Ajv2020 from "ajv/dist/2020"` (or the equivalent for whatever exact major/minor is pinned at implementation time), verified against the installed version's actual export map before relying on it. |
| Compatibility with repo's schemas | The three BR2-registered schemas (`config.schema.json`, `state.schema.json`, `authorization.schema.json` — §10's "Registry scope") all declare `"$schema": "https://json-schema.org/draft/2020-12/schema"` — the `Ajv2020` constructor is required for correct behavior; using default Ajv (Draft-07 semantics) against them would silently misbehave on 2020-12-specific keywords/semantics and must not be used |
| `$id` handling | Ajv (`Ajv2020`) registers each schema under its own `$id` when passed to `addSchema()`; `$ref`s resolve against registered `$id`s per §11 |
| Relative `$ref` handling | Standard JSON Schema resolution (relative to the containing schema's base URI, i.e. its `$id`) — this is Ajv's default, documented behavior, not a special configuration BR2 must enable |
| Registry behavior | `new Ajv2020({ ...options })` instance holds the registry; `addSchema(schema)` registers each of the **three** BR2-scoped files once at `createRegistry()` time (§10); `getSchema($id)` or `compile()` per-`$id` retrieves a validator function |
| Normalized validation errors | Ajv's `errors` array (`AjvError[]`, each with `instancePath`, `message`, `keyword`) is mapped to BR2's `SchemaValidationErrorDetail[]` (§10) — `instancePath` becomes `path` (JSON Pointer, converted to dot-notation for readability, e.g. `/authorization/status` → `authorization.status`), `message` passed through, `keyword` passed through |
| Node compatibility | Pure JS, compatible with Node `>=22` |
| Configuration required | `strict: false` is **not** proposed — implementation should default to Ajv's strict mode and only relax specific strict-mode warnings if a genuine, documented conflict with the three registered schema files is found during implementation (none is currently known from inspection). `allErrors: true` **is** proposed, so `SchemaValidationResult.errors` reports every violation in one pass rather than only the first, which is more useful for a human reading `buildrail status` output. |

**`ajv-formats` is explicitly NOT a BR2 dependency — this is a definitive
decision, not a conditional "if needed":** none of BR2's three registered
schemas (`config.schema.json`, `state.schema.json`,
`authorization.schema.json`) use the JSON Schema `format` keyword
(checked by direct inspection). `verification-report.schema.json`'s
`timestamp` field *does* use `"format": "date-time"`, but per §10's
"Registry scope" decision, BR2's registry never registers that schema —
so Ajv's strict mode never encounters an unrecognized `format` keyword
during any BR2 validation call, and there is nothing for `ajv-formats` to
do. Adding it as a BR2 dependency would be installing a package to
satisfy a schema BR2 deliberately does not load. If a future phase (BR4,
which owns `verification-report.schema.json`) needs `format` validation,
that phase adds `ajv-formats` as its own justified dependency at that
time — this specification makes no claim about whether BR4 will need it,
only that BR2 does not.

**Alternative considered and rejected:** hand-rolled validation (no
JSON Schema library). Rejected because the schemas already exist,
are already Draft 2020-12, and reimplementing a validator would
duplicate well-tested logic for no benefit — directly contrary to BR1's
established "smallest reasonable dependency surface, but justify real
need" policy, which this *is* a real need for (schema-driven validation
is the explicit BR0/BR2 design, not an optional nicety).

### 20.3 No dependencies are installed by this specification

Per the human owner's explicit instruction, this document proposes exact
package choices and rationale but performs no `npm install` — that occurs
only once BR2 implementation is separately authorized.

## 21. Security

| Concern | BR2 requirement |
|---|---|
| YAML parser safety | `YAML.parseDocument(text, { logLevel: "error" })` (§20.1/§20's YAML diagnostics section) used with no custom tags/schema extensions enabled and a finite `maxAliasCount` (see "YAML resource-exhaustion safety" below) — no arbitrary JS object construction or code execution from document content |
| Untrusted repository contents | `.buildrail/config.yml` / `state.yml` are treated as untrusted input even though they live in the same repository as BuildRail itself — validation must not assume "this repo controls its own config, so it's safe" |
| Prototype pollution | Neither `yaml` nor `ajv` (in their default configurations, as proposed) are known to be vulnerable to prototype-pollution-via-parsed-document in normal usage; BR2 implementation must not add `__proto__`/`constructor`/`prototype` special-casing logic of its own that could reintroduce such a class of bug, and must not merge parsed YAML into any object via unsafe deep-merge utilities |
| Schema validation limits | No BR2 code evaluates `$dynamicRef`, `$recursiveRef`, or other advanced 2020-12 keywords beyond what the three BR2-registered schema files actually use (checked by inspection: none currently use these) — if a future schema change introduces one, it must be revisited, not assumed to "just work" |
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
*because* of the I/O-vs-pure-logic separation established in §7 —
lifecycle and policy tests in particular need no filesystem setup at all.

Minimum required test categories (each bullet is a required test case,
not merely a suggested one):

**Config loading**
- Valid config loads and validates successfully
- Missing config file → `CONFIG_NOT_FOUND`
- Malformed YAML syntax → `CONFIG_YAML_INVALID`
- Empty YAML document → `CONFIG_YAML_INVALID`
- Wrong root type (e.g. a YAML list at the document root) → `CONFIG_SCHEMA_INVALID`, **not** `CONFIG_YAML_INVALID`
- Missing a required field (e.g. no `schema_version`) → `CONFIG_SCHEMA_INVALID`
- Invalid enum value (e.g. `git.force_push: "sometimes"`) → `CONFIG_SCHEMA_INVALID`
- Valid `protected_systems` array with one well-formed entry validates
- Invalid `protected_systems` entry (missing required `name`/`status`/`paths`) → `CONFIG_SCHEMA_INVALID`
- A YAML document that produces a parser **warning** (not a hard error — e.g. a duplicate map key) via `YAML.parseDocument` still loads successfully, produces zero stdout/stderr output as a side effect, and the warning is captured in the result per §20's YAML diagnostics handling

**State loading**
- Valid state loads and validates successfully
- Missing state file → `STATE_NOT_FOUND`
- Malformed YAML syntax → `STATE_YAML_INVALID`
- Empty YAML document → `STATE_YAML_INVALID`
- Wrong root type (e.g. a YAML list at the document root) → `STATE_SCHEMA_INVALID`, **not** `STATE_YAML_INVALID` — proving the same rule §8's config tests establish (syntactically valid YAML of the wrong type is a schema failure, not a YAML failure) holds for state loading too
- Missing a required field (e.g. no `current`) → `STATE_SCHEMA_INVALID`
- Invalid `lifecycle_state` value (not in the enum) → `STATE_SCHEMA_INVALID`
- Invalid `authorization.status` value → `STATE_SCHEMA_INVALID`, `path` starting `authorization.`
- Nested authorization missing a required field (e.g. no `granted_by`) → `STATE_SCHEMA_INVALID`
- `candidate` with all three fields `null` validates successfully (the current real BR1-frozen-main shape)
- A `state.yml` fixture with **no `authorization` key at all** loads and validates **successfully** at the schema layer (`loadState` returns `{ ok: true, value: { value: state, diagnostics: [] } }`, and `state.authorization` is `undefined`) — proving `authorization`'s schema-optionality (§12) is actually honored, not treated as a de facto required field
- A fixture reproducing BuildRail's own actual BR0+BR1-frozen `state.yml` shape validates successfully end-to-end

**Schema system**
- All three BR2-registered schemas (`config.schema.json`, `state.schema.json`, `authorization.schema.json`) compile without error via `createRegistry()`
- `authorization` `$ref` inside `state.schema.json` resolves correctly (validating a state document with a deliberately invalid nested authorization correctly reports an `authorization.*`-pathed error, proving the nested schema was actually applied, not skipped)
- A deliberately broken/unregistered `$ref` (test-only fixture schema, not one of the three real files) fails predictably at registry-setup time with `SCHEMA_REFERENCE_UNRESOLVED`
- `verification-report.schema.json` and `handoff.schema.json` are confirmed NOT registered by BR2's registry (§10's "Registry scope") — `validate()` called (via a type assertion, since `Br2SchemaId` excludes these at compile time — the test deliberately bypasses that to exercise the runtime path) with either schema's `$id` deterministically returns `{ registered: false }` (§10), never throws, and never returns `{ registered: true, result: { valid: true, ... } }`
- No network call is made during any schema test (asserted by running in an environment with no network access, or by a lightweight instrumentation check — implementation's choice of mechanism, but the assertion itself is required)
- Schema resolution succeeds when `process.cwd()` is set to a directory unrelated to BuildRail's own source/package location (§10's package-relative resolution requirement) — proving resolution is not accidentally cwd-relative

**Lifecycle**
- **All 26 legal edges from §15's complete table are individually tested as legal** (`isLegalTransition` returns `true`), each with the correct `requiredActor` value (including `null` for the 2 actor-neutral edges) — this is exhaustive, not a sample; a single parameterized test iterating the 26-entry table (encoded once, shared between the lifecycle module and its tests, or duplicated deliberately as an independent cross-check — implementation's choice) satisfies this
- At least one illegal forward skip (e.g. `AUTHORIZED → IMPLEMENTED`) is rejected
- At least one illegal backwards transition on the primary path (e.g. `IMPLEMENTED → PREFLIGHT`) is rejected
- Every `human_owner`-required edge fails with `LIFECYCLE_AUTHORITY_REQUIRED` when attempted with `actor: "implementation_agent"` or `actor: "independent_reviewer"` (at least the two required-actor edges — `SPECIFIED → AUTHORIZED` and one `BLOCKED` return — tested both ways, not just one)
- `PENDING_REVIEW → REVIEW_APPROVED` succeeds only for `actor: "independent_reviewer"` and fails with `LIFECYCLE_AUTHORITY_REQUIRED` for the other two actor values
- At least one implementation-agent-only transition (e.g. `IMPLEMENTING → IMPLEMENTED`) succeeds only for `actor: "implementation_agent"`
- **Both actor-neutral edges** (`IDEA → SPECIFIED`, `MERGE_AUTHORIZED → MERGED`) succeed for all three `Actor` values — proving `requiredActor`'s `null` return is actually honored as "no restriction," not accidentally treated as "no actor is ever valid" or defaulting to one specific actor
- Each of the 5 `BLOCKED` entries and each of the 5 `BLOCKED` returns is tested individually as legal, with the correct actor (`implementation_agent` for entries, `human_owner` for returns)
- Each of the 2 `CORRECTION_REQUIRED` entries (from `PENDING_REVIEW` with `independent_reviewer`, from `HUMAN_QA` with `human_owner`) and the 1 `CORRECTION_REQUIRED → IMPLEMENTING` return (with `implementation_agent`) are tested individually as legal with their correct actors
- At least one attempted edge not in the 26-entry table (e.g. `IDEA → FROZEN`, `BLOCKED → SPECIFIED`, `REVIEW_APPROVED → CORRECTION_REQUIRED`) is confirmed illegal (`isLegalTransition` returns `false`)

**Authorization policy**
- An `authorized`-status record is accepted as active
- A `completed`-status record is rejected as active (`AUTHORIZATION_INACTIVE`) — the specific case the human owner's task called out
- A `revoked`-status record produces `AUTHORIZATION_REVOKED` specifically — **not** `AUTHORIZATION_INACTIVE` — proving the §13 check ordering (revoked checked before active-status) is actually implemented, not just documented
- A `draft`-status record is rejected as active (`AUTHORIZATION_INACTIVE`)
- No `authorization` present at all — a schema-valid state (§9's new test above confirms `loadState` itself succeeds) whose `authorization` is `undefined` — is rejected **at the policy layer** by `checkImplementationAllowed`/`isAuthorizationActive` (`AUTHORIZATION_MISSING`), distinct from and never confused with a `StateError`
- An active authorization whose `id` does not match the requested phase is rejected (`AUTHORIZATION_PHASE_MISMATCH`)
- `granted_by !== "human"` is rejected (`AUTHORIZATION_MISSING`) even if `status` is otherwise `authorized`
- The full check order itself is tested directly: a record that is simultaneously `status: revoked` *and* would otherwise fail a later check (e.g. missing `specification`) still produces `AUTHORIZATION_REVOKED`, not the later-order failure — proving `checkImplementationAllowed` returns the *first* applicable failure in the mandated order (§13), not merely *some* correct-looking failure

**Lifecycle/authorization composition (§15)**
- `applyTransition(state, "PREFLIGHT", "implementation_agent")` against a fixture with `authorization.status: completed` (i.e. graph-legal, actor-correct, but authorization inactive) fails with `AUTHORIZATION_INACTIVE`, **not** a successful transition — proving the composition actually runs and actually blocks, not merely that the two checks exist independently
- The same call against a fixture with no `authorization` at all fails with `AUTHORIZATION_MISSING`
- The same call against a fixture with `authorization.id` for a different phase fails with `AUTHORIZATION_PHASE_MISMATCH`
- The same call against a fixture with a genuinely active, correctly-scoped authorization succeeds
- At least one of the 4 other forward-progress authorization-gated transitions (`PREFLIGHT → IMPLEMENTING`, `IMPLEMENTING → IMPLEMENTED`, `IMPLEMENTED → VERIFYING`, `VERIFYING → PENDING_REVIEW`) is spot-checked with the same inactive-authorization-blocks pattern, confirming the composition isn't accidentally limited to only the first gated edge
- **Resume-bypass closure (the specific defect this correction fixes):** `applyTransition(state, "IMPLEMENTING", "implementation_agent")` for the `CORRECTION_REQUIRED → IMPLEMENTING` edge, against a fixture with `authorization.status: revoked`, fails with `AUTHORIZATION_REVOKED` — **not** a successful resume — proving a revoked authorization cannot be silently bypassed by resuming through `CORRECTION_REQUIRED` while graph-legality and actor-correctness (`human_owner` approved the resume) are both satisfied
- At least one `BLOCKED → X` return (e.g. `BLOCKED → IMPLEMENTING`, with `actor: "human_owner"`) is spot-checked the same way: graph-legal, actor-correct, but `authorization.status: revoked` (or `completed`/missing) — the call fails with the appropriate `AUTHORIZATION_*` code, not a successful resume, confirming the fix covers `BLOCKED` returns too, not only `CORRECTION_REQUIRED`
- The same `BLOCKED → IMPLEMENTING` / `CORRECTION_REQUIRED → IMPLEMENTING` calls succeed when the authorization is genuinely active and phase-matching — confirming the new gate doesn't break the ordinary, legitimate resume path
- At least one non-gated transition (e.g. `PENDING_REVIEW → REVIEW_APPROVED`, or a `BLOCKED`/`CORRECTION_REQUIRED` *entry* edge such as `PREFLIGHT → BLOCKED`) succeeds even when `state.authorization.status` is `completed`/`revoked` — proving the composition is correctly scoped to exactly the 11 gated edges (§15's table), not applied blanket to every transition

**`authorizeSpecifiedWork` (§15)**
- Succeeds against a fixture at `SPECIFIED` with `actor: "human_owner"` and a valid `authorization` argument (`status: "authorized"`, `granted_by: "human"`, `id` matching the fixture's `current.development_phase`), returning a state with both `current.lifecycle_state: "AUTHORIZED"` and the supplied `authorization` set together
- Fails with `LIFECYCLE_TRANSITION_ILLEGAL` when `current.lifecycle_state` is not `SPECIFIED`
- Fails with `LIFECYCLE_AUTHORITY_REQUIRED` for `actor: "implementation_agent"` or `actor: "independent_reviewer"`
- Fails with `AUTHORIZATION_INACTIVE` when the supplied `authorization.status` is anything other than `"authorized"` (e.g. `"draft"`, `"in_progress"`)
- Fails with `AUTHORIZATION_PHASE_MISMATCH` when the supplied `authorization.id` does not match `current.development_phase`
- Fails with the appropriate `AUTHORIZATION_*` code when the supplied `authorization` fails §13's `specification`/`granted_by` checks
- `applyTransition(state, "AUTHORIZED", actor)` — the generic function, called directly for this specific pair — fails (does not silently succeed as a lifecycle-only, authorization-less change) when `current.lifecycle_state === "SPECIFIED"`, proving this edge is genuinely carved out of `applyTransition`'s generic handling

**`activatePhase` (§15)**
- Succeeds against a fixture at `current.lifecycle_state: "FROZEN"` (e.g. a BR1-frozen-shaped fixture), `actor: "human_owner"`, `request: {newPhaseId: "BR2", newAuthorization: {id: "BR2", status: "authorized", granted_by: "human", ...}}` — returning a state with `current.development_phase: "BR2"`, `current.lifecycle_state: "AUTHORIZED"`, `authorization` replaced with the supplied record, and `baselines`/`completed_phases` unchanged
- The fixture's `planned_phases` (which includes `"BR2"` before the call) has `"BR2"` removed after a successful call — proving `activatePhase` derives this itself rather than requiring the caller to supply a pre-modified array (the specific defect this correction fixes)
- A fixture whose `planned_phases` does **not** contain `request.newPhaseId` (e.g. reactivating BR0's own bootstrap case) still succeeds, with `planned_phases` left unchanged — proving removal is a no-op, not an error, when the phase ID isn't present
- Fails with `LIFECYCLE_AUTHORITY_REQUIRED` for any actor other than `"human_owner"`
- Fails with `LIFECYCLE_TRANSITION_ILLEGAL` when `current.lifecycle_state` is not `"FROZEN"` (and is not the one-time BR0 bootstrap case)
- **Rejects reactivating a closed phase ID (the other specific defect this correction fixes):** a call with `request.newPhaseId` equal to a key already present in `state.baselines` (e.g. `"BR1"`) fails with `LIFECYCLE_TRANSITION_ILLEGAL` — proving BR2 does not silently allow reusing an already-frozen phase ID as a new activation target
- The same rejection is confirmed for `request.newPhaseId` already present in `state.completed_phases`, independent of whether it's also a `baselines` key
- Fails with `AUTHORIZATION_INACTIVE` when `request.newAuthorization.status` is not `"authorized"`
- Fails with `AUTHORIZATION_PHASE_MISMATCH` when `request.newAuthorization.id !== request.newPhaseId`

**CLI status integration**
- `buildrail status` against a valid, BR0+BR1-frozen-shaped fixture project prints the required field set (§17.1) and exits `0`
- `buildrail status` against a fixture with invalid config prints a deterministic error and exits `1`, with no raw stack trace in stdout/stderr
- `buildrail status` against a fixture with invalid state behaves the same way
- `buildrail status` against a fixture with missing `.buildrail/` files behaves the same way
- `buildrail status` against a fixture whose `state.yml` has a **populated** `candidate` (non-null `branch`/`base_sha`/`candidate_sha`) correctly **includes** those values in its output — proving the allowed category (§17.1) is actually surfaced, not suppressed
- Output contains no evidence of **live Git inspection** having occurred — no invocation of any Git command/library, and no value present in the output that isn't traceable to the loaded `state.yml`/`config.yml` fixture content (this is the precise, checkable form of "no live Git facts": every branch-or-SHA-shaped string in the output must correspond exactly to a `candidate.*` or `baselines.*.approved_sha` value in the input fixture, not to anything computed from the real filesystem/Git state of the test environment) — asserted by tracing output values back to fixture input, not merely by pattern-matching for "SHA-shaped strings"

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
- **B.** YAML parser diagnostics (both errors and non-fatal warnings) are
  handled deterministically per §20's YAML diagnostics section, using
  `YAML.parseDocument(text, { logLevel: "error" })` consistently (not
  bare `YAML.parse`, and not `parseDocument` without the `logLevel`
  option) — no stdout/stderr output occurs as a side effect of parsing,
  warnings are captured in the typed `LoadSuccess.diagnostics` array
  (§20) rather than silently discarded, uncontrollably printed, or
  attached as an undocumented field, a document producing only warnings
  (no errors) still loads successfully, and a bounded
  resource-exhaustion (alias-count) fixture fails safely as a typed
  `*_YAML_INVALID` error rather than an unhandled exception or hang.
- **C.** `loadState` returns a valid, typed `BuildRailState` for a
  schema-valid `state.yml` (including successful nested `authorization`
  validation), and a typed `StateError` for each failure category in §9.
- **D.** The cross-schema `authorization.schema.json` `$ref` inside
  `state.schema.json` resolves correctly via the schema registry (§11),
  proven by a test that validates a state document with a deliberately
  invalid nested authorization and confirms the error path is
  `authorization.*`, not a validator crash or silent pass.
- **E.** `createRegistry()` fails predictably and distinctly
  (`SCHEMA_REFERENCE_UNRESOLVED`) for a genuinely broken/unregistered
  `$ref` encountered during registration (a fixture schema, not one of
  the three BR2-registered real files) — distinct from `validate()`'s
  own `{ registered: false }` result (§10) for a runtime call naming a
  schema outside the registered set, which is a different failure class
  and must not reuse `SCHEMA_REFERENCE_UNRESOLVED`. `createRegistry()`
  registers exactly `config.schema.json`, `state.schema.json`, and
  `authorization.schema.json` — `verification-report.schema.json` and
  `handoff.schema.json` are confirmed unregistered, and `validate()`
  called with either's `$id` returns `{ registered: false }`.
- **F.** No schema resolution makes a network request, proven by the
  no-network-call test in §22.
- **G.** Schema file resolution is package-relative (computed from the
  executing module's own location, per §10), not `process.cwd()`-relative
  — proven by the cwd-independence test in §22 (config/state loading
  succeeds when invoked from a working directory unrelated to BuildRail's
  own source tree).
- **H.** `isLegalTransition`/`requiredActor`/`applyTransition` correctly
  implement **all 26 legal edges** of the complete transition table in
  §15 (not a sample), each with its correct required actor including
  both actor-neutral edges, proven by the exhaustive transition test
  matrix in §22.
- **I.** `checkImplementationAllowed` correctly distinguishes
  active/authorized, active/in-progress, inactive/completed,
  inactive/draft, and revoked authorization states — implementing the
  exact, mutually exclusive check order from §13 (`MISSING → REVOKED →
  INACTIVE → PHASE_MISMATCH → specification → granted_by`) such that
  `AUTHORIZATION_REVOKED` is always reachable and never silently absorbed
  into `AUTHORIZATION_INACTIVE` — proven by the policy test matrix in §22,
  specifically including both the "completed authorization is not usable
  as active implementation authority" case and the "revoked record
  produces `AUTHORIZATION_REVOKED` even when it would also fail a later
  check" ordering-proof case the human owner's task explicitly required.
- **J.** `applyTransition` composes §13's authorization policy for
  exactly the 11 authorization-gated transitions (§15) — including the
  6 resume-into-active-workflow edges (`BLOCKED`'s five returns and
  `CORRECTION_REQUIRED → IMPLEMENTING`), closing the resume bypass a
  prior draft left open — a graph-legal, actor-correct call for one of
  those 11 edges still fails with the appropriate `AUTHORIZATION_*` code
  when the authorization is missing, inactive, revoked, or
  phase-mismatched, and a non-gated transition (e.g.
  `PENDING_REVIEW → REVIEW_APPROVED`) is unaffected by authorization
  state — proven by the composition test matrix in §22.
  There is no code path that advances lifecycle state through a gated
  edge while bypassing this check.
- **K.** `SPECIFIED → AUTHORIZED` is performed exclusively by
  `authorizeSpecifiedWork` (§15), never by a bare `applyTransition` call
  — the dedicated function atomically sets both
  `current.lifecycle_state` and `authorization` together, validates the
  supplied authorization (status, phase match, `granted_by`), and
  requires `human_owner`, all proven by the dedicated test matrix in §22.
- **L.** `activatePhase` (§15) atomically sets `development_phase`,
  `lifecycle_state`, `authorization`, and a self-derived `planned_phases`
  (with `newPhaseId` removed if present — never requiring the caller to
  compute and pass a modified array), requires `human_owner`, requires a
  `FROZEN` (or bootstrap) precondition, and **rejects reactivating a
  phase ID already present in `baselines` or `completed_phases`** —
  proven by the dedicated test matrix in §22.
- **M.** `buildrail status` produces the required field set (§17.1),
  including `state.yml`-recorded Git-related metadata
  (`candidate.branch`/`base_sha`/`candidate_sha`,
  `baselines.*.approved_sha`) when present in the loaded state, and
  performs no live Git inspection (no branch/SHA/dirty-tree/diff value in
  the output is obtained by querying the real repository rather than
  reading already-validated `state.yml` content), for a valid fixture
  project, and exits `0`.
- **N.** `buildrail status` produces a deterministic, non-stack-trace
  error and exits `1` for each of: invalid config, invalid state, missing
  files.
- **O.** `buildrail init` behavior is unchanged from BR1 (still the BR1
  boundary shell, per §17.4) — proven by re-running BR1's own existing
  `init`-related tests unmodified and passing against the BR2 candidate.
- **P.** `npm test`, `npm run typecheck`, `npm run build` all pass at the
  repository root, covering both `packages/cli` (BR1, unmodified) and
  `packages/core` (BR2, new).
- **Q.** No Git inspection (branch, SHA, diff, deletion/rename detection)
  was implemented anywhere in `packages/core` or `packages/cli`.
- **R.** No quality-gate *execution engine* (`buildrail verify` or
  equivalent) was implemented.
- **S.** No agent skill, adapter, or dogfood-lifecycle work was performed.
- **T.** No real `buildrail init` scaffolding was implemented.
- **U.** No network calls occur anywhere in the BR2 implementation's
  normal operation (schema loading, config loading, state loading,
  `buildrail status`).
- **V.** No dependency beyond `yaml` and `ajv` was added to
  `packages/core/package.json`. `ajv-formats` is explicitly **not**
  added in BR2 (§20.2) — its presence in `package.json` would itself be
  a scope violation requiring justification, not merely an optional
  extra, per BR1's established dependency-justification precedent.

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
7. **`docs/STATE_MACHINE.md`'s `* → FROZEN` wildcard reconciliation.**
   §15 ("Resolving `docs/STATE_MACHINE.md`'s `* → FROZEN` wildcard")
   adopts a restricted interpretation for BR2 — `FROZEN` is legally
   reachable only from `PRODUCTION_VERIFIED` — because the literal "any
   state" wildcard reading is incompatible with an exhaustively-enumerated
   edge table. Whether `docs/STATE_MACHINE.md` itself should be narrowed
   to match, or whether a future specification should instead add
   additional explicit `X → FROZEN` edges (e.g. an administrative
   "abandon and freeze" path from `BLOCKED`/`CORRECTION_REQUIRED`), is
   left open. BR2 implementation must encode only the one edge this
   specification defines and must not add others on its own initiative.
8. **Exact `BLOCKED` resume-origin enforcement.** §15's "Return from
   `BLOCKED`" section documents that BR2's pure lifecycle functions
   cannot themselves verify a `BLOCKED → X` return targets the exact
   state `BLOCKED` was entered from (only that `X` is *some* legal return
   target) — this would require a persisted resume-state field that does
   not currently exist in `state.schema.json`, and this specification
   does not propose adding one. If exact-origin enforcement is later
   judged necessary, a future specification must design that schema
   addition explicitly rather than have it invented ad hoc during
   implementation.
9. **Phase reactivation/reopening policy.** `activatePhase` (§15)
   deliberately rejects reactivating a phase ID already present in
   `baselines` or `completed_phases` — BR2 has no concept of reopening or
   revising an already-completed/frozen phase under its original ID. If
   a genuine future need arises (e.g. correcting a frozen phase's
   baseline after a later phase discovers a defect in it), that requires
   a distinct, explicitly-designed reopen/revision policy — a new
   specification, not an `activatePhase` behavior change made ad hoc
   during some future phase's implementation.

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
- Whether schema file resolution is genuinely package-relative (§10) —
  run `buildrail status` (or the equivalent core loader call) from a
  directory unrelated to the BuildRail source tree and confirm it still
  works, rather than trusting the specification's claim
- Whether the active/historical authorization model (§12) was implemented
  exactly as specified, especially the "completed authorization is not
  active" case
- Whether the lifecycle transition graph implements exactly the 26 edges
  in §15's complete table — no more, no fewer, each with the specified
  actor — and whether §15's table itself faithfully reflects
  `docs/STATE_MACHINE.md`'s policy (a line-by-line cross-check of both
  the spec-to-doc mapping and the implementation-to-spec mapping, not a
  spot-check of either)
- Whether the revoked-authorization check ordering (§13) is actually
  implemented in the mandated order — specifically, whether a revoked
  record that would also fail a later check still produces
  `AUTHORIZATION_REVOKED`, not a different code
- Whether `buildrail status` output correctly includes `state.yml`-recorded
  candidate/baseline metadata (not suppressed) while performing zero live
  Git inspection (§17.1's allowed-vs-forbidden distinction — not a blanket
  absence of branch/SHA-shaped strings)
- Whether the CLI/Core error-translation boundary (§19) is actually
  respected — no raw exceptions leaking to stdout/stderr, no `@buildrail/core`
  code calling `process.exit` or writing to stdout/stderr directly
- Whether any of §6's out-of-scope items leaked into the implementation
- Whether test evidence is real (tests actually run, results actually
  observed) and whether the fixture-independence requirement (§23) was
  honored
- Whether exactly the dependencies proposed in §20 (and no others, absent
  justification) were added — specifically confirming `ajv-formats` is
  **not** present, since §20.2 makes this a definitive exclusion, not an
  optional one
- Whether YAML parser warnings are handled deterministically (§20's YAML
  diagnostics section) — no uncontrolled stdout/stderr output from
  parsing, warnings captured rather than silently dropped, and
  `logLevel: "error"` is actually passed to every `parseDocument` call
- Whether `authorization`'s schema-optionality (§12) is honored — a
  `state.yml` with no `authorization` key loads successfully at the
  schema layer, and `AUTHORIZATION_MISSING` is a policy-layer result on
  successfully-loaded state, never a `StateError`
- Whether `validate()`'s unknown-schema behavior (§10) matches the typed
  `{ registered: false }` contract exactly — never throwing, never
  falsely reporting `{ valid: true }`, and never reusing
  `SCHEMA_REFERENCE_UNRESOLVED` for this case
- **Whether the resume-authorization-bypass fix (§15) actually closes the
  gap** — specifically, attempt `CORRECTION_REQUIRED → IMPLEMENTING` and
  at least one `BLOCKED → X` return against a fixture with a revoked
  authorization and confirm both are rejected, not silently permitted
- Whether `authorizeSpecifiedWork` (§15) is the only path that reaches
  `AUTHORIZED` from `SPECIFIED`, and whether a bare `applyTransition`
  call for that pair is genuinely rejected rather than silently
  performing a partial, authorization-less update
- Whether `activatePhase` (§15) correctly derives its own `planned_phases`
  update (rather than requiring an impossible caller-supplied field) and
  correctly rejects reactivating a phase ID already present in
  `baselines`/`completed_phases`

This document does not itself authorize BR2 implementation — see §1 and
§27 item 1.
