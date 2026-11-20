# [FOOTBALL] Incident: repository-wide Git status exposed excluded paths

- Incident ID: FOOTBALL-INC-2026-10-28-02
- Status: verified
- Resolution: open
- Observed: 2026-10-28
- Last verified: 2026-10-28
- Category: assistant workflow
- Source files: `football/AGENTS.md`, `football/knowledge/README.md`, Agent Brain policy `policies/sandbox-denial-preflight.md`
- Retrieval terms: Git root, repository status, path allowlist, excluded path, uploads boundary, truncated output

## Context / symptom

During a local documentation task, a repository-wide Git status command displayed path names from a directory explicitly excluded from inspection. The output was also truncated, so it could not establish the complete repository state.

## Confirmed observations

- Running `git rev-parse --show-toplevel` from the Football subdirectory returned the parent monorepo root, not the Football subdirectory.
- A pre-command card described checking root, branch, and status, but the argv used for that operation contained only `git rev-parse`. The structural validator passed the card, but the declared purpose and actual argv did not match.
- A later unfiltered `git status --short --branch --untracked-files=normal` at the monorepo root returned 635 lines and was truncated by the outer output limit.
- That output included path names under the protected `football/uploads/` directory. I did not open or read file contents. No files were modified by the status command.

## Unknowns and hypotheses

- Because the output was truncated, the complete repository state and all status entries were not established by that result.
- No evidence indicates that Git itself caused the scope error; the status command ran as requested.

## Confirmed cause

This was an assistant workflow error. I assumed a subdirectory was the repository root, then ran a repository-wide status at the actual monorepo root without an exact path allowlist. I also failed to compare the card's declared operation with the argv before running the first status-related command.

## Impact and artifact state

Protected path names were displayed in tool output, which violated the project boundary. File contents were not opened, copied, or modified. The broad status result remains partial and must not be used as a complete working-tree inventory.

## Resolution / invariants

- Resolve the Git root before writing the action card, then make the card's operation, target, and exact argv agree.
- For scoped work, run Git status only for the exact allowed target paths. Do not run repository-wide status when the repository contains excluded paths.
- Treat any truncated status as partial. Do not infer complete state from it.
- RAG ingestion and search must use an explicit knowledge allowlist and must never traverse or list `football/uploads/`.

## Regression checks

- Compare the action card's declared operation and target with the exact argv; a mismatch must block execution.
- Use synthetic status-output fixtures to verify that a path allowlist rejects out-of-scope path names before rendering. The fixture must not read or enumerate the real excluded directory.
- Confirm path-limited status results contain only declared target paths; classify truncation as partial.

## Follow-up / limitations

The incident-capture guide and reviewed record are in progress. An automated path-allowlist runner is not implemented yet. Keep this incident open until a scoped runner or equivalent regression checks pass.

## Thai retrieval summary

คำสั่ง `git status` แบบไม่จำกัด path แสดงรายชื่อไฟล์ใน `football/uploads/` และ output ถูกตัดทอน จึงยืนยันสถานะทั้ง repository ไม่ได้ แต่ไม่มีการเปิดอ่านเนื้อหาไฟล์ ควรตรวจ root ให้ถูกต้อง จำกัด `git status` เฉพาะ path ที่อนุญาต และถือ output ที่ถูกตัดว่าเป็นข้อมูลไม่ครบ ห้ามอ่าน ลิสต์ หรือคัดลอกไฟล์ใน `uploads/`
