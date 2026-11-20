"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.idCardValid = exports.WomenError = exports.WOMEN_SEASON = exports.WOMEN_DIVISION = void 0;
exports.validSeason = validSeason;
exports.calendarDate = calendarDate;
exports.registrationOpen = registrationOpen;
exports.womenReady = womenReady;
exports.categoryConfig = categoryConfig;
exports.loadWomen = loadWomen;
exports.readiness = readiness;
exports.womenEligible = womenEligible;
exports.enrollWomen = enrollWomen;
exports.saveWomenPlayer = saveWomenPlayer;
exports.saveWomenOfficial = saveWomenOfficial;
exports.womenCommand = womenCommand;
exports.saveWomenDetails = saveWomenDetails;
exports.bindWomenSeason = bindWomenSeason;
exports.reviewWomen = reviewWomen;
exports.registerWomenTeam = registerWomenTeam;
const crypto_1 = require("crypto");
const db_1 = require("../db");
const registrationStatistics_registry_1 = require("./registrationStatistics.registry");
const dbTransaction_service_1 = require("./dbTransaction.service");
const teamArea_1 = require("../utils/teamArea");
exports.WOMEN_DIVISION = 'U18_GIRL';
exports.WOMEN_SEASON = '2026-27';
class WomenError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
exports.WomenError = WomenError;
const fail = (message, status = 400) => { throw new WomenError(status, message); };
const text = (v, max = 200) => { if (typeof v !== 'string' || v.trim().length > max)
    return ''; return v.trim(); };
