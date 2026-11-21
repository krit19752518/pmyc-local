import { getTeamDistrictName, normalizeDistrictName } from '../../utils/teamArea';
import { changeTeamCategory, readPersistedCategoryStates, TeamCategoryError } from '../../services/teamCategory.service';
import { getRegistrationArea, getTeamRegistrationRanks } from '../../services/teamRegistrationRank.service';
import { Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from '../../db';
import { renderTeamLayout } from '../../teamLayout';
import { upload } from '../../middleware/upload';
import {
  teamProfile,
  teamsDatabase,
  playersDatabase,
  officialsDatabase,
  parseCategories,
  getBaseUrl,
  parseCookies,
  getDbTeamProfile,
  getDbRegisteredTeams,
  getLoggedTeamId,
  getDbPlayers,
  getDbPlayerById,
  getDbOfficials,
  isPlayerPlayingUp,
  checkTeamSession
} from '../../app';

import { getCategoryStatus, getTeamStatusInfo, getPlayerDocStatusInfo, isPlayerCorrectionRequired } from '../../utils/statusHelper';
import { getTeamCategoryState, splitTeamCategories, TEAM_CATEGORIES } from '../../utils/teamCategoryState';
import { getAuditFieldChanges, writeAuditLog } from '../../services/auditLog.service';
import { buildTeamSessionCookies, requireSignedTeamSession } from '../../services/teamSession.service';
import { OFFICIAL_POSITION_PRIORITY, getOfficialForCategoryAndPosition, getTopOfficialForCategory } from '../../models/official.model';
import { getPersistedDbPlayers } from '../../models/player.model';
import { withDbTransaction } from '../../services/dbTransaction.service';

const router = Router();
export { router as teamRosterRouter };
const MIN_GOALKEEPERS = 3;


const hasValidStoredOfficialDocument = (value: unknown) => {
    const documentPath = String(value ?? '').trim();
    const normalizedPath = documentPath.toLocaleLowerCase();
    return Boolean(documentPath) && !['null', 'undefined', 'none', 'n/a', 'na', '-', '#', 'placeholder', 'placeholder.pdf', '/uploads/'].includes(normalizedPath);
};
const normalizeOfficialIdCardForDuplicateCheck = (value: unknown): string => {
  const normalizedValue = String(value ?? '').trim().normalize('NFKC');
  if (/^[0-9\s().-]+$/.test(normalizedValue)) {
    return `numeric:${normalizedValue.replace(/\D/g, '')}`;
  }
  return `text:${normalizedValue.replace(/\s+/g, ' ').toLocaleUpperCase()}`;
};

// Route: /team/switch-team.php (Switch active team ID in session)
router.get('/team/switch-team.php', checkTeamSession, requireSignedTeamSession, async (req: Request, res: Response) => {
  const base = getBaseUrl(req);
  const targetTeamId = (req.query.teamId as string || '').trim();
  const session = (req as any).teamSession as { teamUser: string; createdAt: number };
  if (!targetTeamId) return res.redirect(`${base}/team/players.php`);

  try {
    const allowedTeam = await pool.query(
      `SELECT id FROM football_registered_team
       WHERE id::text = $1 AND COALESCE(is_deleted, FALSE) = FALSE AND (
         LOWER(COALESCE(username, '')) = LOWER($2) OR
         LOWER(COALESCE(phone, '')) = LOWER($2) OR
         LOWER(COALESCE(email, '')) = LOWER($2) OR
         LOWER(COALESCE(team_name, '')) = LOWER($2)
       )
       LIMIT 1`,
      [targetTeamId, session.teamUser]
    );
    if (!allowedTeam.rows.length) return res.status(403).send('บัญชีของท่านไม่มีสิทธิ์เข้าถึงทีมนี้');
  } catch (error) {
    console.error('Unable to verify team switch ownership:', error);
    return res.status(503).send('ไม่สามารถตรวจสอบสิทธิ์ทีมได้ กรุณาลองใหม่อีกครั้ง');
  }

  res.setHeader('Set-Cookie', buildTeamSessionCookies(req, targetTeamId, session.teamUser, session.createdAt));
  return res.redirect(`${base}/team/players.php`);
});

// Page 5: /team/index.php (Dashboard Overview)
router.get('/team/index.php', checkTeamSession, async (req: Request, res: Response) => {
  const base = getBaseUrl(req);
  const teamId = await getLoggedTeamId(req);
  const profile = await getDbTeamProfile(req);
  let players: any[];
  try {
    players = await getPersistedDbPlayers(teamId);
  } catch (error) {
    console.error('Unable to load persisted roster for dashboard counts:', error);
    return res.status(503).send('ไม่สามารถโหลดจำนวนนักกีฬาที่บันทึกไว้ได้ กรุณาลองใหม่อีกครั้ง');
  }
  const officials = await getDbOfficials(teamId);
  let categoryStates;
  try {
    categoryStates = (await readPersistedCategoryStates(pool, [profile])).get(String(profile.id))!;
  } catch (error) {
    console.error('Unable to load persisted category state:', error);
    return res.status(503).send('ไม่สามารถตรวจสอบสถานะรุ่นได้ กรุณาลองใหม่');
  }

  const hasCat = (p: any, cat: string) => (p.category || p.categories || 'U14').toUpperCase().split(',').map((c: string) => c.trim()).includes(cat);
  const u14Count = players.filter(p => hasCat(p, 'U14')).length;
  const u16Count = players.filter(p => hasCat(p, 'U16')).length;
  const u18Count = players.filter(p => hasCat(p, 'U18')).length;

  const allTeams = await getDbRegisteredTeams(Boolean(profile.isDemo));
  const registrationRanks = getTeamRegistrationRanks(allTeams);
  const registrationArea = getRegistrationArea(profile);

  const registeredCategories = Array.isArray(profile.categories) ? profile.categories : [];
const currentTeamCancelledCats = (profile.cancelled_categories || profile.cancelledCategories || '').toUpperCase().split(',').map((c: string) => c.trim());
  const categoryStatusTeam = { ...profile, categories: registeredCategories.join(',') };

  const correctionPlayersByCategory = Object.fromEntries(registeredCategories.map((cat: string) => [cat, players.filter(p => {
            const playerCategories = String(p.category || p.categories || 'U14').toUpperCase().split(',').map((value) => value.trim());
            return playerCategories.includes(cat.toUpperCase()) && isPlayerCorrectionRequired(p);
        }).map(p => ({
            id: String(p.id), name: String(p.name || 'ไม่ระบุชื่อ'), photo: String(p.photoUrl || p.photo_url || ''),
            idCard: String(p.idCard || p.id_card || '-'), jersey: String(p.jerseyNo ?? p.jersey_no ?? '-'),
            position: String(p.position || '-'), remarks: String(p.remarks || 'ไม่ระบุ')
        }))]));
const correctionPlayersJson = JSON.stringify(correctionPlayersByCategory).replace(/</g, '\\u003c');
const playerCategoryRowsHtml = ['U14', 'U16', 'U18'].map((cat) => {
        const count = cat === 'U14' ? u14Count : (cat === 'U16' ? u16Count : u18Count);
        const catBadge = cat === 'U14' ? 'bg-info text-dark' : (cat === 'U16' ? 'bg-primary' : 'bg-danger');
        const isCurrentTeamCatCancelled = categoryStates[cat] === 'CANCELLED';
        if (categoryStates[cat] === 'UNAVAILABLE')
            return `<li class="list-group-item text-muted">รุ่น ${cat}: ไม่สามารถใช้งานข้อมูลทีมได้ กรุณาติดต่อเจ้าหน้าที่</li>`;
        if (categoryStates[cat] === 'INCONSISTENT') {
            return `<li class="list-group-item d-flex justify-content-between align-items-center py-3 px-4">
        <div class="d-flex align-items-center flex-wrap gap-2"><span class="fw-bold">รายชื่อนักกีฬา</span>
        <span class="badge ${catBadge}">รุ่น ${cat}</span><span class="text-warning-emphasis">ข้อมูลสถานะรุ่นไม่สอดคล้อง กรุณาติดต่อเจ้าหน้าที่เพื่อตรวจสอบ</span></div>
      </li>`;
        }
        if (categoryStates[cat] === 'NOT_REGISTERED') {
            return `<li class="list-group-item d-flex justify-content-between align-items-center py-3 px-4">
        <div class="d-flex align-items-center flex-wrap gap-2"><span class="fw-bold">รายชื่อนักกีฬา</span>
          <span class="badge ${catBadge}">รุ่น ${cat}</span><span class="text-muted">ยังไม่ได้สมัครรุ่นนี้</span></div>
        <button type="button" class="btn btn-success btn-sm" data-add-category="${cat}" onclick="openAddCategoryModal('${cat}')">เพิ่มรุ่น</button>
      </li>`;
        }
        const sequenceNo = registrationRanks[String(teamId).trim()]?.[cat] || 0;
        const registrationBadge = sequenceNo > 0
            ? `<span class="badge bg-light text-dark border fs-6 px-3 py-2 ms-1"><i class="bi bi-hash me-1"></i>ลำดับที่ลงทะเบียน ${sequenceNo}</span>`
            : `<span class="badge bg-light text-muted border ms-1">${!registrationArea.district ? 'ยังไม่ระบุอำเภอ' : (!registrationArea.province ? 'ยังไม่ระบุจังหวัด' : 'ยังจัดลำดับไม่ได้')}</span>`;
        const statusBadge = count >= 18 && count <= 30
            ? `<span class="badge bg-success fs-6 px-3 py-2 fw-semibold">ครบ ${count} คน</span>`
            : (count > 0
                ? `<span class="badge bg-warning text-dark fs-6 px-3 py-2 fw-semibold">ปัจจุบัน ${count} คน (สิทธิ์ 18-30 คน)</span>`
                : `<span class="badge bg-secondary fs-6 px-3 py-2 fw-semibold">ยังไม่มีข้อมูล (0 คน)</span>`);
        const categoryStatus = getCategoryStatus(categoryStatusTeam, cat, players);
        const categoryStatusBadge = categoryStatus.text === 'ปรับแก้ข้อมูลนักกีฬา'
            ? `<button type="button" class="btn btn-link p-0 border-0" onclick="openPlayerCorrections('${cat}')" aria-label="เปิดรายชื่อนักกีฬาที่ต้องปรับแก้ รุ่น ${cat}">${categoryStatus.badgeHtml.replace('px-2 py-1', 'fs-6 px-3 py-2 fw-semibold')}</button>`
            : categoryStatus.badgeHtml.replace('px-2 py-1', 'fs-6 px-3 py-2 fw-semibold');
        if (isCurrentTeamCatCancelled) {
            return `
        <li class="list-group-item d-flex justify-content-between align-items-center py-3 px-4">
          <div class="d-flex align-items-center flex-wrap gap-2">
            <span class="fs-6 fw-bold text-dark"><i class="bi bi-people-fill me-2 text-primary"></i>รายชื่อนักกีฬา</span>
            <a href="${base}/team/players.php?category=${cat}" class="badge ${catBadge} text-decoration-none fs-6 px-3 py-2 ms-1 me-1 shadow-sm" title="คลิกเพื่อดูและจัดการรายชื่อนักกีฬา รุ่น ${cat}">รุ่น ${cat} <i class="bi bi-arrow-right-circle ms-1"></i></a>
            <span class="badge bg-danger-subtle text-danger border border-danger-subtle fs-6 px-3 py-2 ms-1"><i class="bi bi-x-circle me-1"></i>ได้ทำการยกเลิกการสมัครแล้ว</span>
          </div>
          <div class="d-flex align-items-center flex-wrap justify-content-end gap-2">${categoryStatusBadge}${statusBadge}</div>
        </li>
      `;
        }
        return `
        <li class="list-group-item d-flex justify-content-between align-items-center py-3 px-4">
          <div class="d-flex align-items-center flex-wrap gap-2">
            <span class="fs-6 fw-bold text-dark"><i class="bi bi-people-fill me-2 text-primary"></i>รายชื่อนักกีฬา</span>
            <a href="${base}/team/players.php?category=${cat}" class="badge ${catBadge} text-decoration-none fs-6 px-3 py-2 ms-1 me-1 shadow-sm" title="คลิกเพื่อดูและจัดการรายชื่อนักกีฬา รุ่น ${cat}">รุ่น ${cat} <i class="bi bi-arrow-right-circle ms-1"></i></a>
            ${registrationBadge}
            <button type="button" class="btn btn-outline-danger btn-sm fs-6 px-3 py-1 ms-2" onclick="openCancelCategoryModal('${cat}')"><i class="bi bi-x-circle me-1"></i>ยกเลิกการสมัคร</button>
          </div>
          <div class="d-flex align-items-center flex-wrap justify-content-end gap-2">${categoryStatusBadge}${statusBadge}</div>
        </li>
      `;
    }).join('');

  let teamStatusAlertHtml = `
    <div class="alert alert-warning border-warning d-flex align-items-center gap-3 mb-4">
      <i class="bi bi-hourglass-split fs-3 text-warning"></i>
      <div>
        <h6 class="fw-bold mb-1 text-dark">สถานะทีม: รอการตรวจสอบ (PENDING)</h6>
        <small class="mb-0 text-muted">ทีมของคุณได้ส่งข้อมูลเข้าระบบแล้ว ขณะนี้อยู่ระหว่างการตรวจสอบเอกสารและคุณสมบัติจากเจ้าหน้าที่</small>
      </div>
    </div>
  `;

  if (profile.status === 'APPROVED') {
    teamStatusAlertHtml = `
      <div class="alert alert-success border-success d-flex align-items-center gap-3 mb-4">
        <i class="bi bi-check-circle-fill fs-3 text-success"></i>
        <div>
          <h6 class="fw-bold mb-1 text-success">สถานะทีม: ผ่านการรับรองสิทธิ์เข้าร่วมการแข่งขันแล้ว (APPROVED)</h6>
          <small class="mb-0 text-dark opacity-75">ทีมของคุณลงทะเบียนและได้รับการอนุมัติการรับรองสิทธิ์เข้าร่วมรายการ Prime Minister's Youth CUP Football เรียบร้อยแล้ว</small>
        </div>
      </div>
    `;
  } else if (profile.status === 'REJECTED') {
    const rejectReasonText = profile.reject_reason ? ` (เหตุผล: ${profile.reject_reason})` : '';
    teamStatusAlertHtml = `
      <div class="alert alert-danger border-danger d-flex align-items-center gap-3 mb-4">
        <i class="bi bi-x-circle-fill fs-3 text-danger"></i>
        <div>
          <h6 class="fw-bold mb-1 text-danger">สถานะทีม: คุณสมบัติไม่ผ่าน / ไม่ได้รับการรับรอง (REJECTED)</h6>
          <small class="mb-0 text-dark opacity-75">ทีมของคุณไม่ผ่านการอนุมัติรับรองสิทธิ์จากเจ้าหน้าที่${rejectReasonText} กรุณาติดต่อผู้ดูแลระบบเพื่อแก้ไขข้อมูล</small>
        </div>
      </div>
    `;
  }

  const hasManagerInfo = Boolean(profile.managerName && String(profile.managerName).trim() && profile.phone && String(profile.phone).trim());
  const subdistrictVal = profile.contact_subdistrict ?? profile.subdistrict;
  const districtVal = normalizeDistrictName(profile.contact_district || profile.district, profile.contact_province || profile.province);
  const provinceVal = profile.contact_province || profile.province;
  const hasAddressInfo = Boolean(profile.house_no && String(profile.house_no).trim() && subdistrictVal && String(subdistrictVal).trim() && districtVal && String(districtVal).trim() && provinceVal && String(provinceVal).trim());

  const missingParts: string[] = [];
  if (!hasManagerInfo) missingParts.push('ข้อมูลผู้จัดการทีม / ผู้ประสานงาน');
  if (!hasAddressInfo) missingParts.push('ที่อยู่สำหรับติดต่อ');

  const teamInfoStatusBadge = missingParts.length === 0
    ? `<span class="badge bg-success fs-6 px-3 py-2 fw-semibold">ครบถ้วน</span>`
    : `<span class="badge bg-warning text-dark fs-6 px-3 py-2 fw-semibold">ข้อมูลยังไม่ครบ ขาดส่วน ${missingParts.join(', ')}</span>`;

  let regDateTimeStr = '-';
  if (profile.createdAt || profile.created_at) {
    try {
      const dt = new Date(profile.createdAt || profile.created_at);
      if (!isNaN(dt.getTime())) {
        const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const day = dt.getDate();
        const month = thMonths[dt.getMonth()];
        const yearBE = dt.getFullYear() + 543;
        const hours = String(dt.getHours()).padStart(2, '0');
        const mins = String(dt.getMinutes()).padStart(2, '0');
        regDateTimeStr = `${day} ${month} ${yearBE} ${hours}:${mins} น.`;
      }
    } catch (e) {}
  }

  const content = `
  <div class="card shadow-sm border-0 mb-4">
    <div class="card-header bg-white border-bottom fw-bold text-navy py-3">
      <i class="bi bi-speedometer2 me-2"></i> ภาพรวมทีม (Overview)
    </div>
    <div class="card-body p-4">
      ${teamStatusAlertHtml}

      <div class="row g-2 row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-6 mb-4">
        <div class="col">
          <div class="card bg-light border p-3 text-center h-100 justify-content-center">
            <small class="text-muted fw-semibold">วัน / เวลา ที่ลงสมัคร</small>
            <h6 class="fw-bold text-navy mt-1 mb-0">${regDateTimeStr}</h6>
          </div>
        </div>
        <div class="col">
          <div class="card bg-light border p-3 text-center h-100 justify-content-center">
            <small class="text-muted fw-semibold">สโมสร / โรงเรียน / อะคาเดมี่ / สังกัด</small>
            <h6 class="fw-bold text-navy mt-1 mb-0">${profile.school || '-'}</h6>
          </div>
        </div>
        <div class="col">
          <div class="card bg-light border p-3 text-center h-100 justify-content-center">
            <small class="text-muted fw-semibold">จังหวัด</small>
            <h6 class="fw-bold text-navy mt-1 mb-0">${profile.province || '-'}</h6>
          </div>
        </div>
        <div class="col">
          <div class="card bg-light border p-3 text-center h-100 justify-content-center">
            <small class="text-muted fw-semibold">โซน / เขต / อำเภอ</small>
            <h6 class="fw-bold text-navy mt-1 mb-0">${getTeamDistrictName(profile) || '-'}</h6>
          </div>
        </div>
        <div class="col">
          <div class="card bg-light border p-3 text-center h-100 justify-content-center">
            <small class="text-muted fw-semibold">จำนวนนักกีฬา (รวมทุกรุ่น)</small>
            <h6 class="fw-bold text-navy mt-1 mb-0">${players.length} คน</h6>
          </div>
        </div>
        <div class="col">
          <div class="card bg-light border p-3 text-center h-100 justify-content-center">
            <small class="text-muted fw-semibold">เจ้าหน้าที่ประจำทีม</small>
            <h6 class="fw-bold text-navy mt-1 mb-0">${officials.length} คน</h6>
          </div>
        </div>
      </div>

      <h6 class="fw-bold text-navy mb-3"><i class="bi bi-check2-square me-1"></i> รายการตรวจเช็คความสมบูรณ์ของข้อมูล</h6>
      <ul class="list-group mb-4">
        <li class="list-group-item d-flex justify-content-between align-items-center py-3 px-4">
          <span class="fs-6 fw-bold text-dark"><i class="bi bi-shield-check text-success me-2"></i> ข้อมูลทีมและสถานที่ติดต่อ</span>
          ${teamInfoStatusBadge}
        </li>
        
        ${playerCategoryRowsHtml}

        <li class="list-group-item d-flex justify-content-between align-items-center py-3 px-4">
          <span class="fs-6 fw-bold text-dark"><i class="bi bi-person-badge-fill text-success me-2"></i> รายชื่อเจ้าหน้าที่ทีมและผู้ฝึกสอน</span>
          <span class="badge bg-success fs-6 px-3 py-2 fw-semibold">${officials.length > 0 ? 'ครบถ้วน' : 'ยังไม่ระบุ'}</span>
        </li>
      </ul>
    </div>
  </div>

  <div class="card shadow-sm border-0 mb-4" id="teamSupportReportsCard">
    <div class="card-header bg-white border-bottom fw-bold text-navy py-3">
      <i class="bi bi-inbox me-2"></i> ตรวจสอบสถานะการแจ้งปัญหาการใช้งานระบบ
    </div>
    <div class="card-body p-3 p-md-4">
      <div id="teamSupportReportsMessage" class="alert d-none" role="status"></div>
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-3">
          <thead class="table-light"><tr>
            <th style="width:44px"><span class="visually-hidden">บทสนทนา</span></th><th>ลำดับ</th><th>ปัญหาที่แจ้ง</th><th>วัน-เวลาแจ้ง</th><th>สถานะปัญหา</th><th>รายละเอียด</th>
          </tr></thead>
          <tbody id="teamSupportReportRows"><tr><td colspan="6" class="text-center text-muted py-4">กำลังโหลดรายการ...</td></tr></tbody>
        </table>
      </div>
      <div class="d-flex justify-content-between align-items-center gap-2">
        <small class="text-muted" id="teamSupportReportsCount"></small>
        <div class="btn-group btn-group-sm" role="group" aria-label="แบ่งหน้ารายการแจ้งปัญหา">
          <button class="btn btn-outline-secondary" id="teamSupportReportsPrevious" type="button">ก่อนหน้า</button>
          <button class="btn btn-outline-secondary" id="teamSupportReportsNext" type="button">ถัดไป</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const teamPlayerCorrections = ${correctionPlayersJson};
    function openPlayerCorrections(category) {
      const players = teamPlayerCorrections[category] || [];
      const escapeCorrectionHtml = value => String(value == null || value === '' ? '-' : value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[character]));
      const rows = players.map((player, index) => {
        const photo = player.photo
          ? '<img src="' + ${JSON.stringify(base)} + escapeCorrectionHtml(player.photo) + '" width="44" height="44" class="rounded border object-fit-cover" alt="">'
          : '<span class="badge bg-secondary">ไม่มีรูป</span>';
        const editUrl = ${JSON.stringify(base + '/team/player-edit.php?id=')} + encodeURIComponent(player.id) + '&returnCategory=' + encodeURIComponent(category);
        return '<tr><td>' + (index + 1) + '</td><td>' + photo + '</td><td>' + escapeCorrectionHtml(player.name) + '</td><td>' + escapeCorrectionHtml(player.idCard) + '</td><td>' + escapeCorrectionHtml(player.jersey) + '</td><td>' + escapeCorrectionHtml(player.position) + '</td><td><span class="badge bg-info text-dark">' + escapeCorrectionHtml(category) + '</span></td><td><span class="badge bg-danger">ปรับแก้ข้อมูลนักกีฬา</span><div class="small text-danger mt-1">' + escapeCorrectionHtml(player.remarks) + '</div></td><td><a class="btn btn-sm btn-outline-primary" href="' + editUrl + '">แก้ไข</a></td></tr>';
      }).join('');
      Swal.fire({
        title: 'นักกีฬาที่ต้องปรับแก้ข้อมูล รุ่น ' + escapeCorrectionHtml(category),
        width: 'min(1200px, 96vw)',
        html: '<div class="table-responsive"><table class="table table-bordered table-striped align-middle text-start"><thead><tr><th>#</th><th>รูปถ่าย</th><th>ชื่อ-นามสกุล</th><th>เลขบัตรประชาชน</th><th>หมายเลขเสื้อ</th><th>ตำแหน่ง</th><th>รุ่นอายุ</th><th>สถานะ / หมายเหตุ</th><th>การจัดการ</th></tr></thead><tbody>' + (rows || '<tr><td colspan="9" class="text-center">ไม่พบข้อมูล</td></tr>') + '</tbody></table></div>',
        showConfirmButton: false,
        showCloseButton: true
      });
    }

    function openCancelCategoryModal(cat) {
      if (!cat) return;
      
      Swal.fire({
        title: 'ยืนยันการยกเลิกการสมัคร',
        html: '<div class="py-2">' +
          '<p class="fs-5 text-dark mb-2">คุณต้องการยืนยันการยกเลิกการสมัครแข่งขัน</p>' +
          '<h3 class="fw-bold text-danger mb-3">รุ่น ' + cat + '</h3>' +
          '<p class="text-muted small mb-0">เมื่อยกเลิกการสมัครในรุ่นนี้แล้ว ลำดับที่ลงทะเบียนจะถูกยกเลิก และระบบจะคืนสิทธิ์ปรับลำดับให้ทีมอื่นในเขต/อำเภอทันที</p>' +
          '</div>',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '<i class="bi bi-check-circle-fill me-1"></i> ตกลง (ยืนยันยกเลิก)',
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true,
        focusCancel: true
      }).then(function(result) {
        if (result.isConfirmed) {
          Swal.fire({
            title: 'กำลังดำเนินการยกเลิก...',
            allowOutsideClick: false,
            didOpen: function() { Swal.showLoading(); }
          });

          fetch('${base}/api/team/cancel-category', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ category: cat })
          })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data && data.success) {
              Swal.fire({
                icon: 'success',
                title: 'ยกเลิกการสมัครเรียบร้อยแล้ว',
                text: 'ระบบทำการยกเลิกการสมัครรุ่น ' + cat + ' เรียบร้อยแล้ว',
                confirmButtonColor: '#0b2a5b',
                timer: 1800,
                showConfirmButton: false
              }).then(function() {
                window.location.href = window.location.pathname + '?t=' + Date.now();
              });
            } else {
              Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: data.error || 'ไม่สามารถยกเลิกการสมัครได้',
                confirmButtonColor: '#0b2a5b'
              });
            }
          })
          .catch(function(err) {
            Swal.fire({
              icon: 'error',
              title: 'เกิดข้อผิดพลาด',
              text: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้',
              confirmButtonColor: '#0b2a5b'
            });
          });
        }
      });
    }

    function openAddCategoryModal(cat) {
      Swal.fire({
        title: 'ยืนยันเพิ่มรุ่น ' + cat,
        text: 'ต้องการเพิ่มรุ่น ' + cat + ' ให้ทีมใช่หรือไม่? เมื่อยืนยันแล้วจะสามารถเพิ่มนักกีฬาในรุ่นนี้ได้',
        icon: 'question', showCancelButton: true,
        confirmButtonText: 'ตกลง เพิ่มรุ่น', cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#198754', cancelButtonColor: '#6c757d'
      }).then(function(result) {
        if (!result.isConfirmed) return;
        fetch('${base}/api/team/add-category', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify({ category: cat }) })
          .then(function(response) { return response.json(); })
          .then(function(data) {
            if (!data || !data.success) throw new Error(data?.error || 'ไม่สามารถเพิ่มรุ่นได้');
            window.location.href = window.location.pathname + '?t=' + Date.now();
          })
          .catch(function(error) { Swal.fire({ icon: 'error', title: 'เพิ่มรุ่นไม่สำเร็จ', text: error.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', confirmButtonColor: '#0b2a5b' }); });
      });
    }

    (() => {
      const apiBase = ${JSON.stringify(base)};
      const rows = document.getElementById('teamSupportReportRows');
      const message = document.getElementById('teamSupportReportsMessage');
      const count = document.getElementById('teamSupportReportsCount');
      const previousButton = document.getElementById('teamSupportReportsPrevious');
      const nextButton = document.getElementById('teamSupportReportsNext');
      const pageSize = 10;
      const statusLabels = {
        OPEN: ['รับแจ้งแล้ว', 'warning', 'text-dark'],
        IN_PROGRESS: ['กำลังดำเนินการ', 'primary', 'text-white'],
        RESOLVED: ['แก้ไขแล้ว', 'success', 'text-white'],
        CLOSED: ['ปิดรายการ', 'secondary', 'text-white']
      };
      let page = 1;
      let total = 0;

      const showError = text => {
        message.textContent = text;
        message.className = 'alert alert-danger';
      };
      const formatDate = value => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('th-TH');
      };
      const readApiResponse = async response => {
        const contentType = response.headers && response.headers.get('content-type') || '';
        const body = await response.text();
        if (!contentType.toLowerCase().includes('application/json')) {
          throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง (HTTP ' + response.status + ') กรุณาเข้าสู่ระบบใหม่หรือติดต่อผู้ดูแลระบบ');
        }
        let data;
        try {
          data = JSON.parse(body);
        } catch (_) {
          throw new Error('เซิร์ฟเวอร์ตอบกลับ JSON ไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ');
        }
        if (!response.ok || !data.success) throw new Error(data.error || 'โหลดรายการแจ้งปัญหาไม่สำเร็จ');
        return data;
      };
      const createConversationRow = (report, parentRow, columnCount) => {
        const toggleCell = document.createElement('td');
        const detailRow = document.createElement('tr');
        detailRow.hidden = true;
        const detailCell = document.createElement('td');
        detailCell.colSpan = columnCount;
        const panel = document.createElement('div');
        panel.className = 'p-2 bg-light rounded';
        const feedback = document.createElement('div');
        feedback.className = 'small text-muted mb-2';
        feedback.textContent = 'กด + เพื่อโหลดประวัติข้อความ';
        const historyRows = document.createElement('tbody');
        const historyTable = document.createElement('table');
        historyTable.className = 'table table-sm table-bordered align-middle mb-0';
        historyTable.innerHTML = '<thead class="table-light"><tr><th style="width:64px">ลำดับ</th><th>ข้อความ</th><th style="width:260px">ผู้ส่ง / วันเวลา</th></tr></thead>';
        historyTable.append(historyRows);
        panel.append(feedback, historyTable);
        detailCell.append(panel);
        detailRow.append(detailCell);

        if (report.has_messages) {
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'btn btn-outline-primary btn-sm px-2 py-0';
          toggle.textContent = '+';
          toggle.setAttribute('aria-expanded', 'false');
          toggle.setAttribute('aria-label', 'แสดงบทสนทนา ' + report.id);
          let loaded = false;
          let loading = false;
          toggle.addEventListener('click', async () => {
            const expanded = toggle.getAttribute('aria-expanded') !== 'true';
            toggle.setAttribute('aria-expanded', String(expanded));
            toggle.textContent = expanded ? '−' : '+';
            toggle.setAttribute('aria-label', (expanded ? 'ซ่อน' : 'แสดง') + 'บทสนทนา ' + report.id);
            if (parentRow.nextElementSibling !== detailRow) parentRow.after(detailRow);
            detailRow.hidden = !expanded;
            if (!expanded || loaded || loading) return;

            loading = true;
            feedback.className = 'small text-muted mb-2';
            feedback.textContent = 'กำลังโหลดประวัติข้อความ...';
            try {
              const response = await fetch(apiBase + '/api/team/support/reports/' + encodeURIComponent(report.id) + '/messages', {
                credentials: 'same-origin', headers: { 'Accept': 'application/json' }
              });
              const data = await readApiResponse(response);
              historyRows.replaceChildren();
              if (!data.messages.length) {
                feedback.className = 'small text-muted mb-2';
                feedback.textContent = 'ไม่พบข้อความในประวัติ';
              } else {
                data.messages.forEach((item, index) => {
                  const messageRow = document.createElement('tr');
                  messageRow.className = item.sender_type === 'ADMIN' ? 'table-primary' : 'table-success';
                  const sequence = document.createElement('td');
                  sequence.textContent = String(index + 1);
                  const content = document.createElement('td');
                  content.className = 'text-break';
                  content.style.whiteSpace = 'pre-wrap';
                  content.textContent = item.message;
                  const sender = document.createElement('td');
                  sender.textContent = (item.sender_type === 'ADMIN' ? 'ผู้ดูแลระบบ: ' : 'ผู้ใช้งาน: ') + item.sender_name + ' (' + item.sender_role + ')';
                  const sentAt = document.createElement('small');
                  sentAt.className = 'd-block text-muted';
                  sentAt.textContent = formatDate(item.created_at);
                  sender.append(sentAt);
                  messageRow.append(sequence, content, sender);
                  historyRows.append(messageRow);
                });
                feedback.className = 'small text-muted mb-2';
                feedback.textContent = '';
              }
              loaded = true;
            } catch (error) {
              feedback.className = 'small text-danger mb-2';
              feedback.textContent = error instanceof Error ? error.message : 'โหลดประวัติข้อความไม่สำเร็จ';
            } finally {
              loading = false;
            }
          });
          toggleCell.append(toggle);
        }
        return toggleCell;
      };
      const escapeHtml = value => String(value == null || value === '' ? '-' : value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[character]));
      const openDetails = report => {
        const status = statusLabels[report.status];
        const statusText = status ? status[0] : (report.status || 'ไม่ระบุ');
        const attachments = Array.isArray(report.attachments) ? report.attachments : [];
        const attachmentBase = apiBase + '/api/team/support/reports/' + encodeURIComponent(report.id) + '/attachments/';
        const attachmentHtml = attachments.map(item => {
          const url = attachmentBase + encodeURIComponent(item.id);
          return '<a class="d-inline-block me-2 mb-2" target="_blank" rel="noopener noreferrer" href="' + url + '">' +
            '<img alt="รูปแนบ" src="' + url + '" style="width:110px;height:82px;object-fit:cover;border-radius:6px"></a>';
        }).join('');
        Swal.fire({
          title: 'รายละเอียดปัญหา',
          width: 760,
          html: '<div class="text-start">' +
            '<p><b>เลขที่:</b> ' + escapeHtml(report.id) + '</p>' +
            '<p><b>วันที่แจ้ง:</b> ' + escapeHtml(formatDate(report.created_at)) + '</p>' +
            '<p><b>สถานะ:</b> ' + escapeHtml(statusText) + '</p>' +
            '<p><b>หน้าที่พบปัญหา:</b> ' + escapeHtml(report.page_description) + ' · ' + escapeHtml(report.page_path) + '</p>' +
            '<p><b>รายละเอียด:</b></p><div class="border rounded p-3 mb-3" style="white-space:pre-wrap">' + escapeHtml(report.description) + '</div>' +
            '<div class="mb-3"><label for="teamSupportAdditionalInfo" class="form-label fw-semibold">ข้อมูลเพิ่มเติมจากผู้ใช้งาน</label>' +
            '<textarea id="teamSupportAdditionalInfo" class="form-control" rows="4" maxlength="10000" placeholder="เพิ่มข้อมูลประกอบปัญหานี้"></textarea></div>' +
            '<div class="d-flex align-items-center gap-3"><button id="teamSupportAdditionalInfoSave" type="button" class="btn btn-primary btn-sm">บันทึกข้อมูลเพิ่มเติม</button>' +
            '<span id="teamSupportAdditionalInfoMessage" class="small" role="status"></span></div>' +
            '<div id="teamSupportHistoryFeedback" class="small text-danger mt-2" role="status"></div>' +
            '<h6 class="fw-bold mt-4">ประวัติการแจ้งข้อมูลปัญหา</h6>' +
            '<div class="table-responsive"><table class="table table-bordered align-middle"><thead class="table-light"><tr>' +
            '<th style="width:64px">ลำดับ</th><th>ข้อมูลเพิ่มเติม</th><th style="width:220px">ผู้ส่ง</th></tr></thead>' +
            '<tbody id="teamSupportHistoryRows"><tr><td colspan="3" class="text-center text-muted">กำลังโหลดประวัติ...</td></tr></tbody></table></div>' +
            (attachmentHtml ? '<p><b>รูปแนบ:</b></p><div>' + attachmentHtml + '</div>' : '') +
            '</div>',
          confirmButtonText: 'ปิด',
          didOpen: () => {
            const textarea = document.getElementById('teamSupportAdditionalInfo');
            const saveButton = document.getElementById('teamSupportAdditionalInfoSave');
            const saveMessage = document.getElementById('teamSupportAdditionalInfoMessage');
            const historyRows = document.getElementById('teamSupportHistoryRows');
            const historyFeedback = document.getElementById('teamSupportHistoryFeedback');
            const loadMessages = async () => {
              historyFeedback.textContent = '';
              historyRows.replaceChildren();
              const response = await fetch(apiBase + '/api/team/support/reports/' + encodeURIComponent(report.id) + '/messages', {
                credentials: 'same-origin',
                headers: { 'Accept': 'application/json' }
              });
              const data = await readApiResponse(response);
              if (!data.messages.length) {
                const emptyRow = document.createElement('tr');
                const emptyCell = document.createElement('td');
                emptyCell.colSpan = 3;
                emptyCell.className = 'text-center text-muted';
                emptyCell.textContent = 'ยังไม่มีข้อมูลเพิ่มเติม';
                emptyRow.append(emptyCell);
                historyRows.append(emptyRow);
                return;
              }
              data.messages.forEach((item, index) => {
                const row = document.createElement('tr');
                row.className = item.sender_type === 'ADMIN' ? 'table-primary' : 'table-success';
                const sequence = document.createElement('td');
                sequence.textContent = String(index + 1);
                const content = document.createElement('td');
                content.className = 'text-break';
                content.style.whiteSpace = 'pre-wrap';
                content.textContent = item.message;
                const sender = document.createElement('td');
                sender.textContent = (item.sender_type === 'ADMIN' ? 'ผู้ดูแลระบบ: ' : 'ผู้ใช้งาน: ') + item.sender_name + ' (' + item.sender_role + ')';
                const sentAt = document.createElement('small');
                sentAt.className = 'd-block text-muted';
                sentAt.textContent = formatDate(item.created_at);
                sender.append(sentAt);
                row.append(sequence, content, sender);
                historyRows.append(row);
              });
            };
            void loadMessages().catch(error => {
              historyFeedback.textContent = error instanceof Error ? error.message : 'โหลดประวัติข้อความไม่สำเร็จ';
            });
            saveButton.addEventListener('click', async () => {
              if (!textarea.value.trim()) {
                saveMessage.textContent = 'กรุณากรอกข้อมูลเพิ่มเติม';
                saveMessage.className = 'small text-danger';
                return;
              }
              saveButton.disabled = true;
              saveMessage.textContent = 'กำลังบันทึกข้อมูล...';
              saveMessage.className = 'small text-muted';
              try {
                const response = await fetch(apiBase + '/api/team/support/reports/' + encodeURIComponent(report.id) + '/additional-info', {
                  method: 'PUT',
                  credentials: 'same-origin',
                  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                  body: JSON.stringify({ additionalInfo: textarea.value })
                });
                const data = await readApiResponse(response);
                report.additional_info = data.report.additional_info || '';
                textarea.value = '';
                saveMessage.textContent = 'บันทึกข้อมูลเพิ่มเติมเรียบร้อยแล้ว';
                saveMessage.className = 'small text-success';
                try {
                  await loadMessages();
                } catch (error) {
                  historyFeedback.textContent = error instanceof Error ? error.message : 'โหลดประวัติข้อความไม่สำเร็จ';
                }
                await loadReports();
              } catch (error) {
                saveMessage.textContent = error instanceof Error ? error.message : 'บันทึกข้อมูลเพิ่มเติมไม่สำเร็จ';
                saveMessage.className = 'small text-danger';
              } finally {
                saveButton.disabled = false;
              }
            });
          }
        });
      };
      const renderRows = reports => {
        rows.replaceChildren();
        if (!reports.length) {
          const row = document.createElement('tr');
          const cell = document.createElement('td');
          cell.colSpan = 6;
          cell.className = 'text-center text-muted py-4';
          cell.textContent = 'ยังไม่มีรายการแจ้งปัญหา';
          row.append(cell);
          rows.append(row);
          return;
        }
        reports.forEach((report, index) => {
          const row = document.createElement('tr');
          row.append(createConversationRow(report, row, 6));
          const sequenceCell = document.createElement('td');
          sequenceCell.textContent = String((page - 1) * pageSize + index + 1);
          row.append(sequenceCell);

          const descriptionCell = document.createElement('td');
          descriptionCell.className = 'text-break';
          descriptionCell.textContent = report.description || '-';
          row.append(descriptionCell);

          const dateCell = document.createElement('td');
          dateCell.textContent = formatDate(report.created_at);
          row.append(dateCell);

          const statusCell = document.createElement('td');
          const status = statusLabels[report.status];
          const badge = document.createElement('span');
          badge.className = 'badge bg-' + (status ? status[1] : 'secondary') + ' ' + (status ? status[2] : 'text-white');
          badge.textContent = status ? status[0] : (report.status || 'ไม่ระบุ');
          statusCell.append(badge);
          row.append(statusCell);

          const detailCell = document.createElement('td');
          const detailButton = document.createElement('button');
          detailButton.type = 'button';
          detailButton.className = 'btn btn-outline-primary btn-sm';
          detailButton.textContent = 'ดูรายละเอียด';
          detailButton.addEventListener('click', () => openDetails(report));
          detailCell.append(detailButton);
          row.append(detailCell);
          rows.append(row);
        });
      };
      const loadReports = async () => {
        rows.replaceChildren();
        const loadingRow = document.createElement('tr');
        const loadingCell = document.createElement('td');
        loadingCell.colSpan = 6;
        loadingCell.className = 'text-center text-muted py-4';
        loadingCell.textContent = 'กำลังโหลดรายการ...';
        loadingRow.append(loadingCell);
        rows.append(loadingRow);
        try {
          const response = await fetch(apiBase + '/api/team/support/reports?page=' + page + '&limit=' + pageSize, {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json' }
          });
          const data = await readApiResponse(response);
          total = data.total;
          renderRows(data.reports);
          count.textContent = 'รายการทั้งหมด ' + total + ' · หน้า ' + page + ' / ' + Math.max(1, Math.ceil(total / pageSize));
          previousButton.disabled = page <= 1;
          nextButton.disabled = page * pageSize >= total;
          message.className = 'alert d-none';
        } catch (error) {
          showError(error instanceof Error ? error.message : 'โหลดรายการแจ้งปัญหาไม่สำเร็จ');
          rows.replaceChildren();
        }
      };
      previousButton.addEventListener('click', () => { if (page > 1) { page--; void loadReports(); } });
      nextButton.addEventListener('click', () => { if (page * pageSize < total) { page++; void loadReports(); } });
      void loadReports();
    })();
  </script>`;
  res.send(renderTeamLayout('ภาพรวมทีม', content, 'index', base, profile));
});

router.post('/api/team/cancel-category', checkTeamSession, requireSignedTeamSession, async (req: Request, res: Response) => {
  const teamId = String((req as any).teamSession.teamId);
  try {
    const result = await withDbTransaction(async client => {
      const result = await changeTeamCategory(client, teamId, req.body?.category, 'cancel');
      if (result.changed) await writeAuditLog(req, {
        eventType: 'TEAM_CATEGORY_REGISTRATION_CANCELLED', entityType: 'TEAM', entityId: teamId, teamId,
        oldState: result.oldState, newState: result.newState, metadata: { category: result.category }
      }, client);
      return result;
    });
    const cached = teamsDatabase.find(team => String(team.id).trim() === teamId);
    if (cached) {
      cached.cancelled_categories = result.cancelledCategories.join(',');
      cached.cancelledCategories = result.cancelledCategories.join(',');
    }
    (req as any).auditPersistenceState = 'DATABASE';
    return res.json({ success: true, unchanged: !result.changed, message: result.changed ? 'ยกเลิกการสมัครแข่งขันเรียบร้อยแล้ว' : 'รุ่นนี้ยกเลิกการสมัครแล้ว', cancelled_categories: result.cancelledCategories.join(',') });
  } catch (error) {
    if (error instanceof TeamCategoryError) return res.status(error.status).json({ success: false, error: error.message });
    console.error('Unable to cancel team category:', error);
    return res.status(500).json({ success: false, error: 'ไม่สามารถบันทึกสถานะรุ่นได้ ไม่มีการยืนยันการเปลี่ยนแปลง กรุณาโหลดหน้าใหม่' });
  }
});

  // Page 6: /team/team.php (Team Profile) - Fully Editable & Stateful
router.get('/team/team.php', checkTeamSession, async (req: Request, res: Response) => {
  const base = getBaseUrl(req);
  const profile = await getDbTeamProfile(req);
  const content = `
  <div class="card shadow-sm border-0">
    <div class="card-header bg-white border-bottom fw-bold text-navy py-3">
      <i class="bi bi-shield-shaded me-2"></i> ข้อมูลทีมและสถานที่ติดต่อ
    </div>
    <div class="card-body p-4">
      <form id="team_update_form" action="${base}/api/team/team-update" method="POST" enctype="multipart/form-data">

        <script>
          document.addEventListener('DOMContentLoaded', function() {
            const form = document.getElementById('team_update_form');
            if (form) {
              form.addEventListener('submit', function(e) {
                const MAX_FILE_SIZE = 4 * 1024 * 1024;
                const fileInputs = [
                  { input: form.querySelector('input[name="doc_team_cert"]'), label: 'หนังสือรับรองทีม' }
                ];
                for (const item of fileInputs) {
                  if (item.input && item.input.files && item.input.files.length > 0) {
                    const file = item.input.files[0];
                    if (file.size > MAX_FILE_SIZE) {
                      e.preventDefault();
                      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
                      Swal.fire({
                        icon: 'error',
                        title: 'ขนาดไฟล์เกินกำหนด (ไม่เกิน 4 MB)',
                        text: 'ไฟล์ "' + item.label + '" มีขนาด ' + fileSizeMB + ' MB ซึ่งเกินขนาดสูงสุดที่อนุญาต (4 MB)',
                        confirmButtonColor: '#0b2a5b'
                      });
                      return;
                    }
                  }
                }
              });
            }
          });
        </script>

        <h6 class="fw-bold text-primary mb-3 border-bottom pb-2"><i class="bi bi-shield-shaded me-1"></i> ข้อมูลทีม</h6>
        <div class="row g-3 mb-4">
          <div class="col-md-6">
            <label class="form-label fw-semibold required">สโมสร / โรงเรียน / อะคาเดมี่ / สังกัด</label>
            <input type="text" class="form-control" value="${profile.school}" name="school" required>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold">รหัสสถานศึกษา</label>
            <input type="text" class="form-control" value="${profile.school_code}" name="school_code">
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold required">จังหวัดส่งเข้าร่วม</label>
            <select name="province" class="form-select" required>
              <option value="">— เลือกจังหวัด —</option>
              <option value="กระบี่" ${profile.province === 'กระบี่' ? 'selected' : ''}>กระบี่</option>
              <option value="กรุงเทพมหานคร" ${profile.province === 'กรุงเทพมหานคร' ? 'selected' : ''}>กรุงเทพมหานคร</option>
              <option value="กาญจนบุรี" ${profile.province === 'กาญจนบุรี' ? 'selected' : ''}>กาญจนบุรี</option>
              <option value="กาฬสินธุ์" ${profile.province === 'กาฬสินธุ์' ? 'selected' : ''}>กาฬสินธุ์</option>
              <option value="กำแพงเพชร" ${profile.province === 'กำแพงเพชร' ? 'selected' : ''}>กำแพงเพชร</option>
              <option value="ขอนแก่น" ${profile.province === 'ขอนแก่น' ? 'selected' : ''}>ขอนแก่น</option>
              <option value="จันทบุรี" ${profile.province === 'จันทบุรี' ? 'selected' : ''}>จันทบุรี</option>
              <option value="ฉะเชิงเทรา" ${profile.province === 'ฉะเชิงเทรา' ? 'selected' : ''}>ฉะเชิงเทรา</option>
              <option value="ชลบุรี" ${profile.province === 'ชลบุรี' ? 'selected' : ''}>ชลบุรี</option>
              <option value="ชัยนาท" ${profile.province === 'ชัยนาท' ? 'selected' : ''}>ชัยนาท</option>
              <option value="ชัยภูมิ" ${profile.province === 'ชัยภูมิ' ? 'selected' : ''}>ชัยภูมิ</option>
              <option value="ชุมพร" ${profile.province === 'ชุมพร' ? 'selected' : ''}>ชุมพร</option>
              <option value="ตรัง" ${profile.province === 'ตรัง' ? 'selected' : ''}>ตรัง</option>
              <option value="ตราด" ${profile.province === 'ตราด' ? 'selected' : ''}>ตราด</option>
              <option value="ตาก" ${profile.province === 'ตาก' ? 'selected' : ''}>ตาก</option>
              <option value="นครนายก" ${profile.province === 'นครนายก' ? 'selected' : ''}>นครนายก</option>
              <option value="นครปฐม" ${profile.province === 'นครปฐม' ? 'selected' : ''}>นครปฐม</option>
              <option value="นครพนม" ${profile.province === 'นครพนม' ? 'selected' : ''}>นครพนม</option>
              <option value="นครราชสีมา" ${profile.province === 'นครราชสีมา' ? 'selected' : ''}>นครราชสีมา</option>
              <option value="นครศรีธรรมราช" ${profile.province === 'นครศรีธรรมราช' ? 'selected' : ''}>นครศรีธรรมราช</option>
              <option value="นครสวรรค์" ${profile.province === 'นครสวรรค์' ? 'selected' : ''}>นครสวรรค์</option>
              <option value="นนทบุรี" ${profile.province === 'นนทบุรี' ? 'selected' : ''}>นนทบุรี</option>
              <option value="นราธิวาส" ${profile.province === 'นราธิวาส' ? 'selected' : ''}>นราธิวาส</option>
              <option value="น่าน" ${profile.province === 'น่าน' ? 'selected' : ''}>น่าน</option>
              <option value="บึงกาฬ" ${profile.province === 'บึงกาฬ' ? 'selected' : ''}>บึงกาฬ</option>
              <option value="บุรีรัมย์" ${profile.province === 'บุรีรัมย์' ? 'selected' : ''}>บุรีรัมย์</option>
              <option value="ปทุมธานี" ${profile.province === 'ปทุมธานี' ? 'selected' : ''}>ปทุมธานี</option>
              <option value="ประจวบคีรีขันธ์" ${profile.province === 'ประจวบคีรีขันธ์' ? 'selected' : ''}>ประจวบคีรีขันธ์</option>
              <option value="ปราจีนบุรี" ${profile.province === 'ปราจีนบุรี' ? 'selected' : ''}>ปราจีนบุรี</option>
              <option value="ปัตตานี" ${profile.province === 'ปัตตานี' ? 'selected' : ''}>ปัตตานี</option>
              <option value="พระนครศรีอยุธยา" ${profile.province === 'พระนครศรีอยุธยา' ? 'selected' : ''}>พระนครศรีอยุธยา</option>
              <option value="พะเยา" ${profile.province === 'พะเยา' ? 'selected' : ''}>พะเยา</option>
              <option value="พังงา" ${profile.province === 'พังงา' ? 'selected' : ''}>พังงา</option>
              <option value="พัทลุง" ${profile.province === 'พัทลุง' ? 'selected' : ''}>พัทลุง</option>
              <option value="พิจิตร" ${profile.province === 'พิจิตร' ? 'selected' : ''}>พิจิตร</option>
              <option value="พิษณุโลก" ${profile.province === 'พิษณุโลก' ? 'selected' : ''}>พิษณุโลก</option>
              <option value="ภูเก็ต" ${profile.province === 'ภูเก็ต' ? 'selected' : ''}>ภูเก็ต</option>
              <option value="มหาสารคาม" ${profile.province === 'มหาสารคาม' ? 'selected' : ''}>มหาสารคาม</option>
              <option value="มุกดาหาร" ${profile.province === 'มุกดาหาร' ? 'selected' : ''}>มุกดาหาร</option>
              <option value="ยะลา" ${profile.province === 'ยะลา' ? 'selected' : ''}>ยะลา</option>
              <option value="ยโสธร" ${profile.province === 'ยโสธร' ? 'selected' : ''}>ยโสธร</option>
              <option value="ระนอง" ${profile.province === 'ระนอง' ? 'selected' : ''}>ระนอง</option>
              <option value="ระยอง" ${profile.province === 'ระยอง' ? 'selected' : ''}>ระยอง</option>
              <option value="ราชบุรี" ${profile.province === 'ราชบุรี' ? 'selected' : ''}>ราชบุรี</option>
              <option value="ร้อยเอ็ด" ${profile.province === 'ร้อยเอ็ด' ? 'selected' : ''}>ร้อยเอ็ด</option>
              <option value="ลพบุรี" ${profile.province === 'ลพบุรี' ? 'selected' : ''}>ลพบุรี</option>
              <option value="ลำปาง" ${profile.province === 'ลำปาง' ? 'selected' : ''}>ลำปาง</option>
              <option value="ลำพูน" ${profile.province === 'ลำพูน' ? 'selected' : ''}>ลำพูน</option>
              <option value="ศรีสะเกษ" ${profile.province === 'ศรีสะเกษ' ? 'selected' : ''}>ศรีสะเกษ</option>
              <option value="สกลนคร" ${profile.province === 'สกลนคร' ? 'selected' : ''}>สกลนคร</option>
              <option value="สงขลา" ${profile.province === 'สงขลา' ? 'selected' : ''}>สงขลา</option>
              <option value="สตูล" ${profile.province === 'สตูล' ? 'selected' : ''}>สตูล</option>
              <option value="สมุทรปราการ" ${profile.province === 'สมุทรปราการ' ? 'selected' : ''}>สมุทรปราการ</option>
              <option value="สมุทรสงคราม" ${profile.province === 'สมุทรสงคราม' ? 'selected' : ''}>สมุทรสงคราม</option>
              <option value="สมุทรสาคร" ${profile.province === 'สมุทรสาคร' ? 'selected' : ''}>สมุทรสาคร</option>
              <option value="สระบุรี" ${profile.province === 'สระบุรี' ? 'selected' : ''}>สระบุรี</option>
              <option value="สระแก้ว" ${profile.province === 'สระแก้ว' ? 'selected' : ''}>สระแก้ว</option>
              <option value="สิงห์บุรี" ${profile.province === 'สิงห์บุรี' ? 'selected' : ''}>สิงห์บุรี</option>
              <option value="สุพรรณบุรี" ${profile.province === 'สุพรรณบุรี' ? 'selected' : ''}>สุพรรณบุรี</option>
              <option value="สุราษฎร์ธานี" ${profile.province === 'สุราษฎร์ธานี' ? 'selected' : ''}>สุราษฎร์ธานี</option>
              <option value="สุรินทร์" ${profile.province === 'สุรินทร์' ? 'selected' : ''}>สุรินทร์</option>
              <option value="สุโขทัย" ${profile.province === 'สุโขทัย' ? 'selected' : ''}>สุโขทัย</option>
              <option value="หนองคาย" ${profile.province === 'หนองคาย' ? 'selected' : ''}>หนองคาย</option>
              <option value="หนองบัวลำภู" ${profile.province === 'หนองบัวลำภู' ? 'selected' : ''}>หนองบัวลำภู</option>
              <option value="อำนาจเจริญ" ${profile.province === 'อำนาจเจริญ' ? 'selected' : ''}>อำนาจเจริญ</option>
              <option value="อุดรธานี" ${profile.province === 'อุดรธานี' ? 'selected' : ''}>อุดรธานี</option>
              <option value="อุตรดิตถ์" ${profile.province === 'อุตรดิตถ์' ? 'selected' : ''}>อุตรดิตถ์</option>
              <option value="อุทัยธานี" ${profile.province === 'อุทัยธานี' ? 'selected' : ''}>อุทัยธานี</option>
              <option value="อุบลราชธานี" ${profile.province === 'อุบลราชธานี' ? 'selected' : ''}>อุบลราชธานี</option>
              <option value="อ่างทอง" ${profile.province === 'อ่างทอง' ? 'selected' : ''}>อ่างทอง</option>
              <option value="เชียงราย" ${profile.province === 'เชียงราย' ? 'selected' : ''}>เชียงราย</option>
              <option value="เชียงใหม่" ${profile.province === 'เชียงใหม่' ? 'selected' : ''}>เชียงใหม่</option>
              <option value="เพชรบุรี" ${profile.province === 'เพชรบุรี' ? 'selected' : ''}>เพชรบุรี</option>
              <option value="เพชรบูรณ์" ${profile.province === 'เพชรบูรณ์' ? 'selected' : ''}>เพชรบูรณ์</option>
              <option value="เลย" ${profile.province === 'เลย' ? 'selected' : ''}>เลย</option>
              <option value="แพร่" ${profile.province === 'แพร่' ? 'selected' : ''}>แพร่</option>
              <option value="แม่ฮ่องสอน" ${profile.province === 'แม่ฮ่องสอน' ? 'selected' : ''}>แม่ฮ่องสอน</option>
            </select>
          </div>

          <div class="col-md-6" id="bkkZoneContainer" style="display: ${profile.province === 'กรุงเทพมหานคร' ? 'block' : 'none'};">
            <label class="form-label fw-semibold required">โซนพื้นที่ (กรุงเทพมหานคร)</label>
            <select name="bkk_zone" class="form-select" data-bkk-zone-select>
              <option value="">— เลือกโซนพื้นที่ —</option>
              <option value="ฝั่งธนบุรี" ${profile.bkk_zone === 'ฝั่งธนบุรี' ? 'selected' : ''}>ฝั่งธนบุรี (15 เขต)</option>
              <option value="พระนคร 1" ${profile.bkk_zone === 'พระนคร 1' ? 'selected' : ''}>พระนคร 1 (กรุงเทพกลาง & กรุงเทพเหนือ - 16 เขต)</option>
              <option value="พระนคร 2" ${profile.bkk_zone === 'พระนคร 2' ? 'selected' : ''}>พระนคร 2 (กรุงเทพใต้ & กรุงเทพตะวันออก - 19 เขต)</option>
            </select>
          </div>

          <div class="col-md-6">
            <label class="form-label fw-semibold">อำเภอ/เขต</label>
            <select name="district" class="form-select" data-district-select data-province-field="province" data-current-val="${profile.district}">
              <option value="">— เลือกอำเภอ/เขต —</option>
              ${profile.district ? `<option value="${profile.district}" selected>${getTeamDistrictName(profile)}</option>` : ''}
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold">ตำบล/แขวง</label>
            <select name="subdistrict" class="form-select" data-subdistrict-select data-district-field="district" data-current-val="${profile.subdistrict && profile.subdistrict !== '{' && profile.subdistrict !== '}' ? profile.subdistrict : ''}">
              <option value="">— เลือกตำบล/แขวง —</option>
              ${profile.subdistrict && profile.subdistrict !== '{' && profile.subdistrict !== '}' ? `<option value="${profile.subdistrict}" selected>${profile.subdistrict}</option>` : ''}
            </select>
          </div>
        </div>

        <h6 class="fw-bold text-primary mb-3 border-bottom pb-2"><i class="bi bi-person-lines-fill me-1"></i> ผู้ประสานงาน</h6>
        <div class="row g-3 mb-4">
          <div class="col-md-6">
            <label class="form-label fw-semibold required">ผู้ประสานงาน</label>
            <input type="text" class="form-control" value="${profile.managerName}" name="managerName" required>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold required">อีเมล</label>
            <input type="email" class="form-control" value="${profile.email}" name="email" required>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold required">เบอร์โทรศัพท์ติดต่อ</label>
            <input type="text" class="form-control" value="${profile.phone}" name="phone" required>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold required">LINE ID</label>
            <input type="text" class="form-control" value="${profile.line_id}" name="line_id" required>
          </div>
        </div>

        <h6 class="fw-bold text-primary mb-3 border-bottom pb-2"><i class="bi bi-geo-alt-fill me-1"></i> ที่อยู่สำหรับติดต่อ</h6>
        <div class="row g-3 mb-4">
          <div class="col-md-6"><label class="form-label fw-semibold">เลขที่/อาคาร</label><input name="house_no" class="form-control" value="${profile.house_no}"></div>
          <div class="col-md-6"><label class="form-label fw-semibold">ถนน/ซอย</label><input name="road" class="form-control" value="${profile.road}"></div>
          <div class="col-md-4">
            <label class="form-label fw-semibold">จังหวัด</label>
            <select name="contact_province" class="form-select" data-contact-address-step="province" data-current-val="${profile.contact_province}">
              <option value="">— เลือกจังหวัด —</option>
              ${profile.contact_province ? `<option value="${profile.contact_province}" selected>${profile.contact_province}</option>` : ''}
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label fw-semibold">เขต/อำเภอ</label>
            <select name="contact_district" class="form-select" data-district-select data-province-field="contact_province" data-contact-address-step="district" data-current-val="${profile.contact_district}">
              <option value="">— เลือกเขต/อำเภอ —</option>
              ${profile.contact_district ? `<option value="${profile.contact_district}" selected>${profile.contact_district}</option>` : ''}
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label fw-semibold">แขวง/ตำบล</label>
            <select name="contact_subdistrict" class="form-select" data-subdistrict-select data-district-field="contact_district" data-contact-address-step="subdistrict" data-current-val="${profile.contact_subdistrict ?? profile.subdistrict}">
              <option value="">— เลือกตำบล/แขวง —</option>
              ${(profile.contact_subdistrict ?? profile.subdistrict) ? `<option value="${profile.contact_subdistrict ?? profile.subdistrict}" selected>${profile.contact_subdistrict ?? profile.subdistrict}</option>` : ''}
            </select>
          </div>
        </div>

        <!-- เอกสารประจำทีม (Team Documents Upload Section) -->
        <h6 class="fw-bold text-primary mb-3 border-bottom pb-2">
          <i class="bi bi-file-earmark-check-fill me-1"></i> เอกสารยื่นประกอบการลงทะเบียนทีม (JPG, PNG หรือ PDF ไม่เกิน 4 MB)
        </h6>
        <div class="row g-3 mb-4">
          <div class="col-md-6">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <label class="form-label fw-semibold text-dark mb-0">หนังสือรับรองทีม <span class="badge bg-secondary ms-1">OPTIONAL</span></label>
              ${(profile.docTeamCert || profile.doc_team_cert) ? `<button type="button" class="btn btn-sm btn-outline-info py-0 px-2 fs-7" onclick="viewPhoto('หนังสือรับรองทีม', '${base}${(profile.docTeamCert || profile.doc_team_cert)}')"><i class="bi bi-eye me-1"></i> รีวิวเอกสาร</button>` : ''}
            </div>
            <input type="file" name="doc_team_cert" class="form-control" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf">
            ${(profile.docTeamCert || profile.doc_team_cert) ? `<div class="form-text text-success small"><i class="bi bi-check-circle-fill me-1"></i> มีไฟล์เดิมที่อัปโหลดไว้แล้ว</div>` : ''}
          </div>
        </div>

        <div class="text-end pt-2">
          <button type="submit" class="btn btn-warning btn-lg fw-bold px-4">
            <i class="bi bi-save me-1"></i> บันทึกการแก้ไขข้อมูลทีม
          </button>
        </div>
      </form>
    </div>
  </div>`;
  res.send(renderTeamLayout('ข้อมูลทีม', content, 'team', base, profile));
});

// Page 7: /team/players.php (Players Management)
router.get('/team/players.php', checkTeamSession, async (req: Request, res: Response) => {
  const base = getBaseUrl(req);
  const teamId = await getLoggedTeamId(req);
  const profile = await getDbTeamProfile(req);
  const registeredCategories = Array.isArray(profile.categories)
        ? profile.categories
        : profile.categories ? String(profile.categories).split(',').map((c: string) => c.trim()).filter(Boolean) : [];
  const submittedCatsStr = profile.submitted_categories || '';
  const submittedCatsList = submittedCatsStr.split(',').map((c: string) => c.trim()).filter(Boolean);
  const selectedCategory = (req.query.category as string || 'ALL').toUpperCase();
  const returnCategory = ['U14', 'U16', 'U18'].includes(selectedCategory) ? selectedCategory : 'ALL';
  const allPlayers = await getDbPlayers(teamId);
  let persistedPlayers: any[];
  try {
    persistedPlayers = await getPersistedDbPlayers(teamId);
  } catch (error) {
    console.error('Unable to load persisted roster for goalkeeper count:', error);
    return res.status(503).send('ไม่สามารถตรวจสอบจำนวนนักกีฬาที่บันทึกไว้ได้ กรุณาลองใหม่อีกครั้ง');
  }

  const filteredPlayers = selectedCategory === 'ALL'
    ? allPlayers
    : allPlayers.filter(p => {
        const catStr = String(p.category || p.categories || 'U14').toUpperCase();
        return catStr.split(',').map((c: string) => c.trim()).includes(selectedCategory);
      });

  const isApproved = profile.status === 'APPROVED';
  const escapeFilterValue = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character] || character));

  const playerRows = filteredPlayers.map((p, idx) => {
    let photoCell = '';
    const isPlayerCatSubmitted = submittedCatsList.includes(p.category || 'U14');
    const pPhoto = p.photoUrl || p.photo_url || '';
    if (isPlayerCatSubmitted) {
      photoCell = pPhoto
        ? `<img src="${base}${pPhoto}" width="44" height="44" class="rounded border object-fit-cover cursor-pointer" onclick="viewPhoto('${p.name.replace(/'/g, "\\'")}', '${base}${pPhoto}')" alt="${p.name}">`
        : `<span class="badge bg-secondary">ไม่มีรูป</span>`;
    } else {
      photoCell = pPhoto
        ? `<div class="d-flex align-items-center gap-2">
             <img src="${base}${pPhoto}" width="44" height="44" class="rounded border object-fit-cover cursor-pointer" onclick="viewPhoto('${p.name.replace(/'/g, "\\'")}', '${base}${pPhoto}')" alt="${p.name}">
             <button class="btn btn-sm btn-outline-primary" title="เปลี่ยนรูปถ่าย" onclick="triggerPhotoUpload('player', '${p.id}', '${p.name.replace(/'/g, "\\'")}', '${base}')"><i class="bi bi-camera"></i></button>
           </div>`
        : `<div class="d-flex align-items-center gap-2">
             <span class="badge bg-secondary">ไม่มีรูป</span>
             <button class="btn btn-sm btn-outline-primary" title="อัปโหลดรูปถ่าย" onclick="triggerPhotoUpload('player', '${p.id}', '${p.name.replace(/'/g, "\\'")}', '${base}')"><i class="bi bi-camera me-1"></i> อัปโหลด</button>
           </div>`;
    }

    const catStr = String(p.category || p.categories || 'U14');
    let catList = catStr.split(',').map((c: string) => c.trim()).filter(Boolean);
    if (selectedCategory !== 'ALL') {
      catList = catList.filter((cat: string) => cat.toUpperCase() === selectedCategory);
    }
    const categoryBadgesHtml = catList.map((cat: string) => {
      const badgeClass = cat === 'U14' ? 'bg-info text-dark' : (cat === 'U16' ? 'bg-primary' : 'bg-danger');
      return `<span class="badge ${badgeClass} me-1">${cat}</span>`;
    }).join('');

    const playerStatusObj = getPlayerDocStatusInfo(p, profile);
    const docBadge = playerStatusObj.badgeHtml;

    const jerseyDisplay = (p.jerseyNo !== undefined && p.jerseyNo !== null && p.jerseyNo !== '') ? p.jerseyNo : (p.jersey_no !== undefined ? p.jersey_no : '-');
    const playerNameFilter = escapeFilterValue(p.name);
    const playerIdCardFilter = escapeFilterValue(p.idCard || p.id_card || '');
    const playerJerseyFilter = escapeFilterValue(jerseyDisplay);
    const playerPositionFilter = escapeFilterValue(p.position || '-');
    const playerStatusFilter = escapeFilterValue(playerStatusObj.text);

    
const correctionRemark = isPlayerCorrectionRequired(p) ? escapeFilterValue(p.remarks || 'ไม่ระบุ') : '-';
const canManagePlayer = !isPlayerCatSubmitted || isPlayerCorrectionRequired(p);
    const actionCell = !canManagePlayer
      ? `<button class="btn btn-sm btn-outline-secondary me-1" disabled title="ยื่นส่งรายชื่อแล้ว / ผ่านการรับรองแล้ว"><i class="bi bi-pencil-square"></i> แก้ไข</button>
         <button class="btn btn-sm btn-outline-secondary" disabled title="ยื่นส่งรายชื่อแล้ว / ผ่านการรับรองแล้ว"><i class="bi bi-trash"></i> ลบ</button>`
      : `<a href="${base}/team/player-edit.php?id=${p.id}&returnCategory=${returnCategory}" class="btn btn-sm btn-outline-secondary me-1" title="แก้ไขข้อมูลนักกีฬา">
           <i class="bi bi-pencil-square"></i> แก้ไข
         </a>
         <button class="btn btn-sm btn-outline-danger" title="ลบข้อมูลนักกีฬา" onclick="deletePlayer('${p.id}', '${p.name.replace(/'/g, "\\'")}')">
           <i class="bi bi-trash"></i> ลบ
         </button>`;

    return `
      <tr data-player-name="${playerNameFilter}" data-player-id-card="${playerIdCardFilter}" data-player-jersey="${playerJerseyFilter}" data-player-position="${playerPositionFilter}" data-player-document-status="${playerStatusFilter}">
        <td>${idx + 1}</td>
        <td>${photoCell}</td>
        <td><strong>${p.name}</strong></td>
        <td>${p.idCard || '-'}</td>
        <td><span class="badge bg-light text-dark border fs-6 fw-bold">${jerseyDisplay}</span></td>
        <td>${p.position || '-'}</td>
        <td>${categoryBadgesHtml}</td>
        <td>${docBadge}</td>
        <td class="text-break">${correctionRemark}</td>
        <td>${actionCell}</td>
      </tr>
    `;
  }).join('');

  const emptyStateHtml = filteredPlayers.length === 0
    ? `<tr><td colspan="10" class="text-center text-muted py-4"><i class="bi bi-inbox fs-3 d-block mb-1"></i>ไม่พบข้อมูลนักกีฬาในรุ่น ${selectedCategory}</td></tr>`
    : playerRows;

  const categoryFilterButtonsHtml = registeredCategories.map((cat: string) => {
    const btnClass = cat === 'U14' 
      ? (selectedCategory === 'U14' ? 'btn-info text-dark active' : 'btn-outline-info') 
      : (cat === 'U16' 
        ? (selectedCategory === 'U16' ? 'btn-primary active' : 'btn-outline-primary') 
        : (selectedCategory === 'U18' ? 'btn-danger active' : 'btn-outline-danger'));
    return `
      <a href="${base}/team/players.php?category=${cat}" class="btn ${btnClass} fw-semibold">
        รุ่น ${cat}
      </a>
    `;
  }).join('');

  const MIN_PLAYERS = 18;
  const MAX_PLAYERS = 30;

  const catsToDisplayAlert = (selectedCategory !== 'ALL' && registeredCategories.includes(selectedCategory))
    ? [selectedCategory]
    : registeredCategories;

  const goalkeeperAlertHtml = catsToDisplayAlert.map((cat: string) => {
    const catGoalkeeperCount = persistedPlayers.filter(p => {
      const catStr = String(p.category || p.categories || 'U14').toUpperCase();
      const playerCategories = catStr.split(',').map((c: string) => c.trim());
      return playerCategories.includes(cat.toUpperCase()) && String(p.position || '').trim() === 'ผู้รักษาประตู (GK)';
    }).length;
    const missingGoalkeepers = Math.max(0, MIN_GOALKEEPERS - catGoalkeeperCount);
    const alertClass = missingGoalkeepers > 0 ? 'alert-warning border-warning' : 'alert-success border-success';
    const iconClass = missingGoalkeepers > 0
      ? 'bi-exclamation-triangle-fill text-warning'
      : 'bi-check-circle-fill text-success';
    const countClass = missingGoalkeepers > 0 ? 'text-danger' : 'text-success';

    return `
      <div class="alert ${alertClass} d-flex align-items-center mb-3 shadow-sm" role="alert">
        <i class="bi ${iconClass} fs-4 me-3"></i>
        <div>
          <strong class="d-block mb-1">จำนวนผู้รักษาประตู — รุ่น ${cat} (อย่างน้อย ${MIN_GOALKEEPERS} คน)</strong>
          <span>ขณะนี้ทีมของคุณมีผู้รักษาประตูรุ่น ${cat} แล้ว <strong>${catGoalkeeperCount} คน</strong> (ยังขาดอีก <strong class="${countClass}">${missingGoalkeepers} คน</strong>)</span>
        </div>
      </div>
    `;
  }).join('');

  const activeCategory = selectedCategory !== 'ALL' ? selectedCategory : (registeredCategories[0] || 'U14');

  let quotaAlertHtml = '';
  const isSelectedCatSubmitted = selectedCategory !== 'ALL' ? submittedCatsList.includes(selectedCategory) : (submittedCatsList.length === registeredCategories.length);
  if (isApproved && isSelectedCatSubmitted) {
    quotaAlertHtml = `
      <div class="alert alert-success border-0 shadow-sm rounded-3 p-3 mb-4 d-flex align-items-center gap-3">
        <i class="bi bi-check-circle-fill display-6 text-success"></i>
        <div>
          <h6 class="fw-bold text-success mb-1">รับรองแล้ว (อนุมัติรายชื่อและเอกสารแล้ว)</h6>
          <p class="mb-0 small text-dark opacity-75">รายชื่อและเอกสารนักกีฬาของคุณได้รับการตรวจสอบและรับรองจากเจ้าหน้าที่เรียบร้อยแล้ว ระบบทำการล็อกข้อมูลไม่สามารถเพิ่ม แก้ไข หรือลบข้อมูลนักกีฬาได้</p>
        </div>
      </div>
    `;
  } else {
    quotaAlertHtml = catsToDisplayAlert.map((cat: string) => {
      const catPlayers = allPlayers.filter(p => {
        const catStr = String(p.category || p.categories || 'U14').toUpperCase();
        return catStr.split(',').map((c: string) => c.trim()).includes(cat);
      });
      const catCount = catPlayers.length;

      if (catCount < MIN_PLAYERS) {
        const missingCount = MIN_PLAYERS - catCount;
        return `
          <div class="alert alert-warning d-flex align-items-center mb-3 border-warning shadow-sm" role="alert">
            <i class="bi bi-exclamation-triangle-fill fs-4 me-3 text-warning"></i>
            <div>
              <strong class="d-block mb-1">จำนวนนักกีฬาไม่ครบตามเกณฑ์ขั้นต่ำ — รุ่น ${cat} (${MIN_PLAYERS}-${MAX_PLAYERS} คน)</strong>
              <span>ขณะนี้ทีมของคุณมีนักกีฬาลงทะเบียนรุ่น ${cat} แล้ว <strong class="fs-6">${catCount} คน</strong> (ยังขาดอีก <strong class="fs-6 text-danger fw-bold">${missingCount} คน</strong> เพื่อให้ครบเกณฑ์ขั้นต่ำ ${MIN_PLAYERS} คน)</span>
            </div>
          </div>
        `;
      } else if (catCount >= MAX_PLAYERS) {
        return `
          <div class="alert alert-info d-flex align-items-center mb-3 border-info shadow-sm" role="alert">
            <i class="bi bi-info-circle-fill fs-4 me-3 text-info"></i>
            <div>
              <strong class="d-block mb-1">โควตานักกีฬาเต็มจำนวนสูงสุดเรียบร้อยแล้ว — รุ่น ${cat}</strong>
              <span>ขณะนี้ทีมของคุณมีนักกีฬาในรุ่น ${cat} ครบตามโควตาสูงสุด <strong class="fs-6 text-primary fw-bold">${catCount} / ${MAX_PLAYERS} คน</strong> แล้ว</span>
            </div>
          </div>
        `;
      } else {
        const remainingCount = MAX_PLAYERS - catCount;
        return `
          <div class="alert alert-success d-flex align-items-center mb-3 border-success shadow-sm" role="alert">
            <i class="bi bi-check-circle-fill fs-4 me-3 text-success"></i>
            <div>
              <strong class="d-block mb-1">ผ่านเกณฑ์จำนวนนักกีฬาขั้นต่ำเรียบร้อยแล้ว — รุ่น ${cat}</strong>
              <span>ขณะนี้ทีมของคุณมีนักกีฬาลงทะเบียนรุ่น ${cat} แล้ว <strong class="fs-6">${catCount} คน</strong> (สามารถเพิ่มนักกีฬาได้อีก <strong class="fs-6 text-primary fw-bold">${remainingCount} คน</strong>)</span>
            </div>
          </div>
        `;
      }
    }).join('');
  }

  let canAddPlayer = false;
  let addPlayerBtnReason = '';
  let addPlayerTargetCat = '';

  if (registeredCategories.length === 0) {
    addPlayerBtnReason = 'no-categories';
  } else if (selectedCategory === 'ALL') {
        const unsubmittedCats = registeredCategories.filter((c: string) => !submittedCatsList.includes(c));
        if (unsubmittedCats.length === 0) {
            addPlayerBtnReason = 'submitted';
        }
        else {
            const availCat = unsubmittedCats.find((c: string) => {
                const count = allPlayers.filter(p => {
                    const catStr = String(p.category || p.categories || 'U14').toUpperCase();
                    return catStr.split(',').map((catItem) => catItem.trim()).includes(c);
                }).length;
                return count < MAX_PLAYERS;
            });
            if (availCat) {
                canAddPlayer = true;
                addPlayerTargetCat = availCat;
            }
            else {
                addPlayerBtnReason = 'full';
            }
        }
    }
    else {
        const isCatSubmitted = submittedCatsList.includes(selectedCategory);
        if (isCatSubmitted) {
            addPlayerBtnReason = 'submitted';
        }
        else {
            const activeCatPlayers = allPlayers.filter(p => {
                const catStr = String(p.category || p.categories || 'U14').toUpperCase();
                return catStr.split(',').map((c: string) => c.trim()).includes(selectedCategory);
            });
            if (activeCatPlayers.length >= MAX_PLAYERS) {
                addPlayerBtnReason = 'full';
            }
            else {
                canAddPlayer = true;
                addPlayerTargetCat = selectedCategory;
            }
        }
    }

  const addPlayerBtnHtml = canAddPlayer
    ? `<a class="btn btn-primary btn-sm fw-semibold" href="${base}/team/player-edit.php${addPlayerTargetCat ? '?category=' + addPlayerTargetCat : ''}">
         <i class="bi bi-plus-circle me-1"></i> เพิ่มนักกีฬา
       </a>`
    : (addPlayerBtnReason === 'no-categories'
      ? `<button type="button" class="btn btn-secondary btn-sm fw-semibold" disabled title="กรุณาเพิ่มรุ่นจากหน้าภาพรวมทีมก่อน">เพิ่มนักกีฬา (ยังไม่มีรุ่น)</button>`
      : addPlayerBtnReason === 'submitted'
                ? `<button type="button" class="btn btn-secondary btn-sm fw-semibold" disabled title="ยื่นส่งรายชื่อแล้ว">
           <i class="bi bi-plus-circle me-1"></i> เพิ่มนักกีฬา (ส่งรายชื่อแล้ว)
         </button>`
                : `<button type="button" class="btn btn-secondary btn-sm fw-semibold" onclick="alert('ทีมของคุณมีนักกีฬาครบ 30 คนตามโควตาสูงสุดแล้ว ไม่สามารถเพิ่มนักกีฬาได้อีก')">
           <i class="bi bi-plus-circle me-1"></i> เพิ่มนักกีฬา
         </button>`);

  const content = `
  ${quotaAlertHtml}
  ${goalkeeperAlertHtml}
  <div class="card shadow-sm border-0">
    <div class="card-header bg-white border-bottom d-flex flex-wrap justify-content-between align-items-center gap-2 py-3">
      <span class="fw-bold text-navy"><i class="bi bi-people me-2"></i> รายชื่อนักกีฬา</span>
      
      <div class="d-flex align-items-center gap-2 flex-wrap">
        <!-- Category Filter Buttons (Left of Add Player button) -->
        <div class="btn-group btn-group-sm" role="group" aria-label="กรองตามรุ่นอายุ">
          <a href="${base}/team/players.php" class="btn ${selectedCategory === 'ALL' ? 'btn-navy active' : 'btn-outline-navy'} fw-semibold">
            ทั้งหมด
          </a>
          ${categoryFilterButtonsHtml}
        </div>

        <!-- Add Player Button -->
        ${addPlayerBtnHtml}
      </div>
    </div>
    <div class="card-body p-4">
      <div class="row g-3 mb-3" id="playerListFilters">
        <div class="col-md-6 col-xl-3">
          <label for="filterPlayerName" class="form-label fw-semibold">ค้นหาชื่อนักกีฬา</label>
          <input type="search" id="filterPlayerName" class="form-control" placeholder="พิมพ์ชื่อเพื่อค้นหา..." autocomplete="off">
        </div>
        <div class="col-md-6 col-xl-3">
          <label for="filterPlayerIdCard" class="form-label fw-semibold">ค้นหาเลขบัตรประชาชน</label>
          <input type="search" id="filterPlayerIdCard" class="form-control" placeholder="พิมพ์เลขบัตรเพื่อค้นหา..." autocomplete="off">
        </div>
        <div class="col-md-4 col-xl-2">
          <label for="filterPlayerJersey" class="form-label fw-semibold">หมายเลขเสื้อ</label>
          <select id="filterPlayerJersey" class="form-select">
            <option value="">ทั้งหมด</option>
            ${Array.from(new Set(filteredPlayers.map(p => String((p.jerseyNo !== undefined && p.jerseyNo !== null && p.jerseyNo !== '') ? p.jerseyNo : (p.jersey_no !== undefined ? p.jersey_no : '-'))))).sort((a, b) => a.localeCompare(b, 'th', { numeric: true })).map(value => `<option value="${escapeFilterValue(value)}">${escapeFilterValue(value)}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-4 col-xl-2">
          <label for="filterPlayerPosition" class="form-label fw-semibold">ตำแหน่ง</label>
          <select id="filterPlayerPosition" class="form-select">
            <option value="">ทั้งหมด</option>
            ${Array.from(new Set(filteredPlayers.map(p => String(p.position || '-')))).sort((a, b) => a.localeCompare(b, 'th')).map(value => `<option value="${escapeFilterValue(value)}">${escapeFilterValue(value)}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-4 col-xl-2">
          <label for="filterPlayerDocumentStatus" class="form-label fw-semibold">สถานะเอกสาร</label>
          <select id="filterPlayerDocumentStatus" class="form-select">
            <option value="">ทั้งหมด</option>
            ${Array.from(new Set(filteredPlayers.map(p => getPlayerDocStatusInfo(p, profile).text))).sort((a, b) => a.localeCompare(b, 'th')).map(value => `<option value="${escapeFilterValue(value)}">${escapeFilterValue(value)}</option>`).join('')}
          </select>
        </div>
      </div>
      <p id="playerFilterResultCount" class="small text-muted mb-2" aria-live="polite"></p>
      <div class="table-responsive">
        <table class="table table-bordered table-striped align-middle mb-0">
          <thead>
            <tr>
              <th>#</th>
              <th>รูปถ่าย</th>
              <th>ชื่อ-นามสกุล</th>
              <th>เลขบัตรประชาชน</th>
              <th>หมายเลขเสื้อ</th>
              <th>ตำแหน่ง</th>
              <th>รุ่นอายุ</th>
              <th>สถานะเอกสาร</th>
              <th>ข้อมูลที่ต้องปรับแก้</th>
              <th>การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            ${emptyStateHtml}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  <script>
    function filterTeamPlayers() {
      const rows = Array.from(document.querySelectorAll('table tbody tr[data-player-name]'));
      const nameQuery = (document.getElementById('filterPlayerName').value || '').trim().toLocaleLowerCase();
      const idCardQuery = (document.getElementById('filterPlayerIdCard').value || '').trim().toLocaleLowerCase();
      const jerseyFilter = document.getElementById('filterPlayerJersey').value;
      const positionFilter = document.getElementById('filterPlayerPosition').value;
      const statusFilter = document.getElementById('filterPlayerDocumentStatus').value;
      let visibleCount = 0;

      rows.forEach(row => {
        const matches = row.dataset.playerName.toLocaleLowerCase().includes(nameQuery)
          && row.dataset.playerIdCard.toLocaleLowerCase().includes(idCardQuery)
          && (!jerseyFilter || row.dataset.playerJersey === jerseyFilter)
          && (!positionFilter || row.dataset.playerPosition === positionFilter)
          && (!statusFilter || row.dataset.playerDocumentStatus === statusFilter);
        row.hidden = !matches;
        if (matches) {
          visibleCount += 1;
          row.cells[0].textContent = String(visibleCount);
        }
      });

      let emptyRow = document.getElementById('playerFilterEmptyState');
      if (visibleCount === 0 && rows.length > 0) {
        if (!emptyRow) {
          emptyRow = document.createElement('tr');
          emptyRow.id = 'playerFilterEmptyState';
          emptyRow.innerHTML = '<td colspan="9" class="text-center text-muted py-4"><i class="bi bi-search fs-3 d-block mb-1"></i>ไม่พบข้อมูลตามเงื่อนไขที่ค้นหา</td>';
          document.querySelector('table tbody').appendChild(emptyRow);
        }
        emptyRow.hidden = false;
      } else if (emptyRow) {
        emptyRow.hidden = true;
      }

      document.getElementById('playerFilterResultCount').textContent = 'แสดง ' + visibleCount + ' จาก ' + rows.length + ' คน';
    }

    document.getElementById('filterPlayerName').addEventListener('input', filterTeamPlayers);
    document.getElementById('filterPlayerIdCard').addEventListener('input', filterTeamPlayers);
    document.getElementById('filterPlayerJersey').addEventListener('change', filterTeamPlayers);
    document.getElementById('filterPlayerPosition').addEventListener('change', filterTeamPlayers);
    document.getElementById('filterPlayerDocumentStatus').addEventListener('change', filterTeamPlayers);
    filterTeamPlayers();

    function deletePlayer(id, name) {
      if (confirm('คุณต้องการลบข้อมูลนักกีฬา ' + name + ' ใช่หรือไม่?')) {
        fetch('${base}/api/team/players/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: id })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            location.reload();
          } else {
            alert(data.error || 'เกิดข้อผิดพลาดในการลบข้อมูล');
          }
        })
        .catch(err => alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์'));
      }
    }
  </script>`;
  res.send(renderTeamLayout('รายชื่อนักกีฬา', content, 'players', base, profile));
});

