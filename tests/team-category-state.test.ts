jest.mock('../src/db', () => ({ pool: { query: jest.fn(), connect: jest.fn() } }));
jest.mock('../src/db/initTables', () => ({ initTeamTables: async () => undefined }));
jest.mock('../src/services/auditLog.service', () => ({
  ...jest.requireActual('../src/services/auditLog.service'), writeAuditLog: jest.fn()
}));

import request from 'supertest';
import vm from 'node:vm';
import { app, teamsDatabase } from '../src/app';
import { pool } from '../src/db';
import { writeAuditLog } from '../src/services/auditLog.service';
import { teamSessionCookies } from './team-session.helper';
import { superAdminCookie, verifierCookie, satOfficerCookie } from './admin-session-test-helpers';
import { getTeamCategoryState } from '../src/utils/teamCategoryState';
import { changeTeamCategory } from '../src/services/teamCategory.service';
import { getDbRegisteredTeams } from '../src/models/team.model';

const id = 'FTM-CATEGORY-STATE';
let team: any, players: any[], officials: any[], snapshot: any, statements: string[], audit: any[];
let failAudit: boolean, failRoster: boolean;
const split = (s: any) => String(s || '').split(',').map(c => c.trim().toUpperCase());
async function query(sql: string, values: any[] = []): Promise<any> {
  statements.push(sql);
  if (sql === 'BEGIN') snapshot = { team: { ...team }, audit: [...audit] };
  if (sql === 'ROLLBACK') { team = { ...snapshot.team }; audit = [...snapshot.audit]; }
  if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [], rowCount: 0 };
  if (sql.includes(' AS player_count')) return { rows: [{
    player_count: players.filter(p => split(p.category).includes(values[1])).length,
    official_count: officials.filter(o => split(o.categories).includes(values[1])).length
  }] };
  if (sql.includes(' AS has_roster')) return { rows: [{ has_roster:
    players.some(p => split(p.category).includes(values[1])) || officials.some(o => split(o.categories).includes(values[1])) }] };
  if (sql.startsWith('SELECT') && sql.includes('FROM football_registered_team')) {
    return { rows: !values.length || values[0] === id || (Array.isArray(values[0]) && values[0].includes(id)) ? [{ ...team }] : [], rowCount: 1 };
  }
  if (sql.startsWith('UPDATE football_registered_team SET categories = $1, cancelled_categories')) {
    expect(values[2]).toBe(id);
    team.categories = values[0]; team.cancelled_categories = values[1];
    return { rows: [{ id }], rowCount: 1 };
  }
  if (sql.startsWith('UPDATE football_registered_team SET categories = $1')) {
    team.categories = values[0]; return { rows: [{ id }], rowCount: 1 };
  }
  if (sql.startsWith('SELECT') && sql.includes('FROM football_player')) {
    if (failRoster) throw new Error('roster unavailable');
    return { rows: players };
  }
  if (sql.startsWith('SELECT') && sql.includes('FROM football_official')) return { rows: officials };
  return jest.requireActual('./admin-test-fixtures').createAdminTestPool().query(sql, values);
}
beforeEach(() => {
  team = { id, team_name: 'Category state fixture', province: 'Fixture Province', district: 'District', categories: 'U14,U18',
    cancelled_categories: '', submitted_categories: '', status: 'PENDING', is_deleted: false, is_test: false, created_at: '2026-11-06T05:00:00Z' };
  players = []; officials = []; audit = []; statements = []; failAudit = false; failRoster = false;
  (pool.query as jest.Mock).mockImplementation(query);
  (pool.connect as jest.Mock).mockResolvedValue({ query, release: jest.fn() });
  (writeAuditLog as jest.Mock).mockImplementation(async (req: any, entry: any, executor: any) => {
    if (entry.eventType.startsWith('TEAM_CATEGORY_')) {
      if (failAudit) throw new Error('audit unavailable');
      expect(executor).toBeDefined();
      audit.push(entry); req.auditEventCount = (req.auditEventCount || 0) + 1;
    }
  });
});
afterEach(() => {
  const i = teamsDatabase.findIndex(t => t.id === id);
  if (i >= 0) teamsDatabase.splice(i, 1);
});
const cancel = (category: unknown, extra: any = {}) => request(app).post('/api/team/cancel-category')
  .set('Cookie', teamSessionCookies(id)).send({ category, ...extra });
