# Specifications

This directory holds the authorization specifications that drive BuildRail's
own development. Each spec defines the goal, scope, out-of-scope boundary,
and acceptance criteria for one unit of authorized work.

The active specification for the current phase is referenced from
`.buildrail/state.yml` under `authorization.specification`. `.buildrail/state.yml`
is the canonical source for which phase is currently authorized — this
README is a directory index, not a status record.

- [`BR0-CONSTITUTION.md`](BR0-CONSTITUTION.md) — BR0 (Constitution).
  Complete, independently approved, and frozen.
- [`BR1-CLI-SKELETON.md`](BR1-CLI-SKELETON.md) — BR1 (CLI Skeleton).
  Complete, independently approved, Human-QA-passed, and frozen.
- [`BR2-GOVERNANCE-ENGINE.md`](BR2-GOVERNANCE-ENGINE.md) — BR2 (Governance
  Engine). Specified; not implementation-authorized.
