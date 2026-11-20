# Football knowledge base

This directory is the curated, versioned knowledge area for the Football project. It separates Football decisions and verified incident learnings from shared monorepo knowledge and Hermes conversation/session memory.

## Source-of-truth model

1. **Code and tests** are authoritative for current application behavior: `../src/` and `../tests/`.
2. **Current Football working rules and navigation** are `../AGENTS.md` and `../AI_CODEBASE_MAP.md`.
3. **Reusable operational knowledge** belongs here. Each entry must link to the code/tests that support it and state when it was last verified.
4. **Legacy parent monorepo policy** is separate from this standalone Football repository. Do not edit generated parent `AGENTS.md` or `PROJECT_RULES.md` for Football-only learning; maintain this repository's project instructions and knowledge instead.
5. **Hermes chat history, Chainlit session memory, and runtime databases** are records of interaction/state, not curated or authoritative project documentation.

## Security boundary

Do not place credentials, tokens, private keys, passwords, session cookies, database dumps, personal data, user-submitted documents, or contents of operational config/runtime files in this knowledge base. Do not inspect those files just to populate documentation. Refer to environment-managed secret names or approved procedures without copying values. Keep `uploads/` out of indexing, search, and knowledge collection.

## Index

- [Schedule POST validation/conflict layout](incident-2026-11-17-schedule-save-layout.md): retain the new staff shell, submitted values and canonical context on422/409; verify committed schedules through POST→303→GET.

- [Dev HTTPS POST origin](incident-2026-11-16-dev-https-post-origin.md): explicit VPS Dev HTTPS origin validation for ceremony preparation; preserve CSRF, exact origin and roles.

- [Schedule detail legacy layout](incident-2026-11-16-match-detail-layout.md): use the current staff shell at the authorized match destination and retain contextual back navigation.

- [Ceremony named team balls and saved replay](incident-2026-11-13-ceremony-saved-replay.md): white named balls reveal committed bracket slots; read-only replay, long-name ellipsis and reduced motion.

- [Local promotion inventory and index checks](incident-2026-11-13-local-promotion-inventory.md): include ignored generated targets and distinguish staged contents from raw index bytes; reconcile partial operations before continuing.

- [Issue72 source integration](../docs/ISSUE72_SOURCE_INTEGRATION_20261113.md): accepted source9f09966 on the GitHub baseline, current public v2 policy, disabled scheduling and validation boundaries.
- [Statistics counting/geography contract](incident-2026-11-12-public-statistics-data-contract.md): historical cumulative policy and current per-age cancellation exclusion with versioned snapshots; Issue77 explicitly excludes cancellations in Admin report 3 while preserving the shared default.

- [Issue3 Local governance](issue3-local-governance-20261113.json): main-based documentation scope, accepted UAT4573 revision, preserved feature backlog and closure gates.
- [Permanent Local handoff](../docs/ISSUE3_LOCAL_HANDOFF_20261113.md): source/worktree roles and the next approval boundaries.

- [`incident-2026-11-12-ocr-budget-popup-details.md`](incident-2026-11-12-ocr-budget-popup-details.md): issue70 cumulative OCR cap blocks new calls independently of missing photo-caption assignments in the deployed shared popup.

- [`incident-2026-11-11-sat-team-popup-script.md`](incident-2026-11-11-sat-team-popup-script.md): escaped photo URL regex breaks the emitted team page script and leaves the inspection button inert.

- [`incident-2026-11-11-player-review-submission-gate.md`](incident-2026-11-11-player-review-submission-gate.md): use one roster-submission gate for athlete statuses and review saves on Admin and SAT pages.

- [`incident-2026-11-11-demo-area-options.md`](incident-2026-11-11-demo-area-options.md): Demo geography comes from source Demo areas by division; real data keeps the national master, and SAT without Demo retains its assigned province.

- [`incident-2026-11-11-dashboard-province-picker.md`](incident-2026-11-11-dashboard-province-picker.md): Admin province options were hidden by a prefilled native datalist; use a select while preserving the SAT province lock and area scope.

- [`incident-2026-11-11-phase1-area-eligibility.md`](incident-2026-11-11-phase1-area-eligibility.md): master province/district selectors, assigned SAT province, and first eight fully eligible Phase 1 teams before competition setup; fewer than eight allowed.

- [`incident-2026-11-11-dashboard-v16-presentation.md`](incident-2026-11-11-dashboard-v16-presentation.md): latest UX authority, five visible Dashboard filters, and hidden event/data-mode context without legacy display additions.

- [`incident-2026-11-10-dashboard-empty-event.md`](incident-2026-11-10-dashboard-empty-event.md): false403 for newly created events without child competitions; separate Super Admin event visibility from staff assignment scopes.

- [`incident-2026-11-10-phase2-event-persistence.md`](incident-2026-11-10-phase2-event-persistence.md): event preview missing confirmation, Local persistence readiness, and pending additive setup using Phase 1 teams.

- [`issue64-production-deployment-plan.md`](issue64-production-deployment-plan.md): one-file team profile roster-field removal release; deployed, user Production acceptance passed and issue64 closed completed.

- [`incident-2026-11-10-post-restart-http-evidence.md`](incident-2026-11-10-post-restart-http-evidence.md): reject stale preflight output after a post-restart HTTP timeout; verify timestamps and readiness without blind repeat restart.

- [`issue63-production-deployment-plan.md`](issue63-production-deployment-plan.md): one-file SAT dashboard QR release reusing issue62 image; deployed, user Production acceptance passed and issue63 closed completed.

