# Evidence

Evidence is a verification result or review outcome that can be traced back
to something actually run or actually inspected, at an exact candidate SHA
(see `docs/concepts/candidate-sha.md`). A claim without evidence is just a
claim.

## Evidence vs. claim

"Tests pass" is a claim. A verification report that names the exact
command run, the candidate SHA it ran against, the timestamp, and the
actual output/result is evidence. BuildRail's verification model (see
`docs/QUALITY_GATES.md`) exists specifically to convert claims into
evidence wherever possible, and to honestly label what hasn't been checked
(`NOT_CHECKED`) rather than letting an unverified claim pass as if it were
checked.

## What an evidence report anticipates recording

Per the draft `packages/core/schemas/verification-report.schema.json`:

- `candidate_sha` — exactly what was evaluated
- `branch` — where it came from
- `timestamp` — when the evaluation ran
- `quality_gates` — per-gate category and result
- `protected_path_changes` — whether protected paths were touched
- `unexpected_deletions` / `unexpected_renames` — surprising changes
  outside what was expected
- `result` — the overall outcome

## Why this is separate from review

Evidence (quality gate results, Git facts) is produced mechanically and
should be reproducible by re-running the same commands against the same
SHA. Review (see `docs/REVIEW_MODEL.md`) is a judgment made by an
independent party who consumes that evidence, along with reading the code,
to reach conclusions across the SPEC/SAFETY/QUALITY/SCOPE axes. Evidence
informs review; it doesn't replace it, and review shouldn't have to
re-derive facts evidence already established.

## Status

No evidence-generating tooling exists yet. This document describes the
target model; implementation is planned for BR4.
