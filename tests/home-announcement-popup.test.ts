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
import { app } from '../src/app';

describe('Homepage announcement popup', () => {
  test('GET /index.php renders announcement image and close button', async () => {
    const response = await request(app).get('/index.php');

    expect(response.status).toBe(200);
    expect(response.text).toContain('id="home-announcement-popup"');
    expect(response.text).toContain(
      '/assets/img/registration-extension-notice.png'
    );
    expect(response.text).toContain('aria-label="ปิดประกาศ"');
    expect(response.text).toContain('popup.hidden = true');
  });

  test('announcement image is served successfully', async () => {
    const response = await request(app).get(
      '/assets/img/registration-extension-notice.png'
    );

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/image\/png/);
  });
});
