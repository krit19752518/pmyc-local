import express, { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import { renderLayout } from './layout';
import { renderTeamLayout } from './teamLayout';
import { renderAdminLayout } from './adminLayout';
import { pool } from './db';
import { authenticateAdmin, getAdminUserByUsername, getAdminUsersList, createAdminUser, getSatOfficersList, createSatOfficer, updateSatOfficer, deleteSatOfficer, initAdminTables, AdminUser } from './adminAuth';

import { initTeamTables } from './db/initTables';
import { parseCategories, getBaseUrl, parseCookies, isAsyncRequest } from './utils/helpers';
import { teamProfile, teamsDatabase, getDbTeamProfile, getDbRegisteredTeams, getLoggedTeamId } from './models/team.model';
import { playersDatabase, getDbPlayers, getDbPlayerById } from './models/player.model';
import { officialsDatabase, getDbOfficials } from './models/official.model';
import { getCategoryStatus, getTeamStatusInfo, getPlayerDocStatusInfo } from './utils/statusHelper';
import { buildTeamSessionCookie, TEAM_SESSION_COOKIE, TEAM_SESSION_MAX_AGE_SECONDS, verifyTeamSessionCookies } from './services/teamSession.service';
import { attachSessionExpiryToResponse, checkAdminSession, isSatPortalRequest } from './services/adminSession.service';
import { auditMutationRequest } from './middleware/auditMutation.middleware';

import { upload } from './middleware/upload';
import { publicRouter } from './routes/public.router';
import { createRegistrationStatisticsRouter } from './routes/registrationStatistics.router';
import { teamAuthRouter } from './routes/team/teamAuth.router';
import { womenRegistrationRouter } from './routes/team/womenRegistration.router';
import { teamRosterRouter } from './routes/team/teamRoster.router';
import { adminPortalRouter } from './routes/admin/adminPortal.router';
import { adminReportsRouter } from './routes/admin/adminReports.router';
import { apiRouter } from './routes/api/api.router';
import { createPhase2Router } from './routes/phase2.router';
import { skipLocalInitialization } from './services/localRuntime.service';

export const app = express();
if (process.env.NODE_ENV !== 'production' && !skipLocalInitialization()) {
    initAdminTables().catch(console.error);
    initTeamTables().catch(console.error);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(auditMutationRequest);

// Before SAT URL rewriting: the bridge must see its original cookie path.
app.use(createPhase2Router());

// SAT shares implementation with the admin router but gets its own URL space and
// cookie path. Rewrite only after preserving originalUrl for portal/session checks.
app.use((req, res, next) => {
  if (!isSatPortalRequest(req)) return next();
  const originalPath = req.originalUrl.split('?')[0] || '';
  if (/(?:^|\/)sat-admin\/index\.php$/.test(originalPath)) {
    // This legacy alias renders the Central login form. Canonicalize it before
    // SAT URL/session rewriting so a Central session is not sent through the
    // SAT session guard after authentication.
    return res.redirect(`${getBaseUrl(req)}/admin/index.php`);
  }

  const originalSend = res.send.bind(res);
  const originalRedirect = res.redirect.bind(res);
  const rewriteAdminUrls = (value: string): string => value
    .replace(/\/api\/admin\//g, '\u0000SAT_API\u0000')
    .replace(/(?<!sat-)\/admin\//g, '/sat-admin/')
    .replace(/\u0000SAT_API\u0000/g, '/sat-admin/api/admin/');
  res.send = ((body?: any) => {
    if (typeof body === 'string' && /^\s*</.test(body)) {
      body = rewriteAdminUrls(body);
    }
    return originalSend(body);
  }) as typeof res.send;
  res.redirect = ((...args: any[]) => {
    if (typeof args[0] === 'string') args[0] = rewriteAdminUrls(args[0]);
    return (originalRedirect as any)(...args);
  }) as typeof res.redirect;

  const queryIndex = req.url.indexOf('?');
  const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
  const requestPath = queryIndex >= 0 ? req.url.slice(0, queryIndex) : req.url;
  const satPath = requestPath.replace(/^\/sat-admin(?=\/|$)/, '');
  if (satPath === '/login.php') req.url = `/admin/sat-login.php${query}`;
  else if (satPath === '/api' || satPath.startsWith('/api/')) req.url = `${satPath}${query}`;
  else req.url = `${satPath === '' || satPath === '/' ? '/admin/dashboard.php' : `/admin${satPath}`}${query}`;
  next();
});

// Apply the session boundary to every admin page and API, including older routes
// that predate per-route middleware. Login endpoints are explicitly allowlisted.
app.use((req, res, next) => {
  if (req.path === '/admin/api/age-group-approval-statistics' || req.path === '/admin/api/age-group-approval-statistics.csv') {
    return next();
  }
  if (req.path.startsWith('/admin/') || req.path.startsWith('/api/admin/')) {
    return checkAdminSession(req, res, next);
  }
  next();
});

// Serve static assets
const publicDir = path.join(__dirname, '../public');
const rootUploadsDir = path.join(__dirname, '../uploads');
const publicUploadsDir = path.join(publicDir, 'uploads');
app.use('/uploads', express.static(rootUploadsDir));
app.use('/uploads', express.static(publicUploadsDir));
app.use(express.static(publicDir));

// Mount Routers
app.use(createRegistrationStatisticsRouter());
app.use(publicRouter);
app.use(womenRegistrationRouter);
app.use(teamAuthRouter);
app.use(teamRosterRouter);
app.use(adminPortalRouter);
app.use(adminReportsRouter);
app.use(apiRouter);



export {
  upload,
  isPlayerPlayingUp,
  checkTeamSession,
  teamProfile,
  teamsDatabase,
  playersDatabase,
  officialsDatabase,
  parseCategories,
  getBaseUrl,
  parseCookies,
  getDbTeamProfile,
  getDbRegisteredTeams,
  getLoggedTeamId,
  getDbPlayers,
  getDbPlayerById,
  getDbOfficials
};

// --- Routes ---


// Team Auth Routes (/team/register.php, /team/login.php, /team/reset-password.php) extracted to src/routes/team/teamAuth.router.ts

// Memory Store for Password Reset Tokens Fallback
export const passwordResetTokensStore: Array<{
  id: string;
  email: string;
  username: string;
  token: string;
  expiresAt: Date;
}> = [];


// Session Check Middleware for /team/* routes
function isPlayerPlayingUp(p: any, selectedCategory: string): { playingUp: boolean; age: number } {
  if (!p || !p.birthDate) return { playingUp: false, age: 0 };

  const parts = p.birthDate.split('-');
  if (parts.length < 3) return { playingUp: false, age: 0 };

  let birthYearCE = parseInt(parts[0], 10);
  if (isNaN(birthYearCE)) return { playingUp: false, age: 0 };
  if (birthYearCE > 2400) birthYearCE -= 543;
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
  } else if (birthYearBE >= 2554) {
    naturalCategory = 'U16';
  } else if (birthYearBE >= 2552) {
    naturalCategory = 'U18';
  }

  const catOrder: Record<string, number> = { 'U14': 14, 'U16': 16, 'U18': 18 };
  const selectedCatNum = catOrder[selectedCategory.toUpperCase()] || parseInt(selectedCategory.replace(/[^0-9]/g, ''), 10) || 14;
  const naturalCatNum = catOrder[naturalCategory] || 14;

  return {
    playingUp: selectedCatNum > naturalCatNum,
    age
  };
}

function checkTeamSession(req: Request, res: Response, next: () => void) {
  const cookies = parseCookies(req);
  const base = getBaseUrl(req);
  
  // Allow public team pages without session restriction
  if (req.path === '/team/login.php' || req.path === '/team/register.php' || req.path === '/team/reset-password.php') {
    return next();
  }

  const signedTeamSession = verifyTeamSessionCookies(cookies);
  const signedSessionRequired = process.env.NODE_ENV === 'production';
  if ((cookies[TEAM_SESSION_COOKIE] && !signedTeamSession) || (signedSessionRequired && !signedTeamSession)) {
    const isJson = isAsyncRequest(req);
    if (isJson) {
      return res.status(401).json({ success: false, error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', expired: true, redirectUrl: `${base}/team/login.php?expired=1` });
    }
    return res.redirect(`${base}/team/login.php?expired=1`);
  }
  
  if (signedTeamSession || (!signedSessionRequired && (cookies.team_logged_in === 'true' || (cookies.team_id && cookies.team_id !== 'default') || cookies.team_user))) {
    // Sliding session renewal: refresh cookie Max-Age (30 mins = 1800s) on active requests
    const tId = (cookies.team_id && cookies.team_id !== 'default') ? cookies.team_id : ((req.query.teamId as string) || 'default');
    const tUser = cookies.team_user || '';
    const secure = req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() === 'https' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const now = Date.now();
    const expiresAt = Math.min(now + TEAM_SESSION_MAX_AGE_SECONDS * 1000, signedTeamSession?.absoluteExpiresAt ?? now + TEAM_SESSION_MAX_AGE_SECONDS * 1000);
    const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
    attachSessionExpiryToResponse(res, expiresAt);
    res.setHeader('Set-Cookie', [
      `team_logged_in=true; Path=/; Max-Age=${remaining}; HttpOnly; SameSite=Lax${secure}`,
      `team_id=${encodeURIComponent(tId)}; Path=/; Max-Age=${remaining}; HttpOnly; SameSite=Lax${secure}`,
      `team_user=${encodeURIComponent(tUser)}; Path=/; Max-Age=${remaining}; HttpOnly; SameSite=Lax${secure}`
    ]);
    if (signedTeamSession) res.append('Set-Cookie', buildTeamSessionCookie(signedTeamSession.teamId, signedTeamSession.teamUser, signedTeamSession.createdAt, req));
    return next();
  }
  
  const isJson = isAsyncRequest(req);
  if (isJson) {
    return res.status(401).json({ success: false, error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', expired: true, redirectUrl: `${base}/team/login.php?expired=1` });
  }
  return res.redirect(`${base}/team/login.php?expired=1`);
}

// Team Roster & Submission Routes extracted to src/routes/team/teamRoster.router.ts

// Admin Portal Routes extracted to src/routes/admin/adminPortal.router.ts
