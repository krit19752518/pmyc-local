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
import vm from 'node:vm';
import { app } from '../src/app';

describe('GET Public Pages Inspection', () => {
  it('GET /index.php should return 200 OK and render full landing page with download links', async () => {
    const res = await request(app).get('/index.php');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Prime Minister\'s Youth CUP');
    expect(res.text).toContain('เปิดรับสมัครทีมเข้าร่วมการแข่งขัน');
    expect(res.text).toContain('สมัครแข่งขัน');
    expect(res.text).toContain('href="/team/register.php"');
    expect(res.text).toContain('/assets/img/lineoa-qr.png');
    expect(res.text).toContain('ดาวน์โหลดแบบฟอร์มหนังสือรับรองทีม');
    expect(res.text).toContain('ดาวน์โหลดใบสมัครออฟไลน์');
    expect(res.text).toContain('https://docs.google.com/document/d/1U4Gc96_g87tOBrbyPYEQnGSG51WMxxn9Q-AH6dGFJ_Q/edit?usp=sharing');
    expect(res.text).toContain('ดาวน์โหลดคู่มือระบบลงทะเบียนและจัดการทีม');
  });

  it('keeps Dev registration navigation on the Dev host', async () => {
    const res = await request(app).get('/index.php').set('Host', 'football-dev.pmycfootball.in.th');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/team/register.php"');
    expect(res.text).not.toContain('href="https://pmycfootball.in.th/team/register.php"');
  });

  it('GET /rules.php should return 200 OK and contains Football Competition Rules', async () => {
    const res = await request(app).get('/rules.php');
    expect(res.status).toBe(200);
    expect(res.text).toContain('ระเบียบการแข่งขันฟุตบอล');
    expect(res.text).toContain('U14');
    expect(res.text).toContain('U16');
    expect(res.text).toContain('U18');
  });

  it('GET /team/register.php should return 200 OK and contain form fields without gender field', async () => {
    const res = await request(app).get('/team/register.php');
    expect(res.status).toBe(200);
    expect(res.text).toContain('ลงทะเบียนทีมเข้าร่วมการแข่งขัน');
    expect(res.text).toContain('name="school"');
    expect(res.text).toContain('name="province"');
    expect(res.text).toContain('name="district"');
    expect(res.text).toContain('name="email"');
    expect(res.text).toContain('name="line_id"');
    expect(res.text).not.toContain('name="username"');
    expect(res.text).not.toContain('name="gender"');
    expect(res.text).toContain('หนังสือรับรองทีม <span class="badge bg-secondary ms-1">OPTIONAL</span>');
    expect(res.text).not.toMatch(/name="doc_team_cert"[^>]*required/);
  });

  it('GET /team/register-demo.php requires SUPER_ADMIN and renders a Demo form with a dedicated endpoint', async () => {
    const denied = await request(app).get('/team/register-demo.php');
    expect(denied.status).toBe(302);
    expect(denied.headers.location).toContain('/admin/index.php?error=unauthorized');

    const page = await request(app)
      .get('/team/register-demo.php')
      .set('Cookie', ['admin_session=true', 'admin_user=admin']);
    expect(page.status).toBe(200);
    expect(page.text).toContain('DEMO</span>');
    expect(page.text).toContain('ข้อมูลจากแบบฟอร์มนี้เป็นข้อมูล Demo');
    expect(page.text).toContain('action="/api/team/register-demo"');
    expect(page.text).toContain('name="school"');
  });

  it('contact address dropdown should include complete province-scoped Thai administrative divisions', async () => {
    const page = await request(app).get('/team/register.php');
    const script = await request(app).get('/assets/js/app.bb3bd3ab.js');
    const geographyResponse = await request(app).get('/assets/data/thai-administrative-divisions.js');

    expect(page.status).toBe(200);
    expect(page.text).toContain('name="subdistrict" class="form-select" data-subdistrict-select data-district-field="contact_district"');
    expect(page.text).toContain('/assets/data/thai-administrative-divisions.js');
    expect(page.text).toContain('/assets/js/app.bb3bd3ab.js');
    expect(script.status).toBe(200);
    expect(script.text).toBe((await request(app).get('/assets/js/app.js')).text);
    expect(script.text).toContain('getSubdistricts(distVal, (provinceSelect.value || \'\').trim())');
    expect(script.text).not.toContain('function syncContactAddressSteps()');
    expect(script.text).not.toContain('provinceSelect.disabled =');
    expect(script.text).not.toContain('districtSelect.disabled =');
    expect(script.text).not.toContain('subdistrictSelect.disabled =');
    expect(script.text).toContain('clearContactAddressChildren();');
    expect(script.text).toContain('formData.set(addressField.name, addressField.value)');
    expect(geographyResponse.status).toBe(200);

    const context = { window: {} as Record<string, unknown> };
    vm.runInNewContext(geographyResponse.text, context);
    const geography = context.window.thaiAdministrativeDivisions as {
      districts: Record<string, string[]>;
      subdistricts: Record<string, Record<string, string[]>>;
    };
    const provinceNames = Object.keys(geography.districts);
    const districtCount = provinceNames.reduce((sum, province) => sum + geography.districts[province].length, 0);
    const subdistrictCount = provinceNames.reduce((sum, province) => sum + Object.values(geography.subdistricts[province]).reduce((provinceSum, list) => provinceSum + list.length, 0), 0);

    expect(provinceNames).toHaveLength(77);
    expect(districtCount).toBe(928);
    expect(subdistrictCount).toBe(7436);
    for (const province of provinceNames) {
      expect(Object.keys(geography.subdistricts[province]).sort()).toEqual([...geography.districts[province]].sort());
      for (const district of geography.districts[province]) {
        expect(geography.subdistricts[province][district].length).toBeGreaterThan(0);
        expect(new Set(geography.subdistricts[province][district]).size).toBe(geography.subdistricts[province][district].length);
      }
    }
    expect(geography.subdistricts['ลพบุรี']['ลำสนธิ']).toEqual(['ลำสนธิ', 'ซับสมบูรณ์', 'หนองรี', 'กุดตาเพชร', 'เขารวก', 'เขาน้อย']);
    expect(geography.districts['กรุงเทพมหานคร']).toContain('ทวีวัฒนา');
  });
});
