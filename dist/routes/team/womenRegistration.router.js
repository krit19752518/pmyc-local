"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.womenRegistrationRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const crypto_1 = require("crypto");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const os_1 = __importDefault(require("os"));
const exceljs_1 = __importDefault(require("exceljs"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const db_1 = require("../../db");
const teamLayout_1 = require("../../teamLayout");
const adminLayout_1 = require("../../adminLayout");
const helpers_1 = require("../../utils/helpers");
const teamSession_service_1 = require("../../services/teamSession.service");
const women = __importStar(require("../../services/womenRegistration.service"));
const womenPortal_1 = require("../../views/womenPortal");
const teamPortal_1 = require("../../views/teamPortal");
exports.womenRegistrationRouter = (0, express_1.Router)();
const r = exports.womenRegistrationRouter;
const memoryUpload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 4, fields: 50, fieldSize: 2000 } }).any();
const wrap = (f) => (q, s, n) => { void f(q, s).catch(err => { if (s.headersSent)
    return n(err); s.status(err instanceof women.WomenError ? err.status : 503).json({ success: false, error: err instanceof women.WomenError ? err.message : 'ไม่สามารถบันทึกหรือโหลดข้อมูลได้ กรุณาลองใหม่' }); }); };
function csrf(req, res) { const old = (0, helpers_1.parseCookies)(req).women_csrf; const token = typeof old === 'string' && /^[a-f0-9]{64}$/.test(old) ? old : (0, crypto_1.randomBytes)(32).toString('hex'); res.append('Set-Cookie', `women_csrf=${token}; Path=/; HttpOnly; SameSite=Lax${req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`); res.setHeader('Cache-Control', 'no-store'); return token; }
function checkCsrf(req) { const cookie = (0, helpers_1.parseCookies)(req).women_csrf, token = req.body?.csrf; if (typeof cookie !== 'string' || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(cookie) || !/^[a-f0-9]{64}$/.test(token) || !(0, crypto_1.timingSafeEqual)(Buffer.from(cookie), Buffer.from(token)))
    throw new women.WomenError(403, 'กรุณาโหลดหน้าใหม่ก่อนบันทึก'); const origin = req.get('origin'); if (origin && new URL(origin).host !== req.get('host'))
    throw new women.WomenError(403, 'แหล่งที่มาของคำขอไม่ถูกต้อง'); }
const season = (req) => women.validSeason(req.body?.season || req.query.season || women.WOMEN_SEASON);
const team = (req) => String(req.teamSession.teamId);
const actor = (req) => String(req.teamSession.teamUser);
const script = '<script src="/assets/team-portal/women.js?v=issue101-1" defer></script>';
function layout(req, title, content, profile) { return (0, teamLayout_1.renderTeamLayout)(title, content + script, 'women', (0, helpers_1.getBaseUrl)(req), profile); }
const success = (res, seasonKey, tab = 'overview') => res.json({ success: true, redirectUrl: `/team/women.php?season=${encodeURIComponent(seasonKey)}&tab=${tab}` });
async function available() { if (!await women.womenReady())
    throw new women.WomenError(503, 'ระบบสมัครหญิงยังไม่ได้ติดตั้งข้อมูล กรุณาติดต่อผู้ดูแล'); }
