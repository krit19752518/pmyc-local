"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderLayout = renderLayout;
const teamArea_1 = require("./utils/teamArea");
const adminSession_service_1 = require("./services/adminSession.service");
function renderLayout(title, content, activeNav = 'home', baseUrl = '/football', isFluid = false, currentUser, hideNav = false) {
    // Ensure baseUrl doesn't end with slash unless it's just '/'
    const base = baseUrl.endsWith('/') && baseUrl !== '/' ? baseUrl.slice(0, -1) : baseUrl;
    const containerClass = isFluid ? 'container-fluid px-3 px-md-4' : 'container';
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
<body>
<header class="site-header">
  <div class="container d-flex align-items-center gap-3 py-2">
    <a class="brand" href="${base}/index.php">
      <img class="brand-logo" src="${base}/assets/img/pmyc_top_logo.png" alt="Prime Minister's Youth CUP Football">
      <span class="brand-text">
        <strong>Prime Minister's Youth CUP</strong>
        <small>FOOTBALL</small>
      </span>
    </a>
    <div class="ms-auto d-none d-xl-block text-end small text-white-50 org-line">
      จัดการแข่งขันโดย สมาคมกีฬาฟุตบอลแห่งประเทศไทย และการกีฬาแห่งประเทศไทย
    </div>
  </div>
  ${hideNav ? '' : `<nav class="navbar navbar-expand-md navbar-dark site-nav">
    <div class="container">
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainnav">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="mainnav">
        <ul class="navbar-nav me-auto">
          <li class="nav-item">
            <a class="nav-link ${activeNav === 'home' ? 'active' : ''}" href="${base}/index.php">หน้าแรก</a>
          </li>
          <li class="nav-item">
            <a class="nav-link ${activeNav === 'rules' ? 'active' : ''}" href="${base}/rules.php">ระเบียบการแข่งขัน</a>
          </li>
          <li class="nav-item">
            <a class="nav-link ${activeNav === 'statistics' ? 'active' : ''}" href="${base}/registration-statistics.php">ข้อมูลสถิติการสมัคร</a>
          </li>
          <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle ${activeNav === 'register' ? 'active' : ''}" href="#" id="registerDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="bi bi-pencil-square"></i> รับสมัครทีม
            </a>
            <ul class="dropdown-menu" aria-labelledby="registerDropdown">
              <li><a class="dropdown-item" href="${base}/team/register.php?category=U14">รับสมัครทีม U14</a></li>
              <li><a class="dropdown-item" href="${base}/team/register.php?category=U16">รับสมัครทีม U16</a></li>
              <li><a class="dropdown-item" href="${base}/team/register.php?category=U18">รับสมัครทีม U18</a></li>
            </ul>
          </li>
        </ul>
        <ul class="navbar-nav">
          <li class="nav-item"><a class="nav-link ${activeNav === 'team' ? 'active' : ''}" href="${base}/team/index.php"><i class="bi bi-person-badge"></i> จัดการข้อมูลทีม</a></li>
          ${currentUser && currentUser.roleCode === 'SAT_OFFICER' ? `
            <li class="nav-item dropdown">
              <a class="nav-link dropdown-toggle ${activeNav === 'sat_admin' ? 'active' : ''}" href="#" id="satUserDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                <i class="bi bi-building"></i> กกท. จังหวัด
              </a>
              <ul class="dropdown-menu dropdown-menu-end shadow-sm" aria-labelledby="satUserDropdown">
                <li><a class="dropdown-item text-danger fw-semibold" href="${base}/admin/logout"><i class="bi bi-box-arrow-right me-2"></i>ออกจากระบบ</a></li>
              </ul>
            </li>
            <li class="nav-item"><a class="nav-link ${activeNav === 'admin' ? 'active' : ''}" href="${base}/admin/index.php"><i class="bi bi-shield-lock"></i> กกท. กลาง</a></li>
          ` : (currentUser ? `
            <li class="nav-item"><a class="nav-link ${activeNav === 'sat_admin' ? 'active' : ''}" href="${base}/admin/sat-login.php"><i class="bi bi-building"></i> กกท. จังหวัด</a></li>
            <li class="nav-item dropdown">
              <a class="nav-link dropdown-toggle ${activeNav === 'admin' ? 'active' : ''}" href="#" id="adminUserDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                <i class="bi bi-shield-lock"></i> กกท. กลาง
              </a>
              <ul class="dropdown-menu dropdown-menu-end shadow-sm" aria-labelledby="adminUserDropdown">
                <li><a class="dropdown-item text-danger fw-semibold" href="${base}/admin/logout"><i class="bi bi-box-arrow-right me-2"></i>ออกจากระบบ</a></li>
              </ul>
            </li>
          ` : `
            <li class="nav-item"><a class="nav-link ${activeNav === 'sat_admin' ? 'active' : ''}" href="${base}/admin/sat-login.php"><i class="bi bi-building"></i> กกท. จังหวัด</a></li>
            <li class="nav-item"><a class="nav-link ${activeNav === 'admin' ? 'active' : ''}" href="${base}/admin/index.php"><i class="bi bi-shield-lock"></i> กกท. กลาง</a></li>
          `)}
        </ul>
      </div>
    </div>
  </nav>`}
</header>

<main class="py-3 py-md-4">
  <div class="${containerClass}">
    ${content}
  </div>
</main>

<div class="footer-credit" aria-label="Footer credit">
  <div class="container"><img src="${base}/assets/img/footercredit.png" alt="Prime Minister's Youth CUP Football"></div>
</div>
<footer class="site-footer">
  <div class="container py-4 small">
    <div class="fw-semibold mb-2">Prime Minister's Youth CUP Football</div>
    <div class="text-white-50">จัดการแข่งขันโดย สมาคมกีฬาฟุตบอลแห่งประเทศไทย และสมาคมกีฬาแห่งจังหวัด</div>
    <div class="text-white-50">ร่วมกับ สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน และองค์กรปกครองส่วนท้องถิ่น</div>
    <div class="text-white-50">โดยการสนับสนุนของ กระทรวงการท่องเที่ยวและกีฬา การกีฬาแห่งประเทศไทย และกองทุนพัฒนาการกีฬาแห่งชาติ</div>
    <hr class="border-secondary">
    <div class="d-flex flex-wrap gap-3 justify-content-between">
      <span>&copy; 2569 Prime Minister's Youth CUP Football</span>
      <span>
        <a class="link-light" href="${base}/document/rules.pdf" target="_blank"><i class="bi bi-file-earmark-pdf me-1"></i>ระเบียบการแข่งขัน (PDF)</a>
      </span>
    </div>
  </div>
</footer>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="${base}/assets/data/thai-administrative-divisions.js?v=20261014_1"></script>
<script src="${base}/assets/js/app.bb3bd3ab.js?v=issue11-20261106"></script>
${activeNav === 'home' && content.includes('id="home-statistics-summary"') ? `<script defer src="${base}/assets/registration-statistics/home.js?v=issue89-home-1"></script>` : ''}
${(0, adminSession_service_1.renderSessionExpiryClientScript)()}
</body>
</html>`;
}
