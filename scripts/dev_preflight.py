#!/usr/bin/env python3
"""Read-only Dev VPS preflight checker for grit-solution/football.

Verifies Dev identity, Git root, credential-sanitized origin, base vs candidate
SHA/tree, scoped working-tree status (excluding uploads/.runtime/.env*),
preview serving path/revision, and SHA-256 of loaded artifacts.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

DEFAULT_DEV_HOST = "118.27.146.15"
DEFAULT_DEV_PORT = 9922
DEFAULT_DEV_USER = "zbpzpszw"
DEFAULT_DEV_WORKSPACE = "/home/zbpzpszw/football-dev/workspace"
DEFAULT_DOCROOT = "/home/zbpzpszw/public_html/football-dev.pmycfootball.in.th"
DEFAULT_PREVIEW_URL = "https://football-dev.pmycfootball.in.th"
DEFAULT_SSH_BIN = "/home/krit/.hermes/profiles/football/transport-bin/ssh"

LOCAL_FORBIDDEN_PREFIXES = (
    "/home/krit/",
    "/Users/",
    "C:\\",
)
PRODUCTION_FORBIDDEN_PREFIXES = (
    "/home/zbpzpszw/football_app",
    "/home/zbpzpszw/public_html/pmycfootball.in.th",
)

CREDENTIAL_URL_RE = re.compile(r"(https?://)([^/@\s]+)@")
GITHUB_SLUG_RE = re.compile(
    r"(?:git@github\.com:|https?://(?:[^/@]+@)?github\.com/)([^/\s]+/[^/\s]+?)(?:\.git)?$"
)


def sanitize_origin(url: str) -> str:
    """Strip embedded credentials from HTTP(S) Git remote URLs."""
    return CREDENTIAL_URL_RE.sub(r"\1***@", url.strip())


def extract_repo_slug(origin_url: str) -> str | None:
    """Extract owner/repo slug from a GitHub SSH or HTTPS remote URL."""
    m = GITHUB_SLUG_RE.match(origin_url.strip())
    return m.group(1) if m else None


def load_expected_repo(identity_path: Path) -> str:
    """Load expected GitHub repository_full_name from project-identity.json."""
    if not identity_path.exists():
        return "krit19752518/pmyc-football"
    data = json.loads(identity_path.read_text(encoding="utf-8"))
    return str(data.get("issue_tracker", {}).get("repository_full_name") or "krit19752518/pmyc-football")


def is_local_or_prod_path(path_str: str) -> str | None:
    """Return error code if path points to Local or Production instead of Dev."""
    norm = path_str.strip()
    for prefix in LOCAL_FORBIDDEN_PREFIXES:
        if norm.startswith(prefix):
            return "LOCAL_PATH_REJECTED"
    for prefix in PRODUCTION_FORBIDDEN_PREFIXES:
        if norm.startswith(prefix):
            return "PRODUCTION_PATH_REJECTED"
    return None


def parse_porcelain_status(raw_status: str) -> list[dict[str, str]]:
    """Parse `git status --porcelain=v1` lines into structured entries."""
    entries: list[dict[str, str]] = []
    for line in raw_status.splitlines():
        if not line.strip() or len(line) < 4:
            continue
        xy = line[:2]
        path_part = line[3:]
        if " -> " in path_part:
            path_part = path_part.split(" -> ", 1)[1]
        if xy == "??":
            kind = "untracked"
        elif xy[0] != " " and xy[1] != " ":
            kind = "staged+unstaged"
        elif xy[0] != " ":
            kind = "staged"
        else:
            kind = "unstaged"
        entries.append({"code": xy, "kind": kind, "path": path_part})
    return entries


def parse_passenger_htaccess(htaccess_text: str) -> dict[str, str]:
    """Extract Passenger directives from an Apache .htaccess file."""
    info: dict[str, str] = {}
    for key in ("PassengerAppRoot", "PassengerBaseURI", "PassengerNodejs", "PassengerStartupFile", "PassengerAppEnv"):
        m = re.search(rf"^\s*{key}\s+(.+?)\s*$", htaccess_text, re.MULTILINE)
        if m:
            info[key] = m.group(1).strip()
    return info


def build_remote_probe_script(
    worktree: str,
    base_ref: str | None,
    docroot: str,
    preview_path: str,
    artifacts: list[str],
) -> str:
    """Build a read-only POSIX shell script to inspect Dev VPS state."""
    wt_q = shlex.quote(worktree)
    doc_q = shlex.quote(docroot)
    base_q = shlex.quote(base_ref) if base_ref else "''"
    sub_dir = preview_path.strip("/")
    sub_htaccess_q = shlex.quote(f"{docroot}/{sub_dir}/.htaccess") if sub_dir else "''"
    sub_gateway_q = shlex.quote(f"{docroot}/{sub_dir}/gateway.php") if sub_dir else "''"

    art_cmds = []
    for art in artifacts:
        art_q = shlex.quote(art)
        art_cmds.append(
            f'if [ -f {wt_q}/{art_q} ]; then printf "WT_ART:%s:%s\\n" {art_q} "$(sha256sum {wt_q}/{art_q} | awk \'{{print $1}}\')"; '
            f'else printf "WT_ART:%s:MISSING\\n" {art_q}; fi'
        )
    art_block = "\n".join(art_cmds) if art_cmds else ":"

    return f"""
