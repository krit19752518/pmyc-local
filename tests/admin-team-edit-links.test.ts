jest.mock('../src/db', () => ({ pool: { query: async () => ({ rows: [], rowCount: 0 }), end: async () => undefined } }));
jest.mock('../src/db/initTables', () => ({ initTeamTables: async () => undefined }));

import request from 'supertest';
import { app, teamsDatabase } from '../src/app';

const teamId = 'TEAM-EDIT-LINK-TEST';
beforeEach(() => {
  teamsDatabase.push({ id: teamId, teamName: 'ทีม <ทดสอบลิงก์>', province: 'เชียงใหม่', district: 'เมือง', categories: '', status: 'PENDING', isTest: false, is_deleted: false, password: 'NEVER-EXPOSE-LIST-PASSWORD' });
});
afterEach(() => {
  const index = teamsDatabase.findIndex(team => team.id === teamId);
  if (index !== -1) teamsDatabase.splice(index, 1);
});

test('Super Admin team names open the separate editor before and after client rendering', async () => {
  const result = await request(app).get('/admin/teams.php').set('Cookie', ['admin_session=true', 'admin_user=admin']);
  expect(result.status).toBe(200);
  const rows = result.text.match(/<tbody id="teamsTableBody">[\s\S]*?<\/tbody>/)![0];
  expect(rows).toContain(`/admin/team-edit.php?id=${teamId}`);
  expect(rows).toContain('ทีม &lt;ทดสอบลิงก์&gt;');
  expect(result.text).toContain('window.canEditTeamProfile = true');
  expect(result.text).not.toContain('NEVER-EXPOSE-LIST-PASSWORD');
  const rendering = result.text.slice(result.text.indexOf('tbody.innerHTML = paginated.map'));
  expect(rendering).toContain('window.canEditTeamProfile === true && !t.is_deleted');
  expect(rendering).toContain("escapeHtml(encodeURIComponent(t.id))");
});

test('verifier names remain inspection-only and do not expose the full editor link', async () => {
  const result = await request(app).get('/admin/teams.php').set('Cookie', ['admin_session=true', 'admin_user=verifier01']);
  expect(result.status).toBe(200);
  const rows = result.text.match(/<tbody id="teamsTableBody">[\s\S]*?<\/tbody>/)![0];
  expect(rows).not.toContain(`/admin/team-edit.php?id=${teamId}`);
  expect(result.text).toContain('window.canEditTeamProfile = false');
});

test('Demo and soft-deleted teams never link into the real registration editor', async () => {
  const deleted = teamsDatabase.find(team => team.id === teamId)!;
  deleted.is_deleted = true;
  const result = await request(app).get('/admin/teams.php?type=deleted_teams').set('Cookie', ['admin_session=true', 'admin_user=admin']);
  expect(result.status).toBe(200);
  const rows = result.text.match(/<tbody id="teamsTableBody">[\s\S]*?<\/tbody>/)![0];
  expect(rows).not.toContain(`/admin/team-edit.php?id=${teamId}`);
  const demo = await request(app).get('/admin/teams-demo.php').set('Cookie', ['admin_session=true', 'admin_user=admin']);
  expect(demo.status).toBe(200);
  expect(demo.text).toContain('window.canEditTeamProfile = false');
});
