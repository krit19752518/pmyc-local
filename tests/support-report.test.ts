jest.mock('../src/db', () => ({
  pool: {
    query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
    connect: jest.fn(),
    end: async () => undefined
  }
}));
jest.mock('../src/db/initTables', () => ({ initTeamTables: async () => undefined }));

import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db';
import { AdminUser } from '../src/adminAuth';
import { renderAdminLayout } from '../src/adminLayout';
import { renderTeamLayout } from '../src/teamLayout';
import { renderSupportReportsPage } from '../src/supportReportsPage';
import { cleanupTestSupportReportFiles } from '../src/middleware/supportReportUpload';
import { createTeamSessionToken } from '../src/services/teamSession.service';

const adminRoles: AdminUser[] = [
  { id: 'ADM-001', username: 'admin', fullname: 'Super Admin', roleCode: 'SUPER_ADMIN', roleName: 'ผู้ดูแลระบบสูงสุด', permissions: [] },
  { id: 'ADM-002', username: 'verifier', fullname: 'Verifier', roleCode: 'DOCUMENT_VERIFIER', roleName: 'เจ้าหน้าที่ตรวจเอกสาร', permissions: [] },
  { id: 'SAT-001', username: 'sat', fullname: 'SAT Officer', roleCode: 'SAT_OFFICER', roleName: 'เจ้าหน้าที่ กกท.', permissions: [] }
];

