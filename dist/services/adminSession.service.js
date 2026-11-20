"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_EXPIRY_HEADER = exports.ADMIN_SESSION_ABSOLUTE_SECONDS = exports.ADMIN_SESSION_IDLE_SECONDS = void 0;
exports.attachSessionExpiryToResponse = attachSessionExpiryToResponse;
exports.renderSessionExpiryClientScript = renderSessionExpiryClientScript;
exports.isSatPortalRequest = isSatPortalRequest;
exports.adminPortalForRequest = adminPortalForRequest;
exports.adminSessionCookieName = adminSessionCookieName;
exports.adminUsernameCookieName = adminUsernameCookieName;
exports.adminCookiePath = adminCookiePath;
exports.createAdminSessionToken = createAdminSessionToken;
exports.verifyAdminSessionToken = verifyAdminSessionToken;
exports.buildAdminSessionCookies = buildAdminSessionCookies;
exports.clearAdminSessionCookies = clearAdminSessionCookies;
exports.checkAdminSession = checkAdminSession;
const crypto_1 = require("crypto");
const adminAuth_1 = require("../adminAuth");
const helpers_1 = require("../utils/helpers");
exports.ADMIN_SESSION_IDLE_SECONDS = 30 * 60;
exports.ADMIN_SESSION_ABSOLUTE_SECONDS = 12 * 60 * 60;
exports.SESSION_EXPIRY_HEADER = 'X-PMYC-Session-Expires-At';
function attachSessionExpiryToResponse(res, expiresAt) {
    const safeExpiresAt = Math.max(0, Math.floor(expiresAt));
    res.setHeader(exports.SESSION_EXPIRY_HEADER, String(safeExpiresAt));
    // Keep the browser timer aligned with the deadline enforced by the server.
    const originalSend = res.send.bind(res);
    res.send = ((body) => {
        if (typeof body === 'string' && /<\/head>/i.test(body)) {
            body = body.replace(/<\/head>/i, `<meta name="pmyc-session-expires-at" content="${safeExpiresAt}"></head>`);
        }
        return originalSend(body);
    });
}
function renderSessionExpiryClientScript() {
    return `<script>
(function(){
  if (window.__pmycSessionExpiryHandler) return;
  var path = window.location.pathname || '/';
  var isTeam = path.indexOf('/team/') === 0;
  var isSat = path === '/sat-admin' || path.indexOf('/sat-admin/') === 0;
  var isCentral = !isSat && (path === '/admin' || path.indexOf('/admin/') === 0);
  var isTeamPublic = path === '/team/login.php' || path === '/team/register.php' || path === '/team/reset-password.php';
  var isAdminPublic = path === '/admin' || path === '/admin/' || path === '/admin/index.php' || path === '/admin/sat-login.php';
  var isSatPublic = path === '/sat-admin/login.php';
  var portal = isTeam && !isTeamPublic ? 'team' : isSat && !isSatPublic ? 'sat' : isCentral && !isAdminPublic ? 'central' : '';
  if (!portal) return;

  window.__pmycSessionExpiryHandler = true;
  var idleTimeoutMs = ${exports.ADMIN_SESSION_IDLE_SECONDS} * 1000;
  var deadline = Date.now() + idleTimeoutMs;
  var timer = null;
  var meta = document.querySelector('meta[name="pmyc-session-expires-at"]');
  if (meta) {
    var initialDeadline = Number(meta.getAttribute('content'));
    if (Number.isFinite(initialDeadline) && initialDeadline > 0) deadline = initialDeadline;
  }

  function redirectForExpiredSession(payload) {
    if (!payload || payload.expired !== true || typeof payload.redirectUrl !== 'string' || window.__pmycSessionRedirecting) return;
    try {
      var target = new URL(payload.redirectUrl, window.location.href);
      if (target.origin === window.location.origin && target.href !== window.location.href) {
        window.__pmycSessionRedirecting = true;
        window.location.replace(target.href);
      }
    } catch (e) {}
  }

  function checkDeadline() {
    if (Date.now() >= deadline) {
      window.location.reload();
      return;
    }
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(checkDeadline, Math.max(1, deadline - Date.now()));
  }

  function isProtectedRequest(url) {
    try {
      var target = new URL(url, window.location.href);
      if (target.origin !== window.location.origin) return false;
      var requestPath = target.pathname;
      if (portal === 'team') {
        var isTeamRequest = requestPath.indexOf('/team/') === 0 || requestPath.indexOf('/api/team/') === 0;
        var isPublicTeamApi = ['/api/team/login', '/api/team/register', '/api/team/register-demo', '/api/team/forgot-password', '/api/team/reset-password', '/api/team/logout'].some(function(prefix) {
          return requestPath === prefix || requestPath.indexOf(prefix + '/') === 0;
        });
        return isTeamRequest && !isPublicTeamApi;
      }
      if (portal === 'sat') return requestPath.indexOf('/sat-admin/') === 0 || requestPath.indexOf('/api/admin/') === 0;
      return requestPath.indexOf('/admin/') === 0 || requestPath.indexOf('/api/admin/') === 0;
    } catch (e) {
      return false;
    }
  }

  function syncDeadline(url, response, requestStartedAt) {
    if (!isProtectedRequest(url)) return;
    var status = response && response.status;
    var succeeded = response && typeof response.ok === 'boolean' ? response.ok : status >= 200 && status < 300;
    if (!succeeded) return;
    var expiryHeader = response.headers && typeof response.headers.get === 'function'
      ? response.headers.get('${exports.SESSION_EXPIRY_HEADER}')
      : typeof response.getResponseHeader === 'function' ? response.getResponseHeader('${exports.SESSION_EXPIRY_HEADER}') : null;
    var responseDeadline = Number(expiryHeader);
    deadline = Number.isFinite(responseDeadline) && responseDeadline > 0 ? responseDeadline : requestStartedAt + idleTimeoutMs;
    checkDeadline();
  }

  checkDeadline();
  document.addEventListener('visibilitychange', function() { if (!document.hidden) checkDeadline(); });
  window.addEventListener('pageshow', checkDeadline);

  if (typeof window.fetch === 'function') {
    var originalFetch = window.fetch.bind(window);
    window.fetch = async function(input) {
      var requestUrl = typeof input === 'string' ? input : input && input.url || String(input || '');
      var requestStartedAt = Date.now();
      var response = await originalFetch.apply(this, arguments);
      if (response.status === 401) {
        try { redirectForExpiredSession(await response.clone().json()); } catch (e) {}
      } else if (response.redirected && response.url) {
        try {
          var finalUrl = new URL(response.url, window.location.href);
          var isLoginUrl = finalUrl.pathname === '/team/login.php' || finalUrl.pathname === '/admin/index.php' || finalUrl.pathname === '/sat-admin/login.php';
          if (finalUrl.origin === window.location.origin && isLoginUrl) {
            window.__pmycSessionRedirecting = true;
            window.location.replace(finalUrl.href);
          }
        } catch (e) {}
      } else {
        syncDeadline(requestUrl, response, requestStartedAt);
      }
      return response;
    };
  }

  if (typeof XMLHttpRequest !== 'undefined') {
    var originalXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
      var xhr = this;
      var requestStartedAt = Date.now();
      xhr.addEventListener('load', function() {
        if (xhr.status === 401) {
          try { redirectForExpiredSession(JSON.parse(xhr.responseText)); } catch (e) {}
        } else {
          syncDeadline(xhr.responseURL, xhr, requestStartedAt);
        }
      });
      return originalXhrSend.apply(this, arguments);
    };
  }
})();
</script>`;
}
function getSigningKey() {
    const secret = process.env.ADMIN_SESSION_SECRET
        || process.env.DATABASE_URL
        || (process.env.NODE_ENV !== 'production' ? 'football-nonproduction-admin-session-secret' : '');
    if (!secret)
        throw new Error('Admin session signing key is not configured');
    return (0, crypto_1.createHash)('sha256').update(`football-admin-session:${secret}`).digest();
}
function sign(encodedPayload) {
    return (0, crypto_1.createHmac)('sha256', getSigningKey()).update(encodedPayload).digest('base64url');
}
function isSatPortalRequest(req) {
    const pathname = req.originalUrl.split('?')[0] || '';
    return /(?:^|\/)sat-admin(?:\/|$)/.test(pathname);
}
function adminPortalForRequest(req) {
    return isSatPortalRequest(req) ? 'sat' : 'central';
}
function adminSessionCookieName(portal) {
    return portal === 'sat' ? 'sat_admin_session' : 'admin_session_token';
}
function adminUsernameCookieName(portal) {
    return portal === 'sat' ? 'sat_admin_user' : 'admin_user';
}
function adminCookiePath(portal) {
    return portal === 'sat' ? '/sat-admin' : '/';
}
function createAdminSessionToken(user, portal, now = Date.now(), createdAt = now) {
    const payload = {
        username: user.username,
        roleCode: user.roleCode,
        portal,
        createdAt,
        idleExpiresAt: Math.min(now + exports.ADMIN_SESSION_IDLE_SECONDS * 1000, createdAt + exports.ADMIN_SESSION_ABSOLUTE_SECONDS * 1000),
        absoluteExpiresAt: createdAt + exports.ADMIN_SESSION_ABSOLUTE_SECONDS * 1000
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encodedPayload}.${sign(encodedPayload)}`;
}
function verifyAdminSessionToken(token, portal, now = Date.now()) {
    const [encodedPayload, providedSignature, ...extraParts] = String(token || '').split('.');
    if (!encodedPayload || !providedSignature || extraParts.length)
        return null;
    let payload;
    let expectedSignature;
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
    if (!payload || payload.portal !== portal || !payload.username || !payload.roleCode)
        return null;
    if (!Number.isFinite(payload.createdAt) || !Number.isFinite(payload.idleExpiresAt) || !Number.isFinite(payload.absoluteExpiresAt))
        return null;
    if (payload.idleExpiresAt <= now || payload.absoluteExpiresAt <= now || payload.createdAt > now)
        return null;
    return payload;
}
function shouldUseSecureCookie(req) {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
    return req.secure || forwardedProto === 'https' || process.env.NODE_ENV === 'production';
}
function buildAdminSessionCookies(req, user, portal, now = Date.now(), createdAt = now) {
    const token = createAdminSessionToken(user, portal, now, createdAt);
    const payload = verifyAdminSessionToken(token, portal, now);
    const maxAge = Math.max(0, Math.floor((payload.idleExpiresAt - now) / 1000));
    const path = adminCookiePath(portal);
    const secure = shouldUseSecureCookie(req) ? '; Secure' : '';
    const sessionCookie = `${adminSessionCookieName(portal)}=${encodeURIComponent(token)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
    const usernameCookie = `${adminUsernameCookieName(portal)}=${encodeURIComponent(user.username)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
    // Keep the old central cookie aliases for integrations during the route migration.
    if (portal === 'central') {
        return [
            sessionCookie,
            usernameCookie,
            `admin_session=true; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`,
            `pmyc_admin_session=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`
        ];
    }
    // Root-scoped alias keeps SAT identity available at /phase2demo. It retains
    // the signed SAT role/expiry and is cleared by the source portal's logout.
    return [sessionCookie, usernameCookie, `phase2_sat_session=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`];
}
function clearAdminSessionCookies(req, portal) {
    const path = adminCookiePath(portal);
    const secure = shouldUseSecureCookie(req) ? '; Secure' : '';
    const expired = `Path=${path}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secure}`;
    const cookies = [
        `${adminSessionCookieName(portal)}=; ${expired}`,
        `${adminUsernameCookieName(portal)}=; ${expired}`
    ];
    if (portal === 'central') {
        cookies.push(`admin_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secure}`);
        cookies.push(`admin_user=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secure}`);
        cookies.push(`pmyc_admin_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secure}`);
    }
    if (portal === 'sat')
        cookies.push(`phase2_sat_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
    return cookies;
}
async function checkAdminSession(req, res, next) {
    const portal = adminPortalForRequest(req);
    const base = (0, helpers_1.getBaseUrl)(req);
    const loginPath = portal === 'sat' ? '/sat-admin/login.php' : '/admin/index.php';
    const isPublicLogin = req.path === '/admin/index.php' || req.path === '/admin/' || req.path === '/admin/sat-login.php';
    if (isPublicLogin || (req.method === 'POST' && req.path === '/admin/dashboard.php')) {
        next();
        return;
    }
    const cookies = (0, helpers_1.parseCookies)(req);
    const sessionToken = cookies[adminSessionCookieName(portal)] || '';
    const session = verifyAdminSessionToken(sessionToken, portal);
    if (session) {
        const user = await (0, adminAuth_1.getAdminUserByUsername)(session.username);
        const portalRoleMatches = user && user.roleCode === session.roleCode && (portal === 'sat' ? user.roleCode === 'SAT_OFFICER' : user.roleCode !== 'SAT_OFFICER');
        if (user && portalRoleMatches) {
            const now = Date.now();
            const expiresAt = Math.min(now + exports.ADMIN_SESSION_IDLE_SECONDS * 1000, session.absoluteExpiresAt);
            res.setHeader('Set-Cookie', buildAdminSessionCookies(req, user, portal, now, session.createdAt));
            attachSessionExpiryToResponse(res, expiresAt);
            req.adminUser = user;
            next();
            return;
        }
    }
    // Legacy cookies remain a non-Production compatibility path for older local
    // fixtures. Enforce the same portal-role boundary so a shared legacy cookie
    // can never make a Central account appear as SAT (or vice versa).
    if (process.env.NODE_ENV !== 'production' && !sessionToken && cookies.admin_session === 'true' && cookies.admin_user) {
        const legacyUser = await (0, adminAuth_1.getAdminUserByUsername)(cookies.admin_user);
        const legacyRoleMatchesPortal = legacyUser && (portal === 'sat'
            ? legacyUser.roleCode === 'SAT_OFFICER'
            : legacyUser.roleCode !== 'SAT_OFFICER');
        if (legacyUser && legacyRoleMatchesPortal) {
            attachSessionExpiryToResponse(res, Date.now() + exports.ADMIN_SESSION_IDLE_SECONDS * 1000);
            req.adminUser = legacyUser;
            next();
            return;
        }
    }
    const redirectUrl = `${base}${loginPath}${portal === 'sat' ? '?expired=1' : '?error=unauthorized&expired=1'}`;
    const isJson = (0, helpers_1.isAsyncRequest)(req);
    if (isJson) {
        res.status(401).json({ success: false, error: 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่', expired: true, redirectUrl });
        return;
    }
    res.redirect(redirectUrl);
}
