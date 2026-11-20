jest.mock('../src/db', () => ({ pool: { query: jest.fn(), connect: jest.fn() } }));
jest.mock('../src/adminAuth', () => ({ getAdminUserByUsername: jest.fn() }));

import express from 'express';
import request from 'supertest';
import { pool } from '../src/db';
import { getAdminUserByUsername, AdminUser } from '../src/adminAuth';
import { createAdminSessionToken } from '../src/services/adminSession.service';
import { adminTeamEditRouter } from '../src/routes/admin/adminTeamEdit.router';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(adminTeamEditRouter);

const admin: AdminUser = {
  id: 'ADMIN-EDITOR', username: 'editor', fullname: 'ผู้ดูแลทดสอบ',
  roleCode: 'SUPER_ADMIN', roleName: 'Super Admin', permissions: ['system:all']
};
const verifier: AdminUser = { ...admin, id: 'VERIFIER', username: 'verifier', roleCode: 'DOCUMENT_VERIFIER' };
const sat: AdminUser = { ...admin, id: 'SAT', username: 'sat', roleCode: 'SAT_OFFICER', province: 'เชียงใหม่' };
const fixture = () => ({
  id: 'TEAM-EDITOR-1', team_name: 'ทีมทดสอบ <ปลอดภัย>', school_code: '0012',
  province: 'เชียงใหม่', district: 'เมืองเชียงใหม่', bkk_zone: '', gender: 'boy',
  categories: 'U14', manager_name: 'ผู้จัดการทดสอบ', phone: '0812345678',
  email: 'team@example.test', username: 'team-test', line_id: 'team-line',
  house_no: '01', road: 'ถนนเดิม', subdistrict: 'ตำบลเดิม',
  contact_subdistrict: 'ตำบลติดต่อ', contact_district: 'อำเภอติดต่อ', contact_province: 'ลำพูน',
  submitted_categories: '', cancelled_categories: '', is_test: false, is_deleted: false,
  password: 'NEVER-RENDER-THIS-PASSWORD'
});
let row: ReturnType<typeof fixture>;
let duplicate: boolean;
let duplicateSchool: boolean;
let linkedMembers: boolean;
let failAudit: boolean;
const clientQuery = jest.fn();
const release = jest.fn();
const cookie = (user = admin, portal: 'central' | 'sat' = 'central') =>
  `${portal === 'sat' ? 'sat_admin_session' : 'admin_session_token'}=${encodeURIComponent(createAdminSessionToken(user, portal))}`;

beforeEach(() => {
  row = fixture(); duplicate = false; duplicateSchool = false; linkedMembers = false; failAudit = false;
  (getAdminUserByUsername as jest.Mock).mockImplementation(async username => [admin, verifier, sat].find(user => user.username === username) || null);
  const query = async (sql: string, values: unknown[] = []) => {
    if (sql.includes("BTRIM(COALESCE(school_code, ''))")) return { rows: duplicateSchool ? [{ id: 'OTHER' }] : [] };
    if (sql.includes('SELECT id FROM football_registered_team')) return { rows: duplicate ? [{ id: 'OTHER' }] : [] };
    if (sql.includes('SELECT id FROM football_player')) return { rows: linkedMembers ? [{ id: 'MEMBER' }] : [] };
    if (sql.startsWith('SELECT ') && sql.includes('FROM football_registered_team')) {
      return { rows: values[0] === row.id && !row.is_test && !row.is_deleted ? [{ ...row }] : [] };
    }
    if (sql.includes('INSERT INTO football_audit_log') && failAudit) throw new Error('private database diagnostic');
    return { rows: [], rowCount: 1 };
  };
  (pool.query as jest.Mock).mockImplementation(query);
  clientQuery.mockImplementation(query);
  (pool.connect as jest.Mock).mockResolvedValue({ query: clientQuery, release });
});

async function editForm() {
  const result = await request(app).get(`/admin/team-edit.php?id=${row.id}`).set('Cookie', cookie());
  expect(result.status).toBe(200);
  const hidden = (name: string) => result.text.match(new RegExp(`name="${name}" value="([^"]+)"`))![1];
  const { password, submitted_categories, cancelled_categories, is_test, is_deleted, ...editable } = row;
  return { page: result, payload: { ...editable, csrf_token: hidden('csrf_token'), version: hidden('version'), new_password: '', password_confirm: '' } };
}

const save = (payload: object, user = admin) => request(app).post('/api/admin/teams/edit')
  .set('Accept', 'application/json').set('Cookie', cookie(user)).send(payload);
