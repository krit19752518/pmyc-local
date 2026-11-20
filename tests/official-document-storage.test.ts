jest.mock('../src/db', () => ({
  pool: {
    query: jest.fn(async () => ({ rows: [], rowCount: 0 }))
  }
}));

import { pool } from '../src/db';
import { initTeamTables } from '../src/db/initTables';
import { getDbOfficials } from '../src/models/official.model';

describe('Official ID card document storage', () => {
  it('adds the official document path as an additive, idempotent schema field', async () => {
    const query = pool.query as jest.Mock;
    query.mockClear();

    await initTeamTables();

    const statements = query.mock.calls.map(([statement]) => String(statement));
    expect(statements.some(statement => statement.includes('CREATE TABLE IF NOT EXISTS football_official') && statement.includes('doc_id_card VARCHAR(255)'))).toBe(true);
    expect(statements).toContain('ALTER TABLE football_official ADD COLUMN IF NOT EXISTS doc_id_card VARCHAR(255);');
    expect(statements.join('\n')).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
  });

  it('maps identity values and uploaded document paths to separate properties', async () => {
    const query = pool.query as jest.Mock;
    query.mockResolvedValueOnce({
      rows: [{
        id: 'OFF-DB-MAP-TEST',
        team_id: 'FTM-DB-MAP-TEST',
        name: 'เจ้าหน้าที่ทดสอบ mapping',
        position: 'เจ้าหน้าที่ประจำทีม',
        id_card: 'STAFF-IDENTITY-123',
        doc_id_card: '/uploads/official-id.pdf',
        categories: 'U18'
      }],
      rowCount: 1
    });

    const officials = await getDbOfficials('FTM-DB-MAP-TEST');
    const official = officials.find(item => item.id === 'OFF-DB-MAP-TEST');

    expect(official?.idCard).toBe('STAFF-IDENTITY-123');
    expect(official?.docIdCard).toBe('/uploads/official-id.pdf');
    expect(official?.doc_id_card).toBe('/uploads/official-id.pdf');
  });
});
