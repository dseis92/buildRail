# BuildRail v0.1 Specification

This is the primary product specification for BuildRail. It describes the
intended shape of v0.1 across all planned development phases (BR0–BR8).
**Only BR0 is currently authorized.** Everything described here beyond BR0
is a design target, not a completed feature — see `docs/ROADMAP.md` and
`.buildrail/state.yml` for current authorization status.

## 1. Problem

Coding agents can write software quickly, but without external structure
they have no durable memory of what has actually been authorized, what
already works and must not be broken, what is off-limits, whether tests
really ran, or what the Git repository actually contains right now. This
leads to scope creep, silent modification of sensitive systems, optimistic
or fabricated status reports, and handoffs between agents (or between an
agent and a human) that lose critical context.

## 2. Audience

Primarily nontechnical or semi-technical "vibe coders" — people building
real applications largely through natural-language direction to coding
agents such as Claude Code and Codex, who need guardrails they don't have
to invent themselves. Secondarily, technical users who want deterministic,
auditable AI-assisted development processes for their own or their team's
projects.

## 3. Product principles

- Prompts govern behavior; code verifies facts.
- The human project owner is the final authority.
- Repository reality outranks stale prose, memory, or self-report.
- Authorization is explicit, not implied.
- Nothing important is trusted from agent self-report alone when it can
  instead be verified deterministically.

## 4. Human authority model

The human repository owner authorizes work, approves scope changes,
performs human QA, and authorizes merges. No agent — implementation or
reviewer — can substitute for the human owner on these decisions. See
`docs/GOVERNANCE.md`.

## 5. Implementation agent role

An implementation agent (e.g. Claude Code or Codex acting under BuildRail)
may plan, preflight, and implement work that falls within the currently
active authorization. It may report its own work as `IMPLEMENTED`. It may
**not** self-approve, self-freeze, authorize its own merge, claim
unverified testing, modify frozen or locked systems without authorization,
or silently broaden scope.

## 6. Reviewer role

An independent reviewer — a different agent instance, a different tool, or
a human — evaluates implemented work against the active authorization at an
exact candidate SHA. The reviewer did not write the implementation and
cannot approve their own prior work in the same review. See
`docs/REVIEW_MODEL.md`.

## 7. State machine

BuildRail work items move through an explicit lifecycle:

```
IDEA → SPECIFIED → AUTHORIZED → PREFLIGHT → IMPLEMENTING → IMPLEMENTED →
VERIFYING → PENDING_REVIEW → REVIEW_APPROVED → HUMAN_QA →
MERGE_AUTHORIZED → MERGED → PRODUCTION_VERIFIED → FROZEN
```

with alternate states `BLOCKED` and `CORRECTION_REQUIRED`. See
`docs/STATE_MACHINE.md`.

## 8. State vs config distinction

`.buildrail/state.yml` describes current, factual progress: lifecycle
state, development phase, active authorization, candidate SHA, completed
phases. It changes as work progresses and must always reflect reality.

`.buildrail/config.yml` describes policy: what is required, what is
forbidden, which quality gates apply, how protected systems are defined.
It changes only when the project's rules change, not as a side effect of
normal work.

Conflating these two is a common failure mode BuildRail is designed to
avoid — status is not policy, and policy is not status.

## 9. Authorization model

No implementation work proceeds without an active authorization record
(id, type, title, status, specification reference, and who granted it).
Authorizations point at a specification document describing goal, scope,
out-of-scope boundary, and acceptance criteria. See
`docs/concepts/authorization.md`.

## 10. Protected systems

Parts of a codebase can be marked `OPEN`, `GUARDED`, `FROZEN`, or `LOCKED`.
Modifying a `FROZEN` or `LOCKED` system requires authorization that
explicitly names that system. See `docs/PROTECTED_SYSTEMS.md`.

## 11. Quality gates

Quality gates (tests, typecheck, lint, build, and others) are commands with
a required/optional flag. Results are only valid when tied to the specific
candidate SHA they were run against. See `docs/QUALITY_GATES.md`.

## 12. Candidate SHA evidence

Every piece of verification evidence is bound to an exact commit SHA. If
the code changes, prior evidence becomes stale and must not be reused. See
`docs/concepts/candidate-sha.md` and `docs/concepts/evidence.md`.

## 13. Independent review

Review evaluates four separate axes — spec conformance, safety (protected
systems), quality, and scope — against the exact candidate SHA. See
`docs/REVIEW_MODEL.md`.

## 14. Human QA

After independent review approval, a human QA checkpoint is required before
merge authorization. This keeps a human in the loop for judgment that
automated review and gates cannot fully cover.

## 15. Handoffs

When work passes between agents, or between an agent and a human, a
structured handoff artifact records authorization ID, lifecycle state,
branch, candidate SHA, completed work, remaining work, blockers, and the
next authorized action. See `docs/concepts/handoffs.md`.

## 16. Agent adapters

BuildRail Core is provider-neutral. Claude Code and Codex are supported via
thin adapters that translate canonical BuildRail skills into
provider-specific mechanisms (e.g. CLAUDE.md, Claude Code skills/plugins,
Codex AGENTS.md, Codex agent skills). See `docs/ADAPTER_MODEL.md`.

## 17. CLI command vision

Planned v0.1 commands (not yet implemented — see phase table):

- `buildrail init` — initialize BuildRail governance in a repository
- `buildrail status` — report current lifecycle state, phase, and authorization
- `buildrail new` — create a new specification/authorization request
- `buildrail authorize` — grant authorization for a specification
- `buildrail preflight` — validate readiness to begin implementation
- `buildrail verify` — run quality gates and produce candidate-bound evidence
- `buildrail handoff` — produce a structured handoff artifact

## 18. Development phases

| Phase | Name |
|-------|------|
| BR0 | Constitution |
| BR1 | CLI Skeleton |
| BR2 | Governance Engine |
| BR3 | Git Inspection |
| BR4 | Verification |
| BR5 | Agent Skills |
| BR6 | Claude Code Adapter |
| BR7 | Codex Adapter |
| BR8 | End-to-End Dogfood |

See `docs/ROADMAP.md` and `docs/development/` for detail on each phase.

## 19. v0.1 scope

v0.1 is defined as the completion of BR0 through BR8: a working CLI, a
governance engine enforcing the state machine and protected systems, Git
inspection, candidate-bound verification, the full skill set, both Claude
Code and Codex adapters, and a dogfooded end-to-end run governing
BuildRail's own development plus a reference demo application.

## 20. Explicit non-goals

- BuildRail is not a CI platform and does not replace one.
- BuildRail is not an issue tracker.
- BuildRail is not a deployment or hosting service.
- BuildRail does not host or serve an AI model.
- BuildRail does not generate application code itself — coding agents do
  that; BuildRail governs the process around them.
- BuildRail does not lock users into a single agent provider.

## 21. Definition of v0.1 success

v0.1 succeeds if a nontechnical builder can use BuildRail with a supported
coding agent to take a real feature from idea to production-verified merge,
with every step backed by explicit authorization, deterministic Git
evidence, independent review, and human QA — without needing to personally
track repository state, re-explain context after every handoff, or trust
unverified agent self-report.