describe('Support report workflow', () => {
  let transactionQuery: jest.Mock;
  let transactionRelease: jest.Mock;

  beforeEach(() => {
    transactionQuery = jest.fn(async () => ({ rows: [], rowCount: 1 }));
    transactionRelease = jest.fn();
    (pool.connect as jest.Mock).mockResolvedValue({ query: transactionQuery, release: transactionRelease });
    (pool.query as jest.Mock).mockResolvedValue({ rows: [], rowCount: 0 });
  });

  const mockStatusUpdate = (id: string, status: string, teamId: string | null = null) => {
    transactionQuery.mockImplementation(async (sql: unknown) => {
      const statement = String(sql);
      if (statement.includes('SELECT r.id, r.status, r.team_id FROM football_support_report')) {
        return { rows: [{ id, status: 'OPEN', team_id: teamId }], rowCount: 1 };
      }
      if (statement.includes('UPDATE football_support_report')) {
        return { rows: [{ id, status, updated_at: new Date(), resolved_at: null }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
  };

  afterAll(() => cleanupTestSupportReportFiles());

  it('preserves the report widget for central Admin roles and other team pages while retaining the team dashboard QR', () => {
    for (const role of adminRoles.filter(role => role.roleCode !== 'SAT_OFFICER')) {
      const page = renderAdminLayout('รายงานทดสอบ', '<p>content</p>', 'dashboard', '', role);
      expect(page).toContain('แจ้งปัญหาการใช้งานระบบ');
      expect(page).toContain('ระบบรับแจ้งปัญหาการใช้งาน รายงานทดสอบ');
      expect(page.indexOf('รายการปัญหาการใช้งานระบบ')).toBeLessThan(page.indexOf('แจ้งปัญหาการใช้งานระบบ'));
    }
    const teamPage = renderTeamLayout('ภาพรวมทีม', '<p>content</p>');
    expect(teamPage).toContain('class="team-support-qr text-center mt-2"');
    expect(teamPage).toContain('style="color:#dc3545;font-weight:700;">แจ้งปัญหาการใช้ระบบ</p>');
    expect(teamPage).not.toContain('id="supportReportModal"');
    expect(teamPage).not.toContain('id="supportReportForm"');
    expect(teamPage).not.toContain('data-bs-target="#supportReportModal"');
    expect(teamPage).not.toContain('/api/support-reports');
    expect(teamPage).toContain('href="/team/support-reports.php"');
    for (const page of ['team','players','officials','submit','support-reports']) {
      const html = renderTeamLayout('หน้าทดสอบ', '<p>content</p>', page);
      expect(html).toContain('id="supportReportModal"');
      expect(html).toContain('ระบบรับแจ้งปัญหาการใช้งาน หน้าทดสอบ');
      expect(html).not.toContain('class="team-support-qr');
    }
  });

  it('preserves the report widget on other SAT pages and default central dashboard', () => {
    const sat = adminRoles.find(role => role.roleCode === 'SAT_OFFICER')!;
    for (const nav of ['teams','players','support-reports','teams-u14','report-demographics'] as const) {
      const html = renderAdminLayout('หน้าทดสอบ กกท.', '<p>content</p>', nav, '', sat);
      expect(html).toContain('id="supportReportModal"');
      expect(html).toContain('ระบบรับแจ้งปัญหาการใช้งาน หน้าทดสอบ กกท.');
      expect(html).not.toContain('class="sat-support-qr');
    }
    expect(renderAdminLayout('Admin Dashboard', '<p>content</p>', 'dashboard', '')).toContain('id="supportReportModal"');
  });

  it.each(['', '/', '/football', '/football/'])('shows only the SAT dashboard QR with correct static path for base %s', base => {
    const sat = adminRoles.find(role => role.roleCode === 'SAT_OFFICER')!;
    const html = renderAdminLayout('Admin Dashboard', '<p>content</p>', 'dashboard', base, sat);
    const prefix = base.startsWith('/football') ? '/football' : '';
    expect(html).toContain(`src="${prefix}/images/lineoa-support-qr.png"`);
    expect(html).toContain('style="color:#dc3545;font-weight:700;">แจ้งปัญหาการใช้ระบบ</p>');
    expect(html).toContain('width="262" height="248"');
    expect(html).toContain('width:100%;max-width:200px;height:auto;');
    expect(html).toContain('รายการปัญหาการใช้งานระบบ');
    expect(html).not.toContain('id="supportReportModal"');
    expect(html).not.toContain('id="supportReportForm"');
    expect(html).not.toContain('selectedFiles');
    const section = html.match(/<section class="sat-support-qr[\s\S]*?<\/section>/)?.[0];
    expect(section).toBeDefined();
    expect(section).not.toMatch(/<a\b|<button\b|onclick=|data-bs-toggle/);
  });

  it.each(['', '/', '/football', '/football/'])('keeps the QR asset local and proportional with base URL %s', base => {
    const html = renderTeamLayout('ภาพรวมทีม', '<p>content</p>', 'index', base);
    const prefix = base.startsWith('/football') ? '/football' : '';
    expect(html).toContain(`src="${prefix}/images/lineoa-support-qr.png"`);
    expect(html).toContain('width="262" height="248"');
    expect(html).toContain('width:100%;max-width:200px;height:auto;');
    const section = html.match(/<section class="team-support-qr[\s\S]*?<\/section>/)?.[0];
    expect(section).toBeDefined();
    expect(section).not.toMatch(/<a\b|<button\b|onclick=|data-bs-toggle/);
  });

  it('serves the approved QR as a public PNG without a session or support-report request', async () => {
    const response = await request(app).get('/images/lineoa-support-qr.png');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    const { readFileSync } = require('fs');
    const { createHash } = require('crypto');
    const { resolve } = require('path');
    const bytes = readFileSync(resolve(__dirname, '../public/images/lineoa-support-qr.png'));
    expect(createHash('sha256').update(response.body).digest('hex')).toBe(createHash('sha256').update(bytes).digest('hex'));
  });

  it('renders the report table and enables status actions only for central roles', () => {
    const centralPage = renderSupportReportsPage(true, '');
    const scopedPage = renderSupportReportsPage(false, '');
    expect(centralPage).toContain('สถานะปัญหา');
    expect(centralPage).toContain('เปลี่ยนสถานะรายการนี้');
    expect(scopedPage).toContain('const canChangeStatus = false');
    expect(centralPage).toContain('const readApiResponse = async (response, defaultMessage)');
    expect(centralPage).toContain("OPEN: 'btn-warning text-dark'");
    expect(centralPage).toContain("IN_PROGRESS: 'btn-primary text-white'");
    expect(centralPage).toContain("RESOLVED: 'btn-success text-white'");
    expect(centralPage).toContain("CLOSED: 'btn-secondary text-white'");
    expect(centralPage).toContain("statusButtonClasses[report.status] || 'btn-secondary text-white'");
    expect(centralPage).toContain("(canChangeStatus ? '' : ' opacity-100')");
    expect(centralPage).toContain("'Accept': 'application/json'");
    expect(centralPage).toContain('เซิร์ฟเวอร์ตอบกลับไม่ใช่ข้อมูล JSON');
    expect(centralPage).toContain('ข้อมูลเพิ่มเติมจาก ผู้ดูแลระบบ');
    expect(centralPage).toContain('ประวัติการแจ้งข้อมูลปัญหา');
    expect(centralPage).toContain('table-primary');
    expect(centralPage).toContain('table-success');
    expect(centralPage).toContain('<th style="width:72px">ลำดับ</th>');
    expect(centralPage).toContain('const createConversationRow = (report, parentRow, columnCount)');
    expect(centralPage).toContain('<th>ข้อมูลการสนทนา</th>');
    expect(centralPage).toContain('if (report.message_count > 0)');
    expect(centralPage).toContain('report.team_name || report.team_id');
    expect(centralPage).toContain('cell(String(report.message_count))');
    expect(centralPage).toContain("rows.append(makeRow(report, index))");
    expect(centralPage).toContain("canChangeStatus ? '<hr><label class=\"form-label fw-bold\" for=\"supportReportAdminMessage\">ข้อมูลเพิ่มเติมจาก ผู้ดูแลระบบ</label>");
    expect(() => new Function(centralPage.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1] as string)).not.toThrow();
  });

  it('returns the team name and scoped conversation message count without changing the schema', async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'FSR-WITH-MESSAGES', team_name: 'ทีมทดสอบ', has_messages: true, message_count: 2 }], rowCount: 1 });

    const response = await request(app)
      .get('/api/support/reports?page=1&limit=25')
      .set('Cookie', ['admin_session=true', 'admin_user=admin']);

    expect(response.status).toBe(200);
    expect(response.body.reports).toEqual([{ id: 'FSR-WITH-MESSAGES', team_name: 'ทีมทดสอบ', has_messages: true, message_count: 2 }]);
    const listQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) => String(sql).includes('AS message_count'));
    expect(listQuery?.[0]).toContain('EXISTS (SELECT 1 FROM football_support_report_message m WHERE m.report_id = r.id) AS has_messages');
    expect(listQuery?.[0]).toContain('LEFT JOIN football_registered_team t ON t.id = r.team_id');
    expect(listQuery?.[0]).toContain('(SELECT COUNT(*)::int FROM football_support_report_message m WHERE m.report_id = r.id) AS message_count');
    expect(listQuery?.[0]).toContain('WHERE TRUE');
  });

  it('emits valid browser JavaScript for repeated image selection, previews and per-image removal', () => {
    const page = renderTeamLayout('ข้อมูลทีม', '<p>content</p>', 'team');
    const inlineScript = [...page.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].find(match => match[1].includes('selectedFiles'))?.[1];
    expect(inlineScript).toBeDefined();
    expect(() => new Function(inlineScript as string)).not.toThrow();
    expect(page).toContain('type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple');
    expect(inlineScript).toContain('selectedFiles = selectedFiles.concat(incoming)');
    expect(inlineScript).toContain('input.value = \'\'');
    expect(inlineScript).toContain('URL.createObjectURL(file)');
    expect(inlineScript).toContain('selectedFiles.splice(index, 1)');
    expect(page).toContain('.support-report-preview:hover .support-report-remove');
    expect(page).toContain('.support-report-preview:focus-within .support-report-remove');
  });

  it('moves the report modal out of the sidebar stacking context before binding its form', () => {
    const page = renderTeamLayout('ข้อมูลทีม', '<p>content</p>', 'team');
    const inlineScript = [...page.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].find(match => match[1].includes('selectedFiles'))?.[1] as string;
    const modalElement = { parentElement: {} as unknown };
    const form = { addEventListener: jest.fn() };
    const elements: Record<string, unknown> = {
      supportReportModal: modalElement,
      supportReportForm: form,
      supportReportFiles: { addEventListener: jest.fn() },
      supportReportPreviews: { replaceChildren: jest.fn() },
      supportReportMessage: {},
      supportReportSubmit: {}
    };
    const body = {
      appendChild: jest.fn((element: { parentElement: unknown }) => { element.parentElement = body; })
    };
    const documentMock = {
      body,
      getElementById: (id: string) => elements[id]
    };

    new Function('document', inlineScript)(documentMock);

    expect(body.appendChild).toHaveBeenCalledWith(modalElement);
    expect(modalElement.parentElement).toBe(body);
    expect(form.addEventListener).toHaveBeenCalledWith('submit', expect.any(Function));
  });

  it('shows a green success confirmation and closes every open modal after OK without navigating', async () => {
    const page = renderTeamLayout('ข้อมูลทีม', '<p>content</p>', 'team');
    const inlineScript = [...page.matchAll(/<script>\s*([\s\S]*?)<\/script>/g)].find(match => match[1].includes('selectedFiles'))?.[1] as string;
    const listeners: Record<string, (event: any) => Promise<void> | void> = {};
    const hidden = jest.fn();
    const modalElement = {};
    const form = { addEventListener: (name: string, listener: any) => { listeners[name] = listener; }, reset: jest.fn() };
    const input = { addEventListener: jest.fn(), value: '', files: [] };
    const previews = { replaceChildren: jest.fn() };
    const message = { textContent: '', className: '' };
    const submit = { disabled: false };
    const description = { value: 'ปุ่มไม่ทำงาน' };
    const elements: Record<string, any> = {
      supportReportForm: form,
      supportReportFiles: input,
      supportReportPreviews: previews,
      supportReportMessage: message,
      supportReportSubmit: submit,
      supportReportDescription: description
    };
    const documentMock = {
      getElementById: (id: string) => elements[id],
      querySelectorAll: jest.fn(() => [modalElement])
    };
    const formData = { set: jest.fn(), append: jest.fn() };
    const swalFire = jest.fn(async () => ({ isConfirmed: true }));
    const modalInstance = { hide: hidden };
    const bootstrapMock = { Modal: { getInstance: jest.fn(() => modalInstance), getOrCreateInstance: jest.fn() } };
    const windowMock = { location: { pathname: '/team/team.php', search: '' } };
    const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ success: true, reportId: 'FSR-123' }) }));

    new Function('document', 'window', 'FormData', 'fetch', 'Swal', 'bootstrap', 'URL', inlineScript)(
      documentMock,
      windowMock,
      function MockFormData() { return formData; },
      fetchMock,
      { fire: swalFire },
      bootstrapMock,
      { createObjectURL: jest.fn(), revokeObjectURL: jest.fn() }
    );
    await listeners.submit({ preventDefault: jest.fn() });

    expect(swalFire).toHaveBeenCalledWith(expect.objectContaining({
      icon: 'success',
      color: '#198754',
      confirmButtonText: 'ตกลง',
      allowOutsideClick: false,
      allowEscapeKey: false
    }));
    expect(documentMock.querySelectorAll).toHaveBeenCalledWith('.modal.show');
    expect(hidden).toHaveBeenCalledTimes(1);
    expect(windowMock.location.pathname).toBe('/team/team.php');
    expect(windowMock.location.search).toBe('');
    expect(form.reset).toHaveBeenCalledTimes(1);
  });

  it('stores reporter identity, page context, report time defaults and image metadata for an admin', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const response = await request(app)
      .post('/api/support/reports')
      .set('Cookie', ['admin_session=true', 'admin_user=admin'])
      .field('description', 'ปุ่มบันทึกไม่ทำงาน')
      .field('pageDescription', 'แผงควบคุม')
      .field('pagePath', '/admin/dashboard.php')
      .attach('attachments', png, { filename: 'issue.png', contentType: 'image/png' });

    expect(response.status).toBe(201);
    expect(response.body.reportId).toMatch(/^FSR-/);
    const reportInsert = transactionQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO football_support_report'));
    expect(reportInsert?.[1]).toEqual(expect.arrayContaining(['ADM-001', 'admin', 'ผู้ดูแลระบบสูงสุด (Super Admin)', 'SUPER_ADMIN', 'แผงควบคุม', '/admin/dashboard.php', 'ปุ่มบันทึกไม่ทำงาน']));
    expect(transactionQuery).toHaveBeenCalledWith('BEGIN');
    expect(transactionQuery).toHaveBeenCalledWith('COMMIT');
    expect(transactionQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO football_support_report_attachment'))).toBe(true);
    expect(transactionRelease).toHaveBeenCalledTimes(1);
  });

  it('records a team login identity and team scope', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'FTM-TEST', team_name: 'ทีมทดสอบ', manager_name: 'ผู้จัดการ', province: 'เชียงใหม่' }], rowCount: 1 });
    const response = await request(app)
      .post('/api/support/reports')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST', 'team_user=manager%40example.org'])
      .field('description', 'หน้าแสดงข้อมูลผิด')
      .field('pageDescription', 'ข้อมูลทีม')
      .field('pagePath', '/team/team.php');

    expect(response.status).toBe(201);
    const reportInsert = transactionQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO football_support_report'));
    expect(reportInsert?.[1]).toEqual(expect.arrayContaining(['manager@example.org', 'TEAM_MANAGER', 'FTM-TEST', 'ข้อมูลทีม', '/team/team.php', 'หน้าแสดงข้อมูลผิด']));
  });

  it('scopes report listing to the SAT officer province from the authenticated account', async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'SAT-009', fullname: 'เจ้าหน้าที่', position: 'จังหวัด', province: 'เชียงใหม่', email: 'sat@example.org' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'FSR-1', province: 'เชียงใหม่', attachments: [] }], rowCount: 1 });

    const response = await request(app)
      .get('/api/support/reports')
      .set('Cookie', ['admin_session=true', 'admin_user=sat%40example.org']);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    const scopedListQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) => String(sql).includes('ORDER BY r.created_at DESC'));
    expect(scopedListQuery?.[1]).toEqual(['เชียงใหม่', 25, 0]);
  });

  it('scopes report listing to the current team and refuses status changes by team users', async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'FTM-TEST', team_name: 'ทีมทดสอบ', province: 'เชียงใหม่', categories: 'U14' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'FSR-TEAM', team_id: 'FTM-TEST', attachments: [] }], rowCount: 1 });

    const listResponse = await request(app)
      .get('/api/support/reports?teamId=FTM-OTHER')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST', 'team_user=manager%40example.org']);
    expect(listResponse.status).toBe(200);
    const scopedListQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) => String(sql).includes('ORDER BY r.created_at DESC'));
    expect(scopedListQuery?.[1]).toEqual(['FTM-TEST', 25, 0]);
    expect(scopedListQuery?.[0]).toContain('r.team_id = $1');
    expect(scopedListQuery?.[0]).toContain('r.additional_info');

    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'FTM-TEST', team_name: 'ทีมทดสอบ', manager_name: 'ผู้จัดการ', province: 'เชียงใหม่' }], rowCount: 1 });
    const updateResponse = await request(app)
      .post('/api/support/reports/FSR-TEAM/status')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-TEST', 'team_user=manager%40example.org'])
      .send({ status: 'RESOLVED' });
    expect(updateResponse.status).toBe(403);
    expect((pool.query as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('UPDATE football_support_report'))).toBe(false);
  });

  it('keeps the team dashboard scoped to its team when an admin session cookie is also present', async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'FTM-DASHBOARD', team_name: 'ทีม Dashboard', manager_name: 'ผู้จัดการ', province: 'เชียงใหม่' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ total: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'FSR-OWN', team_id: 'FTM-DASHBOARD', attachments: [] }], rowCount: 1 });

    const response = await request(app)
      .get('/api/team/support/reports?page=1&limit=10&teamId=FTM-OTHER')
      .set('Cookie', [
        'admin_session=true', 'admin_user=admin',
        'team_logged_in=true', 'team_id=FTM-DASHBOARD', 'team_user=manager%40example.org'
      ]);

    expect(response.status).toBe(200);
    expect(response.body.reports).toEqual([{ id: 'FSR-OWN', team_id: 'FTM-DASHBOARD', attachments: [] }]);
    expect((pool.query as jest.Mock).mock.calls[0][0]).toContain('WHERE id::text = $1');
    const countQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) => String(sql).includes('COUNT(*)::int AS total'));
    const listQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) => String(sql).includes('ORDER BY r.created_at DESC'));
    expect(countQuery?.[0]).toContain('r.team_id = $1');
    expect(countQuery?.[1]).toEqual(['FTM-DASHBOARD']);
    expect(listQuery?.[0]).toContain('r.team_id = $1');
    expect(listQuery?.[1]).toEqual(['FTM-DASHBOARD', 10, 0]);
  });

  it('allows central support roles to change status using existing report fields', async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockStatusUpdate('FSR-ADMIN', 'IN_PROGRESS');

    const response = await request(app)
      .post('/api/support/reports/FSR-ADMIN/status')
      .set('Cookie', ['admin_session=true', 'admin_user=admin'])
      .send({ status: 'IN_PROGRESS' });

    expect(response.status).toBe(200);
    expect(response.body.report.status).toBe('IN_PROGRESS');
    const update = transactionQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE football_support_report'));
    expect(update?.[0]).toContain('updated_at = CURRENT_TIMESTAMP');
    expect(update?.[0]).toContain('SET status = $1::varchar(30)');
    expect(update?.[0]).toContain("CASE WHEN $1::varchar(30) IN ('RESOLVED', 'CLOSED')");
    expect(update?.[0]).not.toMatch(/ALTER TABLE|ADD COLUMN|DROP|DELETE|TRUNCATE/i);
    expect(update?.[1]).toEqual(['IN_PROGRESS', 'FSR-ADMIN']);
    expect(transactionQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO football_audit_log'))?.[1]).toEqual(expect.arrayContaining([
      'SUPPORT_REPORT_STATUS_CHANGED', 'ADMIN', 'ADM-001', 'ผู้ดูแลระบบสูงสุด (Super Admin)', 'SUPER_ADMIN', null,
      null, 'SUPPORT_REPORT', 'FSR-ADMIN', JSON.stringify({ status: 'OPEN' }), JSON.stringify({ status: 'IN_PROGRESS' })
    ]));
    expect(transactionQuery.mock.calls.map(([sql]) => String(sql))).toEqual(expect.arrayContaining(['BEGIN', expect.stringContaining('SELECT r.id, r.status'), expect.stringContaining('UPDATE football_support_report'), expect.stringContaining('INSERT INTO football_audit_log'), 'COMMIT']));
  });

  it('allows DOCUMENT_VERIFIER status changes and rejects SAT officer status changes', async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    mockStatusUpdate('FSR-VERIFIER', 'RESOLVED');
    const verifierResponse = await request(app)
      .post('/api/support/reports/FSR-VERIFIER/status')
      .set('Cookie', ['admin_session=true', 'admin_user=verifier01'])
      .send({ status: 'RESOLVED' });
    expect(verifierResponse.status).toBe(200);

    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ id: 'SAT-009', fullname: 'เจ้าหน้าที่', position: 'จังหวัด', province: 'เชียงใหม่', email: 'sat@example.org' }], rowCount: 1 });
    const satResponse = await request(app)
      .post('/api/support/reports/FSR-SAT/status')
      .set('Cookie', ['admin_session=true', 'admin_user=sat%40example.org'])
      .send({ status: 'RESOLVED' });
    expect(satResponse.status).toBe(403);
    expect(transactionQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE football_support_report'))).toBe(true);
    expect(transactionQuery.mock.calls.filter(([sql]) => String(sql).includes('UPDATE football_support_report'))).toHaveLength(1);
  });

  it('saves additional information only for the authenticated team report and audits the update', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ id: 'FTM-OWN', team_name: 'ทีมทดสอบ', manager_name: 'ผู้จัดการ', province: 'เชียงใหม่' }],
      rowCount: 1
    });
    transactionQuery.mockImplementation(async (sql: unknown) => {
      const statement = String(sql);
      if (statement.includes('SELECT r.id, r.team_id, r.additional_info')) {
        return { rows: [{ id: 'FSR-OWN', team_id: 'FTM-OWN', additional_info: null }], rowCount: 1 };
      }
      if (statement.includes('UPDATE football_support_report r') && statement.includes('SET additional_info')) {
        return { rows: [{ id: 'FSR-OWN', additional_info: 'ข้อมูลประกอบเพิ่มเติม', updated_at: new Date() }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    const response = await request(app)
      .put('/api/support/reports/FSR-OWN/additional-info')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-OWN', 'team_user=manager%40example.org', `team_session=${encodeURIComponent(createTeamSessionToken('FTM-OWN', 'manager@example.org'))}`])
      .send({ additionalInfo: 'ข้อมูลประกอบเพิ่มเติม' });

    expect(response.status).toBe(200);
    expect(response.body.report.additional_info).toBe('ข้อมูลประกอบเพิ่มเติม');
    const select = transactionQuery.mock.calls.find(([sql]) => String(sql).includes('SELECT r.id, r.team_id, r.additional_info'));
    expect(select?.[0]).toContain('r.team_id = $1');
    expect(select?.[1]).toEqual(['FTM-OWN', 'FSR-OWN']);
    const update = transactionQuery.mock.calls.find(([sql]) => String(sql).includes('SET additional_info'));
    expect(update?.[0]).toContain('r.team_id = $2');
    expect(update?.[0]).toContain('r.id = $3');
    expect(update?.[1]).toEqual(['ข้อมูลประกอบเพิ่มเติม', 'FTM-OWN', 'FSR-OWN']);
    const userMessage = transactionQuery.mock.calls.find(([sql]) => String(sql).includes("VALUES ($1, $2, $3, $4, 'USER', $5)"));
    expect(userMessage?.[0]).toContain('INSERT INTO football_support_report_message');
    expect(userMessage?.[1]).toEqual(['FSR-OWN', 'manager@example.org', 'ผู้จัดการ', 'TEAM_MANAGER', 'ข้อมูลประกอบเพิ่มเติม']);
    expect(transactionQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO football_audit_log'))?.[1]).toEqual(expect.arrayContaining([
      'SUPPORT_REPORT_ADDITIONAL_INFO_UPDATED', 'TEAM', 'manager@example.org', 'TEAM', null,
      'SUPPORT_REPORT', 'FSR-OWN', JSON.stringify({ additionalInfoProvided: false }), JSON.stringify({ additionalInfoProvided: true })
    ]));
    expect(transactionQuery.mock.calls.map(([sql]) => String(sql))).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']));
  });

  it('does not allow another team or a central admin to edit the additional information', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ id: 'FTM-OWN', team_name: 'ทีมทดสอบ', province: 'เชียงใหม่' }],
      rowCount: 1
    });
    transactionQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('SELECT r.id, r.team_id, r.additional_info')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    });

    const otherTeamResponse = await request(app)
      .put('/api/support/reports/FSR-OTHER/additional-info?teamId=FTM-OTHER')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-OWN', 'team_user=manager%40example.org'])
      .send({ additionalInfo: 'ไม่ควรเปลี่ยนข้อมูลทีมอื่น' });
    expect(otherTeamResponse.status).toBe(404);
    const select = transactionQuery.mock.calls.find(([sql]) => String(sql).includes('SELECT r.id, r.team_id, r.additional_info'));
    expect(select?.[1]).toEqual(['FTM-OWN', 'FSR-OTHER']);
    expect(transactionQuery.mock.calls.some(([sql]) => String(sql).includes('SET additional_info'))).toBe(false);

    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const adminResponse = await request(app)
      .put('/api/support/reports/FSR-OWN/additional-info')
      .set('Cookie', ['admin_session=true', 'admin_user=admin'])
      .send({ additionalInfo: 'admin write attempt' });
    expect(adminResponse.status).toBe(403);
    expect(pool.connect).toHaveBeenCalledTimes(1);
  });

  it('lists support messages newest first within the authenticated team scope', async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ id: 'FTM-OWN', team_name: 'ทีมทดสอบ', manager_name: 'ผู้จัดการ', province: 'เชียงใหม่' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: '2', sender_type: 'ADMIN', sender_name: 'ผู้ดูแล', message: 'ตอบกลับ', created_at: new Date() }], rowCount: 1 });

    const response = await request(app)
      .get('/api/support/reports/FSR-OWN/messages?teamId=FTM-OTHER')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-OWN', 'team_user=manager%40example.org']);

    expect(response.status).toBe(200);
    expect(response.body.messages[0]).toMatchObject({ sender_type: 'ADMIN', message: 'ตอบกลับ' });
    const historyQuery = (pool.query as jest.Mock).mock.calls.find(([sql]) => String(sql).includes('FROM football_support_report_message m'));
    expect(historyQuery?.[0]).toContain('r.team_id = $1');
    expect(historyQuery?.[0]).toContain('ORDER BY m.created_at DESC, m.id DESC');
    expect(historyQuery?.[1]).toEqual(['FTM-OWN', 'FSR-OWN']);
  });

  it('allows central support roles to append admin messages with session identity', async () => {
    transactionQuery.mockImplementation(async (sql: unknown) => {
      const statement = String(sql);
      if (statement.includes('SELECT r.id, r.team_id FROM football_support_report')) {
        return { rows: [{ id: 'FSR-ADMIN-MESSAGE', team_id: 'FTM-1' }], rowCount: 1 };
      }
      if (statement.includes('INSERT INTO football_support_report_message')) {
        return { rows: [{ id: '17', sender_type: 'ADMIN', sender_name: 'Super Admin', message: 'กำลังตรวจสอบ' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    const response = await request(app)
      .post('/api/support/reports/FSR-ADMIN-MESSAGE/messages')
      .set('Cookie', ['admin_session=true', 'admin_user=admin'])
      .send({ message: 'กำลังตรวจสอบ' });

    expect(response.status).toBe(201);
    expect(response.body.message).toMatchObject({ sender_type: 'ADMIN', sender_name: 'Super Admin', message: 'กำลังตรวจสอบ' });
    const reportLock = transactionQuery.mock.calls.find(([sql]) => String(sql).includes('FOR KEY SHARE'));
    expect(reportLock?.[1]).toEqual(['FSR-ADMIN-MESSAGE']);
    const insert = transactionQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO football_support_report_message'));
    expect(insert?.[1]).toEqual(['FSR-ADMIN-MESSAGE', 'ADM-001', 'ผู้ดูแลระบบสูงสุด (Super Admin)', 'SUPER_ADMIN', 'กำลังตรวจสอบ']);
    expect(transactionQuery.mock.calls.map(([sql]) => String(sql))).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']));
  });

  it('rejects team users from sending admin messages before opening a transaction', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 'FTM-OWN', team_name: 'ทีมทดสอบ', manager_name: 'ผู้จัดการ' }], rowCount: 1 });
    const response = await request(app)
      .post('/api/support/reports/FSR-OWN/messages')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-OWN', 'team_user=manager%40example.org'])
      .send({ message: 'ทดสอบสิทธิ์' });

    expect(response.status).toBe(403);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('returns a JSON error and logs the cause when the status update database connection fails', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    (pool.connect as jest.Mock).mockRejectedValueOnce(new Error('database connection unavailable'));
    const logError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const response = await request(app)
        .post('/api/support/reports/FSR-DB-ERROR/status')
        .set('Cookie', ['admin_session=true', 'admin_user=admin'])
        .send({ status: 'IN_PROGRESS' });

      expect(response.status).toBe(500);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toEqual({
        success: false,
        error: 'เกิดข้อผิดพลาดขณะเปลี่ยนสถานะปัญหา กรุณาลองใหม่หรือติดต่อผู้ดูแลระบบ'
      });
      expect(logError).toHaveBeenCalledWith(expect.stringContaining('FSR-DB-ERROR'), expect.any(Error));
    } finally {
      logError.mockRestore();
    }
  });

  it('requires an authenticated user and rejects images larger than 4 MB', async () => {
    const unauthorized = await request(app)
      .post('/api/support/reports')
      .field('description', 'test')
      .field('pageDescription', 'page')
      .field('pagePath', '/team/index.php');
    expect(unauthorized.status).toBe(401);

    const largePng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(4 * 1024 * 1024)]);
    const tooLarge = await request(app)
      .post('/api/support/reports')
      .set('Cookie', ['admin_session=true', 'admin_user=admin'])
      .field('description', 'test')
      .field('pageDescription', 'page')
      .field('pagePath', '/admin/dashboard.php')
      .attach('attachments', largePng, { filename: 'large.png', contentType: 'image/png' });
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.error).toContain('4 MB');
  });

  it('rejects a file whose contents do not match its declared image type', async () => {
    const response = await request(app)
      .post('/api/support/reports')
      .set('Cookie', ['admin_session=true', 'admin_user=admin'])
      .field('description', 'test')
      .field('pageDescription', 'page')
      .field('pagePath', '/admin/dashboard.php')
      .attach('attachments', Buffer.from('not a png'), { filename: 'issue.png', contentType: 'image/png' });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('ไม่ใช่รูปภาพ');
    expect(transactionQuery).not.toHaveBeenCalled();
  });
});
