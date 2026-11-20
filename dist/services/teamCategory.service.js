"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamCategoryError = void 0;
exports.validateTeamCategory = validateTeamCategory;
exports.getLockedCategoryTeam = getLockedCategoryTeam;
exports.authorizeCategoryAdmin = authorizeCategoryAdmin;
exports.getCategoryRosterCounts = getCategoryRosterCounts;
exports.reviewTeamCategory = reviewTeamCategory;
exports.changeTeamCategory = changeTeamCategory;
exports.addTeamCategory = addTeamCategory;
exports.readPersistedCategoryStates = readPersistedCategoryStates;
const teamCategoryState_1 = require("../utils/teamCategoryState");
const crypto_1 = require("crypto");
class TeamCategoryError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
exports.TeamCategoryError = TeamCategoryError;
const splitCategories = teamCategoryState_1.splitTeamCategories;
function validateTeamCategory(input) {
    if (typeof input !== 'string' || !teamCategoryState_1.TEAM_CATEGORIES.includes(input.trim().toUpperCase())) {
        throw new TeamCategoryError(400, 'กรุณาระบุรุ่น U14, U16 หรือ U18 ทีละ 1 รุ่น');
    }
    return input.trim().toUpperCase();
}
async function getLockedCategoryTeam(executor, teamId) {
    const result = await executor.query('SELECT id, categories, submitted_categories, cancelled_categories, status, is_deleted, province, is_test FROM football_registered_team WHERE id::text = $1 FOR UPDATE', [teamId]);
    const team = result.rows[0];
    if (!team || team.is_deleted)
        throw new TeamCategoryError(404, 'ไม่พบข้อมูลทีม');
    return team;
}
function authorizeCategoryAdmin(team, scope) {
    if (!['SUPER_ADMIN', 'DOCUMENT_VERIFIER', 'SAT_OFFICER'].includes(scope.roleCode)) {
        throw new TeamCategoryError(403, 'ไม่มีสิทธิ์เปลี่ยนสถานะการสมัครรุ่นแข่งขัน');
    }
    if (Boolean(team.is_test) !== scope.isDemo)
        throw new TeamCategoryError(404, 'ไม่พบข้อมูลทีมในรายการนี้');
    if (scope.isDemo && scope.roleCode !== 'SUPER_ADMIN')
        throw new TeamCategoryError(403, 'ไม่มีสิทธิ์เปลี่ยนสถานะข้อมูล Demo');
    if (scope.roleCode === 'SAT_OFFICER' && (!scope.province?.trim() || scope.province.trim() !== String(team.province || '').trim())) {
        throw new TeamCategoryError(403, 'ไม่มีสิทธิ์เปลี่ยนสถานะทีมนอกจังหวัดที่รับผิดชอบ');
    }
}
async function getCategoryRosterCounts(executor, teamId, category) {
    const result = await executor.query(`SELECT (SELECT COUNT(*) FROM football_player WHERE team_id::text = $1 AND $2 = ANY(string_to_array(UPPER(REPLACE(COALESCE(category, ''), ' ', '')), ','))) AS player_count,
      (SELECT COUNT(*) FROM football_official WHERE team_id::text = $1 AND $2 = ANY(string_to_array(UPPER(REPLACE(COALESCE(categories, ''), ' ', '')), ','))) AS official_count`, [teamId, category]);
    const row = result.rows[0];
    const players = Number(row?.player_count), officials = Number(row?.official_count);
    if (!row || !Number.isInteger(players) || !Number.isInteger(officials) || players < 0 || officials < 0) {
        throw new TeamCategoryError(503, 'ไม่สามารถตรวจสอบข้อมูลการแข่งขันเดิมได้');
    }
    return { players, officials };
}
async function reviewTeamCategory(executor, teamId, input, scope) {
    const category = validateTeamCategory(input);
    const team = await getLockedCategoryTeam(executor, teamId);
    authorizeCategoryAdmin(team, scope);
    const counts = await getCategoryRosterCounts(executor, teamId, category);
    const state = (0, teamCategoryState_1.getTeamCategoryState)(team, category, Boolean(counts.players || counts.officials));
    const hasSubmission = splitCategories(team.submitted_categories).includes(category);
    const hasCancellation = splitCategories(team.cancelled_categories).includes(category);
    const action = state === 'CANCELLED' ? 'restore' : state !== 'INCONSISTENT' ? null
        : counts.players || counts.officials || hasSubmission ? 'restore_legacy' : hasCancellation ? 'clear_orphan' : null;
    const snapshot = { teamId, category, categories: splitCategories(team.categories), cancelledCategories: splitCategories(team.cancelled_categories),
        submittedCategories: splitCategories(team.submitted_categories), state, ...counts, action };
    return { ...snapshot, reviewToken: (0, crypto_1.createHash)('sha256').update(JSON.stringify(snapshot)).digest('hex') };
}
async function changeTeamCategory(executor, teamId, input, action, options) {
    const category = validateTeamCategory(input);
    const team = await getLockedCategoryTeam(executor, teamId);
    const reason = typeof options?.reason === 'string' ? options.reason.trim() : '';
    if (action !== 'cancel') {
        if (!options)
            throw new TeamCategoryError(403, 'ไม่มีสิทธิ์เปลี่ยนสถานะรุ่น');
        authorizeCategoryAdmin(team, options.scope);
        if (reason.length < 5 || reason.length > 500)
            throw new TeamCategoryError(400, 'กรุณาระบุเหตุผล 5–500 ตัวอักษร');
        if (action === 'restore' || action === 'clear_orphan' || action === 'restore_legacy') {
            const review = await reviewTeamCategory(executor, teamId, category, options.scope);
            if (options.reviewToken !== review.reviewToken || review.action !== action) {
                throw new TeamCategoryError(409, 'ข้อมูลเปลี่ยนแล้วหรือยังไม่ได้ตรวจสอบ กรุณาเปิดตรวจสถานะใหม่');
            }
        }
    }
    const categories = splitCategories(team.categories);
    const cancelled = splitCategories(team.cancelled_categories);
    const state = (0, teamCategoryState_1.getTeamCategoryState)(team, category);
    const oldState = { categories: categories.join(','), cancelledCategories: [...cancelled] };
    if (action === 'cancel') {
        if (!categories.includes(category))
            throw new TeamCategoryError(409, 'ไม่สามารถยกเลิกรุ่นที่ทีมไม่ได้สมัคร');
        if (state === 'CANCELLED')
            return { changed: false, category, categories, cancelledCategories: cancelled, oldState, newState: oldState, reason };
        cancelled.push(category);
    }
    else if (action === 'restore') {
        if (state !== 'CANCELLED')
            throw new TeamCategoryError(409, 'รุ่นนี้ไม่ได้อยู่ในสถานะยกเลิกที่คืนการสมัครได้ กรุณาตรวจสอบสถานะ');
    }
    else {
        const counts = await getCategoryRosterCounts(executor, teamId, category);
        if (categories.includes(category) || (0, teamCategoryState_1.getTeamCategoryState)(team, category, Boolean(counts.players || counts.officials)) !== 'INCONSISTENT')
            throw new TeamCategoryError(409, 'สถานะเปลี่ยนแล้ว กรุณาตรวจสอบใหม่');
        if (action === 'clear_orphan') {
            if (!cancelled.includes(category) || splitCategories(team.submitted_categories).includes(category) || counts.players || counts.officials) {
                throw new TeamCategoryError(409, 'มีข้อมูลการแข่งขันเดิม ไม่สามารถล้างสถานะค้างได้');
            }
        }
        else if (action === 'restore_legacy') {
            if (!counts.players && !counts.officials && !splitCategories(team.submitted_categories).includes(category)) {
                throw new TeamCategoryError(409, 'ไม่มีข้อมูลการแข่งขันเดิมให้คืนการสมัคร');
            }
            categories.push(category);
        }
        else
            throw new TeamCategoryError(400, 'การดำเนินการไม่ถูกต้อง');
    }
    const nextCancelled = action === 'cancel' ? cancelled : cancelled.filter(value => value !== category);
    const updated = await executor.query('UPDATE football_registered_team SET categories = $1, cancelled_categories = $2 WHERE id::text = $3 RETURNING id', [categories.join(','), nextCancelled.join(','), teamId]);
    if (updated.rowCount !== 1)
        throw new TeamCategoryError(409, 'ไม่สามารถบันทึกสถานะรุ่นได้');
    return { changed: true, category, categories, cancelledCategories: nextCancelled, oldState,
        newState: { categories: categories.join(','), cancelledCategories: nextCancelled }, reason };
}
/** Adds one category while holding the same team lock used by roster mutations. */
async function addTeamCategory(executor, teamId, input) {
    const category = validateTeamCategory(input);
    const team = await getLockedCategoryTeam(executor, teamId);
    const previousCategories = splitCategories(team.categories);
    if (previousCategories.includes(category) || splitCategories(team.submitted_categories).includes(category) || splitCategories(team.cancelled_categories).includes(category)) {
        throw new TeamCategoryError(409, 'รุ่นนี้สมัครแล้ว หรือมีประวัติยื่น/ยกเลิกการสมัคร กรุณาโหลดหน้าใหม่หรือติดต่อเจ้าหน้าที่');
    }
    // Other categories may already have players, staff or submitted rosters.
    const roster = await executor.query(`SELECT EXISTS (SELECT 1 FROM football_player WHERE team_id::text = $1 AND $2 = ANY(string_to_array(UPPER(REPLACE(COALESCE(category, ''), ' ', '')), ',')))
      OR EXISTS (SELECT 1 FROM football_official WHERE team_id::text = $1 AND $2 = ANY(string_to_array(UPPER(REPLACE(COALESCE(categories, ''), ' ', '')), ','))) AS has_roster`, [teamId, category]);
    if (roster.rows[0]?.has_roster !== false)
        throw new TeamCategoryError(409, 'รุ่นนี้มีข้อมูลการแข่งขันเดิม กรุณาติดต่อเจ้าหน้าที่');
    const categories = [...previousCategories, category];
    const updated = await executor.query('UPDATE football_registered_team SET categories = $1 WHERE id::text = $2 RETURNING id', [categories.join(','), teamId]);
    if (updated.rowCount !== 1)
        throw new TeamCategoryError(409, 'ไม่สามารถบันทึกรุ่นได้ กรุณาโหลดหน้าใหม่');
    return { categories, previousCategories };
}
/** UI state reads fail closed rather than silently replacing unavailable persisted roster with memory. */
async function readPersistedCategoryStates(executor, teams) {
    const ids = teams.map(team => String(team.id));
    if (!ids.length)
        return new Map();
    const persisted = await executor.query('SELECT id, categories, submitted_categories, cancelled_categories, is_deleted FROM football_registered_team WHERE id::text = ANY($1::text[])', [ids]);
    const players = await executor.query('SELECT team_id, category FROM football_player WHERE team_id::text = ANY($1::text[])', [ids]);
    const officials = await executor.query('SELECT team_id, categories FROM football_official WHERE team_id::text = ANY($1::text[])', [ids]);
    return new Map(teams.map(team => {
        const current = persisted.rows.find((row) => String(row.id) === String(team.id));
        return [String(team.id), (0, teamCategoryState_1.getTeamCategoryStates)(current || { is_deleted: true }, players.rows.filter((row) => String(row.team_id) === String(team.id)), officials.rows.filter((row) => String(row.team_id) === String(team.id)))];
    }));
}
