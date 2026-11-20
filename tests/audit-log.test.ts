jest.mock('../src/db', () => ({
  pool: {
    query: jest.fn(async () => ({ rows: [], rowCount: 1 }))
  }
}));

import { Request } from 'express';
import { pool } from '../src/db';
import { getAuditFieldChanges, writeAuditLog } from '../src/services/auditLog.service';
import { createTeamSessionToken } from '../src/services/teamSession.service';
import { satOfficerCookie, superAdminCookie } from './admin-session-test-helpers';

describe('Football audit log service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('captures only changed allowlisted fields and excludes personal or file fields', () => {
    const changes = getAuditFieldChanges('PLAYER', {
      category: 'U14', jerseyNo: '8', position: 'กองหน้า', idCard: '1234567890123', attachment: '/private.jpg'
    }, {
      category: 'U16', jerseyNo: '8', position: 'กองหน้า', idCard: '9999999999999', attachment: '/new-private.jpg'
    });

    expect(changes).toEqual({
      oldState: { category: 'U14' },
      newState: { category: 'U16' },
      changedFields: ['รุ่นแข่งขัน', 'เลขบัตรประชาชน', 'ไฟล์แนบ']
    });
  });

  it('normalizes category lists before comparing and includes only actual differences', () => {
    const changes = getAuditFieldChanges('TEAM',
      { categories: 'U14,U16', province: 'เชียงใหม่', email: 'private@example.test' },
      { categories: ['U16', 'U14'], province: 'ลำพูน', email: 'new-private@example.test' }
    );

    expect(changes.oldState).toEqual({ province: 'เชียงใหม่' });
    expect(changes.newState).toEqual({ province: 'ลำพูน' });
    expect(changes.changedFields).toEqual(['จังหวัด', 'อีเมล']);
  });

  it('allows limited official role and license fields while omitting identity and contact data', () => {
    const changes = getAuditFieldChanges('OFFICIAL', {
      position: 'ผู้ฝึกสอน', categories: 'U14', hasLicense: 'NO', idCard: 'private', phone: 'private'
    }, {
      position: 'ผู้ช่วยผู้ฝึกสอน', categories: 'U14', hasLicense: 'YES', idCard: 'different', phone: 'different'
    });

    expect(changes.oldState).toEqual({ position: 'ผู้ฝึกสอน', hasLicense: 'NO' });
    expect(changes.newState).toEqual({ position: 'ผู้ช่วยผู้ฝึกสอน', hasLicense: 'YES' });
    expect(changes.changedFields).toEqual(['ตำแหน่ง', 'มีใบอนุญาต', 'เลขบัตรประชาชน', 'เบอร์โทรศัพท์']);
  });

  it('records the authenticated SAT actor and status transition without sensitive values', async () => {
    const req = {
      headers: {
        cookie: satOfficerCookie('sat@example.test', 'เชียงใหม่').join('; '),
        'user-agent': 'audit-test-agent'
      },
      ip: '192.0.2.10',
      originalUrl: '/sat-admin/api/admin/teams/update-status',
      get: (name: string) => name.toLowerCase() === 'user-agent' ? 'audit-test-agent' : undefined,
      adminUser: {
        id: 'SAT-TEST-01',
        username: 'sat@example.test',
        fullname: 'เจ้าหน้าที่จังหวัดทดสอบ',
        roleCode: 'SAT_OFFICER',
        province: 'เชียงใหม่'
      }
    } as unknown as Request;

    await writeAuditLog(req, {
      eventType: 'TEAM_STATUS_CHANGED',
      entityType: 'TEAM',
      entityId: 'FTM-AUDIT-01',
      teamId: 'FTM-AUDIT-01',
      oldState: { status: 'PENDING' },
      newState: { status: 'APPROVED' },
      metadata: { rejectReasonProvided: false }
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO football_audit_log'),
      expect.arrayContaining([
        'TEAM_STATUS_CHANGED', 'ADMIN', 'SAT-TEST-01',
        'เจ้าหน้าที่จังหวัดทดสอบ', 'SAT_OFFICER', 'เชียงใหม่',
        'FTM-AUDIT-01', 'TEAM', 'FTM-AUDIT-01',
        JSON.stringify({ status: 'PENDING' }), JSON.stringify({ status: 'APPROVED' })
      ])
    );
    const serializedValues = JSON.stringify((pool.query as jest.Mock).mock.calls[0][1]);
    expect(serializedValues).not.toContain('password');
    expect(serializedValues).not.toContain('id_card');
  });

  it('attributes team actions to the verified signed team account and stores the request correlation id', async () => {
    const token = createTeamSessionToken('FTM-TEAM-02', 'manager@example.test');
    const req = {
      headers: { cookie: `team_logged_in=true; team_id=FTM-TEAM-02; team_user=manager%40example.test; team_session=${encodeURIComponent(token)}` },
      ip: '192.0.2.11',
      method: 'POST',
      originalUrl: '/api/team/submit',
      route: { path: '/api/team/submit' },
      baseUrl: '',
      auditRequestId: 'e74c26ca-8963-4afe-b57b-f4bbaf8b5975',
      get: () => undefined
    } as unknown as Request;

    await writeAuditLog(req, {
      eventType: 'TEAM_ROSTER_SUBMITTED',
      entityType: 'TEAM',
      entityId: 'FTM-TEAM-02',
      teamId: 'FTM-TEAM-02',
      oldState: { submittedCategories: [] },
      newState: { submittedCategories: ['U14'] },
      metadata: { category: 'U14' }
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO football_audit_log'),
      expect.arrayContaining([
        'TEAM_ROSTER_SUBMITTED', 'TEAM', 'manager@example.test',
        'manager@example.test', 'TEAM_MANAGER', null, 'FTM-TEAM-02', 'TEAM', 'FTM-TEAM-02'
      ])
    );
    const params = (pool.query as jest.Mock).mock.calls[0][1];
    expect(params[11]).toContain('e74c26ca-8963-4afe-b57b-f4bbaf8b5975');
    expect(params[14]).toBe('e74c26ca-8963-4afe-b57b-f4bbaf8b5975');
    expect((req as any).auditEventCount).toBe(1);
  });

  it('does not treat unsigned team cookies as an authenticated actor', async () => {
    const req = {
      headers: { cookie: 'team_logged_in=true; team_id=FTM-SPOOFED; team_user=forged%40example.test' },
      originalUrl: '/api/team/submit',
      get: () => undefined
    } as unknown as Request;

    await writeAuditLog(req, {
      eventType: 'MUTATION_REQUEST_FAILED', entityType: 'HTTP_REQUEST', entityId: 'e74c26ca-8963-4afe-b57b-f4bbaf8b5975', teamId: null
    });

    const params = (pool.query as jest.Mock).mock.calls[0][1];
    expect(params.slice(1, 6)).toEqual(['ANONYMOUS', null, null, 'ANONYMOUS', null]);
    expect(params).not.toContain('forged@example.test');
    expect(params[6]).toBeNull();
  });

  it('surfaces database write failures so callers cannot silently lose audit events', async () => {
    (pool.query as jest.Mock).mockRejectedValueOnce(new Error('audit table unavailable'));
    const req = {
      headers: {},
      originalUrl: '/api/admin/teams/update-status',
      get: () => undefined
    } as unknown as Request;

    await expect(writeAuditLog(req, {
      eventType: 'TEAM_STATUS_CHANGED',
      entityType: 'TEAM',
      entityId: 'FTM-AUDIT-02',
      teamId: 'FTM-AUDIT-02',
      newState: { status: 'REJECTED' }
    })).rejects.toThrow('audit table unavailable');
  });

  it('can write a deletion event through the caller transaction executor', async () => {
    const transactionQuery = jest.fn(async () => ({ rows: [], rowCount: 1 }));
    const req = {
      headers: { cookie: superAdminCookie().map(cookie => cookie.split(';')[0]).join('; ') },
      originalUrl: '/api/admin/teams/delete',
      adminUser: { id: 'ADM-01', username: 'admin', roleCode: 'SUPER_ADMIN' },
      get: () => undefined
    } as unknown as Request;

    await writeAuditLog(req, {
      eventType: 'TEAM_DELETED', entityType: 'TEAM', entityId: 'FTM-01', teamId: 'FTM-01',
      oldState: { isDeleted: true }, metadata: { deletionMode: 'PERMANENT_CASCADE' }
    }, { query: transactionQuery } as any);

    expect(transactionQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO football_audit_log'), expect.any(Array));
    expect(pool.query).not.toHaveBeenCalled();
  });
});
