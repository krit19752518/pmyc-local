# [FOOTBALL] Incident: Thai-only retrieval can rank an unrelated incident first

- Incident ID: FOOTBALL-INC-2026-10-28-03
- Status: verified
- Resolution: resolved
- Observed: 2026-10-28
- Last verified: 2026-10-28
- Category: product defect
- Source files: `football/knowledge/search_incidents.py`, `football/knowledge/incident-2026-10-28-precommand-errors.md`, `football/knowledge/incident-2026-10-28-path-scope.md`
- Retrieval terms: Thai query, BM25 ranking, character bigram regression, character trigram, relevance gate, wrong incident, retrieval relevance, ค้นไทย, จัดอันดับผิด

## Context / symptom

During the step 0–3 retrieval evaluation, a Thai-only query about file names shown by a status command returned the pre-command-card incident before the path-scope incident that describes the event.

## Confirmed observations

- Before adding Thai summaries and Thai character bigrams, two Thai-only baseline queries returned `abstain: true`.
- After the bilingual change, query `มีรายชื่อไฟล์ส่วนตัวหลุดจากคำสั่งตรวจสถานะ` ranked `FOOTBALL-INC-2026-10-28-01` first at 8.117 and the expected `FOOTBALL-INC-2026-10-28-02` second at 5.5154.
- A related query about creating an argument card ranked incident 01 first as expected.
- At the time of the regression, the retriever applied BM25 to full incident text and expanded Thai tokens into character bigrams without separately weighting titles or summaries.
- The corrected retriever now uses Thai character trigrams, scores title/category/retrieval terms/summary separately with a 3.0 priority weight, and requires at least two distinct priority terms that do not occur in every incident before returning a result.
- The six-case English/Thai probe set passed 6/6 after that correction: expected incidents ranked first for the five relevant queries, and an unrelated Thai query abstained. The expanded standard-library suite passed 9/9, including source status and resolution metadata.

## Unknowns and hypotheses

- The individual bigram contributions to the incorrect score ordering have not been measured.
- This single evaluation query does not establish the overall Thai retrieval error rate.

## Confirmed cause

At the time of the incident, the lexical ranking lacked a sufficiently discriminative signal for this query: it scored full-text character-bigram overlap without a separately weighted incident title or retrieval summary. The observed top result was therefore not reliable for this case. The exact contribution of each token remains unmeasured.

## Impact and artifact state

One Thai-only query returned the wrong incident first. Both results still included provenance and the correct incident at rank 2. No application runtime, user data, or production state was changed.

## Resolution / invariants

- Keep the indexed Thai summary focused on the unique event and its distinguishing terms.
- Give the title and retrieval summary more influence than incidental full-body overlap, then verify against curated expected-source cases.
- Do not treat a nonempty result as proof of relevance; inspect the cited source and use abstention when no result passes the relevance gate.
- The implemented lexical weighting and relevance gate passed the current curated bilingual cases; this resolves the recorded ranking regression, not the broader semantic-retrieval limitation.

## Regression checks

- The Thai-only path-scope query must rank incident 02 first.
- The Thai-only pre-command query must rank incident 01 first.
- English and mixed-language equivalents must continue to return their expected incident first.
- An unrelated Thai query must abstain.

## Follow-up / limitations

Resolved for the current curated test set. Thai character trigrams and the relevance gate remain lexical heuristics, not semantic understanding or vector retrieval; add more representative Thai queries before estimating general retrieval quality.

## Thai retrieval summary

การค้น incident ภาษาไทยด้วย BM25 อาจจัดเอกสารผิดหัวข้อไว้ก่อนเอกสารที่ตรงกว่า เมื่อคำบางส่วนที่ใช้ร่วมกันมีน้ำหนักมากเกินไป ควรให้น้ำหนักชื่อเรื่องและสรุปที่จำเพาะ แล้วตรวจอันดับกับชุดคำถามที่กำหนดแหล่งคำตอบไว้ล่วงหน้า
