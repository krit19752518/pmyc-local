# [FOOTBALL] Incident: assistant tool command and result handling errors

- Incident ID: FOOTBALL-INC-2026-10-28-04
- Status: verified
- Resolution: open
- Observed: 2026-10-28
- Last verified: 2026-10-28
- Category: assistant workflow
- Additional retrieval terms: unquoted multiword --arg, shell quoting, malformed patch newline, doubled JavaScript escape, output budget overflow, recovery card argument parsing, approved_action_id, backtick context mismatch
- Source files: `football/AGENTS.md`, `football/knowledge/incident-logging.md`, Agent Brain policy `policies/sandbox-denial-preflight.md`
- Retrieval terms: assistant workflow, command syntax, `--offset`, Brain-relative path, pre-command card, `ID=EVIDENCE`, output truncation, response shape, `read_thread`, `wait_threads`, คำสั่งผิดรูปแบบ, ผลลัพธ์ถูกตัดทอน, อ่าน thread ผิด schema

## Context / symptom

During review and recording of earlier assistant tool errors, several reads and pre-command checks failed or returned incomplete output. The operations were blocked before the intended project or RAG write, but I repeated calls before applying a sufficiently narrow and exact recovery procedure.

## Confirmed observations

- The first expanded regression run executed 9 tests and failed 2 metadata assertions. The tooling record was deliberately proposed during verification while the helper required verified; the Thai retrieval record was resolved while the helper hardcoded open. Both queries reached the expected source documents. Updating the helper to accept per-record metadata resolved these test expectation failures; the final run passed 9/9.

- The Brain reader rejected a slice call that used `--start`; its required argument is `--offset`. A separate read failed because I passed an absolute path where the reader requires a Brain-relative path.
- The pre-command card helper rejected a slice card that omitted `--length` and another card whose precondition was not formatted as `ID=EVIDENCE`.
- An invalid `functions.exec` pragma was rejected before the described command ran.
- Broad tool and thread queries produced truncated output after I requested more data than the chosen output limit could return.
- A `read_thread` result arrived as JSON text in `content`; my extraction looked for `structuredContent` and produced an empty turn list. Parsing the returned content corrected the read.
- A `wait_threads` result used a `polls` field; my extraction assumed `targets` and produced an empty list. A later scoped read confirmed the RAG setup thread was still active, and a subsequent bounded wait/read confirmed its status.
- The local RAG regression suite passed 4/4 tests before this incident was added. No failure indicated that the RAG retriever itself caused the command or parsing errors.
- A direct-search pre-command card was rejected because I split the multiword query across separate --arg values. The helper reported unrecognized arguments: polls structuredContent output truncation; the query did not run, and the requested card path was confirmed absent.
- Two tool outputs were also truncated at the outer response layer: a card inspection returned about 1,042 tokens against a 1,000-token cap, and a mutating-card generation attempt returned about 463 tokens against a 250-token cap. The latter attempt's exact card output path was confirmed absent.
- A recovery-card shell command split unquoted multiword options; the helper reported missing required arguments and the shell reported this: command not found. The requested artifact was confirmed absent.
- An apply_patch request used doubled newline escapes in a JavaScript string, so the tool received literal backslash-n sequences and rejected the malformed patch. Several follow-up patch attempts also failed because I omitted literal Markdown backticks around /tmp in expected context. Read-only SHA256 comparisons against a saved pre-patch snapshot confirmed the incident remained unchanged at 4,167 bytes.
- A mutating pre-command card was rejected because I omitted the required approved_action_id field. The exact requested card artifact was confirmed absent. A validator-source read also failed with Python SyntaxError before it read the file.
- One policy read returned about 961 tokens against a 700-token cap; another task-intake read returned about 603 tokens against a 600-token cap. A later recovery excerpt was clipped at 850 characters, leaving the selected rule incomplete.

## Unknowns and hypotheses

- Some pre-command cards were created under `/tmp`; the complete inventory and provenance of every successful or rejected card attempt were not audited.
- No evidence establishes a defect in Football, the RAG retriever, or the Brain reader.

## Confirmed cause

