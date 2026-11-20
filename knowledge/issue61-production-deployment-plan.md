# Issue61 — Draft Production deployment plan

- Status: **draft; no Production staging, promotion or restart approved/executed**.
- Date: 2026-11-10.
- Issue: [#61](https://github.com/krit19752518/pmyc-football/issues/61).
- User acceptance: user reports Local testing passed in the current conversation.
- Workflow: Manual Selective Deployment, with separate Gate A and Gate B.
- Authority: [selective deployment SOP](manual-selective-deployment-sop.md), [Git/release standard](git-release-standard.md), current Football AGENTS.md.
- Release skill: `/home/krit/.codex/skills/release-coordinator/SKILL.md`.

## Purpose and verified Local evidence

Append the current team to the athlete popup header; show the approved red bold staff guidance; display evidence-based comparison details; exclude titles from personal-name analysis. Preserve staff decisions and source/reset bindings. Re-evaluate retained V5 names without a paid OCR call; do not rewrite stored results or delete cache.

Local build passed; 900 tests in59 suites passed; incident retrieval29 tests passed; generated JavaScript syntax and `git diff --check` passed. User Local acceptance now passed. Automated browser access was unavailable during implementation; user acceptance is recorded separately from agent verification. No source change has been made since that tested build.

## Candidate identity — not a release authorization

- Standalone Local root: `/home/krit/my-office/grit-solution/football`.
- Branch: `main`; current base HEAD: `33dca15159cf3368bcf34b08f93374a4894ba07a`.
- Release candidate commit: **not created yet**. Existing issue61 source/runtime/tests are uncommitted. Preserve unrelated pre-existing issue60 knowledge/ledger edits.
- No Local Git remote/upstream is configured. No remote publication, Production Git checkout update, fetch/merge, install, server build, deployment script or broad synchronization is part of this proposal.
- Before Gate A, freeze a reviewed Local source commit using only the agreed paths, prepare an isolated sparse worktree without operational data, build/test the exact candidate, and require its eight artifact hashes to equal this draft. If bytes differ, reconcile and submit a revised manifest.
- The hashes below describe the current Local artifacts only. **Fresh Production live hashes/metadata, candidate SHA, backup identities and startup/DB evidence remain unverified.** Historical ledger evidence is not substituted for current preflight.

## Exact runtime allowlist

Production root: `/home/zbpzpszw/football_app/football/`. Each relative path below maps to that exact root. Deploy runtime artifacts only; no source/tests/knowledge/configuration/dependencies are sent.

| Relative artifact / target | Bytes | Candidate SHA-256 |
|---|---:|---|
| `dist/routes/admin/adminPlayerVerification.router.js` | 28203 | `ff21eef16c88ea5d407722670d5c2d1275ebe9c616d71d3708e88204c0ebb7c2` |
| `dist/services/playerOcr.name.js` | 5312 | `7d8d907e0c5cb58b1dd1c24e94d0ef283b978d7556bde982fa7fe006b9a0fdec` |
| `dist/services/playerOcr.parser.js` | 14107 | `34edeb779dcecf7f16d0e659ad38c170a63d678d89602ac030684d18a12a7b86` |
| `dist/services/playerOcr.provider.js` | 11806 | `086965bec780d604cc2d37bbca2cfa4e04928e2565289d25f6bb48ddb572b3b6` |
| `dist/services/playerOcr.types.js` | 1805 | `9eccc7d95842c019ccefa41e793cc752c74e6aa90f10afddda2990c665b3043f` |
| `dist/services/playerVerification.service.js` | 16992 | `0dd70b5dd157a8aaff23c40999ee543ce5779e17c91abff2d14eec2b4c3e9b8b` |
| `dist/services/playerVerification.details.js` | 13942 | `91f9ce2d44e9297066a0a7b60f36e23bf9150313a8ae4b5afba3df0ef603ec36` |
| `dist/views/playerVerification.js` | 48347 | `b1f62d98e441d6fb4120b235d8072b69b5b72ef1a47542b4a39550c87e6382a7` |

Corresponding source paths are the same relative paths under `src/`, with `.ts` extensions. `dist/services/playerVerification.details.js` is new relative to Local HEAD; confirm it is absent on Production. If present, stop to reconcile its provenance rather than overwrite it as a new file.

## Preparation and read-only Production preflight

1. Review the exact candidate source/test/knowledge path list; preserve unrelated Local work. Record full source commit and per-artifact hashes separately from Production checkout HEAD. Verify runtime preservation contracts and the complete eight-module delta, including the issue60 upload-root fallback.
2. Inspect only the exact Production runtime targets and startup/control paths: live SHA/size/owner/mode, Passenger entry/root, server branch/HEAD and exclusion-safe tracked-state summary. Confirm every pre-existing behavior in those targets is represented by the candidate. Preserve unrelated runtime drift.
3. Re-trace the actual Passenger startup call graph and import-time effects, pinning `dist/app.js`, `dist/server.js`, `dist/adminAuth.js`, `dist/db/initTables.js` and relevant control artifacts. Compare actual Production bytes, not only Local source. Do not assume restart is data-neutral.
4. On the DB Server only, perform timestamped READ ONLY schema/type/index checks, relevant aggregate counts, and every startup backfill predicate. Require all required schema present and zero pending backfills. Check verification jobs/cache leases are idle before promotion/restart; if busy, wait/recheck read-only rather than modifying jobs or killing active OCR work.
5. Verify disk space, exact target directories, permissions, release-specific path collisions and startup safety. No uploads inspection, real-document OCR, cache clearing, schema/data write, bootstrap, migration or configuration change is authorized by this plan.
6. Prepare current machine-readable action plans/cards and validate them before consequential actions. Drafts with unverified evidence must not have a `proceed` decision.

## Gate A — stage and fresh backups only

After all preflight evidence is complete, present an approval card naming the exact eight SHA-256 values and fully resolved target/stage/backup paths. Use a new release ID incorporating the candidate SHA and timestamp; do not reuse an earlier stage/backup.

For each existing target `T`:

- Stage: `T.stage-<release-id>`.
- Fresh backup: `T.backup-<release-id>`; SHA/metadata must match the immediately pre-copy live file.

For the new helper, record verified live absence; stage the helper with the same pattern. No fictitious backup exists for an absent file. Define the exact rollback quarantine path `T.rollback-new-<release-id>` and verify it is unused.

Only after explicit Gate A approval: transfer the eight built artifacts to stage and create/verify fresh backups of the seven existing targets. Verify stage hashes, sizes, ownership and mode against the approved manifest. Stop on any failure with live targets untouched. Gate A does not permit promotion or restart.

## Gate B — promote, restart, verify and bounded rollback

After Gate A passes, present the actual stage/backup/live evidence, fresh startup/DB/idle checks, and the exact rollback scope for separate explicit Gate B approval.

1. Immediately recheck candidate identity, every live/stage/backup SHA and metadata, helper absence, unchanged startup hashes, schema/backfill/idle state and Passenger marker path. Any change stops promotion.
2. Promote only the eight allowlisted files using same-filesystem atomic replacement per file. This is not an atomic eight-file transaction. Install the new helper before files importing it and complete all replacements before restart. Verify each live artifact. Do not claim a consistent release if only part of the set is promoted.
3. Restart only Football Passenger using `/home/zbpzpszw/public_html/pmycfootball.in.th/tmp/restart.txt`, after repeating startup safety checks. OCR runs inside the Passenger request process (`schedule` in the verification router); no separate worker service is introduced or restarted. Check fresh process identity and content-free revision/readiness evidence where available. Do not extend expired diagnostic logging or enable captures for this release.
4. Verify HTTPS homepage, Admin and SAT login endpoints, authorization boundaries, live artifact hashes, bounded startup-error indicators, and DB READ ONLY post-checks. Record timing/count differences without inferring causation from counts alone.
5. Using an authorized session/user test, check current team and fallback after switching athletes, long/mobile header, red bold guidance, detailed field messages, no title-based rejection, retained V5 values, and explicit staff choice controls. Keep smoke tests read-only: no saving status, deleting athletes, resetting results, or paid AI retry. Opening a previously unverified athlete may submit OCR under the existing UI flow, so use an already-completed cached result; if a no-submission path cannot be established, stop that check and arrange separately authorized user testing.
6. Record agent checks and user acceptance separately. Missing authenticated UI evidence means `partially verified`, not verified. Keep issue61 open until user Production acceptance and an explicit closure request.

## Rollback conditions and limits

Under Gate B authorization, rollback if a target hash/metadata fails after promotion, modules fail to load, startup/service health fails, or affected Admin/SAT behavior has a critical regression. Reconcile a timeout/readiness failure with bounded read-only diagnosis before deciding whether rollback is necessary; do not blindly restart again.

Restore the seven pre-existing artifacts from their exact freshly verified backups as one coherent release set. Restore absence of the new helper by atomically renaming it to the pre-approved unused quarantine path only after verifying its candidate SHA; preserve it as evidence rather than deleting it. Recheck startup safety, restart Passenger, and repeat runtime/HTTP/service checks. Never roll back DB/cache/reviews; this release has no authorized data or schema mutation. A changed/unverified backup or unsafe restart blocks rollback and requires a new decision.

## Hook lock and stop conditions

Any CLI hook lock stops the affected workflow. Record the actual failed operation and inspect its side effects read-only before any resume. Do not edit/remove a lock or bypass approval. A hook-handled resume acknowledgement is followed by a separate user task before consequential work resumes. All failed/ambiguous stage, promotion and restart outcomes must be reconciled; no blind retry.

Stop for unapproved paths, source/runtime drift, hash/ownership/mode changes, active OCR jobs, missing schema, pending backfill, unknown startup writes, failed checks, missing approval, or unavailable verification required for the next gate.

## Evidence to retain

Save the candidate commit, exact eight-file manifest, baseline/stage/backup/live hashes, metadata, timestamps, action-plan validation and gate approvals; append factual outcomes to the Football release ledger and update issue61. Resolve the known central software-ledger schema mismatch for a standalone repo with no remote before requiring such an entry: do not invent a remote SHA or alter the schema without separate authorization.

## Preparation limitations / recovery record

This draft uses verified Local artifacts and user Local acceptance; it does not assert current Production readiness. The long Brain policy read was truncated and classified PARTIAL with no mutation. Recovery used its exact SHA-pinned reader index and500-character slices for the required output/lock policy sections; unseen policy text is not treated as verified. An assumed standalone worker source path did not exist (`rg` exit2); no files were changed by that diagnostic. Source inspection of the existing verification router confirmed request-process scheduling instead. No Production operation was attempted during drafting.
