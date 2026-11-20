# [FOOTBALL] Initial HTTP probes can time out after a runtime restart

- Incident ID: FOOTBALL-INC-2026-11-09-07
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-09
- Source files: `knowledge/manual-selective-deployment-sop.md`, `knowledge/test_search_incidents.py`
- Retrieval terms: Passenger Node22 startup HTTP timeout smoke restart curl 28 worker readiness atomic promotion rollback

## Context / symptom

After an approved selective runtime activation and restart, the homepage and both login probes timed out after 15 seconds with zero response bytes. Native JPEG/PDF tests had previously passed.

## Confirmed observations

Read-only inspection confirmed the exact promoted artifact and backup hashes, unchanged startup artifacts, and new Node22 workers with the expected production environment. One subsequently authorized read-only homepage probe with a 45-second deadline returned HTTP200 in about0.24 seconds. Both login pages then returned200; the protected verification API returned401 with a JSON Accept header. No additional promotion, restart or rollback occurred during this recovery.

## Unknowns and hypotheses

The cause and total startup duration are unknown. A startup delay is a hypothesis, not a confirmed root cause. The later fast response does not establish that increasing a timeout fixed the server. Native CLI success alone does not prove web-service readiness.

## Confirmed cause

Not established. The first probes did not receive data within their configured deadline. Do not attribute this to a particular Node version, thread limit, database condition or operator without further evidence.

## Impact and artifact state

The first service checks were temporarily unverified. Subsequent runtime, HTTP and read-only schema checks passed. The original backups remained intact; no paid OCR, actual document access or business-record mutation was used for verification.

## Resolution / invariants

Stop further writes after failed service checks. Reconcile live/staged/backup identities and inspect actual worker state through an authorized read-only route. A single bounded readiness probe may follow that diagnosis; this is not permission to blindly retry failed writes or assume every timeout is harmless. Use the separately approved exact-file rollback if a critical service or startup failure persists. Keep restart initialization guards and schema safety checks intact.

## Regression checks

The incident retriever must return this case for the startup/HTTP-timeout query in `knowledge/test_search_incidents.py`. The query test preserves this operational lesson; it does not simulate a Production restart.

## Follow-up / limitations

Authenticated UI acceptance and real OCR accuracy remain separate checks. Logs inspected only as a bounded tail cannot prove the absence of errors throughout the entire startup history. Record the initial failed probes and subsequent successful checks separately instead of reporting an uninterrupted all-pass rollout.
