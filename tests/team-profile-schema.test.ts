jest.mock('../src/db', () => ({
  pool: {
    query: jest.fn(async () => ({ rows: [], rowCount: 0 }))
  }
}));

import { pool } from '../src/db';
import { initTeamTables } from '../src/db/initTables';

describe('Team profile schema additions', () => {
  it('adds contact_subdistrict idempotently without destructive schema operations', async () => {
    const query = pool.query as jest.Mock;
    query.mockClear();

    await initTeamTables();

    const statements = query.mock.calls.map(([statement]) => String(statement));
    expect(statements.some(statement => statement.includes('CREATE TABLE IF NOT EXISTS football_registered_team') && statement.includes('contact_subdistrict VARCHAR(100)'))).toBe(true);
    expect(statements).toContain('ALTER TABLE football_registered_team ADD COLUMN IF NOT EXISTS contact_subdistrict VARCHAR(100);');
    expect(statements.join('\n')).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
  });
});
