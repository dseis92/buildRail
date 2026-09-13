# Candidate SHA

A candidate SHA is the exact Git commit that a piece of work is currently
being evaluated at — verified, reviewed, or handed off.

## Why "exact" matters

Code changes. A test suite passing at commit `abc123` says nothing
reliable about commit `def456`, even if the two commits look similar or
the intervening change seems small. BuildRail treats every verification
result, review, and handoff as bound to one specific SHA, never to a
branch name, a PR number, or "the current state of things" in a loose
sense.

## What becomes stale when the SHA changes

- Quality gate results (`docs/QUALITY_GATES.md`)
- Independent review approval (`docs/REVIEW_MODEL.md`)
- Evidence reports (`docs/concepts/evidence.md`)

If new commits land on top of a reviewed or verified candidate, all of the
above must be treated as stale until re-run or re-reviewed against the new
SHA. This is true even for what looks like a trivial follow-up commit.

## Where it lives

`.buildrail/state.yml` tracks the current candidate under `candidate`:

```yaml
candidate:
  branch: null
  base_sha: null
  candidate_sha: null
```

These are `null` in BuildRail's own BR0 state because there is no active
implementation candidate yet — BR0 itself is being developed directly,
without a separate feature-branch candidate workflow in play. Populating
and updating these fields based on real Git inspection is planned for BR3.
