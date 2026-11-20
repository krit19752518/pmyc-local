"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminTeamEditRouter = void 0;
const express_1 = require("express");
const crypto_1 = require("crypto");
const db_1 = require("../../db");
const adminLayout_1 = require("../../adminLayout");
const helpers_1 = require("../../utils/helpers");
const adminSession_service_1 = require("../../services/adminSession.service");
const dbTransaction_service_1 = require("../../services/dbTransaction.service");
const auditLog_service_1 = require("../../services/auditLog.service");
exports.adminTeamEditRouter = (0, express_1.Router)();
// Explicit registration fields only. Record identity, workflow status and document
// paths remain owned by their existing workflows; passwords are never selected.
const fields = [
    ['team_name', 'ชื่อทีม / โรงเรียน / อะคาเดมี่', 150, true],
    ['school_code', 'รหัสสถานศึกษา', 50],
    ['province', 'จังหวัดที่ส่งแข่งขัน', 100, true],
    ['district', 'เขต / อำเภอที่ส่งแข่งขัน', 100],
    ['bkk_zone', 'โซนพื้นที่กรุงเทพมหานคร', 100],
    ['gender', 'ประเภททีม', 20, true],
    ['categories', 'รุ่นที่ลงสมัคร', 100],
    ['manager_name', 'ชื่อ-นามสกุลผู้จัดการทีม', 100, true],
    ['phone', 'เบอร์โทรศัพท์ติดต่อ', 50, true],
    ['email', 'อีเมล', 100],
    ['line_id', 'LINE ID', 100],
    ['house_no', 'เลขที่ / บ้านเลขที่', 50],
    ['road', 'ถนน', 100],
    ['subdistrict', 'ตำบล / แขวง', 100],
    ['contact_subdistrict', 'ตำบล / แขวง (ที่อยู่ติดต่อ)', 100],
    ['contact_district', 'อำเภอ / เขต (ที่อยู่ติดต่อ)', 100],
    ['contact_province', 'จังหวัด (ที่อยู่ติดต่อ)', 100],
    ['username', 'ชื่อผู้ใช้เข้าสู่ระบบ', 50]
];
const columns = fields.map(field => field[0]);
const projection = `id, ${columns.join(', ')}, submitted_categories, cancelled_categories`;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const fingerprint = (row) => (0, crypto_1.createHash)('sha256')
    .update(JSON.stringify(columns.map(column => String(row[column] ?? '')))).digest('hex');
