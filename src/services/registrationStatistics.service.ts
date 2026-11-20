import { createHash } from 'node:crypto';
import { getRegistrationArea, RegistrationAreaTeam } from '../utils/teamArea';
import { splitTeamCategories } from '../utils/teamCategoryState';
import { AREA_REGISTRY, BANGKOK_ZONES, REGISTRY_VERSION } from './registrationStatistics.registry';

export const AGES = ['U14', 'U16', 'U18'] as const;
export type Counts = [number, number, number];
export interface CountableTeam extends RegistrationAreaTeam {
  id: unknown; categories?: unknown; is_deleted?: unknown; is_test?: unknown;
  cancelled_categories?: unknown; cancelledCategories?: unknown;
}
export interface District { code: string; name: string; ages: Counts; }
export interface Province { code: string; name: string; ages: Counts; unassigned: Counts; districts: District[]; }
export interface StatisticsSnapshot {
  snapshotId: string; asOf: string; generatedAt: string; timezone: 'Asia/Bangkok';
  jobKey: string; seasonScope: string; definitionVersion: string; includesCancelled: boolean;
  registryVersion: string; ages: Counts; unassigned: Counts; provinces: Province[];
}
export const LEGACY_DEFINITION_VERSION = 'cumulative-registered-entitlements/v1';
export const DEFINITION_VERSION = 'registered-entitlements-excluding-cancelled/v2';
export const SEASON_SCOPE = 'registered-team/current-report-scope';
export const zero = (): Counts => [0, 0, 0];
export const add = (a: Counts, b: Counts): Counts => a.map((v, i) => v + b[i]) as Counts;
export const sum = (rows: { ages: Counts }[]): Counts => rows.reduce((v, r) => add(v, r.ages), zero());
export const total = (v: Counts) => v.reduce((a, b) => a + b, 0);

/** Cumulative enrollment is the default; active-registration reports explicitly opt out. */
export function registeredEntitlements(rows: CountableTeam[], { includeCancelled = true } = {}) {
  const teams = new Map<string, { id: string; ages: Counts; province: string; district: string }>();
  for (const row of rows) {
    if (row.is_deleted || row.is_test) continue;
    const categories = splitTeamCategories(row.categories);
    const cancelled = splitTeamCategories(row.cancelled_categories || row.cancelledCategories);
    // Display/status markers are not enrollment tokens. Never infer from submitted/roster.
    if (!AGES.some(age => categories.includes(age))) continue;
    const ages = AGES.map(age => categories.includes(age) && (includeCancelled || !cancelled.includes(age)) ? 1 : 0) as Counts;
    if (typeof row.id !== 'string' || !row.id.trim()) throw new Error('Missing registration identity');
    const item = { id: row.id, ages, ...getRegistrationArea(row) };
    const prior = teams.get(item.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(item)) throw new Error('Conflicting duplicate registration');
    teams.set(item.id, item);
  }
  return [...teams.values()].filter(team => total(team.ages) > 0);
}

