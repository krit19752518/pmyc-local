# Phase2 Dev source reconciliation

This source-only follow-up publishes six existing Dev PHP corrections separately from Issue91. It does not update or restart the serving Dev workspace or Production.

Base: cb4abbe47435b0a35e78a3ff79e7725f2abe225b. The preserved source was captured before Issue91 and checked against that snapshot.

| Source | Existing behavior preserved |
| --- | --- |
| phase2/src/Application.php | Authenticated root enters the current dashboard; explicit public navigation remains public |
| phase2/src/DashboardPages.php | Visible filters use validated user input rather than read-model defaults |
| phase2/src/TeamSetupPages.php | Clear action and no inferred teams until visible filters are complete |
| phase2/src/BracketPages.php | Clear filters and consistent page heading across content states |
| phase2/src/SchedulePages.php | Clear filters; GET presentation separated from POST-bound scope |
| phase2/src/WorkspaceView.php | Context-only sidebar entry and clear URLs for setup/bracket/schedule |

Regression coverage includes root authorization/public intent, blank/partial/explicit filters, assigned province and clear links. Disposable PostgreSQL fixtures explicitly select the season when expecting teams or fixtures; no sporting eligibility assertions are removed.

Football source validation runs for PRs into main. It checks the exact source commit with read-only GitHub permissions, no persisted Git credentials or application secrets, a strict TypeScript build and tracked dist parity, full Jest including disposable PostgreSQL, and incident retrieval. It has no deployment job or VPS access. The older Issue89-only workflow is preserved.

Issue91 keeps its own commit and PR. After both source changes are integrated, compare the combined PHP/CSS hashes to accepted Dev before treating the next main as the development baseline. A main merge does not deploy Production. Source publication and runtime deployment evidence remain separate.

Owner-reported acceptance currently covers Issue91 on Dev; this follow-up does not invent a separate desktop/mobile test record or a fresh Production verification for the six earlier changes.
