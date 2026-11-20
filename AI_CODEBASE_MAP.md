# Football codebase map

Use this map as the entry point for `grit-solution/football` (`krit19752518/pmyc-football`). Current project rules are in [`AGENTS.md`](AGENTS.md), the new-issue workflow is in [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md), the Dev VPS environment is documented in [`docs/FOOTBALL_VPS_DEV.md`](docs/FOOTBALL_VPS_DEV.md), and curated Football knowledge is indexed in [`knowledge/README.md`](knowledge/README.md).

## Project and issue tracker

Resolve bare issue numbers from the current project directory before using GitHub. The canonical mapping is [`knowledge/project-identity.json`](knowledge/project-identity.json).

- Project key: `grit-solution/football`.
- GitHub code hub and issues: **[`krit19752518/pmyc-football`](https://github.com/krit19752518/pmyc-football)**. In this project, `#55` means that repository's issue55.
- Primary implementation root: **Dev VPS** `/home/zbpzpszw/football-dev/workspace` (use isolated worktrees such as `.runtime/issueNN-topic`).
- Local recovery and historical checkouts (read-only/recovery unless Owner explicitly requests Local work): `/home/krit/my-office/grit-solution/football` (standalone-local, no remote), `/home/krit/my-office/pmyc-football`, and `/home/krit/my-office/pmyc-football-work/issue72`. Do not start new issues on Local.
- Production checkout: `/home/zbpzpszw/football_app` (separate release gates; never infer issue tracker from parent monorepo).
- Use an explicit repository supplied by the user when present. Otherwise use this mapping without asking again, then verify the issue's title/body before changing it.

## Core paths

| Area | Canonical location | Notes |
|---|---|---|
| Application | `src/` | TypeScript source of truth. |
| Generated runtime | `dist/` | Build output from `src/`; tracked for production deployment. |
| Tests | `tests/` | Jest suite; select the narrowest matching test first. |
| Database access | `src/db/`, `src/models/` | Inspect only for tasks involving persistence; schema changes require explicit approval. |
| HTTP routes | `src/routes/` | Admin, team, API, and public route groups. |
| Shared UI/layout | `src/adminLayout.ts`, `src/teamLayout.ts`, `src/layout.ts` | Check route-specific renderers and shared styles before editing. |
| Curated knowledge | `knowledge/` | Football-only operating rules, verified SOP notes, and incident learnings. |

## Common commands

Run inside the selected Dev VPS candidate worktree:

```sh
npm test
npm run build
```

`npm run build` runs TypeScript compilation. Do not edit `dist/` manually; rebuild it from source when source changes require deployment output.

## Navigation hints

- Admin pages and team/player administration: `src/routes/admin/adminPortal.router.ts`.
- Admin reports: `src/routes/admin/adminReports.router.ts`.
- Team roster, official, and registration workflows: `src/routes/team/teamRoster.router.ts`.
- API endpoints: `src/routes/api/api.router.ts`.
- Find matching regression coverage under `tests/` before changing behavior.
- Deployment and production safety rules are in [`knowledge/manual-selective-deployment-sop.md`](knowledge/manual-selective-deployment-sop.md) and [`knowledge/git-release-standard.md`](knowledge/git-release-standard.md); review the current Football SOP before any deployment task.

## Search boundaries

- Limit ordinary code searches to `src/`, `tests/`, and relevant project documentation.
- Do not scan generated output or static public assets unless directly relevant.
- `uploads/` is out of scope: do not read, list, copy, or modify it.
- Do not inspect credential/config contents or runtime/session stores to build project knowledge.
