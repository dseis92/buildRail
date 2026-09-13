# Generic Agent Skills Adapter

**Status: placeholder (BR0). No implementation timeline assigned yet.**

## Intended purpose

A minimal, provider-agnostic packaging of BuildRail's canonical skills
(`packages/skills/`) for any coding agent tool that can consume plain
Agent Skills, without needing a dedicated adapter like
`adapters/claude-code/` or `adapters/codex/`.

## What this adapter does not do

It does not implement governance logic, and it does not assume any
specific tool's conventions beyond the generic Agent Skills format.

## Contents

- [`templates/`](templates/) — placeholder for future generic skill
  packaging
