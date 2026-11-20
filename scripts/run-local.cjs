const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error('Node 22.13 or newer is required');
  const file = path.join(root, '.runtime/local-server.private.json');
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('Local server configuration must be a private regular file (0600)');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const url = new URL(config.databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Local startup requires a loopback PostgreSQL URL');
  }
  process.chdir(root);
  for (const key of ['ADMIN_SESSION_SECRET', 'TEAM_SESSION_SECRET']) {
    if (config.env?.[key]) process.env[key] = config.env[key];
  }
  Object.assign(process.env, {
    NODE_ENV: 'development', PORT: '4500', DATABASE_URL: config.databaseUrl,
    BASE_URL: '', FOOTBALL_LOCAL_CONTENT_ROOT: root, FOOTBALL_LOCAL_SKIP_INIT: 'true',
    PLAYER_OCR_ENABLED: config.ocrEnabled === false ? 'false' : 'true',
    PLAYER_OCR_CONFIG_FILE: path.join(root, '.runtime/player-ocr.local.json'),
    PHASE2_ROOT: path.join(root, 'phase2'),
    PHASE2_PHP_BINARY: fs.existsSync(path.join(root, '.runtime/phase2-php/php'))
      ? path.join(root, '.runtime/phase2-php/php') : (process.env.PHASE2_PHP_BINARY || 'php')
  });
  delete process.env.PHASE2_DATABASE_URL;
  delete process.env.PHASE2_PRODUCTION_CONFIG;
  // Read-only identity check, before importing app.ts and opening the web listener.
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: config.databaseUrl, max: 1, connectionTimeoutMillis: 3000 });
  try {
    const { rows } = await pool.query('SELECT host(inet_server_addr()) AS address, current_database() AS database, pg_is_in_recovery() AS replica');
    if (!['127.0.0.1', '::1'].includes(rows[0]?.address) || rows[0]?.database !== decodeURIComponent(url.pathname.slice(1)) || rows[0]?.replica) {
      throw new Error('Local PostgreSQL identity mismatch');
    }
  } finally { await pool.end(); }
  require(path.join(root, 'dist/server.js'));
}
main().catch(error => {
  // Connection/config errors can contain credentials; emit a safe code only.
  console.error('Local startup stopped:', error.code || 'LOCAL_CONFIGURATION_OR_RUNTIME_CHECK_FAILED');
  process.exitCode = 1;
});
