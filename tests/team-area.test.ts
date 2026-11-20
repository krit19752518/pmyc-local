import vm from 'vm';
import { BANGKOK_DISTRICTS, getRegistrationArea, getTeamDistrictName, normalizeDistrictForSave, renderTeamAreaClientScript } from '../src/utils/teamArea';
import { getTeamRegistrationRanks } from '../src/services/teamRegistrationRank.service';

const bkk = (id: string, district: string, changes: any = {}) => ({ id, province: 'กรุงเทพมหานคร', district,
  bkk_zone: 'พระนคร 2', categories: 'U14,U16,U18', createdAt: '2026-10-01T00:00:00Z', ...changes });

test('Bangkok aliases and district prefixes share a district, never a competition zone', () => {
  const teams = [bkk('a', 'บางกะปิ'), bkk('b', ' เขต บางกะปิ ', { province: 'กรุงเทพฯ' }), bkk('c', 'มีนบุรี')];
  const ranks = getTeamRegistrationRanks(teams);
  expect(ranks.a).toEqual({ U14: 1, U16: 1, U18: 1 });
  expect(ranks.b).toEqual({ U14: 2, U16: 2, U18: 2 });
  expect(ranks.c).toEqual({ U14: 1, U16: 1, U18: 1 });
  expect(teams.map(getTeamDistrictName)).toEqual(['บางกะปิ', 'บางกะปิ', 'มีนบุรี']);
});

test.each(['', '   ', 'พระนคร 2', 'เขตไม่มีจริง'])('missing/invalid district %j receives no fabricated rank', district => {
  expect(getTeamRegistrationRanks([bkk('invalid', district)]).invalid).toBeUndefined();
});

test('contact fallback requires a matching province and never overrides the registration district', () => {
  expect(getRegistrationArea(bkk('a', 'เขตบางกะปิ', { contact_province: 'กรุงเทพมหานคร', contact_district: 'วังทองหลาง' })).district).toBe('บางกะปิ');
  expect(getRegistrationArea(bkk('a', ' ', { contact_province: 'กรุงเทพฯ', contact_district: 'เขตบางกะปิ' })).district).toBe('บางกะปิ');
  for (const province of ['', 'เชียงใหม่']) expect(getRegistrationArea(bkk('a', '', { contact_province: province, contact_district: 'บางกะปิ' })).district).toBe('');
});

test('Bang Kapi snapshot gives 3/5/3 ranks without counting other districts, deleted, cancelled or Demo', () => {
  const teams = [bkk('FTM-108', 'บางกะปิ'), bkk('FTM-306', 'เขตบางกะปิ', { createdAt: '2026-10-02', cancelled_categories: 'U14,U18' }),
    bkk('FTM-909', 'เขตบางกะปิ', { createdAt: '2026-10-22' }), bkk('FTM-1212', 'บางกะปิ', { createdAt: '2026-11-02', categories: 'U16' }),
    bkk('FTM-1269', 'บางกะปิ', { createdAt: '2026-11-05' }), bkk('other', 'มีนบุรี'), bkk('deleted', 'บางกะปิ', { is_deleted: true }), bkk('demo', 'บางกะปิ', { isTest: true })];
  const ranks = getTeamRegistrationRanks(teams);
  expect(ranks['FTM-108']).toEqual({ U14: 1, U16: 1, U18: 1 });
  expect(ranks['FTM-306']).toEqual({ U16: 2 });
  expect(ranks['FTM-909']).toEqual({ U14: 2, U16: 3, U18: 2 });
  expect(ranks['FTM-1212']).toEqual({ U16: 4 });
  expect(ranks['FTM-1269']).toEqual({ U14: 3, U16: 5, U18: 3 });
  expect(getTeamRegistrationRanks([...teams].reverse())).toEqual(ranks);
});

test('server saves canonical Bangkok district, rejects invalid new values, preserves unknown unchanged legacy', () => {
  expect(normalizeDistrictForSave(' เขต บางกะปิ ', 'กรุงเทพฯ')).toBe('บางกะปิ');
  expect(normalizeDistrictForSave('แม่ริม', 'เชียงใหม่')).toBe('แม่ริม');
  expect(() => normalizeDistrictForSave('พระนคร 2', 'กรุงเทพมหานคร')).toThrow();
  expect(normalizeDistrictForSave('เขตเก่า', 'กรุงเทพมหานคร', 'เขตเก่า')).toBe('เขตเก่า');
  expect(normalizeDistrictForSave('เก่า', 'กรุงเทพมหานคร', 'เขตเก่า')).toBe('เขตเก่า');
  expect(normalizeDistrictForSave('', 'กรุงเทพมหานคร')).toBe('');
});

test('generated browser resolver executes with the same server results and 50 valid districts', () => {
  const context: any = { window: {} };
  vm.runInNewContext(renderTeamAreaClientScript().replace(/^<script>|<\/script>$/g, ''), context);
  const client = context.window.PmycTeamArea;
  expect(BANGKOK_DISTRICTS).toHaveLength(50);
  for (const district of [...BANGKOK_DISTRICTS, 'เขต บางกะปิ', '', 'พระนคร 2']) {
    const team = bkk('a', district);
    expect(client.getRegistrationArea(team)).toEqual(getRegistrationArea(team));
    expect(client.getTeamDistrictName(team)).toBe(getTeamDistrictName(team));
  }
});
