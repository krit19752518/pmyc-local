# PMYC Football — Git and release workflow

Scope: `krit19752518/pmyc-football`. GitHub `main` is the development source of truth after
[PR73](https://github.com/krit19752518/pmyc-football/pull/73), and **Dev VPS**
(`/home/zbpzpszw/football-dev/workspace`) is the primary environment for all new issue
implementation, builds, and functional testing. Source changes, Dev preview activation,
GitHub publication, and Production release each have their own recorded scope.
[Local handoff](ISSUE3_LOCAL_HANDOFF_20261113.md) records the earlier Local checkouts for
historical reference and recovery only.

## New issue intake

For Hermes Dev/release ownership, three-way baseline comparison and repeated
checkpoints through Production verification, also follow
[Football Hermes workflow](FOOTBALL_HERMES_WORKFLOW.md) and
[Football VPS Dev](FOOTBALL_VPS_DEV.md). This supplements the existing approval and
selective-release requirements; it grants no server access.

Use this checklist whenever a new Football issue is opened or assigned for implementation.
Opening an issue alone records the request; begin changes within the user's authorized task.

1. **Select the repository.** Target `krit19752518/pmyc-football` and Dev VPS
   `/home/zbpzpszw/football-dev/workspace` (not Local). Verify the Git root and sanitized
   origin identify `krit19752518/pmyc-football`, and resolve the issue number with
   `knowledge/project-identity.json`. Read the issue and its latest change/acceptance comments
   so later owner decisions supersede the appropriate original requirements explicitly.
2. **Read the working rules.** Read `AGENTS.md`, `AI_CODEBASE_MAP.md`,
   `docs/FOOTBALL_VPS_DEV.md`, and only the relevant source/tests. Run
   `python3 knowledge/search_incidents.py "<concise English keywords>"`; read returned
   sources and check them against current code/policy before using their guidance.
3. **Inspect and preserve Dev state (read-only).** Run `python3 scripts/dev_preflight.py --issue <NN> --worktree <dev-worktree-path> --preview <url-or-pending> --base origin/main` (read-only over the approved Dev transport) and Record GitHub `main` SHA, Dev workspace
   branch/HEAD/tree, sanitized origin, scoped status, existing worktrees, and which
   candidate/worktree currently serves `https://football-dev.pmycfootball.in.th` (plus any
   isolated UAT previews). Keep `uploads/`, `/home/zbpzpszw/football-dev/shared/`,
   credentials, sessions, and databases out of inspection/copying. Preserve all existing
   Dev worktrees and active UAT previews; do not repurpose them by default.
4. **Choose the source base.** Verify the current GitHub `main` SHA. For normal issues,
   fetch only `main` (`git fetch origin main`) and base the new branch on the reviewed `main`
   SHA; never reset, clean, stash, force-push, or synchronize whole directories. For an
   urgent issue that must reach Production before pending milestones, create the Dev candidate
   from source reconciled to the **actual Production runtime** and record the forward
   integration needed for pending Dev work. Record the reviewed full base SHA rather than
   assuming a previous issue's branch is current.
5. **Isolate the issue on Dev VPS.** Create a dedicated branch and durable worktree from that
   reviewed base, for example branch `work/issueNN-topic` under
   `/home/zbpzpszw/football-dev/workspace/.runtime/issueNN-topic`. Keep existing branches,
   worktrees, and previews intact.
6. **Define verification and preview.** Confirm scope, acceptance criteria, candidate paths,
   and required `npm run build` / `npm test`. Record the intended Dev preview URL
   (`https://football-dev.pmycfootball.in.th` or an isolated preview path) and which
   checkout/source revision will serve it. A new worktree does not automatically switch the
   running Dev preview; verify serving identity before UAT. Synthetic database tests and
   application-data UAT are separate scopes. Do not copy credentials or real data to prepare Git.
7. **Report the starting checkpoint.** Give the issue/repository, Dev branch/worktree, full
   base SHA, preservation status, expected behavior, and verification endpoint/plan. Continue
   the authorized Dev work; publication/merge, preview switching, and Production actions
   retain their own scopes and existing approvals.

After implementation, use the review/publication and completion steps below. Before closing
the issue, record its PR and merged source SHA on GitHub, or the owner's explicit acceptance
of a separately tracked source-publication follow-up. If a separately authorized selective
release occurred before publication, retain the exact source/artifact evidence and the
pending PR disposition; a closed issue alone is not evidence that `main` contains the code.
After an approved merge, keep Dev `main` aligned only through an authorized narrow
fetch/fast-forward without switching active UAT services implicitly.

## Each issue

1. Record the problem, expected behavior, acceptance criteria, affected paths, exclusions,
   and whether database/schema, files, paid providers, or external messages are involved.
2. Inspect current `main`, Dev state, and relevant incident knowledge; create an isolated
   issue branch/worktree on Dev VPS from the intended source base. Preserve all unrelated
   staged, unstaged, and untracked work. Never reset/clean/stash/force-push or synchronize
   whole directories to make it clean.
3. Develop and test within the approved scope inside the Dev candidate worktree. TypeScript
   is maintained in `src/`; regenerate tracked `dist/` using `npm run build`. Application
   changes need focused/full tests (`npm test`) and build as applicable; documentation changes
   need link/path checks and `git diff --check`, plus retrieval tests when knowledge changes.
   Keep previous results dated and separate from fresh checks.
4. Review the entire branch delta and ancestry against the intended PR base. Record the
   exact allowed paths and commit only that set. Prepare a concrete PR title/body. Push/open
   PR only with the owner's publication approval; merge needs its own approval.
5. Record user acceptance with the Dev preview URL, serving revision/candidate SHA, and
   scope. Issue closure uses that issue's acceptance criteria and explicit owner approval. A
   feature's Dev PASS does not authorize its Production deployment or closure of a separate
   governance issue.

## Local recovery and historical services

Do **not** start new issues on Local or run `npm run dev:local` unless the Owner explicitly
requests Local recovery or Local runtime work:

- Dirty standalone Local recovery checkout (no remote): `/home/krit/my-office/grit-solution/football`; preserve its index, remotes, runtime state, and work.
- Historical Local source/worktree checkouts: `/home/krit/my-office/pmyc-football` and `/home/krit/my-office/pmyc-football-work/issue72` (preserved Issue72 synthetic UAT at `http://127.0.0.1:4573`, prepared at `22ddb3f` via `.runtime/uat4573/control.cjs`).
- Legacy Local launcher (`npm run dev:local`, targeting `http://localhost:4500`) is for explicit Owner-requested Local recovery/runtime work only; do not invoke it from a new checkout or switch `4500`/`4573` without separate approval.
- Keep operational config, credentials, sessions, databases, and `uploads/` outside Git and knowledge. Do not traverse or copy them to organize a source checkout.

## Production evidence and release boundary

The [12 November baseline record](PRODUCTION_BASELINE_20261112.md) documents source/runtime
compatibility at that time: byte identity where required, canonical equivalence where
explicitly reviewed, and intentional startup/database configuration differences.
It does not prove that later Production runtime matches the current GitHub tree.
GitHub source SHA, App Server checkout SHA, runtime artifact SHA-256, snapshot definition,
and user acceptance are separate identities. Keep all in the release record when applicable.

A separately requested release follows the [manual selective SOP](../knowledge/manual-selective-deployment-sop.md)
and [Git/release standard](../knowledge/git-release-standard.md). Reconcile the exact affected
runtime against fresh evidence before preparing a compatible artifact. Review Gate A
stage/backup and Gate B promotion/restart/verification/rollback as applicable. No push,
Production Git update, install/build, scheduler activation, data/schema change, whole-tree
copy, or deployment script is implied by a source PR or Dev acceptance.
Leave unrelated Production behavior and Phase2 routes intact. Missing DB/UI evidence
stays unverified unless the owner explicitly accepts the specified limitation.

## Tool failures and hook recovery

Record the actual error and known effects. Ordinary read-only CLI errors/no matches allow
bounded diagnosis. Permission/sandbox/ambiguous-write or consequential failures require
state reconciliation and applicable authorization; do not retry blindly or bypass controls.
For this installed critical-stop hook, the verified parser accepts a standalone
`!codex-resume <16-hex-lock-id>` for the matching session after owner review. Its successful
unlock prompt is intentionally consumed; submit the next task separately and reconcile
the prior operation before writes. Never guess an ID or remove/disable the hook to proceed.
See [incident evidence](../knowledge/incident-2026-10-28-precommand-errors.md).

## Short Issue template

```text
Problem and trigger:
Expected behavior / acceptance criteria:
Affected pages and candidate paths:
Repository / issue URL:
Source base (full SHA) / Dev branch / Dev worktree:
Existing work preservation / preview URL and serving revision:
Data/schema/files/provider/external-message effects:
Exclusions and preservation boundaries:
Verification and owner acceptance needed:
```

## Short PR template

```text
Problem and resulting behavior:
Related issue (avoid automatic closure unless approved):
Base / branch / source commit:
Complete changed-path scope and ancestry check:
Fresh tests/build or documentation checks:
Historical evidence and remaining limitations:
Owner acceptance endpoint/revision/scope:
Publication, merge and deployment approvals still required:
```

## Short release record template

```text
Issue / PR / release ID / separately approved workflow:
Reviewed source commit / publication SHA if applicable:
App Server checkout SHA (separate from runtime):
Exact source and generated artifact allowlist:
Per-artifact pre / stage / backup / post SHA256 and metadata:
Startup effects / Gate approvals / restart evidence:
HTTP / authenticated UI / owner acceptance with timestamps:
DB pre/post schema/count evidence or accepted NOT VERIFIED exception:
Snapshot version/definition and scheduled-run evidence if applicable:
Rollback evidence / outcome / limitations:
```

Use `not applicable` for fields outside the approved task, rather than fabricating a SHA
or claiming a service/database check was performed. Store secrets, personal data and raw
operational records outside source documents; reference approved private evidence safely.
