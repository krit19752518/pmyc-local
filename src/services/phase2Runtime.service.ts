import { ChildProcess, spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import net from 'net';
import path from 'path';

export function phase2DatabaseEnvironment(root: string, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  if (env.NODE_ENV === 'test') {
    return env.PHASE2_TEST_DATABASE === '1' && env.PHASE2_TEST_DSN
      ? { PHASE2_TEST_DATABASE: '1', PHASE2_TEST_DSN: env.PHASE2_TEST_DSN, PHASE2_TEST_USER: env.PHASE2_TEST_USER || 'p2test' }
      : {};
  }
  const config = path.join(root, '.runtime/database-enabled.json');
  if (!existsSync(config)) return {};
  const expected = JSON.parse(readFileSync(config, 'utf8'));
  const value = env.PHASE2_DATABASE_URL || env.DATABASE_URL;
  if (!value) throw new Error('Phase 2 database is not configured');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== expected.host || (url.port || '5432') !== String(expected.port)
      || decodeURIComponent(url.pathname.slice(1)) !== expected.database) throw new Error('Phase 2 database target mismatch');
  if (env.NODE_ENV === 'development' && env.FOOTBALL_VPS_DEV === '1') {
    const ca = env.FOOTBALL_DEV_DB_CA_FILE || '';
    if (!path.isAbsolute(ca) || !existsSync(ca)) throw new Error('Dev database CA is not configured');
    // libpq verifies the dedicated self-signed server CA. The Node pool also
    // checks the certificate's DNS name; no verification is disabled.
    return { PHASE2_DATABASE_URL: value, PGSSLMODE: 'verify-ca', PGSSLROOTCERT: ca };
  }
  return { PHASE2_DATABASE_URL: value };
}

/** Local development sidecar only. No database initialization or credentials. */
export class Phase2Runtime {
  readonly secret = randomBytes(32).toString('hex');
  private child: ChildProcess | null = null;
  private starting: Promise<number> | null = null;
  private hooked = false;
  constructor(readonly root = process.env.PHASE2_ROOT || path.resolve(__dirname, '../../phase2')) {}

  close(): void {
    this.child?.kill();
    this.child = null;
    this.starting = null;
  }

  async port(): Promise<number> {
    if (this.starting) return this.starting;
    this.starting = this.launch().catch(error => { this.starting = null; throw error; });
    return this.starting;
  }

  private async launch(): Promise<number> {
    if (process.env.NODE_ENV === 'production') throw new Error('Development PHP sidecar is disabled in Production');
    if (!this.hooked) {
      this.hooked = true;
      process.once('exit', () => this.close());
      for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { this.close(); process.exit(0); });
    }
    const binary = process.env.PHASE2_PHP_BINARY || (existsSync(path.join(this.root, '.runtime/php')) ? path.join(this.root, '.runtime/php') : 'php');
    const port = await new Promise<number>((resolve, reject) => {
      const socket = net.createServer();
      socket.once('error', reject);
      socket.listen(0, '127.0.0.1', () => {
        const address = socket.address() as net.AddressInfo;
        socket.close(() => resolve(address.port));
      });
    });
    return new Promise<number>((resolve, reject) => {
      const child = spawn(binary, ['-S', `127.0.0.1:${port}`, '-t', path.join(this.root, 'public'), path.join(this.root, 'public/router.php')], {
        cwd: this.root,
        env: { PATH: process.env.PATH, LANG: 'C.UTF-8', PMYC_PHASE2_BRIDGE_SECRET: this.secret, ...phase2DatabaseEnvironment(this.root) },
        stdio: ['ignore', 'ignore', 'pipe']
      });
      this.child = child;
      let settled = false;
      const fail = () => {
        if (!settled) { settled = true; clearTimeout(timer); child.kill(); reject(new Error('PHP runtime unavailable')); }
      };
      const timer = setTimeout(fail, 5000);
      child.once('error', fail);
      child.once('exit', () => { fail(); if (this.child === child) { this.child = null; this.starting = null; } });
      child.stderr?.on('data', (data: Buffer) => {
        if (!settled && data.toString().includes('Development Server')) { settled = true; clearTimeout(timer); resolve(port); }
      });
    });
  }
}
