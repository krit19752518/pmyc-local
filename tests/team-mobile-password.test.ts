jest.mock('../src/db', () => ({ pool: { query: jest.fn(), end: async () => undefined } }));
jest.mock('../src/db/initTables', () => ({ initTeamTables: async () => undefined }));

import request from 'supertest';
import vm from 'node:vm';
import { app, teamsDatabase, teamProfile } from '../src/app';
import { pool } from '../src/db';
import { superAdminCookie } from './admin-session-test-helpers';
import { teamSessionCookies } from './team-session.helper';

let originalProfile: any;
let initialIds: Set<string>;
let sequence = 0;
const mobile = '0894567890';
const registration = (extra: any = {}) => ({
  school: 'Mobile password fixture', province: 'เชียงใหม่', district: 'แม่ริม', name: 'ผู้ประสานงานทดสอบ',
  mobile, phone: '025555555', email: `mobile-${++sequence}@example.test`, line_id: 'mobile-fixture', ...extra
});

beforeEach(() => {
  initialIds = new Set(teamsDatabase.map(t => t.id));
  originalProfile = { ...teamProfile };
  const adminPool = jest.requireActual('./admin-test-fixtures').createAdminTestPool();
  (pool.query as jest.Mock).mockImplementation(async (sql: string, values: any[] = []) => {
    if (sql.startsWith('UPDATE football_registered_team SET')) return { rows: [{ id: values[18], status: 'PENDING', reject_reason: '', categories: '' }], rowCount: 1 };
    return adminPool.query(sql, values);
  });
});
afterEach(() => {
  for (let i = teamsDatabase.length - 1; i >= 0; i--) if (!initialIds.has(teamsDatabase[i].id)) teamsDatabase.splice(i, 1);
  Object.assign(teamProfile, originalProfile);
});
const register = (data: any) => request(app).post('/api/team/register').set('Accept', 'application/json').send(data);

