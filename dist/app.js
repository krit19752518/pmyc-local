"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.passwordResetTokensStore = exports.getDbOfficials = exports.getDbPlayerById = exports.getDbPlayers = exports.getLoggedTeamId = exports.getDbRegisteredTeams = exports.getDbTeamProfile = exports.parseCookies = exports.getBaseUrl = exports.parseCategories = exports.officialsDatabase = exports.playersDatabase = exports.teamsDatabase = exports.teamProfile = exports.upload = exports.app = void 0;
exports.isPlayerPlayingUp = isPlayerPlayingUp;
exports.checkTeamSession = checkTeamSession;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const adminAuth_1 = require("./adminAuth");
const initTables_1 = require("./db/initTables");
const helpers_1 = require("./utils/helpers");
Object.defineProperty(exports, "parseCategories", { enumerable: true, get: function () { return helpers_1.parseCategories; } });
Object.defineProperty(exports, "getBaseUrl", { enumerable: true, get: function () { return helpers_1.getBaseUrl; } });
Object.defineProperty(exports, "parseCookies", { enumerable: true, get: function () { return helpers_1.parseCookies; } });
const team_model_1 = require("./models/team.model");
Object.defineProperty(exports, "teamProfile", { enumerable: true, get: function () { return team_model_1.teamProfile; } });
Object.defineProperty(exports, "teamsDatabase", { enumerable: true, get: function () { return team_model_1.teamsDatabase; } });
Object.defineProperty(exports, "getDbTeamProfile", { enumerable: true, get: function () { return team_model_1.getDbTeamProfile; } });
Object.defineProperty(exports, "getDbRegisteredTeams", { enumerable: true, get: function () { return team_model_1.getDbRegisteredTeams; } });
Object.defineProperty(exports, "getLoggedTeamId", { enumerable: true, get: function () { return team_model_1.getLoggedTeamId; } });
const player_model_1 = require("./models/player.model");
Object.defineProperty(exports, "playersDatabase", { enumerable: true, get: function () { return player_model_1.playersDatabase; } });
Object.defineProperty(exports, "getDbPlayers", { enumerable: true, get: function () { return player_model_1.getDbPlayers; } });
Object.defineProperty(exports, "getDbPlayerById", { enumerable: true, get: function () { return player_model_1.getDbPlayerById; } });
const official_model_1 = require("./models/official.model");
Object.defineProperty(exports, "officialsDatabase", { enumerable: true, get: function () { return official_model_1.officialsDatabase; } });
Object.defineProperty(exports, "getDbOfficials", { enumerable: true, get: function () { return official_model_1.getDbOfficials; } });
const teamSession_service_1 = require("./services/teamSession.service");
const adminSession_service_1 = require("./services/adminSession.service");
const auditMutation_middleware_1 = require("./middleware/auditMutation.middleware");
const upload_1 = require("./middleware/upload");
Object.defineProperty(exports, "upload", { enumerable: true, get: function () { return upload_1.upload; } });
const public_router_1 = require("./routes/public.router");
const registrationStatistics_router_1 = require("./routes/registrationStatistics.router");
const teamAuth_router_1 = require("./routes/team/teamAuth.router");
const womenRegistration_router_1 = require("./routes/team/womenRegistration.router");
const teamRoster_router_1 = require("./routes/team/teamRoster.router");
const adminPortal_router_1 = require("./routes/admin/adminPortal.router");
const adminReports_router_1 = require("./routes/admin/adminReports.router");
const api_router_1 = require("./routes/api/api.router");
const phase2_router_1 = require("./routes/phase2.router");
const localRuntime_service_1 = require("./services/localRuntime.service");
exports.app = (0, express_1.default)();
if (process.env.NODE_ENV !== 'production' && !(0, localRuntime_service_1.skipLocalInitialization)()) {
    (0, adminAuth_1.initAdminTables)().catch(console.error);
    (0, initTables_1.initTeamTables)().catch(console.error);
}
exports.app.use(express_1.default.json());
exports.app.use(express_1.default.urlencoded({ extended: true }));
exports.app.use(auditMutation_middleware_1.auditMutationRequest);
// Before SAT URL rewriting: the bridge must see its original cookie path.
exports.app.use((0, phase2_router_1.createPhase2Router)());
// SAT shares implementation with the admin router but gets its own URL space and
// cookie path. Rewrite only after preserving originalUrl for portal/session checks.
exports.app.use((req, res, next) => {
    if (!(0, adminSession_service_1.isSatPortalRequest)(req))
        return next();
    const originalPath = req.originalUrl.split('?')[0] || '';
    if (/(?:^|\/)sat-admin\/index\.php$/.test(originalPath)) {
        // This legacy alias renders the Central login form. Canonicalize it before
        // SAT URL/session rewriting so a Central session is not sent through the
        // SAT session guard after authentication.
        return res.redirect(`${(0, helpers_1.getBaseUrl)(req)}/admin/index.php`);
    }
    const originalSend = res.send.bind(res);
    const originalRedirect = res.redirect.bind(res);
    const rewriteAdminUrls = (value) => value
        .replace(/\/api\/admin\//g, '\u0000SAT_API\u0000')
        .replace(/(?<!sat-)\/admin\//g, '/sat-admin/')
        .replace(/\u0000SAT_API\u0000/g, '/sat-admin/api/admin/');
    res.send = ((body) => {
        if (typeof body === 'string' && /^\s*</.test(body)) {
            body = rewriteAdminUrls(body);
        }
        return originalSend(body);
    });
    res.redirect = ((...args) => {
        if (typeof args[0] === 'string')
            args[0] = rewriteAdminUrls(args[0]);
        return originalRedirect(...args);
    });
    const queryIndex = req.url.indexOf('?');
    const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
    const requestPath = queryIndex >= 0 ? req.url.slice(0, queryIndex) : req.url;
    const satPath = requestPath.replace(/^\/sat-admin(?=\/|$)/, '');
    if (satPath === '/login.php')
        req.url = `/admin/sat-login.php${query}`;
    else if (satPath === '/api' || satPath.startsWith('/api/'))
        req.url = `${satPath}${query}`;
    else
        req.url = `${satPath === '' || satPath === '/' ? '/admin/dashboard.php' : `/admin${satPath}`}${query}`;
    next();
});
// Apply the session boundary to every admin page and API, including older routes
// that predate per-route middleware. Login endpoints are explicitly allowlisted.
exports.app.use((req, res, next) => {
    if (req.path.startsWith('/admin/') || req.path.startsWith('/api/admin/')) {
        return (0, adminSession_service_1.checkAdminSession)(req, res, next);
    }
    next();
});
// Serve static assets
const publicDir = path_1.default.join(__dirname, '../public');
const rootUploadsDir = path_1.default.join(__dirname, '../uploads');
const publicUploadsDir = path_1.default.join(publicDir, 'uploads');
exports.app.use('/uploads', express_1.default.static(rootUploadsDir));
exports.app.use('/uploads', express_1.default.static(publicUploadsDir));
exports.app.use(express_1.default.static(publicDir));
// Mount Routers
exports.app.use((0, registrationStatistics_router_1.createRegistrationStatisticsRouter)());
exports.app.use(public_router_1.publicRouter);
exports.app.use(womenRegistration_router_1.womenRegistrationRouter);
exports.app.use(teamAuth_router_1.teamAuthRouter);
exports.app.use(teamRoster_router_1.teamRosterRouter);
exports.app.use(adminPortal_router_1.adminPortalRouter);
exports.app.use(adminReports_router_1.adminReportsRouter);
exports.app.use(api_router_1.apiRouter);
// --- Routes ---
// Team Auth Routes (/team/register.php, /team/login.php, /team/reset-password.php) extracted to src/routes/team/teamAuth.router.ts
// Memory Store for Password Reset Tokens Fallback
exports.passwordResetTokensStore = [];
// Session Check Middleware for /team/* routes
function isPlayerPlayingUp(p, selectedCategory) {
    if (!p || !p.birthDate)
        return { playingUp: false, age: 0 };
    const parts = p.birthDate.split('-');
    if (parts.length < 3)
        return { playingUp: false, age: 0 };
    let birthYearCE = parseInt(parts[0], 10);
    if (isNaN(birthYearCE))
        return { playingUp: false, age: 0 };
    if (birthYearCE > 2400)
        birthYearCE -= 543;
    const birthYearBE = birthYearCE + 543;
    let age = new Date().getFullYear() - birthYearCE;
    const bDate = new Date(birthYearCE, parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    if (!isNaN(bDate.getTime())) {
        const ageDiffMs = Date.now() - bDate.getTime();
        const ageDate = new Date(ageDiffMs);
        age = Math.abs(ageDate.getUTCFullYear() - 1970);
    }
    let naturalCategory = 'U14';
    if (birthYearBE >= 2556) {
        naturalCategory = 'U14';
    }
    else if (birthYearBE >= 2554) {
        naturalCategory = 'U16';
    }
    else if (birthYearBE >= 2552) {
        naturalCategory = 'U18';
    }
    const catOrder = { 'U14': 14, 'U16': 16, 'U18': 18 };
    const selectedCatNum = catOrder[selectedCategory.toUpperCase()] || parseInt(selectedCategory.replace(/[^0-9]/g, ''), 10) || 14;
    const naturalCatNum = catOrder[naturalCategory] || 14;
    return {
        playingUp: selectedCatNum > naturalCatNum,
        age
    };
}
function checkTeamSession(req, res, next) {
    const cookies = (0, helpers_1.parseCookies)(req);
    const base = (0, helpers_1.getBaseUrl)(req);
    // Allow public team pages without session restriction
    if (req.path === '/team/login.php' || req.path === '/team/register.php' || req.path === '/team/reset-password.php') {
        return next();
    }
    const signedTeamSession = (0, teamSession_service_1.verifyTeamSessionCookies)(cookies);
    const signedSessionRequired = process.env.NODE_ENV === 'production';
    if ((cookies[teamSession_service_1.TEAM_SESSION_COOKIE] && !signedTeamSession) || (signedSessionRequired && !signedTeamSession)) {
        const isJson = (0, helpers_1.isAsyncRequest)(req);
        if (isJson) {
            return res.status(401).json({ success: false, error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', expired: true, redirectUrl: `${base}/team/login.php?expired=1` });
        }
        return res.redirect(`${base}/team/login.php?expired=1`);
    }
    if (signedTeamSession || (!signedSessionRequired && (cookies.team_logged_in === 'true' || (cookies.team_id && cookies.team_id !== 'default') || cookies.team_user))) {
        // Sliding session renewal: refresh cookie Max-Age (30 mins = 1800s) on active requests
        const tId = (cookies.team_id && cookies.team_id !== 'default') ? cookies.team_id : (req.query.teamId || 'default');
        const tUser = cookies.team_user || '';
        const secure = req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() === 'https' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
        const now = Date.now();
        const expiresAt = Math.min(now + teamSession_service_1.TEAM_SESSION_MAX_AGE_SECONDS * 1000, signedTeamSession?.absoluteExpiresAt ?? now + teamSession_service_1.TEAM_SESSION_MAX_AGE_SECONDS * 1000);
        const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
        (0, adminSession_service_1.attachSessionExpiryToResponse)(res, expiresAt);
        res.setHeader('Set-Cookie', [
            `team_logged_in=true; Path=/; Max-Age=${remaining}; HttpOnly; SameSite=Lax${secure}`,
            `team_id=${encodeURIComponent(tId)}; Path=/; Max-Age=${remaining}; HttpOnly; SameSite=Lax${secure}`,
            `team_user=${encodeURIComponent(tUser)}; Path=/; Max-Age=${remaining}; HttpOnly; SameSite=Lax${secure}`
        ]);
        if (signedTeamSession)
            res.append('Set-Cookie', (0, teamSession_service_1.buildTeamSessionCookie)(signedTeamSession.teamId, signedTeamSession.teamUser, signedTeamSession.createdAt, req));
        return next();
    }
    const isJson = (0, helpers_1.isAsyncRequest)(req);
    if (isJson) {
        return res.status(401).json({ success: false, error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', expired: true, redirectUrl: `${base}/team/login.php?expired=1` });
    }
    return res.redirect(`${base}/team/login.php?expired=1`);
}
// Team Roster & Submission Routes extracted to src/routes/team/teamRoster.router.ts
// Admin Portal Routes extracted to src/routes/admin/adminPortal.router.ts
