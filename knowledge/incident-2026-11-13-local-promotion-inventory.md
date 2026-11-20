# [FOOTBALL] Local promotion checks must include ignored generated files and semantic index state

- Incident ID: FOOTBALL-INC-2026-11-13-01
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-13
- Category: Local runtime promotion verification
- Source files: `scripts/run-local.cjs`, `src/routes/admin/adminReports.router.ts`, `knowledge/test_search_incidents.py`
- Retrieval terms: local promotion ignored generated files tracked inventory candidate SHA Git index raw hash staged semantic stat cache

## Context / symptom

An owner-approved Issue77 four-file Local4500 promotion stopped after its build with
`STOP: unexpected generated delta`. A later read-only verification stopped because the
raw Git index hash differed. The existing standalone dirty checkout was being preserved;
GitHub-backed development stayed in its separate permanent issue worktree.

## Confirmed observations

The helper inventoried tracked `dist/` files only. One explicitly allowlisted/generated
statistics module was absent from that legacy index, although its before-image was backed
up separately. Build completed and both generated target hashes matched the candidate.
The tracked generated delta equaled the tracked subset of the allowlist. Read-only
reconciliation also matched all 63 maintained generated modules to the candidate.

The raw index hash later differed. Captured pre-status had no staged files; current staged
paths were empty, HEAD was unchanged, and unrelated worktree status matched the before-image.
The helper never ran add/reset/clean/stash. Verification must distinguish staged content
from index byte identity.

## Unknowns and hypotheses

The specific internal index field change was not established. Git stat-cache refresh is
consistent with the observations, but is not a confirmed cause. An empty staged diff is
not sufficient when the starting index contained staged work; that case needs an exact
semantic baseline of the staged entries/diff.

## Confirmed cause

The generated-delta predicate compared a tracked-only inventory with an allowlist that
also contained an untracked/ignored generated file. It rejected the intended delta.
The separate raw-index predicate required byte identity rather than staged-content
preservation, and could not alone establish whether staged work changed.

## Impact and artifact state

Source replacement/build had occurred at the first stop; the old listener was still
running. No copy/build was retried during recovery. After approved restart, runtime gate,
four candidate hashes, homepage/login HTTP200 and unauthenticated report302 passed.
Authenticated owner UAT remained pending. No Production, uploads, schema, configuration,
scheduler or registration-data change was performed by this promotion.

## Resolution / invariants

Before writing, back up and hash every exact allowed path, including ignored generated
targets; inventory all generated outputs that the approved build can overwrite. Compare
tracked inventory with the tracked allowlist subset, and independently check every allowed
artifact. Capture staged-content identity separately from mutable raw index metadata.
After any stop, record the actual write/restart phase and reconcile hashes, backups and
process identity read-only before continuing the existing authorized scope. Do not repeat
copy/build/restart merely to clear a verification error, or disable critical-stop hooks.

## Regression checks

The incident retriever includes separate generated-inventory and raw-index-semantic cases
in `knowledge/test_search_incidents.py`. The disposable task helper was corrected only
after actual state reconciliation; retrieval tests do not claim execution coverage of
that private helper or of future staged-index recovery.

## Follow-up / limitations

Runtime source was Issue77 commit `9823319892e756e32b1d819695091a10f430f0d4`.
The original checkout HEAD/remotes and unrelated work stayed preserved. Exact local
before-images and phase/error receipts remain under ignored `.runtime/issue77-local4500-20261113/`.
Owner browser acceptance, GitHub publication/merge and Production release are separate.
