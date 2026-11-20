"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitTeamCategories = exports.TEAM_CATEGORIES = void 0;
exports.getTeamCategoryState = getTeamCategoryState;
exports.getTeamCategoryStates = getTeamCategoryStates;
exports.TEAM_CATEGORIES = ['U14', 'U16', 'U18'];
const splitTeamCategories = (value) => (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map(value => String(value).trim().toUpperCase()).filter(Boolean);
exports.splitTeamCategories = splitTeamCategories;
/** Enrollment and cancellation are separate: an orphan cancellation is not an enrollment. */
function getTeamCategoryState(team, category, hasRoster = false) {
    if (team.is_deleted || team.isDeleted)
        return 'UNAVAILABLE';
    const registered = (0, exports.splitTeamCategories)(team.categories).includes(category);
    const cancelled = (0, exports.splitTeamCategories)(team.cancelled_categories || team.cancelledCategories).includes(category);
    const submitted = (0, exports.splitTeamCategories)(team.submitted_categories || team.submittedCategories).includes(category);
    if (registered)
        return cancelled ? 'CANCELLED' : 'ACTIVE';
    return cancelled || submitted || hasRoster ? 'INCONSISTENT' : 'NOT_REGISTERED';
}
function getTeamCategoryStates(team, players, officials) {
    return Object.fromEntries(exports.TEAM_CATEGORIES.map((category) => [category, getTeamCategoryState(team, category, players.some(p => (0, exports.splitTeamCategories)(p.category || p.categories).includes(category)) ||
            officials.some(o => (0, exports.splitTeamCategories)(o.categories || o.category).includes(category)))]));
}
