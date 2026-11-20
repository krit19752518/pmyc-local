jest.mock('../src/db', () => ({ pool: { query: jest.fn(), connect: jest.fn(), end: async () => undefined } }));
jest.mock('../src/db/initTables', () => ({ initTeamTables: async () => undefined }));
jest.mock('../src/services/auditLog.service', () => ({
  ...jest.requireActual('../src/services/auditLog.service'), writeAuditLog: jest.fn()
}));

import request from 'supertest';
import vm from 'node:vm';
import { superAdminCookie } from './admin-session-test-helpers';
import { app, teamsDatabase } from '../src/app';
import { pool } from '../src/db';
import { writeAuditLog } from '../src/services/auditLog.service';
import { teamSessionCookies } from './team-session.helper';
import { getDbTeamProfile, getDbRegisteredTeams } from '../src/models/team.model';
import { getCategoryStatus } from '../src/utils/statusHelper';
import { parseCategories } from '../src/utils/helpers';

const teamId = 'FTM-ENROLLMENT-TEST';
let team: any;
let hasRoster: boolean;
let snapshot: any;
let statements: string[];

async function query(sql: string, values: any[] = []) {
  statements.push(sql);
  if (sql === 'BEGIN') snapshot = { ...team };
  if (sql === 'ROLLBACK') team = { ...snapshot };
  if (sql.includes(' AS has_roster')) return { rows: [{ has_roster: hasRoster }], rowCount: 1 };
  if (sql.startsWith('SELECT') && sql.includes('football_registered_team')) {
    return { rows: !values.length || values[0] === teamId || (Array.isArray(values[0]) && values[0].includes(teamId)) ? [{ ...team }] : [], rowCount: 1 };
  }
  if (sql.startsWith('UPDATE football_registered_team SET categories = $1')) {
    team.categories = values[0];
    return { rows: [{ id: teamId }], rowCount: 1 };
  }
  return jest.requireActual('./admin-test-fixtures').createAdminTestPool().query(sql, values);
}

