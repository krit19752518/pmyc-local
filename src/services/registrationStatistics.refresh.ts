import type { Pool } from 'pg';
import { buildStatistics, DEFINITION_VERSION, dueJobKey } from './registrationStatistics.service';
import { StatisticsStore } from './registrationStatistics.store';

// Session advisory lock spans the read transaction AND atomic publication across workers.
const JOB_LOCK = [20261112, 72];
export async function refreshStatistics(database: Pool, store: StatisticsStore, now = new Date(), { force = false } = {}) {
  const client = await database.connect().catch(async error => {
    await store.recordFailure().catch(() => undefined);
    throw error;
  });
  let locked = false, transaction = false;
  try {
    const lock = await client.query('SELECT pg_try_advisory_lock($1, $2) AS locked', JOB_LOCK);
    locked = lock.rows[0]?.locked === true;
    if (!locked) return { outcome: 'locked' as const };
    const prior = await store.read();
    if (prior && prior.definitionVersion === DEFINITION_VERSION && !force && prior.jobKey >= dueJobKey(now)) return { outcome: 'already-published' as const, snapshotId: prior.snapshotId };
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); transaction = true;
    const clock = await client.query('SELECT transaction_timestamp() AS as_of');
    const asOf = new Date(clock.rows[0].as_of).toISOString();
    // Public scope excludes cancelled ages; Admin keeps its cumulative policy.
    // Never use the general reader's memory fallback,
    // active FIFO eligibility, approval/date/gender filters, or athlete joins.
    const result = await client.query(`SELECT id, categories, cancelled_categories, province, district, contact_province, contact_district
      FROM football_registered_team
      WHERE COALESCE(is_test, FALSE) = FALSE AND COALESCE(is_deleted, FALSE) = FALSE ORDER BY id`);
    if (!result.rows.length) throw new Error('Empty source requires separate operator review');
    const snapshot = buildStatistics(result.rows, asOf);
    const reference = await client.query(String.raw`SELECT
      COUNT(DISTINCT id) FILTER (WHERE 'U14' = ANY(regexp_split_to_array(upper(btrim(COALESCE(categories, ''))), '\s*,\s*'))
        AND NOT 'U14' = ANY(regexp_split_to_array(upper(btrim(COALESCE(cancelled_categories, ''))), '\s*,\s*'))) AS u14,
      COUNT(DISTINCT id) FILTER (WHERE 'U16' = ANY(regexp_split_to_array(upper(btrim(COALESCE(categories, ''))), '\s*,\s*'))
        AND NOT 'U16' = ANY(regexp_split_to_array(upper(btrim(COALESCE(cancelled_categories, ''))), '\s*,\s*'))) AS u16,
      COUNT(DISTINCT id) FILTER (WHERE 'U18' = ANY(regexp_split_to_array(upper(btrim(COALESCE(categories, ''))), '\s*,\s*'))
        AND NOT 'U18' = ANY(regexp_split_to_array(upper(btrim(COALESCE(cancelled_categories, ''))), '\s*,\s*'))) AS u18
      FROM football_registered_team
      WHERE COALESCE(is_test, FALSE) = FALSE AND COALESCE(is_deleted, FALSE) = FALSE`);
    if (!snapshot.ages.every((n, i) => n === Number(reference.rows[0]?.[['u14','u16','u18'][i]]))) throw new Error('Reference report totals do not reconcile');
    await client.query('COMMIT'); transaction = false;
    await store.publish(snapshot);
    return { outcome: 'published' as const, snapshotId: snapshot.snapshotId, asOf: snapshot.asOf };
  } catch (error) {
    if (transaction) await client.query('ROLLBACK').catch(() => undefined);
    if (locked) await store.recordFailure().catch(() => undefined);
    throw error;
  } finally {
    let destroy = false;
    if (locked) {
      try { await client.query('SELECT pg_advisory_unlock($1, $2)', JOB_LOCK); }
      catch { destroy = true; } // discard a session that could still hold the lock
    }
    client.release(destroy);
  }
}