// Page 7.1: /team/player-edit.php (Player Add / Edit Form - Full Fields Clone)
router.get('/team/player-edit.php', checkTeamSession, async (req: Request, res: Response) => {
  const base = getBaseUrl(req);
  const teamId = await getLoggedTeamId(req);
  const profile = await getDbTeamProfile(req);
  if (!req.query.id && Array.isArray(profile.categories) && profile.categories.length === 0) {
        return res.redirect(`${base}/team/index.php`);
    }
  const playerId = req.query.id as string;
  const requestedReturnCategory = String(req.query.returnCategory || req.query.category || '').toUpperCase();
  const returnCategory = ['ALL', 'U14', 'U16', 'U18'].includes(requestedReturnCategory) ? requestedReturnCategory : '';
  const playersReturnUrl = `${base}/team/players.php${returnCategory && returnCategory !== 'ALL' ? `?category=${returnCategory}` : ''}`;
  let player: any = null;

  const submittedCatsStr = profile.submitted_categories || '';
  const submittedCatsList = submittedCatsStr.split(',').map((c: string) => c.trim()).filter(Boolean);
  const editPlayer = req.query.id ? (await getDbPlayers(teamId)).find((p: any) => p.id === req.query.id) : null;
  const targetCategory = editPlayer ? (editPlayer.category || 'U14') : (req.query.category as string || 'U14');
  const isCorrectionEdit = Boolean(editPlayer && isPlayerCorrectionRequired(editPlayer));
  const isCategoryLocked = submittedCatsList.includes(targetCategory) && !isCorrectionEdit;

  if (isCategoryLocked) {
    const lockedContent = `
      <div class="card shadow-sm border-0">
        <div class="card-body p-5 text-center">
          <i class="bi bi-lock-fill text-warning display-1 mb-3 d-block"></i>
          <h4 class="fw-bold text-navy mb-2">ยื่นส่งรายชื่อเรียบร้อยแล้ว — รุ่น ${targetCategory}</h4>
          <p class="text-muted fs-6 mb-4">รุ่นแข่งขัน ${targetCategory} ได้ยื่นส่งรายชื่อให้เจ้าหน้าที่ตรวจสอบแล้ว ระบบล็อกการเพิ่ม/แก้ไขข้อมูลนักกีฬาของรุ่นนี้</p>
          <a href="${base}/team/players.php?category=${encodeURIComponent(targetCategory)}" class="btn btn-navy text-white fw-bold px-4">
            <i class="bi bi-arrow-left me-1"></i> กลับสู่รายชื่อนักกีฬา
          </a>
        </div>
      </div>
    `;
    return res.send(renderTeamLayout('เพิ่ม/แก้ไขนักกีฬา', lockedContent, 'players', base, profile));
  }

  if (playerId) {
    const fetchedPlayer = await getDbPlayerById(playerId);
    if (fetchedPlayer && (!teamId || teamId === 'default' || !fetchedPlayer.teamId || String(fetchedPlayer.teamId).trim() === String(teamId).trim())) {
      player = fetchedPlayer;
    } else {
      return res.redirect(`${base}/team/players.php`);
    }
  } else {
    const teamId = await getLoggedTeamId(req);
    const teamPlayers = await getDbPlayers(teamId);
    const targetCatPlayers = teamPlayers.filter(p => {
      const catStr = String(p.category || p.categories || 'U14').toUpperCase();
      return catStr.split(',').map((c: string) => c.trim()).includes(targetCategory);
    });
    if (targetCatPlayers.length >= 30) {
      const quotaExceededContent = `
        <div class="card shadow-sm border-0">
          <div class="card-body p-5 text-center">
            <i class="bi bi-exclamation-octagon text-danger display-1 mb-3 d-block"></i>
            <h4 class="fw-bold text-navy mb-2">โควตานักกีฬาเต็มจำนวนสูงสุดเรียบร้อยแล้ว — รุ่น ${targetCategory}</h4>
            <p class="text-muted fs-6 mb-4">รุ่นแข่งขัน ${targetCategory} มีนักกีฬาครบ 30 คนตามโควตาสูงสุดของระเบียบการแข่งขันแล้ว ไม่สามารถเพิ่มนักกีฬาในรุ่นนี้ได้อีก</p>
            <a href="${base}/team/players.php?category=${encodeURIComponent(targetCategory)}" class="btn btn-primary fw-bold px-4">
              <i class="bi bi-arrow-left me-1"></i> กลับสู่รายชื่อนักกีฬา
            </a>
          </div>
        </div>
      `;
      return res.send(renderTeamLayout('เพิ่มนักกีฬา', quotaExceededContent, 'players', base, profile));
    }
  }

  const pageTitle = player ? 'แก้ไขข้อมูลนักกีฬา' : 'เพิ่มนักกีฬา';

  // Helper for field values
  const v = (field: string, fallback: string = '') => player ? (player[field] || fallback) : fallback;

  const content = `
  <div class="sticky-top bg-white border-bottom shadow-sm px-3 py-2 mb-3 rounded-3 d-flex justify-content-between align-items-center flex-wrap gap-2" style="top: 50px; z-index: 1020;">
    <div class="d-flex align-items-center flex-wrap gap-3">
      <h4 class="fw-bold text-navy mb-0"><i class="bi bi-person-plus-fill me-2"></i> ${pageTitle}</h4>
      <div class="vr d-none d-sm-block" style="height: 1.5rem;"></div>
      <div id="eligibility_header_box" class="d-flex align-items-center gap-2 px-3 py-1 bg-light rounded-pill border small">
        <i class="bi bi-shield-check text-primary fs-6" id="eligibility_icon"></i>
        <span class="fw-semibold text-dark" id="eligibility_title">ผลตรวจคุณสมบัติ:</span>
        <span class="text-muted" id="eligibility_text">บันทึกข้อมูลแล้วระบบจะตรวจสอบให้อัตโนมัติ</span>
      </div>
    </div>
    <a href="${playersReturnUrl}" class="btn btn-outline-secondary btn-sm fw-semibold">
      <i class="bi bi-arrow-left me-1"></i> ย้อนกลับ
    </a>
  </div>

  <div class="row g-4">
    <!-- Main Form (Full Width 12 Columns) -->
    <div class="col-12">
      <div class="card shadow-sm border-0">
        <div class="card-body p-4">
          <form action="${base}/api/team/players/save" method="POST" enctype="multipart/form-data">
            <input type="hidden" name="id" value="${player ? player.id : ''}">
            <input type="hidden" name="returnCategory" value="${returnCategory}">

            <div class="alert alert-info py-2 px-3 small border-0 mb-4" style="background-color: #d1f2fb; color: #0c5460;">
              ช่องที่มี <strong class="text-danger">*</strong> คือ <strong>REQUIRED</strong> — ใช้เป็นเกณฑ์พิจารณาคุณสมบัตินักกีฬา หากไม่ครบจะไม่ผ่านการตรวจสอบ
            </div>

            <!-- Category checkboxes appear first; adding a player starts with no category selected. -->
            <div class="row g-3 mb-3">
              <div class="col-12">
                <label class="form-label fw-semibold text-dark">รุ่นอายุการแข่งขัน <span class="text-danger">*</span> <span class="text-muted fw-normal small">(สามารถเลือกเล่นรุ่นที่สูงกว่าอายุจริงได้)</span></label>
                <div class="d-flex flex-wrap gap-3 p-3 bg-light rounded border" id="category_checkbox_group">
                  ${['U14', 'U16', 'U18'].map((c) => {
        const label = c === 'U14' ? 'รุ่น U14 (เกิด 1 ม.ค. 2556 หรือหลังจากนั้น)' : (c === 'U16' ? 'รุ่น U16 (เกิด 1 ม.ค. 2554 หรือหลังจากนั้น)' : 'รุ่น U18 (เกิด 1 ม.ค. 2552 หรือหลังจากนั้น)');
        const registeredCats = (profile.categories && profile.categories.length > 0) ? profile.categories : ['U14'];
        const cancelledCats = (profile.cancelled_categories || profile.cancelledCategories || '').toUpperCase().split(',').map((cat: string) => cat.trim()).filter(Boolean);
        const isCancelled = cancelledCats.includes(c);
        const isTeamRegistered = registeredCats.includes(c);
        const currentCatVal = player ? v('category', '') : '';
        const isChecked = player
            ? (!isCancelled && (currentCatVal.includes(c) || (v('categories') && v('categories').includes(c))))
            : false;
        const isDisabled = !isTeamRegistered || isCancelled;
        let statusLabel = '';
        if (isCancelled) {
            statusLabel = '<span class="small text-danger fw-normal">(ยกเลิกการสมัครแล้ว)</span>';
        }
        else if (!isTeamRegistered) {
            statusLabel = '<span class="small text-danger fw-normal">(ทีมไม่ได้ลงทะเบียน)</span>';
        }
        return `
                      <div class="form-check ${isDisabled ? 'text-muted opacity-50' : ''}">
                        <input class="form-check-input category-checkbox" type="checkbox" name="categories" value="${c}" id="cat_check_${c}" ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
                        <label class="form-check-label fw-semibold" for="cat_check_${c}">
                          ${label} ${statusLabel}
                        </label>
                      </div>
                    `;
    }).join('')}
                </div>
                <div class="invalid-feedback fw-semibold" id="category_error"></div>
              </div>
            </div>

            <div class="row g-3">
              <!-- Row 1: Jersey No, Prefix, First Name, Middle Name -->
              <div class="col-md-3">
                <label class="form-label fw-semibold text-dark">เบอร์เสื้อ <span class="text-danger">*</span> <span class="text-muted fw-normal small">(1-30)</span></label>
                <input type="number" min="1" max="30" name="jersey_no" id="jersey_no_input" class="form-control" value="${v('jerseyNo', '')}" placeholder="เช่น 10 (1-30)">
                <div class="invalid-feedback fw-semibold" id="jersey_no_error"></div>
              </div>
              <div class="col-md-4">
                <label class="form-label fw-semibold text-dark">คำนำหน้า <span class="text-danger">*</span></label>
                <select name="prefix" id="prefix_select" class="form-select">
                  <option value="">— เลือกคำนำหน้า —</option>
                  <option value="ด.ช." ${v('prefix', '') === 'ด.ช.' ? 'selected' : ''}>ด.ช.</option>
                  <option value="นาย" ${v('prefix', '') === 'นาย' ? 'selected' : ''}>นาย</option>
                </select>
                <div class="invalid-feedback fw-semibold" id="prefix_error"></div>
              </div>
              <div class="col-md-5">
                <label class="form-label fw-semibold text-dark">ชื่อ <span class="text-danger">*</span></label>
                <input name="first_name" id="first_name_input" class="form-control" value="${v('firstName') || (v('name') ? v('name').replace(/^(ด\.ช\.|ด\.ญ\.|นาย|นางสาว|นาง|\S+\.)\s*/, '').split(' ')[0] : '')}" placeholder="ชื่อนักกีฬา">
                <div class="invalid-feedback fw-semibold" id="first_name_error"></div>
              </div>

              <!-- Row 2: Last Name, Jersey Name -->
              <div class="col-md-6">
                <label class="form-label fw-semibold text-dark">นามสกุล <span class="text-danger">*</span></label>
                <input name="last_name" id="last_name_input" class="form-control" value="${v('lastName', '')}" placeholder="นามสกุล">
                <div class="invalid-feedback fw-semibold" id="last_name_error"></div>
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold text-dark">ชื่อย่อบนเสื้อ</label>
                <input name="jersey_name" class="form-control" value="${v('jerseyName', '')}">
              </div>

              <!-- Row 3: ID Card, Birth Date (BE), Position -->
              <div class="col-md-4">
                <label class="form-label fw-semibold text-dark">เลขประจำตัวประชาชน (13 หลัก) <span class="text-danger">*</span></label>
                <input name="id_card" id="id_card_input" class="form-control" value="${v('idCard', '')}" placeholder="กรอกเฉพาะตัวเลข 13 หลัก" maxlength="13" inputmode="numeric" pattern="[0-9]*">
                <div class="invalid-feedback fw-semibold" id="id_card_error"></div>
              </div>
              <div class="col-md-5">
                <label class="form-label fw-semibold text-dark">วันเกิด (วัน/เดือน/ปี พ.ศ.) <span class="text-danger">*</span></label>
                <input type="hidden" id="birth_date_input" name="birth_date" value="${v('birthDate', '')}">
                <div class="row g-1" id="dob_select_group">
                  <div class="col-4">
                    <select id="dob_day" class="form-select px-2">
                      <option value="">วัน</option>
                      ${Array.from({ length: 31 }, (_, i) => {
        const d = String(i + 1).padStart(2, '0');
        return `<option value="${d}">${d}</option>`;
    }).join('')}
                    </select>
                  </div>
                  <div class="col-4">
                    <select id="dob_month" class="form-select px-2">
                      <option value="">เดือน</option>
                      ${[
        { v: '01', t: 'ม.ค.' }, { v: '02', t: 'ก.พ.' }, { v: '03', t: 'มี.ค.' }, { v: '04', t: 'เม.ย.' },
        { v: '05', t: 'พ.ค.' }, { v: '06', t: 'มิ.ย.' }, { v: '07', t: 'ก.ค.' }, { v: '08', t: 'ส.ค.' },
        { v: '09', t: 'ก.ย.' }, { v: '10', t: 'ต.ค.' }, { v: '11', t: 'พ.ย.' }, { v: '12', t: 'ธ.ค.' }
    ].map(m => `<option value="${m.v}">${m.t}</option>`).join('')}
                    </select>
                  </div>
                  <div class="col-4">
                    <select id="dob_year_be" class="form-select px-2">
                      <option value="">พ.ศ.</option>
                      ${Array.from({ length: 35 }, (_, i) => {
        const currentBE = new Date().getFullYear() + 543;
        const be = currentBE - i;
        const ce = be - 543;
        return `<option value="${ce}">${be}</option>`;
    }).join('')}
                    </select>
                  </div>
                </div>
                <div class="invalid-feedback fw-semibold" id="birth_date_error"></div>
                <div id="be_year_help" class="form-text small text-primary mt-1"><i class="bi bi-calendar-event me-1"></i> กรุณาเลือก วัน/เดือน/ปี พ.ศ. เกิด</div>
              </div>
              <div class="col-md-3">
                <label class="form-label fw-semibold text-dark">ตำแหน่ง <span class="text-danger">*</span></label>
                <select name="position" id="position_select" class="form-select">
                  <option value="">— เลือกตำแหน่ง —</option>
                  <option value="ผู้รักษาประตู (GK)" ${v('position', '').includes('GK') ? 'selected' : ''}>ผู้รักษาประตู (GK)</option>
                  <option value="กองหลัง (DF)" ${v('position', '').includes('DF') || v('position', '').includes('CB') ? 'selected' : ''}>กองหลัง (DF)</option>
                  <option value="กองกลาง (MF)" ${v('position', '').includes('MF') ? 'selected' : ''}>กองกลาง (MF)</option>
                  <option value="กองหน้า (FW)" ${v('position', '').includes('FW') ? 'selected' : ''}>กองหน้า (FW)</option>
                </select>
                <div class="invalid-feedback fw-semibold" id="position_error"></div>
              </div>

              <!-- Height, Weight, School -->
              <div class="col-md-3">
                <label class="form-label fw-semibold text-dark">ส่วนสูง (ซม.)</label>
                <input type="number" name="height" class="form-control" value="${v('height', '')}" placeholder="เช่น 165">
              </div>
              <div class="col-md-3">
                <label class="form-label fw-semibold text-dark">น้ำหนัก (กก.)</label>
                <input type="number" name="weight" class="form-control" value="${v('weight', '')}" placeholder="เช่น 55">
              </div>
              <div class="col-md-6">
                <label class="form-label fw-semibold text-dark">สโมสร / โรงเรียน / อะคาเดมี่ / สังกัด</label>
                <input name="school" class="form-control bg-light" value="${v('school', profile.school || '')}" disabled readonly>
              </div>

              <!-- Row 6: Guardian Name, Relation, Phone -->
              <div class="col-md-4">
                <label class="form-label fw-semibold text-dark">ผู้ปกครอง</label>
                <input name="guardian_name" class="form-control" value="${v('guardianName', '')}" placeholder="ชื่อ-นามสกุล ผู้ปกครอง">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-semibold text-dark">ความสัมพันธ์</label>
                <select name="guardian_relation_select" id="guardian_relation_select" class="form-select">
                  <option value="">— เลือกความสัมพันธ์ —</option>
                  ${['บิดา-มารดา', 'ผู้ปกครองตามกฎหมาย', 'อื่นๆ'].map(rel => {
        const savedRelation = v('guardianRelation', v('guardian_relation', ''));
        const isStandard = ['บิดา-มารดา', 'ผู้ปกครองตามกฎหมาย'].includes(savedRelation);
        const isSelected = savedRelation === rel || (!isStandard && savedRelation && rel === 'อื่นๆ');
        return `<option value="${rel}" ${isSelected ? 'selected' : ''}>${rel}</option>`;
    }).join('')}
                </select>
                <input type="hidden" name="guardian_relation" id="guardian_relation_hidden" value="${v('guardianRelation', v('guardian_relation', ''))}">
              </div>
              <div class="col-md-4" id="guardian_relation_custom_col" style="display: ${(() => {
        const savedRelation = v('guardianRelation', v('guardian_relation', ''));
        const isStandard = ['บิดา-มารดา', 'ผู้ปกครองตามกฎหมาย'].includes(savedRelation);
        return (!isStandard && savedRelation) ? 'block' : 'none';
    })()};">
                <label class="form-label fw-semibold text-dark">ระบุความสัมพันธ์อื่นๆ <span class="text-danger">*</span></label>
                <input type="text" id="guardian_relation_custom_input" class="form-control" value="${(() => {
        const savedRelation = v('guardianRelation', v('guardian_relation', ''));
        const isStandard = ['บิดา-มารดา', 'ผู้ปกครองตามกฎหมาย'].includes(savedRelation);
        return (!isStandard && savedRelation) ? savedRelation : '';
    })()}" placeholder="ระบุความสัมพันธ์">
              </div>
              <div class="col-md-4">
                <label class="form-label fw-semibold text-dark">โทรศัพท์ติดต่อ</label>
                <input name="phone" class="form-control" value="${v('phone', '')}" placeholder="เบอร์โทรศัพท์ติดต่อผู้ปกครอง">
              </div>

            </div>

            <!-- Document Verification Section -->
            <hr class="my-4">
            <h2 class="h6 text-primary border-bottom pb-2 mb-3"><i class="bi bi-file-earmark-check-fill me-1"></i> เอกสารยืนยันคุณสมบัติ (JPG, PNG หรือ PDF ไม่เกิน 2 MB)</h2>
            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <label class="form-label fw-semibold text-dark mb-0">สำเนาบัตรประชาชน / สูติบัตร <span class="badge bg-danger ms-1">REQUIRED</span></label>
                  ${(v('docIdCard') || v('doc_id_card')) ? `<button type="button" class="btn btn-sm btn-outline-info py-0 px-2 fs-7" onclick="viewPhoto('สำเนาบัตรประชาชน / สูติบัตร', '${base}${(v('docIdCard') || v('doc_id_card'))}')"><i class="bi bi-eye me-1"></i> รีวิวเอกสาร</button>` : ''}
                </div>
                <input type="file" name="doc_id_card" id="doc_id_card_input" class="form-control" accept="image/*,application/pdf">
                <div class="invalid-feedback fw-semibold" id="doc_id_card_error"></div>
                ${(v('docIdCard') || v('doc_id_card')) ? `<div class="form-text text-success small"><i class="bi bi-check-circle-fill me-1"></i> มีไฟล์เดิมที่อัปโหลดไว้แล้ว</div>` : ''}
              </div>
              <div class="col-md-6">
                <div class="d-flex justify-content-between align-items-center mb-1">
                  <label class="form-label fw-semibold text-dark mb-0">รูปถ่ายนักกีฬา <span class="badge bg-danger ms-1">REQUIRED</span></label>
                  ${(v('photoUrl') || v('photo_url')) ? `<button type="button" class="btn btn-sm btn-outline-info py-0 px-2 fs-7" onclick="viewPhoto('รูปถ่ายนักกีฬา', '${base}${(v('photoUrl') || v('photo_url'))}')"><i class="bi bi-eye me-1"></i> รีวิวรูปถ่าย</button>` : ''}
                </div>
                <input type="file" name="photo" id="photo_input" class="form-control" accept="image/*">
                <div class="invalid-feedback fw-semibold" id="photo_error"></div>
                ${(v('photoUrl') || v('photo_url')) ? `<div class="form-text text-success small"><i class="bi bi-check-circle-fill me-1"></i> มีรูปถ่ายเดิมที่อัปโหลดไว้แล้ว</div>` : ''}
              </div>
            </div>

            <div class="d-flex align-items-center gap-2 mt-4 pt-3 border-top">
              <button type="submit" class="btn btn-primary fw-bold px-4" id="btn_save_player">
                <i class="bi bi-save me-1"></i> บันทึกข้อมูล
              </button>
              <a href="${playersReturnUrl}" class="btn btn-link text-decoration-none">กลับสู่รายชื่อ</a>
            </div>
          </form>
        </div>
      </div>
    </div>

  </div>
  
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const birthHidden = document.getElementById('birth_date_input');
      const dobDay = document.getElementById('dob_day');
      const dobMonth = document.getElementById('dob_month');
      const dobYearBE = document.getElementById('dob_year_be');
      const idCardInputEl = document.getElementById('id_card_input');

      if (idCardInputEl) {
        idCardInputEl.addEventListener('input', function() {
          this.value = this.value.replace(/\D/g, '').slice(0, 13);
        });
      }

      const categorySelect = document.getElementById('category_select');
      const beHelp = document.getElementById('be_year_help');
      const eligBox = document.getElementById('eligibility_header_box');
      const eligIcon = document.getElementById('eligibility_icon');
      const eligTitle = document.getElementById('eligibility_title');
      const eligText = document.getElementById('eligibility_text');
      const form = birthHidden ? birthHidden.closest('form') : null;

      // Initial populate from hidden YYYY-MM-DD input if existing
      if (birthHidden && birthHidden.value) {
        const parts = birthHidden.value.split('-');
        if (parts.length === 3) {
          if (dobYearBE) dobYearBE.value = parts[0];
          if (dobMonth) dobMonth.value = parts[1];
          if (dobDay) dobDay.value = parts[2];
        }
      }

      function updateBEYearDisplay() {
        const yearCE = dobYearBE ? dobYearBE.value : '';
        const month = dobMonth ? dobMonth.value : '';
        const day = dobDay ? dobDay.value : '';
        const catBoxes = document.querySelectorAll('.category-checkbox');

        if (!yearCE || !month || !day) {
          if (birthHidden) birthHidden.value = '';
          if (beHelp) {
            beHelp.className = 'form-text small text-primary mt-1';
            beHelp.innerHTML = '<i class="bi bi-calendar-event me-1"></i> กรุณาเลือก วัน/เดือน/ปี พ.ศ. เกิด';
          }
          if (eligBox) {
            eligBox.className = 'd-flex align-items-center gap-2 px-3 py-1 bg-light rounded-pill border small';
          }
          if (eligIcon) eligIcon.className = 'bi bi-shield-check text-primary fs-6';
          if (eligTitle) eligTitle.textContent = 'ผลตรวจคุณสมบัติ:';
          if (eligText) eligText.textContent = 'บันทึกข้อมูลแล้วระบบจะตรวจสอบให้อัตโนมัติ';
          return { valid: false, reason: 'incomplete_date' };
        }

        const yCE = parseInt(yearCE, 10);
        const yBE = yCE + 543;
        const formattedISO = yearCE + '-' + month + '-' + day;
        if (birthHidden) birthHidden.value = formattedISO;

        const currentYear = new Date().getFullYear();
        const age = currentYear - yCE;

        let eligibleCats = [];
        if (yBE >= 2556) {
          eligibleCats = ['U14', 'U16', 'U18'];
        } else if (yBE >= 2554) {
          eligibleCats = ['U16', 'U18'];
        } else if (yBE >= 2552) {
          eligibleCats = ['U18'];
        }

        const teamRegisteredCats = ${JSON.stringify((profile.categories && profile.categories.length > 0) ? profile.categories : ['U14'])};

        catBoxes.forEach(box => {
          const val = box.value;
          const isBirthElig = eligibleCats.includes(val);
          const isTeamReg = teamRegisteredCats.includes(val);

          if (isBirthElig && isTeamReg) {
            box.disabled = false;
            box.parentElement.classList.remove('text-muted', 'opacity-50');
          } else {
            box.disabled = true;
            box.checked = false;
            box.parentElement.classList.add('text-muted', 'opacity-50');
          }
        });

        if (eligibleCats.length === 0) {
          if (beHelp) {
            beHelp.className = 'form-text small text-danger fw-bold mt-1';
            beHelp.innerHTML = '<i class="bi bi-x-circle-fill me-1"></i> เกิด พ.ศ. ' + yBE + ' (อายุ ' + age + ' ปี) ไม่อยู่ในเกณฑ์ปีเกิดของการแข่งขัน (ต้องเกิดตั้งแต่ 1 ม.ค. 2552 หรือหลังจากนั้น)';
          }
          if (eligBox) eligBox.className = 'd-flex align-items-center gap-2 px-3 py-1 bg-danger-subtle text-danger rounded-pill border border-danger-subtle small';
          if (eligIcon) eligIcon.className = 'bi bi-exclamation-octagon-fill text-danger fs-6';
          if (eligTitle) eligTitle.textContent = 'ไม่อยู่ในเกณฑ์:';
          if (eligText) eligText.textContent = 'ปีเกิด พ.ศ. ' + yBE + ' ไม่อยู่ในเกณฑ์ (ต้องเกิดตั้งแต่ 1 ม.ค. 2552 หรือหลังจากนั้น)';
          return { valid: false, reason: 'year_out_of_range', age: age, beYear: yBE };
        }

        // Valid State
        const selectedCheckboxes = Array.from(catBoxes).filter(b => b.checked).map(b => b.value);
        if (beHelp) {
          beHelp.className = 'form-text small text-success fw-bold mt-1';
          beHelp.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> เกิด ' + day + '/' + month + '/' + yBE + ' อายุ ' + age + ' ปี (มีสิทธิ์เล่นรุ่น: ' + eligibleCats.join(', ') + ')';
        }
        if (eligBox) eligBox.className = 'd-flex align-items-center gap-2 px-3 py-1 bg-success-subtle text-success rounded-pill border border-success-subtle small';
        if (eligIcon) eligIcon.className = 'bi bi-shield-check text-success fs-6';
        if (eligTitle) eligTitle.textContent = 'คุณสมบัติผ่านเกณฑ์:';
        if (eligText) eligText.textContent = 'เกิด ' + day + '/' + month + '/' + yBE + ' อายุ ' + age + ' ปี (มีสิทธิ์ลงรุ่น ' + eligibleCats.join(', ') + ')';

        return { valid: true, age: age, beYear: yBE, eligibleCats: eligibleCats, selectedCats: selectedCheckboxes };
      }

      const relSelect = document.getElementById('guardian_relation_select');
      const relCustomCol = document.getElementById('guardian_relation_custom_col');
      const relCustomInput = document.getElementById('guardian_relation_custom_input');
      const relHidden = document.getElementById('guardian_relation_hidden');

      function syncGuardianRelation() {
        if (!relSelect || !relHidden) return;
        const val = relSelect.value;
        if (val === 'อื่นๆ') {
          if (relCustomCol) relCustomCol.style.display = 'block';
          if (relHidden && relCustomInput) relHidden.value = relCustomInput.value.trim();
        } else {
          if (relCustomCol) relCustomCol.style.display = 'none';
          if (relCustomInput) relCustomInput.value = '';
          if (relHidden) relHidden.value = val;
        }
      }

      if (relSelect) {
        relSelect.addEventListener('change', syncGuardianRelation);
      }
      if (relCustomInput) {
        relCustomInput.addEventListener('input', syncGuardianRelation);
      }
      syncGuardianRelation();

      [dobDay, dobMonth, dobYearBE].forEach(elem => {
        if (elem) elem.addEventListener('change', updateBEYearDisplay);
      });
      document.querySelectorAll('.category-checkbox').forEach(box => {
        box.addEventListener('change', updateBEYearDisplay);
      });
      updateBEYearDisplay();

      if (form) {
        // Clear field validation state on user input
        form.querySelectorAll('input, select').forEach(function(el) {
          el.addEventListener('input', function() {
            el.classList.remove('is-invalid');
            const errDiv = document.getElementById(el.id + '_error') || document.getElementById(el.name + '_error');
            if (errDiv) { errDiv.textContent = ''; errDiv.style.display = 'none'; }
          });
          el.addEventListener('change', function() {
            el.classList.remove('is-invalid');
            const errDiv = document.getElementById(el.id + '_error') || document.getElementById(el.name + '_error');
            if (errDiv) { errDiv.textContent = ''; errDiv.style.display = 'none'; }
          });
        });

        form.addEventListener('submit', function(e) {
          e.preventDefault();

          // Reset all field error highlights and messages
          form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
          form.querySelectorAll('.invalid-feedback').forEach(el => { el.textContent = ''; el.style.display = 'none'; });

          let firstInvalidField = null;
          function markInvalid(inputEl, errorDivId, message) {
            if (inputEl) inputEl.classList.add('is-invalid');
            const errorDiv = document.getElementById(errorDivId);
            if (errorDiv) {
              errorDiv.textContent = message;
              errorDiv.style.display = 'block';
            }
            if (!firstInvalidField && inputEl) {
              firstInvalidField = inputEl;
            }
          }

          // 1. Validate Required Text & Select Fields (*)
          const jerseyInput = form.querySelector('input[name="jersey_no"]');
          if (jerseyInput) {
            const num = parseInt(jerseyInput.value, 10);
            if (!jerseyInput.value || isNaN(num) || num < 1 || num > 30) {
              markInvalid(jerseyInput, 'jersey_no_error', 'กรุณาระบุหมายเลขเสื้อระหว่าง 1 ถึง 30');
            }
          }

          const prefixSelect = document.getElementById('prefix_select');
          if (prefixSelect && !prefixSelect.value) {
            markInvalid(prefixSelect, 'prefix_error', 'กรุณาเลือกคำนำหน้า');
          }

          const firstNameInput = document.getElementById('first_name_input');
          if (firstNameInput && !firstNameInput.value.trim()) {
            markInvalid(firstNameInput, 'first_name_error', 'กรุณากรอกชื่อ');
          }

          const lastNameInput = document.getElementById('last_name_input');
          if (lastNameInput && !lastNameInput.value.trim()) {
            markInvalid(lastNameInput, 'last_name_error', 'กรุณากรอกนามสกุล');
          }

          const positionSelect = document.getElementById('position_select');
          if (positionSelect && (!positionSelect.value || positionSelect.value === '— ไม่ระบุ —')) {
            markInvalid(positionSelect, 'position_error', 'กรุณาเลือกตำแหน่งของนักกีฬา');
          }

          // 2. Validate ID Card (13 Digits & Numeric Only)
          const idCardInput = document.getElementById('id_card_input');
          if (idCardInput) {
            const rawIdCard = idCardInput.value || '';
            const cleanIdCard = rawIdCard.replace(/\D/g, '');
            if (!rawIdCard) {
              markInvalid(idCardInput, 'id_card_error', 'กรุณากรอกเลขประจำตัวประชาชน (13 หลัก)');
            } else if (cleanIdCard.length !== 13) {
              markInvalid(idCardInput, 'id_card_error', 'เลขประจำตัวประชาชนต้องเป็นตัวเลขและมีครบ 13 หลักเท่านั้น');
            }
          }

          // 3. Validate Birth Date & Category Checkboxes
          const res = updateBEYearDisplay();
          if (!res.valid) {
            if (dobDay) dobDay.classList.add('is-invalid');
            if (dobMonth) dobMonth.classList.add('is-invalid');
            if (dobYearBE) dobYearBE.classList.add('is-invalid');
            const msg = res.reason === 'incomplete_date' 
              ? 'กรุณาเลือก วัน/เดือน/ปี พ.ศ. เกิดให้ครบถ้วน' 
              : ('เกิด พ.ศ. ' + res.beYear + ' ไม่อยู่ในเกณฑ์การแข่งขัน (ต้องเกิดตั้งแต่ 1 ม.ค. 2552 หรือหลังจากนั้น)');
            markInvalid(dobDay, 'birth_date_error', msg);
          } else {
            const checkedBoxes = document.querySelectorAll('.category-checkbox:checked');
            if (checkedBoxes.length === 0) {
              const groupContainer = document.getElementById('category_checkbox_group');
              markInvalid(groupContainer, 'category_error', 'กรุณาเลือกอย่างน้อย 1 รุ่นอายุการแข่งขัน');
            }
          }

          // 4. Validate Required Documents
          const requiredFiles = [
            { input: document.getElementById('doc_id_card_input'), errorId: 'doc_id_card_error', label: 'สำเนาบัตรประชาชน / สูติบัตร', hasExisting: ${v('docIdCard') ? 'true' : 'false'} },
            { input: document.getElementById('photo_input'), errorId: 'photo_error', label: 'รูปถ่ายนักกีฬา', hasExisting: ${v('photoUrl') ? 'true' : 'false'} }
          ];

          for (const item of requiredFiles) {
            const hasNewFile = item.input && item.input.files && item.input.files.length > 0;
            if (!hasNewFile && !item.hasExisting) {
              markInvalid(item.input, item.errorId, 'กรุณาแนบไฟล์ ' + item.label);
            }
          }

          // 5. File Size Validation (Max 2MB)
          const MAX_FILE_SIZE = 2 * 1024 * 1024;
          for (const item of requiredFiles) {
            if (item.input && item.input.files && item.input.files.length > 0) {
              if (item.input.files[0].size > MAX_FILE_SIZE) {
                markInvalid(item.input, item.errorId, 'ขนาดไฟล์เกินกำหนด (ไม่เกิน 2 MB)');
              }
            }
          }

          // Stop submission if any field is invalid
          if (firstInvalidField) {
            firstInvalidField.focus();
            if (firstInvalidField.scrollIntoView) {
              firstInvalidField.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
          }

          // AJAX Submission if all client validations pass
          const btnSave = document.getElementById('btn_save_player');
          if (btnSave) {
            btnSave.disabled = true;
            btnSave.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> กำลังบันทึก...';
          }

          const formData = new FormData(form);
          fetch(form.action, {
            method: 'POST',
            body: formData,
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'Accept': 'application/json'
            }
          })
          .then(function(response) {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              return response.json().then(function(data) {
                return { ok: response.ok, status: response.status, data: data };
              });
            } else {
              return response.text().then(function(text) {
                let errText = 'เกิดข้อผิดพลาดในการบันทึกข้อมูล';
                const match = text.match(/text:\s*(["'])(.*?)\\\\1/);
                if (match && match[2]) {
                  errText = match[2];
                }
                return { ok: response.ok, status: response.status, data: { success: response.ok, error: errText } };
              });
            }
          })
          .then(function(resObj) {
            if (btnSave) {
              btnSave.disabled = false;
              btnSave.innerHTML = '<i class="bi bi-save me-1"></i> บันทึกข้อมูล';
            }
            if (resObj.ok && resObj.data && resObj.data.success) {
              Swal.fire({
                icon: 'success',
                title: 'บันทึกสำเร็จ',
                text: resObj.data.message || 'บันทึกข้อมูลนักกีฬาเรียบร้อยแล้ว',
                confirmButtonColor: '#0b2a5b'
              }).then(function() {
                location.href = resObj.data.redirectUrl;
              });
            } else {
              const errMsg = (resObj.data && resObj.data.error) ? resObj.data.error : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล';
              if (errMsg.includes('บัตรประชาชน') || errMsg.includes('13 หลัก')) {
                markInvalid(idCardInput, 'id_card_error', errMsg);
              } else if (errMsg.includes('หมายเลขเสื้อ') || errMsg.includes('ซ้ำ')) {
                markInvalid(jerseyInput, 'jersey_no_error', errMsg);
              } else if (errMsg.includes('ตำแหน่ง')) {
                markInvalid(positionSelect, 'position_error', errMsg);
              } else {
                markInvalid(firstNameInput, 'first_name_error', errMsg);
              }
              if (firstInvalidField) firstInvalidField.focus();
            }
          })
          .catch(function(err) {
            if (btnSave) {
              btnSave.disabled = false;
              btnSave.innerHTML = '<i class="bi bi-save me-1"></i> บันทึกข้อมูล';
            }
            markInvalid(firstNameInput, 'first_name_error', 'เกิดข้อผิดพลาดการเชื่อมต่อเครือข่าย');
          });
        });
      }
    });
  </script>`;
  res.send(renderTeamLayout(pageTitle, content, 'players', base, profile));
});

