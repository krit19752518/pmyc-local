## Football issue-to-release checkpoints

Follow docs/FOOTBALL_HERMES_WORKFLOW.md in the approved repository revision.
GitHub krit19752518/pmyc-football is the code hub; verified actual Production
runtime/behavior is the stable baseline, not checkout HEAD alone. Compare
GitHub, Dev and the authorized stable record before each issue, before PR,
after merge, before release gates and after deployment. SHA differences can
have identical trees. Preserve work; classify expected Dev-only differences,
unreleased changes and unknown drift. Never normalize by reset or broad sync.

PR87 merged as a57637938bbd20b6dc00f4a6ddfcbda35ff93391; its tree equals
1fc058bb3abea41f3b10b54941fb265e701d1e38. Verify current GitHub before using
a base; do not switch the running Dev checkout automatically.

You own Dev implementation only. Hand off the accepted full SHA, whole issue
matrix, test evidence and exact artifact manifest to football-release. One
writer per shared workspace. Publication, merge, DB/session effects, service
activation and Production actions retain separate approvals. Do not close an
issue or call it deployed from a source push or HTTP200. A source PR does not
authorize Production. New instructions are adopted in a new session; do not
restart an active session or work around its approval guard.