set -u
echo "PF_BEGIN=1"
echo "PF_HOST=$(hostname 2>/dev/null || echo unknown)"
echo "PF_USER=$(id -un 2>/dev/null || echo unknown)"
if [ ! -d {wt_q} ]; then
  echo "PF_ERR=WORKTREE_MISSING"
  echo "PF_END=1"
  exit 0
fi
GIT_ROOT=$(git -C {wt_q} rev-parse --show-toplevel 2>/dev/null || echo "")
echo "PF_GIT_ROOT=$GIT_ROOT"
ORIGIN_RAW=$(git -C {wt_q} remote get-url origin 2>/dev/null || echo "")
echo "PF_ORIGIN=$ORIGIN_RAW"
BRANCH=$(git -C {wt_q} branch --show-current 2>/dev/null || echo "")
echo "PF_BRANCH=$BRANCH"
CAND_SHA=$(git -C {wt_q} rev-parse HEAD 2>/dev/null || echo "")
CAND_TREE=$(git -C {wt_q} rev-parse 'HEAD^{{tree}}' 2>/dev/null || echo "")
echo "PF_CAND_SHA=$CAND_SHA"
echo "PF_CAND_TREE=$CAND_TREE"
BASE_REF={base_q}
if [ -n "$BASE_REF" ]; then
  BASE_SHA=$(git -C {wt_q} rev-parse "$BASE_REF" 2>/dev/null || echo "")
  BASE_TREE=$(git -C {wt_q} rev-parse "$BASE_REF^{{tree}}" 2>/dev/null || echo "")
else
  BASE_SHA=""
  BASE_TREE=""
fi
echo "PF_BASE_SHA=$BASE_SHA"
echo "PF_BASE_TREE=$BASE_TREE"
echo "PF_STATUS_BEGIN"
git -C {wt_q} status --porcelain=v1 --untracked-files=normal -- . ':!uploads/' ':!**/uploads/' ':!.runtime/' ':!**/.runtime/' ':!.env*' ':!**/.env*' 2>/dev/null || echo "PF_STATUS_ERR"
echo "PF_STATUS_END"
echo "PF_HTACCESS_BEGIN"
cat {doc_q}/.htaccess 2>/dev/null || true
echo "PF_HTACCESS_END"
if [ -n {sub_htaccess_q} ] && [ -f {sub_htaccess_q} ]; then
  echo "PF_SUB_HTACCESS_BEGIN"
  cat {sub_htaccess_q} 2>/dev/null || true
  echo "PF_SUB_HTACCESS_END"
fi
if [ -n {sub_gateway_q} ] && [ -f {sub_gateway_q} ]; then
  echo "PF_SUB_GATEWAY_BEGIN"
  grep -Eo '/home/[^[:space:]"]+' {sub_gateway_q} 2>/dev/null | head -n 5 || true
  echo "PF_SUB_GATEWAY_END"