// Page 8: /team/officials.php (Officials Management - Multi-Category & Quota Enforcement)
router.get('/team/officials.php', checkTeamSession, async (req: Request, res: Response) => {
  const base = getBaseUrl(req);
  const teamId = await getLoggedTeamId(req);
  const profile = await getDbTeamProfile(req);
  
  const officials = await getDbOfficials(teamId);
  const selectedCategory = ((req.query.category as string) || 'ALL').toUpperCase();
  const editId = (req.query.edit_id || '') as string;
  const editOfficial = editId ? officials.find(o => o.id === editId) : null;

  // Registered Categories for this team (e.g., ['U14', 'U16', 'U18'])
  const registeredCategories: string[] = Array.isArray(profile.categories) ? profile.categories : profile.categories ? String(profile.categories).split(',').filter(Boolean) : [];

  // Helper to parse official's categories string/array
  const getOfficialCats = (off: any): string[] => {
    if (!off.categories) return ['U14'];
    if (Array.isArray(off.categories)) return off.categories;
    return String(off.categories).split(',').map(c => c.trim()).filter(Boolean);
  };

  // Filter officials by selected category tab
  const filteredOfficials = selectedCategory === 'ALL'
    ? officials
    : officials.filter(o => getOfficialCats(o).includes(selectedCategory));

  // Count per category & check 8 limit
  const u14Count = officials.filter(o => getOfficialCats(o).includes('U14')).length;
  const u16Count = officials.filter(o => getOfficialCats(o).includes('U16')).length;
  const u18Count = officials.filter(o => getOfficialCats(o).includes('U18')).length;

  const countForCat = (cat: string) => cat === 'U14' ? u14Count : (cat === 'U16' ? u16Count : u18Count);

  // Render Category Filter Tabs & Quota Badges
  const categoryTabsHtml = registeredCategories.map((cat: string) => {
    const count = countForCat(cat);
    const isActive = selectedCategory === cat;
    const btnClass = cat === 'U14'
      ? (isActive ? 'btn-info text-dark active' : 'btn-outline-info')
      : (cat === 'U16'
        ? (isActive ? 'btn-primary active' : 'btn-outline-primary')
        : (isActive ? 'btn-danger active' : 'btn-outline-danger'));
    const isFull = count >= 8;
    const badgeColor = isFull ? 'bg-danger text-white' : 'bg-dark text-white';

    return `
      <a href="${base}/team/officials.php?category=${cat}" class="btn ${btnClass} fw-semibold btn-sm">
        รุ่น ${cat} <span class="badge ${badgeColor} ms-1">${count}/8</span>
      </a>
    `;
  }).join('');

  const isApproved = profile.status === 'APPROVED';

  const submittedCatsStr = profile.submitted_categories || '';
  const submittedCatsList = submittedCatsStr.split(',').map((c: string) => c.trim()).filter(Boolean);

  const officialRows = filteredOfficials.length > 0 ? filteredOfficials.map((o) => {
    let photoCell = '';
    const oPhoto = o.photoUrl || o.photo_url || '';
    if (isApproved) {
      photoCell = oPhoto
        ? `<img src="${base}${oPhoto}" width="40" height="40" class="rounded border object-fit-cover cursor-pointer" onclick="viewPhoto('${o.name.replace(/'/g, "\\'")}', '${base}${oPhoto}')" alt="${o.name}">`
        : `<span class="badge bg-secondary">ไม่มีรูป</span>`;
    } else {
      photoCell = oPhoto
        ? `<div class="d-flex align-items-center gap-2">
             <img src="${base}${oPhoto}" width="40" height="40" class="rounded border object-fit-cover cursor-pointer" onclick="viewPhoto('${o.name.replace(/'/g, "\\'")}', '${base}${oPhoto}')" alt="${o.name}">
             <button class="btn btn-sm btn-outline-primary p-1 leading-none" title="เปลี่ยนรูปถ่าย" onclick="triggerPhotoUpload('official', '${o.id}', '${o.name.replace(/'/g, "\\'")}', '${base}')"><i class="bi bi-camera"></i></button>
           </div>`
        : `<div class="d-flex align-items-center gap-2">
             <span class="badge bg-secondary">ไม่มีรูป</span>
             <button class="btn btn-sm btn-outline-primary btn-xs" title="อัปโหลดรูปถ่าย" onclick="triggerPhotoUpload('official', '${o.id}', '${o.name.replace(/'/g, "\\'")}', '${base}')"><i class="bi bi-camera me-1"></i> อัปโหลด</button>
           </div>`;
    }

    const oCats = getOfficialCats(o);
    const catBadgesHtml = oCats.map(c => {
      const bColor = c === 'U14' ? 'bg-info text-dark' : (c === 'U16' ? 'bg-primary' : 'bg-danger');
      return `<span class="badge ${bColor} me-1">${c}</span>`;
    }).join('');

    const licenseBadgeHtml = (o.hasLicense === 'YES' && o.licenseType)
      ? `<div class="mt-1"><span class="badge bg-primary text-white" style="font-size: 0.75rem;"><i class="bi bi-award me-1"></i>${o.licenseType}${o.licenseSerial ? ' (' + o.licenseSerial + ')' : ''}</span></div>`
      : '';

    const actionCell = `<a href="${base}/team/official-edit.php?id=${o.id}${selectedCategory !== 'ALL' ? '&category=' + selectedCategory : ''}" class="btn btn-sm btn-outline-warning me-1" title="แก้ไข"><i class="bi bi-pencil-square"></i></a>
         <button class="btn btn-sm btn-outline-danger" title="ลบ" onclick="deleteOfficial('${o.id}', '${o.name.replace(/'/g, "\\'")}')"><i class="bi bi-trash"></i></button>`;

    return `
      <tr>
        <td>${photoCell}</td>
        <td><strong>${o.name}</strong></td>
        <td>
          <span class="badge bg-light text-dark border px-2 py-1" style="color: var(--pm-navy) !important;">${o.position}</span>
          ${licenseBadgeHtml}
        </td>
        <td>${catBadgesHtml}</td>
        <td>${o.phone || '-'}</td>
        <td class="text-center">
          ${actionCell}
        </td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="6" class="text-center text-muted py-4">ไม่พบข้อมูลเจ้าหน้าที่ทีมในรุ่น ${selectedCategory} (สามารถเพิ่มได้สูงสุด 8 คนต่อรุ่น)</td></tr>`;

  let addOfficialBtnHtml = '';
  if (selectedCategory === 'ALL') {
    const availableCats = registeredCategories.filter((c: string) => countForCat(c) < 8);
    if (availableCats.length === 0) {
      addOfficialBtnHtml = `<button type="button" class="btn btn-secondary btn-sm fw-semibold" onclick="alert('ทีมของคุณมีเจ้าหน้าที่ครบ 8 คนตามโควตาสูงสุดแล้วในทุกรุ่น')">
           <i class="bi bi-plus-circle me-1"></i> เพิ่มเจ้าหน้าที่
         </button>`;
    } else {
      addOfficialBtnHtml = `<a class="btn btn-primary btn-sm fw-semibold" href="${base}/team/official-edit.php?category=ALL">
           <i class="bi bi-plus-circle me-1"></i> เพิ่มเจ้าหน้าที่
         </a>`;
    }
  } else {
    const countForActiveCat = countForCat(selectedCategory);
    const isActiveCatFull = countForActiveCat >= 8;
    addOfficialBtnHtml = isActiveCatFull
      ? `<button type="button" class="btn btn-secondary btn-sm fw-semibold" onclick="alert('ทีมของคุณมีเจ้าหน้าที่ในรุ่น ${selectedCategory} ครบ 8 คนตามโควตาสูงสุดแล้ว')">
           <i class="bi bi-plus-circle me-1"></i> เพิ่มเจ้าหน้าที่
         </button>`
      : `<a class="btn btn-primary btn-sm fw-semibold" href="${base}/team/official-edit.php?category=${selectedCategory}">
           <i class="bi bi-plus-circle me-1"></i> เพิ่มเจ้าหน้าที่
         </a>`;
  }

  const statusAlertBanner = isApproved && (selectedCategory === 'ALL' || submittedCatsList.includes(selectedCategory)) ? `
    <div class="alert alert-success border-0 shadow-sm rounded-3 p-3 mb-4 d-flex align-items-center gap-3">
      <i class="bi bi-check-circle-fill display-6 text-success"></i>
      <div>
        <h6 class="fw-bold text-success mb-1">รับรองแล้ว (อนุมัติรายชื่อและเอกสารแล้ว)</h6>
        <p class="mb-0 small text-dark opacity-75">รายชื่อและเอกสารเจ้าหน้าที่ทีมของคุณได้รับการตรวจสอบและรับรองจากเจ้าหน้าที่เรียบร้อยแล้ว (สามารถจัดการเจ้าหน้าที่ได้ไม่เกิน 8 คนต่อรุ่น)</p>
      </div>
    </div>
  ` : '';

  const content = `
  ${statusAlertBanner}
  <div class="row g-4">
    <!-- Full Width Registered Officials List -->
    <div class="col-12">
      <div class="card shadow-sm border-0 rounded-3">
        <div class="card-header bg-white border-bottom py-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <h5 class="fw-bold text-navy mb-0"><i class="bi bi-people-fill me-2"></i>เจ้าหน้าที่ทีม</h5>
            <small class="text-muted">กำหนดเจ้าหน้าที่ประจำทีมได้ไม่เกิน 8 คนต่อรุ่น (1 คนสังกัดได้มากกว่า 1 รุ่น)</small>
          </div>
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <div class="btn-group btn-group-sm" role="group">
              <a href="${base}/team/officials.php" class="btn ${selectedCategory === 'ALL' ? 'btn-navy active' : 'btn-outline-navy'} fw-semibold">
                ทั้งหมด (${officials.length})
              </a>
              ${categoryTabsHtml}
            </div>
            ${addOfficialBtnHtml}
          </div>
        </div>
        <div class="card-body p-3">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th style="width: 90px;">รูปถ่าย</th>
                  <th>ชื่อ-นามสกุล</th>
                  <th>ตำแหน่ง</th>
                  <th>รุ่นอายุ</th>
                  <th>โทรศัพท์</th>
                  <th class="text-center" style="width: 100px;">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                ${officialRows}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    function deleteOfficial(id, name) {
      Swal.fire({
        title: 'ยืนยันการลบ?',
        text: 'คุณต้องการลบเจ้าหน้าที่ "' + name + '" หรือไม่?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'ใช่, ลบข้อมูล',
        cancelButtonText: 'ยกเลิก'
      }).then((result) => {
        if (result.isConfirmed) {
          fetch('${base}/api/team/officials/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              Swal.fire({
                icon: 'success',
                title: 'ลบสำเร็จ!',
                text: 'ลบข้อมูลเจ้าหน้าที่เรียบร้อยแล้ว',
                confirmButtonColor: '#0b2a5b'
              }).then(() => {
                location.href = '${base}/team/officials.php';
              });
            } else {
              Swal.fire('ข้อผิดพลาด', data.error || 'ไม่สามารถลบข้อมูลได้', 'error');
            }
          })
          .catch(err => {
            Swal.fire('ข้อผิดพลาด', 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์', 'error');
          });
        }
      });
    }
  </script>`;
  res.send(renderTeamLayout('เจ้าหน้าที่ทีม', content, 'officials', base, profile));
});

// Page 7.3: /team/official-edit.php (Official Add / Edit Form - Full Page Layout)
router.get('/team/official-edit.php', checkTeamSession, async (req: Request, res: Response) => {
  const base = getBaseUrl(req);
  const teamId = await getLoggedTeamId(req);
  const profile = await getDbTeamProfile(req);
  
  const officials = await getDbOfficials(teamId);
  const officialId = (req.query.id as string) || '';
  const selectedCategory = ((req.query.category as string) || 'ALL').toUpperCase();
  const editOfficial = officialId ? officials.find(o => o.id === officialId) : null;

  const getOfficialCats = (off: any): string[] => {
    if (!off.categories) return ['U14'];
    if (Array.isArray(off.categories)) return off.categories;
    return String(off.categories).split(',').map(c => c.trim()).filter(Boolean);
  };

  const registeredCategories: string[] = TEAM_CATEGORIES.filter((c) => getTeamCategoryState(profile, c) === 'ACTIVE');
  const existingOfficialCats = editOfficial ? getOfficialCats(editOfficial).map((c) => c.trim().toUpperCase()).filter(Boolean) : [];
  const legacyInactiveCategories = editOfficial ? existingOfficialCats.filter((c) => !registeredCategories.includes(c)) : [];

  const submittedCatsStr = profile.submitted_categories || '';
  const submittedCatsList = submittedCatsStr.split(',').map((c: string) => c.trim()).filter(Boolean);

  const u14Count = officials.filter(o => getOfficialCats(o).includes('U14')).length;
  const u16Count = officials.filter(o => getOfficialCats(o).includes('U16')).length;
  const u18Count = officials.filter(o => getOfficialCats(o).includes('U18')).length;
  const countForCat = (cat: string) => cat === 'U14' ? u14Count : (cat === 'U16' ? u16Count : u18Count);

  // Determine checked categories based on request context:
  // - If editing existing official: use saved categories
  // - If adding new official and category is ALL: check ONLY registered categories that have NOT been submitted and are not full
  // - If adding new official and category is U14/U16/U18: check ONLY that specific category (if not submitted)
  let defaultCheckedCats: string[] = [];
  if (editOfficial) {
    defaultCheckedCats = getOfficialCats(editOfficial);
  } else if (selectedCategory === 'ALL') {
    defaultCheckedCats = registeredCategories.filter((c: string) => countForCat(c) < 8);
  } else if (registeredCategories.includes(selectedCategory)) {
    if (countForCat(selectedCategory) < 8) {
      defaultCheckedCats = [selectedCategory];
    } else {
      defaultCheckedCats = [];
    }
  } else {
    defaultCheckedCats = registeredCategories.filter((c: string) => countForCat(c) < 8);
  }

  const positions = OFFICIAL_POSITION_PRIORITY;

  const positionOptions = positions.map(pos => {
    const selected = editOfficial && editOfficial.position === pos ? 'selected' : '';
    return `<option value="${pos}" ${selected}>${pos}</option>`;
  }).join('');

  const pageTitle = editOfficial ? 'แก้ไขข้อมูลเจ้าหน้าที่' : 'เพิ่มเจ้าหน้าที่';

  const content = `
  <div class="sticky-top bg-white border-bottom shadow-sm px-3 py-2 mb-3 rounded-3 d-flex justify-content-between align-items-center flex-wrap gap-2" style="top: 50px; z-index: 1020;">
    <div class="d-flex align-items-center flex-wrap gap-3">
      <h4 class="fw-bold text-navy mb-0"><i class="bi ${editOfficial ? 'bi-pencil-square' : 'bi-person-plus-fill'} me-2"></i> ${pageTitle}</h4>
    </div>
    <a href="${base}/team/officials.php${selectedCategory !== 'ALL' ? '?category=' + selectedCategory : ''}" class="btn btn-outline-secondary btn-sm fw-semibold">
      <i class="bi bi-arrow-left me-1"></i> ย้อนกลับ
    </a>
  </div>

  <div class="row g-4">
    <div class="col-12">
      <div class="card shadow-sm border-0 rounded-3">
        <div class="card-body p-4">
          <form id="officialForm" action="${base}/api/team/officials/save" method="POST" enctype="multipart/form-data" novalidate>
            ${editOfficial ? `<input type="hidden" name="id" value="${editOfficial.id}">` : ''}

            <!-- 1. TOP FIELD: Multi-Category Selection Checkboxes -->
            <div class="mb-4">
              <label class="form-label fw-semibold text-navy fs-6">รุ่นอายุที่สังกัด <span class="text-danger">*</span> <span class="text-muted fw-normal small">(เลือกได้มากกว่า 1 รุ่น)</span></label>
              <div class="p-3 bg-light rounded border" id="official_categories_group">
                <div class="d-flex flex-wrap gap-3">
                  ${registeredCategories.map((c) => {
        const isChecked = defaultCheckedCats.includes(c);
        const currentCatCount = countForCat(c);
        const isEditingSelfInCat = editOfficial && getOfficialCats(editOfficial).includes(c);
        const isFull = currentCatCount >= 8 && !isEditingSelfInCat;
        const isDisabled = isFull;
        const colorClass = c === 'U14' ? 'bg-info text-dark' : (c === 'U16' ? 'bg-primary' : 'bg-danger');
        const disabledNotice = isFull ? '<span class="small text-danger fw-normal">(เต็ม 8 คน)</span>' : '';
        return `
                      <div class="form-check m-0 d-flex align-items-center gap-2 ${isDisabled ? 'text-muted opacity-75' : ''}">
                        <input class="form-check-input official-category-checkbox mt-0" type="checkbox" name="categories[]" value="${c}" id="off_cat_${c}" ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
                        <label class="form-check-label d-flex align-items-center gap-1 cursor-pointer mb-0" for="off_cat_${c}">
                          <span class="badge ${colorClass}">${c}</span>
                          <span class="fw-semibold">${c} (${currentCatCount}/8 คน)</span> ${disabledNotice}
                        </label>
                      </div>
                    `;
    }).join('')}
                  ${legacyInactiveCategories.map((c) => `
                      <div class="form-check m-0 d-flex align-items-center gap-2 text-muted opacity-75">
                        <input type="hidden" name="categories[]" value="${c}">
                        <input class="form-check-input official-category-checkbox mt-0" type="checkbox" value="${c}" id="off_cat_legacy_${c}" checked disabled>
                        <label class="form-check-label d-flex align-items-center gap-1 mb-0" for="off_cat_legacy_${c}">
                          <span class="badge bg-secondary">${c}</span>
                          <span class="fw-semibold">${c}</span> <span class="small text-muted">(รุ่นเดิมที่ไม่ได้ลงสมัคร/ยกเลิกแล้ว)</span>
                        </label>
                      </div>
                    `).join('')}
                </div>
              </div>
              <div class="invalid-feedback fw-semibold" id="official_categories_error"></div>
            </div>

            <!-- 2. Name Field -->
            <div class="mb-3">
              <label class="form-label fw-semibold text-navy">ชื่อ-นามสกุล <span class="text-danger">*</span></label>
              <input type="text" id="official_name_input" name="name" class="form-control" placeholder="เช่น นายสมชาย เข็มกลัด" value="${editOfficial ? editOfficial.name : ''}" required>
              <div class="invalid-feedback fw-semibold" id="official_name_error"></div>
            </div>

            <!-- 3. Position Field -->
            <div class="mb-3">
              <label class="form-label fw-semibold text-navy">ตำแหน่ง <span class="text-danger">*</span></label>
              <select id="official_position_select" name="position" class="form-select" required>
                <option value="">— เลือกตำแหน่ง —</option>
                ${positionOptions}
              </select>
              <div class="invalid-feedback fw-semibold" id="official_position_error"></div>
            </div>

            <!-- Dynamic Coach License Section -->
            <div id="license_fields_container" class="mb-3 p-3 bg-light border rounded-3" style="display: ${editOfficial && (editOfficial.position === 'ผู้ฝึกสอน' || editOfficial.position === 'ผู้ช่วยผู้ฝึกสอน') ? 'block' : 'none'};">
              <label class="form-label fw-semibold text-navy mb-2"><i class="bi bi-award me-1"></i>ใบอนุญาตผู้ฝึกสอน (Coach License)</label>

              <div class="d-flex gap-4 mb-2">
                <div class="form-check">
                  <input class="form-check-input" type="radio" name="has_license" id="has_license_no" value="NO" ${!editOfficial || editOfficial.hasLicense !== 'YES' ? 'checked' : ''}>
                  <label class="form-check-label fw-semibold cursor-pointer" for="has_license_no">ไม่มี License</label>
                </div>
                <div class="form-check">
                  <input class="form-check-input" type="radio" name="has_license" id="has_license_yes" value="YES" ${editOfficial && editOfficial.hasLicense === 'YES' ? 'checked' : ''}>
                  <label class="form-check-label fw-semibold cursor-pointer" for="has_license_yes">มี License</label>
                </div>
              </div>

              <!-- License Details (Shown when YES is selected) -->
              <div id="license_details_container" class="p-3 bg-white border rounded mt-2" style="display: ${editOfficial && editOfficial.hasLicense === 'YES' ? 'block' : 'none'};">
                <div class="mb-3">
                  <label class="form-label fw-semibold text-navy">ระดับใบอนุญาต / ประกาศนียบัตร <span class="text-danger">*</span></label>
                  <select id="license_type_select" name="license_type" class="form-select">
                    <option value="">— เลือกประเภท License —</option>
                    <option value="FA Thailand G-Diploma" ${editOfficial && editOfficial.licenseType === 'FA Thailand G-Diploma' ? 'selected' : ''}>FA Thailand G-Diploma</option>
                    <option value="AFC C-Diploma" ${editOfficial && editOfficial.licenseType === 'AFC C-Diploma' ? 'selected' : ''}>AFC C-Diploma</option>
                    <option value="AFC B-Diploma" ${editOfficial && editOfficial.licenseType === 'AFC B-Diploma' ? 'selected' : ''}>AFC B-Diploma</option>
                    <option value="AFC A-Diploma" ${editOfficial && editOfficial.licenseType === 'AFC A-Diploma' ? 'selected' : ''}>AFC A-Diploma</option>
                    <option value="AFC Pro-Diploma" ${editOfficial && editOfficial.licenseType === 'AFC Pro-Diploma' ? 'selected' : ''}>AFC Pro-Diploma</option>
                  </select>
                  <div class="invalid-feedback fw-semibold" id="license_type_error"></div>
                </div>

                <div>
                  <label class="form-label fw-semibold text-navy">Certificate Serial (เลขที่ประกาศนียบัตร) <span class="text-danger">*</span></label>
                  <input type="text" id="license_serial_input" name="license_serial" class="form-control" placeholder="เช่น CERT-2026-998877" value="${editOfficial ? (editOfficial.licenseSerial || '') : ''}">
                  <div class="invalid-feedback fw-semibold" id="license_serial_error"></div>
                </div>
              </div>
            </div>

            <!-- 4. ID Card Field -->
            <div class="mb-3">
              <label class="form-label fw-semibold text-navy">เลขประจำตัวประชาชน / ข้อมูลระบุตัวตน <span id="official_id_card_required_mark" class="text-danger" style="${editOfficial && editOfficial.position === 'ผู้จัดการทีม' ? '' : 'display:none;'}">*</span></label>
              <input type="text" id="official_id_card_input" name="id_card" class="form-control" placeholder="กรอกตัวเลขหรือตัวอักษร ไม่เกิน 20 ตัว" maxlength="20" value="${editOfficial ? (editOfficial.idCard || '') : ''}">
              <div class="invalid-feedback fw-semibold" id="official_id_card_error"></div>
              <div class="form-text text-muted">กรอกตัวเลขหรือตัวอักษรได้ ไม่เกิน 20 ตัวอักษร</div>
            </div>

            <!-- 4.1 Official ID Card Document Upload Field -->
            <div class="mb-3">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <label class="form-label fw-semibold text-navy mb-0">สำเนาบัตรประชาชน <span id="official_doc_id_card_required_mark" class="text-danger" style="${editOfficial && editOfficial.position === 'ผู้จัดการทีม' ? '' : 'display:none;'}">*</span> <span id="official_doc_id_card_required_badge" class="badge bg-danger ms-1" style="${editOfficial && editOfficial.position === 'ผู้จัดการทีม' && !hasValidStoredOfficialDocument(editOfficial.docIdCard || editOfficial.doc_id_card) ? '' : 'display:none;'}">REQUIRED</span> <span class="text-muted fw-normal small">(JPG, PNG หรือ PDF ไม่เกิน 2 MB)</span></label>
                ${editOfficial && hasValidStoredOfficialDocument(editOfficial.docIdCard || editOfficial.doc_id_card) ? `<button type="button" class="btn btn-sm btn-outline-info py-0 px-2 fs-7" onclick="viewPhoto('สำเนาบัตรประชาชน (${editOfficial.name})', '${base}${editOfficial.docIdCard || editOfficial.doc_id_card}')"><i class="bi bi-eye me-1"></i> รีวิวเอกสาร</button>` : ''}
              </div>
              <input type="file" name="doc_id_card" id="official_doc_id_card_input" class="form-control" accept="image/*,application/pdf" ${editOfficial && editOfficial.position === 'ผู้จัดการทีม' && !hasValidStoredOfficialDocument(editOfficial.docIdCard || editOfficial.doc_id_card) ? 'required' : ''}>
              <div class="invalid-feedback fw-semibold" id="official_doc_id_card_error"></div>
              ${editOfficial && hasValidStoredOfficialDocument(editOfficial.docIdCard || editOfficial.doc_id_card) ? `<div class="form-text text-success small"><i class="bi bi-check-circle-fill me-1"></i> มีไฟล์เดิมที่อัปโหลดไว้แล้ว</div>` : ''}
            </div>

            <!-- 5. Phone Field -->
            <div class="mb-3">
              <label class="form-label fw-semibold text-navy">เบอร์โทรศัพท์ <span class="text-danger">*</span></label>
              <input type="tel" id="official_phone_input" name="phone" class="form-control" placeholder="08XXXXXXXX" value="${editOfficial ? (editOfficial.phone || '') : ''}" required>
              <div class="invalid-feedback fw-semibold" id="official_phone_error"></div>
              <div class="form-text text-muted">กรุณากรอกเฉพาะตัวเลข 9-10 หลัก</div>
            </div>

            <!-- 6. Email Field -->
            <div class="mb-4">
              <label class="form-label fw-semibold text-navy">อีเมล</label>
              <input type="email" id="official_email_input" name="email" class="form-control" placeholder="email@example.com" value="${editOfficial ? (editOfficial.email || '') : ''}">
              <div class="invalid-feedback fw-semibold" id="official_email_error"></div>
            </div>

            <div class="d-flex gap-2 pt-2 border-top">
              <button type="submit" class="btn btn-primary px-4 py-2 fw-semibold" id="btn_save_official">
                <i class="bi bi-box-arrow-in-down me-1"></i> ${editOfficial ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล'}
              </button>
              <a href="${base}/team/officials.php${selectedCategory !== 'ALL' ? '?category=' + selectedCategory : ''}" class="btn btn-outline-secondary px-4 py-2"><i class="bi bi-x-circle me-1"></i> ยกเลิก</a>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const form = document.getElementById('officialForm');
      if (!form) return;

      const nameInput = document.getElementById('official_name_input');
      const posSelect = document.getElementById('official_position_select');
      const idCardInput = document.getElementById('official_id_card_input');
      const docIdCardInput = document.getElementById('official_doc_id_card_input');
      const hasExistingDoc = ${editOfficial && hasValidStoredOfficialDocument(editOfficial.docIdCard || editOfficial.doc_id_card) ? 'true' : 'false'};
      const phoneInput = document.getElementById('official_phone_input');
      const emailInput = document.getElementById('official_email_input');
      const catGroup = document.getElementById('official_categories_group');

      const licenseFieldsContainer = document.getElementById('license_fields_container');
      const licenseDetailsContainer = document.getElementById('license_details_container');
      const radioHasLicenseYes = document.getElementById('has_license_yes');
      const radioHasLicenseNo = document.getElementById('has_license_no');
      const licenseTypeSelect = document.getElementById('license_type_select');
      const licenseSerialInput = document.getElementById('license_serial_input');

      function updateIdCardDocumentRequirement() {
        const isManager = posSelect && posSelect.value === 'ผู้จัดการทีม';
        const idCardRequiredMark = document.getElementById('official_id_card_required_mark');
        const requiredMark = document.getElementById('official_doc_id_card_required_mark');
        const requiredBadge = document.getElementById('official_doc_id_card_required_badge');
        const requiresNewUpload = Boolean(isManager && !hasExistingDoc);
        if (idCardInput) idCardInput.required = Boolean(isManager);
        if (idCardRequiredMark) idCardRequiredMark.style.display = isManager ? '' : 'none';
        if (docIdCardInput) docIdCardInput.required = requiresNewUpload;
        if (requiredMark) requiredMark.style.display = isManager ? '' : 'none';
        if (requiredBadge) requiredBadge.style.display = requiresNewUpload ? '' : 'none';
      }

      if (posSelect) posSelect.addEventListener('change', updateIdCardDocumentRequirement);
      updateIdCardDocumentRequirement();

      function updateLicenseFieldsVisibility() {
        const val = posSelect ? posSelect.value : '';
        const isCoach = (val === 'ผู้ฝึกสอน' || val === 'ผู้ช่วยผู้ฝึกสอน');
        if (licenseFieldsContainer) {
          licenseFieldsContainer.style.display = isCoach ? 'block' : 'none';
        }
        if (!isCoach) {
          if (radioHasLicenseNo) radioHasLicenseNo.checked = true;
          if (licenseDetailsContainer) licenseDetailsContainer.style.display = 'none';
        } else {
          if (radioHasLicenseYes && radioHasLicenseYes.checked) {
            if (licenseDetailsContainer) licenseDetailsContainer.style.display = 'block';
          } else {
            if (licenseDetailsContainer) licenseDetailsContainer.style.display = 'none';
          }
        }
      }

      if (posSelect) posSelect.addEventListener('change', updateLicenseFieldsVisibility);
      if (radioHasLicenseYes) radioHasLicenseYes.addEventListener('change', updateLicenseFieldsVisibility);
      if (radioHasLicenseNo) radioHasLicenseNo.addEventListener('change', updateLicenseFieldsVisibility);

      form.querySelectorAll('input, select').forEach(function(el) {
        el.addEventListener('input', function() {
          el.classList.remove('is-invalid');
          const errDiv = document.getElementById(el.id + '_error') || document.getElementById(el.name + '_error');
          if (errDiv) { errDiv.textContent = ''; errDiv.style.display = 'none'; }
        });
        el.addEventListener('change', function() {
          el.classList.remove('is-invalid');
          const errDiv = document.getElementById(el.id + '_error') || document.getElementById(el.name + '_error');
          if (errDiv) { errDiv.textContent = ''; errDiv.style.display = 'none'; }
        });
      });

      form.addEventListener('submit', function(e) {
        e.preventDefault();

        form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
        form.querySelectorAll('.invalid-feedback').forEach(el => { el.textContent = ''; el.style.display = 'none'; });

        let firstInvalid = null;

        function markInvalid(inputEl, errorDivId, message) {
          if (inputEl) inputEl.classList.add('is-invalid');
          const errDiv = document.getElementById(errorDivId);
          if (errDiv) {
            errDiv.textContent = message;
            errDiv.style.display = 'block';
          }
          if (!firstInvalid && inputEl) {
            firstInvalid = inputEl;
          }
        }

        if (!nameInput.value.trim()) {
          markInvalid(nameInput, 'official_name_error', 'กรุณากรอกชื่อ-นามสกุล');
        }

        if (!posSelect.value) {
          markInvalid(posSelect, 'official_position_error', 'กรุณาเลือกตำแหน่ง');
        }

        const isCoachPos = (posSelect.value === 'ผู้ฝึกสอน' || posSelect.value === 'ผู้ช่วยผู้ฝึกสอน');
        if (isCoachPos && radioHasLicenseYes && radioHasLicenseYes.checked) {
          if (!licenseTypeSelect || !licenseTypeSelect.value) {
            markInvalid(licenseTypeSelect, 'license_type_error', 'กรุณาเลือกระดับใบอนุญาต (License Level)');
          }
          if (!licenseSerialInput || !licenseSerialInput.value.trim()) {
            markInvalid(licenseSerialInput, 'license_serial_error', 'กรุณากรอก Certificate Serial (เลขที่ประกาศนียบัตร)');
          }
        }

        const idCardValue = (idCardInput.value || '').trim();
        if (posSelect.value === 'ผู้จัดการทีม' && !idCardValue) {
          markInvalid(idCardInput, 'official_id_card_error', 'กรุณากรอกเลขประจำตัวประชาชนหรือข้อมูลระบุตัวตน');
        } else if (idCardValue.length > 20) {
          markInvalid(idCardInput, 'official_id_card_error', 'ข้อมูลระบุตัวตนต้องมีความยาวไม่เกิน 20 ตัวอักษร');
        }

        const cleanPhone = (phoneInput.value || '').replace(/\D/g, '');
        if (!phoneInput.value.trim()) {
          markInvalid(phoneInput, 'official_phone_error', 'กรุณากรอกเบอร์โทรศัพท์');
        } else if (cleanPhone.length < 9 || cleanPhone.length > 10) {
          markInvalid(phoneInput, 'official_phone_error', 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 9-10 หลักเท่านั้น');
        }

        const requiresIdCardDocument = posSelect.value === 'ผู้จัดการทีม';
        if (requiresIdCardDocument && !hasExistingDoc && (!docIdCardInput || !docIdCardInput.files || docIdCardInput.files.length === 0)) {
          markInvalid(docIdCardInput, 'official_doc_id_card_error', 'กรุณาเลือกไฟล์แนบสำเนาบัตรประชาชน');
        }

        const checkedCats = form.querySelectorAll('.official-category-checkbox:checked');
        if (checkedCats.length === 0) {
          markInvalid(catGroup, 'official_categories_error', 'กรุณาเลือกอย่างน้อย 1 รุ่นอายุที่สังกัด');
        }

        if (firstInvalid) {
          firstInvalid.focus();
          return false;
        }

        const btnSave = document.getElementById('btn_save_official');
        if (btnSave) {
          btnSave.disabled = true;
          btnSave.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> กำลังบันทึก...';
        }

        const formData = new FormData(form);

        fetch(form.action, {
          method: 'POST',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json'
          },
          body: formData
        })
        .then(res => res.json())
        .then(data => {
          if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML = '<i class="bi bi-box-arrow-in-down me-1"></i> บันทึกข้อมูล';
          }
          if (data.success) {
            Swal.fire({
              icon: 'success',
              title: 'บันทึกสำเร็จ!',
              text: data.message || 'บันทึกข้อมูลเจ้าหน้าที่เรียบร้อยแล้ว',
              confirmButtonColor: '#0b2a5b'
            }).then(() => {
              location.href = data.redirectUrl || '${base}/team/officials.php${selectedCategory !== 'ALL' ? '?category=' + selectedCategory : ''}';
            });
          } else {
            const errMsg = data.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล';
            if (errMsg.includes('บัตรประชาชน')) {
              markInvalid(idCardInput, 'official_id_card_error', errMsg);
            } else if (errMsg.includes('โทรศัพท์')) {
              markInvalid(phoneInput, 'official_phone_error', errMsg);
            } else if (errMsg.includes('รุ่น') || errMsg.includes('8 คน')) {
              markInvalid(catGroup, 'official_categories_error', errMsg);
            } else {
              markInvalid(nameInput, 'official_name_error', errMsg);
            }
          }
        })
        .catch(err => {
          if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML = '<i class="bi bi-box-arrow-in-down me-1"></i> บันทึกข้อมูล';
          }
          markInvalid(nameInput, 'official_name_error', 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
        });
      });
    });
  </script>`;
  res.send(renderTeamLayout(pageTitle, content, 'officials', base, profile));
});

// API POST /api/team/officials/save (With Multi-Category & 8 Officials Per Category Limit Guard & File Upload)
router.post('/api/team/officials/save', checkTeamSession, requireSignedTeamSession, upload.any(), async (req: Request, res: Response) => {
  const base = getBaseUrl(req);
  const loggedTeamId = await getLoggedTeamId(req, false);

  const isJson = req.headers['x-requested-with'] === 'XMLHttpRequest' || (req.headers.accept && req.headers.accept.includes('application/json'));

  const { id, name, position, id_card, phone, email, has_license, license_type, license_serial } = req.body;
  const categories = parseCategories(req.body);

  
const isTeamManager = String(position || '').trim() === 'ผู้จัดการทีม';
const files = (req.files as Express.Multer.File[]) || [];
  const idCardValue = String(id_card ?? '').trim();
  const idCardDuplicateKey = normalizeOfficialIdCardForDuplicateCheck(idCardValue);
  const cleanPhone = (phone || '').replace(/[^0-9]/g, '');

  if (!name || !position || (isTeamManager && !idCardValue) || !phone || categories.length === 0) {
    if (isJson) return res.status(400).json({ success: false, error: 'กรุณากรอกข้อมูล ชื่อ-นามสกุล, ตำแหน่ง, เลขประจำตัวประชาชน, เบอร์โทรศัพท์ และเลือกรุ่นอายุให้ครบถ้วน' });
    return res.status(400).send('กรุณากรอกข้อมูลให้ครบถ้วน');
  }

  // Validate File Size (Max 2MB)
  const MAX_FILE_SIZE = 2 * 1024 * 1024;
  const oversizeFile = files.find(f => f.size > MAX_FILE_SIZE);
  if (oversizeFile) {
    const errMsg = 'ไฟล์สำเนาบัตรประชาชนต้องมีขนาดไม่เกิน 2 MB';
    if (isJson) return res.status(400).json({ success: false, error: errMsg });
    return res.status(400).send(errMsg);
  }

  // Handle doc_id_card file upload
  let docIdCardPath: string | null = null;
  const docFile = files.find(f => f.fieldname === 'doc_id_card');
  if (docFile) {
    docIdCardPath = `/uploads/${docFile.filename}`;
  }

  // Mandatory check: Must have doc_id_card uploaded now OR existing doc_id_card in DB
  
  const existingOfficial = id ? (await getDbOfficials(loggedTeamId)).find(o => String(o.id).trim() === String(id).trim()) : null;
  if (id && !existingOfficial) {
    const errMsg = 'ไม่พบข้อมูลเจ้าหน้าที่ของทีมในระบบ หรือรายการนี้ไม่ได้เป็นของทีมที่เข้าสู่ระบบ';
    if (isJson) return res.status(404).json({ success: false, error: errMsg });
    return res.status(404).send(errMsg);
  }
  const hasDocIdCard = hasValidStoredOfficialDocument(docIdCardPath) || Boolean(existingOfficial &&
        (hasValidStoredOfficialDocument(existingOfficial.docIdCard) || hasValidStoredOfficialDocument(existingOfficial.doc_id_card)));

  if (idCardValue.length > 20) {
    const errMsg = 'ข้อมูลระบุตัวตนต้องมีความยาวไม่เกิน 20 ตัวอักษร';
    if (isJson) return res.status(400).json({ success: false, error: errMsg });
    return res.status(400).send(errMsg);
  }

  if (cleanPhone.length < 9 || cleanPhone.length > 10) {
    if (isJson) return res.status(400).json({ success: false, error: 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 9-10 หลักเท่านั้น' });
    return res.status(400).send('เบอร์โทรศัพท์ต้องเป็นตัวเลข 9-10 หลัก');
  }

  // Guard: never write an official without a resolvable team (prevents orphan records with empty team_id)
  
if ((position === 'ผู้ฝึกสอน' || position === 'ผู้ช่วยผู้ฝึกสอน') && has_license === 'YES') {
        if (!license_type || !license_serial || !license_serial.trim()) {
            const errMsg = 'กรุณาระบุระดับใบอนุญาต (License Level) และ Certificate Serial ให้ครบถ้วน';
            if (isJson)
                return res.status(400).json({ success: false, error: errMsg });
            return res.status(400).send(errMsg);
        }
    }
if (!String(loggedTeamId || '').trim()) {
    const errMsg = 'ไม่พบข้อมูลทีมใน Session ของท่าน กรุณาเข้าสู่ระบบใหม่อีกครั้ง';
    if (isJson) return res.status(401).json({ success: false, error: errMsg, expired: true, redirectUrl: `${base}/team/login.php?expired=1` });
    return res.status(401).send(errMsg);
  }

  const systemWideOfficials = await getDbOfficials('ALL');
  const allOfficials = systemWideOfficials.filter(o => String(o.teamId || '').trim() === String(loggedTeamId).trim());

  // Guard: Check duplicate ID card across teams; same-team duplicates are allowed.
  const duplicateOfficial = isTeamManager ? systemWideOfficials.find(o => {
    if (id && String(o.id).trim() === String(id).trim()) return false; // exclude currently edited official
    const officialTeamId = String(o.teamId || '').trim();
    if (officialTeamId === String(loggedTeamId).trim()) return false;
    return normalizeOfficialIdCardForDuplicateCheck(o.idCard) === idCardDuplicateKey;
  }) : undefined;

  if (duplicateOfficial) {
    const allTeams = await getDbRegisteredTeams();
    const otherTeam = allTeams.find((t: any) => String(t.id).trim() === String(duplicateOfficial.teamId).trim());
    const otherTeamName = otherTeam ? (otherTeam.teamName || otherTeam.school || otherTeam.id) : '';
    const isOrphanRecord = !String(duplicateOfficial.teamId || '').trim() || !otherTeam;
    const teamNotice = (otherTeamName && String(duplicateOfficial.teamId).trim() !== String(loggedTeamId).trim()) ? ` (ทีม "${otherTeamName}")` : '';
    const orphanNotice = isOrphanRecord ? ' — ข้อมูลนี้ไม่ได้ผูกกับทีมใดในระบบ (ข้อมูลค้าง) กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบและลบข้อมูลเดิม' : '';
    const errMsg = `ข้อมูลระบุตัวตน ${idCardValue} มีอยู่ในระบบแล้ว (${duplicateOfficial.name} - ${duplicateOfficial.position}${teamNotice})${orphanNotice}`;
    if (isJson) return res.status(400).json({ success: false, error: errMsg });
    return res.status(400).send(errMsg);
  }

  // Guard: Reject categories that are not ACTIVE for the session team (unless already on the edited official)
  const teamCategoryRes = await pool.query(
    'SELECT id, categories, cancelled_categories, submitted_categories, is_deleted FROM football_registered_team WHERE id::text = $1 LIMIT 1',
    [String(loggedTeamId).trim()]
  );
  const memTeamForCategory = teamsDatabase.find((t: any) => String(t.id).trim() === String(loggedTeamId).trim());
  const teamCategoryRecord = teamCategoryRes.rows?.[0] || memTeamForCategory || teamProfile;
  if (teamCategoryRecord?.is_deleted || teamCategoryRecord?.isDeleted) {
    const errMsg = 'ไม่พบข้อมูลทีมในระบบ';
    if (isJson) return res.status(404).json({ success: false, error: errMsg });
    return res.status(404).send(errMsg);
  }
  const existingOfficialCats = existingOfficial
    ? splitTeamCategories(existingOfficial.categories || 'U14')
    : [];
  const disallowedCategories = categories.filter((cat: string) => {
    if (getTeamCategoryState(teamCategoryRecord, cat) === 'ACTIVE') return false;
    return !(id && existingOfficialCats.includes(cat));
  });
  if (disallowedCategories.length > 0) {
    const errMsg = `ไม่สามารถเพิ่มเจ้าหน้าที่ในรุ่น ${disallowedCategories.join(', ')} ได้ เนื่องจากทีมไม่ได้ลงสมัครหรือยกเลิกการสมัครรุ่นดังกล่าวแล้ว`;
    if (isJson) return res.status(400).json({ success: false, error: errMsg });
    return res.status(400).send(errMsg);
  }

  // Guard: Max 8 officials per category limit check
  for (const cat of categories) {
    const existingInCat = allOfficials.filter(o => {
      if (id && String(o.id).trim() === String(id).trim()) return false; // exclude currently edited official
      const oCats = !o.categories ? ['U14'] : (Array.isArray(o.categories) ? o.categories : String(o.categories).split(',').map(c => c.trim()));
      return oCats.includes(cat);
    });

    if (existingInCat.length >= 8) {
      const errMsg = `จำนวนเจ้าหน้าที่ประจำรุ่น ${cat} ครบตามโควตาสูงสุดแล้ว (8/8 คน) ไม่สามารถเพิ่มได้อีก`;
      if (isJson) return res.status(400).json({ success: false, error: errMsg });
      return res.status(400).send(errMsg);
    }
  }

  
const requiresIdCardDocument = isTeamManager;
if (requiresIdCardDocument && !hasDocIdCard) {
        const errMsg = 'กรุณาแนบไฟล์สำเนาบัตรประชาชน';
        if (isJson)
            return res.status(400).json({ success: false, error: errMsg });
        return res.status(400).send(errMsg);
    }
const categoriesStr = categories.join(',');
  const finalHasLicense = (position === 'ผู้ฝึกสอน' || position === 'ผู้ช่วยผู้ฝึกสอน') ? (has_license || 'NO') : 'NO';
  const finalLicenseType = finalHasLicense === 'YES' ? (license_type || null) : null;
  const finalLicenseSerial = finalHasLicense === 'YES' && license_serial ? license_serial.trim() : null;

  if (id) {
    // Edit existing official
    let updateResult;
    try {
      updateResult = docIdCardPath
        ? await pool.query(
          'UPDATE football_official SET name = $1, position = $2, id_card = $3, phone = $4, email = $5, categories = $6, has_license = $7, license_type = $8, license_serial = $9, doc_id_card = $10 WHERE id = $11 AND team_id = $12',
          [name.trim(), position, idCardValue, cleanPhone, email ? email.trim() : null, categoriesStr, finalHasLicense, finalLicenseType, finalLicenseSerial, docIdCardPath, id, loggedTeamId]
        )
        : await pool.query(
          'UPDATE football_official SET name = $1, position = $2, id_card = $3, phone = $4, email = $5, categories = $6, has_license = $7, license_type = $8, license_serial = $9 WHERE id = $10 AND team_id = $11',
          [name.trim(), position, idCardValue, cleanPhone, email ? email.trim() : null, categoriesStr, finalHasLicense, finalLicenseType, finalLicenseSerial, id, loggedTeamId]
        );
    } catch (error) {
      console.error('Failed to update official in database:', error);
      const errMsg = 'บันทึกการแก้ไขเจ้าหน้าที่ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
      if (isJson) return res.status(500).json({ success: false, error: errMsg });
      return res.status(500).send(errMsg);
    }
    if (!updateResult.rowCount) {
      const errMsg = 'ไม่พบข้อมูลเจ้าหน้าที่ของทีมในระบบ หรือรายการนี้เปลี่ยนสังกัดแล้ว กรุณาโหลดข้อมูลใหม่';
      if (isJson) return res.status(404).json({ success: false, error: errMsg });
      return res.status(404).send(errMsg);
    }
    const off = officialsDatabase.find(o => String(o.id).trim() === String(id).trim() && String(o.teamId || '').trim() === String(loggedTeamId).trim());
    if (off) {
      off.name = name.trim();
      off.position = position;
      off.idCard = idCardValue;
      off.phone = cleanPhone;
      off.email = email ? email.trim() : '';
      off.categories = categoriesStr;
      off.hasLicense = finalHasLicense;
      off.licenseType = finalLicenseType || '';
      off.licenseSerial = finalLicenseSerial || '';
      if (docIdCardPath) {
        off.docIdCard = docIdCardPath;
        off.doc_id_card = docIdCardPath;
      }
    }
    if (existingOfficial) {
      const changes = getAuditFieldChanges('OFFICIAL', {
        position: existingOfficial.position,
        categories: existingOfficial.categories,
        hasLicense: existingOfficial.hasLicense || existingOfficial.has_license,
        licenseType: existingOfficial.licenseType || existingOfficial.license_type,
        name: existingOfficial.name,
        idCard: existingOfficial.idCard || existingOfficial.id_card,
        phone: existingOfficial.phone,
        email: existingOfficial.email,
        licenseSerial: existingOfficial.licenseSerial || existingOfficial.license_serial,
        attachment: existingOfficial.docIdCard || existingOfficial.doc_id_card
      }, {
        position,
        categories: categoriesStr,
        hasLicense: finalHasLicense,
        licenseType: finalLicenseType,
        name: name.trim(),
        idCard: idCardValue,
        phone: cleanPhone,
        email: email ? email.trim() : null,
        licenseSerial: finalLicenseSerial,
        attachment: docIdCardPath || existingOfficial.docIdCard || existingOfficial.doc_id_card
      });
      if (changes.changedFields.length) {
        await writeAuditLog(req, {
          eventType: 'OFFICIAL_UPDATED', entityType: 'OFFICIAL', entityId: String(id), teamId: String(loggedTeamId),
          oldState: changes.oldState, newState: changes.newState,
          metadata: { changedFields: changes.changedFields.join(', ') }
        });
      }
    }
  } else {
    const newId = `OFF-${Date.now().toString().slice(-4)}`;
    try {
      await pool.query(
        'INSERT INTO football_official (id, team_id, name, position, id_card, phone, email, categories, has_license, license_type, license_serial, doc_id_card, doc_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
        [newId, loggedTeamId, name.trim(), position, idCardValue, cleanPhone, email ? email.trim() : null, categoriesStr, finalHasLicense, finalLicenseType, finalLicenseSerial, docIdCardPath, 'APPROVED']
      );
    } catch (error) {
      console.error('Failed to insert official into database:', error);
      const errMsg = 'บันทึกเจ้าหน้าที่ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
      if (isJson) return res.status(500).json({ success: false, error: errMsg });
      return res.status(500).send(errMsg);
    }

    officialsDatabase.push({
      id: newId,
      teamId: loggedTeamId,
      name: name.trim(),
      position,
      idCard: idCardValue,
      phone: cleanPhone,
      email: email ? email.trim() : '',
      categories: categoriesStr,
      hasLicense: finalHasLicense,
      licenseType: finalLicenseType || '',
      licenseSerial: finalLicenseSerial || '',
      docIdCard: docIdCardPath || undefined,
      doc_id_card: docIdCardPath || undefined,
      photoUrl: null,
      docStatus: 'APPROVED'
    });

    try {
      await writeAuditLog(req, {
        eventType: 'OFFICIAL_CREATED', entityType: 'OFFICIAL', entityId: newId, teamId: String(loggedTeamId),
        newState: { position, categories: categoriesStr },
        metadata: { changedFields: 'รายการเจ้าหน้าที่' }
      });
    } catch (error) {
      // The official is saved; keep identity/contact details out of fallback logs.
      console.error('Official creation audit log failed:', error);
    }
  }

  if (isJson) {
    return res.json({ success: true, message: 'บันทึกข้อมูลเจ้าหน้าที่เรียบร้อยแล้ว', redirectUrl: `${base}/team/officials.php` });
  }

  return res.redirect(`${base}/team/officials.php`);
});

// API POST /api/team/officials/delete
router.post('/api/team/officials/delete', checkTeamSession, async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ success: false, error: 'Missing official ID' });

  const loggedTeamId = await getLoggedTeamId(req, false);
  const officials = await getDbOfficials(loggedTeamId);
  const officialToDelete = officials.find((official: any) => String(official.id).trim() === String(id).trim());
  if (!officialToDelete) return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลเจ้าหน้าที่ของทีมในระบบ' });

  const deleteResult = await pool.query('DELETE FROM football_official WHERE id = $1 AND team_id = $2', [id, loggedTeamId]);
  if (deleteResult.rowCount) {
    try {
      await writeAuditLog(req, {
        eventType: 'OFFICIAL_DELETED', entityType: 'OFFICIAL', entityId: String(id), teamId: String(loggedTeamId),
        oldState: { position: officialToDelete.position, categories: officialToDelete.categories },
        metadata: { changedFields: 'รายการเจ้าหน้าที่' }
      });
    } catch (error) {
      console.error('Audit log write failed after official deletion:', error);
      return res.status(500).json({ success: false, auditLogFailed: true, error: 'ลบเจ้าหน้าที่แล้ว แต่บันทึกประวัติไม่สำเร็จ กรุณาตรวจสอบก่อนทำรายการซ้ำ' });
    }
  }

  const idx = officialsDatabase.findIndex(o => o.id === id);
  if (idx !== -1) {
    officialsDatabase.splice(idx, 1);
  }

  return res.json({ success: true, message: 'ลบข้อมูลเจ้าหน้าที่สำเร็จ' });
});

// API GET /api/team/export-o2-excel (Export O-2 Excel Layout matching PDF)
router.get('/api/team/export-o2-excel', checkTeamSession, async (req: Request, res: Response) => {
  try {
    const ExcelJS = require('exceljs');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('รายชื่อทีม (O-2)', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 }
    });

    const teamId = await getLoggedTeamId(req);
    const profile = await getDbTeamProfile(req);
    const allPlayers = await getDbPlayers(teamId);
    const officials = await getDbOfficials(teamId);

    const categoryReq = (req.query.category || '').toString().trim();
    const activeCategories = (profile.categories && profile.categories.length > 0) ? profile.categories : ['U14'];
const selectedCategory = categoryReq || activeCategories[0] || 'U14';

    const schoolOrTeam = (profile as any).school || (profile as any).teamName || 'ทีม';
    const teamManager = getOfficialForCategoryAndPosition(officials, selectedCategory, 'ผู้จัดการทีม');
    const headCoach = getOfficialForCategoryAndPosition(officials, selectedCategory, 'ผู้ฝึกสอน');

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const YYYY = now.getFullYear();
    const MM = pad(now.getMonth() + 1);
    const DD = pad(now.getDate());
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());

    const categoryPlayers = allPlayers.filter((p: any) => {
      const pCatStr = String(p.category || p.categories || 'U14').toUpperCase();
      return pCatStr.split(',').map((c: string) => c.trim()).includes(selectedCategory.toUpperCase());
    });

    // 1. Column Widths Setup (Total 10 Columns A-J matching PDF)
    worksheet.columns = [
      { key: 'col1', width: 8 },   // A: ลำดับ
      { key: 'col2', width: 12 },  // B: เลขเสื้อ
      { key: 'col3', width: 32 },  // C: ชื่อ-นามสกุล
      { key: 'col4', width: 18 },  // D: ชื่อหลังเสื้อ
      { key: 'col5', width: 22 },  // E: เลขบัตรประชาชน
      { key: 'col6', width: 16 },  // F: วัน/เดือน/ปี เกิด
      { key: 'col7', width: 16 },  // G: ตำแหน่ง
      { key: 'col8', width: 15 },  // H: P (ลงแข่ง)
      { key: 'col9', width: 15 },  // I: S (สำรอง)
      { key: 'col10', width: 15 }  // J: N (ไม่ส่งชื่อ)
    ];

    const thinBorder: any = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };

    const cyanFill: any = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF46B5D8' }
    };

    const yellowFill: any = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFF00' }
    };

    // 2. Left Header Box (A1:D5)
    worksheet.mergeCells('B1:D1');
    worksheet.mergeCells('B2:D2');
    worksheet.mergeCells('B3:D3');
    worksheet.mergeCells('B4:D4');
    worksheet.mergeCells('B5:D5');

    const setHeaderLeft = (r: number, label: string, val: string) => {
      const cellLabel = worksheet.getCell(`A${r}`);
      cellLabel.value = label;
      cellLabel.font = { name: 'Garuda', size: 9, bold: true };
      cellLabel.alignment = { vertical: 'middle', horizontal: 'left' };

      const cellVal = worksheet.getCell(`B${r}`);
      cellVal.value = val;
      cellVal.font = { name: 'Garuda', size: 9, bold: false };
      cellVal.alignment = { vertical: 'middle', horizontal: 'left' };
    };

    setHeaderLeft(1, 'ชื่อทีม', schoolOrTeam);
    setHeaderLeft(2, 'ประเภททีม', 'เยาวชน');
    setHeaderLeft(3, 'รุ่นอายุ', selectedCategory);
    setHeaderLeft(4, 'วันแข่งขัน', '-');
    setHeaderLeft(5, 'คู่การแข่งขัน', '-');

    for (let r = 1; r <= 5; r++) {
      for (let c = 1; c <= 4; c++) {
        worksheet.getCell(r, c).border = thinBorder;
      }
    }

    // 3. Right Header Box - Kit Color (E1:J5)
    worksheet.mergeCells('E1:J1');
    const headerKitTitle = worksheet.getCell('E1');
    headerKitTitle.value = 'สีชุดการแข่งขัน';
    headerKitTitle.font = { name: 'Garuda', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    headerKitTitle.fill = cyanFill;
    headerKitTitle.alignment = { vertical: 'middle', horizontal: 'center' };

    // Player Kit Row (E2:F3 & G2:J3)
    worksheet.mergeCells('E2:F3');
    const playerKitLabel = worksheet.getCell('E2');
    playerKitLabel.value = 'ผู้เล่น';
    playerKitLabel.font = { name: 'Garuda', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    playerKitLabel.fill = cyanFill;
    playerKitLabel.alignment = { vertical: 'middle', horizontal: 'center' };

    worksheet.mergeCells('G2:J3');
    const playerKitVal = worksheet.getCell('G2');
    playerKitVal.value = '';

    // Goalkeeper Kit Row (E4:F5 & G4:J5)
    worksheet.mergeCells('E4:F5');
    const gkKitLabel = worksheet.getCell('E4');
    gkKitLabel.value = 'ผู้รักษาประตู';
    gkKitLabel.font = { name: 'Garuda', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    gkKitLabel.fill = cyanFill;
    gkKitLabel.alignment = { vertical: 'middle', horizontal: 'center' };

    worksheet.mergeCells('G4:J5');
    const gkKitVal = worksheet.getCell('G4');
    gkKitVal.value = '';

    for (let r = 1; r <= 5; r++) {
      for (let c = 5; c <= 10; c++) {
        worksheet.getCell(r, c).border = thinBorder;
      }
    }

    // 4. Section Subheader (Row 6)
    const titleCell = worksheet.getCell('A6');
    titleCell.value = 'รายชื่อนักกีฬา';
    titleCell.font = { name: 'Garuda', size: 10, bold: true };

    // 5. Table Column Headers (Row 7 - 10 Columns A-J)
    const headers = [
      'ลำดับ', 'เลขเสื้อ', 'ชื่อ-นามสกุล', 'ชื่อหลังเสื้อ',
      'เลขบัตรประชาชน', 'วัน/เดือน/ปี เกิด', 'ตำแหน่ง',
      'P (ลงแข่ง)', 'S (สำรอง)', 'N (ไม่ส่งชื่อ)'
    ];

    const headerRow = worksheet.getRow(7);
    headerRow.height = 24;
    headers.forEach((h: string, idx: number) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { name: 'Garuda', size: 8.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = cyanFill;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = thinBorder;
    });

    // 6. Fixed 30 Roster Rows (Rows 8 to 37)
    for (let i = 0; i < 30; i++) {
      const p = categoryPlayers[i];
      const seqNo = i + 1;
      const r = worksheet.getRow(8 + i);
      r.height = 18;

      const isFirstRow = i === 0;

      let prefix = '';
      let fname = '';
      let lname = '';
      let fullName = '';
      let birthDateStr = '';

      if (p) {
        prefix = p.prefix || '';
        fname = p.firstName || (p.name || '').trim().split(' ')[0] || '';
        lname = p.lastName || (p.name || '').trim().split(' ').slice(1).join(' ') || '';
        fullName = `${prefix}${fname} ${lname}`.trim();

        if (p.birthDate && p.birthDate.includes('-')) {
          const parts = p.birthDate.split('-');
          if (parts.length === 3) {
            const beYear = parseInt(parts[0], 10) + 543;
            birthDateStr = `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}/${beYear}`;
          }
        } else {
          birthDateStr = p.birthDate || '';
        }
      }

      const rowValues = [
        seqNo,                                                         // 1. ลำดับ
        p ? (p.jerseyNo ? Number(p.jerseyNo) : '') : '',                // 2. เลขเสื้อ
        p ? fullName : '',                                             // 3. ชื่อ-นามสกุล
        p ? (p.jerseyName || '') : '',                                 // 4. ชื่อหลังเสื้อ
        p ? (p.idCard || '') : '',                                     // 5. เลขบัตรประชาชน
        p ? birthDateStr : '',                                         // 6. วันเกิด
        p ? (p.position || 'กองหน้า') : '',                             // 7. ตำแหน่ง
        '',                                                            // 8. P (ลงแข่ง) - Blank
        '',                                                            // 9. S (สำรอง)
        ''                                                             // 10. N (ไม่ส่งชื่อ)
      ];

      rowValues.forEach((val: any, idx: number) => {
        const cell = r.getCell(idx + 1);
        cell.value = val;
        cell.font = { name: 'Garuda', size: 8, bold: isFirstRow };
        cell.border = thinBorder;
        if (isFirstRow) cell.fill = yellowFill;

        const colIndex = idx + 1;
        if (colIndex === 3 || colIndex === 4) {
          cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      });
    }

    // 7. Signature Block (3 Parallel Side-by-Side Boxes matching PDF: A39:C43, D39:G43, H39:J43)
    const teamProvince = profile.province || profile.contact_province || 'เชียงใหม่';
    const excelSigBoxes = [
      {
        startCol: 'A', endCol: 'C', startColIdx: 1, endColIdx: 3,
        title: 'ผู้อำนวยการสำนักงาน',
        subTitle: `การกีฬาแห่งประเทศไทยจังหวัด ${teamProvince}`,
        name: ''
      },
      {
        startCol: 'D', endCol: 'G', startColIdx: 4, endColIdx: 7,
        title: teamManager?.position || '',
        subTitle: '',
        name: teamManager?.name || ''
      },
      {
        startCol: 'H', endCol: 'J', startColIdx: 8, endColIdx: 10,
        title: headCoach?.position || '',
        subTitle: '',
        name: headCoach?.name || ''
      }
    ];

    excelSigBoxes.forEach((box) => {
      // Header Bar: Row 39
      worksheet.mergeCells(`${box.startCol}39:${box.endCol}39`);
      const hCell = worksheet.getCell(`${box.startCol}39`);
      hCell.value = 'ลงนาม';
      hCell.font = { name: 'Garuda', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
      hCell.fill = cyanFill;
      hCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Empty Signature Space: Row 40-41
      worksheet.mergeCells(`${box.startCol}40:${box.endCol}41`);

      // Title Row: Row 42
      worksheet.mergeCells(`${box.startCol}42:${box.endCol}42`);
      const tCell = worksheet.getCell(`${box.startCol}42`);
      tCell.value = box.title;
      tCell.font = { name: 'Garuda', size: 8.5, bold: true };
      tCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // Subtitle or Name Row: Row 43
      worksheet.mergeCells(`${box.startCol}43:${box.endCol}43`);
      const nCell = worksheet.getCell(`${box.startCol}43`);
      nCell.value = box.subTitle || box.name;
      nCell.font = { name: 'Garuda', size: 8.5, bold: true };
      nCell.alignment = { vertical: 'middle', horizontal: 'center' };

      for (let r = 39; r <= 43; r++) {
        for (let c = box.startColIdx; c <= box.endColIdx; c++) {
          worksheet.getCell(r, c).border = thinBorder;
        }
      }
    });

    const exportFileName = `football-${selectedCategory}-${YYYY}${MM}${DD}-${hh}${mm}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(exportFileName)}"; filename*=UTF-8''${encodeURIComponent(exportFileName)}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generating Excel O-2 file:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการสร้างไฟล์ Excel');
  }
});

// API GET /api/team/export-registration-excel (Team budget registration form)
router.get('/api/team/export-registration-excel', checkTeamSession, async (req: Request, res: Response) => {
  try {
    const ExcelJS = require('exceljs');
    const teamId = await getLoggedTeamId(req);
    const profile = await getDbTeamProfile(req);
    const allPlayers = await getDbPlayers(teamId);
    const officials = await getDbOfficials(teamId);
    const activeCategories: string[] = Array.isArray(profile.categories)
      ? profile.categories.map((category: any) => String(category).trim()).filter(Boolean)
      : String(profile.categories || '').split(',').map((category: string) => category.trim()).filter(Boolean);
    const categoryReq = String(req.query.category || '').trim().toUpperCase();
    const selectedCategory = activeCategories.find(category => category.toUpperCase() === categoryReq);
    if (!selectedCategory) return res.status(400).send('กรุณาเลือกรุ่นที่ทีมลงทะเบียน');

    const categoryPlayers = allPlayers.filter((player: any) =>
      String(player.category || player.categories || 'U14').toUpperCase().split(',').map((category: string) => category.trim()).includes(selectedCategory.toUpperCase())
    );
    const coach = getOfficialForCategoryAndPosition(officials, selectedCategory, 'ผู้ฝึกสอน');
    const manager = getOfficialForCategoryAndPosition(officials, selectedCategory, 'ผู้จัดการทีม');
    const teamName = String((profile as any).school || profile.teamName || '');
    const province = String(profile.province || profile.contact_province || '');
    const signers = [
      { role: coach?.position || '', name: coach?.name || '', phone: coach?.phone || '' },
      { role: manager?.position || '', name: manager?.name || '', phone: manager?.phone || '' },
      { role: 'ผู้รับผิดชอบ\nผู้ช่วยปฏิบัติงานโครงการฯ', name: '', phone: '' },
      { role: `ผู้อำนวยการสำนักงาน กกท.\nจังหวัด ${province}`.trim(), name: '', phone: '' }
    ];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('ใบสมัคร', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 }
    });
    worksheet.columns = [
      { width: 5 }, { width: 8 }, { width: 14 }, { width: 14 },
      { width: 11 }, { width: 11 }, { width: 9 }, { width: 9 },
      { width: 9 }, { width: 9 }, { width: 10 }, { width: 10 }
    ];
    const border: any = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };
    const cyanFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF46B5D8' } };
    const yellowFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    const applyBorder = (row: number, start: number, end: number) => {
      for (let column = start; column <= end; column += 1) worksheet.getCell(row, column).border = border;
    };
    const mergeRow = (row: number, start: number, end: number, value: any, font: any, alignment: any) => {
      if (end > start) worksheet.mergeCells(row, start, row, end);
      const cell = worksheet.getCell(row, start);
      cell.value = value;
      cell.font = font;
      cell.alignment = alignment;
      applyBorder(row, start, end);
    };

    worksheet.mergeCells('A1:L1');
    worksheet.getCell('A1').value = 'ใบสมัคร';
    worksheet.getCell('A1').font = { name: 'Garuda', size: 22, bold: true };
    worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 32;

    const teamDetails = [
      ['ชื่อทีม', teamName], ['ประเภททีม', 'เยาวชน'], ['รุ่นอายุ', selectedCategory], ['วันแข่งขัน', ''], ['ค่าการแข่งขัน', '']
    ];
    teamDetails.forEach(([label, value], index) => {
      const row = index + 3;
      worksheet.getRow(row).height = 18;
      mergeRow(row, 1, 2, label, { name: 'Garuda', size: 9, bold: true }, { vertical: 'middle', horizontal: 'left' });
      mergeRow(row, 3, 6, value, { name: 'Garuda', size: 9 }, { vertical: 'middle', horizontal: 'left' });
    });
    mergeRow(3, 7, 12, 'สีชุดการแข่งขัน', { name: 'Garuda', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }, { vertical: 'middle', horizontal: 'center' });
    worksheet.getCell('G3').fill = cyanFill;
    worksheet.mergeCells('G4:H5');
    worksheet.mergeCells('I4:L5');
    worksheet.mergeCells('G6:H7');
    worksheet.mergeCells('I6:L7');
    worksheet.getCell('G4').value = 'ผู้เล่น';
    worksheet.getCell('G6').value = 'ผู้รักษาประตู';
    for (const address of ['G4', 'G6']) {
      worksheet.getCell(address).font = { name: 'Garuda', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getCell(address).fill = cyanFill;
      worksheet.getCell(address).alignment = { vertical: 'middle', horizontal: 'center' };
    }
    for (let row = 3; row <= 7; row += 1) applyBorder(row, 7, 12);

    worksheet.getCell('A9').value = 'รายชื่อนักกีฬา';
    worksheet.getCell('A9').font = { name: 'Garuda', size: 10, bold: true };
    worksheet.getRow(9).height = 20;
    const tableColumns = [
      { start: 1, end: 1, label: 'ลำดับ' }, { start: 2, end: 2, label: 'เลขเสื้อ' },
      { start: 3, end: 4, label: 'ชื่อ-นามสกุล' }, { start: 5, end: 6, label: 'ชื่อหลังเสื้อ' },
      { start: 7, end: 8, label: 'เลขบัตรประชาชน' }, { start: 9, end: 10, label: 'วัน/เดือน/ปี เกิด' },
      { start: 11, end: 12, label: 'ตำแหน่ง' }
    ];
    worksheet.getRow(10).height = 24;
    tableColumns.forEach(column => {
      mergeRow(10, column.start, column.end, column.label,
        { name: 'Garuda', size: 8, bold: true, color: { argb: 'FFFFFFFF' } },
        { vertical: 'middle', horizontal: 'center', wrapText: true });
      for (let cellColumn = column.start; cellColumn <= column.end; cellColumn += 1) worksheet.getCell(10, cellColumn).fill = cyanFill;
    });

    for (let index = 0; index < 30; index += 1) {
      const player = categoryPlayers[index];
      const row = 11 + index;
      worksheet.getRow(row).height = 18;
      const prefix = player?.prefix || '';
      const firstName = player?.firstName || (player?.name || '').trim().split(' ')[0] || '';
      const lastName = player?.lastName || (player?.name || '').trim().split(' ').slice(1).join(' ') || '';
      let birthDate = player?.birthDate || '';
      if (typeof birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
        const [year, month, day] = birthDate.split('-').map(Number);
        birthDate = `${day}/${month}/${year + 543}`;
      }
      const values = [index + 1, player?.jerseyNo || '', `${prefix}${firstName} ${lastName}`.trim(), player?.jerseyName || '', player?.idCard || '', birthDate, player?.position || ''];
      tableColumns.forEach((column, columnIndex) => {
        mergeRow(row, column.start, column.end, values[columnIndex],
          { name: 'Garuda', size: 8, bold: index === 0 },
          { vertical: 'middle', horizontal: columnIndex === 2 || columnIndex === 3 ? 'left' : 'center', wrapText: true });
        if (index === 0) {
          for (let cellColumn = column.start; cellColumn <= column.end; cellColumn += 1) worksheet.getCell(row, cellColumn).fill = yellowFill;
        }
      });
    }

    const signerGroups = [
      { start: 1, end: 3 }, { start: 4, end: 6 }, { start: 7, end: 9 }, { start: 10, end: 12 }
    ];
    signers.forEach((signer, index) => {
      const group = signerGroups[index];
      mergeRow(42, group.start, group.end, 'ลงนาม', { name: 'Garuda', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }, { vertical: 'middle', horizontal: 'center' });
      worksheet.getCell(42, group.start).fill = cyanFill;
      worksheet.mergeCells(43, group.start, 44, group.end);
      worksheet.getCell(43, group.start).value = '';
      worksheet.getCell(43, group.start).border = border;
      for (let row = 43; row <= 44; row += 1) applyBorder(row, group.start, group.end);
      mergeRow(45, group.start, group.end, signer.role, { name: 'Garuda', size: 8, bold: true }, { vertical: 'middle', horizontal: 'center', wrapText: true });
      mergeRow(46, group.start, group.end, `ชื่อ-นามสกุล: ${signer.name || '________________'}`, { name: 'Garuda', size: 7 }, { vertical: 'middle', horizontal: 'left', wrapText: true });
      mergeRow(47, group.start, group.end, `เบอร์โทรศัพท์: ${signer.phone || '________________'}`, { name: 'Garuda', size: 7 }, { vertical: 'middle', horizontal: 'left', wrapText: true });
    });
    worksheet.getRow(42).height = 16;
    worksheet.getRow(43).height = 18;
    worksheet.getRow(44).height = 18;
    worksheet.getRow(45).height = 34;
    worksheet.getRow(46).height = 22;
    worksheet.getRow(47).height = 22;

    const now = new Date();
    const pad = (value: number) => value.toString().padStart(2, '0');
    const exportFileName = `ใบสมัคร-${selectedCategory}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(exportFileName)}"; filename*=UTF-8''${encodeURIComponent(exportFileName)}`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generating registration Excel file:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการสร้างไฟล์ใบสมัคร Excel');
  }
});

// API GET /api/team/export-o2-pdf (Export O-2 PDF Form Layout)
router.get('/api/team/export-o2-pdf', checkTeamSession, async (req: Request, res: Response) => {
  try {
    const PDFDocument = require('pdfkit');

    const teamId = await getLoggedTeamId(req);
    const profile = await getDbTeamProfile(req);
    const allPlayers = await getDbPlayers(teamId);
    const officials = await getDbOfficials(teamId);

    const categoryReq = (req.query.category || '').toString().trim();
    const activeCategories = (profile.categories && profile.categories.length > 0) ? profile.categories : ['U14'];
const selectedCategory = categoryReq || activeCategories[0] || 'U14';

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const YYYY = now.getFullYear();
    const MM = pad(now.getMonth() + 1);
    const DD = pad(now.getDate());
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());

    const categoryPlayers = allPlayers.filter((p: any) => {
      const pCatStr = String(p.category || p.categories || 'U14').toUpperCase();
      return pCatStr.split(',').map((c: string) => c.trim()).includes(selectedCategory.toUpperCase());
    });

    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 20 });

    const fontDirectory = path.resolve(__dirname, '../../../assets/fonts');
    const fontPath = path.join(fontDirectory, 'Garuda.ttf');
    const fontBoldPath = path.join(fontDirectory, 'Garuda-Bold.ttf');
    doc.registerFont('THFont', fontPath);
    doc.registerFont('THFont-Bold', fontBoldPath);
    const fontRegularName = 'THFont';
    const fontBoldName = 'THFont-Bold';

    const exportFileName = `football-${YYYY}${MM}${DD}-${hh}${mm}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFileName}"`);

    doc.pipe(res);

    const startX = 20;
    let startY = 20;

    const schoolOrTeam = (profile as any).school || (profile as any).teamName || 'ทีม';
    const categoryOfficial = getTopOfficialForCategory(officials, selectedCategory);

    // Total printable width: 555 pt (A4 width 595 - margin 40)
    const totalWidth = 555;

    // 1. Header Information Grid (Top 2-Column Boxes)
    const headerLeftWidth = 270;
    const headerRightWidth = 275;

    // Left Header Box
    doc.rect(startX, startY, headerLeftWidth, 75).stroke('#000000');
    let leftY = startY + 4;
    doc.font(fontBoldName).fontSize(8).fillColor('#000000');
    
    doc.text('ชื่อทีม', startX + 6, leftY);
    doc.font(fontRegularName).text(schoolOrTeam, startX + 65, leftY, { width: headerLeftWidth - 70 });
    leftY += 14;

    doc.font(fontBoldName).text('ประเภททีม', startX + 6, leftY);
    doc.font(fontRegularName).text('เยาวชน', startX + 65, leftY);
    leftY += 14;

    doc.font(fontBoldName).text('รุ่นอายุ', startX + 6, leftY);
    doc.font(fontRegularName).text(selectedCategory, startX + 65, leftY);
    leftY += 14;

    doc.font(fontBoldName).text('วันแข่งขัน', startX + 6, leftY);
    leftY += 14;

    doc.font(fontBoldName).text('คู่การแข่งขัน', startX + 6, leftY);

    // Right Header Box (Kit Color & Match Spec)
    const rightX = startX + headerLeftWidth + 10;
    const headerRightBoxHeight = 88;
    doc.rect(rightX, startY, headerRightWidth, headerRightBoxHeight).stroke('#000000');
    
    // Header bar inside right box (20pt height for padding)
    doc.rect(rightX, startY, headerRightWidth, 20).fillAndStroke('#46b5d8', '#000000');
    doc.font(fontBoldName).fontSize(8.5).fillColor('#ffffff').text('สีชุดการแข่งขัน', rightX, startY + 5.5, { width: headerRightWidth, align: 'center' });

    let rightY = startY + 20;
    const kitRowHeight = 34;
    // Row: ผู้เล่น
    doc.rect(rightX, rightY, 70, kitRowHeight).fillAndStroke('#46b5d8', '#000000');
    doc.font(fontBoldName).fontSize(8.5).fillColor('#ffffff').text('ผู้เล่น', rightX, rightY + 10, { width: 70, align: 'center' });

    doc.rect(rightX + 70, rightY, headerRightWidth - 70, kitRowHeight).stroke('#000000');

    rightY += kitRowHeight;
    // Row: ผู้รักษาประตู
    doc.rect(rightX, rightY, 70, kitRowHeight).fillAndStroke('#46b5d8', '#000000');
    doc.font(fontBoldName).fontSize(8.5).fillColor('#ffffff').text('ผู้รักษาประตู', rightX, rightY + 10, { width: 70, align: 'center' });

    doc.rect(rightX + 70, rightY, headerRightWidth - 70, kitRowHeight).stroke('#000000');

    startY += headerRightBoxHeight + 8;

    // Subheader: รายชื่อนักกีฬา (With spacing above)
    doc.font(fontBoldName).fontSize(9).fillColor('#000000').text('รายชื่อนักกีฬา', startX, startY);
    startY += 14;

    // 2. Table Column Headers (10 Columns - Total 555 pt)
    const colWidths = [22, 35, 130, 62, 80, 55, 45, 42, 42, 42]; // Total 555 pt
    const headers = [
      'ลำดับ', 'เลขเสื้อ', 'ชื่อ-นามสกุล', 'ชื่อหลังเสื้อ',
      'เลขบัตรประชาชน', 'วัน/เดือน/ปี เกิด', 'ตำแหน่ง',
      'P (ลงแข่ง)', 'S (สำรอง)', 'N (ไม่ส่งชื่อ)'
    ];

    const drawHeaderRow = (y: number) => {
      let currentX = startX;
      for (let i = 0; i < colWidths.length; i++) {
        const w = colWidths[i];
        doc.rect(currentX, y, w, 16).fillAndStroke('#46b5d8', '#000000');
        doc.font(fontBoldName).fontSize(6.5).fillColor('#ffffff');
        doc.text(headers[i], currentX, y + 4, { width: w, align: 'center' });
        currentX += w;
      }
      return y + 16;
    };

    startY = drawHeaderRow(startY);

    // 3. Fixed 30 Roster Rows (Fit in 1 Portrait A4 page)
    const rowHeight = 17;
    for (let i = 0; i < 30; i++) {
      const p = categoryPlayers[i];
      const seqNo = (i + 1).toString();

      let currentX = startX;
      const isHighlightedRow = i === 0;

      for (let c = 0; c < colWidths.length; c++) {
        const w = colWidths[c];
        
        if (isHighlightedRow) {
          doc.rect(currentX, startY, w, rowHeight).fillAndStroke('#ffff00', '#000000');
        } else {
          doc.rect(currentX, startY, w, rowHeight).stroke('#000000');
        }

        doc.font(fontRegularName).fontSize(6.5).fillColor('#000000');

        let cellVal = '';
        let align: any = 'center';
        let textIndent = 1;

        if (p) {
          if (c === 0) cellVal = seqNo;
          else if (c === 1) cellVal = p.jerseyNo ? String(p.jerseyNo) : '';
          else if (c === 2) {
            const prefix = p.prefix || '';
            const fname = p.firstName || (p.name || '').trim().split(' ')[0] || '';
            const lname = p.lastName || (p.name || '').trim().split(' ').slice(1).join(' ') || '';
            cellVal = `${prefix}${fname} ${lname}`.trim();
            align = 'left';
            textIndent = 5; // Indent ~2 characters from left border
          }
          else if (c === 3) { cellVal = p.jerseyName || ''; align = 'left'; textIndent = 3; }
          else if (c === 4) { cellVal = p.idCard || ''; align = 'center'; }
          else if (c === 5) {
            if (p.birthDate && p.birthDate.includes('-')) {
              const parts = p.birthDate.split('-');
              if (parts.length === 3) {
                const beYear = parseInt(parts[0], 10) + 543;
                cellVal = `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}/${beYear}`;
              }
            } else {
              cellVal = p.birthDate || '';
            }
          }
          else if (c === 6) { cellVal = p.position || 'กองหน้า'; }
          else if (c === 7) { cellVal = ''; } // P (ลงแข่ง) - Blank
        } else {
          if (c === 0) cellVal = seqNo;
        }

        if (cellVal) {
          doc.text(cellVal, currentX + textIndent, startY + 4, { width: w - (textIndent * 2), align });
        }
        currentX += w;
      }
      startY += rowHeight;
    }

    // 4. Coach signature block, aligned to the right as in the original layout.
    const totalSigWidth = totalWidth; // 555 pt
    const gap = 12;
    const singleBoxWidth = (totalSigWidth - (gap * 2)) / 3; // Keep the original right-side box width.
    const coachBoxX = startX + totalSigWidth - singleBoxWidth;
    const sigBoxY = startY + 6;

    let curY = sigBoxY;
    doc.rect(coachBoxX, curY, singleBoxWidth, 15).fillAndStroke('#46b5d8', '#000000');
    doc.font(fontBoldName).fontSize(7.5).fillColor('#ffffff').text('ลงนาม', coachBoxX, curY + 3.5, { width: singleBoxWidth, align: 'center' });

    curY += 15;
    doc.rect(coachBoxX, curY, singleBoxWidth, 25).stroke('#000000');
    curY += 27;

    doc.font(fontBoldName).fontSize(7).fillColor('#000000').text(categoryOfficial?.position || '', coachBoxX, curY, { width: singleBoxWidth, align: 'center' });
    curY += 8;

    const officialName = categoryOfficial?.name || '';
    if (officialName) {
      const signerName = `นาย${officialName.replace(/^(นาย|นาง|นางสาว|ด\.ช\.|ด\.ญ\.)\s*/, '')}`;
      doc.font(fontBoldName).fontSize(7.5).fillColor('#000000').text(signerName, coachBoxX, curY, { width: singleBoxWidth, align: 'center' });
    }

    doc.end();
  } catch (err) {
    console.error('Error generating PDF file:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF');
  }
});

