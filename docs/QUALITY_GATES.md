# Quality Gates

Quality gates are how BuildRail ties claims of correctness to verifiable
facts rather than agent self-report. This document describes the intended
model. **Verification execution is not implemented as of BR0** (planned
for BR4).

## Verification must be tied to specifics

A valid verification result is always bound to:

- the repository
- the branch
- the exact candidate SHA
- the command that was run
- the timestamp it was run at
- the actual result (pass, fail, or error — not an inferred or assumed
  outcome)

A result missing any of these is not usable evidence.

## Staleness

If the code changes after a verification result was produced — even a
single-character change — that previous verification becomes **STALE**.
Stale results must not be treated as still valid, and must not be silently
reused to justify moving a work item forward. Verification must be re-run
against the new candidate SHA.

**Never reuse test results from another SHA.** This applies even if the
change seems trivial or unrelated to what was tested — the binding is to
the exact commit, not to a judgment call about what "shouldn't matter."

## Categories of verification

| Category | Meaning |
|----------|---------|
| `AUTOMATED_TEST` | An automated test suite was executed and produced a pass/fail result. |
| `TYPECHECK` | A type-checking command was executed and produced a pass/fail result. |
| `LINT` | A lint command was executed and produced a pass/fail (or pass/warn/fail) result. |
| `BUILD` | A build command was executed and either succeeded or failed. |
| `MANUAL_INSPECTION` | A person or agent read the code/output directly and formed a judgment; not automated, and should be labeled as such. |
| `HUMAN_QA` | A human exercised the actual behavior (e.g. used the running application) and confirmed or rejected it. |
| `NOT_CHECKED` | No verification of this kind was performed. This is a legitimate, honest status — it must be used instead of omitting the category or implying it passed. |

Distinguishing these matters because they carry very different evidentiary
weight. Claiming `AUTOMATED_TEST` when what actually happened was
`MANUAL_INSPECTION` is a false claim, even if the underlying judgment
happens to be correct.

## Quality gate configuration

`.buildrail/config.yml` declares each gate's command and whether it is
currently `required`. During BR0, no gates are required, because there is
no executable product code yet:

```yaml
quality_gates:
  tests:
    command: npm test
    required: false
    note: "Required beginning when executable product code exists."
```

As implementation phases introduce real code, these `required` flags are
expected to flip to `true` — tests become required once there is code to
test, typecheck once TypeScript exists, lint once lint config exists, build
once there's a real build target.

## Status

No quality gate is currently executed automatically by any BuildRail
tooling — `npm test`, `npm run typecheck`, `npm run lint`, and `npm run
build` at the repository root currently only print a placeholder message
(see root `package.json`) because there is no implementation to check yet.
Candidate-bound verification and evidence reports are planned for BR4.
