export interface TeamCategoryRecord {
    is_deleted?: unknown;
    isDeleted?: unknown;
    categories?: unknown;
    cancelled_categories?: unknown;
    cancelledCategories?: unknown;
    submitted_categories?: unknown;
    submittedCategories?: unknown;
}
export interface RosterCategoryRecord { category?: unknown; categories?: unknown; }
export const TEAM_CATEGORIES = ['U14', 'U16', 'U18'];
const splitTeamCategories = (value: unknown) => (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map(value => String(value).trim().toUpperCase()).filter(Boolean);
/** Enrollment and cancellation are separate: an orphan cancellation is not an enrollment. */
function getTeamCategoryState(team: TeamCategoryRecord, category: string, hasRoster = false) {
    if (team.is_deleted || team.isDeleted)
        return 'UNAVAILABLE';
    const registered = (0, exports.splitTeamCategories)(team.categories).includes(category);
    const cancelled = (0, exports.splitTeamCategories)(team.cancelled_categories || team.cancelledCategories).includes(category);
    const submitted = (0, exports.splitTeamCategories)(team.submitted_categories || team.submittedCategories).includes(category);
    if (registered)
        return cancelled ? 'CANCELLED' : 'ACTIVE';
    return cancelled || submitted || hasRoster ? 'INCONSISTENT' : 'NOT_REGISTERED';
}
function getTeamCategoryStates(team: TeamCategoryRecord, players: RosterCategoryRecord[], officials: RosterCategoryRecord[]) {
    return Object.fromEntries(exports.TEAM_CATEGORIES.map((category: string) => [category, getTeamCategoryState(team, category, players.some(p => (0, exports.splitTeamCategories)(p.category || p.categories).includes(category)) ||
            officials.some(o => (0, exports.splitTeamCategories)(o.categories || o.category).includes(category)))]));
}
export { getTeamCategoryState as getTeamCategoryState };
export { getTeamCategoryStates as getTeamCategoryStates };
export { splitTeamCategories as splitTeamCategories };
