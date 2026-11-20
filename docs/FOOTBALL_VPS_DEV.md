# Football VPS Dev

The owner approved server-based Football development on 2026-11-15, and confirmed on
2026-11-18 that all new Football issues start and run on **Dev VPS** in an isolated
candidate worktree. Hermes runs on the owner's computer; project files and the running
Dev app live on the App Server. GitHub remains the code hub.

| Component | Location |
| --- | --- |
| GitHub | `krit19752518/pmyc-football` |
| Hermes profile | `football`, on the owner's computer |
| App Server | `118.27.146.15`, SSH `9922`, user `zbpzpszw` |
| Workspace | `/home/zbpzpszw/football-dev/workspace` |
| Issue worktrees | `/home/zbpzpszw/football-dev/workspace/.runtime/issueNN-topic` |
| Private settings | `/home/zbpzpszw/football-dev/shared/` |
| Web document root | `/home/zbpzpszw/public_html/football-dev.pmycfootball.in.th` |
| Dev URL | `https://football-dev.pmycfootball.in.th` |
| Dev DB | `143.14.36.234:5432/football_dev` |
| Runtime DB role | `football_dev_app`, five connections maximum |

The Dev startup file is `dev-start.cjs`, launched through
`scripts/node-vps-dev.sh`. The wrapper uses one V8/libuv/libvips pool worker
and a 384 MB Node heap budget, matching the native-library constraints
observed on the shared cPanel host. It requires owned private settings,
the exact Dev workspace and DB identity, and the pinned PostgreSQL server
certificate. It runs in explicit development mode with initialization
disabled. The Node pool uses three connections, leaving room for the PHP
sidecar. `scripts/php-vps-dev.sh` enables the installed PHP 8.4 PostgreSQL
driver for this process only; the account's global PHP settings are preserved.
PHP verifies the dedicated PostgreSQL certificate through libpq.
Basic authentication protects the entire Dev app. Session secrets are new
and cookies remain host-specific. Outbound email and paid OCR are disabled.

The initial database snapshot selected 39 Football, Phase 2 and admin tables
from Local PostgreSQL 18.6 and restored them into Dev PostgreSQL 16.14 in one
transaction. Counts were checked against the snapshot for every table. The
only dump syntax adjustment removed PostgreSQL 18's `transaction_timeout`
setting. Other tenants were excluded. Uploads and attachments were not copied;
rows may reference files that are not available in Dev yet.

The initial source baseline was reconciled with actual Production artifacts,
not only the Production checkout SHA. Business behavior includes the live
Issue86 official rule and the live public download link. Dev-specific changes
are documented in tests: local registration navigation, guarded startup,
verified database TLS, a smaller pool, email suppression and removal of a
legacy embedded SMTP key. Historical Git objects may still contain the old
key; the owner must revoke/rotate it if active. Production credentials were
not rotated by this setup.

Before a task, verify GitHub `main`, Dev workspace/branch, active UAT previews,
and preserve other worktrees. Create an isolated task branch and worktree under
`/home/zbpzpszw/football-dev/workspace/.runtime/issueNN-topic` (from verified `main`,
or from a Production-reconciled source base for an urgent hotfix). Build with Node 22
and run the relevant tests inside that worktree. Verify which candidate/worktree serves
the target preview URL (`https://football-dev.pmycfootball.in.th` or an isolated preview
path) before Owner UAT. Full browser/fixture tests can run on the owner's computer or
controlled CI to avoid heavy loads on the shared App Server. The setup does not authorize
Production deployment, Production DB access, automatic `main` pushes, or merges.

The App Server account is shared with Production. Directory separation and
agent instructions are not an OS security boundary; the Dev GitHub key is
repository-scoped and the DB role is restricted separately. Do not treat the
shared UID as safe for unrestricted unattended agents.
