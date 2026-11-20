# Official team assignment incident: analysis and prevention

- Project: `grit-solution/football`
- Release evidence: `football-2026-10-21-official-team-session-security-c6b9327`
- Production test confirmation: `football-2026-10-21-official-team-session-security-prod-test`
- Related source commit: `ce12872f337d9da5546ac29649782308c635b77f`
- Isolated Production candidate: `c6b932756360022826dc89c6be22fcab732b45d7`

## Summary

A team official was assigned to a team where the coach was not expected to work. Investigation found that team context had been trusted from unsigned browser cookies. The team-switch endpoint also accepted a requested team ID without checking that the signed-in account owned that team. This allowed team context to be changed or forged and could cause an official save to use the wrong team ID.

The Production row was moved to the intended team in one guarded transaction after checking both the current assignment and active target team. A PII-free audit event records the old and new team IDs. The user later confirmed that the Production test passed; this was appended as supplemental release evidence rather than rewriting the original deployment record.

## What is and is not established

- Source review established the unsafe trust boundary: `team_id` / `team_user` cookies were not cryptographically bound to the authenticated session, and the team-switch route did not verify ownership of its target.
- Available historical database/application logs did not include request bodies or a usable audit event for the original creation or team-context change. They therefore do not establish whether the record was first created under another team and later switched, or which exact user action caused the assignment.
- Treat the insecure team context as the confirmed defect; treat the precise historical sequence and actor as unknown. Do not state the suspected sequence as proven.

## Implemented correction

- Added a time-limited HMAC-signed team session binding the active team ID and account identity.
- Team switching now requires a valid signed session and checks that the target active team matches the account's registered username, phone, email, or team name before issuing a new signed session.
- Saving an official requires a valid signed session, preventing unsigned or mismatched team cookies from choosing the destination team.
- Official creation now emits a structured audit event with role/category information and without identity/contact details.
- Corrected only the approved Production row using a transaction that locks the expected old row, verifies the active target team, requires exactly one update, and records a PII-free audit event.
- Existing team sessions without the signed cookie need to log in again.

## Prevention checklist for future changes

1. For every team-scoped read or mutation, obtain the active team only from a validated signed session; never trust a URL parameter or client cookie as authority.
2. On team switching, verify account-to-team ownership in the database and reject deleted/inactive teams.
3. For official updates/deletes, scope the record lookup and write by both official ID and the validated active team ID.
4. Add regression coverage for forged/mismatched/expired cookies, attempts to switch to another account's team, and official creation/update/delete across team boundaries.
5. Keep audit events useful for incident investigation while excluding ID-card numbers, phone numbers, documents, and other unnecessary personal values.
6. When a future report involves historical data movement, compare application audit records and database history before deciding whether a row was created, edited, or moved. If the required event was not logged, record the causal sequence as unknown.
7. Review other team-scoped mutation routes for reliance on the legacy unsigned cookie middleware before expanding signed-session enforcement globally; preserve login/registration/reset routes and plan session renewal for active users.

## Verification and residual limits

- Local: 28 test suites / 258 tests passed, including focused session/official/admin regression tests; Football build passed.
- Release: isolated candidate preflight passed; only approved Football paths were deployed; Passenger runtime hashes matched; site root returned HTTP 200.
- Data: guarded Production transaction and post-commit query verified the intended team assignment; audit event contains no personal identity values.
- User confirmed the Production test passed, recorded in the supplemental event above.
- No historical request-body/audit evidence was recovered, so the exact original actor and action remain unknown.
