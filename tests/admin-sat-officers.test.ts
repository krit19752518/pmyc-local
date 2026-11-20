jest.mock('../src/db', () => ({
  pool: {
    query: async (sql: string) => {
      if (sql.includes('INSERT INTO football_password_reset')) {
        throw new Error('Database disabled in isolated tests');
      }
      return { rows: [], rowCount: 0 };
    },
    connect: async (): Promise<any> => ({
      query: async () => ({ rows: [], rowCount: 0 }),
      release: () => undefined
    }),
    end: async () => undefined
  }
}));
jest.mock('../src/db/initTables', () => ({
  initTeamTables: async () => undefined
}));

import request from 'supertest';
import { app } from '../src/app';
import { authenticateAdmin, satOfficersDatabase } from '../src/adminAuth';
import { pool } from '../src/db';
import { superAdminCookie, satOfficerCookie } from './admin-session-test-helpers';

const initialSatOfficerIds = new Set(satOfficersDatabase.map(officer => officer.id));

describe('SAT Officer Administration & Login Tests', () => {
  beforeAll(() => {
    if (!satOfficersDatabase.some(officer => officer.id === 'SAT-001')) {
      satOfficersDatabase.push({
        id: 'SAT-001',
        fullname: 'นายสมศักดิ์ รัตนชัย',
        position: 'ผู้อำนวยการ สำนักงาน กกท. จังหวัดชลบุรี',
        province: 'ชลบุรี',
        phone: '038-123456',
        email: 'somsak.sat@sports.go.th',
        passwordHash: '123456',
        createdAt: '2026-09-17 00:00:00'
      });
    }
  });

  afterAll(async () => {
    for (let index = satOfficersDatabase.length - 1; index >= 0; index--) {
      if (!initialSatOfficerIds.has(satOfficersDatabase[index].id)) satOfficersDatabase.splice(index, 1);
    }
    await pool.end();
  });

    it('IT-SAT-01: GET /admin/sat-officers.php should render SAT officers page and list', async () => {
      const res = await request(app)
        .get('/admin/sat-officers.php')
        .set('Cookie', superAdminCookie());

      expect(res.status).toBe(200);
      expect(res.text).toContain('ข้อมูลเจ้าหน้าที่ การกีฬาแห่งประเทศไทย (กกท.)');
      expect(res.text).toContain('นายสมศักดิ์ รัตนชัย');
      expect(res.text).toContain('ชลบุรี');
      expect(res.text).toContain('name="line_id"');
      expect(res.text).toContain('id="edit_sat_line_id"');
      const addModal = res.text.split('id="addSatModal"')[1]?.split('id="editSatModal"')[0] || '';
      expect(addModal.indexOf('name="phone"')).toBeLessThan(addModal.indexOf('name="line_id"'));
      expect(addModal.match(/name="line_id"[^>]*required/)).toBeNull();
    });

    it('IT-SAT-02: POST /api/admin/sat-officers/save should create new SAT officer with password', async () => {
      const res = await request(app)
        .post('/api/admin/sat-officers/save')
        .set('Cookie', superAdminCookie())
        .set('Accept', 'application/json')
        .send({
          fullname: 'นายวิชัย กีฬาดี',
          position: 'เจ้าหน้าที่ กกท. เชียงใหม่',
          province: 'เชียงใหม่',
          phone: '053-999888',
          line_id: 'wichai-line',
          email: 'wichai@sports.go.th',
          password: 'password123'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.officer.fullname).toBe('นายวิชัย กีฬาดี');
      expect(res.body.officer.province).toBe('เชียงใหม่');
      expect(res.body.officer.lineId).toBe('wichai-line');
    });

    it('IT-SAT-02-VAL: POST /api/admin/sat-officers/save should reject password less than 8 characters', async () => {
      const res = await request(app)
        .post('/api/admin/sat-officers/save')
        .set('Cookie', superAdminCookie())
        .set('Accept', 'application/json')
        .send({
          fullname: 'นายทดสอบ สั้นเกิน',
          position: 'เจ้าหน้าที่',
          province: 'ระยอง',
          phone: '038-111222',
          email: 'shortpass@sports.go.th',
          password: '123'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
    });

    it('IT-SAT-03: POST /api/admin/sat-officers/update should update SAT officer', async () => {
      const res = await request(app)
        .post('/api/admin/sat-officers/update')
        .set('Cookie', superAdminCookie())
        .set('Accept', 'application/json')
        .send({
          id: 'SAT-001',
          fullname: 'นายสมศักดิ์ รัตนชัย',
          position: 'ผู้อำนวยการ สำนักงาน กกท. จังหวัดชลบุรี',
          province: 'ชลบุรี',
          phone: '038-123456',
          email: 'somsak.sat@sports.go.th'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('IT-SAT-04: POST /api/admin/sat-officers/delete should delete created test SAT officer', async () => {
      // Create temp officer to test delete
      const createRes = await request(app)
        .post('/api/admin/sat-officers/save')
        .set('Cookie', superAdminCookie())
        .set('Accept', 'application/json')
        .send({
          fullname: 'นายทดสอบ ลบออก',
          position: 'เจ้าหน้าที่',
          province: 'ตราด',
          phone: '039-000000',
          email: 'tempdel@sports.go.th',
          password: 'password123'
        });

      expect(createRes.status).toBe(201);
      const tempId = createRes.body.officer?.id;
      expect(tempId).toBeDefined();

      const res = await request(app)
        .post('/api/admin/sat-officers/delete')
        .set('Cookie', superAdminCookie())
        .send({ id: tempId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('IT-SAT-05: SAT Officer login should succeed and render Dashboard scoped to province only', async () => {
      const user = await authenticateAdmin('somsak.sat@sports.go.th', '123456');
      expect(user).not.toBeNull();
      expect(user?.roleCode).toBe('SAT_OFFICER');
      expect(user?.province).toBe('ชลบุรี');
      expect(user?.permissions).toContain('teams:verify');

      const res = await request(app)
        .get('/sat-admin/dashboard.php')
        .set('Cookie', satOfficerCookie());

      expect(res.status).toBe(200);
      expect(res.text).toContain('แผงควบคุม (Dashboard)');
      expect(res.text).toContain('แสดงเฉพาะทีมพื้นที่จังหวัด: ชลบุรี');
      expect(res.text).not.toContain('จัดการบัญชีผู้ดูแล');
    });

    it('IT-SAT-NAV-01: SAT Officer dashboard should render top navbar with "กกท. จังหวัด" active dropdown and highlight', async () => {
      const res = await request(app)
        .get('/sat-admin/dashboard.php')
        .set('Cookie', satOfficerCookie());

      expect(res.status).toBe(200);
      expect(res.text).toContain('id="satUserDropdown"');
      expect(res.text).toContain('nav-link dropdown-toggle active');
      expect(res.text).toContain('กกท. จังหวัด');
    });

});
