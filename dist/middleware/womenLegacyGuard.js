"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectWomenLegacyMutation = rejectWomenLegacyMutation;
const db_1 = require("../db");
const womenRegistration_service_1 = require("../services/womenRegistration.service");
/** Legacy mutations cannot turn female identities into male or edit submitted shared staff. */
async function rejectWomenLegacyMutation(req, res, next) {
    const id = String(req.body?.id || req.body?.playerId || req.body?.officialId || req.body?.player_id || req.body?.official_id || '');
    if (!id)
        return next();
    if (/^(FPL-|FOF-)/.test(id))
        return res.status(409).json({ success: false, error: 'กรุณาจัดการรายชื่อนี้จากเมนูรุ่น18 (หญิง)' });
    if (!/official/.test(req.path))
        return next();
    try {
        if (!await (0, womenRegistration_service_1.womenReady)())
            return next();
        const found = await db_1.pool.query('SELECT e.id FROM football_category_official m JOIN football_category_enrollment e ON e.id=m.enrollment_id WHERE m.official_id=$1 AND m.active AND e.submitted_at IS NOT NULL LIMIT 1', [id]);
        if (found.rows.length)
            return res.status(409).json({ success: false, error: 'เจ้าหน้าที่อยู่ในรุ่นหญิงที่ส่งรายชื่อแล้ว ติดต่อเจ้าหน้าที่เพื่อเปิดแก้ไขก่อนเปลี่ยนข้อมูลร่วม' });
        return next();
    }
    catch {
        return res.status(503).json({ success: false, error: 'ไม่สามารถตรวจสอบสถานะรุ่นหญิงได้' });
    }
}
