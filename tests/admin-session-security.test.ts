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
import { app } from '../src/app';
import { satOfficersDatabase } from '../src/adminAuth';
import { ADMIN_SESSION_ABSOLUTE_SECONDS, createAdminSessionToken, verifyAdminSessionToken } from '../src/services/adminSession.service';

describe('Admin Security Hardening & Session Guard (UT-ADMIN-SEC)', () => {
  const satOfficerFixture = {
    id: `SAT-TEST-ADMIN-SESSION-${Date.now()}`,
    fullname: 'เจ้าหน้าที่ทดสอบ session',
    position: 'เจ้าหน้าที่ทดสอบ',
    province: 'เชียงใหม่',
    phone: '0800000000',
    email: 'somsak.sat@sports.go.th',
    passwordHash: 'sat-session-password',
    createdAt: '2026-10-11'
  };

  beforeAll(() => {
    satOfficersDatabase.push(satOfficerFixture);
  });

  afterAll(() => {
    const fixtureIndex = satOfficersDatabase.indexOf(satOfficerFixture);
    if (fixtureIndex !== -1) satOfficersDatabase.splice(fixtureIndex, 1);
  });

  test('UT-ADMIN-SEC-01: Direct access to /admin/dashboard.php without session cookie redirects to /admin/index.php?error=unauthorized', async () => {
    const res = await request(app).get('/admin/dashboard.php');
    expect(res.status).toBe(302);
    expect(res.header.location).toContain('/admin/index.php?error=unauthorized');
  });

  test('UT-ADMIN-SEC-02: Accessing /admin/dashboard.php?username=admin without session cookie is BLOCKED and redirects to login', async () => {
    const res = await request(app).get('/admin/dashboard.php?username=admin');
    expect(res.status).toBe(302);
    expect(res.header.location).toContain('/admin/index.php?error=unauthorized');
  });

  test('UT-ADMIN-SEC-02A: legacy SAT index URL canonicalizes the Central login form to the Central portal', async () => {
    const res = await request(app).get('/sat-admin/index.php');
    expect(res.status).toBe(302);
    expect(res.header.location).toBe('/admin/index.php');
  });

  test('UT-ADMIN-SEC-03: POST /admin/dashboard.php with valid credentials sets HTTP-Only admin_session cookie', async () => {
    const res = await request(app)
      .post('/admin/dashboard.php')
      .send({ username: 'admin', password: '12348765' });

    expect(res.status).toBe(302);
    expect(res.header.location).toContain('/admin/dashboard.php');

    const setCookie = Array.isArray(res.header['set-cookie']) ? res.header['set-cookie'] : [res.header['set-cookie']];
    expect(setCookie).toBeDefined();
    expect(setCookie.some((c: string) => c.includes('admin_session=true'))).toBe(true);
    expect(setCookie.some((c: string) => c.includes('admin_user=admin'))).toBe(true);
    expect(setCookie.some((c: string) => c.includes('HttpOnly'))).toBe(true);
  });

  test('UT-ADMIN-SEC-04: GET /admin/dashboard.php with valid admin_session cookie allows access (200 OK)', async () => {
    const res = await request(app)
      .get('/admin/dashboard.php')
      .set('Cookie', ['admin_session=true', 'admin_user=admin']);

    expect(res.status).toBe(200);
    expect(res.text).toContain('แผงควบคุม (Dashboard)');
    expect(res.text).not.toContain('?username=admin');
    expect(res.text).toContain('ทีมชาย');
    expect(res.text).toContain('นักกีฬาชาย');
    expect(res.text).not.toContain('/admin/teams.php?type=women_teams');
    expect(res.text).not.toContain('/admin/players.php?type=female_athletes');
  });

  test('UT-ADMIN-SEC-05: GET /admin/logout clears admin_session cookie and redirects to login page for Central Admin', async () => {
    const res = await request(app)
      .get('/admin/logout')
      .set('Cookie', ['admin_session=true', 'admin_user=admin']);

    expect(res.status).toBe(302);
    expect(res.header.location).toContain('/admin/index.php');

    const setCookie = Array.isArray(res.header['set-cookie']) ? res.header['set-cookie'] : [res.header['set-cookie']];
    expect(setCookie).toBeDefined();
    expect(setCookie.some((c: string) => c.includes('admin_session=;') || c.includes('Max-Age=0'))).toBe(true);
  });

  test('UT-ADMIN-SEC-06: SAT portal logout clears only its path-scoped session and returns to SAT login', async () => {
    const satUser = {
      id: satOfficerFixture.id,
      username: satOfficerFixture.email,
      fullname: `${satOfficerFixture.fullname} (${satOfficerFixture.position})`,
      roleCode: 'SAT_OFFICER' as const,
      roleName: 'เจ้าหน้าที่ กกท. (เชียงใหม่)',
      permissions: ['teams:read', 'teams:verify'],
      province: satOfficerFixture.province
    };
    const token = createAdminSessionToken(satUser, 'sat');
    const res = await request(app)
      .get('/sat-admin/logout')
      .set('Cookie', [`sat_admin_session=${encodeURIComponent(token)}`, `sat_admin_user=${encodeURIComponent(satUser.username)}`]);

    expect(res.status).toBe(302);
    expect(res.header.location).toContain('/sat-admin/login.php');

    const setCookie = Array.isArray(res.header['set-cookie']) ? res.header['set-cookie'] : [res.header['set-cookie']];
    expect(setCookie).toBeDefined();
    expect(setCookie.some((c: string) => c.includes('sat_admin_session=;') && c.includes('Path=/sat-admin') && c.includes('Max-Age=0'))).toBe(true);
  });

  test('SAT portal has its own path-scoped session and URL space while central login stays independent', async () => {
    const satLogin = await request(app)
      .post('/sat-admin/dashboard.php')
      .send({ username: satOfficerFixture.email, password: satOfficerFixture.passwordHash, login_type: 'sat_officer' });

    expect(satLogin.status).toBe(302);
    expect(satLogin.header.location).toContain('/sat-admin/dashboard.php');
    const satSetCookies: string[] = Array.isArray(satLogin.header['set-cookie']) ? satLogin.header['set-cookie'] : [satLogin.header['set-cookie']];
    const satCookies = satSetCookies.map(cookie => cookie.split(';')[0]);
    expect(satSetCookies.some(cookie => cookie.includes('sat_admin_session=') && cookie.includes('Path=/sat-admin') && cookie.includes('HttpOnly'))).toBe(true);

    const centralLogin = await request(app)
      .post('/admin/dashboard.php')
      .send({ username: 'admin', password: '12348765', login_type: 'central' });
    expect(centralLogin.status).toBe(302);
    const centralSetCookies: string[] = Array.isArray(centralLogin.header['set-cookie']) ? centralLogin.header['set-cookie'] : [centralLogin.header['set-cookie']];
    expect(centralSetCookies.some(cookie => cookie.includes('admin_session_token=') && cookie.includes('Path=/'))).toBe(true);
    const centralCookies = centralSetCookies.map(cookie => cookie.split(';')[0]);

    // Browser sends both root-scoped Central cookies and SAT path-scoped cookies to
    // the SAT path. The signed portal session must select the SAT identity.
    const satPage = await request(app).get('/sat-admin/dashboard.php').set('Cookie', [...satCookies, ...centralCookies]);
    expect(satPage.status).toBe(200);
    expect(satPage.text).toContain('/sat-admin/teams.php');
    expect(satPage.text).toContain('/sat-admin/api/admin/');
    expect(satPage.text).toContain('เจ้าหน้าที่ กกท. (เชียงใหม่)');
    expect(satPage.text).not.toContain('ผู้ดูแลระบบสูงสุด');
    expect(satPage.text).toContain('class="sat-support-qr text-center mt-2"');
    expect(satPage.text).toContain('src="/images/lineoa-support-qr.png"');
    expect(satPage.text).not.toContain('/sat-admin/images/lineoa-support-qr.png');
    expect(satPage.text).not.toContain('id="supportReportModal"');
    expect(satPage.text).toContain('href="/sat-admin/support-reports.php"');

    const satTeams = await request(app).get('/sat-admin/teams.php').set('Cookie', satCookies);
    expect(satTeams.status).toBe(200);
    expect(satTeams.text).toContain('id="supportReportModal"');
    expect(satTeams.text).not.toContain('class="sat-support-qr');

    const centralPage = await request(app).get('/admin/dashboard.php').set('Cookie', centralCookies);
    expect(centralPage.status).toBe(200);
    expect(centralPage.text).toContain('ผู้ดูแลระบบสูงสุด');
    expect(centralPage.text).toContain('id="supportReportModal"');
    expect(centralPage.text).not.toContain('class="sat-support-qr');

    const centralPageWithSatSession = await request(app).get('/admin/dashboard.php').set('Cookie', satCookies);
    expect(centralPageWithSatSession.status).toBe(302);
    expect(centralPageWithSatSession.header.location).toContain('/admin/index.php');
  });

  test('SAT portal never authenticates from Central legacy compatibility cookies', async () => {
    const centralLogin = await request(app)
      .post('/admin/dashboard.php')
      .send({ username: 'admin', password: '12348765', login_type: 'central' });
    const centralSetCookies: string[] = Array.isArray(centralLogin.header['set-cookie']) ? centralLogin.header['set-cookie'] : [centralLogin.header['set-cookie']];
    const centralCookies = centralSetCookies.map(cookie => cookie.split(';')[0]);

    const satPageWithoutSatSession = await request(app)
      .get('/sat-admin/dashboard.php')
      .set('Cookie', centralCookies);

    expect(satPageWithoutSatSession.status).toBe(302);
    expect(satPageWithoutSatSession.header.location).toContain('/sat-admin/login.php');
  });

  test('SAT expiry returns to the new SAT login URL and shows an expiry message', async () => {
    const res = await request(app).get('/sat-admin/login.php?expired=1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Session หมดอายุ');
    expect(res.text).toContain('action="/sat-admin/dashboard.php"');
    expect(res.text).toContain('window.__pmycSessionExpiryHandler');
  });

  test('admin sessions enforce both idle and absolute expiry', () => {
    const now = Date.now();
    const satUser = {
      id: satOfficerFixture.id,
      username: satOfficerFixture.email,
      fullname: satOfficerFixture.fullname,
      roleCode: 'SAT_OFFICER' as const,
      roleName: 'SAT Officer',
      permissions: []
    };
    const absoluteExpired = createAdminSessionToken(satUser, 'sat', now, now - (ADMIN_SESSION_ABSOLUTE_SECONDS + 1) * 1000);
    expect(verifyAdminSessionToken(absoluteExpired, 'sat', now)).toBeNull();
    const wrongPortal = createAdminSessionToken(satUser, 'sat', now);
    expect(verifyAdminSessionToken(wrongPortal, 'central', now)).toBeNull();
  });

  test('Production admin routes reject legacy unsigned username cookies', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(app)
        .get('/admin/dashboard.php')
        .set('Cookie', ['admin_session=true', 'admin_user=admin']);
      expect(res.status).toBe(302);
      expect(res.header.location).toContain('/admin/index.php?error=unauthorized');
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test('expired SAT API requests return a role-specific login redirect for the shared fetch handler', async () => {
    const now = Date.now();
    const satUser = {
      id: satOfficerFixture.id,
      username: satOfficerFixture.email,
      fullname: satOfficerFixture.fullname,
      roleCode: 'SAT_OFFICER' as const,
      roleName: 'SAT Officer',
      permissions: []
    };
    const expiredToken = createAdminSessionToken(satUser, 'sat', now, now - (ADMIN_SESSION_ABSOLUTE_SECONDS + 1000) * 1000);
    const res = await request(app)
      .get('/sat-admin/api/admin/teams/full-details')
      .set('Cookie', [`sat_admin_session=${encodeURIComponent(expiredToken)}`, `sat_admin_user=${encodeURIComponent(satUser.username)}`])
      .set('Accept', 'application/json');
    expect(res.status).toBe(401);
    expect(res.body.expired).toBe(true);
    expect(res.body.redirectUrl).toContain('/sat-admin/login.php?expired=1');
  });
});
