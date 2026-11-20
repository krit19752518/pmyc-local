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
import { cleanupTestUploadFiles } from '../src/middleware/upload';
import { app, teamsDatabase, playersDatabase, officialsDatabase } from '../src/app';
import { pool } from '../src/db';
import { authenticateAdmin, getAdminUsersList, createAdminUser, satOfficersDatabase } from '../src/adminAuth';
import { superAdminCookie, verifierCookie, satOfficerCookie } from './admin-session-test-helpers';

const initialTeamIds = new Set(teamsDatabase.map((team: any) => team.id));
const initialPlayerIds = new Set(playersDatabase.map((player: any) => player.id));
const initialOfficialIds = new Set(officialsDatabase.map((official: any) => official.id));
const initialSatOfficerIds = new Set(satOfficersDatabase.map(officer => officer.id));

describe('Admin Role & Permissions Automated Test Suite', () => {
  beforeAll(async () => {
    if (!playersDatabase.some(p => p.id === 'PLY-001')) {
      playersDatabase.push({
        id: 'PLY-001',
        teamId: 'FTM-001',
        name: 'ด.ช. กิตติศักดิ์ มีสุข',
        category: 'U14'
      });
    }
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
    for (let index = teamsDatabase.length - 1; index >= 0; index--) {
      if (!initialTeamIds.has(teamsDatabase[index].id)) teamsDatabase.splice(index, 1);
    }
    for (let index = playersDatabase.length - 1; index >= 0; index--) {
      if (!initialPlayerIds.has(playersDatabase[index].id)) playersDatabase.splice(index, 1);
    }
    for (let index = officialsDatabase.length - 1; index >= 0; index--) {
      if (!initialOfficialIds.has(officialsDatabase[index].id)) officialsDatabase.splice(index, 1);
    }
    for (let index = satOfficersDatabase.length - 1; index >= 0; index--) {
      if (!initialSatOfficerIds.has(satOfficersDatabase[index].id)) satOfficersDatabase.splice(index, 1);
    }
    cleanupTestUploadFiles();
    await pool.end();
  });

  describe('Service Layer Tests: authenticateAdmin & Permissions', () => {
    it('UT-ROLE-01: admin / 12348765 credentials should return SUPER_ADMIN User object', async () => {
      const user = await authenticateAdmin('admin', '12348765');
      expect(user).not.toBeNull();
      expect(user?.username).toBe('admin');
      expect(user?.roleCode).toBe('SUPER_ADMIN');
      expect(user?.permissions).toContain('users:manage');
      expect(user?.permissions).toContain('teams:verify');
    });

    it('UT-ROLE-02: verifier01 / 123456 credentials should return DOCUMENT_VERIFIER User object', async () => {
      const user = await authenticateAdmin('verifier01', '123456');
      expect(user).not.toBeNull();
      expect(user?.username).toBe('verifier01');
      expect(user?.roleCode).toBe('DOCUMENT_VERIFIER');
      expect(user?.permissions).toContain('teams:verify');
      expect(user?.permissions).not.toContain('users:manage');
    });

    it('UT-ROLE-03: invalid credentials should return null', async () => {
      const user = await authenticateAdmin('wronguser', 'wrongpass');
      expect(user).toBeNull();
    });
  });

  describe('Integration & API Authorization Guards Tests', () => {
    it('IT-ROLE-01: GET /api/admin/users without SUPER_ADMIN header should return 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Cookie', verifierCookie());

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Forbidden');
    });

    it('IT-ROLE-02: GET /api/admin/users with SUPER_ADMIN header should return 200 OK and list of admins', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Cookie', superAdminCookie())
        .set('x-admin-role', 'SUPER_ADMIN');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(res.body.users.length).toBeGreaterThanOrEqual(2);
    });

    it('IT-USERS-PAGE-01: GET /admin/users.php should render admin users page with addAdminUserModal', async () => {
      const res = await request(app)
        .get('/admin/users.php')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);

      expect(res.status).toBe(200);
      expect(res.text).toContain('จัดการบัญชีผู้ดูแล (Admin Accounts)');
      expect(res.text).toContain('addAdminUserModal');
      expect(res.text).toContain('addAdminUsername');
      expect(res.text).toContain('addAdminPassword');
      expect(res.text).toContain('addAdminRoleCode');
    });

    it('IT-CAT-TEAMS-01: GET Category Specific Teams pages (U14, U16, U18) should render correctly', async () => {
      const catPages = [
        { url: '/admin/teams-u14.php', title: 'รายการทีมลง U14 แต่ละเขต / อำเภอ', navTitle: 'U14 แต่ละเขต / อำเภอ' },
        { url: '/admin/teams-u16.php', title: 'รายการทีมลง U16 แต่ละเขต / อำเภอ', navTitle: 'U16 แต่ละเขต / อำเภอ' },
        { url: '/admin/teams-u18.php', title: 'รายการทีมลง U18 แต่ละเขต / อำเภอ', navTitle: 'U18 แต่ละเขต / อำเภอ' }
      ];

      for (const page of catPages) {
        const res = await request(app)
          .get(page.url)
          .set('Cookie', ['admin_session=true', 'admin_user=admin', 'admin_role=SUPER_ADMIN']);

        expect(res.status).toBe(200);
        expect(res.text).toContain(page.title);
        expect(res.text).toContain(page.navTitle);
        expect(res.text).toContain('catTeamsDataTable');
      }
    });

    it('IT-ADMIN-NAV-PLAYERS-01: keeps athlete roster direct and groups district teams separately', async () => {
      const res = await request(app)
        .get('/admin/players.php')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);

      expect(res.status).toBe(200);
      const playersLink = res.text.match(/<a href="[^"]*\/admin\/players\.php"[^>]*>[\s\S]*?รายการนักกีฬา[\s\S]*?<\/a>/)?.[0];
      expect(playersLink).toBeDefined();
      expect(playersLink).not.toContain('data-bs-toggle="collapse"');
      expect(res.text).toContain('รายการทีมลงแต่ละเขต / อำเภอ');
      expect(res.text).toContain('data-bs-target="#adminDistrictTeamsMenu"');
      expect(res.text).toContain('id="adminDistrictTeamsMenu"');
      const sidebar = res.text.match(/<div class="list-group list-group-flush admin-sidebar-nav">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0];
      expect(sidebar).toBeDefined();
      expect(sidebar).not.toContain('รายชื่อนักกีฬาทั้งหมด');
      for (const category of ['u14', 'u16', 'u18']) {
        expect(res.text).toContain(`/admin/teams-${category}.php`);
        expect(res.text).toContain(`/admin/bracket-${category}.php`);
      }
      expect(res.text).toContain('<i class="bi bi-trophy-fill fs-6 text-success"></i><span class="small">ตารางแข่ง U14</span>');
      expect(res.text).toContain('<i class="bi bi-trophy-fill fs-6 text-info"></i><span class="small">ตารางแข่ง U16</span>');
      expect(res.text).toContain('<i class="bi bi-trophy-fill fs-6 text-warning"></i><span class="small">ตารางแข่ง U18</span>');
    });

    it('IT-ADMIN-NAV-REPORTS-01: groups reports 1-6 under a collapsible menu and keeps the active report open', async () => {
      const reports = [
        { url: '/admin/report-demographics.php', nav: 'report-demographics', label: '1. รายงานวิเคราะห์การสมัคร & พื้นที่' },
        { url: '/admin/report-roster.php', nav: 'report-roster', label: '2. รายงานสถิตินักกีฬา & รุ่นแข่งขัน' },
        { url: '/admin/report-teams-categories.php', nav: 'report-teams-categories', label: '3. รายงานทีม & รุ่นแข่งขัน' },
        { url: '/admin/report-team-compliance.php', nav: 'report-team-compliance', label: '4. รายงานการตรวจสอบเอกสารการสมัครทีม' },
        { url: '/admin/report-compliance.php', nav: 'report-compliance', label: '5. รายงานการตรวจสอบเอกสารนักกีฬา' },
        { url: '/admin/report-strategy.php', nav: 'report-strategy', label: '6. รายงานประเมินการจัดแข่งครั้งต่อไป' }
      ];
      const pages = ['/admin/dashboard.php', ...reports.map(report => report.url)];

      for (const page of pages) {
        const res = await request(app)
          .get(page)
          .set('Cookie', ['admin_session=true', 'admin_user=admin']);

        expect(res.status).toBe(200);
        const isReportPage = page !== '/admin/dashboard.php';
        expect(res.text).toContain(`data-bs-target="#adminReportsMenu" aria-expanded="${isReportPage ? 'true' : 'false'}" aria-controls="adminReportsMenu"`);
        const reportsMenu = res.text.match(/<div class="collapse(?:\s+show)?\s*" id="adminReportsMenu">([\s\S]*?)<\/div>/)?.[1];
        expect(reportsMenu).toBeDefined();
        if (!reportsMenu) throw new Error('Reports submenu was not rendered');

        for (const report of reports) {
          expect(reportsMenu).toContain(`href="${report.url}"`);
          expect(reportsMenu).toContain(report.label);
          const hrefPosition = reportsMenu.indexOf(`href="${report.url}"`);
          const anchorStart = reportsMenu.lastIndexOf('<a ', hrefPosition);
          const anchorEnd = reportsMenu.indexOf('>', hrefPosition);
          const anchor = reportsMenu.slice(anchorStart, anchorEnd);
          expect(anchor.includes('active')).toBe(page === report.url);
        }
      }
    });

    it('IT-BRACKET-PAGE-01: renders the filtered bracket page for every age group', async () => {
      for (const category of ['U14', 'U16', 'U18']) {
        const res = await request(app)
          .get(`/admin/bracket-${category.toLowerCase()}.php`)
          .set('Cookie', ['admin_session=true', 'admin_user=admin']);

        expect(res.status).toBe(200);
        expect(res.text).toContain(`ตารางแข่งขันระดับเขต/อำเภอ ${category}`);
        expect(res.text).toContain('id="brProvince"');
        expect(res.text).toContain('id="brDistrict"');
        expect(res.text).toContain(`จัดสายการแข่งขัน รุ่น ${category}`);
        expect(res.text).toContain('data-bs-target="#adminDistrictTeamsMenu"');
        expect(res.text).toContain('data-bs-target="#adminDistrictBracketMenu"');
        expect(res.text).toContain('/api/admin/brackets/draw');
        expect(res.text).toContain('/api/admin/brackets/clear');
        expect(res.text).toContain('/api/admin/brackets/move');
        const inlineScripts = res.text.match(/<script>[\s\S]*?<\/script>/g) || [];
        const bracketScript = inlineScripts.find(script => script.includes("const cfg=JSON.parse(document.getElementById('brCfg')"));
        expect(bracketScript).toBeDefined();
        expect(() => new Function(bracketScript!.replace(/^<script>|<\/script>$/g, ''))).not.toThrow();
      }
    });

    it('IT-DEMO-BRACKET-PAGE-01: keeps Demo bracket pages available without adding them to navigation', async () => {
      for (const category of ['U14', 'U16', 'U18']) {
        const slug = category.toLowerCase();
        const res = await request(app)
          .get(`/admin/bracket-demo-${slug}.php`)
          .set('Cookie', superAdminCookie());

        expect(res.status).toBe(200);
        expect(res.text).toContain(`ตารางแข่งขันระดับเขต/อำเภอ ${category} Demo`);
        expect(res.text).toContain('Demo ระบบ');
        expect(res.text).not.toContain('ตารางแข่ง Demo');
        expect(res.text).not.toContain(`href="/admin/bracket-demo-${slug}.php"`);
        expect(res.text).toContain('data-bs-target="#adminDemoMenu" aria-expanded="true"');
        expect(res.text).not.toContain('adminDemoBracketMenu');
        expect(res.text).toContain(`/api/admin/demo-brackets/data`);
        expect(res.text).toContain(`/api/admin/demo-brackets/draw`);
        expect(res.text).toContain(`/api/admin/demo-brackets/clear`);
        expect(res.text).toContain(`/api/admin/demo-brackets/move`);
        expect(res.text).not.toContain('/api/admin/brackets/data');
      }
    });

    it('IT-DEMO-BRACKET-DATA-01: exposes only eligible Demo teams and reads a namespaced Demo bracket', async () => {
      const demoTeamA = { id: 'FTM-TEST-BRACKET-A', teamName: 'ทีม Demo bracket A', status: 'APPROVED', province: 'จังหวัด Demo bracket', district: 'อำเภอ Demo bracket', categories: 'U14', createdAt: '2026-10-01T00:00:00.000Z', isTest: true };
      const demoTeamB = { id: 'FTM-TEST-BRACKET-B', teamName: 'ทีม Demo bracket B', status: 'APPROVED', province: 'จังหวัด Demo bracket', district: 'อำเภอ Demo bracket', categories: 'U14', createdAt: '2026-10-02T00:00:00.000Z', isTest: true };
      const realTeam = { id: 'FTM-REAL-BRACKET-A', teamName: 'ทีมจริง bracket ที่ห้ามแสดง', status: 'APPROVED', province: 'จังหวัด Demo bracket', district: 'อำเภอ Demo bracket', categories: 'U14', createdAt: '2026-10-03T00:00:00.000Z', isTest: false };
      const realOnlyTeam = { id: 'FTM-REAL-BRACKET-ONLY', teamName: 'ทีมจริงอีกจังหวัด', status: 'APPROVED', province: 'จังหวัดจริงที่ไม่มี Demo', district: 'อำเภอจริง', categories: 'U14', createdAt: '2026-10-04T00:00:00.000Z', isTest: false };
      const fixtures = [demoTeamA, demoTeamB, realTeam, realOnlyTeam];
      const playerFixtures = fixtures.map((team, index) => ({ id: `PLY-${team.id}`, teamId: team.id, name: `ผู้เล่น ${index}`, category: 'U14', docStatus: 'APPROVED' }));
      teamsDatabase.push(...fixtures);
      playersDatabase.push(...playerFixtures);
      const bracketReads: any[][] = [];
      let storedBracketRows: any[] = [];
      const querySpy = jest.spyOn(pool, 'query').mockImplementation(async (sql: string, values: any[] = []) => {
        if (sql.includes('FROM football_competition_bracket')) {
          bracketReads.push(values);
          return { rows: storedBracketRows, rowCount: storedBracketRows.length } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      });

      try {
        const page = await request(app)
          .get('/admin/bracket-demo-u14.php')
          .set('Cookie', superAdminCookie());
        expect(page.status).toBe(200);
        expect(page.text).toContain('จังหวัด Demo bracket');
        expect(page.text).not.toContain('จังหวัดจริงที่ไม่มี Demo');

        const demoData = await request(app)
          .get('/api/admin/demo-brackets/data?category=U14&province=%E0%B8%88%E0%B8%B1%E0%B8%87%E0%B8%AB%E0%B8%A7%E0%B8%B1%E0%B8%94%20Demo%20bracket&district=%E0%B8%AD%E0%B8%B3%E0%B9%80%E0%B8%A0%E0%B8%AD%20Demo%20bracket')
          .set('Cookie', superAdminCookie());
        expect(demoData.status).toBe(200);
        expect(demoData.body.teams.map((team: any) => team.id).sort()).toEqual([demoTeamA.id, demoTeamB.id].sort());
        expect(JSON.stringify(demoData.body)).not.toContain(realTeam.id);
        expect(bracketReads[bracketReads.length - 1]).toEqual(['U14', 'DEMO:จังหวัด Demo bracket', 'อำเภอ Demo bracket']);

        const realData = await request(app)
          .get('/api/admin/brackets/data?category=U14&province=%E0%B8%88%E0%B8%B1%E0%B8%87%E0%B8%AB%E0%B8%A7%E0%B8%B1%E0%B8%94%20Demo%20bracket&district=%E0%B8%AD%E0%B8%B3%E0%B9%80%E0%B8%A0%E0%B8%AD%20Demo%20bracket')
          .set('Cookie', superAdminCookie());
        expect(realData.status).toBe(200);
        expect(realData.body.teams.map((team: any) => team.id)).toEqual([realTeam.id]);
        expect(bracketReads[bracketReads.length - 1]).toEqual(['U14', 'จังหวัด Demo bracket', 'อำเภอ Demo bracket']);

        storedBracketRows = [{ bracket: { byeTeamId: realTeam.id, rounds: [] } }];
        const invalidDemoBracket = await request(app)
          .get('/api/admin/demo-brackets/data?category=U14&province=%E0%B8%88%E0%B8%B1%E0%B8%87%E0%B8%AB%E0%B8%A7%E0%B8%B1%E0%B8%94%20Demo%20bracket&district=%E0%B8%AD%E0%B8%B3%E0%B9%80%E0%B8%A0%E0%B8%AD%20Demo%20bracket')
          .set('Cookie', superAdminCookie());
        expect(invalidDemoBracket.status).toBe(409);
        expect(JSON.stringify(invalidDemoBracket.body)).not.toContain(realTeam.id);
      } finally {
        querySpy.mockRestore();
        for (const fixture of fixtures) {
          const index = teamsDatabase.indexOf(fixture);
          if (index >= 0) teamsDatabase.splice(index, 1);
        }
        for (const fixture of playerFixtures) {
          const index = playersDatabase.indexOf(fixture);
          if (index >= 0) playersDatabase.splice(index, 1);
        }
      }
    });

    it('IT-DEMO-BRACKET-WRITES-01: separates Demo draw, move, and clear from the real bracket key', async () => {
      const province = 'จังหวัด Demo bracket write';
      const district = 'อำเภอ Demo bracket write';
      const demoTeamA = { id: 'FTM-TEST-BRACKET-WRITE-A', teamName: 'ทีม Demo write A', status: 'APPROVED', province, district, categories: 'U14', createdAt: '2026-10-01T00:00:00.000Z', isTest: true };
      const demoTeamB = { id: 'FTM-TEST-BRACKET-WRITE-B', teamName: 'ทีม Demo write B', status: 'APPROVED', province, district, categories: 'U14', createdAt: '2026-10-02T00:00:00.000Z', isTest: true };
      const realTeamA = { id: 'FTM-REAL-BRACKET-WRITE-A', teamName: 'ทีมจริง write A', status: 'APPROVED', province, district, categories: 'U14', createdAt: '2026-10-03T00:00:00.000Z', isTest: false };
      const realTeamB = { id: 'FTM-REAL-BRACKET-WRITE-B', teamName: 'ทีมจริง write B', status: 'APPROVED', province, district, categories: 'U14', createdAt: '2026-10-04T00:00:00.000Z', isTest: false };
      const fixtures = [demoTeamA, demoTeamB, realTeamA, realTeamB];
      const playerFixtures = fixtures.map((team, index) => ({ id: `PLY-${team.id}`, teamId: team.id, name: `ผู้เล่นเขียน ${index}`, category: 'U14', docStatus: 'APPROVED' }));
      teamsDatabase.push(...fixtures);
      playersDatabase.push(...playerFixtures);
      const inserts: any[][] = [];
      const deletes: any[][] = [];
      const updates: any[][] = [];
      const storedDemoBracket = { byeTeamId: null, rounds: [[{ id: 'r1-m1', round: 1, slot: 0, teamIds: [demoTeamA.id, demoTeamB.id] }]] };
      const querySpy = jest.spyOn(pool, 'query').mockImplementation(async () => ({ rows: [], rowCount: 0 } as any));
      const connectSpy = jest.spyOn(pool, 'connect').mockImplementation(async () => ({
        query: async (sql: string, values: any[] = []) => {
          if (sql.includes('INSERT INTO football_competition_bracket')) {
            inserts.push(values);
            return { rows: [{ bracket: JSON.parse(values[3]) }], rowCount: 1 };
          }
          if (sql.includes('DELETE FROM football_competition_bracket')) {
            deletes.push(values);
            return { rows: [{ category: values[0] }], rowCount: 1 };
          }
          if (sql.includes('SELECT bracket FROM football_competition_bracket') && sql.includes('FOR UPDATE')) {
            return { rows: [{ bracket: storedDemoBracket }], rowCount: 1 };
          }
          if (sql.includes('UPDATE football_competition_bracket')) {
            updates.push(values);
            return { rows: [{ bracket: JSON.parse(values[0]) }], rowCount: 1 };
          }
          return { rows: [], rowCount: 1 };
        },
        release: () => undefined
      } as any));

      try {
        const demoDraw = await request(app)
          .post('/api/admin/demo-brackets/draw')
          .set('Cookie', superAdminCookie())
          .send({ category: 'U14', province, district });
        expect(demoDraw.status).toBe(200);

        const realDraw = await request(app)
          .post('/api/admin/brackets/draw')
          .set('Cookie', superAdminCookie())
          .send({ category: 'U14', province, district });
        expect(realDraw.status).toBe(200);
        expect(inserts.map(values => values.slice(0, 3))).toEqual([
          ['U14', `DEMO:${province}`, district],
          ['U14', province, district]
        ]);

        const demoMove = await request(app)
          .post('/api/admin/demo-brackets/move')
          .set('Cookie', superAdminCookie())
          .send({ category: 'U14', province, district, sourceTeamId: demoTeamA.id, targetMatchIndex: 0, targetSide: 1 });
        expect(demoMove.status).toBe(200);
        expect(updates[0].slice(2)).toEqual(['U14', `DEMO:${province}`, district]);

        const demoClear = await request(app)
          .post('/api/admin/demo-brackets/clear')
          .set('Cookie', superAdminCookie())
          .send({ category: 'U14', province, district });
        expect(demoClear.status).toBe(200);
        expect(deletes[0]).toEqual(['U14', `DEMO:${province}`, district]);
      } finally {
        connectSpy.mockRestore();
        querySpy.mockRestore();
        for (const fixture of fixtures) {
          const index = teamsDatabase.indexOf(fixture);
          if (index >= 0) teamsDatabase.splice(index, 1);
        }
        for (const fixture of playerFixtures) {
          const index = playersDatabase.indexOf(fixture);
          if (index >= 0) playersDatabase.splice(index, 1);
        }
      }
    });

    it('IT-BRACKET-API-01: rejects invalid categories before reading bracket state', async () => {
      const res = await request(app)
        .get('/api/admin/brackets/data?category=U20')
        .set('Cookie', ['admin_session=true', 'admin_user=admin'])
        .set('Accept', 'application/json');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('รุ่นแข่งขันไม่ถูกต้อง');
    });


    it('IT-ROLE-03: POST /api/admin/users/save with DOCUMENT_VERIFIER role should return 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/admin/users/save')
        .set('Cookie', verifierCookie())
        .send({
          requesterRoleCode: 'DOCUMENT_VERIFIER',
          username: 'newverifier',
          password: 'password123',
          fullname: 'ทดสอบ ผู้ตรวจ',
          roleCode: 'DOCUMENT_VERIFIER'
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('IT-ROLE-04: POST /api/admin/users/save with SUPER_ADMIN role should create new admin user', async () => {
      const res = await request(app)
        .post('/api/admin/users/save')
        .set('Cookie', superAdminCookie())
        .send({
          requesterRoleCode: 'SUPER_ADMIN',
          username: 'newverifier2',
          password: 'password123',
          fullname: 'นายตรวจ คนที่สอง',
          roleCode: 'DOCUMENT_VERIFIER'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user.username).toBe('newverifier2');
      expect(res.body.user.roleCode).toBe('DOCUMENT_VERIFIER');
    });

    it('IT-ROLE-05: GET /admin/dashboard.php with verifier01 credentials should display DOCUMENT_VERIFIER badge', async () => {
      const res = await request(app)
        .get('/admin/dashboard.php')
        .set('Cookie', ['admin_session=true', 'admin_user=verifier01']);

      expect(res.status).toBe(200);
      expect(res.text).toContain('เจ้าหน้าที่ตรวจเอกสาร');
      expect(res.text).not.toContain('/admin/audit-log.php');
    });

    it('IT-AUDIT-LOG-ACCESS-01: Audit Log menu and page are restricted to SUPER_ADMIN', async () => {
      const adminDashboard = await request(app)
        .get('/admin/dashboard.php')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);
      expect(adminDashboard.status).toBe(200);
      expect(adminDashboard.text).toContain('/admin/audit-log.php');
      expect(adminDashboard.text.indexOf('/admin/permissions.php')).toBeLessThan(adminDashboard.text.indexOf('/admin/audit-log.php'));

      const verifierDashboard = await request(app)
        .get('/admin/dashboard.php')
        .set('Cookie', ['admin_session=true', 'admin_user=verifier01']);
      expect(verifierDashboard.status).toBe(200);
      expect(verifierDashboard.text).not.toContain('/admin/audit-log.php');

      const verifierDirectAccess = await request(app)
        .get('/admin/audit-log.php')
        .set('Cookie', ['admin_session=true', 'admin_user=verifier01', 'admin_role=SUPER_ADMIN']);
      expect(verifierDirectAccess.status).toBe(403);
    });

    it('IT-AUDIT-LOG-FILTER-01: renders audit rows and applies date, time, user, and request-id filters with bound SQL parameters', async () => {
      const requestId = 'e74c26ca-8963-4afe-b57b-f4bbaf8b5975';
      const querySpy = jest.spyOn(pool, 'query').mockImplementation(async (sql: string, values: any[] = []) => {
        if (sql.includes('FROM football_audit_log') && sql.includes('GROUP BY actor_id')) {
          return { rows: [{ actor_id: 'ADM-001', actor_name: '<Admin>', actor_role: 'SUPER_ADMIN' }], rowCount: 1 } as any;
        }
        if (sql.includes('COUNT(*)::int AS total')) {
          return { rows: [{ total: 1 }], rowCount: 1 } as any;
        }
        if (sql.includes('SELECT id, event_type, actor_id')) {
          return {
            rows: [{
              id: 7,
              event_type: 'TEAM_STATUS_CHANGED',
              actor_id: 'ADM-001',
              actor_name: '<Admin>',
              actor_role: 'SUPER_ADMIN',
              request_id: requestId,
              team_id: 'FTM-TEST-01',
              entity_type: 'TEAM',
              entity_id: '<TEAM-1>',
              old_state: { status: 'PENDING' },
              new_state: { status: 'APPROVED' },
              created_at: new Date('2026-10-10T01:00:00+07:00')
            }],
            rowCount: 1
          } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      });

      try {
        const res = await request(app)
          .get('/admin/audit-log.php')
          .query({ fromDate: '2026-10-01', toDate: '2026-10-12', fromTime: '08:30', toTime: '16:45', actorId: 'ADM-001', requestId })
          .set('Cookie', ['admin_session=true', 'admin_user=admin']);

        expect(res.status).toBe(200);
        expect(res.text).toContain('id="auditTimeFilters" class="col-12 row g-3 m-0 p-0" style="display:flex"');
        expect(res.text).toContain('name="actorId"');
        expect(res.text).toContain('name="requestId"');
        expect(res.text).toContain(`Request ID: ${requestId}`);
        expect(res.text).toContain('เปลี่ยนสถานะทีม');
        expect(res.text).toContain('สถานะทีม: PENDING');
        expect(res.text).toContain('สถานะทีม: APPROVED');
        expect(res.text).toContain('&lt;Admin&gt;');
        expect(res.text).toContain('&lt;TEAM-1&gt;');
        expect(res.text).not.toContain('<TEAM-1>');

        const countCall = querySpy.mock.calls.find(([sql]) => String(sql).includes('COUNT(*)::int AS total'));
        expect(countCall?.[0]).toContain("AT TIME ZONE 'Asia/Bangkok'");
        expect(countCall?.[0]).toContain('actor_id = $5');
        expect(countCall?.[0]).toContain('request_id = $6');
        expect(countCall?.[1]).toEqual(['2026-10-01', '2026-10-12', '08:30', '16:45', 'ADM-001', requestId]);

        const rowsCall = querySpy.mock.calls.find(([sql]) => String(sql).includes('SELECT id, event_type, actor_id'));
        expect(rowsCall?.[0]).toContain('LIMIT $7 OFFSET $8');
        expect(rowsCall?.[1]).toEqual(['2026-10-01', '2026-10-12', '08:30', '16:45', 'ADM-001', requestId, 50, 0]);
      } finally {
        querySpy.mockRestore();
      }
    });

    it('IT-AUDIT-LOG-VALIDATION-01: rejects incomplete date/time ranges before querying audit rows', async () => {
      const querySpy = jest.spyOn(pool, 'query');
      try {
        const res = await request(app)
          .get('/admin/audit-log.php')
          .query({ fromDate: '2026-10-01', fromTime: '08:30' })
          .set('Cookie', ['admin_session=true', 'admin_user=admin']);

        expect(res.status).toBe(400);
        expect(res.text).toContain('ระบุช่วงวันที่ให้ถูกต้อง');
        expect(querySpy.mock.calls.some(([sql]) => String(sql).includes('FROM football_audit_log'))).toBe(false);
      } finally {
        querySpy.mockRestore();
      }
    });

    it('IT-TEAM-01: POST /api/admin/teams/update should update team data in admin dashboard', async () => {
      const res = await request(app)
        .post('/api/admin/teams/update')
        .set('Cookie', superAdminCookie())
        .set('Accept', 'application/json')
        .send({
          id: 'FTM-TEST-001',
          teamName: 'กรุงเทพคริสเตียนวิทยาลัย (ปรับปรุง)',
          province: 'กรุงเทพมหานคร',
          managerName: 'โค้ชสมชาย เข็มกลัด',
          phone: '0812345678',
          status: 'APPROVED'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('IT-PAGE-01: GET /admin/teams.php should render full teams page with table and filters', async () => {
      const res = await request(app)
        .get('/admin/teams.php')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);

      expect(res.status).toBe(200);
      expect(res.text).toContain('รายการทีมลงทะเบียน (Registered Teams)');
      expect(res.text).toContain('สถานะทีม');
      expect(res.text).toContain('วัน-เวลา สมัคร');
      expect(res.text).toContain('filterTeamStartDate');
      expect(res.text).toContain('filterTeamEndDate');
      expect(res.text).toContain('filterTeamProvince');
      expect(res.text).toContain('teamsDataTable');
      expect(res.text).toContain('sortTeamsTable(8)">ผู้ประสานงาน');
      expect(res.text).toContain('teamsPaginationContainer');
      expect(res.text).toContain('<div class="col-md-7 d-flex justify-content-end align-items-center">\n          <span class="fs-5 fw-semibold text-dark">ข้อมูลจากการกรอง จำนวน <span id="filteredTeamsRowCount" class="text-danger">');
      expect(res.text).toMatch(/id="filteredTeamsRowCount" class="text-danger">[\d,]+<\/span> แถว/);
      expect(res.text).toContain("filteredCountEl.textContent = totalItems.toLocaleString('en-US');");
      expect(res.text.indexOf('id="filterTeamStatus"')).toBeLessThan(res.text.indexOf('id="filteredTeamsRowCount"'));
      expect(res.text.indexOf('id="filteredTeamsRowCount"')).toBeLessThan(res.text.indexOf('id="teamsDataTable"'));
      expect(res.text.indexOf("filteredCountEl.textContent = totalItems.toLocaleString('en-US');")).toBeLessThan(res.text.indexOf('if (totalItems === 0)'));
    });

    it('IT-TEAM-DEMO-ACCESS-01: scopes interactive Demo pages by role and SAT province', async () => {
      const superAdminPage = await request(app)
        .get('/admin/teams.php')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);
      expect(superAdminPage.status).toBe(200);
      expect(superAdminPage.text).toContain('Demo ระบบ');
      expect(superAdminPage.text).toContain('รายชื่อทีม');
      expect(superAdminPage.text).toContain('การจัดการแข่งขัน');
      expect(superAdminPage.text).toContain('href="/phase2demo/workspace/dashboard" target="_blank"');
      expect(superAdminPage.text).not.toContain('ตั้งค่าการจับสลาก');
      expect(superAdminPage.text).not.toContain('ผลการจับฉลาก');
      expect(superAdminPage.text).not.toContain('ตารางการแข่งขัน');
      expect(superAdminPage.text).not.toContain('href="/admin/district-draw-setup.php"');
      expect(superAdminPage.text).not.toContain('href="/admin/district-draw-result.php"');
      expect(superAdminPage.text).not.toContain('href="/admin/district-match-schedule.php"');
      expect(superAdminPage.text).not.toMatch(/href="\/admin\/district-(?:draw-setup|draw-result|match-schedule)\.php"[^>]*target=/);
      expect(superAdminPage.text).not.toContain('จัดการตารางแข่งขัน</span>');
      expect(superAdminPage.text).not.toContain('href="/admin/teams-demo-results.php"');
      expect(superAdminPage.text).not.toContain('ผลการจับคู่');
      expect(superAdminPage.text).not.toContain('ตารางแข่ง Demo');
      for (const category of ['u14', 'u16', 'u18']) {
        expect(superAdminPage.text).not.toContain(`href="/admin/bracket-demo-${category}.php"`);
      }
      expect(superAdminPage.text).toContain('href="/admin/teams-demo.php"');

      const districtPages = [
        { url: '/admin/district-draw-setup.php', title: 'ตั้งค่าการจับสลาก', nav: 'district-draw-setup' },
        { url: '/admin/district-draw-result.php', title: 'ผลการจับฉลาก', nav: 'district-draw-result' },
        { url: '/admin/district-match-schedule.php', title: 'ตารางการแข่งขัน', nav: 'district-match-schedule' }
      ];
      for (const page of districtPages) {
        const response = await request(app).get(page.url).set('Cookie', ['admin_session=true', 'admin_user=admin']);
        expect(response.status).toBe(200);
        expect(response.text).toContain(page.title);
        expect(response.text).toContain('href="/phase2demo/workspace/dashboard"');
        expect(response.text).not.toContain('id="adminDistrictCompetitionMenu"');
        if (page.nav === 'district-draw-setup') {
          expect(response.text).toContain('id="districtDrawSetupLayout"');
          expect(response.text).toContain('/api/admin/district-draw-setup/teams');
        } else {
          expect(response.text).toContain('โครงหน้าพร้อมสำหรับเชื่อมต่อข้อมูลการแข่งขัน');
        }
      }
      const protectedDistrictPage = await request(app).get('/admin/district-draw-setup.php');
      expect(protectedDistrictPage.status).toBe(302);

      const demoChonburiId = 'FTM-TEST-DEMO-CHONBURI-ACCESS';
      const demoChiangMaiId = 'FTM-TEST-DEMO-CHIANG-MAI-ACCESS';
      const realTeamId = 'FTM-REAL-TEAM-DEMO-ACCESS';
      const demoChonburiFixture = { id: demoChonburiId, teamName: 'ทีม Demo ชลบุรี', managerName: 'ผู้จัดการ Demo ชลบุรี', phone: '0800000014', province: 'ชลบุรี', district: 'เมืองชลบุรี', gender: 'boy', status: 'PENDING', createdAt: '2026-10-01T09:00:00.000Z', categories: 'U14', isTest: true };
      const demoChiangMaiFixture = { id: demoChiangMaiId, teamName: 'ทีม Demo เชียงใหม่', managerName: 'ผู้จัดการ Demo เชียงใหม่', phone: '0800000018', province: 'เชียงใหม่', district: 'เมืองเชียงใหม่', gender: 'girl', status: 'APPROVED', createdAt: '2026-10-02T09:00:00.000Z', categories: 'U14,U16,U18', isTest: true };
      const realFixture = { id: realTeamId, teamName: 'ทีมจริงที่ต้องไม่แสดง', province: 'ชลบุรี', district: 'เมืองชลบุรี', categories: 'U14', isTest: false };
      teamsDatabase.push(demoChonburiFixture, demoChiangMaiFixture, realFixture);
      try {
      const demoPage = await request(app)
        .get('/admin/teams-demo.php')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);
      expect(demoPage.status).toBe(200);
      expect(demoPage.text).toContain('รายชื่อทีม Demo');
      expect(demoPage.text).toContain('<span class="badge bg-primary text-warning px-3 py-2 fs-6">ข้อมูล Demo</span>');
      expect(demoPage.text).toContain('id="teamsDataTable"');
      expect(demoPage.text).toContain('window.isDemoMode = true;');
      expect(demoPage.text).toContain('openAdminEditTeamModal');
      expect(demoPage.text).toContain('openChangeTeamStatusModal');
      expect(demoPage.text).toContain("body: JSON.stringify({ id, status: newStatus, isDemo: window.isDemoMode === true })");
      expect(demoPage.text).toContain("body: JSON.stringify({ playerId, docStatus, remarks, isDemo: window.isDemoMode === true })");
      expect(demoPage.text).toContain("(window.isDemoMode === true ? '&demo=true' : '')");
      expect(demoPage.text).toContain('ทีม Demo ชลบุรี');
      expect(demoPage.text).toContain('ทีม Demo เชียงใหม่');
      expect(demoPage.text).toContain('ผู้จัดการ Demo เชียงใหม่ (0800000018)');
      expect(demoPage.text).not.toContain('ทีมจริงที่ต้องไม่แสดง');
      expect(demoPage.text).toContain('id="adminDemoMenu"');
      expect(demoPage.text).toContain('aria-expanded="true" aria-controls="adminDemoMenu"');

      const verifierDashboard = await request(app)
        .get('/admin/dashboard.php')
        .set('Cookie', ['admin_session=true', 'admin_user=verifier01']);
      expect(verifierDashboard.status).toBe(200);
      expect(verifierDashboard.text).not.toContain('Demo ระบบ');
      expect(verifierDashboard.text).not.toContain('id="adminDemoMenu"');
      expect(verifierDashboard.text).not.toContain('/admin/teams-demo.php');
      expect(verifierDashboard.text).not.toContain('/admin/competition-demo/index.html');
      expect(verifierDashboard.text).not.toContain('/admin/teams-demo-results.php');
      expect(verifierDashboard.text).not.toContain('/team/register-demo.php');

      const verifierDemoPage = await request(app)
        .get('/admin/teams-demo.php')
        .set('Cookie', ['admin_session=true', 'admin_user=verifier01']);
      expect(verifierDemoPage.status).toBe(200);
      expect(verifierDemoPage.text).toContain('ทีม Demo ชลบุรี');
      expect(verifierDemoPage.text).toContain('ทีม Demo เชียงใหม่');
      expect(verifierDemoPage.text).not.toContain('ทีมจริงที่ต้องไม่แสดง');
      expect(verifierDemoPage.text).toContain('ดูข้อมูล Demo');
      expect(verifierDemoPage.text).not.toContain('title="ดูรายชื่อนักกีฬา รุ่น U14');

      const satAgent = request.agent(app);
      const satLogin = await satAgent
        .post('/admin/dashboard.php')
        .type('form')
        .send({ username: 'somsak.sat@sports.go.th', password: '123456', login_type: 'sat_officer' });
      expect(satLogin.status).toBe(302);
      expect(satLogin.headers.location).toBe('/sat-admin/dashboard.php');
      const satDashboard = await satAgent.get('/sat-admin/dashboard.php');
      expect(satDashboard.status).toBe(200);
      expect(satDashboard.text).not.toContain('Demo ระบบ');
      expect(satDashboard.text).not.toContain('id="adminDemoMenu"');
      expect(satDashboard.text).not.toContain('/sat-admin/teams-demo.php');
      expect(satDashboard.text).not.toContain('/sat-admin/competition-demo/index.html');
      expect(satDashboard.text).not.toContain('/sat-admin/teams-demo-results.php');
      expect(satDashboard.text).not.toContain('/team/register-demo.php');

      const satDemoPage = await satAgent.get('/sat-admin/teams-demo.php?province=%E0%B9%80%E0%B8%8A%E0%B8%B5%E0%B8%A2%E0%B8%87%E0%B9%83%E0%B8%AB%E0%B8%A1%E0%B9%88');
      expect(satDemoPage.status).toBe(200);
      expect(satDemoPage.text).toContain('ทีม Demo ชลบุรี');
      expect(satDemoPage.text).not.toContain('ทีม Demo เชียงใหม่');
      expect(satDemoPage.text).not.toContain(demoChiangMaiId);
      expect(satDemoPage.text).not.toContain('ทีมจริงที่ต้องไม่แสดง');
      expect(satDemoPage.text).toContain('<select id="filterTeamProvince" class="form-select form-select-sm rounded-3" disabled>');

      const drawPage = await request(app)
        .get('/admin/teams-demo-draw.php?category=U14')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);
      expect(drawPage.status).toBe(200);
      expect(drawPage.text).toContain('จัดการตารางแข่งขัน Demo');
      expect(drawPage.text).toContain('ทีม Demo ชลบุรี');
      expect(drawPage.text).toContain('ทีม Demo เชียงใหม่');
      expect(drawPage.text).not.toContain('ทีมจริงที่ต้องไม่แสดง');
      expect(drawPage.text).toContain('ข้อมูลทีมจริงพร้อมแสดงแล้ว');
      expect(drawPage.text).not.toContain('admin_user=');
      expect(drawPage.text).not.toContain('admin_session=');

      const resultsPage = await request(app)
        .get('/admin/teams-demo-results.php')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);
      expect(resultsPage.status).toBe(200);
      expect(resultsPage.text).toContain('ส่วนนี้ยังอยู่ระหว่างเตรียมข้อมูล Demo');

      const mockupIndex = await request(app)
        .get('/admin/competition-demo/index.html')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);
      expect(mockupIndex.status).toBe(200);
      expect(mockupIndex.text).toContain('<title>แผนผังหน้าจอระบบ · PMYC</title>');
      expect(mockupIndex.text).toContain('href="01-dashboard.html"');
      expect(mockupIndex.text).toContain('href="38-permissions.html"');
      expect(mockupIndex.text).toContain('<span class="demo-label">ข้อมูล Demo</span>');
      expect(mockupIndex.text.indexOf('<div class="userbox">')).toBeLessThan(
        mockupIndex.text.indexOf('<span class="demo-label">')
      );
      expect(mockupIndex.text).not.toContain('admin_user=');
      expect(mockupIndex.text).not.toContain('admin_session=');

      const mockupScreen = await request(app)
        .get('/admin/competition-demo/04-draw-setup.html')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);
      expect(mockupScreen.status).toBe(200);
      expect(mockupScreen.text).toContain('<html lang="th">');

      const protectedMockup = await request(app).get('/admin/competition-demo/index.html');
      expect(protectedMockup.status).toBe(302);
      expect(protectedMockup.headers.location).toContain('error=unauthorized');
      } finally {
        for (const id of [demoChonburiId, demoChiangMaiId, realTeamId]) {
          const index = teamsDatabase.findIndex((team: any) => team.id === id);
          if (index !== -1) teamsDatabase.splice(index, 1);
        }
      }
    });

    it('IT-PAGE-02: GET /admin/players.php should render full players page with category tabs, count badges, and pagination container', async () => {
      const res = await request(app)
        .get('/admin/players.php?category=U14')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);

      expect(res.status).toBe(200);
      expect(res.text).toContain('รายการนักกีฬา (Athletes Roster)');
      expect(res.text).toContain('รุ่น U14 (');
      expect(res.text).toContain('playersDataTable');
      expect(res.text).toContain('playersPaginationContainer');
      expect(res.text).toContain('getPlayerSubmissionState');
      expect(res.text).toContain('ยังไม่ส่งรายชื่อ');
      expect(res.text).toContain('canEdit: submission.submitted');
      expect(res.text).toContain("document.getElementById('modalPlayerName').textContent = p.name || '-';");
      expect(res.text).toContain("document.getElementById('modalPlayerIdCard').textContent = p.idCard ? ('เลขบัตร: ' + p.idCard) : '-';");
      expect(res.text).toContain("document.getElementById('modalPlayerPos').textContent = p.position || '-';");
      expect(res.text).toContain('window.initializePlayerVerification(p, {');
    });

    it('IT-PAGE-03: GET /admin/teams.php renders team document review section with read-only buttons', async () => {
      const res = await request(app)
        .get('/admin/teams.php')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);

      expect(res.status).toBe(200);
      expect(res.text).toContain('เอกสารยื่นประกอบการลงทะเบียนทีม');
      expect(res.text).toContain('editDocTeamCertBtn');
      expect(res.text).toContain('editDocRosterBtn');
      expect(res.text).toContain('อ่าน/รีวิวได้อย่างเดียว (แก้ไขไม่ได้)');
    });

    it('IT-PAGE-04: GET /admin/teams.php renders approve/reject team actions and keeps the quick status selector scoped', async () => {
      const res = await request(app)
        .get('/admin/teams.php')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);

      expect(res.status).toBe(200);
      expect(res.text).toContain('id="btnAdminApproveTeam"');
      expect(res.text).toContain('adminApproveCurrentTeam()');
      expect(res.text).toContain('id="btnAdminShowRejectTeamForm"');
      expect(res.text).toContain('adminRejectCurrentTeam()');
      expect(res.text).toContain('id="adminRejectTeamReason"');
      expect(res.text).toContain('กรอกเหตุผลในการไม่อนุมัติทีม');
      expect(res.text).toContain('ยืนยันไม่อนุมัติทีม?');
      expect(res.text).toContain('id="btnAdminRestoreCategoryRegistration"');
      expect(res.text).toContain('เปลี่ยนสถานะกลับเป็นสมัครปกติ');
      expect(res.text).toContain('adminRestoreCategoryRegistration()');
      expect(res.text).toContain('/api/admin/teams/restore-category-registration');
      const inlineScripts = res.text.match(/<script>([\s\S]*?)<\/script>/g) || [];
      const teamsPageScript = inlineScripts.find(script => script.includes('openAdminEditTeamModal = async function')) || '';
      expect(teamsPageScript).not.toBe('');
      expect(() => new Function(teamsPageScript.replace(/^<script>|<\/script>$/g, ''))).not.toThrow();
      expect(res.text).toContain('รอตรวจสอบทีม');
      expect(res.text).toContain('อนุมัติทีม');
      const statusSelect = res.text.match(/<select id="changeTeamStatusSelect"[\s\S]*?<\/select>/)?.[0] || '';
      expect(statusSelect).toContain('value="PENDING"');
      expect(statusSelect).toContain('value="APPROVED"');
      expect(statusSelect).toContain('value="REJECTED"');
      expect(statusSelect).not.toContain('NOT_SUBMITTED');
    });

    it('IT-PAGE-04-REJECTED: GET /admin/teams.php shows rejected status in the team status column', async () => {
      const fixture = {
        id: 'FTM-TEST-REJECTED-STATUS-01',
        teamName: 'ทีมทดสอบไม่อนุมัติ',
        status: 'REJECTED',
        rejectReason: 'เอกสารไม่ครบ',
        categories: 'U14'
      };
      teamsDatabase.push(fixture);

      try {
        const res = await request(app)
          .get('/admin/teams.php')
          .set('Cookie', ['admin_session=true', 'admin_user=admin']);
        expect(res.status).toBe(200);
        const tableBody = res.text.match(/<tbody id="teamsTableBody">([\s\S]*?)<\/tbody>/)?.[1] || '';
        const teamRow = tableBody.split('<tr').find(row => row.includes(fixture.id)) || '';
        expect(teamRow).toContain('ไม่อนุมัติ');
        expect(teamRow).toContain('btn-danger');
        expect(teamRow).toContain('openChangeTeamStatusModal');
        expect(teamRow).toContain("'REJECTED')");
      } finally {
        const index = teamsDatabase.findIndex((team: any) => team.id === fixture.id);
        if (index !== -1) teamsDatabase.splice(index, 1);
      }
    });

    it('IT-PAGE-07: DOCUMENT_VERIFIER can inspect a team and approve it', async () => {
      const teamId = 'FTM-TEST-VERIFIER-STATUS-01';
      const fixture = {
        id: teamId,
        teamName: 'ทีมทดสอบ verifier อ่านอย่างเดียว',
        status: 'PENDING',
        categories: 'U14'
      };
      teamsDatabase.push(fixture);

      try {
        const res = await request(app)
          .get('/admin/teams.php')
          .set('Cookie', ['admin_session=true', 'admin_user=verifier01']);

        expect(res.status).toBe(200);
        expect(res.text).toContain('ทีมทดสอบ verifier อ่านอย่างเดียว');
        expect(res.text).toContain('id="adminPlayerInspectionModal"');
        expect(res.text).toContain('id="btnAdminApproveTeam"');
        expect(res.text).toContain('adminApproveCurrentTeam()');
        expect(res.text).toContain('id="btnAdminShowRejectTeamForm"');
        expect(res.text).toContain('adminRejectCurrentTeam()');
        expect(res.text).toContain('if (!res.ok || !data.success)');
        expect(res.text).toContain('if (!updated) return;');
        expect(res.text).toContain('Error approving team status:');

        const tableBody = res.text.match(/<tbody id="teamsTableBody">([\s\S]*?)<\/tbody>/)?.[1] || '';
        const teamRow = tableBody.split('<tr').find(row => row.includes(teamId)) || '';
        expect(teamRow).toContain('รอตรวจสอบทีม');
        expect(teamRow).not.toContain('openChangeTeamStatusModal');
        expect(res.text).toContain('window.canChangeTeamStatus = true;');
        expect(res.text).toContain('window.canClickTeamStatusColumn = false;');
        expect(res.text).toContain('if (isDeleted || window.canClickTeamStatusColumn !== true)');
        const statusSelect = res.text.match(/<select id="changeTeamStatusSelect"[\s\S]*?<\/select>/)?.[0] || '';
        expect(statusSelect).toContain('value="PENDING" disabled');
        expect(statusSelect).toContain('value="APPROVED"');
        expect(statusSelect).toContain('value="REJECTED"');
      } finally {
        const index = teamsDatabase.findIndex((team: any) => team.id === teamId);
        if (index !== -1) teamsDatabase.splice(index, 1);
      }
    });

    it('IT-PAGE-05: GET /admin/teams.php renders adminPlayerInspectionModal for athlete document inspection & remarking', async () => {
      const res = await request(app)
        .get('/admin/teams.php')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);

      expect(res.status).toBe(200);
      expect(res.text).toContain('id="adminPlayerInspectionModal"');
      expect(res.text).toContain('id="inspectionDocStatusSelect"');
      expect(res.text).toContain('id="inspectionPlayerRemarks"');
      expect(res.text).toContain('saveAdminPlayerInspectionRemark()');
      expect(res.text).toContain('<option value="CORRECTED">📝 แก้ไขข้อมูลเรียบร้อย</option>');
      const detailFunction = res.text.match(/window\.showAdminPlayerDetail = function\(playerId\) \{[\s\S]*?\n    \};/)?.[0] || '';
      expect(detailFunction).toContain("const needsCorrection = docStatus === 'REJECTED' || (docStatus !== 'CORRECTED' && docStatus !== 'PENDING' && docStatus !== 'APPROVED' && Boolean(p.remarks));");
      expect(detailFunction).toContain("statusSelect.value = needsCorrection ? 'ACTION_REQUIRED' : docStatus;");
      expect(res.text).toContain("const playerNeedsCorrection = p.docStatus !== 'CORRECTED' && p.docStatus !== 'PENDING' && p.docStatus !== 'APPROVED' && (p.docStatus === 'REJECTED' || p.docStatus === 'ACTION_REQUIRED' || Boolean(p.remarks));");
      expect(res.text).toContain('แก้ไขข้อมูลเรียบร้อย');
      expect(res.text).toContain("playerNeedsCorrection ? '<span class=\"badge bg-danger\">");
      expect(res.text).toContain("const itemNeedsCorrection = item.docStatus !== 'CORRECTED' && item.docStatus !== 'PENDING' && item.docStatus !== 'APPROVED' && (item.docStatus === 'REJECTED' || item.docStatus === 'ACTION_REQUIRED' || Boolean(item.remarks));");
      expect(res.text).toContain("itemNeedsCorrection ? '<span class=\"badge bg-danger\">");
    });

    it('IT-PAGE-06: category status controls open a category-scoped roster and reuse player inspection', async () => {
      const res = await request(app)
        .get('/admin/teams.php')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);

      expect(res.status).toBe(200);
      expect(res.text).toContain("ดูรายชื่อนักกีฬา รุ่น ' + catCode");
      expect(res.text).toContain('openAdminEditTeamModal = async function(teamId, categoryCode, mainTabId)');
      expect(res.text).toContain("const allCategories = Array.from(new Set(['ALL', ...registeredCategories]));");
      expect(res.text).toContain("const initialCategory = categoryCode && registeredCategories.includes(categoryCode) ? categoryCode : 'ALL';");
      expect(res.text).toContain("let categoryTabsHtml = '';");
      expect(res.text).toContain("const pCatList = cat === 'ALL' ? playerCategories : playerCategories.filter(playerCategory => playerCategory === cat);");
      const teamModalFunction = res.text.match(/window\.openAdminEditTeamModal = async function\(teamId, categoryCode, mainTabId\) \{[\s\S]*?window\.openTeamPlayerVerification = function/)?.[0] || '';
      expect(teamModalFunction).toContain('const allPlayerCategoriesSubmitted = playerCategories.length > 0 && playerCategories.every(category => submittedCats.includes(category));');
      expect(teamModalFunction).toContain("const isCurrentCatSubmitted = allPlayerCategoriesSubmitted && (cat === 'ALL' || submittedCats.includes(cat));");
      expect(teamModalFunction).toContain("ตรวจรายละเอียด</button>");
      expect(teamModalFunction).toContain('ยังมีรุ่นที่ไม่ส่งรายชื่อ');
      expect(teamModalFunction).toContain('openTeamPlayerVerification');
      const playerModalFunction = res.text.match(/window\.openTeamPlayerVerification = function[\s\S]*?(?=window\.showAdminPlayerDetail = function)/)?.[0] || '';
      const fixtureWindow: any = {
        adminLoadedPlayers: [{ id: 'fixture', name: 'นักกีฬาสังเคราะห์', id_card: 'synthetic-id', position: 'ผู้รักษาประตู' }],
        initializePlayerVerification: jest.fn()
      };
      new Function('window', 'base', 'document', 'bootstrap', playerModalFunction)(
        fixtureWindow, '/football', { getElementById: () => ({}) },
        { Modal: { getOrCreateInstance: () => ({ show: jest.fn() }) } }
      );
      for (const [stored, expected] of [
        ['https://example.test/player.jpg', 'https://example.test/player.jpg'],
        ['//example.test/player.jpg', '//example.test/player.jpg'],
        ['/football/uploads/player.jpg', '/football/uploads/player.jpg'],
        ['./uploads/player.jpg', '/football/uploads/player.jpg'],
        ['', '']
      ]) {
        fixtureWindow.adminLoadedPlayers[0].photo_url = stored;
        fixtureWindow.openTeamPlayerVerification('fixture');
        expect(fixtureWindow.initializePlayerVerification).toHaveBeenLastCalledWith(
          expect.objectContaining({ photoUrl: expected, photo_url: expected }), expect.any(Object)
        );
        expect(fixtureWindow.initializePlayerVerification).toHaveBeenLastCalledWith(
          expect.objectContaining({ name: 'นักกีฬาสังเคราะห์', idCard: 'synthetic-id', position: 'ผู้รักษาประตู' }), expect.any(Object)
        );
      }
      expect(teamModalFunction).not.toContain("(!isCurrentCatSubmitted ? 'disabled opacity-50' : '')");
      expect(teamModalFunction).not.toContain("(!isCurrentCatSubmitted ? 'disabled' : '')");
      expect(res.text).toContain('id="adminOfficialCatTabs"');
      expect(res.text).toContain("const categoryOfficials = cat === 'ALL' ? officials : officials.filter(o => String(o.categories || o.category || 'U14').toUpperCase().split(',').map(c => c.trim()).includes(cat));");
      expect(res.text).toContain('ทั้งหมด (\' + categoryOfficials.length + \' คน)');
      expect(res.text).toContain('รุ่น \' + cat + \' (\' + categoryOfficials.length + \' คน)');
      expect(res.text).toContain('admin-official-cat-\' + cat + \'-pane');
      expect(res.text).toContain("mainTabs.classList.toggle('d-none', Boolean(categoryCode))");
      expect(res.text).toContain("statusActions.classList.toggle('d-none', Boolean(categoryCode) || window.canChangeTeamStatus !== true)");
      expect(res.text).toContain("mainTabs.classList.remove('d-none')");
      expect(res.text).toContain("statusActions.classList.toggle('d-none', window.canChangeTeamStatus !== true)");
      expect(res.text).toContain('id="adminTeamStatusActions"');
      expect(res.text).toContain("hidden.bs.modal");
      expect(res.text).toContain('approvedCount');
      expect(res.text).toContain('needsFixCount');
      expect(res.text).toContain('playerCount');
      expect(res.text).toContain('นักกีฬา ');
      expect(res.text).toContain('อนุมัติแล้ว ');
      expect(res.text).toContain('ต้องแก้ไข ');
      expect(res.text).toContain('text-primary');
      expect(res.text).toContain('text-success');
      expect(res.text).toContain('text-danger');
      expect(res.text).toContain('ไม่ได้ส่งทีม</span>');
      expect(res.text).toContain("getOrCreateInstance(document.getElementById('team-players-tab')).show()");
      expect(res.text).toContain('id="adminPlayerDetailModal"');
      expect(res.text).toContain('initializePlayerVerification(player, {');
      expect(res.text).toContain('allowDelete: true');
      expect(res.text).toContain('readOnlyMessage');
      expect(res.text).toContain('onSaved: refreshTeamModal');

      const satRes = await request(app)
        .get('/sat-admin/teams.php')
        .set('Cookie', satOfficerCookie());
      expect(satRes.status).toBe(200);
      expect(satRes.text).toContain('window.canChangeTeamStatus = true;');
      expect(satRes.text).toContain('openTeamPlayerVerification');
      expect(satRes.text).toContain('id="adminPlayerDetailModal"');
      expect(satRes.text).toContain("photo.src=p.photoUrl||p.photo_url||defaultPlayerPhoto");
      expect(satRes.text).toContain("this.src=defaultPlayerPhoto");
    });

    it('IT-TEAM-MODAL-REFRESH-01: team modal reuses its Bootstrap instance and waits for roster refresh after deletion', async () => {
      const res = await request(app)
        .get('/admin/teams.php')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);

      expect(res.status).toBe(200);
      expect((res.text.match(/bootstrap\.Modal\.getOrCreateInstance\(modalEl\)\.show\(\);/g) || []).length).toBeGreaterThanOrEqual(1);
      const deletePlayerFunction = res.text.match(/window\.deleteAdminPlayer = async function\(playerId, playerName\) \{[\s\S]*?\n    \};/)?.[0] || '';
      expect(deletePlayerFunction).not.toBe('');
      expect(deletePlayerFunction).toContain("const activeTeamTab = document.querySelector('#adminTeamMainTabs .nav-link.active');");
      expect(deletePlayerFunction).toContain("await openAdminEditTeamModal(teamId, window.adminSelectedCategory || '', activeTeamTab ? activeTeamTab.id : '');");
      expect(res.text).toContain('mainTabId = [\'team-info-tab\', \'team-players-tab\', \'team-officials-tab\'].includes(mainTabId) ? mainTabId : \'\';');
      expect(res.text).toContain('data-bs-dismiss="modal">ปิดหน้าต่าง</button>');
    });

    it('IT-TEAM-MODAL-TAB-PERSIST-01: saving player review keeps the currently selected team tab', async () => {
      for (const path of ['/admin/teams.php', '/admin/teams-u14.php']) {
        const res = await request(app)
          .get(path)
          .set('Cookie', ['admin_session=true', 'admin_user=admin']);

        expect(res.status).toBe(200);
        expect(res.text).toContain("const activeTeamTab = document.querySelector('#adminTeamMainTabs .nav-link.active');");
        expect(res.text).toContain('if (activeTeamTab) bootstrap.Tab.getOrCreateInstance(activeTeamTab).show();');

        if (path === '/admin/teams.php') {
          const saveFunction = res.text.match(/window\.saveAdminPlayerInspectionRemark = async function\(\) \{[\s\S]*?\n    \};/)?.[0] || '';
          expect(saveFunction).toContain("await fetch(base + '/api/admin/teams/players?teamId=' + encodeURIComponent(teamId) + (window.isDemoMode === true ? '&demo=true' : ''))");
          expect(saveFunction).toContain('const itemDisplayName = item.name ||');
          expect(saveFunction).not.toContain('escapeHtml(displayName)');
          expect(saveFunction).toContain("throw new Error('ไม่สามารถโหลดรายชื่อนักกีฬาหลังบันทึกได้')");
        } else {
          const detailFunction = res.text.match(/window\.showAdminPlayerDetail = function\(playerId\) \{[\s\S]*?\n    \};/)?.[0] || '';
          expect(detailFunction).toContain("const needsCorrection = docStatus === 'REJECTED' || (docStatus !== 'CORRECTED' && docStatus !== 'PENDING' && docStatus !== 'APPROVED' && Boolean(p.remarks));");
          expect(detailFunction).toContain("document.getElementById('inspectionDocStatusSelect').value = needsCorrection ? 'ACTION_REQUIRED' : docStatus;");
          const saveFunction = res.text.match(/window\.saveAdminPlayerInspectionRemark = async function\(\) \{[\s\S]*?\n    \};/)?.[0] || '';
          expect(saveFunction).not.toBe('');
          expect(saveFunction).toContain('await openAdminEditTeamModal(teamId, window.adminSelectedCategory || \'\');');
          expect(saveFunction.indexOf('await openAdminEditTeamModal')).toBeLessThan(saveFunction.indexOf('if (activeTeamTab)'));
        }
      }
    });

    it('IT-PLAYER-REMARK-STATUS-01: saves correction and pending statuses and reloads the roster with each status', async () => {
      const player = {
        id: 'PLY-TEST-REMARK-STATUS-01',
        teamId: 'FTM-TEST-REMARK-STATUS-01',
        name: 'นักกีฬา ทดสอบสถานะ',
        category: 'U14',
        docStatus: 'PENDING',
        remarks: ''
      };
      let storedStatus = 'PENDING';
      const team = { id: player.teamId, categories: 'U14', submitted_categories: 'U14', province: 'ชลบุรี', status: 'APPROVED' };
      const querySpy = jest.spyOn(pool, 'query').mockImplementation(async (sql: string, values: any[] = []) => {
        if (sql.includes('SELECT p.id, p.team_id, p.doc_status')) return { rows: [{
          id: player.id, team_id: player.teamId, doc_status: storedStatus, category: 'U14', province: 'ชลบุรี', is_test: false, submitted_categories: 'U14'
        }], rowCount: 1 } as any;
        if (sql.includes('UPDATE football_player p SET doc_status')) {
          storedStatus = values[0];
          return { rows: [], rowCount: 1 } as any;
        }
        if (sql.includes('SELECT * FROM football_player WHERE team_id')) {
          return {
            rows: [{ id: player.id, team_id: player.teamId, name: player.name, category: 'U14', doc_status: storedStatus, remarks: 'กรุณาแก้ไข' }],
            rowCount: 1
          } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      });
      playersDatabase.push(player);
      teamsDatabase.push(team);

      try {
        const unauthenticatedRes = await request(app)
          .post('/api/admin/players/save-remark')
          .set('Accept', 'application/json')
          .send({ playerId: player.id, docStatus: 'APPROVED', remarks: '' });
        expect(unauthenticatedRes.status).toBe(401);

        for (const [requestedStatus, expectedStatus] of [
          ['ACTION_REQUIRED', 'ACTION_REQUIRED'],
          ['PENDING', 'PENDING'],
          ['CORRECTED', 'CORRECTED'],
          ['APPROVED', 'APPROVED']
        ]) {
          const saveRes = await request(app)
            .post('/api/admin/players/save-remark')
            .set('Cookie', superAdminCookie())
            .send({ playerId: player.id, docStatus: requestedStatus, remarks: 'กรุณาแก้ไข' });

          expect(saveRes.status).toBe(200);
          expect(saveRes.body.success).toBe(true);
          expect(storedStatus).toBe(expectedStatus);
          const updateCall = querySpy.mock.calls.filter(([sql]) => String(sql).includes('UPDATE football_player p SET doc_status')).at(-1);
          expect(updateCall?.[0]).toContain('NOT EXISTS');
          expect(updateCall?.[1]).toEqual([expectedStatus, 'กรุณาแก้ไข', player.id, null]);
          const playerAuditCall = querySpy.mock.calls.find(([sql, values]: any[]) =>
            String(sql).includes('INSERT INTO football_audit_log') && values?.[0] === 'PLAYER_DOCUMENT_STATUS_CHANGED' && values?.[8] === player.id && JSON.parse(String(values?.[10] || '{}')).docStatus === expectedStatus
          );
          expect(playerAuditCall).toBeDefined();
          expect(playerAuditCall?.[1]?.[4]).toBe('SUPER_ADMIN');
          expect(JSON.parse(String(playerAuditCall?.[1]?.[10]))).toEqual({ docStatus: expectedStatus });

          const rosterRes = await request(app).get('/api/admin/teams/players').set('Cookie', superAdminCookie()).query({ teamId: player.teamId });
          expect(rosterRes.status).toBe(200);
          expect(rosterRes.body.players.find((item: any) => item.id === player.id).docStatus).toBe(expectedStatus);
        }
      } finally {
        querySpy.mockRestore();
        const playerIndex = playersDatabase.indexOf(player);
        if (playerIndex !== -1) playersDatabase.splice(playerIndex, 1);
        const teamIndex = teamsDatabase.indexOf(team);
        if (teamIndex !== -1) teamsDatabase.splice(teamIndex, 1);
      }
    });

    it('IT-PLAYER-REMARK-ERROR-01: reports database write failures instead of returning success', async () => {
      const player = { id: 'PLY-TEST-REMARK-DB-ERROR', teamId: 'FTM-TEST-REMARK-DB-ERROR', category: 'U14' };
      playersDatabase.push(player);
      const querySpy = jest.spyOn(pool, 'query').mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT p.id, p.team_id, p.doc_status')) return { rows: [{ id: player.id, team_id: player.teamId, category: 'U14', province: 'ชลบุรี', is_test: false, submitted_categories: 'U14' }], rowCount: 1 } as any;
        if (sql.includes('UPDATE football_player p SET doc_status')) throw new Error('database write failed');
        return { rows: [], rowCount: 0 } as any;
      });

      try {
        const res = await request(app)
          .post('/api/admin/players/save-remark')
          .set('Cookie', ['admin_session=true', 'admin_user=admin'])
          .send({ playerId: 'PLY-TEST-REMARK-DB-ERROR', docStatus: 'PENDING', remarks: '' });

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
      } finally {
        querySpy.mockRestore();
        const index = playersDatabase.indexOf(player);
        if (index !== -1) playersDatabase.splice(index, 1);
      }
    });

    it('IT-PLAYER-REMARK-SUBMISSION-01: staff cannot change player review until registered categories are submitted', async () => {
      const playerId = 'PLY-TEST-SAT-SUBMISSION-01';
      let submittedCategories = '';
      const queryMock = jest.spyOn(pool, 'query').mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT p.id, p.team_id, p.doc_status')) return { rows: [{
          id: playerId, team_id: 'FTM-TEST-SAT-SUBMISSION-01', doc_status: 'PENDING', category: 'U14,U16',
          province: 'ชลบุรี', is_test: false, submitted_categories: submittedCategories
        }], rowCount: 1 } as any;
        if (sql.includes('UPDATE football_player p SET doc_status')) return { rows: [], rowCount: 1 } as any;
        return { rows: [], rowCount: 1 } as any;
      });

      try {
        const centralBlocked = await request(app).post('/api/admin/players/save-remark').set('Cookie', superAdminCookie())
          .send({ playerId, docStatus: 'APPROVED', remarks: '' });
        expect(centralBlocked.status).toBe(409);
        expect(centralBlocked.body.message).toContain('U14, U16');

        const blocked = await request(app).post('/sat-admin/api/admin/players/save-remark').set('Cookie', satOfficerCookie())
          .send({ playerId, docStatus: 'APPROVED', remarks: '' });
        expect(blocked.status).toBe(409);
        expect(blocked.body.message).toContain('U14, U16');
        expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('UPDATE football_player p SET doc_status'))).toBe(false);

        submittedCategories = 'U14,U16';
        const saved = await request(app).post('/sat-admin/api/admin/players/save-remark').set('Cookie', satOfficerCookie())
          .send({ playerId, docStatus: 'APPROVED', remarks: '' });
        expect(saved.status).toBe(200);
        expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('NOT EXISTS'))).toBe(true);
      } finally {
        queryMock.mockRestore();
      }
    });

    it('IT-NAV-01: GET /rules.php navbar should render renamed and added admin menu items', async () => {
      const res = await request(app).get('/rules.php');
      expect(res.status).toBe(200);
      expect(res.text).toContain('จัดการข้อมูลทีม');
      expect(res.text).toContain('กกท. จังหวัด');
      expect(res.text).toContain('/admin/sat-login.php');
      expect(res.text).toContain('กกท. กลาง');
      expect(res.text).toContain('/admin/index.php');
    });

    it('IT-LOGIN-SCOPING-01: SAT officer login via /admin/index.php should redirect back with error', async () => {
      const res = await request(app)
        .post('/admin/dashboard.php')
        .send({
          login_type: 'central',
          username: 'somsak.sat@sports.go.th',
          password: '123456'
        });

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('/admin/index.php?error=sat_role_required');
    });

    it('IT-LOGIN-SCOPING-02: Central admin login via /admin/sat-login.php should redirect back with error', async () => {
      const res = await request(app)
        .post('/admin/dashboard.php')
        .send({
          login_type: 'sat_officer',
          username: 'admin',
          password: '12348765'
        });

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('/sat-admin/login.php?error=central_role_required');
    });

    it('IT-SESS-06: GET /team/player-edit.php?id=PLY-001 with team session should retain team_id cookie and render team profile in header', async () => {
      const res = await request(app)
        .get('/team/player-edit.php?id=PLY-001')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001', 'team_user=test_user']);

      expect(res.status).toBe(200);
      expect(res.text).toContain('แก้ไขข้อมูลนักกีฬา');
      expect(res.text).toContain('ผู้จัดการทีม:');
      const cookiesHeader = res.header['set-cookie'];
      const setCookie = Array.isArray(cookiesHeader) ? cookiesHeader.join(';') : String(cookiesHeader || '');
      expect(setCookie).toContain('team_id=FTM-001');
      expect(setCookie).not.toContain('team_id=PLY-001');
    });

    it('IT-SOFT-DEL-01: POST /api/admin/teams/delete soft deletes a test team fixture', async () => {
      const { teamsDatabase } = require('../src/app');
      const teamId = 'FTM-TEST-SOFT-DELETE-01';
      const fixture = { id: teamId, teamName: 'ทีมทดสอบลบและกู้คืน', status: 'PENDING', is_deleted: false };
      teamsDatabase.push(fixture);
      const originalQuery = pool.query;
      const queryMock = jest.fn(async (sql: string, _params?: any[]) => {
        if (sql.includes('UPDATE football_registered_team SET is_deleted = TRUE')) return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      });
      pool.query = queryMock as any;

      try {
        const deleteRes = await request(app)
          .post('/api/admin/teams/delete')
          .set('Cookie', ['admin_session=true', 'admin_user=admin'])
          .send({ id: teamId });
        expect(deleteRes.status).toBe(200);
        expect(deleteRes.body.success).toBe(true);
        expect(fixture.is_deleted).toBe(true);
        const auditInsert = queryMock.mock.calls.find(([sql]) => sql.includes('INSERT INTO football_audit_log'));
        expect(auditInsert?.[1]).toEqual(expect.arrayContaining(['TEAM_DELETED', 'ADMIN', 'ADM-001', 'ผู้ดูแลระบบสูงสุด (Super Admin)', 'SUPER_ADMIN']));
      } finally {
        pool.query = originalQuery;
        const index = teamsDatabase.findIndex((team: any) => team.id === teamId);
        if (index !== -1) teamsDatabase.splice(index, 1);
      }
    });

    it('IT-SOFT-DEL-AUTH-01: delete and restore reject unauthenticated requests before changing teams', async () => {
      const { teamsDatabase } = require('../src/app');
      const teamId = 'FTM-TEST-SOFT-DELETE-UNAUTH';
      const fixture = { id: teamId, teamName: 'ทีมทดสอบต้องไม่เปลี่ยน', status: 'PENDING', is_deleted: false };
      teamsDatabase.push(fixture);
      try {
        const deleteRes = await request(app).post('/api/admin/teams/delete').set('Accept', 'application/json').send({ id: teamId });
        expect(deleteRes.status).toBe(401);
        expect(fixture.is_deleted).toBe(false);

        fixture.is_deleted = true;
        const restoreRes = await request(app).post('/api/admin/teams/restore').set('Accept', 'application/json').send({ id: teamId });
        expect(restoreRes.status).toBe(401);
        expect(fixture.is_deleted).toBe(true);
      } finally {
        const index = teamsDatabase.findIndex((team: any) => team.id === teamId);
        if (index !== -1) teamsDatabase.splice(index, 1);
      }
    });

    it('IT-SOFT-DEL-02: POST /api/admin/teams/restore restores a soft-deleted test team fixture', async () => {
      const { teamsDatabase } = require('../src/app');
      const teamId = 'FTM-TEST-SOFT-RESTORE-01';
      const fixture = { id: teamId, teamName: 'ทีมทดสอบกู้คืน', status: 'PENDING', is_deleted: true };
      teamsDatabase.push(fixture);

      try {
        const restoreRes = await request(app)
          .post('/api/admin/teams/restore')
          .set('Cookie', ['admin_session=true', 'admin_user=admin'])
          .send({ id: teamId });
        expect(restoreRes.status).toBe(200);
        expect(restoreRes.body.success).toBe(true);
        expect(fixture.is_deleted).toBe(false);
      } finally {
        const index = teamsDatabase.findIndex((team: any) => team.id === teamId);
        if (index !== -1) teamsDatabase.splice(index, 1);
      }
    });

    it('IT-DASHBOARD-DEL-01: GET /admin/dashboard.php should exclude soft-deleted teams from total metric counts and render deleted teams card', async () => {
      const { teamsDatabase } = require('../src/app');
      const teamId = 'FTM-TEST-DASHBOARD-DELETE-01';
      const fixture = { id: teamId, teamName: 'ทีมทดสอบตัวเลขถังขยะ', status: 'PENDING', is_deleted: false };
      teamsDatabase.push(fixture);
      try {
      // 1. Get initial total teams count on dashboard
      const dashBefore = await request(app)
        .get('/admin/dashboard.php')
        .set('Cookie', ['admin_session=true', 'admin_user=admin', 'admin_role=SUPER_ADMIN']);
      expect(dashBefore.status).toBe(200);
      expect(dashBefore.text).toContain('ถังขยะ / ข้อมูลทีมที่ถูกลบ');
      const matchBefore = dashBefore.text.match(/id="metric_total_teams"[^>]*>(\d+)<\/div>/);
      const countBefore = matchBefore ? parseInt(matchBefore[1], 10) : 0;

      // 2. Soft delete only the in-memory fixture
      await request(app)
        .post('/api/admin/teams/delete')
        .set('Cookie', ['admin_session=true', 'admin_user=admin', 'admin_role=SUPER_ADMIN'])
        .send({ id: teamId });

      // 3. Get updated total teams count on dashboard
      const dashAfter = await request(app)
        .get('/admin/dashboard.php')
        .set('Cookie', ['admin_session=true', 'admin_user=admin', 'admin_role=SUPER_ADMIN']);
      expect(dashAfter.status).toBe(200);
      const matchAfter = dashAfter.text.match(/id="metric_total_teams"[^>]*>(\d+)<\/div>/);
      const countAfter = matchAfter ? parseInt(matchAfter[1], 10) : 0;

      expect(countAfter).toBe(countBefore - 1);

      // 4. Restore team FTM-001 to clean up test state
      await request(app)
        .post('/api/admin/teams/restore')
        .set('Cookie', ['admin_session=true', 'admin_user=admin', 'admin_role=SUPER_ADMIN'])
        .send({ id: teamId });
      } finally {
        const index = teamsDatabase.findIndex((team: any) => team.id === teamId);
        if (index !== -1) teamsDatabase.splice(index, 1);
      }
    });

    it('IT-DEL-PLAYER-01: POST /api/admin/players/delete should delete player by admin', async () => {
      // Create temporary test player
      playersDatabase.push({
        id: 'PLY-TEST-DEL-001',
        teamId: 'FTM-001',
        name: 'นักเรียน ทดสอบลบ',
        category: 'U14'
      });

      const res = await request(app)
        .post('/api/admin/players/delete')
        .set('Cookie', superAdminCookie())
        .send({ playerId: 'PLY-TEST-DEL-001' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('ลบข้อมูลนักกีฬาเรียบร้อยแล้ว');
    });

    it('IT-DEL-OFFICIAL-01: POST /api/admin/officials/delete should delete official by admin', async () => {
      // Create temporary test official
      const { officialsDatabase } = require('../src/app');
      officialsDatabase.push({
        id: 'OFF-TEST-DEL-001',
        teamId: 'FTM-001',
        name: 'เจ้าหน้าที่ ทดสอบลบ',
        position: 'ผู้ช่วยผู้จัดการ'
      });

      const res = await request(app)
        .post('/api/admin/officials/delete')
        .set('Cookie', superAdminCookie())
        .send({ officialId: 'OFF-TEST-DEL-001' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('ลบข้อมูลเจ้าหน้าที่เรียบร้อยแล้ว');
    });

    it('IT-RESET-CAT-01: POST /api/admin/teams/reset-category-submission should reset submitted status for a specific category', async () => {
      const { teamsDatabase } = require('../src/app');
      const teamId = 'FTM-TEST-RESET-CATEGORY-01';
      const testTeam = { id: teamId, submitted_categories: 'U14,U16', submittedCategories: 'U14,U16', status: 'APPROVED' };
      teamsDatabase.push(testTeam);

      try {
        const res = await request(app)
          .post('/api/admin/teams/reset-category-submission')
          .set('Cookie', ['admin_session=true', 'admin_user=admin'])
          .send({ teamId, category: 'U14' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.submittedCategories).toBe('U16');
        expect(testTeam.status).toBe('APPROVED');
      } finally {
        const index = teamsDatabase.findIndex((team: any) => team.id === teamId);
        if (index !== -1) teamsDatabase.splice(index, 1);
      }
    });

    it('IT-RESTORE-CAT-01: POST /api/admin/teams/restore-category-registration restores only the selected cancelled category', async () => {
      const { teamsDatabase } = require('../src/app');
      const teamId = 'FTM-TEST-RESTORE-CATEGORY-01';
      const testTeam = {
        id: teamId,
        categories: 'U14,U16,U18',
        cancelled_categories: 'U14,U18',
        cancelledCategories: 'U14,U18',
        submitted_categories: 'U14,U16',
        submittedCategories: 'U14,U16',
        province: 'เชียงใหม่',
        status: 'APPROVED'
      };
      teamsDatabase.push(testTeam);
      const transactionQuery = jest.fn(async (sql: string, _values: any[] = []) => {
        if (sql.includes('FROM football_registered_team WHERE id::text = $1 FOR UPDATE')) return { rows: [{ ...testTeam, is_test: false }], rowCount: 1 };
        if (sql.includes('AS player_count')) return { rows: [{ player_count: 0, official_count: 0 }], rowCount: 1 };
        if (sql.startsWith('UPDATE football_registered_team SET categories')) return { rows: [{ id: teamId }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      });
      const connectSpy = jest.spyOn(pool, 'connect').mockImplementation(async () => ({ query: transactionQuery, release: jest.fn() }) as any);

      try {
        const review = await request(app).get('/api/admin/teams/category-state')
          .query({ teamId, category: 'U14' }).set('Cookie', ['admin_session=true', 'admin_user=admin']);
        expect(review.status).toBe(200);
        expect(review.body.review.action).toBe('restore');
        const res = await request(app)
          .post('/api/admin/teams/restore-category-registration')
          .set('Cookie', ['admin_session=true', 'admin_user=admin'])
          .send({ teamId, category: 'U14', reason: 'คืนการสมัครตามผลตรวจ', reviewToken: review.body.review.reviewToken });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.cancelled_categories).toBe('U18');
        expect(testTeam.cancelled_categories).toBe('U18');
        expect(testTeam.cancelledCategories).toBe('U18');
        expect(testTeam.categories).toBe('U14,U16,U18');
        expect(testTeam.submitted_categories).toBe('U14,U16');
      } finally {
        connectSpy.mockRestore();
        const index = teamsDatabase.findIndex((team: any) => team.id === teamId);
        if (index !== -1) teamsDatabase.splice(index, 1);
      }
    });

    it('IT-PERM-DEL-TEAM-UNAUTH-01: permanent delete requires an authenticated admin session', async () => {
      const connectSpy = jest.spyOn(pool, 'connect');
      try {
        const res = await request(app)
          .post('/api/admin/teams/permanent-delete')
          .set('Accept', 'application/json')
          .send({ id: 'FTM-TEST-PERM-UNAUTH' });

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(connectSpy).not.toHaveBeenCalled();
      } finally {
        connectSpy.mockRestore();
      }
    });

    it('IT-PERM-DEL-TEAM-FORBIDDEN-01: permanent delete is restricted to SUPER_ADMIN', async () => {
      const connectSpy = jest.spyOn(pool, 'connect');
      try {
        const res = await request(app)
          .post('/api/admin/teams/permanent-delete')
          .set('Cookie', ['admin_session=true', 'admin_user=verifier01'])
          .set('Accept', 'application/json')
          .send({ id: 'FTM-TEST-PERM-FORBIDDEN' });

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(connectSpy).not.toHaveBeenCalled();
      } finally {
        connectSpy.mockRestore();
      }
    });

    it('IT-PERM-DEL-TEAM-01: POST /api/admin/teams/permanent-delete transactionally removes only the selected soft-deleted team and members', async () => {
      const { teamsDatabase, playersDatabase, officialsDatabase } = require('../src/app');
      const teamId = 'FTM-TEST-PERM-001';
      const adjacentTeamId = 'FTM-TEST-PERM-002';
      const queries: string[] = [];
      const client = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
          if (sql.includes('SELECT province, doc_team_cert')) return { rows: [{ province: 'เชียงใหม่', doc_team_cert: null, doc_roster: null }], rowCount: 1 };
          if (sql.includes('SELECT photo_url, doc_id_card, doc_school_cert')) return { rows: [], rowCount: 0 };
          if (sql.includes('SELECT photo_url, doc_id_card FROM football_official')) return { rows: [], rowCount: 0 };
          if (sql.includes('DELETE FROM football_registered_team')) return { rows: [{ id: teamId }], rowCount: 1 };
          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn()
      };
      const connectSpy = jest.spyOn(pool, 'connect').mockImplementationOnce(async () => client as any);

      teamsDatabase.push(
        { id: teamId, teamName: 'ทีมทดสอบ ลบถาวร', is_deleted: true },
        { id: adjacentTeamId, teamName: 'ทีมทดสอบ ลบถาวร', is_deleted: true }
      );
      playersDatabase.push(
        { id: 'PLY-TEST-PERM-001', teamId, name: 'นักกีฬา ทดสอบลบถาวร' },
        { id: 'PLY-TEST-PERM-002', teamId: adjacentTeamId, name: 'นักกีฬาอีกทีม' }
      );
      officialsDatabase.push(
        { id: 'OFF-TEST-PERM-001', teamId, name: 'เจ้าหน้าที่ ทดสอบลบถาวร' },
        { id: 'OFF-TEST-PERM-002', teamId: adjacentTeamId, name: 'เจ้าหน้าที่อีกทีม' }
      );

      try {
        const res = await request(app)
          .post('/api/admin/teams/permanent-delete')
          .set('Cookie', ['admin_session=true', 'admin_user=admin'])
          .set('Accept', 'application/json')
          .send({ id: teamId });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('ลบข้อมูลทีม นักกีฬา และเจ้าหน้าที่ถาวรเรียบร้อยแล้ว');
        expect(queries[0]).toBe('BEGIN');
        expect(queries).toContain('COMMIT');
        expect(queries.indexOf('DELETE FROM football_player WHERE team_id = $1')).toBeLessThan(queries.indexOf('DELETE FROM football_official WHERE team_id = $1'));
        expect(queries.indexOf('DELETE FROM football_official WHERE team_id = $1')).toBeLessThan(queries.findIndex(sql => sql.includes('DELETE FROM football_registered_team')));

        expect(teamsDatabase.some((team: any) => team.id === teamId)).toBe(false);
        expect(playersDatabase.some((player: any) => player.id === 'PLY-TEST-PERM-001')).toBe(false);
        expect(officialsDatabase.some((official: any) => official.id === 'OFF-TEST-PERM-001')).toBe(false);
        expect(teamsDatabase.some((team: any) => team.id === adjacentTeamId)).toBe(true);
        expect(playersDatabase.some((player: any) => player.id === 'PLY-TEST-PERM-002')).toBe(true);
        expect(officialsDatabase.some((official: any) => official.id === 'OFF-TEST-PERM-002')).toBe(true);
        expect(client.release).toHaveBeenCalled();
      } finally {
        connectSpy.mockRestore();
        for (const [items, idKey, id] of [
          [teamsDatabase, 'id', teamId], [teamsDatabase, 'id', adjacentTeamId],
          [playersDatabase, 'id', 'PLY-TEST-PERM-001'], [playersDatabase, 'id', 'PLY-TEST-PERM-002'],
          [officialsDatabase, 'id', 'OFF-TEST-PERM-001'], [officialsDatabase, 'id', 'OFF-TEST-PERM-002']
        ] as any[]) {
          const index = items.findIndex((item: any) => item[idKey] === id);
          if (index >= 0) items.splice(index, 1);
        }
      }
    });

    it('IT-PERM-DEL-TEAM-ROLLBACK-01: database failure rolls back and preserves in-memory team data', async () => {
      const { teamsDatabase, playersDatabase, officialsDatabase } = require('../src/app');
      const teamId = 'FTM-TEST-PERM-ROLLBACK';
      const team = { id: teamId, teamName: 'ทีมทดสอบ rollback', is_deleted: true };
      const player = { id: 'PLY-TEST-PERM-ROLLBACK', teamId, name: 'นักกีฬาทดสอบ rollback' };
      const official = { id: 'OFF-TEST-PERM-ROLLBACK', teamId, name: 'เจ้าหน้าที่ทดสอบ rollback' };
      const queries: string[] = [];
      const client = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
          if (sql.includes('SELECT province, doc_team_cert')) return { rows: [{ province: 'เชียงใหม่', doc_team_cert: null, doc_roster: null }], rowCount: 1 };
          if (sql.includes('SELECT photo_url, doc_id_card, doc_school_cert')) return { rows: [], rowCount: 0 };
          if (sql.includes('SELECT photo_url, doc_id_card FROM football_official')) return { rows: [], rowCount: 0 };
          if (sql.includes('DELETE FROM football_official')) throw new Error('simulated database failure');
          return { rows: [], rowCount: 1 };
        }),
        release: jest.fn()
      };
      const connectSpy = jest.spyOn(pool, 'connect').mockImplementationOnce(async () => client as any);
      teamsDatabase.push(team);
      playersDatabase.push(player);
      officialsDatabase.push(official);

      try {
        const res = await request(app)
          .post('/api/admin/teams/permanent-delete')
          .set('Cookie', ['admin_session=true', 'admin_user=admin'])
          .set('Accept', 'application/json')
          .send({ id: teamId });

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(queries).toContain('ROLLBACK');
        expect(teamsDatabase).toContain(team);
        expect(playersDatabase).toContain(player);
        expect(officialsDatabase).toContain(official);
      } finally {
        connectSpy.mockRestore();
        for (const [items, id] of [[teamsDatabase, teamId], [playersDatabase, player.id], [officialsDatabase, official.id]] as any[]) {
          const index = items.findIndex((item: any) => item.id === id);
          if (index >= 0) items.splice(index, 1);
        }
      }
    });

    it('IT-SOFT-DEL-ID-01: player ID card from soft-deleted team should not block re-registration in new team', async () => {
      const { teamsDatabase, playersDatabase } = require('../src/app');
      const transactionQuery = jest.fn(async (sql: string) => {
        if (String(sql).includes('FROM football_registered_team WHERE id::text = $1 FOR UPDATE')) {
          return { rows: [{ id: 'FTM-TEST-SOFT-NEW-01', categories: 'U14', submitted_categories: '', cancelled_categories: '', is_deleted: false }], rowCount: 1 } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      });
      const connectSpy = jest.spyOn(pool, 'connect').mockImplementation(async () => ({ query: transactionQuery, release: () => undefined } as any));

      // 1. Create a soft-deleted team and a player belonging to it
      teamsDatabase.push({
        id: 'FTM-TEST-SOFT-DEL-01',
        teamName: 'ทีมทดสอบ ถูกซอฟต์เดลีต',
        is_deleted: true,
        isDeleted: true
      });
      playersDatabase.push({
        id: 'PLY-TEST-SOFT-001',
        teamId: 'FTM-TEST-SOFT-DEL-01',
        name: 'ด.ช. บัตรซ้ำ ทีมเก่าถูกลบ',
        idCard: '9-9999-88888-77-6',
        category: 'U14'
      });

      // Active new team
      teamsDatabase.push({
        id: 'FTM-TEST-SOFT-NEW-01',
        teamName: 'ทีมทดสอบ รับบัตรประชาชนเดิม',
        status: 'PENDING',
        categories: 'U14'
      });

      // 2. Attempt to register new player with same ID card (9-9999-88888-77-6) under active team FTM-TEST-SOFT-NEW-01
      const res = await request(app)
        .post('/api/team/players/save')
        .set('Accept', 'application/json')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST-SOFT-NEW-01'])
        .attach('doc_id_card', Buffer.from('mock pdf content'), 'idcard.pdf')
        .attach('photo', Buffer.from('mock photo content'), 'photo.jpg')
        .field('name', 'ด.ช. บัตรเดียวกัน ลงทีมใหม่')
        .field('prefix', 'ด.ช.')
        .field('first_name', 'บัตรเดียวกัน')
        .field('last_name', 'ลงทีมใหม่')
        .field('id_card', '9-9999-88888-77-6')
        .field('jersey_no', '10')
        .field('birth_date', '2013-08-20')
        .field('position', 'กองหน้า (FW)')
        .field('category', 'U14');

      // Should succeed and NOT return duplicate ID card error
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Clean up test player and teams from memory
      for (let i = teamsDatabase.length - 1; i >= 0; i--) {
        if (teamsDatabase[i].id === 'FTM-TEST-SOFT-DEL-01' || teamsDatabase[i].id === 'FTM-TEST-SOFT-NEW-01') {
          teamsDatabase.splice(i, 1);
        }
      }
      for (let i = playersDatabase.length - 1; i >= 0; i--) {
        if (playersDatabase[i].idCard === '9-9999-88888-77-6' || playersDatabase[i].teamId === 'FTM-TEST-SOFT-NEW-01') {
          playersDatabase.splice(i, 1);
        }
      }
      connectSpy.mockRestore();
    });

    it('IT-PLAYER-DEMO-STATUS-ISOLATION-01: Demo player review updates only accept and change players on Demo teams', async () => {
      const demoPlayerId = 'PLY-TEST-DEMO-REVIEW-ISOLATION';
      const realPlayerId = 'PLY-TEST-REAL-REVIEW-ISOLATION';
      const demoTeamId = 'FTM-TEST-DEMO-REVIEW-ISOLATION';
      const realTeamId = 'FTM-TEST-REAL-REVIEW-ISOLATION';
      const demoPlayer = { id: demoPlayerId, teamId: demoTeamId, category: 'U16', docStatus: 'PENDING', remarks: '' };
      const realPlayer = { id: realPlayerId, teamId: realTeamId, category: 'U16', docStatus: 'PENDING', remarks: '' };
      playersDatabase.push(demoPlayer, realPlayer);
      const originalQuery = pool.query;
      const queryMock = jest.fn(async (sql: string, params?: any[]) => {
        if (sql.includes('SELECT p.id, p.team_id, p.doc_status')) {
          const isDemoPlayer = params?.[0] === demoPlayerId;
          return {
            rows: params?.[0] === demoPlayerId || params?.[0] === realPlayerId
              ? [{ id: params[0], team_id: isDemoPlayer ? demoTeamId : realTeamId, doc_status: 'PENDING', category: 'U16', province: 'ชลบุรี', is_test: isDemoPlayer }]
              : [],
            rowCount: 1
          };
        }
        if (sql.includes('UPDATE football_player SET doc_status')) {
          return { rows: [], rowCount: params?.[2] === demoPlayerId ? 1 : 0 };
        }
        return { rows: [], rowCount: 1 };
      });
      pool.query = queryMock as any;

      try {
        const demoRes = await request(app)
          .post('/api/admin/players/save-remark')
          .set('Cookie', superAdminCookie())
          .send({ playerId: demoPlayerId, docStatus: 'APPROVED', remarks: '', isDemo: true });
        expect(demoRes.status).toBe(200);
        const demoUpdate = queryMock.mock.calls.find(([sql]) => sql.includes('UPDATE football_player SET doc_status'));
        expect(demoUpdate?.[0]).toContain('COALESCE(is_test, FALSE) = TRUE');
        expect(demoUpdate?.[1]).toEqual(['APPROVED', '', demoPlayerId]);

        const updateCountBeforeRealAttempt = queryMock.mock.calls.filter(([sql]) => sql.includes('UPDATE football_player SET doc_status')).length;
        const realRes = await request(app)
          .post('/api/admin/players/save-remark')
          .set('Cookie', superAdminCookie())
          .send({ playerId: realPlayerId, docStatus: 'APPROVED', remarks: '', isDemo: true });
        expect(realRes.status).toBe(404);
        expect(realPlayer.docStatus).toBe('PENDING');
        expect(queryMock.mock.calls.filter(([sql]) => sql.includes('UPDATE football_player SET doc_status'))).toHaveLength(updateCountBeforeRealAttempt);
      } finally {
        pool.query = originalQuery;
        for (const id of [demoPlayerId, realPlayerId]) {
          const index = playersDatabase.findIndex((player: any) => player.id === id);
          if (index !== -1) playersDatabase.splice(index, 1);
        }
      }
    });

    it('IT-TEAM-DEMO-STATUS-ISOLATION-01: Demo status updates only accept and update rows flagged is_test', async () => {
      const { teamsDatabase } = require('../src/app');
      const demoId = 'FTM-TEST-DEMO-STATUS-01';
      const realId = 'FTM-TEST-REAL-STATUS-01';
      const demoFixture = { id: demoId, teamName: 'ทีม Demo สำหรับเปลี่ยนสถานะ', status: 'PENDING', isTest: true };
      const realFixture = { id: realId, teamName: 'ทีมจริงต้องไม่เปลี่ยน', status: 'PENDING', isTest: false };
      teamsDatabase.push(demoFixture, realFixture);
      const originalQuery = pool.query;
      const queryMock = jest.fn(async (sql: string, params?: any[]) => {
        if (sql.includes('SELECT status, province, is_test')) {
          return params?.[0] === demoId ? { rows: [{ status: 'PENDING', province: '', is_test: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
        }
        if (sql.includes('UPDATE football_registered_team SET status')) {
          return { rows: [], rowCount: params?.[2] === demoId ? 1 : 0 };
        }
        return { rows: [], rowCount: 1 };
      });
      pool.query = queryMock as any;

      try {
        const demoRes = await request(app)
          .post('/api/admin/teams/update-status')
          .set('Cookie', ['admin_session=true', 'admin_user=admin'])
          .send({ id: demoId, status: 'APPROVED', isDemo: true });
        expect(demoRes.status).toBe(200);
        expect(demoFixture.status).toBe('APPROVED');
        const updateCall = queryMock.mock.calls.find(([sql]) => sql.includes('UPDATE football_registered_team SET status'));
        expect(updateCall?.[0]).toContain('COALESCE(is_test, FALSE) = TRUE');

        const updateCountBeforeRealAttempt = queryMock.mock.calls.filter(([sql]) => sql.includes('UPDATE football_registered_team SET status')).length;
        const realRes = await request(app)
          .post('/api/admin/teams/update-status')
          .set('Cookie', ['admin_session=true', 'admin_user=admin'])
          .send({ id: realId, status: 'APPROVED', isDemo: true });
        expect(realRes.status).toBe(404);
        expect(realFixture.status).toBe('PENDING');
        expect(queryMock.mock.calls.filter(([sql]) => sql.includes('UPDATE football_registered_team SET status'))).toHaveLength(updateCountBeforeRealAttempt);
      } finally {
        pool.query = originalQuery;
        for (const id of [demoId, realId]) {
          const index = teamsDatabase.findIndex((team: any) => team.id === id);
          if (index !== -1) teamsDatabase.splice(index, 1);
        }
      }
    });

    it('IT-TEAM-DEMO-SOFT-DELETE-ISOLATION-01: Demo delete is a scoped soft delete and never runs SQL DELETE', async () => {
      const { teamsDatabase } = require('../src/app');
      const demoId = 'FTM-TEST-DEMO-SOFT-DELETE-01';
      const realId = 'FTM-TEST-REAL-SOFT-DELETE-01';
      const demoFixture = { id: demoId, teamName: 'ทีม Demo สำหรับซ่อน', status: 'PENDING', isTest: true, is_deleted: false };
      const realFixture = { id: realId, teamName: 'ทีมจริงต้องไม่เปลี่ยน', status: 'PENDING', isTest: false, is_deleted: false };
      teamsDatabase.push(demoFixture, realFixture);
      const originalQuery = pool.query;
      const queryMock = jest.fn(async (sql: string, params?: any[]) => {
        if (sql.includes('SELECT id FROM football_registered_team')) {
          return params?.[0] === demoId ? { rows: [{ id: demoId }], rowCount: 1 } : { rows: [], rowCount: 0 };
        }
        if (sql.includes('UPDATE football_registered_team SET is_deleted = TRUE')) return { rows: [], rowCount: params?.[0] === demoId ? 1 : 0 };
        return { rows: [], rowCount: 1 };
      });
      pool.query = queryMock as any;

      try {
        const demoRes = await request(app)
          .post('/api/admin/teams/delete')
          .set('Cookie', ['admin_session=true', 'admin_user=admin'])
          .send({ id: demoId, isDemo: true });
        expect(demoRes.status).toBe(200);
        expect(demoFixture.is_deleted).toBe(true);
        const updateCall = queryMock.mock.calls.find(([sql]) => sql.includes('UPDATE football_registered_team SET is_deleted = TRUE'));
        expect(updateCall?.[0]).toContain('COALESCE(is_test, FALSE) = TRUE');
        expect(queryMock.mock.calls.some(([sql]) => /\bDELETE\b/i.test(sql))).toBe(false);

        const updateCountBeforeRealAttempt = queryMock.mock.calls.filter(([sql]) => sql.includes('UPDATE football_registered_team SET is_deleted = TRUE')).length;
        const realRes = await request(app)
          .post('/api/admin/teams/delete')
          .set('Cookie', ['admin_session=true', 'admin_user=admin'])
          .send({ id: realId, isDemo: true });
        expect(realRes.status).toBe(404);
        expect(realFixture.is_deleted).toBe(false);
        expect(queryMock.mock.calls.filter(([sql]) => sql.includes('UPDATE football_registered_team SET is_deleted = TRUE'))).toHaveLength(updateCountBeforeRealAttempt);
      } finally {
        pool.query = originalQuery;
        for (const id of [demoId, realId]) {
          const index = teamsDatabase.findIndex((team: any) => team.id === id);
          if (index !== -1) teamsDatabase.splice(index, 1);
        }
      }
    });

    it('IT-TEAM-STATUS-DROPDOWN-01: verifier can approve but cannot revert team status to PENDING', async () => {
      const { teamsDatabase } = require('../src/app');
      const fixture = {
        id: 'FTM-TEST-STATUS-CHANGE-01',
        teamName: 'ทีมทดสอบเปลี่ยนสถานะ',
        status: 'PENDING',
        categories: 'U14,U18',
        submitted_categories: 'U14',
        rejectReason: '',
        reject_reason: ''
      };
      teamsDatabase.push(fixture);

      try {
        const noSessionRes = await request(app)
          .post('/api/admin/teams/update-status')
          .set('Accept', 'application/json')
          .send({ id: fixture.id, status: 'APPROVED' });
        expect(noSessionRes.status).toBe(401);

        const teamAuditSpy = jest.spyOn(pool, 'query');
        const verifierApproveRes = await request(app)
          .post('/api/admin/teams/update-status')
          .set('Accept', 'application/json')
          .set('Cookie', ['admin_session=true', 'admin_user=verifier01'])
          .send({ id: fixture.id, status: 'APPROVED' });
        expect(verifierApproveRes.status).toBe(200);
        expect(fixture.status).toBe('APPROVED');
        expect(fixture.submitted_categories).toBe('U14');
        const teamAuditCall = teamAuditSpy.mock.calls.find(([sql, values]: any[]) =>
          String(sql).includes('INSERT INTO football_audit_log') && values?.[0] === 'TEAM_STATUS_CHANGED' && values?.[8] === fixture.id
        );
        expect(teamAuditCall).toBeDefined();
        expect(teamAuditCall?.[1]?.[4]).toBe('DOCUMENT_VERIFIER');
        expect(JSON.parse(String(teamAuditCall?.[1]?.[9]))).toEqual({ status: 'PENDING' });
        expect(JSON.parse(String(teamAuditCall?.[1]?.[10]))).toEqual({ status: 'APPROVED' });
        teamAuditSpy.mockRestore();

        const statusUpdateQuerySpy = jest.spyOn(pool, 'query');
        const verifierRejectRes = await request(app)
          .post('/api/admin/teams/update-status')
          .set('Cookie', ['admin_session=true', 'admin_user=verifier01'])
          .send({ id: fixture.id, status: 'REJECTED', rejectReason: '  เอกสารทีมไม่ครบ  ' });
        expect(verifierRejectRes.status).toBe(200);
        expect(fixture.status).toBe('REJECTED');
        expect(fixture.rejectReason).toBe('เอกสารทีมไม่ครบ');
        expect(fixture.reject_reason).toBe('เอกสารทีมไม่ครบ');
        expect(statusUpdateQuerySpy).toHaveBeenCalledWith(
          expect.stringContaining('SET status = $1, reject_reason = $2'),
          ['REJECTED', 'เอกสารทีมไม่ครบ', fixture.id]
        );
        statusUpdateQuerySpy.mockRestore();

        const verifierPendingRes = await request(app)
          .post('/api/admin/teams/update-status')
          .set('Accept', 'application/json')
          .set('Cookie', ['admin_session=true', 'admin_user=verifier01'])
          .send({ id: fixture.id, status: 'PENDING' });
        expect(verifierPendingRes.status).toBe(403);
        expect(fixture.status).toBe('REJECTED');
        expect(fixture.submitted_categories).toBe('U14');

        for (const status of ['APPROVED', 'PENDING', 'REJECTED']) {
          const res = await request(app)
            .post('/api/admin/teams/update-status')
            .set('Cookie', ['admin_session=true', 'admin_user=admin'])
            .send({ id: fixture.id, status });

          expect(res.status).toBe(200);
          expect(res.body.success).toBe(true);
          expect(fixture.status).toBe(status);
          expect(fixture.submitted_categories).toBe('U14');
        }

        for (const status of ['NOT_SUBMITTED']) {
          const res = await request(app)
            .post('/api/admin/teams/update-status')
            .set('Cookie', ['admin_session=true', 'admin_user=admin'])
            .send({ id: fixture.id, status });

          expect(res.status).toBe(400);
          expect(fixture.status).toBe('REJECTED');
        }

        const invalidReasonRes = await request(app)
          .post('/api/admin/teams/update-status')
          .set('Cookie', ['admin_session=true', 'admin_user=admin'])
          .send({ id: fixture.id, status: 'REJECTED', rejectReason: { invalid: true } });
        expect(invalidReasonRes.status).toBe(400);
        expect(fixture.status).toBe('REJECTED');
      } finally {
        const idx = teamsDatabase.findIndex((team: any) => team.id === fixture.id);
        if (idx !== -1) teamsDatabase.splice(idx, 1);
      }
    });

    it('IT-TEAM-STATUS-SAT-01: SAT_OFFICER can approve/reject only teams in their province', async () => {
      const { teamsDatabase } = require('../src/app');
      const ownProvinceTeam = {
        id: 'FTM-TEST-SAT-STATUS-CM-01',
        teamName: 'ทีมทดสอบอนุมัติในจังหวัด',
        province: 'ชลบุรี',
        status: 'PENDING',
        categories: 'U14',
        rejectReason: ''
      };
      const otherProvinceTeam = {
        id: 'FTM-TEST-SAT-STATUS-OTHER-01',
        teamName: 'ทีมทดสอบอนุมัติต่างจังหวัด',
        province: 'จังหวัดทดสอบอื่น',
        status: 'PENDING',
        categories: 'U14',
        rejectReason: ''
      };
      const rejectedProvinceTeam = {
        id: 'FTM-TEST-SAT-STATUS-REJECTED-01',
        teamName: 'ทีมทดสอบไม่อนุมัติ SAT',
        province: 'ชลบุรี',
        status: 'REJECTED',
        categories: 'U14',
        rejectReason: ''
      };
      const staleOnlyTeam = {
        id: 'FTM-TEST-SAT-STATUS-MISSING-DB-01',
        teamName: 'ทีมที่มีเฉพาะใน cache',
        province: 'ชลบุรี',
        status: 'PENDING',
        categories: 'U14',
        rejectReason: ''
      };
      const changedDuringUpdateTeam = {
        id: 'FTM-TEST-SAT-STATUS-RACE-01',
        teamName: 'ทีมที่เปลี่ยนจังหวัดระหว่างตรวจสอบ',
        province: 'ชลบุรี',
        status: 'PENDING',
        categories: 'U14',
        rejectReason: ''
      };
      const teamFixtures = [ownProvinceTeam, otherProvinceTeam, rejectedProvinceTeam, staleOnlyTeam, changedDuringUpdateTeam];
      teamsDatabase.push(...teamFixtures);
      const satCookie = satOfficerCookie();
      const databaseTeams = new Map<string, { status: string; province: string; is_test: boolean }>([
        [ownProvinceTeam.id, { status: 'PENDING', province: 'ชลบุรี', is_test: false }],
        [otherProvinceTeam.id, { status: 'PENDING', province: 'จังหวัดทดสอบอื่น', is_test: false }],
        [rejectedProvinceTeam.id, { status: 'REJECTED', province: 'ชลบุรี', is_test: false }],
        [changedDuringUpdateTeam.id, { status: 'PENDING', province: 'ชลบุรี', is_test: false }]
      ]);
      const originalQuery = pool.query;
      const queryMock = jest.fn(async (sql: string, params?: any[]) => {
        if (sql.includes('SELECT status, province, is_test')) {
          const team = databaseTeams.get(String(params?.[0]));
          return { rows: team ? [{ ...team }] : [], rowCount: team ? 1 : 0 };
        }
        if (sql.includes('UPDATE football_registered_team SET status')) {
          const teamId = String(params?.[2]);
          const team = databaseTeams.get(teamId);
          if (!team) return { rows: [], rowCount: 0 };
          if (teamId === changedDuringUpdateTeam.id) {
            team.province = 'จังหวัดที่เปลี่ยนระหว่างคำขอ';
            return { rows: [], rowCount: 0 };
          }
          if (String(sql).includes('LOWER(BTRIM(province))') && String(team.province).toLocaleLowerCase() !== String(params?.[3] || '').trim().toLocaleLowerCase()) {
            return { rows: [], rowCount: 0 };
          }
          team.status = String(params?.[0]);
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO football_audit_log')) return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      });
      pool.query = queryMock as any;

      try {
        const pageRes = await request(app)
          .get('/sat-admin/teams.php')
          .set('Cookie', satCookie);
        expect(pageRes.status).toBe(200);
        expect(pageRes.text).toContain('window.canChangeTeamStatus = true;');
        expect(pageRes.text).toContain('window.canClickTeamStatusColumn = false;');
        expect(pageRes.text).toContain('id="btnAdminShowRejectTeamForm"');
        expect(pageRes.text).toContain('if (window.canChangeTeamStatus !== true || window.canClickTeamStatusColumn !== true) return;');
        const tableBody = pageRes.text.match(/<tbody id="teamsTableBody">([\s\S]*?)<\/tbody>/)?.[1] || '';
        for (const fixture of [ownProvinceTeam, rejectedProvinceTeam]) {
          const teamRow = tableBody.split('<tr').find(row => row.includes(fixture.id)) || '';
          expect(teamRow).toContain(fixture.status === 'REJECTED' ? 'ไม่อนุมัติ' : 'รอตรวจสอบทีม');
          expect(teamRow).not.toContain('openChangeTeamStatusModal');
        }

        // The process-local cache can disagree with persisted province data.
        ownProvinceTeam.province = 'เชียงใหม่';
        otherProvinceTeam.province = 'ชลบุรี';
        rejectedProvinceTeam.province = 'เชียงใหม่';

        const ownProvinceRes = await request(app)
          .post('/sat-admin/api/admin/teams/update-status')
          .set('Cookie', satCookie)
          .send({ id: ownProvinceTeam.id, status: 'APPROVED' });
        expect(ownProvinceRes.status).toBe(200);
        expect(ownProvinceTeam.status).toBe('APPROVED');
        const ownUpdate = queryMock.mock.calls.find(([sql, values]: any[]) => String(sql).includes('UPDATE football_registered_team SET status') && values?.[2] === ownProvinceTeam.id);
        expect(ownUpdate?.[0]).toContain('LOWER(BTRIM(province)) = LOWER(BTRIM($4))');
        expect(ownUpdate?.[1]?.[3]).toBe('ชลบุรี');

        const otherProvinceRes = await request(app)
          .post('/sat-admin/api/admin/teams/update-status')
          .set('Cookie', satCookie)
          .send({ id: otherProvinceTeam.id, status: 'APPROVED' });
        expect(otherProvinceRes.status).toBe(403);
        expect(otherProvinceTeam.status).toBe('PENDING');

        const updateCountBeforeMissingDbAttempt = queryMock.mock.calls.filter(([sql, values]: any[]) => String(sql).includes('UPDATE football_registered_team SET status') && values?.[2] === staleOnlyTeam.id).length;
        const missingDbRes = await request(app)
          .post('/sat-admin/api/admin/teams/update-status')
          .set('Cookie', satCookie)
          .send({ id: staleOnlyTeam.id, status: 'APPROVED' });
        expect(missingDbRes.status).toBe(404);
        expect(staleOnlyTeam.status).toBe('PENDING');
        expect(queryMock.mock.calls.filter(([sql, values]: any[]) => String(sql).includes('UPDATE football_registered_team SET status') && values?.[2] === staleOnlyTeam.id)).toHaveLength(updateCountBeforeMissingDbAttempt);

        const changedDuringUpdateRes = await request(app)
          .post('/sat-admin/api/admin/teams/update-status')
          .set('Cookie', satCookie)
          .send({ id: changedDuringUpdateTeam.id, status: 'APPROVED' });
        expect(changedDuringUpdateRes.status).toBe(409);
        expect(changedDuringUpdateTeam.status).toBe('PENDING');

        const ownProvinceRejectRes = await request(app)
          .post('/sat-admin/api/admin/teams/update-status')
          .set('Cookie', satCookie)
          .send({ id: ownProvinceTeam.id, status: 'REJECTED' });
        expect(ownProvinceRejectRes.status).toBe(200);
        expect(ownProvinceTeam.status).toBe('REJECTED');
        expect(ownProvinceTeam.rejectReason).toBe('');

        const otherProvinceRejectRes = await request(app)
          .post('/sat-admin/api/admin/teams/update-status')
          .set('Cookie', satCookie)
          .send({ id: otherProvinceTeam.id, status: 'REJECTED', rejectReason: 'reason' });
        expect(otherProvinceRejectRes.status).toBe(403);
        expect(otherProvinceTeam.status).toBe('PENDING');

        const revertRes = await request(app)
          .post('/sat-admin/api/admin/teams/update-status')
          .set('Cookie', satCookie)
          .send({ id: ownProvinceTeam.id, status: 'PENDING' });
        expect(revertRes.status).toBe(403);
        expect(ownProvinceTeam.status).toBe('REJECTED');
      } finally {
        pool.query = originalQuery;
        for (const fixture of teamFixtures) {
          const index = teamsDatabase.findIndex((team: any) => team.id === fixture.id);
          if (index !== -1) teamsDatabase.splice(index, 1);
        }
      }
    });

    it('IT-TEAM-STATUS-SAT-DB-FAIL-CLOSED-01: SAT team status update fails closed when province lookup fails', async () => {
      const fixture = {
        id: 'FTM-TEST-SAT-STATUS-DB-FAIL-01',
        teamName: 'ทีมทดสอบฐานข้อมูลไม่พร้อม',
        province: 'ชลบุรี',
        status: 'PENDING',
        categories: 'U14',
        rejectReason: ''
      };
      teamsDatabase.push(fixture);
      const originalQuery = pool.query;
      const queryMock = jest.fn(async (sql: string) => {
        if (sql.includes('SELECT status, province, is_test')) throw new Error('simulated database read failure');
        return { rows: [], rowCount: 1 };
      });
      pool.query = queryMock as any;

      try {
        const response = await request(app)
          .post('/sat-admin/api/admin/teams/update-status')
          .set('Cookie', satOfficerCookie())
          .send({ id: fixture.id, status: 'APPROVED' });

        expect(response.status).toBe(500);
        expect(fixture.status).toBe('PENDING');
        expect(queryMock.mock.calls.some(([sql]: any[]) => String(sql).includes('UPDATE football_registered_team SET status'))).toBe(false);
      } finally {
        pool.query = originalQuery;
        const index = teamsDatabase.findIndex((team: any) => team.id === fixture.id);
        if (index !== -1) teamsDatabase.splice(index, 1);
      }
    });
  });
});
