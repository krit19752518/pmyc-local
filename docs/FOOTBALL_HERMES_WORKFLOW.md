# Football: GitHub, Dev and stable Production

This workflow supplements [development](DEVELOPMENT_WORKFLOW.md),
[VPS Dev](FOOTBALL_VPS_DEV.md), the [selective release SOP](../knowledge/manual-selective-deployment-sop.md)
and [Git release standard](../knowledge/git-release-standard.md). It does not
authorize server access, publication, service changes or a deployment.

## Authority and roles

GitHub `krit19752518/pmyc-football` is the source/publication hub. `main` is
reviewed integration source, not an automatic Production deployment. A fresh,
verified inventory of actual Production runtime bytes and behavior defines
stable Production. Checkout HEAD alone cannot establish runtime identity.

`football` authors and tests approved issue work in Dev. `football-release`
runs locally on the owner's computer, reviews candidates and prepares or
executes separately approved release gates. Separate profiles are separate
context/credential stores, not OS isolation. Shared cPanel UID and local UID
access must not be represented as a filesystem jail. Release onboarding does
not provision Production credentials, DB access or standing deployment consent.

Versioned profile instructions are [Dev addendum](hermes/football-workflow-addendum.md)
and [release SOUL](hermes/football-release-soul.md). The
[release config example](hermes/football-release.config.example.yaml) has a
TBD cwd and is not an executable/live configuration. Dedicated provider login
is performed through Hermes auth; never copy OAuth tokens between profiles.

Use one writer per profile and one writer per shared worktree/runtime. A
handoff names the current writer, candidate SHA, evidence paths and owner
acceptance. The receiving agent checks those facts before taking ownership.
Do not infer permission from another agent's prose or a previous approval.

## Baselines and mismatch handling

Before each issue record GitHub base SHA/tree, Dev source SHA/tree, relevant
built artifact hashes, the test endpoint's serving revision and the scoped
working-tree status. Check sanitized origin identity before network actions.
Exclude uploads and private/operational data, preserve unrelated work, and
record which exclusions make a status result partial. Do not claim no ignored
files exist from a normal Git status result.

| Observation | Required disposition |
| --- | --- |
| SHA differs but Git tree is identical | Record content equality; no code rewrite is needed. |
| Clean Dev is behind an approved GitHub base | Propose narrow fetch/fast-forward with ancestry and complete path review; service activation is separate. |
| Dirty/diverged Dev or an untracked collision | Preserve work and reconcile ownership; never reset/clean/stash/force-push. |
| Production behavior missing from GitHub source | Reconcile source on an isolated branch, retain regression tests and review the entire rebuilt artifact delta. |
| GitHub includes accepted unreleased work | Mark pending release; do not normalize Production to main. |
| Approved Dev-only startup/config differs | Record an expected difference; do not copy it to Production. |
| Unknown drift or stale stable evidence | Stop the affected write/release and request scoped discovery. |

PR87 merged on 2026-11-15 as `a57637938bbd20b6dc00f4a6ddfcbda35ff93391`.
Its tree equals setup head `1fc058bb3abea41f3b10b54941fb265e701d1e38`.
These are dated setup facts, not a claim about current main, Dev or Production.
Always verify the approved current source base before a new task. A code-hub
merge does not switch a running Dev checkout.

## Checkpoints: issue to release

| Checkpoint | Evidence required before advancing |
| --- | --- |
| Intake | Issue/latest owner scope, acceptance criteria, exclusions, effects and current baseline comparison. |
| Task isolation | Approved GitHub base SHA, dedicated branch/worktree, preservation of existing work and writer ownership. |
| Implementation | Entire changed-path scope, source changes and regression coverage for affected stable behavior. |
| Test/build | Actual focused/full results and build where applicable; exact environment/SHA, reviewed filesystem/DB/network effects. |
| Dev activation | Candidate source/artifact identity, verified Dev DB/config boundary, approved activation and restart mechanism. |
| Owner Dev acceptance | Authenticated endpoint, serving revision and business-flow results; login/session/audit effects are explicit. |
| Publication | Exact staged paths, commit SHA, separate push/PR and merge scopes. Read back the merge result. |
| Post-merge | Compare merged tree to accepted candidate. Changed content invalidates affected evidence and requires retesting. |
| Release preparation | Fresh actual Production inventory, preserved stable behavior, complete issue matrix, exact artifact manifest and startup safety. |
| Gate A | Exact approved stage and fresh backup paths/hashes/metadata; no promotion or restart. |
| Gate B | Recheck stage/live/backup/startup identities, fresh schema/type/index/backfill and other startup effects; separately approved promotion/restart/verification/conditional rollback. |
| Post-release | Final runtime hashes, health, authenticated UI and authorized DB checks; differences investigated without attributing causes from counts alone. |
| Closure | Acceptance criteria accounted for, stable release evidence published with approval, and owner disposition of unverified checks. |

