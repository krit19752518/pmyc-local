# [FOOTBALL] AI RAG pilot preflight and source registry

- Status: proposed
- Last verified: 2026-10-28 (local retrieval evaluation and one manual Codex workflow check; no application runtime changes)
- Source files: [Football rules](../AGENTS.md), [Football code map](../AI_CODEBASE_MAP.md), [monorepo code map](../../AI_CODEBASE_MAP.md), [knowledge index](README.md), [architecture and scope](architecture-and-scope.md), [official data integrity](official-data-integrity.md), [production workflow](production-workflow.md)

## Purpose

Create a reviewed, Football-only source set for a future retrieval-assisted workflow. RAG may retrieve evidence and explain it; it does not establish new authority, repair invalid commands, or grant permission to run tools. Current code and tests remain the authority for application behavior. Operating rules, project facts, historical cases, and release evidence keep separate source classes.

This is a planning artifact. It does not add a workspace to Chainlit, change Hermes indexing, modify the Memory Sync Engine, choose an embedding model/vector store, or authorize production actions.

## Task 1 — initial inventory

### Confirmed from current project guidance

- Football source of truth is football/src/ and football/tests/. football/dist/ is generated runtime output, not an independent source; ordinary RAG retrieval should exclude it.
- Football-specific rules and navigation are football/AGENTS.md and football/AI_CODEBASE_MAP.md. Curated knowledge and its security boundary are documented in football/knowledge/README.md.
- Curated Football knowledge is distinct from shared Hermes memory and Chainlit/runtime session state. Do not promote chat or session contents to verified knowledge without review.
- The map describes an allowlisted project-memory loader, but this inventory did not inspect its code or verify a running local AI service. Treat Hermes/Chainlit integration as an unresolved option.
- The root AGENTS.md and PROJECT_RULES.md are generated historical stores. Do not bulk-index them as current Football instructions; use narrowly scoped, tagged retrieval only when a task needs a historical entry.
- football/knowledge/production-workflow.md is a release-specific source and had local modifications during this inventory. Keep it out of the initial general Q&A corpus until those changes are reviewed and its current evidence is checked.
- Other locally untracked knowledge candidates were listed but not read in this task. Do not treat them as approved sources until reviewed.

### Initial failure-case seed

The user reports recurring wrong data, commands, and parameter values, but no concrete historical Football input/output pairs were supplied. The current conversation contributes sanitized process-error categories for a later evaluation set:

1. Shell/card argument construction: an option-like token was parsed as an option, multiword values were split, and a path token was omitted from the option form.
2. Tool-command construction: unquoted script text caused a shell syntax error before the intended query ran.
3. Incomplete-output handling: a broad status listing and a line-bounded policy read were truncated and could not be treated as complete.
4. Path and scratch-file handling: the Brain reader rejected an absolute path where it required a Brain-relative path; a scratch-card path collision was refused without overwrite.

These are confirmed assistant-workflow failures, not Football application defects. They are useful seed tests for command assembly and fail-closed behavior, but they do not replace user-confirmed examples of incorrect Football fields or parameters.

## Task 2 — draft source registry

