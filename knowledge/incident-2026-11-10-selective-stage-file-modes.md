# [FOOTBALL] SCP preserves actual build permissions, not Git file mode

- Incident ID: FOOTBALL-INC-2026-11-10-04
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-10
- Source files: `knowledge/manual-selective-deployment-sop.md`, `knowledge/test_search_incidents.py`, `release/issue61-71e9c15-20261110T061804Z/gate-a-mode-recovery.json`, `release/issue61-71e9c15-20261110T061804Z/gate-a-backedup.json`
- Retrieval terms: SCP scp -p preserves permissions mode0664 mode0644 actual build filesystem Git100644 selective staging metadata chmod

## Context / symptom

Issue61 Gate A staged eight approved runtime artifacts. SHA-256, size and ownership matched, but verification returned exit2 because every staged file was0664 instead of the approved0644.

## Confirmed observations

The isolated Local build files were0664. The exact-file `scp -p` transfers preserved those actual permissions. Git's100644 tracked mode does not establish the working file's group-write bit. Full saved verification showed exactly eight mode mismatches; live runtime files, helper absence, startup/control hashes, checkout and Passenger restart marker were unchanged. Backups had not yet been created.

## Unknowns and hypotheses

The origin of the Local0664 mode was not investigated; do not attribute it to a particular umask or filesystem setting without evidence.

## Confirmed cause

The transfer preserved actual0664 Local modes while the approved Production stage contract required0644. Content identity alone was insufficient to pass Gate A.

## Impact and artifact state

Only the eight release-specific staged files existed with the wrong mode. No live artifact was replaced and no restart, data/schema/configuration change or OCR call occurred during recovery. The initial verbose verification stdout was truncated; the complete saved JSON was reconciled through a bounded per-field summary before any further write.

## Resolution / invariants

Stop the affected release operation and verify the complete state before further writes. Existing explicit Gate A approval covered0644 on these exact stage paths, so a validated narrow recovery tightened only their modes to0644. A fresh33-path check passed before seven fresh backups were created. Final33-path verification passed with all stage/backup/live/control identities and restart marker checked.

Before future transfer, inspect actual `stat` modes on every built artifact; do not infer permission bits from Git metadata. Preserve exact manifest ownership/mode requirements. A mode correction remains within existing approval only when it targets the already approved stage paths and values after complete reconciliation. Do not retry uploads, promote, restart, bypass a hook lock or broaden permissions to make verification pass.

## Regression checks

The release verifier checks SHA-256, bytes, regular-file type, mode, uid and gid, plus unchanged live/control/marker identities. Its observed mode failure and passing corrected run provide operational regression evidence. Knowledge retrieval adds a specific SCP/build-mode query. No application tests are changed for this deployment-only issue.

## Follow-up / limitations

This mitigates the issue61 staging failure. Future releases must repeat the actual filesystem-mode preflight. Gate B and Production acceptance remain separate from successful staging.
