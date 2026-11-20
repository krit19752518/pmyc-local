"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderTeamLayout = renderTeamLayout;
const teamPortal_1 = require("./views/teamPortal");
const teamArea_1 = require("./utils/teamArea");
const supportReportWidget_1 = require("./supportReportWidget");
const adminSession_service_1 = require("./services/adminSession.service");
function renderTeamLayout(title, content, activeSubNav = 'index', baseUrl = '', profile) {
    const base = baseUrl === '/' ? '' : baseUrl.replace(/\/+$/, '');
    const schoolName = (0, teamPortal_1.escapeTeamPortal)(profile?.school || '');
    const managerName = (0, teamPortal_1.escapeTeamPortal)(profile?.managerName || '');
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
        <a class="dropdown-item ${t.isCurrent ? 'active fw-bold' : ''}" href="${base}/team/switch-team.php?teamId=${encodeURIComponent(t.id)}">
          <i class="bi bi-shield-shaded me-1"></i> ${(0, teamPortal_1.escapeTeamPortal)(t.school)} ${t.isCurrent ? '<i class="bi bi-check-lg ms-auto"></i>' : ''}
        </a>
      </li>
    `).join('')}
  ` : '';
    const nav = [
        ['index', '/team/index.php', 'house', 'ภาพรวมทีม'], ['team', '/team/team.php', 'shield', 'ข้อมูลทีม'],
        ['players', '/team/players.php', 'people', 'รายชื่อนักกีฬา'], ['officials', '/team/officials.php', 'person-badge', 'เจ้าหน้าที่ทีม'],
        ['submit', '/team/submit.php', 'clipboard-check', 'ตรวจสอบและยืนยัน'], ['documents', '/team/documents.php', 'download', 'เอกสารดาวน์โหลด'],
        ['guide', '/team/guide.php', 'question-circle', 'ขั้นตอนและคำแนะนำ'], ['support-reports', '/team/support-reports.php', 'inbox', 'รายการปัญหาการใช้งานระบบ']
    ];
    if (profile?.womenSeason) {
        const tabs = { players: 'players', officials: 'officials', submit: 'review', documents: 'documents' };
        for (const item of nav) {
            if (tabs[item[0]])
                item[1] = '/team/women.php?season=' + encodeURIComponent(profile.womenSeason) + '&tab=' + tabs[item[0]];
        }
    }
    const currentLabel = nav.find(item => item[0] === activeSubNav)?.[3] || title;
    return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#102e56">
<title>${(0, teamPortal_1.escapeTeamPortal)(title)} | Prime Minister's Youth CUP Football</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
<link href="${base}/assets/css/app.css" rel="stylesheet">
<link href="${base}/assets/team-portal/typography.css?v=issue100-1" rel="stylesheet">
<link href="${base}/assets/team-portal/styles.css?v=issue100-1" rel="stylesheet">
<link href="${base}/assets/team-portal/integration.css?v=issue100-1" rel="stylesheet">
${(0, teamArea_1.renderTeamAreaClientScript)()}</head><body class="team-portal">
<a class="skip" href="#main">ข้ามไปเนื้อหา</a>
<header class="topbar"><a class="brand" href="${base}/team/index.php" aria-label="PMYC Football ภาพรวมทีม"><img src="${base}/assets/team-portal/assets/pmyc-logo.png" alt="PMYC Football"><span class="brand-copy"><strong>ระบบจัดการทีม</strong><span>PRIME MINISTER’S YOUTH CUP · FOOTBALL</span></span></a>
<nav class="topnav" aria-label="เมนูด้านบน"><a class="public-link" href="${base}/team/guide.php">คู่มือการสมัคร</a>${profile?.isDemo ? '<span class="badge amber">ข้อมูล Demo</span>' : ''}
<button class="menu-toggle" type="button" id="teamMenuToggle" aria-label="เปิดเมนู" aria-controls="sidebar" aria-expanded="false">${(0, teamPortal_1.renderTeamPortalIcon)('menu')}</button>
<div class="dropdown"><button class="account dropdown-toggle" data-bs-toggle="dropdown" type="button" aria-expanded="false">${(0, teamPortal_1.renderTeamPortalIcon)('user')}<span class="account-name">${schoolName || 'ผู้ดูแลทีม'}</span></button>
<ul class="dropdown-menu dropdown-menu-end shadow"><li><span class="dropdown-item-text small text-muted">ผู้จัดการทีม: ${managerName || '—'}</span></li>${teamSwitcherHtml}<li><hr class="dropdown-divider"></li><li><a class="dropdown-item" href="${base}/index.php" target="_blank" rel="noopener">ดูเว็บไซต์</a></li><li><a class="dropdown-item text-danger" href="${base}/team/logout.php">ออกจากระบบ</a></li></ul></div></nav></header>
<div class="drawer-overlay" id="teamDrawerOverlay" aria-hidden="true"></div>
<aside class="sidebar" id="sidebar" aria-label="เมนูจัดการทีม"><div class="side-caption">ระบบจัดการทีม</div><nav class="side-nav">${nav.map(([key, path, icon, label]) => `<a href="${base}${path}" class="${activeSubNav === key ? 'active' : ''}" ${activeSubNav === key ? 'aria-current="page"' : ''}>${(0, teamPortal_1.renderTeamPortalIcon)(icon)}${label}</a>`).join('')}</nav>
<div class="team-support-area">${supportActionHtml}</div><div class="side-bottom"><div class="rule">ข้อมูลทีมเดียวกัน<br>จัดการรายชื่อแยกตามรุ่น</div></div></aside>
<main class="main" id="main" tabindex="-1"><div class="content"><div class="breadcrumb">ระบบจัดการทีม <span aria-hidden="true">/</span> ${(0, teamPortal_1.escapeTeamPortal)(currentLabel)}</div>${['index', 'documents', 'guide'].includes(activeSubNav) ? '' : `<div class="pagehead"><div><div class="eyebrow">จัดการทีม</div><h1>${(0, teamPortal_1.escapeTeamPortal)(title)}</h1><p>ใช้ข้อมูลทีมร่วมกัน และจัดการรายชื่อแยกตามรุ่น</p></div></div>`}<div class="team-route-content">${content}</div><footer class="footer"><span>PMYC Football · Prime Minister’s Youth Cup</span><span>ข้อมูลทีมและการสมัครรายรุ่น</span></footer></div></main>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script><script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="${base}/assets/data/thai-administrative-divisions.js?v=20261014_1"></script><script src="${base}/assets/js/app.bb3bd3ab.js?v=issue11-20261106"></script>
<script src="${base}/assets/team-portal/portal.js?v=issue100-1"></script>${(0, adminSession_service_1.renderSessionExpiryClientScript)()}
</body></html>`;
}