// API GET /api/team/export-registration-pdf (Team budget registration form)
router.get('/api/team/export-registration-pdf', checkTeamSession, async (req: Request, res: Response) => {
  try {
    const PDFDocument = require('pdfkit');
    const teamId = await getLoggedTeamId(req);
    const profile = await getDbTeamProfile(req);
    const players = await getDbPlayers(teamId);
    const officials = await getDbOfficials(teamId);
    const activeCategories: string[] = Array.isArray(profile.categories)
      ? profile.categories.map((category: any) => String(category).trim()).filter(Boolean)
      : String(profile.categories || '').split(',').map((category: string) => category.trim()).filter(Boolean);
    const categoryReq = String(req.query.category || '').trim().toUpperCase();
    const selectedCategory = activeCategories.find(category => category.toUpperCase() === categoryReq);
    if (!selectedCategory) return res.status(400).send('กรุณาเลือกรุ่นที่ทีมลงทะเบียน');

    const categoryPlayers = players.filter((player: any) =>
      String(player.category || player.categories || 'U14').toUpperCase().split(',').map((category: string) => category.trim()).includes(selectedCategory.toUpperCase())
    );
    const coach = getOfficialForCategoryAndPosition(officials, selectedCategory, 'ผู้ฝึกสอน');
    const manager = getOfficialForCategoryAndPosition(officials, selectedCategory, 'ผู้จัดการทีม');
    const teamName = String((profile as any).school || profile.teamName || '');
    const province = String(profile.province || profile.contact_province || '');
    const signers = [
      { role: coach?.position || '', name: coach?.name || '', phone: coach?.phone || '' },
      { role: manager?.position || '', name: manager?.name || '', phone: manager?.phone || '' },
      { role: 'ผู้รับผิดชอบ\nผู้ช่วยปฏิบัติงานโครงการฯ', name: '', phone: '' },
      { role: `ผู้อำนวยการสำนักงาน กกท.\nจังหวัด ${province}`.trim(), name: '', phone: '' }
    ];

    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 20 });
    const fontDirectory = path.resolve(__dirname, '../../../assets/fonts');
    doc.registerFont('THFont', path.join(fontDirectory, 'Garuda.ttf'));
    doc.registerFont('THFont-Bold', path.join(fontDirectory, 'Garuda-Bold.ttf'));
    const regular = 'THFont';
    const bold = 'THFont-Bold';
    const exportFileName = `registration-${selectedCategory}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFileName}"`);
    doc.pipe(res);

    const startX = 20;
    const pageWidth = 555;
    doc.font(bold).fontSize(20).fillColor('#000000').text('ใบสมัคร', startX, 18, { width: pageWidth, align: 'center' });

    const headerY = 48;
    const leftWidth = 270;
    const rightX = startX + leftWidth + 5;
    const rightWidth = pageWidth - leftWidth - 5;
    doc.rect(startX, headerY, leftWidth, 72).stroke('#000000');
    const teamDetails = [
      ['ชื่อทีม', teamName], ['ประเภททีม', 'เยาวชน'], ['รุ่นอายุ', selectedCategory], ['วันแข่งขัน', ''], ['ค่าการแข่งขัน', '']
    ];
    teamDetails.forEach(([label, value], index) => {
      const y = headerY + 5 + index * 13;
      doc.font(bold).fontSize(8).text(label, startX + 6, y, { width: 58 });
      doc.font(regular).text(value, startX + 66, y, { width: leftWidth - 72 });
    });
    doc.rect(rightX, headerY, rightWidth, 72).stroke('#000000');
    doc.rect(rightX, headerY, rightWidth, 20).fillAndStroke('#46B5D8', '#000000');
    doc.font(bold).fontSize(9).fillColor('#FFFFFF').text('สีชุดการแข่งขัน', rightX, headerY + 5, { width: rightWidth, align: 'center' });
    doc.rect(rightX, headerY + 20, 63, 26).fillAndStroke('#46B5D8', '#000000');
    doc.rect(rightX, headerY + 46, 63, 26).fillAndStroke('#46B5D8', '#000000');
    doc.font(bold).fontSize(8).fillColor('#FFFFFF').text('ผู้เล่น', rightX + 2, headerY + 29, { width: 59, align: 'center' });
    doc.text('ผู้รักษาประตู', rightX + 2, headerY + 54, { width: 59, align: 'center' });

    const tableY = 137;
    doc.font(bold).fontSize(10).fillColor('#000000').text('รายชื่อนักกีฬา', startX, tableY - 13);
    const columnWidths = [27, 38, 128, 65, 84, 75, 138];
    const headers = ['ลำดับ', 'เลขเสื้อ', 'ชื่อ-นามสกุล', 'ชื่อหลังเสื้อ', 'เลขบัตรประชาชน', 'วัน/เดือน/ปี เกิด', 'ตำแหน่ง'];
    const rowHeight = 15;
    let x = startX;
    headers.forEach((label, index) => {
      doc.rect(x, tableY, columnWidths[index], rowHeight).fillAndStroke('#46B5D8', '#000000');
      doc.font(bold).fontSize(7).fillColor('#FFFFFF').text(label, x + 1, tableY + 4, { width: columnWidths[index] - 2, height: rowHeight - 3, align: 'center', ellipsis: true });
      x += columnWidths[index];
    });
    for (let index = 0; index < 30; index += 1) {
      const player = categoryPlayers[index];
      const prefix = player?.prefix || '';
      const firstName = player?.firstName || (player?.name || '').trim().split(' ')[0] || '';
      const lastName = player?.lastName || (player?.name || '').trim().split(' ').slice(1).join(' ') || '';
      let birthDate = player?.birthDate || '';
      if (typeof birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
        const [year, month, day] = birthDate.split('-').map(Number);
        birthDate = `${day}/${month}/${year + 543}`;
      }
      const values = [index + 1, player?.jerseyNo || '', `${prefix}${firstName} ${lastName}`.trim(), player?.jerseyName || '', player?.idCard || '', birthDate, player?.position || ''];
      x = startX;
      values.forEach((value, column) => {
        const y = tableY + rowHeight * (index + 1);
        doc.rect(x, y, columnWidths[column], rowHeight).fillAndStroke(index === 0 ? '#FFFF00' : '#FFFFFF', '#000000');
        doc.font(index === 0 ? bold : regular).fontSize(7).fillColor('#000000').text(String(value), x + 2, y + 4, { width: columnWidths[column] - 4, height: rowHeight - 3, align: column === 2 || column === 3 ? 'left' : 'center', ellipsis: true });
        x += columnWidths[column];
      });
    }

    const signatureY = tableY + rowHeight * 31 + 6;
    const boxWidth = pageWidth / 4;
    signers.forEach((signer, index) => {
      const boxX = startX + boxWidth * index;
      doc.rect(boxX, signatureY, boxWidth - 4, 16).fillAndStroke('#46B5D8', '#000000');
      doc.font(bold).fontSize(8).fillColor('#FFFFFF').text('ลงนาม', boxX + 2, signatureY + 4, { width: boxWidth - 8, align: 'center' });
      doc.rect(boxX, signatureY + 16, boxWidth - 4, 30).stroke('#000000');
      doc.font(bold).fontSize(7).fillColor('#000000').text(signer.role, boxX + 3, signatureY + 49, { width: boxWidth - 10, height: 24, align: 'center' });
      doc.font(regular).fontSize(6.5).text(`ชื่อ-นามสกุล ${signer.name || '________________'}`, boxX + 2, signatureY + 74, { width: boxWidth - 8, ellipsis: true });
      doc.text(`เบอร์โทรศัพท์ ${signer.phone || '________________'}`, boxX + 2, signatureY + 87, { width: boxWidth - 8, ellipsis: true });
    });
    doc.end();
  } catch (err) {
    console.error('Error generating registration PDF file:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการสร้างไฟล์ใบสมัคร PDF');
  }
});

