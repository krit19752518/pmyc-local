"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PHASE2_RETURN_COOKIE = exports.PHASE2_PORTAL_COOKIE = exports.PHASE2_SAT_COOKIE = void 0;
exports.phase2Cookie = phase2Cookie;
exports.safePhase2Return = safePhase2Return;
exports.phase2LoginReturn = phase2LoginReturn;
exports.resolvePhase2Identity = resolvePhase2Identity;
exports.phase2Csrf = phase2Csrf;
exports.sameToken = sameToken;
const crypto_1 = require("crypto");
const adminAuth_1 = require("../adminAuth");
const helpers_1 = require("../utils/helpers");
const adminSession_service_1 = require("./adminSession.service");
exports.PHASE2_SAT_COOKIE = 'phase2_sat_session';
exports.PHASE2_PORTAL_COOKIE = 'phase2_portal';
exports.PHASE2_RETURN_COOKIE = 'phase2_return_to';
function phase2Cookie(req, name, value, maxAge = 1800) {
    const secure = req.secure || process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}
function safePhase2Return(value) {
    return typeof value === 'string' && ['/phase2demo', '/platform', '/platform/events/new'].includes(value) ? value : null;
}
function phase2LoginReturn(req) {
    return safePhase2Return((0, helpers_1.parseCookies)(req)[exports.PHASE2_RETURN_COOKIE]);
}
/** Only signed source sessions qualify. No legacy unsigned-cookie compatibility. */
async function resolvePhase2Identity(req, lookup = adminAuth_1.getAdminUserByUsername, forcePortal) {
    const cookies = (0, helpers_1.parseCookies)(req);
    const preferred = forcePortal || (['central', 'sat'].includes(cookies[exports.PHASE2_PORTAL_COOKIE]) ? cookies[exports.PHASE2_PORTAL_COOKIE] : null);
    const identities = [];
    for (const portal of ['central', 'sat']) {
        if (preferred && preferred !== portal)
            continue;
        const token = portal === 'sat'
            ? (forcePortal ? cookies[(0, adminSession_service_1.adminSessionCookieName)(portal)] : cookies[exports.PHASE2_SAT_COOKIE]) || ''
            : cookies[(0, adminSession_service_1.adminSessionCookieName)(portal)] || '';
        const session = (0, adminSession_service_1.verifyAdminSessionToken)(token, portal);
        if (!session)
            continue;
        const user = await lookup(session.username);
        if (!user || user.roleCode !== session.roleCode || (portal === 'sat' ? user.roleCode !== 'SAT_OFFICER' || !user.province?.trim() : user.roleCode === 'SAT_OFFICER'))
            continue;
        identities.push({ user, portal, session, token });
    }
    return { identity: identities.length === 1 ? identities[0] : null, ambiguous: identities.length > 1 };
}
function phase2Csrf(secret, identity) {
    return (0, crypto_1.createHmac)('sha256', secret).update(`phase2-csrf:${identity.portal}:${identity.user.id}:${identity.session.createdAt}:${identity.session.absoluteExpiresAt}`).digest('hex');
}
function sameToken(actual, expected) {
    if (typeof actual !== 'string' || actual.length !== expected.length)
        return false;
    return (0, crypto_1.timingSafeEqual)(Buffer.from(actual), Buffer.from(expected));
}