fi
{art_block}
echo "PF_END=1"
""".strip()


def parse_remote_probe_output(raw: str) -> dict[str, Any]:
    """Parse structured markers from the remote probe output."""
    if "PF_BEGIN=1" not in raw or "PF_END=1" not in raw:
        raise ValueError("INCOMPLETE_TRANSPORT_OUTPUT")

    kv: dict[str, str] = {}
    status_lines: list[str] = []
    htaccess_lines: list[str] = []
    sub_htaccess_lines: list[str] = []
    sub_gateway_lines: list[str] = []
    wt_artifacts: dict[str, str] = {}

    mode: str | None = None
    for line in raw.splitlines():
        if line == "PF_STATUS_BEGIN":
            mode = "status"
            continue
        if line == "PF_STATUS_END":
            mode = None
            continue
        if line == "PF_HTACCESS_BEGIN":
            mode = "htaccess"
            continue
        if line == "PF_HTACCESS_END":
            mode = None
            continue
        if line == "PF_SUB_HTACCESS_BEGIN":
            mode = "sub_htaccess"
            continue
        if line == "PF_SUB_HTACCESS_END":
            mode = None
            continue
        if line == "PF_SUB_GATEWAY_BEGIN":
            mode = "sub_gateway"
            continue
        if line == "PF_SUB_GATEWAY_END":
            mode = None
            continue

        if mode == "status":
            status_lines.append(line)
        elif mode == "htaccess":
            htaccess_lines.append(line)
        elif mode == "sub_htaccess":
            sub_htaccess_lines.append(line)
        elif mode == "sub_gateway":
            sub_gateway_lines.append(line)
        elif line.startswith("WT_ART:"):
            _, art_path, digest = line.split(":", 2)
            wt_artifacts[art_path] = digest
        elif "=" in line and line.startswith("PF_"):
            k, v = line.split("=", 1)
            kv[k] = v

    return {
        "kv": kv,
        "status_raw": "\n".join(status_lines),
        "htaccess_raw": "\n".join(htaccess_lines),
        "sub_htaccess_raw": "\n".join(sub_htaccess_lines),
        "sub_gateway_paths": sub_gateway_lines,
        "worktree_artifacts": wt_artifacts,
    }


def ssh_transport_runner(
    ssh_bin: str,
    user: str,
    host: str,
    port: int,
    script: str,
) -> tuple[int, str, str]:
    """Execute read-only probe over approved SSH transport."""
    cmd = [ssh_bin, "-p", str(port), "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", f"{user}@{host}", script]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    return proc.returncode, proc.stdout, proc.stderr


def default_http_probe(url: str) -> dict[str, Any]:
    """Perform a lightweight read-only HTTP GET check for preview auxiliary status."""
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return {"status": resp.status, "error": None}
    except urllib.error.HTTPError as err:
        return {"status": err.code, "error": None}
    except Exception as exc:  # noqa: BLE001
        return {"status": None, "error": str(exc)}


def run_preflight(
    *,
    issue: str,
    worktree: str,
    preview: str,
    base_ref: str | None = None,
    allow_paths: list[str] | None = None,
    artifacts: list[str] | None = None,
    expected_repo: str = "krit19752518/pmyc-football",
    docroot: str = DEFAULT_DOCROOT,
    ssh_bin: str = DEFAULT_SSH_BIN,
    ssh_user: str = DEFAULT_DEV_USER,
    ssh_host: str = DEFAULT_DEV_HOST,
    ssh_port: int = DEFAULT_DEV_PORT,
    check_http: bool = False,
    transport_fn: Callable[[str], tuple[int, str, str]] | None = None,
    http_fn: Callable[[str], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Run read-only Dev preflight and return structured report."""
    measured_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    allow_set = set(allow_paths or [])
    artifact_list = list(artifacts or [])
    errors: list[dict[str, str]] = []
    warnings: list[str] = []

    report: dict[str, Any] = {
        "ok": False,
        "issue": issue,
        "measured_at": measured_at,
        "target_worktree": worktree,
        "expected_repository": expected_repo,
        "status_scope": {
            "excluded": ["uploads/", "**/uploads/", ".runtime/", "**/.runtime/", ".env*", "**/.env*"],
            "note": "Read-only scoped status; excluded operational/runtime paths are not inspected.",
        },
        "preview": {
            "requested": preview,
            "status": "pending" if preview.strip().lower() == "pending" else "unknown",
            "serving_path": None,
            "serving_revision": None,
            "http": None,
        },
        "git": {},
        "artifacts": {},
        "errors": errors,
        "warnings": warnings,
    }

    path_err = is_local_or_prod_path(worktree)
    if path_err:
        errors.append({"code": path_err, "detail": f"Worktree path {worktree} is not a Dev VPS path."})
        return report

    preview_is_pending = preview.strip().lower() == "pending"
    preview_path = "/"
    if not preview_is_pending:
        parsed_preview = urlparse(preview)
        if parsed_preview.hostname in ("localhost", "127.0.0.1"):
            errors.append({"code": "LOCAL_PREVIEW_REJECTED", "detail": f"Preview URL {preview} points to Local."})
            return report
        preview_path = parsed_preview.path or "/"

    script = build_remote_probe_script(worktree, base_ref, docroot, preview_path, artifact_list)
    runner = transport_fn or (lambda s: ssh_transport_runner(ssh_bin, ssh_user, ssh_host, ssh_port, s))

    try:
        rc, stdout, stderr = runner(script)
    except Exception as exc:  # noqa: BLE001
        errors.append({"code": "DEV_UNREACHABLE", "detail": str(exc)})
        return report

    if rc != 0 and "PF_BEGIN=1" not in stdout:
        errors.append({"code": "DEV_UNREACHABLE", "detail": stderr.strip() or f"Transport exited {rc}"})
        return report

    try:
        parsed = parse_remote_probe_output(stdout)
    except ValueError as exc:
        errors.append({"code": str(exc), "detail": "Remote probe output missing start/end markers."})
        return report

    kv = parsed["kv"]
    if kv.get("PF_ERR") == "WORKTREE_MISSING":
        errors.append({"code": "WORKTREE_MISSING", "detail": f"Dev worktree does not exist: {worktree}"})
        return report

    git_root = kv.get("PF_GIT_ROOT", "")
    if not git_root:
        errors.append({"code": "GIT_ROOT_MISSING", "detail": f"Not a Git worktree: {worktree}"})
        return report

    root_err = is_local_or_prod_path(git_root)
    if root_err:
        errors.append({"code": root_err, "detail": f"Resolved Git root {git_root} is forbidden."})
        return report

    if os.path.normpath(git_root) != os.path.normpath(worktree):
        errors.append(
            {"code": "GIT_ROOT_MISMATCH", "detail": f"Expected worktree {worktree}, got Git root {git_root}."}
        )

    origin_raw = kv.get("PF_ORIGIN", "")
    sanitized_origin = sanitize_origin(origin_raw)
    slug = extract_repo_slug(origin_raw)
    if slug != expected_repo:
        errors.append(
            {
                "code": "WRONG_ORIGIN",
                "detail": f"Origin {sanitized_origin!r} (slug={slug!r}) does not match {expected_repo!r}.",
            }
        )

    cand_sha = kv.get("PF_CAND_SHA", "")
    cand_tree = kv.get("PF_CAND_TREE", "")
    base_sha = kv.get("PF_BASE_SHA", "")
    base_tree = kv.get("PF_BASE_TREE", "")

    if base_ref and (not base_sha or not base_tree):
        errors.append({"code": "BASE_UNVERIFIABLE", "detail": f"Cannot resolve base ref {base_ref!r} on Dev."})

    tree_parity = "unknown"
    if base_sha and cand_sha:
        if base_sha == cand_sha:
            tree_parity = "same_commit"
        elif base_tree and cand_tree and base_tree == cand_tree:
            tree_parity = "identical_tree_different_sha"
            warnings.append("Candidate SHA differs from base SHA, but Git tree hash is identical (no source diff).")
        else:
            tree_parity = "diverged_or_ahead"

    if parsed["status_raw"] == "PF_STATUS_ERR":
        errors.append({"code": "INCOMPLETE_TRANSPORT_OUTPUT", "detail": "Git status failed on Dev."})
        status_entries: list[dict[str, str]] = []
    else:
        status_entries = parse_porcelain_status(parsed["status_raw"])

    unexplained = [e for e in status_entries if e["path"] not in allow_set]
    if unexplained:
        errors.append(
            {
                "code": "UNEXPLAINED_CHANGES",
                "detail": "Unexplained changes in scoped worktree: " + ", ".join(e["path"] for e in unexplained),
            }
        )

    report["git"] = {
        "host": kv.get("PF_HOST"),
        "user": kv.get("PF_USER"),
        "git_root": git_root,
        "origin_sanitized": sanitized_origin,
        "repo_slug": slug,
        "branch": kv.get("PF_BRANCH") or "(detached)",
        "candidate_sha": cand_sha,
        "candidate_tree": cand_tree,
        "base_ref": base_ref,
        "base_sha": base_sha or None,
        "base_tree": base_tree or None,
        "tree_parity": tree_parity,
        "status_entries": status_entries,
        "unexplained_changes": unexplained,
    }
    report["artifacts"] = parsed["worktree_artifacts"]

    if not preview_is_pending:
        serving_path: str | None = None
        if preview_path in ("", "/"):
            passenger = parse_passenger_htaccess(parsed["htaccess_raw"])
            serving_path = passenger.get("PassengerAppRoot")
        else:
            sub_passenger = parse_passenger_htaccess(parsed["sub_htaccess_raw"])
            if sub_passenger.get("PassengerAppRoot"):
                serving_path = sub_passenger["PassengerAppRoot"]
            elif parsed["sub_gateway_paths"]:
                serving_path = parsed["sub_gateway_paths"][0]

        if not serving_path:
            errors.append(
                {
                    "code": "SERVING_IDENTITY_UNAVAILABLE",
                    "detail": f"Could not determine serving path for preview {preview}.",
                }
            )
            report["preview"]["status"] = "unverifiable"
        else:
            report["preview"]["serving_path"] = serving_path
            if os.path.normpath(serving_path) != os.path.normpath(worktree):
                errors.append(
                    {
                        "code": "PREVIEW_MISMATCH",
                        "detail": f"Preview {preview} is served by {serving_path}, not {worktree}.",
                    }
                )
                report["preview"]["status"] = "mismatch"
            else:
                report["preview"]["status"] = "matched"
                report["preview"]["serving_revision"] = cand_sha

        if check_http:
            probe = http_fn or default_http_probe
            report["preview"]["http"] = probe(preview)

    report["ok"] = len(errors) == 0
    return report


