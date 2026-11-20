jest.mock('../src/db', () => ({ pool: {
  query: async () => ({ rows: [], rowCount: 0 }),
  connect: async () => ({ query: async () => ({ rows: [], rowCount: 0 }), release: () => undefined }),
  end: async () => undefined
} }));
jest.mock('../src/db/initTables', () => ({ initTeamTables: async () => undefined }));
jest.mock('../src/models/team.model', () => ({
  ...jest.requireActual('../src/models/team.model'),
  getDbRegisteredTeams: jest.fn()
}));

import request from 'supertest';
import { app } from '../src/app';
import { satOfficersDatabase } from '../src/adminAuth';
import { getDbRegisteredTeams } from '../src/models/team.model';
import { registeredEntitlements, sum } from '../src/services/registrationStatistics.service';
import { superAdminCookie, satOfficerCookie } from './admin-session-test-helpers';

const satId = 'ISSUE77-SYNTHETIC-SAT';
beforeAll(() => { satOfficersDatabase.push({ id: satId, fullname: 'Synthetic Issue77 SAT',
  position: 'Synthetic', province: 'ชลบุรี', phone: '0000000000',
  email: 'issue77-sat@example.test', passwordHash: 'synthetic-unused', createdAt: '2026-11-13' }); });
afterAll(() => { const index = satOfficersDatabase.findIndex(row => row.id === satId);
  if (index >= 0) satOfficersDatabase.splice(index, 1); });

const reader = jest.mocked(getDbRegisteredTeams);
const team = (id: string, categories: string, cancelled_categories = '', province = 'ชลบุรี') =>
  ({ id, categories, cancelled_categories, province, teamName: 'Synthetic ' + id, status: 'PENDING' });

async function report(rows: any[], sat = false) {
  reader.mockResolvedValue(rows);
  const res = await request(app)
    .get(sat ? '/sat-admin/report-teams-categories.php' : '/admin/report-teams-categories.php')
    .set('Cookie', sat ? satOfficerCookie('issue77-sat@example.test') : superAdminCookie());
  expect(res.status).toBe(200);
  return res.text;
}

function assertCounts(html: string, ages: number[], institutions: number, multi: number) {
  const total = ages.reduce((a, b) => a + b, 0);
  expect(html).toContain(`>ส่งแข่งรวม</div>
            <div class="fs-2 fw-bold text-dark">${total} <span`);
  expect(html).toContain(`สถาบัน/ทีมทั้งหมดในระบบ ${institutions} ทีม`);
  ['U14', 'U16', 'U18'].forEach((age, index) => {
    expect(html).toContain(`>ทีมรุ่น ${age}</div>
            <div class="fs-2 fw-bold text-dark">${ages[index]} <span`);
  });
  const tableCounts = [...html.matchAll(/<td class="text-center fw-bold">(\d+) ทีม<\/td>/g)].map(match => Number(match[1]));
  expect(tableCounts).toEqual(ages);
  expect(html).toContain(`data: [${ages.join(', ')}]`);
  expect(html).toContain(`display-4 fw-bold text-primary mb-2">${multi}</div>`);
  expect(html).not.toContain('NaN');
}

describe('Issue77: active registrations in team/category report', () => {
  it.each([
    ['no cancellation', '', [1, 1, 1], 1],
    ['partial cancellation', ' u14 , U18 ', [0, 1, 0], 0],
    ['all cancelled', 'U14,U16,U18', [0, 0, 0], 0],
    ['orphan cancellation', 'U12', [1, 1, 1], 1]
  ])('%s: total, age cards, table and chart use the same active set', async (_name, cancelled, ages, multi) => {
    const html = await report([team('synthetic-a', 'U14,U16,U18', cancelled as string)]);
    assertCounts(html, ages as number[], 1, multi as number);
  });

  it('counts a restored registration again without changing the shared default', async () => {
    const fixture = team('synthetic-restore', 'U14,U16', 'U14');
    assertCounts(await report([fixture]), [0, 1, 0], 1, 0);
    fixture.cancelled_categories = '';
    assertCounts(await report([fixture]), [1, 1, 0], 1, 1);
    fixture.cancelled_categories = 'U14';
    expect(sum(registeredEntitlements([fixture]))).toEqual([1, 1, 0]);
  });

  it('preserves SAT province scope and deleted-team exclusion', async () => {
    const rows = [team('synthetic-own', 'U14,U16', 'U14'),
      team('synthetic-other', 'U18', '', 'เชียงใหม่'),
      { ...team('synthetic-deleted', 'U18'), is_deleted: true }];
    assertCounts(await report(rows, true), [0, 1, 0], 1, 0);
    assertCounts(await report(rows), [0, 1, 1], 2, 0);
  });

  it('renders an empty report without invalid totals or percentages', async () => {
    assertCounts(await report([]), [0, 0, 0], 0, 0);
  });
});
