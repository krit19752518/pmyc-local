"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPhase2Router = createPhase2Router;
const express_1 = require("express");
const crypto_1 = require("crypto");
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const adminAuth_1 = require("../adminAuth");
const adminSession_service_1 = require("../services/adminSession.service");
const phase2Runtime_service_1 = require("../services/phase2Runtime.service");
const phase2ProductionBackend_service_1 = require("../services/phase2ProductionBackend.service");
const phase2Session_service_1 = require("../services/phase2Session.service");
function createPhase2Router(options = {}) {
    const router = (0, express_1.Router)();
    const backend = options.backend || (process.env.NODE_ENV === 'production' ? new phase2ProductionBackend_service_1.Phase2ProductionBackend() : new phase2Runtime_service_1.Phase2Runtime());
    const lookup = options.lookup || adminAuth_1.getAdminUserByUsername;
    router.get(['/admin/dashboard.php', '/sat-admin/dashboard.php'], async (req, res, next) => {
        const destination = (0, phase2Session_service_1.phase2LoginReturn)(req);
        if (!destination)
            return next();
        const portal = req.path.startsWith('/sat-admin/') ? 'sat' : 'central';
        try {
            const { identity } = await (0, phase2Session_service_1.resolvePhase2Identity)(req, lookup, portal);
            if (!identity)
                return next();
            res.append('Set-Cookie', [
                ...(0, adminSession_service_1.buildAdminSessionCookies)(req, identity.user, portal, Date.now(), identity.session.createdAt),
                (0, phase2Session_service_1.phase2Cookie)(req, phase2Session_service_1.PHASE2_PORTAL_COOKIE, portal),
                (0, phase2Session_service_1.phase2Cookie)(req, phase2Session_service_1.PHASE2_RETURN_COOKIE, '', 0)
            ]);
            res.setHeader('Cache-Control', 'no-store');
            return res.redirect(destination);
        }
        catch {
            return next();
        }
    });
    router.get('/sat-admin/phase2-session-status', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
            const { identity } = await (0, phase2Session_service_1.resolvePhase2Identity)(req, lookup, 'sat');
            res.json({ authenticated: Boolean(identity) });
        }
        catch {
            res.status(503).json({ authenticated: false });
        }
    });
    router.get('/sat-admin/phase2-entry', async (req, res) => {
        try {
            const { identity } = await (0, phase2Session_service_1.resolvePhase2Identity)(req, lookup, 'sat');
            if (!identity)
                return res.redirect('/phase2demo/login');
            res.setHeader('Set-Cookie', [
                ...(0, adminSession_service_1.buildAdminSessionCookies)(req, identity.user, 'sat', Date.now(), identity.session.createdAt),
                (0, phase2Session_service_1.phase2Cookie)(req, phase2Session_service_1.PHASE2_PORTAL_COOKIE, 'sat')
            ]);
            res.setHeader('Cache-Control', 'no-store');
            return res.redirect((0, phase2Session_service_1.safePhase2Return)(req.query.returnTo) || '/phase2demo');
        }
        catch {
            return res.status(503).send('ไม่สามารถตรวจสอบการเข้าสู่ระบบได้ กรุณาลองใหม่');
        }
    });
    router.get(['/phase2demo/login/central', '/phase2demo/login/sat'], (req, res) => {
        const portal = req.path.endsWith('/sat') ? 'sat' : 'central';
        res.setHeader('Set-Cookie', [
            (0, phase2Session_service_1.phase2Cookie)(req, phase2Session_service_1.PHASE2_RETURN_COOKIE, (0, phase2Session_service_1.safePhase2Return)(req.query.returnTo) || '/phase2demo', 600),
            (0, phase2Session_service_1.phase2Cookie)(req, phase2Session_service_1.PHASE2_PORTAL_COOKIE, portal)
        ]);
        res.redirect(portal === 'sat' ? '/sat-admin/login.php' : '/admin/index.php');
    });
    router.get('/phase2demo/account/:portal', (req, res) => {
        if (!['central', 'sat'].includes(req.params.portal))
            return res.sendStatus(404);
        res.setHeader('Set-Cookie', (0, phase2Session_service_1.phase2Cookie)(req, phase2Session_service_1.PHASE2_PORTAL_COOKIE, req.params.portal));
        return res.redirect('/phase2demo');
    });
    router.get('/phase2demo/session-status', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
            const { identity } = await (0, phase2Session_service_1.resolvePhase2Identity)(req, lookup);
            return res.json({ authenticated: Boolean(identity), role: identity?.user.roleCode || null, expiresAt: identity?.session.idleExpiresAt || null });
        }
        catch {
            return res.status(503).json({ error: 'ตรวจสอบ Session ไม่สำเร็จ' });
        }
    });
    router.use(async (req, res, next) => {
        if (!/^\/(phase2demo|platform)(\/|$)/.test(req.path))
            return next();
        res.setHeader('Cache-Control', 'no-store');
        if (!['GET', 'POST'].includes(req.method))
            return res.sendStatus(405);
        if (req.originalUrl.length > 4096)
            return res.sendStatus(414);
        try {
            const { identity, ambiguous } = await (0, phase2Session_service_1.resolvePhase2Identity)(req, lookup);
            if (identity)
                req.adminUser = identity.user;
            if (req.path === '/platform/events/preview')
                req.auditPersistenceState = 'PREVIEW_ONLY';
            if (req.path.startsWith('/platform')) {
                if (!identity)
                    return res.redirect('/phase2demo/login?returnTo=/platform');
                if (identity.user.roleCode !== 'SUPER_ADMIN')
                    return res.status(403).send('ไม่มีสิทธิ์เข้าถึงหลังบ้านกลาง');
            }
            if (req.path === '/phase2demo/logout')
                return res.redirect(identity?.portal === 'sat' ? '/sat-admin/logout' : identity ? '/admin/logout' : '/phase2demo');
            const csrf = identity ? (0, phase2Session_service_1.phase2Csrf)(backend.secret, identity) : '';
            if (req.method === 'POST') {
                if (!identity)
                    return res.status(401).json({ error: 'Session หมดอายุ', redirectUrl: '/phase2demo' });
                if (!(0, phase2Session_service_1.sameToken)(req.body?._csrf, csrf))
                    return res.sendStatus(403);
                const origin = req.get('origin');
                // The VPS Dev launcher uses development mode behind the HTTPS host guard.
                const publicProtocol = process.env.NODE_ENV === 'production' || process.env.FOOTBALL_VPS_DEV === '1' ? 'https' : req.protocol;
                if (origin && origin !== `${publicProtocol}://${req.get('host')}`)
                    return res.sendStatus(403);
            }
            // Renew through the source implementation, retaining the absolute deadline.
            if (identity)
                res.append('Set-Cookie', (0, adminSession_service_1.buildAdminSessionCookies)(req, identity.user, identity.portal, Date.now(), identity.session.createdAt));
            const context = {
                actor: identity ? { id: identity.user.id, name: identity.user.fullname, role: identity.user.roleCode, province: identity.user.province || null, portal: identity.portal } : null,
                expiresAt: identity ? Math.min(Date.now() + 1800000, identity.session.absoluteExpiresAt) : null,
                ambiguous, csrf
            };
            const body = req.method === 'POST' ? Buffer.from(JSON.stringify(req.body || {})) : Buffer.alloc(0);
            const encoded = Buffer.from(JSON.stringify(context)).toString('base64url');
            const stamp = String(Date.now());
            const nonce = (0, crypto_1.randomBytes)(16).toString('hex');
            const target = req.originalUrl;
            const canonical = [stamp, nonce, req.method, target, (0, crypto_1.createHash)('sha256').update(body).digest('hex'), encoded].join('\n');
            const signature = (0, crypto_1.createHmac)('sha256', backend.secret).update(canonical).digest('hex');
            const port = await backend.port();
            const connect = backend.secure ? https_1.default.request : http_1.default.request;
            const upstream = connect({ host: backend.address || '127.0.0.1', port, ...(backend.secure ? { servername: backend.hostHeader } : {}), method: req.method, path: backend.entryPath || target, headers: {
                    'Content-Type': 'application/json', 'Content-Length': body.length,
                    ...(backend.hostHeader ? { Host: backend.hostHeader } : {}),
                    ...(backend.entryPath ? { 'X-PMYC-Original-URI': target } : {}),
                    'X-PMYC-Context': encoded, 'X-PMYC-Time': stamp, 'X-PMYC-Nonce': nonce, 'X-PMYC-Signature': signature
                } }, response => {
                res.status(response.statusCode || 502);
                const location = response.headers.location;
                if (location && /^\/(?:platform|phase2demo)(?:\/|$)/.test(location))
                    res.setHeader('Location', location);
                for (const name of ['content-type', 'content-security-policy', 'x-content-type-options', 'referrer-policy']) {
                    if (response.headers[name])
                        res.setHeader(name, response.headers[name]);
                }
                if (response.statusCode === 200 && response.headers['content-type'] === 'font/ttf' && /^\/phase2demo\/assets\/fonts\/Prompt-(?:Regular|Medium|SemiBold|Bold)-[a-f0-9]{8}\.ttf$/.test(req.path)) {
                    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                }
                response.pipe(res);
            });
            upstream.setTimeout(5000, () => upstream.destroy());
            upstream.once('error', () => { if (!res.headersSent)
                res.status(503).send('ระบบจัดการแข่งขันยังไม่พร้อมให้บริการ กรุณาลองใหม่');
            else
                res.destroy(); });
            res.once('close', () => { if (!res.writableEnded)
                upstream.destroy(); });
            upstream.end(body);
        }
        catch {
            if (!res.headersSent)
                res.status(503).send('ไม่สามารถเปิดระบบจัดการแข่งขันได้ กรุณาลองใหม่');
        }
    });
    return router;
}
