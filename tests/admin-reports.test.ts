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

describe('Admin Executive Reports Automated Test Suite', () => {
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

  describe('Executive report pages, access, province scope, and rendering', () => {
    it('IT-REPORT-SUITE-01: GET Executive Report pages should render correctly with charts & navigation', async () => {
      const reports = [
        { url: '/admin/report-demographics.php', title: 'รายงานวิเคราะห์การสมัคร & การกระจายตัวเชิงพื้นที่' },
        { url: '/admin/report-roster.php', title: 'รายงานสถิตินักกีฬา & รุ่นการแข่งขัน' },
        { url: '/admin/report-teams-categories.php', title: 'รายงานทีม & รุ่นแข่งขัน' },
        { url: '/admin/report-team-compliance.php', title: 'รายงานการตรวจสอบเอกสารการสมัครทีม' },
        { url: '/admin/report-compliance.php', title: 'รายงานการตรวจสอบเอกสารนักกีฬา' },
        { url: '/admin/report-strategy.php', title: 'รายงานประเมินการจัดแข่งครั้งต่อไป' }
      ];

      for (const rep of reports) {
        const res = await request(app)
          .get(rep.url)
          .set('Cookie', ['admin_session=true', 'admin_user=admin', 'admin_role=SUPER_ADMIN']);

        expect(res.status).toBe(200);
        expect(res.text).toContain(rep.title);
        expect(res.text).toContain('chart');
        if (rep.url === '/admin/report-teams-categories.php') {
          expect(res.text).toContain('>ส่งแข่งรวม</div>');
          expect(res.text).toMatch(/fs-2 fw-bold text-dark">[\d,]+ <span class="fs-6 fw-normal text-muted">รุ่น<\/span>/);
          expect(res.text).toMatch(/text-muted small fw-bold">สถาบัน\/ทีมทั้งหมดในระบบ [\d,]+ ทีม<\/div>/);
        }
      }
    });

    it('IT-REPORT-ACCESS-02: DOCUMENT_VERIFIER can see and open executive reports 1-6', async () => {
      const reportUrls = [
        '/admin/report-demographics.php',
        '/admin/report-roster.php',
        '/admin/report-teams-categories.php',
        '/admin/report-team-compliance.php',
        '/admin/report-compliance.php',
        '/admin/report-strategy.php'
      ];
      const cookie = verifierCookie();

      const dashboardRes = await request(app)
        .get('/admin/dashboard.php')
        .set('Cookie', cookie);
      expect(dashboardRes.status).toBe(200);
      for (const reportUrl of reportUrls) {
        expect(dashboardRes.text).toContain(reportUrl);
        const reportRes = await request(app)
          .get(reportUrl)
          .set('Cookie', cookie);
        expect(reportRes.status).toBe(200);
      }
    });

    it('IT-REPORT-ACCESS-03: SAT_OFFICER can open executive reports 1-6', async () => {
      const reportUrls = [
        '/sat-admin/report-demographics.php',
        '/sat-admin/report-roster.php',
        '/sat-admin/report-teams-categories.php',
        '/sat-admin/report-team-compliance.php',
        '/sat-admin/report-compliance.php',
        '/sat-admin/report-strategy.php'
      ];
      const cookie = satOfficerCookie();

      for (const reportUrl of reportUrls) {
        const reportRes = await request(app)
          .get(reportUrl)
          .set('Cookie', cookie);
        expect(reportRes.status).toBe(200);
      }
    });

    it('IT-REPORT-ACCESS-04: SAT_OFFICER sees only own province in reports; central roles see all', async () => {
      const reportUrls = [
        '/sat-admin/report-demographics.php',
        '/sat-admin/report-roster.php',
        '/sat-admin/report-teams-categories.php',
        '/sat-admin/report-team-compliance.php',
        '/sat-admin/report-compliance.php',
        '/sat-admin/report-strategy.php'
      ];
      const centralReportUrls = reportUrls.map(url => url.replace('/sat-admin/', '/admin/'));
      const ownName = 'ทีมทดสอบขอบเขต-ชลบุรี-SCOPE';
      const otherName = 'ทีมทดสอบขอบเขต-เชียงใหม่-SCOPE';
      const otherProvince = 'จังหวัดทดสอบขอบเขตบี';
      const fixtures = [
        { id: 'FTM-TEST-SCOPE-CB', teamName: ownName, province: 'ชลบุรี', status: 'PENDING', categories: 'U14' },
        { id: 'FTM-TEST-SCOPE-CM', teamName: otherName, province: otherProvince, status: 'PENDING', categories: 'U14' }
      ];
      fixtures.forEach(f => teamsDatabase.push(f));
      const satCookie = satOfficerCookie();
      const adminCookie = superAdminCookie();
      const verifierCookieValue = verifierCookie();

      try {
        let reportsExposingNames = 0;
        for (const reportUrl of centralReportUrls) {
          const satUrl = reportUrl.replace('/admin/', '/sat-admin/');
          const adminRes = await request(app).get(reportUrl).set('Cookie', adminCookie);
          const verifierRes = await request(app).get(reportUrl).set('Cookie', verifierCookieValue);
          const satRes = await request(app).get(satUrl).set('Cookie', satCookie);
          expect(adminRes.status).toBe(200);
          expect(verifierRes.status).toBe(200);
          expect(satRes.status).toBe(200);

          // SAT_OFFICER (Chonburi) must never see the other province's data
          expect(satRes.text).not.toContain(otherName);
          expect(satRes.text).not.toContain(otherProvince);
          if (adminRes.text.includes(otherProvince)) {
            reportsExposingNames++;
            expect(verifierRes.text).toContain(otherProvince);
          }
        }
        // Prevent a vacuous pass: at least one report must list team names
        expect(reportsExposingNames).toBeGreaterThanOrEqual(1);
      } finally {
        fixtures.forEach(f => {
          const index = teamsDatabase.findIndex((team: any) => team.id === f.id);
          if (index !== -1) teamsDatabase.splice(index, 1);
        });
      }
    });

    it('IT-REPORT-DEMO-01: demographics report includes zero-team provinces and sortable headers for all columns', async () => {
      const fixture = {
        id: 'FTM-TEST-DEMOGRAPHICS-01',
        teamName: 'ทีมทดสอบรายงานจังหวัด',
        province: 'เชียงใหม่',
        status: 'PENDING',
        categories: 'U14'
      };
      teamsDatabase.push(fixture);

      try {
        const res = await request(app)
          .get('/admin/report-demographics.php')
          .set('Cookie', ['admin_session=true', 'admin_user=admin']);

        expect(res.status).toBe(200);
        expect(res.text).toContain('id="provinceDemographicsTable"');
        const tableHeader = res.text.match(/<table id="provinceDemographicsTable"[\s\S]*?<thead[\s\S]*?<\/thead>/)?.[0] || '';
        expect(tableHeader.match(/province-sort-button/g)).toHaveLength(7);
        for (let columnIndex = 0; columnIndex < 7; columnIndex += 1) {
          expect(tableHeader).toContain(`data-sort-column="${columnIndex}"`);
          expect(tableHeader).toContain(`onclick="sortProvinceDemographics(${columnIndex})"`);
        }
        expect(tableHeader).toContain('data-sort-type="index"');
        expect(tableHeader).toContain('data-sort-type="text"');
        expect(tableHeader).toContain('data-sort-type="number"');
        expect(res.text).toContain('aria-sort="descending"');
        expect(res.text).toContain('data-original-index="0"');
        expect(res.text).toContain('valueA.localeCompare(valueB, \'th\')');
        expect(res.text).toContain("button.setAttribute('aria-sort', direction)");
        expect(res.text).toContain("direction === 'ascending' ? 'ก-ฮ' : 'ฮ-ก'");
        expect(res.text).toContain("direction === 'ascending' ? 'น้อยไปมาก' : 'มากไปน้อย'");

        const provinceRows = [...res.text.matchAll(/<tr class="fs-6" data-team-count="[^"]+"[\s\S]*?<\/tr>/g)].map(([row]) => row);
        const zeroProvinceRow = provinceRows.find(row => row.includes('<strong class="text-navy fs-6">อ่างทอง</strong>')) || '';
        expect(provinceRows).toHaveLength(77);
        expect(zeroProvinceRow).toContain('data-team-count="0"');
        expect(zeroProvinceRow).toContain('text-danger');
        expect(zeroProvinceRow).toContain('>0</td>');
      } finally {
        const index = teamsDatabase.findIndex((team: any) => team.id === fixture.id);
        if (index !== -1) teamsDatabase.splice(index, 1);
      }
    });

    it('IT-REPORT-DEMO-DISTRICTS-01: expands team counts by district only for provinces with district data', async () => {
      const districtFixtures = [
        { id: 'FTM-TEST-DISTRICT-01', teamName: 'ทีมทดสอบเขต 1', province: 'จังหวัดทดสอบเขต', district: 'อำเภอทดสอบเหนือ', status: 'PENDING', categories: 'U14' },
        { id: 'FTM-TEST-DISTRICT-02', teamName: 'ทีมทดสอบเขต 2', province: 'จังหวัดทดสอบเขต', district: 'อำเภอทดสอบเหนือ', status: 'APPROVED', categories: 'U14' },
        { id: 'FTM-TEST-DISTRICT-03', teamName: 'ทีมทดสอบเขต 3', province: 'จังหวัดทดสอบเขต', district: 'อำเภอทดสอบใต้', status: 'PENDING', categories: 'U14' }
      ];
      teamsDatabase.push(...districtFixtures);

      try {
        const res = await request(app)
          .get('/admin/report-demographics.php')
          .set('Cookie', ['admin_session=true', 'admin_user=admin']);

        expect(res.status).toBe(200);
        expect(res.text).toContain('district-breakdown-toggle');
        expect(res.text).toContain('aria-controls="province-district-details-');
        expect(res.text).toContain('onclick="toggleProvinceDistricts(');
        expect(res.text).toContain('data-district-details-for=');
        expect(res.text).toContain('อำเภอทดสอบเหนือ');
        expect(res.text).toContain('อำเภอทดสอบใต้');
        expect(res.text).toContain('>2</td>');
        expect(res.text).toContain('>1</td>');
        expect(res.text).toContain("throw new Error('Province district detail row is missing.')");

        const provinceRows = [...res.text.matchAll(/<tr class="fs-6" data-team-count="[^"]+"[\s\S]*?<\/tr>/g)].map(([row]) => row);
        const zeroProvinceRow = provinceRows.find(row => row.includes('<strong class="text-navy fs-6">อ่างทอง</strong>')) || '';
        expect(zeroProvinceRow).not.toContain('district-breakdown-toggle');
      } finally {
        districtFixtures.forEach(fixture => {
          const index = teamsDatabase.findIndex((team: any) => team.id === fixture.id);
          if (index !== -1) teamsDatabase.splice(index, 1);
        });
      }
    });

  });
});
