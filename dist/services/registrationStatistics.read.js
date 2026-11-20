"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readRegistrationStatistics = readRegistrationStatistics;
exports.readApprovalStatistics = readApprovalStatistics;
exports.readCurrentStatistics = readCurrentStatistics;
const registrationStatistics_service_1 = require("./registrationStatistics.service");
const registrationStatistics_date_1 = require("./registrationStatistics.date");
async function withReadOnlyRepeatableRead(database, fn) {
    const client = await database.connect();
    let transaction = false, discard = false;
    try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        transaction = true;
        await client.query("SET LOCAL statement_timeout = '5s'");
        const clock = await client.query('SELECT transaction_timestamp() AS as_of');
        const asOf = new Date(clock.rows[0].as_of).toISOString();
        const result = await fn(client, asOf);
        await client.query('COMMIT');
        transaction = false;
        return result;
    }
    catch (error) {
        if (transaction) {
            try {
                await client.query('ROLLBACK');
            }
            catch {
                discard = true;
            }
        }
        throw error;
    }
    finally {
        client.release(discard);
    }
}
/** Date-filtered and trend-enabled registration statistics read. */
async function readRegistrationStatistics(database, dateRange) {
    return withReadOnlyRepeatableRead(database, async (client, asOf) => {
        const teamsRes = await client.query(`SELECT id, categories, cancelled_categories, province, district, contact_province, contact_district, created_at
      FROM football_registered_team
      WHERE COALESCE(is_test, FALSE) = FALSE AND COALESCE(is_deleted, FALSE) = FALSE ORDER BY id`);
        const auditRes = await client.query(`SELECT team_id, event_type, old_state, new_state, created_at
      FROM football_audit_log
      WHERE event_type IN ('TEAM_CATEGORY_REGISTERED', 'TEAM_CATEGORY_ADDED', 'TEAM_UPDATED')
        AND team_id IS NOT NULL
      ORDER BY created_at ASC`);
        return (0, registrationStatistics_date_1.buildRegistrationStatisticsForRange)(teamsRes.rows, auditRes.rows, asOf, dateRange);
    });
}
/** Date-filtered and trend-enabled age-group approval statistics read (OQ1-OQ5). */
async function readApprovalStatistics(database, dateRange) {
    return withReadOnlyRepeatableRead(database, async (client, asOf) => {
        const teamsRes = await client.query(`SELECT id, status, categories, cancelled_categories, province, district, contact_province, contact_district, created_at
      FROM football_registered_team
      WHERE COALESCE(is_test, FALSE) = FALSE AND COALESCE(is_deleted, FALSE) = FALSE ORDER BY id`);
        const playersRes = await client.query(`SELECT p.id, p.team_id, p.category, p.doc_status
      FROM football_player p
      INNER JOIN football_registered_team t ON t.id = p.team_id
      WHERE COALESCE(t.is_test, FALSE) = FALSE AND COALESCE(t.is_deleted, FALSE) = FALSE`);
        const auditRes = await client.query(`SELECT team_id, entity_id, event_type, old_state, new_state, created_at
      FROM football_audit_log
      WHERE event_type IN ('TEAM_STATUS_CHANGED', 'PLAYER_DOCUMENT_STATUS_CHANGED')
      ORDER BY created_at ASC`);
        return (0, registrationStatistics_date_1.buildApprovalStatisticsForRange)(teamsRes.rows, playersRes.rows, auditRes.rows, asOf, dateRange);
    });
}
/** One consistent live read per request. No publication, job, cache or fallback. */
async function readCurrentStatistics(database) {
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
        const snapshot = (0, registrationStatistics_service_1.buildStatistics)(result.rows, asOf, asOf);
        const reference = await client.query(String.raw `SELECT
      COUNT(DISTINCT id) FILTER (WHERE 'U14' = ANY(regexp_split_to_array(upper(btrim(COALESCE(categories, ''))), '\s*,\s*'))
        AND NOT 'U14' = ANY(regexp_split_to_array(upper(btrim(COALESCE(cancelled_categories, ''))), '\s*,\s*'))) AS u14,
      COUNT(DISTINCT id) FILTER (WHERE 'U16' = ANY(regexp_split_to_array(upper(btrim(COALESCE(categories, ''))), '\s*,\s*'))
        AND NOT 'U16' = ANY(regexp_split_to_array(upper(btrim(COALESCE(cancelled_categories, ''))), '\s*,\s*'))) AS u16,
      COUNT(DISTINCT id) FILTER (WHERE 'U18' = ANY(regexp_split_to_array(upper(btrim(COALESCE(categories, ''))), '\s*,\s*'))
        AND NOT 'U18' = ANY(regexp_split_to_array(upper(btrim(COALESCE(cancelled_categories, ''))), '\s*,\s*'))) AS u18
      FROM football_registered_team
      WHERE COALESCE(is_test, FALSE) = FALSE AND COALESCE(is_deleted, FALSE) = FALSE`);
        if (!snapshot.ages.every((n, i) => n === Number(reference.rows[0]?.[['u14', 'u16', 'u18'][i]])))
            throw new Error('Statistics totals do not reconcile');
        await client.query('COMMIT');
        transaction = false;
        return snapshot;
    }
    catch (error) {
        if (transaction) {
            try {
                await client.query('ROLLBACK');
            }
            catch {
                discard = true;
            }
        }
        throw error;
    }
    finally {
        client.release(discard);
    }
}
