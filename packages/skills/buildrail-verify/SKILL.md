---
name: buildrail-verify
description: Run quality gates against the exact candidate SHA and produce an honest, evidence-based verification report.
---

# BuildRail Verify

**STATUS: DESIGN DRAFT — NOT YET BACKED BY THE BUILDRAIL CLI.**

## When to use this skill

Use this after implementation is reported complete, to move from
`IMPLEMENTED` to `VERIFYING` to `PENDING_REVIEW` in
`docs/STATE_MACHINE.md`.

## What this skill does

1. Determine the exact candidate SHA being verified (see
   `docs/concepts/candidate-sha.md`).
2. Run each quality gate declared as `required` in `.buildrail/config.yml`,
   recording the real command, real output, and real pass/fail/error
   result for each — see `docs/QUALITY_GATES.md` for the category
   distinctions (`AUTOMATED_TEST`, `TYPECHECK`, `LINT`, `BUILD`,
   `MANUAL_INSPECTION`, `HUMAN_QA`, `NOT_CHECKED`).
3. Never claim a category was checked if it wasn't — use `NOT_CHECKED`
   honestly rather than omitting it or implying a pass.
4. Produce a verification report bound to the candidate SHA (see
   `packages/core/schemas/verification-report.schema.json` and
   `docs/concepts/evidence.md`).

## What this skill does not do

- It does not review the work (see `buildrail-review`).
- It does not reuse results from a different candidate SHA — if the SHA
  changed, prior results are stale and must be re-run.

## Boundaries

If a quality gate cannot actually be run (e.g. no test suite exists yet),
report it as `NOT_CHECKED`, not as passing.