| ID | Source | Authority and use | Initial retrieval rule |
|---|---|---|---|
| F-RULES | football/AGENTS.md | Current Football operating and safety rules. | Load for every Football task; highest priority for Football scope and safety. |
| F-MAP | football/AI_CODEBASE_MAP.md | Navigation and test map; not a substitute for code/tests. | Use to locate only task-relevant sources. |
| F-SRC | football/src/** | Current implementation behavior. | Retrieve exact symbols/files for the task; do not index the whole tree as undifferentiated prose. |
| F-TEST | football/tests/** | Expected behavior and regression contracts. | Retrieve tests matching the source or user-visible behavior under discussion. |
| F-KNOW | football/knowledge/README.md and reviewed topic notes | Curated, reusable decisions and verified learnings. | Use only when status and source links are clear; code/tests supersede stale summaries. |
| F-ARCH | football/knowledge/architecture-and-scope.md | Boundary between project knowledge, shared memory, and runtime memory. | Use for questions about knowledge ownership or AI integration. |
| F-DATA | football/knowledge/official-data-integrity.md | Verified team-scoped identity-validation behavior. | Retrieve only for official identity/duplicate-validation tasks; verify current source/tests. |
| F-DEPLOY | football/knowledge/production-workflow.md | Deployment guardrails and checks. | Trigger only for deployment/release tasks; review current local edits before indexing. |
| GLOBAL-POLICY | System Brain task-intake and sandbox/preflight policies | Cross-project process controls, not Football product facts. | Consult by action type; do not copy them into a project corpus as application documentation. |
| HISTORICAL | Root AGENTS.md / PROJECT_RULES.md | Generated, large, mixed-project history; may contain stale guidance. | Never bulk-ingest. Search a specific tag only when needed, then verify against current Football sources. |
| HERMES-MEMORY | Reviewed Football-specific generated memory, if present and current | Potential project context; freshness and runtime integration were not verified here. | Exclude from initial allowlist until an administrator-reviewed version and exact loader behavior are confirmed. |
| RELEASE-EVIDENCE | Football release ledger and deployment records | Event-specific release evidence, not general operating knowledge. | Exclude by default; retrieve only for a release task and only the relevant event. |

### Exclusion rules

- Never index or inspect football/uploads/, user-submitted documents, personal data, credentials, tokens, cookies, session stores, runtime databases, or operational configuration contents.
- Exclude generated dist/ and static assets from ordinary retrieval. Include a generated artifact only for a task that explicitly verifies that artifact.
- Do not ingest all of a monorepo, chat transcript, Chainlit session, or runtime memory database. Keep retrieval project-scoped and source-linked.
- If a source is modified, untracked, stale, or missing its verification metadata, label it provisional and abstain from using it as current authority.

## Tests for Tasks 1–2

### Task 1: inventory and baseline

- Inventory check: every source candidate has an owner/class, authority level, freshness state, retrieval trigger, and explicit include/exclude decision.
- Failure-case check: every evaluation example is sanitized and records the bad input, expected value/command, supporting source, and whether the cause is confirmed. The initial inventory had no examples; after the user directed a Brain review, Task 3 below adds source-backed reconstructed cases. The reviewed records do not preserve an exact historical prompt plus incorrect AI output for a parameter error.
- Baseline replay: after the user supplies or approves representative historical examples, run them against the current no-RAG workflow and record exact-match, citation, and abstention results. Not run in this inventory.

### Task 2: source registry

- Allowlist check: every enabled path resolves inside an approved source root; no wildcard may silently include new folders.
- Denylist check: paths under uploads/, runtime/session data, secrets/config, and user-submitted documents are rejected without reading their contents.
- Scope-routing check: code questions retrieve matching src/ and tests/; release questions may add the reviewed deployment source and exact release evidence; ordinary questions do not retrieve release records.
- Freshness check: changed, deleted, untracked, or stale sources are marked provisional or removed from the active index until reviewed.
- Citation check: each retrieved chunk retains its file path, section, source class, and last-verified metadata.

These are planned checks, not executed tests. Before implementation, refresh Git state, review any local edits to proposed sources, and confirm the intended local AI integration and the user's representative error examples.

## Task 3 — Brain-derived historical evaluation seed

- Status: draft evaluation scenarios derived from reviewed Brain records; not a replay of original user prompts or assistant outputs.
- **BRAIN-01 — runtime verification gap (confirmed):** A direct isolated-worktree render of `renderAdminLayout` verified role-specific layout output, but did not exercise the actual server, authentication, or browser session on port 4500; that listener still ran from the primary checkout. Expected answer: do not claim the user's local page is fixed until the listener PID, command, and working directory match the candidate source, then inspect the authenticated browser page on the exact required port. Evidence: `projects/grit-solution/football/local-worktree-server-mismatch.md`, headings `Confirmed cause` and `Regression checks`.
- **BRAIN-02 — province authorization source (confirmed Football product defect, not an AI-output error):** SAT Officer authorization could falsely return 403 when province was derived from incomplete/stale worker-local player/team data. Expected answer: read the player and registered team from PostgreSQL and authorize against normalized persisted `football_registered_team.province`; never trust a client-supplied province or process-local cache. Blank or mismatched persisted province remains denied. Evidence: `projects/grit-solution/football/sat-player-province-authorization.md`, headings `Established cause`, `Implemented correction`, and `Regression coverage to preserve`.
- **BRAIN-03 — restricted test harness (confirmed verification limit):** A temporary local-only guard skipped startup `CREATE`/`ALTER` statements and prevented worktree uploads-directory creation during one isolated startup. Expected answer: label results as restricted-harness evidence, do not generalize them to normal app startup, and restore the prior runtime after testing. Evidence: `projects/grit-solution/football/local-worktree-server-mismatch.md`, heading `Resolution / invariants`.
- **Tests for Task 3 seed:** each case must retrieve its cited Brain source and heading; preserve the case classification (workflow error vs product defect vs test limitation); produce the expected invariant above; and abstain from claiming an exact historical bad parameter value because none is preserved in these reviewed records.
- **Baseline limitation:** these are source-grounded reconstructed questions, not transcript replay. The reviewed Brain records do not provide exact historical prompt/incorrect-output/expected-output triples, so no no-RAG exact-match baseline or percentage is claimed. Add exact examples only when they are recovered from an approved source.

## Task 0–2 execution record (2026-10-28)

### Task 0 — workspace preflight

- Ran Git status scoped to `football/`, with `football/uploads/` excluded. A producer-side Python wrapper preserved Git's exit code and printed only branch, counts, and knowledge-path statuses.
- Result: `main` is 17 commits behind `origin/main`; 47 Football paths are changed (34 modified, 13 untracked). This is a scoped Football result, not a complete inventory of unrelated repository paths.
- Existing Football knowledge state: `production-workflow.md` is modified; this pilot file and three release-oriented knowledge files are untracked. The modified/release-oriented files were not read or used as RAG sources in this pass. Preserve them and treat their content as provisional until separately reviewed.
- The output contained no upload paths. No files were modified by the inventory operation.
- **Test T0-1 — bounded status:** PASS. The command returned `git_status_exit=0`, the branch and counts, and only the targeted knowledge status lines. Its result stayed below the declared 1,800-character producer limit.
- **Test T0-2 — exclusion:** PASS. Git pathspecs excluded `football/uploads` and descendants; the summary did not emit upload names or contents.

### Task 1 — observed failure cases and limits

The following are confirmed Codex workflow/preflight failures observed while carrying out this pilot. They are not evidence of Football application defects:

| ID | Observed failure | Root cause | Prevention check | Result |
|---|---|---|---|---|
| WF-01 | Card helper rejected `--arg -C` with “argument --arg: expected one argument”. | An option-like argv token was passed in a form consumed as an option. | Pass option-like tokens as `--arg=-C`; validate the card before running the described command. | PASS after correction: fresh card validated; the first output path was checked and no card artifact existed. |
| WF-02 | Card helper rejected the slice-help request because exactly one `--length` was required. | I assumed the reader's help invocation did not require the subcommand's required argument. | Check the reader subcommand help; supply its required `--offset` and `--length` even when requesting help. | PASS after correction: a fresh card validated and the help returned the exact syntax. The rejected card path was checked and absent. |
| WF-03 | Whole-repository `git status` returned hundreds of lines and the tool truncated the result. | I queried `.` instead of the Football scope and treated a card's output declaration as if it imposed a producer-side limit. | Scope Git at the producer and summarize there; preserve the command exit status; assert the output cap before accepting it. | PASS after correction: Football-only status summary completed with exit 0 and stayed within the cap. |
| WF-04 | A completeness guard falsely stopped after a valid Brain slice because the policy text itself contained the word “truncated”. | The guard searched for a keyword instead of validating structured reader markers. | Require the exact expected `CHARS` and `END_SOURCE_RANGE` markers; do not infer truncation from body text. | PASS after correction: all accepted slices reported their exact range, character count, digest, and end marker. |
| WF-05 | The first local-link test returned exit 4 and labeled the repo-level `AI_CODEBASE_MAP.md` link out of scope. | The test checked containment within `football/` rather than the repository root, even though the root map is an approved reference. | Check containment within the repository root, then separately deny `football/uploads/`. | PASS after correction: all 7 local links exist in the repo; none is broken, outside the repo, or inside uploads. |
| WF-06 | A wrapper labeled a successful pre-patch read as STOP. | I used an inverted compound Boolean condition in the result checker. | Use direct, named positive checks for exit status, expected digest, status, and context markers. | PASS after correction: the read returned the expected untracked status, digest, and exact patch anchors; no write occurred. |

The user's reported Football mistakes—wrong domain data, commands, or parameter values—still need representative examples with verified expected answers. These were not provided in the available project records, so no Football-specific gold cases have been invented. Add those cases before claiming that the pilot measures or fixes domain correctness.

**Task 1 result:** Initial workflow-error seed is populated and testable. The Football-domain golden dataset remains incomplete pending verified examples.

### Task 2 — source registry review

- Keep the existing allowlist and provenance fields in the draft registry: path, source class, scope, freshness/status, and citation metadata.
- Do not index the locally modified `production-workflow.md` or untracked release-oriented docs until their contents and authority are reviewed. They remain provisional; release material must not be retrieved for ordinary Football questions.
- Retain the existing exclusions, especially `football/uploads/`, secrets, private data, generated/runtime outputs, and sources outside the Football allowlist.
- **Test T2-1 — source boundaries:** PASS for this pass. The Git inventory and review did not read upload contents; release-oriented candidates were not opened or added as verified sources.
- **Test T2-2 — local links:** PASS. All 7 local Markdown links resolve within the repository; zero are broken, outside the repository, or inside uploads. The repository-root map link is valid.
- **Test T2-3 — provenance:** For every active source, require a retained path and source status; modified or unreviewed material must not be labeled verified.

### Current source status overlay

| ID | Current status for this pilot |
|---|---|
| F-RULES | Verified in the earlier scoped project review; re-check if project instructions change. |
| F-MAP | Verified in the earlier scoped review; navigation aid only. |
| F-SRC | Candidate, retrieved per task and exact symbols; no whole-tree indexing. |
| F-TEST | Candidate, retrieved per matching behavior; no whole-tree indexing. |
| F-KNOW | Mixed; use reviewed notes only and verify each note's status and links. |
| F-ARCH | Reviewed previously; document states last verification 2026-10-16. Re-check against current code before consequential use. |
| F-DATA | Reviewed previously; document states last verification 2026-10-16. Re-check against current code/tests before use. |
| F-DEPLOY | Provisional: locally modified and not re-read; exclude from the active index until reviewed. |
| GLOBAL-POLICY | Process-only; consult through the Brain workflow when required, not as Football product corpus. |
| HISTORICAL | Excluded from bulk indexing; verify any specifically searched fact against current sources. |
| HERMES-MEMORY | Unverified here; excluded until an approved current export and loader behavior are confirmed. |
| RELEASE-EVIDENCE | Unreviewed/untracked candidates; excluded by default, retrieve only after a release-specific review. |

**Test T2-3 result:** PASS for this draft: every registry ID has a status and retrieval boundary. The provisional and excluded sources are not represented as verified active knowledge.

### Recovery record

The initial broad status result was partial, so work paused. Recovery followed the Brain preflight: record the exact result, verify that failed card-generation attempts produced no artifacts, consult helper/validator/reader syntax, and resume only with fresh validated cards and a producer-bounded Football status command.

The first local-link test exited 4 because its checker rejected the valid repository-root map link; the read-only output showed 7 existing links and no broken links. The corrected repository-root check passed 7/7 while separately excluding uploads. A pre-patch result wrapper also falsely labeled a successful read STOP due to its inverted Boolean; its output showed the expected status, digest, and patch anchors. No writes occurred during either failed check. The corrected checks passed before this record was updated. No code, production data, or application runtime was changed.

**Follow-up incident (2026-10-28):** The aggregate checker exited 10 because its uploads Boolean was inverted: an ordinary link outside uploads was marked `excluded=True`, then `not excluded` was counted as an upload. The corrected check uses a positive `is_upload(path)` predicate and counts that value directly. Regression verification passed: uploads predicate 3/3, source/status IDs 12/12, workflow cases 6/6, local links 7/7 with broken=0, outside=0, uploads=0, and the incomplete Football domain golden-set gap remains documented. No content under `football/uploads/` was opened.

During recovery, command construction also failed when shell arguments were not quoted as one `ID=EVIDENCE` value, option-like arguments were passed without `--arg=`, and the Brain reader was given an absolute path instead of a Brain-relative path. Each failure stopped that invocation; recovery resumed only after reading the applicable policy and obtaining a valid pre-command card. These were assistant workflow errors, not Football or RAG failures. No project file was modified before this record.

## Steps 0–3 continuation record (2026-10-28)

### Step 0 — current baseline

- Before the evaluation-test change, the existing standard-library retriever suite passed 5/5.
- Six read-only probes were run against the current retriever: English pre-command → incident 01; Thai pre-command → incident 01; English path-scope → incident 02; Thai path-scope → incident 02; Thai ranking-quality → incident 03; unrelated Thai query → abstain. All six matched the expected outcome.

### Steps 1–2 — local corpus and evaluation

- The reviewed corpus remains the explicit incident allowlist in `knowledge/README.md`; the retriever reads only linked incident Markdown. No `uploads/`, runtime, credential, or user-submitted content was read.
- Added four regression cases for the three Thai expected-source queries and an unrelated Thai abstention query. Retrieval assertions now also verify that cited results retain `verified` status and `open` resolution.
- The expanded test suite passed 9/9. Incident 03 is resolved for this curated ranking set; its individual historical bigram score contributions and broad Thai retrieval error rate remain unknown.

### Step 3 — local Codex workflow check

- In this desktop Codex task, I searched the local allowlisted incident corpus before substantive project work, read the relevant incident sources, and then used their invariants while reviewing and testing the retriever. This confirms one manual retrieval-before-task cycle.
- The result does not establish consistent behavior across future tasks. The search is still invoked explicitly from project instructions; Codex has no automatic incident retrieval or context injection here.

### Remaining boundary

This is a local lexical BM25 pilot with Thai character trigrams, priority-field weighting, and a relevance gate. It is not embedding/vector RAG. The records also do not contain verified original Football wrong-answer/expected-value examples, so the suite does not yet measure domain-specific field or parameter accuracy.
