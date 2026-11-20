import { normalizeProvince, normalizeDistrictName, normalizeDistrictForSave, getRegistrationArea, renderTeamAreaClientScript } from '../src/utils/teamArea';
import { getTeamCategoryState, getTeamCategoryStates } from '../src/utils/teamCategoryState';
import { getTeamRegistrationRanks } from '../src/services/teamRegistrationRank.service';
import { authorizeCategoryAdmin, reviewTeamCategory, changeTeamCategory, readPersistedCategoryStates, TeamCategoryError } from '../src/services/teamCategory.service';
import vm from 'node:vm';

it('keeps Bangkok administrative districts distinct from competition zones', () => {
  expect(normalizeProvince('กรุงเทพฯ')).toBe('กรุงเทพมหานคร');
  expect(normalizeDistrictName('เขต บางรัก', 'กรุงเทพมหานคร')).toBe('บางรัก');
  expect(getRegistrationArea({ province: 'กรุงเทพฯ', district: 'โซน 1' }).district).toBe('');
  expect(() => normalizeDistrictForSave('โซน 1', 'กรุงเทพมหานคร')).toThrow();
  expect(normalizeDistrictForSave('โซน 1', 'กรุงเทพมหานคร', 'โซน 1')).toBe('โซน 1');
});

it('uses a contact district only when its province matches registration', () => {
  expect(getRegistrationArea({ province: 'เชียงใหม่', contact_province: 'เชียงใหม่', contact_district: 'เมืองเชียงใหม่' }).district).toBe('เมืองเชียงใหม่');
  expect(getRegistrationArea({ province: 'เชียงใหม่', contact_province: 'ชลบุรี', contact_district: 'เมืองชลบุรี' }).district).toBe('');
});

it('runs the same administrative-area rules in the generated browser helper', () => {
  const html = renderTeamAreaClientScript();
  const window: any = {};
  vm.runInNewContext(html.replace(/^<script>|<\/script>$/g, ''), { window });
  expect(window.PmycTeamArea.getRegistrationArea({ province: 'กรุงเทพฯ', district: 'เขต บางรัก' })).toEqual({ province: 'กรุงเทพมหานคร', district: 'บางรัก' });
});

it('does not turn an orphan cancellation into an enrollment', () => {
  expect(getTeamCategoryState({ categories: 'U14', cancelled_categories: 'U16' }, 'U16')).toBe('INCONSISTENT');
  expect(getTeamCategoryState({ categories: 'U14', cancelled_categories: 'U14' }, 'U14')).toBe('CANCELLED');
  expect(getTeamCategoryStates({ categories: 'U14' }, [{ category: 'U18' }], [])).toEqual({ U14: 'ACTIVE', U16: 'NOT_REGISTERED', U18: 'INCONSISTENT' });
});

it('ranks registration within each active category, area and Demo scope', () => {
  const team = { province: 'เชียงใหม่', district: 'เมืองเชียงใหม่', createdAt: '2026-01-01T00:00:00Z', categories: 'U14,U16', status: 'PENDING' };
  const ranks = getTeamRegistrationRanks([
    { ...team, id: 'A', cancelled_categories: 'U16' },
    { ...team, id: 'B', createdAt: '2026-01-02T00:00:00Z' },
    { ...team, id: 'DEMO', isTest: true },
    { ...team, id: 'OTHER', province: 'ชลบุรี', district: 'เมืองชลบุรี' },
    { ...team, id: 'REMOVED', is_deleted: true },
    { ...team, id: 'INVALID', district: '' }
  ]);
  expect(ranks.A).toEqual({ U14: 1 });
  expect(ranks.B).toEqual({ U14: 2, U16: 1 });
  expect(ranks.DEMO).toEqual({ U14: 1, U16: 1 });
  expect(ranks.OTHER).toEqual({ U14: 1, U16: 1 });
  expect(ranks.REMOVED).toBeUndefined();
  expect(ranks.INVALID).toBeUndefined();
});

it.each([
  [{ roleCode: 'SAT_OFFICER', province: 'ชลบุรี', isDemo: false }, { province: 'เชียงใหม่', is_test: false }],
  [{ roleCode: 'DOCUMENT_VERIFIER', isDemo: true }, { province: 'เชียงใหม่', is_test: true }],
  [{ roleCode: 'SUPER_ADMIN', isDemo: false }, { province: 'เชียงใหม่', is_test: true }]
])('retains province, Demo-role and Demo-data isolation', (scope, team) => {
  expect(() => authorizeCategoryAdmin(team, scope)).toThrow(TeamCategoryError);
});

function categoryFixture() {
  const team = { id: 'CATEGORY-FIXTURE', province: 'เชียงใหม่', is_test: false, categories: 'U14,U16', cancelled_categories: 'U14', submitted_categories: 'U16', status: 'APPROVED' };
  const query = jest.fn(async (sql: string, _values: any[] = []) => {
    if (sql.includes('FOR UPDATE')) return { rows: [{ ...team }], rowCount: 1 };
    if (sql.includes('AS player_count')) return { rows: [{ player_count: 0, official_count: 0 }], rowCount: 1 };
    if (sql.startsWith('UPDATE')) return { rows: [{ id: team.id }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  return { team, query, scope: { roleCode: 'SAT_OFFICER', province: 'เชียงใหม่', isDemo: false } };
}

it('requires a current persisted review before restoring one category', async () => {
  const f = categoryFixture();
  const review = await reviewTeamCategory(f, f.team.id, 'U14', f.scope);
  expect(review.action).toBe('restore');
  const result = await changeTeamCategory(f, f.team.id, 'U14', 'restore', { scope: f.scope, reason: 'ตรวจสอบหลักฐานแล้ว', reviewToken: review.reviewToken });
  expect(result.categories).toEqual(['U14', 'U16']);
  expect(result.cancelledCategories).toEqual([]);
  expect(f.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE'))?.[1]).toEqual(['U14,U16', '', f.team.id]);
  expect(f.team.submitted_categories).toBe('U16');
  expect(f.team.status).toBe('APPROVED');
});

it('rejects a stale category review before any update', async () => {
  const f = categoryFixture();
  const review = await reviewTeamCategory(f, f.team.id, 'U14', f.scope);
  f.team.cancelled_categories = '';
  await expect(changeTeamCategory(f, f.team.id, 'U14', 'restore', { scope: f.scope, reason: 'ตรวจสอบหลักฐานแล้ว', reviewToken: review.reviewToken })).rejects.toMatchObject({ status: 409 });
  expect(f.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
});

it('fails closed if persisted category-state queries are unavailable', async () => {
  const query = jest.fn().mockRejectedValue(new Error('synthetic persistence failure'));
  await expect(readPersistedCategoryStates({ query }, [{ id: 'SYNTHETIC-TEAM' }])).rejects.toThrow('synthetic persistence failure');
});
