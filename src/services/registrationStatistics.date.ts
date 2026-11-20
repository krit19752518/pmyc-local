import { createHash } from 'node:crypto';
import { getRegistrationArea, RegistrationAreaTeam } from '../utils/teamArea';
import { splitTeamCategories } from '../utils/teamCategoryState';
import { getCategoryStatus, PlayerStatusInfo } from '../utils/statusHelper';
import { AREA_REGISTRY, REGISTRY_VERSION } from './registrationStatistics.registry';
import {
  AGES,
  Counts,
  DEFINITION_VERSION,
  Province,
  SEASON_SCOPE,
  add,
  zero
} from './registrationStatistics.service';

export const APPROVAL_DEFINITION_VERSION = 'age-group-current-approved-latest-transition/v1';
const BANGKOK_OFFSET_MS = 7 * 3600 * 1000;

export type DatePreset = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export interface DateRangeFilter {
  preset: DatePreset;
  from: string | null;
  to: string | null;
  startUtc: Date | null;
  endExclusiveUtc: Date | null;
}

export interface TrendPoint {
  date: string;
  total: number;
  u14: number;
  u16: number;
  u18: number;
}

export interface PeriodStatisticsSnapshot {
  snapshotId: string;
  asOf: string;
  generatedAt: string;
  timezone: 'Asia/Bangkok';
  seasonScope: string;
  definitionVersion: string;
  includesCancelled: boolean;
  registryVersion: string;
  selectedDateField: 'age_group_created_at' | 'age_group_approved_at';
  dateRange: { preset: DatePreset; from: string | null; to: string | null };
  ages: Counts;
  unassigned: Counts;
  provinces: Province[];
  trend: TrendPoint[];
  legacyMissingTimestampCount?: number;
}

export interface RegistrationAuditRow {
  team_id: string | null;
  event_type: string;
  old_state?: Record<string, unknown> | null;
  new_state?: Record<string, unknown> | null;
  created_at: string | Date;
}

export interface TeamDateRow extends RegistrationAreaTeam {
  id: string;
  status?: string;
  categories?: string | null;
  cancelled_categories?: string | null;
  is_deleted?: boolean | null;
  is_test?: boolean | null;
  created_at?: string | Date | null;
}

export interface PlayerApprovalRow extends PlayerStatusInfo {
  id: string;
  team_id: string;
  category?: string;
  doc_status?: string | null;
}

