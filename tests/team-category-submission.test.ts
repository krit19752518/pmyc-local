jest.mock('../src/db', () => ({
  pool: {
    query: async (sql: string, values: any[] = []) => {
      const state = globalThis as any;
      const query = String(sql);
      const teamId = String(values?.[0] || '');
      if (query.includes('FROM football_player WHERE team_id = $1')) {
        return { rows: state.__persistedPlayers?.[teamId] || [], rowCount: (state.__persistedPlayers?.[teamId] || []).length };
      }
      if (query.includes('FROM football_registered_team WHERE id::text = $1 FOR UPDATE')) {
        const team = state.__persistedTeams?.[teamId];
        return { rows: team ? [team] : [], rowCount: team ? 1 : 0 };
      }
      if (query.includes('FROM football_player') && query.includes('team_id::text = $1')) {
        const rows = state.__persistedPlayers?.[teamId] || [];
        return { rows: rows.filter((player: any) => String(player.category).toUpperCase() === String(values?.[1]).toUpperCase()), rowCount: rows.length };
      }
      if (query.includes('FROM football_official') && query.includes('team_id::text = $1')) {
        const rows = state.__persistedOfficials?.[teamId] || [];
        return { rows: rows.filter((official: any) => String(official.categories).toUpperCase().split(',').includes(String(values?.[1]).toUpperCase())), rowCount: rows.length };
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
import { getOfficialForCategoryAndPosition, getTopOfficialForCategory, officialsDatabase } from '../src/models/official.model';

const testState = globalThis as any;
testState.__persistedPlayers ||= {};
testState.__persistedTeams ||= {};
testState.__persistedOfficials ||= {};
const dbPlayer = (player: any) => ({
  id: player.id, team_id: player.teamId, name: player.name, id_card: player.idCard,
  jersey_no: player.jerseyNo, category: player.category, doc_status: player.docStatus,
  remarks: player.remarks || '', position: player.position || ''
});

const initialTeamIds = new Set(teamsDatabase.map((team: any) => team.id));
const initialPlayerIds = new Set(playersDatabase.map((player: any) => player.id));
const originalTeamProfile = {
  ...teamProfile,
  categories: Array.isArray(teamProfile.categories) ? [...teamProfile.categories] : teamProfile.categories
};

function installTeamSignerFixtures(): () => void {
  const profileSnapshot = { ...teamProfile, categories: Array.isArray(teamProfile.categories) ? [...teamProfile.categories] : teamProfile.categories };
  const signerFixtures = [
    { id: 'OFF-TEST-SIGNER-001', teamId: 'FTM-001', categories: 'U14', position: 'เจ้าหน้าที่ประจำทีม', name: 'นางชื่อเจ้าหน้าที่', phone: '0800000001' },
    { id: 'OFF-TEST-SIGNER-002', teamId: 'FTM-001', categories: 'U14', position: 'ผู้ช่วยผู้ฝึกสอน', name: 'นายผู้ช่วยผู้ฝึกสอน', phone: '0800000002' },
    { id: 'OFF-TEST-SIGNER-003', teamId: 'FTM-001', categories: 'U14', position: 'ผู้ฝึกสอน', name: 'นางผู้ฝึกสอนหลัก', phone: '0800000003' },
    { id: 'OFF-TEST-SIGNER-004', teamId: 'FTM-001', categories: 'U14', position: 'ผู้จัดการทีม', name: 'นางผู้จัดการจากทะเบียนเจ้าหน้าที่', phone: '0800000004' }
  ];
  Object.assign(teamProfile, { categories: ['U14'], managerName: 'นายชื่อจากช่องผู้จัดการทีม', phone: '0800000000' });
  officialsDatabase.push(...signerFixtures);
  return () => {
    for (const fixture of signerFixtures) {
      const index = officialsDatabase.indexOf(fixture);
      if (index >= 0) officialsDatabase.splice(index, 1);
    }
    for (const key of Object.keys(teamProfile)) delete teamProfile[key];
    Object.assign(teamProfile, profileSnapshot);
  };
}

describe('UT-SUBMIT: Category Submission Lifecycle Tests', () => {
  beforeAll(() => {
    teamProfile.status = 'PENDING';
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
    cleanupTestUploadFiles();
    await pool.end();
  });

  test('UT-SUBMIT-LABELS-01: Submit page uses confirmation and registration form wording', async () => {
    const res = await request(app)
      .get('/team/submit.php')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001', 'team_user=admin']);

    expect(res.status).toBe(200);
    expect(res.text).toContain('ยืนยันรายชื่อ');
    expect(res.text).toContain('ยืนยันรายชื่อให้เจ้าหน้าที่ตรวจสอบ — รุ่น U14');
    expect(res.text).toContain('ดาวน์โหลดแบบฟอร์มใบลงทะเบียน');
    expect(res.text).toContain('id="teamDownloadAccordion"');
    expect(res.text).toContain('id="download-category-0"');
    expect(res.text).toContain('data-bs-target="#download-category-0"');
    expect(res.text).toContain('แบบฟอร์มดาวน์โหลด');
    expect(res.text).toContain('ใบลงทะเบียน จะเป็นใบสำหรับทีมพิมพ์ออกมาเพื่อที่จะเบิกงบ');
    expect(res.text).toContain('bi bi-trophy-fill text-warning me-1"></i> ใบลงทะเบียน จะเป็นใบสำหรับทีมพิมพ์ออกมาเพื่อที่จะเบิกงบ');
    expect(res.text).toContain('/api/team/export-registration-excel?category=U14');
    expect(res.text).toContain('ใบลงทะเบียน (Excel) - U14');
    expect(res.text).toContain('/api/team/export-registration-pdf?category=U14');
    expect(res.text).toContain('ใบลงทะเบียน (PDF) - U14');
    expect(res.text).not.toContain('ดาวน์โหลดแบบฟอร์มรายชื่อ');
  });

  test('UT-SUBMIT-REGISTRATION-EXCEL-01: Registration Excel contains the form heading, roster, and four signature roles in order', async () => {
    const restoreFixtures = installTeamSignerFixtures();
    try {
      const res = await request(app)
        .get('/api/team/export-registration-excel?category=U14')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001', 'team_user=admin'])
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body as Buffer);
      const sheet = workbook.getWorksheet('ใบสมัคร');
      expect(sheet.getCell('A1').value).toBe('ใบสมัคร');
      expect(sheet.getCell('A10').value).toBe('ลำดับ');
      expect(sheet.getCell('A45').value).toBe('ผู้ฝึกสอน');
      expect(sheet.getCell('D45').value).toBe('ผู้จัดการทีม');
      expect(sheet.getCell('A46').value).toBe('ชื่อ-นามสกุล: นางผู้ฝึกสอนหลัก');
      expect(sheet.getCell('A47').value).toBe('เบอร์โทรศัพท์: 0800000003');
      expect(sheet.getCell('D46').value).toBe('ชื่อ-นามสกุล: นางผู้จัดการจากทะเบียนเจ้าหน้าที่');
      expect(sheet.getCell('D47').value).toBe('เบอร์โทรศัพท์: 0800000004');
      expect(sheet.getCell('G45').value).toBe('ผู้รับผิดชอบ\nผู้ช่วยปฏิบัติงานโครงการฯ');
      expect(sheet.getCell('J45').value).toContain('ผู้อำนวยการสำนักงาน กกท.');
      expect(sheet.getCell('A46').value).not.toContain('ผู้ช่วยผู้ฝึกสอน');
      expect(sheet.getCell('D46').value).not.toContain('ชื่อจากช่องผู้จัดการทีม');
    } finally {
      restoreFixtures();
    }
  });

  test('UT-SUBMIT-O2-EXCEL-01: O-2 signature positions and names come from exact category-matched officials', async () => {
    const restoreFixtures = installTeamSignerFixtures();
    try {
      const res = await request(app)
        .get('/api/team/export-o2-excel?category=U14')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001', 'team_user=admin'])
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body as Buffer);
      const sheet = workbook.getWorksheet('รายชื่อทีม (O-2)');
      expect(sheet.getCell('D42').value).toBe('ผู้จัดการทีม');
      expect(sheet.getCell('D43').value).toBe('นางผู้จัดการจากทะเบียนเจ้าหน้าที่');
      expect(sheet.getCell('H42').value).toBe('ผู้ฝึกสอน');
      expect(sheet.getCell('H43').value).toBe('นางผู้ฝึกสอนหลัก');
      expect(sheet.getCell('H43').value).not.toContain('ผู้ช่วยผู้ฝึกสอน');
    } finally {
      restoreFixtures();
    }
  });

  test('UT-SUBMIT-REGISTRATION-PDF-01: Registration PDF is generated with the embedded Thai font', async () => {
    const restoreFixtures = installTeamSignerFixtures();
    const PDFDocument = require('pdfkit');
    const originalText = PDFDocument.prototype.text;
    const renderedText: string[] = [];
    const textSpy = jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (this: any, ...args: any[]) {
      renderedText.push(String(args[0]));
      return originalText.apply(this, args);
    } as any);
    try {
      const res = await request(app)
        .get('/api/team/export-registration-pdf?category=U14')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001', 'team_user=admin'])
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      const pdf = (res.body as Buffer).toString('latin1');
      expect(pdf.slice(0, 5)).toBe('%PDF-');
      expect(pdf).toContain('/FontFile2');
      expect(pdf).toContain('Garuda');
      expect(renderedText).toContain('ชื่อ-นามสกุล นางผู้ฝึกสอนหลัก');
      expect(renderedText).toContain('ชื่อ-นามสกุล นางผู้จัดการจากทะเบียนเจ้าหน้าที่');
      expect(renderedText).not.toContain('นายชื่อจากช่องผู้จัดการทีม');
    } finally {
      textSpy.mockRestore();
      restoreFixtures();
    }
  });

  test('UT-SUBMIT-O2-PDF-02: signer uses the highest-priority official in the selected category', () => {
    const manager = { position: 'ผู้จัดการทีม', categories: 'U14', name: 'ผู้จัดการทดสอบ', phone: '0800000001' };
    const teamOfficer = { position: 'เจ้าหน้าที่ประจำทีม', categories: 'U14', name: 'เจ้าหน้าที่ทดสอบ', phone: '0800000002' };
    const coach = { position: 'ผู้ฝึกสอน', categories: 'U16', name: 'โค้ชทดสอบ', phone: '0800000003' };

    expect(getTopOfficialForCategory([teamOfficer, coach, manager], 'U14')).toBe(manager);
    expect(getTopOfficialForCategory([teamOfficer, coach, manager], 'U16')).toBe(coach);
  });

  test('UT-SUBMIT-O2-PDF-03: O-2 uses the selected official position and registration PDF does not mislabel an assistant coach', async () => {
    const team = { id: 'FTM-001', teamName: 'ทีมทดสอบตำแหน่ง U18', categories: 'U18' };
    const assistantCoach = {
      id: 'OFF-TEST-PDF-U18', teamId: 'FTM-001', categories: 'U18',
      position: 'ผู้ช่วยผู้ฝึกสอน', name: 'เจ้าหน้าที่ทดสอบ U18', phone: '0810338112'
    };
    const PDFDocument = require('pdfkit');
    const originalText = PDFDocument.prototype.text;
    const renderedText: string[] = [];
    const textSpy = jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (this: any, ...args: any[]) {
      renderedText.push(String(args[0]));
      return originalText.apply(this, args);
    } as any);

    teamsDatabase.push(team);
    officialsDatabase.push(assistantCoach);
    try {
      const res = await request(app)
        .get('/api/team/export-o2-pdf?category=U18')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001', 'team_user=admin'])
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(renderedText).toContain('ผู้ช่วยผู้ฝึกสอน');
      expect(renderedText).toContain('นายเจ้าหน้าที่ทดสอบ U18');
      expect(renderedText).not.toContain('ผู้ฝึกสอน');

      renderedText.length = 0;
      const registrationRes = await request(app)
        .get('/api/team/export-registration-pdf?category=U18')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001', 'team_user=admin'])
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(registrationRes.status).toBe(200);
      expect(renderedText).not.toContain('ผู้ฝึกสอน');
      expect(renderedText).not.toContain('ผู้ช่วยผู้ฝึกสอน');
    } finally {
      textSpy.mockRestore();
      teamsDatabase.splice(teamsDatabase.indexOf(team), 1);
      officialsDatabase.splice(officialsDatabase.indexOf(assistantCoach), 1);
    }
  });

  test('UT-SUBMIT-REGISTRATION-PDF-03: team signer roles in registration PDF are read from category-matched officials', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.resolve(__dirname, '../src/routes/team/teamRoster.router.ts'), 'utf8');
    const blockStart = source.indexOf("router.get('/api/team/export-registration-pdf'");
    const blockEnd = source.indexOf("router.get('/team/submit.php'", blockStart);
    const pdfRoute = source.slice(blockStart, blockEnd);

    expect(blockStart).toBeGreaterThanOrEqual(0);
    expect(pdfRoute).toContain("getOfficialForCategoryAndPosition(officials, selectedCategory, 'ผู้ฝึกสอน')");
    expect(pdfRoute).toContain("getOfficialForCategoryAndPosition(officials, selectedCategory, 'ผู้จัดการทีม')");
    expect(pdfRoute).toContain("{ role: coach?.position || '', name: coach?.name || '', phone: coach?.phone || '' }");
    expect(pdfRoute).toContain("{ role: manager?.position || '', name: manager?.name || '', phone: manager?.phone || '' }");
    expect(pdfRoute).not.toContain("role: 'ผู้จัดการทีม', name: profile.managerName");
  });

  test('UT-SUBMIT-SAMPLE-DOWNLOADS-01: sample Excel and PDF resolve from the Football package document directory', async () => {
    const cookie = ['team_logged_in=true', 'team_id=FTM-001', 'team_user=admin'];
    const excel = await request(app)
      .get('/api/team/download-sample-excel')
      .set('Cookie', cookie)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    const pdf = await request(app)
      .get('/api/team/download-sample-pdf')
      .set('Cookie', cookie)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(excel.status).toBe(200);
    expect(excel.headers['content-type']).toContain('spreadsheetml');
    expect((excel.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('UT-SUBMIT-HELPER-01: official selection matches exact position and age category', () => {
    const assistant = { position: 'ผู้ช่วยผู้ฝึกสอน', categories: 'U14', name: 'ผู้ช่วย' };
    const coach = { position: 'ผู้ฝึกสอน', categories: 'U16,U18', name: 'ผู้ฝึกสอนหลัก' };
    expect(getOfficialForCategoryAndPosition([assistant, coach], 'u16', 'ผู้ฝึกสอน')).toBe(coach);
    expect(getOfficialForCategoryAndPosition([assistant, coach], 'U14', 'ผู้ฝึกสอน')).toBeNull();
    expect(getOfficialForCategoryAndPosition([assistant, coach], 'U14', 'ผู้ช่วยผู้ฝึกสอน')).toBe(assistant);
  });

  test('UT-SUBMIT-PDF-01: Generated O-2 PDF embeds the Thai Garuda font', async () => {
    const res = await request(app)
      .get('/api/team/export-o2-pdf?category=U14')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001', 'team_user=admin'])
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((res.body as Buffer).toString('latin1')).toContain('/FontFile2');
    expect((res.body as Buffer).toString('latin1')).toContain('Garuda');
  });

  test('UT-SUBMIT-PDF-02: O-2 signature block contains only the right-aligned coach box', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.resolve(__dirname, '../src/routes/team/teamRoster.router.ts'), 'utf8');
    const blockStart = source.indexOf('// 4. Coach signature block');
    const blockEnd = source.indexOf('doc.end();', blockStart);
    const signatureBlock = source.slice(blockStart, blockEnd);

    expect(blockStart).toBeGreaterThanOrEqual(0);
    expect(signatureBlock).toContain('const coachBoxX = startX + totalSigWidth - singleBoxWidth;');
    expect(signatureBlock.match(/doc\.rect\(coachBoxX/g)).toHaveLength(2);
    expect(signatureBlock).toContain("text(categoryOfficial?.position || ''");
    expect(signatureBlock).not.toContain('ผู้อำนวยการสำนักงาน');
    expect(signatureBlock).not.toContain('ผู้จัดการทีม');
  });

  test('UT-SUBMIT-03: shows "รับรองแล้ว" only when team and every submitted-category player are approved', async () => {
    const { teamsDatabase, playersDatabase } = require('../src/app');
    const teamId = 'FTM-TEST-SUBMIT-03';
    const team = {
      id: teamId,
      teamName: 'ทีมทดสอบอนุมัติรับรอง',
      province: 'เชียงใหม่',
      managerName: 'โค้ชทดสอบ 03',
      phone: '0891114444',
      categories: 'U14',
      username: 'test_submit_user_03',
      status: 'PENDING',
      submitted_categories: 'U14'
    };
    teamsDatabase.push(team);
    playersDatabase.push({
      id: 'PLY-TEST-SUBMIT-03', teamId, name: 'นักกีฬาทดสอบ อนุมัติแล้ว',
      idCard: '1100400099901', jerseyNo: 1, category: 'U14', docStatus: 'APPROVED'
    });
    testState.__persistedTeams[teamId] = { id: teamId, categories: 'U14', submitted_categories: '', cancelled_categories: '', status: 'PENDING', is_deleted: false };
    const completeRoster = Array.from({ length: 18 }, (_, index) => ({
      id: `PLY-TEST-SUBMIT-03-${index + 1}`, team_id: teamId, name: `นักกีฬาทดสอบ ${index + 1}`,
      id_card: String(1100400099900 + index), jersey_no: index + 1, category: 'U14', doc_status: 'APPROVED',
      position: index < 3 ? 'ผู้รักษาประตู (GK)' : 'กองหลัง (DF)'
    }));
    testState.__persistedPlayers[teamId] = completeRoster;
    testState.__persistedOfficials[teamId] = [{ id: 'OFF-TEST-SUBMIT-03', id_card: '1100400099999', categories: 'U14' }];
    const submissionAuditSpy = jest.spyOn(pool, 'query');

    try {
      const submitRes = await request(app)
        .post('/api/team/submit')
        .set('Accept', 'application/json')
        .set('Cookie', [`team_logged_in=true`, `team_id=${teamId}`, 'team_user=test_submit_user_03', `team_session=${encodeURIComponent(createTeamSessionToken(teamId, 'test_submit_user_03'))}`])
        .send({ category: 'U14' });
      expect(submitRes.status).toBe(200);
      expect(team.submitted_categories).toBe('U14');
      const submitAuditCall = submissionAuditSpy.mock.calls.find(([sql, values]: any[]) =>
        String(sql).includes('INSERT INTO football_audit_log') && values?.[0] === 'TEAM_ROSTER_SUBMITTED'
      );
      expect(submitAuditCall).toBeDefined();
      expect(submitAuditCall?.[1]?.[2]).toBe('test_submit_user_03');
      expect(submitAuditCall?.[1]?.[6]).toBe(teamId);
      expect(JSON.parse(String(submitAuditCall?.[1]?.[10])).submittedCategories).toEqual(['U14']);
      expect(JSON.parse(String(submitAuditCall?.[1]?.[11]))).toMatchObject({ category: 'U14', playerCount: '18', officialCount: '1' });

      const approveRes = await request(app)
        .post('/api/admin/teams/update-status')
        .set('Accept', 'application/json')
        .set('Cookie', ['admin_session=true', 'admin_user=admin'])
        .send({ id: teamId, status: 'APPROVED' });
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.success).toBe(true);
      expect(team.status).toBe('APPROVED');

      const viewRes = await request(app)
        .get('/team/submit.php')
        .set('Cookie', [`team_logged_in=true`, `team_id=${teamId}`, 'team_user=test_submit_user_03']);
      expect(viewRes.status).toBe(200);
      expect(viewRes.text).toContain('รับรองแล้ว (นักกีฬาอนุมัติครบทุกคน)');
      expect(viewRes.text).toContain('นักกีฬาได้รับอนุมัติครบทุกคน');
      expect(viewRes.text).not.toContain('ผ่านการรับรองจากเจ้าหน้าที่เรียบร้อยแล้ว');
    } finally {
      submissionAuditSpy.mockRestore();
      const teamIndex = teamsDatabase.findIndex((item: any) => item.id === teamId);
      if (teamIndex !== -1) teamsDatabase.splice(teamIndex, 1);
      const playerIndex = playersDatabase.findIndex((item: any) => item.id === 'PLY-TEST-SUBMIT-03');
      if (playerIndex !== -1) playersDatabase.splice(playerIndex, 1);
      delete testState.__persistedTeams[teamId];
      delete testState.__persistedPlayers[teamId];
      delete testState.__persistedOfficials[teamId];
    }
  });

  test('UT-SUBMIT-DB-01: rejects a roster that exists only in process memory', async () => {
    const teamId = 'FTM-TEST-SUBMIT-MEMORY-ONLY';
    const team = { id: teamId, teamName: 'ทีมทดสอบข้อมูลในหน่วยความจำ', categories: 'U16', submitted_categories: '', status: 'PENDING' };
    teamsDatabase.push(team);
    playersDatabase.push({ id: 'PLY-MEMORY-ONLY', teamId, name: 'นักกีฬาที่ยังไม่บันทึก', idCard: '1100400099911', jerseyNo: 1, category: 'U16', docStatus: 'PENDING' });
    testState.__persistedTeams[teamId] = { id: teamId, categories: 'U16', submitted_categories: '', cancelled_categories: '', status: 'PENDING', is_deleted: false };
    testState.__persistedPlayers[teamId] = [];
    testState.__persistedOfficials[teamId] = [{ id: 'OFF-MEMORY-ONLY', id_card: '1100400099912', categories: 'U16' }];
    try {
      const response = await request(app)
        .post('/api/team/submit')
        .set('Accept', 'application/json')
        .set('Cookie', [`team_logged_in=true`, `team_id=${teamId}`, 'team_user=memory-only-test'])
        .send({ category: 'U16' });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(team.submitted_categories).toBe('');
    } finally {
      delete testState.__persistedTeams[teamId];
      delete testState.__persistedPlayers[teamId];
      delete testState.__persistedOfficials[teamId];
      teamsDatabase.splice(teamsDatabase.indexOf(team), 1);
      const index = playersDatabase.findIndex((player: any) => player.id === 'PLY-MEMORY-ONLY');
      if (index >= 0) playersDatabase.splice(index, 1);
    }
  });

  test('UT-SUBMIT-GK-01: rejects category submission when fewer than three persisted goalkeepers are registered', async () => {
    const teamId = 'FTM-TEST-SUBMIT-GK-01';
    const team = { id: teamId, teamName: 'ทีมทดสอบผู้รักษาประตูไม่ครบ', categories: 'U14', submitted_categories: '', status: 'PENDING' };
    teamsDatabase.push(team);
    testState.__persistedTeams[teamId] = { id: teamId, categories: 'U14', submitted_categories: '', cancelled_categories: '', status: 'PENDING', is_deleted: false };
    testState.__persistedPlayers[teamId] = Array.from({ length: 18 }, (_, index) => ({
      id: `PLY-TEST-SUBMIT-GK-01-${index + 1}`, team_id: teamId, id_card: String(1100400080000 + index),
      jersey_no: index + 1, category: 'U14', position: index < 2 ? 'ผู้รักษาประตู (GK)' : 'กองหลัง (DF)'
    }));
    testState.__persistedOfficials[teamId] = [{ id: 'OFF-TEST-SUBMIT-GK-01', id_card: '1100400089999', categories: 'U14' }];

    try {
      const response = await request(app)
        .post('/api/team/submit')
        .set('Accept', 'application/json')
        .set('Cookie', [`team_logged_in=true`, `team_id=${teamId}`, 'team_user=test_submit_gk_01', `team_session=${encodeURIComponent(createTeamSessionToken(teamId, 'test_submit_gk_01'))}`])
        .send({ category: 'U14' });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(team.submitted_categories).toBe('');
    } finally {
      delete testState.__persistedTeams[teamId];
      delete testState.__persistedPlayers[teamId];
      delete testState.__persistedOfficials[teamId];
      const index = teamsDatabase.indexOf(team);
      if (index >= 0) teamsDatabase.splice(index, 1);
    }
  });

  test('UT-SUBMIT-GK-02: goalkeeper warning counts persisted players by age category', async () => {
    const teamId = 'FTM-TEST-SUBMIT-GK-02';
    const team = { id: teamId, teamName: 'ทีมทดสอบจำนวนผู้รักษาประตู', categories: 'U14', submitted_categories: '', status: 'PENDING' };
    const cachedPlayers = Array.from({ length: 3 }, (_, index) => ({
      id: `PLY-TEST-SUBMIT-GK-02-CACHE-${index + 1}`, teamId, name: `ผู้รักษาประตูใน cache ${index + 1}`,
      idCard: `11004000799${String(index + 1).padStart(2, '0')}`, jerseyNo: index + 1, category: 'U14',
      position: 'ผู้รักษาประตู (GK)', docStatus: 'PENDING'
    }));
    teamsDatabase.push(team);
    playersDatabase.push(...cachedPlayers);
    testState.__persistedTeams[teamId] = { id: teamId, categories: 'U14', submitted_categories: '', cancelled_categories: '', status: 'PENDING', is_deleted: false };
    testState.__persistedPlayers[teamId] = cachedPlayers.slice(0, 2).map(dbPlayer);

    try {
      const response = await request(app)
        .get('/team/players.php')
        .set('Cookie', [`team_logged_in=true`, `team_id=${teamId}`, 'team_user=test_submit_gk_02', `team_session=${encodeURIComponent(createTeamSessionToken(teamId, 'test_submit_gk_02'))}`]);
      expect(response.status).toBe(200);
      expect(response.text).toContain('จำนวนผู้รักษาประตู — รุ่น U14 (อย่างน้อย 3 คน)');
      expect(response.text).toContain('มีผู้รักษาประตูรุ่น U14 แล้ว <strong>2 คน</strong>');
      expect(response.text).toContain('<strong class="text-danger">1 คน</strong>');
    } finally {
      const teamIndex = teamsDatabase.indexOf(team);
      if (teamIndex >= 0) teamsDatabase.splice(teamIndex, 1);
      for (const cachedPlayer of cachedPlayers) {
        const playerIndex = playersDatabase.indexOf(cachedPlayer);
        if (playerIndex >= 0) playersDatabase.splice(playerIndex, 1);
      }
      delete testState.__persistedTeams[teamId];
      delete testState.__persistedPlayers[teamId];
      delete testState.__persistedOfficials[teamId];
    }
  });

  test('UT-SUBMIT-06: approved team shows approved and waiting player counts until all players are approved', async () => {
    const { teamsDatabase, playersDatabase } = require('../src/app');
    const teamId = 'FTM-TEST-SUBMIT-06';
    teamsDatabase.push({ id: teamId, teamName: 'ทีมทดสอบรอตรวจ', province: 'เชียงใหม่', managerName: 'ผู้จัดการทดสอบ', phone: '0891116666', categories: 'U14', username: 'test_submit_user_06', status: 'APPROVED', submitted_categories: 'U14' });
    playersDatabase.push(
      { id: 'PLY-TEST-SUBMIT-06A', teamId, name: 'นักกีฬาอนุมัติ', idCard: '1100400099906', jerseyNo: 1, category: 'U14', docStatus: 'APPROVED' },
      { id: 'PLY-TEST-SUBMIT-06B', teamId, name: 'นักกีฬารอหนึ่ง', idCard: '1100400099907', jerseyNo: 2, category: 'U14', docStatus: 'PENDING' },
      { id: 'PLY-TEST-SUBMIT-06C', teamId, name: 'นักกีฬารอสอง', idCard: '1100400099908', jerseyNo: 3, category: 'U14', docStatus: 'PENDING' }
    );
    testState.__persistedPlayers[teamId] = playersDatabase.filter((player: any) => player.teamId === teamId).map(dbPlayer);
    try {
      const viewRes = await request(app).get('/team/submit.php').set('Cookie', [`team_logged_in=true`, `team_id=${teamId}`, 'team_user=test_submit_user_06']);
      expect(viewRes.status).toBe(200);
      expect(viewRes.text).toContain('ผ่านการอนุมัติทีม รอการตรวจสอบนักกีฬา');
      expect(viewRes.text).toContain('อนุมัติ 1 คน รอตรวจสอบ 2 คน');
      expect(viewRes.text).not.toContain('รับรองแล้ว (นักกีฬาอนุมัติครบทุกคน)');
    } finally {
      const teamIndex = teamsDatabase.findIndex((item: any) => item.id === teamId);
      if (teamIndex !== -1) teamsDatabase.splice(teamIndex, 1);
      for (const id of ['PLY-TEST-SUBMIT-06A', 'PLY-TEST-SUBMIT-06B', 'PLY-TEST-SUBMIT-06C']) {
        const playerIndex = playersDatabase.findIndex((item: any) => item.id === id);
        if (playerIndex !== -1) playersDatabase.splice(playerIndex, 1);
      }
      delete testState.__persistedPlayers[teamId];
    }
  });

  test('UT-SUBMIT-07: approved team lists athletes requiring corrections and shows correction wording', async () => {
    const { teamsDatabase, playersDatabase } = require('../src/app');
    const teamId = 'FTM-TEST-SUBMIT-07';
    teamsDatabase.push({ id: teamId, teamName: 'ทีมทดสอบปรับแก้', province: 'เชียงใหม่', managerName: 'ผู้จัดการทดสอบ', phone: '0891117777', categories: 'U14', username: 'test_submit_user_07', status: 'APPROVED', submitted_categories: 'U14' });
    playersDatabase.push(
      { id: 'PLY-TEST-SUBMIT-07A', teamId, name: 'นักกีฬาอนุมัติ', idCard: '1100400099909', jerseyNo: 1, category: 'U14', docStatus: 'APPROVED' },
      { id: 'PLY-TEST-SUBMIT-07B', teamId, name: 'เด็กชาย ทดสอบ ปรับแก้', idCard: '1100400099910', jerseyNo: 2, category: 'U14', docStatus: 'ACTION_REQUIRED', remarks: 'กรุณาแนบเอกสารให้ชัดเจน' }
    );
    testState.__persistedPlayers[teamId] = playersDatabase.filter((player: any) => player.teamId === teamId).map(dbPlayer);
    try {
      const viewRes = await request(app).get('/team/submit.php').set('Cookie', [`team_logged_in=true`, `team_id=${teamId}`, 'team_user=test_submit_user_07']);
      expect(viewRes.status).toBe(200);
      expect(viewRes.text).toContain('<strong class="d-block text-dark">ปรับแก้ข้อมูลนักกีฬาเพิ่มเติม</strong>');
      expect(viewRes.text).toContain('href="/team/player-edit.php?id=PLY-TEST-SUBMIT-07B&amp;returnCategory=U14"');
      expect(viewRes.text).toContain('เด็กชาย ทดสอบ ปรับแก้</a> สาเหตุการแจ้งปรับแก้ข้อมูล กรุณาแนบเอกสารให้ชัดเจน');
      expect(viewRes.text).toContain('ผ่านการอนุมัติทีม มีปรับแก้ข้อมูลนักกีฬา');
      expect(viewRes.text).not.toContain('รับรองแล้ว (นักกีฬาอนุมัติครบทุกคน)');
    } finally {
      const teamIndex = teamsDatabase.findIndex((item: any) => item.id === teamId);
      if (teamIndex !== -1) teamsDatabase.splice(teamIndex, 1);
      for (const id of ['PLY-TEST-SUBMIT-07A', 'PLY-TEST-SUBMIT-07B']) {
        const playerIndex = playersDatabase.findIndex((item: any) => item.id === id);
        if (playerIndex !== -1) playersDatabase.splice(playerIndex, 1);
      }
      delete testState.__persistedPlayers[teamId];
    }
  });

  test('UT-SUBMIT-04: GET /team/submit.php counts players with comma-separated categories (e.g. U14,U18) correctly', async () => {
    const { playersDatabase, teamsDatabase } = require('../src/app');
    teamsDatabase.push({
      id: 'FTM-TEST-SUBMIT-01',
      teamName: 'ทีมทดสอบส่งรายชื่อหลายรุ่น',
      province: 'เชียงใหม่',
      managerName: 'โค้ชทดสอบ',
      phone: '0891112222',
      categories: 'U14,U18',
      username: 'test_submit_user',
      status: 'PENDING'
    });
    playersDatabase.push({
      id: 'PLY-TEST-MULTICAT-99',
      teamId: 'FTM-TEST-SUBMIT-01',
      name: 'นายทดสอบ เล่นหลายรุ่น',
      idCard: '1100400099999',
      category: 'U14,U18',
      jerseyNo: 99,
      position: 'กองหน้า (FW)',
      docStatus: 'PENDING'
    });
    testState.__persistedPlayers['FTM-TEST-SUBMIT-01'] = [dbPlayer(playersDatabase[playersDatabase.length - 1])];

    const res = await request(app)
      .get('/team/submit.php')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST-SUBMIT-01']);

    expect(res.status).toBe(200);
    expect(res.text).toContain('ปัจจุบัน 1 คน');

    // Cleanup
    const pIdx = playersDatabase.findIndex((p: any) => p.id === 'PLY-TEST-MULTICAT-99');
    if (pIdx !== -1) playersDatabase.splice(pIdx, 1);
    delete testState.__persistedPlayers['FTM-TEST-SUBMIT-01'];
    const tIdx = teamsDatabase.findIndex((t: any) => t.id === 'FTM-TEST-SUBMIT-01');
    if (tIdx !== -1) teamsDatabase.splice(tIdx, 1);
  });

  test('UT-SUBMIT-05: Submitting category U14 should NOT mark unsubmitted category U18 as submitted on GET /team/submit.php', async () => {
    const { teamsDatabase } = require('../src/app');
    const testTeam = {
      id: 'FTM-TEST-SUBMIT-SCOPING',
      teamName: 'ทีมทดสอบส่งรายชื่อแยกตามรุ่น',
      province: 'เชียงใหม่',
      managerName: 'โค้ชทดสอบสโคป',
      phone: '0891113333',
      categories: 'U14,U18',
      submitted_categories: 'U14',
      username: 'test_scoping_user',
      status: 'PENDING'
    };
    teamsDatabase.push(testTeam);

    const res = await request(app)
      .get('/team/submit.php')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST-SUBMIT-SCOPING']);

    expect(res.status).toBe(200);
    expect(res.text).toContain('ยื่นส่งรายชื่อเรียบร้อยแล้ว — รุ่น U14');
    expect(res.text).not.toContain('ยื่นส่งรายชื่อเรียบร้อยแล้ว — รุ่น U18');
    expect(res.text).toContain('ตรวจสอบความพร้อมก่อนส่ง — รุ่น U18');

    // Cleanup
    const idx = teamsDatabase.findIndex((t: any) => t.id === 'FTM-TEST-SUBMIT-SCOPING');
    if (idx !== -1) teamsDatabase.splice(idx, 1);
  });
});
