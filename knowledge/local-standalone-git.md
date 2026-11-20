# Football standalone Local Git and Production parity

- Verified scope: issue56, 2026-11-09.
- Local root: `/home/krit/my-office/grit-solution/football`.
- Issue tracker: [krit19752518/pmyc-football](https://github.com/krit19752518/pmyc-football/issues/56).
- Source and generated output: `../src/`, `../dist/`; entry point: [`../scripts/run-local.cjs`](../scripts/run-local.cjs).

## Current permanent Local arrangement, 13 November 2026

The owner selected `/home/krit/my-office/pmyc-football` as the GitHub-backed permanent
source repository. Its feature worktree is `/home/krit/my-office/pmyc-football-work/issue72`.
The dirty original repository below remains preserved without remote changes. The old
no-remote account below describes issue56 history, not the new permanent source repo.
Owner-reported PASS explicitly concerns synthetic UAT4573 prepared at `22ddb3f`.
The private UAT controller lives in the feature worktree; the tracked Local launcher
still targets4500 and must not be used to switch/restart that service without approval.
[Reconciliation](issue3-local-governance-20261113.json) separates accepted UAT, the feature-side review and the preserved newer cancellation/menu work.
This governance branch is based directly on GitHub main and imports no feature code or cron entry.

## Historical issue56 boundaries

The Local repository is independent of the legacy parent Git and has no remote. No GitHub repository creation, fetch, push, Production checkout update, deployment or database migration is implied by this arrangement. Production continues using its existing parent checkout and the selective-release SOP.

Use `git rev-parse --show-toplevel` from Football to verify the Local boundary before Git work. Do not infer the issue tracker from a source remote. The project key remains `grit-solution/football`.

The root `.gitignore` allows only selected project code and assets. Runtime settings, OCR keys, uploads, personal documents, dependencies, logs and old release bundles stay outside Git. The only document paths included are the two public roster templates and the specific developer-handoff prototype application referenced by a legacy route. Do not broaden that allowance to sibling document folders.

## Baseline and verification

Source was recovered against all 51 active Production JavaScript modules, rather than copying the stale Production TypeScript or trusting its Git HEAD. Existing typed source was reused where it recreated runtime behavior, and the remaining differences were reconciled in an isolated candidate. Phase2 PHP code, public UI assets and legacy prototype pages were copied from their exact Production code paths. Backup/stage sidecars were excluded.

[`../tests/production-parity.test.ts`](../tests/production-parity.test.ts) preserves all 51 module contracts, including statements, template text, imports and exports. It also compiles strict TypeScript in memory and compares the output with checked-in `dist/`. Build with `npm run build`; never edit generated output manually.

Two intentional configuration differences are bounded by the tests:

1. A development-only skip-init guard prevents the Local launcher from running automatic DDL/account initialization. Production ignores the development flag.
2. The database connection comes from environment configuration; the legacy embedded password fallback was removed from source.

The Local launcher runs the current root's `dist/server.js` at port4500. Private settings and installed PHP belong under `.runtime/`; they are not baseline source. Local business data and demo counts can differ from Production. Do not copy Production DB records or credentials to make pages look identical.

## Recovery

Task-private recovery files are under `.runtime/issue56-recovery/`: the Local-before manifest/copies, Production code snapshot, promoted-file manifest and retired Local code. Preserve them until the user approves any later cleanup. Do not add them to Git or restore entire directories blindly. Review exact code paths and preserve current unrelated work when recovering a feature.

Old Local-only expectations were reconciled with observed Production behavior, including menus, signed category actions, registration without default categories and correction resubmission returning to PENDING with cleared remarks. Runtime contracts prevent altering application behavior merely to make stale tests pass. Parked source remains recoverable for separate feature review.

Browser acceptance, paid OCR accuracy and Production deployment are distinct checks. An HTTP response or a clean Git status alone does not prove them.
