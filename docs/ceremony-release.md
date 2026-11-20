# Issue82: ceremony release

Tracking: https://github.com/krit19752518/pmyc-football/issues/82
Related Dashboard issue: #81. GitHub base: 1efb506403245966d6a7868246215bf8696d8a8a.

## Behavior

Super Admin can explicitly prepare a missing Stage1 competition before the separate start action. Ceremony shows one white named ball per team, four-line ellipsis with full-name tooltips, saved-slot reveal into the bracket, and read-only replay of the current committed version. Direct-entry and single-team qualification are represented. Mobile and reduced motion are supported. Backend randomness, assignment permissions, confirmation/lock and publication rules remain unchanged.

Owner reports Local4500 UAT passed (2026-11-14). No operational draw was created by the agent. Existing dirty Local files are preserved.

## Verification

Clean candidate focused tests: 73/73. Full Jest: 1055/1055 in 70 suites, including production-parity. TypeScript build passed; generated dist files unchanged. Incident retrieval: 50/50. PHP/JavaScript syntax checks and scoped diff check are required before publication.

## Runtime allowlist

- `phase2/src/CeremonyPages.php` — SHA-256 `5a71f177e0fc2b351da0425fa6e62e3a0db72a409ad5c884793e908e82e405c6`
- `phase2/src/WorkspaceView.php` — SHA-256 `6b069002eb2e7cbd471796a170d8f2baf72f4c8cc90415b56a568b275f5e2d20`
- `phase2/public/assets/workspace.js` — SHA-256 `dbe8c9c7eb7b0880bbe7144d0e896e4abd5b7a4022948ad415d4ddada3627d85`
- `phase2/public/assets/workspace.css` — SHA-256 `d9c418c871ca8ca11f9674641b0406223342ac339af05ebf8449343e5085e7d5`

## Deployment boundary

Production read-only inspection found the four current runtime hashes equal the GitHub base versions; the server checkout remains a separate legacy identity. Release only these four artifacts from the reviewed GitHub commit. Tests/knowledge/docs stay in GitHub. No OCR files, dist artifacts, schema/data updates, install/build, broad synchronization or checkout update are included.

Gate A requires explicit approval of exact stage/target/backup paths and hashes. Gate B separately covers promotion, any required restart, verification and conditional exact-path rollback. Startup side effects must be freshly reviewed if a restart is required. Replaying a saved result is the Production UI check; do not create an operational draw for release testing. Keep Issue82 open until Production UAT and explicit closure.