r.get('/team/women-entry.php', wrap(async (req, res) => {
    const s = season(req);
    await available();
    await women.categoryConfig(s);
    const signed = (0, teamSession_service_1.verifyTeamSessionCookies)((0, helpers_1.parseCookies)(req));
    if (signed && signed.teamId !== 'default')
        return res.redirect(`/team/women.php?season=${s}`);
    const token = csrf(req, res);
    return res.send((0, womenPortal_1.renderWomenPublicLayout)('เข้าสู่ระบบสมัครทีมหญิง', `<div class="registration-layout"><aside class="registration-aside"><h2>ใช้บัญชีเดิม<br>เพิ่มรุ่น18 (หญิง)</h2><p>ทีมที่สมัครชายแล้วไม่ต้องสร้างบัญชีใหม่ เข้าสู่ระบบและยืนยันเพิ่มรุ่นหญิงในขั้นตอนถัดไป</p></aside><section class="panel"><div class="panel-head"><h1>เข้าสู่ระบบสมัครทีมหญิง</h1></div><form class="panel-body" action="/api/team/login" method="post"><input type="hidden" name="women_season" value="${(0, teamPortal_1.escapeTeamPortal)(s)}"><input type="hidden" name="women_csrf" value="${token}"><div class="form-grid"><label class="field">อีเมลหรือชื่อผู้ใช้<input name="username" autocomplete="username" required></label><label class="field">รหัสผ่าน<input name="password" type="password" autocomplete="current-password" required></label></div><div class="form-actions"><button class="btn primary">เข้าสู่ระบบ</button><a class="btn" href="/team/women-register.php?season=${s}">ยังไม่มีบัญชี? ลงทะเบียนทีมใหม่</a></div><a href="/team/reset-password.php">ลืมรหัสผ่าน</a></form></section></div>`, s));
}));
r.get('/team/women-register.php', wrap(async (req, res) => { await available(); const s = season(req); await women.categoryConfig(s); res.send((0, womenPortal_1.renderWomenPublicLayout)('ข้อมูลทีมใหม่', (0, womenPortal_1.renderWomenRegister)(csrf(req, res), s, (0, helpers_1.getBaseUrl)(req)), s)); }));
r.post('/api/team/women/register', memoryUpload, wrap(async (req, res) => {
    checkCsrf(req);
    await available();
    const s = season(req), result = await withFiles(req, input => women.registerWomenTeam(input, s));
    res.setHeader('Set-Cookie', (0, teamSession_service_1.buildTeamSessionCookies)(req, result.teamId, result.username));
    res.json({ success: true, enrolled: result.enrolled, redirectUrl: `/team/women.php?season=${s}&registered=${result.enrolled ? 'enrolled' : 'account'}` });
}));
r.get('/team/women.php', teamSession_service_1.requireSignedTeamSession, wrap(async (req, res) => {
    await available();
    const s = season(req), d = await women.loadWomen(team(req), s);
    d.availableOfficials = (await db_1.pool.query('SELECT id,name FROM football_official WHERE team_id=$1 ORDER BY name', [team(req)])).rows;
    const tab = String(req.query.tab || 'overview');
    if (!['overview', 'players', 'officials', 'review', 'documents'].includes(tab))
        throw new women.WomenError(400, 'เมนูไม่ถูกต้อง');
    const notice = req.query.registered ? `<div class="notice">${req.query.registered === 'enrolled' ? 'ลงทะเบียนทีมและสมัครรุ่น18 (หญิง) สำเร็จแล้ว ขั้นต่อไปจัดรายชื่อและยืนยันส่ง' : 'ลงทะเบียนบัญชีทีมสำเร็จ ยังไม่ได้สมัครรุ่นหญิง คุณสามารถยืนยันสมัครได้ด้านล่าง'}</div>` : '';
    res.send(layout(req, 'จัดการรุ่น18 (หญิง)', notice + (0, womenPortal_1.renderWomenPage)(d, csrf(req, res), tab, String(req.query.edit || '')), { school: d.team.team_name, isDemo: d.team.is_test, womenSeason: s }));
}));
r.post('/api/team/women/enroll', teamSession_service_1.requireSignedTeamSession, memoryUpload, wrap(async (req, res) => { checkCsrf(req); await available(); const s = season(req); await women.enrollWomen(team(req), s, actor(req)); success(res, s); }));
const uploadRoot = () => process.env.NODE_ENV === 'test' ? path_1.default.join(os_1.default.tmpdir(), `football-women-test-${process.pid}`) : path_1.default.resolve(__dirname, '../../../uploads');
async function files(req) {
    const uploaded = (req.files || []), fields = {}, created = [];
    const allowed = new Set(req.path.endsWith('/register') ? ['doc_team_cert'] : req.path.endsWith('/official') ? ['doc_id_card'] : ['photo', 'doc_id_card', 'doc_school_cert', 'doc_parent_consent']);
    for (const f of uploaded) {
        const jpeg = f.buffer[0] === 255 && f.buffer[1] === 216 && f.buffer[2] === 255, png = f.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), pdf = f.buffer.subarray(0, 5).toString() === '%PDF-';
        if (!allowed.has(f.fieldname) || fields[f.fieldname] || !(jpeg || png || pdf) || (f.fieldname === 'photo' && !jpeg && !png))
            throw new women.WomenError(400, 'ไฟล์ต้องเป็น JPG/PNG หรือ PDF ที่ถูกต้อง และไม่เกิน 4 MB');
        fields[f.fieldname] = f.originalname;
    }
    try {
        for (const f of uploaded) {
            const ext = f.buffer.subarray(0, 5).toString() === '%PDF-' ? '.pdf' : f.buffer[0] === 255 ? '.jpg' : '.png';
            const name = 'women-' + (0, crypto_1.randomUUID)() + ext;
            await promises_1.default.mkdir(uploadRoot(), { recursive: true });
            const target = path_1.default.join(uploadRoot(), name);
            await promises_1.default.writeFile(target, f.buffer, { flag: 'wx', mode: 0o600 });
            created.push(target);
            fields[f.fieldname === 'photo' ? 'photo_url' : f.fieldname] = '/uploads/' + name;
        }
        return { fields, created };
    }
    catch (err) {
        await Promise.all(created.map(x => promises_1.default.unlink(x)));
        throw err;
    }
}
async function withFiles(req, save) { const saved = await files(req); try {
    const values = { ...req.body };
    for (const k of ['photo_url', 'doc_id_card', 'doc_school_cert', 'doc_parent_consent', 'doc_team_cert'])
        delete values[k];
    return await save({ ...values, ...saved.fields });
}
catch (err) {
    await Promise.all(saved.created.map(x => promises_1.default.unlink(x)));
    throw err;
} }
r.post('/api/team/women/player', teamSession_service_1.requireSignedTeamSession, memoryUpload, wrap(async (req, res) => { checkCsrf(req); await available(); const s = season(req); await withFiles(req, input => women.saveWomenPlayer(team(req), s, actor(req), input)); success(res, s, 'players'); }));
r.post('/api/team/women/official', teamSession_service_1.requireSignedTeamSession, memoryUpload, wrap(async (req, res) => { checkCsrf(req); await available(); const s = season(req); await withFiles(req, input => women.saveWomenOfficial(team(req), s, actor(req), input)); success(res, s, 'officials'); }));
r.post('/api/team/women/details', teamSession_service_1.requireSignedTeamSession, memoryUpload, wrap(async (req, res) => { checkCsrf(req); await available(); const s = season(req); await women.saveWomenDetails(team(req), s, actor(req), req.body); success(res, s, 'documents'); }));
r.post('/api/team/women/command', teamSession_service_1.requireSignedTeamSession, memoryUpload, wrap(async (req, res) => { checkCsrf(req); await available(); const s = season(req); await women.womenCommand(team(req), s, actor(req), req.body); success(res, s); }));
function adminScope(req) { const u = req.adminUser; if (!u || !['SUPER_ADMIN', 'DOCUMENT_VERIFIER', 'SAT_OFFICER'].includes(u.roleCode))
    throw new women.WomenError(403, 'ไม่มีสิทธิ์ตรวจรับสมัครหญิง'); const isDemo = (req.query.mode || req.body?.mode) === 'demo'; if (isDemo && u.roleCode !== 'SUPER_ADMIN')
    throw new women.WomenError(403, 'ไม่มีสิทธิ์ข้อมูล Demo'); return { role: u.roleCode, province: u.province, isDemo, actor: String(u.id || u.username) }; }
