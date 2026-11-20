jest.mock('../src/db', () => ({
  pool: {
    query: async (sql: string) => {
      if (sql.includes('INSERT INTO football_password_reset')) {
        throw new Error('Database disabled in isolated tests');
      }
      if (sql.includes('FROM football_registered_team WHERE id::text = $1 FOR UPDATE')) {
        return { rows: [{ id: 'mock-team', categories: 'U14,U16,U18', submitted_categories: '', cancelled_categories: '', is_deleted: false }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    end: async () => undefined
  }
}));
jest.mock('../src/db/initTables', () => ({
  initTeamTables: async () => undefined
}));

import request from 'supertest';
import { cleanupTestUploadFiles } from '../src/middleware/upload';
import { app, teamsDatabase, playersDatabase } from '../src/app';
import { teamProfile } from '../src/models/team.model';
import { pool } from '../src/db';
import { createTeamSessionToken } from '../src/services/teamSession.service';

const initialTeamIds = new Set(teamsDatabase.map((team: any) => team.id));
const initialPlayerIds = new Set(playersDatabase.map((player: any) => player.id));
const originalTeamProfile = {
  status: teamProfile.status,
  submitted_categories: teamProfile.submitted_categories,
  submittedCategories: teamProfile.submittedCategories
};

describe('Player Management Tests', () => {
  beforeAll(() => {
    teamProfile.status = 'PENDING';
    teamProfile.categories = ['U14', 'U16', 'U18'];
    teamProfile.submitted_categories = '';
    teamProfile.submittedCategories = '';
    if (!teamsDatabase.some(team => team.id === 'FTM-001')) {
      teamsDatabase.push({
        id: 'FTM-001',
        teamName: 'ทีมทดสอบนักกีฬา',
        categories: 'U14,U16,U18',
        username: 'test_player_management_team',
        status: 'PENDING',
        submitted_categories: ''
      });
    }
    const playerFixtures = [
      {
        id: 'PLY-001',
        teamId: 'FTM-001',
        name: 'ด.ช. กิตติศักดิ์ มีสุข',
        idCard: '1-5001-00001-14-1',
        jerseyNo: 1,
        position: 'ผู้รักษาประตู (GK)',
        category: 'U14',
        birthDate: '2012-01-01',
        photoUrl: '/uploads/mock_photo.jpg',
        docIdCard: '/uploads/mock_id_card.pdf',
        docSchoolCert: '/uploads/mock_school_cert.pdf',
        docStatus: 'APPROVED'
      },
      {
        id: 'PLY-002',
        teamId: 'FTM-001',
        name: 'นาย ธนกฤต ใจดี',
        idCard: '1-1004-99999-34-2',
        jerseyNo: 4,
        position: 'กองหลัง (DF)',
        category: 'U16',
        photoUrl: null,
        docStatus: 'APPROVED'
      },
      {
        id: 'PLY-003',
        teamId: 'FTM-001',
        name: 'นาย ปรเมษฐ์ รุ่งเรือง',
        idCard: '1-1005-99999-56-3',
        jerseyNo: 10,
        position: 'กองหน้า (FW)',
        category: 'U18',
        photoUrl: null,
        docStatus: 'PENDING'
      }
    ];
    for (const fixture of playerFixtures) {
      if (!playersDatabase.some(player => player.id === fixture.id)) playersDatabase.push(fixture);
    }
  });

  afterAll(async () => {
    for (let index = teamsDatabase.length - 1; index >= 0; index--) {
      if (!initialTeamIds.has(teamsDatabase[index].id)) teamsDatabase.splice(index, 1);
    }
    for (let index = playersDatabase.length - 1; index >= 0; index--) {
      if (!initialPlayerIds.has(playersDatabase[index].id)) playersDatabase.splice(index, 1);
    }
    teamProfile.status = originalTeamProfile.status;
    teamProfile.submitted_categories = originalTeamProfile.submitted_categories;
    teamProfile.submittedCategories = originalTeamProfile.submittedCategories;
    cleanupTestUploadFiles();
    await pool.end();
  });

  describe('Player Add/Edit Form & Saving Flow', () => {
    it('GET /team/player-edit.php should render add player form without removed fields (middle_name, fivb_id, domicile, grade)', async () => {
      const res = await request(app)
        .get('/team/player-edit.php')
        .set('Cookie', ['team_logged_in=true']);

      expect(res.status).toBe(200);
      expect(res.text).toContain('เพิ่มนักกีฬา');
      expect(res.text).toContain('name="first_name"');
      expect(res.text).toContain('name="jersey_no"');
      expect(res.text).toContain('name="doc_id_card"');
      expect(res.text).not.toContain('name="doc_school_cert"');
      expect(res.text).not.toContain('name="doc_parent_consent"');
      expect(res.text).not.toContain('name="middle_name"');
      expect(res.text).not.toContain('name="fivb_id"');
      expect(res.text).not.toContain('name="domicile"');
      expect(res.text).not.toContain('name="grade"');
      expect(res.text).not.toContain('name="doc_team_cert"');
      expect(res.text).not.toContain('name="doc_roster"');
    });

    it('GET /team/player-edit.php?category=U16 leaves all categories unchecked below the info alert', async () => {
      const { teamsDatabase } = require('../src/app');
      teamsDatabase.push({
        id: 'FTM-TEST-PLAYER-CATEGORY-FORM',
        teamName: 'ทีมทดสอบฟอร์มเลือกหมวด',
        categories: 'U16,U18',
        username: 'test_player_category_form_user',
        status: 'PENDING',
        submitted_categories: ''
      });

      try {
        const res = await request(app)
          .get('/team/player-edit.php?category=U16')
          .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST-PLAYER-CATEGORY-FORM', 'team_user=test_player_category_form_user']);

        expect(res.status).toBe(200);
        expect(res.text).not.toMatch(/id="cat_check_U16"[^>]*checked/);
        expect(res.text).not.toMatch(/id="cat_check_U18"[^>]*checked/);
        expect(res.text).not.toMatch(/id="cat_check_U14"[^>]*checked/);
        expect(res.text.indexOf('id="category_checkbox_group"')).toBeGreaterThan(res.text.indexOf('ช่องที่มี'));
        expect(res.text.indexOf('id="category_checkbox_group"')).toBeLessThan(res.text.indexOf('id="jersey_no_input"'));
      } finally {
        const teamIndex = teamsDatabase.findIndex((team: any) => team.id === 'FTM-TEST-PLAYER-CATEGORY-FORM');
        if (teamIndex !== -1) teamsDatabase.splice(teamIndex, 1);
      }
    });

    it('GET /team/player-edit.php?id=PLY-001 should render edit form with existing player data', async () => {
      const res = await request(app)
        .get('/team/player-edit.php?id=PLY-001')
        .set('Cookie', ['team_logged_in=true']);

      expect(res.status).toBe(200);
      expect(res.text).toContain('แก้ไขข้อมูลนักกีฬา');
      expect(res.text).toContain('กิตติศักดิ์');
    });

    it('GET player edit preserves the selected roster category for return navigation', async () => {
      const res = await request(app)
        .get('/team/player-edit.php?id=PLY-003&returnCategory=U18')
        .set('Cookie', ['team_logged_in=true']);

      expect(res.status).toBe(200);
      expect(res.text).toContain('name="returnCategory" value="U18"');
      expect(res.text).toContain('href="/team/players.php?category=U18"');
    });

    it('POST /api/team/players/save should return 400 when required player document fields are missing', async () => {
      const res = await request(app)
        .post('/api/team/players/save')
        .set('Cookie', ['team_logged_in=true'])
        .field('name', 'ด.ช. ทดสอบ เอกสารขาด')
        .field('id_card', '1-1002-99999-12-2')
        .field('jersey_no', '10')
        .field('position', 'กองกลาง (MF)')
        .field('category', 'U14');

      expect(res.status).toBe(400);
      expect(res.text).toContain('กรุณาแนบไฟล์เอกสารจำเป็นให้ครบถ้วน');
    });

    it('POST /api/team/players/save should return 400 when file size exceeds 2 MB', async () => {
      const oversizeBuffer = Buffer.alloc(2.5 * 1024 * 1024); // 2.5 MB
      const res = await request(app)
        .post('/api/team/players/save')
        .set('Cookie', ['team_logged_in=true'])
        .field('name', 'ด.ช. ไฟล์ใหญ่เกิน')
        .field('id_card', '1-1002-99999-12-3')
        .field('jersey_no', '11')
        .field('position', 'กองหลัง (DF)')
        .field('category', 'U14')
        .attach('doc_id_card', oversizeBuffer, 'big_id_card.pdf')
        .attach('photo', Buffer.from('fake-photo-content'), 'photo.jpg');

      expect(res.status).toBe(400);
      expect(res.text).toContain('ซึ่งเกินขนาดสูงสุดที่อนุญาต (2 MB)');
    });

    it('POST /api/team/players/save should return 400 when team player category quota (30 players) is reached', async () => {
      // Mock playersDatabase to simulate 30 players in FTM-999 for U14 category
      const mockPlayers = [] as any[];
      for (let i = 1; i <= 30; i++) {
        mockPlayers.push({
          id: `PLY-MOCK-${i}`,
          teamId: 'FTM-999',
          name: `ด.ช. นักกีฬา ${i}`,
          idCard: `1-9999-000${i < 10 ? '0' + i : i}-00-0`,
          jerseyNo: i,
          category: 'U14',
          docStatus: 'APPROVED'
        });
      }
      playersDatabase.push(...mockPlayers);

      try {
        // 1. Adding to full category (U14) should be rejected
        const res = await request(app)
          .post('/api/team/players/save')
          .set('Cookie', ['team_logged_in=true', 'team_id=FTM-999'])
          .set('X-Requested-With', 'XMLHttpRequest')
          .field('name', 'ด.ช. เกินโควตา')
          .field('prefix', 'ด.ช.')
          .field('first_name', 'เกินโควตา')
          .field('last_name', 'ทดสอบ')
          .field('id_card', '1-9999-99999-99-9')
          .field('jersey_no', '1')
          .field('birth_date', '2012-05-15')
          .field('position', 'กองหน้า (FW)')
          .field('categories', 'U14')
          .attach('doc_id_card', Buffer.from('fake-id-card-content'), 'id_card.pdf')
          .attach('photo', Buffer.from('fake-photo-content'), 'photo.jpg');

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('มีนักกีฬาครบ 30 คนตามโควตาสูงสุดแล้ว');

        // 2. GET /team/player-edit.php?category=U18 should render edit page successfully even when U14 is full
        const editRes = await request(app)
          .get('/team/player-edit.php?category=U18')
          .set('Cookie', ['team_logged_in=true', 'team_id=FTM-999']);

        expect(editRes.status).toBe(200);
        expect(editRes.text).toContain('เพิ่มนักกีฬา');
      } finally {
        for (const fixture of mockPlayers) {
          const index = playersDatabase.indexOf(fixture);
          if (index !== -1) playersDatabase.splice(index, 1);
        }
      }
    });

    it('POST /api/team/players/save should return 400 when id_card is not 13 digits or numeric', async () => {
      const res = await request(app)
        .post('/api/team/players/save')
        .set('Cookie', ['team_logged_in=true'])
        .field('name', 'ด.ช. เลขบัตรผิด')
        .field('id_card', '1234')
        .field('jersey_no', '10')
        .field('position', 'กองกลาง (MF)')
        .field('category', 'U14')
        .attach('doc_id_card', Buffer.from('fake-id-card-content'), 'id_card.pdf')
        .attach('doc_school_cert', Buffer.from('fake-cert-content'), 'cert.pdf')
        .attach('photo', Buffer.from('fake-photo-content'), 'photo.jpg');

      expect(res.status).toBe(400);
      expect(res.text).toContain('เลขประจำตัวประชาชนต้องเป็นตัวเลขและมีครบ 13 หลักเท่านั้น');
    });

    it('POST /api/team/players/save should return 400 when jersey_no is out of range 1-30', async () => {
      const res = await request(app)
        .post('/api/team/players/save')
        .set('Cookie', ['team_logged_in=true'])
        .field('name', 'ด.ช. เบอร์เสื้อผิด')
        .field('id_card', '1-1002-99999-12-3')
        .field('jersey_no', '99')
        .field('position', 'กองหลัง (DF)')
        .field('category', 'U14')
        .attach('doc_id_card', Buffer.from('fake-id-card-content'), 'id_card.pdf')
        .attach('doc_school_cert', Buffer.from('fake-cert-content'), 'cert.pdf')
        .attach('photo', Buffer.from('fake-photo-content'), 'photo.jpg');

      expect(res.status).toBe(400);
      expect(res.text).toContain('หมายเลขเสื้อต้องอยู่ระหว่าง 1 ถึง 30 เท่านั้น');
    });

    it('POST /api/team/players/save should return 400 when position is missing or empty', async () => {
      const res = await request(app)
        .post('/api/team/players/save')
        .set('Cookie', ['team_logged_in=true'])
        .field('name', 'ด.ช. ตำแหน่งไม่เลือก')
        .field('id_card', '1-1002-99999-12-3')
        .field('jersey_no', '12')
        .field('position', '')
        .field('category', 'U14')
        .attach('doc_id_card', Buffer.from('fake-id-card-content'), 'id_card.pdf')
        .attach('doc_school_cert', Buffer.from('fake-cert-content'), 'cert.pdf')
        .attach('photo', Buffer.from('fake-photo-content'), 'photo.jpg');

      expect(res.status).toBe(400);
      expect(res.text).toContain('กรุณาเลือกตำแหน่งการเล่นของนักกีฬา');
    });

    it('POST /api/team/players/save should return 400 when jersey_no is duplicate in the same team and category', async () => {
      const { playersDatabase, teamsDatabase } = require('../src/app');
      teamsDatabase.push({
        id: 'FTM-TEST-DUP-JERSEY',
        teamName: 'ทีมทดสอบเบอร์ซ้ำ',
        province: 'เชียงใหม่',
        managerName: 'โค้ชทดสอบเบอร์ซ้ำ',
        phone: '0891119999',
        categories: 'U14',
        username: 'test_dup_jersey_user',
        status: 'PENDING',
        submitted_categories: ''
      });
      playersDatabase.push({
        id: 'PLY-TEST-DUP-01',
        teamId: 'FTM-TEST-DUP-JERSEY',
        name: 'ด.ช. เบอร์เดิม',
        idCard: '1100299999121',
        category: 'U14',
        jerseyNo: 1,
        position: 'กองหน้า (FW)',
        docStatus: 'PENDING'
      });

      const res = await request(app)
        .post('/api/team/players/save')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST-DUP-JERSEY', 'team_user=test_dup_jersey_user'])
        .field('name', 'ด.ช. เบอร์ซ้ำ')
        .field('id_card', '1-1002-99999-12-4')
        .field('jersey_no', '1')
        .field('position', 'กองหน้า (FW)')
        .field('category', 'U14')
        .attach('doc_id_card', Buffer.from('fake-id-card-content'), 'id_card.pdf')
        .attach('doc_school_cert', Buffer.from('fake-cert-content'), 'cert.pdf')
        .attach('photo', Buffer.from('fake-photo-content'), 'photo.jpg');

      expect(res.status).toBe(400);
      expect(res.text).toContain('หมายเลขเสื้อ 1 ซ้ำกับ');

      // Cleanup
      const tIdx = teamsDatabase.findIndex((t: any) => t.id === 'FTM-TEST-DUP-JERSEY');
      if (tIdx !== -1) teamsDatabase.splice(tIdx, 1);
      const pIdx = playersDatabase.findIndex((p: any) => p.id === 'PLY-TEST-DUP-01');
      if (pIdx !== -1) playersDatabase.splice(pIdx, 1);
    });

    it('POST /api/team/players/save allows the same jersey number in a different category', async () => {
      const { playersDatabase, teamsDatabase } = require('../src/app');
      teamsDatabase.push({
        id: 'FTM-TEST-CROSS-CATEGORY-JERSEY',
        teamName: 'ทีมทดสอบเบอร์เสื้อข้ามรุ่น',
        categories: 'U16,U18',
        username: 'test_cross_category_jersey_user',
        status: 'PENDING',
        submitted_categories: ''
      });
      playersDatabase.push({
        id: 'PLY-TEST-CROSS-CATEGORY-U18',
        teamId: 'FTM-TEST-CROSS-CATEGORY-JERSEY',
        name: 'นักกีฬา U18 เบอร์ 21',
        idCard: '1100299999125',
        category: 'U18',
        jerseyNo: 21,
        position: 'กองหน้า (FW)',
        docStatus: 'PENDING'
      });

      try {
        const res = await request(app)
          .post('/api/team/players/save')
          .set('Accept', 'application/json')
          .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST-CROSS-CATEGORY-JERSEY', 'team_user=test_cross_category_jersey_user'])
          .field('name', 'นักกีฬา U16 เบอร์ 21')
          .field('id_card', '1-1002-99999-12-6')
          .field('jersey_no', '21')
          .field('position', 'กองหน้า (FW)')
          .field('birth_date', '2011-07-11')
          .field('categories', 'U16')
          .attach('doc_id_card', Buffer.from('fake-id-card-content'), 'id_card.pdf')
          .attach('doc_school_cert', Buffer.from('fake-cert-content'), 'cert.pdf')
          .attach('photo', Buffer.from('fake-photo-content'), 'photo.jpg');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      } finally {
        const tIdx = teamsDatabase.findIndex((t: any) => t.id === 'FTM-TEST-CROSS-CATEGORY-JERSEY');
        if (tIdx !== -1) teamsDatabase.splice(tIdx, 1);
        const pIdx = playersDatabase.findIndex((p: any) => p.id === 'PLY-TEST-CROSS-CATEGORY-U18');
        if (pIdx !== -1) playersDatabase.splice(pIdx, 1);
      }
    });

    it('POST /api/team/players/save should return 400 when id_card is already registered with another team', async () => {
      // PLY-001 has idCard '1-5001-00001-14-1' in FTM-001. A different team FTM-002 trying to register the same ID card should fail.
      const res = await request(app)
        .post('/api/team/players/save')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-002'])
        .field('name', 'ด.ช. ซ้ำข้ามทีม')
        .field('prefix', 'ด.ช.')
        .field('first_name', 'ซ้ำข้ามทีม')
        .field('last_name', 'ทดสอบ')
        .field('id_card', '1-5001-00001-14-1')
        .field('jersey_no', '15')
        .field('position', 'กองหน้า (FW)')
        .field('category', 'U14')
        .attach('doc_id_card', Buffer.from('fake-id-card-content'), 'id_card.pdf')
        .attach('doc_school_cert', Buffer.from('fake-cert-content'), 'cert.pdf')
        .attach('photo', Buffer.from('fake-photo-content'), 'photo.jpg');

      expect(res.status).toBe(400);
      expect(res.text).toContain('ถูกใช้ลงทะเบียนกับทีม');
    });

    it('POST /api/team/players/save should create, edit, and delete player successfully in full lifecycle test', async () => {
      // 1. Create New Player
      const saveRes = await request(app)
        .post('/api/team/players/save')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST-001'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .field('name', 'ด.ช. สมศักดิ์ (TEST)')
        .field('prefix', 'ด.ช.')
        .field('first_name', 'สมศักดิ์')
        .field('last_name', '(TEST)')
        .field('id_card', '1-8888-77777-66-9')
        .field('jersey_no', '7')
        .field('birth_date', '2013-05-15')
        .field('position', 'กองหน้า (FW)')
        .field('categories', 'U14')
        .attach('doc_id_card', Buffer.from('fake-id-card-content'), 'id_card.pdf')
        .attach('doc_school_cert', Buffer.from('fake-cert-content'), 'cert.pdf')
        .attach('photo', Buffer.from('fake-photo-content'), 'photo.jpg');

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.success).toBe(true);
      expect(saveRes.body.redirectUrl).toBe('/team/players.php');

      const createdId = saveRes.body.id;

      // Verify Player appears in listing
      const listRes = await request(app)
        .get('/team/players.php')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST-001']);
      expect(listRes.status).toBe(200);
      expect(listRes.text).toContain('สมศักดิ์');

      // 2. Edit Newly Created Player
      if (createdId) {
        const editRes = await request(app)
          .post('/api/team/players/save')
          .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST-001'])
          .set('X-Requested-With', 'XMLHttpRequest')
          .field('id', String(createdId))
          .field('returnCategory', 'U18')
          .field('name', 'ด.ช. สมศักดิ์ (TEST)')
          .field('prefix', 'ด.ช.')
          .field('first_name', 'สมศักดิ์')
          .field('last_name', '(TEST)')
          .field('id_card', '1-8888-77777-66-9')
          .field('jersey_no', '7')
          .field('birth_date', '2013-05-15')
          .field('position', 'กองหน้า (FW)')
          .field('categories', 'U14')
          .attach('doc_id_card', Buffer.from('fake-id-card-content'), 'id_card.pdf')
          .attach('doc_school_cert', Buffer.from('fake-cert-content'), 'cert.pdf')
          .attach('photo', Buffer.from('fake-photo-content'), 'photo.jpg');

        expect(editRes.status).toBe(200);
        expect(editRes.body.success).toBe(true);
        expect(editRes.body.redirectUrl).toBe('/team/players.php?category=U18');
        expect(playersDatabase.find(player => player.id === createdId)?.docStatus).toBe('PENDING');

        // 3. Delete Newly Created Player
        const deleteRes = await request(app)
          .post('/api/team/players/delete')
          .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST-001'])
          .send({ id: createdId });

        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body.success).toBe(true);
      }
    });

    it('POST /api/team/players/save must not report success or cache a player when both database inserts fail', async () => {
      const beforeCount = playersDatabase.length;
      const querySpy = jest.spyOn(pool, 'query').mockImplementation(async (sql: string) => {
        if (String(sql).includes('INSERT INTO football_player')) throw new Error('simulated persistence failure');
        if (String(sql).includes('FROM football_registered_team WHERE id::text = $1 FOR UPDATE')) {
          return { rows: [{ id: 'mock-team', categories: 'U14', submitted_categories: '', cancelled_categories: '', is_deleted: false }], rowCount: 1 } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      });
      try {
        const response = await request(app)
          .post('/api/team/players/save')
          .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST-DB-FAILURE'])
          .set('X-Requested-With', 'XMLHttpRequest')
          .field('name', 'นักกีฬาทดสอบ DB ล้มเหลว')
          .field('id_card', '1100400099988')
          .field('jersey_no', '17')
          .field('position', 'กองหน้า (FW)')
          .field('birth_date', '2013-05-15')
          .field('categories', 'U14')
          .attach('doc_id_card', Buffer.from('fake-id-card-content'), 'id_card.pdf')
          .attach('doc_school_cert', Buffer.from('fake-cert-content'), 'cert.pdf')
          .attach('photo', Buffer.from('fake-photo-content'), 'photo.jpg');

        expect(response.status).toBe(500);
        expect(response.body.success).toBe(false);
        expect(playersDatabase).toHaveLength(beforeCount);
        expect(querySpy.mock.calls.some(([sql, values]) => String(sql).includes('INSERT INTO football_audit_log') && values?.[0] === 'PLAYER_CREATED')).toBe(false);
      } finally {
        querySpy.mockRestore();
      }
    });

    it('POST /api/team/players/save should audit when a team submits a corrected player record', async () => {
      const player = {
        id: 'PLY-TEST-AUDIT-CORRECTION-01',
        teamId: 'FTM-001',
        name: 'นักกีฬาทดสอบปรับแก้',
        idCard: '1200000000044',
        jerseyNo: 29,
        position: 'กองหลัง (DF)',
        category: 'U14',
        docStatus: 'ACTION_REQUIRED',
        remarks: 'ข้อมูลเอกสารไม่ครบ',
        docIdCard: '/uploads/placeholder-id.pdf',
        photoUrl: '/uploads/placeholder-photo.jpg'
      };
      playersDatabase.push(player);
      const querySpy = jest.spyOn(pool, 'query').mockImplementation(async (sql: string) => {
        if (sql.includes('UPDATE football_player SET')) return { rows: [], rowCount: 1 } as any;
        return { rows: [], rowCount: 0 } as any;
      });

      try {
        const response = await request(app)
          .post('/api/team/players/save')
          .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001', 'team_user=team-audit-test', `team_session=${encodeURIComponent(createTeamSessionToken('FTM-001', 'team-audit-test'))}`])
          .set('X-Requested-With', 'XMLHttpRequest')
          .field('id', player.id)
          .field('name', player.name)
          .field('first_name', 'ทดสอบ')
          .field('last_name', 'ปรับแก้')
          .field('id_card', player.idCard)
          .field('jersey_no', String(player.jerseyNo))
          .field('position', player.position)
          .field('category', 'U14');

        expect(response.status).toBe(200);
        expect(player.docStatus).toBe('PENDING');
        const auditCall = querySpy.mock.calls.find(([sql, values]: any[]) =>
          String(sql).includes('INSERT INTO football_audit_log') && values?.[0] === 'PLAYER_CORRECTION_SUBMITTED'
        );
        expect(auditCall).toBeDefined();
        expect(auditCall?.[1]?.[2]).toBe('team-audit-test');
        expect(JSON.parse(String(auditCall?.[1]?.[9]))).toEqual({ docStatus: 'ACTION_REQUIRED' });
        expect(JSON.parse(String(auditCall?.[1]?.[10]))).toEqual({ docStatus: 'PENDING' });
      } finally {
        querySpy.mockRestore();
        const index = playersDatabase.indexOf(player);
        if (index !== -1) playersDatabase.splice(index, 1);
      }
    });

    it('UT-BIRTH-01: validates player birth year eligibility according to new rules (U14 >= 2556, U16 >= 2554, U18 >= 2552)', async () => {
      // 1. Birth Year 2552 (2009-05-10) should be allowed for U18
      const res2552 = await request(app)
        .post('/api/team/players/save')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST-001'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .field('name', 'นาย ทดสอบ2552 (TEST)')
        .field('first_name', 'ทดสอบ2552')
        .field('last_name', '(TEST)')
        .field('id_card', '1-8888-77777-66-8')
        .field('jersey_no', '8')
        .field('birth_date', '2009-05-10')
        .field('position', 'กองหลัง (DF)')
        .field('categories', 'U18')
        .attach('doc_id_card', Buffer.from('fake-id'), 'id.pdf')
        .attach('doc_school_cert', Buffer.from('fake-cert'), 'cert.pdf')
        .attach('photo', Buffer.from('fake-photo'), 'photo.jpg');

      expect(res2552.status).toBe(200);
      expect(res2552.body.success).toBe(true);
      if (res2552.body.id) {
        await request(app)
          .post('/api/team/players/delete')
          .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST-001'])
          .send({ id: res2552.body.id });
      }

      // 2. Birth Year 2551 (2008-12-31) should be rejected (out of range)
      const res2551 = await request(app)
        .post('/api/team/players/save')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST-001'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .field('name', 'นาย ทดสอบ2551 (TEST)')
        .field('first_name', 'ทดสอบ2551')
        .field('last_name', '(TEST)')
        .field('id_card', '1-8888-77777-66-7')
        .field('jersey_no', '9')
        .field('birth_date', '2008-12-31')
        .field('position', 'กองกลาง (MF)')
        .field('categories', 'U18')
        .attach('doc_id_card', Buffer.from('fake-id'), 'id.pdf')
        .attach('doc_school_cert', Buffer.from('fake-cert'), 'cert.pdf')
        .attach('photo', Buffer.from('fake-photo'), 'photo.jpg');

      expect(res2551.status).toBe(400);
      expect(res2551.body.error).toContain('ต้องเกิดตั้งแต่ 1 ม.ค. 2552 หรือหลังจากนั้น');
    });

    it('UT-ID-CARD-01: GET /team/player-edit.php renders id_card_input with placeholder="กรอกเฉพาะตัวเลข 13 หลัก" and maxlength="13"', async () => {
      const res = await request(app)
        .get('/team/player-edit.php?category=U18')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001', 'team_user=Scalling']);

      expect(res.status).toBe(200);
      expect(res.text).toContain('placeholder="กรอกเฉพาะตัวเลข 13 หลัก"');
      expect(res.text).toContain('maxlength="13"');
    });
  });

});
