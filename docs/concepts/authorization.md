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
- `status` — e.g. `authorized`
- `specification` — a path to the spec document defining goal, scope,
  out-of-scope boundary, and acceptance criteria
- `granted_by` — who granted it (the human owner)

See `packages/core/schemas/authorization.schema.json` for the draft data
contract.

## Why it matters

Without an explicit authorization record, "should I do this?" becomes a
judgment call an agent makes on its own, informed only by whatever
instructions happen to be in context at the time. BuildRail replaces that
judgment call with a check against a durable, versioned record: does an
authorization exist, is its status `authorized`, and does the requested
work fall within its specification's stated scope?

## Relationship to state

The currently active authorization is referenced from
`.buildrail/state.yml` under `current.authorization`. Only one
authorization is normally active at a time per work item; BuildRail's own
development currently has BR0 authorized and BR1–BR8 explicitly marked
`planned`, not `authorized` (see `.buildrail/state.yml`).

## Scope boundaries are part of the authorization

A specification's "out of scope" section is as binding as its "in scope"
section. Work that technically advances the goal but falls outside the
documented scope is not covered by the authorization — see
`docs/GOVERNANCE.md` for what to do when this happens (STOP and request
expansion, don't proceed).
