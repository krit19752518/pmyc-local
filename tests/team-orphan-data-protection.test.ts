jest.mock('../src/db', () => ({
  pool: {
    query: async () => ({ rows: [], rowCount: 0 }),
    end: async () => undefined
  }
}));
jest.mock('../src/db/initTables', () => ({
  initTeamTables: async () => undefined
}));

import request from 'supertest';
import { cleanupTestUploadFiles } from '../src/middleware/upload';
import { app, playersDatabase } from '../src/app';
import { teamProfile } from '../src/models/team.model';
import { pool } from '../src/db';
import { teamSessionCookies } from './team-session.helper';

const { officialsDatabase, teamsDatabase } = require('../src/app');

describe('Orphan team_id prevention (officials & players save)', () => {
  afterAll(async () => {
    const orphanIndex = officialsDatabase.findIndex((official: any) => official.id === 'OFF-TEST-ORPHAN');
    if (orphanIndex !== -1) officialsDatabase.splice(orphanIndex, 1);
    cleanupTestUploadFiles();
    await pool.end();
  });

  const officialPayload = (idCard: string) => ({
    name: 'นายทดสอบ ไม่มีทีม (TEST)',
    position: 'ผู้จัดการทีม',
    id_card: idCard,
    phone: '0812345678',
    categories: ['U14']
  });

  it('UT-ORPHAN-01: POST /api/team/officials/save without session returns 401 and stores nothing', async () => {
    const idCard = '1166' + Date.now().toString().slice(-9);
    const res = await request(app)
      .post('/api/team/officials/save')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send(officialPayload(idCard));

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(officialsDatabase.some((o: any) => o.idCard === idCard)).toBe(false);
  });

  it('UT-ORPHAN-02: POST /api/team/officials/save with login cookie but no resolvable team id returns 401 and stores nothing', async () => {
    const idCard = '1155' + Date.now().toString().slice(-9);
    const res = await request(app)
      .post('/api/team/officials/save')
      .set('Cookie', ['team_logged_in=true'])
      .set('X-Requested-With', 'XMLHttpRequest')
      .send(officialPayload(idCard));

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Session');
    expect(officialsDatabase.some((o: any) => o.idCard === idCard)).toBe(false);
  });

  it('UT-ORPHAN-03: POST /api/team/officials/delete without session returns 401', async () => {
    const res = await request(app)
      .post('/api/team/officials/delete')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ id: 'OFF-DOES-NOT-EXIST' });

    expect(res.status).toBe(401);
  });

  it('UT-ORPHAN-04: POST /api/team/players/save without session returns 401 and stores nothing', async () => {
    const idCard = '1144' + Date.now().toString().slice(-9);
    const before = playersDatabase.length;
    const res = await request(app)
      .post('/api/team/players/save')
      .set('X-Requested-With', 'XMLHttpRequest')
      .field('name', 'ด.ช. ไม่มีทีม (TEST)')
      .field('id_card', idCard)
      .field('jersey_no', '7')
      .field('position', 'กองหน้า (FW)')
      .field('categories', 'U14')
      .attach('doc_id_card', Buffer.from('fake-id-card-content'), 'id_card.pdf')
      .attach('photo', Buffer.from('fake-photo-content'), 'photo.jpg');

    expect(res.status).toBe(401);
    expect(playersDatabase.length).toBe(before);
  });

  it('UT-ORPHAN-05: POST /api/team/players/save with login cookie but no resolvable team id returns 401 and stores nothing', async () => {
    const idCard = '1133' + Date.now().toString().slice(-9);
    const before = playersDatabase.length;
    const usedJerseys = new Set(
      playersDatabase
        .filter((p: any) => !String(p.teamId || p.team_id || '').trim())
        .map((p: any) => Number(p.jerseyNo ?? p.jersey_no))
    );
    let freeJersey = 1;
    while (usedJerseys.has(freeJersey) && freeJersey < 30) freeJersey++;

    // Without a resolvable team the shared global teamProfile is used; earlier tests may have left categories "submitted"
    const savedSubmitted = teamProfile.submitted_categories;
    const savedSubmittedAlt = (teamProfile as any).submittedCategories;
    teamProfile.submitted_categories = '';
    (teamProfile as any).submittedCategories = '';

    try {
      const res = await request(app)
        .post('/api/team/players/save')
        .set('Cookie', ['team_logged_in=true'])
        .set('X-Requested-With', 'XMLHttpRequest')
        .field('name', 'ด.ช. ไม่มีทีม (TEST)')
        .field('id_card', idCard)
        .field('jersey_no', String(freeJersey))
        .field('position', 'กองหน้า (FW)')
        .field('categories', 'U14')
        .attach('doc_id_card', Buffer.from('fake-id-card-content'), 'id_card.pdf')
        .attach('photo', Buffer.from('fake-photo-content'), 'photo.jpg');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(playersDatabase.length).toBe(before);
    } finally {
      teamProfile.submitted_categories = savedSubmitted;
      (teamProfile as any).submittedCategories = savedSubmittedAlt;
    }
  });

  it('UT-ORPHAN-06: duplicate ID card owned by an orphan official (empty team_id) explains the orphan record', async () => {
    const idCard = '1122' + Date.now().toString().slice(-9);
    const orphanId = 'OFF-TEST-ORPHAN';
    officialsDatabase.push({
      id: orphanId,
      teamId: '',
      name: 'นายข้อมูลค้าง (TEST)',
      position: 'ผู้ช่วยผู้ฝึกสอน',
      idCard,
      phone: '0800000000',
      categories: 'U16'
    });

    try {
      const res = await request(app)
        .post('/api/team/officials/save')
        .set('Cookie', teamSessionCookies('FTM-001'))
        .set('X-Requested-With', 'XMLHttpRequest')
        .send(officialPayload(idCard));

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('มีอยู่ในระบบแล้ว');
      expect(res.body.error).toContain('ไม่ได้ผูกกับทีมใดในระบบ');
    } finally {
      const idx = officialsDatabase.findIndex((o: any) => o.id === orphanId);
      if (idx !== -1) officialsDatabase.splice(idx, 1);
    }
  });

  it('UT-OFFICIAL-ID-01: non-manager with a blank identity is not matched to another team\'s blank identity', async () => {
    const targetTeamId = 'FTM-TEST-OFFICIAL-NONMANAGER-EMPTY';
    const otherTeamId = 'FTM-TEST-OFFICIAL-NONMANAGER-EMPTY-OTHER';
    const otherOfficialId = 'OFF-TEST-NONMANAGER-EMPTY-OTHER';
    const targetName = 'นักกายภาพทดสอบเลขว่าง (TEST)';
    teamsDatabase.push(
      { id: targetTeamId, teamName: 'ทีมทดสอบเจ้าหน้าที่ใหม่', categories: 'U14', submitted_categories: '', cancelled_categories: '', status: 'PENDING' },
      { id: otherTeamId, teamName: 'ทีมทดสอบเจ้าหน้าที่เดิม', categories: 'U14', submitted_categories: '', cancelled_categories: '', status: 'PENDING' }
    );
    officialsDatabase.push({ id: otherOfficialId, teamId: otherTeamId, name: 'เจ้าหน้าที่เดิม (TEST)', position: 'ผู้ฝึกสอน', idCard: '', phone: '0812345678', categories: 'U14' });

    try {
      const res = await request(app)
        .post('/api/team/officials/save')
        .set('Cookie', teamSessionCookies(targetTeamId))
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: targetName, position: 'นักกายภาพบำบัด', id_card: '', phone: '0812345678', categories: ['U14'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(officialsDatabase.some((official: any) => official.teamId === targetTeamId && official.name === targetName)).toBe(true);
    } finally {
      for (let i = officialsDatabase.length - 1; i >= 0; i--) {
        if (officialsDatabase[i].id === otherOfficialId || (officialsDatabase[i].teamId === targetTeamId && officialsDatabase[i].name === targetName)) officialsDatabase.splice(i, 1);
      }
      for (let i = teamsDatabase.length - 1; i >= 0; i--) {
        if (teamsDatabase[i].id === targetTeamId || teamsDatabase[i].id === otherTeamId) teamsDatabase.splice(i, 1);
      }
    }
  });

  it('UT-OFFICIAL-ID-02: non-manager may use an identity value already used by another team', async () => {
    const targetTeamId = 'FTM-TEST-OFFICIAL-NONMANAGER-VALUE';
    const otherTeamId = 'FTM-TEST-OFFICIAL-NONMANAGER-VALUE-OTHER';
    const otherOfficialId = 'OFF-TEST-NONMANAGER-VALUE-OTHER';
    const duplicateId = 'TEST-ID-OFFICIAL-86';
    const targetName = 'ผู้ฝึกสอนทดสอบข้ามทีม (TEST)';
    teamsDatabase.push(
      { id: targetTeamId, teamName: 'ทีมทดสอบเจ้าหน้าที่ใหม่', categories: 'U14', submitted_categories: '', cancelled_categories: '', status: 'PENDING' },
      { id: otherTeamId, teamName: 'ทีมทดสอบเจ้าหน้าที่เดิม', categories: 'U14', submitted_categories: '', cancelled_categories: '', status: 'PENDING' }
    );
    officialsDatabase.push({ id: otherOfficialId, teamId: otherTeamId, name: 'เจ้าหน้าที่เดิม (TEST)', position: 'ผู้ฝึกสอน', idCard: duplicateId, phone: '0812345678', categories: 'U14' });

    try {
      const res = await request(app)
        .post('/api/team/officials/save')
        .set('Cookie', teamSessionCookies(targetTeamId))
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: targetName, position: 'ผู้ฝึกสอน', id_card: duplicateId, phone: '0812345678', categories: ['U14'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(officialsDatabase.some((official: any) => official.teamId === targetTeamId && official.name === targetName)).toBe(true);
    } finally {
      for (let i = officialsDatabase.length - 1; i >= 0; i--) {
        if (officialsDatabase[i].id === otherOfficialId || (officialsDatabase[i].teamId === targetTeamId && officialsDatabase[i].name === targetName)) officialsDatabase.splice(i, 1);
      }
      for (let i = teamsDatabase.length - 1; i >= 0; i--) {
        if (teamsDatabase[i].id === targetTeamId || teamsDatabase[i].id === otherTeamId) teamsDatabase.splice(i, 1);
      }
    }
  });

  it('UT-OFFICIAL-ID-03: manager still requires an identity value', async () => {
    const targetTeamId = 'FTM-TEST-OFFICIAL-MANAGER-REQUIRED';
    teamsDatabase.push({ id: targetTeamId, teamName: 'ทีมทดสอบผู้จัดการ', categories: 'U14', submitted_categories: '', cancelled_categories: '', status: 'PENDING' });
    const targetName = 'ผู้จัดการทดสอบเลขว่าง (TEST)';

    try {
      const res = await request(app)
        .post('/api/team/officials/save')
        .set('Cookie', teamSessionCookies(targetTeamId))
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: targetName, position: 'ผู้จัดการทีม', id_card: '', phone: '0812345678', categories: ['U14'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('กรุณากรอกข้อมูล');
      expect(officialsDatabase.some((official: any) => official.teamId === targetTeamId && official.name === targetName)).toBe(false);
    } finally {
      for (let i = teamsDatabase.length - 1; i >= 0; i--) if (teamsDatabase[i].id === targetTeamId) teamsDatabase.splice(i, 1);
    }
  });

  it('UT-OFFICIAL-ID-04: manager duplicate identity on another team remains rejected', async () => {
    const targetTeamId = 'FTM-TEST-OFFICIAL-MANAGER-DUP';
    const otherTeamId = 'FTM-TEST-OFFICIAL-MANAGER-DUP-OTHER';
    const otherOfficialId = 'OFF-TEST-MANAGER-DUP-OTHER';
    const duplicateId = 'TEST-ID-MANAGER-86';
    const targetName = 'ผู้จัดการทดสอบเลขซ้ำ (TEST)';
    teamsDatabase.push(
      { id: targetTeamId, teamName: 'ทีมทดสอบผู้จัดการใหม่', categories: 'U14', submitted_categories: '', cancelled_categories: '', status: 'PENDING' },
      { id: otherTeamId, teamName: 'ทีมทดสอบผู้จัดการเดิม', categories: 'U14', submitted_categories: '', cancelled_categories: '', status: 'PENDING' }
    );
    officialsDatabase.push({ id: otherOfficialId, teamId: otherTeamId, name: 'ผู้จัดการเดิม (TEST)', position: 'ผู้จัดการทีม', idCard: duplicateId, phone: '0812345678', categories: 'U14' });

    try {
      const res = await request(app)
        .post('/api/team/officials/save')
        .set('Cookie', teamSessionCookies(targetTeamId))
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ name: targetName, position: 'ผู้จัดการทีม', id_card: duplicateId, phone: '0812345678', categories: ['U14'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('มีอยู่ในระบบแล้ว');
      expect(res.body.error).toContain('ทีมทดสอบผู้จัดการเดิม');
      expect(officialsDatabase.some((official: any) => official.teamId === targetTeamId && official.name === targetName)).toBe(false);
    } finally {
      for (let i = officialsDatabase.length - 1; i >= 0; i--) if (officialsDatabase[i].id === otherOfficialId) officialsDatabase.splice(i, 1);
      for (let i = teamsDatabase.length - 1; i >= 0; i--) {
        if (teamsDatabase[i].id === targetTeamId || teamsDatabase[i].id === otherTeamId) teamsDatabase.splice(i, 1);
      }
    }
  });
});
