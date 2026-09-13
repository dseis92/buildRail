# Vibe Coder Workflow (target v0.1 experience)

**Status: none of this is implemented yet.** This describes the intended
experience for BuildRail's primary audience — nontechnical or
semi-technical builders working mostly through natural-language direction
to a coding agent.

## The idea

You shouldn't have to personally track what your coding agent has changed,
what it's allowed to change, whether it actually tested anything, or
whether the thing it just told you is true. BuildRail is meant to hold that
structure for you, so you can focus on describing what you want built.

## What this looks like once implemented

- You describe a feature or fix in plain language; `buildrail new` turns
  it into a specification you can read and approve.
- You explicitly authorize work before an agent starts — a deliberate,
  visible step, not something that happens automatically.
- Parts of your app you don't want touched (e.g. payments, auth) can be
  marked protected, so an agent can't quietly change them.
- Before anything merges, an independent check (not the same agent that
  built it) reviews the work, and you do a final human check yourself.
- If an agent gets stuck or something's unclear, it's expected to stop and
  tell you exactly what it needs, rather than guessing.

## Status

This workflow is a design target for v0.1 (BR0–BR8). BuildRail is
currently in BR0 — this document exists to guide development, not to
describe something you can use yet.
