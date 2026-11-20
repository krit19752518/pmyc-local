import { pool } from '../db';

export interface QueryExecutor {
  query: (sql: string, values?: unknown[]) => Promise<any>;
}

/** Runs work on one PostgreSQL connection. The query-only fallback supports legacy test doubles. */
export async function withDbTransaction<T>(work: (executor: QueryExecutor) => Promise<T>): Promise<T> {
  const connect = (pool as any).connect;
  if (typeof connect !== 'function') return work({ query: pool.query.bind(pool) as any });

  const client = await connect.call(pool);
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* retain the original failure */ }
    throw error;
  } finally {
    client.release();
  }
}
