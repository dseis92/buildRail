# Authorization

Authorization is BuildRail's mechanism for making sure implementation work
only happens when a human has explicitly agreed it should — not because an
agent decided it seemed reasonable.

## What an authorization is

An authorization record identifies:

- `id` — a stable identifier (e.g. `BR0`, or a project-specific ID)
- `type` — the kind of work (e.g. `foundation`, `feature`, `bugfix`,
  `maintenance`)
- `title` — a human-readable name
- `status` — one of `draft`, `authorized`, `in_progress`, `completed`, or
  `revoked` — see "Active vs. inactive status" below
- `specification` — a path to the spec document defining goal, scope,
  out-of-scope boundary, and acceptance criteria
- `granted_by` — who granted it (the human owner)

See `packages/core/schemas/authorization.schema.json` for the draft data
contract.

### Active vs. inactive status

| Status | Active? | Meaning |
|--------|---------|---------|
| `draft` | No | Recorded but not yet granted; work may not begin. |
| `authorized` | Yes | Granted by the human owner; implementation may begin or continue. |
| `in_progress` | Yes | Granted and implementation is actively underway. |
| `completed` | No | The authorized work finished and closed out normally. |
| `revoked` | No | The human owner withdrew the authorization before completion. |

Only `authorized` and `in_progress` are **active** — they are the only
statuses under which `checkImplementationAllowed`-style policy checks may
permit implementation to proceed. `draft`, `completed`, and `revoked` are
all **inactive**, for different reasons (not yet granted, already done,
or withdrawn), and none of them permit implementation.

## Why it matters

Without an explicit authorization record, "should I do this?" becomes a
judgment call an agent makes on its own, informed only by whatever
instructions happen to be in context at the time. BuildRail replaces that
judgment call with a check against a durable, versioned record: does an
authorization exist, is its status `authorized`, and does the requested
work fall within its specification's stated scope?

## Relationship to state

The authorization record lives at the **top level** of
`.buildrail/state.yml`, as `state.authorization` — never nested under
`current` (`current.authorization` is not a real field; `current` holds
lifecycle-state fields such as `current.lifecycle_state` and
`current.development_phase`). `authorization` is a **schema-optional**
property of `state.schema.json`: it is a declared property, but it is not
listed in the schema's top-level `required` array, so a state document
with no `authorization` key at all is schema-valid. This matters at
project bootstrap and immediately after a phase is closed and frozen,
before the next phase's authorization has been granted — at both points
there is legitimately no active authorization, and that absence is not a
schema violation.

At most one authorization record is present at a time. When it is
present, its `status` determines whether it is active (see "Active vs.
inactive status" above). When an authorized or in-progress unit of work
finishes normally, its record's `status` is updated to `completed` in
place — the record is not deleted. So `state.authorization` being present
with `status: completed` does not mean work is currently authorized; it
means the most recent authorization record finished, and no active
authorization currently exists until a new one is granted.

**History** of prior authorizations is not kept as a growing list under
`authorization` itself. It is reconstructed from `state.completed_phases`
(which phase IDs have closed) together with `state.baselines` (which SHA
was frozen for each), cross-referenced against the specification each
authorization pointed to. `state.authorization` itself only ever holds
the single most recent record, active or not.

As of this writing, BuildRail's own development has BR0 and BR1 recorded
as completed phases with frozen baselines, and no BR2 implementation
authorization currently exists — BR2 has a specification but has not been
granted an authorization record, and will not have one until a separate,
explicit Human Owner action creates it (see `.buildrail/state.yml` and
`.buildrail/specs/BR2-GOVERNANCE-ENGINE.md`).

## Scope boundaries are part of the authorization

A specification's "out of scope" section is as binding as its "in scope"
section. Work that technically advances the goal but falls outside the
documented scope is not covered by the authorization — see
`docs/GOVERNANCE.md` for what to do when this happens (STOP and request
expansion, don't proceed).
