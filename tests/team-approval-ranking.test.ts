import { getCompletedApprovalRanks } from '../src/utils/statusHelper';

describe('team approval ranking', () => {
  const teams = [
    { id: 'team-later', status: 'APPROVED', teamPlayers: [{ id: 'p-later', category: 'U14', docStatus: 'APPROVED' }] },
    { id: 'team-pending', status: 'PENDING', teamPlayers: [{ id: 'p-pending', category: 'U14', docStatus: 'APPROVED' }] },
    { id: 'team-incomplete', status: 'APPROVED', teamPlayers: [{ id: 'p-incomplete', category: 'U14', docStatus: 'PENDING' }] },
    { id: 'team-earlier', status: 'APPROVED', teamPlayers: [{ id: 'p-earlier', category: 'U14', docStatus: 'APPROVED' }] },
    { id: 'team-empty', status: 'APPROVED', teamPlayers: [] }
  ];

  const event = (eventType: string, entityType: string, entityId: string, teamId: string, state: Record<string, unknown>, at: string) => ({
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    team_id: teamId,
    new_state: state,
    created_at: at
  });

  it('shows ranks only for fully approved teams and orders by the latest required approval time', () => {
    const ranks = getCompletedApprovalRanks(teams, 'U14', [
      event('TEAM_STATUS_CHANGED', 'TEAM', 'team-later', 'team-later', { status: 'APPROVED' }, '2026-10-12T10:00:00Z'),
      event('PLAYER_DOCUMENT_STATUS_CHANGED', 'PLAYER', 'p-later', 'team-later', { docStatus: 'APPROVED' }, '2026-10-12T10:05:00Z'),
      event('TEAM_STATUS_CHANGED', 'TEAM', 'team-pending', 'team-pending', { status: 'APPROVED' }, '2026-10-12T09:00:00Z'),
      event('PLAYER_DOCUMENT_STATUS_CHANGED', 'PLAYER', 'p-pending', 'team-pending', { docStatus: 'APPROVED' }, '2026-10-12T09:01:00Z'),
      event('TEAM_STATUS_CHANGED', 'TEAM', 'team-incomplete', 'team-incomplete', { status: 'APPROVED' }, '2026-10-12T08:00:00Z'),
      event('PLAYER_DOCUMENT_STATUS_CHANGED', 'PLAYER', 'p-incomplete', 'team-incomplete', { docStatus: 'PENDING' }, '2026-10-12T08:01:00Z'),
      event('TEAM_STATUS_CHANGED', 'TEAM', 'team-earlier', 'team-earlier', { status: 'APPROVED' }, '2026-10-12T09:00:00Z'),
      event('PLAYER_DOCUMENT_STATUS_CHANGED', 'PLAYER', 'p-earlier', 'team-earlier', { docStatus: 'APPROVED' }, '2026-10-12T09:02:00Z')
    ]);

    expect([...ranks.entries()]).toEqual([['team-earlier', 1], ['team-later', 2]]);
  });

  it('ranks legacy approved teams without approval history using registration-time fallback', () => {
    const ranks = getCompletedApprovalRanks([
      { id: 'legacy-later', status: 'APPROVED', createdAt: '2026-10-02T00:00:00Z', teamPlayers: [{ id: 'p-legacy-later', category: 'U14', docStatus: 'APPROVED' }] },
      { id: 'legacy-earlier', status: 'APPROVED', createdAt: '2026-10-01T00:00:00Z', teamPlayers: [{ id: 'p-legacy-earlier', category: 'U14', docStatus: 'APPROVED' }] },
      { id: 'pending-team', status: 'PENDING', createdAt: '2026-09-30T00:00:00Z', teamPlayers: [{ id: 'p-pending-team', category: 'U14', docStatus: 'APPROVED' }] },
      { id: 'pending-player', status: 'APPROVED', createdAt: '2026-09-29T00:00:00Z', teamPlayers: [{ id: 'p-pending-player', category: 'U14', docStatus: 'PENDING' }] }
    ], 'U14', [
      // A current-state approval with incomplete history must still be eligible.
      event('TEAM_STATUS_CHANGED', 'TEAM', 'legacy-later', 'legacy-later', { status: 'PENDING' }, '2026-10-12T09:01:00Z')
    ]);

    expect([...ranks.entries()]).toEqual([['legacy-earlier', 1], ['legacy-later', 2]]);
  });

  it('starts ranking at one for each province and district while preserving approval order within an area', () => {
    const areaTeams = [
      { id: 'lampang-first', province: 'ลำปาง', district: 'เมืองลำปาง', status: 'APPROVED', teamPlayers: [{ id: 'p-lampang-first', category: 'U14', docStatus: 'APPROVED' }] },
      { id: 'lampang-second', province: 'ลำปาง', district: 'เมืองลำปาง', status: 'APPROVED', teamPlayers: [{ id: 'p-lampang-second', category: 'U14', docStatus: 'APPROVED' }] },
      { id: 'lampang-other-district', province: 'ลำปาง', district: 'เถิน', status: 'APPROVED', teamPlayers: [{ id: 'p-lampang-other', category: 'U14', docStatus: 'APPROVED' }] },
      { id: 'chiangmai-same-district-name', province: 'เชียงใหม่', district: 'เมืองลำปาง', status: 'APPROVED', teamPlayers: [{ id: 'p-chiangmai', category: 'U14', docStatus: 'APPROVED' }] }
    ];
    const approvalEvents = areaTeams.flatMap((team, index) => [
      event('TEAM_STATUS_CHANGED', 'TEAM', team.id, team.id, { status: 'APPROVED' }, `2026-10-12T10:0${index}:00Z`),
      event('PLAYER_DOCUMENT_STATUS_CHANGED', 'PLAYER', team.teamPlayers[0].id, team.id, { docStatus: 'APPROVED' }, `2026-10-12T10:0${index}:30Z`)
    ]);

    const ranks = getCompletedApprovalRanks(areaTeams, 'U14', approvalEvents);

    expect([...ranks.entries()]).toEqual([
      ['lampang-first', 1],
      ['lampang-second', 2],
      ['lampang-other-district', 1],
      ['chiangmai-same-district-name', 1]
    ]);
  });
});
