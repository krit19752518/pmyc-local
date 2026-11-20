import { createTeamSessionToken } from '../src/services/teamSession.service';

process.env.TEAM_SESSION_SECRET = process.env.TEAM_SESSION_SECRET || 'football-test-session-secret';

export function teamSessionCookies(teamId: string, teamUser = 'team-session-test'): string[] {
  return [
    'team_logged_in=true',
    `team_id=${encodeURIComponent(teamId)}`,
    `team_user=${encodeURIComponent(teamUser)}`,
    `team_session=${encodeURIComponent(createTeamSessionToken(teamId, teamUser))}`
  ];
}