The first expanded test run also exposed a stale global metadata expectation in the test helper. It assumed every incident was verified and open, so it failed on a proposed record under test and a resolved Thai incident. Tests now accept the expected status and resolution per incident.

The additional failures were also assistant workflow errors: I built shell arguments without quoting spaces, omitted a required approval identifier from a mutating card, copied patch context without its exact Markdown punctuation, used doubled newline escapes, and set source or outer output limits too low. The command and tool errors exposed these problems, but I continued before completing state reconciliation and exact schema checks.

These were assistant workflow errors. I did not confirm exact CLI syntax and path conventions before constructing commands, did not bound some queries narrowly enough, and assumed response fields without checking the returned schema. The tools reported the invalid arguments and clipped over-limit output; I should have corrected my invocation and extraction before proceeding.


The final RAG-recording pass exposed two more assistant workflow errors. I generated a test-run card with the placeholder include path /home/krit/my-office/grit/solution-does-not-exist; card inspection caught the mismatch before the test command ran, and a corrected card was then validated and used. A combined incident-diff/context read asserted that output would be at most 6,000 characters; the combined result exceeded that bound, so Python raised an assertion and printed no partial diff. I recovered by reading the diff and context separately.

During policy recovery, the first card-generation command exited 2 with argument --arg: expected one argument because -c was not passed in --arg=-c form. The second exited 2 with --start-marker and --end-marker must be supplied together. Neither policy-read command ran. The first attempted output path (/tmp/football-rag-recovery-policy-card-20261028-02.json) was absent. The second path (...-03.json) contained a structurally valid older card with a different operation ID; the failed argparse invocation did not create it. I validated that existing card and used its exact read-only command to review the recovery rule.

The incident-write preparation then failed in the outer functions.exec JavaScript parser because an unescaped backtick terminated a template literal. No nested CLI command ran and no artifact was created; this was an assistant command-construction error.


Two further preflight issues were caught before their described actions ran. The initial read-card creation response was truncated by the model-context limit; the card artifact existed at 2,138 bytes, passed the official validator, and was then used for the scoped read. The first incident-write card claimed the command would print changed lines, but its command only wrote the file. Card inspection caught this mismatch before execution; that card was left unused and replaced by a validated card whose command printed the inserted block.

## Impact and artifact state

Read-only checks confirmed that rejected patches left the incident identical to the saved 4,167-byte baseline. The failed recovery-card and mutating-card output paths were absent. Temporary snapshots were created for exact diff verification; the full /tmp artifact inventory remains unknown. No application, database, production, commit, or push operation was performed.

The failed calls were reads or pre-command validation. Before this incident write, they made no Football application, database, production, commit, or push changes. Temporary pre-command cards were created in `/tmp`; their full inventory remains unknown.

## Resolution / invariants

- Keep retrieval assertions separate from per-record status and resolution expectations; pass the expected metadata for each incident explicitly.

- Build mutating cards from the validator schema, including approved_action_id, approval state, scope, evidence, and side_effects_reviewed.
- Preserve exact Markdown punctuation in patch context. Construct patch strings with actual newlines and read back the diff against a pre-patch snapshot.
- Set source and outer output limits using measured character counts; reject every partial policy or file read and recover before continuing.

- Before executing a validated card, compare its exact target, include paths, argv, and expected output shape to the intended operation; structural validity alone does not catch mismatched scope or output expectations.
- Build each CLI invocation from that exact subcommand's help. Pass Brain paths relative to the Brain root and card preconditions as `ID=EVIDENCE`.
- Bound queries and output at the source. On truncation, discard incomplete conclusions and repeat only after recovery with a narrower query.
- Inspect the actual response shape before extracting fields; an absent field must not be converted into a claim that the target list is empty.
- After any failure, record the exact result, reconcile artifacts and side effects read-only, and follow the applicable recovery policy before another target operation.

## Regression checks

- `python3 football/knowledge/test_search_incidents.py`
- `python3 football/knowledge/search_incidents.py "wait_threads polls structuredContent output truncation"`

## Follow-up / limitations

The current Football RAG pilot is a local BM25 incident corpus. Retrieval is manual; this entry does not establish embeddings or automatic Codex context injection.
