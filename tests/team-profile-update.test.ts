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
import { app, teamsDatabase } from '../src/app';
import { teamProfile } from '../src/models/team.model';
import { pool } from '../src/db';

describe('POST /api/team/team-update Tests', () => {
  beforeAll(() => {
    teamProfile.status = 'PENDING';
    teamProfile.submitted_categories = '';
    teamProfile.submittedCategories = '';
  });

  afterAll(() => {
    cleanupTestUploadFiles();
    return pool.end();
  });

  const withExistingTeamRow = async (teamRow: any, run: (queries: Array<{ sql: string; values: any[] }>) => Promise<void>) => {
    const originalQuery = pool.query;
    const queries: Array<{ sql: string; values: any[] }> = [];
    (pool as any).query = async (sql: string, values: any[] = []) => {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      queries.push({ sql: normalizedSql, values });

      if (normalizedSql.startsWith('SELECT * FROM football_registered_team WHERE id::text = $1')) {
        return { rows: String(values[0]) === String(teamRow.id) ? [teamRow] : [], rowCount: 1 };
      }
      if (normalizedSql.startsWith('SELECT id, team_name FROM football_registered_team')) {
        return { rows: [{ id: teamRow.id, team_name: teamRow.team_name }], rowCount: 1 };
      }
      if (normalizedSql.startsWith('UPDATE football_registered_team SET')) {
        const columns = [
          'team_name', 'school_code', 'province', 'bkk_zone', 'district', 'gender',
          'manager_name', 'email', 'phone', 'line_id', 'house_no', 'road', 'subdistrict',
          'contact_district', 'contact_province', 'contact_subdistrict'
        ];
        columns.forEach((column, index) => { teamRow[column] = values[index]; });
        if (teamRow.status === 'REJECTED') {
          teamRow.status = 'PENDING';
          teamRow.reject_reason = '';
        }
        if (values[16]) teamRow.doc_team_cert = values[16];
        if (values[17]) teamRow.doc_roster = values[17];
        expect(values[18]).toBe(teamRow.id);
        return { rows: [{ id: teamRow.id, status: teamRow.status, reject_reason: teamRow.reject_reason, categories: teamRow.categories }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    };

    try {
      await run(queries);
    } finally {
      (pool as any).query = originalQuery;
    }
  };

  const createTeamRow = (id: string, docs = true) => ({
    id,
    team_name: 'ทีมทดสอบเดิม',
    school_code: 'TEST-01',
    province: 'เชียงใหม่',
    bkk_zone: null,
    district: 'แม่ริม',
    gender: 'boy',
    categories: 'U18',
    manager_name: 'ผู้ประสานงานทดสอบ',
    email: 'team-update-test@example.invalid',
    phone: '0800000000',
    line_id: 'team-update-test',
    house_no: '',
    road: '',
    subdistrict: '',
    contact_district: '',
    contact_subdistrict: '',
    contact_province: '',
    doc_team_cert: docs ? '/uploads/existing-cert.pdf' : null,
    doc_roster: docs ? '/uploads/existing-roster.pdf' : null,
    status: 'PENDING',
    reject_reason: ''
  });

  it('POST /api/team/team-update should return 400 when email or line_id is missing', async () => {
    await withExistingTeamRow(createTeamRow('FTM-UPDATE-MISSING-CONTACT'), async (queries) => {
      const updateRes = await request(app)
        .post('/api/team/team-update')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-UPDATE-MISSING-CONTACT', 'team_user=admin'])
        .set('Accept', 'application/json')
        .set('X-Requested-With', 'XMLHttpRequest')
        .field('school', 'โรงเรียนกีฬาเชียงใหม่')
        .field('province', 'เชียงใหม่')
        .field('managerName', 'อาจารย์ สุธีร์ มีสุข')
        .field('phone', '0891112233')
        .field('email', '')
        .field('line_id', '')
        .attach('doc_team_cert', Buffer.from('fake-team-cert-content'), 'team_cert.pdf')
        .attach('doc_roster', Buffer.from('fake-roster-content'), 'roster.pdf');

      expect(updateRes.status).toBe(400);
      expect(updateRes.body.success).toBe(false);
      expect(updateRes.body.error).toContain('กรุณากรอกข้อมูล อีเมล และ LINE ID ให้ครบถ้วน');
      expect(queries.some(query => query.sql.startsWith('UPDATE football_registered_team SET'))).toBe(false);
    });
  });

  it('POST /api/team/team-update should allow saving when optional team documents are missing', async () => {
    const teamRow = createTeamRow('FTM-UPDATE-MISSING-DOCS', false);
    await withExistingTeamRow(teamRow, async (queries) => {
      const updateRes = await request(app)
        .post('/api/team/team-update')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-UPDATE-MISSING-DOCS', 'team_user=new_team_user'])
        .set('Accept', 'application/json')
        .set('X-Requested-With', 'XMLHttpRequest')
        .field('school', 'โรงเรียนกีฬาเชียงใหม่')
        .field('province', 'เชียงใหม่')
        .field('managerName', 'อาจารย์ สุธีร์ มีสุข')
        .field('phone', '0891112233')
        .field('email', 'team-update-test@example.invalid')
        .field('line_id', 'team-update-test');

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.success).toBe(true);
      expect(queries.filter(query => query.sql.startsWith('UPDATE football_registered_team SET'))).toHaveLength(1);
      expect(queries.some(query => query.sql.startsWith('INSERT INTO football_registered_team'))).toBe(false);
      expect(teamRow.doc_team_cert).toBeNull();
      expect(teamRow.doc_roster).toBeNull();
    });
  });

  it('POST /api/team/team-update should update team profile and documents successfully and display updated info on GET /team/team.php', async () => {
    const teamRow = createTeamRow('FTM-001');
    await withExistingTeamRow(teamRow, async (queries) => {
    const updateRes = await request(app)
      .post('/api/team/team-update')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001', 'team_user=admin'])
      .field('school', 'โรงเรียนกีฬาเชียงใหม่')
      .field('school_code', '5001234')
      .field('province', 'เชียงใหม่')
      .field('district', 'เมืองเชียงใหม่')
      .field('subdistrict', 'แม่ริม')
      .field('managerName', 'อาจารย์ สุธีร์ มีสุข')
      .field('email', 'suthee@chiangmai.ac.th')
      .field('phone', '0891112233')
      .field('line_id', 'coach_suthee')
      .field('contact_province', 'เชียงใหม่')
      .field('contact_district', 'เมืองเชียงใหม่')
      .field('contact_subdistrict', 'ช้างเผือก')
      .attach('doc_team_cert', Buffer.from('fake-team-cert-content'), 'team_cert.pdf')
      .attach('doc_roster', Buffer.from('fake-roster-content'), 'roster.pdf');

    expect(updateRes.status).toBe(200);
    expect(teamRow.status).toBe('PENDING');
    expect(teamRow.team_name).toBe('โรงเรียนกีฬาเชียงใหม่');
    expect(teamRow.contact_province).toBe('เชียงใหม่');
    expect(teamRow.contact_district).toBe('เมืองเชียงใหม่');
    expect(teamRow.subdistrict).toBe('แม่ริม');
    expect(teamRow.contact_subdistrict).toBe('ช้างเผือก');
    expect(queries.filter(query => query.sql.startsWith('UPDATE football_registered_team SET'))).toHaveLength(1);
    expect(queries.some(query => query.sql.startsWith('INSERT INTO football_registered_team'))).toBe(false);

    const getRes = await request(app)
      .get('/team/team.php')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-001', 'team_user=admin']);

    expect(getRes.status).toBe(200);
    expect(getRes.text).toContain('โรงเรียนกีฬาเชียงใหม่');
    expect(getRes.text).toContain('อาจารย์ สุธีร์ มีสุข');
    expect(getRes.text).toContain('เชียงใหม่');
    expect(getRes.text).toContain('name="doc_team_cert"');
    expect(getRes.text).not.toContain('doc_roster');
    expect(getRes.text).not.toContain('ใบรายชื่อนักกีฬา');
    expect(getRes.text).not.toContain('id="team_cat_u14"');
    expect(getRes.text).toContain('id="team_update_form"');
    expect(getRes.text).toContain('disabled');
    expect(getRes.text.indexOf('name="contact_province"')).toBeLessThan(getRes.text.indexOf('name="contact_district"'));
    expect(getRes.text.indexOf('name="contact_district"')).toBeLessThan(getRes.text.indexOf('name="contact_subdistrict"'));
    const getContactSelect = (name: string) => getRes.text.match(new RegExp(`<select name="${name}"[^>]*>[\\s\\S]*?<\\/select>`))?.[0] || '';
    const contactProvinceSelect = getContactSelect('contact_province');
    const contactDistrictSelect = getContactSelect('contact_district');
    const contactSubdistrictSelect = getContactSelect('contact_subdistrict');
    const teamSubdistrictSelect = getContactSelect('subdistrict');
    expect(contactProvinceSelect).toContain('data-contact-address-step="province"');
    expect(contactDistrictSelect).toContain('data-contact-address-step="district"');
    expect(contactSubdistrictSelect).toContain('data-contact-address-step="subdistrict"');
    expect(contactProvinceSelect).not.toContain('disabled');
    expect(contactDistrictSelect).not.toContain('disabled');
    expect(contactSubdistrictSelect).not.toContain('disabled');
    expect(contactProvinceSelect).toContain('<option value="เชียงใหม่" selected>เชียงใหม่</option>');
    expect(contactDistrictSelect).toContain('<option value="เมืองเชียงใหม่" selected>เมืองเชียงใหม่</option>');
    expect(contactSubdistrictSelect).toContain('<option value="ช้างเผือก" selected>ช้างเผือก</option>');
    expect(teamSubdistrictSelect).toContain('<option value="แม่ริม" selected>แม่ริม</option>');
    expect(getRes.text).not.toContain('ประเภททีม');
    });
  });

  it('POST /api/team/team-update should retain existing documents when no replacement files are selected', async () => {
    const teamRow = createTeamRow('FTM-UPDATE-KEEP-DOCS');
    await withExistingTeamRow(teamRow, async (queries) => {
      const updateRes = await request(app)
        .post('/api/team/team-update')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-UPDATE-KEEP-DOCS', 'team_user=admin'])
        .set('Accept', 'application/json')
        .set('X-Requested-With', 'XMLHttpRequest')
        .field('school', 'ทีมแก้ไขชื่อโดยคงเอกสารเดิม')
        .field('email', 'team-update-test@example.invalid')
        .field('line_id', 'team-update-test');

      expect(updateRes.status).toBe(200);
      expect(teamRow.doc_team_cert).toBe('/uploads/existing-cert.pdf');
      expect(teamRow.doc_roster).toBe('/uploads/existing-roster.pdf');
      const page = await request(app).get('/team/team.php')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-UPDATE-KEEP-DOCS', 'team_user=admin']);
      expect(page.status).toBe(200);
      expect(page.text).not.toContain('doc_roster');
      expect(page.text).not.toContain('ใบรายชื่อนักกีฬา');
      expect(page.text).not.toContain('/uploads/existing-roster.pdf');
      expect(page.text).toContain('name="doc_team_cert"');
      expect(page.text).toContain('/uploads/existing-cert.pdf');
      expect(teamRow.status).toBe('PENDING');
      expect(queries.filter(query => query.sql.startsWith('UPDATE football_registered_team SET'))).toHaveLength(1);
      expect(queries.some(query => query.sql.startsWith('INSERT INTO football_registered_team'))).toBe(false);
    });
  });

  it('POST /api/team/team-update should return rejected teams to the review queue after saving', async () => {
    const teamRow = createTeamRow('FTM-UPDATE-RESUBMIT');
    teamRow.status = 'REJECTED';
    teamRow.reject_reason = 'เอกสารไม่ครบ';
    const memoryTeam = { ...teamRow, teamName: teamRow.team_name, rejectReason: teamRow.reject_reason };
    teamsDatabase.push(memoryTeam);

    try {
      await withExistingTeamRow(teamRow, async (queries) => {
        const updateRes = await request(app)
          .post('/api/team/team-update')
          .set('Cookie', ['team_logged_in=true', 'team_id=FTM-UPDATE-RESUBMIT', 'team_user=team-update-test'])
          .set('Accept', 'application/json')
          .set('X-Requested-With', 'XMLHttpRequest')
          .field('email', 'team-update-test@example.invalid')
          .field('line_id', 'team-update-test');

        expect(updateRes.status).toBe(200);
        expect(teamRow.status).toBe('PENDING');
        expect(teamRow.reject_reason).toBe('');

        const updateQuery = queries.find(query => query.sql.startsWith('UPDATE football_registered_team SET'));
        expect(updateQuery?.sql).toContain("status = CASE WHEN status = 'REJECTED' THEN 'PENDING' ELSE status END");
        expect(updateQuery?.sql).toContain("reject_reason = CASE WHEN status = 'REJECTED' THEN '' ELSE reject_reason END");

        const auditQuery = queries.find(query => query.sql.startsWith('INSERT INTO football_audit_log'));
        expect(auditQuery).toBeDefined();
        expect(JSON.parse(auditQuery!.values[9]).status).toBe('REJECTED');
        expect(JSON.parse(auditQuery!.values[10]).status).toBe('PENDING');
        expect(memoryTeam.status).toBe('PENDING');
        expect(memoryTeam.reject_reason).toBe('');
        expect(memoryTeam.rejectReason).toBe('');
      });
    } finally {
      const memoryIndex = teamsDatabase.indexOf(memoryTeam);
      if (memoryIndex >= 0) teamsDatabase.splice(memoryIndex, 1);
    }
  });

  it.each(['PENDING', 'APPROVED'])('POST /api/team/team-update should preserve the %s status when saving', async (status) => {
    const teamRow = createTeamRow(`FTM-UPDATE-KEEP-${status}`);
    teamRow.status = status;

    await withExistingTeamRow(teamRow, async () => {
      const updateRes = await request(app)
        .post('/api/team/team-update')
        .set('Cookie', [`team_logged_in=true`, `team_id=${teamRow.id}`, 'team_user=team-update-test'])
        .set('Accept', 'application/json')
        .set('X-Requested-With', 'XMLHttpRequest')
        .field('email', 'team-update-test@example.invalid')
        .field('line_id', 'team-update-test');

      expect(updateRes.status).toBe(200);
      expect(teamRow.status).toBe(status);
    });
  });

  it('POST /api/team/team-update should clear the saved subdistrict when the selected contact district changes', async () => {
    const teamRow = createTeamRow('FTM-UPDATE-CLEAR-SUBDISTRICT');
    teamRow.contact_province = 'เชียงใหม่';
    teamRow.contact_district = 'เมืองเชียงใหม่';
    teamRow.subdistrict = 'แม่ริม';
    teamRow.contact_subdistrict = 'ช้างเผือก';

    await withExistingTeamRow(teamRow, async () => {
      const updateRes = await request(app)
        .post('/api/team/team-update')
        .set('Cookie', ['team_logged_in=true', 'team_id=FTM-UPDATE-CLEAR-SUBDISTRICT', 'team_user=admin'])
        .set('Accept', 'application/json')
        .set('X-Requested-With', 'XMLHttpRequest')
        .field('email', 'team-update-test@example.invalid')
        .field('line_id', 'team-update-test')
        .field('contact_province', 'เชียงใหม่')
        .field('contact_district', 'สันทราย')
        .field('contact_subdistrict', '');

      expect(updateRes.status).toBe(200);
      expect(teamRow.contact_province).toBe('เชียงใหม่');
      expect(teamRow.contact_district).toBe('สันทราย');
      expect(teamRow.contact_subdistrict).toBe('');
      expect(teamRow.subdistrict).toBe('แม่ริม');
    });
  });

  it('POST /api/team/team-update should reject an unresolved team without creating or updating a fallback team', async () => {
    const beforeCount = teamsDatabase.length;
    const updateRes = await request(app)
      .post('/api/team/team-update')
      .set('Cookie', ['team_logged_in=true', 'team_id=default', 'team_user=unknown-team'])
      .set('Accept', 'application/json')
      .set('X-Requested-With', 'XMLHttpRequest')
      .field('school', 'ชื่อทีมที่ไม่ควรถูกบันทึก')
      .field('email', 'unknown@example.invalid')
      .field('line_id', 'unknown-line')
      .attach('doc_team_cert', Buffer.from('cert'), 'team_cert.pdf')
      .attach('doc_roster', Buffer.from('roster'), 'roster.pdf');

    expect(updateRes.status).toBe(404);
    expect(updateRes.body.success).toBe(false);
    expect(teamsDatabase).toHaveLength(beforeCount);
  });

  it('GET /team/team.php for new registered team should render empty fields without prefilled mock data (e.g. Assumption Thonburi)', async () => {
    const getRes = await request(app)
      .get('/team/team.php')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-BRAND-NEW', 'team_user=brand_new_user']);

    expect(getRes.status).toBe(200);
    expect(getRes.text).not.toContain('อัสสัมชัญ ธนบุรี');
    expect(getRes.text).not.toContain('โค้ชวิชัย สุขเกษม');
    expect(getRes.text).toContain('name="school"');
    expect(getRes.text).toContain('name="managerName"');
    expect(getRes.text).toContain('หนังสือรับรองทีม <span class="badge bg-secondary ms-1">OPTIONAL</span>');
    expect(getRes.text).not.toContain('ใบรายชื่อนักกีฬา');
    expect(getRes.text).not.toContain('doc_roster');
    expect(getRes.text).not.toMatch(/name="doc_team_cert"[^>]*required/);
    expect(getRes.text).toContain('บันทึกการแก้ไขข้อมูลทีม');
  });
});
