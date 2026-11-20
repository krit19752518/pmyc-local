# [FOOTBALL] Reject stale HTTP preflight evidence after restart timeout

- Incident ID: FOOTBALL-INC-2026-11-10-05
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-10
- Source files: `release/issue63-dcf498e-20261110T075718Z/read-recovery.json`, `release/issue63-dcf498e-20261110T075718Z/http-after-stale-invalid.json`, `release/issue63-dcf498e-20261110T075718Z/http-after-v2.json`, `release/issue63-dcf498e-20261110T075718Z/check-http-evidence-freshness.py`, `knowledge/test_search_incidents.py`
- Retrieval terms: post restart HTTP timeout stale preflight result timestamp freshness readiness worker evidence urllib curl

## Context / symptom

The first anonymous HTTP check after issue63 Passenger restart raised `TimeoutError: The read operation timed out` and exited1 without writing a fresh result. A subsequent local evidence-copy step asserted only the existing JSON passed flag and copied the old successful preflight result into a post-deploy filename.

## Confirmed observations

Read-back showed both HTTP files had a timestamp before the restart. The post-restart runtime check passed. A separate bounded service check observed two new Production Node22 workers, V6 readiness events and zero tracked startup-error lines. No additional restart or rollback occurred. A new bounded curl check set succeeded and recorded a timestamp after the restart.

## Unknowns and hypotheses

The HTTP timeout's network/service cause is unknown. Worker readiness observations do not prove why that request timed out. No cause is attributed to the application change or deployment from this evidence.

## Confirmed cause

The false evidence classification came from reusing a shared output path after the producer failed, checking only `passed` and not whether the file belonged to the current operation or postdated the restart. A successful copy does not establish fresh verification.

## Impact and artifact state

One stale local HTTP copy and one premature local success message were invalidated before release conclusion. The old file is retained explicitly as `http-after-stale-invalid.json`, excluded from verification. Production target/control/backup checks remained valid; only one authorized Football restart occurred. The deployment result cites the fresh HTTP result and remains partially verified pending authenticated UI/user acceptance.

## Resolution / invariants

Stop after producer failure and reconcile its exit, side effects and exact output identity. Never consume an existing output as a new result based on its passed flag alone. Require operation-specific output and timestamp later than the observed restart before accepting post-deploy HTTP evidence. Preserve failed/stale evidence with an invalid label. Reconcile runtime, process and bounded startup metadata read-only before deciding whether another restart or rollback is needed; do not blindly repeat a consequential action.

## Regression checks

`check-http-evidence-freshness.py` rejects the actual stale fixture and accepts the fresh successful HTTP evidence. Its run passed. The recovery curl diagnostic requires result timestamp after the restart marker. Knowledge retrieval adds this exact failure query. These checks cover this bundle/diagnostic; they do not claim global enforcement across other tools.

## Follow-up / limitations

Authenticated Production UI and QR scanning still require actual authorized UI verification/user acceptance. The original timeout cause remains unverified. No shared Brain policy/schema, app source, credentials, session contents or uploaded documents were changed or collected for this incident.
