# Review Model

BuildRail requires independent review of implemented work before it can
proceed to human QA and merge. This document describes the intended model.
**Review tooling is not implemented as of BR0** (planned for BR4/BR5).

## Independent review

Review must be performed by a party who did not implement the change being
reviewed — a different agent instance/session, a different tool, or a
human. The implementing agent cannot approve its own work, under any
framing ("I've reviewed my own changes and they look good" is not
independent review).

Review always targets the **exact candidate SHA** — not a description of
the change, not a diff summarized secondhand, and not an earlier or later
commit. If the candidate SHA changes, any prior review becomes stale in the
same way verification evidence does (see `docs/QUALITY_GATES.md`).

## Review axes

Review considers four separate axes. They are evaluated independently —
passing one does not imply passing another, and a review should report on
each rather than collapsing them into a single verdict.

### SPEC

Did the implementation satisfy the active authorization/specification? Does
it do what was asked, completely, without unaddressed acceptance criteria?

### SAFETY

Were protected systems respected? Did the change avoid modifying
`FROZEN` or `LOCKED` systems without explicit authorization, and were any
`GUARDED` system changes prominently reported (see
`docs/PROTECTED_SYSTEMS.md`)?

### QUALITY

Are there correctness, security, or design issues in the implementation
itself, independent of whether it technically satisfies the spec?

### SCOPE

Was unauthorized work introduced — functionality, files, or changes beyond
what the active authorization covers — even if well-intentioned?

## Why these stay separate

Collapsing these into one pass/fail judgment hides useful information. Work
can satisfy the spec but introduce a security issue (SPEC yes, QUALITY no).
Work can be high quality but touch a frozen system without authorization
(QUALITY yes, SAFETY no). Keeping the axes distinct lets the human owner
understand exactly what kind of problem, if any, exists.

## Status

No review tooling exists yet. This document defines the target model that
BR4 (verification/evidence) and BR5 (skills, including a review skill) are
expected to implement against.
