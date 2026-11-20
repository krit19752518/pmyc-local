import type { RegistrationAreaTeam } from '../utils/teamArea';
export interface RegistrationRankTeam extends RegistrationAreaTeam {
    id?: unknown;
    categories?: unknown;
    cancelled_categories?: unknown;
    cancelledCategories?: unknown;
    createdAt?: string | Date;
    created_at?: string | Date;
    is_deleted?: unknown;
    isDeleted?: unknown;
    isTest?: unknown;
    is_test?: unknown;
    isDemo?: unknown;
}
import { getRegistrationArea } from "../utils/teamArea";
const text = (value: unknown) => String(value ?? '').trim();
const firstText = (...values: unknown[]) => values.map(text).find(Boolean) || '';
const categories = (value: unknown) => (Array.isArray(value) ? value : text(value).split(','))
    .map(value => text(value).toUpperCase()).filter(Boolean);
/** Current registration order, independent of table filters and roster approval. */
function getTeamRegistrationRanks(teams: RegistrationRankTeam[]) {
    const groups = new Map<string, RegistrationRankTeam[]>();
    const ranks: Record<string, Record<string, number>> = Object.create(null);
    for (const team of teams) {
        const { province, district } = getRegistrationArea(team);
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
        group.sort((a, b) => new Date((a.createdAt || a.created_at)!).getTime() - new Date((b.createdAt || b.created_at)!).getTime()
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
export { getTeamRegistrationRanks as getTeamRegistrationRanks };
export { getRegistrationArea };
