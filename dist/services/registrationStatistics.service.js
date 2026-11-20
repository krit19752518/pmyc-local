"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.total = exports.sum = exports.add = exports.zero = exports.SEASON_SCOPE = exports.DEFINITION_VERSION = exports.LEGACY_DEFINITION_VERSION = exports.AGES = void 0;
exports.registeredEntitlements = registeredEntitlements;
exports.dueJobKey = dueJobKey;
exports.buildStatistics = buildStatistics;
exports.validateStatistics = validateStatistics;
const node_crypto_1 = require("node:crypto");
const teamArea_1 = require("../utils/teamArea");
const teamCategoryState_1 = require("../utils/teamCategoryState");
const registrationStatistics_registry_1 = require("./registrationStatistics.registry");
exports.AGES = ['U14', 'U16', 'U18'];
exports.LEGACY_DEFINITION_VERSION = 'cumulative-registered-entitlements/v1';
exports.DEFINITION_VERSION = 'registered-entitlements-excluding-cancelled/v2';
exports.SEASON_SCOPE = 'registered-team/current-report-scope';
const zero = () => [0, 0, 0];
exports.zero = zero;
const add = (a, b) => a.map((v, i) => v + b[i]);
exports.add = add;
const sum = (rows) => rows.reduce((v, r) => (0, exports.add)(v, r.ages), (0, exports.zero)());
exports.sum = sum;
const total = (v) => v.reduce((a, b) => a + b, 0);
exports.total = total;
/** Cumulative enrollment is the default; active-registration reports explicitly opt out. */
function registeredEntitlements(rows, { includeCancelled = true } = {}) {
    const teams = new Map();
    for (const row of rows) {
        if (row.is_deleted || row.is_test)
            continue;
        const categories = (0, teamCategoryState_1.splitTeamCategories)(row.categories);
        const cancelled = (0, teamCategoryState_1.splitTeamCategories)(row.cancelled_categories || row.cancelledCategories);
        // Display/status markers are not enrollment tokens. Never infer from submitted/roster.
        if (!exports.AGES.some(age => categories.includes(age)))
            continue;
        const ages = exports.AGES.map(age => categories.includes(age) && (includeCancelled || !cancelled.includes(age)) ? 1 : 0);
        if (typeof row.id !== 'string' || !row.id.trim())
            throw new Error('Missing registration identity');
        const item = { id: row.id, ages, ...(0, teamArea_1.getRegistrationArea)(row) };
        const prior = teams.get(item.id);
        if (prior && JSON.stringify(prior) !== JSON.stringify(item))
            throw new Error('Conflicting duplicate registration');
        teams.set(item.id, item);
    }
    return [...teams.values()].filter(team => (0, exports.total)(team.ages) > 0);
}
/** Most recently due 23:00 Bangkok run, also used for restart-safe daily idempotency. */
function dueJobKey(now = new Date()) {
    return new Date(now.getTime() + 7 * 3600000 - 23 * 3600000).toISOString().slice(0, 10);
}
function contentId(value) {
    return (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(value)).digest('hex');
}
function buildStatistics(rows, asOf, generatedAt = new Date().toISOString()) {
    const provinces = registrationStatistics_registry_1.AREA_REGISTRY.map(p => ({ code: p.code, name: p.name, ages: (0, exports.zero)(), unassigned: (0, exports.zero)(), districts: p.districts.map(d => ({ ...d, ages: (0, exports.zero)() })) }));
    let ages = (0, exports.zero)(), unassigned = (0, exports.zero)();
    for (const team of registeredEntitlements(rows, { includeCancelled: false })) {
        ages = (0, exports.add)(ages, team.ages);
        const province = provinces.find(p => p.name === team.province);
        if (!province) {
            unassigned = (0, exports.add)(unassigned, team.ages);
            continue;
        }
        province.ages = (0, exports.add)(province.ages, team.ages);
        const district = province.districts.find(d => d.name === team.district);
        if (district)
            district.ages = (0, exports.add)(district.ages, team.ages);
        else
            province.unassigned = (0, exports.add)(province.unassigned, team.ages);
    }
    const body = { asOf, generatedAt, timezone: 'Asia/Bangkok', jobKey: dueJobKey(new Date(asOf)), seasonScope: exports.SEASON_SCOPE, definitionVersion: exports.DEFINITION_VERSION, includesCancelled: false, registryVersion: registrationStatistics_registry_1.REGISTRY_VERSION, ages, unassigned, provinces };
    return validateStatistics({ snapshotId: contentId(body), ...body });
}
const sameCounts = (a, b) => a.every((n, i) => n === b[i]);
function keys(value, expected) {
    if (!value || typeof value !== 'object' || Object.keys(value).sort().join('|') !== [...expected].sort().join('|'))
        throw new Error('Invalid statistics fields');
}
function counts(value) {
    if (!Array.isArray(value) || value.length !== 3 || !value.every(n => Number.isSafeInteger(n) && n >= 0))
        throw new Error('Invalid aggregate counts');
    return [...value];
}
/** Validate and project the public allowlist, including every registry code and reconciliation. */
function validateStatistics(input) {
    keys(input, ['snapshotId', 'asOf', 'generatedAt', 'timezone', 'jobKey', 'seasonScope', 'definitionVersion', 'includesCancelled', 'registryVersion', 'ages', 'unassigned', 'provinces']);
    const current = input.definitionVersion === exports.DEFINITION_VERSION && input.includesCancelled === false;
    const legacy = input.definitionVersion === exports.LEGACY_DEFINITION_VERSION && input.includesCancelled === true;
    if (input.timezone !== 'Asia/Bangkok' || (!current && !legacy) || input.registryVersion !== registrationStatistics_registry_1.REGISTRY_VERSION || input.seasonScope !== exports.SEASON_SCOPE)
        throw new Error('Invalid statistics definition');
    for (const field of ['asOf', 'generatedAt'])
        if (typeof input[field] !== 'string' || !Number.isFinite(Date.parse(input[field])) || new Date(input[field]).toISOString() !== input[field])
            throw new Error('Invalid snapshot time');
    if (Date.parse(input.generatedAt) < Date.parse(input.asOf) || input.jobKey !== dueJobKey(new Date(input.asOf)))
        throw new Error('Invalid snapshot chronology');
    if (!Array.isArray(input.provinces) || input.provinces.length !== registrationStatistics_registry_1.AREA_REGISTRY.length)
        throw new Error('Incomplete province registry');
    const provinces = registrationStatistics_registry_1.AREA_REGISTRY.map((master, i) => {
        const p = input.provinces[i];
        keys(p, ['code', 'name', 'ages', 'unassigned', 'districts']);
        if (p.code !== master.code || p.name !== master.name || !Array.isArray(p.districts) || p.districts.length !== master.districts.length)
            throw new Error('Invalid province registry');
        const districts = master.districts.map((d, j) => {
            const row = p.districts[j];
            keys(row, ['code', 'name', 'ages']);
            if (row.code !== d.code || row.name !== d.name)
                throw new Error('Invalid district registry');
            return { ...d, ages: counts(row.ages) };
        });
        const row = { code: master.code, name: master.name, ages: counts(p.ages), unassigned: counts(p.unassigned), districts };
        if (!sameCounts(row.ages, (0, exports.add)((0, exports.sum)(districts), row.unassigned)))
            throw new Error('Province totals do not reconcile');
        return row;
    });
    const ages = counts(input.ages), unassigned = counts(input.unassigned);
    if (!sameCounts(ages, (0, exports.add)((0, exports.sum)(provinces), unassigned)))
        throw new Error('National totals do not reconcile');
    const bkk = provinces.find(p => p.code === '10');
    const zoneDistricts = registrationStatistics_registry_1.BANGKOK_ZONES.flatMap(z => z.districts);
    if (registrationStatistics_registry_1.BANGKOK_ZONES.map(z => z.districts.length).join('/') !== '15/16/19' || new Set(zoneDistricts).size !== 50 || bkk.districts.some(d => !zoneDistricts.includes(d.name)))
        throw new Error('Invalid Bangkok partition');
    const body = { asOf: input.asOf, generatedAt: input.generatedAt, timezone: 'Asia/Bangkok', jobKey: input.jobKey, seasonScope: exports.SEASON_SCOPE, definitionVersion: input.definitionVersion, includesCancelled: input.includesCancelled, registryVersion: registrationStatistics_registry_1.REGISTRY_VERSION, ages, unassigned, provinces };
    if (input.snapshotId !== contentId(body))
        throw new Error('Snapshot content digest mismatch');
    return { snapshotId: input.snapshotId, ...body };
}