router.get('/team/submit.php', checkTeamSession, async (req: Request, res: Response) => {
  const base = getBaseUrl(req);
  const teamId = await getLoggedTeamId(req);
  const profile = await getDbTeamProfile(req);
  let players: any[];
  try {
    players = await getPersistedDbPlayers(teamId);
  } catch (error) {
    console.error('Unable to load persisted roster for readiness check:', error);
    return res.status(503).send('ไม่สามารถตรวจสอบรายชื่อนักกีฬาที่บันทึกไว้ได้ กรุณาลองใหม่อีกครั้ง');
  }
  const officials = await getDbOfficials(teamId);

  // Use only explicitly registered team categories.
  const categoriesInUse: string[] = (profile.categories && profile.categories.length > 0) ? profile.categories : ['U14'];
  const submittedCatsStr = profile.submitted_categories || '';
  const submittedCatsList = submittedCatsStr.split(',').map((c: string) => c.trim()).filter(Boolean);

  // Generate category cards for readiness check
  const categoryBlocksHtml = categoriesInUse.map((cat: string) => {
    const catPlayers = players.filter(p => {
      const pCatStr = String(p.category || p.categories || 'U14').toUpperCase();
      return pCatStr.split(',').map((c: string) => c.trim()).includes(cat.toUpperCase());
    });
    const catOfficials = officials.filter(o => {
      const oCatStr = String(o.categories || o.category || 'U14').toUpperCase();
      return oCatStr.split(',').map((c: string) => c.trim()).includes(cat.toUpperCase());
    });
    const minP = catPlayers.length >= 18;
    const maxP = catPlayers.length <= 30;
    const isOffValid = catOfficials.length >= 1 && catOfficials.length <= 8;
    const allCatIdCards = catPlayers.length > 0 && catPlayers.every(p => p.idCard && p.idCard.trim().length >= 13);
    const catManagers = catOfficials.filter(o => String(o.position || '').trim() === 'ผู้จัดการทีม');
const allManagerIdCards = catManagers.every(o => String(o.idCard || '').trim().length > 0 &&
            (hasValidStoredOfficialDocument(o.docIdCard) || hasValidStoredOfficialDocument(o.doc_id_card)));
    
    const catJerseys = catPlayers.map(p => p.jerseyNo).filter(Boolean);
    const uniqueCatJerseys = new Set(catJerseys).size === catJerseys.length;
    const goalkeeperCount = catPlayers.filter(p => String(p.position || '').trim() === 'ผู้รักษาประตู (GK)').length;
    const enoughGoalkeepers = goalkeeperCount >= MIN_GOALKEEPERS;
    const isCatReady = minP && maxP && isOffValid && allCatIdCards && allManagerIdCards && uniqueCatJerseys && enoughGoalkeepers;

    const isSubmitted = submittedCatsList.includes(cat);
    const needsFixPlayers = catPlayers.filter(p => isPlayerCorrectionRequired(p));
    const approvedPlayers = catPlayers.filter(p => p.docStatus === 'APPROVED');
    const waitingPlayers = catPlayers.filter(p => p.docStatus === 'CORRECTED' || (
      p.docStatus !== 'APPROVED' && !isPlayerCorrectionRequired(p)
    ));
    const allPlayersApproved = catPlayers.length > 0 && approvedPlayers.length === catPlayers.length;
    const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character] as string));
    const correctionPlayersHtml = needsFixPlayers.map(p => {
      const fullName = p.name || [p.prefix, p.firstName, p.lastName].filter(Boolean).join(' ');
      const playerName = escapeHtml(fullName || 'ไม่ระบุชื่อ');
      const playerUrl = `${base}/team/player-edit.php?id=${encodeURIComponent(String(p.id))}&returnCategory=${encodeURIComponent(cat)}`;
      const reason = escapeHtml(p.remarks || 'ไม่ระบุ');
      return `<li><a class="fw-semibold" href="${escapeHtml(playerUrl)}">${playerName}</a> สาเหตุการแจ้งปรับแก้ข้อมูล ${reason}</li>`;
    });

    let submissionStatusHtml = '';
    if (profile.status === 'APPROVED' && isSubmitted && needsFixPlayers.length > 0) {
      submissionStatusHtml = `<div class="alert alert-warning mb-3 py-2 px-3 fw-semibold small rounded-2 border-0 d-flex align-items-start gap-2">
                   <i class="bi bi-exclamation-triangle-fill fs-5 text-warning"></i>
                   <div>
                     <strong class="d-block text-dark">ปรับแก้ข้อมูลนักกีฬาเพิ่มเติม</strong>
                     <ol class="mb-0 mt-1 ps-3 text-muted small">${correctionPlayersHtml}</ol>
                   </div>
                 </div>
                 <button class="btn btn-warning btn-lg w-100 fw-bold disabled" disabled>
                   <i class="bi bi-exclamation-circle-fill me-2"></i> ผ่านการอนุมัติทีม มีปรับแก้ข้อมูลนักกีฬา
                 </button>`;
    } else if (profile.status === 'APPROVED' && isSubmitted && !allPlayersApproved) {
      submissionStatusHtml = `<div class="alert alert-info mb-3 py-2 px-3 fw-semibold small rounded-2 border-0 d-flex align-items-start gap-2">
                   <i class="bi bi-clock-history fs-5 text-info"></i>
                   <div>
                     <strong class="d-block text-primary">ผ่านการอนุมัติทีม รอการตรวจสอบนักกีฬา</strong>
                     <span class="text-muted small">อนุมัติ ${approvedPlayers.length} คน รอตรวจสอบ ${waitingPlayers.length} คน</span>
                   </div>
                 </div>
                 <button class="btn btn-info btn-lg w-100 fw-bold disabled" disabled>
                   <i class="bi bi-hourglass-split me-2"></i> ผ่านการอนุมัติทีม รอการตรวจสอบนักกีฬา
                 </button>`;
    } else if (profile.status === 'APPROVED' && isSubmitted && allPlayersApproved) {
      submissionStatusHtml = `<div class="alert alert-success mb-3 py-2 px-3 fw-semibold small rounded-2 border-0 d-flex align-items-center gap-2">
                   <i class="bi bi-shield-check fs-5 text-success"></i>
                   <div>
                     <strong class="d-block text-success">รับรองแล้ว</strong>
                     <span class="text-muted small">ทีมผ่านการอนุมัติ และนักกีฬาได้รับอนุมัติครบทุกคน</span>
                   </div>
                 </div>
                 <button class="btn btn-success btn-lg w-100 fw-bold disabled" disabled>
                   <i class="bi bi-check-circle-fill me-2"></i> รับรองแล้ว (นักกีฬาอนุมัติครบทุกคน)
                 </button>`;
    } else if (isSubmitted) {
      submissionStatusHtml = `<div class="alert alert-info mb-3 py-2 px-3 fw-semibold small rounded-2 border-0 d-flex align-items-center gap-2">
                       <i class="bi bi-clock-history fs-5 text-info"></i>
                       <div>
                         <strong class="d-block text-primary">ยื่นส่งรายชื่อเรียบร้อยแล้ว — รุ่น ${cat}</strong>
                         <span class="text-muted small">ส่งรายชื่อให้เจ้าหน้าที่ตรวจสอบแล้ว ระบบล็อกการแก้ไขนักกีฬาของรุ่นนี้</span>
                       </div>
                     </div>
                     <button class="btn btn-secondary btn-lg w-100 fw-bold disabled" disabled>
                       <i class="bi bi-check-circle me-2"></i> ยื่นส่งรายชื่อแล้ว — รุ่น ${cat}
                     </button>`;
    } else if (isCatReady) {
      submissionStatusHtml = `<div class="alert alert-success mb-3 py-2 px-3 fw-semibold small rounded-2 border-0">
                           <i class="bi bi-check-circle me-1"></i> รายชื่อพร้อมยื่นตรวจสอบ — รุ่น ${cat}
                         </div>
                         <button class="btn btn-primary btn-lg w-100 fw-bold" onclick="submitTeamRoster('${cat}')">
                           <i class="bi bi-send-fill me-2"></i> ยืนยันรายชื่อให้เจ้าหน้าที่ตรวจสอบ — รุ่น ${cat}
                         </button>`;
    } else {
      submissionStatusHtml = `<div class="alert alert-danger mb-3 py-2 px-3 fw-semibold small rounded-2 border-0">
                           <i class="bi bi-exclamation-octagon me-1"></i> รายชื่อไม่ผ่านการรับรอง — รุ่น ${cat}
                         </div>
                         <button class="btn btn-primary btn-lg w-100 fw-bold disabled" disabled style="background-color: #60a5fa; border-color: #60a5fa;">
                           <i class="bi bi-send-fill me-2"></i> ยืนยันรายชื่อให้เจ้าหน้าที่ตรวจสอบ — รุ่น ${cat}
                         </button>`;
    }

    return `
      <div class="card shadow-sm border-0 rounded-3 mb-4">
        <div class="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
          <span class="fw-bold text-navy fs-6">
            <i class="bi bi-trophy-fill text-warning me-2"></i> ตรวจสอบความพร้อมก่อนส่ง — รุ่น ${cat}
          </span>
          <span class="badge ${isSubmitted ? 'bg-info text-dark' : (isCatReady ? 'bg-success' : 'bg-danger')} px-3 py-2">
            ${isSubmitted ? 'ส่งรายชื่อแล้ว (รอการรับรอง)' : (isCatReady ? 'พร้อมส่งรายชื่อ' : 'ยังไม่สมบูรณ์')}
          </span>
        </div>
        <div class="card-body p-0">
          <ul class="list-group list-group-flush">
            <li class="list-group-item d-flex justify-content-between align-items-center py-3 px-4">
              <div class="d-flex align-items-center gap-2">
                ${minP
            ? '<i class="bi bi-check-circle-fill text-success fs-5"></i>'
            : '<i class="bi bi-x-circle-fill text-danger fs-5"></i>'}
                <span class="fw-semibold text-dark">จำนวนนักกีฬาขั้นต่ำ 18 คน ต่อรุ่น (${cat})</span>
              </div>
              <a href="/team/players.php" class="btn btn-sm ${minP ? 'btn-outline-success' : 'btn-outline-primary'} px-3 py-1 text-decoration-none fw-medium">
                ปัจจุบัน ${catPlayers.length} คน <i class="bi bi-arrow-right-short ms-1"></i>
              </a>
            </li>
            
            <li class="list-group-item d-flex justify-content-between align-items-center py-3 px-4">
              <div class="d-flex align-items-center gap-2">
                ${maxP
            ? '<i class="bi bi-check-circle-fill text-success fs-5"></i>'
            : '<i class="bi bi-x-circle-fill text-danger fs-5"></i>'}
                <span class="fw-semibold text-dark">จำนวนนักกีฬาไม่เกิน 30 คน ต่อรุ่น (${cat})</span>
              </div>
              <a href="/team/players.php" class="btn btn-sm ${maxP ? 'btn-outline-success' : 'btn-outline-primary'} px-3 py-1 text-decoration-none fw-medium">
                ปัจจุบัน ${catPlayers.length} คน <i class="bi bi-arrow-right-short ms-1"></i>
              </a>
            </li>

            <li class="list-group-item d-flex justify-content-between align-items-center py-3 px-4">
              <div class="d-flex align-items-center gap-2">
                ${isOffValid
            ? '<i class="bi bi-check-circle-fill text-success fs-5"></i>'
            : '<i class="bi bi-x-circle-fill text-danger fs-5"></i>'}
                <span class="fw-semibold text-dark">เจ้าหน้าที่ทีม 1 - 8 คน</span>
              </div>
              <a href="/team/officials.php" class="btn btn-sm ${isOffValid ? 'btn-outline-success' : 'btn-outline-primary'} px-3 py-1 text-decoration-none fw-medium">
                ปัจจุบัน ${catOfficials.length} คน <i class="bi bi-arrow-right-short ms-1"></i>
              </a>
            </li>

            <li class="list-group-item d-flex justify-content-between align-items-center py-3 px-4">
              <div class="d-flex align-items-center gap-2">
                ${allCatIdCards
            ? '<i class="bi bi-check-circle-fill text-success fs-5"></i>'
            : '<i class="bi bi-x-circle-fill text-danger fs-5"></i>'}
                <span class="fw-semibold text-dark">นักกีฬามีเลขประจำตัวประชาชนครบถ้วน</span>
              </div>
              <a href="/team/players.php" class="btn btn-sm ${catPlayers.length > 0 && allCatIdCards ? 'btn-outline-success' : 'btn-outline-warning'} px-3 py-1 text-decoration-none fw-medium">
                ${catPlayers.length === 0 ? 'ไม่มีข้อมูล (จัดการ)' : (allCatIdCards ? 'ครบทุกคน' : 'ยังไม่ครบ (แก้ไข)')} <i class="bi bi-pencil-square ms-1"></i>
              </a>
            </li>

            <li class="list-group-item d-flex justify-content-between align-items-center py-3 px-4">
              <div class="d-flex align-items-center gap-2">
                ${(allManagerIdCards)
            ? '<i class="bi bi-check-circle-fill text-success fs-5"></i>'
            : '<i class="bi bi-x-circle-fill text-danger fs-5"></i>'}
                <span class="fw-semibold text-dark">${allManagerIdCards ? 'ข้อมูลบัตรประชาชนและสำเนาบัตรของผู้จัดการทีมครบถ้วน' : 'ข้อมูลบัตรประชาชนหรือสำเนาบัตรของผู้จัดการทีมยังไม่ครบถ้วน'}</span>
              </div>
              <a href="/team/officials.php" class="btn btn-sm ${allManagerIdCards ? 'btn-outline-success' : 'btn-outline-warning'} px-3 py-1 text-decoration-none fw-medium">
                ${catManagers.length === 0 ? 'ไม่มีผู้จัดการทีม' : (allManagerIdCards ? 'ครบถ้วน' : 'ยังไม่ครบ (แก้ไข)')} <i class="bi bi-pencil-square ms-1"></i>
              </a>
            </li>

            <li class="list-group-item d-flex justify-content-between align-items-center py-3 px-4">
              <div class="d-flex align-items-center gap-2">
                ${(uniqueCatJerseys && catJerseys.length > 0)
            ? '<i class="bi bi-check-circle-fill text-success fs-5"></i>'
            : '<i class="bi bi-x-circle-fill text-danger fs-5"></i>'}
                <span class="fw-semibold text-dark">หมายเลขเสื้อไม่ซ้ำกัน (รุ่น ${cat})</span>
              </div>
              <a href="/team/players.php" class="btn btn-sm ${catJerseys.length > 0 && uniqueCatJerseys ? 'btn-outline-success' : 'btn-outline-warning'} px-3 py-1 text-decoration-none fw-medium">
                ${catJerseys.length === 0 ? 'ไม่มีข้อมูล (จัดการ)' : (catJerseys.length + ' หมายเลข')} <i class="bi bi-pencil-square ms-1"></i>
              </a>
            </li>

            <li class="list-group-item d-flex justify-content-between align-items-center py-3 px-4">
              <div class="d-flex align-items-center gap-2">
                ${enoughGoalkeepers
            ? '<i class="bi bi-check-circle-fill text-success fs-5"></i>'
            : '<i class="bi bi-x-circle-fill text-danger fs-5"></i>'}
                <span class="fw-semibold text-dark">จำนวนผู้รักษาประตูอย่างน้อย ${MIN_GOALKEEPERS} คน ต่อรุ่น (${cat})</span>
              </div>
              <a href="/team/players.php" class="btn btn-sm ${enoughGoalkeepers ? 'btn-outline-success' : 'btn-outline-primary'} px-3 py-1 text-decoration-none fw-medium">
                ปัจจุบัน ${goalkeeperCount} คน <i class="bi bi-arrow-right-short ms-1"></i>
              </a>
            </li>
          </ul>

          <div class="p-4 bg-light border-top">
            ${submissionStatusHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  const downloadButtonsHtml = categoriesInUse.map((cat: string, index: number) => `
            <div class="accordion-item border rounded-3 overflow-hidden mb-2">
              <h3 class="accordion-header" id="download-heading-${index}">
                <button class="accordion-button ${index === 0 ? '' : 'collapsed'} py-2 fw-semibold" type="button" data-bs-toggle="collapse" data-bs-target="#download-category-${index}" aria-expanded="${index === 0 ? 'true' : 'false'}" aria-controls="download-category-${index}">
                  <span class="badge bg-primary me-2">รุ่น ${cat}</span> แบบฟอร์มดาวน์โหลด
                </button>
              </h3>
              <div id="download-category-${index}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}" aria-labelledby="download-heading-${index}" data-bs-parent="#teamDownloadAccordion">
                <div class="accordion-body p-3">
                  <div class="mb-3">
                    <div class="fw-semibold text-navy mb-1 small"><i class="bi bi-trophy-fill text-warning me-1"></i> แบบฟอร์มใบรายชื่อเติมข้อมูล (รุ่น ${cat})</div>
                    <div class="d-flex gap-2">
                      <a href="${base}/api/team/export-o2-excel?category=${encodeURIComponent(cat)}" class="btn btn-outline-success btn-sm w-100 fw-semibold d-flex align-items-center justify-content-center gap-1 rounded-2 py-2">
                        <i class="bi bi-file-earmark-excel fs-5"></i> O-2 (Excel) — ${cat}
                      </a>
                      <a href="${base}/api/team/export-o2-pdf?category=${encodeURIComponent(cat)}" class="btn btn-outline-danger btn-sm w-100 fw-semibold d-flex align-items-center justify-content-center gap-1 rounded-2 py-2">
                        <i class="bi bi-file-earmark-pdf fs-5"></i> O-2 (PDF) — ${cat}
                      </a>
                    </div>
                  </div>
                  <div class="border-top pt-3">
                    <div class="fw-semibold text-navy mb-1 small"><i class="bi bi-trophy-fill text-warning me-1"></i> ใบลงทะเบียน จะเป็นใบสำหรับทีมพิมพ์ออกมาเพื่อที่จะเบิกงบ</div>
                    <div class="d-flex gap-2">
                      <a href="${base}/api/team/export-registration-excel?category=${encodeURIComponent(cat)}" class="btn btn-outline-success btn-sm w-100 fw-semibold d-flex align-items-center justify-content-center gap-1 rounded-2 py-2">
                        <i class="bi bi-file-earmark-excel fs-5"></i> ใบลงทะเบียน (Excel) - ${cat}
                      </a>
                      <a href="${base}/api/team/export-registration-pdf?category=${encodeURIComponent(cat)}" class="btn btn-outline-danger btn-sm w-100 fw-semibold d-flex align-items-center justify-content-center gap-1 rounded-2 py-2">
                        <i class="bi bi-file-earmark-pdf fs-5"></i> ใบลงทะเบียน (PDF) - ${cat}
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
  `).join('');

  const content = `
  <div class="row g-4">
    <!-- Left Column: Readiness Verification Checklist Grouped By Category -->
    <div class="col-lg-8">
      ${categoryBlocksHtml}
    </div>

    <div class="col-lg-4">
      <div class="card shadow-sm border-0 rounded-3 sticky-top" style="top: 80px; z-index: 10;">
        <div class="card-header bg-white border-bottom py-3 fw-bold text-navy fs-6">
          <i class="bi bi-download me-2"></i>ดาวน์โหลดแบบฟอร์มใบลงทะเบียน
        </div>
        <div class="card-body p-4">
          <p class="text-muted small mb-3">แบบฟอร์มใบรายชื่อนักกีฬา O-2 เติมข้อมูลทีมและรายชื่ออัตโนมัติ สำหรับส่งหน่วยงานราชการหรือแนบเอกสารการแข่งขัน</p>
          
          <div class="accordion mb-4" id="teamDownloadAccordion">
            ${downloadButtonsHtml}
          </div>

          <div class="border-top pt-3">
            <div class="fw-bold text-navy small mb-2"><i class="bi bi-file-earmark-code me-1"></i> ดาวน์โหลดเทมเพลทเปล่า (ตัวอย่าง)</div>
            <div class="d-grid gap-2">
              <a href="${base}/api/team/download-sample-excel" class="btn btn-light text-dark border btn-sm fw-semibold d-flex align-items-center justify-content-center gap-1 py-2">
                <i class="bi bi-file-earmark-spreadsheet text-success fs-5"></i> (ตัวอย่าง) ใบรายชื่อนักกีฬา.xlsx
              </a>
              <a href="${base}/api/team/download-sample-pdf" class="btn btn-light text-dark border btn-sm fw-semibold d-flex align-items-center justify-content-center gap-1 py-2">
                <i class="bi bi-file-earmark-pdf text-danger fs-5"></i> (ตัวอย่าง) ใบรายชื่อนักกีฬา.pdf
              </a>
            </div>
          </div>
        </div>
      </div>
  </div>
  <script>
    async function submitTeamRoster(cat) {
      const confirmRes = await Swal.fire({
        icon: 'question',
        title: 'ยืนยันการยื่นส่งรายชื่อ',
        text: 'ยืนยันส่งรายชื่อนักกีฬาและเจ้าหน้าที่ประจำทีม รุ่น ' + cat + ' ให้เจ้าหน้าที่ตรวจสอบใช่หรือไม่?',
        showCancelButton: true,
        confirmButtonText: 'ยืนยันส่งรายชื่อ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#0b2a5b',
        cancelButtonColor: '#6c757d',
        customClass: { popup: 'rounded-4 shadow-lg' }
      });

      if (!confirmRes.isConfirmed) {
        return;
      }
      try {
        const res = await fetch('${base}/api/team/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ category: cat })
        });
        const data = await res.json();
        if (data.success) {
          Swal.fire({
            icon: 'success',
            title: 'ส่งรายชื่อเรียบร้อย!',
            text: 'ส่งรายชื่อให้เจ้าหน้าที่ตรวจสอบเรียบร้อยแล้ว สถานะของทีมเปลี่ยนเป็น "รอตรวจสอบ"',
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#0b2a5b'
          }).then(() => {
            location.reload();
          });
        } else {
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: data.error || 'ไม่สามารถส่งรายชื่อได้' });
        }
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
      }
    }
  </script>`;
  res.send(renderTeamLayout('ส่งรายชื่อเข้าร่วมการแข่งขัน', content, 'submit', base, profile));
});

router.post('/api/team/submit', checkTeamSession, async (req: Request, res: Response) => {
  const teamId = await getLoggedTeamId(req);
  const category = String(req.body.category || '').trim().toUpperCase();

  try {
    if (!['U14', 'U16', 'U18'].includes(category)) {
      return res.status(400).json({ success: false, error: 'กรุณาเลือกรุ่นการแข่งขันที่ถูกต้อง' });
    }
    const result = await withDbTransaction(async client => {
      const teamResult = await client.query(
        `SELECT id, categories, submitted_categories, cancelled_categories, status, is_deleted
         FROM football_registered_team WHERE id::text = $1 FOR UPDATE`, [String(teamId)]
      );
      const team = teamResult.rows?.[0];
      if (!team || team.is_deleted) throw new Error('TEAM_NOT_FOUND');
      const split = (value: unknown) => String(value || '').split(',').map(v => v.trim().toUpperCase()).filter(Boolean);
      const registered = split(team.categories);
      const submitted = split(team.submitted_categories);
      const cancelled = split(team.cancelled_categories);
      if (!registered.includes(category) || cancelled.includes(category)) throw new Error('CATEGORY_NOT_REGISTERED');
      if (submitted.includes(category)) return { submittedCategories: submitted, playerCount: 0, officialCount: 0, alreadySubmitted: true, status: team.status };

      const [playerResult, officialResult] = await Promise.all([
        client.query(`SELECT id, id_card, jersey_no, category, position FROM football_player
          WHERE team_id::text = $1 AND EXISTS (
            SELECT 1 FROM unnest(string_to_array(UPPER(COALESCE(category, 'U14')), ',')) c WHERE BTRIM(c) = $2
          ) ORDER BY id`, [String(teamId), category]),
        client.query(`SELECT id, id_card, doc_id_card, categories, position FROM football_official
          WHERE team_id::text = $1 AND EXISTS (
            SELECT 1 FROM unnest(string_to_array(UPPER(COALESCE(categories, 'U14')), ',')) c WHERE BTRIM(c) = $2
          ) ORDER BY id`, [String(teamId), category])
      ]);
      const players = playerResult.rows || [];
      const officials = officialResult.rows || [];
      const validId = (value: unknown) => String(value || '').replace(/\D/g, '').length === 13;
      
      const jerseys = players.map((p: any) => String(p.jersey_no ?? '').trim());
      const goalkeeperCount = players.filter((p: any) => String(p.position || '').trim() === 'ผู้รักษาประตู (GK)').length;
      const ready = players.length >= 18 && players.length <= 30 && players.every((p: any) => validId(p.id_card)) &&
                jerseys.every(Boolean) && new Set(jerseys).size === jerseys.length && officials.length >= 1 && officials.length <= 8 &&
                officials.every((o: any) => String(o.position || '').trim() !== 'ผู้จัดการทีม' ||
                    (String(o.id_card ?? '').trim().length > 0 && hasValidStoredOfficialDocument(o.doc_id_card))) && goalkeeperCount >= MIN_GOALKEEPERS;
if (officials.some((o: any) => String(o.position || '').trim() === 'ผู้จัดการทีม' &&
                !hasValidStoredOfficialDocument(o.doc_id_card)))
                throw new Error('MANAGER_DOC_MISSING');
      if (!ready) throw new Error('ROSTER_NOT_READY');

      const nextSubmitted = [...submitted, category];
      const newSubmittedValue = nextSubmitted.join(',');
      await client.query('UPDATE football_registered_team SET submitted_categories = $1 WHERE id::text = $2', [newSubmittedValue, String(teamId)]);
      await writeAuditLog(req, {
        eventType: 'TEAM_ROSTER_SUBMITTED', entityType: 'TEAM', entityId: String(teamId), teamId: String(teamId),
        oldState: { submittedCategories: submitted }, newState: { submittedCategories: nextSubmitted },
        metadata: { category, playerCount: String(players.length), officialCount: String(officials.length) }
      }, client as any);
      return { submittedCategories: nextSubmitted, playerCount: players.length, officialCount: officials.length, alreadySubmitted: false, status: team.status };
    });
    const newSubStr = result.submittedCategories.join(',');
    if (!result.alreadySubmitted) {
      teamProfile.submitted_categories = newSubStr;
      teamsDatabase.forEach((t: any) => {
        if (String(t.id).trim() === String(teamId).trim()) t.submitted_categories = newSubStr;
      });
    }

    return res.status(200).json({
      success: true,
      message: 'ส่งรายชื่อให้เจ้าหน้าที่ตรวจสอบเรียบร้อยแล้ว',
      status: result.status === 'APPROVED' ? 'APPROVED' : 'PENDING',
      submitted_categories: newSubStr
    });
  } catch (err) {
    
if (err instanceof Error && err.message === 'MANAGER_DOC_MISSING') {
            return res.status(400).json({ success: false, error: 'กรุณาแนบไฟล์สำเนาบัตรประชาชนของผู้จัดการทีมก่อนส่งรายชื่อ' });
        }
if (err instanceof Error && err.message === 'ROSTER_NOT_READY') {
      return res.status(400).json({ success: false, error: 'รายชื่อนักกีฬาและเจ้าหน้าที่ในรุ่นนี้ยังไม่ครบหรือข้อมูลไม่ถูกต้อง กรุณาตรวจสอบก่อนส่ง' });
    }
    if (err instanceof Error && err.message === 'CATEGORY_NOT_REGISTERED') {
      return res.status(400).json({ success: false, error: 'ทีมไม่ได้ลงทะเบียนหรือยกเลิกรุ่นการแข่งขันนี้' });
    }
    if (err instanceof Error && err.message === 'TEAM_NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'ไม่พบทีมที่ลงทะเบียน' });
    }
    console.error('Error in POST /api/team/submit:', err);
    return res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการบันทึกสถานะ' });
  }
});

// Direct download sample templates
router.get('/api/team/download-sample-excel', checkTeamSession, (req: Request, res: Response) => {
  const primary = path.resolve(__dirname, '../../../document/(ตัวอย่าง) ใบรายชื่อนักกีฬา.xlsx');
  const secondary = path.resolve(__dirname, '../../../../document/(ตัวอย่าง) ใบรายชื่อนักกีฬา.xlsx');
  const file = fs.existsSync(primary) ? primary : secondary;
  if (fs.existsSync(file)) {
    return res.download(file, '(ตัวอย่าง) ใบรายชื่อนักกีฬา.xlsx');
  }
  return res.status(404).send('ไม่พบไฟล์เทมเพลท');
});

router.get('/api/team/download-sample-pdf', checkTeamSession, (req: Request, res: Response) => {
  const file = path.resolve(__dirname, '../../../document/(ตัวอย่าง) ใบรายชื่อนักกีฬา.pdf');
  if (fs.existsSync(file)) {
    return res.download(file, '(ตัวอย่าง) ใบรายชื่อนักกีฬา.pdf');
  }
  return res.status(404).send('ไม่พบไฟล์เทมเพลท PDF');
});