const adminPrefix = (cookie: string[]) => cookie.some(c => c.startsWith('sat_admin_session=')) ? '/sat-admin' : '';
const review = (category = 'U16', cookie = superAdminCookie(), demo = false) => request(app)
  .get(adminPrefix(cookie) + '/api/admin/teams/category-state').query({ teamId: id, category, demo }).set('Cookie', cookie);
const repair = (body: any, cookie = superAdminCookie()) => request(app).post(adminPrefix(cookie) + '/api/admin/teams/repair-category-state')
  .set('Cookie', cookie).send({ teamId: id, category: 'U16', reason: 'ตรวจสอบประวัติและข้อมูลเดิมแล้ว', ...body });

test.each(['', 'U20', null, ['U14']])('invalid cancellation %j never writes', async category => {
  expect((await cancel(category)).status).toBe(400);
  expect(statements.some(s => s.startsWith('UPDATE'))).toBe(false);
});
test('non-enrolled cancellation is rejected even if an old cancellation flag exists', async () => {
  team.cancelled_categories = 'U16';
  expect((await cancel('U16')).status).toBe(409);
  expect(team.cancelled_categories).toBe('U16'); expect(audit).toHaveLength(0);
});
test('cancel commits with audit; duplicate has no second domain audit; other categories preserved', async () => {
  const before = { ...team };
  expect((await cancel('U14')).status).toBe(200);
  expect(team).toEqual({ ...before, cancelled_categories: 'U14' });
  expect(audit).toHaveLength(1);
  expect(audit[0].oldState.cancelledCategories).toEqual([]);
  expect(audit[0].newState.cancelledCategories).toEqual(['U14']);
  expect(statements.some(s => s.endsWith('FOR UPDATE'))).toBe(true);
  expect(statements).toContain('COMMIT');
  const duplicate = await cancel('U14');
  expect(duplicate.body.unchanged).toBe(true); expect(audit).toHaveLength(1);
});
test('audit failure rolls cancellation back and leaves memory unchanged', async () => {
  teamsDatabase.push({ id, categories: 'U14,U18', cancelled_categories: '' });
  failAudit = true;
  expect((await cancel('U14')).status).toBe(500);
  expect(team.cancelled_categories).toBe(''); expect(audit).toHaveLength(0);
  expect(teamsDatabase.find(t => t.id === id)?.cancelled_categories).toBe('');
  expect(statements).toContain('ROLLBACK'); expect(statements).not.toContain('COMMIT');
});
test('cancel uses signed session team, ignores body/query override; unsigned rejected', async () => {
  expect((await cancel('U14', { teamId: 'OTHER' })).status).toBe(200);
  const response = await request(app).post('/api/team/cancel-category?teamId=OTHER')
    .set('Cookie', teamSessionCookies(id)).send({ category: 'U18', teamId: 'OTHER' });
  expect(response.status).toBe(200); expect(team.cancelled_categories).toBe('U14,U18');
  const unsigned = await request(app).post('/api/team/cancel-category').set('Cookie', [`team_id=${id}`, 'team_logged_in=true']).send({ category: 'U14' });
  expect(unsigned.status).not.toBe(200);
});
test('deleted team is rejected', async () => {
  team.is_deleted = true;
  expect((await cancel('U14')).status).toBe(404);
});
test('orphan cleanup requires reviewed state and reason; enables Add without enrolling the team', async () => {
  team.cancelled_categories = 'U16,U14';
  const result = await review();
  expect(result.body.review).toMatchObject({ action: 'clear_orphan', players: 0, officials: 0, state: 'INCONSISTENT' });
  expect(statements.some(s => s.startsWith('UPDATE'))).toBe(false);
  expect((await repair({ action: 'clear_orphan' })).status).toBe(409);
  const token = result.body.review.reviewToken;
  expect((await repair({ action: 'clear_orphan', reviewToken: token, reason: '' })).status).toBe(400);
  expect((await repair({ action: 'clear_orphan', reviewToken: token })).status).toBe(200);
  expect(team.categories).toBe('U14,U18'); expect(team.cancelled_categories).toBe('U14');
  expect(audit[0]).toMatchObject({ eventType: 'TEAM_CATEGORY_STATE_REPAIRED', metadata: { action: 'clear_orphan' } });
  const added = await request(app).post('/api/team/add-category').set('Cookie', teamSessionCookies(id)).send({ category: 'U16' });
  expect(added.status).toBe(200); expect(team.categories).toBe('U14,U18,U16');
});
test.each(['player', 'official'])('legacy restore preserves %s roster and target submission', async kind => {
  team.cancelled_categories = 'U16,U18'; team.submitted_categories = 'U16';
  if (kind === 'player') players.push({ id: 'p', team_id: id, category: 'U16' });
  else officials.push({ id: 'o', team_id: id, categories: 'U16,U18' });
  const rosterBefore = JSON.stringify({ players, officials });
  const result = await review();
  expect(result.body.review.action).toBe('restore_legacy');
  expect((await repair({ action: 'clear_orphan', reviewToken: result.body.review.reviewToken })).status).toBe(409);
  expect((await repair({ action: 'restore_legacy', reviewToken: result.body.review.reviewToken })).status).toBe(200);
  expect(team.categories).toBe('U14,U18,U16'); expect(team.cancelled_categories).toBe('U18');
  expect(team.submitted_categories).toBe('U16'); expect(JSON.stringify({ players, officials })).toBe(rosterBefore);
});
test('changed review snapshot rejects repair without writes', async () => {
  team.cancelled_categories = 'U16';
  const token = (await review()).body.review.reviewToken;
  officials.push({ id: 'new', team_id: id, categories: 'U16' });
  expect((await repair({ action: 'clear_orphan', reviewToken: token })).status).toBe(409);
  expect(team.cancelled_categories).toBe('U16'); expect(audit).toHaveLength(0);
});
test('normal restore requires reason and preserves categories/submission/roster', async () => {
  team.cancelled_categories = 'U14,U18'; team.submitted_categories = 'U18';
  const restore = async (reason: string) => request(app).post('/api/admin/teams/restore-category-registration')
    .set('Cookie', superAdminCookie()).send({ teamId: id, category: 'U14', reason, reviewToken: (await review('U14')).body.review.reviewToken });
  expect((await restore('')).status).toBe(400);
  expect((await restore('คืนสถานะตามคำขอของทีม')).status).toBe(200);
  expect(team.categories).toBe('U14,U18'); expect(team.submitted_categories).toBe('U18'); expect(team.cancelled_categories).toBe('U18');
  expect(audit[0].eventType).toBe('TEAM_CATEGORY_REGISTRATION_RESTORED');
});
test('audit failure rolls legacy restore back', async () => {
  team.cancelled_categories = 'U16'; officials.push({ id: 'o', team_id: id, categories: 'U16' });
  const token = (await review()).body.review.reviewToken; failAudit = true;
  expect((await repair({ action: 'restore_legacy', reviewToken: token })).status).toBe(500);
  expect(team.categories).toBe('U14,U18'); expect(team.cancelled_categories).toBe('U16'); expect(audit).toHaveLength(0);
});
test('province, real/Demo and deleted guards fail closed for review and writes', async () => {
  team.cancelled_categories = 'U16'; team.province = 'Other province';
  expect((await review('U16', satOfficerCookie('sat-fixture@example.test', 'Fixture Province'))).status).toBe(403);
  expect((await repair({ action: 'clear_orphan' }, satOfficerCookie('sat-fixture@example.test', 'Fixture Province'))).status).toBe(403);
  expect((await review('U16', superAdminCookie(), true)).status).toBe(404);
  team.is_test = true;
  expect((await review('U16', verifierCookie(), true)).status).toBe(403);
  expect((await repair({ action: 'clear_orphan', isDemo: true }, verifierCookie())).status).toBe(403);
  team.is_test = false; team.is_deleted = true;
  expect((await review()).status).toBe(404);
});
test('team and admin show inconsistency with no misleading Add; generated scripts parse', async () => {
  officials.push({ id: 'o', team_id: id, categories: 'U16' });
  const overview = await request(app).get('/team/index.php').set('Cookie', teamSessionCookies(id));
  expect(overview.text).toContain('ข้อมูลสถานะรุ่นไม่สอดคล้อง');
  expect(overview.text).not.toContain('data-add-category="U16"');
  const admin = await request(app).get('/admin/teams.php').set('Cookie', superAdminCookie());
  expect(admin.text).toContain('ตรวจสอบ / คืนสถานะ');
  const data = JSON.parse(admin.text.match(/id="rawTeamsDataJson">([\s\S]*?)<\/script>/)![1]);
  expect(data.find((t: any) => t.id === id).categoryStates.U16).toBe('INCONSISTENT');
  for (const page of [admin, overview]) for (const match of page.text.matchAll(/<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});
test('UI refuses to advertise Add when persisted roster cannot be read', async () => {
  failRoster = true;
  expect((await request(app).get('/team/index.php').set('Cookie', teamSessionCookies(id))).status).toBe(503);
  expect((await request(app).get('/admin/teams.php').set('Cookie', superAdminCookie())).status).toBe(503);
});
test('stale memory cannot resurrect a cancellation or submission already cleared in DB', async () => {
  teamsDatabase.push({ id, categories: 'U14,U16,U18', cancelled_categories: 'U16', cancelledCategories: 'U16',
    submitted_categories: 'U16', submittedCategories: 'U16', is_deleted: true, isDeleted: true, isTest: true, is_test: true, isDemo: true });
  // Include Demo in the loader to exercise a conflicting stale cache flag too.
  const persisted = (await getDbRegisteredTeams(true)).find(t => t.id === id);
  expect(persisted).toMatchObject({ categories: 'U14,U18', cancelled_categories: '',
    submitted_categories: '', is_deleted: false, isTest: false });
  expect(persisted).not.toHaveProperty('isDemo', true);
  expect(persisted).not.toHaveProperty('cancelledCategories', 'U16');
});
test('admin profile save cannot remove categories using stale or forged form data', async () => {
  team.categories = 'U14,U16';
  teamsDatabase.push({ id, categories: 'U14,U16' });
  let profileSql = '';
  (pool.query as jest.Mock).mockImplementation(async (sql: string, values: any[]) => {
    if (sql.startsWith('UPDATE football_registered_team SET') && sql.includes('team_name = $1')) {
      profileSql = sql;
      expect(sql).not.toMatch(/\bcategories\s*=/);
      expect(values).toHaveLength(16);
      expect(values[15]).toBe(id);
      return { rowCount: 1, rows: [{ id }] };
    }
    return query(sql, values);
  });
  const result = await request(app).post('/api/admin/teams/update').set('Accept', 'application/json')
    .set('Cookie', superAdminCookie()).send({ id, teamName: team.team_name, province: team.province,
      managerName: 'Fixture manager', phone: '0800000000', categories: 'U14' });
  expect(result.status).toBe(200); expect(profileSql).not.toBe('');
  expect(team.categories).toBe('U14,U16');
  expect(teamsDatabase.find(t => t.id === id)?.categories).toBe('U14,U16');
});
test('legacy restore can reconcile orphan roster even without a cancellation marker', async () => {
  players.push({ id: 'legacy', team_id: id, category: 'U16' });
  const result = await review();
  expect(result.body.review.action).toBe('restore_legacy');
  expect((await repair({ action: 'restore_legacy', reviewToken: result.body.review.reviewToken })).status).toBe(200);
  expect(team.categories).toBe('U14,U18,U16'); expect(players).toHaveLength(1);
});
test.each([
  ['', '', false, 'NOT_REGISTERED'], ['', 'U16', false, 'INCONSISTENT'], ['', '', true, 'INCONSISTENT'],
  ['U16', '', false, 'ACTIVE'], ['U16', 'U16', true, 'CANCELLED']
])('category state %s/%s/roster=%s is %s', (categories, cancelled, roster, expected) => {
  expect(getTeamCategoryState({ categories, cancelled_categories: cancelled }, 'U16', Boolean(roster))).toBe(expected);
});

test('simultaneous category cancellations serialize on team lock without losing either category', async () => {
  let row = { ...team };
  let tail = Promise.resolve();
  const run = async (category: string) => {
    let unlock!: () => void;
    const previous = tail; tail = new Promise<void>(resolve => { unlock = resolve; });
    const executor = { query: async (sql: string, values: any[] = []) => {
      if (sql.endsWith('FOR UPDATE')) { await previous; return { rows: [{ ...row }] }; }
      if (sql.startsWith('UPDATE')) { row.categories = values[0]; row.cancelled_categories = values[1]; return { rowCount: 1 }; }
      throw new Error('unexpected query');
    } };
    try { return await changeTeamCategory(executor, id, category, 'cancel'); }
    finally { unlock(); }
  };
  await Promise.all([run('U14'), run('U18')]);
  expect(split(row.cancelled_categories).sort()).toEqual(['U14', 'U18']);
});
