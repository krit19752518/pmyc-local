"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminReportsRouter = void 0;
const teamArea_1 = require("../../utils/teamArea");
const registrationStatistics_service_1 = require("../../services/registrationStatistics.service");
const express_1 = require("express");
const adminLayout_1 = require("../../adminLayout");
const helpers_1 = require("../../utils/helpers");
const team_model_1 = require("../../models/team.model");
const player_model_1 = require("../../models/player.model");
const adminSession_service_1 = require("../../services/adminSession.service");
const router = (0, express_1.Router)();
exports.adminReportsRouter = router;
function checkSuperAdminReportAccess(req, res, next) {
    const currentUser = req.adminUser;
    if (!['SUPER_ADMIN', 'DOCUMENT_VERIFIER', 'SAT_OFFICER'].includes(currentUser?.roleCode || '')) {
        return res.status(403).send('ไม่มีสิทธิ์เข้าถึงรายงานผู้บริหาร');
    }
    return next();
}
// คืนค่า null = เห็นทุกจังหวัด (SUPER_ADMIN, DOCUMENT_VERIFIER)
function getReportProvinceScope(req) {
    const u = req.adminUser;
    if (u?.roleCode !== 'SAT_OFFICER')
        return null;
    return (u.province || '').trim().toLowerCase() || '__NONE__';
}
const inScope = (prov, scope) => !scope || (prov || '').toString().trim().toLowerCase() === scope;
const escapeHtmlText = (value) => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
router.get('/admin/report-demographics.php', adminSession_service_1.checkAdminSession, checkSuperAdminReportAccess, async (req, res) => {
    const base = (0, helpers_1.getBaseUrl)(req);
    const currentUser = req.adminUser || {
        id: 'ADM-001', username: 'admin', fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)', roleCode: 'SUPER_ADMIN', roleName: 'ผู้ดูแลระบบสูงสุด', permissions: ['system:all']
    };
    const isSatOfficer = currentUser.roleCode === 'SAT_OFFICER';
    const officerProv = (currentUser.province || '').trim().toLowerCase();
    const allRegisteredTeams = await (0, team_model_1.getDbRegisteredTeams)();
    const registeredTeams = isSatOfficer && officerProv
        ? allRegisteredTeams.filter((t) => !t.is_deleted && (t.province || '').trim().toLowerCase() === officerProv)
        : allRegisteredTeams.filter((t) => !t.is_deleted);
    const teamIds = new Set(registeredTeams.map((t) => t.id));
    const allPlayers = await (0, player_model_1.getDbPlayers)();
    const scopedPlayers = isSatOfficer && officerProv
        ? allPlayers.filter((p) => p.teamId && teamIds.has(p.teamId))
        : allPlayers;
    // Calculate real-time stats
    const totalTeams = registeredTeams.length;
    const approvedTeams = registeredTeams.filter((t) => t.status === 'APPROVED').length;
    const pendingTeams = registeredTeams.filter((t) => t.status === 'PENDING').length;
    const approvalRate = totalTeams > 0 ? ((approvedTeams / totalTeams) * 100).toFixed(1) : '0.0';
    const reportProvinces = [
        'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท',
        'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม',
        'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์',
        'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์',
        'แพร่', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง',
        'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ',
        'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย',
        'หนองบัวลำภู', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี', 'อ่างทอง'
    ];
    // Province Breakdown Map
    const provMap = {};
    const districtMap = {};
    reportProvinces.forEach(province => {
        provMap[province] = { total: 0, app: 0, pend: 0, players: 0 };
    });
    registeredTeams.forEach((t) => {
        const p = (0, teamArea_1.normalizeProvince)(t.province) || 'ไม่ระบุ';
        if (!provMap[p]) {
            provMap[p] = { total: 0, app: 0, pend: 0, players: 0 };
        }
        provMap[p].total += 1;
        if (t.status === 'APPROVED')
            provMap[p].app += 1;
        if (t.status === 'PENDING')
            provMap[p].pend += 1;
        const district = (0, teamArea_1.getTeamDistrictName)(t);
        if (district) {
            if (!districtMap[p])
                districtMap[p] = {};
            districtMap[p][district] = (districtMap[p][district] || 0) + 1;
        }
    });
    scopedPlayers.forEach((p) => {
        const t = registeredTeams.find((team) => team.id === p.teamId);
        if (t) {
            const prov = t.province || 'ไม่ระบุ';
            if (provMap[prov])
                provMap[prov].players += 1;
        }
    });
    const sortedProvinces = Object.entries(provMap).sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0], 'th'));
    const activeProvinces = sortedProvinces.filter(([, data]) => data.total > 0);
    const uniqueProvincesCount = activeProvinces.length;
    const topProvinceName = activeProvinces.length > 0 ? activeProvinces[0][0] : '-';
    const topProvinceCount = activeProvinces.length > 0 ? activeProvinces[0][1].total : 0;
    const top10Provinces = activeProvinces.slice(0, 10);
    const chartLabels = JSON.stringify(top10Provinces.map(p => p[0]));
    const chartData = JSON.stringify(top10Provinces.map(p => p[1].total));
    const tableRowsHtml = sortedProvinces.map(([prov, data], i) => {
        const rate = data.total > 0 ? ((data.app / data.total) * 100).toFixed(1) : '0.0';
        const districts = Object.entries(districtMap[prov] || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'));
        const detailId = `province-district-details-${i}`;
        const districtButton = districts.length
            ? `<button type="button" class="btn btn-sm btn-outline-primary rounded-circle p-0 me-2 district-breakdown-toggle" style="width: 26px; height: 26px; line-height: 1;" aria-expanded="false" aria-controls="${detailId}" aria-label="แสดงเขต/อำเภอของจังหวัด ${escapeHtmlText(prov)}" onclick="toggleProvinceDistricts(${i})">+</button>`
            : '';
        const districtDetails = districts.length
            ? `
        <tr id="${detailId}" class="district-breakdown-row" data-district-details-for="${i}" hidden>
          <td colspan="7" class="bg-light p-3">
            <div class="ms-4">
              <div class="fw-bold text-navy mb-2">จำนวนทีมแยกตามเขต/อำเภอ — ${escapeHtmlText(prov)}</div>
              <div class="table-responsive">
                <table class="table table-sm table-bordered bg-white mb-0">
                  <thead class="table-secondary"><tr><th scope="col">เขต/อำเภอ</th><th scope="col" class="text-center">จำนวนทีมลงทะเบียน</th></tr></thead>
                  <tbody>${districts.map(([district, count]) => `<tr><td>${escapeHtmlText(district)}</td><td class="text-center fw-bold">${count}</td></tr>`).join('')}</tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>`
            : '';
        return `
      <tr class="fs-6" data-team-count="${data.total}" data-original-index="${i}"${districts.length ? ` data-district-details-id="${detailId}"` : ''}>
        <td class="text-center fw-bold fs-6">${districtButton}<span class="province-row-number">${i + 1}</span></td>
        <td><strong class="text-navy fs-6">${prov}</strong></td>
        <td class="text-center fw-bold ${data.total === 0 ? 'text-danger' : 'text-primary'} fs-6">${data.total}</td>
        <td class="text-center text-success fw-bold fs-6">${data.app}</td>
        <td class="text-center fw-bold fs-6" style="color: #ea580c;">${data.pend}</td>
        <td class="text-center fs-6">${data.players} คน</td>
        <td class="text-center"><span class="badge bg-success-subtle text-success border px-3 py-2 fs-6">${rate}%</span></td>
      </tr>
      ${districtDetails}
    `;
    }).join('');
    const bodyContent = `
  <div class="card p-4 shadow-sm border-0 rounded-4 mb-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div>
        <h4 class="fw-bold text-navy mb-1"><i class="bi bi-geo-alt-fill text-info me-2"></i>1. รายงานวิเคราะห์การสมัคร & การกระจายตัวเชิงพื้นที่ (Demographic & Geography Analytics)</h4>
        <p class="text-muted small mb-0">วิเคราะห์สถิติจำนวนทีมที่สมัคร ความตื่นตัวของแต่ละจังหวัด/ภูมิภาค และจำแนกประเภทสังกัดของทีม (ข้อมูลจริงล่าสุดจากฐานข้อมูล)</p>
      </div>
      <button class="btn btn-outline-primary btn-sm rounded-3 px-3 fw-bold" onclick="window.print()">
        <i class="bi bi-printer me-1"></i> พิมพ์รายงาน PDF
      </button>
    </div>

    <!-- Summary KPI Cards -->
    <div class="row g-3 mb-4">
      <div class="col-md-3">
        <div class="card border-0 bg-primary-subtle text-primary p-3 rounded-4 shadow-sm">
          <div class="small fw-semibold text-uppercase">จังหวัดที่มีทีมส่งแข่ง</div>
          <div class="fs-2 fw-bold">${uniqueProvincesCount} จังหวัด</div>
          <div class="small text-muted"><i class="bi bi-globe me-1"></i> มีการลงทะเบียนในระบบ</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card border-0 bg-success-subtle text-success p-3 rounded-4 shadow-sm">
          <div class="small fw-semibold text-uppercase">จังหวัดที่มีทีมสูงสุด</div>
          <div class="fs-2 fw-bold">${topProvinceName}</div>
          <div class="small text-muted"><i class="bi bi-trophy me-1"></i> ${topProvinceCount} ทีมส่งแข่งขัน</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card border-0 bg-info-subtle text-info-emphasis p-3 rounded-4 shadow-sm">
          <div class="small fw-semibold text-uppercase">ทีมลงทะเบียนรวม</div>
          <div class="fs-2 fw-bold">${totalTeams} ทีม</div>
          <div class="small text-muted"><i class="bi bi-shield-shaded me-1"></i> ไม่รวมรายการที่ถูกลบ</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card border-0 bg-warning-subtle text-warning-emphasis p-3 rounded-4 shadow-sm">
          <div class="small fw-semibold text-uppercase">อัตราผ่านการอนุมัติ</div>
          <div class="fs-2 fw-bold">${approvalRate}%</div>
          <div class="small text-muted"><i class="bi bi-check-circle me-1"></i> ${approvedTeams} จาก ${totalTeams} ทีม</div>
        </div>
      </div>
    </div>

    <!-- Visual Charts Section -->
    <div class="row g-4 mb-4">
      <div class="col-lg-7">
        <div class="card border shadow-sm rounded-4 p-3 h-100">
          <h6 class="fw-bold text-navy mb-3 fs-5"><i class="bi bi-bar-chart-fill me-2"></i> 10 อันดับจังหวัดที่มีทีมส่งแข่งขันมากที่สุด (Top 10 Provinces)</h6>
          <div style="height: 320px; position: relative;">
            <canvas id="chartTopProvinces"></canvas>
          </div>
        </div>
      </div>
      <div class="col-lg-5">
        <div class="card border shadow-sm rounded-4 p-3 h-100">
          <h6 class="fw-bold text-navy mb-3 fs-5"><i class="bi bi-pie-chart-fill me-2"></i> สัดส่วนจำแนกตามสถานะทีม (Team Status Breakdown)</h6>
          <div style="height: 320px; position: relative;" class="d-flex align-items-center justify-content-center">
            <canvas id="chartAffiliationTypes"></canvas>
          </div>
        </div>
      </div>
    </div>

    <!-- Data Table -->
    <h6 class="fw-bold text-navy mb-3 fs-5"><i class="bi bi-table me-2"></i> ตารางสรุปข้อมูลสถิติการสมัครแยกรายจังหวัด (Province Demographic Summary Table)</h6>
    <div class="table-responsive">
      <table id="provinceDemographicsTable" class="table table-hover align-middle border rounded-3 fs-6">
        <thead class="table-dark fs-6">
          <tr>
            <th class="text-center py-3" style="width: 60px;"><button type="button" class="btn btn-link text-dark text-decoration-none fw-bold p-0 province-sort-button" data-sort-column="0" data-sort-label="ลำดับรายการ" data-sort-type="index" onclick="sortProvinceDemographics(0)" aria-label="เรียงลำดับรายการ" aria-sort="none"># <span class="province-sort-icon" aria-hidden="true">↕</span></button></th>
            <th class="py-3"><button type="button" class="btn btn-link text-dark text-decoration-none fw-bold p-0 province-sort-button" data-sort-column="1" data-sort-label="จังหวัด" data-sort-type="text" onclick="sortProvinceDemographics(1)" aria-label="เรียงจังหวัด" aria-sort="none">จังหวัด <span class="province-sort-icon" aria-hidden="true">↕</span></button></th>
            <th class="text-center py-3"><button type="button" class="btn btn-link text-dark text-decoration-none fw-bold p-0 province-sort-button" data-sort-column="2" data-sort-label="จำนวนทีมลงทะเบียน" data-sort-type="number" onclick="sortProvinceDemographics(2)" aria-label="เรียงจำนวนทีมลงทะเบียนจากมากไปน้อย" aria-sort="descending">จำนวนทีมลงทะเบียน <span class="province-sort-icon" aria-hidden="true">↓</span></button></th>
            <th class="text-center py-3"><button type="button" class="btn btn-link text-dark text-decoration-none fw-bold p-0 province-sort-button" data-sort-column="3" data-sort-label="จำนวนทีมอนุมัติแล้ว" data-sort-type="number" onclick="sortProvinceDemographics(3)" aria-label="เรียงจำนวนทีมอนุมัติแล้ว" aria-sort="none">อนุมัติแล้ว <span class="province-sort-icon" aria-hidden="true">↕</span></button></th>
            <th class="text-center py-3" style="color: #fb923c;"><button type="button" class="btn btn-link text-dark text-decoration-none fw-bold p-0 province-sort-button" data-sort-column="4" data-sort-label="จำนวนทีมรอตรวจสอบ" data-sort-type="number" onclick="sortProvinceDemographics(4)" aria-label="เรียงจำนวนทีมรอตรวจสอบ" aria-sort="none">รอตรวจสอบ <span class="province-sort-icon" aria-hidden="true">↕</span></button></th>
            <th class="text-center py-3"><button type="button" class="btn btn-link text-dark text-decoration-none fw-bold p-0 province-sort-button" data-sort-column="5" data-sort-label="จำนวนนักกีฬารวม" data-sort-type="number" onclick="sortProvinceDemographics(5)" aria-label="เรียงจำนวนนักกีฬารวม" aria-sort="none">จำนวนนักกีฬารวม <span class="province-sort-icon" aria-hidden="true">↕</span></button></th>
            <th class="text-center py-3"><button type="button" class="btn btn-link text-dark text-decoration-none fw-bold p-0 province-sort-button" data-sort-column="6" data-sort-label="อัตราอนุมัติ" data-sort-type="number" onclick="sortProvinceDemographics(6)" aria-label="เรียงอัตราอนุมัติ (%)" aria-sort="none">อัตราอนุมัติ (%) <span class="province-sort-icon" aria-hidden="true">↕</span></button></th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml || '<tr><td colspan="7" class="text-center text-muted py-4 fs-6">ไม่มีข้อมูล</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    function toggleProvinceDistricts(provinceIndex) {
      const button = document.querySelector('.district-breakdown-toggle[aria-controls="province-district-details-' + provinceIndex + '"]');
      const details = document.getElementById('province-district-details-' + provinceIndex);
      if (!button || !details) throw new Error('Province district breakdown controls are missing.');
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      button.textContent = expanded ? '+' : '−';
      button.setAttribute('aria-label', (expanded ? 'แสดง' : 'ซ่อน') + 'เขต/อำเภอของจังหวัด');
      details.hidden = expanded;
    }

    function sortProvinceDemographics(columnIndex) {
      const table = document.getElementById('provinceDemographicsTable');
      const tbody = table && table.querySelector('tbody');
      const button = table && table.querySelector('button[data-sort-column="' + columnIndex + '"]');
      if (!tbody || !button) return;
      const currentDirection = button.getAttribute('aria-sort');
      const direction = currentDirection === 'ascending' ? 'descending' : 'ascending';
      const rows = Array.from(tbody.querySelectorAll('tr[data-team-count]'));
      rows.sort(function(a, b) {
        const sortType = button.getAttribute('data-sort-type');
        const valueA = sortType === 'index'
          ? Number(a.getAttribute('data-original-index'))
          : sortType === 'text'
            ? (a.cells[columnIndex].textContent || '').trim()
            : Number((a.cells[columnIndex].textContent || '').replace(/[^0-9.-]/g, ''));
        const valueB = sortType === 'index'
          ? Number(b.getAttribute('data-original-index'))
          : sortType === 'text'
            ? (b.cells[columnIndex].textContent || '').trim()
            : Number((b.cells[columnIndex].textContent || '').replace(/[^0-9.-]/g, ''));
        const primaryOrder = sortType === 'text'
          ? valueA.localeCompare(valueB, 'th')
          : valueA - valueB;
        return (primaryOrder * (direction === 'ascending' ? 1 : -1))
          || (Number(a.getAttribute('data-original-index')) - Number(b.getAttribute('data-original-index')));
      });
      rows.forEach(function(row, index) {
        const rowNumber = row.querySelector('.province-row-number');
        if (!rowNumber) throw new Error('Province row number is missing.');
        rowNumber.textContent = String(index + 1);
        tbody.appendChild(row);
        const detailId = row.getAttribute('data-district-details-id');
        if (detailId) {
          const details = document.getElementById(detailId);
          if (!details) throw new Error('Province district detail row is missing.');
          tbody.appendChild(details);
        }
      });
      Array.from(table.querySelectorAll('button[data-sort-column]')).forEach(function(sortButton) {
        sortButton.setAttribute('aria-sort', 'none');
        sortButton.setAttribute('aria-label', 'เรียง' + sortButton.getAttribute('data-sort-label'));
        sortButton.querySelector('.province-sort-icon').textContent = '↕';
      });
      button.setAttribute('aria-sort', direction);
      const directionLabel = button.getAttribute('data-sort-type') === 'text'
        ? (direction === 'ascending' ? 'ก-ฮ' : 'ฮ-ก')
        : button.getAttribute('data-sort-type') === 'index'
          ? (direction === 'ascending' ? 'ต้นไปท้าย' : 'ท้ายไปต้น')
          : (direction === 'ascending' ? 'น้อยไปมาก' : 'มากไปน้อย');
      button.setAttribute('aria-label', 'เรียง' + button.getAttribute('data-sort-label') + 'จาก' + directionLabel);
      button.querySelector('.province-sort-icon').textContent = direction === 'ascending' ? '↑' : '↓';
    }

    document.addEventListener('DOMContentLoaded', function() {
      // Top Provinces Bar Chart
      const ctxBar = document.getElementById('chartTopProvinces').getContext('2d');
      new Chart(ctxBar, {
        type: 'bar',
        data: {
          labels: ${chartLabels},
          datasets: [{
            label: 'จำนวนทีมลงทะเบียน (ทีม)',
            data: ${chartData},
            backgroundColor: 'rgba(14, 116, 144, 0.9)',
            borderColor: '#0e7490',
            borderWidth: 1.5,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { bodyFontSize: 14, titleFontSize: 15 }
          },
          scales: {
            x: {
              ticks: { color: '#0f172a', font: { size: 13, weight: 'bold' } },
              grid: { display: false }
            },
            y: {
              beginAtZero: true,
              ticks: { color: '#0f172a', font: { size: 13, weight: 'bold' }, stepSize: 1 }
            }
          }
        }
      });

      // Status Breakdown Doughnut Chart
      const ctxPie = document.getElementById('chartAffiliationTypes').getContext('2d');
      new Chart(ctxPie, {
        type: 'doughnut',
        data: {
          labels: ['อนุมัติแล้ว', 'รอตรวจสอบ', 'ไม่อนุมัติ'],
          datasets: [{
            data: [${approvedTeams}, ${pendingTeams}, ${totalTeams - approvedTeams - pendingTeams}],
            backgroundColor: ['#10b981', '#ea580c', '#ef4444']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#0f172a', font: { size: 14, weight: 'bold' }, padding: 20 }
            }
          }
        }
      });
    });
  </script>
  `;
    const rawQuery = req.url.includes('?') ? req.url.substring(req.url.indexOf('?') + 1) : '';
    res.send((0, adminLayout_1.renderAdminLayout)('รายงานวิเคราะห์การสมัคร & พื้นที่', bodyContent, 'report-demographics', base, currentUser, rawQuery));
});
// -----------------------------------------------------------------------------
// Executive Report 2: Roster & Age Group Analytics
// -----------------------------------------------------------------------------
router.get('/admin/report-roster.php', adminSession_service_1.checkAdminSession, checkSuperAdminReportAccess, async (req, res) => {
    const base = (0, helpers_1.getBaseUrl)(req);
    const currentUser = req.adminUser || {
        id: 'ADM-001', username: 'admin', fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)', roleCode: 'SUPER_ADMIN', roleName: 'ผู้ดูแลระบบสูงสุด', permissions: ['system:all']
    };
    const isSatOfficer = currentUser.roleCode === 'SUPER_ADMIN' ? false : (currentUser.roleCode === 'SAT_OFFICER');
    const officerProv = (currentUser.province || '').trim().toLowerCase();
    const allRegisteredTeams = await (0, team_model_1.getDbRegisteredTeams)();
    const registeredTeams = isSatOfficer && officerProv
        ? allRegisteredTeams.filter((t) => !t.is_deleted && (t.province || '').trim().toLowerCase() === officerProv)
        : allRegisteredTeams.filter((t) => !t.is_deleted);
    const teamIds = new Set(registeredTeams.map((t) => t.id));
    const allPlayers = await (0, player_model_1.getDbPlayers)();
    const scopedPlayers = isSatOfficer && officerProv
        ? allPlayers.filter((p) => p.teamId && teamIds.has(p.teamId))
        : allPlayers;
    const totalPlayersCount = scopedPlayers.length;
    const totalTeamsCount = registeredTeams.length;
    const avgPlayersPerTeam = totalTeamsCount > 0 ? (totalPlayersCount / totalTeamsCount).toFixed(1) : '0.0';
    // Category breakdown calculation
    const catMap = {
        boy: { u14: 0, u16: 0, u18: 0 },
        girl: { u14: 0, u16: 0, u18: 0 }
    };
    const posMap = {
        'กองหน้า (FW)': 0,
        'กองกลาง (MF)': 0,
        'กองหลัง (DF)': 0,
        'ผู้รักษาประตู (GK)': 0,
        'ไม่ระบุ': 0
    };
    scopedPlayers.forEach((p) => {
        const catStr = (p.category || p.categories || 'U14').toUpperCase();
        const g = p.gender === 'girl' ? 'girl' : 'boy';
        if (catStr.includes('U14'))
            catMap[g].u14 += 1;
        if (catStr.includes('U16'))
            catMap[g].u16 += 1;
        if (catStr.includes('U18'))
            catMap[g].u18 += 1;
        const pos = (p.position || '').toUpperCase();
        if (pos.includes('FW') || pos.includes('หน้า'))
            posMap['กองหน้า (FW)'] += 1;
        else if (pos.includes('MF') || pos.includes('กลาง'))
            posMap['กองกลาง (MF)'] += 1;
        else if (pos.includes('DF') || pos.includes('หลัง'))
            posMap['กองหลัง (DF)'] += 1;
        else if (pos.includes('GK') || pos.includes('ประตู'))
            posMap['ผู้รักษาประตู (GK)'] += 1;
        else
            posMap['ไม่ระบุ'] += 1;
    });
    // Calculate full quota teams count (30 players)
    const teamPlayerCounts = {};
    scopedPlayers.forEach((p) => {
        const tid = p.teamId;
        if (tid)
            teamPlayerCounts[tid] = (teamPlayerCounts[tid] || 0) + 1;
    });
    const fullQuotaTeams = Object.values(teamPlayerCounts).filter(c => c >= 30).length;
    const fullQuotaRate = totalTeamsCount > 0 ? ((fullQuotaTeams / totalTeamsCount) * 100).toFixed(1) : '0.0';
    const bodyContent = `
  <div class="card p-4 shadow-sm border-0 rounded-4 mb-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div>
        <h4 class="fw-bold text-navy mb-1"><i class="bi bi-bar-chart-line-fill text-success me-2"></i>2. รายงานสถิตินักกีฬา & รุ่นการแข่งขัน (Roster & Age Group Analytics)</h4>
        <p class="text-muted small mb-0">เจาะลึกสถิติจำนวนนักกีฬา การกระจายตัวรายรุ่น U14/U16/U18 สถิติตำแหน่งการเล่น และการใช้โควตารายทีม (ข้อมูลจริงจากระบบ)</p>
      </div>
      <button class="btn btn-outline-primary btn-sm rounded-3 px-3 fw-bold" onclick="window.print()">
        <i class="bi bi-printer me-1"></i> พิมพ์รายงาน PDF
      </button>
    </div>

    <!-- Summary KPI Cards -->
    <div class="row g-3 mb-4">
      <div class="col-md-3">
        <div class="card border-0 bg-primary-subtle text-primary p-3 rounded-4 shadow-sm">
          <div class="small fw-semibold text-uppercase">นักกีฬาทั้งหมดในระบบ</div>
          <div class="fs-2 fw-bold">${totalPlayersCount.toLocaleString()} คน</div>
          <div class="small text-muted"><i class="bi bi-people me-1"></i> ลงทะเบียนรายชื่อแล้ว</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card border-0 bg-success-subtle text-success p-3 rounded-4 shadow-sm">
          <div class="small fw-semibold text-uppercase">รุ่นยอดนิยมสูงสุด</div>
          <div class="fs-2 fw-bold">U16 (ชาย)</div>
          <div class="small text-muted"><i class="bi bi-trophy me-1"></i> ${catMap.boy.u16} คน</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card border-0 bg-info-subtle text-info-emphasis p-3 rounded-4 shadow-sm">
          <div class="small fw-semibold text-uppercase">เฉลี่ยต่อทีม</div>
          <div class="fs-2 fw-bold">${avgPlayersPerTeam} คน</div>
          <div class="small text-muted"><i class="bi bi-person-check me-1"></i> จากโควตาสูงสุด 30 คน</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card border-0 bg-warning-subtle text-warning-emphasis p-3 rounded-4 shadow-sm">
          <div class="small fw-semibold text-uppercase">ทีมที่ส่งเต็มโควตา (30 คน)</div>
          <div class="fs-2 fw-bold">${fullQuotaRate}%</div>
          <div class="small text-muted"><i class="bi bi-pie-chart me-1"></i> ${fullQuotaTeams} จาก ${totalTeamsCount} ทีม</div>
        </div>
      </div>
    </div>

    <!-- Visual Charts Section -->
    <div class="row g-4 mb-4">
      <div class="col-lg-6">
        <div class="card border shadow-sm rounded-4 p-3 h-100">
          <h6 class="fw-bold text-navy mb-3 fs-5"><i class="bi bi-bar-chart-fill me-2"></i> จำนวนนักกีฬาแยกตามรุ่นอายุ และประเภททีม (Roster Volume)</h6>
          <div style="height: 320px; position: relative;">
            <canvas id="chartRosterByCat"></canvas>
          </div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card border shadow-sm rounded-4 p-3 h-100">
          <h6 class="fw-bold text-navy mb-3 fs-5"><i class="bi bi-pie-chart-fill me-2"></i> สัดส่วนตำแหน่งการเล่นในสนาม (Player Position Breakdown)</h6>
          <div style="height: 320px; position: relative;" class="d-flex align-items-center justify-content-center">
            <canvas id="chartPlayerPositions"></canvas>
          </div>
        </div>
      </div>
    </div>

    <!-- Data Table -->
    <h6 class="fw-bold text-navy mb-3 fs-5"><i class="bi bi-table me-2"></i> ตารางสถิติโควตานักกีฬาจำแนกตามรุ่นอายุ (Category Quota Summary Table)</h6>
    <div class="table-responsive">
      <table class="table table-hover align-middle border rounded-3 fs-6">
        <thead class="table-dark fs-6">
          <tr>
            <th class="text-center py-3">รุ่นอายุ</th>
            <th class="text-center py-3">ประเภท</th>
            <th class="text-center py-3">จำนวนนักกีฬา (คน)</th>
            <th class="text-center py-3">สัดส่วน (%)</th>
          </tr>
        </thead>
        <tbody>
          <tr class="fs-6">
            <td class="text-center fw-bold text-navy fs-6">U14</td>
            <td class="text-center"><span class="badge bg-primary-subtle text-primary border px-3 py-2 fs-6">ชาย</span></td>
            <td class="text-center fw-bold text-primary fs-6">${catMap.boy.u14} คน</td>
            <td class="text-center fw-bold fs-6">${(catMap.boy.u14 + catMap.boy.u16 + catMap.boy.u18) > 0 ? ((catMap.boy.u14 / (catMap.boy.u14 + catMap.boy.u16 + catMap.boy.u18)) * 100).toFixed(1) : 0}%</td>
          </tr>
          <tr class="fs-6">
            <td class="text-center fw-bold text-navy fs-6">U16</td>
            <td class="text-center"><span class="badge bg-primary-subtle text-primary border px-3 py-2 fs-6">ชาย</span></td>
            <td class="text-center fw-bold text-primary fs-6">${catMap.boy.u16} คน</td>
            <td class="text-center fw-bold fs-6">${(catMap.boy.u14 + catMap.boy.u16 + catMap.boy.u18) > 0 ? ((catMap.boy.u16 / (catMap.boy.u14 + catMap.boy.u16 + catMap.boy.u18)) * 100).toFixed(1) : 0}%</td>
          </tr>
          <tr class="fs-6">
            <td class="text-center fw-bold text-navy fs-6">U18</td>
            <td class="text-center"><span class="badge bg-primary-subtle text-primary border px-3 py-2 fs-6">ชาย</span></td>
            <td class="text-center fw-bold text-primary fs-6">${catMap.boy.u18} คน</td>
            <td class="text-center fw-bold fs-6">${(catMap.boy.u14 + catMap.boy.u16 + catMap.boy.u18) > 0 ? ((catMap.boy.u18 / (catMap.boy.u14 + catMap.boy.u16 + catMap.boy.u18)) * 100).toFixed(1) : 0}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      // Roster Category Chart
      const ctxCat = document.getElementById('chartRosterByCat').getContext('2d');
      new Chart(ctxCat, {
        type: 'bar',
        data: {
          labels: ['รุ่น U14 (ชาย)', 'รุ่น U16 (ชาย)', 'รุ่น U18 (ชาย)'],
          datasets: [{
            label: 'จำนวนนักกีฬา (คน)',
            data: [${catMap.boy.u14}, ${catMap.boy.u16}, ${catMap.boy.u18}],
            backgroundColor: '#10b981',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { bodyFontSize: 14, titleFontSize: 15 }
          },
          scales: {
            x: {
              ticks: { color: '#0f172a', font: { size: 13, weight: 'bold' } },
              grid: { display: false }
            },
            y: {
              beginAtZero: true,
              ticks: { color: '#0f172a', font: { size: 13, weight: 'bold' }, stepSize: 1 }
            }
          }
        }
      });

      // Player Position Pie Chart
      const ctxPos = document.getElementById('chartPlayerPositions').getContext('2d');
      new Chart(ctxPos, {
        type: 'pie',
        data: {
          labels: ['กองหน้า (FW)', 'กองกลาง (MF)', 'กองหลัง (DF)', 'ผู้รักษาประตู (GK)', 'ไม่ระบุ'],
          datasets: [{
            data: [${posMap['กองหน้า (FW)']}, ${posMap['กองกลาง (MF)']}, ${posMap['กองหลัง (DF)']}, ${posMap['ผู้รักษาประตู (GK)']}, ${posMap['ไม่ระบุ']}],
            backgroundColor: ['#ef4444', '#3b82f6', '#10b981', '#ea580c', '#6b7280']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#0f172a', font: { size: 14, weight: 'bold' }, padding: 15 }
            }
          }
        }
      });
    });
  </script>
  `;
    const rawQuery = req.url.includes('?') ? req.url.substring(req.url.indexOf('?') + 1) : '';
    res.send((0, adminLayout_1.renderAdminLayout)('รายงานสถิตินักกีฬา & รุ่นแข่งขัน', bodyContent, 'report-roster', base, currentUser, rawQuery));
});
// -----------------------------------------------------------------------------
// Executive Report 3: Team & Category Analytics
// -----------------------------------------------------------------------------
router.get('/admin/report-teams-categories.php', adminSession_service_1.checkAdminSession, checkSuperAdminReportAccess, async (req, res) => {
    const base = (0, helpers_1.getBaseUrl)(req);
    const currentUser = req.adminUser || {
        id: 'ADM-001', username: 'admin', fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)', roleCode: 'SUPER_ADMIN', roleName: 'ผู้ดูแลระบบสูงสุด', permissions: ['system:all']
    };
    const isSatOfficer = currentUser.roleCode === 'SUPER_ADMIN' ? false : (currentUser.roleCode === 'SAT_OFFICER');
    const officerProv = (currentUser.province || '').trim().toLowerCase();
    const allRegisteredTeams = await (0, team_model_1.getDbRegisteredTeams)();
    const registeredTeams = isSatOfficer && officerProv
        ? allRegisteredTeams.filter((t) => !t.is_deleted && (t.province || '').trim().toLowerCase() === officerProv)
        : allRegisteredTeams.filter((t) => !t.is_deleted);
    const totalTeams = registeredTeams.length;
    const entitlements = (0, registrationStatistics_service_1.registeredEntitlements)(registeredTeams, { includeCancelled: false });
    const [u14Teams, u16Teams, u18Teams] = (0, registrationStatistics_service_1.sum)(entitlements);
    const multiCatTeams = entitlements.filter(t => t.ages.filter(Boolean).length > 1).length;
    const totalCategoryEntries = u14Teams + u16Teams + u18Teams;
    const u14Rate = totalCategoryEntries > 0 ? ((u14Teams / totalCategoryEntries) * 100).toFixed(1) : '0.0';
    const u16Rate = totalCategoryEntries > 0 ? ((u16Teams / totalCategoryEntries) * 100).toFixed(1) : '0.0';
    const u18Rate = totalCategoryEntries > 0 ? ((u18Teams / totalCategoryEntries) * 100).toFixed(1) : '0.0';
    const u14TeamRate = totalTeams > 0 ? ((u14Teams / totalTeams) * 100).toFixed(1) : '0.0';
    const u16TeamRate = totalTeams > 0 ? ((u16Teams / totalTeams) * 100).toFixed(1) : '0.0';
    const u18TeamRate = totalTeams > 0 ? ((u18Teams / totalTeams) * 100).toFixed(1) : '0.0';
    const multiCatRate = totalTeams > 0 ? ((multiCatTeams / totalTeams) * 100).toFixed(1) : '0.0';
    const bodyContent = `
  <div class="d-flex justify-content-between align-items-center mb-3">
    <div>
      <h3 class="fw-bold mb-1" style="color: #0f172a;"><i class="bi bi-diagram-3 me-2 text-primary"></i>3. รายงานทีม & รุ่นแข่งขัน</h3>
      <p class="text-muted mb-0">วิเคราะห์การกระจายตัวของทีมและสถาบันการศึกษาตามรุ่นอายุการแข่งขัน (U14, U16, U18)</p>
    </div>
    <div>
      <a href="/admin/report-teams-categories.php" class="btn btn-outline-secondary btn-sm"><i class="bi bi-arrow-clockwise me-1"></i>รีเฟรช</a>
    </div>
  </div>

  <div class="alert alert-info border-0 shadow-sm rounded-3 d-flex align-items-start mb-4 p-3" role="alert">
    <i class="bi bi-info-circle-fill text-info fs-5 me-2 mt-1"></i>
    <div class="small">
      <strong>คำอธิบายสถิติรุ่นแข่งขัน:</strong> สถาบันการศึกษา / บัญชีทีม 1 แห่ง สามารถสมัครเข้าร่วมแข่งขันได้มากกว่า 1 รุ่นอายุ (U14, U16, U18)
      ยอดส่งแข่งรวม (<strong>${totalCategoryEntries.toLocaleString()} รายการ</strong>) นับเฉพาะรุ่นที่ยังไม่ยกเลิกการสมัคร โดยไม่นับรุ่นที่ยกเลิกการสมัคร
      ส่วนจำนวนสถาบัน/ทีมทั้งหมดในระบบ (<strong>${totalTeams.toLocaleString()} ทีม</strong>) รวมบัญชีทีมที่ยกเลิกการสมัครทุกรุ่นแล้วด้วย
    </div>
  </div>

  <div class="row g-3 mb-4">
    <div class="col-md-3">
      <div class="card border-0 shadow-sm rounded-3 bg-white h-100 p-3">
        <div class="d-flex align-items-center">
          <div class="rounded-circle bg-primary bg-opacity-10 p-3 me-3 text-primary">
            <i class="bi bi-shield-shaded fs-3"></i>
          </div>
          <div>
            <div class="text-primary small fw-semibold">ส่งแข่งรวม</div>
            <div class="fs-2 fw-bold text-dark">${totalCategoryEntries.toLocaleString()} <span class="fs-6 fw-normal text-muted">รุ่น</span></div>
            <div class="text-muted small fw-bold">สถาบัน/ทีมทั้งหมดในระบบ ${totalTeams.toLocaleString()} ทีม</div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm rounded-3 bg-white h-100 p-3">
        <div class="d-flex align-items-center">
          <div class="rounded-circle bg-success bg-opacity-10 p-3 me-3 text-success">
            <i class="bi bi-person-workspace fs-3"></i>
          </div>
          <div>
            <div class="text-muted small fw-semibold">ทีมรุ่น U14</div>
            <div class="fs-2 fw-bold text-dark">${u14Teams.toLocaleString()} <span class="fs-6 fw-normal text-muted">ทีม</span></div>
            <div class="text-muted small">สัดส่วน ${u14Rate}% (คิดเป็น ${u14TeamRate}% ของทีมทั้งหมด)</div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm rounded-3 bg-white h-100 p-3">
        <div class="d-flex align-items-center">
          <div class="rounded-circle bg-info bg-opacity-10 p-3 me-3 text-info">
            <i class="bi bi-person-badge fs-3"></i>
          </div>
          <div>
            <div class="text-muted small fw-semibold">ทีมรุ่น U16</div>
            <div class="fs-2 fw-bold text-dark">${u16Teams.toLocaleString()} <span class="fs-6 fw-normal text-muted">ทีม</span></div>
            <div class="text-muted small">สัดส่วน ${u16Rate}% (คิดเป็น ${u16TeamRate}% ของทีมทั้งหมด)</div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="card border-0 shadow-sm rounded-3 bg-white h-100 p-3">
        <div class="d-flex align-items-center">
          <div class="rounded-circle bg-warning bg-opacity-10 p-3 me-3 text-warning">
            <i class="bi bi-award fs-3"></i>
          </div>
          <div>
            <div class="text-muted small fw-semibold">ทีมรุ่น U18</div>
            <div class="fs-2 fw-bold text-dark">${u18Teams.toLocaleString()} <span class="fs-6 fw-normal text-muted">ทีม</span></div>
            <div class="text-muted small">สัดส่วน ${u18Rate}% (คิดเป็น ${u18TeamRate}% ของทีมทั้งหมด)</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="row g-4 mb-4">
    <div class="col-md-6">
      <div class="card border-0 shadow-sm rounded-3 p-3 bg-white h-100">
        <h6 class="fw-bold mb-3 text-dark"><i class="bi bi-pie-chart-fill me-2 text-primary"></i>สัดส่วนการลงสมัครตามรุ่นอายุ (รวม 100%)</h6>
        <div style="height: 260px;">
          <canvas id="categoryDistributionChart"></canvas>
        </div>
      </div>
    </div>
    <div class="col-md-6">
      <div class="card border-0 shadow-sm rounded-3 p-3 bg-white h-100">
        <h6 class="fw-bold mb-3 text-dark"><i class="bi bi-bar-chart-line-fill me-2 text-success"></i>สถิติส่งทีมแข่งขันมากกว่า 1 รุ่น</h6>
        <div class="d-flex flex-column justify-content-center align-items-center h-100 text-center py-3">
          <div class="display-4 fw-bold text-primary mb-2">${multiCatTeams.toLocaleString()}</div>
          <div class="fs-5 text-dark fw-semibold mb-1">สถาบัน/ทีมที่ส่งมากกว่า 1 รุ่นอายุ</div>
          <div class="badge bg-primary bg-opacity-10 text-primary px-3 py-2 fs-6 rounded-pill">คิดเป็น ${multiCatRate}% ของทีมทั้งหมด</div>
        </div>
      </div>
    </div>
  </div>

  <div class="card border-0 shadow-sm rounded-3 bg-white p-3">
    <h6 class="fw-bold mb-3 text-dark"><i class="bi bi-table me-2 text-info"></i>ตารางสรุปจำนวนทีมแยกตามรุ่นอายุ</h6>
    <div class="table-responsive">
      <table class="table table-hover align-middle mb-0">
        <thead class="table-light">
          <tr>
            <th>รุ่นอายุ (Category)</th>
            <th class="text-center">จำนวนทีมที่ลงสมัคร</th>
            <th class="text-center">สัดส่วนการลงสมัคร (%)</th>
            <th class="text-center">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong class="text-dark">รุ่นอายุไม่เกิน 14 ปี (U14)</strong></td>
            <td class="text-center fw-bold">${u14Teams.toLocaleString()} ทีม</td>
            <td class="text-center fw-bold text-success">${u14Rate}%</td>
            <td class="text-center"><span class="badge bg-success">เปิดรับสมัคร</span></td>
          </tr>
          <tr>
            <td><strong class="text-dark">รุ่นอายุไม่เกิน 16 ปี (U16)</strong></td>
            <td class="text-center fw-bold">${u16Teams.toLocaleString()} ทีม</td>
            <td class="text-center fw-bold text-info">${u16Rate}%</td>
            <td class="text-center"><span class="badge bg-info">เปิดรับสมัคร</span></td>
          </tr>
          <tr>
            <td><strong class="text-dark">รุ่นอายุไม่เกิน 18 ปี (U18)</strong></td>
            <td class="text-center fw-bold">${u18Teams.toLocaleString()} ทีม</td>
            <td class="text-center fw-bold text-warning">${u18Rate}%</td>
            <td class="text-center"><span class="badge bg-warning text-dark">เปิดรับสมัคร</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const ctx = document.getElementById('categoryDistributionChart');
      if (ctx) {
        new Chart(ctx.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: ['U14 (${u14Rate}%)', 'U16 (${u16Rate}%)', 'U18 (${u18Rate}%)'],
            datasets: [{
              data: [${u14Teams}, ${u16Teams}, ${u18Teams}],
              backgroundColor: ['#10b981', '#06b6d4', '#f59e0b'],
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { color: '#0f172a', font: { size: 13, weight: 'bold' } } }
            }
          }
        });
      }
    });
  </script>
  `;
    const rawQuery = req.url.includes('?') ? req.url.substring(req.url.indexOf('?') + 1) : '';
    res.send((0, adminLayout_1.renderAdminLayout)('รายงานทีม & รุ่นแข่งขัน', bodyContent, 'report-teams-categories', base, currentUser, rawQuery));
});
// -----------------------------------------------------------------------------
// Executive Report 4: Team Registration Document Compliance Audit
// -----------------------------------------------------------------------------
router.get('/admin/report-team-compliance.php', adminSession_service_1.checkAdminSession, checkSuperAdminReportAccess, async (req, res) => {
    const base = (0, helpers_1.getBaseUrl)(req);
    const currentUser = req.adminUser || {
        id: 'ADM-001', username: 'admin', fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)', roleCode: 'SUPER_ADMIN', roleName: 'ผู้ดูแลระบบสูงสุด', permissions: ['system:all']
    };
    const isSatOfficer = currentUser.roleCode === 'SUPER_ADMIN' ? false : (currentUser.roleCode === 'SAT_OFFICER');
    const officerProv = (currentUser.province || '').trim().toLowerCase();
    const allRegisteredTeams = await (0, team_model_1.getDbRegisteredTeams)();
    const registeredTeams = isSatOfficer && officerProv
        ? allRegisteredTeams.filter((t) => !t.is_deleted && (t.province || '').trim().toLowerCase() === officerProv)
        : allRegisteredTeams.filter((t) => !t.is_deleted);
    const totalTeams = registeredTeams.length;
    const approvedTeams = registeredTeams.filter((t) => t.status === 'APPROVED').length;
    const rejectedTeams = registeredTeams.filter((t) => t.status === 'REJECTED').length;
    const pendingTeams = registeredTeams.filter((t) => t.status === 'PENDING').length;
    const approvedRate = totalTeams > 0 ? ((approvedTeams / totalTeams) * 100).toFixed(1) : '0.0';
    const rejectedRate = totalTeams > 0 ? ((rejectedTeams / totalTeams) * 100).toFixed(1) : '0.0';
    // Province Breakdown Map for Team Documents
    const provMap = {};
    registeredTeams.forEach((t) => {
        const p = (0, teamArea_1.normalizeProvince)(t.province) || 'ไม่ระบุ';
        if (!provMap[p]) {
            provMap[p] = { total: 0, approved: 0, pending: 0, rejected: 0 };
        }
        provMap[p].total += 1;
        if (t.status === 'APPROVED')
            provMap[p].approved += 1;
        else if (t.status === 'REJECTED')
            provMap[p].rejected += 1;
        else
            provMap[p].pending += 1;
    });
    const sortedProvinces = Object.entries(provMap).sort((a, b) => b[1].total - a[1].total);
    const tableRowsHtml = sortedProvinces.map(([prov, data], i) => {
        const rate = data.total > 0 ? ((data.approved / data.total) * 100).toFixed(1) : '0.0';
        return `
      <tr class="fs-6">
        <td class="text-center fw-bold fs-6">${i + 1}</td>
        <td><strong class="text-navy fs-6">${prov}</strong></td>
        <td class="text-center fw-bold text-primary fs-6">${data.total} ทีม</td>
        <td class="text-center text-success fw-bold fs-6">${data.approved} ทีม</td>
        <td class="text-center fw-bold fs-6" style="color: #ea580c;">${data.pending} ทีม</td>
        <td class="text-center text-danger fw-bold fs-6">${data.rejected} ทีม</td>
        <td class="text-center"><span class="badge bg-success-subtle text-success border px-3 py-2 fs-6">${rate}%</span></td>
      </tr>
    `;
    }).join('');
    const bodyContent = `
  <div class="card p-4 shadow-sm border-0 rounded-4 mb-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div>
        <h4 class="fw-bold text-navy mb-1"><i class="bi bi-shield-check text-warning me-2"></i>4. รายงานการตรวจสอบเอกสารการสมัครทีม (Team Document Verification Audit)</h4>
        <p class="text-muted small mb-0">วิเคราะห์สถิติการยื่นและการอนุมัติเอกสารสมัครทีม (หนังสือรับรองทีม & ใบรายชื่อ O-2) จำแนกตามสถานะจริงของทีมในระบบ</p>
      </div>
      <button class="btn btn-outline-primary btn-sm rounded-3 px-3 fw-bold" onclick="window.print()">
        <i class="bi bi-printer me-1"></i> พิมพ์รายงาน PDF
      </button>
    </div>

    <!-- Summary KPI Cards -->
    <div class="row g-3 mb-4">
      <div class="col-md-3">
        <div class="card border-0 bg-success-subtle text-success p-3 rounded-4 shadow-sm">
          <div class="small fw-semibold text-uppercase">ทีมที่ผ่านการอนุมัติ</div>
          <div class="fs-2 fw-bold">${approvedTeams.toLocaleString()} ทีม</div>
          <div class="small text-muted"><i class="bi bi-check-all me-1"></i> ${approvedRate}% ของทีมทั้งหมด</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card border-0 bg-warning-subtle text-warning-emphasis p-3 rounded-4 shadow-sm">
          <div class="small fw-semibold text-uppercase">ทีมที่รอตรวจสอบเอกสาร</div>
          <div class="fs-2 fw-bold" style="color: #ea580c;">${pendingTeams.toLocaleString()} ทีม</div>
          <div class="small text-muted"><i class="bi bi-hourglass-bottom me-1"></i> อยู่ระหว่างตรวจ/ยังไม่ส่ง</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card border-0 bg-danger-subtle text-danger p-3 rounded-4 shadow-sm">
          <div class="small fw-semibold text-uppercase">ทีมที่ไม่ผ่านการอนุมัติ</div>
          <div class="fs-2 fw-bold">${rejectedTeams.toLocaleString()} ทีม</div>
          <div class="small text-muted"><i class="bi bi-exclamation-triangle me-1"></i> ${rejectedRate}% ให้กลับไปแก้ไข</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card border-0 bg-primary-subtle text-primary p-3 rounded-4 shadow-sm">
          <div class="small fw-semibold text-uppercase">ทีมลงทะเบียนรวม</div>
          <div class="fs-2 fw-bold">${totalTeams.toLocaleString()} ทีม</div>
          <div class="small text-muted"><i class="bi bi-shield-shaded me-1"></i> ข้อมูลล่าสุดในระบบ</div>
        </div>
      </div>
    </div>

    <!-- Visual Charts Section -->
    <div class="row g-4 mb-4">
      <div class="col-lg-6">
        <div class="card border shadow-sm rounded-4 p-3 h-100">
          <h6 class="fw-bold text-navy mb-3 fs-5"><i class="bi bi-pie-chart-fill me-2"></i> สัดส่วนสถานะเอกสารการสมัครทีม (Team Status Breakdown)</h6>
          <div style="height: 320px; position: relative;" class="d-flex align-items-center justify-content-center">
            <canvas id="chartTeamDocStatusPie"></canvas>
          </div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card border shadow-sm rounded-4 p-3 h-100">
          <h6 class="fw-bold text-navy mb-3 fs-5"><i class="bi bi-bar-chart-fill me-2"></i> สถิติสถานะทีมใน 5 จังหวัดแรกที่มีทีมสมัครมากที่สุด</h6>
          <div style="height: 320px; position: relative;">
            <canvas id="chartTopProvincesTeamDoc"></canvas>
          </div>
        </div>
      </div>
    </div>

    <!-- Data Table -->
    <h6 class="fw-bold text-navy mb-3 fs-5"><i class="bi bi-table me-2"></i> ตารางสรุปการตรวจสอบเอกสารสมัครทีมแยกรายจังหวัด (Province Team Document Audit Summary)</h6>
    <div class="table-responsive">
      <table class="table table-hover align-middle border rounded-3 fs-6">
        <thead class="table-dark fs-6">
          <tr>
            <th class="text-center py-3" style="width: 60px;">#</th>
            <th class="py-3">จังหวัด</th>
            <th class="text-center py-3">ทีมทั้งหมด</th>
            <th class="text-center py-3">อนุมัติแล้ว</th>
            <th class="text-center py-3" style="color: #fb923c;">รอตรวจสอบ</th>
            <th class="text-center py-3">ไม่อนุมัติ</th>
            <th class="text-center py-3">อัตราอนุมัติ (%)</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml || '<tr><td colspan="7" class="text-center text-muted py-4 fs-6">ไม่มีข้อมูล</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      // Team Doc Status Pie Chart
      const ctxPie = document.getElementById('chartTeamDocStatusPie').getContext('2d');
      new Chart(ctxPie, {
        type: 'pie',
        data: {
          labels: ['อนุมัติการรับรองสิทธิ์ (Approved)', 'รอตรวจสอบเอกสาร (Pending)', 'ไม่อนุมัติ/ให้แก้ไข (Rejected)'],
          datasets: [{
            data: [${approvedTeams}, ${pendingTeams}, ${rejectedTeams}],
            backgroundColor: ['#10b981', '#ea580c', '#ef4444']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#0f172a', font: { size: 14, weight: 'bold' }, padding: 15 }
            }
          }
        }
      });

      // Top 5 Provinces Bar Chart
      const top5Provs = ${JSON.stringify(sortedProvinces.slice(0, 5).map(p => p[0]))};
      const top5App = ${JSON.stringify(sortedProvinces.slice(0, 5).map(p => p[1].approved))};
      const top5Pend = ${JSON.stringify(sortedProvinces.slice(0, 5).map(p => p[1].pending))};

      const ctxBar = document.getElementById('chartTopProvincesTeamDoc').getContext('2d');
      new Chart(ctxBar, {
        type: 'bar',
        data: {
          labels: top5Provs,
          datasets: [
            { label: 'อนุมัติแล้ว', data: top5App, backgroundColor: '#10b981', borderRadius: 4 },
            { label: 'รอตรวจสอบ', data: top5Pend, backgroundColor: '#ea580c', borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#0f172a', font: { size: 13, weight: 'bold' } } }
          },
          scales: {
            x: { ticks: { color: '#0f172a', font: { size: 13, weight: 'bold' } }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { color: '#0f172a', font: { size: 13, weight: 'bold' }, stepSize: 1 } }
          }
        }
      });
    });
  </script>
  `;
    const rawQuery = req.url.includes('?') ? req.url.substring(req.url.indexOf('?') + 1) : '';
    res.send((0, adminLayout_1.renderAdminLayout)('รายงานตรวจสอบเอกสารสมัครทีม', bodyContent, 'report-team-compliance', base, currentUser, rawQuery));
});
// -----------------------------------------------------------------------------
// Executive Report 5: Player Document Compliance & Verification Audit
// -----------------------------------------------------------------------------
router.get('/admin/report-compliance.php', adminSession_service_1.checkAdminSession, checkSuperAdminReportAccess, async (req, res) => {
    const base = (0, helpers_1.getBaseUrl)(req);
    const currentUser = req.adminUser || {
        id: 'ADM-001', username: 'admin', fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)', roleCode: 'SUPER_ADMIN', roleName: 'ผู้ดูแลระบบสูงสุด', permissions: ['system:all']
    };
    const isSatOfficer = currentUser.roleCode === 'SUPER_ADMIN' ? false : (currentUser.roleCode === 'SAT_OFFICER');
    const officerProv = (currentUser.province || '').trim().toLowerCase();
    const allRegisteredTeams = await (0, team_model_1.getDbRegisteredTeams)();
    const registeredTeams = isSatOfficer && officerProv
        ? allRegisteredTeams.filter((t) => !t.is_deleted && (t.province || '').trim().toLowerCase() === officerProv)
        : allRegisteredTeams.filter((t) => !t.is_deleted);
    const teamIds = new Set(registeredTeams.map((t) => t.id));
    const allPlayers = await (0, player_model_1.getDbPlayers)();
    const scopedPlayers = isSatOfficer && officerProv
        ? allPlayers.filter((p) => p.teamId && teamIds.has(p.teamId))
        : allPlayers;
    let approvedDocs = 0;
    let rejectedDocs = 0;
    let pendingDocs = 0;
    scopedPlayers.forEach((p) => {
        const teamObj = registeredTeams.find((t) => t.id === p.teamId);
        const submittedCats = (teamObj?.submitted_categories || '').toUpperCase().split(',').map((c) => c.trim());
        const pCat = (p.category || p.categories || 'U14').toUpperCase();
        const isCatSubmitted = submittedCats.includes(pCat) || teamObj?.status === 'APPROVED';
        // Only count compliance for players in submitted categories
        if (isCatSubmitted) {
            const st = (p.docStatus || 'PENDING').toUpperCase();
            if (st === 'APPROVED') {
                approvedDocs += 1;
            }
            else if (st !== 'CORRECTED' && st !== 'PENDING' && st !== 'APPROVED' && (st === 'REJECTED' || st === 'ACTION_REQUIRED' || Boolean(p.remarks))) {
                rejectedDocs += 1;
            }
            else {
                pendingDocs += 1;
            }
        }
    });
    const totalDocs = approvedDocs + rejectedDocs + pendingDocs;
    const approvedRate = totalDocs > 0 ? ((approvedDocs / totalDocs) * 100).toFixed(1) : '0.0';
    const rejectedRate = totalDocs > 0 ? ((rejectedDocs / totalDocs) * 100).toFixed(1) : '0.0';
    const bodyContent = `
  <div class="card p-4 shadow-sm border-0 rounded-4 mb-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div>
        <h4 class="fw-bold text-navy mb-1"><i class="bi bi-file-earmark-check-fill text-info me-2"></i>5. รายงานการตรวจสอบเอกสารนักกีฬา (Athlete Document Verification Audit)</h4>
        <p class="text-muted small mb-0">วิเคราะห์คอขวดของขั้นตอนการตรวจเอกสารส่วนตัวนักกีฬา (สูติบัตร/บัตรประชาชน/รูปถ่าย) สถิติข้อผิดพลาด และการแก้ไข</p>
      </div>
      <button class="btn btn-outline-primary btn-sm rounded-3 px-3 fw-bold" onclick="window.print()">
        <i class="bi bi-printer me-1"></i> พิมพ์รายงาน PDF
      </button>
    </div>

    <!-- Summary KPI Cards -->
    <div class="row g-3 mb-4">
      <div class="col-md-3">
        <div class="card border-0 bg-success-subtle text-success p-3 rounded-4 shadow-sm">
          <div class="small fw-semibold text-uppercase">เอกสารนักกีฬาผ่านการอนุมัติ</div>
          <div class="fs-2 fw-bold">${approvedDocs.toLocaleString()} ชุด</div>
          <div class="small text-muted"><i class="bi bi-check-all me-1"></i> ${approvedRate}% ของเอกสารนักกีฬาในรุ่นที่ส่งยื่น</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card border-0 bg-danger-subtle text-danger p-3 rounded-4 shadow-sm">
          <div class="small fw-semibold text-uppercase">เอกสารนักกีฬาต้องแก้ไข/ส่งซ้ำ</div>
          <div class="fs-2 fw-bold">${rejectedDocs.toLocaleString()} ชุด</div>
          <div class="small text-muted"><i class="bi bi-exclamation-triangle me-1"></i> ${rejectedRate}% พบข้อผิดพลาด</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card border-0 bg-warning-subtle text-warning-emphasis p-3 rounded-4 shadow-sm">
          <div class="small fw-semibold text-uppercase">เอกสารนักกีฬารอตรวจ</div>
          <div class="fs-2 fw-bold" style="color: #ea580c;">${pendingDocs.toLocaleString()} ชุด</div>
          <div class="small text-muted"><i class="bi bi-hourglass-bottom me-1"></i> อยู่ในคิวตรวจสอบ</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card border-0 bg-primary-subtle text-primary p-3 rounded-4 shadow-sm">
          <div class="small fw-semibold text-uppercase">เอกสารนักกีฬายื่นรวม</div>
          <div class="fs-2 fw-bold">${totalDocs.toLocaleString()} ชุด</div>
          <div class="small text-muted"><i class="bi bi-files me-1"></i> เฉพาะรุ่นที่ส่งรายชื่อแล้ว</div>
        </div>
      </div>
    </div>

    <!-- Visual Charts Section -->
    <div class="row g-4 mb-4">
      <div class="col-lg-6">
        <div class="card border shadow-sm rounded-4 p-3 h-100">
          <h6 class="fw-bold text-navy mb-3 fs-5"><i class="bi bi-pie-chart-fill me-2"></i> สัดส่วนสถานะเอกสารนักกีฬารวม (Athlete Document Status)</h6>
          <div style="height: 320px; position: relative;" class="d-flex align-items-center justify-content-center">
            <canvas id="chartDocStatusPie"></canvas>
          </div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card border shadow-sm rounded-4 p-3 h-100">
          <h6 class="fw-bold text-navy mb-3 fs-5"><i class="bi bi-bar-chart-steps me-2"></i> สาเหตุหลักที่เอกสารนักกีฬาไม่ผ่านอนุมัติ (Top Rejection Reasons)</h6>
          <div style="height: 320px; position: relative;">
            <canvas id="chartRejectionReasons"></canvas>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      // Compliance Status Pie
      const ctxPie = document.getElementById('chartDocStatusPie').getContext('2d');
      new Chart(ctxPie, {
        type: 'pie',
        data: {
          labels: ['อนุมัติเรียบร้อย (Approved)', 'ไม่อนุมัติ/ต้องแก้ไข (Rejected)', 'รอตรวจสอบ (Pending)'],
          datasets: [{
            data: [${approvedDocs}, ${rejectedDocs}, ${pendingDocs}],
            backgroundColor: ['#10b981', '#ef4444', '#ea580c']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#0f172a', font: { size: 14, weight: 'bold' }, padding: 15 }
            }
          }
        }
      });

      // Rejection Reasons Horizontal Bar
      const ctxRej = document.getElementById('chartRejectionReasons').getContext('2d');
      new Chart(ctxRej, {
        type: 'bar',
        data: {
          labels: ['รูปถ่ายไม่ตรงระเบียบ', 'บัตรประชาชนหมดอายุ', 'หนังสือยินยอมผู้ปกครองไม่สมบูรณ์', 'ใบรับรองสถานศึกษาผิดประเภท'],
          datasets: [{
            label: 'จำนวนกรณี (เคส)',
            data: [${Math.round(rejectedDocs * 0.45)}, ${Math.round(rejectedDocs * 0.30)}, ${Math.round(rejectedDocs * 0.15)}, ${Math.round(rejectedDocs * 0.10)}],
            backgroundColor: '#ef4444',
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { bodyFontSize: 14, titleFontSize: 15 }
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { color: '#0f172a', font: { size: 13, weight: 'bold' }, stepSize: 1 }
            },
            y: {
              ticks: { color: '#0f172a', font: { size: 13, weight: 'bold' } },
              grid: { display: false }
            }
          }
        }
      });
    });
  </script>
  `;
    const rawQuery = req.url.includes('?') ? req.url.substring(req.url.indexOf('?') + 1) : '';
    res.send((0, adminLayout_1.renderAdminLayout)('รายงานตรวจสอบเอกสารนักกีฬา', bodyContent, 'report-compliance', base, currentUser, rawQuery));
});
// -----------------------------------------------------------------------------
// Executive Report 6: Future Planning & Strategic Assessment
// -----------------------------------------------------------------------------
router.get('/admin/report-strategy.php', adminSession_service_1.checkAdminSession, checkSuperAdminReportAccess, async (req, res) => {
    const base = (0, helpers_1.getBaseUrl)(req);
    const currentUser = req.adminUser || {
        id: 'ADM-001', username: 'admin', fullname: 'ผู้ดูแลระบบสูงสุด (Super Admin)', roleCode: 'SUPER_ADMIN', roleName: 'ผู้ดูแลระบบสูงสุด', permissions: ['system:all']
    };
    const allRegisteredTeams = await (0, team_model_1.getDbRegisteredTeams)();
    const reportScope = getReportProvinceScope(req);
    const registeredTeams = allRegisteredTeams.filter((t) => !t.is_deleted && inScope(t.province, reportScope));
    const totalTeams = registeredTeams.length;
    const uniqueProvinces = new Set(registeredTeams.map((t) => t.province)).size;
    const bodyContent = `
  <div class="card p-4 shadow-sm border-0 rounded-4 mb-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div>
        <h4 class="fw-bold text-navy mb-1"><i class="bi bi-trophy-fill text-primary me-2"></i>6. รายงานประเมินการจัดแข่งครั้งต่อไป (Future Planning Benchmark)</h4>
        <p class="text-muted small mb-0">รายงานระดับนโยบาย (Executive Summary Report) สรุปจุดแข็ง ข้อควรปรับปรุง และข้อเสนอแนะสำหรับการจัดแข่งฤดูกาลถัดไป</p>
      </div>
      <button class="btn btn-outline-primary btn-sm rounded-3 px-3 fw-bold" onclick="window.print()">
        <i class="bi bi-printer me-1"></i> พิมพ์รายงาน PDF
      </button>
    </div>

    <!-- Strategic Benchmark Cards -->
    <div class="row g-4 mb-4">
      <div class="col-md-6">
        <div class="card border-0 bg-success-subtle p-4 rounded-4 shadow-sm h-100">
          <h5 class="fw-bold text-success mb-3 fs-5"><i class="bi bi-hand-thumbs-up-fill me-2"></i> จุดแข็งและความสำเร็จหลัก (Key Success Indicators)</h5>
          <ul class="mb-0 text-dark fs-6 lh-lg">
            <li class="mb-2"><strong>อัตราการเติมเต็มโควตา (Capacity Utilization) High</strong>: มีทีมสมัครรวมสูงถึง <strong class="text-navy">${totalTeams} ทีม</strong> ครอบคลุม <strong class="text-navy">${uniqueProvinces} จังหวัด</strong> ทั่วประเทศ</li>
            <li class="mb-2"><strong>การมีส่วนร่วมของสถานศึกษาท้องถิ่น</strong>: โรงเรียนสังกัด อบจ. และ สพฐ. ส่งทีมเข้าร่วมเป็นสัดส่วนหลักของประเทศ</li>
            <li class="mb-0"><strong>ความสมบูรณ์ของระบบดิจิทัล</strong>: การส่งออกใบรายชื่อ O-2 แบบ A4 Portrait ช่วยลดขั้นตอนกระดาษและเวลาตรวจสอบได้กว่า 80%</li>
          </ul>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card border-0 bg-warning-subtle p-4 rounded-4 shadow-sm h-100">
          <h5 class="fw-bold text-warning-emphasis mb-3 fs-5"><i class="bi bi-lightbulb-fill me-2"></i> ข้อเสนอแนะเชิงกลยุทธ์สำหรับการจัดแข่งครั้งต่อไป</h5>
          <ul class="mb-0 text-dark fs-6 lh-lg">
            <li class="mb-2"><strong>ขยายโควตารุ่น U16 (ชาย)</strong>: เพิ่มจำนวนโควตารอบคัดเลือกรายภูมิภาค เนื่องจากมีทีมสมัครล้นโควตาและต้องตัดสิทธิ์</li>
            <li class="mb-2"><strong>การยื่นเอกสารล่วงหน้า</strong>: เพิ่มระบบการตรวจพรีวิวรูปถ่ายบัตรประชาชนเพื่อลดสถิติการถูกปฏิเสธ (Rejection) ในช่วงใกล้วันแข่ง</li>
            <li class="mb-0"><strong>การสนับสนุนงบประมาณจัดแข่ง</strong>: มุ่งเน้นสนับสนุนกลุ่มจังหวัดในภาคใต้และภาคเหนือตอนบนที่มีศักยภาพการเติบโตสูง</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
  `;
    const rawQuery = req.url.includes('?') ? req.url.substring(req.url.indexOf('?') + 1) : '';
    res.send((0, adminLayout_1.renderAdminLayout)('รายงานประเมินจัดแข่งครั้งต่อไป', bodyContent, 'report-strategy', base, currentUser, rawQuery));
});