beforeEach(() => {
  team = { id: teamId, team_name: 'Enrollment fixture', categories: '', status: 'PENDING', submitted_categories: '', cancelled_categories: '', is_deleted: false };
  hasRoster = false;
  statements = [];
  (pool.query as jest.Mock).mockImplementation(query);
  (pool as any).connect.mockResolvedValue({ query, release: jest.fn() });
  (writeAuditLog as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => {
  const index = teamsDatabase.findIndex(t => t.id === teamId);
  if (index >= 0) teamsDatabase.splice(index, 1);
});
const add = (category: unknown) => request(app).post('/api/team/add-category').set('Accept', 'application/json').set('Cookie', teamSessionCookies(teamId)).send({ category });

test('missing and invalid categories never become U14', () => {
  expect(parseCategories(undefined)).toEqual([]);
  expect(parseCategories({})).toEqual([]);
  expect(parseCategories({ categories: 'bogus' })).toEqual([]);
  expect(getCategoryStatus({ categories: '', status: 'PENDING' }, 'U14').text).toBe('ไม่ได้ลงทะเบียน');
});

test('DB empty categories stay empty even when stale memory has U14', async () => {
  teamsDatabase.push({ id: teamId, categories: 'U14' });
  const profile = await getDbTeamProfile({ originalUrl: '/team/team.php', query: {}, headers: { cookie: `team_id=${teamId}` } } as any);
  expect(profile.categories).toEqual([]);
  expect((await getDbRegisteredTeams()).find(t => t.id === teamId)?.categories).toBe('');
});

test.each(['', 'U14,U16'])('team info has no category controls or summary (%s)', async categories => {
  team.categories = categories;
  const page = await request(app).get('/team/team.php').set('Cookie', teamSessionCookies(teamId));
  expect(page.status).toBe(200);
  expect(page.text).not.toContain('team_category_form');
  expect(page.text).not.toContain('team_cat_u14');
  expect(page.text).not.toContain('รุ่นอายุที่ลงทะเบียนแข่งขัน');
  expect(page.text).not.toMatch(/name="categor(?:y|ies)(?:Str|\[\])?"/);
  expect(page.text).toContain('team_update_form');
  expect(page.text).toContain('const MAX_FILE_SIZE = 4 * 1024 * 1024');
  for (const match of page.text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});

test.each(['', 'U14'])('overview shows all three rows and add buttons only for missing categories (%s)', async categories => {
  team.categories = categories;
  const page = await request(app).get('/team/index.php').set('Cookie', teamSessionCookies(teamId));
  expect(page.status).toBe(200);
  for (const category of ['U14', 'U16', 'U18']) {
    expect(page.text.includes('data-add-category="' + category + '"')).toBe(!categories.includes(category));
  }
  expect(page.text).toContain('ยืนยันเพิ่มรุ่น ');
  expect(page.text).toContain('ตกลง เพิ่มรุ่น');
  expect(page.text).not.toContain('team_category_form');
  for (const match of page.text.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});

test('adding U16 audits within transaction, then adding U18 preserves U16; duplicate is rejected', async () => {
  expect((await add('U16')).status).toBe(200);
  expect(team.categories).toBe('U16');
  expect(statements.some(sql => sql.includes('FOR UPDATE'))).toBe(true);
  expect(statements).toContain('COMMIT');
  expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: 'TEAM_CATEGORY_ADDED', oldState: { categories: '' }, newState: { categories: 'U16' } }), expect.objectContaining({ query: expect.any(Function) }));
  expect((await add('U18')).status).toBe(200);
  expect(team.categories).toBe('U16,U18');
  expect((await add('U16')).status).toBe(409);
  expect(team.categories).toBe('U16,U18');
});

test.each([[], ['U16'], ['U16', 'U18'], 'U16,U18', 'bad', null, ''])('rejects non-single/invalid input %j', async input => {
  expect((await add(input)).status).toBe(400);
  expect(team.categories).toBe('');
});

test.each([
  { categories: 'U14,U18' }, { submitted_categories: 'U18' }, { cancelled_categories: 'U18' }
])('blocks only the target category %j', async fields => {
  Object.assign(team, fields);
  const before = team.categories;
  expect((await add('U18')).status).toBe(409);
  expect(team.categories).toBe(before);
});

test.each(['PENDING', 'APPROVED', 'REJECTED'])('other category submission/cancellation and team status do not prevent adding U16 (%s)', async status => {
  Object.assign(team, { categories: 'U14', submitted_categories: 'U14', cancelled_categories: 'U18', status });
  expect((await add('U16')).status).toBe(200);
  expect(team).toMatchObject({ categories: 'U14,U16', submitted_categories: 'U14', cancelled_categories: 'U18', status });
  const rosterQuery = statements.find(sql => sql.includes(' AS has_roster'))!;
  expect(rosterQuery).toContain('$2 = ANY');
});

test('target category with inconsistent existing roster data is blocked', async () => {
  hasRoster = true;
  expect((await add('U16')).status).toBe(409);
});

test('audit failure rolls enrollment back', async () => {
  (writeAuditLog as jest.Mock).mockRejectedValue(new Error('audit unavailable'));
  expect((await add('U16')).status).toBe(500);
  expect(statements).toContain('ROLLBACK');
  expect(team.categories).toBe('');
});

test('unsigned session cannot enroll', async () => {
  const response = await request(app).post('/api/team/add-category').set('Accept', 'application/json').set('Cookie', [`team_id=${teamId}`, 'team_logged_in=true']).send({ category: 'U16' });
  expect(response.status).toBe(401);
});

test('body/query cannot select a different team', async () => {
  const response = await request(app).post('/api/team/add-category?teamId=OTHER').set('Cookie', teamSessionCookies(teamId)).send({ teamId: 'OTHER', category: 'U16' });
  expect(response.status).toBe(200);
  expect(team.categories).toBe('U16');
});

test.each([false, true])('deleted/unavailable team rejected (%s)', async deleted => {
  team.is_deleted = deleted;
  if (!deleted) team.id = 'UNAVAILABLE';
  const cookies = teamSessionCookies(deleted ? teamId : 'UNKNOWN');
  const response = await request(app).post('/api/team/add-category').set('Cookie', cookies).send({ category: 'U16' });
  expect(response.status).toBe(404);
});

test.each(['/team/players.php', '/team/player-edit.php', '/team/officials.php', '/team/official-edit.php'])('empty-team pages preserve Production navigation from %s', async path => {
  const response = await request(app).get(path).set('Cookie', teamSessionCookies(teamId));
  if (path === '/team/player-edit.php') {
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/team/index.php');
  } else {
    expect(response.status).toBe(200);
    expect(team.categories).toBe('');
  }
});

test('admin full details preserve empty categories and category list excludes the team', async () => {
  const details = await request(app).get('/api/admin/teams/full-details?teamId=' + teamId).set('Cookie', superAdminCookie());
  expect(details.status).toBe(200);
  expect(details.body.team.categories).toBe('');
  const categoryPage = await request(app).get('/admin/teams-u14.php').set('Cookie', superAdminCookie());
  expect(categoryPage.status).toBe(200);
  expect(categoryPage.text).not.toContain('Enrollment fixture');
});

test.each(['/api/team/export-o2-excel', '/api/team/export-o2-pdf'])('empty-team export preserves Production download behavior without enrolling U14 (%s)', async path => {
  const response = await request(app).get(path + '?category=U14').set('Cookie', teamSessionCookies(teamId));
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toContain(path.endsWith('excel') ? 'spreadsheetml' : 'application/pdf');
  expect(team.categories).toBe('');
});

test.each(['cancel', 'confirm', 'failure'])('Production overview confirmation handles %s without unintended writes', async action => {
  const page = await request(app).get('/team/index.php').set('Cookie', teamSessionCookies(teamId));
  const script = [...page.text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(script => script.includes('function openAddCategoryModal'))!;
  const parsed = require('typescript').createSourceFile('ui.js', script, require('typescript').ScriptTarget.ES2022, true);
  const declaration = parsed.statements.find((node: any) => node.name?.text === 'openAddCategoryModal');
  expect(declaration).toBeDefined();
  const fetch = jest.fn().mockResolvedValue({ json: async () => ({ success: action !== 'failure', error: 'fixture failure' }) });
  const fire = jest.fn().mockResolvedValue({ isConfirmed: action !== 'cancel' });
  const location = { pathname: '/team/index.php', href: '' };
  const context: any = { Swal: { fire }, fetch, window: { location } };
  vm.runInNewContext(declaration.getText(parsed) + '; globalThis.openAdd = openAddCategoryModal;', context);
  context.openAdd('U16');
  await new Promise(resolve => setImmediate(resolve));
  expect(fetch).toHaveBeenCalledTimes(action === 'cancel' ? 0 : 1);
  expect(location.href.startsWith('/team/index.php?t=')).toBe(action === 'confirm');
  if (action !== 'cancel') {
    expect(fetch.mock.calls[0][0]).toBe('/api/team/add-category');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ category: 'U16' });
  }
  if (action === 'failure') expect(fire).toHaveBeenLastCalledWith(expect.objectContaining({ icon: 'error', title: 'เพิ่มรุ่นไม่สำเร็จ' }));
  expect(statements.filter(sql => sql.startsWith('UPDATE'))).toEqual([]);
});

