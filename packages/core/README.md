# @buildrail/core

BuildRail's provider-neutral governance engine: config/state schemas,
lifecycle rules, policy (protected systems, authorization), Git inspection,
and verification.

## Status

**BR0 — no functional implementation.** This package currently contains:

- Draft JSON Schemas in [`schemas/`](schemas/) for config, state,
  authorization, verification reports, and handoffs
- Placeholder source directories in [`src/`](src/) with no logic

See `docs/ARCHITECTURE.md` and `docs/ROADMAP.md` at the repository root for
the intended design and phased implementation plan (BR2–BR4 build out this
package's actual functionality).

## Provider neutrality

This package must never depend on or assume a specific coding agent
provider (e.g. Claude Code or Codex). See `docs/ADAPTER_MODEL.md`.
