#!/usr/bin/env python3
"""Offline lexical retrieval over the reviewed Football incident allowlist."""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

KNOWLEDGE_ROOT = Path(__file__).resolve().parent
INCIDENT_NAME = re.compile(r"incident-\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md\Z")
LINK = re.compile(r"\]\(([^)]+)\)")
TOKEN = re.compile(r"[^\W_]+", re.UNICODE)
THAI_CHAR = re.compile(r"[\u0E00-\u0E7F]")
PRIORITY_WEIGHT = 3.0
STOPWORDS = {"a", "an", "and", "are", "as", "at", "be", "by", "did", "do", "for", "from", "how", "i", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "what", "when", "where", "which", "who", "why", "with"}
REQUIRED_SECTIONS = (
    "## Context / symptom",
    "## Confirmed observations",
    "## Unknowns and hypotheses",
    "## Confirmed cause",
    "## Impact and artifact state",
    "## Resolution / invariants",
    "## Regression checks",
    "## Follow-up / limitations",
)


def tokenize(text: str) -> list[str]:
    terms = []
    for token in TOKEN.findall(text.casefold()):
        if token in STOPWORDS:
            continue
        terms.append(token)
        if THAI_CHAR.search(token) and len(token) > 3:
            terms.extend(token[index : index + 3] for index in range(len(token) - 2))
    return terms


def _indexed_incident_paths(root: Path) -> list[Path]:
    readme = (root / "README.md").read_text(encoding="utf-8")
    parts = readme.split("## Index", 1)
    if len(parts) != 2:
        raise ValueError("knowledge README has no Index section")
    index = parts[1].split("\n## ", 1)[0]
    candidates = []
    for target in LINK.findall(index):
        if target == "incident-logging.md":
            continue
        if not target.startswith("incident-"):
            continue
        if not INCIDENT_NAME.fullmatch(target) or "\\" in target:
            raise ValueError(f"invalid incident link in index: {target}")
        relative = Path(target)
        if relative.is_absolute() or len(relative.parts) != 1 or ".." in relative.parts:
            raise ValueError(f"incident link escapes knowledge root: {target}")
        path = (root / relative).resolve(strict=True)
        if path.parent != root.resolve() or path.suffix != ".md":
            raise ValueError(f"incident source is outside the knowledge allowlist: {target}")
        candidates.append(path)
    if not candidates:
        raise ValueError("knowledge index contains no incident records")
    return candidates


def _parse_record(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    incident_id = re.search(r"^- Incident ID: ([A-Z0-9-]+)$", text, re.MULTILINE)
    status = re.search(r"^- Status: (proposed|verified|superseded)$", text, re.MULTILINE)
    resolution = re.search(r"^- Resolution: (open|mitigated|resolved)$", text, re.MULTILINE)
    if not incident_id or not status or not resolution:
        raise ValueError(f"incident metadata is incomplete: {path.name}")
    if any(section not in text for section in REQUIRED_SECTIONS):
        raise ValueError(f"incident sections are incomplete: {path.name}")
    lines = text.splitlines()
    title = lines[0] if lines and lines[0].startswith("# ") else ""
    metadata = [line for line in lines if line.startswith(("- Category:", "- Retrieval terms:"))]
    summaries = []
    for heading in ("## Retrieval summary", "## English retrieval summary", "## Thai retrieval summary"):
        if heading in text:
            summaries.append(text.split(heading, 1)[1].split("\n## ", 1)[0])
    return {
        "incident_id": incident_id.group(1),
        "status": status.group(1),
        "resolution": resolution.group(1),
        "source": f"knowledge/{path.name}",
        "text": text,
        "priority_text": "\n".join([title, *metadata, *summaries]),
    }


def load_corpus(root: Path = KNOWLEDGE_ROOT) -> list[dict[str, str]]:
    records = [_parse_record(path) for path in _indexed_incident_paths(root)]
    ids = [record["incident_id"] for record in records]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate incident IDs in indexed corpus")
    return records


def _excerpt(text: str, query_terms: set[str], limit: int = 360) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    scored = []
    for line in lines:
        overlap = len(query_terms.intersection(tokenize(line)))
        if overlap:
            scored.append((overlap, line))
    if not scored:
        return ""
    best = max(scored, key=lambda item: (item[0], -len(item[1])))[1]
    return best if len(best) <= limit else best[: limit - 1].rstrip() + "…"


def search(query: str, top_k: int = 3, root: Path = KNOWLEDGE_ROOT) -> dict[str, object]:
    if top_k < 1 or top_k > 10:
        raise ValueError("top_k must be between 1 and 10")
    terms = tokenize(query)
    if not terms:
        return {"query": query, "method": "BM25 lexical; no embeddings", "abstain": True, "results": []}
    records = load_corpus(root)
    tokenized = [tokenize(record["text"]) for record in records]
    document_frequency = Counter(token for doc in tokenized for token in set(doc))
    average_length = sum(map(len, tokenized)) / max(len(tokenized), 1)
    priority_tokenized = [tokenize(record["priority_text"]) for record in records]
    priority_frequency = Counter(token for doc in priority_tokenized for token in set(doc))
    priority_average_length = sum(map(len, priority_tokenized)) / max(len(priority_tokenized), 1)
    query_frequency = Counter(terms)
    results = []
    for record, doc_tokens, priority_tokens in zip(records, tokenized, priority_tokenized):
        frequencies = Counter(doc_tokens)
        priority_counts = Counter(priority_tokens)
        discriminative_priority_matches = sum(
            1
            for term in query_frequency
            if priority_counts.get(term, 0) and priority_frequency[term] < len(records)
        )
        score = 0.0
        for term, qf in query_frequency.items():
            tf = frequencies.get(term, 0)
            if tf:
                df = document_frequency[term]
                inverse = math.log(1 + (len(records) - df + 0.5) / (df + 0.5))
                denominator = tf + 1.2 * (0.25 + 0.75 * len(doc_tokens) / max(average_length, 1))
                score += qf * inverse * (tf * 2.2) / denominator
            priority_tf = priority_counts.get(term, 0)
            if priority_tf:
                priority_df = priority_frequency[term]
                priority_inverse = math.log(1 + (len(records) - priority_df + 0.5) / (priority_df + 0.5))
                priority_denominator = priority_tf + 1.2 * (
                    0.25 + 0.75 * len(priority_tokens) / max(priority_average_length, 1)
                )
                score += PRIORITY_WEIGHT * qf * priority_inverse * (priority_tf * 2.2) / priority_denominator
        if score > 0 and discriminative_priority_matches >= 2:
            results.append({
                "incident_id": record["incident_id"],
                "status": record["status"],
                "resolution": record["resolution"],
                "source": record["source"],
                "score": round(score, 4),
                "excerpt": _excerpt(record["text"], set(terms)),
            })
    results.sort(key=lambda result: (-result["score"], result["incident_id"]))
    selected = results[:top_k]
    return {
        "query": query,
        "method": "BM25 lexical; no embeddings",
        "abstain": not bool(selected),
        "results": selected,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Search indexed Football incident records offline.")
    parser.add_argument("query", help="natural-language or keyword query")
    parser.add_argument("--top-k", type=int, default=3)
    args = parser.parse_args()
    try:
        result = search(args.query, args.top_k)
    except (OSError, UnicodeError, ValueError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
