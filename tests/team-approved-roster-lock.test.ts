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
import { cleanupTestUploadFiles } from '../src/middleware/upload';
import { app, teamsDatabase, playersDatabase } from '../src/app';
import { pool } from '../src/db';
import { teamSessionCookies } from './team-session.helper';

const { officialsDatabase } = require('../src/app');

describe('UT-LOCK: Approved Roster Lock Protection Tests', () => {
  const lockRunId = Date.now();
  const lockTeamId = `FTM-TEST-LOCK-APPROVED-${lockRunId}`;
  const lockPlayerId = `PLY-TEST-LOCK-001-${lockRunId}`;
  const approvedPlayerId = `PLY-TEST-LOCK-APPROVED-PLAYER-${lockRunId}`;
  const correctionPlayerId = `PLY-TEST-LOCK-CORRECTION-${lockRunId}`;
  const initialOfficialIds = new Set(officialsDatabase.map((official: any) => official.id));

  beforeAll(async () => {
    teamsDatabase.push({
      id: lockTeamId,
      teamName: 'ทีมทดสอบล็อกรายชื่อ',
      categories: 'U14',
      submitted_categories: 'U14',
      submittedCategories: 'U14',
      username: 'test_lock_user',
      status: 'PENDING'
    });
    playersDatabase.push({
      id: lockPlayerId,
      teamId: lockTeamId,
      name: 'นักกีฬาทดสอบล็อกรายชื่อ',
      idCard: '1100400099988',
      category: 'U14',
      docStatus: 'PENDING'
    }, {
      id: approvedPlayerId,
      teamId: lockTeamId,
      name: 'นักกีฬาอนุมัติแล้ว',
      idCard: '1100400099989',
      jerseyNo: 2,
      category: 'U14',
      docStatus: 'APPROVED'
    }, {
      id: correctionPlayerId,
      teamId: lockTeamId,
      name: 'นักกีฬาต้องปรับแก้',
      idCard: '1100400099970',
      jerseyNo: 3,
      category: 'U14',
      docStatus: 'ACTION_REQUIRED',
      remarks: 'เอกสารต้องแก้ไข',
      docIdCard: '/uploads/test-id.pdf',
      photoUrl: '/uploads/test-photo.jpg'
    });
    await request(app)
      .post('/api/admin/teams/update-status')
      .set('Accept', 'application/json')
      .set('Cookie', ['admin_session=true', 'admin_user=admin'])
      .send({ id: lockTeamId, status: 'APPROVED' });
  });

  afterAll(async () => {
    await request(app)
      .post('/api/admin/teams/update-status')
      .set('Accept', 'application/json')
      .set('Cookie', ['admin_session=true', 'admin_user=admin'])
      .send({ id: lockTeamId, status: 'PENDING' });
    for (let index = teamsDatabase.length - 1; index >= 0; index--) {
      if (teamsDatabase[index].id === lockTeamId) teamsDatabase.splice(index, 1);
    }
    const fixturePlayerIds = new Set([lockPlayerId, approvedPlayerId, correctionPlayerId]);
    for (let index = playersDatabase.length - 1; index >= 0; index--) {
      if (fixturePlayerIds.has(playersDatabase[index].id)) playersDatabase.splice(index, 1);
    }
    for (let index = officialsDatabase.length - 1; index >= 0; index--) {
      if (!initialOfficialIds.has(officialsDatabase[index].id) && officialsDatabase[index].teamId === lockTeamId) {
        officialsDatabase.splice(index, 1);
      }
    }
    cleanupTestUploadFiles();
    await pool.end();
  });

  test('UT-LOCK-01: GET /team/players.php renders lock banner and disabled buttons when team is APPROVED', async () => {
    const res = await request(app)
      .get('/team/players.php')
      .set('Cookie', ['team_logged_in=true', `team_id=${lockTeamId}`, 'team_user=test_lock_user']);

    expect(res.status).toBe(200);
    expect(res.text).toContain('รับรองแล้ว (อนุมัติรายชื่อและเอกสารแล้ว)');
    expect(res.text).toContain('ไม่สามารถเพิ่ม แก้ไข หรือลบข้อมูลนักกีฬาได้');
    expect(res.text).toContain('รับรองแล้ว');
    expect(res.text).not.toContain(`href="/team/player-edit.php?id=${lockPlayerId}&returnCategory=U14"`);
    expect(res.text).not.toContain(`href="/team/player-edit.php?id=${approvedPlayerId}&returnCategory=U14"`);
    expect(res.text).toContain(`href="/team/player-edit.php?id=${correctionPlayerId}&returnCategory=ALL"`);
    expect(res.text).toContain(`deletePlayer('${correctionPlayerId}'`);
    expect(res.text).not.toContain(`deletePlayer('${lockPlayerId}'`);
    expect(res.text).not.toContain(`deletePlayer('${approvedPlayerId}'`);
  });

  test('UT-LOCK-02: GET /team/officials.php renders approved status banner when team is APPROVED', async () => {
    const res = await request(app)
      .get('/team/officials.php')
      .set('Cookie', ['team_logged_in=true', `team_id=${lockTeamId}`, 'team_user=test_lock_user']);

    expect(res.status).toBe(200);
    expect(res.text).toContain('รับรองแล้ว (อนุมัติรายชื่อและเอกสารแล้ว)');
    expect(res.text).toContain('สามารถจัดการเจ้าหน้าที่ได้ไม่เกิน 8 คนต่อรุ่น');
  });

  test('UT-LOCK-03: GET /team/player-edit.php renders locked notice when team is APPROVED', async () => {
    const res = await request(app)
      .get('/team/player-edit.php')
      .set('Cookie', ['team_logged_in=true', `team_id=${lockTeamId}`, 'team_user=test_lock_user']);

    expect(res.status).toBe(200);
    expect(res.text).toContain('ยื่นส่งรายชื่อเรียบร้อยแล้ว');
    expect(res.text).toContain('ระบบล็อกการเพิ่ม/แก้ไขข้อมูลนักกีฬาของรุ่นนี้');
  });

  test('UT-LOCK-03B: GET /team/player-edit.php allows correction-status player edits only', async () => {
    const correctionRes = await request(app)
      .get(`/team/player-edit.php?id=${correctionPlayerId}`)
      .set('Cookie', ['team_logged_in=true', `team_id=${lockTeamId}`, 'team_user=test_lock_user']);
    const approvedRes = await request(app)
      .get(`/team/player-edit.php?id=${approvedPlayerId}`)
      .set('Cookie', ['team_logged_in=true', `team_id=${lockTeamId}`, 'team_user=test_lock_user']);

    expect(correctionRes.status).toBe(200);
    expect(correctionRes.text).toContain('นักกีฬาต้องปรับแก้');
    expect(correctionRes.text).not.toContain('ระบบล็อกการเพิ่ม/แก้ไขข้อมูลนักกีฬาของรุ่นนี้');
    expect(approvedRes.text).toContain('ระบบล็อกการเพิ่ม/แก้ไขข้อมูลนักกีฬาของรุ่นนี้');
  });

  test('UT-LOCK-03C: correction-status player can be updated after category submission', async () => {
    const correctionPlayer = playersDatabase.find(player => player.id === correctionPlayerId);
    const originalPlayer = { ...correctionPlayer };
    try {
      const editRes = await request(app)
        .post('/api/team/players/save')
        .set('Accept', 'application/json')
        .set('Cookie', ['team_logged_in=true', `team_id=${lockTeamId}`, 'team_user=test_lock_user'])
        .field('id', correctionPlayerId)
        .field('name', 'นักกีฬาต้องปรับแก้ อัปเดต')
        .field('id_card', '1100400099970')
        .field('jersey_no', '3')
        .field('position', 'กองหน้า (FW)')
        .field('categories', 'U14');

      expect(editRes.status).toBe(200);
      expect(editRes.body.success).toBe(true);
      expect(correctionPlayer.docStatus).toBe('PENDING');
      expect(correctionPlayer.remarks).toBe('');
      expect(correctionPlayer.category).toBe('U14');

      const playersRes = await request(app)
        .get('/team/players.php?category=U14')
        .set('Cookie', ['team_logged_in=true', `team_id=${lockTeamId}`, 'team_user=test_lock_user']);
      expect(playersRes.status).toBe(200);
      expect(playersRes.text).toContain('รอตรวจสอบ');
      expect(playersRes.text).not.toContain('แก้ไขข้อมูลเรียบร้อย');

      const submitRes = await request(app)
        .get('/team/submit.php')
        .set('Cookie', ['team_logged_in=true', `team_id=${lockTeamId}`, 'team_user=test_lock_user']);
      expect(submitRes.status).toBe(200);
      expect(submitRes.text).not.toContain('ปรับแก้ข้อมูลนักกีฬาเพิ่มเติม');
    } finally {
      Object.assign(correctionPlayer, originalPlayer);
    }
  });

  test('UT-LOCK-03D: correction edit validates only the selected eligible category, not a stale ineligible category', async () => {
    const correctionPlayer = playersDatabase.find(player => player.id === correctionPlayerId);
    const correctionTeam = teamsDatabase.find(team => team.id === lockTeamId);
    const originalPlayer = { ...correctionPlayer };
    const originalTeam = { ...correctionTeam };
    try {
      correctionPlayer.category = 'U14,U18';
      correctionPlayer.birthDate = '2012-10-16';
      correctionTeam.categories = 'U14,U18';
      correctionTeam.submitted_categories = 'U14,U18';

      const editRes = await request(app)
        .post('/api/team/players/save')
        .set('Accept', 'application/json')
        .set('Cookie', ['team_logged_in=true', `team_id=${lockTeamId}`, 'team_user=test_lock_user'])
        .field('id', correctionPlayerId)
        .field('name', 'นักกีฬาปรับแก้ เลือกรุ่น U18')
        .field('id_card', '1100400099970')
        .field('jersey_no', '3')
        .field('birth_date', '2012-10-16')
        .field('position', 'กองหน้า (FW)')
        .field('categories', 'U18');

      expect(editRes.status).toBe(200);
      expect(editRes.body.success).toBe(true);
      expect(correctionPlayer.category).toBe('U18');
      expect(correctionPlayer.docStatus).toBe('PENDING');
    } finally {
      Object.assign(correctionPlayer, originalPlayer);
      Object.assign(correctionTeam, originalTeam);
    }
  });

  test('UT-LOCK-04: POST /api/team/players/save and POST /api/team/players/delete return 400 when category is submitted', async () => {
    const saveRes = await request(app)
      .post('/api/team/players/save')
      .set('Accept', 'application/json')
      .set('Cookie', ['team_logged_in=true', `team_id=${lockTeamId}`, 'team_user=test_lock_user'])
      .send({ first_name: 'ทดสอบ', last_name: 'ล็อค', id_card: '1100400099999', jersey_no: 1, position: 'กองหน้า (FW)', category: 'U14' });

    expect(saveRes.status).toBe(400);
    expect(saveRes.body.error).toContain('ยื่นส่งรายชื่อเรียบร้อยแล้ว');

    const deleteRes = await request(app)
      .post('/api/team/players/delete')
      .set('Accept', 'application/json')
      .set('Cookie', ['team_logged_in=true', `team_id=${lockTeamId}`, 'team_user=test_lock_user'])
      .send({ id: lockPlayerId, category: 'U14' });

    expect(deleteRes.status).toBe(400);
    expect(deleteRes.body.error).toContain('ยื่นส่งรายชื่อเรียบร้อยแล้ว');

    const approvedDeleteRes = await request(app)
      .post('/api/team/players/delete')
      .set('Accept', 'application/json')
      .set('Cookie', ['team_logged_in=true', `team_id=${lockTeamId}`, 'team_user=test_lock_user'])
      .send({ id: approvedPlayerId });
    expect(approvedDeleteRes.status).toBe(400);

    const correctionDeleteRes = await request(app)
      .post('/api/team/players/delete')
      .set('Accept', 'application/json')
      .set('Cookie', ['team_logged_in=true', `team_id=${lockTeamId}`, 'team_user=test_lock_user'])
      .send({ id: correctionPlayerId });
    expect(correctionDeleteRes.status).toBe(200);
    expect(correctionDeleteRes.body.success).toBe(true);

  });

  test('UT-LOCK-05: POST /api/team/officials/save and POST /api/team/officials/delete allow official add and delete even when category is submitted', async () => {
    const { officialsDatabase } = require('../src/app');

    const saveRes = await request(app)
      .post('/api/team/officials/save')
      .set('Accept', 'application/json')
      .set('Cookie', teamSessionCookies(lockTeamId, 'test_lock_user'))
      .send({ name: 'ทดสอบ โค้ช ปลดล็อก', position: 'ผู้ฝึกสอน', id_card: '1100400018888', phone: '0812345678', category: 'U14' });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body.success).toBe(true);
    const savedOfficial = officialsDatabase.find((official: any) => official.name === 'ทดสอบ โค้ช ปลดล็อก');
    expect(savedOfficial).toBeDefined();

    const deleteRes = await request(app)
      .post('/api/team/officials/delete')
      .set('Accept', 'application/json')
      .set('Cookie', ['team_logged_in=true', `team_id=${lockTeamId}`, 'team_user=test_lock_user'])
      .send({ id: savedOfficial.id, category: 'U14' });

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

  });
});
