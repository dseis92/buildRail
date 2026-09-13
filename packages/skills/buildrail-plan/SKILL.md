---
name: buildrail-plan
description: Turn an idea into a reviewable BuildRail specification (goal, scope, out-of-scope, acceptance criteria) before requesting authorization.
---

# BuildRail Plan

**STATUS: DESIGN DRAFT — NOT YET BACKED BY THE BUILDRAIL CLI.**

## When to use this skill

Use this when the human owner has an idea they want built, and it needs to
become a concrete specification before anyone is authorized to implement
it.

## What this skill does

1. Read `.buildrail/state.yml` and `.buildrail/config.yml` to understand
   current lifecycle state and project policy before proposing anything.
2. Turn the idea into a specification with, at minimum: a goal, an
   in-scope list, an explicit out-of-scope list, and acceptance criteria.
3. Present the specification to the human owner for review. Do not treat a
   plan as authorized just because it was written — authorization is a
   separate, explicit human step (see `docs/concepts/authorization.md`).
4. Stop after presenting the plan. Do not begin implementation.

## What this skill does not do

- It does not grant authorization. Only the human owner can do that.
- It does not begin implementation, preflight, or verification.

## Boundaries

If the idea conflicts with a `FROZEN` or `LOCKED` protected system, or with
existing accepted functionality, say so explicitly in the plan rather than
silently working around it. See `docs/GOVERNANCE.md` for STOP conditions.
