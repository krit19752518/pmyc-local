import type { Pool } from 'pg';
import { buildStatistics } from './registrationStatistics.service';

/** One consistent live read per request. No publication, job, cache or fallback. */
export async function readCurrentStatistics(database: Pool) {
  const client = await database.connect();
  let transaction = false, discard = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transaction = true;
    await client.query("SET LOCAL statement_timeout = '5s'");
    const clock = await client.query('SELECT transaction_timestamp() AS as_of');
    const asOf = new Date(clock.rows[0].as_of).toISOString();
    const result = await client.query(`SELECT id, categories, cancelled_categories, province, district, contact_province, contact_district
      FROM football_registered_team
      WHERE COALESCE(is_test, FALSE) = FALSE AND COALESCE(is_deleted, FALSE) = FALSE ORDER BY id`);
    // DB time identifies this response; it is not a scheduled collection time.
    const snapshot = buildStatistics(result.rows, asOf, asOf);
    const reference = await client.query(String.raw`SELECT
      COUNT(DISTINCT id) FILTER (WHERE 'U14' = ANY(regexp_split_to_array(upper(btrim(COALESCE(categories, ''))), '\s*,\s*'))
        AND NOT 'U14' = ANY(regexp_split_to_array(upper(btrim(COALESCE(cancelled_categories, ''))), '\s*,\s*'))) AS u14,
      COUNT(DISTINCT id) FILTER (WHERE 'U16' = ANY(regexp_split_to_array(upper(btrim(COALESCE(categories, ''))), '\s*,\s*'))
        AND NOT 'U16' = ANY(regexp_split_to_array(upper(btrim(COALESCE(cancelled_categories, ''))), '\s*,\s*'))) AS u16,
      COUNT(DISTINCT id) FILTER (WHERE 'U18' = ANY(regexp_split_to_array(upper(btrim(COALESCE(categories, ''))), '\s*,\s*'))
        AND NOT 'U18' = ANY(regexp_split_to_array(upper(btrim(COALESCE(cancelled_categories, ''))), '\s*,\s*'))) AS u18
      FROM football_registered_team
      WHERE COALESCE(is_test, FALSE) = FALSE AND COALESCE(is_deleted, FALSE) = FALSE`);
    if (!snapshot.ages.every((n, i) => n === Number(reference.rows[0]?.[['u14','u16','u18'][i]])))
      throw new Error('Statistics totals do not reconcile');
    await client.query('COMMIT'); transaction = false;
    return snapshot;
  } catch (error) {
    if (transaction) {
      try { await client.query('ROLLBACK'); } catch { discard = true; }
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
