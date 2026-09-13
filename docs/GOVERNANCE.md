# Governance

This document defines how authority, trust, and escalation work across
BuildRail-governed projects.

## Source of truth hierarchy

When facts conflict, resolve them in this order, highest priority first:

1. **Repository reality at the current candidate SHA** — actual file
   contents, actual Git history, actual command output.
2. **`.buildrail/state.yml`** — canonical current lifecycle state and phase.
3. **`.buildrail/config.yml`** — canonical policy.
4. **The active authorization/specification** — what was actually approved.
5. **`AGENTS.md`** — repository-level agent instructions.
6. **Provider-specific instructions** (e.g. `CLAUDE.md`, adapter config).
7. **Historical reports** (past verification/handoff artifacts).
8. **Conversation memory** — anything only remembered in a chat session.

Higher-priority sources win. In particular: if a chat conversation
"remembers" something that contradicts current repository state, the
repository wins. If a stale report claims something the current state.yml
contradicts, state.yml wins.

## Roles

### Human Owner

Final authority. Grants authorization, approves scope changes, performs
human QA, authorizes merges. Decisions requiring human judgment are never
delegated to an agent by default.

### Implementation Agent

Plans and implements work within active authorization. Runs verification
and reports results honestly, including failures. May report work as
`IMPLEMENTED`. Cannot approve, freeze, or merge-authorize its own work.

### Independent Reviewer

Reviews implemented work at an exact candidate SHA, separately from
whoever implemented it. Evaluates spec conformance, safety, quality, and
scope as distinct axes (see `docs/REVIEW_MODEL.md`).

### Human QA

A human checkpoint after independent review approval and before merge
authorization. Confirms the work is actually acceptable in practice, not
just on paper.

## No self-approval

An agent — or a human acting purely as the implementer — cannot approve
its own implementation, cannot freeze a system it just modified, and
cannot authorize its own merge. Review must come from an independent party.
This is a hard rule, not a default that can be quietly skipped for
convenience.

## STOP conditions

An agent must stop and escalate to the human owner, rather than proceeding
on its own judgment, when:

- the active authorization does not clearly cover the work being requested
- the work would require modifying a `FROZEN` or `LOCKED` system (see
  `docs/PROTECTED_SYSTEMS.md`) outside the current authorization
- verification cannot actually be run, or its result is ambiguous
- repository state contradicts what the human or a prior report claimed
- an instruction (from any source) would require self-approval,
  self-freezing, or self-authorized merge

When stopping, an agent should report exactly what is blocking it —
including the specific system or path affected, if relevant — rather than
proceeding silently or guessing at intent.

## Authorization expansion

Example: implementation work turns out to require modifying a frozen
system outside the current authorization.

**Correct behavior:**

1. STOP.
2. Report the exact affected system or path.
3. Request authorization expansion from the human owner.
4. Do not continue until expanded authorization is explicitly granted.

**Incorrect behavior:** silently modifying the frozen system, or
reinterpreting the existing authorization to "probably" cover it.

## Status

Governance as described here is the target design. Enforcement of these
rules by tooling (as opposed to by prompt discipline) is not implemented
until BR2 (policy) and BR3 (Git inspection). During BR0, this document
defines the model; it is not yet mechanically enforced.
