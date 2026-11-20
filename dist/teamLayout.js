"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTeamLayout = renderTeamLayout;
const teamArea_1 = require("./utils/teamArea");
const supportReportWidget_1 = require("./supportReportWidget");
const adminSession_service_1 = require("./services/adminSession.service");
function renderTeamLayout(title, content, activeSubNav = 'index', baseUrl = '', profile) {
    const base = baseUrl.endsWith('/') && baseUrl !== '/' ? baseUrl.slice(0, -1) : baseUrl;
    const schoolName = profile?.school || '';
    const managerName = profile?.managerName || '';
    const userTeams = profile?.userTeams || [];
    const supportActionHtml = activeSubNav === 'index' ? `
    <section class="team-support-qr text-center mt-2" aria-label="แจ้งปัญหาการใช้ระบบผ่าน LINE">
      <p class="mb-2" style="color:#dc3545;font-weight:700;">แจ้งปัญหาการใช้ระบบ</p>
      <img src="${base === '/' ? '' : base}/images/lineoa-support-qr.png" alt="QR Code LINE สำหรับแจ้งปัญหาการใช้ระบบ" width="262" height="248" style="display:block;width:100%;max-width:200px;height:auto;margin-inline:auto;">
    </section>` : (0, supportReportWidget_1.renderSupportReportWidget)(title, base);
    const teamSwitcherHtml = userTeams.length > 1 ? `
    <li><hr class="dropdown-divider"></li>
    <li><span class="dropdown-item-text small text-muted fw-bold"><i class="bi bi-arrow-repeat me-1"></i> สลับทีมที่ลงทะเบียน:</span></li>
    ${userTeams.map(t => `
      <li>
        <a class="dropdown-item ${t.isCurrent ? 'active fw-bold' : ''}" href="${base}/team/switch-team.php?teamId=${t.id}">
          <i class="bi bi-shield-shaded me-1"></i> ${t.school} ${t.isCurrent ? '<i class="bi bi-check-lg ms-auto"></i>' : ''}
        </a>
      </li>
    `).join('')}
  ` : '';
    return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b2a5b">
<title>${title} | Prime Minister's Youth CUP Football</title>
<meta name="description" content="Prime Minister's Youth CUP Football">
<meta property="og:title" content="${title} | Prime Minister's Youth CUP Football">
<meta property="og:description" content="Prime Minister's Youth CUP Football">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
<link href="${base}/assets/css/app.css" rel="stylesheet">
${(0, teamArea_1.renderTeamAreaClientScript)()}
</head>
<body class="panel-body">

<nav class="navbar navbar-dark panel-topbar sticky-top">
  <div class="container-fluid px-3 px-md-4 py-1">
    <a class="navbar-brand text-truncate d-flex align-items-center gap-2" href="${base}/team/index.php">
      <img class="brand-logo" src="${base}/assets/img/pmyc_top_logo.png" alt="PMYC Football" style="height: 40px; width: auto;">
      <span class="fw-bold fs-6">ระบบจัดการทีม</span>
      <small class="text-white-50 d-none d-lg-inline">· Prime Minister's Youth CUP Football</small>
    </a>
    ${profile?.isDemo ? '<span class="badge bg-warning text-dark fs-4 fw-bold px-3 py-2 me-2">ข้อมูล Demo</span>' : ''}
    <div class="dropdown ms-auto">
      <button class="btn btn-outline-light btn-sm dropdown-toggle rounded-3 px-3" type="button" data-bs-toggle="dropdown" aria-expanded="false">
        <i class="bi bi-person-circle me-1"></i> ${schoolName}
      </button>
      <ul class="dropdown-menu dropdown-menu-end shadow border-0 mt-2">
        <li><span class="dropdown-item-text small text-muted"><i class="bi bi-person me-1"></i> ผู้จัดการทีม: ${managerName}</span></li>
        ${teamSwitcherHtml}
        <li><hr class="dropdown-divider"></li>
        <li><a class="dropdown-item" href="${base}/index.php" target="_blank"><i class="bi bi-globe me-1"></i> ดูเว็บไซต์</a></li>
        <li><a class="dropdown-item text-danger" href="${base}/team/logout.php"><i class="bi bi-box-arrow-right me-1"></i> ออกจากระบบ</a></li>
      </ul>
    </div>
  </div>
</nav>

<div class="panel-shell">
  <aside class="panel-sidebar bg-white" id="sidebar">
    <div class="py-2">
      <nav class="nav flex-column">
        <a href="${base}/team/index.php" class="nav-link ${activeSubNav === 'index' ? 'active' : ''}">
          <i class="bi bi-speedometer2"></i> ภาพรวมทีม
        </a>
        <a href="${base}/team/team.php" class="nav-link ${activeSubNav === 'team' ? 'active' : ''}">
          <i class="bi bi-shield-shaded"></i> ข้อมูลทีม
        </a>
        <a href="${base}/team/players.php" class="nav-link ${activeSubNav === 'players' ? 'active' : ''}">
          <i class="bi bi-people"></i> รายชื่อนักกีฬา
        </a>
        <a href="${base}/team/officials.php" class="nav-link ${activeSubNav === 'officials' ? 'active' : ''}">
          <i class="bi bi-person-badge"></i> เจ้าหน้าที่ทีม
        </a>
        <a href="${base}/team/submit.php" class="nav-link ${activeSubNav === 'submit' ? 'active' : ''}">
          <i class="bi bi-send-check"></i> ยืนยันรายชื่อ
        </a>
        <a href="${base}/team/support-reports.php" class="nav-link ${activeSubNav === 'support-reports' ? 'active' : ''}">
          <i class="bi bi-inbox"></i> รายการปัญหาการใช้งานระบบ
        </a>
      </nav>
      <div class="px-3 pt-2">${supportActionHtml}</div>
    </div>
  </aside>

  <div class="panel-content">
    ${content}
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="${base}/assets/data/thai-administrative-divisions.js?v=20261014_1"></script>
<script src="${base}/assets/js/app.bb3bd3ab.js?v=issue11-20261106"></script>
${(0, adminSession_service_1.renderSessionExpiryClientScript)()}
</body>
</html>`;
}
