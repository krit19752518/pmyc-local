import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFINITION_VERSION, dueJobKey, StatisticsSnapshot, validateStatistics } from './registrationStatistics.service';

export function statisticsDirectory(): string {
  return process.env.REGISTRATION_STATISTICS_DIR || path.resolve(__dirname, '../../.runtime/registration-statistics');
}
/** Private durable files, never in a static directory. No filesystem work at import time. */
export class StatisticsStore {
  constructor(readonly directory = statisticsDirectory()) {
    if (!path.isAbsolute(directory) || directory.split(path.sep).some(p => ['public','uploads'].includes(p))) throw new Error('Snapshot directory must be private and absolute');
  }
  private async safeDirectory(create = false) {
    // Refuse symlink ancestors, including a misconfigured data root.
    let prefix = path.parse(this.directory).root;
    for (const part of this.directory.slice(prefix.length).split(path.sep).filter(Boolean)) {
      prefix = path.join(prefix, part);
      if (create) await fs.mkdir(prefix, { mode: 0o700 }).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'EEXIST') throw e; });
      const stat = await fs.lstat(prefix);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe snapshot directory');
    }
  }
  private async readFile(name: string) {
    await this.safeDirectory();
    const target = path.join(this.directory, name);
    const stat = await fs.lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000) throw new Error('Unsafe snapshot file');
    return JSON.parse(await fs.readFile(target, 'utf8'));
  }
  async read(id?: string): Promise<StatisticsSnapshot | null> {
    if (id !== undefined && !/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid snapshot version');
    try {
      const value = validateStatistics(await this.readFile(id ? `${id}.json` : 'current.json'));
      if (id && id !== value.snapshotId) throw new Error('Snapshot filename mismatch');
      return value;
    }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
  }
  private async atomicWrite(name: string, value: unknown) {
    await this.safeDirectory(true);
    const temp = path.join(this.directory, `.pending-${randomUUID()}`);
    const handle = await fs.open(temp, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(value)); await handle.sync(); await handle.close();
      await fs.rename(temp, path.join(this.directory, name));
      const directory = await fs.open(this.directory, 'r');
      try { await directory.sync(); } finally { await directory.close(); }
    } catch (e) {
      await handle.close().catch(() => undefined);
      await fs.unlink(temp).catch(() => undefined); // only this operation's unique temporary file
      throw e;
    }
  }
  async publish(value: StatisticsSnapshot) {
    const snapshot = validateStatistics(value);
    if (snapshot.definitionVersion !== DEFINITION_VERSION) throw new Error('Cannot publish a historical statistics definition');
    const prior = await this.read();
    if (prior && prior.asOf >= snapshot.asOf) throw new Error('Refusing snapshot time regression');
    // Immutable versions retained for open pages/CSV. Only the current pointer changes.
    await this.atomicWrite(`${snapshot.snapshotId}.json`, snapshot);
    await this.atomicWrite('current.json', snapshot);
  }
  async recordFailure() { await this.atomicWrite('failure.json', { failedAt: new Date().toISOString() }); }
  async stale(snapshot: StatisticsSnapshot, now = new Date()) {
    if (snapshot.jobKey < dueJobKey(now)) return true;
    try {
      const failure = await this.readFile('failure.json');
      return typeof failure.failedAt !== 'string' || failure.failedAt > snapshot.generatedAt;
    } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false; return true; }
  }
}
