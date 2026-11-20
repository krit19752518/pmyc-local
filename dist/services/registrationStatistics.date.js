"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DateRangeError = exports.APPROVAL_DEFINITION_VERSION = void 0;
exports.toBangkokDateKey = toBangkokDateKey;
exports.parseBangkokDateRange = parseBangkokDateRange;
exports.buildRegistrationStatisticsForRange = buildRegistrationStatisticsForRange;
exports.buildApprovalStatisticsForRange = buildApprovalStatisticsForRange;
const node_crypto_1 = require("node:crypto");
const teamArea_1 = require("../utils/teamArea");
const teamCategoryState_1 = require("../utils/teamCategoryState");
const statusHelper_1 = require("../utils/statusHelper");
const registrationStatistics_registry_1 = require("./registrationStatistics.registry");
const registrationStatistics_service_1 = require("./registrationStatistics.service");
exports.APPROVAL_DEFINITION_VERSION = 'age-group-current-approved-latest-transition/v1';
const BANGKOK_OFFSET_MS = 7 * 3600 * 1000;
class DateRangeError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
exports.DateRangeError = DateRangeError;
function toBangkokDateKey(date) {
    return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}
function isValidDateKey(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const [y, m, d] = value.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
function addDaysToDateKey(dateKey, days) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().slice(0, 10);
}
function bangkokMidnightUtc(dateKey) {
    return new Date(`${dateKey}T00:00:00+07:00`);
}
/** Parse and validate Asia/Bangkok date presets and custom inclusive ranges. */
function parseBangkokDateRange(query, now = new Date()) {
    const str = (key) => (typeof query[key] === 'string' ? String(query[key]).trim() : '');
    const rawPreset = str('preset');
    const rawFrom = str('from');
    const rawTo = str('to');
    const todayKey = toBangkokDateKey(now);
    let preset;
    if (!rawPreset) {
        preset = rawFrom || rawTo ? 'custom' : 'all';
    }
    else if (['all', 'today', 'yesterday', 'week', 'month', 'custom'].includes(rawPreset)) {
        preset = rawPreset;
    }
    else {
        throw new DateRangeError('invalid_date_preset', 'รูปแบบช่วงเวลาที่เลือกไม่ถูกต้อง');
    }
    let from = null;
    let to = null;
    if (preset === 'all') {
        return { preset: 'all', from: null, to: null, startUtc: null, endExclusiveUtc: null };
    }
    else if (preset === 'today') {
        from = todayKey;
        to = todayKey;
    }
    else if (preset === 'yesterday') {
        const yKey = addDaysToDateKey(todayKey, -1);
        from = yKey;
        to = yKey;
    }
    else if (preset === 'week') {
        const [y, m, d] = todayKey.split('-').map(Number);
        const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
        const mondayOffset = dow === 0 ? -6 : 1 - dow;
        from = addDaysToDateKey(todayKey, mondayOffset);
        to = todayKey;
    }
    else if (preset === 'month') {
        from = `${todayKey.slice(0, 8)}01`;
        to = todayKey;
    }
    else {
        if (!rawFrom || !rawTo) {
            throw new DateRangeError('incomplete_date_range', 'กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุด');
        }
        if (!isValidDateKey(rawFrom) || !isValidDateKey(rawTo)) {
            throw new DateRangeError('invalid_date_format', 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)');
        }
        if (rawFrom > rawTo) {
            throw new DateRangeError('invalid_date_range', 'วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด');
        }
        if (rawFrom > todayKey || rawTo > todayKey) {
            throw new DateRangeError('future_date_not_allowed', 'ไม่สามารถเลือกวันที่ในอนาคตได้');
        }
        from = rawFrom;
        to = rawTo;
    }
    return {
        preset,
        from,
        to,
        startUtc: bangkokMidnightUtc(from),
        endExclusiveUtc: bangkokMidnightUtc(addDaysToDateKey(to, 1))
    };
}
function inDateRange(ts, range) {
    if (range.preset === 'all')
        return true;
    if (!ts || !Number.isFinite(ts.getTime()))
        return false;
    if (range.startUtc && ts.getTime() < range.startUtc.getTime())
        return false;
    if (range.endExclusiveUtc && ts.getTime() >= range.endExclusiveUtc.getTime())
        return false;
    return true;
}
function emptyProvinces() {
    return registrationStatistics_registry_1.AREA_REGISTRY.map(p => ({
        code: p.code,
        name: p.name,
        ages: (0, registrationStatistics_service_1.zero)(),
        unassigned: (0, registrationStatistics_service_1.zero)(),
        districts: p.districts.map(d => ({ ...d, ages: (0, registrationStatistics_service_1.zero)() }))
    }));
}
function addAgeToArea(provinces, nationalAges, nationalUnassigned, team, ageIndex) {
    const delta = [0, 0, 0];
    delta[ageIndex] = 1;
    const nextAges = (0, registrationStatistics_service_1.add)(nationalAges, delta);
    const area = (0, teamArea_1.getRegistrationArea)(team);
    const province = provinces.find(p => p.name === area.province);
    if (!province) {
        return { ages: nextAges, unassigned: (0, registrationStatistics_service_1.add)(nationalUnassigned, delta) };
    }
    province.ages = (0, registrationStatistics_service_1.add)(province.ages, delta);
    const district = province.districts.find(d => d.name === area.district);
    if (district)
        district.ages = (0, registrationStatistics_service_1.add)(district.ages, delta);
    else
        province.unassigned = (0, registrationStatistics_service_1.add)(province.unassigned, delta);
    return { ages: nextAges, unassigned: nationalUnassigned };
}
function addTrendPoint(trendMap, ts, ageIndex) {
    if (!ts || !Number.isFinite(ts.getTime()))
        return;
    const key = toBangkokDateKey(ts);
    const cur = trendMap.get(key) || (0, registrationStatistics_service_1.zero)();
    cur[ageIndex] += 1;
    trendMap.set(key, cur);
}
function finalizeTrend(trendMap) {
    return [...trendMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, c]) => ({ date, total: c[0] + c[1] + c[2], u14: c[0], u16: c[1], u18: c[2] }));
}
function snapshotDigest(body) {
    return (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(body)).digest('hex');
}
/** Resolve age-group application creation timestamps from category audit logs with team created_at fallback. */
function buildRegistrationStatisticsForRange(teams, auditRows, asOf, dateRange) {
    const categoryCreatedMap = new Map();
    const sortedAudits = [...auditRows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    for (const row of sortedAudits) {
        if (!row.team_id)
            continue;
        if (!['TEAM_CATEGORY_REGISTERED', 'TEAM_CATEGORY_ADDED', 'TEAM_UPDATED'].includes(row.event_type))
            continue;
        const oldCats = (0, teamCategoryState_1.splitTeamCategories)(row.old_state?.categories);
        const newCats = (0, teamCategoryState_1.splitTeamCategories)(row.new_state?.categories);
        const ts = new Date(row.created_at);
        if (!Number.isFinite(ts.getTime()))
            continue;
        for (const age of registrationStatistics_service_1.AGES) {
            if (newCats.includes(age) && !oldCats.includes(age)) {
                const key = `${row.team_id}:${age}`;
                if (!categoryCreatedMap.has(key))
                    categoryCreatedMap.set(key, ts);
            }
        }
    }
    const provinces = emptyProvinces();
    let ages = (0, registrationStatistics_service_1.zero)();
    let unassigned = (0, registrationStatistics_service_1.zero)();
    const trendMap = new Map();
    for (const team of teams) {
        if (team.is_deleted || team.is_test)
            continue;
        const cats = (0, teamCategoryState_1.splitTeamCategories)(team.categories);
        const cancelled = (0, teamCategoryState_1.splitTeamCategories)(team.cancelled_categories);
        const teamCreated = team.created_at ? new Date(team.created_at) : null;
        for (let i = 0; i < registrationStatistics_service_1.AGES.length; i++) {
            const age = registrationStatistics_service_1.AGES[i];
            if (!cats.includes(age) || cancelled.includes(age))
                continue;
            const eventTs = categoryCreatedMap.get(`${team.id}:${age}`) || teamCreated;
            if (!inDateRange(eventTs, dateRange))
                continue;
            ({ ages, unassigned } = addAgeToArea(provinces, ages, unassigned, team, i));
            addTrendPoint(trendMap, eventTs, i);
        }
    }
    const body = {
        asOf,
        generatedAt: asOf,
        timezone: 'Asia/Bangkok',
        seasonScope: registrationStatistics_service_1.SEASON_SCOPE,
        definitionVersion: registrationStatistics_service_1.DEFINITION_VERSION,
        includesCancelled: false,
        registryVersion: registrationStatistics_registry_1.REGISTRY_VERSION,
        selectedDateField: 'age_group_created_at',
        dateRange: { preset: dateRange.preset, from: dateRange.from, to: dateRange.to },
        ages,
        unassigned,
        provinces,
        trend: finalizeTrend(trendMap)
    };
    return { snapshotId: snapshotDigest(body), ...body };
}
/** Compute age-group approval statistics using confirmed OQ1-OQ5 rules. */
function buildApprovalStatisticsForRange(teams, players, auditRows, asOf, dateRange) {
    const latestTeamApproved = new Map();
    const latestPlayerApproved = new Map();
    for (const row of auditRows) {
        const ts = new Date(row.created_at);
        if (!Number.isFinite(ts.getTime()))
            continue;
        if (row.event_type === 'TEAM_STATUS_CHANGED' && row.team_id && String(row.new_state?.status || '').toUpperCase() === 'APPROVED') {
            const prev = latestTeamApproved.get(row.team_id);
            if (!prev || ts.getTime() > prev.getTime())
                latestTeamApproved.set(row.team_id, ts);
        }
        if (row.event_type === 'PLAYER_DOCUMENT_STATUS_CHANGED' && String(row.new_state?.docStatus || '').toUpperCase() === 'APPROVED') {
            const entityId = String(row.entity_id || '');
            if (entityId) {
                const prev = latestPlayerApproved.get(entityId);
                if (!prev || ts.getTime() > prev.getTime())
                    latestPlayerApproved.set(entityId, ts);
            }
        }
    }
    const playersByTeam = new Map();
    for (const p of players) {
        const list = playersByTeam.get(p.team_id) || [];
        list.push({ ...p, category: p.category || undefined, docStatus: String(p.doc_status || p.docStatus || '').toUpperCase() });
        playersByTeam.set(p.team_id, list);
    }
    const provinces = emptyProvinces();
    let ages = (0, registrationStatistics_service_1.zero)();
    let unassigned = (0, registrationStatistics_service_1.zero)();
    let legacyMissingTimestampCount = 0;
    const trendMap = new Map();
    for (const team of teams) {
        if (team.is_deleted || team.is_test)
            continue;
        const cats = (0, teamCategoryState_1.splitTeamCategories)(team.categories);
        const cancelled = (0, teamCategoryState_1.splitTeamCategories)(team.cancelled_categories);
        const teamPlayers = playersByTeam.get(team.id) || [];
        const teamApprovedAt = latestTeamApproved.get(team.id) || null;
        for (let i = 0; i < registrationStatistics_service_1.AGES.length; i++) {
            const age = registrationStatistics_service_1.AGES[i];
            if (!cats.includes(age) || cancelled.includes(age))
                continue;
            const catPlayers = teamPlayers.filter(p => (0, teamCategoryState_1.splitTeamCategories)(p.category).includes(age));
            if ((0, statusHelper_1.getCategoryStatus)(team, age, catPlayers).text !== 'อนุมัติ')
                continue;
            let approvedAt = teamApprovedAt;
            if (approvedAt) {
                const playerTimes = catPlayers
                    .filter(p => p.docStatus === 'APPROVED')
                    .map(p => latestPlayerApproved.get(String(p.id)))
                    .filter((d) => Boolean(d));
                for (const pt of playerTimes) {
                    if (pt.getTime() > approvedAt.getTime())
                        approvedAt = pt;
                }
            }
            if (!approvedAt) {
                legacyMissingTimestampCount += 1;
                if (dateRange.preset !== 'all')
                    continue;
            }
            else if (!inDateRange(approvedAt, dateRange)) {
                continue;
            }
            ({ ages, unassigned } = addAgeToArea(provinces, ages, unassigned, team, i));
            if (approvedAt)
                addTrendPoint(trendMap, approvedAt, i);
        }
    }
    const body = {
        asOf,
        generatedAt: asOf,
        timezone: 'Asia/Bangkok',
        seasonScope: registrationStatistics_service_1.SEASON_SCOPE,
        definitionVersion: exports.APPROVAL_DEFINITION_VERSION,
        includesCancelled: false,
        registryVersion: registrationStatistics_registry_1.REGISTRY_VERSION,
        selectedDateField: 'age_group_approved_at',
        dateRange: { preset: dateRange.preset, from: dateRange.from, to: dateRange.to },
        ages,
        unassigned,
        provinces,
        trend: finalizeTrend(trendMap),
        legacyMissingTimestampCount
    };
    return { snapshotId: snapshotDigest(body), ...body };
}
