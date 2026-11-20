# [FOOTBALL] Production deployment guardrails

- Status: verified
- Last verified: 2026-10-19 (root SOP and latest release evidence reviewed)
- Source files: `../../AGENTS.md`, `../../PROJECT_RULES.md`, `../package.json`
- Git/release standard: [`git-release-standard.md`](git-release-standard.md)

## Context

Football production runs in a two-server setup. The root Production SOP is the authoritative, changeable procedure; this note captures stable guardrails and points back to that SOP rather than duplicating host credentials or connection details.

## Resolution / invariants

1. Require local `npm test` and `npm run build` before deployment; deploy only an explicitly approved target commit.
2. Check branch, full SHA, staged/unstaged/untracked state, commit ancestry, and changed paths from the monorepo root. Stop for staged/modified tracked files or untracked path collisions; preserve all unrelated untracked files. Review out-of-module paths and never restart or claim deployment of services outside the approved runtime scope.
3. Use fast-forward only. Never use `git reset --hard`, force push, or destructive synchronization options as deployment shortcuts.
4. Keep app-server and database-server responsibilities distinct. Run PostgreSQL row-count checks only on the database server, never on the app server.
5. Capture pre-deploy HTTP/service and database-count baselines; after restart, verify target SHA, service restart, and HTTP health, then compare counts. A count difference alone does not establish that deployment caused a data change.
6. On cPanel, the TypeScript compiler may be unavailable after production-only dependency installation. Use the reviewed, locally built and committed `dist/` when the current SOP calls for it; do not invent or hand-edit build output.
7. Stop and report on a failed health check. Do not roll back automatically.
8. Keep source SHA, remote SHA, App Server checkout SHA, runtime SHA, and verified release SHA distinct. A clean/newer checkout does not by itself prove which release Passenger served; record evidence in the Football release ledger before calling a release verified.
9. Before updating a checkout whose commit range includes unrelated paths, reconcile the deployed runtime and Git state first. Do not silently redeploy unrelated work or label it already deployed without runtime evidence.

## Limitations

Before an actual deployment, reread the current root SOP; this summary is not a substitute for target-SHA approval, exact path review, or live pre-checks. Do not run a deployment script unless its behavior has been reviewed and the user authorized it.

## Lessons and preflight checklist: Thai v4 Competition Demo (2026-10-19)

The release ledger event `football-2026-10-19-thai-v4-demo-047dce7` records the deployment of target `047dce75e29b1a00cfacbdf74a160346cc62f9cf` as `partially_verified`. Use this incident as a preflight checklist; the current root Manual SOP remains authoritative.

### Observed outcomes

- Local access to Git origin and App Server access to upstream were not consistently available during the release. The reviewed target-only Git bundle was transferred over the approved App Server SSH connection after checking its base SHA, target SHA, ancestry, changed paths, and collisions. Do not assume the App Server can fetch upstream; verify access early and use a bundle only through an approved channel with those checks.
- App Server Git status encountered `unable to create threaded lstat`; checking with `core.preloadIndex=false` succeeded and showed a clean tracked worktree. Retry with that setting when this specific error occurs, then verify the exit status, SHA, and worktree again.
- `npm` was absent from the ordinary App Server PATH. The cPanel npm binary aborted with exit 134 (`core dumped`) even for `npm --version`, so production dependency installation did not complete. The cause is unknown. Diagnose the runtime or ask the hosting administrator before the next release; preserve any core dump as evidence. Never report installation as passed when it did not complete, and do not skip a step required by the current Manual SOP.
- No `tsc` was available on App Server. The release did not change package manifests or `football/dist`; the committed `dist` artifacts were used as allowed by the Manual SOP, and the checked `server.js` and `adminPortal.router.js` SHA-256 values matched Local. This does not change the install requirement.
- DB Server row counts changed from team/player/official `691/13209/1581` before deploy to `692/13212/1581` afterward; the repeated post-check matched. The cause is unknown and must not be attributed to deployment from counts alone. Repeat the check and compare relevant audit/application logs before drawing a conclusion; do not modify DB data to hide a difference.
- No authenticated Production browser session was available, so the Competition Demo UI and Thai content were not verified. The unauthenticated route redirect to login was expected, but does not verify the page. Without an authorized session, report UI verification as unavailable and the release as `partially_verified`.

### Checklist for the next release

