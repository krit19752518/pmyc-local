"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEAM_SESSION_ABSOLUTE_MAX_AGE_SECONDS = exports.TEAM_SESSION_MAX_AGE_SECONDS = exports.TEAM_SESSION_COOKIE = void 0;
exports.createTeamSessionToken = createTeamSessionToken;
exports.verifyTeamSessionCookies = verifyTeamSessionCookies;
exports.buildTeamSessionCookie = buildTeamSessionCookie;
exports.buildTeamSessionCookies = buildTeamSessionCookies;
exports.requireSignedTeamSession = requireSignedTeamSession;
const crypto_1 = require("crypto");
const helpers_1 = require("../utils/helpers");
exports.TEAM_SESSION_COOKIE = 'team_session';
exports.TEAM_SESSION_MAX_AGE_SECONDS = 30 * 60;
exports.TEAM_SESSION_ABSOLUTE_MAX_AGE_SECONDS = 12 * 60 * 60;
function getSigningKey() {
    // Prefer a dedicated secret. Production currently supplies DATABASE_URL to Passenger;
    // non-production gets a separate local-only key so it cannot mint production sessions.
    const secret = process.env.TEAM_SESSION_SECRET
        || process.env.DATABASE_URL
        || (process.env.NODE_ENV !== 'production' ? 'football-nonproduction-session-secret' : '');
    if (!secret)
        throw new Error('Team session signing key is not configured');
    return (0, crypto_1.createHash)('sha256').update(`football-team-session:${secret}`).digest();
}
function sign(payload) {
    return (0, crypto_1.createHmac)('sha256', getSigningKey()).update(payload).digest('base64url');
}
function createTeamSessionToken(teamId, teamUser, now = Date.now(), createdAt = now) {
    const payload = {
        teamId: String(teamId || ''),
        teamUser: String(teamUser || ''),
        createdAt,
        expiresAt: Math.min(now + exports.TEAM_SESSION_MAX_AGE_SECONDS * 1000, createdAt + exports.TEAM_SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000),
        absoluteExpiresAt: createdAt + exports.TEAM_SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encodedPayload}.${sign(encodedPayload)}`;
}
function verifyTeamSessionCookies(cookies, now = Date.now()) {
    const token = cookies[exports.TEAM_SESSION_COOKIE] || '';
    const [encodedPayload, providedSignature, ...extraParts] = token.split('.');
    if (!encodedPayload || !providedSignature || extraParts.length)
        return null;
    let expectedSignature;
    let payload;
    try {
        expectedSignature = sign(encodedPayload);
        payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    }
    catch {
        return null;
    }
    const expected = Buffer.from(expectedSignature);
    const provided = Buffer.from(providedSignature);
    if (expected.length !== provided.length || !(0, crypto_1.timingSafeEqual)(expected, provided))
        return null;
    if (!payload || typeof payload.teamId !== 'string' || typeof payload.teamUser !== 'string' || !Number.isFinite(payload.createdAt) || !Number.isFinite(payload.expiresAt) || !Number.isFinite(payload.absoluteExpiresAt))
        return null;
    if (payload.expiresAt <= now || payload.absoluteExpiresAt <= now || payload.createdAt > now)
        return null;
    if (String(cookies.team_id || '') !== payload.teamId)
        return null;
    if (String(cookies.team_user || '') !== payload.teamUser)
        return null;
    if (cookies.team_logged_in !== 'true')
        return null;
    return payload;
}
function secureCookie(req) {
    const forwardedProto = String(req?.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    return req?.secure || forwardedProto === 'https' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
}
function buildTeamSessionCookie(teamId, teamUser, createdAt = Date.now(), req) {
    const now = Date.now();
    const token = createTeamSessionToken(teamId, teamUser, now, createdAt);
    const payload = verifyTeamSessionCookies({
        team_logged_in: 'true', team_id: String(teamId || ''), team_user: String(teamUser || ''), [exports.TEAM_SESSION_COOKIE]: token
    }, now);
    const maxAge = payload ? Math.max(0, Math.floor((payload.expiresAt - now) / 1000)) : 0;
    return `${exports.TEAM_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secureCookie(req)}`;
}
function buildTeamSessionCookies(req, teamId, teamUser, createdAt = Date.now()) {
    const now = Date.now();
    const token = createTeamSessionToken(teamId, teamUser, now, createdAt);
    const maxAge = Math.max(0, Math.floor((Math.min(now + exports.TEAM_SESSION_MAX_AGE_SECONDS * 1000, createdAt + exports.TEAM_SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000) - now) / 1000));
    const secure = secureCookie(req);
    return [
        `team_logged_in=true; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`,
        `team_id=${encodeURIComponent(String(teamId || ''))}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`,
        `team_user=${encodeURIComponent(String(teamUser || ''))}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`,
        `${exports.TEAM_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`
    ];
}
function requireSignedTeamSession(req, res, next) {
    const payload = verifyTeamSessionCookies((0, helpers_1.parseCookies)(req));
    if (!payload || payload.teamId === 'default') {
        const base = (0, helpers_1.getBaseUrl)(req);
        const redirectUrl = `${base}/team/login.php?expired=1`;
        const isJson = (0, helpers_1.isAsyncRequest)(req);
        if (isJson) {
            res.status(401).json({ success: false, error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', expired: true, redirectUrl });
            return;
        }
        res.redirect(redirectUrl);
        return;
    }
    req.teamSession = payload;
    res.append('Set-Cookie', buildTeamSessionCookie(payload.teamId, payload.teamUser, payload.createdAt, req));
    next();
}
