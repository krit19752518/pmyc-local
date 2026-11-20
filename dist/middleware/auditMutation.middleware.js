"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditMutationRequest = auditMutationRequest;
const crypto_1 = require("crypto");
const adminAuth_1 = require("../adminAuth");
const auditLog_service_1 = require("../services/auditLog.service");
const helpers_1 = require("../utils/helpers");
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function routeTemplate(req) {
    const routePath = req.route?.path;
    if (typeof routePath === 'string')
        return `${req.baseUrl || ''}${routePath}`;
    if (Array.isArray(routePath))
        return `${req.baseUrl || ''}${routePath.filter(item => typeof item === 'string').join('|')}`;
    return '<unmatched-route>';
}
function safeRecordId(value) {
    if (typeof value !== 'string' && typeof value !== 'number')
        return null;
    const candidate = String(value).trim();
    if (!candidate || candidate.length > 50 || /@/.test(candidate) || /^\d{7,15}$/.test(candidate))
        return null;
    return /^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$/.test(candidate) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(candidate)
        ? candidate
        : null;
}
function requestTarget(req) {
    const route = routeTemplate(req).toLowerCase();
    const params = req.params || {};
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    let entityType = 'HTTP_REQUEST';
    let candidate = params.reportId || params.teamId || params.playerId || params.officialId || params.id;
    if (route.includes('support/reports')) {
        entityType = route.includes('/messages') ? 'SUPPORT_MESSAGE' : 'SUPPORT_REPORT';
        candidate ||= body.reportId;
    }
    else if (route.includes('/players/')) {
        entityType = 'PLAYER';
        candidate ||= body.playerId || body.id;
    }
    else if (route.includes('/officials/')) {
        entityType = 'OFFICIAL';
        candidate ||= body.officialId || body.id;
    }
    else if (route.includes('/sat-officers/')) {
        entityType = 'SAT_OFFICER';
        candidate ||= body.id;
    }
    else if (route.includes('/admin/users/')) {
        entityType = 'ADMIN_USER';
    }
    else if (route.includes('/brackets/')) {
        entityType = 'BRACKET';
    }
    else if (route.includes('/teams/') || route.includes('/team/')) {
        entityType = 'TEAM';
        candidate ||= body.teamId || body.id;
    }
    const responseTarget = req.auditResponseTargetId;
    const entityId = safeRecordId(candidate) || safeRecordId(responseTarget);
    return { entityType, entityId: entityId || String(req.auditRequestId) };
}
function requestAction(req, targetId) {
    const route = routeTemplate(req).toLowerCase();
    if (/(^|[-/])(delete|remove)([-/]|$)/.test(route))
        return 'DELETE';
    if (/(^|[-/])restore([-/]|$)/.test(route))
        return 'RESTORE';
    if (/(^|[-/])(messages|register|create)([-/]|$)/.test(route))
        return 'CREATE';
    if (/(^|[-/])(update|edit|status|reset|move|draw|clear|save-remark|additional-info)([-/]|$)/.test(route))
        return 'UPDATE';
    if (/(^|[-/])save([-/]|$)/.test(route))
        return targetId ? 'UPDATE_OR_CREATE' : 'CREATE';
    if (/(^|[-/])submit([-/]|$)/.test(route))
        return 'SUBMIT';
    return 'MUTATE';
}
function failureClass(status) {
    if (status < 400)
        return 'BUSINESS_REJECTION';
    if (status === 400 || status === 422)
        return 'VALIDATION';
    if (status === 401)
        return 'AUTHENTICATION';
    if (status === 403)
        return 'AUTHORIZATION';
    if (status === 404)
        return 'NOT_FOUND';
    if (status === 409)
        return 'CONFLICT';
    if (status === 429)
        return 'RATE_LIMIT';
    if (status >= 500)
        return 'SERVER_ERROR';
    return 'HTTP_ERROR';
}
function inspectResponseBody(req, res, body) {
    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
        const value = body;
        if (value.success === false)
            res.locals.auditResponseFailed = true;
        const responseRecord = value.user && typeof value.user === 'object'
            ? value.user
            : value;
        for (const key of ['reportId', 'teamId', 'playerId', 'officialId', 'id']) {
            if (safeRecordId(responseRecord[key])) {
                req.auditResponseTargetId = responseRecord[key];
                break;
            }
        }
        if (typeof value.code === 'string' && /^[A-Z0-9_.-]{1,64}$/.test(value.code))
            res.locals.auditFailureCode = value.code;
        return;
    }
    if (typeof body === 'string' && body.length < 4096 && body.trimStart().startsWith('{')) {
        try {
            inspectResponseBody(req, res, JSON.parse(body));
        }
        catch {
            // Response bodies are never persisted; malformed JSON is ignored.
        }
    }
}
/** Adds a request correlation id and records every HTTP mutation response without storing request/response bodies. */
function auditMutationRequest(req, res, next) {
    if (!MUTATION_METHODS.has(String(req.method || '').toUpperCase()))
        return next();
    const requestId = (0, crypto_1.randomUUID)();
    req.auditRequestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    req.auditRoute = '<unmatched-route>';
    const originalJson = res.json;
    res.json = function patchedJson(body) {
        inspectResponseBody(req, res, body);
        return originalJson.call(this, body);
    };
    const originalSend = res.send;
    res.send = function patchedSend(body) {
        inspectResponseBody(req, res, body);
        return originalSend.call(this, body);
    };
    res.once('finish', () => {
        void (async () => {
            const route = routeTemplate(req);
            req.auditRoute = route;
            const cookies = (0, helpers_1.parseCookies)(req);
            if (!req.adminUser && cookies.admin_session === 'true' && cookies.admin_user) {
                try {
                    const adminUser = await (0, adminAuth_1.getAdminUserByUsername)(cookies.admin_user);
                    if (adminUser)
                        req.adminUser = adminUser;
                }
                catch {
                    // Audit still records the request as anonymous if the actor lookup is unavailable.
                }
            }
            const status = res.statusCode;
            const failed = Boolean(res.locals.auditResponseFailed) || status >= 400;
            const outcome = failed ? 'FAILED' : status >= 300 ? 'REDIRECTED' : 'COMPLETED';
            const existingEvents = Number(req.auditEventCount || 0);
            if (existingEvents > 0 && !failed)
                return;
            const target = requestTarget(req);
            await (0, auditLog_service_1.writeAuditLog)(req, {
                eventType: `MUTATION_REQUEST_${outcome}`,
                entityType: 'HTTP_REQUEST',
                entityId: requestId,
                teamId: null,
                metadata: {
                    operationEntity: target.entityType,
                    targetId: target.entityId === requestId ? null : target.entityId,
                    action: requestAction(req, target.entityId === requestId ? '' : target.entityId),
                    method: String(req.method || '').toUpperCase(),
                    route,
                    httpStatus: String(status),
                    outcome,
                    failureClass: failed ? failureClass(status) : null,
                    failureCode: failed ? String(res.locals.auditFailureCode || '') || null : null,
                    persistenceState: String(req.auditPersistenceState || '') || 'NOT_CONFIRMED_BY_DOMAIN_AUDIT',
                    requestId
                }
            });
        })().catch(error => {
            const route = routeTemplate(req);
            console.error(JSON.stringify({
                level: 'error',
                event: 'AUDIT_LOG_WRITE_FAILED',
                requestId,
                method: req.method,
                route,
                errorName: error instanceof Error ? error.name : 'UnknownError'
            }));
        });
    });
    next();
}
