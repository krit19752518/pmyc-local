export const TEST_ADMIN_USERNAME = 'admin-fixture';
export const TEST_ADMIN_PASSWORD = 'fixture-admin-password';
export const TEST_VERIFIER_USERNAME = 'verifier-fixture';
export const TEST_VERIFIER_PASSWORD = 'fixture-verifier-password';
export const TEST_SAT_USERNAME = 'sat-fixture@example.test';
export const TEST_SAT_PASSWORD = 'fixture-sat-password';

const adminRows: any[] = [
  {
    id: 'ADM-TEST-001', username: TEST_ADMIN_USERNAME, password_hash: TEST_ADMIN_PASSWORD,
    fullname: 'Fixture Administrator', role_code: 'SUPER_ADMIN', created_at: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'ADM-TEST-002', username: TEST_VERIFIER_USERNAME, password_hash: TEST_VERIFIER_PASSWORD,
    fullname: 'Fixture Verifier', role_code: 'DOCUMENT_VERIFIER', created_at: '2026-01-02T00:00:00.000Z'
  }
];

const satRows: any[] = [
  {
    id: 'SAT-TEST-001', fullname: 'Fixture SAT Officer', position: 'Officer', province: 'Fixture Province',
    phone: '0800000000', line_id: 'fixture-line', email: TEST_SAT_USERNAME,
    password_hash: TEST_SAT_PASSWORD, created_at: '2026-01-03T00:00:00.000Z'
  }
];

const initialAdminRows = adminRows.map(row => ({ ...row }));
const initialSatRows = satRows.map(row => ({ ...row }));

export function createAdminTestPool() {
  const pool: any = {
    query: jest.fn(async (sql: string, values: any[] = []) => {
      if (sql.includes('FROM admin_users WHERE LOWER(username) = LOWER($1)')) {
        const user = adminRows.find(row => row.username.toLowerCase() === String(values[0] || '').toLowerCase());
        return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 };
      }
      if (sql.includes('FROM sat_officers WHERE email = $1 OR fullname = $1 OR id = $1')) {
        const officer = satRows.find(row => [row.email, row.fullname, row.id].includes(values[0]));
        return { rows: officer ? [{ ...officer }] : [], rowCount: officer ? 1 : 0 };
      }
      if (sql.includes('FROM admin_users ORDER BY')) {
        return { rows: adminRows.map(({ password_hash, ...row }) => ({ ...row })), rowCount: adminRows.length };
      }
      if (sql.includes('FROM sat_officers ORDER BY')) {
        return { rows: satRows.map(({ password_hash, ...row }) => ({ ...row })), rowCount: satRows.length };
      }
      if (sql.includes('INSERT INTO admin_users')) {
        adminRows.push({ id: values[0], username: values[1], password_hash: values[2], fullname: values[3], role_code: values[4] });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO sat_officers')) {
        satRows.push({ id: values[0], fullname: values[1], position: values[2], province: values[3], phone: values[4], email: values[5], password_hash: values[6], line_id: values[7] });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('UPDATE sat_officers')) {
        const officer = satRows.find(row => row.id === values[values.length - 1]);
        if (officer) {
          [officer.fullname, officer.position, officer.province, officer.phone, officer.email] = values;
          if (values.length === 8) officer.password_hash = values[5];
        }
        return { rows: [], rowCount: officer ? 1 : 0 };
      }
      if (sql.includes('DELETE FROM sat_officers')) {
        const index = satRows.findIndex(row => row.id === values[0]);
        if (index !== -1) satRows.splice(index, 1);
        return { rows: [], rowCount: index !== -1 ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    }),
    connect: jest.fn(async () => ({
      query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
      release: jest.fn()
    })),
    end: jest.fn(async () => undefined)
  };
  pool.resetForTest = () => {
    adminRows.splice(0, adminRows.length, ...initialAdminRows.map(row => ({ ...row })));
    satRows.splice(0, satRows.length, ...initialSatRows.map(row => ({ ...row })));

    const freshPool = createAdminTestPool();
    pool.query = freshPool.query;
    pool.connect = freshPool.connect;
    pool.end = freshPool.end;
  };
  return pool;
}

export function resetAdminTestPool(pool: any): void {
  if (!pool || typeof pool.resetForTest !== 'function') {
    throw new Error('Expected the test-only admin database pool');
  }
  pool.resetForTest();
}
