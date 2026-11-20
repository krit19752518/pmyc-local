jest.mock('../src/db', () => ({
  pool: {
    query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
    end: async () => undefined
  }
}));
jest.mock('../src/db/initTables', () => ({
  initTeamTables: async () => undefined
}));

import request from 'supertest';
import { app, teamsDatabase, getDbRegisteredTeams, teamProfile } from '../src/app';
import { pool } from '../src/db';

describe('Demo team registration isolation', () => {
  const initialTeamIds = new Set(teamsDatabase.map((team: any) => team.id));

  afterAll(async () => {
    for (let index = teamsDatabase.length - 1; index >= 0; index--) {
      if (!initialTeamIds.has(teamsDatabase[index].id)) teamsDatabase.splice(index, 1);
    }
    await pool.end();
  });

  it('forces is_test on the demo endpoint and keeps the team out of default team reads', async () => {
    const email = `demo-${Date.now()}@example.com`;
    const originalProfile = { ...teamProfile };
    const response = await request(app)
      .post('/api/team/register-demo')
      .set('Cookie', ['admin_session=true', 'admin_user=admin'])
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        school: 'ทีมทดสอบ Demo',
        province: 'กรุงเทพมหานคร',
        district: 'ดุสิต',
        name: 'ผู้จัดการทดสอบ',
        mobile: '0812345678',
        email,
        line_id: 'demo-line',
        password: 'password123',
        password_confirm: 'password123',
        is_test: false
      });

    expect(response.status).toBe(201);
    expect(response.body.team.isTest).toBe(true);
    expect(response.body.redirectUrl).toBe('/team/register-demo.php');
    expect(teamProfile).toEqual(originalProfile);

    teamsDatabase.push({ id: `REAL-ONLY-${Date.now()}`, teamName: 'ทีมข้อมูลจริงที่ต้องไม่แสดง', isTest: false });
    const demoPage = await request(app)
      .get('/team/register-demo.php')
      .set('Cookie', ['admin_session=true', 'admin_user=admin']);
    expect(demoPage.status).toBe(200);
    expect(demoPage.text).toContain('ทีมที่สมัครในระบบ Demo (1)');
    expect(demoPage.text).toContain('ทีมทดสอบ Demo');
    expect(demoPage.text).not.toContain('ทีมข้อมูลจริงที่ต้องไม่แสดง');

    const insertCall = (pool.query as jest.Mock).mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO football_registered_team')
    );
    expect(insertCall).toBeDefined();
    expect(String(insertCall?.[0])).toContain('is_test');
    expect(insertCall?.[1].at(-1)).toBe(true);

    const defaultTeams = await getDbRegisteredTeams();
    const demoTeams = await getDbRegisteredTeams(true);
    expect(defaultTeams.some((team: any) => team.id === response.body.team.id)).toBe(false);
    expect(demoTeams.some((team: any) => team.id === response.body.team.id)).toBe(true);
  });

  it('rejects demo registration for users without a SUPER_ADMIN session', async () => {
    const response = await request(app)
      .post('/api/team/register-demo')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ school: 'unauthorized' });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });
});
