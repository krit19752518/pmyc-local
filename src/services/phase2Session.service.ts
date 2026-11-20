import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { AdminUser, getAdminUserByUsername } from '../adminAuth';
import { parseCookies } from '../utils/helpers';
import { AdminPortal, AdminSessionPayload, adminSessionCookieName, verifyAdminSessionToken } from './adminSession.service';

export const PHASE2_SAT_COOKIE = 'phase2_sat_session';
export const PHASE2_PORTAL_COOKIE = 'phase2_portal';
export const PHASE2_RETURN_COOKIE = 'phase2_return_to';

export interface Phase2Identity {
  user: AdminUser;
  portal: AdminPortal;
  session: AdminSessionPayload;
  token: string;
}

export function phase2Cookie(req: Request, name: string, value: string, maxAge = 1800): string {
  const secure = req.secure || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

export function safePhase2Return(value: unknown): string | null {
  return typeof value === 'string' && ['/phase2demo', '/platform', '/platform/events/new'].includes(value) ? value : null;
}

export function phase2LoginReturn(req: Request): string | null {
  return safePhase2Return(parseCookies(req)[PHASE2_RETURN_COOKIE]);
}

/** Only signed source sessions qualify. No legacy unsigned-cookie compatibility. */
export async function resolvePhase2Identity(
  req: Request,
  lookup: (username: string) => Promise<AdminUser | null> = getAdminUserByUsername,
  forcePortal?: AdminPortal
): Promise<{ identity: Phase2Identity | null; ambiguous: boolean }> {
  const cookies = parseCookies(req);
  const preferred = forcePortal || (['central', 'sat'].includes(cookies[PHASE2_PORTAL_COOKIE]) ? cookies[PHASE2_PORTAL_COOKIE] as AdminPortal : null);
  const identities: Phase2Identity[] = [];
  for (const portal of ['central', 'sat'] as const) {
    if (preferred && preferred !== portal) continue;
    const token = portal === 'sat'
      ? (forcePortal ? cookies[adminSessionCookieName(portal)] : cookies[PHASE2_SAT_COOKIE]) || ''
      : cookies[adminSessionCookieName(portal)] || '';
    const session = verifyAdminSessionToken(token, portal);
    if (!session) continue;
    const user = await lookup(session.username);
    if (!user || user.roleCode !== session.roleCode || (portal === 'sat' ? user.roleCode !== 'SAT_OFFICER' || !user.province?.trim() : user.roleCode === 'SAT_OFFICER')) continue;
    identities.push({ user, portal, session, token });
  }
  return { identity: identities.length === 1 ? identities[0] : null, ambiguous: identities.length > 1 };
}

export function phase2Csrf(secret: string, identity: Phase2Identity): string {
  return createHmac('sha256', secret).update(`phase2-csrf:${identity.portal}:${identity.user.id}:${identity.session.createdAt}:${identity.session.absoluteExpiresAt}`).digest('hex');
}

export function sameToken(actual: unknown, expected: string): boolean {
  if (typeof actual !== 'string' || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
