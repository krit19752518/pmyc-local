# [FOOTBALL] Incident capture and RAG learning loop

- Status: proposed
- Last verified: 2026-10-28
- Source files: `football/AGENTS.md`, `football/knowledge/README.md`, `football/knowledge/ai-rag-pilot.md`

## Purpose and current boundary

This guide defines how Football incidents become reviewed, reusable RAG sources. Each incident is a separate Markdown file under `football/knowledge/` and is linked from `football/knowledge/README.md`. These files are a versioned source corpus; they do not prove that a local retrieval index or embedding service is running.

The pilot has an explicit incident allowlist in the `## Index` section of `football/knowledge/README.md` and a local offline BM25 retriever. It reads only linked incident Markdown. Do not index the whole repository, runtime data, credentials, or `football/uploads/`.

## Capture and correction loop

1. **Stop on failure.** Preserve the exact tool result, command or tool arguments, and exit status. Follow the applicable Brain recovery rule before another target operation.
2. **Reconcile state.** Check whether the intended operation ran, whether an artifact exists, and whether any side effect occurred. Record `unknown` when evidence is incomplete.
3. **Classify evidence.** Separate confirmed facts from hypotheses. Distinguish assistant workflow errors, Football defects, test interference, environment failures, and unknown causes.
4. **Write one incident file.** Use the template below. Do not claim a fix or root cause beyond the evidence. Keep credentials, personal information, uploaded-file content, and operational data out.
5. **Correct and verify.** Make the smallest authorized local correction that addresses the confirmed cause. Add a regression check. Keep the incident `open` until the check passes.
6. **Update the knowledge index.** Add the incident link and retrieval terms to `football/knowledge/README.md`. Read back changed files and verify relative links.
7. **Retrieve before similar work.** Search reviewed incidents, read the cited source, and carry forward its invariant. Recheck stale guidance against current code or policy.

A recovery lock takes precedence over logging writes: capture the error in the current task status, complete required read-only recovery, then persist the incident. Never bypass a stop rule to write a log.

## Incident record template

```markdown
# [FOOTBALL] Incident: short, searchable title

- Incident ID: FOOTBALL-INC-YYYY-MM-DD-NN
- Status: proposed | verified | superseded
- Resolution: open | mitigated | resolved
- Observed: YYYY-MM-DD
- Last verified: YYYY-MM-DD or unknown
- Category: assistant workflow | product defect | test interference | environment | unknown
- Source files: `project/relative/path`
- Retrieval terms: comma-separated terms

## Context / symptom
## Confirmed observations
## Unknowns and hypotheses
## Confirmed cause
## Impact and artifact state
## Resolution / invariants
## Regression checks
## Follow-up / limitations
```

## Rollout plan

| Stage | Work | Completion evidence |
|---|---|---|
| A — capture | Add reviewed incident records and index links | Required fields present; links resolve; facts and unknowns are separated |
| B — corpus gate | Validate incident IDs, required sections, status values, and allowed source paths | Implemented by `search_incidents.py`; invalid metadata, duplicate IDs, missing sections, and unindexed paths fail closed |
| C — local retrieval | Retrieve incidents from the explicit README allowlist | Implemented as offline BM25; results cite incident ID, source path, status, resolution, score, and excerpt |
| D — evaluation | Check expected sources, provenance, parameter rejection, and abstention | Nine standard-library regression tests pass in `test_search_incidents.py` |
| E — operating loop | Retrieve before similar tasks; record failures; test corrections before marking resolved | One manual retrieval-before-task cycle passed in the current Codex task; retrieval still requires an explicit search, with no automatic context injection |

Stages A–D are complete for the local lexical MVP. Stage E is documented and has one observed manual workflow check: the current Codex task searched the allowlisted incident corpus before reading its sources and before making the local evaluation change. This single check does not establish consistency across future tasks, and Codex still does not automatically retrieve or inject these records into its context. This is not vector/embedding RAG. From the repository root, run the regression suite and then search incidents with:

```sh
python3 football/knowledge/test_search_incidents.py
python3 football/knowledge/search_incidents.py "arg expected one argument"
```

The command is local and read-only. It reports `method: BM25 lexical; no embeddings`; an empty result is returned as `abstain: true`.

## Acceptance checks

- Every incident has a unique ID, status, resolution state, confirmed observations, unknowns, and regression checks.
- The index links only reviewed knowledge files and all relative links resolve.
- Each retrieval case cites its source and preserves the source status and invariant.
- No test or ingestion command traverses `football/uploads/`.
