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
function createRegistrationStatisticsRouter(store = new registrationStatistics_store_1.StatisticsStore(), readCurrent = () => (0, registrationStatistics_read_1.readCurrentStatistics)(db_1.pool)) {
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
        if (csv && !id) {
            res.status(400).json({ error: 'snapshot_required' });
            return;
        }
        try {
            // Only explicitly pinned historical reads use disk. Current pages always read DB.
            const snapshot = id ? await store.read(id) : await readCurrent();
            if (!snapshot) {
                res.status(id ? 404 : 503).json({ error: id ? 'snapshot_not_found' : 'statistics_unavailable' });
                return;
            }
            // Historical exports remain pinned to their original definition. Current UI must
            // never label an old cumulative snapshot as excluding cancelled registrations.
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
            else
                res.json({ ...snapshot, stale, zones: registrationStatistics_registry_1.BANGKOK_ZONES, registry: { name: 'Thailand Geography JSON (MIT)', url: 'https://github.com/thailand-geography-data/thailand-geography-json' } });
        }
        catch {
            res.status(503).json({ error: 'statistics_unavailable' });
        }
    });
    return router;
}