- [`issue62-production-deployment-plan.md`](issue62-production-deployment-plan.md): original reviewed two-file team-dashboard QR plan; deployment and user Production acceptance completed; issue62 closed. Evidence is in the release ledger.

- [`incident-2026-11-10-selective-stage-file-modes.md`](incident-2026-11-10-selective-stage-file-modes.md): `scp -p` preserves actual build permissions; Gate A mode mismatch reconciliation and exact-stage correction.

- [`issue61-production-deployment-plan.md`](issue61-production-deployment-plan.md): original reviewed eight-file release proposal; Gates A/B, deployment and user Production acceptance completed; issue61 closed. Evidence is in the release ledger.

- [`incident-2026-11-10-ocr-prefix-free-details.md`](incident-2026-11-10-ocr-prefix-free-details.md): issue61 prefix-free personal-name comparison, detailed field explanations and compatible V5 cache reuse; deployed, user Production acceptance passed and issue closed.

- [`incident-2026-11-10-ocr-upload-root-fallback.md`](incident-2026-11-10-ocr-upload-root-fallback.md): OCR503/ENOENT from a missing public uploads fallback; resolver deployed and user Production acceptance passed.

- [`incident-2026-11-10-ocr-prefix-name-rejection.md`](incident-2026-11-10-ocr-prefix-name-rejection.md): confirmed unsupported-prefix rejection, label-only English output and exact-record diagnostic scope; application fix remains open.

- [`ocr-debug-issue59.md`](ocr-debug-issue59.md): temporary, targeted Production OCR captures and private retention boundaries.

- [`incident-2026-11-09-ocr-name-prefill-expiry.md`](incident-2026-11-09-ocr-name-prefill-expiry.md): bounded multiline Thai names, editable automatic decisions and current Thai-date expiry checks.

- [`local-standalone-git.md`](local-standalone-git.md): standalone Local Git, Production baseline contracts, port4500 launcher and recovery boundaries.
- [`incident-2026-11-09-local-runtime-git-parity.md`](incident-2026-11-09-local-runtime-git-parity.md): parent Git and temporary Local entry diverging from active Production runtime.

- [`incident-2026-11-09-demo-gender-discovery.md`](incident-2026-11-09-demo-gender-discovery.md): nullable Demo gender can pass import checks while hiding provinces from Phase 2 divisions.

- [`incident-2026-11-09-startup-http-timeout.md`](incident-2026-11-09-startup-http-timeout.md): failed initial restart probes, read-only worker readiness diagnosis, and separately recorded recovery checks.

- [`incident-2026-11-09-admin-area-client.md`](incident-2026-11-09-admin-area-client.md): missing browser district helper breaks admin team tables and filters.

- [`architecture-and-scope.md`](architecture-and-scope.md): boundaries between Football knowledge, shared Hermes memory, and runtime memory.
- [`production-workflow.md`](production-workflow.md): verified deployment guardrails and checks, without host credentials.
- [`official-data-integrity.md`](official-data-integrity.md): verified team-scoped official duplicate-validation behavior.
- [`ai-rag-pilot.md`](ai-rag-pilot.md): local Codex RAG pilot scope, source registry, and evaluation limits.
- [`incident-logging.md`](incident-logging.md): incident capture, verification, correction, and the staged RAG rollout plan.
- [`incident-2026-10-28-precommand-errors.md`](incident-2026-10-28-precommand-errors.md): verified command-construction and Brain-read workflow incident.
- [`incident-2026-10-28-tooling-errors.md`](incident-2026-10-28-tooling-errors.md): assistant tool command construction, output bounding, and response handling incident.
- [`incident-2026-10-28-path-scope.md`](incident-2026-10-28-path-scope.md): verified Git status path-scope incident and protected-path invariant.
- [`incident-2026-10-28-thai-retrieval.md`](incident-2026-10-28-thai-retrieval.md): verified Thai-only query misranking and retrieval-quality regression requirements.
- [`incident-2026-11-09-player-save-popup.md`](incident-2026-11-09-player-save-popup.md): player review save notifications and the active verification modal listener.
- [`incident-2026-11-09-ai-worker-retry.md`](incident-2026-11-09-ai-worker-retry.md): separate worker lifecycle, generic AI errors, and manual-review cooldown interference.
- [`incident-2026-11-09-review-completeness.md`](incident-2026-11-09-review-completeness.md): mandatory field and identity decisions, derived status, and required team-facing reasons.
- [`incident-2026-11-09-release-source-runtime-drift.md`](incident-2026-11-09-release-source-runtime-drift.md): a passing source candidate can still remove existing selective-release runtime behavior.
- [`incident-2026-11-09-ocr-field-boundaries.md`](incident-2026-11-09-ocr-field-boundaries.md): iApp plain-text extraction must respect birth/issue/expiry boundaries and keep format validation separate from absent confidence.

Root historical knowledge may contain additional Football cases. Search it by tag when needed; this index does not claim to replace or delete that history.

## Entry format

Use one file per cohesive topic or incident and include:

```markdown
# [FOOTBALL] Short topic

- Status: verified | proposed | superseded
- Last verified: YYYY-MM-DD (or unknown)
- Source files: `relative/path`, `relative/test/path`

## Context / symptom
## Confirmed observations
## Unknowns and hypotheses
## Confirmed cause
## Impact and artifact state
## Resolution / invariants
## Regression checks
## Follow-up / limitations
```

Update existing entries when the code changes; mark superseded guidance clearly. Keep notes concise and avoid duplicating whole source files or generated output.
