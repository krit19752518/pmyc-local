jest.mock('../src/services/auditLog.service', () => ({
  writeAuditLog: jest.fn(async (req: any) => {
    req.auditEventCount = Number(req.auditEventCount || 0) + 1;
  })
}));

import express, { Request, Response } from 'express';
import request from 'supertest';
import { writeAuditLog } from '../src/services/auditLog.service';
import { auditMutationRequest } from '../src/middleware/auditMutation.middleware';

const flushAuditListener = () => new Promise(resolve => setTimeout(resolve, 0));

describe('auditMutationRequest', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['post', 'put', 'patch', 'delete'] as const)('records a %s mutation response with a correlation id and safe target metadata', async method => {
    const app = express();
    app.use(express.json());
    app.use(auditMutationRequest);
    const handler = (req: Request, res: Response) => {
      (req as any).adminUser = { id: 'ADM-01', username: 'admin', roleCode: 'SUPER_ADMIN' };
      return res.json({ success: true });
    };
    if (method === 'post') app.post('/api/admin/players/:id', handler);
    if (method === 'put') app.put('/api/admin/players/:id', handler);
    if (method === 'patch') app.patch('/api/admin/players/:id', handler);
    if (method === 'delete') app.delete('/api/admin/players/:id', handler);

    const response = await (request(app) as any)[method]('/api/admin/players/PLY-123456');
    await flushAuditListener();

    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
    expect(writeAuditLog).toHaveBeenCalledTimes(1);
    const entry = (writeAuditLog as jest.Mock).mock.calls[0][1];
    expect(entry.eventType).toBe('MUTATION_REQUEST_COMPLETED');
    expect(entry.entityType).toBe('HTTP_REQUEST');
    expect(entry.metadata).toMatchObject({
      operationEntity: 'PLAYER',
      targetId: 'PLY-123456',
      route: '/api/admin/players/:id',
      outcome: 'COMPLETED',
      requestId: response.headers['x-request-id']
    });
  });

  it('records unsuccessful business responses without persisting their response or request bodies', async () => {
    const app = express();
    app.use(express.json());
    app.use(auditMutationRequest);
    app.post('/api/admin/teams/update', (_req, res) => res.status(200).json({ success: false, error: 'sensitive server detail' }));

    const response = await request(app).post('/api/admin/teams/update').send({ password: 'secret-value', managerName: 'private name' });
    await flushAuditListener();

    const [loggedReq, entry] = (writeAuditLog as jest.Mock).mock.calls[0];
    expect(entry.eventType).toBe('MUTATION_REQUEST_FAILED');
    expect(entry.metadata).toMatchObject({ outcome: 'FAILED', failureClass: 'BUSINESS_REJECTION', httpStatus: '200' });
    expect(JSON.stringify(entry)).not.toContain('sensitive server detail');
    expect(JSON.stringify(entry)).not.toContain('secret-value');
    expect(JSON.stringify(entry)).not.toContain('private name');
    expect((loggedReq as any).body).toMatchObject({ password: 'secret-value' });
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('does not duplicate a successful domain audit event', async () => {
    const app = express();
    app.use(auditMutationRequest);
    app.post('/api/admin/teams/:id', (req, res) => {
      (req as any).auditEventCount = 1;
      return res.status(201).json({ success: true });
    });

    await request(app).post('/api/admin/teams/FTM-123');
    await flushAuditListener();

    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('records redirects separately from completed mutations', async () => {
    const app = express();
    app.use(auditMutationRequest);
    app.post('/api/team/players/save', (_req, res) => res.redirect('/team/login.php'));

    await request(app).post('/api/team/players/save');
    await flushAuditListener();

    expect((writeAuditLog as jest.Mock).mock.calls[0][1].eventType).toBe('MUTATION_REQUEST_REDIRECTED');
    expect((writeAuditLog as jest.Mock).mock.calls[0][1].metadata.outcome).toBe('REDIRECTED');
  });
});