test('cancelled category stays cancelled in overview instead of offering Add', async () => {
  team.categories = 'U14';
  team.cancelled_categories = 'U14';
  const page = await request(app).get('/team/index.php').set('Cookie', teamSessionCookies(teamId));
  expect(page.text).toContain('ได้ทำการยกเลิกการสมัครแล้ว');
  expect(page.text).not.toContain('data-add-category="U14"');
});

test('missing district has no registration number in overview or admin, including client rendering', async () => {
  Object.assign(team, { categories: 'U14', province: 'เชียงใหม่', district: '', contact_district: '', created_at: '2026-11-06T05:29:51Z' });
  const overview = await request(app).get('/team/index.php').set('Cookie', teamSessionCookies(teamId));
  expect(overview.status).toBe(200);
  expect(overview.text).toContain('ยังไม่ระบุอำเภอ');
  expect(overview.text).not.toMatch(/ลำดับที่ลงทะเบียน \d+/);
  const admin = await request(app).get('/admin/teams.php').set('Cookie', superAdminCookie());
  expect(admin.status).toBe(200);
  const data = JSON.parse(admin.text.match(/id="rawTeamsDataJson">([\s\S]*?)<\/script>/)![1]);
  const shown = data.find((item: any) => item.id === teamId);
  expect(shown.registrationRanks).toEqual({});
  expect(shown.registrationRankMessage).toBe('ยังไม่ระบุอำเภอ');
  const script = admin.text.slice(admin.text.indexOf('    function getTeamDistrictCatSeqJs'), admin.text.indexOf('    function getCatBadgeJs'));
  const context: any = {};
  vm.runInNewContext(script, context);
  expect(context.getTeamDistrictCatSeqJs(shown, 'U14')).toBe(0);
});

