jest.mock('../src/db', () => ({
  pool: {
    query: async () => ({ rows: [], rowCount: 0 }),
    end: async () => undefined
  }
}));
jest.mock('../src/db/initTables', () => ({
  initTeamTables: async () => undefined
}));

import request from 'supertest';
import { teamSessionCookies } from './team-session.helper';
import { cleanupTestUploadFiles } from '../src/middleware/upload';
import { app, teamsDatabase, playersDatabase } from '../src/app';
import { teamProfile } from '../src/models/team.model';
import { pool } from '../src/db';

const { officialsDatabase } = require('../src/app');
const initialTeamIds = new Set(teamsDatabase.map((team: any) => team.id));
const initialPlayerIds = new Set(playersDatabase.map((player: any) => player.id));
const initialOfficialIds = new Set(officialsDatabase.map((official: any) => official.id));
const originalTeamProfile = {
  ...teamProfile,
  categories: Array.isArray(teamProfile.categories) ? [...teamProfile.categories] : teamProfile.categories
};

describe('Team Registration & Category Workflow Guards', () => {
  beforeAll(() => {
    teamProfile.status = 'PENDING';
    teamProfile.submitted_categories = '';
    teamProfile.submittedCategories = '';
  });

  afterAll(async () => {
    for (let index = teamsDatabase.length - 1; index >= 0; index--) {
      if (!initialTeamIds.has(teamsDatabase[index].id)) teamsDatabase.splice(index, 1);
    }
    for (let index = playersDatabase.length - 1; index >= 0; index--) {
      if (!initialPlayerIds.has(playersDatabase[index].id)) playersDatabase.splice(index, 1);
    }
    for (let index = officialsDatabase.length - 1; index >= 0; index--) {
      if (!initialOfficialIds.has(officialsDatabase[index].id)) officialsDatabase.splice(index, 1);
    }
    for (const key of Object.keys(teamProfile)) delete teamProfile[key];
    Object.assign(teamProfile, originalTeamProfile);
    cleanupTestUploadFiles();
    await pool.end();
  });

  test('UT-REGISTER-DUP-EMAIL: POST /api/team/register returns 400 when registering with duplicate email', async () => {
    const uniqueEmail = `dup_test_${Date.now()}@example.com`;

    // 1st Registration
    const firstRes = await request(app)
      .post('/api/team/register')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        school: 'โรงเรียนทดสอบอีเมล 1',
        province: 'กรุงเทพมหานคร',
        district: 'ดุสิต',
        name: 'นายทดสอบ ผู้จัดการ',
        mobile: '0812345678',
        email: uniqueEmail,
        line_id: 'testline',
        password: 'password123',
        password_confirm: 'password123'
      });

    expect(firstRes.status).toBe(201);
    expect(firstRes.body.team?.docTeamCert).toBe('');

    // 2nd Registration with same email
    const dupRes = await request(app)
      .post('/api/team/register')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        school: 'โรงเรียนทดสอบอีเมล 2',
        province: 'เชียงใหม่',
        district: 'เมืองเชียงใหม่',
        name: 'นายทดสอบ 2',
        mobile: '0898765432',
        email: uniqueEmail,
        line_id: 'testline2',
        password: 'password123',
        password_confirm: 'password123'
      });

    expect(dupRes.status).toBe(400);
    expect(dupRes.body.success).toBe(false);
    expect(dupRes.body.error).toContain('ถูกใช้งานลงทะเบียนไปแล้ว');
  });

  test('UT-PER-CAT-LOCK-01: Allows player and official add/edit on unsubmitted category (U18) even when team profile status is APPROVED and U14 submitted', async () => {
    const testTeamId = `FTM-TEST-LOCK-${Date.now()}`;
    teamsDatabase.push({
      id: testTeamId,
      teamName: 'ทีมทดสอบล็อกรุ่น FC',
      managerName: 'นายผู้จัดการ',
      phone: '0812345678',
      email: 'test@lock.com',
      province: 'กรุงเทพมหานคร',
      categories: 'U14,U18',
      submitted_categories: 'U14',
      status: 'APPROVED',
      username: testTeamId
    });

    const previousQuery = pool.query;
    (pool as any).query = async (sql: string, values: any[] = []) => {
      const row = teamsDatabase.find(item => item.id === testTeamId)!;
      if (sql.includes('FROM football_registered_team')) return { rows: [{ ...row, team_name: row.teamName }], rowCount: 1 };
      if (sql.startsWith('UPDATE football_registered_team SET categories = $1, cancelled_categories')) {
        expect(values[2]).toBe(testTeamId);
        row.categories = values[0]; row.cancelled_categories = values[1];
        return { rows: [{ id: testTeamId }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    };
    try {
      const teamCookie = teamSessionCookies(testTeamId, testTeamId);
      const getPlayersU18 = await request(app)
        .get('/team/players.php?category=U18')
        .set('Cookie', teamCookie);

      expect(getPlayersU18.status).toBe(200);
      expect(getPlayersU18.text).toContain('เพิ่มนักกีฬา');
      expect(getPlayersU18.text).not.toContain('เพิ่มนักกีฬา (ส่งรายชื่อแล้ว)');

      const getEditU18 = await request(app)
        .get('/team/player-edit.php?category=U18')
        .set('Cookie', teamCookie);

      expect(getEditU18.status).toBe(200);
      expect(getEditU18.text).toContain('เพิ่มนักกีฬา');
      expect(getEditU18.text).not.toContain('ยื่นส่งรายชื่อเรียบร้อยแล้ว — รุ่น U18');

      const getOfficialsU18 = await request(app)
        .get('/team/officials.php?category=U18')
        .set('Cookie', teamCookie);

      expect(getOfficialsU18.status).toBe(200);
      expect(getOfficialsU18.text).toContain('เพิ่มเจ้าหน้าที่');
      expect(getOfficialsU18.text).not.toContain('ยื่นส่งรายชื่อเรียบร้อยแล้ว — รุ่น U18');
    } finally {
      (pool as any).query = previousQuery;
      const testTeamIndex = teamsDatabase.findIndex(team => team.id === testTeamId);
      if (testTeamIndex !== -1) teamsDatabase.splice(testTeamIndex, 1);
    }
  });

  test('UT-TEAM-SEQ-01: GET /team/index.php displays team registration sequence number by district and category', async () => {
    const res = await request(app)
      .get('/team/index.php')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001']);

    expect(res.status).toBe(200);
    expect(res.text).toContain('ลำดับที่ลงทะเบียน');
  });

  test('UT-CANCEL-CAT-01: POST /api/team/cancel-category cancels category registration and renders cancelled badge on overview page', async () => {
    const testTeamId = `FTM-TEST-CANCEL-${Date.now()}`;
    teamsDatabase.push({
      id: testTeamId,
      teamName: 'ทีมทดสอบยกเลิก FC',
      managerName: 'นายผู้จัดการ',
      phone: '0812345679',
      email: 'test@cancel.com',
      province: 'กรุงเทพมหานคร',
      categories: 'U14,U16',
      submitted_categories: '',
      cancelled_categories: '',
      status: 'PENDING',
      username: testTeamId
    });

    const previousQuery = pool.query;
    (pool as any).query = async (sql: string, values: any[] = []) => {
      const row = teamsDatabase.find(item => item.id === testTeamId)!;
      if (sql.includes('FROM football_registered_team')) return { rows: [{ ...row, team_name: row.teamName }], rowCount: 1 };
      if (sql.startsWith('UPDATE football_registered_team SET categories = $1, cancelled_categories')) {
        expect(values[2]).toBe(testTeamId);
        row.categories = values[0]; row.cancelled_categories = values[1];
        return { rows: [{ id: testTeamId }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    };
    try {
      const teamCookie = teamSessionCookies(testTeamId, testTeamId);

      // 1. Cancel U14 category
      const cancelRes = await request(app)
        .post('/api/team/cancel-category')
        .set('Cookie', teamCookie)
        .send({ category: 'U14' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.success).toBe(true);
      expect(cancelRes.body.cancelled_categories).toContain('U14');

      // 2. Inspect /team/index.php
      const overviewRes = await request(app)
        .get('/team/index.php')
        .set('Cookie', teamCookie);

      expect(overviewRes.status).toBe(200);
      expect(overviewRes.text).toContain('ได้ทำการยกเลิกการสมัครแล้ว');

      const adminTeamsRes = await request(app)
        .get('/admin/teams.php')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);

      expect(adminTeamsRes.status).toBe(200);
      expect(adminTeamsRes.text).toContain('ยกเลิกการสมัคร');
      expect(adminTeamsRes.text).toContain('cancelledCats.includes(categoryCode)');

      // 3. Inspect /team/team.php (U14 should be unchecked and disabled with cancelled badge)
      const teamProfileRes = await request(app)
        .get('/team/team.php')
        .set('Cookie', teamCookie);

      expect(teamProfileRes.status).toBe(200);
      expect(teamProfileRes.text).toContain('id="team_update_form"');
      expect(teamsDatabase.find(team => team.id === testTeamId)?.cancelled_categories).toBe('U14');
      expect(teamProfileRes.text).not.toContain('id="team_cat_u14" checked');

      // 4. Inspect /team/player-edit.php (U14 checkbox should be disabled with cancelled text)
      const playerEditRes = await request(app)
        .get('/team/player-edit.php')
        .set('Cookie', teamCookie);

      expect(playerEditRes.status).toBe(200);
      expect(playerEditRes.text).toContain('(ยกเลิกการสมัครแล้ว)');
      expect(playerEditRes.text).not.toContain('id="cat_check_U14" checked');
    } finally {
      const testTeamIndex = teamsDatabase.findIndex(team => team.id === testTeamId);
      if (testTeamIndex !== -1) teamsDatabase.splice(testTeamIndex, 1);
    }
  });

  test('UT-REGISTER-DOCS-01: POST /api/team/register saves attached documents and GET /team/team.php renders doc review buttons', async () => {
    const testEmail = `regdoc_${Date.now()}@example.com`;
    const testPhone = `08${Math.floor(10000000 + Math.random() * 90000000)}`;

    const regRes = await request(app)
      .post('/api/team/register')
      .set('Accept', 'application/json')
      .field('school', 'โรงเรียนทดสอบเอกสาร FC')
      .field('province', 'เชียงใหม่')
      .field('district', 'เมืองเชียงใหม่')
      .field('name', 'ผู้จัดการทดสอบ')
      .field('phone', testPhone)
      .field('email', testEmail)
      .field('line_id', 'testline')
      .field('password', '12345678')
      .field('password_confirm', '12345678')
      .field('categories[]', 'U14')
      .attach('doc_team_cert', Buffer.from('mock team cert content'), 'cert.pdf')
      .attach('doc_roster', Buffer.from('mock roster content'), 'roster.pdf');

    expect(regRes.status).toBe(201);
    expect(regRes.body.success).toBe(true);

    const createdTeamId = regRes.body.team?.id;
    expect(createdTeamId).toBeTruthy();

    // Verify returned team object has document URLs
    expect(regRes.body.team?.docTeamCert).toMatch(/^\/uploads\//);
    expect(regRes.body.team?.docRoster).toMatch(/^\/uploads\//);

    const cookies = regRes.headers['set-cookie'];
    expect(cookies).toBeTruthy();

    try {
      // 1. Verify profile page rendered directly after registration via returned cookies
      const profileRes = await request(app)
        .get('/team/team.php')
        .set('Cookie', cookies);

      expect(profileRes.status).toBe(200);
      expect(profileRes.text).toContain('รีวิวเอกสาร');
      expect(profileRes.text).toContain('มีไฟล์เดิมที่อัปโหลดไว้แล้ว');

      // 2. Verify subsequent query by email user cookie resolves attached documents correctly
      const emailCookie = `team_user=${encodeURIComponent(testEmail)}; team_id=${createdTeamId}; team_logged_in=true`;
      const profileRes2 = await request(app)
        .get('/team/team.php')
        .set('Cookie', [emailCookie]);

      expect(profileRes2.status).toBe(200);
      expect(profileRes2.text).toContain('รีวิวเอกสาร');
      expect(profileRes2.text).toContain('/uploads/');
    } finally {
      const idx = teamsDatabase.findIndex(t => t.id === createdTeamId);
      if (idx !== -1) teamsDatabase.splice(idx, 1);
    }
  });

  test('UT-PLAYERS-ALL-TAB-ADD-BTN-01: Should enable Add Player button on ALL tab when any category is unsubmitted and available', async () => {
    const testTeamId = 'FTM-TEST-ALL-TAB-BTN';
    const testUser = 'test_all_tab_user';
    const mockTeam = {
      id: testTeamId,
      teamName: 'ทีมทดสอบ ALL TAB เอฟซี',
      school: 'โรงเรียนทดสอบ',
      registeredCategories: ['U14', 'U18'],
      submitted_categories: 'U14',
      status: 'PENDING',
      username: testUser,
      password: 'password123'
    };

    teamsDatabase.push(mockTeam as any);

    const authCookie = `team_user=${testUser}; team_id=${testTeamId}; team_logged_in=true`;

    try {
      const res = await request(app)
        .get('/team/players.php')
        .set('Cookie', [authCookie]);

      expect(res.status).toBe(200);
      // Under ALL tab, U14 is submitted but U18 is unsubmitted and has space -> "เพิ่มนักกีฬา" button should be active and link to player-edit.php?category=U18
      expect(res.text).toContain('href="' + '/team/player-edit.php?category=U18' + '"');
      expect(res.text).toContain('เพิ่มนักกีฬา');
    } finally {
      const idx = teamsDatabase.findIndex(t => t.id === testTeamId);
      if (idx !== -1) teamsDatabase.splice(idx, 1);
    }
  });
});