function validSeason(v) { return typeof v === 'string' && /^\d{4}-\d{2}$/.test(v) ? v : fail('กรุณาเลือกฤดูกาลที่ถูกต้อง'); }
function calendarDate(v) { const s = text(v, 10); const d = new Date(s + 'T00:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : fail('วันเกิดไม่ถูกต้อง'); }
const idCardValid = (v) => /^\d{13}$/.test(text(v, 13));
exports.idCardValid = idCardValid;
function registrationOpen(config, environment = process.env.NODE_ENV, now = new Date()) {
    return (environment === 'development' && config.dev_open === true) || (now >= new Date(config.opens_at) && (!config.closes_at || now < new Date(config.closes_at)));
}
async function womenReady(db = db_1.pool) { const r = await db.query("SELECT to_regclass('football_category_enrollment') IS NOT NULL AS ready"); return r.rows[0]?.ready === true; }
async function categoryConfig(season, db = db_1.pool) {
    const r = await db.query('SELECT *,birth_from::text AS birth_from,birth_until::text AS birth_until FROM football_registration_category WHERE season_key=$1 AND division_code=$2', [validSeason(season), exports.WOMEN_DIVISION]);
    return r.rows[0] || fail('ยังไม่เปิดฤดูกาลนี้', 404);
}
async function loadWomen(teamId, season, db = db_1.pool, lock = false) {
    const t = await db.query('SELECT id,team_name,status,province,district,is_test,doc_team_cert FROM football_registered_team WHERE id=$1 AND NOT COALESCE(is_deleted,false)' + (lock ? ' FOR UPDATE' : ''), [teamId]);
    if (!t.rows[0])
        fail('ไม่พบทีม', 404);
    const extra = await db.query('SELECT office_phone,village,postal_code FROM football_registration_team_details WHERE team_id=$1', [teamId]);
    const c = await categoryConfig(season, db);
    const r = await db.query('SELECT * FROM football_category_enrollment WHERE team_id=$1 AND season_key=$2 AND division_code=$3' + (lock ? ' FOR UPDATE' : ''), [teamId, season, exports.WOMEN_DIVISION]);
    const enrollment = r.rows[0] || null;
    if (!enrollment)
        return { team: t.rows[0], details: extra.rows[0] || {}, config: c, enrollment: null, players: [], officials: [] };
    const p = await db.query('SELECT p.*,m.jersey_no AS roster_jersey,m.review_status,m.remarks AS review_remarks FROM football_category_player m JOIN football_player p ON p.id=m.player_id WHERE m.enrollment_id=$1 AND m.active ORDER BY m.jersey_no,p.id', [enrollment.id]);
    const o = await db.query('SELECT o.*,m.role AS assigned_role FROM football_category_official m JOIN football_official o ON o.id=m.official_id WHERE m.enrollment_id=$1 AND m.active ORDER BY o.id', [enrollment.id]);
    return { team: t.rows[0], details: extra.rows[0] || {}, config: c, enrollment, players: p.rows, officials: o.rows };
}
function readiness(data) {
    const p = data.players, o = data.officials;
    return [
        { key: 'min', label: 'นักกีฬาอย่างน้อย 18 คน', ok: p.length >= 18 }, { key: 'max', label: 'นักกีฬาไม่เกิน 30 คน', ok: p.length <= 30 },
        { key: 'officials', label: 'เจ้าหน้าที่ 1–8 คน', ok: o.length >= 1 && o.length <= 8 },
        { key: 'id', label: 'นักกีฬามีเลขประจำตัวประชาชนครบ', ok: p.length > 0 && p.every((x) => (0, exports.idCardValid)(x.id_card) && Boolean(x.doc_id_card) && Boolean(x.photo_url)) },
        { key: 'manager', label: 'ผู้จัดการทีมมีเลขบัตรและสำเนา', ok: o.some((x) => x.assigned_role === 'ผู้จัดการทีม' && (0, exports.idCardValid)(x.id_card) && Boolean(x.doc_id_card)) },
        { key: 'jersey', label: 'เบอร์เสื้อไม่ซ้ำภายในรุ่น', ok: p.length > 0 && new Set(p.map((x) => Number(x.roster_jersey))).size === p.length },
        { key: 'gk', label: 'ผู้รักษาประตูอย่างน้อย 3 คน', ok: p.filter((x) => x.position === 'GK' || String(x.position).includes('(GK)')).length >= 3 }
    ];
}
function womenEligible(data) { return Boolean(data.enrollment?.submitted_at && !data.enrollment.withdrawn_at && data.team.status === 'APPROVED' && data.players.filter((x) => x.review_status === 'APPROVED').length >= 18); }
const actorId = (v) => text(v, 150) || fail('ไม่มีผู้ดำเนินการ', 401);
async function audit(db, id, actor, action, state = {}) { await db.query('INSERT INTO football_category_audit(id,enrollment_id,actor,action,state) VALUES($1,$2,$3,$4,$5::jsonb)', [(0, crypto_1.randomUUID)(), id, actorId(actor), action, JSON.stringify(state)]); }
function active(d, version, editable = false) {
    if (!d.enrollment)
        fail('กรุณาสมัครรุ่นหญิงก่อน', 409);
    if (d.enrollment.withdrawn_at)
        fail('ถอนตัวแล้ว ติดต่อเจ้าหน้าที่เพื่อกู้คืน', 409);
    if (!Number.isInteger(Number(version)) || Number(version) !== d.enrollment.version)
        fail('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่', 409);
    if (editable && d.enrollment.submitted_at)
        fail('ส่งรายชื่อแล้ว ติดต่อ กกท.จังหวัด/แอดมินเพื่อเปิดแก้ไข', 409);
}
async function changed(db, d, actor, action, state = {}) { await db.query('UPDATE football_category_enrollment SET version=version+1 WHERE id=$1', [d.enrollment.id]); await audit(db, d.enrollment.id, actor, action, state); }
async function enrollWomen(teamId, season, actor) {
    return (0, dbTransaction_service_1.withDbTransaction)(async (db) => {
        const d = await loadWomen(teamId, season, db, true);
        if (!registrationOpen(d.config))
            fail('ยังไม่เปิดรับสมัครหญิงในฤดูกาลนี้', 403);
        if (d.enrollment) {
            if (d.enrollment.withdrawn_at)
                fail('สมัครแล้วและถอนตัว ต้องให้เจ้าหน้าที่กู้คืน', 409);
            return d.enrollment.id;
        }
        const id = (0, crypto_1.randomUUID)();
        await db.query('INSERT INTO football_category_enrollment(id,team_id,season_key,division_code) VALUES($1,$2,$3,$4)', [id, teamId, season, exports.WOMEN_DIVISION]);
        await audit(db, id, actor, 'ENROLLED');
        return id;
    });
}
async function saveWomenPlayer(teamId, season, actor, input) {
    return (0, dbTransaction_service_1.withDbTransaction)(async (db) => {
        const d = await loadWomen(teamId, season, db, true);
        active(d, input.version, true);
        const id = text(input.id, 50);
        let old = id ? d.players.find((p) => p.id === id) : null;
        if (id && !old)
            fail('ไม่พบนักกีฬาในรุ่นนี้', 404);
        if (!old && d.players.length >= 30)
            fail('นักกีฬาครบ 30 คนแล้ว', 409);
        const first = text(input.first_name, 100), last = text(input.last_name, 100), prefix = text(input.prefix, 50), identity = text(input.id_card, 13), birth = calendarDate(input.birth_date), jersey = Number(input.jersey_no), position = text(input.position, 50);
        if (!first || !last || !['เด็กหญิง', 'นางสาว', 'นาง'].includes(prefix) || !(0, exports.idCardValid)(identity) || !Number.isInteger(jersey) || jersey < 1 || jersey > 99 || !['GK', 'DF', 'MF', 'FW'].includes(position))
            fail('ตรวจชื่อ เลขประจำตัว เบอร์เสื้อ และตำแหน่ง');
        const from = String(d.config.birth_from instanceof Date ? d.config.birth_from.toISOString().slice(0, 10) : d.config.birth_from), until = String(d.config.birth_until instanceof Date ? d.config.birth_until.toISOString().slice(0, 10) : d.config.birth_until);
        if (birth < from || birth > until || birth > new Date().toISOString().slice(0, 10))
            fail('วันเกิดไม่อยู่ในเกณฑ์ U18 ของฤดูกาลนี้');
        if (d.players.some((p) => p.id !== id && (p.id_card === identity || Number(p.roster_jersey) === jersey)))
            fail('เลขประจำตัวหรือเบอร์เสื้อซ้ำในรุ่น', 409);
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['women-player:' + identity]);
        const duplicates = await db.query('SELECT * FROM football_player WHERE id_card=$1 FOR UPDATE', [identity]);
        if (!old && duplicates.rows.length === 1 && duplicates.rows[0].team_id === teamId && duplicates.rows[0].category === 'U18F') {
            const membership = await db.query('SELECT enrollment_id FROM football_category_player WHERE player_id=$1 AND active LIMIT 1', [duplicates.rows[0].id]);
            if (!membership.rows.length)
                old = duplicates.rows[0];
        }
        if (duplicates.rows.some((p) => p.id !== (old?.id || id)))
            fail('มีบุคคลนี้ในระบบแล้ว กรุณาให้เจ้าหน้าที่ตรวจสอบก่อนเพิ่ม', 409);
        const photo = text(input.photo_url, 255) || old?.photo_url || '', doc = text(input.doc_id_card, 255) || old?.doc_id_card || '';
        if (!photo || !doc)
            fail('กรุณาแนบรูปและสำเนาบัตร');
        const fields = ['name', 'prefix', 'first_name', 'middle_name', 'last_name', 'id_card', 'birth_date', 'jersey_name', 'position', 'photo_url', 'doc_id_card', 'doc_school_cert', 'doc_parent_consent', 'height', 'weight', 'school', 'grade', 'guardian_name', 'guardian_relation', 'phone', 'domicile', 'fivb_id'];
        const values = [`${prefix}${first} ${text(input.middle_name, 100)} ${last}`.replace(/\s+/g, ' '), prefix, first, text(input.middle_name, 100), last, identity, birth, text(input.jersey_name, 100), position, photo, doc, text(input.doc_school_cert, 255) || old?.doc_school_cert || null, text(input.doc_parent_consent, 255) || old?.doc_parent_consent || null, ...['height', 'weight', 'school', 'grade', 'guardian_name', 'guardian_relation', 'phone', 'domicile', 'fivb_id'].map(k => text(input[k], k === 'school' ? 150 : 100))];
        const pid = old?.id || 'FPL-' + (0, crypto_1.randomUUID)();
        if (old) {
            const shared = await db.query('SELECT e.id FROM football_category_player m JOIN football_category_enrollment e ON e.id=m.enrollment_id WHERE m.player_id=$1 AND m.active AND e.id<>$2 AND e.submitted_at IS NOT NULL', [pid, d.enrollment.id]);
            if (shared.rows.length)
                fail('บุคคลนี้อยู่ในรุ่นอื่นที่ส่งแล้ว ต้องให้เจ้าหน้าที่ตรวจสอบก่อนแก้ข้อมูลร่วม', 409);
            await db.query('UPDATE football_player SET ' + fields.map((k, n) => `${k}=$${n + 1}`).join(',') + ' WHERE id=$' + (values.length + 1) + ' AND team_id=$' + (values.length + 2), [...values, pid, teamId]);
        }
        else
            await db.query('INSERT INTO football_player(id,team_id,category,' + fields.join(',') + ') VALUES(' + Array.from({ length: values.length + 3 }, (_, n) => '$' + (n + 1)).join(',') + ')', [pid, teamId, 'U18F', ...values]);
        await db.query("INSERT INTO football_category_player(enrollment_id,player_id,jersey_no) VALUES($1,$2,$3) ON CONFLICT(enrollment_id,player_id) DO UPDATE SET jersey_no=EXCLUDED.jersey_no,review_status='PENDING',remarks='',active=true", [d.enrollment.id, pid, jersey]);
        await changed(db, d, actor, old ? 'PLAYER_UPDATED' : 'PLAYER_ADDED', { player_id: pid });
        return pid;
    });
}
async function saveWomenOfficial(teamId, season, actor, input) {
    return (0, dbTransaction_service_1.withDbTransaction)(async (db) => {
        const d = await loadWomen(teamId, season, db, true);
        active(d, input.version, true);
        if (d.officials.length >= 8)
            fail('เจ้าหน้าที่ครบ 8 คนแล้ว', 409);
        const roles = ['ผู้จัดการทีม', 'ผู้ฝึกสอน', 'ผู้ช่วยผู้ฝึกสอน', 'เจ้าหน้าที่ประจำทีม', 'แพทย์ประจำทีม', 'นักกายภาพบำบัด'];
        const role = text(input.role, 50);
        if (!roles.includes(role))
            fail('เลือกหน้าที่เจ้าหน้าที่');
        let id = text(input.existing_id, 50);
        if (id) {
            const r = await db.query('SELECT id FROM football_official WHERE id=$1 AND team_id=$2', [id, teamId]);
            if (!r.rows.length)
                fail('ไม่มีสิทธิ์เลือกเจ้าหน้าที่นี้', 404);
        }
        else {
            const name = text(input.name, 100), identity = text(input.id_card, 20), phone = text(input.phone, 50), doc = text(input.doc_id_card, 255);
            if (!name || !/^[\p{L}\p{N}\s-]{0,20}$/u.test(identity))
                fail('ตรวจชื่อและเลขระบุตัวตนเจ้าหน้าที่');
            const same = identity ? await db.query('SELECT id FROM football_official WHERE team_id=$1 AND UPPER(id_card)=UPPER($2)', [teamId, identity]) : { rows: [] };
            if (same.rows.length)
                fail('บุคคลนี้มีอยู่แล้ว กรุณาเลือกเจ้าหน้าที่เดิม', 409);
            const columns = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='football_official' AND column_name IN ('position','role')");
            const roleColumn = columns.rows.some((r) => r.column_name === 'position') ? 'position' : 'role';
            id = 'FOF-' + (0, crypto_1.randomUUID)();
            await db.query('INSERT INTO football_official(id,team_id,name,' + roleColumn + ',id_card,phone,email,categories,doc_id_card,has_license,license_type,license_serial) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [id, teamId, name, role, identity, phone, text(input.email, 100), 'U18F', doc || null, input.has_license === 'YES' ? 'YES' : 'NO', text(input.license_type, 100), text(input.license_serial, 100)]);
        }
        if (d.officials.some((o) => o.id === id))
            fail('เจ้าหน้าที่นี้อยู่ในรุ่นแล้ว', 409);
        await db.query('INSERT INTO football_category_official(enrollment_id,official_id,role) VALUES($1,$2,$3) ON CONFLICT(enrollment_id,official_id) DO UPDATE SET active=true,role=EXCLUDED.role', [d.enrollment.id, id, role]);
        await changed(db, d, actor, 'OFFICIAL_ASSIGNED', { official_id: id });
        return id;
    });
}
async function womenCommand(teamId, season, actor, input) {
    return (0, dbTransaction_service_1.withDbTransaction)(async (db) => {
        const d = await loadWomen(teamId, season, db, true);
        const cmd = text(input.action, 30);
        active(d, input.version, cmd === 'remove-player' || cmd === 'remove-official');
        if (cmd === 'submit') {
            if (d.enrollment.submitted_at)
                fail('ส่งรายชื่อแล้ว', 409);
            if (input.acknowledge !== 'yes' || !readiness(d).every(c => c.ok))
                fail('รายชื่อยังไม่ครบ 7 ข้อ หรือยังไม่รับทราบการล็อกรายชื่อ', 409);
            await db.query('UPDATE football_category_enrollment SET submitted_at=now() WHERE id=$1', [d.enrollment.id]);
        }
        else if (cmd === 'withdraw') {
            if (input.acknowledge !== 'yes')
                fail('กรุณายืนยันถอนตัว');
            await db.query('UPDATE football_category_enrollment SET withdrawn_at=now() WHERE id=$1', [d.enrollment.id]);
        }
        else if (cmd === 'remove-player' || cmd === 'remove-official') {
            const player = cmd === 'remove-player', id = text(input.id, 50), rows = player ? d.players : d.officials;
            if (!rows.some((p) => p.id === id))
                fail('ไม่พบรายชื่อในรุ่น', 404);
            await db.query('UPDATE ' + (player ? 'football_category_player' : 'football_category_official') + ' SET active=false WHERE enrollment_id=$1 AND ' + (player ? 'player_id' : 'official_id') + '=$2', [d.enrollment.id, id]);
        }
        else
            fail('คำสั่งไม่ถูกต้อง');
        await changed(db, d, actor, cmd.toUpperCase());
    });
}
async function saveWomenDetails(teamId, season, actor, input) {
    return (0, dbTransaction_service_1.withDbTransaction)(async (db) => {
        const d = await loadWomen(teamId, season, db, true);
        active(d, input.version, true);
        const postal = text(input.postal_code, 5);
        if (postal && !/^\d{5}$/.test(postal))
            fail('รหัสไปรษณีย์ต้องมี 5 หลัก');
        await db.query('INSERT INTO football_registration_team_details(team_id,office_phone,village,postal_code) VALUES($1,$2,$3,$4) ON CONFLICT(team_id) DO UPDATE SET office_phone=EXCLUDED.office_phone,village=EXCLUDED.village,postal_code=EXCLUDED.postal_code', [teamId, text(input.office_phone, 50), text(input.village, 100), postal]);
        await changed(db, d, actor, 'CONTACT_DETAILS_UPDATED');
    });
}
async function bindWomenSeason(season, scope, seasonId, reason) {
    return (0, dbTransaction_service_1.withDbTransaction)(async (db) => {
        if (scope.role !== 'SUPER_ADMIN')
            fail('เฉพาะผู้ดูแลส่วนกลางเชื่อมฤดูกาลได้', 403);
        const id = text(seasonId, 40), note = text(reason, 500);
        if (!/^[a-f0-9-]{36}$/i.test(id) || note.length < 5)
            fail('เลือกฤดูกาลแข่งขันและระบุหมายเหตุ');
        const target = await db.query('SELECT id,label FROM p2_season WHERE id=$1', [id]);
        if (!target.rows.length)
            fail('ไม่พบฤดูกาลแข่งขัน', 404);
        const c = await db.query('SELECT * FROM football_registration_category WHERE season_key=$1 AND division_code=$2 FOR UPDATE', [validSeason(season), exports.WOMEN_DIVISION]);
        if (!c.rows.length)
            fail('ไม่พบฤดูกาลรับสมัคร', 404);
        if (c.rows[0].p2_season_id && c.rows[0].p2_season_id !== id)
            fail('เชื่อมฤดูกาลแล้ว การย้ายต้องตรวจผลกระทบการแข่งขันเดิมก่อน', 409);
        await db.query('UPDATE football_registration_category SET p2_season_id=$1 WHERE season_key=$2 AND division_code=$3', [id, season, exports.WOMEN_DIVISION]);
        await db.query('INSERT INTO football_category_audit(id,actor,action,state) VALUES($1,$2,$3,$4::jsonb)', [(0, crypto_1.randomUUID)(), scope.actor, 'SEASON_BOUND', JSON.stringify({ season, season_id: id, reason: note })]);
    });
}
function authorize(d, s) { if (!['SUPER_ADMIN', 'DOCUMENT_VERIFIER', 'SAT_OFFICER'].includes(s.role) || Boolean(d.team.is_test) !== s.isDemo || (s.role === 'SAT_OFFICER' && (s.isDemo || !s.province || s.province !== d.team.province)))
    fail('ไม่มีสิทธิ์จัดการทีมในขอบเขตนี้', 403); }
async function reviewWomen(teamId, season, scope, input) {
    return (0, dbTransaction_service_1.withDbTransaction)(async (db) => {
        const d = await loadWomen(teamId, season, db, true);
        authorize(d, scope);
        if (!d.enrollment)
            fail('ไม่พบการสมัครหญิง', 404);
        if (Number(input.version) !== d.enrollment.version)
            fail('ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่', 409);
        const action = text(input.action, 30), reason = text(input.reason, 500);
        if (reason.length < 5)
            fail('ระบุหมายเหตุอย่างน้อย 5 ตัวอักษร');
        if (action === 'reopen' || action === 'restore') {
            if (action === 'restore' && !d.enrollment.withdrawn_at)
                fail('รุ่นนี้ไม่ได้ถอนตัว', 409);
            // Match existing category restore: retain submission/reviews; reopening is a separate explicit command.
            await db.query(action === 'restore' ? 'UPDATE football_category_enrollment SET withdrawn_at=NULL WHERE id=$1' : 'UPDATE football_category_enrollment SET submitted_at=NULL WHERE id=$1', [d.enrollment.id]);
        }
        else if (action === 'review-player') {
            if (!d.enrollment.submitted_at || d.enrollment.withdrawn_at)
                fail('ต้องส่งรายชื่อและไม่ถอนตัวก่อนตรวจรับรอง', 409);
            const id = text(input.id, 50), status = text(input.status, 30);
            if (!['PENDING', 'APPROVED', 'ACTION_REQUIRED', 'REJECTED'].includes(status) || !d.players.some((p) => p.id === id))
                fail('สถานะหรือนักกีฬาไม่ถูกต้อง');
            await db.query('UPDATE football_category_player SET review_status=$1,remarks=$2 WHERE enrollment_id=$3 AND player_id=$4 AND active', [status, reason, d.enrollment.id, id]);
        }
        else if (action === 'approve-team') {
            if (!d.team.doc_team_cert)
                fail('ต้องมีหนังสือรับรองทีมก่อนอนุมัติทีม', 409);
            // Team approval is the shared existing identity; category eligibility remains independent.
            await db.query("UPDATE football_registered_team SET status='APPROVED' WHERE id=$1", [teamId]);
        }
        else
            fail('คำสั่งตรวจรับไม่ถูกต้อง');
        await changed(db, d, scope.actor, action.toUpperCase(), { reason, status: text(input.status, 30), player_id: text(input.id, 50) });
    });
}
async function registerWomenTeam(input, season) {
    return (0, dbTransaction_service_1.withDbTransaction)(async (db) => {
        const c = await categoryConfig(season, db), enroll = input.enroll_women === 'yes';
        if (enroll && !registrationOpen(c))
            fail('ยังไม่เปิดรับสมัครหญิง', 403);
        const name = text(input.team_name, 150), manager = text(input.manager_name, 150), email = text(input.email, 100).toLowerCase(), password = text(input.password, 100) || text(input.phone, 50), phone = text(input.phone, 50), province = text(input.province, 100), district = (0, teamArea_1.normalizeDistrictForSave)(input.district, province);
        if (!registrationStatistics_registry_1.AREA_REGISTRY.some(p => p.name === province && p.districts.some(x => x.name === district)))
            fail('จังหวัด/อำเภอไม่ตรงกับทะเบียนพื้นที่');
        if (!name || !manager || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || !/^0\d{9}$/.test(phone))
            fail('กรอกข้อมูลทีม ผู้ประสานงาน อีเมล โทรศัพท์ และรหัสผ่านอย่างน้อย 8 ตัว');
        for (const key of ['email:' + email, 'phone:' + phone, 'team:' + province + ':' + name].sort())
            await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['women-register:' + key]);
        const duplicate = await db.query("SELECT id FROM football_registered_team WHERE LOWER(email)=$1 OR LOWER(username)=$1 OR phone=$2 OR (team_name=$3 AND province=$4) LIMIT 1", [email, phone, name, province]);
        if (duplicate.rows.length)
            fail('มีบัญชีหรือทีมนี้แล้ว กรุณาเข้าสู่ระบบเดิม', 409);
        const contactProvince = text(input.contact_province, 100) || province, contactDistrict = text(input.contact_district, 100) || (contactProvince === province ? district : '');
        if (!registrationStatistics_registry_1.AREA_REGISTRY.some(p => p.name === contactProvince && p.districts.some(d => d.name === contactDistrict)))
            fail('ตรวจจังหวัดและอำเภอของที่อยู่ติดต่อ');
        const postal = text(input.postal_code, 5), school = text(input.school_code, 50);
        if (postal && !/^\d{5}$/.test(postal))
            fail('รหัสไปรษณีย์ต้องมี 5 หลัก');
        if (school) {
            await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['women-school:' + school]);
            const duplicate = await db.query('SELECT id FROM football_registered_team WHERE school_code=$1 LIMIT 1', [school]);
            if (duplicate.rows.length)
                fail('รหัสสถานศึกษานี้มีทีมแล้ว กรุณาใช้บัญชีเดิม', 409);
        }
        const teamId = 'FTM-' + (0, crypto_1.randomUUID)();
        await db.query("INSERT INTO football_registered_team(id,team_name,province,district,gender,categories,submitted_categories,cancelled_categories,manager_name,email,phone,username,password,status,is_test,house_no,road,subdistrict,contact_subdistrict,contact_district,contact_province,line_id,school_code,doc_team_cert) VALUES($1,$2,$3,$4,'girl','','','',$5,$6,$7,$6,$8,'PENDING',false,$9,$10,$11,$11,$12,$13,$14,$15,$16)", [teamId, name, province, district, manager, email, phone, password, text(input.house_no, 100), text(input.road, 100), text(input.subdistrict, 100), contactDistrict, contactProvince, text(input.line_id, 100), school || null, text(input.doc_team_cert, 255) || null]);
        await db.query('INSERT INTO football_registration_team_details(team_id,office_phone,village,postal_code) VALUES($1,$2,$3,$4)', [teamId, text(input.office_phone, 50), text(input.village, 100), postal]);
        if (enroll) {
            const id = (0, crypto_1.randomUUID)();
            await db.query('INSERT INTO football_category_enrollment(id,team_id,season_key,division_code) VALUES($1,$2,$3,$4)', [id, teamId, season, exports.WOMEN_DIVISION]);
            await audit(db, id, email, 'REGISTERED_AND_ENROLLED');
        }
        return { teamId, username: email, enrolled: enroll };
    });
}
