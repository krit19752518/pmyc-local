jest.mock('../src/db', () => ({
  pool: {
    query: jest.fn(async () => ({ rows: [], rowCount: 0 }))
  }
}));

import { pool } from '../src/db';
import { initTeamTables } from '../src/db/initTables';

describe('Support report schema additions', () => {
  it('adds the optional additional_info field idempotently without destructive schema operations', async () => {
    const query = pool.query as jest.Mock;
    query.mockClear();

    await initTeamTables();

    const statements = query.mock.calls.map(([statement]) => String(statement));
    expect(statements).toContain('ALTER TABLE football_support_report ADD COLUMN IF NOT EXISTS additional_info TEXT;');
    expect(statements.some(statement => statement.includes('CREATE TABLE IF NOT EXISTS football_support_report_message'))).toBe(true);
    expect(statements.some(statement => statement.includes('idx_football_support_message_report_created_at'))).toBe(true);
    expect(statements.some(statement => statement.includes('INSERT INTO football_support_report_message'))).toBe(true);
    expect(statements.join('\n')).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
  });

  it('adds an indexed request correlation id to the audit log without destructive schema operations', async () => {
    const query = pool.query as jest.Mock;
    query.mockClear();

    await initTeamTables();

    const statements = query.mock.calls.map(([statement]) => String(statement));
    const auditTable = statements.find(statement => statement.includes('CREATE TABLE IF NOT EXISTS football_audit_log')) || '';
    expect(auditTable).toContain('request_id VARCHAR(64)');
    expect(statements.join('\n')).toContain('ALTER TABLE football_audit_log ADD COLUMN IF NOT EXISTS request_id VARCHAR(64);');
    expect(statements.join('\n')).toContain('idx_football_audit_log_request_id');
    expect(statements.join('\n')).toContain('ON football_audit_log (request_id) WHERE request_id IS NOT NULL');
    expect(statements.join('\n')).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
  });
});
