"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuditFieldChanges = getAuditFieldChanges;
exports.writeAuditLog = writeAuditLog;
const adminAuth_1 = require("../adminAuth");
const db_1 = require("../db");
const helpers_1 = require("../utils/helpers");
const teamSession_service_1 = require("./teamSession.service");
const auditFieldAllowlist = {
    TEAM: ['teamName', 'province', 'district', 'gender', 'categories', 'status', 'isDeleted'],
    PLAYER: ['category', 'jerseyNo', 'position', 'docStatus'],
    OFFICIAL: ['position', 'categories', 'hasLicense', 'licenseType', 'docStatus']
};
const auditFieldLabels = {
    teamName: 'ชื่อทีม', province: 'จังหวัด', district: 'อำเภอ', gender: 'ประเภททีม',
    categories: 'รุ่นแข่งขัน', status: 'สถานะทีม', isDeleted: 'สถานะการลบ',
    category: 'รุ่นแข่งขัน', jerseyNo: 'หมายเลขเสื้อ', position: 'ตำแหน่ง',
    docStatus: 'สถานะเอกสาร', hasLicense: 'มีใบอนุญาต', licenseType: 'ประเภทใบอนุญาต',
    managerName: 'ชื่อผู้จัดการทีม', email: 'อีเมล', phone: 'เบอร์โทรศัพท์', lineId: 'LINE ID',
    schoolCode: 'รหัสสถานศึกษา', address: 'ที่อยู่ติดต่อ', name: 'ชื่อ', idCard: 'เลขบัตรประชาชน',
    birthDate: 'วันเกิด', domicile: 'ภูมิลำเนา', height: 'ส่วนสูง', weight: 'น้ำหนัก',
    school: 'สถานศึกษา', grade: 'ชั้นเรียน', guardianName: 'ชื่อผู้ปกครอง',
    guardianRelation: 'ความสัมพันธ์ผู้ปกครอง', fivbId: 'รหัสนักกีฬา', licenseSerial: 'เลขใบอนุญาต',
    attachment: 'ไฟล์แนบ'
};
const auditSensitiveFields = {
    TEAM: ['managerName', 'email', 'phone', 'lineId', 'schoolCode', 'address', 'attachment'],
    PLAYER: ['name', 'idCard', 'birthDate', 'domicile', 'height', 'weight', 'school', 'grade', 'guardianName', 'guardianRelation', 'phone', 'fivbId', 'attachment'],
    OFFICIAL: ['name', 'idCard', 'phone', 'email', 'licenseSerial', 'attachment']
};
function normalizedAuditValue(value) {
    if (value === undefined || value === null || value === '')
        return null;
    if (Array.isArray(value))
        return value.map(item => String(item).trim()).filter(Boolean).sort();
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'number')
        return String(value);
    const text = String(value).trim();
    return text.includes(',') ? text.split(',').map(item => item.trim()).filter(Boolean).sort() : text;
}
/** Builds privacy-limited old/new snapshots and excludes unchanged or non-allowlisted fields. */
function getAuditFieldChanges(entityType, before, after) {
    const oldState = {};
    const newState = {};
    const changedFields = [];
    for (const field of auditFieldAllowlist[entityType]) {
        const oldValue = normalizedAuditValue(before[field]);
        const newValue = normalizedAuditValue(after[field]);
        if (JSON.stringify(oldValue) === JSON.stringify(newValue))
            continue;
        oldState[field] = oldValue;
        newState[field] = newValue;
        changedFields.push(auditFieldLabels[field] || field);
    }
    for (const field of auditSensitiveFields[entityType]) {
        if (JSON.stringify(normalizedAuditValue(before[field])) !== JSON.stringify(normalizedAuditValue(after[field]))) {
            changedFields.push(auditFieldLabels[field] || field);
        }
    }
    return { oldState, newState, changedFields };
}
async function writeAuditLog(req, entry, executor = db_1.pool) {
    let adminUser = req.adminUser;
    const supportReporter = req.supportReporter;
    const cookies = (0, helpers_1.parseCookies)(req);
    if (!adminUser && cookies.admin_session === 'true' && cookies.admin_user) {
        try {
            adminUser = await (0, adminAuth_1.getAdminUserByUsername)(cookies.admin_user);
            if (adminUser)
                req.adminUser = adminUser;
        }
        catch {
            // An unavailable actor lookup must not replace or expose the mutation's own error.
        }
    }
    const signedTeamSession = (0, teamSession_service_1.verifyTeamSessionCookies)(cookies);
    const actorOverride = req.auditActor;
    const supportRole = String(supportReporter?.role || '');
    const authenticatedAdmin = adminUser?.id || adminUser?.username ? adminUser :
        supportRole && supportRole !== 'TEAM_MANAGER' ? supportReporter : null;
    const actorIdentitySource = actorOverride ? 'SERVER_CREATED_IDENTITY'
        : authenticatedAdmin ? 'ADMIN_SESSION_LOOKUP'
            : signedTeamSession ? 'SIGNED_TEAM_SESSION' : 'NO_VERIFIED_PRINCIPAL';
    const actorType = actorOverride?.actorType || (authenticatedAdmin ? 'ADMIN' : signedTeamSession ? 'TEAM' : 'ANONYMOUS');
    const actorId = actorOverride?.actorId || (authenticatedAdmin
        ? String(authenticatedAdmin.id || authenticatedAdmin.userId || authenticatedAdmin.username || '') || null
        : signedTeamSession ? signedTeamSession.teamUser : null);
    const actorName = actorOverride?.actorName || (authenticatedAdmin
        ? String(authenticatedAdmin.fullname || authenticatedAdmin.name || authenticatedAdmin.username || authenticatedAdmin.id || '') || null
        : signedTeamSession ? signedTeamSession.teamUser : null);
    const actorRole = actorOverride?.actorRole || (authenticatedAdmin
        ? String(authenticatedAdmin.roleCode || authenticatedAdmin.role || 'ADMIN')
        : signedTeamSession ? 'TEAM_MANAGER' : 'ANONYMOUS');
    const actorProvince = actorOverride?.actorProvince || (authenticatedAdmin?.province ? String(authenticatedAdmin.province) : null);
    const teamId = actorOverride?.teamId || signedTeamSession?.teamId || null;
    const requestId = String(req.auditRequestId || '');
    const matchedRoute = req.route?.path;
    const routeFromHandler = typeof matchedRoute === 'string'
        ? `${req.baseUrl || ''}${matchedRoute}`
        : Array.isArray(matchedRoute) ? `${req.baseUrl || ''}${matchedRoute.join('|')}` : '';
    const auditRoute = String(req.auditRoute || '');
    const metadata = {
        ...(entry.metadata || {}),
        ...(requestId ? {
            requestId,
            actorIdentitySource,
            requestMethod: String(req.method || ''),
            requestRoute: auditRoute && auditRoute !== '<unmatched-route>' ? auditRoute : routeFromHandler
        } : {})
    };
    await executor.query(`INSERT INTO football_audit_log (
      event_type, actor_type, actor_id, actor_name, actor_role, actor_province,
      team_id, entity_type, entity_id, old_state, new_state, metadata,
      ip_address, user_agent, request_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15)`, [
        entry.eventType,
        actorType,
        actorId,
        actorName,
        actorRole,
        actorProvince,
        entry.teamId || teamId,
        entry.entityType,
        entry.entityId,
        JSON.stringify(entry.oldState || {}),
        JSON.stringify(entry.newState || {}),
        JSON.stringify(metadata),
        req.ip || null,
        req.get('user-agent') || null,
        requestId || null
    ]);
    req.auditEventCount = Number(req.auditEventCount || 0) + 1;
}
