jest.mock('../src/db', () => ({
  pool: {
    query: async (sql: string, values: any[] = []) => {
      if (String(sql).includes('FROM football_player WHERE team_id = $1') && String(values?.[0]) === 'FTM-001') {
        return { rows: [
          { id: 'PLY-001', team_id: 'FTM-001', name: 'ด.ช. กิตติศักดิ์ มีสุข', id_card: '1-5001-00001-14-1', jersey_no: 1, category: 'U14', doc_status: 'APPROVED', photo_url: '/uploads/mock_photo.jpg', doc_id_card: '/uploads/mock_id_card.pdf' },
          { id: 'PLY-002', team_id: 'FTM-001', name: 'นาย ธนกฤต ใจดี', id_card: '1-1004-99999-34-2', jersey_no: 4, category: 'U16', doc_status: 'APPROVED' },
          { id: 'PLY-003', team_id: 'FTM-001', name: 'นาย ปรเมษฐ์ รุ่งเรือง', id_card: '1-1005-99999-56-3', jersey_no: 10, category: 'U18', doc_status: 'PENDING' }
        ], rowCount: 3 };
      }
      if (String(sql).includes('SELECT id, categories, submitted_categories, cancelled_categories, is_deleted FROM football_registered_team')) {
        return { rows: [{ id: 'FTM-001', categories: 'U14,U16,U18', submitted_categories: '', cancelled_categories: '', is_deleted: false }], rowCount: 1 };
      }
      if (String(sql).includes('SELECT team_id, category FROM football_player')) {
        return { rows: ['U14', 'U16', 'U18'].map(category => ({ team_id: 'FTM-001', category })), rowCount: 3 };
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

const originalFixtureCategories = teamsDatabase.find(team => team.id === 'FTM-001')?.categories;

describe('UT-SESS: 30-Minute Session Expiration & Sliding Renewal Tests', () => {
  beforeAll(() => {
    teamProfile.status = 'PENDING';
    const fixtureTeam = teamsDatabase.find(team => team.id === 'FTM-001');
    if (fixtureTeam) fixtureTeam.categories = 'U14,U16,U18';
    teamProfile.categories = ['U14', 'U16', 'U18'];
    teamProfile.submitted_categories = '';
    teamProfile.submittedCategories = '';
    if (!playersDatabase.some(player => player.id === 'PLY-001')) {
      playersDatabase.push(
        {
          id: 'PLY-001', teamId: 'FTM-001', name: 'ด.ช. กิตติศักดิ์ มีสุข',
          idCard: '1-5001-00001-14-1', jerseyNo: 1, position: 'ผู้รักษาประตู (GK)',
          category: 'U14', birthDate: '2012-01-01', photoUrl: '/uploads/mock_photo.jpg',
          docIdCard: '/uploads/mock_id_card.pdf', docSchoolCert: '/uploads/mock_school_cert.pdf', docStatus: 'APPROVED'
        },
        {
          id: 'PLY-002', teamId: 'FTM-001', name: 'นาย ธนกฤต ใจดี',
          idCard: '1-1004-99999-34-2', jerseyNo: 4, position: 'กองหลัง (DF)', category: 'U16',
          photoUrl: null, docStatus: 'APPROVED'
        },
        {
          id: 'PLY-003', teamId: 'FTM-001', name: 'นาย ปรเมษฐ์ รุ่งเรือง',
          idCard: '1-1005-99999-56-3', jerseyNo: 10, position: 'กองหน้า (FW)', category: 'U18',
          photoUrl: null, docStatus: 'PENDING'
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
    const fixtureTeam = teamsDatabase.find(team => team.id === 'FTM-001');
    if (fixtureTeam) fixtureTeam.categories = originalFixtureCategories;
    cleanupTestUploadFiles();
    await pool.end();
  });

  test('UT-SESS-01: Login response sets Max-Age=1800 on cookies', async () => {
    const res = await request(app)
      .post('/api/team/login')
      .send({ username: 'Scalling', password: 'Scalling' });

    expect(res.status).toBe(302);
    const cookiesHeader = res.headers['set-cookie'] || [];
    const cookieStr = Array.isArray(cookiesHeader) ? cookiesHeader.join('; ') : String(cookiesHeader);
    expect(cookieStr).toContain('Max-Age=1800');
    expect(cookieStr).toContain('team_logged_in=true');
  });

  test('UT-SESS-02: Register response sets Max-Age=1800 on cookies', async () => {
    const stamp = Date.now();
    const res = await request(app)
      .post('/api/team/register')
      .send({
        teamName: 'ทีมทดสอบ Session (TEST)',
        school_code: 'TEST-SESS-' + stamp,
        province: 'กรุงเทพมหานคร',
        district: 'ดุสิต',
        categories: ['U14'],
        managerName: 'ผู้จัดการ Session',
        email: 'session_test_' + stamp + '@example.com',
        phone: '0899998888',
        line_id: 'session_line_id',
        username: 'session_user_' + stamp,
        password: 'password123'
      });

    expect(res.status).toBe(201);
    const cookiesHeader = res.headers['set-cookie'] || [];
    const cookieStr = Array.isArray(cookiesHeader) ? cookiesHeader.join('; ') : String(cookiesHeader);
    expect(cookieStr).toContain('Max-Age=1800');
  });

  test('UT-SESS-03: Unauthenticated access to /team/index.php redirects to /team/login.php?expired=1', async () => {
    const res = await request(app).get('/team/index.php');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/team/login.php?expired=1');
  });

  test('UT-SESS-04: /team/login.php?expired=1 renders Session Expiration Alert', async () => {
    const res = await request(app).get('/team/login.php?expired=1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Session หมดอายุ');
    expect(res.text).toContain('ไม่มีการใช้งานเกิน 30 นาที');
  });

  test('UT-SESS-05: Protected page request refreshes sliding session Max-Age=1800', async () => {
    const res = await request(app)
      .get('/team/index.php')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001', 'team_user=Scalling']);

    expect(res.status).toBe(200);
    const cookiesHeader = res.headers['set-cookie'] || [];
    const cookieStr = Array.isArray(cookiesHeader) ? cookiesHeader.join('; ') : String(cookiesHeader);
    expect(cookieStr).toContain('Max-Age=1800');
  });

  test('UT-OVERVIEW-01: GET /team/index.php renders updated overview card, completeness check, and excludes final submission row', async () => {
    const res = await request(app)
      .get('/team/index.php')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001', 'team_user=Scalling']);

    expect(res.status).toBe(200);
    expect(res.text).toContain('วัน / เวลา ที่ลงสมัคร');
    expect(res.text).toContain('จำนวนนักกีฬา (รวมทุกรุ่น)');
    expect(res.text).toContain('ข้อมูลยังไม่ครบ ขาดส่วน ที่อยู่สำหรับติดต่อ');
    expect(res.text).not.toMatch(/<button[^>]*>[^<]*รอเพิ่มนักกีฬา/);
    expect(res.text).toContain('ตรวจสอบสถานะการแจ้งปัญหาการใช้งานระบบ');
    expect(res.text).toContain('<th style="width:44px"><span class="visually-hidden">บทสนทนา</span></th><th>ลำดับ</th><th>ปัญหาที่แจ้ง</th><th>วัน-เวลาแจ้ง</th><th>สถานะปัญหา</th><th>รายละเอียด</th>');
    expect(res.text).toContain('teamSupportReportRows');
    expect(res.text).toContain('const createConversationRow = (report, parentRow, columnCount)');
    expect(res.text).toContain('if (report.has_messages)');
    expect(res.text).toContain('row.append(createConversationRow(report, row, 6))');
    expect(res.text).toContain("OPEN: ['รับแจ้งแล้ว', 'warning', 'text-dark']");
    expect(res.text).toContain("IN_PROGRESS: ['กำลังดำเนินการ', 'primary', 'text-white']");
    expect(res.text).toContain("RESOLVED: ['แก้ไขแล้ว', 'success', 'text-white']");
    expect(res.text).toContain("CLOSED: ['ปิดรายการ', 'secondary', 'text-white']");
    expect(res.text).toContain('ข้อมูลเพิ่มเติมจากผู้ใช้งาน');
    expect(res.text).toContain('teamSupportAdditionalInfo');
    expect(res.text).toContain('บันทึกข้อมูลเพิ่มเติม');
    expect(res.text).toContain('ประวัติการแจ้งข้อมูลปัญหา');
    expect(res.text).toContain('<th style="width:64px">ลำดับ</th><th>ข้อมูลเพิ่มเติม</th><th style="width:220px">ผู้ส่ง</th>');
    expect(res.text).toContain('teamSupportHistoryRows');
    expect(res.text).toContain('table-primary');
    expect(res.text).toContain('table-success');
    expect(res.text).toContain("'/messages'");
    expect(res.text).toContain('/additional-info');
    expect(res.text).not.toContain('font-size: 0.75rem;');
    expect(res.text).not.toContain('การยืนยันส่งรายชื่อขั้นสุดท้าย');

    // Verify player counts per category are calculated using comma-separated categories and display quota (สิทธิ์ 18-30 คน)
    expect(res.text).not.toContain('ยังไม่มีข้อมูล (0 คน)');
    expect(res.text).toContain('(สิทธิ์ 18-30 คน)');
    expect(res.text).toContain('/team/players.php?category=U14');

    const supportReportsScript = [...res.text.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      .map(match => match[1])
      .find(script => script.includes('teamSupportReportRows'));
    expect(supportReportsScript).toBeDefined();
    expect(() => new Function(supportReportsScript as string)).not.toThrow();
    expect(supportReportsScript).toContain("'/api/team/support/reports?page='");
    expect(supportReportsScript).toContain("'/api/team/support/reports/'");
    expect(supportReportsScript).not.toContain("'/api/support/reports");
    expect(supportReportsScript).not.toContain('teamId=');
    expect(supportReportsScript).toContain("detailButton.textContent = 'ดูรายละเอียด'");
  });
});
