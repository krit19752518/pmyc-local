jest.mock('../src/db', () => ({ pool: { query: jest.fn(async () => ({ rows: [], rowCount: 1 })), end: async () => undefined } }));
jest.mock('../src/db/initTables', () => ({ initTeamTables: async () => undefined }));

import request from 'supertest';
import { app, teamsDatabase, teamProfile } from '../src/app';
import { pool } from '../src/db';

let profileBefore: typeof teamProfile;
let initialIds: Set<string>;
beforeEach(() => {
  profileBefore = { ...teamProfile };
  initialIds = new Set(teamsDatabase.map(team => String(team.id)));
  (pool.query as jest.Mock).mockImplementation(async () => ({ rows: [], rowCount: 1 }));
});
afterEach(() => {
  for (let index = teamsDatabase.length - 1; index >= 0; index--) {
    if (!initialIds.has(String(teamsDatabase[index].id))) teamsDatabase.splice(index, 1);
  }
  Object.assign(teamProfile, profileBefore);
});

const valid = () => ({
  school: 'ISSUE53-ทีมทดสอบ', province: 'เชียงใหม่', district: 'เมืองเชียงใหม่',
  name: 'ผู้จัดการทดสอบ', mobile: '0812345678', email: `issue53-${Date.now()}@example.test`, line_id: 'issue53-line'
});
const inserts = () => (pool.query as jest.Mock).mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO football_registered_team'));

describe('Required registration district', () => {
  test('real registration form requires the competition district with the required label', async () => {
    const page = await request(app).get('/team/register.php');
    expect(page.status).toBe(200);
    expect(page.text).toContain('<label class="form-label required">อำเภอ/เขต</label>');
    expect(page.text).toMatch(/<select name="district"[^>]*\srequired(?:\s|>)/);
    expect(page.text).not.toMatch(/<select name="contact_district"[^>]*\srequired(?:\s|>)/);
  });

  test('authorized Demo form uses the same required field', async () => {
    const page = await request(app).get('/team/register-demo.php').set('Cookie', ['admin_session=true', 'admin_user=admin']);
    expect(page.status).toBe(200);
    expect(page.text).toMatch(/<select name="district"[^>]*\srequired(?:\s|>)/);
  });

  test.each([undefined, '', '   ', null, ['เมืองเชียงใหม่'], { name: 'เมืองเชียงใหม่' }, 123])('rejects missing/invalid district %j before inserting a team', async district => {
    const count = teamsDatabase.length;
    const result = await request(app).post('/api/team/register').set('Accept', 'application/json').send({ ...valid(), district });
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ success: false });
    expect(result.body.error).toContain('อำเภอ/เขต');
    expect(inserts()).toHaveLength(0);
    expect(teamsDatabase).toHaveLength(count);
  });

  test('a contact district cannot substitute for the competition district', async () => {
    const result = await request(app).post('/api/team/register').set('Accept', 'application/json')
      .send({ ...valid(), district: '', contact_district: 'เมืองเชียงใหม่' });
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('อำเภอ/เขต');
    expect(inserts()).toHaveLength(0);
  });

  test('normal HTML form submission also rejects a blank district', async () => {
    const result = await request(app).post('/api/team/register').type('form').send({ ...valid(), district: '' });
    expect(result.status).toBe(400);
    expect(result.text).toContain('อำเภอ/เขต');
    expect(inserts()).toHaveLength(0);
  });

  test('valid district is trimmed and saved without making contact district mandatory', async () => {
    const result = await request(app).post('/api/team/register').set('Accept', 'application/json')
      .send({ ...valid(), district: ' เมืองเชียงใหม่ ', contact_district: '' });
    expect(result.status).toBe(201);
    expect(result.body.team.district).toBe('เมืองเชียงใหม่');
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0][1][5]).toBe('เมืองเชียงใหม่');
  });

  test('fallback INSERT also preserves the required district', async () => {
    (pool.query as jest.Mock).mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO football_registered_team') && sql.includes('school_code')) throw new Error('Fixture primary INSERT failure');
      return { rows: [], rowCount: 1 };
    });
    const result = await request(app).post('/api/team/register').set('Accept', 'application/json').send(valid());
    expect(result.status).toBe(201);
    expect(result.body.team.district).toBe('เมืองเชียงใหม่');
    expect(inserts()).toHaveLength(2);
    expect(inserts()[1][0]).toContain('province, district, bkk_zone');
    expect(inserts()[1][1][3]).toBe('เมืองเชียงใหม่');
  });

  test('authorized Demo API rejects a missing district without creating a team', async () => {
    const result = await request(app).post('/api/team/register-demo')
      .set('Cookie', ['admin_session=true', 'admin_user=admin']).set('Accept', 'application/json').send({ ...valid(), district: '' });
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('อำเภอ/เขต');
    expect(inserts()).toHaveLength(0);
  });

  test('valid Demo district is persisted while preserving data-mode isolation', async () => {
    const result = await request(app).post('/api/team/register-demo')
      .set('Cookie', ['admin_session=true', 'admin_user=admin']).set('Accept', 'application/json').send(valid());
    expect(result.status).toBe(201);
    expect(result.body.team.district).toBe('เมืองเชียงใหม่');
    expect(result.body.team.isTest).toBe(true);
    expect(inserts()[0][1][5]).toBe('เมืองเชียงใหม่');
    expect(inserts()[0][1].at(-1)).toBe(true);
  });
});
