jest.mock('../src/db', () => ({
  pool: {
    query: jest.fn(async (sql: string, values: unknown[] = []) => {
      if (String(sql).includes('SELECT id FROM football_registered_team') && values[0] === 'FTM-ALLOWED' && values[1] === 'shared-user') {
        return { rows: [{ id: 'FTM-ALLOWED' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
    end: async () => undefined
  }
}));
jest.mock('../src/db/initTables', () => ({ initTeamTables: async () => undefined }));

process.env.TEAM_SESSION_SECRET = 'football-test-session-secret';

import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db';
import { TEAM_SESSION_ABSOLUTE_MAX_AGE_SECONDS, createTeamSessionToken, verifyTeamSessionCookies } from '../src/services/teamSession.service';
import { teamSessionCookies } from './team-session.helper';

describe('Signed team session and team switching', () => {
  beforeEach(() => {
    (pool.query as jest.Mock).mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (String(sql).includes('SELECT id FROM football_registered_team') && values[0] === 'FTM-ALLOWED' && values[1] === 'shared-user') {
        return { rows: [{ id: 'FTM-ALLOWED' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('rejects a changed active team id when the session signature belongs to another team', async () => {
    const cookies = teamSessionCookies('FTM-ORIGINAL', 'shared-user');
    cookies[1] = 'team_id=FTM-FORGED';

    const res = await request(app)
      .get('/team/switch-team.php?teamId=FTM-ALLOWED')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', cookies);

    expect(res.status).toBe(401);
  });

  it('only switches to a team associated with the authenticated account', async () => {
    const allowed = await request(app)
      .get('/team/switch-team.php?teamId=FTM-ALLOWED')
      .set('Cookie', teamSessionCookies('FTM-CURRENT', 'shared-user'));

    expect(allowed.status).toBe(302);
    expect(String(allowed.headers['set-cookie'] || '')).toContain('team_id=FTM-ALLOWED');
    expect(String(allowed.headers['set-cookie'] || '')).toContain('team_session=');

    const denied = await request(app)
      .get('/team/switch-team.php?teamId=FTM-OTHER')
      .set('Cookie', teamSessionCookies('FTM-CURRENT', 'shared-user'));

    expect(denied.status).toBe(403);
    expect(String(denied.headers['set-cookie'] || '')).not.toContain('team_id=FTM-OTHER');
  });

  it('requires a signed session before an official can be saved', async () => {
    const insertBefore = (pool.query as jest.Mock).mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO football_official')).length;
    const res = await request(app)
      .post('/api/team/officials/save')
      .set('Cookie', ['team_logged_in=true', 'team_id=FTM-FORGED', 'team_user=shared-user'])
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ name: 'เจ้าหน้าที่ทดสอบ', position: 'ผู้ฝึกสอน', id_card: 'TEST-SESSION-01', phone: '0812345678', categories: ['U14'] });

    expect(res.status).toBe(401);
    const insertAfter = (pool.query as jest.Mock).mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO football_official')).length;
    expect(insertAfter).toBe(insertBefore);
  });

  it('rejects expired or mismatched signed cookie claims', () => {
    const expired = createTeamSessionToken('FTM-001', 'user', Date.now() - 31 * 60 * 1000);
    expect(verifyTeamSessionCookies({
      team_logged_in: 'true', team_id: 'FTM-001', team_user: 'user', team_session: expired
    })).toBeNull();

    const valid = createTeamSessionToken('FTM-001', 'user');
    expect(verifyTeamSessionCookies({
      team_logged_in: 'true', team_id: 'FTM-001', team_user: 'other', team_session: valid
    })).toBeNull();
  });

  it('enforces the fixed absolute session lifetime even when sliding renewal occurs', () => {
    const now = Date.now();
    const token = createTeamSessionToken('FTM-001', 'user', now, now - (TEAM_SESSION_ABSOLUTE_MAX_AGE_SECONDS + 1) * 1000);
    expect(verifyTeamSessionCookies({
      team_logged_in: 'true', team_id: 'FTM-001', team_user: 'user', team_session: token
    }, now)).toBeNull();
  });
});
