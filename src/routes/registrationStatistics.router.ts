import { Request, Router } from 'express';
import { getBaseUrl, parseCookies } from '../utils/helpers';
import { StatisticsStore } from '../services/registrationStatistics.store';
import { statisticsCsv } from '../services/registrationStatistics.export';
import { BANGKOK_ZONES } from '../services/registrationStatistics.registry';
import { DEFINITION_VERSION } from '../services/registrationStatistics.service';
import { renderRegistrationStatistics } from '../views/registrationStatistics';
import { pool } from '../db';
import { readApprovalStatistics, readCurrentStatistics, readRegistrationStatistics } from '../services/registrationStatistics.read';
import { DateRangeError, DateRangeFilter, parseBangkokDateRange, PeriodStatisticsSnapshot } from '../services/registrationStatistics.date';
import { getAdminUserByUsername } from '../adminAuth';
import { verifyAdminSessionToken } from '../services/adminSession.service';
import type { StatisticsSnapshot } from '../services/registrationStatistics.service';

const REGISTRY_META = {
  name: 'Thailand Geography JSON (MIT)',
  url: 'https://github.com/thailand-geography-data/thailand-geography-json'
};

function getCookieValues(req: Request, name: string): string[] {
  const header = String(req.headers.cookie || '');
  if (!header) return [];
  const values: string[] = [];
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    try {
      values.push(decodeURIComponent(part.slice(idx + 1).trim()));
    } catch {
      values.push(part.slice(idx + 1).trim());
    }
  }
  return values;
}

async function isAuthorizedForApprovalStats(req: Request): Promise<boolean> {
  if (process.env.APPROVAL_STATS_PUBLIC_ENABLED === 'true') return true;
  for (const satToken of [...getCookieValues(req, 'phase2_sat_session'), ...getCookieValues(req, 'sat_session')]) {
    const sat = verifyAdminSessionToken(satToken, 'sat');
    if (sat) {
      const user = await getAdminUserByUsername(sat.username);
      if (user && user.roleCode === 'SAT_OFFICER') return true;
    }
  }
  for (const centralToken of [...getCookieValues(req, 'pmyc_admin_session'), ...getCookieValues(req, 'admin_session')]) {
    const central = verifyAdminSessionToken(centralToken, 'central');
    if (central) {
      const user = await getAdminUserByUsername(central.username);
      if (user && user.roleCode !== 'SAT_OFFICER') return true;
    }
  }
  return false;
}

export interface StatisticsRouterDeps {
  readRegistration?: (range: DateRangeFilter) => Promise<PeriodStatisticsSnapshot>;
  readApproval?: (range: DateRangeFilter) => Promise<PeriodStatisticsSnapshot>;
  isApprovalAuthorized?: (req: Request) => Promise<boolean>;
}

export function createRegistrationStatisticsRouter(
  store = new StatisticsStore(),
  readCurrent: () => Promise<StatisticsSnapshot> = () => readCurrentStatistics(pool),
  deps: StatisticsRouterDeps = {}
) {
  const readReg = deps.readRegistration || ((range: DateRangeFilter) => readRegistrationStatistics(pool, range));
  const readApp = deps.readApproval || ((range: DateRangeFilter) => readApprovalStatistics(pool, range));
  const checkAuth = deps.isApprovalAuthorized || isAuthorizedForApprovalStats;

  const router = Router();
  router.get('/registration-statistics.php', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.send(renderRegistrationStatistics(getBaseUrl(req)));
  });

  router.get(['/api/public/registration-statistics', '/api/public/registration-statistics.csv'], async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const id = req.query.snapshotId;
    if (id !== undefined && (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))) { res.status(400).json({ error: 'invalid_snapshot' }); return; }
    const csv = req.path.endsWith('.csv');
    if (csv && !id && !req.query.preset && !req.query.from && !req.query.to) {
      res.status(400).json({ error: 'snapshot_required' });
      return;
    }

    const hasDateQuery = !id && (
      req.query.preset !== undefined ||
      req.query.from !== undefined ||
      req.query.to !== undefined ||
      req.query.includeTrend === '1'
    );

    try {
      if (hasDateQuery) {
        let range: DateRangeFilter;
        try {
          range = parseBangkokDateRange(req.query as Record<string, unknown>);
        } catch (err) {
          if (err instanceof DateRangeError) {
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
          res.type('text/csv; charset=utf-8').send(statisticsCsv(snapshot as unknown as StatisticsSnapshot, req.query));
        } else {
          res.json({ ...snapshot, stale: false, zones: BANGKOK_ZONES, registry: REGISTRY_META });
        }
        return;
      }

      // Only explicitly pinned historical reads use disk. Current pages always read DB.
      const snapshot = id ? await store.read(id as string) : await readCurrent();
      if (!snapshot) { res.status(id ? 404 : 503).json({ error: id ? 'snapshot_not_found' : 'statistics_unavailable' }); return; }
      if (!id && snapshot.definitionVersion !== DEFINITION_VERSION) { res.status(503).json({ error: 'statistics_unavailable' }); return; }
      const stale = id ? await store.stale(snapshot) : false;
      res.setHeader('X-Statistics-Snapshot', snapshot.snapshotId);
      res.setHeader('X-Statistics-Stale', String(stale));
      if (csv) {
        res.setHeader('Content-Disposition', 'attachment; filename="PMYC-registration-statistics.csv"');
        res.type('text/csv; charset=utf-8').send(statisticsCsv(snapshot, req.query));
      } else {
        res.json({ ...snapshot, stale, zones: BANGKOK_ZONES, registry: REGISTRY_META });
      }
    } catch {
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
      let range: DateRangeFilter;
      try {
        range = parseBangkokDateRange(req.query as Record<string, unknown>);
      } catch (err) {
        if (err instanceof DateRangeError) {
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
        res.type('text/csv; charset=utf-8').send(statisticsCsv(snapshot as unknown as StatisticsSnapshot, req.query));
      } else {
        res.json({ ...snapshot, stale: false, zones: BANGKOK_ZONES, registry: REGISTRY_META });
      }
    } catch {
      res.status(503).json({ error: 'statistics_unavailable' });
    }
  });

  return router;
}
