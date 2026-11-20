jest.mock('../src/db', () => ({
  pool: {
    query: async (sql: string) => {
      if (sql.includes('INSERT INTO football_password_reset')) {
        throw new Error('Database disabled in isolated tests');
      }
      return { rows: [], rowCount: 0 };
    },
    end: async () => undefined
  }
}));
jest.mock('../src/db/initTables', () => ({
  initTeamTables: async () => undefined
}));

import request from 'supertest';
import { cleanupTestUploadFiles } from '../src/middleware/upload';
import { app, teamsDatabase, passwordResetTokensStore } from '../src/app';
import { pool } from '../src/db';

const initialTeamIds = new Set(teamsDatabase.map((team: any) => team.id));
const initialResetTokenIds = new Set(passwordResetTokensStore.map(token => token.id));

describe('Team Forgot & Reset Password Flow', () => {
  afterAll(async () => {
    for (let index = teamsDatabase.length - 1; index >= 0; index--) {
      if (!initialTeamIds.has(teamsDatabase[index].id)) teamsDatabase.splice(index, 1);
    }
    for (let index = passwordResetTokensStore.length - 1; index >= 0; index--) {
      if (!initialResetTokenIds.has(passwordResetTokensStore[index].id)) passwordResetTokensStore.splice(index, 1);
    }
    cleanupTestUploadFiles();
    await pool.end();
  });

  it('UT-PWD-01: POST /api/team/forgot-password should return 404 for non-existent account', async () => {
    const res = await request(app)
      .post('/api/team/forgot-password')
      .send({ account: 'non_existent_user_xyz@domain.com' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('ไม่พบอีเมลหรือชื่อผู้ใช้นี้ในระบบ');
  });

  it('UT-PWD-02: POST /api/team/forgot-password should return 200 OK and generate reset link for valid account', async () => {
    const res = await request(app)
      .post('/api/team/forgot-password')
      .send({ account: 'Scalling' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('ระบบจะส่งขั้นตอนการรีเซตรหัสผ่านไปให้ทางอีเมล์');
    expect(res.body.resetLink).toContain('/team/reset-password.php?token=');
    expect(res.body.token).toBeDefined();
  }, 15000);

  it('UT-MAIL-01: sendPasswordResetEmail should send test email and return Ethereal previewUrl or messageId', async () => {
    const { sendPasswordResetEmail } = require('../src/services/mailer.service');
    const result = await sendPasswordResetEmail(
      'test.manager@example.com',
      'Scalling',
      'http://localhost:4500/team/reset-password.php?token=mock_test_token_123'
    );

    expect(result.success).toBe(true);
    expect(result.messageId || result.previewUrl).toBeDefined();
  }, 15000);

  it('UT-PWD-03: POST /api/team/reset-password should return 400 for invalid or missing token', async () => {
    const res = await request(app)
      .post('/api/team/reset-password')
      .send({ token: 'invalid_token_12345', password: 'newpassword123', password_confirm: 'newpassword123' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('ลิงก์รีเซตรหัสผ่านไม่ถูกต้อง');
  });

  it('UT-PWD-04: POST /api/team/reset-password should return 400 for password length < 8 or mismatch', async () => {
    const forgotRes = await request(app)
      .post('/api/team/forgot-password')
      .send({ account: 'Scalling' });
    const validToken = forgotRes.body.token;

    // Password mismatch
    const mismatchRes = await request(app)
      .post('/api/team/reset-password')
      .send({ token: validToken, password: 'newpassword123', password_confirm: 'differentpassword' });
    expect(mismatchRes.status).toBe(400);
    expect(mismatchRes.body.error).toContain('ไม่ตรงกัน');

    // Password short
    const shortRes = await request(app)
      .post('/api/team/reset-password')
      .send({ token: validToken, password: '123', password_confirm: '123' });
    expect(shortRes.status).toBe(400);
    expect(shortRes.body.error).toContain('อย่างน้อย 8 ตัวอักษร');
  }, 15000);

  it('UT-PWD-05: Full Lifecycle Test (Forgot -> Reset Password -> Login with New Password)', async () => {
    // 1. Register team
    const teamUser = `reset_test_user_${Date.now()}`;
    const teamEmail = `reset_test_${Date.now()}@example.com`;
    await request(app)
      .post('/api/team/register')
      .send({
        teamName: 'ทีมรีเซตรหัสผ่าน เอฟซี',
        province: 'กรุงเทพมหานคร',
        district: 'ดุสิต',
        managerName: 'โค้ชรีเซต',
        phone: '0899990000',
        email: teamEmail,
        line_id: 'reset_line',
        username: teamUser,
        password: 'oldpassword123',
        'categories[]': ['U14']
      });

    // 2. Forgot Password
    const forgotRes = await request(app)
      .post('/api/team/forgot-password')
      .send({ account: teamUser });

    expect(forgotRes.status).toBe(200);
    const resetToken = forgotRes.body.token;
    expect(resetToken).toBeDefined();

    // 3. Reset Password
    const resetRes = await request(app)
      .post('/api/team/reset-password')
      .send({
        token: resetToken,
        password: 'brandnewpassword123',
        password_confirm: 'brandnewpassword123'
      });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.success).toBe(true);
    expect(resetRes.body.message).toContain('ท่านได้ทำการตั้งรหัสผ่านเรียบร้อยแล้ว');

    // 4. Try Login with Old Password (should fail 401)
    const oldLoginRes = await request(app)
      .post('/api/team/login')
      .send({ username: teamUser, password: 'oldpassword123' });
    expect(oldLoginRes.status).toBe(401);

    // 5. Try Login with New Password (should succeed 302)
    const newLoginRes = await request(app)
      .post('/api/team/login')
      .send({ username: teamUser, password: 'brandnewpassword123' });
    expect(newLoginRes.status).toBe(302);
    expect(newLoginRes.header.location).toContain('/team/index.php');
  }, 15000);
});