/** Most recently due 23:00 Bangkok run, also used for restart-safe daily idempotency. */
export function dueJobKey(now = new Date()): string {
  return new Date(now.getTime() + 7 * 3600000 - 23 * 3600000).toISOString().slice(0, 10);
}
function contentId(value: Omit<StatisticsSnapshot, 'snapshotId'>) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function buildStatistics(rows: CountableTeam[], asOf: string, generatedAt = new Date().toISOString()): StatisticsSnapshot {
  const provinces: Province[] = AREA_REGISTRY.map(p => ({ code: p.code, name: p.name, ages: zero(), unassigned: zero(), districts: p.districts.map(d => ({ ...d, ages: zero() })) }));
  let ages = zero(), unassigned = zero();
  for (const team of registeredEntitlements(rows, { includeCancelled: false })) {
    ages = add(ages, team.ages);
    const province = provinces.find(p => p.name === team.province);
    if (!province) { unassigned = add(unassigned, team.ages); continue; }
    province.ages = add(province.ages, team.ages);
    const district = province.districts.find(d => d.name === team.district);
    if (district) district.ages = add(district.ages, team.ages);
    else province.unassigned = add(province.unassigned, team.ages);
  }
  const body: Omit<StatisticsSnapshot, 'snapshotId'> = { asOf, generatedAt, timezone: 'Asia/Bangkok', jobKey: dueJobKey(new Date(asOf)), seasonScope: SEASON_SCOPE, definitionVersion: DEFINITION_VERSION, includesCancelled: false, registryVersion: REGISTRY_VERSION, ages, unassigned, provinces };
  return validateStatistics({ snapshotId: contentId(body), ...body });
}
const sameCounts = (a: Counts, b: Counts) => a.every((n, i) => n === b[i]);
function keys(value: any, expected: string[]) {
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join('|') !== [...expected].sort().join('|')) throw new Error('Invalid statistics fields');
}
function counts(value: any): Counts {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Invalid aggregate counts');
  return [...value] as Counts;
}
/** Validate and project the public allowlist, including every registry code and reconciliation. */
export function validateStatistics(input: any): StatisticsSnapshot {
  keys(input, ['snapshotId','asOf','generatedAt','timezone','jobKey','seasonScope','definitionVersion','includesCancelled','registryVersion','ages','unassigned','provinces']);
  const current = input.definitionVersion === DEFINITION_VERSION && input.includesCancelled === false;
  const legacy = input.definitionVersion === LEGACY_DEFINITION_VERSION && input.includesCancelled === true;
  if (input.timezone !== 'Asia/Bangkok' || (!current && !legacy) || input.registryVersion !== REGISTRY_VERSION || input.seasonScope !== SEASON_SCOPE) throw new Error('Invalid statistics definition');
  for (const field of ['asOf','generatedAt']) if (typeof input[field] !== 'string' || !Number.isFinite(Date.parse(input[field])) || new Date(input[field]).toISOString() !== input[field]) throw new Error('Invalid snapshot time');
  if (Date.parse(input.generatedAt) < Date.parse(input.asOf) || input.jobKey !== dueJobKey(new Date(input.asOf))) throw new Error('Invalid snapshot chronology');
  if (!Array.isArray(input.provinces) || input.provinces.length !== AREA_REGISTRY.length) throw new Error('Incomplete province registry');
  const provinces: Province[] = AREA_REGISTRY.map((master, i) => {
    const p = input.provinces[i]; keys(p, ['code','name','ages','unassigned','districts']);
    if (p.code !== master.code || p.name !== master.name || !Array.isArray(p.districts) || p.districts.length !== master.districts.length) throw new Error('Invalid province registry');
    const districts = master.districts.map((d, j) => {
      const row = p.districts[j]; keys(row, ['code','name','ages']);
      if (row.code !== d.code || row.name !== d.name) throw new Error('Invalid district registry');
      return { ...d, ages: counts(row.ages) };
    });
    const row = { code: master.code, name: master.name, ages: counts(p.ages), unassigned: counts(p.unassigned), districts };
    if (!sameCounts(row.ages, add(sum(districts), row.unassigned))) throw new Error('Province totals do not reconcile');
    return row;
  });
  const ages = counts(input.ages), unassigned = counts(input.unassigned);
  if (!sameCounts(ages, add(sum(provinces), unassigned))) throw new Error('National totals do not reconcile');
  const bkk = provinces.find(p => p.code === '10')!;
  const zoneDistricts = BANGKOK_ZONES.flatMap(z => z.districts);
  if (BANGKOK_ZONES.map(z => z.districts.length).join('/') !== '15/16/19' || new Set(zoneDistricts).size !== 50 || bkk.districts.some(d => !zoneDistricts.includes(d.name))) throw new Error('Invalid Bangkok partition');
  const body: Omit<StatisticsSnapshot,'snapshotId'> = { asOf: input.asOf, generatedAt: input.generatedAt, timezone: 'Asia/Bangkok', jobKey: input.jobKey, seasonScope: SEASON_SCOPE, definitionVersion: input.definitionVersion, includesCancelled: input.includesCancelled, registryVersion: REGISTRY_VERSION, ages, unassigned, provinces };
  if (input.snapshotId !== contentId(body)) throw new Error('Snapshot content digest mismatch');
  return { snapshotId: input.snapshotId, ...body };
}