const updates = () => clientQuery.mock.calls.filter(([sql]) => sql.startsWith('UPDATE football_registered_team'));

describe('Super Admin registration editor', () => {
  test('requires a valid signed admin session and denies verifier/SAT direct access', async () => {
    expect((await request(app).get('/admin/team-edit.php?id=TEAM-EDITOR-1')).status).toBe(302);
    expect((await request(app).post('/api/admin/teams/edit').set('Accept', 'application/json').send({ id: row.id })).status).toBe(401);
    expect((await request(app).get(`/admin/team-edit.php?id=${row.id}`).set('Cookie', cookie(verifier))).status).toBe(403);
    expect((await save({ id: row.id }, verifier)).status).toBe(403);
    // A SAT identity is rejected by the central session boundary before the editor.
    expect((await request(app).get(`/admin/team-edit.php?id=${row.id}`).set('Cookie', cookie(sat))).status).toBe(302);
    expect((await save({ id: row.id }, sat)).status).toBe(401);
    expect(pool.query).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('renders editable registration fields, escapes names, never selects or renders existing password', async () => {
    const { page } = await editForm();
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.text).toContain('ทีมทดสอบ &lt;ปลอดภัย&gt;');
    expect(page.text).not.toContain(row.password);
    const form = page.text.match(/<form id="teamEditForm"[\s\S]*?<\/form>/)![0];
    for (const name of ['team_name', 'province', 'district', 'bkk_zone', 'categories', 'gender', 'username', 'email', 'phone', 'contact_subdistrict', 'contact_province']) {
      expect(form).toContain(`name="${name}"`);
    }
    expect(form).not.toMatch(/\b(?:readonly|disabled)\b/);
    expect(form).toContain('autocomplete="new-password"');
    expect((pool.query as jest.Mock).mock.calls[0][0]).not.toContain('password');
    new Function(page.text.match(/<script>\s*\(function \(\) \{[\s\S]*?<\/script>/)![0].replace(/<\/?script>/g, ''));
  });

  test.each(['is_test', 'is_deleted'] as const)('does not open %s teams in the real-registration editor', async field => {
    row[field] = true;
    const result = await request(app).get(`/admin/team-edit.php?id=${row.id}`).set('Cookie', cookie());
    expect(result.status).toBe(404);
    expect((pool.query as jest.Mock).mock.calls[0][0]).toContain('COALESCE(is_test, FALSE) = FALSE');
    expect((pool.query as jest.Mock).mock.calls[0][0]).toContain('COALESCE(is_deleted, FALSE) = FALSE');
  });

  test('rejects missing/tampered CSRF and a token reused for a different team', async () => {
    const { payload } = await editForm();
    for (const change of [{ csrf_token: '' }, { csrf_token: payload.csrf_token + 'x' }, { id: 'OTHER-TEAM' }]) {
      expect((await save({ ...payload, ...change })).status).toBe(403);
    }
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('saves all editable values, correctly binds both contact fields, clears optional fields and preserves blank password', async () => {
    const { payload } = await editForm();
    const result = await save({ ...payload, team_name: 'ทีมแก้ไข', contact_district: 'อำเภอใหม่', contact_subdistrict: 'ตำบลใหม่', contact_province: 'จังหวัดใหม่', line_id: '', school_code: '' });
    expect(result.status).toBe(200);
    expect(result.body.redirectUrl).toBe(`/admin/team-edit.php?id=${row.id}&saved=1`);
    const [sql, values] = updates()[0];
    const assignments = sql.split(' SET ')[1].split(' WHERE ')[0].split(', ');
    const saved = Object.fromEntries(assignments.map((assignment: string, i: number) => [assignment.split(' = ')[0], values[i]]));
    expect(saved).toMatchObject({ team_name: 'ทีมแก้ไข', contact_district: 'อำเภอใหม่', contact_subdistrict: 'ตำบลใหม่', contact_province: 'จังหวัดใหม่', line_id: null, school_code: null });
    expect(sql).not.toContain('password');
    expect(values.at(-1)).toBe(row.id);
    expect(clientQuery.mock.calls.at(-1)![0]).toBe('COMMIT');
    expect(release).toHaveBeenCalled();
  });

  test('sets a confirmed new password and audits only the fact of the reset', async () => {
    const { payload } = await editForm();
    const result = await save({ ...payload, new_password: 'New-secret-123', password_confirm: 'New-secret-123' });
    expect(result.status).toBe(200);
    const [sql, values] = updates()[0];
    expect(sql).toContain('password = $');
    expect(values.at(-2)).toBe('New-secret-123');
    const audit = clientQuery.mock.calls.find(([query]) => query.includes('INSERT INTO football_audit_log'))!;
    expect(JSON.stringify(audit)).not.toContain('New-secret-123');
    expect(JSON.stringify(audit)).not.toContain(row.password);
    expect(JSON.parse(audit[1][11])).toMatchObject({ passwordChanged: true });
    expect(result.text).not.toContain('New-secret-123');
  });

  test.each([
    { new_password: 'short', password_confirm: 'short' },
    { new_password: 'password123', password_confirm: 'different123' },
    { new_password: '', password_confirm: 'password123' },
    { new_password: ' password123', password_confirm: ' password123' },
    { team_name: '' }, { email: 'invalid' }, { gender: 'invalid' }, { categories: 'U20' },
    { contact_province: 'x'.repeat(101) }, { phone: ['0812345678'] }
  ])('rejects invalid field/password input before writing: %j', async invalid => {
    const { payload } = await editForm();
    expect((await save({ ...payload, ...invalid })).status).toBe(400);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('does not silently create U14 for a team without categories', async () => {
    row.categories = '';
    const { payload } = await editForm();
    expect((await save(payload)).status).toBe(200);
    const [sql, values] = updates()[0];
    const position = sql.split(' SET ')[1].split(', ').findIndex((assignment: string) => assignment.startsWith('categories ='));
    expect(values[position]).toBe('');
  });

  test('rejects a login identity collision and rolls back', async () => {
    const { payload } = await editForm(); duplicate = true;
    expect((await save(payload)).status).toBe(409);
    const query = clientQuery.mock.calls.find(([sql]) => sql.includes('SELECT id FROM football_registered_team'))!;
    expect(query[0]).toContain('COALESCE(email');
    expect(query[0]).toContain('COALESCE(username');
    expect(updates()).toHaveLength(0);
    expect(clientQuery.mock.calls.at(-1)![0]).toBe('ROLLBACK');
  });

  test('detects stale form data rather than overwriting another edit', async () => {
    const { payload } = await editForm(); row.phone = '0899999999';
    expect((await save(payload)).status).toBe(409);
    expect(updates()).toHaveLength(0);
  });

  test('preserves the registration rule against reusing another school code', async () => {
    const { payload } = await editForm(); duplicateSchool = true;
    const result = await save({ ...payload, school_code: '0099' });
    expect(result.status).toBe(409);
    expect(result.body.error).toContain('รหัสสถานศึกษา');
    expect(updates()).toHaveLength(0);
  });

  test('rejects a target that becomes Demo or deleted before save', async () => {
    const { payload } = await editForm(); row.is_test = true;
    expect((await save(payload)).status).toBe(404);
    expect(updates()).toHaveLength(0);
  });

  test.each(['submitted', 'members'])('cannot remove a category with %s history', async kind => {
    if (kind === 'submitted') row.submitted_categories = 'U14';
    else linkedMembers = true;
    const { payload } = await editForm();
    expect((await save({ ...payload, categories: '' })).status).toBe(409);
    expect(updates()).toHaveLength(0);
  });

  test('ignores workflow/id/data-mode/document/password mass assignment outside the form allowlist', async () => {
    const { payload } = await editForm();
    expect((await save({ ...payload, status: 'APPROVED', is_test: true, doc_team_cert: 'arbitrary', password: 'bypass' })).status).toBe(200);
    const [sql, values] = updates()[0];
    expect(sql).not.toMatch(/status =|is_test =|doc_team_cert =|password =/);
    expect(values).not.toContain('bypass');
  });

  test('rolls back the profile/password change when audit persistence fails', async () => {
    const { payload } = await editForm(); failAudit = true;
    const result = await save({ ...payload, new_password: 'secret-1234', password_confirm: 'secret-1234' });
    expect(result.status).toBe(500);
    expect(updates()).toHaveLength(1);
    expect(clientQuery.mock.calls.map(([sql]) => sql)).toContain('ROLLBACK');
    expect(clientQuery.mock.calls.map(([sql]) => sql)).not.toContain('COMMIT');
    expect(result.text).not.toContain('secret-1234');
    expect(result.text).not.toContain('private database diagnostic');
    expect(release).toHaveBeenCalled();
  });
});
