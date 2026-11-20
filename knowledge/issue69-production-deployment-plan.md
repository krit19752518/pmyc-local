# Issue #69 Production deployment plan (revised draft)

Status: planning only. No Issue #69 file has been staged or changed on Production.

## Scope and current evidence

Hide “2. ใบรายชื่อนักกีฬา (O-2)” in the team details popup for `SAT_OFFICER` and `DOCUMENT_VERIFIER`. Keep the team certificate and stored documents unchanged.

- Source: `src/routes/admin/adminPortal.router.ts` (two popup render locations).
- Sole proposed Production artifact: `dist/routes/admin/adminPortal.router.js`.
- Production target: `/home/zbpzpszw/football_app/football/dist/routes/admin/adminPortal.router.js`.
- Latest read-only App Server observation: checkout `c9cd37824786d2791e7de8f7dc1dd2bfc42d0c0c`, target SHA-256 `6f708c88dffc8af6ac82ec34974bf61a53c8cefa9b94a63a7d87bd581d74bf0a`, 492460 bytes, mode 0644, owner `zbpzpszw:zbpzpszw`. The target is modified relative to the old App Server Git HEAD; preserve its deployed behavior.
- This live target hash matches the final artifact of Issue #66 photo follow-up (`3ff60e9bf2a1143e3f8e0aface7164d72593f7ca`). That release's authenticated Production popup/photo check later passed. See [the release ledger](production-release-ledger.md).
- The shared Local build artifact had SHA-256 `9d8af29720f6035255915448bb79412ad9af7fc416f414710152251ce7eca5fe`. A byte-level diff against a read-only copy of the live target showed exactly two changed lines: the role-based hide class at each O-2 card. This is scope evidence, not a final isolated-candidate identity.
- User reports Issue #69 Local acceptance passed. The isolated candidate `/tmp/football-issue69-release` was created from the clean Issue #66 photo commit and is still unchanged at `3ff60e9bf2a1143e3f8e0aface7164d72593f7ca` as of this draft.

## Release steps

1. In the isolated candidate, change only the two O-2 card wrappers. Build there and confirm the generated artifact differs from the current Production target in exactly those two lines. Record the candidate commit, full changed-path list, artifact SHA-256 and size. Run the focused team-page check, required full tests, build, diff check and JavaScript syntax check. Stop if the candidate changes any other Production behavior or a required check fails.
2. Refresh the App Server read-only preflight: target hash/size/mode/owner, checkout identity, actual Passenger entry and startup artifact hashes. Confirm the target still equals the recorded baseline before any write. Review the exact Production startup path and `NODE_ENV`; the current Local source gates `initAdminTables()` and `initTeamTables()` outside production, and upload-directory creation is request-triggered. Do not rely on the old incident note that claimed an unconditional admin password update; verify the exact runtime. On the DB Server, run only the required READ ONLY schema/backfill/count checks. Do not inspect `uploads/` or credentials.
3. Present the final candidate, exact target hash, stage path and fresh same-filesystem backup path for **Gate A approval**. After approval, upload only the one artifact to its exact stage path; verify stage hash, size, mode and ownership, then create and verify a fresh backup of the immediately current live target. Do not promote or restart under Gate A.
4. Present the verified stage/backup identities, fresh live/startup hashes, and DB preflight for **separate Gate B approval**. After approval, recheck those identities and restart safety, atomically promote only the one target, verify its hash/metadata, and restart Football Passenger once.
5. Check startup/service health and HTTPS endpoints. With authorized sessions, inspect the team popup under both `SAT_OFFICER` and `DOCUMENT_VERIFIER`: O-2 absent, team certificate present. Repeat read-only DB checks and record final runtime/startup hashes. If authenticated UI cannot be checked, report `partially_verified`.
6. If a critical check fails, use only the exact verified fresh backup under Gate B's rollback scope; recheck restart safety, restore this one target atomically, restart and verify again. Record actual results in the Football release ledger.

Use [the Manual Selective Deployment SOP](manual-selective-deployment-sop.md) and [Git release standard](git-release-standard.md). This is Manual Selective Deployment: no Git remote operation, Production checkout update, Production install/build, deployment script, directory synchronization, schema or data change. No Gate A or Gate B approval is recorded for this revised candidate.
