jest.mock('../src/db', () => ({
  pool: {
    query: jest.fn(async (sql: string) => ({ rows: [], rowCount: /^(UPDATE|INSERT|DELETE)\b/i.test(sql.trim()) ? 1 : 0 })),
    end: async () => undefined
  }
}));
jest.mock('../src/db/initTables', () => ({
  initTeamTables: async () => undefined
}));

import request from 'supertest';
import { cleanupTestUploadFiles } from '../src/middleware/upload';
import { app } from '../src/app';
import { teamProfile } from '../src/models/team.model';
import { pool } from '../src/db';
import { teamSessionCookies } from './team-session.helper';

const { officialsDatabase } = require('../src/app');
const initialOfficialIds = new Set(officialsDatabase.map((official: any) => official.id));
const originalTeamProfile = {
  ...teamProfile,
  categories: Array.isArray(teamProfile.categories) ? [...teamProfile.categories] : teamProfile.categories
};

describe('Team Official Management & Validation', () => {
  beforeEach(() => {
    (pool.query as jest.Mock).mockImplementation(async (sql: string) => ({
      rows: [],
      rowCount: /^(UPDATE|INSERT|DELETE)\b/i.test(sql.trim()) ? 1 : 0
    }));
  });

  beforeAll(() => {
    teamProfile.status = 'PENDING';
    teamProfile.categories = ['U14', 'U16', 'U18'];
    teamProfile.submitted_categories = '';
    teamProfile.submittedCategories = '';
  });

  afterAll(async () => {
    for (let index = officialsDatabase.length - 1; index >= 0; index--) {
      if (!initialOfficialIds.has(officialsDatabase[index].id)) officialsDatabase.splice(index, 1);
    }
    for (const key of Object.keys(teamProfile)) delete teamProfile[key];
    Object.assign(teamProfile, originalTeamProfile);
    cleanupTestUploadFiles();
    await pool.end();
  });

  it('GET /team/officials.php should render officials list with category filter tabs and photo upload controls when logged in', async () => {
    const testOfficialId = `OFF-COLOR-TEST-${Date.now()}`;
    officialsDatabase.push({
      id: testOfficialId,
      teamId: 'FTM-001',
      name: 'เจ้าหน้าที่ทดสอบสีตำแหน่ง',
      position: 'ผู้จัดการทีม',
      categories: 'U14'
    });

    try {
      const res = await request(app)
        .get('/team/officials.php')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001']);

      expect(res.status).toBe(200);
      expect(res.text).toContain('เจ้าหน้าที่ทีม');
      expect(res.text).toContain('ผู้จัดการทีม');
      expect(res.text).toContain('style="color: var(--pm-navy) !important;">ผู้จัดการทีม</span>');
      expect(res.text).toContain('/team/official-edit.php');
      expect(res.text).toContain('เพิ่มเจ้าหน้าที่');
      expect(res.text).toContain('รุ่น U14');
    } finally {
      const index = officialsDatabase.findIndex((official: any) => official.id === testOfficialId);
      if (index !== -1) officialsDatabase.splice(index, 1);
    }
  });

  it('GET /team/official-edit.php should allow text identity values up to 20 characters', async () => {
    const res = await request(app)
      .get('/team/official-edit.php?category=ALL')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001']);

    expect(res.status).toBe(200);
    expect(res.text).toContain('เลขประจำตัวประชาชน / ข้อมูลระบุตัวตน');
    expect(res.text).toContain('maxlength="20"');
    expect(res.text).toContain('กรอกตัวเลขหรือตัวอักษรได้ ไม่เกิน 20 ตัวอักษร');
  });

  it('GET /team/official-edit.php should require an ID card file only for a manager without an existing file', async () => {
    const testOfficialId = `OFF-TEST-DOC-REQUIRED-${Date.now()}`;
    const testOfficial = {
      id: testOfficialId,
      teamId: 'FTM-001',
      name: 'เจ้าหน้าที่ทดสอบเงื่อนไขเอกสาร',
      position: 'ผู้จัดการทีม',
      idCard: `DOC-TEST-${Date.now()}`,
      phone: '0812345678',
      categories: 'U14',
      docIdCard: ''
    };
    officialsDatabase.push(testOfficial);

    try {
      for (const [position, expectedRequired] of [['ผู้จัดการทีม', true], ['แพทย์ประจำทีม', false]] as const) {
        testOfficial.position = position;
        const res = await request(app)
          .get(`/team/official-edit.php?id=${encodeURIComponent(testOfficialId)}&category=ALL`)
          .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001']);

        expect(res.status).toBe(200);
        const fileInput = res.text.match(/<input type="file" name="doc_id_card"[^>]*>/)?.[0] || '';
        expect(fileInput).not.toBe('');
        expect(fileInput.includes(' required')).toBe(expectedRequired);
        expect(res.text).toContain("posSelect.value === 'ผู้จัดการทีม'");
      }
    } finally {
      const index = officialsDatabase.findIndex((official: any) => official.id === testOfficialId);
      if (index !== -1) officialsDatabase.splice(index, 1);
    }
  });

  it('POST /api/team/officials/save should accept and preserve an alphanumeric identity longer than 13 characters', async () => {
    const idCard = 'STAFF-AB1234567890';
    const name = 'เจ้าหน้าที่ทดสอบรหัสข้อความ';
    expect(idCard.length).toBeGreaterThan(13);
    expect(idCard.length).toBeLessThanOrEqual(20);

    const res = await withManagerDocument(request(app)
      .post('/api/team/officials/save')
      .set('Cookie', teamSessionCookies('FTM-001'))
      .set('X-Requested-With', 'XMLHttpRequest'), { name, position: 'ผู้จัดการทีม', id_card: idCard, phone: '0812345678', categories: ['U14'] });

    expect(res.status).toBe(200);
    const savedOfficial = officialsDatabase.find((official: any) => official.name === name);
    expect(savedOfficial?.idCard).toBe(idCard);
    const createAudit = (pool.query as jest.Mock).mock.calls.find(([statement, values]) =>
      String(statement).includes('INSERT INTO football_audit_log') && (values as unknown[] | undefined)?.[0] === 'OFFICIAL_CREATED'
    );
    expect(createAudit).toBeDefined();
    expect(JSON.stringify(createAudit?.[1])).not.toContain(idCard);
  });

  it('POST /api/team/officials/save should reject identity values longer than the database limit', async () => {
    const name = 'เจ้าหน้าที่ทดสอบรหัสยาวเกิน';
    const res = await withManagerDocument(request(app)
      .post('/api/team/officials/save')
      .set('Cookie', teamSessionCookies('FTM-001'))
      .set('X-Requested-With', 'XMLHttpRequest'), { name, position: 'ผู้จัดการทีม', id_card: 'STAFF-123456789012345', phone: '0812345678', categories: ['U14'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('ไม่เกิน 20 ตัวอักษร');
    expect(officialsDatabase.some((official: any) => official.name === name)).toBe(false);
  });

  it('POST /api/team/officials/save should persist an uploaded ID card in doc_id_card without replacing id_card', async () => {
    const officialId = `OFF-TEST-DOC-UPDATE-${Date.now()}`;
    const idCard = `STAFF-${Date.now()}`;
    const official = {
      id: officialId,
      teamId: 'FTM-001',
      name: 'เจ้าหน้าที่ทดสอบแนบเอกสาร',
      position: 'ผู้จัดการทีม',
      idCard,
      docIdCard: '/uploads/old-id-card.pdf',
      doc_id_card: '/uploads/old-id-card.pdf',
      phone: '0812345678',
      categories: 'U18'
    };
    officialsDatabase.push(official);
    const queryMock = pool.query as jest.Mock;

    try {
      const res = await request(app)
        .post('/api/team/officials/save')
        .set('Cookie', teamSessionCookies('FTM-001'))
        .set('X-Requested-With', 'XMLHttpRequest')
        .field('id', officialId)
        .field('name', official.name)
        .field('position', official.position)
        .field('id_card', idCard)
        .field('phone', official.phone)
        .field('categories', 'U18')
        .attach('doc_id_card', Buffer.from('%PDF-1.4 test official document'), {
          filename: 'official-id-card.pdf',
          contentType: 'application/pdf'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const updateCall = queryMock.mock.calls.find(([statement]) => String(statement).includes('UPDATE football_official SET'));
      expect(updateCall).toBeDefined();
      const [statement, values] = updateCall as [string, unknown[]];
      expect(statement).toContain('id_card = $3');
      expect(statement).toContain('doc_id_card = $10');
      expect(values[2]).toBe(idCard);
      expect(String(values[9])).toMatch(/^\/uploads\/.+/);
      expect(official.idCard).toBe(idCard);
      expect(official.docIdCard).toBe(values[9]);
      expect(official.doc_id_card).toBe(values[9]);
    } finally {
      const index = officialsDatabase.findIndex((item: any) => item.id === officialId);
      if (index !== -1) officialsDatabase.splice(index, 1);
    }
  });

  it('POST /api/team/officials/save should compare text identity values case-insensitively for duplicates', async () => {
    const idCard = 'STAFF-DUPLICATE-01';
    const firstName = 'เจ้าหน้าที่รหัสซ้ำคนแรก';
    const firstRes = await withManagerDocument(request(app)
      .post('/api/team/officials/save')
      .set('Cookie', teamSessionCookies('FTM-001'))
      .set('X-Requested-With', 'XMLHttpRequest'), { name: firstName, position: 'ผู้จัดการทีม', id_card: idCard, phone: '0812345678', categories: ['U14'] });
    expect(firstRes.status).toBe(200);

    const duplicateRes = await withManagerDocument(request(app)
      .post('/api/team/officials/save')
      .set('Cookie', teamSessionCookies('FTM-002'))
      .set('X-Requested-With', 'XMLHttpRequest'), { name: 'เจ้าหน้าที่รหัสซ้ำอีกคน', position: 'ผู้จัดการทีม', id_card: idCard.toLowerCase(), phone: '0812345679', categories: ['U14'] });

    expect(duplicateRes.status).toBe(400);
    expect(duplicateRes.body.error).toContain('มีอยู่ในระบบแล้ว');
  });

  it('POST /api/team/officials/save should return 400 when phone number is missing or invalid', async () => {
    const res = await request(app)
      .post('/api/team/officials/save')
      .set('Cookie', teamSessionCookies('FTM-001'))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        name: 'นายทดสอบ ไม่มีเบอร์',
        position: 'ผู้ช่วยผู้ฝึกสอน',
        id_card: '1100400012345',
        categories: ['U14']
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('เบอร์โทรศัพท์');
  });

  it('POST /api/team/officials/save should return 400 when doc_id_card is missing and require_doc=true', async () => {
    const res = await request(app)
      .post('/api/team/officials/save')
      .set('Cookie', teamSessionCookies('FTM-001'))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        name: 'นายทดสอบ ไม่มีสำเนาบัตร',
        position: 'ผู้จัดการทีม',
        id_card: '1100400012399',
        phone: '0812345678',
        categories: ['U14'],
        require_doc: 'true'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('สำเนาบัตรประชาชน');
  });

  it('POST /api/team/officials/save should allow non-manager positions without an ID card file', async () => {
    const name = 'เจ้าหน้าที่แพทย์ไม่แนบสำเนาบัตรทดสอบ';
    try {
      const res = await request(app)
        .post('/api/team/officials/save')
        .set('Cookie', teamSessionCookies('FTM-001'))
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          name,
          position: 'แพทย์ประจำทีม',
          id_card: `MED-${Date.now()}`,
          phone: '0812345678',
          categories: ['U14'],
          require_doc: 'true'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const savedOfficial = officialsDatabase.find((official: any) => official.name === name);
      expect(savedOfficial).toBeDefined();
      expect(savedOfficial.docIdCard).toBeUndefined();
    } finally {
      for (let index = officialsDatabase.length - 1; index >= 0; index--) {
        if (officialsDatabase[index].name === name) officialsDatabase.splice(index, 1);
      }
    }
  });

  it('POST /api/team/officials/save should return 400 when coach license details are missing', async () => {
    const res = await request(app)
      .post('/api/team/officials/save')
      .set('Cookie', teamSessionCookies('FTM-001'))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        name: 'โค้ชทดสอบ ขาดไลเซนส์',
        position: 'ผู้ฝึกสอน',
        id_card: '1100400055555',
        phone: '0855555555',
        categories: ['U14'],
        has_license: 'YES',
        license_type: '',
        license_serial: ''
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('ระดับใบอนุญาต');
  });

  it('POST /api/team/officials/save should allow duplicate official ID cards in the same team', async () => {
    const dupIdCard = '1199' + Date.now().toString().slice(-9);
    // First save an official
    const firstRes = await withManagerDocument(request(app)
      .post('/api/team/officials/save')
      .set('Cookie', teamSessionCookies('FTM-001'))
      .set('X-Requested-With', 'XMLHttpRequest'), {
        name: 'นายเจ้าหน้าที่ คนที่ 1',
        position: 'ผู้จัดการทีม',
        id_card: dupIdCard,
        phone: '0811112222',
        categories: ['U14']
      });
    expect(firstRes.status).toBe(200);

    // Saving another official with the same ID card in this team is allowed
    const dupRes = await request(app)
      .post('/api/team/officials/save')
      .set('Cookie', teamSessionCookies('FTM-001'))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        name: 'นายเจ้าหน้าที่ คนที่ 2',
        position: 'ผู้ช่วยผู้ฝึกสอน',
        id_card: dupIdCard,
        phone: '0833334444',
        categories: ['U14']
      });

    expect(dupRes.status).toBe(200);
    expect(dupRes.body.success).toBe(true);
    expect(officialsDatabase.filter((official: any) => official.idCard === dupIdCard && official.teamId === 'FTM-001')).toHaveLength(2);
  });

  it('POST /api/team/officials/save should return 400 when official ID card is duplicate with another team (cross-team check)', async () => {
    const dupCrossIdCard = '1188' + Date.now().toString().slice(-9);
    // Save official in Team FTM-001
    await withManagerDocument(request(app)
      .post('/api/team/officials/save')
      .set('Cookie', teamSessionCookies('FTM-001'))
      .set('X-Requested-With', 'XMLHttpRequest'), {
        name: 'นายเจ้าหน้าที่ ทีม 1',
        position: 'ผู้จัดการทีม',
        id_card: dupCrossIdCard,
        phone: '0811119999',
        categories: ['U14']
      });

    // Try saving official in Team FTM-002 with same ID card
    const crossDupRes = await request(app)
      .post('/api/team/officials/save')
      .set('Cookie', teamSessionCookies('FTM-002'))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        name: 'นายเจ้าหน้าที่ ทีม 2',
        position: 'ผู้จัดการทีม',
        id_card: dupCrossIdCard,
        phone: '0833339999',
        categories: ['U14']
      });

    expect(crossDupRes.status).toBe(400);
    expect(crossDupRes.body.success).toBe(false);
    expect(crossDupRes.body.error).toContain('มีอยู่ในระบบแล้ว');
  });

  it('POST /api/team/officials/save should use the session team even when the URL contains another teamId', async () => {
    const name = 'เจ้าหน้าที่ทดสอบขอบเขตทีมจาก session';
    try {
      const res = await request(app)
        .post('/api/team/officials/save?teamId=FTM-002')
        .set('Cookie', teamSessionCookies('FTM-001'))
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name, position: 'ผู้ช่วยผู้ฝึกสอน', id_card: `S-${Date.now()}`, phone: '0812345678', categories: ['U14'] });

      expect(res.status).toBe(200);
      expect(officialsDatabase.find((official: any) => official.name === name)?.teamId).toBe('FTM-001');
    } finally {
      for (let index = officialsDatabase.length - 1; index >= 0; index--) {
        if (officialsDatabase[index].name === name) officialsDatabase.splice(index, 1);
      }
    }
  });

  it('POST /api/team/officials/save should reject editing an official owned by another team', async () => {
    const foreignOfficial = {
      id: `OFF-FOREIGN-${Date.now()}`,
      teamId: 'FTM-002',
      name: 'เจ้าหน้าที่ทีมอื่นที่ห้ามแก้',
      position: 'ผู้ช่วยผู้ฝึกสอน',
      idCard: `FOREIGN-${Date.now()}`,
      phone: '0811111111',
      categories: 'U14'
    };
    officialsDatabase.push(foreignOfficial);

    try {
      const res = await withManagerDocument(request(app)
        .post('/api/team/officials/save')
        .set('Cookie', teamSessionCookies('FTM-001'))
        .set('X-Requested-With', 'XMLHttpRequest'), { id: foreignOfficial.id, name: 'พยายามแก้ข้ามทีม', position: 'ผู้จัดการทีม', id_card: 'FOREIGN-EDIT-01', phone: '0899999999', categories: ['U14'] });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('ไม่ได้เป็นของทีมที่เข้าสู่ระบบ');
      expect(foreignOfficial.name).toBe('เจ้าหน้าที่ทีมอื่นที่ห้ามแก้');
      expect(foreignOfficial.teamId).toBe('FTM-002');
    } finally {
      const index = officialsDatabase.indexOf(foreignOfficial);
      if (index !== -1) officialsDatabase.splice(index, 1);
    }
  });

  it('POST /api/team/officials/delete should ignore a query teamId and refuse another team\'s official', async () => {
    const foreignOfficial = {
      id: `OFF-DELETE-FOREIGN-${Date.now()}`,
      teamId: 'FTM-002',
      name: 'เจ้าหน้าที่ทีมอื่นที่ห้ามลบ',
      position: 'ผู้ช่วยผู้ฝึกสอน',
      idCard: `DEL-${Date.now()}`,
      phone: '0811111111',
      categories: 'U14'
    };
    officialsDatabase.push(foreignOfficial);

    try {
      const res = await request(app)
        .post('/api/team/officials/delete?teamId=FTM-002')
        .set('Cookie', teamSessionCookies('FTM-001'))
        .send({ id: foreignOfficial.id });

      expect(res.status).toBe(404);
      expect(foreignOfficial.teamId).toBe('FTM-002');
      expect(officialsDatabase).toContain(foreignOfficial);
    } finally {
      const index = officialsDatabase.indexOf(foreignOfficial);
      if (index !== -1) officialsDatabase.splice(index, 1);
    }
  });

  it('POST /api/team/officials/save should reject an update if ownership changes after the initial lookup', async () => {
    const ownedOfficial = {
      id: `OFF-RACE-${Date.now()}`,
      teamId: 'FTM-001',
      name: 'เจ้าหน้าที่ก่อนเกิด race',
      position: 'ผู้ช่วยผู้ฝึกสอน',
      idCard: `RACE-${Date.now()}`,
      phone: '0812222222',
      categories: 'U14'
    };
    officialsDatabase.push(ownedOfficial);
    const querySpy = jest.spyOn(pool, 'query').mockImplementation(async (sql: any) => ({
      rows: [],
      rowCount: String(sql).startsWith('UPDATE football_official') ? 0 : 1
    }) as any);

    try {
      const res = await request(app)
        .post('/api/team/officials/save')
        .set('Cookie', teamSessionCookies('FTM-001'))
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ id: ownedOfficial.id, name: 'แก้หลัง ownership เปลี่ยน', position: 'ผู้ช่วยผู้ฝึกสอน', id_card: ownedOfficial.idCard, phone: '0812222222', categories: ['U14'] });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('รายการนี้เปลี่ยนสังกัดแล้ว');
      expect(ownedOfficial.name).toBe('เจ้าหน้าที่ก่อนเกิด race');
      expect(querySpy).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $10 AND team_id = $11'),
        expect.arrayContaining([ownedOfficial.id, 'FTM-001'])
      );
    } finally {
      querySpy.mockRestore();
      const index = officialsDatabase.indexOf(ownedOfficial);
      if (index !== -1) officialsDatabase.splice(index, 1);
    }
  });

  it('POST /api/team/officials/save should surface database insert failures without adding a memory-only official', async () => {
    const name = 'เจ้าหน้าที่ทดสอบ database failure';
    const querySpy = jest.spyOn(pool, 'query').mockImplementation(async (sql: any) => {
      if (String(sql).startsWith('INSERT INTO football_official')) throw new Error('database insert failed');
      return { rows: [], rowCount: 0 } as any;
    });

    try {
      const res = await request(app)
        .post('/api/team/officials/save')
        .set('Cookie', teamSessionCookies('FTM-001'))
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name, position: 'ผู้ช่วยผู้ฝึกสอน', id_card: `DB-${Date.now()}`, phone: '0812345678', categories: ['U14'] });

      expect(res.status).toBe(500);
      expect(officialsDatabase.some((official: any) => official.name === name)).toBe(false);
    } finally {
      querySpy.mockRestore();
    }
  });

  it('POST /api/team/officials/save should create, edit, render, and delete official with Coach License successfully in full lifecycle test', async () => {
    // 1. CREATE Official with AFC C-Diploma
    const createRes = await request(app)
      .post('/api/team/officials/save')
      .set('Cookie', teamSessionCookies('FTM-001'))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        name: 'โค้ช สมศักดิ์ มีไลเซนส์',
        position: 'ผู้ฝึกสอน',
        id_card: '1100400088888',
        phone: '0888888888',
        email: 'coach.somsak@example.com',
        categories: ['U14', 'U16'],
        has_license: 'YES',
        license_type: 'AFC C-Diploma',
        license_serial: 'CERT-2026-998877'
      });

    expect(createRes.status).toBe(200);
    expect(createRes.body.success).toBe(true);

    // 2. GET /team/officials.php and verify License rendering
    const getRes = await request(app)
      .get('/team/officials.php')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001']);

    expect(getRes.status).toBe(200);
    expect(getRes.text).toContain('โค้ช สมศักดิ์ มีไลเซนส์');
    expect(getRes.text).toContain('AFC C-Diploma');
    expect(getRes.text).toContain('CERT-2026-998877');

    // Find created official ID from database
    const { officialsDatabase } = require('../src/app');
    const createdOfficial = officialsDatabase.find((o: any) => o.name === 'โค้ช สมศักดิ์ มีไลเซนส์');
    expect(createdOfficial).toBeDefined();
    expect(createdOfficial.hasLicense).toBe('YES');
    expect(createdOfficial.licenseType).toBe('AFC C-Diploma');
    expect(createdOfficial.licenseSerial).toBe('CERT-2026-998877');

    // 3. EDIT Official License to AFC B-Diploma
    const editRes = await request(app)
      .post('/api/team/officials/save')
      .set('Cookie', teamSessionCookies('FTM-001'))
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        id: createdOfficial.id,
        name: 'โค้ช สมศักดิ์ อัปเดตไลเซนส์',
        position: 'ผู้ฝึกสอน',
        id_card: '1100400088888',
        phone: '0888888888',
        categories: ['U14', 'U16', 'U18'],
        has_license: 'YES',
        license_type: 'AFC B-Diploma',
        license_serial: 'CERT-2026-998899'
      });

    expect(editRes.status).toBe(200);
    expect(editRes.body.success).toBe(true);

    expect(createdOfficial.name).toBe('โค้ช สมศักดิ์ อัปเดตไลเซนส์');
    expect(createdOfficial.licenseType).toBe('AFC B-Diploma');
    expect(createdOfficial.licenseSerial).toBe('CERT-2026-998899');

    // 4. DELETE Official
    const deleteRes = await request(app)
      .post('/api/team/officials/delete')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001'])
      .send({ id: createdOfficial.id });

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    const deletedOfficial = officialsDatabase.find((o: any) => o.id === createdOfficial.id);
    expect(deletedOfficial).toBeUndefined();
  });

  it('POST /api/team/officials/save should return 400 when 8 officials limit per category is reached', async () => {
    // Temporarily mock 8 officials for category U14 in team FTM-TEST-QUOTA
    const { officialsDatabase } = require('../src/app');
    const mockOfficials = [] as any[];
    for (let i = 1; i <= 8; i++) {
      mockOfficials.push({
        id: `OFF-MOCK-${i}`,
        teamId: 'FTM-TEST-QUOTA',
        name: `เจ้าหน้าที่ ${i}`,
        position: 'เจ้าหน้าที่ประจำทีม',
        idCard: `110000000000${i}`,
        phone: `081000000${i}`,
        categories: 'U14'
      });
    }
    officialsDatabase.push(...mockOfficials);

    try {
      const res = await withManagerDocument(request(app)
        .post('/api/team/officials/save')
        .set('Cookie', teamSessionCookies('FTM-TEST-QUOTA'))
        .set('X-Requested-With', 'XMLHttpRequest'), {
          name: 'นายเจ้าหน้าที่คนที่ 9',
          position: 'ผู้จัดการทีม',
          id_card: '1100400099999',
          phone: '0899999999',
          categories: ['U14']
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('ครบตามโควตาสูงสุดแล้ว (8/8 คน)');
    } finally {
      for (const fixture of mockOfficials) {
        const index = officialsDatabase.indexOf(fixture);
        if (index !== -1) officialsDatabase.splice(index, 1);
      }
    }
  });
});

// Valid synthetic uploads keep identity-focused tests independent of the manager-document guard.
function withManagerDocument(builder: any, fields: Record<string, unknown>) {
 for (const [name, value] of Object.entries(fields)) builder.field(name, String(value));
 return builder.attach('doc_id_card', Buffer.from('%PDF-1.4\nsynthetic document fixture\n%%EOF'), 'fixture.pdf');
}
