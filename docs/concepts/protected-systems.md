# Protected Systems (overview)

BuildRail lets a project mark parts of its codebase as `OPEN`, `GUARDED`,
`FROZEN`, or `LOCKED`, so agents know what requires extra care or explicit
authorization before touching it.

This is a short pointer; the full model — including path-matching syntax
and examples — lives in [`docs/PROTECTED_SYSTEMS.md`](../PROTECTED_SYSTEMS.md).

In brief:

- `OPEN` — normal development allowed
- `GUARDED` — allowed, but must be prominently reported
- `FROZEN` — requires authorization naming this system specifically
- `LOCKED` — cannot be modified during the current phase, regardless of
  authorization

No protected systems are currently declared for BuildRail itself
(`.buildrail/config.yml` has `protected_systems: []`). BR1 introduced
BuildRail's first functional implementation (the CLI skeleton), but
protected-path enforcement is not implemented until later phases (see
`docs/PROTECTED_SYSTEMS.md`), so no declaration is meaningful yet.