r.get('/admin/women.php', wrap(async (req, res) => {
    const scope = adminScope(req);
    await available();
    const s = season(req), id = String(req.query.teamId || ''), token = csrf(req, res);
    let content = '';
    const hidden = (k, v) => `<input type="hidden" name="${k}" value="${(0, teamPortal_1.escapeTeamPortal)(v)}">`;
    if (!id) {
        const rows = (await db_1.pool.query("SELECT t.id,t.team_name,t.province,e.submitted_at,e.withdrawn_at FROM football_category_enrollment e JOIN football_registered_team t ON t.id=e.team_id WHERE e.season_key=$1 AND e.division_code=$2 AND t.is_test=$3 AND NOT COALESCE(t.is_deleted,false) AND ($4::text IS NULL OR t.province=$4) ORDER BY e.registered_at,e.id", [s, women.WOMEN_DIVISION, scope.isDemo, scope.role === 'SAT_OFFICER' ? scope.province : null])).rows;
        content = `<h1>ตรวจรับสมัครหญิง U18</h1><p>รอบแรกระดับจังหวัด · ${(0, teamPortal_1.escapeTeamPortal)(s)}</p><table class="table"><thead><tr><th>ทีม</th><th>จังหวัด</th><th>สถานะ</th><th>ตรวจ</th></tr></thead><tbody>${rows.map(x => `<tr><td>${(0, teamPortal_1.escapeTeamPortal)(x.team_name)}</td><td>${(0, teamPortal_1.escapeTeamPortal)(x.province)}</td><td>${x.withdrawn_at ? 'ถอนตัว' : x.submitted_at ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</td><td><a href="/admin/women.php?teamId=${(0, teamPortal_1.escapeTeamPortal)(x.id)}&season=${s}${scope.isDemo ? '&mode=demo' : ''}">เปิดตรวจ</a></td></tr>`).join('')}</tbody></table>`;
    }
    else {
        const d = await women.loadWomen(id, s);
        if (d.team.is_test !== scope.isDemo || (scope.role === 'SAT_OFFICER' && (!scope.province || scope.province !== d.team.province)))
            throw new women.WomenError(403, 'ไม่มีสิทธิ์ทีมนอกขอบเขต');
        if (!d.enrollment)
            throw new women.WomenError(404, 'ยังไม่สมัครหญิง');
        const form = (action, body) => `<form action="/api/admin/women/review" method="post" data-women-form>${hidden('csrf', token)}${hidden('season', s)}${hidden('team_id', id)}${hidden('mode', scope.isDemo ? 'demo' : 'real')}${hidden('version', d.enrollment.version)}${hidden('action', action)}${body}<label class="form-label">หมายเหตุ (อย่างน้อย5ตัว)<input class="form-control" name="reason" required minlength="5" maxlength="500"></label><button class="btn btn-primary mt-2">บันทึก ${(0, teamPortal_1.escapeTeamPortal)(action)}</button></form>`;
        content = `<h1>${(0, teamPortal_1.escapeTeamPortal)(d.team.team_name)} · U18 หญิง</h1><p>${(0, teamPortal_1.escapeTeamPortal)(d.team.province)} · นักกีฬาอนุมัติ ${d.players.filter((p) => p.review_status === 'APPROVED').length}/18 คน · ทีม ${(0, teamPortal_1.escapeTeamPortal)(d.team.status)} · ${women.womenEligible(d) ? 'พร้อมเข้าสู่การแข่งขัน' : 'ยังไม่ผ่านเกณฑ์ทั้งหมด'}</p><a href="/admin/women.php?season=${s}">กลับรายการ</a><div class="row g-3"><div class="col-lg-8">${d.players.map((p) => `<section class="card my-3"><div class="card-body"><h2 class="h5">#${(0, teamPortal_1.escapeTeamPortal)(p.roster_jersey)} ${(0, teamPortal_1.escapeTeamPortal)(p.name)} · ${(0, teamPortal_1.escapeTeamPortal)(p.position)}</h2><p>สถานะ ${(0, teamPortal_1.escapeTeamPortal)(p.review_status)} · ${(0, teamPortal_1.escapeTeamPortal)(p.review_remarks)}</p><div class="d-flex gap-3">${[['photo_url', 'รูป'], ['doc_id_card', 'สำเนาบัตร'], ['doc_school_cert', 'รับรองสถานศึกษา'], ['doc_parent_consent', 'ยินยอมผู้ปกครอง']].map(([k, l]) => p[k] ? `<a target="_blank" rel="noopener" href="${(0, teamPortal_1.escapeTeamPortal)(p[k])}">${l}</a>` : '').join('')}</div>${form('review-player', hidden('id', p.id) + '<select class="form-select" name="status">' + ['PENDING', 'APPROVED', 'ACTION_REQUIRED', 'REJECTED'].map(st => `<option ${st === p.review_status ? 'selected' : ''}>${st}</option>`).join('') + '</select>')}</div></section>`).join('')}</div><div class="col-lg-4"><div class="card my-3"><div class="card-body"><h2 class="h5">การรับรองทีม</h2>${d.team.doc_team_cert ? `<a href="${(0, teamPortal_1.escapeTeamPortal)(d.team.doc_team_cert)}" target="_blank" rel="noopener">หนังสือรับรองทีม</a>` : 'ยังไม่มีหนังสือรับรองทีม'}${form('approve-team', '<p>อนุมัติข้อมูลทีมร่วม ไม่ได้อนุมัตินักกีฬาหรือรุ่นชายเพิ่ม</p>')}</div></div><div class="card my-3"><div class="card-body">${form('reopen', '<p>เปิดแก้เฉพาะรุ่นหญิง กลับเป็นยังไม่ส่งรายชื่อ</p>')}${d.enrollment.withdrawn_at ? form('restore', '<p>กู้คืนการสมัครหญิง รักษาสถานะส่ง/ผลตรวจเดิมตาม process รุ่นเดิม</p>') : ''}</div></div></div></div>`;
    }
    if (!id && scope.role === 'SUPER_ADMIN') {
        const exists = await db_1.pool.query("SELECT to_regclass('p2_season') IS NOT NULL AS ready");
        if (exists.rows[0]?.ready) {
            const cfg = await women.categoryConfig(s);
            const options = (await db_1.pool.query('SELECT id,label FROM p2_season ORDER BY label DESC')).rows;
            content += `<section class="card"><div class="card-body"><h2 class="h5">เชื่อมฤดูกาลรับสมัครหญิงกับระบบแข่งขัน</h2><p>ผูก ${(0, teamPortal_1.escapeTeamPortal)(s)} กับฤดูกาลที่สร้างใน platform ก่อนแสดงทีมเข้าการแข่งขัน ห้ามย้ายฤดูกาลที่ผูกแล้วโดยไม่มีการตรวจผลกระทบ</p><form action="/api/admin/women/bind-season" method="post" data-women-form>${hidden('csrf', token)}${hidden('season', s)}<select name="p2_season_id" class="form-select" required><option value="">เลือกฤดูกาลแข่งขัน</option>${options.map((o) => `<option value="${(0, teamPortal_1.escapeTeamPortal)(o.id)}" ${o.id === cfg.p2_season_id ? 'selected' : ''}>${(0, teamPortal_1.escapeTeamPortal)(o.label)}</option>`).join('')}</select><input class="form-control" name="reason" minlength="5" required placeholder="หมายเหตุการเชื่อมฤดูกาล"><button class="btn btn-primary">บันทึกการเชื่อมฤดูกาล</button></form></div></section>`;
        }
    }
    res.send((0, adminLayout_1.renderAdminLayout)('ตรวจรับสมัครหญิง', content + script, 'teams', (0, helpers_1.getBaseUrl)(req), req.adminUser));
}));
r.post('/api/admin/women/bind-season', memoryUpload, wrap(async (req, res) => { checkCsrf(req); const scope = adminScope(req); await available(); const s = season(req); await women.bindWomenSeason(s, scope, req.body.p2_season_id, req.body.reason); res.json({ success: true, redirectUrl: `/admin/women.php?season=${s}` }); }));
r.post('/api/admin/women/review', memoryUpload, wrap(async (req, res) => { checkCsrf(req); const scope = adminScope(req); await available(); const s = season(req), id = String(req.body.team_id || ''); await women.reviewWomen(id, s, scope, req.body); res.json({ success: true, redirectUrl: `${req.originalUrl.startsWith('/sat-admin/') ? '/sat-admin' : '/admin'}/women.php?teamId=${encodeURIComponent(id)}&season=${s}${scope.isDemo ? '&mode=demo' : ''}` }); }));
r.get('/team/women-export', teamSession_service_1.requireSignedTeamSession, wrap(async (req, res) => {
    await available();
    const d = await women.loadWomen(team(req), season(req));
    if (!d.enrollment)
        throw new women.WomenError(404, 'ยังไม่สมัครรุ่นหญิง');
    const format = req.query.format;
    if (!['xlsx', 'pdf'].includes(String(format)))
        throw new women.WomenError(400, 'รูปแบบเอกสารไม่ถูกต้อง');
    res.setHeader('Cache-Control', 'no-store');
    const title = `${d.team.team_name} · U18 หญิง · ${d.config.season_key}`;
    if (format === 'xlsx') {
        const book = new exceljs_1.default.Workbook(), sheet = book.addWorksheet('U18 หญิง');
        sheet.addRow([title]);
        sheet.addRow(['เบอร์', 'ชื่อ', 'ตำแหน่ง', 'สถานะเอกสาร']);
        for (const p of d.players)
            sheet.addRow([p.roster_jersey, p.name, p.position, p.review_status]);
        sheet.columns.forEach(c => c.width = 25);
        res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="women-u18.xlsx"');
        await book.xlsx.write(res);
        res.end();
    }
    else {
        const font = path_1.default.resolve(__dirname, '../../../phase2/public/assets/fonts/Prompt-Regular-2a736dbb.ttf');
        await promises_1.default.access(font);
        res.type('application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="women-u18.pdf"');
        const doc = new pdfkit_1.default({ size: 'A4', margin: 40 });
        doc.pipe(res);
        doc.font(font).fontSize(15).text(title);
        doc.fontSize(11);
        for (const p of d.players)
            doc.text(`${p.roster_jersey}   ${p.name}   ${p.position}   ${p.review_status}`);
        doc.end();
    }
}));
// Scoped multipart errors must be understandable to the real AJAX forms.
r.use((err, req, res, next) => { if (!req.path.includes('women'))
    return next(err); if (res.headersSent)
    return next(err); return res.status(400).json({ success: false, error: err?.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์ต้องไม่เกิน 4 MB' : 'รูปแบบหรือจำนวนไฟล์ไม่ถูกต้อง' }); });
