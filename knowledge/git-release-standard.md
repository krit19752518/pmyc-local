# [FOOTBALL] Git and production release standard

- Status: active operating standard
- Last reviewed: 2026-11-02
- Scope: source Git history management, exact-file Manual Selective Production Deployment, separately approved Git checkout/fast-forward deployment, and release records
- Authority: exact-file runtime deployment follows [`manual-selective-deployment-sop.md`](manual-selective-deployment-sop.md). A Production Git checkout/fast-forward update is a separate workflow and requires explicit approval for that scope. This document defines how Git and runtime release identities are identified and recorded.

## Keep these versions separate

Use the full 40-character commit SHA in records. A short SHA is for discussion only.

| Name | Meaning | Evidence |
|---|---|---|
| Source commit SHA | Reviewed candidate commit associated with the release; a reviewed Dev candidate commit can identify a selective release | Candidate `git rev-parse`, tests/build in Dev worktree, manifest and changed-path review |
| Remote Git SHA | Commit currently published on `origin/main`; publication is not required for a selective runtime release | `git ls-remote origin refs/heads/main` or a deliberate fetch, only when relevant/approved |
| App Server checkout SHA | Commit at `HEAD` in the App Server Git checkout; it may remain unchanged during a selective release | Read-only `git rev-parse HEAD` on the App Server |
| Production runtime artifact SHA-256 | Checksum of each exact file Passenger loads; it is not a Git commit SHA and does not imply that the whole runtime matches the candidate commit | Read-only checksum of the actual Production runtime path before and after release |
| Verified release evidence | Candidate identity plus exact deployed artifact hashes, restart and required health/DB/UI checks | Release ledger entry with evidence and timestamps |

Never label a SHA “deployed” merely because it was pushed, is an ancestor of the checkout, or appears in a deployment plan. If runtime identity was not checked, record it as **unverified**.

## Release workflow

1. **Establish candidate state.** From the Dev VPS candidate worktree (or explicit Local recovery checkout if Owner-directed) record the candidate branch/full SHA and relevant worktree state; preserve all unrelated worktrees and dirty checkouts. Exclude `football/uploads/` from every inspection and operation. Do not alter unrelated work.
2. **Define and verify exact scope.** List approved behavior, source paths, built artifacts, Production target paths, and SHA-256 for each artifact. Run required tests/build in the isolated Dev candidate worktree. Review changed paths from repository root; generated `football/dist/` must come from the project build.
3. **Commit/publish conditionally.** A reviewed candidate commit and manifest may identify a selective release without a GitHub push. Stage/commit only reviewed paths when needed and approved. `git push` is not a step of Manual Selective Deployment; use it only under separate explicit Git-history approval.
4. **Inspect server identities read-only.** Record App Server branch, full checkout SHA, tracked state, and untracked count without opening unrelated data. Independently inspect the actual Passenger runtime paths and artifact hashes; never infer runtime identity from Git `HEAD`. Run PostgreSQL checks only on the DB Server when required.
5. **Choose one workflow.** For exact-file runtime deployment, follow [`manual-selective-deployment-sop.md`](manual-selective-deployment-sop.md): preserve unrelated Production runtime files and Git/runtime drift, use Gate A for stage/backup and Gate B for promotion/restart/verification/authorized rollback. No Git push, Production fetch/merge, checkout update, Production `npm install`, Production build, whole-directory synchronization, or deploy script is implied.
6. **Separate Git checkout/fast-forward deployment.** Only with separate explicit approval, verify ancestry and the complete repository-root changed-path range; preserve unrelated server state and stop on collisions or unapproved paths. Fast-forward only when the entire range is approved. Any install/build/restart must be in that approval's scope. Never use reset, force push, broad copy, or deploy script to make drift disappear.
7. **Verify and close.** Record per-artifact Production SHA-256, restart, HTTP and authenticated UI results, timestamped read-only DB pre/post counts and schema/backfill evidence. HTTP 200 alone does not prove authenticated behavior or artifact identity. Append an accurate ledger entry; do not revise historical evidence.

## Release ledger format

Maintain a single current Football release ledger in `football/knowledge/production-release-ledger.md`. Each release entry records:

- release identifier and purpose; workflow type (selective runtime or separately approved checkout update);
- candidate commit/manifest, exact allowlist and Production target paths;
- candidate branch/worktree and test/build/syntax/diff-check results; remote SHA only if publication was part of the approved scope;
- App Server checkout SHA before/after and branch, even when unchanged; never require a checkout update for selective deployment;
- candidate, stage, live target, and fresh backup SHA-256 values and paths;
- Gate A and Gate B approval scope; startup artifact hashes and Passenger restart evidence/timestamps;
- HTTP and authenticated UI results, including unavailable/unverified checks;
- timestamped read-only DB pre/post counts, schema/type/index checks, and backfill result, collected on the DB Server;
- exact-path rollback evidence when used;
- outcome: `verified`, `partially verified`, `failed`, or `blocked`, with unresolved evidence.

Do not store credentials, personal data, or contents/listings from `football/uploads/` in the ledger.

## Current evidence

See [`production-release-ledger.md`](production-release-ledger.md) for the dated reconciliation snapshot and subsequent release entries. The ledger is the current record; this standard describes how to maintain it.
