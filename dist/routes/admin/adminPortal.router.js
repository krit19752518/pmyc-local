"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminPortalRouter = void 0;
const teamArea_1 = require("../../utils/teamArea");
const teamCategory_service_1 = require("../../services/teamCategory.service");
const teamRegistrationRank_service_1 = require("../../services/teamRegistrationRank.service");
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const db_1 = require("../../db");
const adminLayout_1 = require("../../adminLayout");
const statusHelper_1 = require("../../utils/statusHelper");
const auditLog_service_1 = require("../../services/auditLog.service");
const dbTransaction_service_1 = require("../../services/dbTransaction.service");
const adminSession_service_1 = require("../../services/adminSession.service");
const layout_1 = require("../../layout");
const bracketHelper_1 = require("../../utils/bracketHelper");
const adminTeamEdit_router_1 = require("./adminTeamEdit.router");
const adminPlayerVerification_router_1 = require("./adminPlayerVerification.router");
const playerVerification_1 = require("../../views/playerVerification");
const adminAuth_1 = require("../../adminAuth");
const app_1 = require("../../app");
const getRegionByProvince = (province) => {
    const p = (province || '').trim();
    if (['เชียงใหม่', 'เชียงราย', 'ลำปาง', 'ลำพูน', 'แม่ฮ่องสอน', 'น่าน', 'พะเยา', 'แพร่', 'อุตรดิตถ์', 'ตาก', 'สุโขทัย', 'พิษณุโลก', 'พิจิตร', 'กำแพงเพชร', 'เพชรบูรณ์', 'นครสวรรค์', 'อุทัยธานี'].includes(p))
        return 'ภาคเหนือ';
    if (['ขอนแก่น', 'นครราชสีมา', 'อุดรธานี', 'อุบลราชสีมา', 'บุรีรัมย์', 'สุรินทร์', 'ร้อยเอ็ด', 'สกลนคร', 'กาฬสินธุ์', 'มหาสารคาม', 'เลย', 'หนองคาย', 'ยโสธร', 'ศรีสะเกษ', 'หนองบัวลำภู', 'บึงกาฬ', 'นครพนม', 'มุกดาหาร', 'อำนาจเจริญ', 'ชัยภูมิ'].includes(p))
        return 'ภาคตะวันออกเฉียงเหนือ';
    if (['กรุงเทพมหานคร', 'ปทุมธานี', 'นนทบุรี', 'สมุทรปราการ', 'พระนครศรีอยุธยา', 'อ่างทอง', 'ลพบุรี', 'สิงห์บุรี', 'ชัยนาท', 'สระบุรี', 'นครนายก', 'สุพรรณบุรี', 'นครปฐม', 'สมุทรสาคร', 'สมุทรสงคราม'].includes(p))
        return 'ภาคกลาง';
    if (['ชลบุรี', 'ระยอง', 'จันทบุรี', 'ตราด', 'ฉะเชิงเทรา', 'ปราจีนบุรี', 'สระแก้ว'].includes(p))
        return 'ภาคตะวันออก';
    if (['สงขลา', 'ภูเก็ต', 'สุราษฎร์ธานี', 'นครศรีธรรมราช', 'กระบี่', 'พังงา', 'ตรัง', 'พัทลุง', 'สตูล', 'ยะลา', 'ปัตตานี', 'นราธิวาส', 'ชุมพร', 'ระนอง'].includes(p))
        return 'ภาคใต้';
    if (['กาญจนบุรี', 'ราชบุรี', 'เพชรบุรี', 'ประจวบคีรีขันธ์'].includes(p))
        return 'ภาคตะวันตก';
    return 'ภาคกลาง';
};
// Shared presentation for the team inspection and athlete detail dialogs.
// Keep existing field IDs so document review and save handlers remain unchanged.
function renderAthleteInformation(prefix) {
    const field = (label, suffix, full = false) => `<div class="athlete-field${full ? ' athlete-field-wide' : ''}"><dt>${label}</dt><dd id="${prefix}${suffix}">-</dd></div>`;
    const section = (title, fields) => `<section class="athlete-section card border-0 shadow-sm"><div class="card-body p-3"><h6 class="fw-bold border-bottom pb-2 mb-2">${title}</h6><dl class="athlete-fields small mb-0">${fields}</dl></div></section>`;
    return section('ข้อมูลทั่วไป', field('คำนำหน้า ชื่อ นามสกุล', 'Name', true) + field('เลขบัตรประชาชน', 'IdCard') + field('วันเกิด', 'BirthDate')) +
        section('ข้อมูลทีม', field('สังกัดทีม', 'School', true) + field('รุ่นอายุ', 'Cat') +
            field('เบอร์เสื้อ', 'JerseyNo') + field('ชื่อย่อบนเสื้อ', 'JerseyName') + field('ตำแหน่ง', 'Pos')) +
        section('ข้อมูลอื่นๆ', field('ส่วนสูง / น้ำหนัก', 'HW') + field('ระดับชั้น', 'Grade') +
            field('ผู้ปกครอง / ความสัมพันธ์', 'Guardian', true) + field('เบอร์โทรศัพท์', 'Phone'));
}
const athleteReviewStyles = `<style>
  .athlete-review-modal .modal-dialog { width: calc(100% - 2rem); max-width: 960px; margin: 1rem auto; min-height: calc(100% - 2rem); }
  .athlete-review-modal .modal-content { max-height: calc(100vh - 2rem); max-height: calc(100dvh - 2rem); min-width: 0; overflow: hidden; }
  .athlete-review-modal .modal-header { background: #fff; color: #12304a; gap: .75rem; }
  .athlete-review-modal .modal-header h5 { color: #12304a; min-width: 0; overflow-wrap: anywhere; }
  .athlete-review-modal .modal-header .btn-close { filter: none; flex-shrink: 0; }
  .athlete-review-modal .modal-header, .athlete-review-modal .modal-footer { flex-shrink: 0; }
  .athlete-review-modal .modal-body { min-height: 0; overflow-y: auto; }
  .athlete-review-modal .row > *, .athlete-review-modal .card, .athlete-review-modal .card-body { min-width: 0; }
  .athlete-review-modal .card { overflow-wrap: anywhere; }
  .athlete-review-modal .modal-body img { max-width: 100%; }
  .athlete-review-modal .athlete-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: .75rem; }
  .athlete-review-modal .athlete-layout > * { min-width: 0; }
  .athlete-review-modal .athlete-photo-column { align-self: start; }
  .athlete-review-modal .athlete-photo-panel { max-width: 160px; margin: 0 auto; text-align: center; }
  .athlete-review-modal .athlete-photo-panel img { display: block; width: 100%; max-width: 120px; height: auto; max-height: 160px; object-fit: contain; margin: 0 auto; }
  .athlete-review-modal .athlete-detail-column { display: contents; }
  .athlete-review-modal .athlete-detail-column > .card { grid-column: 1 / -1; margin-bottom: 0 !important; }
  .athlete-review-modal .athlete-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .625rem .875rem; }
  .athlete-review-modal .athlete-field-wide { grid-column: 1 / -1; }
  .athlete-review-modal dt { color: #364152; margin-bottom: .25rem; }
  .athlete-review-modal dd { color: #212529; margin: 0; white-space: normal; overflow-wrap: anywhere; }
  .athlete-review-modal [id$="DocsList"] > div { flex-wrap: wrap; gap: .5rem; }
  .athlete-review-modal [id$="DocsList"] > div > span { min-width: 0; flex: 1 1 10rem; }
  .athlete-review-modal [id$="DocsList"] a { display: inline-flex; align-items: center; min-height: 44px; max-width: 100%; white-space: normal; }
  .athlete-review-modal select, .athlete-review-modal textarea { max-width: 100%; min-width: 0; }
  .athlete-review-modal .modal-footer, .athlete-review-modal .modal-footer > div { display: flex; flex-wrap: wrap; gap: .5rem; }
  .athlete-review-modal .modal-footer button { min-height: 44px; }
  @media (min-width: 992px) {
    .athlete-review-modal .athlete-layout { grid-template-columns: minmax(0, 160px) minmax(0, 1fr); gap: .875rem 1rem; align-items: start; }
    .athlete-review-modal .athlete-photo-column { grid-column: 1; grid-row: 1; }
    .athlete-review-modal .athlete-detail-column > .athlete-section:first-child { grid-column: 2; grid-row: 1; }
    .athlete-review-modal .athlete-detail-column > .athlete-section:nth-child(2) .athlete-fields { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
  @media (max-width: 767.98px) {
    .athlete-review-modal .athlete-fields { grid-template-columns: minmax(0, 1fr); }
    .athlete-review-modal .modal-body { padding: 1rem !important; }
    .athlete-review-modal .modal-footer button { white-space: normal; }
  }
</style>`;
function renderAthleteExtraFields(prefix) {
    // Populate text only; never interpolate personal data as HTML.
    return `
      const setAthleteText = (suffix, value) => {
        const el = document.getElementById('${prefix}' + suffix);
        if (el) el.textContent = value || '-';
      };
      const fullAthleteName = [p.prefix, p.firstName || p.first_name, p.middleName || p.middle_name, p.lastName || p.last_name].filter(Boolean).join(' ');
      setAthleteText('Name', fullAthleteName || p.name);
      setAthleteText('IdCard', p.idCard || p.id_card);
      setAthleteText('JerseyName', p.jerseyName || p.jersey_name);
      const birthValue = p.birthDate || p.birth_date;
      const birthMatch = typeof birthValue === 'string' && birthValue.match(/^(\\d{4})-(\\d{2})-(\\d{2})(?:T.*)?$/);
      let birthText = '-';
      if (birthMatch) {
        const birth = new Date(Date.UTC(Number(birthMatch[1]), Number(birthMatch[2]) - 1, Number(birthMatch[3])));
        if (birth.getUTCFullYear() === Number(birthMatch[1]) && birth.getUTCMonth() === Number(birthMatch[2]) - 1 && birth.getUTCDate() === Number(birthMatch[3])) {
          birthText = birth.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
        }
      }
      setAthleteText('BirthDate', birthText);
      setAthleteText('Guardian', (p.guardianName || p.guardian_name || '-') + (p.guardianRelation || p.guardian_relation ? ' (' + (p.guardianRelation || p.guardian_relation) + ')' : ''));
      setAthleteText('Phone', p.guardianPhone || p.guardian_phone || p.phone);
  `;
}
const router = (0, express_1.Router)();
exports.adminPortalRouter = router;
router.use(adminTeamEdit_router_1.adminTeamEditRouter);
// Verification starts only on scoped requests, never during application startup.
router.use(adminPlayerVerification_router_1.adminPlayerVerificationRouter);
// Page 6: /admin/index.php (กกท. กลาง Login), /admin/sat-login.php (กกท. จังหวัด Login), /admin/dashboard.php & /admin/users.php
router.get('/admin/index.php', (req, res) => {
    const base = (0, app_1.getBaseUrl)(req);
    let errorMsg = '';
    if (req.query.error === 'sat_role_required') {
        errorMsg = '<div class="alert alert-warning py-2 px-3 small border-0 mb-3"><i class="bi bi-exclamation-triangle-fill me-1"></i> บัญชีนี้เป็นเจ้าหน้าที่ กกท. จังหวัด กรุณาเข้าสู่ระบบผ่านเมนู "กกท. จังหวัด"</div>';
    }
    else if (req.query.expired === '1') {
        errorMsg = '<div class="alert alert-warning py-2 px-3 small border-0 mb-3"><i class="bi bi-clock-history me-1"></i> Session หมดอายุ กรุณาเข้าสู่ระบบ กกท. กลางอีกครั้ง</div>';
    }
    else if (req.query.error === 'unauthorized') {
        errorMsg = '<div class="alert alert-warning py-2 px-3 small border-0 mb-3"><i class="bi bi-exclamation-triangle-fill me-1"></i> กรุณาเข้าสู่ระบบก่อนใช้งาน</div>';
    }
    else if (req.query.error) {
        errorMsg = '<div class="alert alert-danger py-2 px-3 small border-0 mb-3"><i class="bi bi-exclamation-circle me-1"></i> ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง</div>';
    }
    const content = `
  <div class="row justify-content-center">
    <div class="col-md-6 col-lg-5">
      <div class="card p-4 shadow-sm border-0 rounded-3">
        <h4 class="fw-bold text-navy mb-3"><i class="bi bi-gear-wide-connected"></i> เข้าสู่ระบบ กกท. กลาง / ผู้ดูแลระบบ</h4>
        ${errorMsg}
        <form action="${base}/admin/dashboard.php" method="POST">
          <input type="hidden" name="login_type" value="central">
          <div class="mb-3">
            <label class="form-label fw-semibold">ชื่อผู้ใช้งาน (Username)</label>
            <input type="text" name="username" class="form-control" placeholder="กรอกชื่อผู้ใช้งาน" required>
          </div>
          <div class="mb-3">
            <label class="form-label fw-semibold">รหัสผ่าน (Password)</label>
            <div class="input-group">
              <input type="password" name="password" id="admin_password" class="form-control" placeholder="กรอกรหัสผ่าน" required>
              <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('admin_password', this)">
                <i class="bi bi-eye"></i>
              </button>
            </div>
          </div>
          <button type="submit" class="btn btn-navy btn-lg w-100 fw-bold btn-primary mt-2">
            <i class="bi bi-shield-lock"></i> เข้าสู่ระบบ กกท. กลาง
          </button>
        </form>
      </div>
    </div>
  </div>`;
    res.send((0, layout_1.renderLayout)('เข้าสู่ระบบ กกท. กลาง', content, 'admin', base));
});
// Dedicated Login for กกท. จังหวัด
router.get('/admin/sat-login.php', (req, res) => {
    const base = (0, app_1.getBaseUrl)(req);
    let errorMsg = '';
    if (req.query.error === 'central_role_required') {
        errorMsg = '<div class="alert alert-warning py-2 px-3 small border-0 mb-3"><i class="bi bi-exclamation-triangle-fill me-1"></i> บัญชีนี้เป็นผู้ดูแลระบบ / กกท. กลาง กรุณาเข้าสู่ระบบผ่านเมนู "กกท. กลาง"</div>';
    }
    else if (req.query.expired === '1') {
        errorMsg = '<div class="alert alert-warning py-2 px-3 small border-0 mb-3"><i class="bi bi-clock-history me-1"></i> Session หมดอายุ กรุณาเข้าสู่ระบบเจ้าหน้าที่ กกท. จังหวัดอีกครั้ง</div>';
    }
    else if (req.query.error === 'unauthorized') {
        errorMsg = '<div class="alert alert-warning py-2 px-3 small border-0 mb-3"><i class="bi bi-exclamation-triangle-fill me-1"></i> กรุณาเข้าสู่ระบบก่อนใช้งาน</div>';
    }
    else if (req.query.error) {
        errorMsg = '<div class="alert alert-danger py-2 px-3 small border-0 mb-3"><i class="bi bi-exclamation-circle me-1"></i> ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง</div>';
    }
    const content = `
  <div class="row justify-content-center">
    <div class="col-md-6 col-lg-5">
      <div class="card p-4 shadow-sm border-0 rounded-3">
        <h4 class="fw-bold text-navy mb-3"><i class="bi bi-building"></i> เข้าสู่ระบบ เจ้าหน้าที่ กกท. จังหวัด</h4>
        ${errorMsg}
        <form action="${base}/sat-admin/dashboard.php" method="POST">
          <input type="hidden" name="login_type" value="sat_officer">
          <div class="mb-3">
            <label class="form-label fw-semibold">ชื่อผู้ใช้งาน (Username)</label>
            <input type="text" name="username" class="form-control" placeholder="กรอกชื่อผู้ใช้งานเจ้าหน้าที่ กกท. จังหวัด" required>
          </div>
          <div class="mb-3">
            <label class="form-label fw-semibold">รหัสผ่าน (Password)</label>
            <div class="input-group">
              <input type="password" name="password" id="sat_admin_password" class="form-control" placeholder="กรอกรหัสผ่าน" required>
              <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('sat_admin_password', this)">
                <i class="bi bi-eye"></i>
              </button>
            </div>
          </div>
          <button type="submit" class="btn btn-success btn-lg w-100 fw-bold mt-2">
            <i class="bi bi-shield-check"></i> เข้าสู่ระบบ กกท. จังหวัด
          </button>
          <div class="text-center mt-3">
            <a href="https://docs.google.com/document/d/16zuzXWyXrRJxr2UuS7hQbVu63OWR4zDI2yVDgxUeA8I/edit?tab=t.0" target="_blank" rel="noopener noreferrer">
              <i class="bi bi-file-earmark-text me-1"></i> เอกสารคู่มือการใช้งาน
            </a>
          </div>
        </form>
      </div>
    </div>
  </div>`;
    res.send((0, layout_1.renderLayout)('เข้าสู่ระบบ กกท. จังหวัด', content, 'sat_admin', base));
});
// POST Admin Login Handler (Uses Encrypted HTTP-Only Cookie Session)
router.post('/admin/dashboard.php', async (req, res) => {
    const base = (0, app_1.getBaseUrl)(req);
    const { username, password, login_type } = req.body;
    const isSatLogin = login_type === 'sat_officer';
    const loginRedirectPath = isSatLogin ? `${base}/sat-admin/login.php` : `${base}/admin/index.php`;
    if (!username || !password) {
        return res.redirect(`${loginRedirectPath}?error=invalid`);
    }
    const u = username.trim();
    const p = password.trim();
    const currentUser = await (0, adminAuth_1.authenticateAdmin)(u, p);
    if (!currentUser) {
        return res.redirect(`${loginRedirectPath}?error=invalid`);
    }
    // Enforce Role-based login portal scoping
    if (isSatLogin && currentUser.roleCode !== 'SAT_OFFICER') {
        return res.redirect(`${base}/sat-admin/login.php?error=central_role_required`);
    }
    if (!isSatLogin && currentUser.roleCode === 'SAT_OFFICER') {
        return res.redirect(`${base}/admin/index.php?error=sat_role_required`);
    }
    const portal = isSatLogin ? 'sat' : 'central';
    res.setHeader('Set-Cookie', (0, adminSession_service_1.buildAdminSessionCookies)(req, currentUser, portal));
    return res.redirect(isSatLogin ? `${base}/sat-admin/dashboard.php` : `${base}/admin/dashboard.php`);
});
// Admin Logout Handler
router.get(['/admin/logout', '/admin/logout.php'], async (req, res) => {
    const base = (0, app_1.getBaseUrl)(req);
    const portal = (0, adminSession_service_1.adminPortalForRequest)(req);
    res.setHeader('Set-Cookie', (0, adminSession_service_1.clearAdminSessionCookies)(req, portal));
    const redirectUrl = portal === 'sat' ? `${base}/sat-admin/login.php` : `${base}/admin/index.php`;
    return res.redirect(redirectUrl);
});
// API GET /api/admin/export-metric-excel (Export Dashboard Metric Modal Data to Excel)
router.get('/api/admin/export-metric-excel', async (req, res) => {
    try {
        const ExcelJS = require('exceljs');
        const { category, username } = req.query;
        const catStr = (category || 'all_teams').toString();
        const usernameStr = (username || 'admin').toString();
        let currentUser = await (0, adminAuth_1.getAdminUserByUsername)(usernameStr);
        if (!currentUser) {
            currentUser = {
                id: 'ADM-001',
                username: 'admin',
                fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)',
                roleCode: 'SUPER_ADMIN',
                roleName: 'ผู้ดูแลระบบสูงสุด',
                permissions: ['teams:read', 'teams:verify', 'users:manage', 'system:all']
            };
        }
        const allRegisteredTeams = await (0, app_1.getDbRegisteredTeams)();
        const activeRegisteredTeams = allRegisteredTeams.filter(t => !t.is_deleted);
        const allPlayers = await (0, app_1.getDbPlayers)();
        const isSatOfficer = currentUser.roleCode === 'SAT_OFFICER';
        const registeredTeams = isSatOfficer && currentUser.province
            ? activeRegisteredTeams.filter(t => t.province === currentUser.province)
            : activeRegisteredTeams;
        const teamIds = new Set(registeredTeams.map(t => t.id));
        const scopedPlayers = isSatOfficer
            ? allPlayers.filter(p => p.teamId && teamIds.has(p.teamId))
            : allPlayers;
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Export Data');
        // Document type label for filename
        const categoryDocNameMap = {
            'all_teams': 'รายการทีมทั้งหมด',
            'pending_teams': 'รายการทีมรอตรวจสอบ',
            'approved_teams': 'รายการทีมรับรองแล้ว',
            'rejected_teams': 'รายการทีมคุณสมบัติไม่ผ่าน',
            'men_teams': 'รายการทีมชาย',
            'women_teams': 'รายการทีมหญิง',
            'all_athletes': 'รายการนักกีฬาทั้งหมด',
            'male_athletes': 'รายการนักกีฬาชาย',
            'female_athletes': 'รายการนักกีฬาหญิง',
            'matches': 'รายการโปรแกรมแข่งขัน',
            'live_matches': 'รายการแข่งขันสด',
            'finished_matches': 'รายการแข่งขันที่จบแล้ว'
        };
        const categoryDocName = categoryDocNameMap[catStr] || 'รายการข้อมูล';
        // School, FirstName, LastName extracted from user / master data profile
        const schoolName = currentUser.province ? `กกท_${currentUser.province}` : 'สมาคมกีฬาฟุตบอลแห่งประเทศไทย';
        // Parse fullname into firstname and lastname
        const nameParts = (currentUser.fullname || 'ผู้ดูแลระบบ สูงสุด').replace(/[\(\)]/g, '').trim().split(' ');
        const firstName = nameParts[0] || 'ผู้ดูแลระบบ';
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join('_') : 'สูงสุด';
        // Format filename: ชื่อโรงเรียน_ชื่อจริง_นามสกุล_ประเภทเอกสาร.xlsx
        const cleanStr = (s) => s.replace(/[/\\?%*:|"<> ]/g, '_');
        const exportFileName = `${cleanStr(schoolName)}_${cleanStr(firstName)}_${cleanStr(lastName)}_${cleanStr(categoryDocName)}.xlsx`;
        // Populate Excel Worksheet Rows & Headers based on Category
        if (catStr.includes('team')) {
            const filteredTeams = registeredTeams.filter(t => {
                if (catStr === 'pending_teams')
                    return t.status === 'PENDING';
                if (catStr === 'approved_teams')
                    return t.status === 'APPROVED';
                if (catStr === 'rejected_teams')
                    return t.status === 'REJECTED';
                if (catStr === 'men_teams')
                    return t.gender === 'boy' || !t.gender;
                if (catStr === 'women_teams')
                    return t.gender === 'girl';
                return true;
            });
            worksheet.columns = [
                { header: 'ลำดับ', key: 'no', width: 8 },
                { header: 'ชื่อทีม/โรงเรียน', key: 'teamName', width: 30 },
                { header: 'จังหวัด', key: 'province', width: 20 },
                { header: 'ผู้จัดการทีม', key: 'managerName', width: 25 },
                { header: 'เบอร์โทรศัพท์', key: 'phone', width: 18 },
                { header: 'ประเภททีม', key: 'gender', width: 12 },
                { header: 'สถานะรับรอง', key: 'status', width: 18 },
                { header: 'รุ่นอายุการแข่งขัน', key: 'categories', width: 25 }
            ];
            filteredTeams.forEach((t, idx) => {
                worksheet.addRow({
                    no: idx + 1,
                    teamName: t.teamName || t.school || t.name || '',
                    province: t.province || '-',
                    managerName: t.managerName || '-',
                    phone: t.phone || '-',
                    gender: (t.gender === 'girl') ? 'หญิง' : 'ชาย',
                    status: t.status === 'APPROVED' ? 'อนุมัติทีม' : 'รอตรวจสอบทีม',
                    categories: t.categories || ''
                });
            });
        }
        else if (catStr.includes('athlete')) {
            const filteredPlayers = scopedPlayers.filter((p) => {
                if (catStr === 'male_athletes')
                    return p.gender === 'boy' || !p.gender;
                if (catStr === 'female_athletes')
                    return p.gender === 'girl';
                return true;
            });
            worksheet.columns = [
                { header: 'ลำดับ', key: 'no', width: 8 },
                { header: 'คำนำหน้า', key: 'prefix', width: 12 },
                { header: 'ชื่อ', key: 'firstName', width: 20 },
                { header: 'นามสกุล', key: 'lastName', width: 20 },
                { header: 'ชื่อเต็ม', key: 'fullname', width: 30 },
                { header: 'สังกัดทีม', key: 'teamName', width: 30 },
                { header: 'หมายเลขเสื้อ', key: 'jerseyNo', width: 15 },
                { header: 'ตำแหน่ง', key: 'position', width: 20 },
                { header: 'เพศ', key: 'gender', width: 10 },
                { header: 'เลขประจำตัวประชาชน', key: 'idCard', width: 22 },
                { header: 'รุ่นอายุ', key: 'category', width: 12 }
            ];
            filteredPlayers.forEach((p, idx) => {
                const teamObj = registeredTeams.find(tm => tm.id === p.teamId);
                const teamName = teamObj ? teamObj.teamName : (p.teamName || '-');
                worksheet.addRow({
                    no: idx + 1,
                    prefix: p.prefix || '',
                    firstName: p.firstName || '',
                    lastName: p.lastName || '',
                    fullname: p.fullname || p.name || '',
                    teamName: teamName,
                    jerseyNo: p.jerseyNumber || p.jerseyNo || p.number || '-',
                    position: p.position || 'นักกีฬา',
                    gender: (p.gender === 'girl') ? 'หญิง' : 'ชาย',
                    idCard: p.idCard || '-',
                    category: p.category || 'U14'
                });
            });
        }
        else {
            worksheet.columns = [
                { header: 'ลำดับ', key: 'no', width: 8 },
                { header: 'รายการ', key: 'title', width: 40 },
                { header: 'สถานะ', key: 'status', width: 20 }
            ];
            worksheet.addRow({
                no: 1,
                title: categoryDocName,
                status: 'ยังไม่มีข้อมูลการแข่งขัน'
            });
        }
        // Styling Header Row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF0B2A5B' } // Navy Header
        };
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(exportFileName)}"`);
        await workbook.xlsx.write(res);
        res.end();
    }
    catch (err) {
        console.error('Error generating Metric Excel export:', err);
        res.status(500).send('เกิดข้อผิดพลาดในการส่งออกไฟล์ Excel');
    }
});
router.get('/admin/dashboard.php', adminSession_service_1.checkAdminSession, async (req, res) => {
    const base = (0, app_1.getBaseUrl)(req);
    const currentUser = req.adminUser || {
        id: 'ADM-001',
        username: 'admin',
        fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)',
        roleCode: 'SUPER_ADMIN',
        roleName: 'ผู้ดูแลระบบสูงสุด',
        permissions: ['teams:read', 'teams:verify', 'users:manage', 'system:all']
    };
    const allRegisteredTeams = await (0, app_1.getDbRegisteredTeams)();
    const activeRegisteredTeams = allRegisteredTeams.filter(t => !Boolean(t.is_deleted || t.isDeleted));
    const allPlayers = await (0, app_1.getDbPlayers)();
    const isSatOfficer = currentUser.roleCode === 'SAT_OFFICER';
    const officerProv = (currentUser.province || '').trim().toLowerCase();
    const registeredTeams = isSatOfficer
        ? (officerProv ? activeRegisteredTeams.filter(t => (t.province || '').trim().toLowerCase() === officerProv) : [])
        : activeRegisteredTeams;
    const teamIds = new Set(registeredTeams.map(t => t.id));
    const scopedPlayers = isSatOfficer
        ? (officerProv ? allPlayers.filter(p => p.teamId && teamIds.has(p.teamId)) : [])
        : allPlayers;
    const deletedRegisteredTeams = allRegisteredTeams.filter(t => Boolean(t.is_deleted || t.isDeleted));
    const deletedTeams = isSatOfficer
        ? (officerProv ? deletedRegisteredTeams.filter(t => (t.province || '').trim().toLowerCase() === officerProv) : [])
        : deletedRegisteredTeams;
    const deletedTeamsCount = deletedTeams.length;
    const canPermanentlyDeleteTeams = currentUser.roleCode === 'SUPER_ADMIN' || (isSatOfficer && Boolean(officerProv));
    // Regional mapping helper
    const getRegionByProvince = (province) => {
        const p = (province || '').trim();
        if (['เชียงใหม่', 'เชียงราย', 'ลำปาง', 'ลำพูน', 'แม่ฮ่องสอน', 'น่าน', 'พะเยา', 'แพร่', 'อุตรดิตถ์', 'ตาก', 'สุโขทัย', 'พิษณุโลก', 'พิจิตร', 'กำแพงเพชร', 'เพชรบูรณ์', 'นครสวรรค์', 'อุทัยธานี'].includes(p))
            return 'ภาคเหนือ';
        if (['ขอนแก่น', 'นครราชสีมา', 'อุดรธานี', 'อุบลราชธานี', 'บุรีรัมย์', 'สุรินทร์', 'ร้อยเอ็ด', 'สกลนคร', 'กาฬสินธุ์', 'มหาสารคาม', 'เลย', 'หนองคาย', 'ยโสธร', 'ศรีสะเกษ', 'หนองบัวลำภู', 'บึงกาฬ', 'นครพนม', 'มุกดาหาร', 'อำนาจเจริญ', 'ชัยภูมิ'].includes(p))
            return 'ภาคตะวันออกเฉียงเหนือ';
        if (['กรุงเทพมหานคร', 'ปทุมธานี', 'นนทบุรี', 'สมุทรปราการ', 'พระนครศรีอยุธยา', 'อ่างทอง', 'ลพบุรี', 'สิงห์บุรี', 'ชัยนาท', 'สระบุรี', 'นครนายก', 'สุพรรณบุรี', 'นครปฐม', 'สมุทรสาคร', 'สมุทรสงคราม'].includes(p))
            return 'ภาคกลาง';
        if (['ชลบุรี', 'ระยอง', 'จันทบุรี', 'ตราด', 'ฉะเชิงเทรา', 'ปราจีนบุรี', 'สระแก้ว'].includes(p))
            return 'ภาคตะวันออก';
        if (['สงขลา', 'ภูเก็ต', 'สุราษฎร์ธานี', 'นครศรีธรรมราช', 'กระบี่', 'พังงา', 'ตรัง', 'พัทลุง', 'สตูล', 'ยะลา', 'ปัตตานี', 'นราธิวาส', 'ชุมพร', 'ระนอง'].includes(p))
            return 'ภาคใต้';
        if (['กาญจนบุรี', 'ราชบุรี', 'เพชรบุรี', 'ประจวบคีรีขันธ์'].includes(p))
            return 'ภาคตะวันตก';
        return 'ภาคกลาง';
    };
    // Calculate Statistics strictly from actual DB/Memory records
    const totalTeamsCount = registeredTeams.length;
    const pendingTeamsCount = registeredTeams.filter(t => t.status === 'PENDING').length;
    const approvedTeamsCount = registeredTeams.filter(t => t.status === 'APPROVED').length;
    const rejectedTeamsCount = registeredTeams.filter(t => t.status === 'REJECTED').length;
    const menTeamsCount = registeredTeams.filter(t => t.gender === 'boy' || !t.gender).length;
    const totalAthletesCount = scopedPlayers.length;
    const maleAthletesCount = scopedPlayers.filter(p => p.gender === 'boy' || !p.gender).length;
    // Regional counts for Donut Chart strictly from actual DB records
    const regionCounts = {
        'ภาคกลาง': 0,
        'ภาคตะวันออก': 0,
        'ภาคเหนือ': 0,
        'ภาคตะวันออกเฉียงเหนือ': 0,
        'ภาคใต้': 0,
        'ภาคตะวันตก': 0
    };
    registeredTeams.forEach(t => {
        const reg = getRegionByProvince(t.province);
        regionCounts[reg] = (regionCounts[reg] || 0) + 1;
    });
    const bodyContent = `
  <style>
    .metric-card-hover {
      cursor: pointer;
      transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out, border-color 0.2s;
    }
    .metric-card-hover:hover {
      transform: translateY(-4px);
      box-shadow: 0 0.75rem 1.5rem rgba(11, 42, 91, 0.15) !important;
      border: 1px solid #0b2a5b !important;
    }
  </style>

  <div class="dashboard-container">
    <!-- Top Bar Title -->
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2">
      <div>
        <h4 class="fw-bold text-navy mb-1"><i class="bi bi-speedometer2 me-2"></i> แผงควบคุม (Dashboard)</h4>
        ${isSatOfficer
        ? `<span class="badge bg-info text-dark font-monospace fs-6"><i class="bi bi-geo-alt-fill me-1"></i> แสดงเฉพาะทีมพื้นที่จังหวัด: ${currentUser.province}</span>`
        : '<span class="badge bg-secondary font-monospace fs-6"><i class="bi bi-globe me-1"></i> ข้อมูลภาพรวมการแข่งขันทั่วประเทศ</span>'}
      </div>
      <span class="badge bg-navy px-3 py-2 fs-6"><i class="bi bi-person-circle me-1"></i> ${currentUser.fullname}</span>
    </div>

    <!-- 7 Cards Grid Layout (Direct Page View Navigation) -->
    <div class="row row-cols-2 row-cols-md-3 row-cols-xl-3 g-3 mb-4">
      <!-- Card 1: ทีมทั้งหมด -->
      <div class="col">
        <div class="card border-0 shadow-sm rounded-4 p-3 p-md-4 h-100 bg-white metric-card-hover" onclick="location.href='${base}/admin/teams.php?type=all_teams'">
          <div class="text-muted fw-semibold small d-flex justify-content-between align-items-center mb-2">
            <span><i class="bi bi-people text-secondary fs-6 me-1"></i> ทีมทั้งหมด</span>
            <i class="bi bi-chevron-right text-muted small"></i>
          </div>
          <div id="metric_total_teams" class="fs-2 fw-bold text-navy mb-0">${totalTeamsCount.toLocaleString()}</div>
          <div class="small text-primary mt-1" style="font-size: 0.78rem;"><i class="bi bi-hand-index-thumb me-1"></i>กดเพื่อดูรายการ</div>
        </div>
      </div>

      <!-- Card 2: รอตรวจสอบ -->
      <div class="col">
        <div class="card border-0 shadow-sm rounded-4 p-3 p-md-4 h-100 bg-white metric-card-hover" onclick="location.href='${base}/admin/teams.php?type=pending_teams'">
          <div class="text-muted fw-semibold small d-flex justify-content-between align-items-center mb-2">
            <span><i class="bi bi-hourglass-split text-warning fs-6 me-1"></i> รอตรวจสอบ</span>
            <i class="bi bi-chevron-right text-muted small"></i>
          </div>
          <div id="metric_pending_teams" class="fs-2 fw-bold text-navy mb-0">${pendingTeamsCount.toLocaleString()}</div>
          <div class="small text-warning mt-1" style="font-size: 0.78rem;"><i class="bi bi-hand-index-thumb me-1"></i>กดเพื่อดูรายการ</div>
        </div>
      </div>

      <!-- Card 3: รับรองแล้ว -->
      <div class="col">
        <div class="card border-0 shadow-sm rounded-4 p-3 p-md-4 h-100 bg-white metric-card-hover" onclick="location.href='${base}/admin/teams.php?type=approved_teams'">
          <div class="text-muted fw-semibold small d-flex justify-content-between align-items-center mb-2">
            <span><i class="bi bi-patch-check text-success fs-6 me-1"></i> รับรองแล้ว</span>
            <i class="bi bi-chevron-right text-muted small"></i>
          </div>
          <div id="metric_approved_teams" class="fs-2 fw-bold text-navy mb-0">${approvedTeamsCount.toLocaleString()}</div>
          <div class="small text-success mt-1" style="font-size: 0.78rem;"><i class="bi bi-hand-index-thumb me-1"></i>กดเพื่อดูรายการ</div>
        </div>
      </div>

      <!-- Card 4: คุณสมบัติไม่ผ่าน -->
      <div class="col">
        <div class="card border-0 shadow-sm rounded-4 p-3 p-md-4 h-100 bg-white metric-card-hover" onclick="location.href='${base}/admin/teams.php?type=rejected_teams'">
          <div class="text-muted fw-semibold small d-flex justify-content-between align-items-center mb-2">
            <span><i class="bi bi-exclamation-triangle text-danger fs-6 me-1"></i> คุณสมบัติไม่ผ่าน</span>
            <i class="bi bi-chevron-right text-muted small"></i>
          </div>
          <div id="metric_rejected_teams" class="fs-2 fw-bold text-navy mb-0">${rejectedTeamsCount.toLocaleString()}</div>
          <div class="small text-danger mt-1" style="font-size: 0.78rem;"><i class="bi bi-hand-index-thumb me-1"></i>กดเพื่อดูรายการ</div>
        </div>
      </div>

      <!-- Card 7: นักกีฬาทั้งหมด -->
      <div class="col">
        <div class="card border-0 shadow-sm rounded-4 p-3 p-md-4 h-100 bg-white metric-card-hover" onclick="location.href='${base}/admin/players.php?type=all_athletes'">
          <div class="text-muted fw-semibold small d-flex justify-content-between align-items-center mb-2">
            <span><i class="bi bi-person-badge text-primary fs-6 me-1"></i> นักกีฬาทั้งหมด</span>
            <i class="bi bi-chevron-right text-muted small"></i>
          </div>
          <div id="metric_total_athletes" class="fs-2 fw-bold text-navy mb-0">${totalAthletesCount.toLocaleString()}</div>
          <div class="small text-primary mt-1" style="font-size: 0.78rem;"><i class="bi bi-hand-index-thumb me-1"></i>กดเพื่อดูรายการ</div>
        </div>
      </div>

    </div>

    <!-- Regional Donut Chart Card -->
    <div class="card border-0 shadow-sm rounded-4 p-4 bg-white">
      <div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
        <h6 class="fw-bold text-navy mb-0 d-flex align-items-center gap-2">
          <i class="bi bi-pie-chart-fill text-primary"></i> จำนวนทีมแยกตามภาค
        </h6>
        ${isSatOfficer
        ? `<span class="badge bg-info text-dark font-monospace"><i class="bi bi-geo-alt-fill me-1"></i> ${currentUser.province}</span>`
        : '<span class="badge bg-light text-dark border">สถิติรวมทุกภูมิภาค</span>'}
      </div>
      <div class="row align-items-center">
        <div class="col-md-8 col-lg-6 mx-auto">
          <div style="position: relative; height: 290px; width: 100%;">
            <canvas id="regionChart"></canvas>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Section: Deleted Teams Management Card (ถังขยะ / ข้อมูลทีมที่ถูกลบ) -->
    <div class="card border-0 shadow-sm rounded-4 p-4 bg-light-subtle border-secondary-subtle mt-4">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div class="d-flex align-items-center gap-3">
          <div class="rounded-circle bg-danger-subtle text-danger p-3 d-flex align-items-center justify-content-center" style="width: 54px; height: 54px;">
            <i class="bi bi-trash-fill fs-3"></i>
          </div>
          <div>
            <h6 class="fw-bold text-dark mb-1 d-flex align-items-center gap-2">
              ถังขยะ / ข้อมูลทีมที่ถูกลบ (Soft-Deleted Teams)
              <span id="badge_deleted_teams_count" class="badge bg-danger text-white font-monospace">${deletedTeamsCount.toLocaleString()} ทีม</span>
            </h6>
            <p class="text-muted small mb-0">ทีมที่ถูกลบออกจากระบบ จะถูกแยกเก็บไว้ที่นี่ สามารถคลิกเปิดดูรายการและสั่งกู้คืนทีมกลับมาได้</p>
          </div>
        </div>
        <div>
          <button type="button" class="btn btn-outline-danger fw-semibold px-4 py-2 rounded-3 shadow-sm d-inline-flex align-items-center gap-2" onclick="openDeletedTeamsModal()">
            <i class="bi bi-box-arrow-up-right"></i> เรียกดูรายการทีมที่ถูกลบ & กู้คืนข้อมูล
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Metric Detail Modal -->
  <div class="modal fade" id="metricDetailModal" tabindex="-1" aria-labelledby="metricDetailModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content rounded-4 border-0 shadow">
        <div class="modal-header bg-navy text-white rounded-top-4 d-flex justify-content-between align-items-center">
          <h5 class="modal-title fw-bold m-0" id="metricDetailModalLabel">
            <i class="bi bi-list-ul text-warning me-2"></i> <span id="modalMetricTitle">รายละเอียดข้อมูล</span>
          </h5>
          <div class="d-flex align-items-center gap-2 me-2 ms-auto">
            <a id="btnExportMetricExcel" href="#" class="btn btn-success btn-sm fw-bold d-inline-flex align-items-center gap-1 shadow-sm px-3">
              <i class="bi bi-file-earmark-excel-fill fs-6"></i> Export to Excel
            </a>
          </div>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4" id="modalMetricBody">
          <!-- Content dynamically populated by JS -->
        </div>
        <div class="modal-footer bg-light rounded-bottom-4">
          <button type="button" class="btn btn-secondary fw-semibold" data-bs-dismiss="modal">ปิด</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Deleted Teams Modal -->
  <div class="modal fade" id="deletedTeamsModal" tabindex="-1" aria-labelledby="deletedTeamsModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content rounded-4 border-0 shadow">
        <div class="modal-header bg-danger text-white rounded-top-4 d-flex justify-content-between align-items-center">
          <h5 class="modal-title fw-bold m-0" id="deletedTeamsModalLabel">
            <i class="bi bi-trash3-fill me-2"></i> รายการทีมที่ถูกลบออกจากระบบ (Soft-Deleted Teams)
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4" id="deletedTeamsModalBody">
          <!-- Populated by JS -->
        </div>
        <div class="modal-footer bg-light rounded-bottom-4">
          <button type="button" class="btn btn-secondary fw-semibold" data-bs-dismiss="modal">ปิด</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Team Detail Sub-Modal -->
  <div class="modal fade" id="teamDetailViewModal" tabindex="-1" aria-labelledby="teamDetailViewModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content rounded-4 border-0 shadow">
        <div class="modal-header bg-navy text-white rounded-top-4">
          <h5 class="modal-title fw-bold" id="teamDetailViewModalLabel">
            <i class="bi bi-shield-shaded text-warning me-2"></i> ข้อมูลรายละเอียดทีม
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4" id="teamDetailViewBody">
          <!-- Team details dynamically populated -->
        </div>
        <div class="modal-footer bg-light rounded-bottom-4">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">ปิด</button>
        </div>
      </div>
    </div>
  </div>

  <!-- JSON Data Containers (Safely parsed via JSON.parse) -->
  <script type="application/json" id="registeredTeamsJson">${JSON.stringify(registeredTeams).replace(/</g, '\\u003c')}</script>
  <script type="application/json" id="scopedPlayersJson">${JSON.stringify(scopedPlayers).replace(/</g, '\\u003c')}</script>
  <script type="application/json" id="deletedTeamsJson">${JSON.stringify(deletedTeams).replace(/</g, '\\u003c')}</script>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  <script>
    window.canChangeTeamStatus = ${currentUser.roleCode === 'SUPER_ADMIN'};
    window.canPermanentlyDeleteTeams = ${canPermanentlyDeleteTeams};
    // URL Security Sanitization: Instantly remove password parameter from browser address bar if present
    if (window.history && window.history.replaceState) {
      try {
        var urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('password')) {
          urlParams.delete('password');
          var cleanSearch = urlParams.toString();
          var cleanUrl = window.location.pathname + (cleanSearch ? '?' + cleanSearch : '');
          window.history.replaceState(null, document.title, cleanUrl);
        }
      } catch (e) {
        console.warn('URL sanitization warning:', e);
      }
    }

    try {
      var teamsElem = document.getElementById('registeredTeamsJson');
      window.registeredTeamsData = teamsElem ? JSON.parse(teamsElem.textContent || '[]') : [];
    } catch (e) {
      console.warn('Error parsing registeredTeamsJson:', e);
      window.registeredTeamsData = [];
    }

    try {
      var playersElem = document.getElementById('scopedPlayersJson');
      window.scopedPlayersData = playersElem ? JSON.parse(playersElem.textContent || '[]') : [];
    } catch (e) {
      console.warn('Error parsing scopedPlayersJson:', e);
      window.scopedPlayersData = [];
    }

    try {
      var deletedElem = document.getElementById('deletedTeamsJson');
      window.deletedTeamsData = deletedElem ? JSON.parse(deletedElem.textContent || '[]') : [];
    } catch (e) {
      console.warn('Error parsing deletedTeamsJson:', e);
      window.deletedTeamsData = [];
    }

    document.addEventListener('DOMContentLoaded', function() {
      document.addEventListener('click', function(e) {
        var teamBtn = e.target ? e.target.closest('.btn-view-team-detail') : null;
        if (teamBtn) {
          var teamId = teamBtn.getAttribute('data-id');
          if (teamId && window.viewTeamDetail) window.viewTeamDetail(teamId);
          return;
        }
        var playerBtn = e.target ? e.target.closest('.btn-view-player-detail') : null;
        if (playerBtn) {
          var playerId = playerBtn.getAttribute('data-id');
          if (playerId && window.viewPlayerDetail) window.viewPlayerDetail(playerId);
          return;
        }
      });

      var chartCanvas = document.getElementById('regionChart');
      if (chartCanvas) {
        var ctx = chartCanvas.getContext('2d');
        new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: ['ภาคกลาง', 'ภาคตะวันออก', 'ภาคเหนือ', 'ภาคตะวันออกเฉียงเหนือ', 'ภาคใต้', 'ภาคตะวันตก'],
            datasets: [{
              data: [
                ${regionCounts['ภาคกลาง']},
                ${regionCounts['ภาคตะวันออก']},
                ${regionCounts['ภาคเหนือ']},
                ${regionCounts['ภาคตะวันออกเฉียงเหนือ']},
                ${regionCounts['ภาคใต้']},
                ${regionCounts['ภาคตะวันตก']}
              ],
              backgroundColor: [
                '#0b2a5b',
                '#0284c7',
                '#10b981',
                '#f59e0b',
                '#ef4444',
                '#8b5cf6'
              ],
              borderWidth: 2,
              borderColor: '#ffffff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'right',
                labels: {
                  font: { family: "'Noto Sans Thai', sans-serif", size: 13 },
                  padding: 15,
                  usePointStyle: true
                }
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    var label = context.label || '';
                    var value = context.parsed || 0;
                    return label + ': ' + value + ' ทีม';
                  }
                }
              }
            },
            cutout: '65%'
          }
        });
      }
    });

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    window.openMetricModal = function(category) {
      window.currentMetricCategory = category;
      var modalTitle = document.getElementById('modalMetricTitle');
      var modalBody = document.getElementById('modalMetricBody');
      var exportBtn = document.getElementById('btnExportMetricExcel');

      if (exportBtn) {
        var base = (window.location.pathname.startsWith('/football') ? '/football' : '');
        var params = new URLSearchParams(window.location.search);
        var currentUsername = params.get('username') || 'admin';
        exportBtn.href = base + '/api/admin/export-metric-excel?category=' + encodeURIComponent(category || 'all_teams') + '&username=' + encodeURIComponent(currentUsername);
      }
      
      var teams = window.registeredTeamsData || [];
      var players = window.scopedPlayersData || [];

      var html = '';

      if (category === 'all_teams' || category === 'pending_teams' || category === 'approved_teams' || category === 'rejected_teams' || category === 'men_teams' || category === 'women_teams') {
        var filteredTeams = teams.filter(function(t) {
          if (category === 'pending_teams') return t.status === 'PENDING';
          if (category === 'approved_teams') return t.status === 'APPROVED';
          if (category === 'rejected_teams') return t.status === 'REJECTED';
          if (category === 'men_teams') return t.gender === 'boy' || !t.gender;
          if (category === 'women_teams') return t.gender === 'girl';
          return true;
        });

        var titleMap = {
          'all_teams': 'ทีมทั้งหมด',
          'pending_teams': 'ทีมรอตรวจสอบ',
          'approved_teams': 'ทีมรับรองแล้ว',
          'rejected_teams': 'ทีมคุณสมบัติไม่ผ่าน',
          'men_teams': 'ทีมชาย',
          'women_teams': 'ทีมหญิง'
        };

        modalTitle.textContent = (titleMap[category] || 'ข้อมูลทีม') + ' (' + filteredTeams.length + ' ทีม)';

        if (filteredTeams.length === 0) {
          html = '<div class="text-center py-5 text-muted"><i class="bi bi-inbox fs-1 d-block mb-2"></i>ไม่พบข้อมูลทีมในหมวดหมู่นี้</div>';
        } else {
          html = '<div class="table-responsive"><table class="table table-bordered table-hover align-middle mb-0">' +
            '<thead class="table-light">' +
              '<tr>' +
                '<th class="text-center">#</th>' +
                '<th>ชื่อทีม</th>' +
                '<th>จังหวัด</th>' +
                '<th>ผู้จัดการทีม</th>' +
                '<th>เบอร์โทรศัพท์</th>' +
                '<th class="text-center">ประเภท</th>' +
                '<th class="text-center">สถานะ</th>' +
                '<th class="text-center">จัดการ</th>' +
              '</tr>' +
            '</thead><tbody>';

          filteredTeams.forEach(function(t, idx) {
            var statusBadge = t.status === 'APPROVED' ? '<span class="badge bg-success">รับรองแล้ว</span>' :
                              (t.status === 'REJECTED' ? '<span class="badge bg-danger">ไม่ผ่าน</span>' : '<span class="badge bg-warning text-dark">รอตรวจสอบ</span>');
            var genderBadge = (t.gender === 'girl') ? '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">หญิง</span>' : '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">ชาย</span>';

            html += '<tr>' +
              '<td class="text-center fw-bold">' + (idx + 1) + '</td>' +
              '<td><strong class="text-navy">' + escapeHtml(t.teamName || t.name || '') + '</strong></td>' +
              '<td><i class="bi bi-geo-alt-fill text-danger me-1"></i>' + escapeHtml(t.province || '-') + '</td>' +
              '<td>' + escapeHtml(t.managerName || '-') + '</td>' +
              '<td>' + escapeHtml(t.phone || '-') + '</td>' +
              '<td class="text-center">' + genderBadge + '</td>' +
              '<td class="text-center">' + statusBadge + '</td>' +
              '<td class="text-center">' +
                '<button class="btn btn-sm btn-navy fw-semibold btn-view-team-detail" data-id="' + t.id + '"><i class="bi bi-eye-fill me-1"></i> ดูรายละเอียด</button>' +
              '</td>' +
            '</tr>';
          });

          html += '</tbody></table></div>';
        }
      } else if (category === 'all_athletes' || category === 'male_athletes' || category === 'female_athletes') {
        var filteredPlayers = players.filter(function(p) {
          if (category === 'male_athletes') return p.gender === 'boy' || !p.gender;
          if (category === 'female_athletes') return p.gender === 'girl';
          return true;
        });

        var titleMapPlayers = {
          'all_athletes': 'นักกีฬาทั้งหมด',
          'male_athletes': 'นักกีฬาชาย',
          'female_athletes': 'นักกีฬาหญิง'
        };

        modalTitle.textContent = (titleMapPlayers[category] || 'ข้อมูลนักกีฬา') + ' (' + filteredPlayers.length + ' คน)';

        if (filteredPlayers.length === 0) {
          html = '<div class="text-center py-5 text-muted"><i class="bi bi-person-x fs-1 d-block mb-2"></i>ไม่พบข้อมูลนักกีฬาในหมวดหมู่นี้</div>';
        } else {
          html = '<div class="table-responsive"><table class="table table-bordered table-hover align-middle mb-0">' +
            '<thead class="table-light">' +
              '<tr>' +
                '<th class="text-center">#</th>' +
                '<th>ชื่อ-นามสกุล</th>' +
                '<th>สังกัดทีม</th>' +
                '<th class="text-center">หมายเลขเสื้อ</th>' +
                '<th>ตำแหน่ง</th>' +
                '<th class="text-center">เพศ</th>' +
                '<th class="text-center">จัดการ</th>' +
              '</tr>' +
            '</thead><tbody>';

          filteredPlayers.forEach(function(p, idx) {
            var gBadge = (p.gender === 'girl') ? '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">หญิง</span>' : '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">ชาย</span>';
            var teamObj = teams.find(function(tm) { return tm.id === p.teamId; });
            var teamName = teamObj ? teamObj.teamName : (p.teamName || '-');

            html += '<tr>' +
              '<td class="text-center fw-bold">' + (idx + 1) + '</td>' +
              '<td><strong>' + escapeHtml(p.fullname || p.name || '') + '</strong></td>' +
              '<td>' + escapeHtml(teamName) + '</td>' +
              '<td class="text-center"><span class="badge bg-secondary font-monospace">' + escapeHtml(p.jerseyNumber || p.number || '-') + '</span></td>' +
              '<td>' + escapeHtml(p.position || '-') + '</td>' +
              '<td class="text-center">' + gBadge + '</td>' +
              '<td class="text-center">' +
                '<button class="btn btn-sm btn-outline-primary fw-semibold btn-view-player-detail" data-id="' + (p.id || '') + '"><i class="bi bi-search me-1"></i> ดูรายละเอียด</button>' +
              '</td>' +
            '</tr>';
          });

          html += '</tbody></table></div>';
        }
      } else {
        var matchTitles = {
          'matches': 'รายการคู่แข่งขัน',
          'live_matches': 'รายการกำลังแข่งสด',
          'finished_matches': 'รายการแข่งขันที่จบแล้ว'
        };
        modalTitle.textContent = matchTitles[category] || 'ข้อมูลการแข่งขัน';
        html = '<div class="text-center py-5 text-muted">' +
          '<i class="bi bi-trophy fs-1 d-block mb-2 text-warning"></i>' +
          '<h5>ยังไม่มีข้อมูลโปรแกรมการแข่งขันในขณะนี้</h5>' +
          '<p class="small text-secondary">ตารางจับคู่แข่งขันและผลการแข่งขันจะอัปเดตเมื่อเริ่มการแข่งขันอย่างเป็นทางการ</p>' +
        '</div>';
      }

      modalBody.innerHTML = html;
      var metricModalElem = document.getElementById('metricDetailModal');
      var bsModal = bootstrap.Modal.getInstance(metricModalElem) || new bootstrap.Modal(metricModalElem);
      bsModal.show();
    };

    window.refreshDashboardData = function(teamId, newStatus) {
      var teams = window.registeredTeamsData || [];
      var team = teams.find(function(t) { return t.id === teamId; });
      if (team) {
        team.status = newStatus;
      }

      var total = teams.length;
      var pending = teams.filter(function(t) { return t.status === 'PENDING'; }).length;
      var approved = teams.filter(function(t) { return t.status === 'APPROVED'; }).length;
      var rejected = teams.filter(function(t) { return t.status === 'REJECTED'; }).length;

      var totalElem = document.getElementById('metric_total_teams');
      if (totalElem) totalElem.textContent = total.toLocaleString();

      var pendingElem = document.getElementById('metric_pending_teams');
      if (pendingElem) pendingElem.textContent = pending.toLocaleString();

      var approvedElem = document.getElementById('metric_approved_teams');
      if (approvedElem) approvedElem.textContent = approved.toLocaleString();

      var rejectedElem = document.getElementById('metric_rejected_teams');
      if (rejectedElem) rejectedElem.textContent = rejected.toLocaleString();

      var deletedTeams = window.deletedTeamsData || [];
      var deletedBadge = document.getElementById('badge_deleted_teams_count');
      if (deletedBadge) deletedBadge.textContent = deletedTeams.length + ' ทีม';
    };

    window.openDeletedTeamsModal = function() {
      var modalBody = document.getElementById('deletedTeamsModalBody');
      var deletedTeams = window.deletedTeamsData || [];

      if (!deletedTeams || deletedTeams.length === 0) {
        modalBody.innerHTML = '<div class="text-center py-5 text-muted"><i class="bi bi-inbox fs-1 d-block mb-2"></i>ไม่มีรายการทีมที่ถูกลบในขณะนี้</div>';
      } else {
        var html = '<div class="table-responsive"><table class="table table-bordered table-hover align-middle mb-0">' +
          '<thead class="table-light">' +
            '<tr>' +
              '<th class="text-center">#</th>' +
              '<th>ชื่อทีม</th>' +
              '<th>จังหวัด</th>' +
              '<th>ผู้จัดการทีม</th>' +
              '<th>เบอร์โทรศัพท์</th>' +
              '<th class="text-center">ประเภท</th>' +
              '<th class="text-center">วันที่ลบ</th>' +
              '<th class="text-center" style="width: 180px;">การจัดการ</th>' +
            '</tr>' +
          '</thead><tbody>';

        deletedTeams.forEach(function(t, idx) {
          var genderBadge = (t.gender === 'girl') ? '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">หญิง</span>' : '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">ชาย</span>';
          var deletedDateStr = t.deleted_at || t.deletedAt ? new Date(t.deleted_at || t.deletedAt).toLocaleString('th-TH') : '-';

          html += '<tr id="deleted_team_row_' + t.id + '">' +
            '<td class="text-center fw-bold">' + (idx + 1) + '</td>' +
            '<td><strong class="text-navy">' + escapeHtml(t.teamName || t.team_name || '') + '</strong></td>' +
            '<td><i class="bi bi-geo-alt-fill text-danger me-1"></i>' + escapeHtml(t.province || '-') + '</td>' +
            '<td>' + escapeHtml(t.managerName || t.manager_name || '-') + '</td>' +
            '<td>' + escapeHtml(t.phone || '-') + '</td>' +
            '<td class="text-center">' + genderBadge + '</td>' +
            '<td class="text-center small text-muted">' + escapeHtml(deletedDateStr) + '</td>' +
            '<td class="text-center">' +
              '<div class="d-flex justify-content-center gap-1">' +
                '<button class="btn btn-sm btn-success fw-semibold shadow-sm" onclick="restoreTeamFromDashboard(&quot;' + t.id + '&quot;)" title="กู้คืนทีม">' +
                  '<i class="bi bi-arrow-counterclockwise me-1"></i> กู้คืนทีม' +
                '</button>' +
                (window.canPermanentlyDeleteTeams === true ? '<button class="btn btn-sm btn-outline-danger fw-semibold shadow-sm" onclick="permanentlyDeleteTeamFromDashboard(&quot;' + t.id + '&quot;)" title="ลบถาวร">' +
                  '<i class="bi bi-trash3-fill me-1"></i> ลบถาวร' +
                '</button>' : '') +
              '</div>' +
            '</td>' +
          '</tr>';
        });

        html += '</tbody></table></div>';
        modalBody.innerHTML = html;
      }

      var modalElem = document.getElementById('deletedTeamsModal');
      var bsModal = bootstrap.Modal.getInstance(modalElem) || new bootstrap.Modal(modalElem);
      bsModal.show();
    };

    window.permanentlyDeleteTeamFromDashboard = function(teamId) {
      Swal.fire({
        title: 'ยืนยันลบข้อมูลถาวร?',
        text: 'ข้อมูลจะถูกลบถาวร ไม่สามารถกู้ข้อมูลคืนได้ คุณแน่ใจว่าจะลบข้อมูลถาวร',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'ตกลง ลบถาวร',
        cancelButtonText: 'ยกเลิก'
      }).then(function(result) {
        if (result.isConfirmed) {
          var base = (window.location.pathname.startsWith('/football') ? '/football' : '');
          fetch(base + '/api/admin/teams/permanent-delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ id: teamId })
          })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data.success) {
              var delIdx = window.deletedTeamsData.findIndex(function(t) { return String(t.id).trim() === String(teamId).trim(); });
              if (delIdx >= 0) {
                window.deletedTeamsData.splice(delIdx, 1);
              }

              window.openDeletedTeamsModal();
              window.refreshDashboardData();

              Swal.fire({
                icon: data.warning ? 'warning' : 'success',
                title: 'ลบข้อมูลถาวรสำเร็จ',
                text: data.warning || 'ข้อมูลทีม นักกีฬา และเจ้าหน้าที่ถูกลบถาวรเรียบร้อยแล้ว',
                timer: data.warning ? undefined : 1800,
                showConfirmButton: Boolean(data.warning)
              });
            } else {
              Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: data.error || 'ไม่สามารถลบข้อมูลถาวรได้' });
            }
          })
          .catch(function(err) {
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
          });
        }
      });
    };

    window.restoreTeamFromDashboard = function(teamId) {
      Swal.fire({
        title: 'ยืนยันการกู้คืนทีม?',
        text: 'ทีมจะถูกดึงกลับเข้าสู่ระบบ และลำดับการลงทะเบียนของแต่ละรุ่นจะถูกคำนวณเรียงตามวัน-เวลาสมัครใหม่ทันที',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'ยืนยันกู้คืน',
        cancelButtonText: 'ยกเลิก'
      }).then(function(result) {
        if (result.isConfirmed) {
          var base = (window.location.pathname.startsWith('/football') ? '/football' : '');
          fetch(base + '/api/admin/teams/restore', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id: teamId })
          })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data.success) {
              // Move team from deletedTeamsData to registeredTeamsData
              var delIdx = window.deletedTeamsData.findIndex(function(t) { return String(t.id).trim() === String(teamId).trim(); });
              if (delIdx >= 0) {
                var restoredTeam = window.deletedTeamsData.splice(delIdx, 1)[0];
                restoredTeam.is_deleted = false;
                restoredTeam.deleted_at = null;
                window.registeredTeamsData.push(restoredTeam);
              }

              // Re-render modal table or update
              window.openDeletedTeamsModal();
              window.refreshDashboardData();

              Swal.fire({
                icon: 'success',
                title: 'กู้คืนทีมสำเร็จ',
                text: 'ทีมถูกดึงกลับเข้าสู่ระบบและคำนวณลำดับสมัครใหม่เรียบร้อยแล้ว',
                timer: 1800,
                showConfirmButton: false
              });
            } else {
              Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: data.error || 'ไม่สามารถกู้คืนทีมได้' });
            }
          })
          .catch(function(err) {
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
          });
        }
      });
    };

    window.updateTeamStatus = function(teamId, status) {
      if (window.canChangeTeamStatus !== true) return;
      if (status !== 'APPROVED' && status !== 'PENDING') return;
      var actionText = status === 'APPROVED' ? 'อนุมัติทีม' : 'ตั้งสถานะรอตรวจสอบทีม';
      
      Swal.fire({
        title: 'ยืนยันการทำรายการ?',
        text: 'คุณต้องการ ' + actionText + ' สำหรับทีมนี้ใช่หรือไม่',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: status === 'APPROVED' ? '#10b981' : '#d97706',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก'
      }).then(function(result) {
        if (result.isConfirmed) {
          var base = (window.location.pathname.startsWith('/football') ? '/football' : '');
          fetch(base + '/api/admin/teams/update-status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              id: teamId,
              status: status
            })
          })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data.success) {
              var teams = window.registeredTeamsData || [];
              var team = teams.find(function(t) { return t.id === teamId; });
              if (team) {
                team.status = status;
              }
              
              window.refreshDashboardData(teamId, status);

              Swal.fire({
                icon: 'success',
                title: 'บันทึกสำเร็จ!',
                text: data.message || 'อัปเดตสถานะเรียบร้อยแล้ว',
                confirmButtonColor: '#0b2a5b'
              }).then(function() {
                // Hide all active modals
                ['teamDetailViewModal', 'metricDetailModal'].forEach(function(modalId) {
                  var elem = document.getElementById(modalId);
                  if (elem) {
                    var modalInstance = bootstrap.Modal.getInstance(elem);
                    if (modalInstance) modalInstance.hide();
                  }
                });

                // Cleanup backdrop & body class if any leftover
                document.querySelectorAll('.modal-backdrop').forEach(function(b) { b.remove(); });
                document.body.classList.remove('modal-open');
                document.body.style.overflow = '';
                document.body.style.paddingRight = '';
              });
            } else {
              Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: data.error || 'ไม่สามารถอัปเดตสถานะได้',
                confirmButtonColor: '#0b2a5b'
              });
            }
          })
          .catch(function(err) {
            console.error(err);
            Swal.fire({
              icon: 'error',
              title: 'เกิดข้อผิดพลาด',
              text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้',
              confirmButtonColor: '#0b2a5b'
            });
          });
        }
      });
    };

    window.viewTeamDetail = function(teamId) {
      var teams = window.registeredTeamsData || [];
      var team = teams.find(function(t) { return t.id === teamId; });
      if (!team) return;

      var isTeamApproved = team.status === 'APPROVED';
      var statusBadge = isTeamApproved ? '<span class="badge bg-success fs-6 px-3 py-2">อนุมัติทีม</span>' : '<span class="badge bg-warning text-dark fs-6 px-3 py-2">รอตรวจสอบทีม</span>';

      var approvalCardHtml = '<div class="card border-0 bg-white shadow-sm p-3 mb-3 rounded-3 border-start border-4 ' + (isTeamApproved ? 'border-success' : 'border-warning') + '">' +
        '<div class="d-flex flex-wrap align-items-center justify-content-between gap-3">' +
          '<div>' +
            '<h6 class="fw-bold text-navy mb-1"><i class="bi bi-shield-check me-1 text-primary"></i> สถานะทีม</h6>' +
            '<div class="d-flex align-items-center gap-2 mt-1">' +
              '<span class="small text-muted">สถานะปัจจุบัน:</span> ' + statusBadge +
            '</div>' +
          '</div>' +
          '<div class="d-flex gap-2">' +
            (!window.canChangeTeamStatus || isTeamApproved ? '' : '<button class="btn btn-success fw-bold px-3 shadow-sm" onclick="window.updateTeamStatus(&quot;' + team.id + '&quot;, &quot;APPROVED&quot;)"><i class="bi bi-check-circle-fill me-1"></i> อนุมัติทีม</button>') +
          '</div>' +
        '</div>' +
      '</div>';

      var renderTeamModal = function(playersList) {
        var playersListHtml = '';
        if (!playersList || playersList.length === 0) {
          playersListHtml = '<div class="alert alert-light text-center border py-4 text-muted rounded-3 mt-2"><i class="bi bi-person-x fs-2 d-block mb-1"></i>ยังไม่มีข้อมูลนักกีฬาที่ลงทะเบียนในทีมนี้</div>';
        } else {
          playersListHtml = '<div class="table-responsive"><table class="table table-sm table-bordered table-hover mt-2 align-middle"><thead class="table-light"><tr><th class="text-center">#</th><th class="text-center">รูปถ่าย</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th class="text-center">หมายเลข</th><th class="text-center">รุ่นอายุ</th><th class="text-center">สถานะเอกสาร</th></tr></thead><tbody>';
          playersList.forEach(function(p, i) {
            var photoUrlEsc = escapeHtml(p.photoUrl || '');
            var photoTag = p.photoUrl ? '<img src="' + photoUrlEsc + '" style="width:36px;height:36px;object-fit:cover;" class="rounded-circle border shadow-sm cursor-pointer" onclick="if(window.viewPhoto) window.viewPhoto(&quot;' + photoUrlEsc + '&quot;)">' : '<div class="bg-secondary-subtle text-secondary rounded-circle d-inline-flex align-items-center justify-content-center" style="width:36px;height:36px;"><i class="bi bi-person-fill"></i></div>';
            var docBadge = p.docStatus === 'APPROVED' ? '<span class="badge bg-success-subtle text-success border border-success-subtle">สมบูรณ์</span>' : '<span class="badge bg-warning-subtle text-warning border border-warning-subtle">รอตรวจสอบ</span>';
            var fullName = p.fullname || p.name || ((p.prefix || '') + ' ' + (p.firstName || p.first_name || '') + ' ' + (p.lastName || p.last_name || '')).trim();

            playersListHtml += '<tr>' +
              '<td class="text-center fw-bold">' + (i+1) + '</td>' +
              '<td class="text-center">' + photoTag + '</td>' +
              '<td><strong class="text-navy">' + escapeHtml(fullName || '-') + '</strong></td>' +
              '<td>' + escapeHtml(p.position || '-') + '</td>' +
              '<td class="text-center"><span class="badge bg-navy font-monospace px-2 py-1 fs-6">' + escapeHtml(p.jerseyNo || p.jerseyNumber || p.number || '-') + '</span></td>' +
              '<td class="text-center"><span class="badge bg-primary-subtle text-primary border border-primary-subtle">' + escapeHtml(p.category || 'U14') + '</span></td>' +
              '<td class="text-center">' + docBadge + '</td>' +
            '</tr>';
          });
          playersListHtml += '</tbody></table></div>';
        }

        var body = '<div class="card border-0 bg-light p-3 mb-3 rounded-3 shadow-sm">' +
          '<div class="row g-3">' +
            '<div class="col-md-6"><strong>รหัสทีม:</strong> <span class="font-monospace text-primary fw-bold">' + escapeHtml(team.id) + '</span></div>' +
            '<div class="col-md-6"><strong>ชื่อทีม:</strong> <span class="fw-bold text-navy">' + escapeHtml(team.teamName || team.name || '') + '</span></div>' +
            '<div class="col-md-6"><strong>จังหวัด:</strong> ' + escapeHtml(team.province || '') + '</div>' +
            '<div class="col-md-6"><strong>ประเภท:</strong> ' + ((team.gender === 'girl') ? 'ทีมหญิง' : 'ทีมชาย') + '</div>' +
            '<div class="col-md-6"><strong>ผู้จัดการทีม:</strong> ' + escapeHtml(team.managerName || '-') + '</div>' +
            '<div class="col-md-6"><strong>เบอร์โทรศัพท์:</strong> ' + escapeHtml(team.phone || '-') + '</div>' +
          '</div></div>' +
          approvalCardHtml +
          '<h6 class="fw-bold text-navy mb-2"><i class="bi bi-people me-1"></i> รายชื่อนักกีฬาในทีม (' + (playersList ? playersList.length : 0) + ' คน)</h6>' +
          playersListHtml;

        document.getElementById('teamDetailViewBody').innerHTML = body;
        var teamModalElem = document.getElementById('teamDetailViewModal');
        var teamModal = bootstrap.Modal.getInstance(teamModalElem) || new bootstrap.Modal(teamModalElem);
        teamModal.show();
      };

      // 1. First render with scoped local memory data if available
      var localPlayers = (window.scopedPlayersData || []).filter(function(p) { return p.teamId === team.id; });
      renderTeamModal(localPlayers);

      // 2. Fetch fresh real-time team players from API
      var base = (window.location.pathname.startsWith('/football') ? '/football' : '');
      fetch(base + '/api/admin/teams/players?teamId=' + encodeURIComponent(team.id))
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data.success && data.players) {
            renderTeamModal(data.players);
          }
        })
        .catch(function(err) {
          console.warn('Could not fetch real-time team players, kept local memory fallback:', err);
        });
    };

    window.viewPlayerDetail = function(playerId) {
      var players = window.scopedPlayersData || [];
      var teams = window.registeredTeamsData || [];
      var player = players.find(function(p) { return p.id === playerId; });
      if (!player) return;

      var teamObj = teams.find(function(tm) { return tm.id === player.teamId; });
      var teamName = teamObj ? teamObj.teamName : (player.teamName || '-');

      Swal.fire({
        title: '<i class="bi bi-person-badge text-primary me-2"></i> ข้อมูลนักกีฬา',
        html: '<div class="text-start p-2">' +
          '<p class="mb-2"><strong>ชื่อ-นามสกุล:</strong> ' + escapeHtml(player.fullname || player.name || '') + '</p>' +
          '<p class="mb-2"><strong>สังกัดทีม:</strong> ' + escapeHtml(teamName) + '</p>' +
          '<p class="mb-2"><strong>ตำแหน่ง:</strong> ' + escapeHtml(player.position || '-') + '</p>' +
          '<p class="mb-2"><strong>หมายเลขเสื้อ:</strong> ' + escapeHtml(player.jerseyNumber || player.number || '-') + '</p>' +
          '<p class="mb-2"><strong>เพศ:</strong> ' + ((player.gender === 'girl') ? 'หญิง' : 'ชาย') + '</p>' +
          '</div>',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#0b2a5b'
      });
    };
  </script>`;
    const rawQuery = req.url.includes('?') ? req.url.substring(req.url.indexOf('?') + 1) : '';
    res.send((0, adminLayout_1.renderAdminLayout)('Admin Dashboard', bodyContent, 'dashboard', base, currentUser, rawQuery));
});
// API: Get Full Details for a Team (Team info, Players & Officials)
router.get('/api/admin/teams/full-details', (req, res, next) => {
    if (req.query.demo === 'true')
        return (0, adminSession_service_1.checkAdminSession)(req, res, next);
    return next();
}, async (req, res) => {
    const teamId = (req.query.teamId || req.query.id || '').trim();
    const isDemoRequest = req.query.demo === 'true';
    const currentUser = req.adminUser;
    if (isDemoRequest && currentUser?.roleCode !== 'SUPER_ADMIN') {
        return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงข้อมูล Demo' });
    }
    if (!teamId) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุ teamId' });
    }
    try {
        const teams = await (0, app_1.getDbRegisteredTeams)(isDemoRequest);
        const team = teams.find(t => String(t.id).trim() === String(teamId).trim() && (isDemoRequest ? t.isTest : !t.isTest));
        if (!team) {
            return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทีมนี้' });
        }
        const players = await (0, app_1.getDbPlayers)(teamId, isDemoRequest);
        const officials = await (0, app_1.getDbOfficials)(teamId, isDemoRequest);
        return res.json({
            success: true,
            team: team,
            players: players,
            officials: officials
        });
    }
    catch (e) {
        console.error('Error fetching team full details:', e);
        return res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการดึงข้อมูลทีม' });
    }
});
// API: Update Registered Team Data (All Fields)
router.post('/api/admin/teams/update', async (req, res) => {
    const base = (0, app_1.getBaseUrl)(req);
    let { id, teamName, school_code, province, bkk_zone, district, gender, managerName, email, phone, line_id, house_no, road, subdistrict, contact_district, contact_province, redirectQuery } = req.body;
    if (!id || !teamName || !province || !managerName || !phone) {
        return res.status(400).json({ success: false, error: 'กรุณากรอกข้อมูลสำคัญของทีมให้ครบถ้วน (ชื่อทีม, จังหวัด, ผู้จัดการทีม, เบอร์โทร)' });
    }
    // 1. Update Database
    let existingTeam;
    let teamUpdateResult;
    try {
        existingTeam = (await (0, app_1.getDbRegisteredTeams)()).find((team) => String(team.id).trim() === String(id).trim());
        try {
            province = (0, teamArea_1.normalizeProvince)(province);
            contact_province = (0, teamArea_1.normalizeProvince)(contact_province ?? existingTeam?.contact_province);
            if (district === undefined && (0, teamArea_1.normalizeProvince)(existingTeam?.province) === province)
                district = existingTeam?.district;
            if (contact_district === undefined)
                contact_district = existingTeam?.contact_district;
            district = (0, teamArea_1.normalizeDistrictForSave)(district, province, (0, teamArea_1.normalizeProvince)(existingTeam?.province) === province ? existingTeam?.district : undefined);
            contact_district = (0, teamArea_1.normalizeDistrictForSave)(contact_district, contact_province, (0, teamArea_1.normalizeProvince)(existingTeam?.contact_province) === contact_province ? existingTeam?.contact_district : undefined);
        }
        catch (error) {
            return res.status(400).json({ success: false, error: error.message });
        }
        teamUpdateResult = await db_1.pool.query(`UPDATE football_registered_team SET
        team_name = $1, school_code = $2, province = $3, bkk_zone = $4, district = $5, gender = $6,
        manager_name = $7, email = $8, phone = $9, line_id = $10, house_no = $11, road = $12, subdistrict = $13,
        contact_district = $14, contact_province = $15
       WHERE id = $16`, [
            teamName, school_code || null, province, bkk_zone || null, district || null, gender || 'boy',
            managerName, email || null, phone, line_id || null, house_no || null, road || null, subdistrict || null,
            contact_district || null, contact_province || null, id
        ]);
    }
    catch (error) {
        console.error('DB Error on update team:', error);
        return res.status(500).json({ success: false, error: 'ไม่สามารถบันทึกข้อมูลทีมได้' });
    }
    if (existingTeam && teamUpdateResult.rowCount) {
        const changes = (0, auditLog_service_1.getAuditFieldChanges)('TEAM', {
            teamName: existingTeam.teamName || existingTeam.team_name,
            province: existingTeam.province,
            district: existingTeam.district,
            gender: existingTeam.gender,
            categories: existingTeam.categories,
            managerName: existingTeam.managerName || existingTeam.manager_name,
            email: existingTeam.email,
            phone: existingTeam.phone,
            lineId: existingTeam.line_id,
            schoolCode: existingTeam.school_code,
            address: [existingTeam.house_no, existingTeam.road, existingTeam.subdistrict, existingTeam.contact_district, existingTeam.contact_province].join('|')
        }, {
            teamName, province, district: district || null, gender: gender || 'boy', categories: existingTeam.categories,
            managerName, email: email || null, phone, lineId: line_id || null, schoolCode: school_code || null,
            address: [house_no, road, subdistrict, contact_district, contact_province].join('|')
        });
        if (changes.changedFields.length) {
            try {
                await (0, auditLog_service_1.writeAuditLog)(req, {
                    eventType: 'TEAM_UPDATED', entityType: 'TEAM', entityId: String(id), teamId: String(id),
                    oldState: changes.oldState, newState: changes.newState,
                    metadata: { changedFields: changes.changedFields.join(', ') }
                });
            }
            catch (error) {
                console.error('Audit log write failed after admin team update:', error);
                req.auditPersistenceState = 'DATABASE_CHANGE_COMPLETED_AUDIT_WRITE_FAILED';
                return res.status(500).json({ success: false, auditLogFailed: true, error: 'บันทึกข้อมูลทีมแล้ว แต่บันทึกประวัติไม่สำเร็จ กรุณาตรวจสอบก่อนทำรายการซ้ำ' });
            }
        }
    }
    // 2. Update Memory Store
    const found = app_1.teamsDatabase.find(t => String(t.id).trim() === String(id).trim());
    if (found) {
        found.teamName = teamName;
        found.school_code = school_code || found.school_code;
        found.province = province;
        found.bkk_zone = bkk_zone || found.bkk_zone;
        found.district = district || found.district;
        found.gender = gender || found.gender;
        found.managerName = managerName;
        found.email = email || found.email;
        found.phone = phone;
        found.line_id = line_id || found.line_id;
        found.house_no = house_no || found.house_no;
        found.road = road || found.road;
        found.subdistrict = subdistrict || found.subdistrict;
        found.contact_district = contact_district || found.contact_district;
        found.contact_province = contact_province || found.contact_province;
    }
    const isJson = req.headers['x-requested-with'] === 'XMLHttpRequest' || (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html'));
    if (isJson) {
        return res.json({ success: true, message: 'แก้ไขและบันทึกข้อมูลทีมเรียบร้อยแล้ว' });
    }
    const redirectUrl = `${base}/admin/dashboard.php?${redirectQuery || ''}`;
    return res.send(`
    <!doctype html>
    <html lang="th">
    <head>
      <meta charset="utf-8">
      <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    </head>
    <body>
      <script>
        Swal.fire({
          icon: 'success',
          title: 'บันทึกการแก้ไขสำเร็จ!',
          text: 'แก้ไขข้อมูลทีมเข้าร่วมการแข่งขันเรียบร้อยแล้ว',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#0b2a5b'
        }).then(() => {
          location.href = "${redirectUrl}";
        });
      </script>
    </body>
    </html>
  `);
});
// API: Quick Update Team Status Only
router.post('/api/admin/teams/update-status', adminSession_service_1.checkAdminSession, async (req, res) => {
    const currentUser = req.adminUser;
    const { id, status, isDemo: isDemoRequest } = req.body;
    if (isDemoRequest === true && currentUser?.roleCode !== 'SUPER_ADMIN') {
        return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์เปลี่ยนสถานะข้อมูล Demo' });
    }
    const rawRejectReason = req.body.rejectReason;
    const isSatStatusChange = currentUser?.roleCode === 'SAT_OFFICER' && ['APPROVED', 'REJECTED'].includes(status);
    const canUpdateStatus = currentUser?.roleCode === 'SUPER_ADMIN' ||
        (currentUser?.roleCode === 'DOCUMENT_VERIFIER' && ['APPROVED', 'REJECTED'].includes(status)) || isSatStatusChange;
    if (!canUpdateStatus) {
        return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์เปลี่ยนสถานะทีม' });
    }
    if (!id || !['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
        return res.status(400).json({ success: false, error: 'ข้อมูลไม่ครบถ้วน' });
    }
    if (rawRejectReason !== undefined && typeof rawRejectReason !== 'string') {
        return res.status(400).json({ success: false, error: 'รูปแบบเหตุผลไม่ถูกต้อง' });
    }
    const rejectReason = typeof rawRejectReason === 'string' ? rawRejectReason.trim() : '';
    const found = app_1.teamsDatabase.find(t => String(t.id).trim() === String(id).trim() && (isDemoRequest === true ? (t.isTest || t.is_test) : !(t.isTest || t.is_test)));
    let previousStatus = '';
    let persistedTeamProvince = '';
    try {
        const currentTeam = await db_1.pool.query(`SELECT status, province, is_test FROM football_registered_team WHERE id::text = $1${isDemoRequest === true ? ' AND COALESCE(is_test, FALSE) = TRUE' : ' AND COALESCE(is_test, FALSE) = FALSE'}`, [String(id)]);
        if (!currentTeam.rows[0] && (isDemoRequest === true || isSatStatusChange)) {
            return res.status(404).json({ success: false, error: isDemoRequest === true ? 'ไม่พบทีม Demo นี้' : 'ไม่พบข้อมูลทีม' });
        }
        if (currentTeam.rows[0] && Boolean(currentTeam.rows[0].is_test) !== (isDemoRequest === true)) {
            return res.status(404).json({ success: false, error: 'ไม่พบทีมในขอบเขตข้อมูลที่ร้องขอ' });
        }
        previousStatus = String(currentTeam.rows[0]?.status || found?.status || '');
        persistedTeamProvince = String(currentTeam.rows[0]?.province || '').trim();
    }
    catch (error) {
        console.error('DB Error on reading prior team status for audit:', error);
        return res.status(500).json({ success: false, error: 'ไม่สามารถอ่านสถานะทีมเดิมเพื่อบันทึกประวัติได้' });
    }
    if (isSatStatusChange) {
        const officerProvince = String(currentUser?.province || '').trim().toLocaleLowerCase();
        const teamProvince = persistedTeamProvince;
        if (!officerProvince || teamProvince.toLocaleLowerCase() !== officerProvince) {
            return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์เปลี่ยนสถานะทีมนอกจังหวัดที่รับผิดชอบ' });
        }
    }
    let updateResult;
    try {
        const provincePredicate = isSatStatusChange ? ' AND LOWER(BTRIM(province)) = LOWER(BTRIM($4))' : '';
        const updateValues = [status, status === 'REJECTED' ? rejectReason : '', String(id)];
        if (isSatStatusChange)
            updateValues.push(String(currentUser?.province || '').trim());
        updateResult = await db_1.pool.query(`UPDATE football_registered_team SET status = $1, reject_reason = $2 WHERE id::text = $3 AND COALESCE(is_test, FALSE) = ${isDemoRequest === true ? 'TRUE' : 'FALSE'}${provincePredicate}`, updateValues);
    }
    catch (error) {
        console.error('DB Error on update team status:', error);
        return res.status(500).json({ success: false, error: 'ไม่สามารถบันทึกสถานะทีมได้' });
    }
    if (isDemoRequest === true && !updateResult.rowCount) {
        return res.status(404).json({ success: false, error: 'ไม่พบทีม Demo นี้' });
    }
    if (isSatStatusChange && !updateResult.rowCount) {
        return res.status(409).json({ success: false, error: 'ข้อมูลทีมเปลี่ยนแปลง กรุณาโหลดใหม่ก่อนทำรายการ' });
    }
    if (!updateResult.rowCount && !found) {
        return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทีม' });
    }
    if (found) {
        found.status = status;
        found.rejectReason = status === 'REJECTED' ? rejectReason : '';
        found.reject_reason = status === 'REJECTED' ? rejectReason : '';
    }
    try {
        await (0, auditLog_service_1.writeAuditLog)(req, {
            eventType: 'TEAM_STATUS_CHANGED',
            entityType: 'TEAM',
            entityId: String(id),
            teamId: String(id),
            oldState: { status: previousStatus || null },
            newState: { status },
            metadata: { rejectReasonProvided: Boolean(rejectReason) }
        });
    }
    catch (error) {
        console.error('Audit log write failed after team status update:', error);
        req.auditPersistenceState = 'DATABASE_CHANGE_COMPLETED_AUDIT_WRITE_FAILED';
        return res.status(500).json({ success: false, auditLogFailed: true, error: 'เปลี่ยนสถานะทีมแล้ว แต่บันทึกประวัติไม่สำเร็จ กรุณาตรวจสอบก่อนทำรายการซ้ำ' });
    }
    return res.json({ success: true, message: 'อัปเดตสถานะทีมเรียบร้อยแล้ว' });
});
// API: Admin Reset Category Submission (Updates only submitted_categories)
router.post('/api/admin/teams/reset-category-submission', adminSession_service_1.checkAdminSession, async (req, res) => {
    const { teamId, category, isDemo: isDemoRequest } = req.body || {};
    const currentUser = req.adminUser;
    if (isDemoRequest === true && currentUser?.roleCode !== 'SUPER_ADMIN') {
        return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์เปลี่ยนสถานะข้อมูล Demo' });
    }
    if (!teamId || !category) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุ teamId และ category' });
    }
    const catCode = String(category).trim().toUpperCase();
    try {
        const teamRes = await db_1.pool.query(`SELECT submitted_categories, status, is_test FROM football_registered_team WHERE id::text = $1 AND COALESCE(is_test, FALSE) = ${isDemoRequest === true ? 'TRUE' : 'FALSE'}`, [String(teamId)]);
        if (isDemoRequest === true && !teamRes.rows[0])
            return res.status(404).json({ success: false, error: 'ไม่พบทีม Demo นี้' });
        let currentSubStr = teamRes.rows[0]?.submitted_categories || '';
        const memTeam = app_1.teamsDatabase.find((t) => String(t.id).trim() === String(teamId).trim());
        const statusValue = teamRes.rows[0]?.status ?? memTeam?.status;
        const currentStatus = statusValue === 'APPROVED' ? 'APPROVED' : 'PENDING';
        if (!currentSubStr && memTeam) {
            currentSubStr = memTeam.submitted_categories || memTeam.submittedCategories || '';
        }
        const subCats = currentSubStr.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
        const newSubCats = subCats.filter((c) => c !== catCode);
        const newSubStr = newSubCats.join(',');
        const updateResult = await db_1.pool.query(`UPDATE football_registered_team SET submitted_categories = $1 WHERE id::text = $2 AND COALESCE(is_test, FALSE) = ${isDemoRequest === true ? 'TRUE' : 'FALSE'}`, [newSubStr, String(teamId)]);
        if (isDemoRequest === true && !updateResult.rowCount)
            return res.status(404).json({ success: false, error: 'ไม่พบทีม Demo นี้' });
        await (0, auditLog_service_1.writeAuditLog)(req, {
            eventType: 'TEAM_ROSTER_SUBMISSION_RESET',
            entityType: 'TEAM',
            entityId: String(teamId),
            teamId: String(teamId),
            oldState: { submittedCategories: currentSubStr.split(',').map((value) => value.trim()).filter(Boolean) },
            newState: { submittedCategories: newSubCats },
            metadata: { category: catCode }
        });
        if (memTeam) {
            memTeam.submitted_categories = newSubStr;
            memTeam.submittedCategories = newSubStr;
        }
        return res.json({
            success: true,
            message: `เปลี่ยนสถานะการส่งรายชื่อรุ่น ${catCode} กลับเป็นยังไม่ส่งรายชื่อเรียบร้อยแล้ว`,
            status: currentStatus,
            submitted_categories: newSubStr,
            submittedCategories: newSubStr
        });
    }
    catch (err) {
        console.error('Error in reset-category-submission API:', err);
        return res.status(500).json({ success: false, error: err?.message || 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะ' });
    }
});
// Category writes always use persisted state, a team lock and atomic domain audit.
router.get('/api/admin/teams/category-state', adminSession_service_1.checkAdminSession, async (req, res) => {
    const user = req.adminUser;
    if (!user)
        return res.sendStatus(403);
    const teamId = typeof req.query.teamId === 'string' ? req.query.teamId.trim() : '';
    if (!teamId)
        return res.status(400).json({ success: false, error: 'กรุณาระบุรหัสทีม' });
    try {
        const review = await (0, dbTransaction_service_1.withDbTransaction)(client => (0, teamCategory_service_1.reviewTeamCategory)(client, teamId, req.query.category, { roleCode: user.roleCode, province: user.province, isDemo: req.query.demo === 'true' }));
        return res.json({ success: true, review });
    }
    catch (error) {
        if (error instanceof teamCategory_service_1.TeamCategoryError)
            return res.status(error.status).json({ success: false, error: error.message });
        return res.status(503).json({ success: false, error: 'ไม่สามารถตรวจสอบสถานะรุ่นได้' });
    }
});
async function handleAdminCategoryChange(req, res, repair) {
    const user = req.adminUser;
    if (!user)
        return res.sendStatus(403);
    const teamId = typeof req.body?.teamId === 'string' ? req.body.teamId.trim() : '';
    const action = repair ? req.body?.action : 'restore';
    if (!teamId || (repair && !['clear_orphan', 'restore_legacy'].includes(action))) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุรหัสทีมและการดำเนินการให้ถูกต้อง' });
    }
    try {
        const result = await (0, dbTransaction_service_1.withDbTransaction)(async (client) => {
            const result = await (0, teamCategory_service_1.changeTeamCategory)(client, teamId, req.body?.category, action, {
                scope: { roleCode: user.roleCode, province: user.province, isDemo: req.body?.isDemo === true },
                reason: req.body?.reason, reviewToken: req.body?.reviewToken
            });
            await (0, auditLog_service_1.writeAuditLog)(req, {
                eventType: repair ? 'TEAM_CATEGORY_STATE_REPAIRED' : 'TEAM_CATEGORY_REGISTRATION_RESTORED',
                entityType: 'TEAM', entityId: teamId, teamId, oldState: result.oldState, newState: result.newState,
                metadata: { category: result.category, action, reason: result.reason }
            }, client);
            return result;
        });
        const cached = app_1.teamsDatabase.find(team => String(team.id).trim() === teamId);
        if (cached) {
            cached.categories = result.categories.join(',');
            cached.cancelled_categories = result.cancelledCategories.join(',');
            cached.cancelledCategories = result.cancelledCategories.join(',');
        }
        req.auditPersistenceState = 'DATABASE';
        return res.json({ success: true, categories: result.categories.join(','), cancelled_categories: result.cancelledCategories.join(','),
            message: action === 'clear_orphan' ? 'ล้างสถานะค้างแล้ว ทีมสามารถเพิ่มรุ่นได้' : 'คืนการสมัครแล้ว โดยคงข้อมูลการแข่งขันเดิม' });
    }
    catch (error) {
        if (error instanceof teamCategory_service_1.TeamCategoryError)
            return res.status(error.status).json({ success: false, error: error.message });
        console.error('Unable to change team category:', error);
        return res.status(500).json({ success: false, error: 'ไม่สามารถบันทึกสถานะรุ่นได้ กรุณาโหลดหน้าใหม่' });
    }
}
router.post('/api/admin/teams/restore-category-registration', adminSession_service_1.checkAdminSession, (req, res) => handleAdminCategoryChange(req, res, false));
router.post('/api/admin/teams/repair-category-state', adminSession_service_1.checkAdminSession, (req, res) => handleAdminCategoryChange(req, res, true));
// API: Get Players for a Team
router.get('/api/admin/teams/players', (req, res, next) => {
    if (req.query.demo === 'true')
        return (0, adminSession_service_1.checkAdminSession)(req, res, next);
    return next();
}, async (req, res) => {
    const teamId = (req.query.teamId || '').trim();
    const isDemoRequest = req.query.demo === 'true';
    const currentUser = req.adminUser;
    if (isDemoRequest && currentUser?.roleCode !== 'SUPER_ADMIN') {
        return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงข้อมูล Demo' });
    }
    if (!teamId) {
        return res.status(400).json({ success: false, error: 'กรุณาระบุ teamId' });
    }
    try {
        if (isDemoRequest) {
            const teams = await (0, app_1.getDbRegisteredTeams)(true);
            if (!teams.some(team => String(team.id).trim() === teamId && team.isTest)) {
                return res.status(404).json({ success: false, error: 'ไม่พบทีม Demo นี้' });
            }
        }
        const players = await (0, app_1.getDbPlayers)(teamId, isDemoRequest);
        return res.json({ success: true, players: players });
    }
    catch (e) {
        console.error('Error fetching team players:', e);
        return res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการดึงข้อมูลนักกีฬา' });
    }
});
// Admin Registered Teams Full Page View (/admin/teams.php)
router.get('/admin/teams.php', adminSession_service_1.checkAdminSession, async (req, res) => renderRegisteredTeamsPage(req, res));
const canAccessDemoModule = (user) => Boolean(user && ['SUPER_ADMIN', 'DOCUMENT_VERIFIER', 'SAT_OFFICER'].includes(user.roleCode));
const escapeDemoHtml = (value) => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[character] || character));
router.get('/admin/teams-demo.php', adminSession_service_1.checkAdminSession, async (req, res) => {
    const currentUser = req.adminUser;
    if (!canAccessDemoModule(currentUser))
        return res.sendStatus(403);
    if (currentUser.roleCode === 'SAT_OFFICER' && !String(currentUser.province || '').trim()) {
        return res.status(403).send('ไม่พบจังหวัดในบัญชี กกท.');
    }
    return renderRegisteredTeamsPage(req, res, true);
});
const renderDemoPlaceholderPage = (req, res, nav, title) => {
    const currentUser = req.adminUser;
    if (!canAccessDemoModule(currentUser))
        return res.sendStatus(403);
    if (currentUser.roleCode === 'SAT_OFFICER' && !String(currentUser.province || '').trim()) {
        return res.status(403).send('ไม่พบจังหวัดในบัญชี กกท.');
    }
    const base = (0, app_1.getBaseUrl)(req);
    return res.send((0, adminLayout_1.renderAdminLayout)(title, '<div class="card border-0 shadow-sm rounded-4 p-4"><h4 class="fw-bold text-navy mb-2">' + escapeDemoHtml(title) + '</h4><p class="text-muted mb-0">ส่วนนี้ยังอยู่ระหว่างเตรียมข้อมูล Demo</p></div>', nav, base, currentUser));
};
router.get('/admin/teams-demo-draw.php', adminSession_service_1.checkAdminSession, async (req, res) => {
    const user = req.adminUser;
    if (!canAccessDemoModule(user))
        return res.sendStatus(403);
    const province = String(user.province || '').trim();
    if (user.roleCode === 'SAT_OFFICER' && !province)
        return res.status(403).send('ไม่พบจังหวัดในบัญชี กกท.');
    const teams = (await (0, app_1.getDbRegisteredTeams)(true)).filter((team) => Boolean(team.isTest || team.is_test) && !Boolean(team.is_deleted || team.isDeleted) &&
        (user.roleCode !== 'SAT_OFFICER' || String(team.province || '').trim() === province)).sort((a, b) => String(a.teamName || a.team_name || '').localeCompare(String(b.teamName || b.team_name || ''), 'th'));
    const category = String(req.query.category || '').trim().toUpperCase();
    const selectedCategory = ['U14', 'U16', 'U18'].includes(category) ? category : '';
    const visibleTeams = teams.filter((team) => {
        const categories = Array.isArray(team.categories)
            ? team.categories.map((value) => String(value).trim().toUpperCase())
            : String(team.categories || '').split(',').map((value) => value.trim().toUpperCase());
        return !selectedCategory || categories.includes(selectedCategory);
    });
    const rows = visibleTeams.map((team, index) => {
        const categories = Array.isArray(team.categories)
            ? team.categories.map((value) => String(value).trim().toUpperCase())
            : String(team.categories || '').split(',').map((value) => value.trim().toUpperCase());
        const shown = selectedCategory ? categories.filter((value) => value === selectedCategory) : categories;
        return `<tr><td>${index + 1}</td><td class="fw-semibold">${escapeDemoHtml(team.teamName || team.team_name || team.name || 'ไม่ระบุชื่อทีม')}</td><td>${escapeDemoHtml(team.province || '-')}</td><td>${escapeDemoHtml((0, teamArea_1.getTeamDistrictName)(team) || '-')}</td><td>${shown.map((value) => `<span class="badge bg-primary me-1">${escapeDemoHtml(value)}</span>`).join('')}</td></tr>`;
    }).join('');
    const base = (0, app_1.getBaseUrl)(req);
    const body = `<section class="card border-0 shadow-sm rounded-4 p-4">
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><div><h4 class="fw-bold text-navy mb-1">จัดการตารางแข่งขัน Demo</h4><p class="text-muted mb-0">รายชื่อทีม Demo จากระบบ แสดงตามสิทธิ์บัญชีที่เข้าสู่ระบบ</p></div><span class="badge bg-warning text-dark fs-6">ข้อมูล Demo · ${visibleTeams.length.toLocaleString('th-TH')} ทีม</span></div>
    <form method="get" class="row g-2 align-items-end mb-3"><div class="col-auto"><label class="form-label" for="demoDrawCategory">รุ่นแข่งขัน</label><select class="form-select" id="demoDrawCategory" name="category" onchange="this.form.submit()"><option value="">ทุกรุ่น</option>${['U14', 'U16', 'U18'].map(value => `<option value="${value}" ${selectedCategory === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><div class="col-auto"><button class="btn btn-outline-primary" type="submit">แสดงข้อมูล</button></div></form>
    <div class="alert alert-info">ข้อมูลทีมจริงพร้อมแสดงแล้ว ส่วนการจัดสาย/บันทึกผลจะเปิดใช้เมื่อมีชุดข้อมูลการแข่งขัน Demo แยกจากตารางการแข่งขันจริง</div>
    <div class="table-responsive"><table class="table table-hover align-middle"><thead class="table-light"><tr><th>#</th><th>ชื่อทีม</th><th>จังหวัด</th><th>เขต/อำเภอ</th><th>รุ่นแข่งขัน</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="text-center text-muted py-4">ไม่พบทีม Demo ตามตัวกรอง</td></tr>'}</tbody></table></div>
  </section>`;
    return res.send((0, adminLayout_1.renderAdminLayout)('จัดการตารางแข่งขัน Demo', body, 'teams-demo-draw', base, user));
});
router.get('/admin/teams-demo-results.php', adminSession_service_1.checkAdminSession, (req, res) => renderDemoPlaceholderPage(req, res, 'teams-demo-results', 'ผลการจับคู่ Demo'));
const loadDistrictDrawTeams = async () => {
    const result = await db_1.pool.query(`SELECT id, team_name, province, district, categories,
                status, is_test, is_deleted, created_at
         FROM football_registered_team
         WHERE is_test = TRUE
           AND COALESCE(is_deleted, FALSE) = FALSE
         ORDER BY created_at ASC, id ASC`);
    return result.rows.map((row) => ({
        id: row.id,
        teamName: row.team_name,
        province: row.province,
        district: row.district,
        categories: row.categories,
        status: row.status,
        isTest: row.is_test,
        is_deleted: row.is_deleted,
        createdAt: row.created_at
    }));
};
const loadDistrictDrawPlayers = async () => {
    const result = await db_1.pool.query(`SELECT p.team_id, p.category, p.doc_status
         FROM football_player p
         INNER JOIN football_registered_team t ON t.id = p.team_id
         WHERE t.is_test = TRUE
           AND COALESCE(t.is_deleted, FALSE) = FALSE`);
    return result.rows.map((row) => ({
        teamId: row.team_id,
        category: row.category,
        docStatus: row.doc_status
    }));
};
const renderDistrictCompetitionPage = async (req, res, page) => {
    const user = req.adminUser;
    if (!canAccessDemoModule(user))
        return res.sendStatus(403);
    if (user.roleCode === 'SAT_OFFICER' && !String(user.province || '').trim()) {
        return res.status(403).send('ไม่พบจังหวัดในบัญชี กกท.');
    }
    const satProvince = String(user.province || '').trim();
    let demoTeams = [];
    if (page === 'district-draw-setup') {
        try {
            demoTeams = (await loadDistrictDrawTeams()).filter((team) => Boolean(team.isTest || team.is_test) &&
                !Boolean(team.is_deleted || team.isDeleted) &&
                (user.roleCode !== 'SAT_OFFICER' ||
                    String(team.province || '').trim() === satProvince));
        }
        catch (error) {
            console.error('District draw setup database error:', error);
            return res.status(503).send('ไม่สามารถโหลดข้อมูลพื้นที่แข่งขันได้');
        }
    }
    const drawAreasByKey = new Map();
    demoTeams.forEach((team) => {
        const province = String(team.province || '').trim();
        let district = String(team.district || '').trim();
        if (province === 'กรุงเทพมหานคร' && district && !district.startsWith('เขต'))
            district = `เขต${district}`;
        if (province && district)
            drawAreasByKey.set(`${province}\u0000${district}`, { province, district });
    });
    const drawAreas = Array.from(drawAreasByKey.values())
        .sort((a, b) => a.province.localeCompare(b.province, 'th') || a.district.localeCompare(b.district, 'th'));
    const drawProvinces = Array.from(new Set(drawAreas.map((area) => area.province))).sort((a, b) => a.localeCompare(b, 'th'));
    const drawAreaConfig = JSON.stringify(drawAreas).replace(/</g, '\\u003c');
    const drawProvinceOptions = user.roleCode === 'SAT_OFFICER'
        ? `<option value="${escapeDemoHtml(satProvince)}" selected>${escapeDemoHtml(satProvince)} (กกท. ประจำจังหวัด)</option>`
        : '<option value="" selected>เลือกจังหวัด</option>' + drawProvinces.map(province => `<option value="${escapeDemoHtml(province)}">${escapeDemoHtml(province)}</option>`).join('');
    const definitions = {
        'district-draw-setup': { title: 'ตั้งค่าการจับสลาก', subtitle: 'กำหนดรุ่นแข่งขันและเงื่อนไขก่อนจัดสายการแข่งขัน', icon: 'bi-gear' },
        'district-draw-result': { title: 'ผลการจับฉลาก', subtitle: 'ตรวจสอบผลการแบ่งกลุ่มและสายการแข่งขัน', icon: 'bi-diagram-3' },
        'district-match-schedule': { title: 'ตารางการแข่งขัน', subtitle: 'จัดตารางวัน เวลา และสนามแข่งขันของแต่ละคู่', icon: 'bi-calendar3' }
    };
    const current = definitions[page];
    const emptyState = (columns = 6) => `<tr><td colspan="${columns}" class="text-center text-muted py-5"><i class="bi bi-inbox fs-3 d-block mb-2"></i>ยังไม่มีข้อมูลการแข่งขัน</td></tr>`;
    const commonNotice = '<div class="alert alert-info d-flex gap-2 align-items-start mb-4" role="status"><i class="bi bi-info-circle-fill mt-1"></i><div><strong>หน้าเตรียมจัดการข้อมูล</strong><div>โครงหน้าพร้อมสำหรับเชื่อมต่อข้อมูลการแข่งขัน การบันทึกและเผยแพร่ยังไม่เปิดใช้งาน</div></div></div>';
    const filters = `<div class="card border-0 shadow-sm rounded-4 mb-4"><div class="card-body p-3 p-lg-4"><div class="row g-3 align-items-end">
    <div class="col-12 col-sm-6 col-lg-3"><label class="form-label" for="competitionSeason">ฤดูกาลแข่งขัน</label><select class="form-select" id="competitionSeason"><option selected>เลือกฤดูกาล</option></select></div>
    <div class="col-12 col-sm-6 col-lg-3"><label class="form-label" for="competitionCategory">รุ่นแข่งขัน</label><select class="form-select" id="competitionCategory"><option selected>เลือกรุ่นแข่งขัน</option><option>U14</option><option>U16</option><option>U18</option></select></div>
    <div class="col-12 col-sm-6 col-lg-3"><label class="form-label" for="competitionStage">รอบการแข่งขัน</label><select class="form-select" id="competitionStage"><option selected>เลือก รอบการแข่งขัน</option><option>รอบแบ่งกลุ่ม</option><option>รอบแพ้คัดออก</option></select></div>
    <div class="col-12 col-sm-6 col-lg-3"><label class="form-label" for="competitionArea">เขต/อำเภอ</label><select class="form-select" id="competitionArea"><option selected>เลือกเขต/อำเภอ</option></select></div>
  </div></div></div>`;
    let detail = '';
    if (page === 'district-draw-setup') {
        detail = `<div class="row g-3 align-items-stretch mb-4" id="districtDrawSetupLayout">
      <div class="col-12 col-xl-6"><section class="card h-100" style="border-radius:10px;box-shadow:0 5px 18px rgba(11,42,91,.07)" aria-labelledby="drawSetupFormatTitle">
        <div class="card-header bg-white d-flex flex-wrap align-items-center justify-content-between gap-2 py-3"><h2 id="drawSetupFormatTitle" class="h5 fw-bold text-navy mb-0">ตั้งค่าการจับสลาก Stage 1</h2><span class="badge rounded-pill px-3 py-2" style="background:#e7f1ff;color:#0a58ca">หน้าเริ่มจัดการแข่งขัน</span></div>
        <div class="card-body p-3 p-lg-4">
          <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3">
            <div class="col"><label for="drawSetupSeason" class="form-label fw-semibold">ฤดูกาล *</label><select id="drawSetupSeason" class="form-select"><option selected>2569/70</option></select></div>
            <div class="col"><label for="drawSetupCategory" class="form-label fw-semibold">รุ่นอายุ *</label><select id="drawSetupCategory" class="form-select"><option value="" selected>เลือกรุ่นอายุ</option><option value="U14">U14</option><option value="U16">U16</option><option value="U18">U18</option></select></div>
            <div class="col"><label for="drawSetupProvince" class="form-label fw-semibold">จังหวัด *</label><select id="drawSetupProvince" class="form-select" ${user.roleCode === 'SAT_OFFICER' ? 'disabled' : ''}>${drawProvinceOptions}</select></div>
            <div class="col"><label for="drawSetupDistrict" class="form-label fw-semibold">อำเภอ *</label><select id="drawSetupDistrict" class="form-select" disabled><option value="" selected>เลือกอำเภอ</option></select></div>
            <div class="col"><div class="form-label fw-semibold mb-1">รูปแบบการแข่งขัน</div><div class="fw-bold">แพ้คัดออก (Knockout)</div></div>
            <div class="col"><div class="form-label fw-semibold mb-1">ทีม Approved ที่พบ</div><div class="fw-bold" id="drawSetupApprovedCount">— ทีม</div></div>
            <div class="col"><div class="form-label fw-semibold mb-1">รอบหลัก</div><div class="fw-bold">4 ทีม</div></div>
            <div class="col"><div class="form-label fw-semibold mb-1">Play-off</div><div class="fw-bold">3 คู่</div></div>
            <div class="col"><div class="form-label fw-semibold mb-1">ผ่านเข้ารอบหลักโดยตรง</div><div class="fw-bold">1 ทีม</div></div>
            <div class="col"><div class="form-label fw-semibold mb-1">ตำแหน่งที่ได้รอเล่นรอบหลัก</div><div class="fw-bold">A1</div></div>
            <div class="col"><div class="form-label fw-semibold mb-1">วิธีสุ่ม</div><div class="fw-bold">สุ่มทีมเข้าสู่ตำแหน่ง A1–A7</div></div>
          </div>
          <p class="mt-3 mb-3"><strong>ตัวอย่าง 7 ทีม:</strong> ตำแหน่ง <strong>A1</strong> จะรอเล่นในรอบหลัก (รอบ 4 ทีม) ส่วน A2–A7 เล่น Play-off: A2–A3, A4–A5, A6–A7 จากนั้นผู้ชนะเข้าสู่รอบหลัก ตำแหน่ง Direct Entry ต้องมาจาก Bracket Template ของระบบ ไม่ให้เจ้าหน้าที่เลือกเอง</p>
          <div class="mb-3" style="background:#f4f7fb;border-left:4px solid #0b2a5b;padding:10px 12px;border-radius:0 8px 8px 0" role="note"><strong>ตอนเริ่มพิธีจับสลาก:</strong> Backend สร้าง Snapshot ของทีม Approved และ Commit ผลสุ่มเป็น Draw Version ใน transaction เดียวกัน ก่อน animation เริ่มแสดงผล</div>
          <div class="d-grid d-sm-flex gap-2"><button type="button" class="btn btn-outline-secondary" id="drawSetupSaveButton">บันทึกการตั้งค่า</button><button type="button" class="btn btn-primary" style="--bs-btn-bg:#0b2a5b;--bs-btn-border-color:#0b2a5b;--bs-btn-hover-bg:#0b2a5b;--bs-btn-hover-border-color:#0b2a5b">เริ่มพิธีจับสลาก <span aria-hidden="true">→</span></button></div>
        </div>
      </section></div>
      <div class="col-12 col-xl-6"><section class="card h-100" style="border-radius:10px;box-shadow:0 5px 18px rgba(11,42,91,.07)" aria-labelledby="drawSetupTeamsTitle">
        <div class="card-header bg-white d-flex flex-wrap align-items-center justify-content-between gap-2 py-3"><h2 id="drawSetupTeamsTitle" class="h5 fw-bold text-navy mb-0">ทีม Approved</h2><span id="drawSetupTeamsCount" class="badge rounded-pill px-3 py-2" style="background:#e7f6ef;color:#146c43">ยังไม่โหลดข้อมูล</span></div>
        <div class="table-responsive"><table class="table table-hover align-middle mb-0">
          <thead class="table-light"><tr><th scope="col">#</th><th scope="col">ทีม</th><th scope="col">สถานะลงทะเบียน</th><th scope="col">สิทธิ์แข่งขัน</th></tr></thead>
          <tbody id="drawSetupTeamsBody"></tbody>
        </table></div>
      </section></div>
    </div><script type="application/json" id="drawSetupAreas">${drawAreaConfig}</script><script>
      (function(){
        var button=document.getElementById('drawSetupSaveButton');
        var category=document.getElementById('drawSetupCategory');
        var province=document.getElementById('drawSetupProvince');
        var district=document.getElementById('drawSetupDistrict');
        var title=document.getElementById('drawSetupTeamsTitle');
        var count=document.getElementById('drawSetupTeamsCount');
        var teamCount=document.getElementById('drawSetupApprovedCount');
        var body=document.getElementById('drawSetupTeamsBody');
        var areas=JSON.parse(document.getElementById('drawSetupAreas').textContent);
        var requestVersion=0;
        var esc=function(value){return String(value==null?'':value).replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]})};
        var clearResults=function(){
          requestVersion++;
          body.replaceChildren();
          count.textContent='ยังไม่โหลดข้อมูล';
          teamCount.textContent='— ทีม';
          title.textContent='ทีม Approved';
        };
        var updateButton=function(){button.disabled=!(category.value&&province.value&&district.value)};
        [category,province,district].forEach(function(select){select.addEventListener('change',function(){clearResults();updateButton()})});
        var updateDistrictOptions=function(){
          var selectedProvince=province.value;
          district.replaceChildren(new Option('เลือกอำเภอ',''));
          var districts=Array.from(new Set(areas.filter(function(area){return area.province===selectedProvince}).map(function(area){return area.district}))).sort(function(a,b){return a.localeCompare(b,'th')});
          districts.forEach(function(value){district.add(new Option(value,value))});
          district.disabled=!selectedProvince||districts.length===0;
          district.value='';
        };
        province.addEventListener('change',function(){updateDistrictOptions();clearResults();updateButton()});
        updateDistrictOptions();
        updateButton();
        button.addEventListener('click',async function(){
          if(!category.value||!province.value||!district.value){
            clearResults();
            count.textContent='กรุณาเลือกเงื่อนไขให้ครบ';
            return;
          }
          var currentRequest=++requestVersion;
          button.disabled=true;
          body.innerHTML='<tr><td colspan="4" class="text-center text-muted py-5">กำลังโหลดข้อมูลทีม...</td></tr>';
          try{
            var params=new URLSearchParams({category:category.value.split(' ')[0],province:province.value,district:district.value});
            var response=await fetch('${(0, app_1.getBaseUrl)(req)}/api/admin/district-draw-setup/teams?'+params.toString(),{headers:{'Accept':'application/json'}});
            var result=await response.json();
            if(currentRequest!==requestVersion)return;
            if(!response.ok||!result.success)throw new Error(result.error||'โหลดข้อมูลทีมไม่สำเร็จ');
            title.textContent='ทีม Approved · อำเภอ'+district.value;
            count.textContent=result.teams.length+' ทีม';
            teamCount.textContent=result.teams.length+' ทีม';
            body.innerHTML=result.teams.length?result.teams.map(function(team,index){return '<tr><td>'+(index+1)+'</td><td>'+esc(team.name)+'</td><td><span class="badge rounded-pill" style="background:#e7f6ef;color:#146c43">Approved</span></td><td>มีสิทธิ์</td></tr>'}).join(''):'<tr><td colspan="4" class="text-center text-muted py-5">ไม่พบทีมที่ผ่านเงื่อนไข</td></tr>';
          }catch(error){
            if(currentRequest!==requestVersion)return;
            body.innerHTML='<tr><td colspan="4" class="text-center text-danger py-5">'+esc(error.message||'โหลดข้อมูลทีมไม่สำเร็จ')+'</td></tr>';
            count.textContent='โหลดไม่สำเร็จ';
          }finally{
            if(currentRequest===requestVersion)updateButton();
          }
        });
      })();
    </script>`;
    }
    else if (page === 'district-draw-result') {
        detail = `<div class="row g-3 mb-4"><div class="col-12 col-sm-4"><div class="card border-0 shadow-sm rounded-4 p-3"><div class="text-muted small">จำนวนกลุ่ม</div><div class="h3 fw-bold text-navy mb-0">—</div></div></div><div class="col-12 col-sm-4"><div class="card border-0 shadow-sm rounded-4 p-3"><div class="text-muted small">ทีมที่จับสลากแล้ว</div><div class="h3 fw-bold text-navy mb-0">—</div></div></div><div class="col-12 col-sm-4"><div class="card border-0 shadow-sm rounded-4 p-3"><div class="text-muted small">สถานะผลการจับสลาก</div><div class="h3 fw-bold text-secondary mb-0">ยังไม่มีข้อมูล</div></div></div></div>
      <section class="card border-0 shadow-sm rounded-4"><div class="card-header bg-white d-flex flex-wrap justify-content-between align-items-center gap-2 py-3"><h2 class="h5 mb-0 fw-bold text-navy">ผลการจับสลากอย่างเป็นทางการ</h2><div class="d-flex flex-wrap gap-2"><button class="btn btn-outline-secondary" type="button" disabled><i class="bi bi-arrow-repeat me-1"></i>สุ่มใหม่</button><button class="btn btn-success" type="button" disabled><i class="bi bi-check2-circle me-1"></i>ยืนยันและเผยแพร่</button></div></div><div class="table-responsive"><table class="table table-hover align-middle mb-0"><thead class="table-light"><tr><th>กลุ่ม</th><th>ลำดับ</th><th>ทีม</th><th>เขต/อำเภอ</th><th>รุ่นแข่งขัน</th><th>สถานะ</th></tr></thead><tbody>${emptyState()}</tbody></table></div></section>`;
    }
    else {
        detail = `<section class="card border-0 shadow-sm rounded-4"><div class="card-header bg-white d-flex flex-wrap justify-content-between align-items-center gap-2 py-3"><div><h2 class="h5 mb-0 fw-bold text-navy">รายการแข่งขัน</h2><div class="small text-muted mt-1">แสดงกำหนดการแข่งขันตามตัวกรองที่เลือก</div></div><button class="btn btn-primary" type="button" disabled><i class="bi bi-plus-lg me-1"></i>เพิ่มการแข่งขัน</button></div><div class="table-responsive"><table class="table table-hover align-middle mb-0"><thead class="table-light"><tr><th>รายการ</th><th>รอบ</th><th>วัน/เวลา</th><th>สนาม</th><th>ทีมเหย้า</th><th>ทีมเยือน</th><th>สถานะ</th></tr></thead><tbody>${emptyState(7)}</tbody></table></div></section>`;
    }
    const body = `<div class="container-fluid px-0"><div class="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4"><div><div class="small text-muted mb-1">การจัดการแข่งขันระดับอำเภอ</div><h1 class="h3 fw-bold text-navy mb-1"><i class="bi ${current.icon} me-2"></i>${current.title}</h1><p class="text-muted mb-0">${current.subtitle}</p></div><span class="badge bg-light text-primary border px-3 py-2">เตรียมจัดการข้อมูล</span></div>${page === 'district-draw-setup' ? '' : commonNotice}${page === 'district-draw-setup' ? '' : filters}${detail}</div>`;
    return res.send((0, adminLayout_1.renderAdminLayout)(current.title, body, page, (0, app_1.getBaseUrl)(req), user));
};
router.get('/api/admin/district-draw-setup/teams', adminSession_service_1.checkAdminSession, async (req, res) => {
    const user = req.adminUser;
    const category = String(req.query.category || '').trim().toUpperCase();
    const province = String(req.query.province || '').trim();
    const district = String(req.query.district || '').trim();
    if (!['U14', 'U16', 'U18'].includes(category) || !province || !district) {
        return res.status(400).json({ success: false, error: 'กรุณาเลือกรุ่นอายุ จังหวัด และอำเภอให้ครบถ้วน' });
    }
    if (!canAccessDemoModule(user))
        return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงข้อมูล Demo' });
    if (user.roleCode === 'SAT_OFFICER' &&
        (!String(user.province || '').trim() ||
            String(user.province || '').trim() !== province)) {
        return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนอกจังหวัดที่รับผิดชอบ' });
    }
    try {
        const [teams, players] = await Promise.all([
            loadDistrictDrawTeams(),
            loadDistrictDrawPlayers()
        ]);
        const eligible = teams.filter((team) => {
            if (!(team.isTest || team.is_test) || team.is_deleted || team.isDeleted || team.status !== 'APPROVED')
                return false;
            const teamDistrict = String(team.district || '').trim();
            if (!teamDistrict ||
                String(team.province || '').trim() !== province ||
                teamDistrict.replace(/^เขต/, '') !== district.replace(/^เขต/, ''))
                return false;
            const categories = String(team.categories || '').split(',').map((value) => value.trim().toUpperCase());
            if (!categories.includes(category))
                return false;
            const roster = players.filter((player) => String(player.teamId || player.team_id || '') === String(team.id) &&
                String(player.category || player.categories || '').toUpperCase().split(',').map((value) => value.trim()).includes(category));
            return roster.length > 0 && roster.every((player) => String(player.docStatus || player.doc_status || '').toUpperCase() === 'APPROVED');
        }).sort((a, b) => {
            const aTime = new Date(a.createdAt || a.created_at || 0).getTime();
            const bTime = new Date(b.createdAt || b.created_at || 0).getTime();
            return aTime - bTime || String(a.id || '').localeCompare(String(b.id || ''), 'th');
        }).map((team) => ({ id: String(team.id), name: String(team.teamName || team.team_name || team.school || 'ทีมไม่ระบุชื่อ') }));
        return res.json({ success: true, teams: eligible });
    }
    catch (error) {
        console.error('Failed to load district draw setup teams:', error);
        return res.status(500).json({ success: false, error: 'โหลดข้อมูลทีมไม่สำเร็จ' });
    }
});
router.get('/admin/district-draw-setup.php', adminSession_service_1.checkAdminSession, async (req, res) => renderDistrictCompetitionPage(req, res, 'district-draw-setup'));
router.get('/admin/district-draw-result.php', adminSession_service_1.checkAdminSession, (req, res) => renderDistrictCompetitionPage(req, res, 'district-draw-result'));
router.get('/admin/district-match-schedule.php', adminSession_service_1.checkAdminSession, (req, res) => renderDistrictCompetitionPage(req, res, 'district-match-schedule'));
const demoMockupDirectory = path_1.default.resolve(__dirname, '../../../document/Phase 2/Phototype_2/PMYC_Developer_Handoff_Prototype_v2_Fixed');
router.get('/admin/competition-demo/:screen', adminSession_service_1.checkAdminSession, (req, res) => {
    const user = req.adminUser;
    if (!canAccessDemoModule(user))
        return res.sendStatus(403);
    if (user.roleCode === 'SAT_OFFICER' && !String(user.province || '').trim()) {
        return res.status(403).send('ไม่พบจังหวัดในบัญชี กกท.');
    }
    const screen = String(req.params.screen || '');
    if (!/^(?:index|(?:0[1-9]|[1-3][0-8])-[a-z0-9-]+)\.html$/.test(screen))
        return res.sendStatus(404);
    const screenPath = path_1.default.resolve(demoMockupDirectory, screen);
    if (!screenPath.startsWith(demoMockupDirectory + path_1.default.sep))
        return res.sendStatus(404);
    if (!fs_1.default.existsSync(screenPath))
        return res.sendStatus(404);
    return res.sendFile(screenPath);
});
async function renderRegisteredTeamsPage(req, res, isDemo = false) {
    const base = (0, app_1.getBaseUrl)(req);
    const typeFilter = (req.query.type || 'all_teams').trim();
    const currentUser = req.adminUser || {
        id: 'ADM-001',
        username: 'admin',
        fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)',
        roleCode: 'SUPER_ADMIN',
        roleName: 'ผู้ดูแลระบบสูงสุด',
        permissions: ['teams:read', 'teams:verify', 'users:manage', 'system:all']
    };
    const isSatOfficer = currentUser.roleCode === 'SAT_OFFICER';
    const satProvince = currentUser.province || '';
    const canManageDemoData = !isDemo || currentUser.roleCode === 'SUPER_ADMIN';
    const canChangeTeamStatus = canManageDemoData && (currentUser.roleCode === 'SUPER_ADMIN' ||
        currentUser.roleCode === 'DOCUMENT_VERIFIER' ||
        (isSatOfficer && Boolean(satProvince.trim())));
    const canClickTeamStatusColumn = currentUser.roleCode === 'SUPER_ADMIN';
    const canSetPendingTeamStatus = currentUser.roleCode === 'SUPER_ADMIN';
    const canEditTeamProfile = !isDemo && currentUser.roleCode === 'SUPER_ADMIN';
    const fetchedTeams = await (0, app_1.getDbRegisteredTeams)(isDemo);
    const allTeams = (isDemo ? fetchedTeams.filter(t => t.isTest) : fetchedTeams.filter(t => !t.isTest))
        .filter(t => !isSatOfficer || t.province === satProvince);
    const registrationRanks = (0, teamRegistrationRank_service_1.getTeamRegistrationRanks)(allTeams);
    allTeams.forEach((team) => {
        team.registrationRanks = registrationRanks[String(team.id).trim()] || {};
        const area = (0, teamRegistrationRank_service_1.getRegistrationArea)(team);
        team.registrationRankMessage = !area.district ? 'ยังไม่ระบุอำเภอ' : (!area.province ? 'ยังไม่ระบุจังหวัด' : '');
    });
    const allProvinces = Array.from(new Set(allTeams.map(t => t.province).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
    const satRegion = isSatOfficer && satProvince ? getRegionByProvince(satProvince) : '';
    // Fetch all players for category status calculations
    const allPlayersList = await (0, app_1.getDbPlayers)('ALL', isDemo);
    const playersByTeamMap = {};
    allPlayersList.forEach(p => {
        const tid = p.teamId || p.team_id;
        if (tid) {
            if (!playersByTeamMap[tid])
                playersByTeamMap[tid] = [];
            playersByTeamMap[tid].push(p);
        }
    });
    let categoryStates;
    try {
        categoryStates = await (0, teamCategory_service_1.readPersistedCategoryStates)(db_1.pool, allTeams);
    }
    catch {
        return res.status(503).send('ไม่สามารถตรวจสอบสถานะรุ่นได้ กรุณาลองใหม่');
    }
    const playerApprovedAtMap = new Map();
    try {
        const allTeamIds = allTeams.map(t => String(t.id)).filter(Boolean);
        if (allTeamIds.length > 0) {
            const auditRes = await db_1.pool.query(`SELECT team_id, entity_id, MAX(created_at) AS approved_at
                 FROM football_audit_log
                 WHERE team_id = ANY($1::varchar[])
                   AND event_type = 'PLAYER_DOCUMENT_STATUS_CHANGED'
                   AND new_state->>'docStatus' = 'APPROVED'
                 GROUP BY team_id, entity_id`, [allTeamIds]);
            for (const row of auditRes.rows || []) {
                if (row.team_id && row.entity_id && row.approved_at) {
                    playerApprovedAtMap.set(`${row.team_id}:${row.entity_id}`, new Date(row.approved_at).toISOString());
                }
            }
        }
    }
    catch {
        // Synthetic test environments may not query football_audit_log.
    }
    allTeams.forEach(t => {
        t.teamPlayers = playersByTeamMap[t.id] || [];
        t.categoryStates = categoryStates.get(String(t.id));
        t.region = getRegionByProvince(t.province);
        const subCats = String(t.submitted_categories || t.submittedCategories || '').split(',').map(c => c.trim().toUpperCase());
        const catApprovedAt = {};
        for (const catCode of ['U14', 'U16', 'U18']) {
            if (!subCats.includes(catCode))
                continue;
            const playersInCat = t.teamPlayers.filter((p) => String(p.category || p.categories || '').toUpperCase().split(',').map((c) => c.trim()).includes(catCode));
            const minApprovedPlayers = 18;
            const approvedPlayers = playersInCat.filter((p) => p.docStatus === 'APPROVED');
            if (approvedPlayers.length >= minApprovedPlayers) {
                const approvedTimestamps = [];
                for (const p of approvedPlayers) {
                    const iso = playerApprovedAtMap.get(`${t.id}:${p.id}`);
                    if (iso) {
                        const ms = new Date(iso).getTime();
                        if (Number.isFinite(ms))
                            approvedTimestamps.push(ms);
                    }
                }
                approvedTimestamps.sort((a, b) => a - b);
                if (approvedTimestamps.length >= minApprovedPlayers) {
                    catApprovedAt[catCode] = new Date(approvedTimestamps[minApprovedPlayers - 1]).toISOString();
                }
            }
        }
        t.categoryApprovedAt = catApprovedAt;
    });
    const categoryAttentionHtml = (team, category) => {
        const state = team.categoryStates?.[category];
        if (state === 'UNAVAILABLE')
            return '<span class="text-muted small">ไม่สามารถใช้งานข้อมูลทีมได้</span>';
        if (state !== 'INCONSISTENT' && state !== 'CANCELLED')
            return '';
        const label = state === 'INCONSISTENT' ? 'ตรวจสอบสถานะรุ่น' : 'ยกเลิกการสมัครแล้ว';
        return `<span class="text-warning-emphasis small">${label}</span>` + (canChangeTeamStatus
            ? `<button type="button" class="btn btn-sm btn-outline-warning ms-1" data-team-id="${escapeDemoHtml(team.id)}" data-category="${category}" onclick="reviewTeamCategory(this.dataset.teamId, this.dataset.category)">คืนสถานะ</button>` : '');
    };
    const allRegions = Array.from(new Set(allTeams.map(t => t.region).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
    const initialFilteredTeams = allTeams.filter(t => {
        if (isSatOfficer && satProvince && t.province !== satProvince)
            return false;
        if (typeFilter === 'pending_teams' && t.status !== 'PENDING')
            return false;
        if (typeFilter === 'approved_teams' && t.status !== 'APPROVED')
            return false;
        if (typeFilter === 'not_submitted_teams' && t.status === 'APPROVED')
            return false;
        if (typeFilter === 'rejected_teams' && t.status === 'APPROVED')
            return false;
        if (typeFilter === 'men_teams' && t.gender !== 'boy')
            return false;
        if (typeFilter === 'women_teams' && t.gender !== 'girl')
            return false;
        return true;
    });
    const bodyContent = `
  <div class="card p-4 shadow-sm border-0 rounded-4 bg-white mb-4">
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
      <div>
        <h4 class="fw-bold text-navy mb-1"><i class="bi bi-shield-shaded me-2"></i> ${isDemo ? 'รายชื่อทีม Demo' : 'รายการทีมลงทะเบียน (Registered Teams)'}</h4>
        <p class="text-muted small mb-0">${isDemo ? 'ตรวจสอบและจัดการสถานะข้อมูล Demo เท่านั้น' : 'ตารางแสดงและจัดการข้อมูลทีมทั้งหมด ตรวจสอบเอกสาร และรับรองสิทธิ์'}</p>
      </div>
      <div class="d-flex align-items-center gap-2">
        ${isDemo ? '<span class="badge bg-primary text-warning px-3 py-2 fs-6">ข้อมูล Demo</span>' : ''}
        <span class="badge bg-navy px-3 py-2 fs-6"><i class="bi bi-person-circle me-1"></i> ${currentUser.fullname}</span>
      </div>
    </div>

    <!-- Filters Bar -->
    <div class="card bg-light border-0 rounded-3 p-3 mb-4">
      <div class="row g-2 align-items-end mb-2">
        <div class="col-md-2">
          <label class="form-label small fw-bold text-navy mb-1"><i class="bi bi-search me-1"></i> ค้นหาทีม / สังกัด</label>
          <input type="text" id="filterTeamSearch" class="form-control form-control-sm rounded-3" placeholder="พิมพ์ชื่อทีม หรือสังกัด...">
        </div>
        <div class="col-md-2">
          <label class="form-label small fw-bold text-navy mb-1"><i class="bi bi-calendar-event me-1"></i> ตั้งแต่วันที่สมัคร</label>
          <input type="date" id="filterTeamStartDate" class="form-control form-control-sm rounded-3">
        </div>
        <div class="col-md-2">
          <label class="form-label small fw-bold text-navy mb-1"><i class="bi bi-calendar-event me-1"></i> ถึงวันที่สมัคร</label>
          <input type="date" id="filterTeamEndDate" class="form-control form-control-sm rounded-3">
        </div>
        <div class="col-md-2">
          <label class="form-label small fw-bold text-navy mb-1"><i class="bi bi-map me-1"></i> ภาค</label>
          <select id="filterTeamRegion" class="form-select form-select-sm rounded-3" ${isSatOfficer ? 'disabled' : ''}>
            ${isSatOfficer
        ? `<option value="${satRegion}" selected>${satRegion || '-'}</option>`
        : `<option value="">-- ทั้งหมดทุกภาค --</option>` + allRegions.map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label small fw-bold text-navy mb-1"><i class="bi bi-geo-alt me-1"></i> จังหวัด</label>
          <select id="filterTeamProvince" class="form-select form-select-sm rounded-3" ${isSatOfficer ? 'disabled' : ''}>
            ${isSatOfficer
        ? `<option value="${satProvince}" selected>${satProvince} (กกท. ประจำจังหวัด)</option>`
        : `<option value="">-- ทั้งหมดทุกจังหวัด --</option>` + allProvinces.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label small fw-bold text-navy mb-1"><i class="bi bi-building me-1"></i> เขต / อำเภอ</label>
          <select id="filterTeamDistrict" class="form-select form-select-sm rounded-3">
            <option value="">-- ทั้งหมดทุกเขต/อำเภอ --</option>
          </select>
        </div>
      </div>
      <div class="row g-2 align-items-end">
        <div class="col-md-2">
          <label class="form-label small fw-bold text-navy mb-1"><i class="bi bi-gender-ambiguous me-1"></i> ประเภททีม</label>
          <select id="filterTeamGender" class="form-select form-select-sm rounded-3">
            <option value="">-- ทุกเพศ --</option>
            <option value="boy" ${typeFilter === 'men_teams' ? 'selected' : ''}>👨 ทีมชาย (Boy)</option>
            <option value="girl" ${typeFilter === 'women_teams' ? 'selected' : ''}>👩 ทีมหญิง (Girl)</option>
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small fw-bold text-navy mb-1"><i class="bi bi-funnel me-1"></i> สถานะการรับรอง</label>
          <select id="filterTeamStatus" class="form-select form-select-sm rounded-3">
            <option value="">-- ทั้งหมดทุกสถานะ --</option>
            <option value="PENDING" ${typeFilter === 'pending_teams' ? 'selected' : ''}>⏳ รอตรวจสอบทีม</option>
            <option value="APPROVED" ${typeFilter === 'approved_teams' ? 'selected' : ''}>✅ อนุมัติทีม</option>
            <option value="DELETED">🗑️ ถูกลบแล้ว (DELETED)</option>
          </select>
        </div>
        <div class="col-md-1">
          <button type="button" class="btn btn-sm btn-outline-secondary w-100 rounded-3 py-1" onclick="resetTeamFilters()" title="ล้างตัวกรองทั้งหมด">
            <i class="bi bi-arrow-counterclockwise"></i> ล้าง
          </button>
        </div>
        <div class="col-md-6 d-flex justify-content-end align-items-center">
          <span class="fs-5 fw-semibold text-dark">ข้อมูลจากการกรอง จำนวน <span id="filteredTeamsRowCount" class="text-danger">${initialFilteredTeams.length.toLocaleString('en-US')}</span> แถว</span>
        </div>
      </div>
    </div>

    <!-- Data Table with Sorting Headers -->
    <div class="table-responsive">
      <table class="table table-hover align-middle border" id="teamsDataTable">
        <thead class="table-dark">
          <tr>
            <th style="width: 40px;" class="text-center cursor-pointer" onclick="sortTeamsTable(0)"># <i class="bi bi-arrow-down-up small"></i></th>
            <th class="cursor-pointer" onclick="sortTeamsTable(1)">ชื่อทีม / โรงเรียน / อะคาเดมี่ <i class="bi bi-arrow-down-up small"></i></th>
            <th class="cursor-pointer" onclick="sortTeamsTable(2)">วัน-เวลา สมัคร <i class="bi bi-arrow-down-up small"></i></th>
            <th class="cursor-pointer" onclick="sortTeamsTable(3)">ภาค <i class="bi bi-arrow-down-up small"></i></th>
            <th class="cursor-pointer" onclick="sortTeamsTable(4)">จังหวัด <i class="bi bi-arrow-down-up small"></i></th>
            <th class="cursor-pointer" onclick="sortTeamsTable(5)">เขต / อำเภอ <i class="bi bi-arrow-down-up small"></i></th>
            <th class="cursor-pointer text-center" style="width: 125px;" onclick="sortTeamsTable(6)">รุ่น U14 <i class="bi bi-arrow-down-up small"></i></th>
            <th class="cursor-pointer text-center" style="width: 125px;" onclick="sortTeamsTable(7)">รุ่น U16 <i class="bi bi-arrow-down-up small"></i></th>
            <th class="cursor-pointer text-center" style="width: 125px;" onclick="sortTeamsTable(8)">รุ่น U18 <i class="bi bi-arrow-down-up small"></i></th>
            <th class="cursor-pointer" onclick="sortTeamsTable(9)">ผู้ประสานงาน <i class="bi bi-arrow-down-up small"></i></th>
            <th class="cursor-pointer text-center" onclick="sortTeamsTable(10)">สถานะทีม <i class="bi bi-arrow-down-up small"></i></th>
            <th class="text-center" style="width: 180px;">การจัดการ</th>
          </tr>
        </thead>
        <tbody id="teamsTableBody">
          ${(() => {
        const filtered = initialFilteredTeams;
        const getTeamDistrictCatSeqHelper = (t, catCode) => t?.registrationRanks?.[catCode] || 0;
        const getCatBadgeHelper = (teamObj, catCode) => {
            const attention = categoryAttentionHtml(teamObj, catCode);
            if (attention)
                return attention;
            const tp = teamObj.teamPlayers || [];
            const status = (0, statusHelper_1.getCategoryStatus)(teamObj, catCode, tp);
            if (status.text === 'ไม่ได้ลงทะเบียน') {
                return '<span class="text-danger small">ไม่ได้ส่งทีม</span>';
            }
            const seqNo = getTeamDistrictCatSeqHelper(teamObj, catCode);
            const seqBadgeHtml = seqNo > 0 ? `<span class="badge bg-light text-dark border small fw-normal"><i class="bi bi-hash me-1"></i>ลำดับ ${seqNo}</span>` : `<span class="small text-muted">${teamObj.registrationRankMessage || ''}</span>`;
            const counts = status.counts;
            const countsTitle = `นักกีฬา ${counts.players} คน / อนุมัติแล้ว ${counts.approved} คน / ต้องแก้ไข ${counts.needsFix} คน`;
            const formatShortThaiDateHelper = (dateStr) => {
                if (!dateStr)
                    return '';
                const d = new Date(dateStr);
                if (isNaN(d.getTime()))
                    return '';
                const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
                return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
            };
            const approvedAtText = status.text === 'อนุมัติ' ? formatShortThaiDateHelper(teamObj.categoryApprovedAt?.[catCode]) : '';
            const approvedAtHtml = approvedAtText ? `<span class="d-block small text-success fw-normal text-nowrap">${approvedAtText}</span>` : '';
            const countsHtml = `<span class="d-block small fw-bold text-nowrap" title="${countsTitle}"><span class="text-primary">${counts.players}</span> / <span class="text-success">${counts.approved}</span> / <span class="text-danger">${counts.needsFix}</span></span>`;
            const content = `<span class="d-flex flex-column align-items-center gap-1">${seqBadgeHtml}${status.badgeHtml}${countsHtml}${approvedAtHtml}</span>`;
            if (isDemo && !canManageDemoData)
                return content;
            return `<button type="button" class="btn p-0 border-0 bg-transparent" aria-label="${countsTitle}" title="ดูรายชื่อนักกีฬา รุ่น ${catCode} - ${countsTitle}" onclick="openAdminEditTeamModal('${teamObj.id}', '${catCode}')">${content}</button>`;
        };
        const formatDateTimeHelper = (dateStr) => {
            if (!dateStr)
                return '-';
            const d = new Date(dateStr);
            if (isNaN(d.getTime()))
                return '-';
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const yearBE = d.getFullYear() + 543;
            const hours = String(d.getHours()).padStart(2, '0');
            const mins = String(d.getMinutes()).padStart(2, '0');
            return `${day}/${month}/${yearBE} ${hours}:${mins} น.`;
        };
        const firstPage = filtered.slice(0, 50);
        return firstPage.map((t, idx) => {
            const info = (0, statusHelper_1.getTeamStatusInfo)(t.status);
            const normalizedStatus = ['APPROVED', 'REJECTED'].includes(t.status) ? t.status : 'PENDING';
            const btnClass = normalizedStatus === 'APPROVED' ? 'btn-success text-white' : normalizedStatus === 'REJECTED' ? 'btn-danger text-white' : 'btn-warning text-dark';
            const iconClass = normalizedStatus === 'APPROVED' ? 'bi-check-circle' : normalizedStatus === 'REJECTED' ? 'bi-x-circle' : 'bi-hourglass-split';
            const statBadge = t.is_deleted || !canClickTeamStatusColumn
                ? `<span class="badge ${info.colorClass} px-3 py-2">${info.text}</span>`
                : `<button type="button" class="btn btn-sm ${btnClass} px-3 py-1 rounded-pill shadow-sm text-nowrap fw-bold js-change-team-status" data-team-id="${escapeDemoHtml(t.id)}" data-team-name="${escapeDemoHtml(t.teamName || '')}" data-team-status="${normalizedStatus}" title="คลิกเพื่อเปลี่ยนสถานะทีม"><i class="bi ${iconClass} me-1"></i> ${info.text}</button>`;
            const actionBtns = isDemo && !canManageDemoData
                ? '<span class="small text-muted">ดูข้อมูล Demo</span>'
                : t.is_deleted
                    ? (isDemo ? '<span class="small text-muted">Demo: ทีมถูกซ่อนแล้ว</span>' : `<button class="btn btn-sm btn-outline-success rounded-3 px-2 py-1 me-1" onclick="restoreAdminTeam('${t.id}')" title="กู้คืนทีม"><i class="bi bi-arrow-counterclockwise me-1"></i> กู้คืนทีม</button>`)
                    : `<button class="btn btn-sm btn-outline-navy rounded-3 px-2 py-1 me-1" onclick="openAdminEditTeamModal('${t.id}')" title="แก้ไขข้อมูลทีม & ตรวจสอบนักกีฬา"><i class="bi bi-search me-1"></i> ตรวจสอบ</button>` +
                        `<button type="button" class="btn btn-sm btn-outline-danger rounded-3 px-2 py-1 js-delete-admin-team" data-team-id="${escapeDemoHtml(t.id)}" data-team-name="${escapeDemoHtml(t.teamName || 'ทีมนี้')}" title="ลบทีม"><i class="bi bi-trash me-1"></i> ลบ</button>`;
            const formattedRegTime = formatDateTimeHelper(t.createdAt || t.created_at);
            return `
                <tr class="${t.is_deleted ? 'table-secondary opacity-75' : ''}">
                  <td class="text-center fw-bold">${idx + 1}</td>
                  <td>${canEditTeamProfile && !t.is_deleted
                ? `<a class="fw-bold text-navy" href="${escapeDemoHtml(base)}/admin/team-edit.php?id=${escapeDemoHtml(encodeURIComponent(t.id))}" title="แก้ไขข้อมูลทีม">${escapeDemoHtml(t.teamName || '-')}</a>`
                : `<strong>${escapeDemoHtml(t.teamName || '-')}</strong>`}</td>
                  <td class="text-nowrap small text-muted"><i class="bi bi-clock me-1"></i>${formattedRegTime}</td>
                  <td><span class="badge bg-light text-dark border">${escapeDemoHtml(t.region || '-')}</span></td>
                  <td><span class="badge bg-light text-dark border">${t.province || '-'}</span></td>
                  <td>${(0, teamArea_1.getTeamDistrictName)(t) || '-'}</td>
                  <td class="text-center">${getCatBadgeHelper(t, 'U14')}</td>
                  <td class="text-center">${getCatBadgeHelper(t, 'U16')}</td>
                  <td class="text-center">${getCatBadgeHelper(t, 'U18')}</td>
                  <td>${t.managerName || '-'} (${t.phone || '-'})</td>
                  <td class="text-center">${statBadge}</td>
                  <td class="text-center">${actionBtns}</td>
                </tr>
              `;
        }).join('') || '<tr><td colspan="12" class="text-center text-muted py-4"><i class="bi bi-inbox me-1"></i> ไม่พบข้อมูลทีมตรงตามเงื่อนไขที่เลือก</td></tr>';
    })()}
        </tbody>
      </table>
    </div>
    <!-- Pagination & Record Info Controls -->
    <div class="d-flex flex-wrap justify-content-between align-items-center mt-3 pt-3 border-top gap-2" id="teamsPaginationContainer">
      <!-- Populated dynamically by JS -->
    </div>
  </div>

  <script type="application/json" id="rawTeamsDataJson">${JSON.stringify(allTeams, (key, value) => key === 'password' ? undefined : value).replace(/</g, '\\u003c')}</script>
  <script>
    var base = "${base}";
    window.canManageDemoData = ${canManageDemoData};
    window.canChangeTeamStatus = ${canChangeTeamStatus};
    window.canEditTeamProfile = ${canEditTeamProfile};
    window.canClickTeamStatusColumn = ${canClickTeamStatusColumn};
    window.canSetPendingTeamStatus = ${canSetPendingTeamStatus};
    window.isDemoMode = ${isDemo};
    var rawTeamsElem = document.getElementById('rawTeamsDataJson');
    window.rawTeamsData = rawTeamsElem ? JSON.parse(rawTeamsElem.textContent || '[]') : [];
    window.rawPlayersData = [];
    window.rawTeamsMap = {};
    window.baseUrl = base;
    window.isSatOfficer = ${isSatOfficer};
    window.satProvince = ${JSON.stringify(satProvince)};
    window.currentTeamPage = 1;
    window.teamPageSize = 50;

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    if (window.isDemoMode === true && typeof Swal !== 'undefined') {
      const originalSwalFire = Swal.fire.bind(Swal);
      Swal.fire = function(...args) {
        const config = typeof args[0] === 'object' && args[0] !== null
          ? { ...args[0] }
          : { title: args[0], text: args[1], icon: args[2] };
        const existingContent = config.html || (config.text ? escapeHtml(config.text) : '');
        config.html = existingContent + '<div class="alert alert-info border mt-3 mb-0 py-2 small"><strong>Demo</strong> — การดำเนินการนี้ใช้ข้อมูล Demo ไม่กระทบกับข้อมูลจริง</div>';
        delete config.text;
        return originalSwalFire(config);
      };
    }

    function getTeamDistrictCatSeqJs(t, catCode) {
      return t && t.registrationRanks ? (t.registrationRanks[catCode] || 0) : 0;
    }

    function getCatBadgeJs(t, catCode) {
      var state = t.categoryStates && t.categoryStates[catCode];
      if (state === 'UNAVAILABLE') return '<span class="text-muted small">ไม่สามารถใช้งานข้อมูลทีมได้</span>';
      if (state === 'INCONSISTENT' || state === 'CANCELLED') {
        var label = state === 'INCONSISTENT' ? 'ตรวจสอบสถานะรุ่น' : 'ยกเลิกการสมัครแล้ว';
        return '<span class="text-warning-emphasis small">' + label + '</span>' + (window.canChangeTeamStatus
          ? '<button type="button" class="btn btn-sm btn-outline-warning ms-1" data-team-id="' + escapeHtml(t.id) + '" data-category="' + catCode + '" onclick="reviewTeamCategory(this.dataset.teamId, this.dataset.category)">คืนสถานะ</button>' : '');
      }
      var regCats = (t.categories || '').split(',').map(function(c) { return c.trim().toUpperCase(); });
      if (!regCats.includes(catCode)) {
        return '<span class="text-danger small">ไม่ได้ส่งทีม</span>';
      }
      var cancelledCats = (t.cancelled_categories || t.cancelledCategories || '').split(',').map(function(c) { return c.trim().toUpperCase(); });
      var seqNo = getTeamDistrictCatSeqJs(t, catCode);
      var seqBadgeHtml = seqNo > 0 ? '<span class="badge bg-light text-dark border small fw-normal"><i class="bi bi-hash me-1"></i>ลำดับ ' + seqNo + '</span>' : '<span class="small text-muted">' + escapeHtml(t.registrationRankMessage || '') + '</span>';

      var playersInCat = (t.teamPlayers || []).filter(function(p) {
        var pCat = (p.category || p.categories || '').toUpperCase();
        return pCat.split(',').map(function(c) { return c.trim(); }).includes(catCode);
      });
      var subCats = (t.submitted_categories || t.submittedCategories || '').split(',').map(function(c) { return c.trim().toUpperCase(); });
      var isSubmitted = subCats.includes(catCode);
      var needsFixCount = playersInCat.filter(function(p) {
        return p.docStatus !== 'CORRECTED' && p.docStatus !== 'PENDING' && p.docStatus !== 'APPROVED' && (p.docStatus === 'REJECTED' || p.docStatus === 'ACTION_REQUIRED' || Boolean(p.remarks));
      }).length;
      var playerCount = playersInCat.length;
      var approvedCount = playersInCat.filter(function(p) {
        return p.docStatus === 'APPROVED';
      }).length;
      var countsTitle = 'นักกีฬา ' + playerCount + ' คน / อนุมัติแล้ว ' + approvedCount + ' คน / ต้องแก้ไข ' + needsFixCount + ' คน';
      function formatShortThaiDateJs(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        var months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        return d.getDate() + ' ' + months[d.getMonth()] + ' ' + (d.getFullYear() + 543);
      }
      function rosterButton(badgeHtml, approvedAtHtml) {
        var countsHtml = '<span class="d-block small fw-bold text-nowrap" title="' + countsTitle + '"><span class="text-primary">' + playerCount + '</span> / <span class="text-success">' + approvedCount + '</span> / <span class="text-danger">' + needsFixCount + '</span></span>';
        var content = '<span class="d-flex flex-column align-items-center gap-1">' + seqBadgeHtml + badgeHtml + countsHtml + (approvedAtHtml || '') + '</span>';
        if (window.isDemoMode === true && window.canManageDemoData !== true) return content;
        return '<button type="button" class="btn p-0 border-0 bg-transparent" aria-label="' + countsTitle + '" title="ดูรายชื่อนักกีฬา รุ่น ' + catCode + ' - ' + countsTitle + '" onclick="openAdminEditTeamModal(&quot;' + escapeHtml(t.id) + '&quot;, &quot;' + catCode + '&quot;)">' + content + '</button>';
      }
      if (cancelledCats.includes(catCode)) {
        return rosterButton('<span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1"><i class="bi bi-x-circle me-1"></i>ยกเลิกการสมัครแล้ว</span>');
      }
      if (playersInCat.length === 0 || !isSubmitted) {
        return rosterButton('<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1"><i class="bi bi-person-plus me-1"></i>รอเพิ่มนักกีฬา</span>');
      }
      var hasRejected = playersInCat.some(function(p) {
        return p.docStatus !== 'CORRECTED' && p.docStatus !== 'PENDING' && p.docStatus !== 'APPROVED' && (p.docStatus === 'REJECTED' || p.docStatus === 'ACTION_REQUIRED' || Boolean(p.remarks));
      });
      var allApproved = approvedCount >= 18;
      if (allApproved) {
        var approvedDateText = formatShortThaiDateJs(t.categoryApprovedAt && t.categoryApprovedAt[catCode]);
        var approvedAtHtml = approvedDateText ? '<span class="d-block small text-success fw-normal text-nowrap">' + escapeHtml(approvedDateText) + '</span>' : '';
        return rosterButton('<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1"><i class="bi bi-check-circle-fill me-1"></i>อนุมัติ</span>', approvedAtHtml);
      }
      if (hasRejected) {
        return rosterButton('<span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1"><i class="bi bi-exclamation-circle-fill me-1"></i>ปรับแก้ข้อมูลนักกีฬา</span>');
      }
      return rosterButton('<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle px-2 py-1"><i class="bi bi-hourglass-split me-1"></i>รอตรวจสอบ</span>');
    }

    function getTeamStatusBadgeJs(status, isDeleted, teamId, teamName) {
      var normalizedStatus = status === 'APPROVED' ? 'APPROVED' : (status === 'REJECTED' ? 'REJECTED' : 'PENDING');
      var info = {
        text: 'รอตรวจสอบทีม',
        icon: 'bi-hourglass-split',
        badgeClass: 'btn-warning text-dark'
      };
      if (normalizedStatus === 'APPROVED') {
        info = { text: 'อนุมัติทีม', icon: 'bi-check-circle', badgeClass: 'btn-success text-white' };
      } else if (normalizedStatus === 'REJECTED') {
        info = { text: 'ไม่อนุมัติ', icon: 'bi-x-circle', badgeClass: 'btn-danger text-white' };
      }
      if (isDeleted || window.canClickTeamStatusColumn !== true) {
        var badgeClass = normalizedStatus === 'APPROVED' ? 'bg-success' : (normalizedStatus === 'REJECTED' ? 'bg-danger' : 'bg-warning text-dark');
        return '<span class="badge ' + badgeClass + ' px-3 py-2">' + info.text + '</span>';
      }
      return '<button type="button" class="btn btn-sm ' + info.badgeClass + ' px-3 py-1 rounded-pill shadow-sm text-nowrap fw-bold js-change-team-status" data-team-id="' + escapeHtml(teamId) + '" data-team-name="' + escapeHtml(teamName || '') + '" data-team-status="' + normalizedStatus + '" title="คลิกเพื่อเปลี่ยนสถานะทีม"><i class="bi ' + info.icon + ' me-1"></i>' + info.text + '</button>';
    }

    function changeTeamPage(newPage) {
      window.currentTeamPage = newPage;
      renderTeamsTable();
    }

    function formatDateTimeJs(dateStr) {
      if (!dateStr) return '-';
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return '-';
      var day = String(d.getDate()).padStart(2, '0');
      var month = String(d.getMonth() + 1).padStart(2, '0');
      var yearBE = d.getFullYear() + 543;
      var hours = String(d.getHours()).padStart(2, '0');
      var mins = String(d.getMinutes()).padStart(2, '0');
      return day + '/' + month + '/' + yearBE + ' ' + hours + ':' + mins + ' น.';
    }

    function renderTeamsTable() {
      const searchInput = document.getElementById('filterTeamSearch');
      const search = searchInput ? (searchInput.value || '').toLowerCase() : '';
      const startDateEl = document.getElementById('filterTeamStartDate');
      const startDateVal = startDateEl ? startDateEl.value : '';
      const endDateEl = document.getElementById('filterTeamEndDate');
      const endDateVal = endDateEl ? endDateEl.value : '';
      const regEl = document.getElementById('filterTeamRegion');
      const reg = window.isSatOfficer ? '' : (regEl ? regEl.value : '');
      const provEl = document.getElementById('filterTeamProvince');
      const prov = window.isSatOfficer ? window.satProvince : (provEl ? provEl.value : '');
      const distEl = document.getElementById('filterTeamDistrict');
      const dist = distEl ? distEl.value : '';
      const statEl = document.getElementById('filterTeamStatus');
      const stat = statEl ? statEl.value : '';
      const genderEl = document.getElementById('filterTeamGender');
      const gender = genderEl ? genderEl.value : '';

      const startDateObj = startDateVal ? new Date(startDateVal + 'T00:00:00') : null;
      const endDateObj = endDateVal ? new Date(endDateVal + 'T23:59:59') : null;

      let filtered = window.rawTeamsData.filter(t => {
        if (stat === 'DELETED') {
          if (!t.is_deleted) return false;
        } else {
          if (t.is_deleted) return false;
          if (stat && t.status !== stat) return false;
        }

        if (reg && (t.region || '') !== reg) return false;
        if (prov && window.PmycTeamArea.normalizeProvince(t.province) !== window.PmycTeamArea.normalizeProvince(prov)) return false;
        if (dist) {
          const teamDist = window.PmycTeamArea.getTeamDistrictName(t);
          if (teamDist !== dist) return false;
        }
        if (gender) {
          const g = t.gender || 'boy';
          if (gender === 'boy' && g !== 'boy') return false;
          if (gender === 'girl' && g !== 'girl') return false;
        }
        if (startDateObj || endDateObj) {
          const regTime = t.createdAt || t.created_at ? new Date(t.createdAt || t.created_at).getTime() : 0;
          if (startDateObj && regTime < startDateObj.getTime()) return false;
          if (endDateObj && regTime > endDateObj.getTime()) return false;
        }
        if (search) {
          const matchName = (t.teamName || '').toLowerCase().includes(search);
          const matchManager = (t.managerName || '').toLowerCase().includes(search);
          if (!matchName && !matchManager) return false;
        }
        return true;
      });

      window.currentSortCol = window.currentSortCol !== undefined ? window.currentSortCol : 2;
      window.currentSortDir = window.currentSortDir || 'desc';

      // Sort filtered teams dynamically
      const colIdx = window.currentSortCol;
      const dir = window.currentSortDir;

      filtered.sort((a, b) => {
        let valA = '', valB = '';
        if (colIdx === 0) { valA = String(a.id || ''); valB = String(b.id || ''); }
        else if (colIdx === 1) { valA = a.teamName || a.school || ''; valB = b.teamName || b.school || ''; }
        else if (colIdx === 2) {
          const timeA = a.createdAt || a.created_at ? new Date(a.createdAt || a.created_at).getTime() : 0;
          const timeB = b.createdAt || b.created_at ? new Date(b.createdAt || b.created_at).getTime() : 0;
          return dir === 'asc' ? timeA - timeB : timeB - timeA;
        }
        else if (colIdx === 3) { valA = a.region || ''; valB = b.region || ''; }
        else if (colIdx === 4) { valA = a.province || ''; valB = b.province || ''; }
        else if (colIdx === 5) { valA = window.PmycTeamArea.getTeamDistrictName(a); valB = window.PmycTeamArea.getTeamDistrictName(b); }
        else if (colIdx === 6) { valA = (a.categories || '').includes('U14') ? '1' : '0'; valB = (b.categories || '').includes('U14') ? '1' : '0'; }
        else if (colIdx === 7) { valA = (a.categories || '').includes('U16') ? '1' : '0'; valB = (b.categories || '').includes('U16') ? '1' : '0'; }
        else if (colIdx === 8) { valA = (a.categories || '').includes('U18') ? '1' : '0'; valB = (b.categories || '').includes('U18') ? '1' : '0'; }
        else if (colIdx === 9) { valA = a.managerName || ''; valB = b.managerName || ''; }
        else if (colIdx === 10) { valA = a.status || ''; valB = b.status || ''; }

        return dir === 'asc' ? valA.localeCompare(valB, 'th') : valB.localeCompare(valA, 'th');
      });

      const totalItems = filtered.length;
      const filteredCountEl = document.getElementById('filteredTeamsRowCount');
      if (filteredCountEl) filteredCountEl.textContent = totalItems.toLocaleString('en-US');
      const pageSize = window.teamPageSize || 50;
      const totalPages = Math.ceil(totalItems / pageSize) || 1;
      if (window.currentTeamPage > totalPages) window.currentTeamPage = totalPages;
      if (window.currentTeamPage < 1) window.currentTeamPage = 1;

      const startIdx = (window.currentTeamPage - 1) * pageSize;
      const paginated = filtered.slice(startIdx, startIdx + pageSize);

      const tbody = document.getElementById('teamsTableBody');
      const pagContainer = document.getElementById('teamsPaginationContainer');

      if (!tbody) return;
      if (totalItems === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted py-4"><i class="bi bi-inbox me-1"></i> ไม่พบข้อมูลทีมตรงตามเงื่อนไขที่เลือก</td></tr>';
        if (pagContainer) pagContainer.innerHTML = '';
        return;
      }

      tbody.innerHTML = paginated.map((t, idx) => {
        const rowNum = startIdx + idx + 1;
        const statBadge = getTeamStatusBadgeJs(t.status, t.is_deleted, t.id, t.teamName);

        const actionBtns = window.isDemoMode === true && window.canManageDemoData !== true
          ? '<span class="small text-muted">ดูข้อมูล Demo</span>'
          : t.is_deleted
          ? (window.isDemoMode === true ? '<span class="small text-muted">Demo: ทีมถูกซ่อนแล้ว</span>' : '<button class="btn btn-sm btn-outline-success rounded-3 px-2 py-1 me-1" onclick="restoreAdminTeam(&quot;' + escapeHtml(t.id) + '&quot;)" title="กู้คืนทีม"><i class="bi bi-arrow-counterclockwise me-1"></i> กู้คืนทีม</button>')
          : '<button class="btn btn-sm btn-outline-navy rounded-3 px-2 py-1 me-1" onclick="openAdminEditTeamModal(&quot;' + escapeHtml(t.id) + '&quot;)" title="แก้ไขข้อมูลทีม & ตรวจสอบนักกีฬา"><i class="bi bi-search me-1"></i> ตรวจสอบ</button>' +
            '<button type="button" class="btn btn-sm btn-outline-danger rounded-3 px-2 py-1 js-delete-admin-team" data-team-id="' + escapeHtml(t.id) + '" data-team-name="' + escapeHtml(t.teamName || 'ทีมนี้') + '" title="ลบทีม"><i class="bi bi-trash me-1"></i> ลบ</button>';

        const formattedTime = formatDateTimeJs(t.createdAt || t.created_at);

        return '<tr class="' + (t.is_deleted ? 'table-secondary opacity-75' : '') + '">' +
            '<td class="text-center fw-bold">' + rowNum + '</td>' +
            '<td>' + (window.canEditTeamProfile === true && !t.is_deleted
              ? '<a class="fw-bold text-navy" href="' + escapeHtml(base) + '/admin/team-edit.php?id=' + escapeHtml(encodeURIComponent(t.id)) + '" title="แก้ไขข้อมูลทีม">' + escapeHtml(t.teamName || '-') + '</a>'
              : '<strong>' + escapeHtml(t.teamName || '-') + '</strong>') + '</td>' +
            '<td class="text-nowrap small text-muted"><i class="bi bi-clock me-1"></i>' + formattedTime + '</td>' +
            '<td><span class="badge bg-light text-dark border">' + escapeHtml(t.region || '-') + '</span></td>' +
            '<td><span class="badge bg-light text-dark border">' + escapeHtml(t.province || '-') + '</span></td>' +
            '<td>' + escapeHtml(window.PmycTeamArea.getTeamDistrictName(t) || '-') + '</td>' +
            '<td class="text-center">' + getCatBadgeJs(t, 'U14') + '</td>' +
            '<td class="text-center">' + getCatBadgeJs(t, 'U16') + '</td>' +
            '<td class="text-center">' + getCatBadgeJs(t, 'U18') + '</td>' +
            '<td>' + escapeHtml(t.managerName || '-') + ' (' + escapeHtml(t.phone || '-') + ')</td>' +
            '<td class="text-center">' + statBadge + '</td>' +
            '<td class="text-center">' + actionBtns + '</td>' +
          '</tr>';
      }).join('');

      if (pagContainer) {
        let pagHtml = '<div class="d-flex justify-content-between align-items-center mt-3 px-2">';
        pagHtml += '<div class="text-muted small">แสดง ' + (startIdx + 1) + ' ถึง ' + Math.min(startIdx + pageSize, totalItems) + ' จากทั้งหมด ' + totalItems + ' รายการ (หน้า ' + window.currentTeamPage + '/' + totalPages + ')</div>';
        pagHtml += '<nav><ul class="pagination pagination-sm mb-0">';

        const prevDisabled = window.currentTeamPage === 1 ? 'disabled' : '';
        pagHtml += '<li class="page-item ' + prevDisabled + '"><button class="page-link" onclick="changeTeamPage(' + (window.currentTeamPage - 1) + ')">ก่อนหน้า</button></li>';

        for (let p = 1; p <= totalPages; p++) {
          if (totalPages > 7) {
            if (p !== 1 && p !== totalPages && Math.abs(p - window.currentTeamPage) > 2) {
              if (p === 2 && window.currentTeamPage > 4) {
                pagHtml += '<li class="page-item disabled"><span class="page-link">...</span></li>';
              } else if (p === totalPages - 1 && window.currentTeamPage < totalPages - 3) {
                pagHtml += '<li class="page-item disabled"><span class="page-link">...</span></li>';
              }
              continue;
            }
          }
          const activeClass = p === window.currentTeamPage ? 'active' : '';
          pagHtml += '<li class="page-item ' + activeClass + '"><button class="page-link" onclick="changeTeamPage(' + p + ')">' + p + '</button></li>';
        }

        const nextDisabled = window.currentTeamPage === totalPages ? 'disabled' : '';
        pagHtml += '<li class="page-item ' + nextDisabled + '"><button class="page-link" onclick="changeTeamPage(' + (window.currentTeamPage + 1) + ')">ถัดไป</button></li>';

        pagHtml += '</ul></nav></div>';
        pagContainer.innerHTML = pagHtml;
      }
    }

    function sortTeamsTable(colIdx) {
      if (window.currentSortCol === colIdx) {
        window.currentSortDir = window.currentSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        window.currentSortCol = colIdx;
        window.currentSortDir = 'asc';
      }
      renderTeamsTable();
    }

    function normalizeDistrictName(district, province) {
      return window.PmycTeamArea.normalizeDistrictName(district, province);
    }

    function updateProvinceOptions() {
      if (window.isSatOfficer) return;
      const regEl = document.getElementById('filterTeamRegion');
      const selectedReg = regEl ? regEl.value : '';
      const provSelect = document.getElementById('filterTeamProvince');
      if (!provSelect) return;
      const prevProv = provSelect.value;
      const provinces = Array.from(new Set(
        window.rawTeamsData
          .filter(t => !selectedReg || t.region === selectedReg)
          .map(t => t.province)
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b, 'th'));
      provSelect.innerHTML = '<option value="">-- ทั้งหมดทุกจังหวัด --</option>';
      provinces.forEach(p => {
        provSelect.innerHTML += '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + '</option>';
      });
      if (prevProv && provinces.includes(prevProv)) {
        provSelect.value = prevProv;
      } else {
        provSelect.value = '';
      }
    }

    function updateDistrictOptions() {
      const provEl = document.getElementById('filterTeamProvince');
      const selectedProv = window.isSatOfficer ? window.satProvince : (provEl ? provEl.value : '');
      const distSelect = document.getElementById('filterTeamDistrict');
      if (!distSelect) return;
      distSelect.innerHTML = '<option value="">-- ทั้งหมดทุกเขต/อำเภอ --</option>';

      if (selectedProv) {
        const districts = Array.from(new Set(
          window.rawTeamsData
            .filter(t => t.province === selectedProv)
            .map(t => window.PmycTeamArea.getTeamDistrictName(t))
            .filter(Boolean)
        )).sort((a, b) => a.localeCompare(b, 'th'));
        districts.forEach(d => {
          distSelect.innerHTML += '<option value="' + d + '">' + d + '</option>';
        });
      }
    }

    function resetTeamFilters() {
      const searchInput = document.getElementById('filterTeamSearch');
      const startDateEl = document.getElementById('filterTeamStartDate');
      const endDateEl = document.getElementById('filterTeamEndDate');
      const regEl = document.getElementById('filterTeamRegion');
      const provEl = document.getElementById('filterTeamProvince');
      const distEl = document.getElementById('filterTeamDistrict');
      const genderEl = document.getElementById('filterTeamGender');
      const statEl = document.getElementById('filterTeamStatus');

      if (searchInput) searchInput.value = '';
      if (startDateEl) startDateEl.value = '';
      if (endDateEl) endDateEl.value = '';
      if (regEl && !window.isSatOfficer) regEl.value = '';
      if (!window.isSatOfficer) updateProvinceOptions();
      if (provEl && !window.isSatOfficer) provEl.value = '';
      if (genderEl) genderEl.value = '';
      if (statEl) statEl.value = '';

      updateDistrictOptions();
      if (distEl) distEl.value = '';
      renderTeamsTable();
    }

    window.openChangeTeamStatusModal = function(teamId, teamName, currentStatus) {
      if (window.canChangeTeamStatus !== true || window.canClickTeamStatusColumn !== true) return;
      document.getElementById('changeTeamStatusTeamId').value = teamId || '';
      document.getElementById('changeTeamStatusNameDisplay').textContent = teamName || '-';

      const normalizedStatus = ['APPROVED', 'REJECTED'].includes(currentStatus) ? currentStatus : 'PENDING';
      document.getElementById('changeTeamStatusOldStatus').value = normalizedStatus;
      const selectEl = document.getElementById('changeTeamStatusSelect');
      if (selectEl) {
        selectEl.value = normalizedStatus;
      }

      window.onTeamStatusSelectChange();

      const modalEl = document.getElementById('changeTeamStatusModal');
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
      }
    };

    window.onTeamStatusSelectChange = function() {
      const selected = document.getElementById('changeTeamStatusSelect').value;
      const previewEl = document.getElementById('changeTeamStatusPreviewBadge');
      const approvedAlert = document.getElementById('changeTeamStatusApprovedAlert');
      const teamName = document.getElementById('changeTeamStatusNameDisplay').textContent;

      if (approvedAlert) {
        approvedAlert.classList.toggle('d-none', selected !== 'APPROVED');
        if (selected === 'APPROVED') {
          const alertTeamNameEl = document.getElementById('changeTeamStatusApprovedTeamName');
          if (alertTeamNameEl) alertTeamNameEl.textContent = teamName;
        }
      }

      if (previewEl) {
        if (selected === 'APPROVED') {
          previewEl.className = 'badge bg-success px-3 py-2 fs-6';
          previewEl.innerHTML = '<i class="bi bi-check-circle me-1"></i> อนุมัติทีม';
        } else if (selected === 'REJECTED') {
          previewEl.className = 'badge bg-danger px-3 py-2 fs-6';
          previewEl.innerHTML = '<i class="bi bi-x-circle me-1"></i> ไม่อนุมัติ';
        } else {
          previewEl.className = 'badge bg-warning text-dark px-3 py-2 fs-6';
          previewEl.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> รอตรวจสอบทีม';
        }
      }
    };

    window.submitChangeTeamStatus = async function() {
      if (window.canChangeTeamStatus !== true) return;
      const id = document.getElementById('changeTeamStatusTeamId').value;
      const oldStatus = document.getElementById('changeTeamStatusOldStatus').value;
      const newStatus = document.getElementById('changeTeamStatusSelect').value;
      const teamName = document.getElementById('changeTeamStatusNameDisplay').textContent;
      if (!id || !newStatus) return;
      if (newStatus === 'PENDING' && window.canSetPendingTeamStatus !== true) {
        Swal.fire({ icon: 'warning', title: 'ไม่มีสิทธิ์เปลี่ยนสถานะนี้', text: 'สิทธิ์เจ้าหน้าที่ตรวจเอกสารสามารถอนุมัติทีมได้เท่านั้น' });
        return;
      }

      const getStatusBadgeHtml = function(s) {
        if (s === 'APPROVED') return '<span class="badge bg-success px-2 py-1"><i class="bi bi-check-circle me-1"></i>อนุมัติทีม</span>';
        if (s === 'REJECTED') return '<span class="badge bg-danger px-2 py-1"><i class="bi bi-x-circle me-1"></i>ไม่อนุมัติ</span>';
        return '<span class="badge bg-warning text-dark px-2 py-1"><i class="bi bi-hourglass-split me-1"></i>รอตรวจสอบทีม</span>';
      };

      const btnSubmit = document.getElementById('btnSubmitChangeTeamStatus');
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> กำลังบันทึก...';
      }

      try {
        const res = await fetch(base + '/api/admin/teams/update-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status: newStatus, isDemo: window.isDemoMode === true })
        });
        const data = await res.json();
        if (data.success) {
          const found = window.rawTeamsData.find(t => String(t.id).trim() === String(id).trim());
          if (found) {
            found.status = newStatus;
          }
          renderTeamsTable();

          const modalEl = document.getElementById('changeTeamStatusModal');
          if (modalEl) {
            const bsModal = bootstrap.Modal.getInstance(modalEl);
            if (bsModal) bsModal.hide();
          }

          let detailTextHtml = 'เปลี่ยนสถานะของทีม <strong>' + escapeHtml(teamName) + '</strong><br>' +
            'จากเดิม ' + getStatusBadgeHtml(oldStatus) + ' <i class="bi bi-arrow-right mx-1"></i> เป็น ' + getStatusBadgeHtml(newStatus);

          if (newStatus === 'APPROVED') {
            detailTextHtml += '<div class="alert alert-success mt-3 mb-0 p-2 small"><i class="bi bi-patch-check-fill me-1"></i> ทีม <strong>' + escapeHtml(teamName) + '</strong> ได้ผ่านการตรวจสอบเรียบร้อยแล้ว</div>';
          }

          Swal.fire({
            icon: 'success',
            title: 'เปลี่ยนสถานะสำเร็จ!',
            html: detailTextHtml,
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#198754'
          });
        } else {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: data.error || 'ไม่สามารถบันทึกสถานะได้' });
        }
      } catch (e) {
        console.error('Error submitting change team status:', e);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = '<i class="bi bi-check-lg me-1"></i> ยืนยันเปลี่ยนสถานะ';
        }
      }
    };

    async function updateTeamStatus(id, status, rejectReason = '') {
      if (window.canChangeTeamStatus !== true) return false;
      const res = await fetch(base + '/api/admin/teams/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ id, status, rejectReason, isDemo: window.isDemoMode === true })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        Swal.fire({
          icon: 'error',
          title: 'เปลี่ยนสถานะทีมไม่สำเร็จ',
          text: data.error || 'คำขอไม่สำเร็จ (HTTP ' + res.status + ')'
        });
        return false;
      }

      const found = window.rawTeamsData.find(t => t.id === id);
      if (found) {
        found.status = status;
        found.rejectReason = status === 'REJECTED' ? rejectReason : '';
        found.reject_reason = status === 'REJECTED' ? rejectReason : '';
      }
      renderTeamsTable();
      const successTitle = status === 'REJECTED' ? 'ไม่อนุมัติทีมแล้ว' : status === 'APPROVED' ? 'อนุมัติทีมสำเร็จ' : 'อัปเดตสถานะทีมแล้ว';
      Swal.fire({ icon: 'success', title: successTitle, timer: 1500, showConfirmButton: false });
      return true;
    }

    window.toggleAdminBkkZone = function() {
      const provEl = document.getElementById('editProvince');
      const bkkZoneCont = document.getElementById('editBkkZoneContainer');
      if (provEl && bkkZoneCont) {
        const prov = (provEl.value || '').trim();
        const isBkk = prov === 'กรุงเทพมหานคร' || prov.toLowerCase() === 'bangkok';
        bkkZoneCont.style.display = isBkk ? 'block' : 'none';
      }
    };

    window.openAdminEditTeamModal = async function(teamId, categoryCode, mainTabId) {
      categoryCode = String(categoryCode || '').trim().toUpperCase();
      mainTabId = ['team-info-tab', 'team-players-tab', 'team-officials-tab'].includes(mainTabId) ? mainTabId : '';
      if (categoryCode && !['U14', 'U16', 'U18'].includes(categoryCode)) {
        Swal.fire({ icon: 'warning', title: 'ไม่พบรุ่นการแข่งขัน', text: 'รุ่นการแข่งขันที่เลือกไม่ถูกต้อง' });
        return;
      }
      window.adminSelectedCategory = categoryCode;
      Swal.fire({ title: 'กำลังโหลดข้อมูลทีม...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      try {
        const res = await fetch(base + '/api/admin/teams/full-details?teamId=' + encodeURIComponent(teamId) + (window.isDemoMode === true ? '&demo=true' : ''));
        const data = await res.json();
        Swal.close();

        if (!data.success || !data.team) {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: data.error || 'ไม่พบข้อมูลทีม' });
          return;
        }

        const team = data.team;
        const players = data.players || [];
        const officials = data.officials || [];
        const submittedCats = (team.submitted_categories || team.submittedCategories || '').split(',').map(c => c.trim().toUpperCase());
        const cancelledCats = (team.cancelled_categories || team.cancelledCategories || '').split(',').map(c => c.trim().toUpperCase());

        // Build Players Tabs
        const registeredCategories = String(team.categories || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
        if (categoryCode && !registeredCategories.includes(categoryCode)) {
          Swal.fire({ icon: 'warning', title: 'ทีมไม่ได้ส่งรุ่นนี้', text: 'ทีมนี้ไม่ได้ลงทะเบียนในรุ่น ' + categoryCode });
          return;
        }
        const allCategories = Array.from(new Set(['ALL', ...registeredCategories]));
        const initialCategory = categoryCode && registeredCategories.includes(categoryCode) ? categoryCode : 'ALL';

        const teamName = String(team.teamName || team.team_name || team.school || '').trim();
        const teamProvince = String(team.province || '').trim();
        const teamDistrict = window.PmycTeamArea.getTeamDistrictName(team);
        const teamHeading = [teamName, teamProvince, teamDistrict].filter(Boolean).map(escapeHtml).join(' ') || 'ไม่ระบุข้อมูลทีม';

        let categoryTabsHtml = '';
        {
          categoryTabsHtml = '<ul class="nav nav-pills mb-3" id="adminPlayerCatTabs" role="tablist">';
          allCategories.forEach((cat, idx) => {
            const isActive = cat === initialCategory ? 'active' : '';
            const count = cat === 'ALL' ? players.length : players.filter(p => (p.category || p.categories || 'U14').toUpperCase().split(',').map(c => c.trim()).includes(cat)).length;
            const label = cat === 'ALL' ? 'ทั้งหมด (' + players.length + ' คน)' : 'รุ่น ' + cat + ' (' + count + ' คน)';
            categoryTabsHtml += '<li class="nav-item" role="presentation">' +
              '<button class="nav-link ' + isActive + ' btn-sm fw-bold me-2 mb-2" id="admin-cat-' + cat + '-tab" data-bs-toggle="pill" data-bs-target="#admin-cat-' + cat + '-pane" type="button" role="tab">' + label + '</button>' +
            '</li>';
          });
          categoryTabsHtml += '</ul>';
        }

        let categoryPanesHtml = '<div class="tab-content" id="adminPlayerCatTabContent">';
        allCategories.forEach((cat, idx) => {
          const isActive = cat === initialCategory ? 'show active' : '';
          const catPlayers = cat === 'ALL' ? players : players.filter(p => (p.category || p.categories || 'U14').toUpperCase().split(',').map(c => c.trim()).includes(cat));

          let playerRowsHtml = '';
          if (catPlayers.length === 0) {
            playerRowsHtml = '<tr><td colspan="9" class="text-center text-muted py-4"><i class="bi bi-inbox fs-3 d-block mb-1"></i>ไม่พบข้อมูลนักกีฬาในหมวดหมู่นี้</td></tr>';
          } else {
            playerRowsHtml = catPlayers.map((p, pIdx) => {
              const displayName = p.name || (p.prefix ? p.prefix + ' ' : '') + (p.firstName || p.first_name || '') + ' ' + (p.lastName || p.last_name || '') || 'ไม่ระบุชื่อ';
              const playerPhoto = p.photoUrl || p.photo_url || '';
              const photoThumb = playerPhoto 
                ? '<img src="' + base + playerPhoto + '" width="40" height="40" class="rounded border object-fit-cover cursor-pointer" onclick="viewPhoto(&quot;' + escapeHtml(displayName).replace(/"/g, '&quot;') + '&quot;, &quot;' + base + playerPhoto + '&quot;)">'
                : '<span class="badge bg-secondary">ไม่มีรูป</span>';
              const playerCategories = String(p.category || p.categories || 'U14').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
              const pCatList = cat === 'ALL' ? playerCategories : playerCategories.filter(playerCategory => playerCategory === cat);
              const allPlayerCategoriesSubmitted = playerCategories.length > 0 && playerCategories.every(category => submittedCats.includes(category));
              const catBadge = pCatList.map(c => {
                const bg = c === 'U14' ? 'bg-info text-dark' : (c === 'U16' ? 'bg-primary' : 'bg-danger');
                return '<span class="badge ' + bg + ' me-1">' + escapeHtml(c) + '</span>';
              }).join('');
              const isCurrentCatSubmitted = allPlayerCategoriesSubmitted && (cat === 'ALL' || submittedCats.includes(cat));
              const playerNeedsCorrection = p.docStatus !== 'CORRECTED' && p.docStatus !== 'PENDING' && p.docStatus !== 'APPROVED' && (p.docStatus === 'REJECTED' || p.docStatus === 'ACTION_REQUIRED' || Boolean(p.remarks));
              const docBadge = !isCurrentCatSubmitted ? '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle"><i class="bi bi-dash-circle me-1"></i> ยังมีรุ่นที่ไม่ส่งรายชื่อ</span>' : (p.docStatus === 'CORRECTED' ? '<span class="badge bg-info text-dark"><i class="bi bi-pencil-square me-1"></i> แก้ไขข้อมูลเรียบร้อย</span>' : (playerNeedsCorrection ? '<span class="badge bg-danger"><i class="bi bi-exclamation-triangle me-1"></i> ปรับแก้ข้อมูลนักกีฬา</span>' : (p.docStatus === 'APPROVED' ? '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i> ครบถ้วน</span>' : '<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i> รอตรวจสอบ</span>')));
              const deletePlayerButton = window.isDemoMode === true ? '' : '<button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteAdminPlayer(&quot;' + p.id + '&quot;, &quot;' + escapeHtml(displayName).replace(/"/g, '&quot;') + '&quot;)" title="ลบข้อมูลนักกีฬา"><i class="bi bi-trash"></i></button>';
              
              return '<tr>' +
                '<td class="text-center fw-bold">' + (pIdx + 1) + '</td>' +
                '<td class="text-center">' + photoThumb + '</td>' +
                '<td><strong>' + escapeHtml(displayName) + '</strong></td>' +
                '<td><span class="font-monospace">' + escapeHtml(p.idCard || p.id_card || '-') + '</span></td>' +
                '<td class="text-center"><span class="badge bg-light text-dark border fw-bold">' + escapeHtml(p.jerseyNo !== undefined && p.jerseyNo !== null ? p.jerseyNo : (p.jersey_no !== undefined && p.jersey_no !== null ? p.jersey_no : '-')) + '</span></td>' +
                '<td>' + escapeHtml(p.position || '-') + '</td>' +
                '<td class="text-center">' + catBadge + '</td>' +
                '<td class="text-center">' + docBadge + '</td>' +
                '<td class="text-center">' +
                  '<button type="button" class="btn btn-sm btn-outline-primary me-1" onclick="openTeamPlayerVerification(&quot;' + p.id + '&quot;)"><i class="bi bi-search me-1"></i> ตรวจรายละเอียด</button>' +
                  deletePlayerButton +
                '</td>' +
              '</tr>';
            }).join('');
          }

          categoryPanesHtml += '<div class="tab-pane fade ' + isActive + '" id="admin-cat-' + cat + '-pane" role="tabpanel" tabindex="0">' +
            '<div class="table-responsive">' +
              '<table class="table table-sm table-bordered table-hover align-middle mb-0">' +
                '<thead class="table-light">' +
                  '<tr>' +
                    '<th class="text-center">#</th>' +
                    '<th class="text-center">รูปถ่าย</th>' +
                    '<th>ชื่อ-นามสกุล</th>' +
                    '<th>เลขบัตรประชาชน</th>' +
                    '<th class="text-center">หมายเลขเสื้อ</th>' +
                    '<th>ตำแหน่ง</th>' +
                    '<th class="text-center">รุ่นอายุ</th>' +
                    '<th class="text-center">สถานะนักกีฬา</th>' +
                    '<th class="text-center">การจัดการ</th>' +
                  '</tr>' +
                '</thead>' +
                '<tbody>' + playerRowsHtml + '</tbody>' +
              '</table>' +
            '</div>' +
          '</div>';
        });
        categoryPanesHtml += '</div>';

        // Officials category tabs mirror the player roster tabs.
        let officialsTabsHtml = '<ul class="nav nav-pills mb-3" id="adminOfficialCatTabs" role="tablist">';
        allCategories.forEach(cat => {
          const categoryOfficials = cat === 'ALL' ? officials : officials.filter(o => String(o.categories || o.category || 'U14').toUpperCase().split(',').map(c => c.trim()).includes(cat));
          const isActive = cat === initialCategory ? 'active' : '';
          const label = cat === 'ALL' ? 'ทั้งหมด (' + categoryOfficials.length + ' คน)' : 'รุ่น ' + cat + ' (' + categoryOfficials.length + ' คน)';
          officialsTabsHtml += '<li class="nav-item" role="presentation">' +
            '<button class="nav-link ' + isActive + ' btn-sm fw-bold me-2 mb-2" id="admin-official-cat-' + cat + '-tab" data-bs-toggle="pill" data-bs-target="#admin-official-cat-' + cat + '-pane" type="button" role="tab">' + label + '</button>' +
          '</li>';
        });
        officialsTabsHtml += '</ul>';

        let officialsHtml = officialsTabsHtml + '<div class="tab-content" id="adminOfficialCatTabContent">';
        allCategories.forEach(cat => {
          const categoryOfficials = cat === 'ALL' ? officials : officials.filter(o => String(o.categories || o.category || 'U14').toUpperCase().split(',').map(c => c.trim()).includes(cat));
          const isActive = cat === initialCategory ? 'show active' : '';
          const officialRowsHtml = categoryOfficials.length === 0
            ? '<tr><td colspan="7" class="text-center text-muted py-4"><i class="bi bi-inbox fs-3 d-block mb-1"></i>' + (officials.length === 0 ? 'ยังไม่มีข้อมูลเจ้าหน้าที่ประจำทีม' : 'ไม่พบข้อมูลเจ้าหน้าที่ในหมวดหมู่นี้') + '</td></tr>'
            : categoryOfficials.map((o, oIdx) => '<tr>' +
                '<td class="text-center fw-bold">' + (oIdx + 1) + '</td>' +
                '<td><strong>' + escapeHtml(o.name) + '</strong></td>' +
                '<td><span class="badge bg-light text-dark border">' + escapeHtml(o.position || '-') + '</span></td>' +
                '<td><span class="font-monospace">' + escapeHtml(o.idCard || '-') + '</span></td>' +
                '<td>' + escapeHtml(o.phone || '-') + '</td>' +
                '<td>' + escapeHtml(o.email || '-') + '</td>' +
                '<td class="text-center">' +
                  (window.isDemoMode === true ? '<span class="small text-muted">Demo: ปิดการลบ</span>' : '<button type="button" class="btn btn-sm btn-outline-danger py-0 px-2" onclick="deleteAdminOfficial(&quot;' + o.id + '&quot;, &quot;' + escapeHtml(o.name).replace(/"/g, '&quot;') + '&quot;)" title="ลบข้อมูลเจ้าหน้าที่"><i class="bi bi-trash me-1"></i> ลบ</button>') +
                '</td>' +
              '</tr>').join('');

          officialsHtml += '<div class="tab-pane fade ' + isActive + '" id="admin-official-cat-' + cat + '-pane" role="tabpanel" tabindex="0">' +
            '<div class="table-responsive"><table class="table table-sm table-bordered align-middle mb-0">' +
              '<thead class="table-light"><tr>' +
                '<th class="text-center">#</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่งประจำทีม</th><th>เลขบัตรประชาชน</th><th>เบอร์โทรศัพท์</th><th>อีเมล</th><th class="text-center">การจัดการ</th>' +
              '</tr></thead><tbody>' + officialRowsHtml + '</tbody>' +
            '</table></div>' +
          '</div>';
        });
        officialsHtml += '</div>';

        // Populate Modal Fields safely
        const safeSetVal = function(id, val) {
          const el = document.getElementById(id);
          if (el) el.value = val || '';
        };

        safeSetVal('editTeamId', team.id);
        safeSetVal('editTeamName', team.teamName || team.school || '');
        safeSetVal('editSchoolCode', team.school_code || '');
        safeSetVal('editProvince', team.province || '');
        safeSetVal('editBkkZone', team.bkk_zone || '');
        toggleAdminBkkZone();
        safeSetVal('editDistrict', window.PmycTeamArea.getTeamDistrictName(team));
        safeSetVal('editGender', team.gender || 'boy');
        safeSetVal('editCategories', team.categories || '');
        
        safeSetVal('editManagerName', team.managerName || '');
        safeSetVal('editEmail', team.email || '');
        safeSetVal('editPhone', team.phone || '');
        safeSetVal('editLineId', team.line_id || '');
        safeSetVal('editHouseNo', team.house_no || '');
        safeSetVal('editRoad', team.road || '');
        safeSetVal('editSubdistrict', team.subdistrict || '');
        safeSetVal('editContactDistrict', window.PmycTeamArea.normalizeDistrictName(team.contact_district, team.contact_province));
        safeSetVal('editContactProvince', team.contact_province || team.province || '');

        // Populate Team Submitted Documents (Read-Only Review)
        const docTeamCert = team.docTeamCert || team.doc_team_cert || '';
        const docRoster = team.docRoster || team.doc_roster || '';

        const certStatusEl = document.getElementById('editDocTeamCertStatus');
        const certBtnEl = document.getElementById('editDocTeamCertBtn');
        if (certBtnEl && certStatusEl) {
          if (docTeamCert) {
            certStatusEl.className = 'badge bg-success-subtle text-success small border border-success-subtle';
            certStatusEl.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> มีไฟล์เอกสารแนบแล้ว';
            certBtnEl.disabled = false;
            certBtnEl.className = 'btn btn-sm btn-outline-info fw-semibold';
            certBtnEl.onclick = function() {
              viewPhoto('หนังสือรับรองทีม — ' + (team.teamName || team.school || ''), base + docTeamCert);
            };
          } else {
            certStatusEl.className = 'badge bg-secondary-subtle text-muted small';
            certStatusEl.innerHTML = 'ยังไม่อัปโหลด';
            certBtnEl.disabled = true;
            certBtnEl.className = 'btn btn-sm btn-secondary disabled opacity-50';
            certBtnEl.onclick = null;
          }
        }

        const rosterStatusEl = document.getElementById('editDocRosterStatus');
        const rosterBtnEl = document.getElementById('editDocRosterBtn');
        if (rosterBtnEl && rosterStatusEl) {
          if (docRoster) {
            rosterStatusEl.className = 'badge bg-success-subtle text-success small border border-success-subtle';
            rosterStatusEl.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> มีไฟล์เอกสารแนบแล้ว';
            rosterBtnEl.disabled = false;
            rosterBtnEl.className = 'btn btn-sm btn-outline-info fw-semibold';
            rosterBtnEl.onclick = function() {
              viewPhoto('ใบรายชื่อนักกีฬา — ' + (team.teamName || team.school || ''), base + docRoster);
            };
          } else {
            rosterStatusEl.className = 'badge bg-secondary-subtle text-muted small';
            rosterStatusEl.innerHTML = 'ยังไม่อัปโหลด';
            rosterBtnEl.disabled = true;
            rosterBtnEl.className = 'btn btn-sm btn-secondary disabled opacity-50';
            rosterBtnEl.onclick = null;
          }
        }

        const rosterCont = document.getElementById('adminRosterTabContainer');
        if (rosterCont) {
          rosterCont.innerHTML = '<div class="mb-3"><div class="fs-4 fw-bold text-navy">' + teamHeading + '</div></div>' + categoryTabsHtml + categoryPanesHtml;
          rosterCont.querySelectorAll('[data-bs-toggle="pill"]').forEach(tab => {
            tab.addEventListener('shown.bs.tab', () => {
              const selectedCategory = tab.id.replace('admin-cat-', '').replace('-tab', '');
              window.adminSelectedCategory = selectedCategory === 'ALL' ? '' : selectedCategory;
              const isSubmitted = selectedCategory === 'ALL' ? submittedCats.length > 0 : submittedCats.includes(selectedCategory);
              const isCancelled = cancelledCats.includes(selectedCategory);
              const badge = document.getElementById('editTeamStatusBadge');
              if (badge && (isCancelled || team.status !== 'APPROVED')) {
                if (isCancelled) {
                  badge.className = 'badge bg-danger-subtle text-danger border border-danger-subtle px-3 py-2 fs-6';
                  badge.innerHTML = '<i class="bi bi-x-circle me-1"></i> ยกเลิกการสมัครแล้ว';
                } else {
                  badge.className = isSubmitted ? 'badge bg-warning text-dark px-3 py-2 fs-6' : 'badge bg-secondary-subtle text-secondary border border-secondary-subtle px-3 py-2 fs-6';
                  badge.innerHTML = isSubmitted ? '<i class="bi bi-hourglass-split me-1"></i> รอตรวจสอบนักกีฬา' : '<i class="bi bi-person-plus me-1"></i> ยังไม่ได้กดส่งรายชื่อ';
                }
              }
            });
          });
        }

        const offCont = document.getElementById('adminOfficialsContainer');
        if (offCont) offCont.innerHTML = officialsHtml;

        window.adminLoadedPlayers = players;
        window.adminLoadedTeamSubmittedCats = submittedCats.join(',');
        window.adminLoadedTeam = team;
        window.rawPlayersData = players;
        window.rawTeamsMap = window.rawTeamsMap || {};
        window.rawTeamsMap[String(team.id)] = team;

        // Status Badge Header & Approve/Reject Button Guards
        const modalStatusBadge = document.getElementById('editTeamStatusBadge');
        const btnApprove = document.getElementById('btnAdminApproveTeam');
        const btnReject = document.getElementById('btnAdminShowRejectTeamForm');
        const rejectReasonPanel = document.getElementById('adminRejectTeamReasonPanel');
        const rejectReasonInput = document.getElementById('adminRejectTeamReason');

        const isPending = team.status === 'PENDING';

        if (modalStatusBadge) {
          if (categoryCode && cancelledCats.includes(categoryCode)) {
            modalStatusBadge.className = 'badge bg-danger-subtle text-danger border border-danger-subtle px-3 py-2 fs-6';
            modalStatusBadge.innerHTML = '<i class="bi bi-x-circle me-1"></i> ยกเลิกการสมัครแล้ว';
          } else if (team.status === 'APPROVED') {
            modalStatusBadge.className = 'badge bg-success px-3 py-2 fs-6';
            modalStatusBadge.innerHTML = '<i class="bi bi-check-circle me-1"></i> รับรองแล้ว (APPROVED)';
          } else if (team.status === 'REJECTED') {
            modalStatusBadge.className = 'badge bg-danger px-3 py-2 fs-6';
            modalStatusBadge.innerHTML = '<i class="bi bi-x-circle me-1"></i> ไม่อนุมัติ';
          } else {
            const isCatSubmitted = categoryCode && submittedCats.includes(categoryCode);
            if (categoryCode && !isCatSubmitted) {
              modalStatusBadge.className = 'badge bg-secondary-subtle text-secondary border border-secondary-subtle px-3 py-2 fs-6';
              modalStatusBadge.innerHTML = '<i class="bi bi-person-plus me-1"></i> ยังไม่ได้กดส่งรายชื่อ';
            } else if (categoryCode && isCatSubmitted) {
              modalStatusBadge.className = 'badge bg-warning text-dark px-3 py-2 fs-6';
              modalStatusBadge.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> รอตรวจสอบนักกีฬา';
            } else {
              modalStatusBadge.className = 'badge bg-warning text-dark px-3 py-2 fs-6';
              modalStatusBadge.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> รอตรวจสอบทีม';
            }
          }
        }

        const isApproved = team.status === 'APPROVED';

        if (btnApprove) {
          btnApprove.disabled = isApproved || window.canChangeTeamStatus !== true;
          if (isApproved || window.canChangeTeamStatus !== true) {
            btnApprove.classList.add('disabled', 'opacity-50');
            btnApprove.title = isApproved ? 'ทีมได้รับการอนุมัติแล้ว' : 'ไม่มีสิทธิ์เปลี่ยนสถานะทีม';
          } else {
            btnApprove.classList.remove('disabled', 'opacity-50');
            btnApprove.title = '';
          }
        }
        if (btnReject) {
          btnReject.disabled = team.status === 'REJECTED' || window.canChangeTeamStatus !== true;
          btnReject.title = team.status === 'REJECTED' ? 'ทีมนี้ไม่อนุมัติแล้ว' : '';
        }
        if (rejectReasonPanel) rejectReasonPanel.classList.add('d-none');
        if (rejectReasonInput instanceof HTMLTextAreaElement) rejectReasonInput.value = '';

        const modalEl = document.getElementById('adminEditTeamModal');
        if (modalEl) {
          const mainTabs = document.getElementById('adminTeamMainTabs');
          const statusActions = document.getElementById('adminTeamStatusActions');
          const resetCatBtn = document.getElementById('btnAdminResetCategorySubmission');
          const restoreCategoryBtn = document.getElementById('btnAdminRestoreCategoryRegistration');

          const submittedCats = (team.submitted_categories || team.submittedCategories || '').split(',').map(c => c.trim().toUpperCase());
          const isCatSubmitted = categoryCode && submittedCats.includes(categoryCode);
          const isCatCancelled = categoryCode && cancelledCats.includes(categoryCode);

          if (mainTabs) mainTabs.classList.toggle('d-none', Boolean(categoryCode));
          if (statusActions) statusActions.classList.toggle('d-none', Boolean(categoryCode) || window.canChangeTeamStatus !== true);
          if (resetCatBtn) resetCatBtn.classList.toggle('d-none', !isCatSubmitted);
          if (restoreCategoryBtn) restoreCategoryBtn.classList.toggle('d-none', !isCatCancelled || window.canChangeTeamStatus !== true);

          if (!modalEl.dataset.modeResetBound) {
            modalEl.addEventListener('hidden.bs.modal', () => {
              if (mainTabs) mainTabs.classList.remove('d-none');
              if (statusActions) statusActions.classList.toggle('d-none', window.canChangeTeamStatus !== true);
              if (rejectReasonPanel) rejectReasonPanel.classList.add('d-none');
              if (resetCatBtn) resetCatBtn.classList.add('d-none');
              if (restoreCategoryBtn) restoreCategoryBtn.classList.add('d-none');
              bootstrap.Tab.getOrCreateInstance(document.getElementById('team-info-tab')).show();
              window.adminSelectedCategory = '';
            });
            modalEl.dataset.modeResetBound = 'true';
          }

          if (categoryCode) {
            bootstrap.Tab.getOrCreateInstance(document.getElementById('team-players-tab')).show();
          } else if (mainTabId) {
            bootstrap.Tab.getOrCreateInstance(document.getElementById(mainTabId)).show();
          } else {
            bootstrap.Tab.getOrCreateInstance(document.getElementById('team-info-tab')).show();
          }
          bootstrap.Modal.getOrCreateInstance(modalEl).show();
        }
      } catch (err) {
        console.error('Error opening adminEditTeamModal:', err);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถดึงข้อมูลรายละเอียดทีมได้' });
      }
    };

    window.adminResetCategorySubmission = async function() {
      const editTeamIdEl = document.getElementById('editTeamId');
      const teamId = editTeamIdEl ? editTeamIdEl.value : '';
      const category = window.adminSelectedCategory;
      if (!teamId || !category) {
        Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'ไม่พบรหัสทีมหรือรุ่นที่ต้องการรีเซ็ต' });
        return;
      }
      const modalElem = document.getElementById('adminEditTeamModal');
      const confirm = await Swal.fire({
        title: 'ยืนยันการเปลี่ยนสถานะ?',
        text: 'ต้องการเปลี่ยนสถานะการส่งรายชื่อรุ่น ' + category + ' กลับเป็น "ยังไม่ส่งรายชื่อ" เพื่อให้ทีมสามารถแก้ไขข้อมูลได้ใช่หรือไม่?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ffc107',
        confirmButtonText: '<span class="text-dark fw-bold">ยืนยันเปลี่ยนสถานะ</span>',
        cancelButtonText: 'ยกเลิก',
        target: modalElem || 'body'
      });
      if (!confirm.isConfirmed) return;

      Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      try {
        const res = await fetch(base + '/api/admin/teams/reset-category-submission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId, category, isDemo: window.isDemoMode === true })
        });
        const data = await res.json();
        if (data.success) {
          const found = (window.rawTeamsData || []).find(t => String(t.id).trim() === String(teamId).trim());
          if (found) {
            found.submitted_categories = data.submitted_categories ?? '';
            found.submittedCategories = data.submittedCategories ?? '';
            if (data.status) found.status = data.status;
          }
          renderTeamsTable();
          const modalInstance = bootstrap.Modal.getInstance(modalElem);
          if (modalInstance) modalInstance.hide();
          await Swal.fire({ icon: 'success', title: 'เปลี่ยนสถานะสำเร็จ', text: data.message || 'รีเซ็ตสถานะการส่งรายชื่อเรียบร้อยแล้ว', confirmButtonText: 'ตกลง' });
          window.location.reload();
        } else {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: data.error || 'ไม่สามารถรีเซ็ตสถานะการส่งรายชื่อได้' });
        }
      } catch (err) {
        console.error('Error resetting category submission:', err);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์' });
      }
    };

    window.reviewTeamCategory = async function(teamId, category) {
      try {
        const response = await fetch(base + '/api/admin/teams/category-state?teamId=' + encodeURIComponent(teamId) + '&category=' + encodeURIComponent(category) + '&demo=' + String(window.isDemoMode === true));
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'ตรวจสอบสถานะไม่สำเร็จ');
        const review = data.review;
        const actionLabels = { restore: 'คืนการสมัคร', clear_orphan: 'ล้างสถานะค้างเพื่อให้ทีมเพิ่มรุ่นเอง', restore_legacy: 'คืนการสมัครพร้อมข้อมูลการแข่งขันเดิม' };
        const actionLabel = actionLabels[review.action];
        const modalElem = document.getElementById('adminEditTeamModal');
        const result = await Swal.fire({
          title: 'ตรวจสอบสถานะรุ่น ' + category,
          html: '<div class="text-start">ทีม ' + escapeHtml(teamId) + '<br>รุ่นที่สมัคร: ' + escapeHtml(review.categories.join(', ') || '-') +
            '<br>รุ่นที่ยกเลิก: ' + escapeHtml(review.cancelledCategories.join(', ') || '-') +
            '<br>รุ่นที่ยื่นรายชื่อ: ' + escapeHtml(review.submittedCategories.join(', ') || '-') +
            '<br>นักกีฬา ' + review.players + ' คน / เจ้าหน้าที่ ' + review.officials + ' คน' +
            '<hr>' + escapeHtml(actionLabel || 'ไม่มีรายการที่ต้องคืนสถานะ') + '<p class="small text-muted">ข้อมูลนักกีฬา เจ้าหน้าที่ และการยื่นรายชื่อเดิมจะคงอยู่</p></div>',
          input: actionLabel ? 'textarea' : undefined,
          inputLabel: actionLabel ? 'เหตุผลในการแก้สถานะ (5–500 ตัวอักษร)' : undefined,
          inputValidator: value => actionLabel && (!value || value.trim().length < 5 || value.trim().length > 500) ? 'กรุณาระบุเหตุผล 5–500 ตัวอักษร' : undefined,
          showCancelButton: true, showConfirmButton: Boolean(actionLabel), confirmButtonText: actionLabel || 'ยืนยัน', cancelButtonText: 'ปิด',
          target: modalElem && modalElem.classList.contains('show') ? modalElem : 'body'
        });
        if (!result.isConfirmed || !actionLabel) return;
        const saved = await fetch(base + (review.action === 'restore' ? '/api/admin/teams/restore-category-registration' : '/api/admin/teams/repair-category-state'), {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ teamId, category, action: review.action, reviewToken: review.reviewToken, reason: result.value, isDemo: window.isDemoMode === true })
        });
        const updated = await saved.json();
        if (!saved.ok || !updated.success) throw new Error(updated.error || 'บันทึกไม่สำเร็จ');
        await Swal.fire({ icon: 'success', title: 'บันทึกสถานะแล้ว', text: updated.message });
        window.location.reload();
      } catch (error) {
        Swal.fire({ icon: 'error', title: 'ตรวจสอบหรือบันทึกไม่สำเร็จ', text: error.message || 'กรุณาลองใหม่' });
      }
    };
    window.adminRestoreCategoryRegistration = function() {
      const teamId = document.getElementById('editTeamId')?.value;
      if (teamId && window.adminSelectedCategory) return window.reviewTeamCategory(teamId, window.adminSelectedCategory);
    };

    window.saveAdminTeamForm = async function() {
      const form = document.getElementById('adminEditTeamForm');
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const id = document.getElementById('editTeamId').value;
      const payload = {
        id: id,
        teamName: document.getElementById('editTeamName').value,
        school_code: document.getElementById('editSchoolCode').value,
        province: document.getElementById('editProvince').value,
        bkk_zone: document.getElementById('editBkkZone').value,
        district: document.getElementById('editDistrict').value,
        gender: document.getElementById('editGender').value,
        managerName: document.getElementById('editManagerName').value,
        email: document.getElementById('editEmail').value,
        phone: document.getElementById('editPhone').value,
        line_id: document.getElementById('editLineId').value,
        house_no: document.getElementById('editHouseNo').value,
        road: document.getElementById('editRoad').value,
        subdistrict: document.getElementById('editSubdistrict').value,
        contact_district: document.getElementById('editContactDistrict').value,
        contact_province: document.getElementById('editContactProvince').value
      };

      Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      try {
        const res = await fetch(base + '/api/admin/teams/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          const found = window.rawTeamsData.find(t => t.id === id);
          if (found) {
            Object.assign(found, payload);
          }
          renderTeamsTable();
          Swal.fire({ icon: 'success', title: 'บันทึกข้อมูลสำเร็จ', timer: 1500, showConfirmButton: false });
        } else {
          Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: data.error || 'เกิดข้อผิดพลาด' });
        }
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อบันทึกข้อมูลได้' });
      }
    };

    window.adminApproveCurrentTeam = async function() {
      if (window.canChangeTeamStatus !== true) return;
      const id = document.getElementById('editTeamId').value;
      if (!id) return;
      const found = window.rawTeamsData.find(t => String(t.id).trim() === String(id).trim());
      if (found && found.status === 'APPROVED') {
        Swal.fire({ icon: 'warning', title: 'ทีมนี้อนุมัติแล้ว', text: 'ทีมนี้ได้รับการอนุมัติรับรองสิทธิ์เรียบร้อยแล้ว' });
        return;
      }
      try {
        const updated = await updateTeamStatus(id, 'APPROVED');
        if (!updated) return;
        const modalElem = document.getElementById('adminEditTeamModal');
        const bsModal = bootstrap.Modal.getInstance(modalElem);
        if (bsModal) bsModal.hide();
      } catch (error) {
        console.error('Error approving team status:', error);
        Swal.fire({
          icon: 'error',
          title: 'อนุมัติทีมไม่สำเร็จ',
          text: error instanceof Error ? error.message : String(error)
        });
      }
    };

    window.showAdminRejectTeamForm = function() {
      if (window.canChangeTeamStatus !== true) return;
      const panel = document.getElementById('adminRejectTeamReasonPanel');
      if (!panel) return;
      panel.classList.remove('d-none');
      const reasonInput = document.getElementById('adminRejectTeamReason');
      if (reasonInput instanceof HTMLTextAreaElement) reasonInput.focus();
    };

    window.adminRejectCurrentTeam = async function() {
      if (window.canChangeTeamStatus !== true) return;
      const id = document.getElementById('editTeamId').value;
      if (!id) return;
      const reasonInput = document.getElementById('adminRejectTeamReason');
      const rejectReason = reasonInput instanceof HTMLTextAreaElement ? reasonInput.value.trim() : '';
      const result = await Swal.fire({
        icon: 'warning',
        title: 'ยืนยันไม่อนุมัติทีม?',
        text: rejectReason ? 'เหตุผล: ' + rejectReason : 'ยืนยันการไม่อนุมัติทีมโดยไม่ระบุเหตุผลใช่หรือไม่',
        showCancelButton: true,
        confirmButtonText: 'ยืนยันไม่อนุมัติ',
        cancelButtonText: 'กลับไปตรวจสอบ',
        confirmButtonColor: '#dc3545'
      });
      if (!result.isConfirmed) return;
      try {
        const updated = await updateTeamStatus(id, 'REJECTED', rejectReason);
        if (!updated) return;
        const modalElem = document.getElementById('adminEditTeamModal');
        const bsModal = bootstrap.Modal.getInstance(modalElem);
        if (bsModal) bsModal.hide();
      } catch (error) {
        console.error('Error rejecting team status:', error);
        Swal.fire({
          icon: 'error',
          title: 'ไม่อนุมัติทีมไม่สำเร็จ',
          text: error instanceof Error ? error.message : String(error)
        });
      }
    };

    window.openTeamPlayerVerification = function(playerId) {
      const source = (window.adminLoadedPlayers || []).find(item => String(item.id).trim() === String(playerId).trim());
      if (!source) {
        Swal.fire({ icon: 'warning', title: 'ไม่พบข้อมูลนักกีฬา' });
        return;
      }
      const team = window.adminLoadedTeam || {};
      const teamId = String(source.teamId || source.team_id || team.id || '');
      const playerCategories = String(source.category || source.categories || window.adminSelectedCategory || '').split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
      const submittedCategories = new Set(String(window.adminLoadedTeamSubmittedCats || '').split(',').map(value => value.trim().toUpperCase()).filter(Boolean));
      const missingCategories = playerCategories.filter(category => !submittedCategories.has(category));
      const canEdit = window.canChangeTeamStatus === true && playerCategories.length > 0 && missingCategories.length === 0;
      const rawStatus = String(source.docStatus || source.doc_status || 'PENDING').toUpperCase();
      const player = {
        ...source,
        teamId,
        team_id: teamId,
        name: source.name || [source.prefix, source.firstName || source.first_name, source.lastName || source.last_name].filter(Boolean).join(' '),
        photoUrl: source.photoUrl || source.photo_url || '',
        photo_url: source.photo_url || source.photoUrl || '',
        idCard: source.idCard || source.id_card || '',
        birthDate: source.birthDate || source.birth_date || '',
        jerseyNo: source.jerseyNo ?? source.jersey_no ?? '',
        docIdCard: source.docIdCard || source.doc_id_card || source.idCardFileUrl || source.id_card_file_url || '',
        doc_id_card: source.doc_id_card || source.docIdCard || source.id_card_file_url || '',
        docStatus: rawStatus === 'REJECTED' ? 'ACTION_REQUIRED' : rawStatus,
        school: team.teamName || team.team_name || source.school || source.teamName || source.team_name || ''
      };
      // The roster thumbnail and shared detail modal must use the same persisted photo URL.
      // Keep root-relative and absolute URLs intact; only resolve plain relative paths against this app.
      const photoUrl = String(player.photoUrl || player.photo_url || '').trim();
      player.photoUrl = photoUrl ? (/^https?:/i.test(photoUrl) || photoUrl.startsWith('/') ? photoUrl : base + '/' + (photoUrl.startsWith('./') ? photoUrl.slice(2) : photoUrl)) : '';
      player.photo_url = player.photoUrl;
      window.rawPlayersData = window.adminLoadedPlayers || [];
      window.rawTeamsMap = window.rawTeamsMap || {};
      window.rawTeamsMap[teamId] = team;
      const missingLabel = missingCategories.length ? missingCategories.join(', ') : 'รุ่นที่ไม่ระบุ';
      const readOnlyMessage = !canEdit
        ? (window.canChangeTeamStatus !== true
          ? 'บัญชีนี้ไม่มีสิทธิ์เปลี่ยนสถานะนักกีฬา สามารถดูข้อมูลและผลตรวจได้'
          : 'ทีมยังไม่ได้ส่งรายชื่อรุ่น ' + missingLabel + ' จึงดูข้อมูลได้ แต่ยังเปลี่ยนสถานะหรือบันทึกผลตรวจไม่ได้')
        : '';
      const refreshTeamModal = async () => {
        const activeTeamTab = document.querySelector('#adminTeamMainTabs .nav-link.active');
        await window.openAdminEditTeamModal(teamId, window.adminSelectedCategory || '', activeTeamTab ? activeTeamTab.id : '');
      };
      window.initializePlayerVerification(player, {
        canEdit,
        allowDelete: true,
        readOnlyMessage,
        onSaved: refreshTeamModal,
        onDeleted: refreshTeamModal
      });
      bootstrap.Modal.getOrCreateInstance(document.getElementById('adminPlayerDetailModal')).show();
    };

    window.showAdminPlayerDetail = function(playerId) {
      const p = (window.adminLoadedPlayers || []).find(item => String(item.id).trim() === String(playerId).trim());
      if (!p) {
        Swal.fire({ icon: 'warning', title: 'ไม่พบข้อมูลนักกีฬา' });
        return;
      }

      const safeSetText = function(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text || '-';
      };

      safeSetText('inspectionPlayerName', p.name || (p.prefix ? p.prefix + ' ' : '') + (p.firstName || p.first_name || '') + ' ' + (p.lastName || p.last_name || '') || '-');
      safeSetText('inspectionPlayerIdCard', p.idCard || p.id_card ? 'เลขบัตร: ' + (p.idCard || p.id_card) : '-');
      safeSetText('inspectionPlayerJerseyNo', 'เสื้อเบอร์ ' + (p.jerseyNo !== undefined && p.jerseyNo !== null ? p.jerseyNo : (p.jersey_no !== undefined && p.jersey_no !== null ? p.jersey_no : '-')));
      safeSetText('inspectionPlayerPos', p.position || '-');
      const playerTeamId = p.teamId || p.team_id;
      const playerTeam = (window.rawTeamsData || []).find(item => String(item.id).trim() === String(playerTeamId || '').trim());
      const playerSchool = p.school || p.schoolName || p.school_name ||
        playerTeam?.teamName || playerTeam?.team_name || p.teamName || p.team_name || '-';
      safeSetText('inspectionPlayerSchool', playerSchool);
      safeSetText('inspectionPlayerCat', p.category || p.categories || 'U14');
      safeSetText('inspectionPlayerHW', (p.height ? p.height + ' ซม.' : '-') + ' / ' + (p.weight ? p.weight + ' กก.' : '-'));
      safeSetText('inspectionPlayerGrade', p.grade || '-');
      safeSetText('inspectionPlayerGuardian', (p.guardianName || p.guardian_name || '-') + (p.guardianRelation || p.guardian_relation ? ' (' + (p.guardianRelation || p.guardian_relation) + ')' : ''));
      safeSetText('inspectionPlayerPhone', p.phone || '-');
      ${renderAthleteExtraFields('inspectionPlayer')}

      const photoEl = document.getElementById('inspectionPlayerPhoto');
      if (photoEl) {
        if (p.photoUrl || p.photo_url) {
          photoEl.src = base + (p.photoUrl || p.photo_url);
        } else {
          photoEl.src = 'https://via.placeholder.com/160x200?text=No+Photo';
        }
      }

      // Populate Checklist for Document Types (ID Card / Birth Certificate)
      const docsContainer = document.getElementById('inspectionPlayerDocsList');
      if (docsContainer) {
        const docsConfig = [
          { label: 'สำเนาบัตรประชาชน / สูติบัตร', file: p.docIdCard || p.doc_id_card }
        ];

        docsContainer.innerHTML = docsConfig.map(function(d) {
          if (d.file) {
            return '<div class="d-flex align-items-center justify-content-between p-2 bg-white rounded border">' +
              '<span><i class="bi bi-file-earmark-check-fill text-success me-2"></i>' + d.label + '</span>' +
              '<a href="' + base + d.file + '" target="_blank" class="btn btn-xs btn-outline-info py-0 px-2 rounded"><i class="bi bi-box-arrow-up-right me-1"></i> เปิดดูเอกสาร</a>' +
            '</div>';
          } else {
            return '<div class="d-flex align-items-center justify-content-between p-2 bg-white rounded border text-muted">' +
              '<span><i class="bi bi-file-earmark-x-fill text-danger me-2"></i>' + d.label + '</span>' +
              '<span class="badge bg-light text-secondary border">ยังไม่แนบ</span>' +
            '</div>';
          }
        }).join('');
      }

      // Populate Form Values
      const inputId = document.getElementById('inspectionPlayerId');
      if (inputId) inputId.value = p.id;

      const submittedCats = (window.adminLoadedTeamSubmittedCats || '').split(',').map(category => category.trim().toUpperCase());
      const currentCat = window.adminSelectedCategory || '';
      const isCurrentCatSubmitted = !currentCat || submittedCats.includes(currentCat);

      const statusSelect = document.getElementById('inspectionDocStatusSelect');
      if (statusSelect) {
        const docStatus = p.docStatus || p.doc_status || 'PENDING';
        const needsCorrection = docStatus === 'REJECTED' || (docStatus !== 'CORRECTED' && docStatus !== 'PENDING' && docStatus !== 'APPROVED' && Boolean(p.remarks));
        statusSelect.value = needsCorrection ? 'ACTION_REQUIRED' : docStatus;
        statusSelect.disabled = !isCurrentCatSubmitted;
      }

      const remarksText = document.getElementById('inspectionPlayerRemarks');
      if (remarksText) {
        remarksText.value = p.remarks || '';
        remarksText.disabled = !isCurrentCatSubmitted;
      }

      const deleteInspectionBtn = document.getElementById('btnDeleteInspectionPlayer');
        if (deleteInspectionBtn) {
        deleteInspectionBtn.hidden = window.isDemoMode === true;
        deleteInspectionBtn.disabled = !isCurrentCatSubmitted;
        deleteInspectionBtn.classList.toggle('disabled', !isCurrentCatSubmitted);
        deleteInspectionBtn.classList.toggle('opacity-50', !isCurrentCatSubmitted);
      }

      const saveBtn = document.getElementById('btnSaveInspectionRemark');
      if (saveBtn) {
        saveBtn.disabled = !isCurrentCatSubmitted;
        saveBtn.classList.toggle('disabled', !isCurrentCatSubmitted);
        saveBtn.classList.toggle('opacity-50', !isCurrentCatSubmitted);
        saveBtn.title = isCurrentCatSubmitted ? '' : 'ไม่สามารถตรวจสอบได้ เนื่องจากรุ่นนี้ยังไม่ได้กดส่งรายชื่อ';
      }

      const modalEl = document.getElementById('adminPlayerInspectionModal');
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
      }
    };

    window.saveAdminPlayerInspectionRemark = async function() {
      const activeTeamTab = document.querySelector('#adminTeamMainTabs .nav-link.active');
      const playerId = document.getElementById('inspectionPlayerId').value;
      const docStatus = document.getElementById('inspectionDocStatusSelect').value;
      const remarks = document.getElementById('inspectionPlayerRemarks').value;

      const btn = document.getElementById('btnSaveInspectionRemark');
      const origText = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> กำลังบันทึก...';
      }

      try {
        const resp = await fetch(base + '/api/admin/players/save-remark', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ playerId, docStatus, remarks, isDemo: window.isDemoMode === true })
        });
        const result = await resp.json();

        if (result.success) {
          const p = (window.adminLoadedPlayers || []).find(item => String(item.id).trim() === String(playerId).trim());
          if (p) {
            p.docStatus = docStatus;
            p.doc_status = docStatus;
            p.remarks = remarks;
          }

          // Refresh Roster Tab HTML inside adminEditTeamModal
          const teamId = document.getElementById('editTeamId').value;
          if (teamId) {
            await fetch(base + '/api/admin/teams/players?teamId=' + encodeURIComponent(teamId) + (window.isDemoMode === true ? '&demo=true' : ''))
              .then(res => {
                if (!res.ok) throw new Error('ไม่สามารถโหลดรายชื่อนักกีฬาหลังบันทึกได้');
                return res.json();
              })
              .then(data => {
                if (data.success && data.players) {
                  window.adminLoadedPlayers = data.players;
                  // Re-trigger openAdminEditTeamModal logic or re-render player panes
                  const registeredCategories = (document.getElementById('editCategories').value || 'U14').split(',').map(c => c.trim().toUpperCase());
                  const selectedCategory = window.adminSelectedCategory || '';
                  const allCategories = selectedCategory ? [selectedCategory] : Array.from(new Set(['ALL', ...registeredCategories]));
                  
                  let categoryPanesHtml = '<div class="tab-content" id="adminPlayerCatTabContent">';
                  allCategories.forEach((cat, idx) => {
                    const isActive = idx === 0 ? 'show active' : '';
                    const catPlayers = cat === 'ALL' ? data.players : data.players.filter(item => (item.category || item.categories || '').toUpperCase().split(',').map(c => c.trim()).includes(cat));

                    let playerRowsHtml = '';
                    if (catPlayers.length === 0) {
                      playerRowsHtml = '<tr><td colspan="9" class="text-center text-muted py-4"><i class="bi bi-inbox fs-3 d-block mb-1"></i>ไม่พบข้อมูลนักกีฬาในหมวดหมู่นี้</td></tr>';
                    } else {
                      playerRowsHtml = catPlayers.map((item, pIdx) => {
                        const itemDisplayName = item.name || (item.prefix ? item.prefix + ' ' : '') + (item.firstName || item.first_name || '') + ' ' + (item.lastName || item.last_name || '') || 'ไม่ระบุชื่อ';
                        const itemPhoto = item.photoUrl || item.photo_url || '';
                        const photoThumb = itemPhoto 
                          ? '<img src="' + base + itemPhoto + '" width="40" height="40" class="rounded border object-fit-cover cursor-pointer" onclick="viewPhoto(&quot;' + escapeHtml(itemDisplayName).replace(/"/g, '&quot;') + '&quot;, &quot;' + base + itemPhoto + '&quot;)">'
                          : '<span class="badge bg-secondary">ไม่มีรูป</span>';
                        const pCatList = String(item.category || item.categories || '').split(',').map(c => c.trim()).filter(Boolean);
                        const catBadge = pCatList.map(c => {
                          const bg = c === 'U14' ? 'bg-info text-dark' : (c === 'U16' ? 'bg-primary' : 'bg-danger');
                          return '<span class="badge ' + bg + ' me-1">' + escapeHtml(c) + '</span>';
                        }).join('');
                        const itemNeedsCorrection = item.docStatus !== 'CORRECTED' && item.docStatus !== 'PENDING' && item.docStatus !== 'APPROVED' && (item.docStatus === 'REJECTED' || item.docStatus === 'ACTION_REQUIRED' || Boolean(item.remarks));
                        const docBadge = item.docStatus === 'CORRECTED' ? '<span class="badge bg-info text-dark"><i class="bi bi-pencil-square me-1"></i> แก้ไขข้อมูลเรียบร้อย</span>' : (itemNeedsCorrection ? '<span class="badge bg-danger"><i class="bi bi-exclamation-triangle me-1"></i> ปรับแก้ข้อมูลนักกีฬา</span>' : (item.docStatus === 'APPROVED' ? '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i> สมบูรณ์</span>' : '<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i> รอตรวจ</span>'));
                        
                        return '<tr>' +
                          '<td class="text-center fw-bold">' + (pIdx + 1) + '</td>' +
                          '<td class="text-center">' + photoThumb + '</td>' +
                          '<td><strong>' + escapeHtml(itemDisplayName) + '</strong></td>' +
                          '<td><span class="font-monospace">' + escapeHtml(item.idCard || item.id_card || '-') + '</span></td>' +
                          '<td class="text-center"><span class="badge bg-light text-dark border fw-bold">' + escapeHtml(item.jerseyNo !== undefined && item.jerseyNo !== null ? item.jerseyNo : (item.jersey_no !== undefined && item.jersey_no !== null ? item.jersey_no : '-')) + '</span></td>' +
                          '<td>' + escapeHtml(item.position || '-') + '</td>' +
                          '<td class="text-center">' + catBadge + '</td>' +
                          '<td class="text-center">' + docBadge + '</td>' +
                          '<td class="text-center">' +
                            '<button type="button" class="btn btn-sm btn-outline-primary" onclick="showAdminPlayerDetail(&quot;' + item.id + '&quot;)"><i class="bi bi-search me-1"></i> ตรวจรายละเอียด</button>' +
                          '</td>' +
                        '</tr>';
                      }).join('');
                    }

                    categoryPanesHtml += '<div class="tab-pane fade ' + isActive + '" id="admin-cat-' + cat + '-pane" role="tabpanel" tabindex="0">' +
                      '<div class="table-responsive">' +
                        '<table class="table table-sm table-bordered table-hover align-middle mb-0">' +
                          '<thead class="table-light">' +
                            '<tr>' +
                              '<th class="text-center">#</th>' +
                              '<th class="text-center">รูปถ่าย</th>' +
                              '<th>ชื่อ-นามสกุล</th>' +
                              '<th>เลขบัตรประชาชน</th>' +
                              '<th class="text-center">หมายเลขเสื้อ</th>' +
                              '<th>ตำแหน่ง</th>' +
                              '<th class="text-center">รุ่นอายุ</th>' +
                              '<th class="text-center">สถานะเอกสาร</th>' +
                              '<th class="text-center">การจัดการ</th>' +
                            '</tr>' +
                          '</thead>' +
                          '<tbody>' + playerRowsHtml + '</tbody>' +
                        '</table>' +
                      '</div>' +
                    '</div>';
                  });
                  categoryPanesHtml += '</div>';

                  const paneCont = document.getElementById('adminPlayerCatTabContent');
                  if (paneCont) paneCont.outerHTML = categoryPanesHtml;
                  const teamId = document.getElementById('editTeamId').value;
                  const teamData = (window.rawTeamsData || []).find(item => String(item.id).trim() === String(teamId).trim());
                  if (teamData) teamData.teamPlayers = data.players;
                  renderTeamsTable();
                } else {
                  throw new Error(data.message || 'ไม่สามารถโหลดรายชื่อนักกีฬาหลังบันทึกได้');
                }
              });
          }

          const modalEl = document.getElementById('adminPlayerInspectionModal');
          if (modalEl) {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
          }

          if (activeTeamTab) bootstrap.Tab.getOrCreateInstance(activeTeamTab).show();

          Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', text: 'บันทึกผลการตรวจสอบนักกีฬาเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
        } else {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: result.message || 'ไม่สามารถบันทึกข้อมูลได้' });
        }
      } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = origText;
        }
      }
    };

    window.deleteAdminPlayer = async function(playerId, playerName) {
      const confirm = await Swal.fire({
        title: 'ยืนยันการลบนักกีฬาหรือไม่?',
        html: 'คุณกำลังจะลบข้อมูลนักกีฬา <strong>' + escapeHtml(playerName || 'ท่านนี้') + '</strong><br><small class="text-danger">*การลบจะปลดล็อกเลขบัตรประชาชน ให้สามารถนำไปลงทะเบียนใหม่ได้</small>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '<i class="bi bi-trash me-1"></i> ยืนยันลบนักกีฬา',
        cancelButtonText: 'ยกเลิก'
      });

      if (!confirm.isConfirmed) return;

      Swal.fire({ title: 'กำลังลบข้อมูลนักกีฬา...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      try {
        const resp = await fetch(base + '/api/admin/players/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ playerId })
        });
        const res = await resp.json();

        if (res.success) {
          const teamId = document.getElementById('editTeamId') ? document.getElementById('editTeamId').value : '';
          if (teamId) {
            const teamRes = await fetch(base + '/api/admin/teams/full-details?teamId=' + encodeURIComponent(teamId));
            const teamData = await teamRes.json();
            if (teamData.success && teamData.players) {
              window.adminLoadedPlayers = teamData.players;
              const teamObj = (window.rawTeamsData || []).find(item => String(item.id).trim() === String(teamId).trim());
              if (teamObj) teamObj.teamPlayers = teamData.players;
              renderTeamsTable();
              
              // Re-open/refresh modal
              const activeTeamTab = document.querySelector('#adminTeamMainTabs .nav-link.active');
              await openAdminEditTeamModal(teamId, window.adminSelectedCategory || '', activeTeamTab ? activeTeamTab.id : '');
            }
          }
          Swal.fire({ icon: 'success', title: 'ลบข้อมูลสำเร็จ', text: res.message || 'ลบข้อมูลนักกีฬาและปลดล็อกเลขบัตรประชาชนเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
        } else {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: res.message || 'ไม่สามารถลบข้อมูลนักกีฬาได้' });
        }
      } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
      }
    };

    window.deleteCurrentInspectionPlayer = function() {
      const playerId = document.getElementById('inspectionPlayerId') ? document.getElementById('inspectionPlayerId').value : '';
      const playerName = document.getElementById('inspectionPlayerName') ? document.getElementById('inspectionPlayerName').textContent : '';
      if (!playerId) return;

      const modalEl = document.getElementById('adminPlayerInspectionModal');
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }

      deleteAdminPlayer(playerId, playerName);
    };

    window.deleteAdminOfficial = async function(officialId, officialName) {
      const confirm = await Swal.fire({
        title: 'ยืนยันการลบเจ้าหน้าที่หรือไม่?',
        html: 'คุณกำลังจะลบข้อมูลเจ้าหน้าที่ <strong>' + escapeHtml(officialName || 'ท่านนี้') + '</strong><br><small class="text-danger">*การลบจะปลดล็อกเลขบัตรประชาชน ให้สามารถนำไปลงทะเบียนใหม่ได้</small>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '<i class="bi bi-trash me-1"></i> ยืนยันลบเจ้าหน้าที่',
        cancelButtonText: 'ยกเลิก'
      });

      if (!confirm.isConfirmed) return;

      Swal.fire({ title: 'กำลังลบข้อมูลเจ้าหน้าที่...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      try {
        const resp = await fetch(base + '/api/admin/officials/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ officialId })
        });
        const res = await resp.json();

        if (res.success) {
          const teamId = document.getElementById('editTeamId') ? document.getElementById('editTeamId').value : '';
          if (teamId) {
            await openAdminEditTeamModal(teamId, window.adminSelectedCategory || '');
          }
          Swal.fire({ icon: 'success', title: 'ลบข้อมูลสำเร็จ', text: res.message || 'ลบข้อมูลเจ้าหน้าที่เรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
        } else {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: res.message || 'ไม่สามารถลบข้อมูลเจ้าหน้าที่ได้' });
        }
      } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
      }
    };

    document.addEventListener('click', function(e) {
      var delBtn = e.target && e.target.closest ? e.target.closest('.js-delete-admin-team') : null;
      if (delBtn) {
        e.preventDefault();
        window.deleteAdminTeam(delBtn.getAttribute('data-team-id') || '', delBtn.getAttribute('data-team-name') || 'ทีมนี้');
        return;
      }
      var statusBtn = e.target && e.target.closest ? e.target.closest('.js-change-team-status') : null;
      if (statusBtn && typeof window.openChangeTeamStatusModal === 'function') {
        e.preventDefault();
        window.openChangeTeamStatusModal(
          statusBtn.getAttribute('data-team-id') || '',
          statusBtn.getAttribute('data-team-name') || '',
          statusBtn.getAttribute('data-team-status') || 'PENDING'
        );
      }
    });

    window.deleteAdminTeam = async function(teamId, teamName) {
      const confirm = await Swal.fire({
        title: 'ยืนยันการลบทีมหรือไม่?',
        html: 'คุณกำลังจะลบทีม <strong>' + escapeHtml(teamName) + '</strong><br><small class="text-muted">(เป็นการลบแบบซ่อนรายการไว้ในระบบ สามารถกู้คืนกลับมาได้หากต้องการ)</small>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '<i class="bi bi-trash me-1"></i> ยืนยันการลบทีม',
        cancelButtonText: 'ยกเลิก'
      });

      if (!confirm.isConfirmed) return;

      Swal.fire({ title: 'กำลังลบทีม...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      try {
        const resp = await fetch(base + '/api/admin/teams/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ id: teamId, isDemo: window.isDemoMode === true })
        });
        const res = await resp.json();
        if (res.success) {
          const t = (window.rawTeamsData || []).find(item => String(item.id).trim() === String(teamId).trim());
          if (t) {
            t.is_deleted = true;
            t.deleted_at = new Date().toISOString();
          }
          renderTeamsTable();
          Swal.fire({ icon: 'success', title: 'ลบทีมสำเร็จ', text: 'ทีมถูกลบและซ่อนจากระบบเรียบร้อยแล้ว (สามารถเลือกสถานะ "ถูกลบแล้ว" เพื่อกู้คืนได้)', timer: 2000, showConfirmButton: false });
        } else {
          Swal.fire({ icon: 'error', title: 'ไม่สามารถลบทีมได้', text: res.error || 'เกิดข้อผิดพลาด' });
        }
      } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
      }
    };

    window.restoreAdminTeam = async function(teamId) {
      const confirm = await Swal.fire({
        title: 'ยืนยันการกู้คืนทีมหรือไม่?',
        text: 'ทีมจะกลับมาแสดงผลในรายการสมัครตามปกติ',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#198754',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '<i class="bi bi-arrow-counterclockwise me-1"></i> ยืนยันกู้คืนทีม',
        cancelButtonText: 'ยกเลิก'
      });

      if (!confirm.isConfirmed) return;

      Swal.fire({ title: 'กำลังกู้คืนทีม...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      try {
        const resp = await fetch(base + '/api/admin/teams/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ id: teamId })
        });
        const res = await resp.json();
        if (res.success) {
          const t = (window.rawTeamsData || []).find(item => String(item.id).trim() === String(teamId).trim());
          if (t) {
            t.is_deleted = false;
            t.deleted_at = null;
          }
          renderTeamsTable();
          Swal.fire({ icon: 'success', title: 'กู้คืนทีมสำเร็จ', text: 'เรียกข้อมูลทีมกลับคืนมาแสดงผลตามปกติเรียบร้อยแล้ว', timer: 2000, showConfirmButton: false });
        } else {
          Swal.fire({ icon: 'error', title: 'ไม่สามารถกู้คืนทีมได้', text: res.error || 'เกิดข้อผิดพลาด' });
        }
      } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
      }
    };

    document.addEventListener('DOMContentLoaded', () => {
      const searchEl = document.getElementById('filterTeamSearch');
      if (searchEl) searchEl.addEventListener('input', renderTeamsTable);
      const startDateEl = document.getElementById('filterTeamStartDate');
      if (startDateEl) startDateEl.addEventListener('change', renderTeamsTable);
      const endDateEl = document.getElementById('filterTeamEndDate');
      if (endDateEl) endDateEl.addEventListener('change', renderTeamsTable);
      const regEl = document.getElementById('filterTeamRegion');
      if (regEl) regEl.addEventListener('change', () => {
        updateProvinceOptions();
        updateDistrictOptions();
        renderTeamsTable();
      });
      const provEl = document.getElementById('filterTeamProvince');
      if (provEl) provEl.addEventListener('change', () => {
        updateDistrictOptions();
        renderTeamsTable();
      });
      const distEl = document.getElementById('filterTeamDistrict');
      if (distEl) distEl.addEventListener('change', renderTeamsTable);
      const statEl = document.getElementById('filterTeamStatus');
      if (statEl) statEl.addEventListener('change', renderTeamsTable);
      const genderEl = document.getElementById('filterTeamGender');
      if (genderEl) genderEl.addEventListener('change', renderTeamsTable);

      updateDistrictOptions();
      renderTeamsTable();
    });
  </script>

  <!-- Change Team Status Interactive Dropdown Modal -->
  <div class="modal fade" id="changeTeamStatusModal" tabindex="-1" aria-labelledby="changeTeamStatusModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
        <div class="modal-header bg-navy text-white py-3">
          <h5 class="modal-title fw-bold" id="changeTeamStatusModalLabel"><i class="bi bi-arrow-repeat me-2 text-warning"></i> เปลี่ยนสถานะทีม (Change Team Status)</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4 bg-light">
          ${isDemo ? '<div class="alert alert-info py-2 mb-3"><strong>Demo</strong> — การเปลี่ยนสถานะและข้อมูลในหน้านี้ใช้ข้อมูล Demo ไม่กระทบกับข้อมูลจริง</div>' : ''}
          <input type="hidden" id="changeTeamStatusTeamId">
          <input type="hidden" id="changeTeamStatusOldStatus">

          <div class="card border-0 shadow-sm rounded-3 p-3 mb-3 bg-white">
            <label class="form-label text-muted small fw-bold mb-1">ชื่อทีม / โรงเรียน / อะคาเดมี่</label>
            <h5 class="fw-bold text-navy mb-0" id="changeTeamStatusNameDisplay">-</h5>
          </div>

          <div class="mb-3">
            <label class="form-label fw-bold text-navy mb-1"><i class="bi bi-funnel me-1"></i> เลือกสถานะทีมใหม่</label>
            <select id="changeTeamStatusSelect" class="form-select form-select-lg rounded-3 border-2 fw-bold" onchange="onTeamStatusSelectChange()">
              <option value="PENDING" ${canSetPendingTeamStatus ? '' : 'disabled'}>⏳ รอตรวจสอบทีม</option>
              <option value="APPROVED">✅ อนุมัติทีม</option>
              <option value="REJECTED">❌ ไม่อนุมัติ</option>
            </select>
          </div>

          <div class="d-flex align-items-center justify-content-between p-3 rounded-3 bg-white border mb-3">
            <span class="small fw-bold text-muted">ตัวอย่างแสดงผลสถานะ:</span>
            <div id="changeTeamStatusPreviewBadge" class="badge bg-warning text-dark px-3 py-2 fs-6">
              <i class="bi bi-hourglass-split me-1"></i> รอตรวจสอบ (PENDING)
            </div>
          </div>

          <!-- Alert Text box for APPROVED status -->
          <div id="changeTeamStatusApprovedAlert" class="alert alert-success border-0 shadow-sm rounded-3 p-3 mb-3 d-none">
            <div class="d-flex align-items-center gap-2 text-success fw-bold">
              <i class="bi bi-patch-check-fill fs-5"></i>
              <span>ทีม <span id="changeTeamStatusApprovedTeamName" class="text-decoration-underline"></span> ได้ผ่านการตรวจสอบเรียบร้อยแล้ว</span>
            </div>
          </div>

        </div>
        <div class="modal-footer bg-white py-3 border-top">
          <button type="button" class="btn btn-light rounded-3 px-3 border" data-bs-dismiss="modal">ยกเลิก</button>
          <button type="button" class="btn btn-success rounded-3 px-4 fw-bold shadow-sm" id="btnSubmitChangeTeamStatus" onclick="submitChangeTeamStatus()">
            <i class="bi bi-check-lg me-1"></i> ยืนยันเปลี่ยนสถานะ
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Full Team Edit & Player Verification Modal -->
  <div class="modal fade" id="adminEditTeamModal" tabindex="-1" aria-labelledby="adminEditTeamModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
        <div class="modal-header bg-navy text-white py-3">
          <div class="d-flex align-items-center gap-3">
            <i class="bi bi-shield-shaded fs-3 text-warning"></i>
            <div>
              <h5 class="modal-title fw-bold mb-0" id="adminEditTeamModalLabel">รายละเอียดข้อมูลทีมลงทะเบียน</h5>
              <small class="text-white-50">ตรวจสอบข้อมูลสังกัด เอกสารยื่นประกอบ และอนุมัติการรับรองสิทธิ์</small>
              ${isDemo ? '<div><span class="badge bg-info text-dark mt-1">Demo — ไม่กระทบข้อมูลจริง</span></div>' : ''}
            </div>
          </div>
          <div class="d-flex align-items-center gap-2 me-3">
            <span id="editTeamStatusBadge" class="badge bg-warning text-dark px-3 py-2 fs-6">รอตรวจสอบ</span>
          </div>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4 bg-light">
          <!-- Main Modal Tabs -->
          <ul class="nav nav-tabs nav-fill fw-bold mb-4" id="adminTeamMainTabs" role="tablist">
            <li class="nav-item" role="presentation">
              <button class="nav-link active py-2 text-navy" id="team-info-tab" data-bs-toggle="tab" data-bs-target="#team-info-pane" type="button" role="tab"><i class="bi bi-pencil-square me-1"></i> 1. ข้อมูลทีม & ผู้จัดการทีม</button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link py-2 text-navy" id="team-players-tab" data-bs-toggle="tab" data-bs-target="#team-players-pane" type="button" role="tab"><i class="bi bi-people-fill me-1"></i> 2. รายชื่อนักกีฬาประจำทีม</button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link py-2 text-navy" id="team-officials-tab" data-bs-toggle="tab" data-bs-target="#team-officials-pane" type="button" role="tab"><i class="bi bi-person-badge-fill me-1"></i> 3. รายชื่อเจ้าหน้าที่ประจำทีม</button>
            </li>
          </ul>

          <div class="tab-content" id="adminTeamMainTabContent">
            <!-- Tab 1: Team Info Edit Form -->
            <div class="tab-pane fade show active" id="team-info-pane" role="tabpanel" tabindex="0">
              <form id="adminEditTeamForm" onsubmit="event.preventDefault();">
                <input type="hidden" id="editTeamId" name="id">
                <div class="card border-0 shadow-sm rounded-3 p-4 bg-white mb-3">
                  <h6 class="fw-bold text-navy border-bottom pb-2 mb-3 d-flex align-items-center justify-content-between">
                    <span><i class="bi bi-building me-1"></i> ข้อมูลสังกัดสถานศึกษาและพื้นที่สมัคร</span>
                    <span class="badge bg-light text-muted border fw-normal fs-7"><i class="bi bi-lock me-1"></i> อ่านได้อย่างเดียว (แก้ไขไม่ได้)</span>
                  </h6>
                  <div class="row g-3">
                    <div class="col-md-6">
                      <label class="form-label required small fw-bold">ชื่อโรงเรียน / สังกัดทีม</label>
                      <input type="text" id="editTeamName" name="teamName" class="form-control bg-light" readonly disabled required>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small fw-bold">รหัสสถานศึกษา</label>
                      <input type="text" id="editSchoolCode" name="school_code" class="form-control bg-light" readonly disabled placeholder="เช่น 1050012345">
                    </div>
                    <div class="col-md-4">
                      <label class="form-label required small fw-bold">จังหวัดที่ส่งแข่งขัน</label>
                      <input type="text" id="editProvince" name="province" class="form-control bg-light" readonly disabled required oninput="toggleAdminBkkZone()" onchange="toggleAdminBkkZone()">
                    </div>
                    <div class="col-md-4">
                      <label class="form-label small fw-bold">เขต / อำเภอ</label>
                      <input type="text" id="editDistrict" name="district" class="form-control bg-light" readonly disabled>
                    </div>
                    <div class="col-md-4" id="editBkkZoneContainer">
                      <label class="form-label small fw-bold">โซนพื้นที่ (กรุงเทพมหานคร)</label>
                      <input type="text" id="editBkkZone" name="bkk_zone" class="form-control bg-light" readonly disabled placeholder="เช่น ฝั่งธนบุรี">
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small fw-bold">ประเภทการแข่งขัน</label>
                      <select id="editGender" name="gender" class="form-select bg-light" disabled>
                        <option value="boy">ทีมชาย</option>
                        <option value="girl">ทีมหญิง</option>
                      </select>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small fw-bold">รุ่นอายุที่ลงสมัครแข่งขัน</label>
                      <input type="text" id="editCategories" name="categories" class="form-control bg-light" readonly disabled placeholder="เช่น U14,U16">
                    </div>
                  </div>
                </div>

                <div class="card border-0 shadow-sm rounded-3 p-4 bg-white mb-3">
                  <h6 class="fw-bold text-navy border-bottom pb-2 mb-3 d-flex align-items-center justify-content-between">
                    <span><i class="bi bi-file-earmark-check-fill me-1 text-primary"></i> เอกสารยื่นประกอบการลงทะเบียนทีม</span>
                    <span class="badge bg-light text-muted border fw-normal fs-7"><i class="bi bi-lock me-1"></i> อ่าน/รีวิวได้อย่างเดียว (แก้ไขไม่ได้)</span>
                  </h6>
                  <div class="row g-3">
                    <div class="col-md-6">
                      <div class="border rounded-3 p-3 bg-light d-flex align-items-center justify-content-between">
                        <div class="d-flex align-items-center gap-3">
                          <div class="bg-primary text-white rounded-3 p-2 d-flex align-items-center justify-content-center" style="width: 42px; height: 42px;">
                            <i class="bi bi-file-earmark-pdf fs-4"></i>
                          </div>
                          <div>
                            <strong class="d-block text-dark small">1. หนังสือรับรองทีม</strong>
                            <span id="editDocTeamCertStatus" class="badge bg-secondary-subtle text-muted small">ยังไม่อัปโหลด</span>
                          </div>
                        </div>
                        <button type="button" id="editDocTeamCertBtn" class="btn btn-sm btn-outline-info fw-semibold disabled" disabled>
                          <i class="bi bi-eye me-1"></i> รีวิวเอกสาร
                        </button>
                      </div>
                    </div>
                    <div class="col-md-6 ${['SAT_OFFICER', 'DOCUMENT_VERIFIER'].includes(currentUser.roleCode) ? 'd-none' : ''}">
                      <div class="border rounded-3 p-3 bg-light d-flex align-items-center justify-content-between">
                        <div class="d-flex align-items-center gap-3">
                          <div class="bg-danger text-white rounded-3 p-2 d-flex align-items-center justify-content-center" style="width: 42px; height: 42px;">
                            <i class="bi bi-file-earmark-text fs-4"></i>
                          </div>
                          <div>
                            <strong class="d-block text-dark small">2. ใบรายชื่อนักกีฬา (O-2)</strong>
                            <span id="editDocRosterStatus" class="badge bg-secondary-subtle text-muted small">ยังไม่อัปโหลด</span>
                          </div>
                        </div>
                        <button type="button" id="editDocRosterBtn" class="btn btn-sm btn-outline-info fw-semibold disabled" disabled>
                          <i class="bi bi-eye me-1"></i> รีวิวเอกสาร
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="card border-0 shadow-sm rounded-3 p-4 bg-white">
                  <h6 class="fw-bold text-navy border-bottom pb-2 mb-3 d-flex align-items-center justify-content-between">
                    <span><i class="bi bi-person-lines-fill me-1"></i> ข้อมูลผู้จัดการทีมและช่องทางติดต่อ</span>
                    <span class="badge bg-light text-muted border fw-normal fs-7"><i class="bi bi-lock me-1"></i> อ่านได้อย่างเดียว (แก้ไขไม่ได้)</span>
                  </h6>
                  <div class="row g-3">
                    <div class="col-md-6">
                      <label class="form-label required small fw-bold">ชื่อ-นามสกุล ผู้จัดการทีม</label>
                      <input type="text" id="editManagerName" name="managerName" class="form-control bg-light" readonly disabled required>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label required small fw-bold">เบอร์โทรศัพท์ติดต่อ</label>
                      <input type="text" id="editPhone" name="phone" class="form-control bg-light" readonly disabled required>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small fw-bold">อีเมล (Email)</label>
                      <input type="email" id="editEmail" name="email" class="form-control bg-light" readonly disabled>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small fw-bold">LINE ID</label>
                      <input type="text" id="editLineId" name="line_id" class="form-control bg-light" readonly disabled>
                    </div>
                    <div class="col-md-3">
                      <label class="form-label small fw-bold">เลขที่/บ้านเลขที่</label>
                      <input type="text" id="editHouseNo" name="house_no" class="form-control bg-light" readonly disabled>
                    </div>
                    <div class="col-md-3">
                      <label class="form-label small fw-bold">ถนน</label>
                      <input type="text" id="editRoad" name="road" class="form-control bg-light" readonly disabled>
                    </div>
                    <div class="col-md-3">
                      <label class="form-label small fw-bold">ตำบล/แขวง</label>
                      <input type="text" id="editSubdistrict" name="subdistrict" class="form-control bg-light" readonly disabled>
                    </div>
                    <div class="col-md-3">
                      <label class="form-label small fw-bold">อำเภอ/เขต (ที่อยู่ติดต่อ)</label>
                      <input type="text" id="editContactDistrict" name="contact_district" class="form-control bg-light" readonly disabled>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small fw-bold">จังหวัด (ที่อยู่ติดต่อ)</label>
                      <input type="text" id="editContactProvince" name="contact_province" class="form-control bg-light" readonly disabled>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <!-- Tab 2: Categorized Roster Verification -->
            <div class="tab-pane fade" id="team-players-pane" role="tabpanel" tabindex="0">
              <div class="card border-0 shadow-sm rounded-3 p-4 bg-white">
                <div id="adminRosterTabContainer">
                  <!-- Populated by JavaScript -->
                </div>
              </div>
            </div>

            <!-- Tab 3: Officials List -->
            <div class="tab-pane fade" id="team-officials-pane" role="tabpanel" tabindex="0">
              <div class="card border-0 shadow-sm rounded-3 p-4 bg-white">
                <h6 class="fw-bold text-navy mb-3"><i class="bi bi-person-badge me-1"></i> รายชื่อเจ้าหน้าที่ประจำทีม</h6>
                <div id="adminOfficialsContainer">
                  <!-- Populated by JavaScript -->
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer bg-white py-3">
          <button type="button" id="btnAdminRestoreCategoryRegistration" class="btn btn-success px-3 fw-bold d-none" onclick="adminRestoreCategoryRegistration()"><i class="bi bi-arrow-counterclockwise me-1"></i> เปลี่ยนสถานะกลับเป็นสมัครปกติ</button>
          <button type="button" class="btn btn-secondary px-3" data-bs-dismiss="modal">ปิดหน้าต่าง</button>
          <button type="button" id="btnAdminResetCategorySubmission" class="btn btn-warning text-dark px-3 fw-bold d-none" onclick="adminResetCategorySubmission()"><i class="bi bi-arrow-counterclockwise me-1"></i> เปลี่ยนสถานะเป็น ยังไม่ส่งรายชื่อ</button>
          ${canChangeTeamStatus ? '<div class="ms-auto d-flex flex-column align-items-end gap-2" id="adminTeamStatusActions"><div class="d-flex align-items-center gap-2"><button type="button" id="btnAdminApproveTeam" class="btn btn-success px-4 fw-bold" onclick="adminApproveCurrentTeam()"><i class="bi bi-check-lg me-1"></i> อนุมัติทีม</button><button type="button" id="btnAdminShowRejectTeamForm" class="btn btn-outline-danger px-3 fw-bold" onclick="showAdminRejectTeamForm()"><i class="bi bi-x-circle me-1"></i> ไม่อนุมัติทีม</button></div><div id="adminRejectTeamReasonPanel" class="d-none w-100" style="min-width: 320px;"><label for="adminRejectTeamReason" class="form-label fw-semibold text-danger mb-1">เหตุผลในการไม่อนุมัติทีม <span class="text-muted fw-normal">(เว้นว่างได้)</span></label><textarea id="adminRejectTeamReason" class="form-control mb-2" rows="3" placeholder="กรอกเหตุผลในการไม่อนุมัติทีม"></textarea><button type="button" id="btnAdminConfirmRejectTeam" class="btn btn-danger fw-bold" onclick="adminRejectCurrentTeam()"><i class="bi bi-x-circle me-1"></i> ยืนยันไม่อนุมัติทีม</button></div></div>' : ''}
        </div>
      </div>
    </div>
  </div>

  <!-- Admin Player Inspection & Document Review Modal -->
  ${athleteReviewStyles}
  <div class="modal fade athlete-review-modal" id="adminPlayerInspectionModal" tabindex="-1" aria-labelledby="adminPlayerInspectionModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content border-0 shadow-lg rounded-4">
        <div class="modal-header bg-navy text-white rounded-top-4 py-3">
          <h5 class="modal-title fw-bold" id="adminPlayerInspectionModalLabel">
            <i class="bi bi-shield-check text-warning me-2"></i> รายละเอียดนักกีฬา & ตรวจสอบเอกสาร
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4 bg-light">
          ${isDemo ? '<div class="alert alert-info py-2 mb-3"><strong>Demo</strong> — การเปลี่ยนสถานะเอกสารนี้ใช้ข้อมูล Demo ไม่กระทบกับข้อมูลจริง</div>' : ''}
          <input type="hidden" id="inspectionPlayerId">
          <div class="athlete-layout">
            <!-- Left Column: Photo & Main Info -->
            <div class="athlete-photo-column">
              <div class="athlete-photo-panel">
                <img id="inspectionPlayerPhoto" src="https://via.placeholder.com/160x200?text=No+Photo" class="img-fluid rounded-3 border shadow-sm" alt="รูปถ่ายนักกีฬา">

              </div>
            </div>

            <!-- Right Column: Details, Docs Checklist & Remarks Form -->
            <div class="athlete-detail-column">
              ${renderAthleteInformation('inspectionPlayer')}

              <!-- Uploaded Documents Checklist -->
              <div class="card border-0 shadow-sm mb-3">
                <div class="card-body p-3">
                  <h6 class="fw-bold text-navy border-bottom pb-2 mb-2"><i class="bi bi-file-earmark-pdf me-1"></i> รายการเอกสารประกอบ</h6>
                  <div class="d-flex flex-column gap-2 small" id="inspectionPlayerDocsList">
                    <!-- Populated dynamically -->
                  </div>
                </div>
              </div>

              <!-- Admin Inspection & Remarks Form -->
              <div class="card border-primary border-opacity-50 shadow-sm">
                <div class="card-body p-3 bg-white">
                  <h6 class="fw-bold text-primary border-bottom pb-2 mb-3"><i class="bi bi-pencil-square me-1"></i> ผลการตรวจสอบ & หมายเหตุเจ้าหน้าที่</h6>
                  <div class="mb-3">
                    <label class="form-label small fw-bold text-navy">สถานะการตรวจสอบเอกสาร</label>
                    <select id="inspectionDocStatusSelect" class="form-select form-select-sm">
                      <option value="PENDING">⏳ รอตรวจสอบ (Pending)</option>
                      <option value="APPROVED">🟢 ครบถ้วน สมบูรณ์ / อนุมัติ (Approved)</option>
                      <option value="ACTION_REQUIRED">🟡 มีหมายเหตุ / ต้องแก้ไข (Action Required)</option>
                      <option value="CORRECTED">📝 แก้ไขข้อมูลเรียบร้อย</option>
                    </select>
                  </div>
                  <div class="mb-2">
                    <label class="form-label small fw-bold text-navy">หมายเหตุ (Remark ในกรณีที่ข้อมูล/เอกสารไม่ครบถ้วน)</label>
                    <textarea id="inspectionPlayerRemarks" class="form-control form-control-sm" rows="3" placeholder="ระบุสิ่งที่ต้องการให้นักกีฬาหรือผู้จัดการทีมแก้ไข เช่น รูปถ่ายไม่ชัดเจน, บัตรประชาชนหมดอายุ..."></textarea>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
        <div class="modal-footer bg-white rounded-bottom-4 py-2 justify-content-between">
          <button type="button" class="btn btn-sm btn-outline-danger px-3 fw-semibold" id="btnDeleteInspectionPlayer" onclick="deleteCurrentInspectionPlayer()">
            <i class="bi bi-trash me-1"></i> ลบข้อมูลนักกีฬาท่านนี้
          </button>
          <div>
            <button type="button" class="btn btn-sm btn-outline-secondary px-3 me-2" data-bs-dismiss="modal">ปิด</button>
            <button type="button" class="btn btn-sm btn-primary px-4 fw-semibold" id="btnSaveInspectionRemark" onclick="saveAdminPlayerInspectionRemark()">
              <i class="bi bi-save me-1"></i> บันทึกข้อมูล
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  ${(0, playerVerification_1.renderPlayerVerificationModal)()}`;
    const rawQuery = req.url.includes('?') ? req.url.substring(req.url.indexOf('?') + 1) : '';
    const pageTitle = isDemo ? 'รายชื่อทีม Demo' : 'รายการทีมลงทะเบียน';
    const activeNav = isDemo ? 'teams-demo' : 'teams';
    res.send((0, adminLayout_1.renderAdminLayout)(pageTitle, bodyContent, activeNav, base, currentUser, rawQuery));
}
// Helper function to render Category Specific Teams Page (U14, U16, U18)
async function renderCategoryTeamsPage(req, res, targetCategory, navKey) {
    const base = (0, app_1.getBaseUrl)(req);
    const currentUser = req.adminUser || {
        id: 'ADM-001', username: 'admin', fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)', roleCode: 'SUPER_ADMIN', roleName: 'ผู้ดูแลระบบสูงสุด', permissions: ['teams:read', 'teams:verify']
    };
    const isSatOfficer = currentUser.roleCode === 'SUPER_ADMIN' ? false : (currentUser.roleCode === 'SAT_OFFICER');
    const satProvince = isSatOfficer ? currentUser.province || '' : '';
    const allTeams = await (0, app_1.getDbRegisteredTeams)();
    const allPlayers = await (0, app_1.getDbPlayers)();
    const allOfficials = await (0, app_1.getDbOfficials)();
    allTeams.forEach((t) => {
        t.teamPlayers = allPlayers.filter((p) => p.teamId === t.id);
        t.teamOfficials = allOfficials.filter((o) => o.teamId === t.id);
    });
    const categoryTeams = allTeams.filter((t) => {
        if (t.is_deleted)
            return false;
        if (isSatOfficer && satProvince && t.province !== satProvince)
            return false;
        const cats = (t.categories || '').split(',').map((c) => c.trim().toUpperCase());
        return cats.includes(targetCategory);
    });
    categoryTeams.sort((a, b) => {
        const timeA = a.createdAt || a.created_at ? new Date(a.createdAt || a.created_at).getTime() : 0;
        const timeB = b.createdAt || b.created_at ? new Date(b.createdAt || b.created_at).getTime() : 0;
        if (timeA !== timeB)
            return timeA - timeB;
        return String(a.id || '').localeCompare(String(b.id || ''), 'th');
    });
    // Issue #9: calculate ranks before browser filtering.
    const categoryRegistrationRanks = (0, teamRegistrationRank_service_1.getTeamRegistrationRanks)(allTeams);
    categoryTeams.forEach((team) => {
        team.registrationRanks =
            categoryRegistrationRanks[String(team.id).trim()] || {};
        const area = (0, teamRegistrationRank_service_1.getRegistrationArea)(team);
        team.registrationRankMessage = !area.district
            ? 'ยังไม่ระบุอำเภอ'
            : (!area.province ? 'ยังไม่ระบุจังหวัด' : '');
    });
    // Approval timestamps come from the existing audit trail. Do not substitute registration
    // time: only teams with a complete, current approval history can receive a ranked star.
    const teamIds = categoryTeams.map((team) => String(team.id));
    const approvalEvents = teamIds.length ? await db_1.pool.query(`SELECT event_type, entity_type, entity_id, team_id, new_state, created_at
     FROM football_audit_log
     WHERE team_id = ANY($1::varchar[])
       AND event_type IN ('TEAM_STATUS_CHANGED', 'PLAYER_DOCUMENT_STATUS_CHANGED')
     ORDER BY created_at ASC, id ASC`, [teamIds]) : { rows: [] };
    const completedApprovalRanks = (0, statusHelper_1.getCompletedApprovalRanks)(categoryTeams.map((t) => ({ ...t, ...(0, teamRegistrationRank_service_1.getRegistrationArea)(t) })), targetCategory, approvalEvents.rows || []);
    categoryTeams.forEach((team) => {
        team.approvalRank = completedApprovalRanks.get(String(team.id)) || 0;
    });
    const categoryTitle = `รายการทีมลง ${targetCategory} แต่ละเขต / อำเภอ`;
    const bodyContent = `
  <div class="card p-4 shadow-sm border-0 rounded-4 mb-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div>
        <h4 class="fw-bold text-navy mb-1"><i class="bi bi-table text-warning me-2"></i>${categoryTitle}</h4>
      <p class="text-muted small mb-0">แสดงดาวและลำดับเฉพาะทีมที่อนุมัติแล้วและนักกีฬาทุกคนครบถ้วน เรียงตามเวลาที่ผ่านครบทั้งสองสถานะ</p>
      </div>
      <div>
        <a href="${base}/admin/teams-${targetCategory.toLowerCase()}.php" class="btn btn-outline-secondary btn-sm rounded-3"><i class="bi bi-arrow-clockwise me-1"></i> รีเฟรชข้อมูล</a>
      </div>
    </div>

    <!-- Filter & Search Bar -->
    <div class="card border-0 bg-light p-3 rounded-3 mb-3">
      <div class="row g-2 align-items-center">
        <div class="col-md-3">
          <input type="text" id="filterCatTeamSearch" class="form-control form-control-sm" placeholder="🔍 ค้นหาชื่อทีม, โรงเรียน...">
        </div>
        <div class="col-md-3">
          <select id="filterCatTeamProvince" class="form-select form-select-sm" ${isSatOfficer ? 'disabled' : ''}>
            <option value="">-- เลือกจังหวัด --</option>
            ${Array.from(new Set(categoryTeams.map((t) => t.province).filter(Boolean))).sort().map((p) => `<option value="${p}" ${isSatOfficer && satProvince === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-3">
          <select id="filterCatTeamDistrict" class="form-select form-select-sm">
            <option value="">-- ${isSatOfficer ? 'เลือก เขต/อำเภอ' : 'กรุณาเลือกจังหวัดก่อน'} --</option>
          </select>
        </div>
        <div class="col-md-3">
          <select id="filterCatTeamStatus" class="form-select form-select-sm">
            <option value="">-- ทุกสถานะ --</option>
            <option value="PENDING">⏳ รอตรวจสอบทีม</option>
            <option value="APPROVED">✅ อนุมัติทีม</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Category Teams Table -->
    <div class="table-responsive">
      <table class="table table-hover align-middle border" id="catTeamsDataTable">
        <thead class="table-dark">
          <tr>
            <th style="width: 50px;" class="text-center">#</th>
            <th>ชื่อทีม / โรงเรียน / อะคาเดมี่</th>
            <th>วัน-เวลา สมัคร</th>
            <th>จังหวัด</th>
            <th>เขต / อำเภอ</th>
            <th>ผู้จัดการทีม</th>
            <th class="text-center">ข้อมูลนักกีฬา</th>
            <th class="text-center">สถานะทีม</th>
          </tr>
        </thead>
        <tbody id="catTeamsTableBody">
          <tr>
            <td colspan="8" class="text-center py-5 text-muted">
              <i class="bi bi-funnel-fill fs-3 text-navy d-block mb-2"></i>
              <strong>${isSatOfficer ? 'กรุณาเลือก "เขต / อำเภอ" ด้านบนเพื่อดึงข้อมูลทีมลงทะเบียน' : 'กรุณาเลือก "จังหวัด" และ "เขต / อำเภอ" ด้านบนเพื่อดึงข้อมูลทีมลงทะเบียน'}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="d-flex flex-wrap justify-content-between align-items-center mt-3 pt-3 border-top gap-2" id="catTeamsPaginationContainer"></div>
  </div>

  <script type="application/json" id="rawCatTeamsDataJson">${JSON.stringify(categoryTeams).replace(/</g, '\\u003c')}</script>
  <script>
    var base = "${base}";
    window.isSatOfficer = ${isSatOfficer};
    window.satProvince = ${JSON.stringify(satProvince)};
    var rawCatTeamsElem = document.getElementById('rawCatTeamsDataJson');
    window.rawCatTeamsData = rawCatTeamsElem ? JSON.parse(rawCatTeamsElem.textContent || '[]') : [];
    window.currentCatTeamPage = 1;

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function updateCatTeamDistrictOptions() {
      const provEl = document.getElementById('filterCatTeamProvince');
      const distEl = document.getElementById('filterCatTeamDistrict');
      if (!distEl) return;
      const selectedProv = window.isSatOfficer ? window.satProvince : (provEl ? provEl.value : '');
      const prevDist = distEl.value;

      if (!selectedProv) {
        distEl.innerHTML = '<option value="">-- กรุณาเลือกจังหวัดก่อน --</option>';
        distEl.disabled = true;
        return;
      }

      const districts = Array.from(new Set(
        window.rawCatTeamsData
          .filter(t => t.province === selectedProv)
          .map(t => window.PmycTeamArea.getTeamDistrictName(t))
          .filter(Boolean)
      )).sort();

      distEl.disabled = false;
      let html = '<option value="">-- เลือก เขต/อำเภอ --</option>';
      districts.forEach(d => {
        html += '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>';
      });
      distEl.innerHTML = html;
      if (districts.includes(prevDist)) {
        distEl.value = prevDist;
      }
    }

    function getTeamDistrictCatSeqJs(t, catCode) {
      return t && t.registrationRanks ? (t.registrationRanks[catCode] || 0) : 0;
    }

    function getCatBadgeJs(t, catCode) {
      var regCats = (t.categories || '').split(',').map(function(c) { return c.trim().toUpperCase(); });
      if (!regCats.includes(catCode)) {
        return '<span class="text-danger small">ไม่ได้ส่งทีม</span>';
      }

      var playersInCat = (t.teamPlayers || []).filter(function(p) {
        var pCat = (p.category || p.categories || '').toUpperCase();
        return pCat.split(',').map(function(c) { return c.trim(); }).includes(catCode);
      });
      var subCats = (t.submitted_categories || t.submittedCategories || '').split(',').map(function(c) { return c.trim().toUpperCase(); });
      var isSubmitted = subCats.includes(catCode);
      var needsFixCount = playersInCat.filter(function(p) {
        return p.docStatus !== 'CORRECTED' && p.docStatus !== 'PENDING' && p.docStatus !== 'APPROVED' && (p.docStatus === 'REJECTED' || p.docStatus === 'ACTION_REQUIRED' || Boolean(p.remarks));
      }).length;
      var playerCount = playersInCat.length;
      var approvedCount = playersInCat.filter(function(p) {
        return p.docStatus === 'APPROVED';
      }).length;
      var countsTitle = 'นักกีฬา ' + playerCount + ' คน / อนุมัติแล้ว ' + approvedCount + ' คน / ต้องแก้ไข ' + needsFixCount + ' คน';
      function rosterButton(badgeHtml) {
        var countsHtml = '<span class="d-block small fw-bold text-nowrap" title="' + countsTitle + '"><span class="text-primary">' + playerCount + '</span> / <span class="text-success">' + approvedCount + '</span> / <span class="text-danger">' + needsFixCount + '</span></span>';
        return '<button type="button" class="btn p-0 border-0 bg-transparent" aria-label="' + countsTitle + '" title="ดูรายชื่อนักกีฬา รุ่น ' + catCode + ' - ' + countsTitle + '" onclick="openAdminEditTeamModal(&quot;' + escapeHtml(t.id) + '&quot;, &quot;' + catCode + '&quot;)"><span class="d-flex flex-column align-items-center gap-1">' + badgeHtml + countsHtml + '</span></button>';
      }
      if (playersInCat.length === 0 || !isSubmitted) {
        return rosterButton('<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1"><i class="bi bi-person-plus me-1"></i>รอเพิ่มนักกีฬา</span>');
      }
      var hasRejected = playersInCat.some(function(p) {
        return p.docStatus !== 'CORRECTED' && p.docStatus !== 'PENDING' && p.docStatus !== 'APPROVED' && (p.docStatus === 'REJECTED' || p.docStatus === 'ACTION_REQUIRED' || Boolean(p.remarks));
      });
      var allApproved = playersInCat.length > 0 && playersInCat.every(function(p) {
        return p.docStatus === 'APPROVED';
      });

      if (hasRejected) {
        return rosterButton('<span class="badge bg-danger px-2 py-1"><i class="bi bi-exclamation-circle me-1"></i>ปรับแก้ข้อมูลนักกีฬา</span>');
      } else if (allApproved) {
        return rosterButton('<span class="badge bg-success px-2 py-1"><i class="bi bi-check-circle me-1"></i>อนุมัติ</span>');
      } else {
        return rosterButton('<span class="badge bg-warning text-dark px-2 py-1"><i class="bi bi-hourglass-split me-1"></i>รอตรวจสอบ</span>');
      }
    }

    function renderCatTeamsTable() {
      const searchInput = document.getElementById('filterCatTeamSearch');
      const search = searchInput ? (searchInput.value || '').toLowerCase() : '';
      const provEl = document.getElementById('filterCatTeamProvince');
      const prov = window.isSatOfficer ? window.satProvince : (provEl ? provEl.value : '');
      const distEl = document.getElementById('filterCatTeamDistrict');
      const dist = distEl ? distEl.value : '';
      const statEl = document.getElementById('filterCatTeamStatus');
      const stat = statEl ? statEl.value : '';

      const tbody = document.getElementById('catTeamsTableBody');
      const pagContainer = document.getElementById('catTeamsPaginationContainer');

      if (!tbody) return;

      if (!prov || !dist) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted">' +
          '<i class="bi bi-funnel-fill fs-3 text-navy d-block mb-2"></i>' +
          '<strong>กรุณาเลือก "จังหวัด" และ "เขต / อำเภอ" ด้านบนเพื่อดึงข้อมูลทีมลงทะเบียน</strong>' +
          '</td></tr>';
        if (pagContainer) pagContainer.innerHTML = '';
        return;
      }

      let filtered = window.rawCatTeamsData.filter(t => {
        if (t.province !== prov) return false;
        const teamDist = window.PmycTeamArea.getTeamDistrictName(t);
        if (teamDist !== dist) return false;
        if (stat && t.status !== stat) return false;
        if (search) {
          const matchName = (t.teamName || '').toLowerCase().includes(search);
          const matchManager = (t.managerName || '').toLowerCase().includes(search);
          if (!matchName && !matchManager) return false;
        }
        return true;
      });

      filtered.sort((a, b) => {
        const tA = new Date(a.createdAt || a.created_at || 0).getTime();
        const tB = new Date(b.createdAt || b.created_at || 0).getTime();
        return tA - tB;
      });

      const pageSize = 20;
      const totalItems = filtered.length;
      const totalPages = Math.ceil(totalItems / pageSize) || 1;

      if (window.currentCatTeamPage > totalPages) window.currentCatTeamPage = totalPages;
      if (window.currentCatTeamPage < 1) window.currentCatTeamPage = 1;

      const startIdx = (window.currentCatTeamPage - 1) * pageSize;
      const paginated = filtered.slice(startIdx, startIdx + pageSize);

      if (totalItems === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4"><i class="bi bi-inbox me-1"></i> ไม่พบข้อมูลทีมในจังหวัด ' + escapeHtml(prov) + ' เขต/อำเภอ ' + escapeHtml(dist) + '</td></tr>';
        if (pagContainer) pagContainer.innerHTML = '';
        return;
      }

      tbody.innerHTML = paginated.map((t, idx) => {
        const rowNum = startIdx + idx + 1;
        const approvalRank = Number(t.approvalRank || 0);
        const hasApprovalRank = approvalRank > 0;
        const bgClass = hasApprovalRank ? 'table-warning border-warning fw-semibold' : (t.is_deleted ? 'table-secondary opacity-75' : '');
        const highlightBadge = hasApprovalRank ? '<span class="badge bg-warning text-dark border border-warning ms-2" title="อนุมัติทีมและนักกีฬาครบถ้วน"><i class="bi bi-star-fill me-1"></i>ลำดับ ' + approvalRank + '</span>' : '';

        const catBadge = getCatBadgeJs(t, '${targetCategory}');
        const statBadge = getTeamStatusBadgeJs(t.status, t.is_deleted);
        const formattedTime = formatDateTimeJs(t.createdAt || t.created_at);

        return '<tr class="' + bgClass + '">' +
            '<td class="text-center fw-bold">' + rowNum + '</td>' +
            '<td><strong>' + escapeHtml(t.teamName || '-') + '</strong> ' + highlightBadge + '</td>' +
            '<td class="text-nowrap small text-muted"><i class="bi bi-clock me-1"></i>' + formattedTime + '</td>' +
            '<td><span class="badge bg-light text-dark border">' + escapeHtml(t.province || '-') + '</span></td>' +
            '<td>' + escapeHtml(window.PmycTeamArea.getTeamDistrictName(t) || '-') + '</td>' +
            '<td>' + escapeHtml(t.managerName || '-') + ' (' + escapeHtml(t.phone || '-') + ')</td>' +
            '<td class="text-center">' + catBadge + '</td>' +
            '<td class="text-center">' + statBadge + '</td>' +
          '</tr>';
      }).join('');

      if (pagContainer) {
        let pagHtml = '<div class="d-flex justify-content-between align-items-center w-100 px-2">';
        pagHtml += '<div class="text-muted small">แสดง ' + (startIdx + 1) + ' ถึง ' + Math.min(startIdx + pageSize, totalItems) + ' จากทั้งหมด ' + totalItems + ' รายการ (หน้า ' + window.currentCatTeamPage + '/' + totalPages + ')</div>';
        pagHtml += '<nav><ul class="pagination pagination-sm mb-0">';

        const prevDisabled = window.currentCatTeamPage === 1 ? 'disabled' : '';
        pagHtml += '<li class="page-item ' + prevDisabled + '"><button class="page-link" onclick="changeCatTeamPage(' + (window.currentCatTeamPage - 1) + ')">ก่อนหน้า</button></li>';

        for (let p = 1; p <= totalPages; p++) {
          if (totalPages > 7) {
            if (p !== 1 && p !== totalPages && Math.abs(p - window.currentCatTeamPage) > 2) {
              if (p === 2 && window.currentCatTeamPage > 4) {
                pagHtml += '<li class="page-item disabled"><span class="page-link">...</span></li>';
              } else if (p === totalPages - 1 && window.currentCatTeamPage < totalPages - 3) {
                pagHtml += '<li class="page-item disabled"><span class="page-link">...</span></li>';
              }
              continue;
            }
          }
          const activeClass = p === window.currentCatTeamPage ? 'active' : '';
          pagHtml += '<li class="page-item ' + activeClass + '"><button class="page-link" onclick="changeCatTeamPage(' + p + ')">' + p + '</button></li>';
        }

        const nextDisabled = window.currentCatTeamPage === totalPages ? 'disabled' : '';
        pagHtml += '<li class="page-item ' + nextDisabled + '"><button class="page-link" onclick="changeCatTeamPage(' + (window.currentCatTeamPage + 1) + ')">ถัดไป</button></li>';
        pagHtml += '</ul></nav></div>';

        pagContainer.innerHTML = pagHtml;
      }
    }

    function changeCatTeamPage(newPage) {
      window.currentCatTeamPage = newPage;
      renderCatTeamsTable();
    }

    function getTeamStatusBadgeJs(status, isDeleted) {
      if (isDeleted) return '<span class="badge bg-dark px-3 py-2"><i class="bi bi-trash3 me-1"></i> ถูกลบแล้ว</span>';
      if (status === 'APPROVED') return '<span class="badge bg-success px-3 py-2"><i class="bi bi-check-circle me-1"></i> อนุมัติทีม</span>';
      return '<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-hourglass-split me-1"></i> รอตรวจสอบทีม</span>';
    }

    function formatDateTimeJs(dateStr) {
      if (!dateStr) return '-';
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return '-';
      var day = String(d.getDate()).padStart(2, '0');
      var month = String(d.getMonth() + 1).padStart(2, '0');
      var yearBE = d.getFullYear() + 543;
      var hours = String(d.getHours()).padStart(2, '0');
      var mins = String(d.getMinutes()).padStart(2, '0');
      return day + '/' + month + '/' + yearBE + ' ' + hours + ':' + mins + ' น.';
    }

    window.openAdminEditTeamModal = async function(teamId, categoryCode) {
      categoryCode = String(categoryCode || '${targetCategory}').trim().toUpperCase();
      window.adminSelectedCategory = categoryCode;
      Swal.fire({ title: 'กำลังโหลดข้อมูลทีม...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      try {
        const res = await fetch(base + '/api/admin/teams/full-details?teamId=' + encodeURIComponent(teamId));
        const data = await res.json();
        Swal.close();

        if (!data.success || !data.team) {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: data.error || 'ไม่พบข้อมูลทีม' });
          return;
        }

        const team = data.team;
        const players = data.players || [];
        const officials = data.officials || [];

        const registeredCategories = (team.categories || '').split(',').map(c => c.trim().toUpperCase());
        const allCategories = categoryCode ? [categoryCode] : Array.from(new Set(['ALL', ...registeredCategories]));

        let categoryPanesHtml = '<div class="tab-content" id="adminPlayerCatTabContent">';
        allCategories.forEach((cat, idx) => {
          const isActive = idx === 0 ? 'show active' : '';
          const catPlayers = cat === 'ALL' ? players : players.filter(p => (p.category || p.categories || 'U14').toUpperCase().split(',').map(c => c.trim()).includes(cat));

          let playerRowsHtml = '';
          if (catPlayers.length === 0) {
            playerRowsHtml = '<tr><td colspan="9" class="text-center text-muted py-4"><i class="bi bi-inbox fs-3 d-block mb-1"></i>ไม่พบข้อมูลนักกีฬาในหมวดหมู่นี้</td></tr>';
          } else {
            playerRowsHtml = catPlayers.map((p, pIdx) => {
              const displayName = p.name || (p.prefix ? p.prefix + ' ' : '') + (p.firstName || p.first_name || '') + ' ' + (p.lastName || p.last_name || '') || 'ไม่ระบุชื่อ';
              const pPhoto = p.photoUrl || p.photo_url || '';
              const photoThumb = pPhoto 
                ? '<img src="' + base + pPhoto + '" width="40" height="40" class="rounded border object-fit-cover cursor-pointer" onclick="viewPhoto(&quot;' + escapeHtml(displayName).replace(/"/g, '&quot;') + '&quot;, &quot;' + base + pPhoto + '&quot;)">'
                : '<span class="badge bg-secondary">ไม่มีรูป</span>';
              const pCatList = String(p.category || p.categories || 'U14').split(',').map(c => c.trim()).filter(Boolean);
              const catBadge = pCatList.map(c => {
                const bg = c === 'U14' ? 'bg-info text-dark' : (c === 'U16' ? 'bg-primary' : 'bg-danger');
                return '<span class="badge ' + bg + ' me-1">' + escapeHtml(c) + '</span>';
              }).join('');
              const docBadge = p.docStatus === 'CORRECTED' ? '<span class="badge bg-info text-dark"><i class="bi bi-pencil-square me-1"></i> แก้ไขข้อมูลเรียบร้อย</span>' : (p.docStatus === 'APPROVED' ? '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i> ครบถ้วน</span>' : (p.docStatus !== 'PENDING' && (p.docStatus === 'ACTION_REQUIRED' || p.docStatus === 'REJECTED' || Boolean(p.remarks)) ? '<span class="badge bg-danger"><i class="bi bi-exclamation-triangle me-1"></i> ปรับแก้ข้อมูลเพิ่ม</span>' : '<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i> รอตรวจ</span>'));
              
              return '<tr>' +
                '<td class="text-center fw-bold">' + (pIdx + 1) + '</td>' +
                '<td class="text-center">' + photoThumb + '</td>' +
                '<td><strong>' + escapeHtml(displayName) + '</strong></td>' +
                '<td><span class="font-monospace">' + escapeHtml(p.idCard || p.id_card || '-') + '</span></td>' +
                '<td class="text-center"><span class="badge bg-light text-dark border fw-bold">' + escapeHtml(p.jerseyNo !== undefined && p.jerseyNo !== null ? p.jerseyNo : (p.jersey_no !== undefined && p.jersey_no !== null ? p.jersey_no : '-')) + '</span></td>' +
                '<td>' + escapeHtml(p.position || '-') + '</td>' +
                '<td class="text-center">' + catBadge + '</td>' +
                '<td class="text-center">' + docBadge + '</td>' +
                '<td class="text-center">' +
                  '<button type="button" class="btn btn-sm btn-outline-primary me-1" onclick="showAdminPlayerDetail(&quot;' + p.id + '&quot;)"><i class="bi bi-search me-1"></i> ตรวจรายละเอียด</button>' +
                  '<button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteAdminPlayer(&quot;' + p.id + '&quot;, &quot;' + escapeHtml(displayName).replace(/"/g, '&quot;') + '&quot;)" title="ลบข้อมูลนักกีฬา"><i class="bi bi-trash"></i></button>' +
                '</td>' +
              '</tr>';
            }).join('');
          }

          categoryPanesHtml += '<div class="tab-pane fade ' + isActive + '" id="admin-cat-' + cat + '-pane" role="tabpanel" tabindex="0">' +
            '<div class="table-responsive">' +
              '<table class="table table-sm table-bordered table-hover align-middle mb-0">' +
                '<thead class="table-light">' +
                  '<tr>' +
                    '<th class="text-center">#</th>' +
                    '<th class="text-center">รูปถ่าย</th>' +
                    '<th>ชื่อ-นามสกุล</th>' +
                    '<th>เลขบัตรประชาชน</th>' +
                    '<th class="text-center">หมายเลขเสื้อ</th>' +
                    '<th>ตำแหน่ง</th>' +
                    '<th class="text-center">รุ่นอายุ</th>' +
                    '<th class="text-center">สถานะเอกสาร</th>' +
                    '<th class="text-center">การจัดการ</th>' +
                  '</tr>' +
                '</thead>' +
                '<tbody>' + playerRowsHtml + '</tbody>' +
              '</table>' +
            '</div>' +
          '</div>';
        });
        categoryPanesHtml += '</div>';

        const rosterTabCont = document.getElementById('adminRosterTabContainer');
        if (rosterTabCont) rosterTabCont.innerHTML = categoryPanesHtml;

        // Populate Officials Tab
        let officialsHtml = '';
        if (officials.length === 0) {
          officialsHtml = '<div class="text-center text-muted py-4"><i class="bi bi-inbox fs-3 d-block mb-1"></i>ยังไม่มีข้อมูลเจ้าหน้าที่ประจำทีม</div>';
        } else {
          officialsHtml = '<div class="table-responsive"><table class="table table-sm table-bordered table-hover align-middle mb-0">' +
            '<thead class="table-light"><tr><th class="text-center">#</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่งเจ้าหน้าที่</th><th>เบอร์โทรศัพท์</th><th class="text-center">การจัดการ</th></tr></thead><tbody>' +
            officials.map((o, oIdx) => {
              const oName = o.name || (o.prefix ? o.prefix + ' ' : '') + (o.firstName || o.first_name || '') + ' ' + (o.lastName || o.last_name || '') || 'ไม่ระบุชื่อ';
              return '<tr><td class="text-center fw-bold">' + (oIdx + 1) + '</td><td><strong>' + escapeHtml(oName) + '</strong></td><td>' + escapeHtml(o.role || o.position || 'เจ้าหน้าที่ทีม') + '</td><td>' + escapeHtml(o.phone || '-') + '</td><td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteAdminOfficial(&quot;' + o.id + '&quot;, &quot;' + escapeHtml(oName).replace(/"/g, '&quot;') + '&quot;)"><i class="bi bi-trash me-1"></i> ลบ</button></td></tr>';
            }).join('') +
            '</tbody></table></div>';
        }
        const offCont = document.getElementById('adminOfficialsContainer');
        if (offCont) offCont.innerHTML = officialsHtml;

        // Populate Team Info
        document.getElementById('editTeamId').value = team.id;
        document.getElementById('editTeamName').value = team.teamName || '';
        document.getElementById('editSchoolCode').value = team.school_code || team.schoolCode || '';
        document.getElementById('editProvince').value = team.province || '';
        document.getElementById('editDistrict').value = window.PmycTeamArea.getTeamDistrictName(team);
        if (document.getElementById('editBkkZone')) document.getElementById('editBkkZone').value = team.bkk_zone || team.bkkZone || '';
        if (document.getElementById('editGender')) document.getElementById('editGender').value = team.gender || 'boy';
        if (document.getElementById('editCategories')) document.getElementById('editCategories').value = team.categories || '';
        document.getElementById('editManagerName').value = team.managerName || '';
        document.getElementById('editPhone').value = team.phone || '';
        document.getElementById('editEmail').value = team.email || '';
        document.getElementById('editLineId').value = team.line_id || team.lineId || '';
        document.getElementById('editHouseNo').value = team.house_no || team.houseNo || '';
        document.getElementById('editRoad').value = team.road || '';
        document.getElementById('editSubdistrict').value = team.subdistrict || '';
        document.getElementById('editContactDistrict').value = window.PmycTeamArea.normalizeDistrictName(team.contact_district || team.contactDistrict, team.contact_province);
        document.getElementById('editContactProvince').value = team.contact_province || team.contactProvince || team.province || '';

        // Documents Review Setup
        const certBtn = document.getElementById('editDocTeamCertBtn');
        const certStatus = document.getElementById('editDocTeamCertStatus');
        if (team.team_cert_url || team.teamCertUrl) {
          const fileUrl = base + (team.team_cert_url || team.teamCertUrl);
          certStatus.className = 'badge bg-success-subtle text-success small';
          certStatus.innerHTML = '<i class="bi bi-check-circle me-1"></i> อัปโหลดแล้ว';
          certBtn.className = 'btn btn-sm btn-outline-primary fw-semibold';
          certBtn.disabled = false;
          certBtn.onclick = () => window.open(fileUrl, '_blank');
        } else {
          certStatus.className = 'badge bg-secondary-subtle text-muted small';
          certStatus.innerHTML = 'ยังไม่อัปโหลด';
          certBtn.className = 'btn btn-sm btn-outline-info fw-semibold disabled';
          certBtn.disabled = true;
          certBtn.onclick = null;
        }

        const rosterBtn = document.getElementById('editDocRosterBtn');
        const rosterStatus = document.getElementById('editDocRosterStatus');
        if (team.roster_file_url || team.rosterFileUrl) {
          const fileUrl = base + (team.roster_file_url || team.rosterFileUrl);
          rosterStatus.className = 'badge bg-success-subtle text-success small';
          rosterStatus.innerHTML = '<i class="bi bi-check-circle me-1"></i> อัปโหลดแล้ว';
          rosterBtn.className = 'btn btn-sm btn-outline-primary fw-semibold';
          rosterBtn.disabled = false;
          rosterBtn.onclick = () => window.open(fileUrl, '_blank');
        } else {
          rosterStatus.className = 'badge bg-secondary-subtle text-muted small';
          rosterStatus.innerHTML = 'ยังไม่อัปโหลด';
          rosterBtn.className = 'btn btn-sm btn-outline-info fw-semibold disabled';
          rosterBtn.disabled = true;
          rosterBtn.onclick = null;
        }

        // Status Badge Update
        const badgeEl = document.getElementById('editTeamStatusBadge');
        if (badgeEl) {
          if (team.status === 'APPROVED') {
            badgeEl.className = 'badge bg-success text-white px-3 py-2 fs-6';
            badgeEl.innerHTML = '<i class="bi bi-check-circle me-1"></i> อนุมัติทีม';
          } else {
            badgeEl.className = 'badge bg-warning text-dark px-3 py-2 fs-6';
            badgeEl.innerHTML = '<i class="bi bi-hourglass-split me-1"></i> รอตรวจสอบทีม';
          }
        }

        window.adminLoadedPlayers = players;
        const modalEl = document.getElementById('adminEditTeamModal');
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      } catch (err) {
        console.error(err);
        Swal.close();
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถโหลดข้อมูลทีมได้' });
      }
    };

    window.showAdminPlayerDetail = function(playerId) {
      const p = (window.adminLoadedPlayers || []).find(item => String(item.id).trim() === String(playerId).trim());
      if (!p) {
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่พบข้อมูลนักกีฬา' });
        return;
      }

      document.getElementById('inspectionPlayerId').value = p.id;
      const displayName = p.name || (p.prefix ? p.prefix + ' ' : '') + (p.firstName || p.first_name || '') + ' ' + (p.lastName || p.last_name || '') || 'ไม่ระบุชื่อ';
      document.getElementById('inspectionPlayerName').textContent = displayName;
      document.getElementById('inspectionPlayerIdCard').textContent = 'ID: ' + (p.idCard || p.id_card || '-');
      document.getElementById('inspectionPlayerJerseyNo').textContent = 'เบอร์ ' + (p.jerseyNo !== undefined && p.jerseyNo !== null ? p.jerseyNo : (p.jersey_no !== undefined && p.jersey_no !== null ? p.jersey_no : '-'));
      document.getElementById('inspectionPlayerPos').textContent = p.position || '-';
      document.getElementById('inspectionPlayerSchool').textContent = document.getElementById('editTeamName').value || '-';
      document.getElementById('inspectionPlayerCat').textContent = p.category || p.categories || 'U14';
      document.getElementById('inspectionPlayerHW').textContent = (p.height ? p.height + ' ซม.' : '-') + ' / ' + (p.weight ? p.weight + ' กก.' : '-');
      document.getElementById('inspectionPlayerGrade').textContent = p.grade || p.education_level || '-';
      document.getElementById('inspectionPlayerGuardian').textContent = p.guardianName || p.guardian_name || '-';
      document.getElementById('inspectionPlayerPhone').textContent = p.guardianPhone || p.guardian_phone || p.phone || '-';
      ${renderAthleteExtraFields('inspectionPlayer')}

      const photoImg = document.getElementById('inspectionPlayerPhoto');
      if (p.photoUrl) {
        photoImg.src = base + p.photoUrl;
      } else {
        photoImg.src = 'https://via.placeholder.com/160x200?text=No+Photo';
      }

      // Populate Docs List
      const docsListEl = document.getElementById('inspectionPlayerDocsList');
      let docsHtml = '';
      if (p.idCardFileUrl || p.id_card_file_url) {
        docsHtml += '<div class="d-flex align-items-center justify-content-between p-2 border rounded bg-white"><span><i class="bi bi-file-earmark-person me-1 text-primary"></i> 1. สำเนาบัตรประชาชน</span><button type="button" class="btn btn-sm btn-outline-primary py-0 px-2" onclick="window.open(&quot;' + base + (p.idCardFileUrl || p.id_card_file_url) + '&quot;, &quot;_blank&quot;)"><i class="bi bi-eye"></i> ดูเอกสาร</button></div>';
      }
      if (p.houseRegFileUrl || p.house_reg_file_url) {
        docsHtml += '<div class="d-flex align-items-center justify-content-between p-2 border rounded bg-white"><span><i class="bi bi-house-door me-1 text-info"></i> 2. สำเนาทะเบียนบ้าน</span><button type="button" class="btn btn-sm btn-outline-primary py-0 px-2" onclick="window.open(&quot;' + base + (p.houseRegFileUrl || p.house_reg_file_url) + '&quot;, &quot;_blank&quot;)"><i class="bi bi-eye"></i> ดูเอกสาร</button></div>';
      }
      if (p.studCertFileUrl || p.stud_cert_file_url) {
        docsHtml += '<div class="d-flex align-items-center justify-content-between p-2 border rounded bg-white"><span><i class="bi bi-file-earmark-text me-1 text-success"></i> 3. หนังสือรับรองสถานภาพนักเรียน</span><button type="button" class="btn btn-sm btn-outline-primary py-0 px-2" onclick="window.open(&quot;' + base + (p.studCertFileUrl || p.stud_cert_file_url) + '&quot;, &quot;_blank&quot;)"><i class="bi bi-eye"></i> ดูเอกสาร</button></div>';
      }
      if (!docsHtml) {
        docsHtml = '<div class="text-muted text-center py-2">ยังไม่มีการอัปโหลดไฟล์เอกสารประกอบ</div>';
      }
      docsListEl.innerHTML = docsHtml;

      // Select Current Status & Remarks
      const docStatus = p.docStatus || p.doc_status || 'PENDING';
      const needsCorrection = docStatus === 'REJECTED' || (docStatus !== 'CORRECTED' && docStatus !== 'PENDING' && docStatus !== 'APPROVED' && Boolean(p.remarks));
      document.getElementById('inspectionDocStatusSelect').value = needsCorrection ? 'ACTION_REQUIRED' : docStatus;
      document.getElementById('inspectionPlayerRemarks').value = p.remarks || '';

      const modal = new bootstrap.Modal(document.getElementById('adminPlayerInspectionModal'));
      modal.show();
    };

    window.saveAdminPlayerInspectionRemark = async function() {
      const activeTeamTab = document.querySelector('#adminTeamMainTabs .nav-link.active');
      const playerId = document.getElementById('inspectionPlayerId').value;
      const docStatus = document.getElementById('inspectionDocStatusSelect').value;
      const remarks = document.getElementById('inspectionPlayerRemarks').value;

      if (!playerId) return;

      const btn = document.getElementById('btnSaveInspectionRemark');
      const origText = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> บันทึก...';
      }

      try {
        const resp = await fetch(base + '/api/admin/players/save-remark', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ playerId, docStatus, remarks })
        });
        const result = await resp.json();

        if (result.success) {
          const p = (window.adminLoadedPlayers || []).find(item => String(item.id).trim() === String(playerId).trim());
          if (p) {
            p.docStatus = docStatus;
            p.doc_status = docStatus;
            p.remarks = remarks;
          }

          const teamId = document.getElementById('editTeamId').value;
          if (teamId) {
            await openAdminEditTeamModal(teamId, window.adminSelectedCategory || '');
          }

          const modalEl = document.getElementById('adminPlayerInspectionModal');
          if (modalEl) {
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
          }

          if (activeTeamTab) bootstrap.Tab.getOrCreateInstance(activeTeamTab).show();

          Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', text: 'บันทึกผลการตรวจสอบนักกีฬาเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
        } else {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: result.message || 'ไม่สามารถบันทึกข้อมูลได้' });
        }
      } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = origText;
        }
      }
    };

    window.deleteAdminPlayer = async function(playerId, playerName) {
      const confirm = await Swal.fire({
        title: 'ยืนยันการลบนักกีฬาหรือไม่?',
        html: 'คุณกำลังจะลบข้อมูลนักกีฬา <strong>' + escapeHtml(playerName || 'ท่านนี้') + '</strong><br><small class="text-danger">*การลบจะปลดล็อกเลขบัตรประชาชน ให้สามารถนำไปลงทะเบียนใหม่ได้</small>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '<i class="bi bi-trash me-1"></i> ยืนยันลบนักกีฬา',
        cancelButtonText: 'ยกเลิก'
      });

      if (!confirm.isConfirmed) return;

      Swal.fire({ title: 'กำลังลบข้อมูลนักกีฬา...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      try {
        const resp = await fetch(base + '/api/admin/players/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ playerId })
        });
        const res = await resp.json();

        if (res.success) {
          const teamId = document.getElementById('editTeamId') ? document.getElementById('editTeamId').value : '';
          if (teamId) {
            await openAdminEditTeamModal(teamId, window.adminSelectedCategory || '');
          }
          if (typeof renderCatTeamsTable === 'function') renderCatTeamsTable();
          Swal.fire({ icon: 'success', title: 'ลบข้อมูลสำเร็จ', text: res.message || 'ลบข้อมูลนักกีฬาและปลดล็อกเลขบัตรประชาชนเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
        } else {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: res.message || 'ไม่สามารถลบข้อมูลนักกีฬาได้' });
        }
      } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
      }
    };

    window.deleteCurrentInspectionPlayer = function() {
      const playerId = document.getElementById('inspectionPlayerId') ? document.getElementById('inspectionPlayerId').value : '';
      const playerName = document.getElementById('inspectionPlayerName') ? document.getElementById('inspectionPlayerName').textContent : '';
      if (!playerId) return;

      const modalEl = document.getElementById('adminPlayerInspectionModal');
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }

      deleteAdminPlayer(playerId, playerName);
    };

    window.deleteAdminOfficial = async function(officialId, officialName) {
      const confirm = await Swal.fire({
        title: 'ยืนยันการลบเจ้าหน้าที่หรือไม่?',
        html: 'คุณกำลังจะลบข้อมูลเจ้าหน้าที่ <strong>' + escapeHtml(officialName || 'ท่านนี้') + '</strong><br><small class="text-danger">*การลบจะปลดล็อกเลขบัตรประชาชน ให้สามารถนำไปลงทะเบียนใหม่ได้</small>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '<i class="bi bi-trash me-1"></i> ยืนยันลบเจ้าหน้าที่',
        cancelButtonText: 'ยกเลิก'
      });

      if (!confirm.isConfirmed) return;

      Swal.fire({ title: 'กำลังลบข้อมูลเจ้าหน้าที่...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      try {
        const resp = await fetch(base + '/api/admin/officials/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ officialId })
        });
        const res = await resp.json();

        if (res.success) {
          const teamId = document.getElementById('editTeamId') ? document.getElementById('editTeamId').value : '';
          if (teamId) {
            await openAdminEditTeamModal(teamId, window.adminSelectedCategory || '');
          }
          Swal.fire({ icon: 'success', title: 'ลบข้อมูลสำเร็จ', text: res.message || 'ลบข้อมูลเจ้าหน้าที่เรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
        } else {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: res.message || 'ไม่สามารถลบข้อมูลเจ้าหน้าที่ได้' });
        }
      } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
      }
    };

    window.deleteAdminTeam = async function(teamId, teamName) {
      const confirm = await Swal.fire({
        title: 'ยืนยันการลบทีมหรือไม่?',
        html: 'คุณกำลังจะลบทีม <strong>' + escapeHtml(teamName) + '</strong><br><small class="text-muted">(เป็นการลบแบบซ่อนรายการไว้ในระบบ สามารถกู้คืนกลับมาได้หากต้องการ)</small>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '<i class="bi bi-trash me-1"></i> ยืนยันการลบทีม',
        cancelButtonText: 'ยกเลิก'
      });

      if (!confirm.isConfirmed) return;

      Swal.fire({ title: 'กำลังลบทีม...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      try {
        const resp = await fetch(base + '/api/admin/teams/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ id: teamId })
        });
        const res = await resp.json();
        if (res.success) {
          const t = (window.rawCatTeamsData || window.rawTeamsData || []).find(item => String(item.id).trim() === String(teamId).trim());
          if (t) {
            t.is_deleted = true;
            t.deleted_at = new Date().toISOString();
          }
          window.location.reload();
          Swal.fire({ icon: 'success', title: 'ลบทีมสำเร็จ', text: 'ทีมถูกลบและซ่อนจากระบบเรียบร้อยแล้ว (สามารถเลือกสถานะ "ถูกลบแล้ว" เพื่อกู้คืนได้)', timer: 2000, showConfirmButton: false });
        } else {
          Swal.fire({ icon: 'error', title: 'ไม่สามารถลบทีมได้', text: res.error || 'เกิดข้อผิดพลาด' });
        }
      } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
      }
    };

    window.restoreAdminTeam = async function(teamId) {
      const confirm = await Swal.fire({
        title: 'ยืนยันการกู้คืนทีมหรือไม่?',
        text: 'ทีมจะกลับมาแสดงผลในรายการสมัครตามปกติ',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#198754',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '<i class="bi bi-arrow-counterclockwise me-1"></i> ยืนยันกู้คืนทีม',
        cancelButtonText: 'ยกเลิก'
      });

      if (!confirm.isConfirmed) return;

      Swal.fire({ title: 'กำลังกู้คืนทีม...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      try {
        const resp = await fetch(base + '/api/admin/teams/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ id: teamId })
        });
        const res = await resp.json();
        if (res.success) {
          const t = (window.rawCatTeamsData || window.rawTeamsData || []).find(item => String(item.id).trim() === String(teamId).trim());
          if (t) {
            t.is_deleted = false;
            t.deleted_at = null;
          }
          window.location.reload();
          Swal.fire({ icon: 'success', title: 'กู้คืนทีมสำเร็จ', text: 'เรียกข้อมูลทีมกลับคืนมาแสดงผลตามปกติเรียบร้อยแล้ว', timer: 2000, showConfirmButton: false });
        } else {
          Swal.fire({ icon: 'error', title: 'ไม่สามารถกู้คืนทีมได้', text: res.error || 'เกิดข้อผิดพลาด' });
        }
      } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
      }
    };

    document.addEventListener('DOMContentLoaded', () => {
      const searchEl = document.getElementById('filterCatTeamSearch');
      if (searchEl) searchEl.addEventListener('input', () => { window.currentCatTeamPage = 1; renderCatTeamsTable(); });
      const provEl = document.getElementById('filterCatTeamProvince');
      if (provEl) {
        provEl.addEventListener('change', () => { 
          updateCatTeamDistrictOptions();
          window.currentCatTeamPage = 1; 
          renderCatTeamsTable(); 
        });
      }
      const distEl = document.getElementById('filterCatTeamDistrict');
      if (distEl) {
        distEl.addEventListener('change', () => { 
          window.currentCatTeamPage = 1; 
          renderCatTeamsTable(); 
        });
      }
      const statEl = document.getElementById('filterCatTeamStatus');
      if (statEl) statEl.addEventListener('change', () => { window.currentCatTeamPage = 1; renderCatTeamsTable(); });

      updateCatTeamDistrictOptions();
      renderCatTeamsTable();
    });
  </script>

  <!-- Full Team Edit & Player Verification Modal -->
  <div class="modal fade" id="adminEditTeamModal" tabindex="-1" aria-labelledby="adminEditTeamModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
        <div class="modal-header bg-navy text-white py-3">
          <div class="d-flex align-items-center gap-3">
            <i class="bi bi-shield-shaded fs-3 text-warning"></i>
            <div>
              <h5 class="modal-title fw-bold mb-0" id="adminEditTeamModalLabel">รายละเอียดข้อมูลทีมลงทะเบียน (${targetCategory})</h5>
              <small class="text-white-50">ตรวจสอบข้อมูลสังกัด เอกสารยื่นประกอบ และอนุมัติการรับรองสิทธิ์</small>
            </div>
          </div>
          <div class="d-flex align-items-center gap-2 me-3">
            <span id="editTeamStatusBadge" class="badge bg-warning text-dark px-3 py-2 fs-6">รอตรวจสอบ</span>
          </div>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4 bg-light">
          <!-- Main Modal Tabs -->
          <ul class="nav nav-tabs nav-fill fw-bold mb-4" id="adminTeamMainTabs" role="tablist">
            <li class="nav-item" role="presentation">
              <button class="nav-link active py-2 text-navy" id="team-info-tab" data-bs-toggle="tab" data-bs-target="#team-info-pane" type="button" role="tab"><i class="bi bi-pencil-square me-1"></i> 1. ข้อมูลทีม & ผู้จัดการทีม</button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link py-2 text-navy" id="team-players-tab" data-bs-toggle="tab" data-bs-target="#team-players-pane" type="button" role="tab"><i class="bi bi-people-fill me-1"></i> 2. รายชื่อนักกีฬาประจำทีม</button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link py-2 text-navy" id="team-officials-tab" data-bs-toggle="tab" data-bs-target="#team-officials-pane" type="button" role="tab"><i class="bi bi-person-badge-fill me-1"></i> 3. รายชื่อเจ้าหน้าที่ประจำทีม</button>
            </li>
          </ul>

          <div class="tab-content" id="adminTeamMainTabContent">
            <!-- Tab 1: Team Info Edit Form -->
            <div class="tab-pane fade show active" id="team-info-pane" role="tabpanel" tabindex="0">
              <form id="adminEditTeamForm" onsubmit="event.preventDefault();">
                <input type="hidden" id="editTeamId" name="id">
                <div class="card border-0 shadow-sm rounded-3 p-4 bg-white mb-3">
                  <h6 class="fw-bold text-navy border-bottom pb-2 mb-3 d-flex align-items-center justify-content-between">
                    <span><i class="bi bi-building me-1"></i> ข้อมูลสังกัดสถานศึกษาและพื้นที่สมัคร</span>
                    <span class="badge bg-light text-muted border fw-normal fs-7"><i class="bi bi-lock me-1"></i> อ่านได้อย่างเดียว (แก้ไขไม่ได้)</span>
                  </h6>
                  <div class="row g-3">
                    <div class="col-md-6">
                      <label class="form-label required small fw-bold">ชื่อโรงเรียน / สังกัดทีม</label>
                      <input type="text" id="editTeamName" name="teamName" class="form-control bg-light" readonly disabled required>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small fw-bold">รหัสสถานศึกษา</label>
                      <input type="text" id="editSchoolCode" name="school_code" class="form-control bg-light" readonly disabled placeholder="เช่น 1050012345">
                    </div>
                    <div class="col-md-4">
                      <label class="form-label required small fw-bold">จังหวัดที่ส่งแข่งขัน</label>
                      <input type="text" id="editProvince" name="province" class="form-control bg-light" readonly disabled required>
                    </div>
                    <div class="col-md-4">
                      <label class="form-label small fw-bold">เขต / อำเภอ</label>
                      <input type="text" id="editDistrict" name="district" class="form-control bg-light" readonly disabled>
                    </div>
                    <div class="col-md-4" id="editBkkZoneContainer">
                      <label class="form-label small fw-bold">โซนพื้นที่ (กรุงเทพมหานคร)</label>
                      <input type="text" id="editBkkZone" name="bkk_zone" class="form-control bg-light" readonly disabled placeholder="เช่น ฝั่งธนบุรี">
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small fw-bold">ประเภทการแข่งขัน</label>
                      <select id="editGender" name="gender" class="form-select bg-light" disabled>
                        <option value="boy">ทีมชาย</option>
                        <option value="girl">ทีมหญิง</option>
                      </select>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small fw-bold">รุ่นอายุที่ลงสมัครแข่งขัน</label>
                      <input type="text" id="editCategories" name="categories" class="form-control bg-light" readonly disabled placeholder="เช่น U14,U16">
                    </div>
                  </div>
                </div>

                <div class="card border-0 shadow-sm rounded-3 p-4 bg-white mb-3">
                  <h6 class="fw-bold text-navy border-bottom pb-2 mb-3 d-flex align-items-center justify-content-between">
                    <span><i class="bi bi-file-earmark-check-fill me-1 text-primary"></i> เอกสารยื่นประกอบการลงทะเบียนทีม</span>
                    <span class="badge bg-light text-muted border fw-normal fs-7"><i class="bi bi-lock me-1"></i> อ่าน/รีวิวได้อย่างเดียว (แก้ไขไม่ได้)</span>
                  </h6>
                  <div class="row g-3">
                    <div class="col-md-6">
                      <div class="border rounded-3 p-3 bg-light d-flex align-items-center justify-content-between">
                        <div class="d-flex align-items-center gap-3">
                          <div class="bg-primary text-white rounded-3 p-2 d-flex align-items-center justify-content-center" style="width: 42px; height: 42px;">
                            <i class="bi bi-file-earmark-pdf fs-4"></i>
                          </div>
                          <div>
                            <strong class="d-block text-dark small">1. หนังสือรับรองทีม</strong>
                            <span id="editDocTeamCertStatus" class="badge bg-secondary-subtle text-muted small">ยังไม่อัปโหลด</span>
                          </div>
                        </div>
                        <button type="button" id="editDocTeamCertBtn" class="btn btn-sm btn-outline-info fw-semibold disabled" disabled>
                          <i class="bi bi-eye me-1"></i> รีวิวเอกสาร
                        </button>
                      </div>
                    </div>
                    <div class="col-md-6 ${['SAT_OFFICER', 'DOCUMENT_VERIFIER'].includes(currentUser.roleCode) ? 'd-none' : ''}">
                      <div class="border rounded-3 p-3 bg-light d-flex align-items-center justify-content-between">
                        <div class="d-flex align-items-center gap-3">
                          <div class="bg-danger text-white rounded-3 p-2 d-flex align-items-center justify-content-center" style="width: 42px; height: 42px;">
                            <i class="bi bi-file-earmark-text fs-4"></i>
                          </div>
                          <div>
                            <strong class="d-block text-dark small">2. ใบรายชื่อนักกีฬา (O-2)</strong>
                            <span id="editDocRosterStatus" class="badge bg-secondary-subtle text-muted small">ยังไม่อัปโหลด</span>
                          </div>
                        </div>
                        <button type="button" id="editDocRosterBtn" class="btn btn-sm btn-outline-info fw-semibold disabled" disabled>
                          <i class="bi bi-eye me-1"></i> รีวิวเอกสาร
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="card border-0 shadow-sm rounded-3 p-4 bg-white">
                  <h6 class="fw-bold text-navy border-bottom pb-2 mb-3 d-flex align-items-center justify-content-between">
                    <span><i class="bi bi-person-lines-fill me-1"></i> ข้อมูลผู้จัดการทีมและช่องทางติดต่อ</span>
                    <span class="badge bg-light text-muted border fw-normal fs-7"><i class="bi bi-lock me-1"></i> อ่านได้อย่างเดียว (แก้ไขไม่ได้)</span>
                  </h6>
                  <div class="row g-3">
                    <div class="col-md-6">
                      <label class="form-label required small fw-bold">ชื่อ-นามสกุล ผู้จัดการทีม</label>
                      <input type="text" id="editManagerName" name="managerName" class="form-control bg-light" readonly disabled required>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label required small fw-bold">เบอร์โทรศัพท์ติดต่อ</label>
                      <input type="text" id="editPhone" name="phone" class="form-control bg-light" readonly disabled required>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small fw-bold">อีเมล (Email)</label>
                      <input type="email" id="editEmail" name="email" class="form-control bg-light" readonly disabled>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small fw-bold">LINE ID</label>
                      <input type="text" id="editLineId" name="line_id" class="form-control bg-light" readonly disabled>
                    </div>
                    <div class="col-md-3">
                      <label class="form-label small fw-bold">เลขที่/บ้านเลขที่</label>
                      <input type="text" id="editHouseNo" name="house_no" class="form-control bg-light" readonly disabled>
                    </div>
                    <div class="col-md-3">
                      <label class="form-label small fw-bold">ถนน</label>
                      <input type="text" id="editRoad" name="road" class="form-control bg-light" readonly disabled>
                    </div>
                    <div class="col-md-3">
                      <label class="form-label small fw-bold">ตำบล/แขวง</label>
                      <input type="text" id="editSubdistrict" name="subdistrict" class="form-control bg-light" readonly disabled>
                    </div>
                    <div class="col-md-3">
                      <label class="form-label small fw-bold">อำเภอ/เขต (ที่อยู่ติดต่อ)</label>
                      <input type="text" id="editContactDistrict" name="contact_district" class="form-control bg-light" readonly disabled>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label small fw-bold">จังหวัด (ที่อยู่ติดต่อ)</label>
                      <input type="text" id="editContactProvince" name="contact_province" class="form-control bg-light" readonly disabled>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <!-- Tab 2: Categorized Roster Verification -->
            <div class="tab-pane fade" id="team-players-pane" role="tabpanel" tabindex="0">
              <div class="card border-0 shadow-sm rounded-3 p-4 bg-white">
                <div id="adminRosterTabContainer">
                  <!-- Populated by JavaScript -->
                </div>
              </div>
            </div>

            <!-- Tab 3: Officials List -->
            <div class="tab-pane fade" id="team-officials-pane" role="tabpanel" tabindex="0">
              <div class="card border-0 shadow-sm rounded-3 p-4 bg-white">
                <h6 class="fw-bold text-navy mb-3"><i class="bi bi-person-badge me-1"></i> รายชื่อเจ้าหน้าที่ประจำทีม</h6>
                <div id="adminOfficialsContainer">
                  <!-- Populated by JavaScript -->
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer bg-white py-3">
          <button type="button" class="btn btn-secondary px-3" data-bs-dismiss="modal">ปิดหน้าต่าง</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Admin Player Inspection & Document Review Modal -->
  ${athleteReviewStyles}
  <div class="modal fade athlete-review-modal" id="adminPlayerInspectionModal" tabindex="-1" aria-labelledby="adminPlayerInspectionModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content border-0 shadow-lg rounded-4">
        <div class="modal-header bg-navy text-white rounded-top-4 py-3">
          <h5 class="modal-title fw-bold" id="adminPlayerInspectionModalLabel">
            <i class="bi bi-shield-check text-warning me-2"></i> รายละเอียดนักกีฬา & ตรวจสอบเอกสาร
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4 bg-light">
          <input type="hidden" id="inspectionPlayerId">
          <div class="athlete-layout">
            <!-- Left Column: Photo & Main Info -->
            <div class="athlete-photo-column">
              <div class="athlete-photo-panel">
                <img id="inspectionPlayerPhoto" src="https://via.placeholder.com/160x200?text=No+Photo" class="img-fluid rounded-3 border shadow-sm" alt="รูปถ่ายนักกีฬา">

              </div>
            </div>

            <!-- Right Column: Details, Docs Checklist & Remarks Form -->
            <div class="athlete-detail-column">
              ${renderAthleteInformation('inspectionPlayer')}

              <!-- Uploaded Documents Checklist -->
              <div class="card border-0 shadow-sm mb-3">
                <div class="card-body p-3">
                  <h6 class="fw-bold text-navy border-bottom pb-2 mb-2"><i class="bi bi-file-earmark-pdf me-1"></i> รายการเอกสารประกอบ</h6>
                  <div class="d-flex flex-column gap-2 small" id="inspectionPlayerDocsList">
                    <!-- Populated dynamically -->
                  </div>
                </div>
              </div>

              <!-- Admin Inspection & Remarks Form -->
              <div class="card border-primary border-opacity-50 shadow-sm">
                <div class="card-body p-3 bg-white">
                  <h6 class="fw-bold text-primary border-bottom pb-2 mb-3"><i class="bi bi-pencil-square me-1"></i> ผลการตรวจสอบ & หมายเหตุเจ้าหน้าที่</h6>
                  <div class="mb-3">
                    <label class="form-label small fw-bold text-navy">สถานะการตรวจสอบเอกสาร</label>
                    <select id="inspectionDocStatusSelect" class="form-select form-select-sm">
                      <option value="PENDING">⏳ รอตรวจสอบ (Pending)</option>
                      <option value="APPROVED">🟢 ครบถ้วน สมบูรณ์ / อนุมัติ (Approved)</option>
                      <option value="ACTION_REQUIRED">🟡 มีหมายเหตุ / ต้องแก้ไข (Action Required)</option>
                      <option value="CORRECTED">📝 แก้ไขข้อมูลเรียบร้อย</option>
                    </select>
                  </div>
                  <div class="mb-2">
                    <label class="form-label small fw-bold text-navy">หมายเหตุ (Remark ในกรณีที่ข้อมูล/เอกสารไม่ครบถ้วน)</label>
                    <textarea id="inspectionPlayerRemarks" class="form-control form-control-sm" rows="3" placeholder="ระบุสิ่งที่ต้องการให้นักกีฬาหรือผู้จัดการทีมแก้ไข เช่น รูปถ่ายไม่ชัดเจน, บัตรประชาชนหมดอายุ..."></textarea>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
        <div class="modal-footer bg-white rounded-bottom-4 py-2 justify-content-between">
          <button type="button" class="btn btn-sm btn-outline-danger px-3 fw-semibold" id="btnDeleteInspectionPlayer" onclick="deleteCurrentInspectionPlayer()">
            <i class="bi bi-trash me-1"></i> ลบข้อมูลนักกีฬาท่านนี้
          </button>
          <div>
            <button type="button" class="btn btn-sm btn-outline-secondary px-3 me-2" data-bs-dismiss="modal">ปิด</button>
            <button type="button" class="btn btn-sm btn-primary px-4 fw-semibold" id="btnSaveInspectionRemark" onclick="saveAdminPlayerInspectionRemark()">
              <i class="bi bi-save me-1"></i> บันทึกข้อมูล
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  `;
    const rawQuery = req.url.includes('?') ? req.url.substring(req.url.indexOf('?') + 1) : '';
    res.send((0, adminLayout_1.renderAdminLayout)(categoryTitle, bodyContent, navKey, base, currentUser, rawQuery));
}
// -----------------------------------------------------------------------------
// Route: GET /admin/teams-u14.php
// -----------------------------------------------------------------------------
router.get('/admin/teams-u14.php', adminSession_service_1.checkAdminSession, async (req, res) => {
    await renderCategoryTeamsPage(req, res, 'U14', 'teams-u14');
});
// -----------------------------------------------------------------------------
// Route: GET /admin/teams-u16.php
// -----------------------------------------------------------------------------
router.get('/admin/teams-u16.php', adminSession_service_1.checkAdminSession, async (req, res) => {
    await renderCategoryTeamsPage(req, res, 'U16', 'teams-u16');
});
// -----------------------------------------------------------------------------
// Route: GET /admin/teams-u18.php
// -----------------------------------------------------------------------------
router.get('/admin/teams-u18.php', adminSession_service_1.checkAdminSession, async (req, res) => {
    await renderCategoryTeamsPage(req, res, 'U18', 'teams-u18');
});
const bracketCategories = ['U14', 'U16', 'U18'];
const validBracketCategory = (value) => bracketCategories.includes(value);
const bracketAuditId = (category, province, district, isDemo = false) => `BRK-${(0, crypto_1.createHash)('sha256').update(`${isDemo ? 'DEMO|' : ''}${category}|${province}|${district}`).digest('hex').slice(0, 24)}`;
function validateBracketArea(req, res, category, provinceValue, districtValue, isDemo = false) {
    if (!validBracketCategory(category)) {
        res.status(400).json({ success: false, error: 'รุ่นแข่งขันไม่ถูกต้อง' });
        return null;
    }
    const province = (0, teamArea_1.normalizeProvince)(provinceValue);
    const district = (0, teamArea_1.normalizeDistrictName)(districtValue, province);
    if (!province || !district) {
        res.status(400).json({ success: false, error: 'กรุณาเลือกจังหวัดและเขต/อำเภอก่อน' });
        return null;
    }
    const user = req.adminUser;
    if (isDemo && !canAccessDemoModule(user)) {
        res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงข้อมูล Demo' });
        return null;
    }
    if (isDemo && user?.roleCode === 'SAT_OFFICER' && !String(user.province || '').trim()) {
        res.status(403).json({ success: false, error: 'ไม่พบจังหวัดในบัญชี กกท.' });
        return null;
    }
    if (user?.roleCode === 'SAT_OFFICER' && province !== String(user.province || '').trim()) {
        res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนอกจังหวัดที่รับผิดชอบ' });
        return null;
    }
    return { category, province, district, user };
}
async function getBracketStorageArea(area, isDemo, res) {
    const province = isDemo ? `DEMO:${area.province}` : area.province;
    if (area.province !== 'กรุงเทพมหานคร')
        return { province, district: area.district };
    // Resolve an existing alias without renaming or merging any persisted bracket key.
    const existing = await db_1.pool.query('SELECT district FROM football_competition_bracket WHERE category = $1 AND province = $2', [area.category, province]);
    const keys = [...new Set((existing.rows || []).map((row) => String(row.district || ''))
            .filter((key) => (0, teamArea_1.normalizeDistrictName)(key, area.province) === area.district))];
    if (keys.length > 1) {
        res.status(409).json({ success: false, error: 'พบผังหลายรายการสำหรับเขตเดียวกัน ต้องตรวจสอบก่อนดำเนินการ' });
        return null;
    }
    return { province, district: keys[0] || area.district };
}
async function findBracketTeams(category, province, district, isDemo = false) {
    const [teams, players, officials] = await Promise.all([(0, app_1.getDbRegisteredTeams)(isDemo), (0, app_1.getDbPlayers)('ALL', isDemo), (0, app_1.getDbOfficials)('ALL', isDemo)]);
    const areaTeams = teams.filter((team) => Boolean(team.isTest || team.is_test) === isDemo && !Boolean(team.is_deleted || team.isDeleted) &&
        (0, teamArea_1.normalizeProvince)(team.province) === province && (0, teamRegistrationRank_service_1.getRegistrationArea)(team).district === district &&
        String(team.categories || '').split(',').map((value) => value.trim().toUpperCase()).includes(category));
    if (!areaTeams.length)
        return [];
    areaTeams.forEach((team) => { team.teamPlayers = players.filter((player) => String(player.teamId || player.team_id || '') === String(team.id)); });
    const ids = areaTeams.map((team) => String(team.id));
    const events = await db_1.pool.query(`SELECT event_type, entity_type, entity_id, team_id, new_state, created_at FROM football_audit_log WHERE team_id = ANY($1::varchar[]) AND event_type IN ('TEAM_STATUS_CHANGED', 'PLAYER_DOCUMENT_STATUS_CHANGED') ORDER BY created_at ASC, id ASC`, [ids]);
    const ranks = (0, statusHelper_1.getCompletedApprovalRanks)(areaTeams.map((t) => ({ ...t, ...(0, teamRegistrationRank_service_1.getRegistrationArea)(t) })), category, events.rows || []);
    return areaTeams.filter((team) => ranks.has(String(team.id))).map((team) => {
        const roster = (team.teamPlayers || []).filter((player) => String(player.category || player.categories || 'U14').toUpperCase().split(',').map((value) => value.trim()).includes(category));
        const staff = officials.filter((official) => String(official.teamId || official.team_id || '') === String(team.id) && String(official.categories || 'U14').toUpperCase().split(',').map((value) => value.trim()).includes(category));
        return { id: String(team.id), name: String(team.teamName || team.team_name || team.school || 'ทีมไม่ระบุชื่อ'), rank: ranks.get(String(team.id)), managerName: String(team.managerName || team.manager_name || ''), playerCount: roster.length, officialCount: staff.length };
    }).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'th'));
}
function bracketContainsOnlyEligibleTeams(bracket, teams) {
    if (!bracket || !Array.isArray(bracket.rounds) || !bracket.rounds.every(round => Array.isArray(round)))
        return false;
    const eligibleIds = new Set(teams.map(team => String(team.id)));
    const bracketIds = [bracket.byeTeamId, ...bracket.rounds.flatMap(round => round.flatMap(match => match.teamIds))];
    return bracketIds.every(teamId => teamId === null || (typeof teamId === 'string' && eligibleIds.has(teamId)));
}
async function renderBracketPage(req, res, category, nav, isDemo = false) {
    const user = req.adminUser;
    const base = (0, app_1.getBaseUrl)(req);
    const teams = await (0, app_1.getDbRegisteredTeams)(isDemo);
    const areas = teams.filter((team) => Boolean(team.isTest || team.is_test) === isDemo && !Boolean(team.is_deleted || team.isDeleted) && (user.roleCode !== 'SAT_OFFICER' || team.province === user.province) && String(team.categories || '').split(',').map((value) => value.trim().toUpperCase()).includes(category)).map((team) => ({ province: (0, teamArea_1.normalizeProvince)(team.province), district: (0, teamRegistrationRank_service_1.getRegistrationArea)(team).district }));
    const provinces = Array.from(new Set(areas.map(area => area.province).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
    const apiRoot = `${base}/api/admin/${isDemo ? 'demo-brackets' : 'brackets'}`;
    const pageTitle = isDemo ? `ตารางแข่งขันระดับเขต/อำเภอ ${category} Demo` : `ตารางแข่งขันระดับเขต/อำเภอ ${category}`;
    const cfg = JSON.stringify({ category, provinces, areas, isDemo }).replace(/</g, '\\u003c');
    const content = `<style>
  .br-title{font-size:1.7rem;color:#092b53}.br-filter{background:#f1f6fc;border:1px solid #ccdae9}.br-board{display:flex;gap:1rem;overflow:auto;padding:1.5rem;background:linear-gradient(130deg,#071c39,#164879);border-radius:1rem;min-height:240px;color:white}.br-round{min-width:235px;flex:1;display:flex;flex-direction:column;justify-content:space-around;gap:1rem}.br-round h3{text-align:center;color:white;font-size:1.15rem}.br-match{padding:.6rem;background:#eff5fc;border:1px solid #aac1da;border-radius:.7rem;box-shadow:0 5px 18px #00152b66}.br-slot{min-height:52px;padding:.6rem;margin:.3rem 0;border:1px dashed #7995b3;background:white;border-radius:.45rem;color:#12375d;font-size:1.05rem;font-weight:700;display:flex;align-items:center}.br-slot[data-team]{border-style:solid;background:#eaf2fb;cursor:grab}.br-slot.drag-over{outline:3px solid #ffd166}.br-empty{font-weight:500;color:#62788f}.br-wait{padding:1.3rem;border-radius:.75rem;background:#f2f7fc;color:#092b53;font-size:1.2rem;font-weight:700}@media(max-width:700px){.br-title{font-size:1.4rem}.br-round{min-width:215px}.br-slot{font-size:1rem}}
  </style>
  <div class="card border-0 shadow-sm rounded-4 p-3 p-md-4"><div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3"><div><h1 class="br-title fw-bold mb-1">${pageTitle}</h1><p class="fs-5 text-secondary mb-0">เลือกจังหวัดและเขต/อำเภอเพื่อดูทีม${isDemo ? ' Demo' : ''}ที่ได้ดาวและผังการแข่งขัน</p></div><button id="brAction" class="btn btn-primary btn-lg fw-bold" disabled>จัดสายการแข่งขัน${isDemo ? ' Demo' : ''} รุ่น ${category}</button></div>
  <div class="br-filter p-3 rounded-3 mb-3"><div class="row g-3"><div class="col-md-5"><label class="form-label fw-bold fs-5" for="brProvince">จังหวัด</label><select id="brProvince" class="form-select form-select-lg"><option value="">เลือกจังหวัด</option></select></div><div class="col-md-5"><label class="form-label fw-bold fs-5" for="brDistrict">เขต / อำเภอ</label><select id="brDistrict" class="form-select form-select-lg" disabled><option value="">เลือกจังหวัดก่อน</option></select></div><div class="col-md-2 d-flex align-items-end"><strong id="brCount" class="fs-5"></strong></div></div></div>
  <div id="brNotice" class="alert alert-info fs-5">เลือกจังหวัดและเขต/อำเภอก่อนเพื่อแสดงผัง</div><div id="brBoard" class="br-board d-none"></div></div>
  <div class="modal fade" id="brTeamModal" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><div class="modal-content rounded-4"><div class="modal-header bg-navy text-white"><h2 id="brModalTitle" class="modal-title fs-4"></h2><button class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="ปิด"></button></div><div class="modal-body fs-5"><p>ผู้จัดการทีม: <strong id="brManager"></strong></p><p>นักกีฬา: <strong id="brPlayers"></strong> คน</p><p class="mb-0">เจ้าหน้าที่: <strong id="brOfficials"></strong> คน</p></div></div></div></div></div>
  <script type="application/json" id="brCfg">${cfg}</script><script>
  (()=>{const cfg=JSON.parse(document.getElementById('brCfg').textContent),p=document.getElementById('brProvince'),d=document.getElementById('brDistrict'),btn=document.getElementById('brAction'),board=document.getElementById('brBoard'),notice=document.getElementById('brNotice'),count=document.getElementById('brCount');const esc=s=>String(s||'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));let teams=[],saved=null,lock=false;cfg.provinces.forEach(x=>p.add(new Option(x,x)));function params(){return new URLSearchParams({category:cfg.category,province:p.value,district:d.value})}async function call(url,opt){const r=await fetch(url,opt),j=await r.json();if(!r.ok||!j.success)throw Error(j.error||'ดำเนินการไม่สำเร็จ');return j}function setLock(v){lock=v;btn.disabled=v||!p.value||!d.value}function showError(e){notice.className='alert alert-danger fs-5';notice.textContent=e.message}function team(id){return teams.find(t=>t.id===id)}function openTeam(t){document.getElementById('brModalTitle').textContent=t.name;document.getElementById('brManager').textContent=t.managerName||'ไม่ระบุ';document.getElementById('brPlayers').textContent=t.playerCount;document.getElementById('brOfficials').textContent=t.officialCount;bootstrap.Modal.getOrCreateInstance(document.getElementById('brTeamModal')).show()}function render(){btn.textContent=saved?'ล้างข้อมูลผังการแข่งขัน':'จัดสายการแข่งขัน รุ่น '+cfg.category;board.innerHTML='';board.classList.add('d-none');if(!saved){notice.className='alert alert-info fs-5';notice.textContent=teams.length?\`พบทีมได้ดาว \${teams.length} ทีม กดจัดสายเพื่อสุ่มจับคู่\`:'ไม่พบทีมที่ได้ดาวในพื้นที่นี้';return}notice.className='alert alert-info fs-5';notice.textContent=teams.length===1?'มีทีมเดียว รอคู่แข่ง':\`จัดสายแล้ว \${teams.length} ทีม · คลิกดูรายละเอียด · ลากสลับได้เฉพาะรอบแรก\`;const bye=team(saved.byeTeamId);if(bye)notice.textContent+=' · ทีมอันดับ 1 '+bye.name+' ได้บายรอบแรก';if(!saved.rounds.length){board.innerHTML=\`<div class="br-wait">\${esc(team(saved.byeTeamId)?.name||'ทีม')} · รอคู่แข่ง</div>\`;board.classList.remove('d-none');return}saved.rounds.forEach((round,r)=>{const col=document.createElement('div');col.className='br-round';col.innerHTML=\`<h3>\${r===0?(saved.rounds.length===1?'รอบชิงชนะเลิศ':'รอบแรก'):(r===saved.rounds.length-1?'รอบชิงชนะเลิศ':'รอบรองชนะเลิศ')}</h3>\`;round.forEach((match,i)=>{const box=document.createElement('div');box.className='br-match';match.teamIds.forEach((id,side)=>{const t=team(id),slot=document.createElement('div');slot.className='br-slot'+(t?'':' br-empty');slot.dataset.match=i;slot.dataset.side=side;if(t){slot.dataset.team=t.id;slot.draggable=r===0;slot.textContent=t.name;slot.addEventListener('click',()=>openTeam(t));slot.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',t.id))}else slot.textContent=r===0?'ช่องว่าง':'ผู้ชนะจากรอบก่อน';slot.addEventListener('dragover',e=>{if(r===0){e.preventDefault();slot.classList.add('drag-over')}});slot.addEventListener('dragleave',()=>slot.classList.remove('drag-over'));slot.addEventListener('drop',async e=>{if(r!==0)return;e.preventDefault();slot.classList.remove('drag-over');try{setLock(true);const z=await call('${apiRoot}/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:cfg.category,province:p.value,district:d.value,sourceTeamId:e.dataTransfer.getData('text/plain'),targetMatchIndex:i,targetSide:side})});saved=z.bracket;render()}catch(err){showError(err)}finally{setLock(false)}});box.appendChild(slot)});col.appendChild(box)});board.appendChild(col)});board.classList.remove('d-none')}async function load(){saved=null;teams=[];count.textContent='';board.classList.add('d-none');if(!p.value||!d.value){notice.textContent='เลือกจังหวัดและเขต/อำเภอก่อนเพื่อแสดงผัง';setLock(false);return}setLock(true);notice.textContent='กำลังโหลดข้อมูลทีม...';try{const z=await call('${apiRoot}/data?'+params());teams=z.teams;saved=z.bracket;count.textContent=\`\${teams.length} ทีม\`;render()}catch(e){showError(e)}finally{setLock(false)}}p.addEventListener('change',()=>{d.replaceChildren(new Option('เลือกเขต/อำเภอ',''));d.disabled=!p.value;if(p.value)Array.from(new Set(cfg.areas.filter(a=>a.province===p.value).map(a=>a.district).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'th')).forEach(x=>d.add(new Option(window.PmycTeamArea.normalizeDistrictName(x,p.value),x)));load()});d.addEventListener('change',load);btn.addEventListener('click',async()=>{if(lock)return;try{setLock(true);if(saved){if(!confirm('ยืนยันล้างข้อมูลผังการแข่งขันของพื้นที่นี้?'))return;await call('${apiRoot}/clear',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:cfg.category,province:p.value,district:d.value})});saved=null}else{const z=await call('${apiRoot}/draw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:cfg.category,province:p.value,district:d.value})});saved=z.bracket}render()}catch(e){showError(e)}finally{setLock(false)}})})();</script>`;
    res.send((0, adminLayout_1.renderAdminLayout)(pageTitle, content, nav, base, user));
}
for (const category of bracketCategories) {
    const categorySlug = category.toLowerCase();
    const nav = `bracket-${categorySlug}`;
    router.get(`/admin/bracket-${categorySlug}.php`, adminSession_service_1.checkAdminSession, async (req, res) => renderBracketPage(req, res, category, nav));
    const demoNav = `bracket-demo-${categorySlug}`;
    router.get(`/admin/bracket-demo-${categorySlug}.php`, adminSession_service_1.checkAdminSession, async (req, res) => {
        const user = req.adminUser;
        if (!canAccessDemoModule(user))
            return res.sendStatus(403);
        if (user.roleCode === 'SAT_OFFICER' && !String(user.province || '').trim())
            return res.status(403).send('ไม่พบจังหวัดในบัญชี กกท.');
        return renderBracketPage(req, res, category, demoNav, true);
    });
}
const registerBracketApiRoutes = (apiRoot, isDemo) => {
    router.get(`${apiRoot}/data`, adminSession_service_1.checkAdminSession, async (req, res) => {
        const area = validateBracketArea(req, res, req.query.category, req.query.province, req.query.district, isDemo);
        if (!area)
            return;
        const teams = await findBracketTeams(area.category, area.province, area.district, isDemo);
        const storageArea = await getBracketStorageArea(area, isDemo, res);
        if (!storageArea)
            return;
        const result = await db_1.pool.query('SELECT bracket FROM football_competition_bracket WHERE category = $1 AND province = $2 AND district = $3', [area.category, storageArea.province, storageArea.district]);
        const bracket = result.rows[0]?.bracket || null;
        if (isDemo && bracket && !bracketContainsOnlyEligibleTeams(bracket, teams)) {
            return res.status(409).json({ success: false, error: 'ผัง Demo มีทีมที่ไม่อยู่ในชุด Demo ที่เข้าเกณฑ์' });
        }
        return res.json({ success: true, teams, bracket });
    });
    router.post(`${apiRoot}/draw`, adminSession_service_1.checkAdminSession, async (req, res) => {
        const area = validateBracketArea(req, res, req.body?.category, req.body?.province, req.body?.district, isDemo);
        if (!area)
            return;
        const teams = await findBracketTeams(area.category, area.province, area.district, isDemo);
        if (!teams.length)
            return res.status(400).json({ success: false, error: 'ไม่พบทีมที่ได้ดาวในพื้นที่นี้' });
        const bracket = (0, bracketHelper_1.createBracketPlan)(teams.map((team) => ({ id: team.id, name: team.name, rank: team.rank })));
        const actor = area.user?.username || 'admin';
        const storageArea = await getBracketStorageArea(area, isDemo, res);
        if (!storageArea)
            return;
        const result = await (0, dbTransaction_service_1.withDbTransaction)(async (client) => {
            const inserted = await client.query('INSERT INTO football_competition_bracket (category, province, district, bracket, created_by, updated_by) VALUES ($1, $2, $3, $4::jsonb, $5, $5) ON CONFLICT (category, province, district) DO NOTHING RETURNING bracket', [area.category, storageArea.province, storageArea.district, JSON.stringify(bracket), actor]);
            if (!inserted.rows.length)
                return { created: false, bracket: null };
            await (0, auditLog_service_1.writeAuditLog)(req, {
                eventType: 'BRACKET_CREATED', entityType: 'BRACKET', entityId: bracketAuditId(area.category, area.province, area.district, isDemo), teamId: null,
                oldState: { exists: false }, newState: { exists: true },
                metadata: { category: area.category, province: area.province, district: area.district, teamCount: String(teams.length), ...(isDemo ? { demo: true } : {}) }
            }, client);
            return { created: true, bracket: inserted.rows[0].bracket };
        });
        if (!result.created)
            return res.status(409).json({ success: false, error: 'มีผังการแข่งขันแล้ว กรุณาล้างข้อมูลก่อนสุ่มใหม่' });
        return res.json({ success: true, bracket: result.bracket });
    });
    router.post(`${apiRoot}/clear`, adminSession_service_1.checkAdminSession, async (req, res) => {
        const area = validateBracketArea(req, res, req.body?.category, req.body?.province, req.body?.district, isDemo);
        if (!area)
            return;
        const storageArea = await getBracketStorageArea(area, isDemo, res);
        if (!storageArea)
            return;
        await (0, dbTransaction_service_1.withDbTransaction)(async (client) => {
            const removed = await client.query('DELETE FROM football_competition_bracket WHERE category = $1 AND province = $2 AND district = $3 RETURNING category', [area.category, storageArea.province, storageArea.district]);
            if (removed.rowCount) {
                await (0, auditLog_service_1.writeAuditLog)(req, {
                    eventType: 'BRACKET_CLEARED', entityType: 'BRACKET', entityId: bracketAuditId(area.category, area.province, area.district, isDemo), teamId: null,
                    oldState: { exists: true }, newState: { exists: false },
                    metadata: { category: area.category, province: area.province, district: area.district, ...(isDemo ? { demo: true } : {}) }
                }, client);
            }
        });
        return res.json({ success: true });
    });
    router.post(`${apiRoot}/move`, adminSession_service_1.checkAdminSession, async (req, res) => {
        const area = validateBracketArea(req, res, req.body?.category, req.body?.province, req.body?.district, isDemo);
        if (!area)
            return;
        const { sourceTeamId, targetMatchIndex, targetSide } = req.body || {};
        if (typeof sourceTeamId !== 'string' || !Number.isInteger(targetMatchIndex) || ![0, 1].includes(targetSide))
            return res.status(400).json({ success: false, error: 'ตำแหน่งทีมไม่ถูกต้อง' });
        const storageArea = await getBracketStorageArea(area, isDemo, res);
        if (!storageArea)
            return;
        const client = await db_1.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query('SELECT bracket FROM football_competition_bracket WHERE category = $1 AND province = $2 AND district = $3 FOR UPDATE', [area.category, storageArea.province, storageArea.district]);
            if (!result.rows.length) {
                await client.query('ROLLBACK');
                return res.status(404).json({ success: false, error: 'ยังไม่มีผังการแข่งขัน' });
            }
            const current = result.rows[0].bracket;
            if (isDemo) {
                const eligibleTeams = await findBracketTeams(area.category, area.province, area.district, true);
                if (!bracketContainsOnlyEligibleTeams(current, eligibleTeams)) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({ success: false, error: 'ผัง Demo มีทีมที่ไม่อยู่ในชุด Demo ที่เข้าเกณฑ์' });
                }
            }
            const next = (0, bracketHelper_1.moveFirstRoundTeam)(current, sourceTeamId, targetMatchIndex, targetSide);
            if (next === current) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, error: 'ย้ายทีมได้เฉพาะช่องรอบแรก และทีมต้องอยู่ในผัง' });
            }
            const saved = await client.query('UPDATE football_competition_bracket SET bracket = $1::jsonb, updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE category = $3 AND province = $4 AND district = $5 RETURNING bracket', [JSON.stringify(next), area.user?.username || 'admin', area.category, storageArea.province, storageArea.district]);
            await (0, auditLog_service_1.writeAuditLog)(req, {
                eventType: 'BRACKET_TEAM_MOVED', entityType: 'BRACKET', entityId: bracketAuditId(area.category, area.province, area.district, isDemo), teamId: null,
                oldState: { changed: true }, newState: { changed: true },
                metadata: { category: area.category, province: area.province, district: area.district, sourceTeamId, targetMatchIndex: String(targetMatchIndex), targetSide: String(targetSide), ...(isDemo ? { demo: true } : {}) }
            }, client);
            await client.query('COMMIT');
            return res.json({ success: true, bracket: saved.rows[0].bracket });
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    });
};
registerBracketApiRoutes('/api/admin/brackets', false);
registerBracketApiRoutes('/api/admin/demo-brackets', true);
// Admin Soft Delete Team API (/api/admin/teams/delete)
router.post('/api/admin/teams/delete', adminSession_service_1.checkAdminSession, async (req, res) => {
    try {
        const { id, isDemo: isDemoRequest } = req.body || {};
        const currentUser = req.adminUser;
        if (isDemoRequest === true && currentUser?.roleCode !== 'SUPER_ADMIN') {
            return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์ลบข้อมูล Demo' });
        }
        if (!id) {
            return res.status(400).json({ success: false, error: 'กรุณาระบุรหัสทีม' });
        }
        if (isDemoRequest === true) {
            const demoTeam = await db_1.pool.query('SELECT id FROM football_registered_team WHERE id::text = $1 AND COALESCE(is_test, FALSE) = TRUE', [String(id)]);
            if (!demoTeam.rows.length)
                return res.status(404).json({ success: false, error: 'ไม่พบทีม Demo นี้' });
        }
        let dbChanged = false;
        try {
            const result = await db_1.pool.query(`UPDATE football_registered_team SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND COALESCE(is_deleted, FALSE) = FALSE AND COALESCE(is_test, FALSE) = ${isDemoRequest === true ? 'TRUE' : 'FALSE'}`, [id]);
            dbChanged = Boolean(result.rowCount);
        }
        catch (e) {
            if (isDemoRequest === true)
                throw e;
            console.warn('DB update team soft delete warning:', e);
        }
        if (dbChanged)
            await (0, auditLog_service_1.writeAuditLog)(req, {
                eventType: 'TEAM_DELETED', entityType: 'TEAM', entityId: String(id), teamId: String(id),
                oldState: { isDeleted: false }, newState: { isDeleted: true }, metadata: { deletionMode: 'SOFT' }
            });
        let memTeam = app_1.teamsDatabase.find((t) => String(t.id).trim() === String(id).trim());
        if (memTeam && Boolean(memTeam.isTest || memTeam.is_test) !== (isDemoRequest === true)) {
            return res.status(404).json({ success: false, error: 'ไม่พบทีมในขอบเขตข้อมูลที่ร้องขอ' });
        }
        if (!memTeam) {
            memTeam = { id, is_deleted: true, deleted_at: new Date().toISOString() };
            app_1.teamsDatabase.push(memTeam);
        }
        else {
            memTeam.is_deleted = true;
            memTeam.deleted_at = new Date().toISOString();
        }
        return res.json({ success: true, message: 'ลบทีมเรียบร้อยแล้ว' });
    }
    catch (err) {
        console.error('Error in soft delete team API:', err);
        return res.status(500).json({ success: false, error: err?.message || 'เกิดข้อผิดพลาดในการลบทีม' });
    }
});
// Admin Restore Team API (/api/admin/teams/restore)
router.post('/api/admin/teams/restore', adminSession_service_1.checkAdminSession, async (req, res) => {
    try {
        const { id, isDemo: isDemoRequest } = req.body || {};
        const currentUser = req.adminUser;
        if (isDemoRequest === true && currentUser?.roleCode !== 'SUPER_ADMIN') {
            return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์กู้คืนข้อมูล Demo' });
        }
        if (!id) {
            return res.status(400).json({ success: false, error: 'กรุณาระบุรหัสทีม' });
        }
        let dbChanged = false;
        try {
            const result = await db_1.pool.query(`UPDATE football_registered_team SET is_deleted = FALSE, deleted_at = NULL WHERE id = $1 AND is_deleted = TRUE AND COALESCE(is_test, FALSE) = ${isDemoRequest === true ? 'TRUE' : 'FALSE'}`, [id]);
            dbChanged = Boolean(result.rowCount);
        }
        catch (e) {
            if (isDemoRequest === true)
                throw e;
            console.warn('DB update team restore warning:', e);
        }
        if (dbChanged)
            await (0, auditLog_service_1.writeAuditLog)(req, {
                eventType: 'TEAM_RESTORED', entityType: 'TEAM', entityId: String(id), teamId: String(id),
                oldState: { isDeleted: true }, newState: { isDeleted: false }
            });
        let memTeam = app_1.teamsDatabase.find((t) => String(t.id).trim() === String(id).trim());
        if (memTeam && Boolean(memTeam.isTest || memTeam.is_test) !== (isDemoRequest === true)) {
            return res.status(404).json({ success: false, error: 'ไม่พบทีมในขอบเขตข้อมูลที่ร้องขอ' });
        }
        if (!memTeam) {
            memTeam = { id, is_deleted: false, deleted_at: null };
            app_1.teamsDatabase.push(memTeam);
        }
        else {
            memTeam.is_deleted = false;
            memTeam.deleted_at = null;
        }
        return res.json({ success: true, message: 'กู้คืนทีมเรียบร้อยแล้ว' });
    }
    catch (err) {
        console.error('Error in restore team API:', err);
        return res.status(500).json({ success: false, error: err?.message || 'เกิดข้อผิดพลาดในการกู้คืนทีม' });
    }
});
// Admin Permanent Delete Team API (/api/admin/teams/permanent-delete)
router.post('/api/admin/teams/permanent-delete', adminSession_service_1.checkAdminSession, async (req, res) => {
    const currentUser = req.adminUser;
    const isSatOfficer = currentUser?.roleCode === 'SAT_OFFICER';
    const satProvince = String(currentUser?.province || '').trim();
    if (currentUser?.roleCode !== 'SUPER_ADMIN' && !isSatOfficer) {
        return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์ลบทีมถาวร' });
    }
    if (isSatOfficer && !satProvince) {
        return res.status(403).json({ success: false, error: 'ไม่พบจังหวัดในบัญชี กกท.' });
    }
    let client;
    const filesToDelete = new Set();
    try {
        const { id } = req.body || {};
        if (!id) {
            return res.status(400).json({ success: false, error: 'กรุณาระบุรหัสทีม' });
        }
        const teamIdStr = String(id).trim();
        client = await db_1.pool.connect();
        await client.query('BEGIN');
        const teamResult = await client.query('SELECT province, doc_team_cert, doc_roster FROM football_registered_team WHERE id = $1 AND is_deleted = TRUE FOR UPDATE', [teamIdStr]);
        if (teamResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'ไม่พบทีมที่ถูกลบชั่วคราว หรือทีมนี้ถูกกู้คืนแล้ว' });
        }
        if (isSatOfficer && String(teamResult.rows[0].province || '').trim().toLowerCase() !== satProvince.toLowerCase()) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'ไม่พบทีมที่ถูกลบชั่วคราว หรือทีมนี้ถูกกู้คืนแล้ว' });
        }
        const addFiles = (row, columns) => {
            columns.forEach(column => {
                const filePath = row[column];
                if (typeof filePath === 'string' && filePath.trim())
                    filesToDelete.add(filePath);
            });
        };
        addFiles(teamResult.rows[0], ['doc_team_cert', 'doc_roster']);
        const playerFiles = await client.query('SELECT photo_url, doc_id_card, doc_school_cert FROM football_player WHERE team_id = $1', [teamIdStr]);
        playerFiles.rows.forEach((row) => addFiles(row, ['photo_url', 'doc_id_card', 'doc_school_cert']));
        const officialFiles = await client.query('SELECT photo_url, doc_id_card FROM football_official WHERE team_id = $1', [teamIdStr]);
        officialFiles.rows.forEach((row) => addFiles(row, ['photo_url', 'doc_id_card']));
        await client.query('DELETE FROM football_player WHERE team_id = $1', [teamIdStr]);
        await client.query('DELETE FROM football_official WHERE team_id = $1', [teamIdStr]);
        const deletedTeam = await client.query('DELETE FROM football_registered_team WHERE id = $1 AND is_deleted = TRUE RETURNING id', [teamIdStr]);
        if (deletedTeam.rows.length !== 1)
            throw new Error('Expected to delete exactly one soft-deleted team');
        await (0, auditLog_service_1.writeAuditLog)(req, {
            eventType: 'TEAM_DELETED', entityType: 'TEAM', entityId: teamIdStr, teamId: teamIdStr,
            oldState: { isDeleted: true }, newState: { isDeleted: null },
            metadata: { deletionMode: 'PERMANENT_CASCADE' }
        }, client);
        await client.query('COMMIT');
        // Remove from Memory Databases
        const teamIdx = app_1.teamsDatabase.findIndex((t) => String(t.id).trim() === teamIdStr);
        if (teamIdx >= 0) {
            app_1.teamsDatabase.splice(teamIdx, 1);
        }
        for (let i = app_1.playersDatabase.length - 1; i >= 0; i--) {
            if (String(app_1.playersDatabase[i].teamId || app_1.playersDatabase[i].team_id).trim() === teamIdStr) {
                app_1.playersDatabase.splice(i, 1);
            }
        }
        for (let i = app_1.officialsDatabase.length - 1; i >= 0; i--) {
            if (String(app_1.officialsDatabase[i].teamId || app_1.officialsDatabase[i].team_id).trim() === teamIdStr) {
                app_1.officialsDatabase.splice(i, 1);
            }
        }
        const cleanupErrors = [];
        const uploadsDir = path_1.default.join(process.cwd(), 'uploads');
        for (const relPath of filesToDelete) {
            const fullPath = path_1.default.join(uploadsDir, path_1.default.basename(relPath));
            try {
                if (fs_1.default.existsSync(fullPath))
                    fs_1.default.unlinkSync(fullPath);
            }
            catch (cleanupError) {
                cleanupErrors.push(cleanupError);
                console.error('Uploaded file cleanup failed after permanent team deletion:', cleanupError);
            }
        }
        const warning = cleanupErrors.length > 0
            ? `ลบข้อมูลทีม นักกีฬา และเจ้าหน้าที่จากฐานข้อมูลแล้ว แต่ลบไฟล์แนบไม่สำเร็จ ${cleanupErrors.length} รายการ`
            : undefined;
        return res.json({
            success: true,
            message: 'ลบข้อมูลทีม นักกีฬา และเจ้าหน้าที่ถาวรเรียบร้อยแล้ว',
            ...(warning ? { warning } : {})
        });
    }
    catch (err) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            }
            catch (rollbackError) {
                console.error('Database rollback failed during permanent team deletion:', rollbackError);
            }
        }
        console.error('Error in permanent delete team transaction:', err);
        return res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการลบข้อมูลทีม กรุณาลองใหม่ภายหลัง' });
    }
    finally {
        if (client)
            client.release();
    }
});
// Admin Players Full Page View (/admin/players.php)
router.get('/admin/players.php', adminSession_service_1.checkAdminSession, async (req, res) => {
    const base = (0, app_1.getBaseUrl)(req);
    const selectedCatTab = (req.query.category || 'ALL').toUpperCase();
    const currentUser = req.adminUser || {
        id: 'ADM-001',
        username: 'admin',
        fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)',
        roleCode: 'SUPER_ADMIN',
        roleName: 'ผู้ดูแลระบบสูงสุด',
        permissions: ['teams:read', 'teams:verify', 'users:manage', 'system:all']
    };
    const isSatOfficer = currentUser.roleCode === 'SAT_OFFICER';
    const satProvince = currentUser.province || '';
    const allTeams = await (0, app_1.getDbRegisteredTeams)();
    const allPlayers = await (0, app_1.getDbPlayers)();
    // Scope teams and players for SAT Officer
    const scopedTeams = isSatOfficer
        ? allTeams.filter(t => t.province === satProvince)
        : allTeams;
    const scopedTeamIds = new Set(scopedTeams.map(t => t.id));
    const playersList = isSatOfficer
        ? allPlayers.filter(p => scopedTeamIds.has(p.teamId))
        : allPlayers;
    // Calculate athlete counts per category for Tab Badge Numbers
    const totalCount = playersList.length;
    const u14Count = playersList.filter(p => (p.category || p.categories || 'U14').toUpperCase().split(',').map((c) => c.trim()).includes('U14')).length;
    const u16Count = playersList.filter(p => (p.category || p.categories || 'U14').toUpperCase().split(',').map((c) => c.trim()).includes('U16')).length;
    const u18Count = playersList.filter(p => (p.category || p.categories || 'U14').toUpperCase().split(',').map((c) => c.trim()).includes('U18')).length;
    const allProvinces = Array.from(new Set(scopedTeams.map(t => t.province).filter(Boolean))).sort();
    const allSchools = Array.from(new Set(scopedTeams.map(t => t.teamName).filter(Boolean))).sort();
    const bodyContent = `
  <div class="card p-4 shadow-sm border-0 rounded-4 bg-white mb-4">
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
      <div>
        <h4 class="fw-bold text-navy mb-1"><i class="bi bi-person-badge me-2"></i> รายการนักกีฬา (Athletes Roster)</h4>
        <p class="text-muted small mb-0">แสดงรายชื่อนักกีฬาทั้งหมด แยกตามรุ่นอายุการแข่งขันและสังกัดทีม</p>
      </div>
      <span class="badge bg-navy px-3 py-2 fs-6"><i class="bi bi-person-circle me-1"></i> ${currentUser.fullname}</span>
    </div>

    <!-- Category Tabs with Athlete Counts in Parentheses -->
    <ul class="nav nav-pills mb-4 gap-2 bg-light p-2 rounded-3">
      <li class="nav-item">
        <a class="nav-link ${selectedCatTab === 'ALL' ? 'active bg-navy' : 'text-dark'} fw-bold" href="${base}/admin/players.php?category=ALL">
          <i class="bi bi-grid-fill me-1"></i> ทั้งหมด (${totalCount})
        </a>
      </li>
      <li class="nav-item">
        <a class="nav-link ${selectedCatTab === 'U14' ? 'active bg-info text-dark' : 'text-dark'} fw-bold" href="${base}/admin/players.php?category=U14">
          <i class="bi bi-award-fill me-1"></i> รุ่น U14 (${u14Count})
        </a>
      </li>
      <li class="nav-item">
        <a class="nav-link ${selectedCatTab === 'U16' ? 'active bg-primary' : 'text-dark'} fw-bold" href="${base}/admin/players.php?category=U16">
          <i class="bi bi-award-fill me-1"></i> รุ่น U16 (${u16Count})
        </a>
      </li>
      <li class="nav-item">
        <a class="nav-link ${selectedCatTab === 'U18' ? 'active bg-danger' : 'text-dark'} fw-bold" href="${base}/admin/players.php?category=U18">
          <i class="bi bi-award-fill me-1"></i> รุ่น U18 (${u18Count})
        </a>
      </li>
    </ul>

    <!-- Filters Bar -->
    <div class="card bg-light border-0 rounded-3 p-3 mb-4">
      <div class="row g-2 align-items-end">
        <div class="col-md-3">
          <label class="form-label small fw-bold text-navy mb-1"><i class="bi bi-search me-1"></i> ค้นหานักกีฬา / เลขบัตร</label>
          <input type="text" id="filterPlayerSearch" class="form-control form-control-sm rounded-3" placeholder="พิมพ์ชื่อนักกีฬา หรือเลขบัตร...">
        </div>
        <div class="col-md-3">
          <label class="form-label small fw-bold text-navy mb-1"><i class="bi bi-building me-1"></i> โรงเรียน / สังกัดทีม</label>
          <select id="filterPlayerSchool" class="form-select form-select-sm rounded-3">
            <option value="">-- ทั้งหมดทุกสังกัด --</option>
            ${allSchools.map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label small fw-bold text-navy mb-1"><i class="bi bi-geo-alt me-1"></i> จังหวัด</label>
          <select id="filterPlayerProvince" class="form-select form-select-sm rounded-3" ${isSatOfficer ? 'disabled' : ''}>
            ${isSatOfficer
        ? `<option value="${satProvince}" selected>${satProvince} (กกท. ประจำจังหวัด)</option>`
        : `<option value="">-- ทั้งหมดทุกจังหวัด --</option>` + allProvinces.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label small fw-bold text-navy mb-1"><i class="bi bi-map me-1"></i> เขต / อำเภอ</label>
          <select id="filterPlayerDistrict" class="form-select form-select-sm rounded-3">
            <option value="">-- ทั้งหมดทุกเขต/อำเภอ --</option>
          </select>
        </div>
        <div class="col-md-2">
          <button type="button" class="btn btn-sm btn-outline-secondary w-100 rounded-3 py-1" onclick="resetPlayerFilters()" title="ล้างตัวกรองทั้งหมด">
            <i class="bi bi-arrow-counterclockwise me-1"></i> ล้างตัวกรอง
          </button>
        </div>
      </div>
    </div>

    <!-- Data Table -->
    <div class="table-responsive">
      <table class="table table-hover align-middle border" id="playersDataTable">
        <thead class="table-dark">
          <tr>
            <th style="width: 50px;" class="text-center cursor-pointer" onclick="sortPlayersTable(0)"># <i class="bi bi-arrow-down-up small"></i></th>
            <th style="width: 70px;" class="text-center">รูปถ่าย</th>
            <th class="cursor-pointer" onclick="sortPlayersTable(2)">ชื่อ - นามสกุล <i class="bi bi-arrow-down-up small"></i></th>
            <th class="cursor-pointer text-center" onclick="sortPlayersTable(3)">หมายเลขเสื้อ <i class="bi bi-arrow-down-up small"></i></th>
            <th class="cursor-pointer" onclick="sortPlayersTable(4)">ตำแหน่ง <i class="bi bi-arrow-down-up small"></i></th>
            <th class="cursor-pointer text-center" onclick="sortPlayersTable(5)">รุ่นอายุ <i class="bi bi-arrow-down-up small"></i></th>
            <th class="cursor-pointer" onclick="sortPlayersTable(6)">สังกัดทีม / โรงเรียน <i class="bi bi-arrow-down-up small"></i></th>
            <th class="cursor-pointer" onclick="sortPlayersTable(7)">จังหวัด <i class="bi bi-arrow-down-up small"></i></th>
            <th class="text-center">สถานะนักกีฬา</th>
            <th class="text-center" style="width: 130px;">การจัดการ</th>
          </tr>
        </thead>
        <tbody id="playersTableBody">
          <!-- Populated by Client-side Filtering & Sorting -->
        </tbody>
      </table>
    </div>
    <!-- Pagination & Record Info Controls -->
    <div class="d-flex flex-wrap justify-content-between align-items-center mt-3 pt-3 border-top gap-2" id="playersPaginationContainer">
      <!-- Populated dynamically by JS -->
    </div>
  </div>

  ${(0, playerVerification_1.renderPlayerVerificationModal)()}

  <script>
    window.rawPlayersData = ${JSON.stringify(playersList)};
    window.rawTeamsMap = ${JSON.stringify(scopedTeams.reduce((acc, t) => { acc[t.id] = t; return acc; }, {}))};
    window.selectedCatTab = ${JSON.stringify(selectedCatTab)};
    window.isSatOfficer = ${isSatOfficer};
    window.satProvince = ${JSON.stringify(satProvince)};
    window.baseUrl = ${JSON.stringify(base)};
    window.sortDirection = {};
    window.currentPlayerPage = 1;
    window.playerPageSize = 50;

    function getPlayerSubmissionState(player, teamObj) {
      const categories = String(player.category || player.categories || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
      const submitted = new Set(String(teamObj.submitted_categories || teamObj.submittedCategories || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean));
      const missing = categories.filter(category => !submitted.has(category));
      return { submitted: categories.length > 0 && missing.length === 0, missing };
    }

    function changePlayerPage(newPage) {
      window.currentPlayerPage = newPage;
      renderPlayersTable();
    }

    function renderPlayersTable() {
      const searchEl = document.getElementById('filterPlayerSearch');
      const search = searchEl ? (searchEl.value || '').toLowerCase() : '';
      const schoolEl = document.getElementById('filterPlayerSchool');
      const school = schoolEl ? schoolEl.value : '';
      const provEl = document.getElementById('filterPlayerProvince');
      const prov = window.isSatOfficer ? window.satProvince : (provEl ? provEl.value : '');
      const distEl = document.getElementById('filterPlayerDistrict');
      const dist = distEl ? distEl.value : '';

      let filtered = window.rawPlayersData.filter(p => {
        const teamObj = window.rawTeamsMap[p.teamId] || {};
        const pCatList = (p.category || p.categories || 'U14').toUpperCase().split(',').map(c => c.trim());
        
        if (window.selectedCatTab !== 'ALL' && !pCatList.includes(window.selectedCatTab)) return false;
        if (school && (teamObj.teamName || p.school) !== school) return false;
        if (prov && teamObj.province !== prov) return false;
        if (dist && window.PmycTeamArea.getTeamDistrictName(teamObj) !== dist) return false;
        if (search) {
          const matchName = (p.name || '').toLowerCase().includes(search);
          const matchCard = (p.idCard || '').toLowerCase().includes(search);
          if (!matchName && !matchCard) return false;
        }
        return true;
      });

      const totalItems = filtered.length;
      const pageSize = window.playerPageSize || 50;
      const totalPages = Math.ceil(totalItems / pageSize) || 1;
      if (window.currentPlayerPage > totalPages) window.currentPlayerPage = totalPages;
      if (window.currentPlayerPage < 1) window.currentPlayerPage = 1;

      const startIdx = (window.currentPlayerPage - 1) * pageSize;
      const paginated = filtered.slice(startIdx, startIdx + pageSize);

      const tbody = document.getElementById('playersTableBody');
      const pagContainer = document.getElementById('playersPaginationContainer');

      if (!tbody) return;
      if (totalItems === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4"><i class="bi bi-inbox me-1"></i> ไม่พบข้อมูลนักกีฬาตรงตามเงื่อนไขที่เลือก</td></tr>';
        if (pagContainer) pagContainer.innerHTML = '';
        return;
      }

      tbody.innerHTML = paginated.map((p, idx) => {
        const rowNum = startIdx + idx + 1;
        const teamObj = window.rawTeamsMap[p.teamId] || {};
        let pCatList = String(p.category || p.categories || 'U14').split(',').map(c => c.trim()).filter(Boolean);
        if (window.selectedCatTab !== 'ALL') {
          pCatList = pCatList.filter(c => c.toUpperCase() === window.selectedCatTab);
        }
        const catBadgeHtml = pCatList.map(c => {
          const bg = c === 'U14' ? 'bg-info text-dark' : (c === 'U16' ? 'bg-primary' : 'bg-danger');
          return '<span class="badge ' + bg + ' me-1">' + c + '</span>';
        }).join('');

        const photoHtml = p.photoUrl 
          ? '<img src="' + window.baseUrl + p.photoUrl + '" width="40" height="40" class="rounded-circle object-fit-cover border shadow-sm cursor-pointer" onclick="viewPhoto(\\\'' + (p.name || '') + '\\\', \\\'' + window.baseUrl + p.photoUrl + '\\\')">'
          : '<span class="badge bg-secondary">ไม่มีรูป</span>';

        const submission = getPlayerSubmissionState(p, teamObj);
        let statusBadgeHtml = '<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-hourglass-split me-1"></i> รอตรวจสอบ</span>';
        if (!submission.submitted) {
          statusBadgeHtml = '<span class="badge bg-secondary text-white px-3 py-2" title="ยังไม่ส่งรายชื่อรุ่น ' + submission.missing.join(', ') + '"><i class="bi bi-dash-circle me-1"></i> ยังไม่ส่งรายชื่อ</span>';
        } else if (p.docStatus === 'APPROVED') {
          statusBadgeHtml = '<span class="badge bg-success px-3 py-2"><i class="bi bi-check-circle me-1"></i> ครบถ้วน</span>';
        } else if (p.docStatus === 'CORRECTED') {
          statusBadgeHtml = '<span class="badge bg-info text-dark px-3 py-2"><i class="bi bi-pencil-square me-1"></i> แก้ไขข้อมูลเรียบร้อย</span>';
        } else if (p.docStatus !== 'PENDING' && p.docStatus !== 'APPROVED' && p.docStatus !== 'CORRECTED' && (p.docStatus === 'ACTION_REQUIRED' || p.docStatus === 'REJECTED' || Boolean(p.remarks))) {
          statusBadgeHtml = '<span class="badge bg-danger px-3 py-2"><i class="bi bi-exclamation-circle me-1"></i> ปรับแก้ข้อมูลเพิ่ม</span>';
        }

        return '<tr>' +
          '<td class="text-center fw-bold">' + rowNum + '</td>' +
          '<td class="text-center">' + photoHtml + '</td>' +
          '<td><strong>' + (p.name || '-') + '</strong><br><small class="text-muted">' + (p.idCard || '-') + '</small></td>' +
          '<td class="text-center"><span class="badge bg-light text-dark border fs-6">' + (p.jerseyNo || '-') + '</span></td>' +
          '<td>' + (p.position || '-') + '</td>' +
          '<td class="text-center">' + catBadgeHtml + '</td>' +
          '<td><strong>' + (teamObj.teamName || p.school || '-') + '</strong></td>' +
          '<td><span class="badge bg-light text-dark border">' + (teamObj.province || '-') + '</span></td>' +
          '<td class="text-center">' + statusBadgeHtml + '</td>' +
          '<td class="text-center">' +
            '<button type="button" class="btn btn-sm btn-outline-primary rounded-pill py-0 px-2" onclick="openAdminPlayerDetailModal(\\\'' + p.id + '\\\')">' +
              '<i class="bi bi-eye me-1"></i> ดูรายละเอียด' +
            '</button>' +
          '</td>' +
        '</tr>';
      }).join('');

      if (pagContainer) {
        let pagHtml = '<div class="d-flex justify-content-between align-items-center mt-3 px-2 w-100">';
        pagHtml += '<div class="text-muted small">แสดง ' + (startIdx + 1) + ' ถึง ' + Math.min(startIdx + pageSize, totalItems) + ' จากทั้งหมด ' + totalItems + ' รายการ (หน้า ' + window.currentPlayerPage + '/' + totalPages + ')</div>';
        pagHtml += '<nav><ul class="pagination pagination-sm mb-0">';

        const prevDisabled = window.currentPlayerPage === 1 ? 'disabled' : '';
        pagHtml += '<li class="page-item ' + prevDisabled + '"><button class="page-link" onclick="changePlayerPage(' + (window.currentPlayerPage - 1) + ')">ก่อนหน้า</button></li>';

        for (let p = 1; p <= totalPages; p++) {
          if (totalPages > 7) {
            if (p !== 1 && p !== totalPages && Math.abs(p - window.currentPlayerPage) > 2) {
              if (p === 2 && window.currentPlayerPage > 4) {
                pagHtml += '<li class="page-item disabled"><span class="page-link">...</span></li>';
              } else if (p === totalPages - 1 && window.currentPlayerPage < totalPages - 3) {
                pagHtml += '<li class="page-item disabled"><span class="page-link">...</span></li>';
              }
              continue;
            }
          }
          const activeClass = p === window.currentPlayerPage ? 'active' : '';
          pagHtml += '<li class="page-item ' + activeClass + '"><button class="page-link" onclick="changePlayerPage(' + p + ')">' + p + '</button></li>';
        }

        const nextDisabled = window.currentPlayerPage === totalPages ? 'disabled' : '';
        pagHtml += '<li class="page-item ' + nextDisabled + '"><button class="page-link" onclick="changePlayerPage(' + (window.currentPlayerPage + 1) + ')">ถัดไป</button></li>';

        pagHtml += '</ul></nav></div>';
        pagContainer.innerHTML = pagHtml;
      }
    }

    function openAdminPlayerDetailModal(playerId) {
      const p = window.rawPlayersData.find(item => String(item.id).trim() === String(playerId).trim());
      if (!p) {
        alert('ไม่พบข้อมูลนักกีฬา');
        return;
      }

      const teamObj = window.rawTeamsMap[p.teamId] || {};
      document.getElementById('modalPlayerId').value = p.id;
      document.getElementById('modalPlayerName').textContent = p.name || '-';
      document.getElementById('modalPlayerIdCard').textContent = p.idCard ? ('เลขบัตร: ' + p.idCard) : '-';
      document.getElementById('modalPlayerJerseyNo').textContent = 'เสื้อเบอร์ ' + (p.jerseyNo || '-');
      document.getElementById('modalPlayerPos').textContent = p.position || '-';
      document.getElementById('modalPlayerSchool').textContent = teamObj.teamName || p.school || '-';
      document.getElementById('modalPlayerCat').textContent = p.category || p.categories || 'U14';
      document.getElementById('modalPlayerHW').textContent = (p.height ? p.height + ' ซม.' : '-') + ' / ' + (p.weight ? p.weight + ' กก.' : '-');
      document.getElementById('modalPlayerGrade').textContent = p.grade || '-';
      document.getElementById('modalPlayerGuardian').textContent = (p.guardianName || '-') + (p.guardianRelation ? ' (' + p.guardianRelation + ')' : '');
      document.getElementById('modalPlayerPhone').textContent = p.phone || '-';
      ${renderAthleteExtraFields('modalPlayer')}

      const photoEl = document.getElementById('modalPlayerPhoto');
      if (p.photoUrl) {
        photoEl.src = window.baseUrl + p.photoUrl;
      } else {
        photoEl.src = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22146%22%20height%3D%22228%22%20viewBox%3D%220%200%20146%20228%22%3E%3Crect%20width%3D%22146%22%20height%3D%22228%22%20fill%3D%22%23e5eff9%22%2F%3E%3Ccircle%20cx%3D%2273%22%20cy%3D%2277%22%20r%3D%2228%22%20fill%3D%22%2393abc5%22%2F%3E%3Cpath%20d%3D%22M20%20200v-27a53%2053%200%200%201%20106%200v27%22%20fill%3D%22%2393abc5%22%2F%3E%3C%2Fsvg%3E';
      }

      // Render Docs Checklist (ID Card / Birth Certificate)
      const docsContainer = document.getElementById('modalPlayerDocsList');
      const docsConfig = [
        { label: 'สำเนาบัตรประชาชน / สูติบัตร', file: p.docIdCard }
      ];

      docsContainer.innerHTML = docsConfig.map(d => {
        if (d.file) {
          return '<div class="d-flex align-items-center justify-content-between p-2 bg-white rounded border">' +
            '<span><i class="bi bi-file-earmark-check-fill text-success me-2"></i>' + d.label + '</span>' +
            '<a href="' + window.baseUrl + d.file + '" target="_blank" class="btn btn-xs btn-outline-info py-0 px-2 rounded"><i class="bi bi-box-arrow-up-right me-1"></i> เปิดดูเอกสาร</a>' +
          '</div>';
        } else {
          return '<div class="d-flex align-items-center justify-content-between p-2 bg-white rounded border text-muted">' +
            '<span><i class="bi bi-file-earmark-x-fill text-danger me-2"></i>' + d.label + '</span>' +
            '<span class="badge bg-light text-secondary border">ยังไม่แนบ</span>' +
          '</div>';
        }
      }).join('');

      // Status & Remarks
      document.getElementById('modalDocStatusSelect').value = p.docStatus || 'PENDING';
      document.getElementById('modalPlayerRemarks').value = p.remarks || '';

      const submission = getPlayerSubmissionState(p, teamObj);
      window.initializePlayerVerification(p, {
        canEdit: submission.submitted,
        readOnlyMessage: submission.submitted ? '' : 'ทีมยังไม่ได้ส่งรายชื่อรุ่น ' + (submission.missing.join(', ') || 'ที่ไม่ระบุ') + ' จึงดูข้อมูลและผล AI ได้ แต่ยังเปลี่ยนสถานะหรือบันทึกผลตรวจไม่ได้'
      });
      const modalEl = document.getElementById('adminPlayerDetailModal');
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }

    async function saveAdminPlayerRemark() {
      const playerId = document.getElementById('modalPlayerId').value;
      const docStatus = document.getElementById('modalDocStatusSelect').value;
      const remarks = document.getElementById('modalPlayerRemarks').value;

      const btn = document.getElementById('btnSaveAdminRemark');
      const origText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> กำลังบันทึก...';

      try {
        const resp = await fetch(window.baseUrl + '/api/admin/players/save-remark', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId, docStatus, remarks })
        });
        const result = await resp.json();

        if (result.success) {
          const p = window.rawPlayersData.find(item => String(item.id).trim() === String(playerId).trim());
          if (p) {
            p.docStatus = docStatus;
            p.remarks = remarks;
          }
          renderPlayersTable();

          const modalEl = document.getElementById('adminPlayerDetailModal');
          const modal = bootstrap.Modal.getInstance(modalEl);
          if (modal) modal.hide();

          alert('บันทึกข้อมูลเรียบร้อยแล้ว');
        } else {
          alert('เกิดข้อผิดพลาด: ' + (result.message || 'ไม่สามารถบันทึกข้อมูลได้'));
        }
      } catch (err) {
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      } finally {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    }

    function sortPlayersTable(colIdx) {
      const dir = window.sortDirection[colIdx] === 'asc' ? 'desc' : 'asc';
      window.sortDirection[colIdx] = dir;

      window.rawPlayersData.sort((a, b) => {
        const teamA = window.rawTeamsMap[a.teamId] || {};
        const teamB = window.rawTeamsMap[b.teamId] || {};
        let valA = '', valB = '';

        if (colIdx === 0) { valA = a.id; valB = b.id; }
        else if (colIdx === 2) { valA = a.name || ''; valB = b.name || ''; }
        else if (colIdx === 3) { valA = String(a.jerseyNo || 0); valB = String(b.jerseyNo || 0); }
        else if (colIdx === 4) { valA = a.position || ''; valB = b.position || ''; }
        else if (colIdx === 5) { valA = a.category || ''; valB = b.category || ''; }
        else if (colIdx === 6) { valA = teamA.teamName || a.school || ''; valB = teamB.teamName || b.school || ''; }
        else if (colIdx === 7) { valA = teamA.province || ''; valB = teamB.province || ''; }

        if (dir === 'asc') return valA.localeCompare(valB, 'th');
        return valB.localeCompare(valA, 'th');
      });

      renderPlayersTable();
    }

    function updatePlayerDistrictOptions() {
      const provEl = document.getElementById('filterPlayerProvince');
      const selectedProv = window.isSatOfficer ? window.satProvince : (provEl ? provEl.value : '');
      const distSelect = document.getElementById('filterPlayerDistrict');
      if (!distSelect) return;
      distSelect.innerHTML = '<option value="">-- ทั้งหมดทุกเขต/อำเภอ --</option>';

      if (selectedProv) {
        const teams = Object.values(window.rawTeamsMap);
        const districts = Array.from(new Set(teams.filter((t) => t.province === selectedProv).map((t) => window.PmycTeamArea.getTeamDistrictName(t)).filter(Boolean))).sort();
        districts.forEach(d => {
          distSelect.innerHTML += '<option value="' + d + '">' + d + '</option>';
        });
      }
    }

    function resetPlayerFilters() {
      const searchEl = document.getElementById('filterPlayerSearch');
      const schoolEl = document.getElementById('filterPlayerSchool');
      const provEl = document.getElementById('filterPlayerProvince');
      const distEl = document.getElementById('filterPlayerDistrict');

      if (searchEl) searchEl.value = '';
      if (schoolEl) schoolEl.value = '';
      if (provEl && !window.isSatOfficer) provEl.value = '';

      updatePlayerDistrictOptions();
      if (distEl) distEl.value = '';
      renderPlayersTable();
    }

    document.addEventListener('DOMContentLoaded', () => {
      const searchEl = document.getElementById('filterPlayerSearch');
      if (searchEl) searchEl.addEventListener('input', renderPlayersTable);
      const schoolEl = document.getElementById('filterPlayerSchool');
      if (schoolEl) schoolEl.addEventListener('change', renderPlayersTable);
      const provEl = document.getElementById('filterPlayerProvince');
      if (provEl) provEl.addEventListener('change', () => {
        updatePlayerDistrictOptions();
        renderPlayersTable();
      });
      const distEl = document.getElementById('filterPlayerDistrict');
      if (distEl) distEl.addEventListener('change', renderPlayersTable);

      updatePlayerDistrictOptions();
      renderPlayersTable();
    });
  </script>`;
    const rawQuery = req.url.includes('?') ? req.url.substring(req.url.indexOf('?') + 1) : '';
    res.send((0, adminLayout_1.renderAdminLayout)('รายการนักกีฬา', bodyContent, 'players', base, currentUser, rawQuery));
});
// Admin Save Player Remark & Document Status API
router.post('/api/admin/players/save-remark', adminSession_service_1.checkAdminSession, async (req, res) => {
    try {
        const { playerId, docStatus, remarks, isDemo: isDemoRequest } = req.body || {};
        const currentUser = req.adminUser;
        if (isDemoRequest === true && currentUser?.roleCode !== 'SUPER_ADMIN') {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เปลี่ยนสถานะข้อมูล Demo' });
        }
        if (!playerId) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสนักกีฬา' });
        }
        let cleanStatus = 'PENDING';
        if (docStatus === 'APPROVED')
            cleanStatus = 'APPROVED';
        else if (docStatus === 'ACTION_REQUIRED' || docStatus === 'REJECTED')
            cleanStatus = 'ACTION_REQUIRED';
        else if (docStatus === 'CORRECTED')
            cleanStatus = 'CORRECTED';
        else if (docStatus === 'PENDING')
            cleanStatus = 'PENDING';
        const cleanRemarks = String(remarks || '').trim();
        const memP = app_1.playersDatabase.find((p) => String(p.id).trim() === String(playerId).trim());
        let priorPlayer = memP || null;
        // Submission and province checks use persisted team state; memory caches can be stale.
        const priorResult = await db_1.pool.query(`SELECT p.id, p.team_id, p.doc_status, p.category, t.province, t.is_test, t.submitted_categories
       FROM football_player p
       LEFT JOIN football_registered_team t ON t.id = p.team_id
       WHERE p.id = $1 AND COALESCE(t.is_test, FALSE) = ${isDemoRequest === true ? 'TRUE' : 'FALSE'}`, [playerId]);
        priorPlayer = priorResult.rows[0] || priorPlayer;
        if (isDemoRequest === true && (!priorPlayer || !priorPlayer.is_test)) {
            return res.status(404).json({ success: false, message: 'ไม่พบนักกีฬาในข้อมูล Demo' });
        }
        if (!priorPlayer)
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลนักกีฬาที่ต้องการบันทึก' });
        if (currentUser?.roleCode === 'SAT_OFFICER') {
            const playerProvince = String(priorPlayer?.province || '').trim().toLocaleLowerCase();
            const officerProvince = String(currentUser.province || '').trim().toLocaleLowerCase();
            if (!playerProvince || playerProvince !== officerProvince) {
                return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เปลี่ยนสถานะนักกีฬานอกจังหวัดที่รับผิดชอบ' });
            }
        }
        const playerCategories = String(priorPlayer.category || memP?.category || '').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
        const fallbackTeam = app_1.teamsDatabase.find((team) => String(team.id) === String(priorPlayer.team_id || memP?.teamId || ''));
        const submittedCategories = new Set(String(priorPlayer.submitted_categories || fallbackTeam?.submitted_categories || fallbackTeam?.submittedCategories || '').split(',').map((value) => value.trim().toUpperCase()).filter(Boolean));
        const unsubmitted = playerCategories.filter((category) => !submittedCategories.has(category));
        if (isDemoRequest !== true && (!playerCategories.length || unsubmitted.length)) {
            const categories = unsubmitted.length ? unsubmitted.join(', ') : 'รุ่นที่ไม่ระบุ';
            return res.status(409).json({ success: false, message: 'ทีมยังไม่ได้ส่งรายชื่อรุ่น ' + categories + ' จึงยังเปลี่ยนสถานะนักกีฬาไม่ได้' });
        }
        const updateResult = isDemoRequest === true
            ? await db_1.pool.query(`UPDATE football_player SET doc_status = $1, remarks = $2 WHERE id = $3 AND team_id IN (SELECT id FROM football_registered_team WHERE COALESCE(is_test, FALSE) = TRUE)`, [cleanStatus, cleanRemarks, playerId])
            : await db_1.pool.query(`UPDATE football_player p SET doc_status=$1, remarks=$2 FROM football_registered_team t
          WHERE p.id=$3 AND t.id=p.team_id AND COALESCE(t.is_test,FALSE)=FALSE AND COALESCE(t.is_deleted,FALSE)=FALSE
            AND ($4::text IS NULL OR lower(trim(t.province))=lower(trim($4)))
            AND NOT EXISTS (
              SELECT 1 FROM unnest(string_to_array(COALESCE(NULLIF(p.category,''),'U14'), ',')) AS player_category(value)
              WHERE trim(player_category.value) <> '' AND upper(trim(player_category.value)) <> ALL (
                SELECT upper(trim(submitted_category.value))
                FROM unnest(string_to_array(COALESCE(t.submitted_categories,''), ',')) AS submitted_category(value)
              )
            )`, [cleanStatus, cleanRemarks, playerId, currentUser?.roleCode === 'SAT_OFFICER' ? currentUser.province : null]);
        if (updateResult.rowCount === 0) {
            return res.status(409).json({ success: false, message: 'สถานะการส่งรายชื่อเปลี่ยนแปลง กรุณาเปิดทีมและตรวจสอบสถานะอีกครั้ง' });
        }
        if (memP) {
            memP.docStatus = cleanStatus;
            memP.remarks = cleanRemarks;
        }
        try {
            await (0, auditLog_service_1.writeAuditLog)(req, {
                eventType: 'PLAYER_DOCUMENT_STATUS_CHANGED',
                entityType: 'PLAYER',
                entityId: String(playerId),
                teamId: String(priorPlayer?.teamId || priorPlayer?.team_id || ''),
                oldState: { docStatus: priorPlayer?.docStatus || priorPlayer?.doc_status || 'UNKNOWN' },
                newState: { docStatus: cleanStatus },
                metadata: {
                    category: String(priorPlayer?.category || 'U14'),
                    remarksPresent: Boolean(cleanRemarks)
                }
            });
        }
        catch (error) {
            console.error('Audit log write failed after player status update:', error);
            req.auditPersistenceState = 'DATABASE_CHANGE_COMPLETED_AUDIT_WRITE_FAILED';
            return res.status(500).json({ success: false, auditLogFailed: true, message: 'เปลี่ยนสถานะนักกีฬาแล้ว แต่บันทึกประวัติไม่สำเร็จ กรุณาตรวจสอบก่อนทำรายการซ้ำ' });
        }
        return res.json({ success: true, message: 'บันทึกข้อมูลเรียบร้อยแล้ว' });
    }
    catch (err) {
        console.error('Error in save-remark API:', err);
        return res.status(500).json({ success: false, message: err?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
});
// Admin Delete Player API (/api/admin/players/delete)
router.post('/api/admin/players/delete', async (req, res) => {
    try {
        const { playerId } = req.body || {};
        if (!playerId) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสนักกีฬา' });
        }
        let dbDeleted = false;
        try {
            const result = await db_1.pool.query('DELETE FROM football_player WHERE id = $1', [playerId]);
            dbDeleted = Boolean(result.rowCount);
        }
        catch (e) {
            console.warn('DB delete player warning:', e);
        }
        if (dbDeleted) {
            const player = app_1.playersDatabase.find((item) => String(item.id).trim() === String(playerId).trim());
            await (0, auditLog_service_1.writeAuditLog)(req, {
                eventType: 'PLAYER_DELETED', entityType: 'PLAYER', entityId: String(playerId),
                teamId: String(player?.teamId || player?.team_id || ''),
                oldState: { category: player?.category || player?.categories || null },
                metadata: { changedFields: 'รายการนักกีฬา' }
            });
        }
        const idx = app_1.playersDatabase.findIndex((p) => String(p.id).trim() === String(playerId).trim());
        if (idx !== -1) {
            app_1.playersDatabase.splice(idx, 1);
        }
        return res.json({ success: true, message: 'ลบข้อมูลนักกีฬาเรียบร้อยแล้ว' });
    }
    catch (err) {
        console.error('Error in delete player API:', err);
        return res.status(500).json({ success: false, message: err?.message || 'เกิดข้อผิดพลาดในการลบข้อมูลนักกีฬา' });
    }
});
// Admin Delete Official API (/api/admin/officials/delete)
router.post('/api/admin/officials/delete', async (req, res) => {
    try {
        const { officialId } = req.body || {};
        if (!officialId) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสเจ้าหน้าที่' });
        }
        let dbDeleted = false;
        try {
            const result = await db_1.pool.query('DELETE FROM football_official WHERE id = $1', [officialId]);
            dbDeleted = Boolean(result.rowCount);
        }
        catch (e) {
            console.warn('DB delete official warning:', e);
        }
        if (dbDeleted) {
            const official = app_1.officialsDatabase.find((item) => String(item.id).trim() === String(officialId).trim());
            await (0, auditLog_service_1.writeAuditLog)(req, {
                eventType: 'OFFICIAL_DELETED', entityType: 'OFFICIAL', entityId: String(officialId),
                teamId: String(official?.teamId || official?.team_id || ''),
                oldState: { position: official?.position || null, categories: official?.categories || null },
                metadata: { changedFields: 'รายการเจ้าหน้าที่' }
            });
        }
        const idx = app_1.officialsDatabase.findIndex((o) => String(o.id).trim() === String(officialId).trim());
        if (idx !== -1) {
            app_1.officialsDatabase.splice(idx, 1);
        }
        return res.json({ success: true, message: 'ลบข้อมูลเจ้าหน้าที่เรียบร้อยแล้ว' });
    }
    catch (err) {
        console.error('Error in delete official API:', err);
        return res.status(500).json({ success: false, message: err?.message || 'เกิดข้อผิดพลาดในการลบข้อมูลเจ้าหน้าที่' });
    }
});
// Admin Users Management Page (SUPER_ADMIN Only)
router.get('/admin/users.php', adminSession_service_1.checkAdminSession, async (req, res) => {
    const base = (0, app_1.getBaseUrl)(req);
    const currentUser = req.adminUser || {
        id: 'ADM-001',
        username: 'admin',
        fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)',
        roleCode: 'SUPER_ADMIN',
        roleName: 'ผู้ดูแลระบบสูงสุด',
        permissions: ['teams:read', 'teams:verify', 'users:manage', 'system:all']
    };
    const users = await (0, adminAuth_1.getAdminUsersList)();
    const rows = users.map((u, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${u.username}</strong></td>
      <td>${u.fullname}</td>
      <td>
        ${u.roleCode === 'SUPER_ADMIN'
        ? '<span class="badge bg-danger">SUPER_ADMIN (สูงสุด)</span>'
        : '<span class="badge bg-primary">DOCUMENT_VERIFIER (ตรวจเอกสาร)</span>'}
      </td>
      <td><span class="badge bg-success">ใช้งานปกติ</span></td>
    </tr>
  `).join('');
    const bodyContent = `
  <div class="card p-4 shadow-sm border-0 rounded-3">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="fw-bold text-navy mb-0"><i class="bi bi-people-fill"></i> จัดการบัญชีผู้ดูแล (Admin Accounts)</h4>
      <button class="btn btn-navy btn-sm fw-bold" data-bs-toggle="modal" data-bs-target="#addAdminUserModal">
        <i class="bi bi-person-plus-fill me-1"></i> เพิ่มบัญชีผู้ดูแล
      </button>
    </div>

    <div class="table-responsive mb-2">
      <table class="table table-bordered table-hover align-middle">
        <thead class="table-light">
          <tr>
            <th>#</th>
            <th>ชื่อผู้ใช้งาน (Username)</th>
            <th>ชื่อ-นามสกุล</th>
            <th>บทบาท (Role)</th>
            <th>สถานะ</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Modal เพิ่มบัญชีผู้ดูแล -->
  <div class="modal fade" id="addAdminUserModal" tabindex="-1" aria-labelledby="addAdminUserModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content rounded-3 border-0 shadow">
        <div class="modal-header bg-navy text-white py-3">
          <h5 class="modal-title fw-bold mb-0" id="addAdminUserModalLabel"><i class="bi bi-person-plus-fill me-2"></i> เพิ่มบัญชีผู้ดูแลระบบ</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <form id="addAdminUserForm" onsubmit="saveNewAdminUser(event)">
          <div class="modal-body p-4">
            <div class="mb-3">
              <label class="form-label fw-semibold small">ชื่อผู้ใช้งาน (Username) <span class="text-danger">*</span></label>
              <input type="text" id="addAdminUsername" name="username" class="form-control" placeholder="เช่น verifier02" required>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold small">รหัสผ่าน (Password) <span class="text-danger">*</span></label>
              <input type="password" id="addAdminPassword" name="password" class="form-control" placeholder="อย่างน้อย 8 ตัวอักษร" minlength="8" required>
              <small class="text-muted fs-7">* รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร</small>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold small">ชื่อ-นามสกุล <span class="text-danger">*</span></label>
              <input type="text" id="addAdminFullname" name="fullname" class="form-control" placeholder="เช่น นายสมชาย ใจดี" required>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold small">บทบาทผู้ใช้งาน (Role) <span class="text-danger">*</span></label>
              <select id="addAdminRoleCode" name="roleCode" class="form-select" required>
                <option value="DOCUMENT_VERIFIER" selected>DOCUMENT_VERIFIER (เจ้าหน้าที่ตรวจเอกสาร)</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN (ผู้ดูแลระบบสูงสุด)</option>
              </select>
            </div>
          </div>
          <div class="modal-footer bg-light px-4 py-3">
            <button type="button" class="btn btn-secondary rounded-3" data-bs-dismiss="modal">ยกเลิก</button>
            <button type="submit" id="btnSaveAdminUser" class="btn btn-navy rounded-3 px-4">
              <i class="bi bi-save me-1"></i> บันทึกบัญชีผู้ดูแล
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <script>
    var base = "${base}";
    async function saveNewAdminUser(e) {
      e.preventDefault();
      var username = document.getElementById('addAdminUsername').value.trim();
      var password = document.getElementById('addAdminPassword').value;
      var fullname = document.getElementById('addAdminFullname').value.trim();
      var roleCode = document.getElementById('addAdminRoleCode').value;

      if (!username || !password || !fullname || !roleCode) {
        Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });
        return;
      }

      if (password.length < 8) {
        Swal.fire({ icon: 'warning', title: 'รหัสผ่านสั้นเกินไป', text: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' });
        return;
      }

      var btn = document.getElementById('btnSaveAdminUser');
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> กำลังบันทึก...'; }

      try {
        var resp = await fetch(base + '/api/admin/users/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ username: username, password: password, fullname: fullname, roleCode: roleCode })
        });
        var res = await resp.json();

        if (res.success) {
          Swal.fire({ icon: 'success', title: 'สร้างบัญชีผู้ดูแลสำเร็จ', text: res.message || 'บันทึกข้อมูลเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false }).then(function() {
            window.location.reload();
          });
        } else {
          Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: res.error || res.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
        }
      } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้' });
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save me-1"></i> บันทึกบัญชีผู้ดูแล'; }
      }
    }
  </script>`;
    const rawQuery = req.url.includes('?') ? req.url.substring(req.url.indexOf('?') + 1) : '';
    res.send((0, adminLayout_1.renderAdminLayout)('จัดการบัญชีผู้ดูแล', bodyContent, 'users', base, currentUser, rawQuery));
});
// Admin SAT Officers Page (กกท.)
router.get('/admin/sat-officers.php', adminSession_service_1.checkAdminSession, async (req, res) => {
    const base = (0, app_1.getBaseUrl)(req);
    const currentUser = req.adminUser || {
        id: 'ADM-001',
        username: 'admin',
        fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)',
        roleCode: 'SUPER_ADMIN',
        roleName: 'ผู้ดูแลระบบสูงสุด',
        permissions: ['teams:read', 'teams:verify', 'users:manage', 'system:all']
    };
    const officers = await (0, adminAuth_1.getSatOfficersList)();
    const provincesList = [
        'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท',
        'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม',
        'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์',
        'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์',
        'แพร่', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง',
        'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ',
        'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย',
        'หนองบัวลำภู', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี', 'อ่างทอง'
    ];
    const rows = officers.map((o, idx) => {
        const provVal = o.province || '-';
        return `
    <tr>
      <td class="text-center">${idx + 1}</td>
      <td><strong>${o.fullname}</strong></td>
      <td>${o.position}</td>
      <td class="text-center">
        <span class="badge bg-primary fs-6 px-3 py-2"><i class="bi bi-geo-alt-fill me-1"></i> ${provVal}</span>
      </td>
      <td>${o.phone || '-'}</td>
      <td>${o.lineId || '-'}</td>
      <td>${o.email || '-'}</td>
      <td class="text-center">
        <span class="badge bg-success">กำกับดูแลข้อมูลทีม</span>
      </td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-primary me-1" 
                onclick="editSatOfficer('${o.id}', '${o.fullname.replace(/'/g, "\\'")}', '${o.position.replace(/'/g, "\\'")}', '${provVal}', '${(o.phone || '').replace(/'/g, "\\'")}', '${(o.email || '').replace(/'/g, "\\\'")}', '${(o.lineId || '').replace(/'/g, "\\'")}')"
                title="แก้ไขข้อมูล">
          <i class="bi bi-pencil-square"></i> แก้ไข
        </button>
        <button class="btn btn-sm btn-outline-danger" 
                onclick="deleteSatOfficerConfirm('${o.id}', '${o.fullname.replace(/'/g, "\\'")}')" 
                title="ลบข้อมูล">
          <i class="bi bi-trash-fill"></i> ลบ
        </button>
      </td>
    </tr>
  `;
    }).join('');
    const provinceOptions = provincesList.map(p => `<option value="${p}">${p}</option>`).join('');
    const bodyContent = `
  <div class="card p-4 shadow-sm border-0 rounded-3">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div>
        <h4 class="fw-bold text-navy mb-1"><i class="bi bi-building-badge"></i> ข้อมูลเจ้าหน้าที่ การกีฬาแห่งประเทศไทย (กกท.)</h4>
        <p class="text-muted small mb-0">เจ้าหน้าที่รับผิดชอบตามรายจังหวัด เชื่อมโยงกับข้อมูลทีมที่ลงทะเบียนในการแข่งขัน</p>
      </div>
      <button class="btn btn-navy btn-sm fw-bold" data-bs-toggle="modal" data-bs-target="#addSatModal">
        <i class="bi bi-plus-circle me-1"></i> เพิ่มเจ้าหน้าที่ กกท.
      </button>
    </div>

    <div class="table-responsive">
      <table class="table table-bordered table-hover align-middle">
        <thead class="table-light">
          <tr>
            <th class="text-center">#</th>
            <th>ชื่อ-นามสกุล</th>
            <th>ตำแหน่ง</th>
            <th class="text-center">จังหวัดที่รับผิดชอบ</th>
            <th>เบอร์โทรศัพท์</th>
            <th>Line ID</th>
            <th>อีเมล</th>
            <th class="text-center">สถานะสิทธิ์</th>
            <th class="text-center" style="width: 170px;">จัดการข้อมูล</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="9" class="text-center text-muted py-4">ยังไม่มีข้อมูลเจ้าหน้าที่ กกท.</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Modal เพิ่มเจ้าหน้าที่ กกท. -->
  <div class="modal fade" id="addSatModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content rounded-3 border-0 shadow">
        <div class="modal-header bg-navy text-white">
          <h5 class="modal-title fw-bold"><i class="bi bi-person-plus-fill me-2"></i> เพิ่มข้อมูลเจ้าหน้าที่ กกท.</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <form action="${base}/api/admin/sat-officers/save" method="POST">
          <input type="hidden" name="redirectUsername" value="${currentUser.username}">
          <div class="modal-body p-4">
            <div class="mb-3">
              <label class="form-label fw-semibold">ชื่อ-นามสกุล <span class="text-danger">*</span></label>
              <input type="text" name="fullname" class="form-control" placeholder="เช่น นายสมศักดิ์ รัตนชัย" required>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">ตำแหน่ง <span class="text-danger">*</span></label>
              <input type="text" name="position" class="form-control" placeholder="เช่น ผู้อำนวยการ สำนักงาน กกท. จังหวัด" required>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">จังหวัดที่รับผิดชอบ <span class="text-danger">*</span></label>
              <select name="province" class="form-select" required>
                <option value="">-- เลือกจังหวัด --</option>
                ${provinceOptions}
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">เบอร์โทรศัพท์ติดต่อ</label>
              <input type="text" name="phone" class="form-control" placeholder="เช่น 038-123456">
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">Line ID</label>
              <input type="text" name="line_id" class="form-control" placeholder="ระบุ Line ID (ถ้ามี)">
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">อีเมล (Email) <span class="text-danger">* ใช้เป็น Username เข้าสู่ระบบ</span></label>
              <input type="email" name="email" class="form-control" placeholder="เช่น officer@sports.go.th" required>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">รหัสผ่าน (Password) <span class="text-danger">* สำหรับเข้าสู่ระบบ</span></label>
              <div class="input-group">
                <input type="password" name="password" id="add_sat_password" class="form-control" placeholder="กรอกรหัสผ่านเข้าสู่ระบบ" required>
                <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('add_sat_password', this)">
                  <i class="bi bi-eye"></i>
                </button>
              </div>
            </div>
          </div>
          <div class="modal-footer bg-light">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">ยกเลิก</button>
            <button type="submit" class="btn btn-navy btn-sm px-4 fw-bold"><i class="bi bi-save me-1"></i> บันทึกข้อมูล</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- Modal แก้ไขเจ้าหน้าที่ กกท. -->
  <div class="modal fade" id="editSatModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content rounded-3 border-0 shadow">
        <div class="modal-header bg-navy text-white">
          <h5 class="modal-title fw-bold"><i class="bi bi-pencil-square me-2"></i> แก้ไขข้อมูลเจ้าหน้าที่ กกท.</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <form action="${base}/api/admin/sat-officers/update" method="POST">
          <input type="hidden" name="id" id="edit_sat_id">
          <input type="hidden" name="redirectUsername" value="${currentUser.username}">
          <div class="modal-body p-4">
            <div class="mb-3">
              <label class="form-label fw-semibold">ชื่อ-นามสกุล <span class="text-danger">*</span></label>
              <input type="text" name="fullname" id="edit_sat_fullname" class="form-control" required>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">ตำแหน่ง <span class="text-danger">*</span></label>
              <input type="text" name="position" id="edit_sat_position" class="form-control" required>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">จังหวัดที่รับผิดชอบ <span class="text-danger">*</span></label>
              <select name="province" id="edit_sat_province" class="form-select" required>
                <option value="">-- เลือกจังหวัด --</option>
                ${provinceOptions}
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">เบอร์โทรศัพท์ติดต่อ</label>
              <input type="text" name="phone" id="edit_sat_phone" class="form-control">
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">Line ID</label>
              <input type="text" name="line_id" id="edit_sat_line_id" class="form-control">
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">อีเมล (Email) <span class="text-danger">* ใช้เข้าสู่ระบบ</span></label>
              <input type="email" name="email" id="edit_sat_email" class="form-control" required>
            </div>
            <div class="mb-3">
              <label class="form-label fw-semibold">เปลี่ยนรหัสผ่าน (ระบุเมื่อต้องการเปลี่ยน)</label>
              <div class="input-group">
                <input type="password" name="password" id="edit_sat_password" class="form-control" placeholder="เว้นว่างไว้หากไม่ต้องการเปลี่ยน">
                <button class="btn btn-outline-secondary" type="button" onclick="togglePasswordVisibility('edit_sat_password', this)">
                  <i class="bi bi-eye"></i>
                </button>
              </div>
            </div>
          </div>
          <div class="modal-footer bg-light">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">ยกเลิก</button>
            <button type="submit" class="btn btn-primary btn-sm px-4 fw-bold"><i class="bi bi-save me-1"></i> บันทึกการแก้ไข</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <script>
    function editSatOfficer(id, fullname, position, province, phone, email, lineId) {
      document.getElementById('edit_sat_id').value = id;
      document.getElementById('edit_sat_fullname').value = fullname;
      document.getElementById('edit_sat_position').value = position;
      document.getElementById('edit_sat_province').value = province;
      document.getElementById('edit_sat_phone').value = phone === '-' ? '' : phone;
      document.getElementById('edit_sat_line_id').value = lineId || '';
      document.getElementById('edit_sat_email').value = email === '-' ? '' : email;
      document.getElementById('edit_sat_password').value = '';
      var editModal = new bootstrap.Modal(document.getElementById('editSatModal'));
      editModal.show();
    }

    function deleteSatOfficerConfirm(id, fullname) {
      Swal.fire({
        title: 'ยืนยันการลบข้อมูล?',
        html: 'คุณต้องการลบข้อมูลเจ้าหน้าที่ <strong>' + fullname + '</strong> ใช่หรือไม่?<br><small class="text-danger">การดำเนินการนี้ไม่สามารถยกเลิกได้</small>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '<i class="bi bi-trash"></i> ยืนยันลบข้อมูล',
        cancelButtonText: 'ยกเลิก',
        customClass: { popup: 'rounded-4 shadow-lg' }
      }).then((result) => {
        if (result.isConfirmed) {
          fetch('${base}/api/admin/sat-officers/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
          }).then(res => res.json())
          .then(data => {
            if (data.success) {
              Swal.fire({
                icon: 'success',
                title: 'ลบข้อมูลสำเร็จ!',
                text: 'ลบข้อมูลเจ้าหน้าที่ กกท. เรียบร้อยแล้ว',
                confirmButtonColor: '#0b2a5b'
              }).then(() => {
                location.reload();
              });
            } else {
              Swal.fire('เกิดข้อผิดพลาด', data.error || 'ไม่สามารถลบข้อมูลได้', 'error');
            }
          }).catch(err => {
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
          });
        }
      });
    }
  </script>`;
    const rawQuery = req.url.includes('?') ? req.url.substring(req.url.indexOf('?') + 1) : '';
    res.send((0, adminLayout_1.renderAdminLayout)('ข้อมูลเจ้าหน้าที่ กกท.', bodyContent, 'sat-officers', base, currentUser, rawQuery));
});
// API: Save SAT Officer
router.post('/api/admin/sat-officers/save', async (req, res) => {
    const base = (0, app_1.getBaseUrl)(req);
    const { fullname, position, province, phone, line_id, email, password, redirectUsername } = req.body;
    if (!fullname || !position || !province || !email || !password) {
        return res.status(400).json({ success: false, error: 'กรุณากรอกข้อมูลที่จำเป็นและรหัสผ่านให้ครบถ้วน' });
    }
    if (password.length < 8) {
        const isJson = req.headers['x-requested-with'] === 'XMLHttpRequest' || (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html'));
        if (isJson) {
            return res.status(400).json({ success: false, error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' });
        }
        const redirectUrl = `${base}/admin/sat-officers.php`;
        return res.status(400).send(`
      <!doctype html>
      <html lang="th">
      <head>
        <meta charset="utf-8">
        <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
      </head>
      <body>
        <script>
          Swal.fire({
            icon: 'error',
            title: 'รหัสผ่านสั้นเกินไป',
            text: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#0b2a5b'
          }).then(() => { location.href = "${redirectUrl}"; });
        </script>
      </body>
      </html>
    `);
    }
    const newOfficer = await (0, adminAuth_1.createSatOfficer)(fullname, position, province, phone || '-', email, password, line_id || '');
    let auditLogFailed = false;
    try {
        await (0, auditLog_service_1.writeAuditLog)(req, {
            eventType: 'SAT_OFFICER_CREATED', entityType: 'SAT_OFFICER', entityId: String(newOfficer.id), teamId: null,
            newState: { position: String(newOfficer.position), province: String(newOfficer.province) },
            metadata: { changedFields: 'position, province' }
        });
    }
    catch (error) {
        console.error('SAT officer creation audit log failed:', error);
        auditLogFailed = true;
        req.auditPersistenceState = 'CHANGE_COMPLETED_AUDIT_WRITE_FAILED';
    }
    const isJson = req.headers['x-requested-with'] === 'XMLHttpRequest' || (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html'));
    if (isJson) {
        return res.status(201).json({ success: true, auditLogFailed, message: auditLogFailed ? 'บันทึกข้อมูลแล้ว แต่บันทึกประวัติไม่สำเร็จ' : 'บันทึกข้อมูลเจ้าหน้าที่ กกท. เรียบร้อยแล้ว', officer: newOfficer });
    }
    const redirectUrl = `${base}/admin/sat-officers.php`;
    return res.status(201).send(`
    <!doctype html>
    <html lang="th">
    <head>
      <meta charset="utf-8">
      <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    </head>
    <body>
      <script>
        Swal.fire({
          icon: 'success',
          title: 'บันทึกสำเร็จ!',
          text: 'เพิ่มข้อมูลเจ้าหน้าที่ กกท. เรียบร้อยแล้ว สามารถใช้อีเมลและรหัสผ่านเข้าสู่ระบบได้ทันที',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#0b2a5b'
        }).then(() => {
          location.href = "${redirectUrl}";
        });
      </script>
    </body>
    </html>
  `);
});
// API: Update SAT Officer
router.post('/api/admin/sat-officers/update', async (req, res) => {
    const base = (0, app_1.getBaseUrl)(req);
    const { id, fullname, position, province, phone, line_id, email, password } = req.body;
    if (!id || !fullname || !position || !province || !email) {
        return res.status(400).json({ success: false, error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
    }
    if (password && password.length < 8) {
        const isJson = req.headers['x-requested-with'] === 'XMLHttpRequest' || (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html'));
        if (isJson) {
            return res.status(400).json({ success: false, error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' });
        }
        const redirectUrl = `${base}/admin/sat-officers.php`;
        return res.status(400).send(`
      <!doctype html>
      <html lang="th">
      <head>
        <meta charset="utf-8">
        <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
      </head>
      <body>
        <script>
          Swal.fire({
            icon: 'error',
            title: 'รหัสผ่านสั้นเกินไป',
            text: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#0b2a5b'
          }).then(() => { location.href = "${redirectUrl}"; });
        </script>
      </body>
      </html>
    `);
    }
    const previousOfficer = (await (0, adminAuth_1.getSatOfficersList)()).find(officer => String(officer.id) === String(id));
    await (0, adminAuth_1.updateSatOfficer)(id, fullname, position, province, phone || '-', email, password || undefined, line_id || '');
    let auditLogFailed = false;
    if (previousOfficer) {
        const oldState = { position: String(previousOfficer.position || ''), province: String(previousOfficer.province || '') };
        const newState = { position: String(position), province: String(province) };
        const changedFields = [
            ...(oldState.position !== newState.position ? ['position'] : []),
            ...(oldState.province !== newState.province ? ['province'] : [])
        ];
        try {
            await (0, auditLog_service_1.writeAuditLog)(req, {
                eventType: 'SAT_OFFICER_UPDATED', entityType: 'SAT_OFFICER', entityId: String(id), teamId: null,
                oldState, newState, metadata: { changedFields: changedFields.length ? changedFields.join(', ') : 'update-request' }
            });
        }
        catch (error) {
            console.error('SAT officer update audit log failed:', error);
            auditLogFailed = true;
            req.auditPersistenceState = 'CHANGE_COMPLETED_AUDIT_WRITE_FAILED';
        }
    }
    const isJson = req.headers['x-requested-with'] === 'XMLHttpRequest' || (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html'));
    if (isJson) {
        return res.json({ success: true, auditLogFailed, message: auditLogFailed ? 'แก้ไขข้อมูลแล้ว แต่บันทึกประวัติไม่สำเร็จ' : 'แก้ไขข้อมูลเจ้าหน้าที่ กกท. เรียบร้อยแล้ว' });
    }
    const redirectUrl = `${base}/admin/sat-officers.php`;
    return res.send(`
    <!doctype html>
    <html lang="th">
    <head>
      <meta charset="utf-8">
      <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    </head>
    <body>
      <script>
        Swal.fire({
          icon: 'success',
          title: 'บันทึกการแก้ไขสำเร็จ!',
          text: 'แก้ไขข้อมูลเจ้าหน้าที่ กกท. เรียบร้อยแล้ว',
          confirmButtonText: 'ตกลง',
          confirmButtonColor: '#0b2a5b'
        }).then(() => {
          location.href = "${redirectUrl}";
        });
      </script>
    </body>
    </html>
  `);
});
// API: Delete SAT Officer
router.post('/api/admin/sat-officers/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) {
        return res.status(400).json({ success: false, error: 'Missing officer ID' });
    }
    const previousOfficer = (await (0, adminAuth_1.getSatOfficersList)()).find(officer => String(officer.id) === String(id));
    await (0, adminAuth_1.deleteSatOfficer)(id);
    let auditLogFailed = false;
    if (previousOfficer) {
        try {
            await (0, auditLog_service_1.writeAuditLog)(req, {
                eventType: 'SAT_OFFICER_DELETED', entityType: 'SAT_OFFICER', entityId: String(id), teamId: null,
                oldState: { position: String(previousOfficer.position || ''), province: String(previousOfficer.province || '') },
                metadata: { changedFields: 'record' }
            });
        }
        catch (error) {
            console.error('SAT officer deletion audit log failed:', error);
            auditLogFailed = true;
            req.auditPersistenceState = 'CHANGE_COMPLETED_AUDIT_WRITE_FAILED';
        }
    }
    return res.json({ success: true, auditLogFailed, message: auditLogFailed ? 'ลบข้อมูลแล้ว แต่บันทึกประวัติไม่สำเร็จ' : 'ลบข้อมูลเจ้าหน้าที่ กกท. เรียบร้อยแล้ว' });
});
// -----------------------------------------------------------------------------
// Executive Report 1: Demographics & Geography Analytics
// -----------------------------------------------------------------------------
router.get('/admin/permissions.php', adminSession_service_1.checkAdminSession, async (req, res) => {
    const base = (0, app_1.getBaseUrl)(req);
    const currentUser = req.adminUser || {
        id: 'ADM-001',
        username: 'admin',
        fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)',
        roleCode: 'SUPER_ADMIN',
        roleName: 'ผู้ดูแลระบบสูงสุด',
        permissions: ['teams:read', 'teams:verify', 'users:manage', 'system:all']
    };
    const bodyContent = `
  <div class="card p-4 shadow-sm border-0 rounded-3">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="fw-bold text-navy mb-0"><i class="bi bi-key-fill"></i> จัดการสิทธิการเข้าถึงเมนู (Role & Permissions Matrix)</h4>
    </div>

    <p class="text-muted small">กำหนดสิทธิ์การเข้าถึงเมนูและฟังก์ชันต่างๆ แยกตามบทบาทของผู้ดูแลระบบ</p>

    <div class="table-responsive">
      <table class="table table-bordered align-middle">
        <thead class="table-navy text-white">
          <tr>
            <th>รายการเมนู / ฟังก์ชันการใช้งาน</th>
            <th class="text-center">ผู้ดูแลระบบสูงสุด (SUPER_ADMIN)</th>
            <th class="text-center">เจ้าหน้าที่ตรวจเอกสาร (DOCUMENT_VERIFIER)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><i class="bi bi-speedometer2 me-2"></i> <strong>แผงควบคุม (Dashboard)</strong></td>
            <td class="text-center text-success fs-5"><i class="bi bi-check-circle-fill"></i> เข้าถึงได้</td>
            <td class="text-center text-success fs-5"><i class="bi bi-check-circle-fill"></i> เข้าถึงได้</td>
          </tr>
          <tr>
            <td><i class="bi bi-check2-square me-2"></i> <strong>อนุมัติ / ปฏิเสธเอกสารทีม</strong></td>
            <td class="text-center text-success fs-5"><i class="bi bi-check-circle-fill"></i> เข้าถึงได้</td>
            <td class="text-center text-success fs-5"><i class="bi bi-check-circle-fill"></i> เข้าถึงได้</td>
          </tr>
          <tr>
            <td><i class="bi bi-bar-chart-line-fill me-2"></i> <strong>รายงานผู้บริหาร (Executive Reports 1-6)</strong></td>
            <td class="text-center text-success fs-5"><i class="bi bi-check-circle-fill"></i> เข้าถึงได้</td>
            <td class="text-center text-danger fs-5"><i class="bi bi-x-circle-fill"></i> ห้ามเข้าถึง</td>
          </tr>
          <tr>
            <td><i class="bi bi-people-fill me-2"></i> <strong>จัดการบัญชีผู้ดูแล (Admin Users)</strong></td>
            <td class="text-center text-success fs-5"><i class="bi bi-check-circle-fill"></i> เข้าถึงได้</td>
            <td class="text-center text-danger fs-5"><i class="bi bi-x-circle-fill"></i> ห้ามเข้าถึง</td>
          </tr>
          <tr>
            <td><i class="bi bi-key-fill me-2"></i> <strong>จัดการสิทธิการเข้าถึงเมนู (Permissions)</strong></td>
            <td class="text-center text-success fs-5"><i class="bi bi-check-circle-fill"></i> เข้าถึงได้</td>
            <td class="text-center text-danger fs-5"><i class="bi bi-x-circle-fill"></i> ห้ามเข้าถึง</td>
          </tr>
          <tr>
            <td><i class="bi bi-journal-text me-2"></i> <strong>Audit Log</strong></td>
            <td class="text-center text-success fs-5"><i class="bi bi-check-circle-fill"></i> เข้าถึงได้</td>
            <td class="text-center text-danger fs-5"><i class="bi bi-x-circle-fill"></i> ห้ามเข้าถึง</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>`;
    const rawQuery = req.url.includes('?') ? req.url.substring(req.url.indexOf('?') + 1) : '';
    res.send((0, adminLayout_1.renderAdminLayout)('จัดการสิทธิการเข้าถึงเมนู', bodyContent, 'permissions', base, currentUser, rawQuery));
});
const AUDIT_LOG_PAGE_SIZE = 50;
function escapeAuditLogHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[character] || character));
}
function isValidAuditDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
router.get('/admin/audit-log.php', adminSession_service_1.checkAdminSession, async (req, res) => {
    const currentUser = req.adminUser;
    if (currentUser?.roleCode !== 'SUPER_ADMIN') {
        return res.status(403).send('คุณไม่มีสิทธิ์เข้าถึง Audit Log');
    }
    const queryKeys = ['fromDate', 'toDate', 'fromTime', 'toTime', 'actorId', 'requestId', 'page'];
    const filters = {
        fromDate: '', toDate: '', fromTime: '', toTime: '', actorId: '', requestId: '', page: ''
    };
    for (const key of queryKeys) {
        const value = req.query[key];
        if (value !== undefined && typeof value !== 'string') {
            return res.status(400).send('รูปแบบตัวกรองไม่ถูกต้อง');
        }
        filters[key] = typeof value === 'string' ? value.trim() : '';
    }
    const { fromDate, toDate, fromTime, toTime, actorId, requestId } = filters;
    const hasDateRange = Boolean(fromDate || toDate);
    const hasTimeRange = Boolean(fromTime || toTime);
    const requestedPage = filters.page ? Number(filters.page) : 1;
    if (filters.page && (!/^\d+$/.test(filters.page) || !Number.isSafeInteger(requestedPage) || requestedPage < 1)) {
        return res.status(400).send('หมายเลขหน้าไม่ถูกต้อง');
    }
    if (actorId.length > 100) {
        return res.status(400).send('ตัวกรองผู้ใช้ไม่ถูกต้อง');
    }
    if (requestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        return res.status(400).send('รหัสคำขอไม่ถูกต้อง');
    }
    if (hasDateRange && (!fromDate || !toDate || !isValidAuditDate(fromDate) || !isValidAuditDate(toDate) || fromDate > toDate)) {
        return res.status(400).send('กรุณาระบุช่วงวันที่ให้ถูกต้อง โดยวันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด');
    }
    if (hasTimeRange && (!hasDateRange || !fromTime || !toTime || !/^([01]\d|2[0-3]):[0-5]\d$/.test(fromTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(toTime))) {
        return res.status(400).send('กรุณาระบุช่วงเวลาให้ครบถ้วนและถูกต้อง หลังเลือกช่วงวันที่');
    }
    if (hasTimeRange && fromDate === toDate && fromTime > toTime) {
        return res.status(400).send('เวลาเริ่มต้นต้องไม่อยู่หลังเวลาสิ้นสุด');
    }
    const queryParams = [];
    const whereConditions = [];
    const addQueryParam = (value) => {
        queryParams.push(value);
        return `$${queryParams.length}`;
    };
    if (hasDateRange) {
        const fromDateParam = addQueryParam(fromDate);
        const toDateParam = addQueryParam(toDate);
        if (hasTimeRange) {
            const fromTimeParam = addQueryParam(fromTime);
            const toTimeParam = addQueryParam(toTime);
            whereConditions.push(`created_at >= ((${fromDateParam}::date + ${fromTimeParam}::time) AT TIME ZONE 'Asia/Bangkok')`);
            whereConditions.push(`created_at < ((${toDateParam}::date + ${toTimeParam}::time + INTERVAL '1 minute') AT TIME ZONE 'Asia/Bangkok')`);
        }
        else {
            whereConditions.push(`created_at >= (${fromDateParam}::date::timestamp AT TIME ZONE 'Asia/Bangkok')`);
            whereConditions.push(`created_at < ((${toDateParam}::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Bangkok')`);
        }
    }
    if (actorId) {
        whereConditions.push(`actor_id = ${addQueryParam(actorId)}`);
    }
    if (requestId) {
        whereConditions.push(`request_id = ${addQueryParam(requestId)}`);
    }
    const whereClause = whereConditions.length ? ` WHERE ${whereConditions.join(' AND ')}` : '';
    try {
        const actorResult = await db_1.pool.query(`SELECT actor_id, MAX(actor_name) AS actor_name, MAX(actor_role) AS actor_role
       FROM football_audit_log
       WHERE actor_id IS NOT NULL
       GROUP BY actor_id
       ORDER BY MAX(actor_name), actor_id`);
        const countResult = await db_1.pool.query(`SELECT COUNT(*)::int AS total FROM football_audit_log${whereClause}`, queryParams);
        const total = Number(countResult.rows[0]?.total ?? 0);
        const totalPages = Math.max(1, Math.ceil(total / AUDIT_LOG_PAGE_SIZE));
        const page = Math.min(requestedPage, totalPages);
        const offset = (page - 1) * AUDIT_LOG_PAGE_SIZE;
        const pageParams = [...queryParams, AUDIT_LOG_PAGE_SIZE, offset];
        const rowsResult = await db_1.pool.query(`SELECT id, event_type, actor_id, actor_name, actor_role, actor_province, request_id,
              team_id, entity_type, entity_id, old_state, new_state, metadata, created_at
       FROM football_audit_log${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`, pageParams);
        const base = (0, app_1.getBaseUrl)(req);
        const eventLabels = {
            TEAM_STATUS_CHANGED: 'เปลี่ยนสถานะทีม',
            TEAM_UPDATED: 'แก้ไขข้อมูลทีม',
            TEAM_DELETED: 'ลบทีม',
            TEAM_RESTORED: 'กู้คืนทีม',
            PLAYER_DOCUMENT_STATUS_CHANGED: 'เปลี่ยนสถานะเอกสารนักกีฬา',
            PLAYER_UPDATED: 'แก้ไขข้อมูลนักกีฬา',
            PLAYER_CREATED: 'เพิ่มนักกีฬา',
            PLAYER_DELETED: 'ลบนักกีฬา',
            OFFICIAL_CREATED: 'เพิ่มเจ้าหน้าที่ทีม',
            OFFICIAL_UPDATED: 'แก้ไขข้อมูลเจ้าหน้าที่',
            OFFICIAL_DELETED: 'ลบเจ้าหน้าที่',
            PLAYER_CORRECTION_SUBMITTED: 'ส่งข้อมูลนักกีฬาที่แก้ไข',
            TEAM_ROSTER_SUBMITTED: 'ยืนยันส่งรายชื่อทีม',
            TEAM_CATEGORY_REGISTRATION_CANCELLED: 'ยกเลิกการสมัครรุ่นแข่งขัน',
            TEAM_CATEGORY_STATE_REPAIRED: 'แก้ไขสถานะรุ่นที่ไม่สอดคล้อง',
            TEAM_ROSTER_SUBMISSION_RESET: 'ยกเลิกการยืนยันรายชื่อ',
            TEAM_CATEGORY_REGISTRATION_RESTORED: 'คืนสถานะรุ่นแข่งขัน',
            TEAM_CREATED: 'เพิ่มทีม',
            TEAM_CATEGORY_ADDED: 'เพิ่มรุ่นแข่งขัน',
            ADMIN_USER_CREATED: 'เพิ่มบัญชีผู้ดูแล',
            SAT_OFFICER_CREATED: 'เพิ่มเจ้าหน้าที่ กกท.',
            SAT_OFFICER_UPDATED: 'แก้ไขเจ้าหน้าที่ กกท.',
            SAT_OFFICER_DELETED: 'ลบเจ้าหน้าที่ กกท.',
            SUPPORT_REPORT_CREATED: 'แจ้งปัญหาใหม่',
            SUPPORT_MESSAGE_CREATED: 'เพิ่มข้อความในรายการปัญหา',
            BRACKET_CREATED: 'สร้างผังการแข่งขัน',
            BRACKET_CLEARED: 'ล้างผังการแข่งขัน',
            BRACKET_TEAM_MOVED: 'ย้ายทีมในผังการแข่งขัน',
            MUTATION_REQUEST_COMPLETED: 'คำขอเปลี่ยนข้อมูลเสร็จสิ้น',
            MUTATION_REQUEST_FAILED: 'คำขอเปลี่ยนข้อมูลไม่สำเร็จ',
            MUTATION_REQUEST_REDIRECTED: 'คำขอเปลี่ยนข้อมูลถูกเปลี่ยนเส้นทาง'
        };
        const stateLabels = {
            status: 'สถานะทีม',
            teamName: 'ชื่อทีม',
            province: 'จังหวัด',
            district: 'อำเภอ',
            gender: 'ประเภททีม',
            isDeleted: 'สถานะการลบ',
            docStatus: 'สถานะเอกสาร',
            jerseyNo: 'หมายเลขเสื้อ',
            position: 'ตำแหน่ง',
            hasLicense: 'มีใบอนุญาต',
            licenseType: 'ประเภทใบอนุญาต',
            category: 'รุ่นแข่งขัน',
            categories: 'รุ่นแข่งขัน',
            submittedCategories: 'รุ่นที่ยืนยัน',
            cancelledCategories: 'รุ่นที่ยกเลิก'
        };
        const summarizeState = (state) => {
            if (!state || typeof state !== 'object' || Array.isArray(state))
                return '—';
            const summary = Object.entries(state)
                .filter(([key, value]) => Object.prototype.hasOwnProperty.call(stateLabels, key) && value !== null && value !== undefined)
                .map(([key, value]) => {
                const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
                return `${stateLabels[key]}: ${displayValue}`;
            });
            return summary.length ? escapeAuditLogHtml(summary.join(' · ')) : '—';
        };
        const roleLabels = {
            SUPER_ADMIN: 'ผู้ดูแลระบบสูงสุด',
            DOCUMENT_VERIFIER: 'เจ้าหน้าที่ตรวจเอกสาร',
            SAT_OFFICER: 'กกท.จังหวัด',
            TEAM: 'บัญชีทีม',
            TEAM_MANAGER: 'ผู้จัดการทีม',
            ANONYMOUS: 'ไม่พบผู้ใช้ที่ยืนยันตัวตน'
        };
        const actorOptions = actorResult.rows.map((actor) => `
      <option value="${escapeAuditLogHtml(actor.actor_id)}" ${actorId === String(actor.actor_id) ? 'selected' : ''}>${escapeAuditLogHtml(actor.actor_name || actor.actor_id)} (${escapeAuditLogHtml(roleLabels[actor.actor_role] || actor.actor_role || 'ไม่ระบุบทบาท')})</option>
    `).join('');
        const stateRows = rowsResult.rows.map((entry) => {
            const createdAt = new Date(entry.created_at);
            const validCreatedAt = !Number.isNaN(createdAt.getTime());
            const displayDate = validCreatedAt
                ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(createdAt)
                : 'วันที่ไม่ถูกต้อง';
            const entityLabels = {
                TEAM: 'ทีม', PLAYER: 'นักกีฬา', OFFICIAL: 'เจ้าหน้าที่', SUPPORT_REPORT: 'รายการแจ้งปัญหา',
                SUPPORT_MESSAGE: 'ข้อความแจ้งปัญหา', ADMIN_USER: 'บัญชีผู้ดูแล', SAT_OFFICER: 'เจ้าหน้าที่ กกท.',
                BRACKET: 'ผังการแข่งขัน', HTTP_REQUEST: 'คำขอระบบ'
            };
            const entityType = entityLabels[String(entry.entity_type || '')] || String(entry.entity_type || 'รายการ');
            const eventType = String(entry.event_type || 'ไม่ระบุรายการ');
            const actorRole = String(entry.actor_role || 'ไม่ระบุบทบาท');
            const changedFields = typeof entry.metadata?.changedFields === 'string' ? entry.metadata.changedFields : '';
            const targetSummary = entry.metadata?.targetId
                ? `${String(entry.metadata?.operationEntity || 'รายการ')} ${String(entry.metadata.targetId)}`
                : '';
            const eventRoute = typeof entry.metadata?.route === 'string' ? entry.metadata.route : entry.metadata?.requestRoute;
            const eventMethod = entry.metadata?.method || entry.metadata?.requestMethod || '';
            const requestSummary = typeof eventRoute === 'string'
                ? `${String(entry.metadata?.action || eventType)} · ${String(eventMethod)} ${eventRoute}${entry.metadata?.httpStatus ? ` · HTTP ${String(entry.metadata.httpStatus)}` : ''}${entry.metadata?.outcome ? ` · ${String(entry.metadata.outcome)}` : ''}${entry.metadata?.failureClass ? ` · ${String(entry.metadata.failureClass)}` : ''}${targetSummary ? ` · ${targetSummary}` : ''}`
                : '';
            return `
        <tr>
          <td class="text-nowrap"><time${validCreatedAt ? ` datetime="${createdAt.toISOString()}"` : ''}>${escapeAuditLogHtml(displayDate)}</time></td>
          <td><span class="fw-semibold">${escapeAuditLogHtml(entry.actor_name || entry.actor_id || 'ไม่ระบุผู้ใช้')}</span><br><small class="text-muted">${escapeAuditLogHtml(roleLabels[actorRole] || actorRole)}</small></td>
          <td><span class="badge bg-primary-subtle text-primary-emphasis">${escapeAuditLogHtml(eventLabels[eventType] || eventType)}</span><br><small class="text-muted">${escapeAuditLogHtml(eventType)}</small>${changedFields ? `<br><small>ฟิลด์ที่เปลี่ยน: ${escapeAuditLogHtml(changedFields)}</small>` : ''}${requestSummary ? `<br><small>${escapeAuditLogHtml(requestSummary)}</small>` : ''}${entry.request_id ? `<br><small class="font-monospace">Request ID: ${escapeAuditLogHtml(entry.request_id)}</small>` : ''}</td>
          <td class="text-nowrap">${escapeAuditLogHtml(entityType)}<br><small class="text-muted font-monospace">${escapeAuditLogHtml(entry.entity_id || '—')}</small>${entry.team_id && entry.entity_type !== 'TEAM' ? `<br><small class="text-muted">ทีม ${escapeAuditLogHtml(entry.team_id)}</small>` : ''}</td>
          <td>${summarizeState(entry.old_state)}</td>
          <td>${summarizeState(entry.new_state)}</td>
        </tr>`;
        }).join('');
        const visibleFrom = total ? offset + 1 : 0;
        const visibleTo = offset + rowsResult.rows.length;
        const resultSummary = total
            ? `แสดง ${visibleFrom.toLocaleString('th-TH')}–${visibleTo.toLocaleString('th-TH')} จาก ${total.toLocaleString('th-TH')} รายการ`
            : 'ไม่พบรายการ Audit Log';
        const pageHref = (targetPage) => {
            const params = new URLSearchParams();
            if (fromDate)
                params.set('fromDate', fromDate);
            if (toDate)
                params.set('toDate', toDate);
            if (fromTime)
                params.set('fromTime', fromTime);
            if (toTime)
                params.set('toTime', toTime);
            if (actorId)
                params.set('actorId', actorId);
            if (requestId)
                params.set('requestId', requestId);
            params.set('page', String(targetPage));
            return `${base}/admin/audit-log.php?${params.toString()}`;
        };
        const pagination = totalPages > 1 ? `
      <nav aria-label="เปลี่ยนหน้า Audit Log" class="d-flex justify-content-center align-items-center gap-3 mt-3">
        ${page > 1 ? `<a class="btn btn-sm btn-outline-secondary" href="${escapeAuditLogHtml(pageHref(page - 1))}" aria-label="หน้าก่อนหน้า">ก่อนหน้า</a>` : '<button class="btn btn-sm btn-outline-secondary" disabled>ก่อนหน้า</button>'}
        <span class="small text-muted">หน้า ${page.toLocaleString('th-TH')} / ${totalPages.toLocaleString('th-TH')}</span>
        ${page < totalPages ? `<a class="btn btn-sm btn-outline-secondary" href="${escapeAuditLogHtml(pageHref(page + 1))}" aria-label="หน้าถัดไป">ถัดไป</a>` : '<button class="btn btn-sm btn-outline-secondary" disabled>ถัดไป</button>'}
      </nav>` : '';
        const hasDateRange = Boolean(fromDate && toDate);
        const bodyContent = `
      <section class="card p-4 shadow-sm border-0 rounded-3" aria-labelledby="auditLogHeading">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
          <div>
            <h4 id="auditLogHeading" class="fw-bold text-navy mb-1"><i class="bi bi-journal-text me-2"></i>Audit Log</h4>
            <p class="text-muted small mb-0">ประวัติการเปลี่ยนข้อมูลและผลคำขอของผู้ใช้ทุกบทบาท</p>
          </div>
          <span class="badge bg-light text-dark border">${escapeAuditLogHtml(resultSummary)}</span>
        </div>

        <form method="GET" action="${escapeAuditLogHtml(base)}/admin/audit-log.php" class="border rounded-3 p-3 mb-3" aria-label="ตัวกรอง Audit Log">
          <div class="row g-3 align-items-end">
            <div class="col-12 col-md-3">
              <label for="auditFromDate" class="form-label small fw-semibold">วันที่เริ่มต้น</label>
              <input id="auditFromDate" name="fromDate" type="date" class="form-control" value="${escapeAuditLogHtml(fromDate)}">
            </div>
            <div class="col-12 col-md-3">
              <label for="auditToDate" class="form-label small fw-semibold">วันที่สิ้นสุด</label>
              <input id="auditToDate" name="toDate" type="date" class="form-control" value="${escapeAuditLogHtml(toDate)}">
            </div>
            <div id="auditTimeFilters" class="col-12 row g-3 m-0 p-0" style="display:${hasDateRange ? 'flex' : 'none'}">
              <div class="col-12 col-md-3">
                <label for="auditFromTime" class="form-label small fw-semibold">เวลาตั้งแต่</label>
                <input id="auditFromTime" name="fromTime" type="time" class="form-control" value="${escapeAuditLogHtml(fromTime)}">
              </div>
              <div class="col-12 col-md-3">
                <label for="auditToTime" class="form-label small fw-semibold">เวลาถึง</label>
                <input id="auditToTime" name="toTime" type="time" class="form-control" value="${escapeAuditLogHtml(toTime)}">
              </div>
            </div>
            <div class="col-12 col-md-4">
              <label for="auditActorId" class="form-label small fw-semibold">ผู้ใช้</label>
              <select id="auditActorId" name="actorId" class="form-select">
                <option value="">ผู้ใช้ทั้งหมด</option>
                ${actorOptions}
              </select>
            </div>
            <div class="col-12 col-md-4">
              <label for="auditRequestId" class="form-label small fw-semibold">Request ID</label>
              <input id="auditRequestId" name="requestId" type="text" class="form-control font-monospace" maxlength="36" value="${escapeAuditLogHtml(requestId)}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
            </div>
            <div class="col-12 d-flex gap-2">
              <button type="submit" class="btn btn-primary"><i class="bi bi-funnel me-1"></i>ค้นหา</button>
              <a href="${escapeAuditLogHtml(base)}/admin/audit-log.php" class="btn btn-outline-secondary">ล้างตัวกรอง</a>
            </div>
          </div>
        </form>

        <div class="table-responsive">
          <table class="table table-hover table-striped table-bordered align-middle mb-0" aria-label="ตาราง Audit Log">
            <thead class="table-light">
              <tr><th scope="col">วันและเวลา</th><th scope="col">ผู้ใช้</th><th scope="col">การกระทำ</th><th scope="col">รายการ</th><th scope="col">ค่าเดิมที่บันทึก</th><th scope="col">ค่าใหม่ที่บันทึก</th></tr>
            </thead>
            <tbody>${stateRows || '<tr><td colspan="6" class="text-center text-muted py-4"><i class="bi bi-inbox me-1"></i>ไม่พบรายการ Audit Log ตามตัวกรอง</td></tr>'}</tbody>
          </table>
        </div>
        ${pagination}
      </section>
      <script>
        (() => {
          const fromDateInput = document.getElementById('auditFromDate');
          const toDateInput = document.getElementById('auditToDate');
          const timeFilters = document.getElementById('auditTimeFilters');
          const fromTimeInput = document.getElementById('auditFromTime');
          const toTimeInput = document.getElementById('auditToTime');
          const updateTimeFilters = () => {
            const showTimes = Boolean(fromDateInput.value && toDateInput.value);
            timeFilters.style.display = showTimes ? 'flex' : 'none';
            if (!showTimes) {
              fromTimeInput.value = '';
              toTimeInput.value = '';
            }
          };
          fromDateInput.addEventListener('change', updateTimeFilters);
          toDateInput.addEventListener('change', updateTimeFilters);
        })();
      </script>`;
        res.send((0, adminLayout_1.renderAdminLayout)('Audit Log', bodyContent, 'audit-log', base, currentUser));
    }
    catch (error) {
        console.error('Error loading admin audit log:', error);
        return res.status(500).send('ไม่สามารถโหลด Audit Log ได้ในขณะนี้');
    }
});
