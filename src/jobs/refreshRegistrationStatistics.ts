import { pool } from '../db';
import { refreshStatistics } from '../services/registrationStatistics.refresh';
import { StatisticsStore } from '../services/registrationStatistics.store';

/** Run by an external singleton scheduler, never on web startup or public GET. */
export async function main() {
  try {
    const result = await refreshStatistics(pool, new StatisticsStore(), new Date(), { force: process.argv.slice(2).includes('--force') });
    console.log(JSON.stringify(result)); // aggregate metadata only
  } catch {
    console.error('Registration statistics refresh failed; last-good snapshot retained.');
    process.exitCode = 1;
  } finally { await pool.end(); }
}
if (require.main === module) void main();
