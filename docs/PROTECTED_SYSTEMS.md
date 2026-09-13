# Protected Systems

BuildRail lets a project mark parts of its codebase with a protection
level, so agents know what they can touch freely versus what requires
explicit authorization. This document describes the intended model.
**Path-matching enforcement is not implemented as of BR0** (planned for
BR2/BR3) — this is a design document, not a working feature yet.

## Protection levels

| Level | Meaning |
|-------|---------|
| `OPEN` | Normal authorized development is allowed. No special handling needed. |
| `GUARDED` | May be changed, but any modification must be prominently reported — it should never happen silently, even though it doesn't strictly require new authorization. |
| `FROZEN` | Cannot be modified without authorization that explicitly targets this system. General authorization for unrelated work does not cover it. |
| `LOCKED` | Cannot be modified during the current development phase at all, regardless of authorization. Typically used for systems that are intentionally off-limits for the duration of a phase (e.g. a payments integration during a phase focused on UI work). |

## Planned path matching

Protected systems will be declared in `.buildrail/config.yml` as named
systems with glob-style path patterns. Example only — no real BuildRail
paths are protected yet:

```yaml
systems:
  authentication:
    status: frozen
    paths:
      - src/auth/**
```

When implemented (BR3), Git inspection will compare changed paths in a
candidate against these patterns to detect when a change touches a
protected system, and governance policy (BR2) will decide whether that
change is permitted given current authorization.

## Why this exists

Without an explicit protection model, an agent has no way to know that a
given file is more sensitive than any other — a payments integration looks
the same as a README to a diff. Marking systems `GUARDED`, `FROZEN`, or
`LOCKED` gives agents (and reviewers) an explicit signal to treat certain
paths with more caution, independent of whether the current instructions
happen to mention them.

## Status

`.buildrail/config.yml` currently declares `protected_systems: []` because
BuildRail's own source tree has no functional implementation yet during
BR0 — there is nothing meaningful to protect. Real protected-system
declarations, for BuildRail itself or for BuildRail-managed projects, come
later as actual sensitive systems (e.g. the governance engine's core
policy logic) are built.
