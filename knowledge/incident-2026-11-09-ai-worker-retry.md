# [FOOTBALL] AI worker lifecycle and manual-review cooldown

- Incident ID: FOOTBALL-INC-2026-11-09-02
- Status: verified
- Resolution: mitigated
- Last verified: 2026-11-09
- Category: AI verification diagnostics
- Source files: `ai-verification/run_local.py`, `ai-verification/service.py`, `src/routes/admin/adminPlayerVerification.router.ts`, `src/views/playerVerification.ts`, `package.json`
- Retrieval terms: AI worker unavailable connection refused local cooldown retry manual review 30 seconds progress bar percentage popup polling automatic enqueue

## Context / symptom

The player modal can show a generic AI-unavailable message followed by a 30-second retry restriction. These messages do not establish that inference is running.

## Confirmed observations

The Local worker launcher runs Uvicorn separately in the foreground. `npm run dev` launches only the Node server. Worker `/health` reports liveness, not successful model inference. The launcher shares an internally generated private service key with Node; no paid-provider key is needed.

Before this fix, the POST verification route applied cooldown to the latest verification-table row without excluding `MANUAL_REVIEW`. Saving a manual review inserts a new row in that same table, so manual saving could also trigger the AI retry restriction.

## Unknowns and hypotheses

A failed connection to the documented worker endpoint does not establish why the process stopped or whether it was ever started in the current session. File existence alone does not verify model integrity, dependency readiness, or matching secret values. No specific player's failed job was inspected.

## Confirmed cause

The previous cooldown used the latest row's `created_at`, including manual-review records, and returned a fixed 30-second message. Worker/network/authentication/model failures were collapsed into `AI_UNAVAILABLE` by the scheduler and then displayed using one generic UI message.

## Impact and artifact state

The implementation now changes the source and generated client/API output, with synthetic regression coverage. No credentials, actual attachments, schema, or application records were changed by this task.

## Resolution / invariants

The latest actual AI attempt is selected with `error_code IS DISTINCT FROM 'MANUAL_REVIEW'`. Actual failed attempts still count even if a newer manual review exists. A 429 response includes remaining seconds and `Retry-After`; public jobs also expose remaining cooldown. The UI disables retry with a countdown, cancels it on modal close/player change, and never submits automatically.

The scheduler persists bounded codes for connection, authentication, timeout, busy service, inference, response validation, and model/source mismatch. The API maps these to safe public messages rather than exposing exception text. Old `AI_UNAVAILABLE` records keep the generic fallback until a new attempt succeeds or yields a more specific code.

Local worker startup remains explicit and separate from Node. The user chose to run the worker in their own Terminal. Verify actual inference using authorized synthetic fixtures; health alone is insufficient.

## Regression checks

`tests/player-verification-api.test.ts` covers manual review followed immediately by AI submission, actual failed-attempt cooldown even with a newer manual review, remaining retry metadata, worker unreachable, authentication failures, busy service, inference failure, invalid response, timeout, model mismatch, and success. `tests/player-verification-ui.test.ts` checks countdown behavior, disabled duplicate retry, safe specific messages, and timer cancellation on player change. Never infer model readiness from health alone or use actual attachments as test fixtures.

## Follow-up / limitations

The automated API/UI/rules/model-mapping fixtures pass 61/61; Python rules pass 7/7 and TypeScript builds successfully. Authenticated browser acceptance and real model inference after the user's worker startup remain separate checks. A stopped worker is not fixed by the cooldown/UI change.

Full suite: 373 passed / 31 failed. Failed test names match the immediately preceding Local baseline (360 passed / 31 failed); there are no new failed test names. This remains a failing full suite, not a release waiver. Incident retrieval checks pass 13/13.

## Local progress popup extension (2026-11-09)

Opening player details now shows a blocking progress overlay with the message “AI กำลังทำการตรวจสอบเอกสาร โปรดรอสักครู่”. Existing successful results are reused. Missing, stale or interrupted results trigger one automatic non-forced submission; running jobs are polled without duplicate submissions. Existing failed/manual-review records remain available for manual review and explicit retry.

The worker supplies job states, not numerical inference progress. Displayed percentages represent UI stages: preparing 5%, submitting 10%, queued 25%, running 60%, successful result rendered 100%. Elapsed time never advances running work to completion. At 100% the progress overlay stays open and displays a Close button; clicking it closes only the overlay and leaves player details open. There is no timed auto-close. Failure closes the overlay and preserves the safe diagnostic and cooldown controls without displaying 100%.

Progress state is cleared and poll timers are cancelled when details close, another player opens, or an explicit retry begins. Epoch checks ignore stale responses. Client-script fixtures cover automatic enqueue, queued/running/success transitions, cached results, error paths, and cancellation. Authenticated visual acceptance remains separate.

The initial new queue-transition test asserted 25% while its three asynchronous mock requests were still at the submission stage (10%). No real requests or records were involved. The test helper now drains enough promise continuations for the complete simulated request chain before asserting its outcome.

Progress extension validation: focused UI/rules tests pass 45/45; all four verification suites in the full run pass 83/83. TypeScript build passes. Full suite: 395 passed / 31 failed, with exactly the same failing names as the immediately preceding 388/31 report. Incident retrieval checks pass 15/15. No authenticated browser or real inference acceptance was performed.

### Manual close refinement

Successful progress now changes the heading to completion, keeps 100% visible and exposes a Close button. This button is hidden during work and cannot dismiss running progress. New player initialization clears the previous completion state. Synthetic tests advance the clock after completion and confirm that progress stays open until clicking Close.

The application route calls the private worker `/v1/analyze`; the worker uses PaddleOCR by default (or explicitly configured EasyOCR) and extracts identity fields from actual OCR lines. No mock fallback is present in that route or worker. Mock fetch/analysis values belong to synthetic test fixtures. A successful job may still contain missing/low-confidence fields; 100% means processing ended, not that the ID number was recognized correctly. Runtime readiness and accuracy require a separately authorized inference check, not just worker health.
