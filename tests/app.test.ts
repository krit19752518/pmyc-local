jest.mock('../src/db', () => ({
  pool: {
    query: async (sql: string) => {
      if (sql.includes('INSERT INTO football_password_reset')) {
        throw new Error('Database disabled in isolated tests');
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
const initialTeamIds = new Set(teamsDatabase.map((team: any) => team.id));
const initialPlayerIds = new Set(playersDatabase.map((player: any) => player.id));
const originalTeamProfile = {
  ...teamProfile,
  categories: Array.isArray(teamProfile.categories) ? [...teamProfile.categories] : teamProfile.categories
};

describe('PM Youth CUP Football Automated Test Suites', () => {
  beforeAll(async () => {
    teamProfile.status = 'PENDING';
    teamProfile.submitted_categories = '';
    teamProfile.submittedCategories = '';
    if (!teamsDatabase.some(team => team.id === 'FTM-001')) {
      teamsDatabase.push({
        id: 'FTM-001',
        teamName: 'ทีมทดสอบรายชื่อนักกีฬา',
        categories: ['U14', 'U16', 'U18'],
        username: 'test_roster_page_team',
        status: 'PENDING',
        submitted_categories: ''
      });
    }
    if (!playersDatabase.some(p => p.id === 'PLY-001')) {
      playersDatabase.push(
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
      );
    }
  });

  afterAll(async () => {
    for (let index = teamsDatabase.length - 1; index >= 0; index--) {
      if (!initialTeamIds.has(teamsDatabase[index].id)) teamsDatabase.splice(index, 1);
    }
    for (let index = playersDatabase.length - 1; index >= 0; index--) {
      if (!initialPlayerIds.has(playersDatabase[index].id)) playersDatabase.splice(index, 1);
    }
    for (const key of Object.keys(teamProfile)) delete teamProfile[key];
    Object.assign(teamProfile, originalTeamProfile);
    cleanupTestUploadFiles();
    await pool.end();
  });
  
  describe('GET Team Management & Photo Uploads', () => {
    it('GET /team/players.php should render player list with photo upload controls when logged in', async () => {
      const res = await request(app)
        .get('/team/players.php')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001', 'team_user=admin']);

      expect(res.status).toBe(200);
      expect(res.text).toContain('รายชื่อนักกีฬา');
      expect(res.text).toContain('ด.ช. กิตติศักดิ์ มีสุข');
      expect(res.text).toContain('triggerPhotoUpload');
      expect(res.text).toContain('href="/team/player-edit.php?id=PLY-001&returnCategory=ALL"');
      expect(res.text).toContain("deletePlayer('PLY-001'");
      expect(res.text).toContain('id="filterPlayerName"');
      expect(res.text).toContain('id="filterPlayerIdCard"');
      expect(res.text).toContain('id="filterPlayerJersey"');
      expect(res.text).toContain('id="filterPlayerPosition"');
      expect(res.text).toContain('id="filterPlayerDocumentStatus"');
      expect(res.text).toContain('function filterTeamPlayers()');
      expect(res.text).toContain('row.dataset.playerName.toLocaleLowerCase().includes(nameQuery)');
      expect(res.text).toContain('จำนวนนักกีฬาไม่ครบตามเกณฑ์ขั้นต่ำ');
      expect(res.text).toContain('ยังขาดอีก');
      const testTeam = teamsDatabase.find(team => team.id === 'FTM-001');
      const originalCategories = testTeam?.categories;
      if (testTeam) testTeam.categories = ['U14', 'U16', 'U18'];
      const u18Res = await request(app)
        .get('/team/players.php?category=U18')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001', 'team_user=admin']);
      if (testTeam) testTeam.categories = originalCategories;
      expect(u18Res.status).toBe(200);
      expect(u18Res.text).toContain('player-edit.php?id=PLY-003&returnCategory=U18');
      expect(u18Res.text).toContain('btn-danger active');
    });

  });




});
