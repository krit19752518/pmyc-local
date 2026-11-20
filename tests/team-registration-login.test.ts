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
import { app, teamsDatabase } from '../src/app';
import { teamProfile } from '../src/models/team.model';
import { pool } from '../src/db';

const initialTeamIds = new Set(teamsDatabase.map((team: any) => team.id));
const originalTeamProfile = { ...teamProfile };

describe('Team Registration & Login Tests', () => {
  afterAll(async () => {
    for (let index = teamsDatabase.length - 1; index >= 0; index--) {
      if (!initialTeamIds.has(teamsDatabase[index].id)) teamsDatabase.splice(index, 1);
    }
    Object.assign(teamProfile, originalTeamProfile);
    await pool.end();
  });

  describe('POST /api/team/register Validation & Registration', () => {
    it('should return 400 Bad Request when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/team/register')
        .set('Accept', 'application/json')
        .send({ teamName: 'ทีมเอฟซี' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('กรุณากรอกข้อมูลให้ครบถ้วน');
    });

    it('should return 400 Bad Request when email or line_id is missing', async () => {
      const res = await request(app)
        .post('/api/team/register')
        .set('Accept', 'application/json')
        .send({
          teamName: 'ชลบุรี เอฟซี',
          province: 'ชลบุรี',
          district: 'เมืองชลบุรี',
          managerName: 'โค้ชเฮง',
          phone: '0819998888'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('อีเมล, LINE ID');
    });

    it('should return 201 Created and save team data when all required fields including email and line_id are valid', async () => {
      const initialCount = teamsDatabase.length;
      const res = await request(app)
        .post('/api/team/register')
        .set('Accept', 'application/json')
        .send({
          teamName: 'ชลบุรี เอฟซี',
          province: 'ชลบุรี',
          district: 'เมืองชลบุรี',
          managerName: 'โค้ชเฮง',
          phone: '0819998888',
          email: 'heng@chonburi.com',
          line_id: 'coachheng_line'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      try {
        expect(res.body.team.teamName).toBe('ชลบุรี เอฟซี');
        expect(res.body.team.email).toBe('heng@chonburi.com');
        expect(res.body.team.line_id).toBe('coachheng_line');
        expect(res.body.team.status).toBe('PENDING');
        expect(teamsDatabase.length).toBe(initialCount + 1);
      } finally {
        const index = teamsDatabase.findIndex((team: any) => team.id === res.body.team.id);
        if (index !== -1) teamsDatabase.splice(index, 1);
      }
    });

    it('should return 400 Bad Request when school_code is duplicate', async () => {
      const dupCode = '109999' + Date.now().toString().slice(-4);
      // Register 1st team
      const res1 = await request(app)
        .post('/api/team/register')
        .set('Accept', 'application/json')
        .send({
          teamName: 'โรงเรียนสาธิต A',
          school_code: dupCode,
          province: 'กรุงเทพมหานคร',
          district: 'ดุสิต',
          managerName: 'อาจารย์ A',
          phone: '0811112222',
          email: `school_a_${Date.now()}@test.com`,
          line_id: 'school_a_line'
        });
      expect(res1.status).toBe(201);

      // Try registering 2nd team with same school_code
      const res2 = await request(app)
        .post('/api/team/register')
        .set('Accept', 'application/json')
        .send({
          teamName: 'โรงเรียนสาธิต B',
          school_code: dupCode,
          province: 'กรุงเทพมหานคร',
          district: 'ดุสิต',
          managerName: 'อาจารย์ B',
          phone: '0833334444',
          email: `school_b_${Date.now()}@test.com`,
          line_id: 'school_b_line'
        });
      expect(res2.status).toBe(400);
      expect(res2.body.success).toBe(false);
      expect(res2.body.error).toContain(`รหัสสถานศึกษา ${dupCode} นี้มีอยู่ในระบบแล้ว`);
    });

    it('should create an uncategorized account and ignore legacy registration category inputs', async () => {
      const regRes = await request(app)
        .post('/api/team/register')
        .set('Accept', 'application/json')
        .send({
          teamName: 'โรงเรียนสตรีวิทยา เอฟซี',
          province: 'กรุงเทพมหานคร',
          district: 'ดุสิต',
          managerName: 'โค้ชประเสริฐ',
          phone: '0815556677',
          email: 'prasert@satriwit.ac.th',
          line_id: 'prasert_line',
          username: 'satriwit_all_cats',
          password: 'password123',
          'categories[]': ['U14', 'U16', 'U18']
        });

      expect(regRes.status).toBe(201);
      expect(regRes.body.success).toBe(true);
      const registeredTeam = regRes.body.team;
      expect(registeredTeam.categories).toBe('');
      // Age categories are added explicitly from the overview after registration.
      // Age categories are added explicitly from the overview after registration.

      // Verify on GET /team/team.php that all categories checkboxes are checked
      const getRes = await request(app)
        .get('/team/team.php')
        .set('Cookie', [`team_logged_in=true`, `team_id=${registeredTeam.id}`, `team_user=satriwit_all_cats`]);

      expect(getRes.status).toBe(200);
      expect(getRes.text).not.toContain('id="team_cat_u14"');
      expect(getRes.text).not.toContain('id="team_cat_u16"');
      expect(getRes.text).not.toContain('id="team_cat_u18"');
      expect(getRes.text).toContain('id="team_update_form"');
    });
  });

  describe('POST /api/team/login Auth Tests', () => {
    it('authenticates a Demo team account and shows the Demo badge on the team dashboard', async () => {
      const demoTeam = {
        id: `FTM-DEMO-LOGIN-${Date.now()}`,
        teamName: 'ทีม Demo สำหรับทดสอบ login',
        managerName: 'ผู้จัดการ Demo',
        email: 'jomthong1@gmail.com',
        username: 'jomthong1@gmail.com',
        password: '12345678',
        phone: '0800000000',
        province: 'กรุงเทพมหานคร',
        district: 'จอมทอง',
        categories: 'U14',
        status: 'PENDING',
        isTest: true
      };
      teamsDatabase.push(demoTeam);

      try {
        const login = await request(app)
          .post('/api/team/login')
          .send({ username: demoTeam.email, password: demoTeam.password });

        expect(login.status).toBe(302);
        expect(login.headers.location).toContain('/team/index.php');
        const loginCookies = login.headers['set-cookie'];
        expect(Array.isArray(loginCookies) ? loginCookies.join('; ') : String(loginCookies || '')).toContain(`team_id=${demoTeam.id}`);

        const dashboard = await request(app)
          .get('/team/index.php')
          .set('Cookie', [`team_logged_in=true`, `team_id=${demoTeam.id}`, `team_user=${encodeURIComponent(demoTeam.email)}`]);

        expect(dashboard.status).toBe(200);
        expect(dashboard.text).toContain('ข้อมูล Demo');
        expect(dashboard.text.indexOf('ข้อมูล Demo')).toBeLessThan(dashboard.text.indexOf('dropdown-toggle'));
        expect(dashboard.text).toContain('bg-warning text-dark fs-4 fw-bold');
      } finally {
        const index = teamsDatabase.findIndex((team: any) => team.id === demoTeam.id);
        if (index !== -1) teamsDatabase.splice(index, 1);
      }
    });

    it('should return 401 Unauthorized for wrong credentials', async () => {
      const res = await request(app)
        .post('/api/team/login')
        .send({ username: 'wronguser', password: 'wrongpassword' });

      expect(res.status).toBe(401);
    });

    it('should return 302 Found redirect for valid Scalling credentials', async () => {
      const res = await request(app)
        .post('/api/team/login')
        .send({ username: 'Scalling', password: 'Scalling' });

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('/team/index.php');
    });

    it('should return 302 Found redirect for valid admin/admin credentials', async () => {
      const res = await request(app)
        .post('/api/team/login')
        .send({ username: 'admin', password: 'admin' });

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('/team/index.php');
    });
  });

});
