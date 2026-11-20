"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withDbTransaction = withDbTransaction;
const db_1 = require("../db");
/** Runs work on one PostgreSQL connection. The query-only fallback supports legacy test doubles. */
async function withDbTransaction(work) {
    const connect = db_1.pool.connect;
    if (typeof connect !== 'function')
        return work({ query: db_1.pool.query.bind(db_1.pool) });
    const client = await connect.call(db_1.pool);
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        try {
            await client.query('ROLLBACK');
        }
        catch { /* retain the original failure */ }
        throw error;
    }
    finally {
        client.release();
    }
}