def format_human(report: dict[str, Any]) -> str:
    """Format a concise human-readable preflight summary."""
    lines = [
        f"Preflight: {'PASS' if report['ok'] else 'FAIL'} (issue={report['issue']}, measured_at={report['measured_at']})",
        f"Worktree: {report['target_worktree']}",
    ]
    git_info = report.get("git") or {}
    if git_info:
        lines.append(f"Origin:   {git_info.get('origin_sanitized')} (slug={git_info.get('repo_slug')})")
        lines.append(f"Branch:   {git_info.get('branch')}")
        lines.append(f"Cand SHA: {git_info.get('candidate_sha')} (tree={git_info.get('candidate_tree')})")
        if git_info.get("base_ref"):
            lines.append(
                f"Base SHA: {git_info.get('base_sha')} (tree={git_info.get('base_tree')}, parity={git_info.get('tree_parity')})"
            )
        lines.append(f"Changes:  {len(git_info.get('status_entries', []))} scoped entries")
    prev = report.get("preview", {})
    lines.append(
        f"Preview:  {prev.get('requested')} -> status={prev.get('status')}, serving_path={prev.get('serving_path')}"
    )
    if report.get("artifacts"):
        for k, v in report["artifacts"].items():
            lines.append(f"Artifact: {k} sha256={v}")
    for w in report.get("warnings", []):
        lines.append(f"WARN:     {w}")
    for e in report.get("errors", []):
        lines.append(f"ERROR:    [{e['code']}] {e['detail']}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only Dev VPS preflight for grit-solution/football.")
    parser.add_argument("--issue", required=True, help="Issue number or identifier (e.g. 102 or issue102).")
    parser.add_argument("--worktree", required=True, help="Intended Dev VPS worktree path.")
    parser.add_argument("--preview", required=True, help="Intended preview URL or 'pending'.")
    parser.add_argument("--base", default=None, help="Expected base SHA or ref (e.g. origin/main).")
    parser.add_argument("--allow", action="append", default=[], help="Allowed dirty/untracked path in scope.")
    parser.add_argument("--artifact", action="append", default=[], help="Built artifact relative path to SHA-256 hash.")
    parser.add_argument("--identity", default="knowledge/project-identity.json", help="Path to project-identity.json.")
    parser.add_argument("--docroot", default=DEFAULT_DOCROOT, help="Dev web document root.")
    parser.add_argument("--ssh-bin", default=DEFAULT_SSH_BIN, help="Approved SSH transport binary.")
    parser.add_argument("--ssh-user", default=DEFAULT_DEV_USER, help="Dev SSH user.")
    parser.add_argument("--ssh-host", default=DEFAULT_DEV_HOST, help="Dev SSH host.")
    parser.add_argument("--ssh-port", type=int, default=DEFAULT_DEV_PORT, help="Dev SSH port.")
    parser.add_argument("--check-http", action="store_true", help="Also run auxiliary HTTP GET check on preview URL.")
    parser.add_argument("--json", action="store_true", help="Output JSON report.")
    args = parser.parse_args(argv)

    expected_repo = load_expected_repo(Path(args.identity))
    report = run_preflight(
        issue=args.issue,
        worktree=args.worktree,
        preview=args.preview,
        base_ref=args.base,
        allow_paths=args.allow,
        artifacts=args.artifact,
        expected_repo=expected_repo,
        docroot=args.docroot,
        ssh_bin=args.ssh_bin,
        ssh_user=args.ssh_user,
        ssh_host=args.ssh_host,
        ssh_port=args.ssh_port,
        check_http=args.check_http,
    )
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(format_human(report))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
