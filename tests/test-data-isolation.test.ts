jest.mock('../src/db', () => ({ pool: { query: jest.fn(async (sql: string) => {
  if (sql.includes('FROM football_registered_team')) {
    const rows = [
      { id: 'REAL-1', team_name: 'Real team', is_test: false },
      { id: 'TEST-1', team_name: 'Test team', is_test: true }
    ];
    return { rows: sql.includes('COALESCE(is_test, FALSE) = FALSE') ? rows.filter(row => !row.is_test) : rows };
  }
  if (sql.includes('FROM football_player')) {
    const rows = [
      { id: 'PLAYER-REAL', team_id: 'REAL-1', name: 'Real player' },
      { id: 'PLAYER-TEST', team_id: 'TEST-1', name: 'Test player' }
    ];
    return { rows: sql.includes('COALESCE(t.is_test, FALSE) = FALSE') ? rows.filter(row => row.team_id !== 'TEST-1') : rows };
  }
  if (sql.includes('FROM football_official')) {
    const rows = [
      { id: 'OFFICIAL-REAL', team_id: 'REAL-1', name: 'Real official' },
      { id: 'OFFICIAL-TEST', team_id: 'TEST-1', name: 'Test official' }
    ];
    return { rows: sql.includes('COALESCE(t.is_test, FALSE) = FALSE') ? rows.filter(row => row.team_id !== 'TEST-1') : rows };
  }
  return { rows: [] };
}) } }));

import { getDbRegisteredTeams, teamsDatabase } from '../src/models/team.model';
import { getDbPlayers, playersDatabase } from '../src/models/player.model';
import { getDbOfficials, officialsDatabase } from '../src/models/official.model';
import { pool } from '../src/db';

const queryTestRows = async (sql: string) => {
  if (sql.includes('FROM football_registered_team')) {
    const rows = [
      { id: 'REAL-1', team_name: 'Real team', is_test: false },
      { id: 'TEST-1', team_name: 'Test team', is_test: true }
    ];
    return { rows: sql.includes('COALESCE(is_test, FALSE) = FALSE') ? rows.filter(row => !row.is_test) : rows };
  }
  if (sql.includes('FROM football_player')) {
    const rows = [
      { id: 'PLAYER-REAL', team_id: 'REAL-1', name: 'Real player' },
      { id: 'PLAYER-TEST', team_id: 'TEST-1', name: 'Test player' }
    ];
    return { rows: sql.includes('COALESCE(t.is_test, FALSE) = FALSE') ? rows.filter(row => row.team_id !== 'TEST-1') : rows };
  }
  if (sql.includes('FROM football_official')) {
    const rows = [
      { id: 'OFFICIAL-REAL', team_id: 'REAL-1', name: 'Real official' },
      { id: 'OFFICIAL-TEST', team_id: 'TEST-1', name: 'Test official' }
    ];
    return { rows: sql.includes('COALESCE(t.is_test, FALSE) = FALSE') ? rows.filter(row => row.team_id !== 'TEST-1') : rows };
  }
  return { rows: [] };
};

describe('test data isolation', () => {
  beforeEach(() => {
    (pool.query as jest.Mock).mockImplementation(queryTestRows);
    teamsDatabase.splice(0, teamsDatabase.length, { id: 'MEM-TEST', isTest: true, teamName: 'Memory test team' });
    playersDatabase.splice(0, playersDatabase.length,
      { id: 'MEM-PLAYER-TEST', teamId: 'MEM-TEST', name: 'Memory test player' },
      { id: 'MEM-PLAYER-REAL', teamId: 'REAL-1', name: 'Memory real player' });
    officialsDatabase.splice(0, officialsDatabase.length,
      { id: 'MEM-OFFICIAL-TEST', teamId: 'MEM-TEST', name: 'Memory test official' },
      { id: 'MEM-OFFICIAL-REAL', teamId: 'REAL-1', name: 'Memory real official' });
    (pool.query as jest.Mock).mockClear();
  });

  afterAll(() => {
    teamsDatabase.splice(0, teamsDatabase.length);
    playersDatabase.splice(0, playersDatabase.length);
    officialsDatabase.splice(0, officialsDatabase.length);
  });

  it('excludes test teams, players, and officials from default aggregate reads', async () => {
    const teams = await getDbRegisteredTeams();
    const players = await getDbPlayers();
    const officials = await getDbOfficials();

    expect(teams.map(team => team.id)).toEqual(['REAL-1']);
    expect(players.map(player => player.id)).toEqual(['PLAYER-REAL', 'MEM-PLAYER-REAL']);
    expect(officials.map(official => official.id)).toEqual(['OFFICIAL-REAL', 'MEM-OFFICIAL-REAL']);
    const queries = (pool.query as jest.Mock).mock.calls.map(([sql]) => sql).join('\n');
    expect(queries).toContain('COALESCE(is_test, FALSE) = FALSE');
    expect(queries).toContain('COALESCE(t.is_test, FALSE) = FALSE');
  });

  it('allows the Demo view to explicitly request test rows', async () => {
    const teams = await getDbRegisteredTeams(true);
    const players = await getDbPlayers('ALL', true);
    const officials = await getDbOfficials('ALL', true);

    expect(teams.map(team => team.id)).toEqual(expect.arrayContaining(['REAL-1', 'TEST-1', 'MEM-TEST']));
    expect(teams.find(team => team.id === 'TEST-1')?.isTest).toBe(true);
    expect(players.map(player => player.id)).toContain('PLAYER-TEST');
    expect(players.map(player => player.id)).toContain('MEM-PLAYER-TEST');
    expect(officials.map(official => official.id)).toContain('OFFICIAL-TEST');
    expect(officials.map(official => official.id)).toContain('MEM-OFFICIAL-TEST');
  });
});
