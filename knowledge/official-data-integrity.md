# [FOOTBALL] Team-scoped official identity validation

- Status: verified
- Last verified: 2026-10-16 (existing knowledge entry reviewed)
- Source files: `../src/routes/team/teamRoster.router.ts`, `../tests/app.test.ts`

## Context / symptom

Official identity validation must allow duplicate identity values for separate official records within the same team while preventing identity collisions across different teams.

## Confirmed cause

The previous validation compared against officials from all teams without excluding same-team records, so it rejected values that the team-scoped policy permits.

## Resolution / invariants

1. Scope the duplicate decision using the authenticated team identity from the server-side session.
2. Continue rejecting matches from another team, while preserving edit-self exclusions and existing normalization behavior.
3. Do not broaden the exception to other teams or orphan records.

## Regression checks

Keep separate coverage for same-team allowed, cross-team rejected, and normalized/case-insensitive cross-team matches. Confirm current assertions in `tests/app.test.ts` before changing this behavior.

## Follow-up / limitations

This note summarizes an existing verified knowledge entry; verify current source and tests before relying on it for a new change. It does not authorize production data edits or duplicate cleanup.