test('form has mobile-password wording and validation, no password inputs; reset page is unchanged', async () => {
  const page = await request(app).get('/team/register.php');
  expect(page.status).toBe(200);
  expect(page.text).toContain('หมายเลขโทรศัพท์มือถือ (ใช้เป็นรหัสผ่านสำหรับเข้าสู่ระบบ)');
  expect(page.text).not.toMatch(/name="password(?:_confirm)?"/);
  expect(page.text).not.toContain('register_password');
  for (const script of page.text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
  const reset = await request(app).get('/team/reset-password.php?token=fixture');
  expect(reset.text).toContain('name="password"');
  expect(reset.text).toContain('name="password_confirm"');
});

test('registration without password stores the mobile with leading zero and can log in using it', async () => {
  const data = registration();
  const response = await register(data);
  expect(response.status).toBe(201);
  expect(response.body.team).toMatchObject({ phone: mobile, password: mobile, categories: '' });
  const insert = (pool.query as jest.Mock).mock.calls.find(([sql]) => sql.includes('INSERT INTO football_registered_team'))!;
  expect(insert[1][10]).toBe(mobile);
  expect(insert[1][21]).toBe(mobile);
  expect((await request(app).post('/api/team/login').set('Accept', 'application/json').send({ username: data.email, password: mobile })).status).toBe(200);
  expect((await request(app).post('/api/team/login').set('Accept', 'application/json').send({ username: data.email, password: data.phone })).status).toBe(401);
});

test('server derives password from mobile even when an old client submits password fields', async () => {
  const response = await register(registration({ password: 'different-value', password_confirm: 'does-not-match' }));
  expect(response.status).toBe(201);
  expect(response.body.team.password).toBe(mobile);
});

test('legacy phone request alias still supplies the initial mobile password', async () => {
  const data = registration();
  delete data.mobile;
  data.phone = mobile;
  const response = await register(data);
  expect(response.status).toBe(201);
  expect(response.body.team.password).toBe(mobile);
});

test.each(['', '123', '089-456-7890', '894567890', '08945678901'])('rejects missing/invalid mobile %s without an insert', async value => {
  const response = await register(registration({ mobile: value, phone: '' }));
  expect(response.status).toBe(400);
  expect((pool.query as jest.Mock).mock.calls.some(([sql]) => sql.includes('INSERT INTO football_registered_team'))).toBe(false);
});

test('fallback registration insert also persists the mobile password and login identity', async () => {
  const original = (pool.query as jest.Mock).getMockImplementation()!;
  (pool.query as jest.Mock).mockImplementation(async (sql: string, values: any[]) => {
    if (sql.includes('INSERT INTO football_registered_team (\n')) throw new Error('fixture full insert unavailable');
    return original(sql, values);
  });
  const response = await register(registration());
  expect(response.status).toBe(201);
  const fallback = (pool.query as jest.Mock).mock.calls.find(([sql]) => sql.startsWith('INSERT INTO football_registered_team (id,'))!;
  expect(fallback[0]).toContain('username, password, email');
  expect(fallback[1][13]).toBe(mobile);
  expect(fallback[1][3]).toBe('แม่ริม');
});

test('Demo uses the same rule without changing an existing account password', async () => {
  teamsDatabase.push({ id: 'FTM-EXISTING-MOBILE-TEST', email: 'existing-mobile@example.test', phone: '0811112222', password: 'ExistingPassword-2026', categories: 'U16', status: 'PENDING' });
  const response = await request(app).post('/api/team/register-demo').set('Cookie', superAdminCookie()).set('Accept', 'application/json').send(registration());
  expect(response.status).toBe(201);
  expect(response.body.team).toMatchObject({ isTest: true, password: mobile });
  const existing = teamsDatabase.find(t => t.id === 'FTM-EXISTING-MOBILE-TEST');
  expect(existing.password).toBe('ExistingPassword-2026');
  expect((await request(app).post('/api/team/login').set('Accept', 'application/json').send({ username: existing.email, password: existing.password })).status).toBe(200);
});

test('editing contact phone later does not silently change the initial password', async () => {
  const data = registration();
  const response = await register(data);
  expect(response.status).toBe(201);
  const update = await request(app).post('/api/team/team-update').set('Cookie', teamSessionCookies(response.body.team.id, data.email)).set('Accept', 'application/json')
    .send({ email: data.email, line_id: data.line_id, phone: '0812340000' });
  expect(update.status).toBe(200);
  const saved = teamsDatabase.find(t => t.id === response.body.team.id);
  expect(saved.phone).toBe('0812340000');
  expect(saved.password).toBe(mobile);
});

test('registration persists canonical Bangkok districts without confusing the contact address or competition zone', async () => {
  const result = await register(registration({ province: 'กรุงเทพฯ', district: 'เขต บางกะปิ', bkk_zone: 'พระนคร 2', contact_province: 'กรุงเทพมหานคร', contact_district: 'เขตวังทองหลาง' }));
  expect(result.status).toBe(201);
  expect(result.body.team).toMatchObject({ province: 'กรุงเทพมหานคร', district: 'บางกะปิ', bkk_zone: 'พระนคร 2', contact_district: 'วังทองหลาง' });
  const insert = (pool.query as jest.Mock).mock.calls.find(([sql]) => sql.includes('INSERT INTO football_registered_team'))!;
  expect(insert[1][5]).toBe('บางกะปิ');
  expect(insert[1][15]).toBe('วังทองหลาง');
});

test('registration rejects an invalid new Bangkok district before inserting the team', async () => {
  const result = await register(registration({ province: 'กรุงเทพมหานคร', district: 'พระนคร 2' }));
  expect(result.status).toBe(400);
  expect((pool.query as jest.Mock).mock.calls.some(([sql]) => sql.includes('INSERT INTO football_registered_team'))).toBe(false);
});