1. Before the release window, verify Local-to-origin and Local-to-App-Server connectivity and authentication. If App Server upstream access is unavailable, prepare the approved target-only bundle and independently verify the advertised base, target, ancestry, complete repository-root changed paths, and path collisions before transfer.
2. Confirm the App Server Node/npm runtime and production-install command ahead of the release. If npm aborts or cannot be verified, stop and diagnose with the hosting administrator; preserve diagnostic artifacts and report the install as failed or unverified. Follow the current Manual SOP; do not silently omit installation.
3. Capture App Server branch, full SHA, tracked worktree state, untracked count, and collision check from repository root. If `unable to create threaded lstat` occurs, use `core.preloadIndex=false` for the affected Git check and verify its real exit status. Preserve unrelated files.
4. Capture DB row-count baseline on the DB Server before release and repeat after release. If counts differ, repeat and investigate relevant audit/application logs; treat the cause as unknown until evidence supports attribution. Never run `psql` on App Server or change DB data to reconcile counts.
5. Arrange an authorized authenticated Production browser session before release. Verify the Competition Demo page and Thai content after restart. If no such session is available, record the UI check as unverified and the release as `partially_verified`.
6. Record source, origin, App Server checkout, and runtime SHAs separately; changed paths; local test/build results; App Server install/build outcome; Passenger restart and HTTP checks; DB before/after counts; and authenticated UI verification. Do not infer a verified release from HTTP 200 alone.

## Follow-up: cPanel process cleanup retry (2026-10-19)

The badge release is recorded as `football-2026-10-19-demo-badge-50e7c4f` in the Football release ledger. Keep these observed results separate from any diagnosis of the hosting limit:

- After the user reported that cPanel had killed the stuck processes, SSH and Node `v20.20.2` / npm `10.8.2` responded, and `npm install --omit=dev --prefer-offline` completed with exit 0. This confirms the command worked at that time; it does not prove an LVE/CageFS limit was changed or that the issue cannot recur.
- The install emitted Puppeteer engine warnings: the installed Puppeteer packages require Node `>=22.12.0`, while cPanel provided Node `20.20.2`; npm also reported two moderate vulnerabilities. Do not upgrade Node or run `npm audit fix` on Production without compatibility review and explicit approval.
- `npm run build` on App Server exited 127 because `tsc` was unavailable after production-only install. The SOP-approved committed `dist/` fallback was used, and the checked artifact SHA-256 values matched Local. Record the build command as unavailable/failed and the artifact fallback as passed; do not describe the server build command itself as successful.
- Passenger restart and HTTP root check passed (`200`); the unauthenticated Competition Demo route redirected to login (`302`). No authenticated Production browser session was available, so the badge UI was not verified.
- DB Server counts changed from team/player/official `702/13313/1601` to `702/13319/1601`; the player-count increase of 6 remains unexplained. Do not attribute it to this static HTML change or alter DB data to reconcile it.

### Additional preflight for the next release

1. Ask the hosting administrator to inspect LVE/CageFS process/resource limits and relevant logs, and confirm the supported Node/npm runtime. Treat the limit as unresolved until the administrator confirms the cause or configuration; one successful retry after process cleanup is not proof of a permanent fix.
2. Before the release window, check the exact Node/npm binaries on App Server and run the install command required by the current Manual SOP. Capture its real exit code. If npm aborts or cannot complete, stop, preserve diagnostic evidence, and contact the administrator; do not skip installation or restart as if it passed.
3. Review package engine warnings against the App Server Node version. Resolve Puppeteer/Node compatibility through a tested, approved runtime or dependency change; do not upgrade Production runtime or dependencies ad hoc.
4. If App Server lacks `tsc`, use only the locally tested and committed `dist/` allowed by the Manual SOP, then compare relevant artifact checksums with Local. Keep that fallback distinct from a successful App Server build.
5. Prepare an authorized authenticated Production browser session and capture the DB Server baseline before release. If UI authentication is unavailable or post-check counts differ, report the missing verification and investigate counts/logs without attributing a cause or changing data.

## Follow-up: isolate full-suite failures from dirty monorepo state (2026-10-21)

- A dirty local Football worktree can contain stale test fixtures or omit newer upstream tests even when its source files were partly synchronized. Before attributing full-suite failures to a patch, compare the failing test/config paths with the exact `origin/main` SHA and count the suite files on both trees.
- Build a clean scratch baseline from the exact upstream SHA without touching `football/uploads/**`; redirect any test-only static upload directory to a task-specific `/tmp` path. Run the full suite on the baseline, then apply only the reviewed target patch and rerun the full suite and build. Keep the dirty worktree untouched and never stage stale fixtures as part of the release.
- If the clean baseline and patched candidate pass while the original worktree fails, record the mismatch as local baseline drift. Do not broaden the release or change unrelated Production code just to make stale local fixtures pass.
- Treat sandbox `EPERM` while opening a Supertest listener as an execution-permission issue, separate from assertion failures. Use an authorized local test runner that can bind its temporary loopback listener; do not weaken tests or point them at Production to bypass the restriction.
