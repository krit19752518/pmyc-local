jest.mock('../src/db', () => ({ pool: { query: jest.fn() } }));
import { pool } from '../src/db';
import { getDbPlayers, getDbPlayerById } from '../src/models/player.model';

it('preserves a SQL calendar birth date and phone in the popup player DTO', async () => {
  (pool.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'CALENDAR-FIXTURE', team_id: 'TEAM-FIXTURE', birth_date: new Date(2008, 2, 15), phone: '0800000000' }] });
  const rows = await getDbPlayers('TEAM-FIXTURE');
  expect(rows[0]).toMatchObject({ birthDate: '2008-03-15', phone: '0800000000' });
  expect((await getDbPlayerById('CALENDAR-FIXTURE')).birthDate).toBe('2008-03-15');
});