class EditError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
function superAdminOnly(req, res, next) {
    if (req.adminUser?.roleCode !== 'SUPER_ADMIN') {
        res.status(403).send('เฉพาะผู้ดูแลระบบสูงสุดเท่านั้นที่แก้ไขข้อมูลและรหัสผ่านทีมได้');
        return;
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
}
function tokenSignature(payload) {
    const secret = process.env.ADMIN_SESSION_SECRET || process.env.DATABASE_URL
        || (process.env.NODE_ENV !== 'production' ? 'football-local-team-editor' : '');
    if (!secret)
        throw new Error('Admin signing key unavailable');
    return (0, crypto_1.createHmac)('sha256', secret).update(`admin-team-edit:${payload}`).digest('base64url');
}
function formToken(req, id, version) {
    const user = req.adminUser;
    const payload = Buffer.from(JSON.stringify([
        user.id, user.username, id, version, Date.now(), (0, crypto_1.randomBytes)(24).toString('hex')
    ])).toString('base64url');
    return `${payload}.${tokenSignature(payload)}`;
}
function verifyFormToken(req, id, version) {
    try {
        if (typeof req.body.csrf_token !== 'string' || req.body.csrf_token.length > 2048)
            return false;
        const [payload, signature, ...extra] = req.body.csrf_token.split('.');
        if (!payload || !signature || extra.length)
            return false;
        const expected = Buffer.from(tokenSignature(payload));
        const actual = Buffer.from(signature);
        if (actual.length !== expected.length || !(0, crypto_1.timingSafeEqual)(actual, expected))
            return false;
        const [userId, username, teamId, revision, issued] = JSON.parse(Buffer.from(payload, 'base64url').toString());
        const user = req.adminUser;
        return userId === user.id && username === user.username && teamId === id && revision === version
            && Number.isFinite(issued) && issued <= Date.now() && Date.now() - issued < 30 * 60 * 1000;
    }
    catch {
        return false;
    }
}
function input(field, row) {
    const [name, label, maxLength] = field;
    const required = field.length > 3 && field[3] ? ' required' : '';
    const value = escapeHtml(row[name]);
    let control;
    if (name === 'gender') {
        control = `<select class="form-select" id="team_${name}" name="${name}" required>
      <option value="boy"${row[name] === 'boy' ? ' selected' : ''}>ทีมชาย</option>
      <option value="girl"${row[name] === 'girl' ? ' selected' : ''}>ทีมหญิง</option></select>`;
    }
    else {
        control = `<input class="form-control" id="team_${name}" name="${name}" type="${name === 'email' ? 'email' : 'text'}" value="${value}" maxlength="${maxLength}"${required}${name === 'username' ? ' autocomplete="off"' : ''}>`;
    }
    const hint = name === 'categories' ? 'ระบุ U14,U16,U18 คั่นด้วยจุลภาค หรือเว้นว่างเมื่อยังไม่สมัครรุ่น'
        : name === 'username' ? 'เมื่อไม่ระบุชื่อผู้ใช้ สามารถใช้อีเมลเข้าสู่ระบบได้' : '';
    return `<div class="col-md-6"><label class="form-label fw-semibold" for="team_${name}">${label}${required ? ' <span class="text-danger">*</span>' : ''}</label>${control}${hint ? `<div class="form-text">${hint}</div>` : ''}</div>`;
}
exports.adminTeamEditRouter.get('/admin/team-edit.php', adminSession_service_1.checkAdminSession, superAdminOnly, async (req, res) => {
    const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    if (!id || id.length > 50)
        return res.status(400).send('กรุณาระบุทีมที่ต้องการแก้ไข');
    try {
        const result = await db_1.pool.query(`SELECT ${projection} FROM football_registered_team
      WHERE id = $1 AND COALESCE(is_test, FALSE) = FALSE AND COALESCE(is_deleted, FALSE) = FALSE`, [id]);
        const team = result.rows[0];
        if (!team)
            return res.status(404).send('ไม่พบทีมที่ต้องการแก้ไข');
        const base = (0, helpers_1.getBaseUrl)(req);
        const version = fingerprint(team);
        const body = `<div class="card border-0 shadow-sm rounded-4 p-4">
      <div class="d-flex flex-wrap justify-content-between gap-2 mb-4"><h3 class="text-navy fw-bold mb-0">แก้ไขข้อมูลทีม</h3>
      <a class="btn btn-outline-secondary" href="${escapeHtml(base)}/admin/teams.php">กลับรายการทีมลงทะเบียน</a></div>
      <p class="text-muted">${escapeHtml(team.team_name)} · รหัสทีม ${escapeHtml(team.id)}</p>
      ${req.query.saved === '1' ? '<div class="alert alert-success" role="status">บันทึกข้อมูลทีมเรียบร้อยแล้ว</div>' : ''}
      <div id="teamEditError" class="alert alert-danger d-none" role="alert"></div>
      <form id="teamEditForm" action="${escapeHtml(base)}/api/admin/teams/edit" method="post">
        <input type="hidden" name="id" value="${escapeHtml(id)}">
        <input type="hidden" name="version" value="${version}">
        <input type="hidden" name="csrf_token" value="${formToken(req, id, version)}">
        <h5 class="border-bottom pb-2 mb-3">ข้อมูลทีมและการติดต่อ</h5>
        <div class="row g-3">${fields.map(field => input(field, team)).join('')}</div>
        <h5 class="border-bottom pb-2 mt-4 mb-3">ตั้งรหัสผ่านใหม่</h5>
        <p class="text-muted small">เว้นว่างทั้งสองช่องเพื่อใช้รหัสผ่านเดิม หากเปลี่ยนให้ระบุอย่างน้อย 8 ตัวอักษร</p>
        <div class="row g-3">
          <div class="col-md-6"><label class="form-label" for="newPassword">รหัสผ่านใหม่</label>
            <input class="form-control" id="newPassword" name="new_password" type="password" autocomplete="new-password" minlength="8" maxlength="100"></div>
          <div class="col-md-6"><label class="form-label" for="confirmPassword">ยืนยันรหัสผ่านใหม่</label>
            <input class="form-control" id="confirmPassword" name="password_confirm" type="password" autocomplete="new-password" minlength="8" maxlength="100"></div>
        </div>
        <div class="d-flex gap-2 mt-4"><button class="btn btn-primary fw-bold" type="submit" id="saveTeamButton">บันทึกข้อมูลทีม</button>
          <a class="btn btn-outline-secondary" href="${escapeHtml(base)}/admin/teams.php">ยกเลิก</a></div>
      </form></div>
      <script>
      (function () {
        const form = document.getElementById('teamEditForm');
        const error = document.getElementById('teamEditError');
        const button = document.getElementById('saveTeamButton');
        let saving = false;
        form.addEventListener('submit', async function (event) {
          event.preventDefault();
          if (saving || !form.reportValidity()) return;
          const payload = Object.fromEntries(new FormData(form));
          error.classList.add('d-none');
          if (payload.new_password !== payload.password_confirm) {
            error.textContent = 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน';
            error.classList.remove('d-none'); return;
          }
          saving = true; button.disabled = true;
          try {
            const response = await fetch(form.action, {method: 'POST', headers: {'Content-Type': 'application/json', 'Accept': 'application/json'}, body: JSON.stringify(payload)});
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'บันทึกข้อมูลไม่สำเร็จ');
            window.location.assign(data.redirectUrl);
          } catch (failure) {
            error.textContent = failure.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาตรวจสอบข้อมูลก่อนลองอีกครั้ง';
            error.classList.remove('d-none'); saving = false; button.disabled = false;
          }
        });
      })();
      </script>`;
        return res.send((0, adminLayout_1.renderAdminLayout)('แก้ไขข้อมูลทีม', body, 'teams', base, req.adminUser));
    }
    catch {
        return res.status(500).send('ไม่สามารถโหลดข้อมูลทีมได้ กรุณาลองใหม่');
    }
});
function categories(value) {
    return String(value ?? '').split(',').map(item => item.trim().toUpperCase()).filter(Boolean);
}
exports.adminTeamEditRouter.post('/api/admin/teams/edit', adminSession_service_1.checkAdminSession, superAdminOnly, async (req, res) => {
    try {
        const id = typeof req.body.id === 'string' ? req.body.id.trim() : '';
        const version = typeof req.body.version === 'string' ? req.body.version : '';
        if (!id || id.length > 50)
            throw new EditError(400, 'กรุณาระบุทีมที่ต้องการแก้ไข');
        if (!verifyFormToken(req, id, version))
            throw new EditError(403, 'แบบฟอร์มหมดอายุหรือไม่ถูกต้อง กรุณาเปิดหน้าแก้ไขใหม่');
        const values = {};
        for (const field of fields) {
            const [name, label, length] = field;
            if (typeof req.body[name] !== 'string')
                throw new EditError(400, `กรุณาระบุข้อมูล ${label}`);
            values[name] = req.body[name].trim();
            if (values[name].length > length || /[\u0000-\u001f\u007f]/.test(values[name]))
                throw new EditError(400, `ข้อมูล ${label} ไม่ถูกต้อง`);
            if (field.length > 3 && field[3] && !values[name])
                throw new EditError(400, `กรุณากรอก ${label}`);
        }
        if (!['boy', 'girl'].includes(values.gender))
            throw new EditError(400, 'ประเภททีมไม่ถูกต้อง');
        const selectedCategories = Array.from(new Set(categories(values.categories)));
        if (selectedCategories.some(category => !['U14', 'U16', 'U18'].includes(category)))
            throw new EditError(400, 'รุ่นแข่งขันต้องเป็น U14, U16 หรือ U18');
        values.categories = ['U14', 'U16', 'U18'].filter(category => selectedCategories.includes(category)).join(',');
        if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
            throw new EditError(400, 'รูปแบบอีเมลไม่ถูกต้อง');
        if (!values.username && !values.email)
            throw new EditError(400, 'กรุณาระบุชื่อผู้ใช้หรืออีเมลสำหรับเข้าสู่ระบบ');
        const password = req.body.new_password;
        const confirmation = req.body.password_confirm;
        if (typeof password !== 'string' || typeof confirmation !== 'string')
            throw new EditError(400, 'ข้อมูลรหัสผ่านไม่ถูกต้อง');
        if (password !== confirmation)
            throw new EditError(400, 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน');
        if (password && (password.trim() !== password || password.length < 8 || password.length > 100 || /[\u0000-\u001f\u007f]/.test(password))) {
            throw new EditError(400, 'รหัสผ่านใหม่ต้องมี 8–100 ตัวอักษร และไม่มีช่องว่างหัวท้าย');
        }
        await (0, dbTransaction_service_1.withDbTransaction)(async (executor) => {
            const result = await executor.query(`SELECT ${projection} FROM football_registered_team
        WHERE id = $1 AND COALESCE(is_test, FALSE) = FALSE AND COALESCE(is_deleted, FALSE) = FALSE FOR UPDATE`, [id]);
            const before = result.rows[0];
            if (!before)
                throw new EditError(404, 'ไม่พบทีมที่ต้องการแก้ไข');
            if (fingerprint(before) !== version)
                throw new EditError(409, 'ข้อมูลทีมถูกเปลี่ยนแล้ว กรุณาเปิดหน้าใหม่ก่อนแก้ไข');
            const removed = categories(before.categories).filter(category => !selectedCategories.includes(category));
            if (removed.length) {
                const protectedCategories = categories(`${before.submitted_categories || ''},${before.cancelled_categories || ''}`);
                const members = await executor.query(`SELECT id FROM football_player WHERE team_id = $1 AND category = ANY($2::text[])
          UNION ALL SELECT id FROM football_official WHERE team_id = $1 AND string_to_array(REPLACE(UPPER(COALESCE(categories, '')), ' ', ''), ',') && $2::text[] LIMIT 1`, [id, removed]);
                if (protectedCategories.some(category => removed.includes(category)) || members.rows.length) {
                    throw new EditError(409, 'ไม่สามารถนำรุ่นที่มีรายชื่อหรือประวัติการส่ง/ยกเลิกออกได้ กรุณาจัดการผ่านขั้นตอนของรุ่นแข่งขัน');
                }
            }
            // Serialize this editor's login-identity changes; cross-check email against
            // usernames too, because login accepts either identifier.
            const identifiers = Array.from(new Set([values.username.toLowerCase(), values.email.toLowerCase()].filter(Boolean))).sort();
            for (const identifier of identifiers)
                await executor.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`team-login:${identifier}`]);
            const duplicate = await executor.query(`SELECT id FROM football_registered_team WHERE id <> $1
        AND (LOWER(BTRIM(COALESCE(username, ''))) = ANY($2::text[]) OR LOWER(BTRIM(COALESCE(email, ''))) = ANY($2::text[])) LIMIT 1`, [id, identifiers]);
            if (duplicate.rows.length)
                throw new EditError(409, 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้โดยทีมอื่นแล้ว');
            if (values.school_code && values.school_code !== String(before.school_code || '').trim()) {
                await executor.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`team-school:${values.school_code}`]);
                const school = await executor.query(`SELECT id FROM football_registered_team WHERE id <> $1
          AND COALESCE(is_test, FALSE) = FALSE AND BTRIM(COALESCE(school_code, '')) = $2 LIMIT 1`, [id, values.school_code]);
                if (school.rows.length)
                    throw new EditError(409, 'รหัสสถานศึกษานี้ถูกใช้โดยทีมอื่นแล้ว');
            }
            const parameters = columns.map(column => values[column] || (column === 'categories' ? '' : null));
            const assignments = columns.map((column, index) => `${column} = $${index + 1}`);
            // Blank password intentionally produces no password assignment at all.
            if (password) {
                parameters.push(password);
                assignments.push(`password = $${parameters.length}`);
            }
            parameters.push(id);
            await executor.query(`UPDATE football_registered_team SET ${assignments.join(', ')} WHERE id = $${parameters.length}`, parameters);
            const auditState = (row) => ({
                teamName: row.team_name, province: row.province, district: row.district, gender: row.gender,
                categories: row.categories, managerName: row.manager_name, email: row.email, phone: row.phone,
                lineId: row.line_id, schoolCode: row.school_code,
                address: [row.house_no, row.road, row.subdistrict, row.contact_subdistrict, row.contact_district, row.contact_province].join('|')
            });
            const changes = (0, auditLog_service_1.getAuditFieldChanges)('TEAM', auditState(before), auditState(values));
            if (String(before.username || '') !== values.username)
                changes.changedFields.push('ชื่อผู้ใช้');
            if (String(before.bkk_zone || '') !== values.bkk_zone)
                changes.changedFields.push('โซนพื้นที่กรุงเทพมหานคร');
            if (password)
                changes.changedFields.push('ตั้งรหัสผ่านใหม่');
            if (changes.changedFields.length)
                await (0, auditLog_service_1.writeAuditLog)(req, {
                    eventType: 'TEAM_UPDATED', entityType: 'TEAM', entityId: id, teamId: id,
                    oldState: changes.oldState, newState: changes.newState,
                    metadata: { changedFields: changes.changedFields.join(', '), passwordChanged: Boolean(password) }
                }, executor);
        });
        return res.json({ success: true, redirectUrl: `${(0, helpers_1.getBaseUrl)(req)}/admin/team-edit.php?id=${encodeURIComponent(id)}&saved=1` });
    }
    catch (error) {
        const status = error instanceof EditError ? error.status : 500;
        // Do not log database errors or request bodies: they may contain passwords.
        return res.status(status).json({ success: false, error: error instanceof EditError ? error.message : 'ไม่สามารถยืนยันการบันทึกได้ กรุณาโหลดหน้าใหม่เพื่อตรวจสอบก่อนลองอีกครั้ง' });
    }
});
