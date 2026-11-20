import { Request } from 'express';

// Helper to parse categories array/string from request body
export function parseCategories(body: any): string[] {
  if (!body) return [];

  let raw: any[] = [];

  const keysToInspect = ['registeredCategories', 'categoriesStr', 'categories[]', 'categories', 'category'];

  keysToInspect.forEach(key => {
    if (body[key] !== undefined && body[key] !== null) {
      if (Array.isArray(body[key])) {
        raw.push(...body[key]);
      } else if (typeof body[key] === 'string' && body[key].trim()) {
        if (body[key].includes(',')) {
          raw.push(...body[key].split(','));
        } else {
          raw.push(body[key]);
        }
      }
    }
  });

  const uniqueCats = Array.from(new Set(raw.map((c: any) => String(c).trim().toUpperCase()).filter(Boolean)));
  const validCats = uniqueCats.filter(c => ['U14', 'U16', 'U18'].includes(c));

  console.log('[DEBUG parseCategories] Input body keys:', Object.keys(body || {}), '=> Parsed validCats:', validCats);
  return validCats;
}

// Helper to extract base URL prefix (Detect VPS /football vs Local Direct Port)
export function getBaseUrl(req: Request): string {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL.replace(/\/$/, '');
  }
  const forwardedPrefix = req.headers['x-forwarded-prefix'] || '';
  if (forwardedPrefix === '/football' || req.originalUrl.startsWith('/football')) {
    return '/football';
  }
  const host = req.headers.host || '';
  if (host.includes('gritsolution1975.com')) {
    return '/football';
  }
  return '';
}

// Simple Cookie Parser Helper
export function parseCookies(req: Request): Record<string, string> {
  const list: Record<string, string> = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach((cookie) => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    if (!value) return;
    list[name] = decodeURIComponent(value);
  });
  // SAT's isolated URL space uses separately scoped cookie names. Expose
  // compatibility aliases to older route helpers after the signed guard runs.
  const requestPath = req.originalUrl.split('?')[0] || '';
  if (/(?:^|\/)sat-admin(?:\/|$)/.test(requestPath)) {
    if (list.sat_admin_session) list.admin_session = 'true';
    if (list.sat_admin_user) list.admin_user = list.sat_admin_user;
  } else if (list.admin_session_token) {
    list.admin_session = 'true';
  }
  const authenticatedAdmin = (req as any).adminUser;
  if (authenticatedAdmin?.username) {
    list.admin_session = 'true';
    list.admin_user = authenticatedAdmin.username;
  }
  return list;
}

export function isAsyncRequest(req: Request): boolean {
  return req.headers['x-requested-with'] === 'XMLHttpRequest'
    || Boolean(req.headers.accept?.includes('application/json'))
    || req.headers['sec-fetch-mode'] === 'cors'
    || req.headers['sec-fetch-dest'] === 'empty';
}
