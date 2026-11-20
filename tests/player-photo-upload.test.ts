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
import { pool } from '../src/db';

const initialPlayerIds = new Set(playersDatabase.map((player: any) => player.id));

describe('Player Photo Upload API', () => {
  afterAll(async () => {
    for (let index = playersDatabase.length - 1; index >= 0; index--) {
      if (!initialPlayerIds.has(playersDatabase[index].id)) playersDatabase.splice(index, 1);
    }
    cleanupTestUploadFiles();
    await pool.end();
  });

  it('POST /api/upload-photo should return 400 when no photo attached', async () => {
    const res = await request(app)
      .post('/api/upload-photo')
      .send({ type: 'player', id: 'PLY-001' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('POST /api/upload-photo should upload photo successfully with attached file', async () => {
    const res = await request(app)
      .post('/api/upload-photo')
      .field('type', 'player')
      .field('id', 'PLY-001')
      .attach('photo', Buffer.from('fake-image-data'), 'test.jpg');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.url).toContain('/uploads/');
  });

  it.each(['PENDING', 'REJECTED'])('POST /api/upload-photo preserves player doc status %s', async (docStatus) => {
    const playerId = `PLY-UPLOAD-STATUS-${docStatus}`;
    const player = {
      id: playerId,
      teamId: 'FTM-001',
      name: 'Test Upload Status',
      category: 'U18',
      docStatus,
      photoUrl: '/uploads/previous-photo.jpg'
    };
    playersDatabase.push(player);

    try {
      const res = await request(app)
        .post('/api/upload-photo')
        .field('type', 'player')
        .field('id', playerId)
        .attach('photo', Buffer.from('fake-image-data'), 'status-test.jpg');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(player.photoUrl).toBe(res.body.url);
      expect(player.docStatus).toBe(docStatus);
    } finally {
      const playerIndex = playersDatabase.indexOf(player);
      if (playerIndex >= 0) playersDatabase.splice(playerIndex, 1);
    }
  });
});
