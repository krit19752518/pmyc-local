# [FOOTBALL] Knowledge ownership and scope

- Status: verified
- Last verified: 2026-10-16
- Source files: `../AGENTS.md`, `../AI_CODEBASE_MAP.md`, `../../AI_CODEBASE_MAP.md`, `../../backend/src/services/memory.service.ts`

## Current Local boundary (2026-11-09)

Football now has a standalone Local Git root at `/home/krit/my-office/grit-solution/football`, with no remote. Production retains its existing parent checkout. See [`local-standalone-git.md`](local-standalone-git.md). The monorepo description below records the original knowledge-management context; it does not select the current Local Git root.

## Context

Football is one application inside a multi-project repository. The root Hermes Memory Sync Engine generates shared knowledge documents from project memory rules, while Football code, tests, and operations have project-specific details. Hermes/Chainlit session memory serves a different purpose from reviewed engineering knowledge.

## Resolution / invariants

1. Keep Football-only operational rules and reusable learnings under `football/`; use root knowledge only for rules that genuinely apply across projects.
2. Treat `football/src/` and `football/tests/` as behavioral authority. Project maps and knowledge explain navigation and verified decisions but do not override current code or tests.
3. Treat generated `football/dist/` as deployable build output, not an independent source of truth.
4. Do not write into global generated `AGENTS.md` or `PROJECT_RULES.md` by hand. Project-aware Memory Sync Engine changes are a separate future task; until then, maintain this repository-local Football knowledge area.
5. Do not treat chat transcripts, model context, or Chainlit runtime state as a verified knowledge source without review and promotion into a dated entry.

## Project-directory and issue identity

Verified2026-11-09: this `football/` directory maps to project key `grit-solution/football` and GitHub issue tracker `krit19752518/pmyc-football`. The canonical machine-readable record is [`project-identity.json`](project-identity.json); the working entry point is [`../AI_CODEBASE_MAP.md`](../AI_CODEBASE_MAP.md).

For an unqualified issue number, resolve the current project's mapping first. The parent source repository's remote (`krit19752518/gritsolution` at verification time) is a different identity and must not be used as the Football issue default. Verify the selected issue's project/scope before mutation. An explicit user-specified repository overrides the default. Do not require the user to repeat an already recorded project/repository association.

## Limitations

This establishes repository-level separation. It does not add a Football workspace to Chainlit, change Hermes indexing, alter memory database schemas, or modify the Memory Sync Engine UI. Those require separate design and approval.
