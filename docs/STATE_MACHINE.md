# State Machine

This document defines the legal lifecycle states for a unit of work under
BuildRail governance, and which transitions require human authority. It
describes the intended model. **Transition logic is not implemented as of
BR0** — see `docs/ROADMAP.md` (implementation is planned for BR2).

## States

| State | Meaning |
|-------|---------|
| `IDEA` | An unrefined idea has been captured but not yet specified. |
| `SPECIFIED` | A specification exists (goal, scope, out-of-scope, acceptance criteria) but is not yet authorized. |
| `AUTHORIZED` | The human owner has explicitly authorized implementation of the specification. |
| `PREFLIGHT` | An implementation agent is validating readiness (branch state, dependencies, protected-system awareness) before starting work. |
| `IMPLEMENTING` | Implementation is actively underway. |
| `IMPLEMENTED` | The implementing agent reports the work as complete, pending verification and review. |
| `VERIFYING` | Quality gates are being run against the candidate SHA. |
| `PENDING_REVIEW` | Verification evidence exists; work awaits independent review. |
| `REVIEW_APPROVED` | An independent reviewer has approved the work at the exact candidate SHA. |
| `HUMAN_QA` | The human owner is performing manual QA on the reviewed work. |
| `MERGE_AUTHORIZED` | The human owner has explicitly authorized merging the candidate. |
| `MERGED` | The candidate has been merged into its target branch. |
| `PRODUCTION_VERIFIED` | The merged change has been confirmed working in production (or the project's equivalent of production). |
| `FROZEN` | The work, or the system it touched, is now protected from further modification absent new authorization. |

### Alternate states

| State | Meaning |
|-------|---------|
| `BLOCKED` | Progress cannot continue without external input, a decision, or a dependency being resolved. |
| `CORRECTION_REQUIRED` | Review or QA found issues that must be fixed before proceeding; work returns for correction rather than moving forward. |

## Primary transition path

```
IDEA
  → SPECIFIED
  → AUTHORIZED
  → PREFLIGHT
  → IMPLEMENTING
  → IMPLEMENTED
  → VERIFYING
  → PENDING_REVIEW
  → REVIEW_APPROVED
  → HUMAN_QA
  → MERGE_AUTHORIZED
  → MERGED
  → PRODUCTION_VERIFIED
  → FROZEN
```

`BLOCKED` and `CORRECTION_REQUIRED` can be entered from most states in the
main path and return to an appropriate earlier state once resolved (e.g.
`CORRECTION_REQUIRED` typically returns to `IMPLEMENTING`).

## Transitions requiring human authority

The human owner must explicitly authorize these transitions — an agent
cannot perform them on its own initiative:

- `SPECIFIED → AUTHORIZED` (granting authorization)
- `REVIEW_APPROVED → HUMAN_QA` entry is a human activity, not agent-driven
- `HUMAN_QA → MERGE_AUTHORIZED` (authorizing merge)
- `MERGED → PRODUCTION_VERIFIED` (confirming production reality, unless a
  deterministic, pre-authorized check performs this)
- `* → FROZEN` (freezing a system or piece of work)
- Any transition that would resume from `BLOCKED` or `CORRECTION_REQUIRED`
  by expanding or reinterpreting the original authorization

## Transitions an agent may perform within active authorization

- `AUTHORIZED → PREFLIGHT`
- `PREFLIGHT → IMPLEMENTING`
- `IMPLEMENTING → IMPLEMENTED`
- `IMPLEMENTED → VERIFYING`
- `VERIFYING → PENDING_REVIEW`
- Entering `BLOCKED` or `CORRECTION_REQUIRED` when the agent detects a
  condition warranting it (this is a report, not a self-serving skip)

`PENDING_REVIEW → REVIEW_APPROVED` is performed by an independent reviewer,
never by the implementing agent itself.

## Status

This document defines the intended state machine. No code currently
enforces these transitions or rejects illegal ones; `.buildrail/state.yml`
is maintained by hand/prompt discipline until BR2 implements the
governance engine.
