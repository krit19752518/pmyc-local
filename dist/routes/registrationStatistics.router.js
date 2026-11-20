"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRegistrationStatisticsRouter = createRegistrationStatisticsRouter;
const express_1 = require("express");
const helpers_1 = require("../utils/helpers");
const registrationStatistics_store_1 = require("../services/registrationStatistics.store");
const registrationStatistics_export_1 = require("../services/registrationStatistics.export");
const registrationStatistics_registry_1 = require("../services/registrationStatistics.registry");
const registrationStatistics_service_1 = require("../services/registrationStatistics.service");
const registrationStatistics_1 = require("../views/registrationStatistics");
const db_1 = require("../db");
const registrationStatistics_read_1 = require("../services/registrationStatistics.read");
const registrationStatistics_date_1 = require("../services/registrationStatistics.date");
const adminAuth_1 = require("../adminAuth");
const adminSession_service_1 = require("../services/adminSession.service");
const REGISTRY_META = {
    name: 'Thailand Geography JSON (MIT)',
    url: 'https://github.com/thailand-geography-data/thailand-geography-json'
};
function getCookieValues(req, name) {
    const header = String(req.headers.cookie || '');
    if (!header)
        return [];
    const values = [];
    for (const part of header.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1)
            continue;
        const k = part.slice(0, idx).trim();
        if (k !== name)
            continue;
        try {
            values.push(decodeURIComponent(part.slice(idx + 1).trim()));
        }
        catch {
            values.push(part.slice(idx + 1).trim());
        }
    }
    return values;
}
async function isAuthorizedForApprovalStats(req) {
    if (process.env.APPROVAL_STATS_PUBLIC_ENABLED === 'true')
        return true;
    for (const satToken of [...getCookieValues(req, 'phase2_sat_session'), ...getCookieValues(req, 'sat_session')]) {
        const sat = (0, adminSession_service_1.verifyAdminSessionToken)(satToken, 'sat');
        if (sat) {
            const user = await (0, adminAuth_1.getAdminUserByUsername)(sat.username);
            if (user && user.roleCode === 'SAT_OFFICER')
                return true;
        }
    }
    for (const centralToken of getCookieValues(req, 'admin_session')) {
        const central = (0, adminSession_service_1.verifyAdminSessionToken)(centralToken, 'central');
        if (central) {
            const user = await (0, adminAuth_1.getAdminUserByUsername)(central.username);
            if (user && user.roleCode !== 'SAT_OFFICER')
                return true;
        }
    }
    return false;
}
function createRegistrationStatisticsRouter(store = new registrationStatistics_store_1.StatisticsStore(), readCurrent = () => (0, registrationStatistics_read_1.readCurrentStatistics)(db_1.pool), deps = {}) {
    const readReg = deps.readRegistration || ((range) => (0, registrationStatistics_read_1.readRegistrationStatistics)(db_1.pool, range));
    const readApp = deps.readApproval || ((range) => (0, registrationStatistics_read_1.readApprovalStatistics)(db_1.pool, range));
    const checkAuth = deps.isApprovalAuthorized || isAuthorizedForApprovalStats;
    const router = (0, express_1.Router)();
    router.get('/registration-statistics.php', (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.send((0, registrationStatistics_1.renderRegistrationStatistics)((0, helpers_1.getBaseUrl)(req)));
    });
    router.get(['/api/public/registration-statistics', '/api/public/registration-statistics.csv'], async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const id = req.query.snapshotId;
        if (id !== undefined && (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))) {
            res.status(400).json({ error: 'invalid_snapshot' });
            return;
        }
        const csv = req.path.endsWith('.csv');
        if (csv && !id && !req.query.preset && !req.query.from && !req.query.to) {
            res.status(400).json({ error: 'snapshot_required' });
            return;
        }
        const hasDateQuery = !id && (req.query.preset !== undefined ||
            req.query.from !== undefined ||
            req.query.to !== undefined ||
            req.query.includeTrend === '1');
        try {
            if (hasDateQuery) {
                let range;
                try {
                    range = (0, registrationStatistics_date_1.parseBangkokDateRange)(req.query);
                }
                catch (err) {
                    if (err instanceof registrationStatistics_date_1.DateRangeError) {
                        res.status(400).json({ error: err.code, message: err.message });
                        return;
                    }
                    throw err;
                }
                const snapshot = await readReg(range);
                res.setHeader('X-Statistics-Snapshot', snapshot.snapshotId);
                res.setHeader('X-Statistics-Stale', 'false');
                if (csv) {
                    res.setHeader('Content-Disposition', 'attachment; filename="PMYC-registration-statistics.csv"');
                    res.type('text/csv; charset=utf-8').send((0, registrationStatistics_export_1.statisticsCsv)(snapshot, req.query));
                }
                else {
                    res.json({ ...snapshot, stale: false, zones: registrationStatistics_registry_1.BANGKOK_ZONES, registry: REGISTRY_META });
                }
                return;
            }
            // Only explicitly pinned historical reads use disk. Current pages always read DB.
            const snapshot = id ? await store.read(id) : await readCurrent();
            if (!snapshot) {
                res.status(id ? 404 : 503).json({ error: id ? 'snapshot_not_found' : 'statistics_unavailable' });
                return;
            }
            if (!id && snapshot.definitionVersion !== registrationStatistics_service_1.DEFINITION_VERSION) {
                res.status(503).json({ error: 'statistics_unavailable' });
                return;
            }
            const stale = id ? await store.stale(snapshot) : false;
            res.setHeader('X-Statistics-Snapshot', snapshot.snapshotId);
            res.setHeader('X-Statistics-Stale', String(stale));
            if (csv) {
                res.setHeader('Content-Disposition', 'attachment; filename="PMYC-registration-statistics.csv"');
                res.type('text/csv; charset=utf-8').send((0, registrationStatistics_export_1.statisticsCsv)(snapshot, req.query));
            }
            else {
                res.json({ ...snapshot, stale, zones: registrationStatistics_registry_1.BANGKOK_ZONES, registry: REGISTRY_META });
            }
        }
        catch {
            res.status(503).json({ error: 'statistics_unavailable' });
        }
    });
    router.get([
        '/api/authorized/age-group-approval-statistics',
        '/api/authorized/age-group-approval-statistics.csv',
        '/admin/api/age-group-approval-statistics',
        '/admin/api/age-group-approval-statistics.csv'
    ], async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        try {
            const allowed = await checkAuth(req);
            if (!allowed) {
                res.status(403).json({
                    error: 'approval_statistics_restricted',
                    message: 'รายงานสถิติการอนุมัติจำกัดเฉพาะเจ้าหน้าที่ กกท. กรุณาเข้าสู่ระบบเจ้าหน้าที่ก่อนดูข้อมูล'
                });
                return;
            }
            let range;
            try {
                range = (0, registrationStatistics_date_1.parseBangkokDateRange)(req.query);
            }
            catch (err) {
                if (err instanceof registrationStatistics_date_1.DateRangeError) {
                    res.status(400).json({ error: err.code, message: err.message });
                    return;
                }
                throw err;
            }
            const snapshot = await readApp(range);
            const csv = req.path.endsWith('.csv');
            res.setHeader('X-Statistics-Snapshot', snapshot.snapshotId);
            res.setHeader('X-Statistics-Stale', 'false');
            if (csv) {
                res.setHeader('Content-Disposition', 'attachment; filename="PMYC-approval-statistics.csv"');
                res.type('text/csv; charset=utf-8').send((0, registrationStatistics_export_1.statisticsCsv)(snapshot, req.query));
            }
            else {
                res.json({ ...snapshot, stale: false, zones: registrationStatistics_registry_1.BANGKOK_ZONES, registry: REGISTRY_META });
            }
        }
        catch {
            res.status(503).json({ error: 'statistics_unavailable' });
        }
    });
    return router;
}
