# Issue62 — Draft Production deployment plan

> Current status: two-file Production deployment completed after explicit Gate A/B approvals on2026-11-10. User subsequently reported Production testing passed and requested closure; issue62 closed as completed at2026-11-10T07:34:17Z. See the [separate user acceptance record](../release/issue62-73f6655-20261110T071408Z/production-acceptance.json) and [historical release result](../release/issue62-73f6655-20261110T071408Z/result.json); agent browser/scan limitations remain recorded as originally observed. The proposal below is retained as planning history.

- Status: draft only. User Local acceptance passed; Production staging/promotion/restart not approved or performed for issue62.
- Date: 2026-11-10.
- Issue: [#62](https://github.com/krit19752518/pmyc-football/issues/62).
- Workflow: Manual Selective Deployment with separate explicit Gate A and Gate B.
- Procedure: [selective deployment SOP](manual-selective-deployment-sop.md), [Git/release standard](git-release-standard.md), current Football AGENTS.md and active project profile.

## Purpose and accepted scope

Only `/team/index.php` replaces its sidebar report button/modal with the unchanged supplied LINE QR and the exact red bold heading “แจ้งปัญหาการใช้ระบบ”. Other team pages and Admin/SAT retain the existing report widget. Report history, API and data are preserved.

User reports Local testing passed. Local build and906/906 tests in59 suites passed, including141 focused tests, plus syntax/diff checks. Local static QR returned200/image/png with exact original bytes. Local launcher identity was verified. Agent browser and QR decoder were unavailable; user acceptance is recorded separately from agent visual/scan verification.

## Source identity and preparation still required

- Standalone Local root: `/home/krit/my-office/grit-solution/football`; branch `main`; current base HEAD: `71e9c15df070572ca81bfabd398405cc9e0d403b`.
- Candidate release commit: not created yet. Issue62 source/runtime/tests/asset changes are uncommitted. Preserve unrelated prior issue knowledge/ledger changes.
- Preliminary source allowlist: `.gitignore`, `src/teamLayout.ts`, `dist/teamLayout.js`, `public/images/lineoa-support-qr.png`, `tests/support-report.test.ts`, `tests/production-parity.test.ts`, `tests/fixtures/issue62-team-support-qr-runtime.json`; reviewed issue62 release documentation only as needed.
- Before Gate A, freeze only the agreed source paths, create an isolated sparse worktree excluding operational data, and build/test that exact candidate. Materialize the committed static font/template/prototype fixtures needed by the full suite. Require the generated artifacts to match the hashes below; differences require reconciliation/revised manifest.
- No Local remote/upstream exists. No push/fetch/merge, Production checkout update, server build/install, deployment script or directory synchronization is part of this plan.

## Exact two-file runtime scope

Production root: `/home/zbpzpszw/football_app/football/`. Targets are that root plus the relative paths below.

| Artifact / relative target | Bytes | Current Local SHA-256 |
|---|---:|---|
| `dist/teamLayout.js` | 6630 | `f6c6435d0138b54d57e5cdd9026a277c7afde9a2a13f3ebd916d9224c27f889b` |
| `public/images/lineoa-support-qr.png` | 51523 | `9034927c2e5fdb244ef6b580830b866f06f9154cb85303de46c3f9d42e6feeb2` |

- Existing layout target: `/home/zbpzpszw/football_app/football/dist/teamLayout.js`.
- QR target: `/home/zbpzpszw/football_app/football/public/images/lineoa-support-qr.png`.
- Effective public URL to verify: `https://pmycfootball.in.th/images/lineoa-support-qr.png`.
- Expected Local-base layout SHA: `4742590c40e88abe8ca9cd218e1aa526ac0c87b0e01b14cb88a426142db24e60`. This matches prior recorded runtime evidence but is not a fresh Production check.
- QR target/directory existence on Production: unverified. Treat the QR as new only after a fresh exact-path absence check. If a target already exists, stop to reconcile its identity and agree a fresh backup/restore scope; do not overwrite it under an assumed new-file scope.

## Read-only Production preflight before approval cards

1. Verify actual Passenger root/startup mapping, Production branch/HEAD and exclusion-safe worktree state separately from runtime hashes. Inspect only exact targets and required startup/control metadata. Preserve unrelated drift, including completed issue61 behavior.
2. Compare current layout bytes/behavior with the candidate baseline and one-module preservation contract. Stop on unexplained runtime changes.
3. Check QR target, exact `public/images` parent, ownership, permissions, disk space, same-filesystem stage paths and collisions. No directory inventory or uploads access is needed.
4. Pin startup hashes (`dist/app.js`, `dist/server.js`, `dist/adminAuth.js`, `dist/db/initTables.js` and required imports/controls), trace the actual startup side-effect matrix, and verify the Production initialization guard. Restart is not assumed data-neutral.
5. On the DB Server only, collect timestamped READ ONLY relevant schema/type/index/aggregate checks; require required schema present and zero pending startup backfills. Confirm OCR jobs/cache leases are idle before restart; do not modify jobs or data to clear a check.
6. Prepare a current evidence-bound manifest and validated action plans/cards before consequential actions. No plan may claim proceed with missing/unverified preconditions.

## Gate A — exact stage, backup and conditional directory creation

After the preflight passes, present full candidate SHA, both artifact hashes, exact target/stage/backup/quarantine paths, metadata and any exact directory-creation scope for explicit approval.

- Use a new release ID bound to candidate SHA and timestamp. For target `T`, use `T.stage-<release-id>`; existing targets get fresh `T.backup-<release-id>`.
- For the existing layout, create and verify one fresh backup matching its immediately pre-copy live hash and metadata. Do not reuse an older backup.
- For a verified-absent QR, record absence rather than invent a backup; preapprove exact `T.rollback-new-<release-id>` quarantine path.
- If `/home/zbpzpszw/football_app/football/public/images` is absent, Gate A must explicitly cover creation of only that exact directory with0755 and freshly verified app owner/group. If present, preserve its existing metadata/ACLs and verify permission to write; do not recursively chmod/chown or create other directories.
- Inspect actual filesystem modes of isolated artifacts before transfer. At drafting time layout is0644 and QR is0664. Prepare task-owned isolated transfer copies as0644 without changing bytes; verify both staged artifacts are0644 with the approved owner/group. Git100644 and matching SHA alone do not prove those permissions. Follow the [stage-mode incident](incident-2026-11-10-selective-stage-file-modes.md).
- Upload only the two exact staged artifacts and verify SHA/size/type/mode/owner. Verify backup, live baseline and startup/control/marker unchanged. No promotion or restart in Gate A.
- Stop and reconcile any failed/ambiguous upload, permission, metadata or backup result before another write. Do not reupload blindly or bypass a hook lock.

## Gate B — QR first, layout second, Football restart

Only after Gate A evidence is complete, request fresh explicit Gate B approval for the exact promotions, Football Passenger restart, checks and bounded rollback.

1. Immediately recheck manifest/candidate, live baseline, stage and backup hashes/metadata, QR prior absence, startup/control/marker, schema/backfill and fresh DB/idle baseline. Any difference stops promotion.
2. Atomically promote the QR stage to its exact public target first; verify it. Then atomically replace `dist/teamLayout.js` from its stage and verify it. These are two per-file operations, not one atomic transaction. Preserve the verified backup and all other files.
3. After another immediate startup-safety/DB check, restart only Football Passenger using `/home/zbpzpszw/public_html/pmycfootball.in.th/tmp/restart.txt`. No process kill, new service, configuration change, migration or account bootstrap.
4. Verify new Production worker identity and bounded startup-error metadata. A later missing-PID snapshot alone does not justify a repeat restart: reconcile with read-only HTTP/process/log checks. Treat diagnostic readiness logs as optional if their existing window has expired; do not extend capture/logging configuration.
5. Check HTTPS homepage, team login, Admin/SAT login and relevant access boundary. Verify QR HTTP200,image/png,byte count and exact SHA. HTTP/asset identity alone is not UI or scan acceptance.
6. With an authorized session/user test, verify `/team/index.php`: old button/modal absent, original QR and exact red bold wording, desktop/mobile fit and scan, no automatic LINE navigation/message. Verify another team page and Admin/SAT retain the report action. Keep checks read-only; do not submit a support report or send a LINE message as a smoke test.
7. On the DB Server repeat READ ONLY post-checks. Record timestamped counts without inferring release causation from differences. Verify final two-file and preserved startup/runtime identities.
8. If authenticated browser checks are unavailable, record partially verified and ask for user Production acceptance. Keep issue62 open until the user reports acceptance and requests closure.

## Bounded rollback

Gate B approval must cover rollback if a critical target hash/load/startup/service/UI check fails.

- First verify the exact fresh layout backup SHA and metadata. Restore only that target atomically, preserving the backup; recheck startup safety, restart only Football Passenger and reverify.
- If QR was absent before release, restore that absence only by verifying the deployed QR hash and atomically moving it to its exact unused preapproved quarantine path. If fresh preflight instead establishes a pre-existing QR, the revised approved plan must restore its verified backup instead.
- Preserve a newly created `public/images` directory and unrelated files; no recursive removal, directory restore or cleanup.
- Do not roll back DB/cache/reviews/report records. No data/schema/configuration mutation is authorized by this release.
- A changed/unverified backup or unsafe restart stops rollback rather than authorizing an improvised repair.

## Hook lock, evidence and current limits

A Codex CLI hook lock stops the affected operation. Record the actual error and known side effects, reconcile read-only, and resume only through the supported user acknowledgement/separate-task flow. Do not edit/delete a lock or retry around permissions.

Retain candidate/manifest, exact stage/live/backup/quarantine and metadata evidence, gate approvals, restart, HTTP/process/UI/DB checks and rollback outcome. Append factual repository ledger entries and update issue62. The existing central software-ledger validator requires a remoteSHA although this standalone repository has no remote; retain that separate representation limitation without inventing a remoteSHA or changing shared schema/profile under this task.

This round is a draft only: no Production connection or mutation, candidate commit, staging, backup or restart has occurred for issue62. Fresh Production evidence and explicit Gate A/B approvals remain required. Previous issue61 acceptance does not authorize issue62 execution.
