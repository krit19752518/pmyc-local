# Issue59: temporary Production OCR diagnostics

- Status: activated on Production after approved Gates A/B on 2026-11-09; service checks passed, real OCR/user acceptance pending.
- Source: `src/services/playerOcr.debug.ts`, `src/services/playerOcr.diagnostics.ts`, `src/services/playerOcr.provider.ts`.
- Regression: `tests/player-ocr-debug.test.ts`, provider/API suites and Production parity contracts.

Production's existing PMYC_OCR_DIAG_V1 behavior was reconstructed into TypeScript from the exact inspected runtime. Keep its structural, content-free events when updating the provider; do not replace them with raw response logging.

The V2 capture path is `/home/zbpzpszw/football_app/ocr-debug-issue59`, outside both the web root and application tree. Its operational `control.json` contains a target-player hash, expiry and a limit of at most three captures. Never commit that control file or captured data. Directory permissions must be 0700 and files 0600; unsafe permissions and symlinked controls fail closed. There is no HTTP route exposing captures.

A capture requires Production mode, an explicitly confirmed manual OCR retry, the configured athlete, a valid job UUID, an unexpired window, and a name result other than VALID. Cache hits do not invoke a paid retry or generate a new capture. Do not retry automatically to collect evidence.

Each `capture-<job UUID>.json` stores the original validated provider OCR text, safe request metadata (page/crop/dimensions), parser version and structural reasons. It deliberately excludes image bytes, API keys, request headers, athlete-system values and arbitrary response extensions. PMYC_OCR_DEBUG_V2 stderr events carry only the job UUID, event and fixed reason enums.

The hard stop is 2026-11-10 22:30 Asia/Bangkok. A running Production worker checks cleanup every minute and on startup, deleting only this feature's capture/slot filenames after expiry. If all workers stop, physical cleanup resumes at the next startup; no new capture is allowed after expiry. The control file remains, disabled by its expiry.

After deployment, ask the user to open the affected athlete, click the existing AI retry button once and confirm the credit prompt. Correlate the saved verification job with the V2 event and private capture. Analyze locally/offline without copying personal text into Git, tests, knowledge or shared logs. Turn any confirmed format boundary into a synthetic regression before changing the parser. A captured reason is a diagnostic hypothesis, not proof that the source image must be reuploaded.

No parser behavior or athlete review decision is changed by enabling diagnostics. Diagnostic storage failures must not fail a successful OCR operation. User confirmation of the real retry and a subsequent parser fix are separate from mock-based verification of this capture mechanism.
