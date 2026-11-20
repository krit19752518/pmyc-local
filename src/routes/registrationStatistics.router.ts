import { Router } from 'express';
import { getBaseUrl } from '../utils/helpers';
import { StatisticsStore } from '../services/registrationStatistics.store';
import { statisticsCsv } from '../services/registrationStatistics.export';
import { BANGKOK_ZONES } from '../services/registrationStatistics.registry';
import { DEFINITION_VERSION } from '../services/registrationStatistics.service';
import { renderRegistrationStatistics } from '../views/registrationStatistics';
import { pool } from '../db';
import { readCurrentStatistics } from '../services/registrationStatistics.read';
import type { StatisticsSnapshot } from '../services/registrationStatistics.service';

export function createRegistrationStatisticsRouter(store = new StatisticsStore(), readCurrent: () => Promise<StatisticsSnapshot> = () => readCurrentStatistics(pool)) {
  const router = Router();
  router.get('/registration-statistics.php', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.send(renderRegistrationStatistics(getBaseUrl(req)));
  });
  router.get(['/api/public/registration-statistics','/api/public/registration-statistics.csv'], async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const id = req.query.snapshotId;
    if (id !== undefined && (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))) { res.status(400).json({ error: 'invalid_snapshot' }); return; }
    const csv = req.path.endsWith('.csv');
    if (csv && !id) { res.status(400).json({ error: 'snapshot_required' }); return; }
    try {
      // Only explicitly pinned historical reads use disk. Current pages always read DB.
      const snapshot = id ? await store.read(id as string) : await readCurrent();
      if (!snapshot) { res.status(id ? 404 : 503).json({ error: id ? 'snapshot_not_found' : 'statistics_unavailable' }); return; }
      // Historical exports remain pinned to their original definition. Current UI must
      // never label an old cumulative snapshot as excluding cancelled registrations.
      if (!id && snapshot.definitionVersion !== DEFINITION_VERSION) { res.status(503).json({ error: 'statistics_unavailable' }); return; }
      const stale = id ? await store.stale(snapshot) : false;
      res.setHeader('X-Statistics-Snapshot', snapshot.snapshotId);
      res.setHeader('X-Statistics-Stale', String(stale));
      if (csv) {
        res.setHeader('Content-Disposition', 'attachment; filename="PMYC-registration-statistics.csv"');
        res.type('text/csv; charset=utf-8').send(statisticsCsv(snapshot, req.query));
      } else res.json({ ...snapshot, stale, zones: BANGKOK_ZONES, registry: { name: 'Thailand Geography JSON (MIT)', url: 'https://github.com/thailand-geography-data/thailand-geography-json' } });
    } catch { res.status(503).json({ error: 'statistics_unavailable' }); }
  });
  return router;
}
