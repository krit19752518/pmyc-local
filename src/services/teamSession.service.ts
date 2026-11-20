import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { getBaseUrl, isAsyncRequest, parseCookies } from '../utils/helpers';

export const TEAM_SESSION_COOKIE = 'team_session';
export const TEAM_SESSION_MAX_AGE_SECONDS = 30 * 60;
export const TEAM_SESSION_ABSOLUTE_MAX_AGE_SECONDS = 12 * 60 * 60;

export interface TeamSessionPayload {
  teamId: string;
  teamUser: string;
  createdAt: number;
  expiresAt: number;
  absoluteExpiresAt: number;
}

function getSigningKey(): Buffer {
  // Prefer a dedicated secret. Production currently supplies DATABASE_URL to Passenger;
  // non-production gets a separate local-only key so it cannot mint production sessions.
  const secret = process.env.TEAM_SESSION_SECRET
    || process.env.DATABASE_URL
    || (process.env.NODE_ENV !== 'production' ? 'football-nonproduction-session-secret' : '');
  if (!secret) throw new Error('Team session signing key is not configured');
  return createHash('sha256').update(`football-team-session:${secret}`).digest();
}

function sign(payload: string): string {
  return createHmac('sha256', getSigningKey()).update(payload).digest('base64url');
}

export function createTeamSessionToken(teamId: string, teamUser: string, now = Date.now(), createdAt = now): string {
  const payload: TeamSessionPayload = {
    teamId: String(teamId || ''),
    teamUser: String(teamUser || ''),
    createdAt,
    expiresAt: Math.min(now + TEAM_SESSION_MAX_AGE_SECONDS * 1000, createdAt + TEAM_SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000),
    absoluteExpiresAt: createdAt + TEAM_SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyTeamSessionCookies(
  cookies: Record<string, string>,
  now = Date.now()
): TeamSessionPayload | null {
  const token = cookies[TEAM_SESSION_COOKIE] || '';
  const [encodedPayload, providedSignature, ...extraParts] = token.split('.');
  if (!encodedPayload || !providedSignature || extraParts.length) return null;

  let expectedSignature: string;
  let payload: TeamSessionPayload;
  try {
    expectedSignature = sign(encodedPayload);
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TeamSessionPayload;
  } catch {
    return null;
  }

  const expected = Buffer.from(expectedSignature);
  const provided = Buffer.from(providedSignature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  if (!payload || typeof payload.teamId !== 'string' || typeof payload.teamUser !== 'string' || !Number.isFinite(payload.createdAt) || !Number.isFinite(payload.expiresAt) || !Number.isFinite(payload.absoluteExpiresAt)) return null;
  if (payload.expiresAt <= now || payload.absoluteExpiresAt <= now || payload.createdAt > now) return null;
  if (String(cookies.team_id || '') !== payload.teamId) return null;
  if (String(cookies.team_user || '') !== payload.teamUser) return null;
  if (cookies.team_logged_in !== 'true') return null;
  return payload;
}

function secureCookie(req?: Request): string {
  const forwardedProto = String(req?.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return req?.secure || forwardedProto === 'https' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

export function buildTeamSessionCookie(teamId: string, teamUser: string, createdAt = Date.now(), req?: Request): string {
  const now = Date.now();
  const token = createTeamSessionToken(teamId, teamUser, now, createdAt);
  const payload = verifyTeamSessionCookies({
    team_logged_in: 'true', team_id: String(teamId || ''), team_user: String(teamUser || ''), [TEAM_SESSION_COOKIE]: token
  }, now);
  const maxAge = payload ? Math.max(0, Math.floor((payload.expiresAt - now) / 1000)) : 0;
  return `${TEAM_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secureCookie(req)}`;
}

export function buildTeamSessionCookies(req: Request, teamId: string, teamUser: string, createdAt = Date.now()): string[] {
  const now = Date.now();
  const token = createTeamSessionToken(teamId, teamUser, now, createdAt);
  const maxAge = Math.max(0, Math.floor((Math.min(now + TEAM_SESSION_MAX_AGE_SECONDS * 1000, createdAt + TEAM_SESSION_ABSOLUTE_MAX_AGE_SECONDS * 1000) - now) / 1000));
  const secure = secureCookie(req);
  return [
    `team_logged_in=true; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`,
    `team_id=${encodeURIComponent(String(teamId || ''))}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`,
    `team_user=${encodeURIComponent(String(teamUser || ''))}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`,
    `${TEAM_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`
  ];
}

export function requireSignedTeamSession(req: Request, res: Response, next: NextFunction): void {
  const payload = verifyTeamSessionCookies(parseCookies(req));
  if (!payload || payload.teamId === 'default') {
    const base = getBaseUrl(req);
    const redirectUrl = `${base}/team/login.php?expired=1`;
    const isJson = isAsyncRequest(req);
    if (isJson) {
      res.status(401).json({ success: false, error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', expired: true, redirectUrl });
      return;
    }
    res.redirect(redirectUrl);
    return;
  }

  (req as any).teamSession = payload;
  res.append('Set-Cookie', buildTeamSessionCookie(payload.teamId, payload.teamUser, payload.createdAt, req));
  next();
}
