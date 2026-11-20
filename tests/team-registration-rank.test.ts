import { getTeamRegistrationRanks } from '../src/services/teamRegistrationRank.service';

const team = (id: string, changes: any = {}) => ({
  id, province: 'เชียงใหม่', district: 'เชียงดาว', categories: 'U14,U16',
  createdAt: '2026-09-30T11:00:00Z', ...changes
});

test('orders by original registration time within province, district and category', () => {
  const ranks = getTeamRegistrationRanks([
    team('later', { createdAt: '2026-11-06T05:00:00Z' }), team('first'),
    team('other-district', { district: 'แม่ริม' }), team('other-province', { province: 'เชียงราย' }),
    team('u18', { categories: 'U18' }),
    team('missing', { district: '', contact_district: '' }),
    team('whitespace', { district: '  ' }), team('no-province', { province: '' })
  ]);
  expect(ranks.first).toEqual({ U14: 1, U16: 1 });
  expect(ranks.later).toEqual({ U14: 2, U16: 2 });
  expect(ranks['other-district'].U14).toBe(1);
  expect(ranks['other-province'].U14).toBe(1);
  expect(ranks.u18).toEqual({ U18: 1 });
  for (const id of ['missing', 'whitespace', 'no-province']) expect(ranks[id]).toBeUndefined();
});

test('cancellation, deletion and restoration recalculate each category independently', () => {
  const first = team('first', { cancelled_categories: 'u14', is_deleted: false });
  const deleted = team('deleted', { is_deleted: true });
  const later = team('later', { createdAt: '2026-11-06T05:00:00Z' });
  expect(getTeamRegistrationRanks([first, deleted, later]).later).toEqual({ U14: 1, U16: 2 });
  first.cancelled_categories = '';
  deleted.is_deleted = false;
  expect(getTeamRegistrationRanks([first, deleted, later]).later).toEqual({ U14: 3, U16: 3 });
});

test('ties are stable regardless of input order; Demo never changes real ranks', () => {
  const a = team('a'), b = team('b'), demo = team('demo', { isTest: true });
  const ranks = getTeamRegistrationRanks([b, demo, a]);
  expect(ranks.a.U14).toBe(1);
  expect(ranks.b.U14).toBe(2);
  expect(ranks.demo.U14).toBe(1);
  expect(getTeamRegistrationRanks([a, b, demo])).toEqual(ranks);
});

test('normalizes Bangkok aliases, zone prefixes, contact fallback and category arrays', () => {
  const ranks = getTeamRegistrationRanks([
    team('a', { province: 'กรุงเทพฯ', district: 'เขต บางรัก', bkk_zone: 'พระนคร 2', categories: ['U14'] }),
    team('b', { province: 'กรุงเทพมหานคร', district: 'บางรัก' }),
    team('c', { province: ' ', contact_province: 'กรุงเทพมหานคร (กกท. ประจำจังหวัด)', district: '', contact_district: 'เขตบางรัก' })
  ]);
  expect(ranks.a.U14).toBe(1);
  expect(ranks.b.U14).toBe(2);
  expect(ranks.c.U14).toBe(3);
});

test('missing or invalid registration dates do not receive a fabricated rank', () => {
  const ranks = getTeamRegistrationRanks([team('bad', { createdAt: 'bad-date' }), team('missing', { createdAt: '' }), team('valid')]);
  expect(ranks.bad).toBeUndefined();
  expect(ranks.missing).toBeUndefined();
  expect(ranks.valid.U14).toBe(1);
});