test('overview and admin SSR/client share original registration order before table filtering', async () => {
  Object.assign(team, { categories: 'U14,U16', province: 'Rank province', district: 'Rank district', created_at: '2026-11-06T05:00:00Z' });
  const earlierId = 'RANK-EARLIER';
  teamsDatabase.push({ id: earlierId, province: team.province, district: team.district, categories: 'U14', createdAt: '2026-09-30T11:00:00Z', status: 'APPROVED' });
  try {
    const overview = await request(app).get('/team/index.php').set('Cookie', teamSessionCookies(teamId));
    expect(overview.text).toContain('ลำดับที่ลงทะเบียน 2');
    expect(overview.text).toContain('ลำดับที่ลงทะเบียน 1');
    const admin = await request(app).get('/admin/teams.php?type=pending_teams').set('Cookie', superAdminCookie());
    const data = JSON.parse(admin.text.match(/id="rawTeamsDataJson">([\s\S]*?)<\/script>/)![1]);
    const shown = data.find((item: any) => item.id === teamId);
    expect(shown.registrationRanks).toEqual({ U14: 2, U16: 1 });
    const script = admin.text.slice(admin.text.indexOf('    function getTeamDistrictCatSeqJs'), admin.text.indexOf('    function getCatBadgeJs'));
    const context: any = {};
    vm.runInNewContext(script, context);
    expect(context.getTeamDistrictCatSeqJs(shown, 'U14')).toBe(2);
    for (const match of admin.text.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  } finally {
    const index = teamsDatabase.findIndex(t => t.id === earlierId);
    if (index >= 0) teamsDatabase.splice(index, 1);
  }
});

test('Bangkok district ranks agree in overview, admin SSR/client and category tables, independent of zone', async () => {
  Object.assign(team, { categories: 'U14,U16', province: 'กรุงเทพมหานคร', district: 'เขตบางกะปิ', bkk_zone: 'พระนคร 2', created_at: '2026-11-05T05:00:00Z' });
  const earlierId = 'AREA-SAME-DISTRICT', otherId = 'AREA-OTHER-DISTRICT';
  teamsDatabase.push({ id: earlierId, teamName: 'Earlier district fixture', province: 'กรุงเทพมหานคร', district: 'บางกะปิ', bkk_zone: 'พระนคร 2', categories: 'U14', createdAt: '2026-10-01T00:00:00Z', status: 'PENDING' });
  teamsDatabase.push({ id: otherId, teamName: 'Other district fixture', province: 'กรุงเทพมหานคร', district: 'มีนบุรี', bkk_zone: 'พระนคร 2', categories: 'U14,U16', createdAt: '2026-09-30T00:00:00Z', status: 'PENDING' });
  try {
    const overview = await request(app).get('/team/index.php').set('Cookie', teamSessionCookies(teamId));
    expect(overview.status).toBe(200);
    expect(overview.text).toContain('ลำดับที่ลงทะเบียน 2');
    expect(overview.text).toContain('ลำดับที่ลงทะเบียน 1');
    expect(overview.text).toContain('>บางกะปิ</h6>');
    const admin = await request(app).get('/admin/teams.php').set('Cookie', superAdminCookie());
    expect(admin.status).toBe(200);
    expect(admin.text).toContain('<td>บางกะปิ</td>');
    expect(admin.text).not.toContain('<td>เขตบางกะปิ</td>');
    const data = JSON.parse(admin.text.match(/id="rawTeamsDataJson">([\s\S]*?)<\/script>/)![1]);
    expect(data.find((t: any) => t.id === teamId).registrationRanks).toEqual({ U14: 2, U16: 1 });
    const category = await request(app).get('/admin/teams-u14.php').set('Cookie', superAdminCookie());
    expect(category.status).toBe(200);
    const categoryData = JSON.parse(category.text.match(/id="rawCatTeamsDataJson">([\s\S]*?)<\/script>/)![1]);
    expect(categoryData.find((t: any) => t.id === teamId).registrationRanks.U14).toBe(2);
    const script = category.text.slice(category.text.indexOf('    function getTeamDistrictCatSeqJs'), category.text.indexOf('    function getCatBadgeJs'));
    const context: any = {};
    vm.runInNewContext(script, context);
    expect(context.getTeamDistrictCatSeqJs(categoryData.find((t: any) => t.id === teamId), 'U14')).toBe(2);
  } finally {
    for (const id of [earlierId, otherId]) {
      const index = teamsDatabase.findIndex(t => t.id === id);
      if (index >= 0) teamsDatabase.splice(index, 1);
    }
  }
});
