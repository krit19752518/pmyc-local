"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRegistrationArea = void 0;
exports.getTeamRegistrationRanks = getTeamRegistrationRanks;
const teamArea_1 = require("../utils/teamArea");
Object.defineProperty(exports, "getRegistrationArea", { enumerable: true, get: function () { return teamArea_1.getRegistrationArea; } });
const text = (value) => String(value ?? '').trim();
const firstText = (...values) => values.map(text).find(Boolean) || '';
const categories = (value) => (Array.isArray(value) ? value : text(value).split(','))
    .map(value => text(value).toUpperCase()).filter(Boolean);
/** Current registration order, independent of table filters and roster approval. */
function getTeamRegistrationRanks(teams) {
    const groups = new Map();
    const ranks = Object.create(null);
    for (const team of teams) {
        const { province, district } = (0, teamArea_1.getRegistrationArea)(team);
        const created = team.createdAt || team.created_at;
        if (!province || !district || team.is_deleted || team.isDeleted || !created || !Number.isFinite(new Date(created).getTime()))
            continue;
        const cancelled = categories(team.cancelled_categories || team.cancelledCategories);
        for (const category of new Set(categories(team.categories))) {
            if (!['U14', 'U16', 'U18'].includes(category) || cancelled.includes(category))
                continue;
            const key = JSON.stringify([Boolean(team.isTest || team.is_test || team.isDemo), province, district, category]);
            const group = groups.get(key) || [];
            group.push(team);
            groups.set(key, group);
        }
    }
    for (const [key, group] of groups) {
        const category = JSON.parse(key)[3];
        group.sort((a, b) => new Date((a.createdAt || a.created_at)).getTime() - new Date((b.createdAt || b.created_at)).getTime()
            || text(a.id).localeCompare(text(b.id), 'th'));
        group.forEach((team, index) => {
            const id = text(team.id);
            if (!ranks[id])
                ranks[id] = Object.create(null);
            ranks[id][category] = index + 1;
        });
    }
    return ranks;
}