Production read-only is a separate access scope. PostgreSQL SOP checks run on
the DB Server through an approved non-root channel, never psql on cPanel.
A local DB-server connection does not prove App-Server-to-DB TLS. Do not
open credentials or start the app to invent an identity-check shortcut.

## Tests and service effects

Review relevant config/setup/tests/initializers before execution. Manifest
presence is not native execution, transitive integrity, build/test or UI proof.
Record the actual runtime/wrapper and test environment. Release candidate
verification runs in the isolated Dev candidate worktree according to the SOP
(or controlled CI when explicitly accepted); Local verification applies only to
explicit Owner-requested Local recovery. App-Server absolute wrappers cannot be
assumed to work on another machine. New worktrees do not inherit node_modules.

Inspect shared-host resource limits before heavy tasks. A `fork: Resource
temporarily unavailable` tool warning has an unknown cause until diagnosed;
do not change limits, kill processes or restart a service to make it disappear.
Read-only resource summaries are not proof of cPanel/LVE CPU/I/O/process headroom.

Explicitly scope synthetic DB writes and cleanup: IDs, tables, expected counts,
session/audit effects and exact recovery. A rollback on one connection cannot
undo arbitrary multi-connection HTTP flows. No real personal/uploaded data is
copied as a test fixture. Login can itself write sessions/audit records.

The Dev service uses only `scripts/node-vps-dev.sh dev-start.cjs`, the verified
workspace/DB and protected external settings. Do not invoke generic Production
startup. Service control and restart paths must be verified before use.

## Approval boundaries

An issue approval may cover a reviewed set of implementation/test actions;
do not repeatedly ask for the same unchanged scope. Tool approvals remain in
force. Record discovery, branch/worktree, dependency setup, build/test/native
execution, DB reads, DB writes/cleanup, authentication effects, Dev activation/
restart, Production reads, Gate A, Gate B, commit, push/PR, merge and local
integration/evidence writes as distinct capabilities. None is implied by another.

Keep scanner/manual approvals. If a request expires or is denied, reconcile
the effects and obtain renewed consent before retrying that outcome. Do not
rephrase a blocked command to evade a guard. A later successful approval is
not proof the cause of an earlier timeout was repaired.

## Release, rollback and evidence

Deploy only exact approved built artifacts, never the whole setup branch,
Dev config/startup or dist directory. No broad sync, deploy script, Production
install/build or Production Git update is implied. Atomic rename is per-file,
not a multi-file transaction. Startup can write DDL/backfill/other data; require
the SOP's schema and zero-pending predicates plus all other relevant startup
safety checks before restart. Artifact rollback does not roll back DB writes.

Rehearse stage/promote/restore and hash-mismatch abort in a sandbox first.
No new feature is invented to manufacture a release. Same-bytes Production
rehearsal still needs both gates and startup safety; it proves only the path
actually exercised, not future changed-code compatibility or a restore that
was never run. Do not intentionally break Production to exercise rollback.

Use [the evidence template](templates/football-workflow-evidence.example.json).
Keep source SHA, GitHub SHA, server checkout SHA and artifact SHA-256 separate.
Unknown/TBD values block the relevant gate; never label a template deployable.
Store approved manifests, handoffs and release summaries in GitHub. Stable
records describe actual verified runtime; mixed selective runtimes use per-file
provenance rather than a false whole-commit stable tag. Keep secrets, cookies,
sessions, uploads, private settings, DB snapshots and personal data out of Git.

Local Agent Brain remains the knowledge authority at `/home/krit/agent-brain`.
The SSH Dev agent cannot access that local path through remote file tools.
Use an approved local integration or an owner-supplied non-secret extract.
Hermes memory stores short pointers, not full profiles or raw evidence.
Ledger writes need their scoped authorization and schema validation.

Outcome is `verified`, `partially_verified`, `failed` or `blocked`, qualified by
scope. HTTP200 alone is not authenticated UI proof. Missing evidence stays
unverified; do not begin another issue until owner acceptance when rehearsing
the end-to-end workflow.
