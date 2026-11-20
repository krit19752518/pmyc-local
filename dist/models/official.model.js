"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OFFICIAL_POSITION_PRIORITY = exports.officialsDatabase = void 0;
exports.getOfficialForCategoryAndPosition = getOfficialForCategoryAndPosition;
exports.getTopOfficialForCategory = getTopOfficialForCategory;
exports.getDbOfficials = getDbOfficials;
const db_1 = require("../db");
const team_model_1 = require("./team.model");
exports.officialsDatabase = [];
exports.OFFICIAL_POSITION_PRIORITY = [
    'ผู้จัดการทีม',
    'ผู้ฝึกสอน',
    'ผู้ช่วยผู้ฝึกสอน',
    'เจ้าหน้าที่ประจำทีม',
    'แพทย์ประจำทีม',
    'นักกายภาพบำบัด'
];
function getOfficialForCategoryAndPosition(officials, category, position) {
    const normalizedCategory = String(category || '').trim().toUpperCase();
    const normalizedPosition = String(position || '').trim();
    return officials.find((official) => {
        const officialCategories = String(official.categories || official.category || 'U14')
            .toUpperCase()
            .split(',')
            .map((item) => item.trim());
        return String(official.position || '').trim() === normalizedPosition && officialCategories.includes(normalizedCategory);
    }) || null;
}
function getTopOfficialForCategory(officials, category) {
    const normalizedCategory = category.trim().toUpperCase();
    const categoryOfficials = officials.filter((official) => String(official.categories || official.category || 'U14')
        .toUpperCase()
        .split(',')
        .map((item) => item.trim())
        .includes(normalizedCategory));
    return categoryOfficials.reduce((top, official) => {
        if (!top)
            return official;
        const officialPosition = String(official.position || '').trim();
        const topPosition = String(top.position || '').trim();
        const officialRank = exports.OFFICIAL_POSITION_PRIORITY.indexOf(officialPosition);
        const topRank = exports.OFFICIAL_POSITION_PRIORITY.indexOf(topPosition);
        if (officialRank >= 0 && (topRank < 0 || officialRank < topRank))
            return official;
        return top;
    }, null);
}
async function getDbOfficials(teamId, includeTestData = false) {
    let dbOfficials = [];
    try {
        let res = null;
        if (teamId && teamId !== 'ALL') {
            res = await db_1.pool.query('SELECT * FROM football_official WHERE team_id = $1 ORDER BY id ASC', [teamId]);
        }
        else {
            res = await db_1.pool.query(`SELECT o.* FROM football_official o ${includeTestData ? '' : 'LEFT JOIN football_registered_team t ON t.id = o.team_id WHERE COALESCE(t.is_test, FALSE) = FALSE'} ORDER BY o.id ASC`);
        }
        if (res && res.rows && res.rows.length > 0) {
            dbOfficials = res.rows.map((r) => ({
                id: r.id,
                teamId: r.team_id || '',
                name: r.name,
                position: r.position,
                idCard: r.id_card || '',
                docIdCard: r.doc_id_card || '',
                doc_id_card: r.doc_id_card || '',
                phone: r.phone || '',
                email: r.email || '',
                photoUrl: r.photo_url || r.photoUrl || '',
                photo_url: r.photo_url || r.photoUrl || '',
                categories: r.categories || 'U14',
                hasLicense: r.has_license || 'NO',
                licenseType: r.license_type || '',
                licenseSerial: r.license_serial || '',
                docStatus: r.doc_status || 'APPROVED'
            }));
        }
    }
    catch (err) {
        console.error('Database query error in getDbOfficials, fallback to memory:', err);
    }
    const testTeamIds = new Set(team_model_1.teamsDatabase.filter((team) => team.isTest || team.is_test).map((team) => String(team.id)));
    const memOfficials = teamId && teamId !== 'ALL'
        ? exports.officialsDatabase.filter((o) => o.teamId === teamId)
        : exports.officialsDatabase.filter((o) => includeTestData || (!o.isTest && !testTeamIds.has(String(o.teamId || o.team_id || ''))));
    const merged = [...dbOfficials];
    for (const m of memOfficials) {
        if (!merged.some(d => String(d.id).trim() === String(m.id).trim())) {
            merged.push(m);
        }
    }
    return merged;
}
