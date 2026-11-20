import { renderLayout } from './layout';
import { AdminUser } from './adminAuth';
import { renderSupportReportWidget } from './supportReportWidget';

export function renderAdminLayout(
  title: string,
  bodyContent: string,
  activeAdminNav: 'district-draw-setup' | 'district-draw-result' | 'district-match-schedule' | 'dashboard' | 'teams' | 'teams-demo' | 'teams-demo-draw' | 'teams-demo-results' | 'team-register-demo' | 'teams-u14' | 'teams-u16' | 'teams-u18' | 'players' | 'users' | 'sat-officers' | 'report-demographics' | 'report-roster' | 'report-teams-categories' | 'report-team-compliance' | 'report-compliance' | 'report-strategy' | 'permissions' | 'audit-log' | 'support-reports' | 'bracket-u14' | 'bracket-u16' | 'bracket-u18' | 'bracket-demo-u14' | 'bracket-demo-u16' | 'bracket-demo-u18' = 'dashboard',
  base: string = '/football',
  currentUser?: AdminUser,
  rawQuery?: string
): string {
  const user = currentUser || {
    id: 'ADM-001',
    username: 'admin',
    fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)',
    roleCode: 'SUPER_ADMIN',
    roleName: 'ผู้ดูแลระบบสูงสุด',
    permissions: ['teams:read', 'teams:verify', 'users:manage', 'system:all']
  };

  const isSuperAdmin = user.roleCode === 'SUPER_ADMIN';
  const qrBase = base === '/' ? '' : base.replace(/\/$/, '');
  const supportActionHtml = user.roleCode === 'SAT_OFFICER' && activeAdminNav === 'dashboard' ? `
    <section class="sat-support-qr text-center mt-2" aria-label="แจ้งปัญหาการใช้ระบบผ่าน LINE">
      <p class="mb-2" style="color:#dc3545;font-weight:700;">แจ้งปัญหาการใช้ระบบ</p>
      <img src="${qrBase}/images/lineoa-support-qr.png" alt="QR Code LINE สำหรับแจ้งปัญหาการใช้ระบบ" width="262" height="248" style="display:block;width:100%;max-width:200px;height:auto;margin-inline:auto;">
    </section>` : renderSupportReportWidget(title, base);
  const canViewDemoMenu = isSuperAdmin;
  const isDemoBracketNavActive = activeAdminNav.startsWith('bracket-demo-');
  const isDemoNavActive = ['teams-demo', 'teams-demo-draw', 'teams-demo-results', 'team-register-demo'].includes(activeAdminNav) || isDemoBracketNavActive;
  const queryParam = '';
  const reportMenuItems = [
    { nav: 'report-demographics', href: '/admin/report-demographics.php', icon: 'bi-geo-alt-fill', color: 'text-info', label: '1. รายงานวิเคราะห์การสมัคร & พื้นที่' },
    { nav: 'report-roster', href: '/admin/report-roster.php', icon: 'bi-bar-chart-line-fill', color: 'text-success', label: '2. รายงานสถิตินักกีฬา & รุ่นแข่งขัน' },
    { nav: 'report-teams-categories', href: '/admin/report-teams-categories.php', icon: 'bi-diagram-3-fill', color: 'text-primary', label: '3. รายงานทีม & รุ่นแข่งขัน' },
    { nav: 'report-team-compliance', href: '/admin/report-team-compliance.php', icon: 'bi-shield-check', color: 'text-warning', label: '4. รายงานการตรวจสอบเอกสารการสมัครทีม' },
    { nav: 'report-compliance', href: '/admin/report-compliance.php', icon: 'bi-file-earmark-check-fill', color: 'text-info', label: '5. รายงานการตรวจสอบเอกสารนักกีฬา' },
    { nav: 'report-strategy', href: '/admin/report-strategy.php', icon: 'bi-trophy-fill', color: 'text-primary', label: '6. รายงานประเมินการจัดแข่งครั้งต่อไป' }
  ] as const;
  const isReportNavActive = reportMenuItems.some(item => item.nav === activeAdminNav);

  const sidebar = `
  <div class="col-lg-auto mb-4 mb-lg-0" style="min-width: 220px; max-width: 260px;">
    <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
      <div class="card-header bg-navy text-white p-3">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-shield-lock-fill fs-4 text-warning"></i>
          <div>
            <div class="fw-bold fs-6 leading-tight">${user.fullname}</div>
            <small class="badge bg-warning text-dark font-monospace">${user.roleName}</small>
          </div>
        </div>
      </div>
      <div class="list-group list-group-flush admin-sidebar-nav">
        <a href="${base}/admin/dashboard.php"
           class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-3 ${activeAdminNav === 'dashboard' ? 'active bg-navy border-navy text-white fw-bold' : ''}">
          <i class="bi bi-speedometer2 fs-5"></i>
          <span class="text-nowrap">แผงควบคุม (Dashboard)</span>
        </a>

        <a href="${base}/admin/teams.php"
           class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-3 ${activeAdminNav === 'teams' ? 'active bg-navy border-navy text-white fw-bold' : ''}">
          <i class="bi bi-shield-shaded fs-5"></i>
          <span class="text-nowrap">รายการทีมลงทะเบียน</span>
        </a>

        ${['SUPER_ADMIN','DOCUMENT_VERIFIER','SAT_OFFICER'].includes(user.roleCode)?`<a href="${base}/admin/women.php" class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-3"><i class="bi bi-shield fs-5"></i><span>รับสมัครหญิง U18 · จังหวัด</span></a>`:''}

        <a href="${base}/admin/players.php" class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-3 ${activeAdminNav === 'players' ? 'active bg-navy border-navy text-white fw-bold' : ''}">
          <i class="bi bi-person-badge fs-5"></i>
          <span class="text-nowrap">รายการนักกีฬา</span>
        </a>

        <button type="button" class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-3 border-0 ${['teams-u14', 'teams-u16', 'teams-u18'].includes(activeAdminNav) ? 'active bg-navy text-white fw-bold' : ''}" data-bs-toggle="collapse" data-bs-target="#adminDistrictTeamsMenu" aria-expanded="${['teams-u14', 'teams-u16', 'teams-u18'].includes(activeAdminNav) ? 'true' : 'false'}" aria-controls="adminDistrictTeamsMenu">
          <i class="bi bi-people-fill fs-5"></i>
          <span>รายการทีมลงแต่ละเขต / อำเภอ</span>
          <i class="bi bi-chevron-down ms-auto small"></i>
        </button>

        <div class="collapse ${['teams-u14', 'teams-u16', 'teams-u18'].includes(activeAdminNav) ? 'show' : ''}" id="adminDistrictTeamsMenu">

        <a href="${base}/admin/teams-u14.php"
           class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-2 ps-4 ${activeAdminNav === 'teams-u14' ? 'active bg-navy border-navy text-white fw-bold' : ''}">
          <i class="bi bi-table fs-6 text-success"></i>
          <span class="text-nowrap small">U14 แต่ละเขต / อำเภอ</span>
        </a>

        <a href="${base}/admin/teams-u16.php"
           class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-2 ps-4 ${activeAdminNav === 'teams-u16' ? 'active bg-navy border-navy text-white fw-bold' : ''}">
          <i class="bi bi-table fs-6 text-info"></i>
          <span class="text-nowrap small">U16 แต่ละเขต / อำเภอ</span>
        </a>

        <a href="${base}/admin/teams-u18.php"
           class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-2 ps-4 ${activeAdminNav === 'teams-u18' ? 'active bg-navy border-navy text-white fw-bold' : ''}">
          <i class="bi bi-table fs-6 text-warning"></i>
          <span class="text-nowrap small">U18 แต่ละเขต / อำเภอ</span>
        </a>
        </div>

        <button type="button" class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-3 border-0 ${activeAdminNav.startsWith('bracket-') ? 'active bg-navy text-white fw-bold' : ''}" data-bs-toggle="collapse" data-bs-target="#adminDistrictBracketMenu" aria-expanded="${activeAdminNav.startsWith('bracket-') ? 'true' : 'false'}" aria-controls="adminDistrictBracketMenu">
          <i class="bi bi-diagram-3 fs-5 text-primary"></i><span>ตารางแข่งระดับ เขต/อำเภอ</span><i class="bi bi-chevron-down ms-auto small"></i>
        </button>
        <div class="collapse ${activeAdminNav.startsWith('bracket-') ? 'show' : ''}" id="adminDistrictBracketMenu">
          <a href="${base}/admin/bracket-u14.php" class="list-group-item list-group-item-action d-flex align-items-center gap-2 ps-4 py-2 ${activeAdminNav === 'bracket-u14' ? 'active bg-navy border-navy text-white fw-bold' : ''}"><i class="bi bi-trophy-fill fs-6 text-success"></i><span class="small">ตารางแข่ง U14</span></a>
          <a href="${base}/admin/bracket-u16.php" class="list-group-item list-group-item-action d-flex align-items-center gap-2 ps-4 py-2 ${activeAdminNav === 'bracket-u16' ? 'active bg-navy border-navy text-white fw-bold' : ''}"><i class="bi bi-trophy-fill fs-6 text-info"></i><span class="small">ตารางแข่ง U16</span></a>
          <a href="${base}/admin/bracket-u18.php" class="list-group-item list-group-item-action d-flex align-items-center gap-2 ps-4 py-2 ${activeAdminNav === 'bracket-u18' ? 'active bg-navy border-navy text-white fw-bold' : ''}"><i class="bi bi-trophy-fill fs-6 text-warning"></i><span class="small">ตารางแข่ง U18</span></a>
        </div>

        <button type="button" class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-3 border-0 ${isReportNavActive ? 'active bg-navy text-white fw-bold' : ''}" data-bs-toggle="collapse" data-bs-target="#adminReportsMenu" aria-expanded="${isReportNavActive ? 'true' : 'false'}" aria-controls="adminReportsMenu">
          <i class="bi bi-clipboard-data fs-5"></i>
          <span>รายงานการสมัคร</span>
          <i class="bi bi-chevron-down ms-auto small"></i>
        </button>
        <div class="collapse ${isReportNavActive ? 'show' : ''}" id="adminReportsMenu">
          ${reportMenuItems.map(item => `
          <a href="${base}${item.href}" class="list-group-item list-group-item-action d-flex align-items-center gap-2 ps-4 py-2 ${activeAdminNav === item.nav ? 'active bg-navy border-navy text-white fw-bold' : ''}">
            <i class="bi ${item.icon} fs-6 ${item.color}"></i>
            <span style="white-space: normal; line-height: 1.3;">${item.label}</span>
          </a>`).join('')}
        </div>

        ${canViewDemoMenu ? `
        <button type="button" class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-3 border-0 ${isDemoNavActive ? 'active bg-navy text-white fw-bold' : ''}" data-bs-toggle="collapse" data-bs-target="#adminDemoMenu" aria-expanded="${isDemoNavActive ? 'true' : 'false'}" aria-controls="adminDemoMenu">
          <i class="bi bi-easel2 fs-5"></i>
          <span>Demo ระบบ</span>
          <i class="bi bi-chevron-down ms-auto small"></i>
        </button>
        <div class="collapse ${isDemoNavActive ? 'show' : ''}" id="adminDemoMenu">
          <a href="${base}/admin/teams-demo.php" class="list-group-item list-group-item-action d-flex align-items-center gap-2 ps-4 py-2 ${activeAdminNav === 'teams-demo' ? 'active bg-navy border-navy text-white fw-bold' : ''}">
            <i class="bi bi-people-fill fs-6 text-info"></i>
            <span class="small">รายชื่อทีม</span>
          </a>
          ${isSuperAdmin ? `<a href="${base}/team/register-demo.php" class="list-group-item list-group-item-action d-flex align-items-center gap-2 ps-4 py-2 ${activeAdminNav === 'team-register-demo' ? 'active bg-navy border-navy text-white fw-bold' : ''}">
            <i class="bi bi-pencil-square fs-6 text-warning"></i>
            <span class="small">ระบบสมัครทีม Demo</span>
          </a>` : ''}
          <a href="/phase2demo/workspace/dashboard" target="_blank" rel="noopener noreferrer" class="list-group-item list-group-item-action d-flex align-items-center gap-2 ps-4 py-2">
            <i class="bi bi-diagram-3 fs-6 text-primary"></i>
            <span class="small">การจัดการแข่งขัน</span>
          </a>
        </div>

        ` : ''}

        ${isSuperAdmin ? `
        <a href="${base}/admin/users.php"
           class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-3 ${activeAdminNav === 'users' ? 'active bg-navy border-navy text-white fw-bold' : ''}">
          <i class="bi bi-people-fill fs-5"></i>
          <span class="text-nowrap">จัดการบัญชีผู้ดูแล</span>
        </a>

        <a href="${base}/admin/sat-officers.php"
           class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-3 ${activeAdminNav === 'sat-officers' ? 'active bg-navy border-navy text-white fw-bold' : ''}">
          <i class="bi bi-building-badge fs-5"></i>
          <span class="text-nowrap">ข้อมูลเจ้าหน้าที่ กกท.</span>
        </a>

        <a href="${base}/admin/permissions.php"
           class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-3 ${activeAdminNav === 'permissions' ? 'active bg-navy border-navy text-white fw-bold' : ''}">
          <i class="bi bi-key-fill fs-5"></i>
          <span class="text-nowrap">จัดการสิทธิการเข้าถึงเมนู</span>
        </a>

        <a href="${base}/admin/audit-log.php"
           class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-3 ${activeAdminNav === 'audit-log' ? 'active bg-navy border-navy text-white fw-bold' : ''}">
          <i class="bi bi-journal-text fs-5"></i>
          <span class="text-nowrap">Audit Log</span>
        </a>
        ` : ''}

        <a href="${base}/admin/logout"
           class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-3 text-danger fw-semibold">
          <i class="bi bi-box-arrow-right fs-5"></i>
          <span class="text-nowrap">ออกจากระบบ</span>
        </a>
        <a href="${base}/admin/support-reports.php" class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-3 ${activeAdminNav === 'support-reports' ? 'active bg-navy border-navy text-white fw-bold' : ''}">
          <i class="bi bi-inbox fs-5"></i><span>รายการปัญหาการใช้งานระบบ</span>
        </a>
        <div class="p-3 border-top">${supportActionHtml}</div>
      </div>
    </div>
  </div>`;

  const fullContent = `
  <div class="row g-4">
    ${sidebar}
    <div class="col-lg flex-grow-1">
      ${bodyContent}
    </div>
  </div>`;

  const effectiveNav = user.roleCode === 'SAT_OFFICER' ? 'sat_admin' : 'admin';
  return renderLayout(title, fullContent, effectiveNav, base, true, user);
}