export class DateRangeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export function toBangkokDateKey(date: Date): string {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function bangkokMidnightUtc(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+07:00`);
}

/** Parse and validate Asia/Bangkok date presets and custom inclusive ranges. */
export function parseBangkokDateRange(query: Record<string, unknown>, now = new Date()): DateRangeFilter {
  const str = (key: string) => (typeof query[key] === 'string' ? String(query[key]).trim() : '');
  const rawPreset = str('preset');
  const rawFrom = str('from');
  const rawTo = str('to');
  const todayKey = toBangkokDateKey(now);

  let preset: DatePreset;
  if (!rawPreset) {
    preset = rawFrom || rawTo ? 'custom' : 'all';
  } else if (['all', 'today', 'yesterday', 'week', 'month', 'custom'].includes(rawPreset)) {
    preset = rawPreset as DatePreset;
  } else {
    throw new DateRangeError('invalid_date_preset', 'รูปแบบช่วงเวลาที่เลือกไม่ถูกต้อง');
  }

  let from: string | null = null;
  let to: string | null = null;

  if (preset === 'all') {
    return { preset: 'all', from: null, to: null, startUtc: null, endExclusiveUtc: null };
  } else if (preset === 'today') {
    from = todayKey;
    to = todayKey;
  } else if (preset === 'yesterday') {
    const yKey = addDaysToDateKey(todayKey, -1);
    from = yKey;
    to = yKey;
  } else if (preset === 'week') {
    const [y, m, d] = todayKey.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    from = addDaysToDateKey(todayKey, mondayOffset);
    to = todayKey;
  } else if (preset === 'month') {
    from = `${todayKey.slice(0, 8)}01`;
    to = todayKey;
  } else {
    if (!rawFrom || !rawTo) {
      throw new DateRangeError('incomplete_date_range', 'กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุด');
    }
    if (!isValidDateKey(rawFrom) || !isValidDateKey(rawTo)) {
      throw new DateRangeError('invalid_date_format', 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)');
    }
    if (rawFrom > rawTo) {
      throw new DateRangeError('invalid_date_range', 'วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด');
    }
    if (rawFrom > todayKey || rawTo > todayKey) {
      throw new DateRangeError('future_date_not_allowed', 'ไม่สามารถเลือกวันที่ในอนาคตได้');
    }
    from = rawFrom;
    to = rawTo;
  }

  return {
    preset,
    from,
    to,
    startUtc: bangkokMidnightUtc(from),
    endExclusiveUtc: bangkokMidnightUtc(addDaysToDateKey(to, 1))
  };
}

function inDateRange(ts: Date | null, range: DateRangeFilter): boolean {
  if (range.preset === 'all') return true;
  if (!ts || !Number.isFinite(ts.getTime())) return false;
  if (range.startUtc && ts.getTime() < range.startUtc.getTime()) return false;
  if (range.endExclusiveUtc && ts.getTime() >= range.endExclusiveUtc.getTime()) return false;
  return true;
}

function emptyProvinces(): Province[] {
  return AREA_REGISTRY.map(p => ({
    code: p.code,
    name: p.name,
    ages: zero(),
    unassigned: zero(),
    districts: p.districts.map(d => ({ ...d, ages: zero() }))
  }));
}

function addAgeToArea(
  provinces: Province[],
  nationalAges: Counts,
  nationalUnassigned: Counts,
  team: RegistrationAreaTeam,
  ageIndex: number
): { ages: Counts; unassigned: Counts } {
  const delta: Counts = [0, 0, 0];
  delta[ageIndex] = 1;
  const nextAges = add(nationalAges, delta);
  const area = getRegistrationArea(team);
  const province = provinces.find(p => p.name === area.province);
  if (!province) {
    return { ages: nextAges, unassigned: add(nationalUnassigned, delta) };
  }
  province.ages = add(province.ages, delta);
  const district = province.districts.find(d => d.name === area.district);
  if (district) district.ages = add(district.ages, delta);
  else province.unassigned = add(province.unassigned, delta);
  return { ages: nextAges, unassigned: nationalUnassigned };
}

function addTrendPoint(trendMap: Map<string, Counts>, ts: Date | null, ageIndex: number) {
  if (!ts || !Number.isFinite(ts.getTime())) return;
  const key = toBangkokDateKey(ts);
  const cur = trendMap.get(key) || zero();
  cur[ageIndex] += 1;
  trendMap.set(key, cur);
}

function finalizeTrend(trendMap: Map<string, Counts>): TrendPoint[] {
  return [...trendMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, c]) => ({ date, total: c[0] + c[1] + c[2], u14: c[0], u16: c[1], u18: c[2] }));
}

function snapshotDigest(body: Omit<PeriodStatisticsSnapshot, 'snapshotId'>): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

/** Resolve age-group application creation timestamps from category audit logs with team created_at fallback. */
export function buildRegistrationStatisticsForRange(
  teams: TeamDateRow[],
  auditRows: RegistrationAuditRow[],
  asOf: string,
  dateRange: DateRangeFilter
): PeriodStatisticsSnapshot {
  const categoryCreatedMap = new Map<string, Date>();
  const sortedAudits = [...auditRows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  for (const row of sortedAudits) {
    if (!row.team_id) continue;
    if (!['TEAM_CATEGORY_REGISTERED', 'TEAM_CATEGORY_ADDED', 'TEAM_UPDATED'].includes(row.event_type)) continue;
    const oldCats = splitTeamCategories(row.old_state?.categories);
    const newCats = splitTeamCategories(row.new_state?.categories);
    const ts = new Date(row.created_at);
    if (!Number.isFinite(ts.getTime())) continue;
    for (const age of AGES) {
      if (newCats.includes(age) && !oldCats.includes(age)) {
        const key = `${row.team_id}:${age}`;
        if (!categoryCreatedMap.has(key)) categoryCreatedMap.set(key, ts);
      }
    }
  }

  const provinces = emptyProvinces();
  let ages = zero();
  let unassigned = zero();
  const trendMap = new Map<string, Counts>();

  for (const team of teams) {
    if (team.is_deleted || team.is_test) continue;
    const cats = splitTeamCategories(team.categories);
    const cancelled = splitTeamCategories(team.cancelled_categories);
    const teamCreated = team.created_at ? new Date(team.created_at) : null;

    for (let i = 0; i < AGES.length; i++) {
      const age = AGES[i];
      if (!cats.includes(age) || cancelled.includes(age)) continue;
      const eventTs = categoryCreatedMap.get(`${team.id}:${age}`) || teamCreated;
      if (!inDateRange(eventTs, dateRange)) continue;
      ({ ages, unassigned } = addAgeToArea(provinces, ages, unassigned, team, i));
      addTrendPoint(trendMap, eventTs, i);
    }
  }

  const body: Omit<PeriodStatisticsSnapshot, 'snapshotId'> = {
    asOf,
    generatedAt: asOf,
    timezone: 'Asia/Bangkok',
    seasonScope: SEASON_SCOPE,
    definitionVersion: DEFINITION_VERSION,
    includesCancelled: false,
    registryVersion: REGISTRY_VERSION,
    selectedDateField: 'age_group_created_at',
    dateRange: { preset: dateRange.preset, from: dateRange.from, to: dateRange.to },
    ages,
    unassigned,
    provinces,
    trend: finalizeTrend(trendMap)
  };
  return { snapshotId: snapshotDigest(body), ...body };
}

/** Compute age-group approval statistics using confirmed OQ1-OQ5 rules. */
export function buildApprovalStatisticsForRange(
  teams: TeamDateRow[],
  players: PlayerApprovalRow[],
  auditRows: RegistrationAuditRow[],
  asOf: string,
  dateRange: DateRangeFilter
): PeriodStatisticsSnapshot {
  const latestTeamApproved = new Map<string, Date>();
  const latestPlayerApproved = new Map<string, Date>();

  for (const row of auditRows) {
    const ts = new Date(row.created_at);
    if (!Number.isFinite(ts.getTime())) continue;
    if (row.event_type === 'TEAM_STATUS_CHANGED' && row.team_id && String(row.new_state?.status || '').toUpperCase() === 'APPROVED') {
      const prev = latestTeamApproved.get(row.team_id);
      if (!prev || ts.getTime() > prev.getTime()) latestTeamApproved.set(row.team_id, ts);
    }
    if (row.event_type === 'PLAYER_DOCUMENT_STATUS_CHANGED' && String(row.new_state?.docStatus || '').toUpperCase() === 'APPROVED') {
      const entityId = String((row as any).entity_id || '');
      if (entityId) {
        const prev = latestPlayerApproved.get(entityId);
        if (!prev || ts.getTime() > prev.getTime()) latestPlayerApproved.set(entityId, ts);
      }
    }
  }

  const playersByTeam = new Map<string, PlayerApprovalRow[]>();
  for (const p of players) {
    const list = playersByTeam.get(p.team_id) || [];
    list.push({ ...p, category: p.category || undefined, docStatus: String(p.doc_status || p.docStatus || '').toUpperCase() });
    playersByTeam.set(p.team_id, list);
  }

  const provinces = emptyProvinces();
  let ages = zero();
  let unassigned = zero();
  let legacyMissingTimestampCount = 0;
  const trendMap = new Map<string, Counts>();

  for (const team of teams) {
    if (team.is_deleted || team.is_test) continue;
    const cats = splitTeamCategories(team.categories);
    const cancelled = splitTeamCategories(team.cancelled_categories);
    const teamPlayers = playersByTeam.get(team.id) || [];
    const teamApprovedAt = latestTeamApproved.get(team.id) || null;

    for (let i = 0; i < AGES.length; i++) {
      const age = AGES[i];
      if (!cats.includes(age) || cancelled.includes(age)) continue;
      const catPlayers = teamPlayers.filter(p => splitTeamCategories(p.category).includes(age));
      if (getCategoryStatus(team as any, age, catPlayers).text !== 'อนุมัติ') continue;

      let approvedAt: Date | null = teamApprovedAt;
      if (approvedAt) {
        const playerTimes = catPlayers
          .filter(p => p.docStatus === 'APPROVED')
          .map(p => latestPlayerApproved.get(String(p.id)))
          .filter((d): d is Date => Boolean(d));
        for (const pt of playerTimes) {
          if (pt.getTime() > approvedAt.getTime()) approvedAt = pt;
        }
      }

      if (!approvedAt) {
        legacyMissingTimestampCount += 1;
        if (dateRange.preset !== 'all') continue;
      } else if (!inDateRange(approvedAt, dateRange)) {
        continue;
      }

      ({ ages, unassigned } = addAgeToArea(provinces, ages, unassigned, team, i));
      if (approvedAt) addTrendPoint(trendMap, approvedAt, i);
    }
  }

  const body: Omit<PeriodStatisticsSnapshot, 'snapshotId'> = {
    asOf,
    generatedAt: asOf,
    timezone: 'Asia/Bangkok',
    seasonScope: SEASON_SCOPE,
    definitionVersion: APPROVAL_DEFINITION_VERSION,
    includesCancelled: false,
    registryVersion: REGISTRY_VERSION,
    selectedDateField: 'age_group_approved_at',
    dateRange: { preset: dateRange.preset, from: dateRange.from, to: dateRange.to },
    ages,
    unassigned,
    provinces,
    trend: finalizeTrend(trendMap),
    legacyMissingTimestampCount
  };
  return { snapshotId: snapshotDigest(body), ...body };
}
