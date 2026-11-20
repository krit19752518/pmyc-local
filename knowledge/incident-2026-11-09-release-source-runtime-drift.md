# [FOOTBALL] Compiling a selective-release baseline can remove existing runtime behavior

- Incident ID: FOOTBALL-INC-2026-11-09-04
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-09
- Category: selective release source/runtime reconciliation
- Source files: `src/routes/admin/adminPortal.router.ts`, `dist/routes/admin/adminPortal.router.js`, `knowledge/manual-selective-deployment-sop.md`, `knowledge/test_search_incidents.py`
- Retrieval terms: selective release source runtime drift TypeScript generated artifact candidate baseline compile regression category state district draw preservation Local PostgreSQL CIDR inet_server_addr host DATABASE_IDENTITY_MISMATCH preflight

## Context / symptom

Preparing issue55 from a prior release commit produced a candidate that passed its source-based tests but would remove existing functionality when replacing the Production admin portal artifact.

## Confirmed observations

The selected base commit's tracked admin portal runtime matched the read-only Production checksum. Compiling the same commit's TypeScript plus the focused issue55 source patch produced differences outside issue55, including team category-state handling, district-draw setup, province normalization and existing modal helpers. The clean source baseline passed 343 tests and the candidate passed 426 tests; neither result established preservation of the actual runtime's behavior.

An exact-file search of 73 committed source revisions and 35 existing Football worktree snapshots did not identify a complete matching TypeScript source. This is a bounded search result, not proof that no recoverable source exists elsewhere.

## Unknowns and hypotheses

The provenance of every earlier runtime-only change and the location of a complete matching typed source remain unverified. Do not attribute this drift to a particular prior release or operator without evidence.

## Confirmed cause

The selected baseline's tracked TypeScript and generated admin portal runtime do not represent the same behavior. A source-only patch and successful rebuild therefore cannot by themselves preserve existing Production behavior.

## Impact and artifact state

The original candidate was stopped before staging or promotion and remains marked DO-NOT-DEPLOY. A reconciled source candidate is now prepared in an isolated checkout and durable review bundle; it is source-ready but still not deployable pending infrastructure and explicit release gates. No Production upload, configuration, schema/data write or restart was performed. The original dirty application worktree was preserved.

## Resolution / invariants

Before release, reconcile every existing behavior in the target runtime to authoritative TypeScript, retain regression coverage, then rebuild and compare the complete artifact delta. Never hand-edit generated dist to make checksums or selected behavior match. Keep the old candidate as evidence rather than label it deployable because tests passed. Preserve unrelated runtime drift outside the exact allowlist.

## Regression checks

The restored portal built from strict TypeScript is byte-for-byte identical to the verified baseline portal before issue55 is reapplied. Five missing/drifted helper modules also pass complete canonical contracts covering logic, dependency bindings, export/getter wiring and template text. Compiler aliases/scaffolding are normalized; application statements are retained.

`tests/runtime-source-preservation.test.ts` in the reviewed candidate checks all six module contracts and generated-output consistency. The only portal exceptions are five explicitly bounded issue55 source edits, reversed in memory before comparing the prior contract. Negative tests detect changed markup, logic dependencies and re-export targets. `tests/recovered-production-rules.test.ts` exercises district normalization, category state/review tokens, province/Demo authorization, registration ranks and fail-closed persistence. Four stale Admin fixture expectations were updated while keeping auth and transaction assertions.

The reconciled candidate passes 451/451 tests, Python7/7 and a strict TypeScript build. Final portal runtime diff contains only the five issue55 hunks instead of the earlier78. Incident retrieval retains a regression query for this case.

## Follow-up / limitations

Source preservation is mitigated in candidate `0b71f8d336bd58666a77796ce5ed82e82880d450`, after reconstruction commit `0b3cf5bc315b34d68d45844072ce33b49b38808e`. The reviewed bundle and evidence are under [`release/issue55-20261109-reconciled`](../release/issue55-20261109-reconciled/README.txt). The original dirty source checkout is intentionally not overwritten; use the reconciled candidate for future release preparation.

The separate worker, additive schema migration, refreshed live/startup preflight, Gate A/B and authenticated acceptance remain pending. Passing source contracts does not establish a deployed release or browser acceptance. Earlier runtime-change provenance remains uncertain; restoration is established by verified behavior rather than guessed history.

Agent Brain validation was corrected separately to enforce the current risk-based policy and the same strict hash-bound v2 migration contract as its context loader. Canonical recovery policies, critical-stop hook and old ledger lines were not rewritten. Global validation and232 tests passed. The interrupted work resumed only after the user's explicit hook-clear acknowledgement and a separate task prompt; no lock file was edited or removed.

## Local runtime follow-up

A Local switch preflight initially rejected a loopback PostgreSQL server because
`inet_server_addr()::text` returned an address with a CIDR suffix. The guard
reported `DATABASE_IDENTITY_MISMATCH`; those attempts performed SELECTs only and
did not stop the existing app or change database state. Read-only diagnosis
confirmed the address representation. Use `host(inet_server_addr())` before exact
loopback comparison, while still checking the configured hostname, database and
replica state. The corrected preflight succeeded before any Local migration.

The isolated candidate now has explicit development-only content-root and
skip-initialization settings in `src/services/localRuntime.service.ts` and
`tests/local-runtime.test.ts`. Production/test ignore these overrides. This lets
a Local runtime reuse existing attachment paths without copying files and avoids
running unrelated startup seed/DDL during a switch. Confirm additive OCR schema
separately, verify the new runtime on a staging port, then stop only the verified
old Local supervisor/child. A successful authenticated HTML check confirms route
readiness, not OCR accuracy or a live browser review of athlete documents.
