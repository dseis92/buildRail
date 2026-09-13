# Example: Next.js + Supabase (planned)

**Status: description only. No example application exists yet (BR0).**

## What this example will demonstrate

A full-stack TypeScript application (Next.js frontend/backend, Supabase for
database and auth) governed by BuildRail, showing:

- Protected-system declarations for database migrations and auth logic
  (`FROZEN`/`LOCKED`, per `docs/PROTECTED_SYSTEMS.md`)
- A realistic quality gate setup (tests, typecheck, lint, build all
  `required: true`)
- A full lifecycle run for at least one feature, from `IDEA` through
  `PRODUCTION_VERIFIED`

Building this out is expected as part of BR8 (End-to-End Dogfood).
