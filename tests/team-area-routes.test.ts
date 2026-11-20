jest.mock('../src/db', () => ({ pool: jest.requireActual('./admin-test-fixtures').createAdminTestPool() }));
jest.mock('../src/db/initTables', () => ({ initTeamTables: async () => undefined }));

import request from 'supertest';
import { app, teamsDatabase } from '../src/app';
import { pool } from '../src/db';
import { superAdminCookie } from './admin-session-test-helpers';

let aliases: string[];
const plan = { rounds: [], byeTeamId: null };
beforeEach(() => {
  aliases = ['เขตบางกะปิ'];
  const fallback = jest.requireActual('./admin-test-fixtures').createAdminTestPool();
  (pool.query as jest.Mock).mockImplementation(async (sql: string, values: any[]) => {
    if (sql.startsWith('SELECT district FROM football_competition_bracket')) return { rows: aliases.map(district => ({ district })) };
    if (sql.startsWith('SELECT bracket FROM football_competition_bracket')) return { rows: values[2] === 'เขตบางกะปิ' ? [{ bracket: plan }] : [] };
    return fallback.query(sql, values);
  });
});
afterAll(async () => { await pool.end(); });

test.each(['บางกะปิ', 'เขตบางกะปิ'])('existing bracket alias is read under its original key for request %s', async district => {
  const result = await request(app).get('/api/admin/brackets/data').query({ category: 'U14', province: 'กรุงเทพมหานคร', district }).set('Cookie', superAdminCookie());
  expect(result.status).toBe(200);
  expect(result.body.bracket).toEqual(plan);
  const query = (pool.query as jest.Mock).mock.calls.find(([sql]) => sql.startsWith('SELECT bracket FROM football_competition_bracket'))!;
  expect(query[1]).toEqual(['U14', 'กรุงเทพมหานคร', 'เขตบางกะปิ']);
  expect((pool.query as jest.Mock).mock.calls.some(([sql]) => /^(UPDATE|DELETE|INSERT).*football_competition_bracket/.test(sql))).toBe(false);
});

test('conflicting canonical and prefixed bracket keys stop reads and mutations instead of merging or deleting', async () => {
  aliases = ['บางกะปิ', 'เขตบางกะปิ'];
  const input = { category: 'U14', province: 'กรุงเทพมหานคร', district: 'บางกะปิ' };
  const get = await request(app).get('/api/admin/brackets/data').query(input).set('Cookie', superAdminCookie());
  expect(get.status).toBe(409);
  for (const action of ['clear', 'move']) {
    const result = await request(app).post('/api/admin/brackets/' + action).set('Cookie', superAdminCookie())
      .send({ ...input, sourceTeamId: 'fixture', targetMatchIndex: 0, targetSide: 0 });
    expect(result.status).toBe(409);
  }
  expect((pool.query as jest.Mock).mock.calls.some(([sql]) => /^(UPDATE|DELETE|INSERT).*football_competition_bracket/.test(sql))).toBe(false);
});

test('signed-session demographics report combines district aliases into one displayed row', async () => {
  const ids = ['AREA-REPORT-A', 'AREA-REPORT-B'];
  teamsDatabase.push(...ids.map((id, i) => ({ id, teamName: id, province: 'กรุงเทพมหานคร', district: i ? 'เขตบางกะปิ' : 'บางกะปิ', categories: 'U14', status: 'PENDING', isTest: false })));
  try {
    const result = await request(app).get('/admin/report-demographics.php').set('Cookie', superAdminCookie());
    expect(result.status).toBe(200);
    expect(result.text).toContain('<td>บางกะปิ</td><td class="text-center fw-bold">2</td>');
    expect(result.text).not.toContain('<td>เขตบางกะปิ</td>');
  } finally {
    for (const id of ids) { const index = teamsDatabase.findIndex(t => t.id === id); if (index >= 0) teamsDatabase.splice(index, 1); }
  }
});

test('admin profile save normalizes district fields before SQL without writing enrollment', async () => {
  const result = await request(app).post('/api/admin/teams/update').set('Cookie', superAdminCookie()).set('Accept', 'application/json')
    .send({ id: 'AREA-ADMIN-FIXTURE', teamName: 'Area fixture', province: 'กรุงเทพฯ', district: 'เขต บางกะปิ', contact_province: 'กรุงเทพมหานคร', contact_district: 'เขตวังทองหลาง', managerName: 'Fixture', phone: '0800000000' });
  expect(result.status).toBe(200);
  const update = (pool.query as jest.Mock).mock.calls.find(([sql]) => sql.startsWith('UPDATE football_registered_team SET'))!;
  expect(update[1][2]).toBe('กรุงเทพมหานคร');
  expect(update[1][4]).toBe('บางกะปิ');
  expect(update[1][13]).toBe('วังทองหลาง');
  expect(update[0]).not.toMatch(/\bcategories\s*=/);
});

test('Demo bracket alias lookup stays in the Demo storage namespace', async () => {
  const result = await request(app).get('/api/admin/demo-brackets/data').query({ category: 'U14', province: 'กรุงเทพมหานคร', district: 'บางกะปิ' }).set('Cookie', superAdminCookie());
  expect(result.status).toBe(200);
  const query = (pool.query as jest.Mock).mock.calls.find(([sql]) => sql.startsWith('SELECT district FROM football_competition_bracket'))!;
  expect(query[1]).toEqual(['U14', 'DEMO:กรุงเทพมหานคร']);
});

test('invalid new admin district is rejected before an UPDATE', async () => {
  const result = await request(app).post('/api/admin/teams/update').set('Cookie', superAdminCookie()).set('Accept', 'application/json')
    .send({ id: 'AREA-ADMIN-FIXTURE', teamName: 'Area fixture', province: 'กรุงเทพมหานคร', district: 'พระนคร 2', managerName: 'Fixture', phone: '0800000000' });
  expect(result.status).toBe(400);
  expect((pool.query as jest.Mock).mock.calls.some(([sql]) => sql.startsWith('UPDATE football_registered_team SET'))).toBe(false);
});

test('omitted district on a legacy admin form preserves the existing registration district', async () => {
  const id = 'AREA-ADMIN-EXISTING';
  teamsDatabase.push({ id, teamName: 'Area fixture', province: 'กรุงเทพมหานคร', district: 'เขตบางกะปิ', categories: 'U14' });
  try {
    const result = await request(app).post('/api/admin/teams/update').set('Cookie', superAdminCookie()).set('Accept', 'application/json')
      .send({ id, teamName: 'Area fixture', province: 'กรุงเทพมหานคร', managerName: 'Fixture', phone: '0800000000' });
    expect(result.status).toBe(200);
    const update = (pool.query as jest.Mock).mock.calls.find(([sql]) => sql.startsWith('UPDATE football_registered_team SET'))!;
    expect(update[1][4]).toBe('บางกะปิ');
    expect(update[0]).not.toMatch(/\bcategories\s*=/);
  } finally {
    const index = teamsDatabase.findIndex(t => t.id === id); if (index >= 0) teamsDatabase.splice(index, 1);
  }
});
