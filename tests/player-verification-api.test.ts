jest.mock('../src/db', () => ({ pool: { query: jest.fn(), connect: jest.fn() } }));
jest.mock('../src/adminAuth', () => ({ getAdminUserByUsername: jest.fn() }));
jest.mock('../src/services/playerVerification.service', () => ({
  ...jest.requireActual('../src/services/playerVerification.service'),
  verificationSnapshot: jest.fn(), readVerificationAsset: jest.fn()
}));
jest.mock('../src/services/playerOcr.document',()=>({...jest.requireActual('../src/services/playerOcr.document'),inspectOcrDocument:jest.fn(),previewOcrDocument:jest.fn(),prepareOcrDocument:jest.fn().mockResolvedValue(Buffer.from('prepared')),inspectPreparedQuality:jest.fn().mockResolvedValue({width:800,height:500,warnings:[]})}));
jest.mock('../src/services/playerOcr.provider',()=>({...jest.requireActual('../src/services/playerOcr.provider'),analyzeWithIapp:jest.fn()}));
import {inspectOcrDocument,previewOcrDocument,prepareOcrDocument,inspectPreparedQuality} from '../src/services/playerOcr.document';
import {analyzeWithIapp,SharedOcrBusy} from '../src/services/playerOcr.provider';
import {parseIappText} from '../src/services/playerOcr.parser';
import {VerificationError} from '../src/services/playerOcr.types';
import express from 'express';
import request from 'supertest';
import { pool } from '../src/db';
import { getAdminUserByUsername, AdminUser } from '../src/adminAuth';
import { createAdminSessionToken } from '../src/services/adminSession.service';
import { verificationSnapshot, readVerificationAsset } from '../src/services/playerVerification.service';
import { adminPlayerVerificationRouter } from '../src/routes/admin/adminPlayerVerification.router';

const app = express(); app.use(express.json());
// Preserve originalUrl while reproducing the app's isolated SAT portal rewrite.
app.use((req, _res, next) => { req.url = req.url.replace(/^\/sat-admin(?=\/)/, ''); next(); });
app.use(adminPlayerVerificationRouter);
const admin: AdminUser = { id: 'AI-ADMIN', username: 'ai-admin', fullname: 'ผู้ตรวจ', roleCode: 'SUPER_ADMIN', roleName: 'Admin', permissions: ['system:all'] };
const sat: AdminUser = { ...admin, id: 'AI-SAT', username: 'ai-sat', roleCode: 'SAT_OFFICER', province: 'เชียงใหม่' };
const verifier: AdminUser = { ...admin, id: 'AI-VERIFIER', username: 'ai-verifier', roleCode: 'DOCUMENT_VERIFIER' };
const cookie = (user = admin) => `${user.roleCode === 'SAT_OFFICER' ? 'sat_admin_session' : 'admin_session_token'}=${encodeURIComponent(createAdminSessionToken(user, user.roleCode === 'SAT_OFFICER' ? 'sat' : 'central'))}`;
const url = '/api/admin/players/PLAYER-AI/verification';
let player: any, job: any, auditFailure: boolean;
const query = jest.fn(); const release = jest.fn();
const payload = () => ({ jobId: null, docStatus: 'APPROVED', decisions: { fullName: 'SYSTEM_CORRECT', idCard: 'SYSTEM_CORRECT', birthDate: 'SYSTEM_CORRECT', expiryDate: 'SYSTEM_CORRECT' }, faceConfirmed: true, remarks: 'INTERNAL-ONLY', teamNote: 'TEAM-NOTE' });
beforeEach(() => {
  player = { id: 'PLAYER-AI', team_id: 'TEAM-AI', province: 'เชียงใหม่', is_test: false, doc_status: 'PENDING', category: 'U18', submitted_categories: 'U18' }; job = null; auditFailure = false;
  (getAdminUserByUsername as jest.Mock).mockImplementation(async name => [admin, sat, verifier].find(user => user.username === name));
  const document={bytes:Buffer.from('fixture'),type:'image/png',sha256:'b'.repeat(64)};const info={type:'image/png',pages:1,width:800,height:500,requiresPreparation:false};
  (readVerificationAsset as jest.Mock).mockResolvedValue(document);(inspectOcrDocument as jest.Mock).mockResolvedValue(info);(previewOcrDocument as jest.Mock).mockResolvedValue(Buffer.from('synthetic preview'));
  (verificationSnapshot as jest.Mock).mockResolvedValue({sourceHash:'a'.repeat(64),cacheKey:'c'.repeat(64),document,info,selection:{page:1}});
  (analyzeWithIapp as jest.Mock).mockResolvedValue({analysis:parseIappText(''),cached:false});
  (prepareOcrDocument as jest.Mock).mockResolvedValue(Buffer.from('prepared'));
  (inspectPreparedQuality as jest.Mock).mockResolvedValue({width:800,height:500,warnings:[]});
  query.mockImplementation(async (sql: string, values: any[] = []) => {
    if (sql.includes('SELECT p.*')) return { rows: player && Boolean(player.is_test) === Boolean(values?.[1]) ? [player] : [] };
    if (sql.includes('SELECT * FROM football_player_ai_verification')) return { rows: job && !(sql.includes("error_code IS DISTINCT FROM 'MANUAL_REVIEW'") && job.error_code === 'MANUAL_REVIEW') ? [job] : [] };
    if (sql.includes('INSERT INTO football_audit_log') && auditFailure) throw Error('private DB diagnostic');
    if(sql.startsWith('INSERT INTO football_player_ai_verification')&&sql.includes('RETURNING'))return {rows:[{id:values[0],source_hash:values[2],state:'QUEUED',result:JSON.parse(values[3]),created_at:new Date(),updated_at:new Date()}],rowCount:1};
    return { rows: [], rowCount: 1 };
  });
  (pool.query as jest.Mock).mockImplementation(query);
  (pool.connect as jest.Mock).mockResolvedValue({ query, release });
});
it('denies anonymous requests', async () => {
  const response = await request(app).get(url); expect([302, 401]).toContain(response.status); expect(verificationSnapshot).not.toHaveBeenCalled();
});
it('denies cross-province requests before reading documents', async () => {
  player.province = 'ลำพูน';
  const response = await request(app).get('/sat-admin' + url).set('Cookie', cookie(sat));
  expect(response.status).toBe(403); expect(verificationSnapshot).not.toHaveBeenCalled();
});
it('rejects mutation requests without a non-simple CSRF header', async () => {
  const response = await request(app).post(url + '/delete').set('Cookie', cookie()).send({ confirmPlayerId: 'PLAYER-AI' });
  expect(response.status).toBe(403); expect(query).not.toHaveBeenCalled();
});
it('returns no cached result for a missing player or a Demo player', async () => {
  player.is_test = true;
  expect((await request(app).get(url).set('Cookie', cookie())).status).toBe(404);
});
it.each([admin, sat, verifier])('permits scoped $roleCode to read results with no job', async user => {
  const response = await request(app).get((user.roleCode === 'SAT_OFFICER' ? '/sat-admin' : '') + url).set('Cookie', cookie(user));
  expect(response.status).toBe(200); expect(response.body.job).toBeNull(); expect(response.headers['cache-control']).toBe('no-store');
});
it.each(['document-info', 'verification-read', 'verification-submit'])('returns a safe missing-document error before enqueue for %s', async endpoint => {
  const error = new VerificationError(422, 'ไม่พบไฟล์เอกสารแนบ กรุณาติดต่อผู้ดูแลระบบ', 'OCR_DOCUMENT_NOT_FOUND');
  (readVerificationAsset as jest.Mock).mockRejectedValue(error);
  (verificationSnapshot as jest.Mock).mockRejectedValue(error);
  const response = endpoint === 'verification-submit'
    ? await request(app).post(url).set('Cookie', cookie()).set('X-Requested-With', 'PlayerVerification').send({})
    : await request(app).get(endpoint === 'document-info' ? url + '/document-info' : url).set('Cookie', cookie());
  expect(response.status).toBe(422);
  expect(response.body).toMatchObject({ success: false, code: 'OCR_DOCUMENT_NOT_FOUND', message: error.message });
  expect(analyzeWithIapp).not.toHaveBeenCalled();
  expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO football_player_ai_verification'))).toBe(false);
});

it('does not return stale OCR or face data', async () => {
  job = { id: 'old', source_hash: 'b'.repeat(64), state: 'SUCCEEDED', result: { private: 'old-data' } };
  const response = await request(app).get(url).set('Cookie', cookie());
  expect(response.body).toMatchObject({ job: null, stale: true }); expect(response.text).not.toContain('old-data');
});
it('strips the cropped face from the JSON response', async () => {
  job = { id: 'old', source_hash: 'a'.repeat(64), state: 'SUCCEEDED', result: { ...parseIappText(''), cardFaceJpeg: 'PRIVATE-CROP' } };
  const response = await request(app).get(url).set('Cookie', cookie());
  expect(response.body.job).not.toHaveProperty('hasCardFace'); expect(response.text).not.toContain('PRIVATE-CROP');
});
it('saves manual review, team note and audit in one transaction without sending private notes to the team', async () => {
  const response = await request(app).post('/sat-admin' + url + '/review').set('Cookie', cookie(sat)).set('X-Requested-With', 'PlayerVerification').send(payload());
  expect(response.status).toBe(200);
  const calls = query.mock.calls; expect(calls[0][0]).toBe('BEGIN'); expect(calls.at(-1)![0]).toBe('COMMIT');
  const update = calls.find(([sql]) => sql.startsWith('UPDATE football_player SET'))!;
  expect(update[1]).toEqual(['PLAYER-AI', 'APPROVED', 'TEAM-NOTE']);
  const review = calls.find(([sql]) => sql.startsWith('UPDATE football_player_ai_verification SET review'))!;
  expect(JSON.parse(review[1][1]).internalNote).toBe('INTERNAL-ONLY');
});
it('rolls back when the audit fails instead of claiming the save succeeded', async () => {
  auditFailure = true;
  const response = await request(app).post(url + '/review').set('Cookie', cookie()).set('X-Requested-With', 'PlayerVerification').send(payload());
  expect(response.status).toBe(503); expect(query.mock.calls.at(-1)![0]).toBe('ROLLBACK'); expect(response.text).not.toContain('private DB diagnostic');
});
it('rejects stale AI review before changing player status', async () => {
  const response = await request(app).post(url + '/review').set('Cookie', cookie()).set('X-Requested-With', 'PlayerVerification').send({ ...payload(), jobId: '11111111-1111-4111-8111-111111111111' });
  expect(response.status).toBe(409); expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE football_player SET'))).toBe(false);
});
it('requires explicit confirmation and province scope for deletion', async () => {
  expect((await request(app).post(url + '/delete').set('Cookie', cookie()).set('X-Requested-With', 'PlayerVerification').send({ confirmPlayerId: 'OTHER' })).status).toBe(400);
  player.province = 'ลำพูน';
  expect((await request(app).post('/sat-admin' + url + '/delete').set('Cookie', cookie(sat)).set('X-Requested-With', 'PlayerVerification').send({ confirmPlayerId: 'PLAYER-AI' })).status).toBe(403);
  expect(query.mock.calls.some(([sql]) => sql.startsWith('DELETE '))).toBe(false);
});
it('deletes only the selected scoped player and their AI results with an audit', async () => {
  const response = await request(app).post('/sat-admin' + url + '/delete').set('Cookie', cookie(sat)).set('X-Requested-With', 'PlayerVerification').send({ confirmPlayerId: 'PLAYER-AI' });
  expect(response.status).toBe(200);
  expect(query.mock.calls.find(([sql]) => sql.startsWith('DELETE FROM football_player WHERE'))![1]).toEqual(['PLAYER-AI', 'TEAM-AI']);
  expect(query.mock.calls.at(-1)![0]).toBe('COMMIT');
});
it('does not duplicate an already running same-source job', async () => {
  job = { id: '11111111-1111-4111-8111-111111111111', state: 'RUNNING', source_hash: 'a'.repeat(64), created_at: new Date(), updated_at: new Date() };
  const response = await request(app).post(url).set('Cookie', cookie()).set('X-Requested-With', 'PlayerVerification').send({ force: true, confirmPaidRetry:true });
  expect(response.status).toBe(202); expect(response.body.job.id).toBe(job.id);
  expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO football_player_ai_verification'))).toBe(false);
});
it('identifies an interrupted job without presenting an old success', async () => {
  job = { id: '11111111-1111-4111-8111-111111111111', state: 'RUNNING', source_hash: 'a'.repeat(64), updated_at: new Date(Date.now() - 240000) };
  const response = await request(app).get(url).set('Cookie', cookie());
  expect(response.body).toMatchObject({ job: null, interrupted: true });
});
it('persists OCR-only fields without cropped faces or fabricated confidence', async () => {
  job={id:'provider-result',state:'QUEUED',source_hash:'a'.repeat(64),created_at:new Date(),updated_at:new Date()};
  expect((await request(app).get(url).set('Cookie',cookie())).status).toBe(200);
  for(let i=0;i<30&&!query.mock.calls.some(([sql])=>sql.includes("SET state='SUCCEEDED'"));i++)await new Promise(resolve=>setTimeout(resolve,5));
  expect(analyzeWithIapp).toHaveBeenCalledTimes(1);
  const update=query.mock.calls.find(([sql])=>sql.includes("SET state='SUCCEEDED'"));expect(update).toBeDefined();
  const result=JSON.parse(update![1][1]);expect(result).not.toHaveProperty('face');expect(result).not.toHaveProperty('cardFaceJpeg');
  expect(Object.values(result.fields).every((field:any)=>field.confidence===null)).toBe(true);
});
it('queues an AI attempt immediately after a manual review', async () => {
  job = { id: 'manual', state: 'FAILED', error_code: 'MANUAL_REVIEW', created_at: new Date() };
  const baseQuery = query.getMockImplementation()!;
  query.mockImplementation(async (sql: string, values: any[] = []) => {
    if (sql.startsWith('INSERT INTO football_player_ai_verification') && sql.includes('RETURNING')) return { rows: [{ id: values[0], source_hash: 'a'.repeat(64), state: 'QUEUED', created_at: new Date() }], rowCount: 1 };
    // Leave scheduling to a later poll; this test checks enqueue/cooldown only.
    if (sql.includes("SET state='RUNNING'")) return { rows: [], rowCount: 0 };
    return baseQuery(sql, values);
  });
  const response = await request(app).post(url).set('Cookie', cookie()).set('X-Requested-With', 'PlayerVerification').send({ force: true, confirmPaidRetry:true });
  expect(response.status).toBe(202);
  expect(query.mock.calls.some(([sql]) => sql.includes("error_code IS DISTINCT FROM 'MANUAL_REVIEW'"))).toBe(true);
  expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO football_player_ai_verification'))).toBe(true);
});

it('queues a paid retry immediately after a recent failed AI attempt', async () => {
  job = { id: 'recent', state: 'FAILED', error_code: 'AI_CONNECTION_FAILED', created_at: new Date(Date.now() - 18000) };
  const response = await request(app).post(url).set('Cookie', cookie()).set('X-Requested-With', 'PlayerVerification').send({ force: true, confirmPaidRetry:true });
  expect(response.status).toBe(202);
  expect(response.body.job.state).toBe('QUEUED');
  expect(response.body.job).not.toHaveProperty('retryAfterSeconds');
  expect(response.headers['retry-after']).toBeUndefined();
  expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO football_player_ai_verification'))).toBe(true);
});

it('does not delay a recent AI retry after a manual review', async () => {
  const baseQuery = query.getMockImplementation()!;
  query.mockImplementation(async (sql: string, values: any[] = []) => sql.includes("error_code IS DISTINCT FROM 'MANUAL_REVIEW'")
    ? { rows: [{ id: 'real-attempt', state: 'FAILED', error_code: 'AI_CONNECTION_FAILED', created_at: new Date() }] }
    : baseQuery(sql, values));
  job = { id: 'manual', state: 'FAILED', error_code: 'MANUAL_REVIEW', created_at: new Date() };
  const response = await request(app).post(url).set('Cookie', cookie()).set('X-Requested-With', 'PlayerVerification').send({});
  expect(response.status).toBe(202);
  expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO football_player_ai_verification'))).toBe(true);
});

it.each([
  ['OCR_AUTH_FAILED','API key'],['OCR_CREDIT_EXHAUSTED','เครดิต'],['OCR_BUSY','รับงานเต็ม'],
  ['OCR_TIMEOUT','เกินกำหนด'],['OCR_INVALID_RESPONSE','ผลตอบกลับ'],['OCR_BUDGET_EXCEEDED','เพดาน']
])('persists a bounded OCR diagnostic %s without leaking provider data',async(code,message)=>{
  job={id:'diagnostic-'+code,state:'QUEUED',source_hash:'a'.repeat(64),created_at:new Date(),updated_at:new Date()};
  (analyzeWithIapp as jest.Mock).mockRejectedValueOnce(new VerificationError(503,'PRIVATE-PROVIDER-DIAGNOSTIC',code));
  expect((await request(app).get(url).set('Cookie',cookie())).status).toBe(200);
  for(let i=0;i<30&&!query.mock.calls.some(([sql])=>sql.includes('error_code=$2'));i++)await new Promise(resolve=>setTimeout(resolve,5));
  expect(query.mock.calls.find(([sql])=>sql.includes('error_code=$2'))?.[1]).toEqual([job.id,code]);
  job.state='FAILED';job.error_code=code;
  const response=await request(app).get(url).set('Cookie',cookie());expect(response.body.job.errorMessage).toContain(message);expect(response.text).not.toContain('PRIVATE-');expect(response.body.job.result).toBeNull();
});
it.each([
  [{ birthDate: 'SYSTEM_CORRECT' }, true],
  [{ ...payload().decisions, expiryDate: undefined }, true],
  [{ ...payload().decisions, birthDate: 'INVALID' }, true],
])('rejects incomplete or invalid review before writes', async (decisions, faceConfirmed) => {
  const response = await request(app).post(url + '/review').set('Cookie', cookie()).set('X-Requested-With', 'PlayerVerification').send({ ...payload(), decisions, faceConfirmed });
  expect(response.status).toBe(400);
  expect(query.mock.calls.some(([sql]) => /^(UPDATE|INSERT)/.test(sql))).toBe(false);
});
it.each([
  [true, 'SYSTEM_CORRECT', 'APPROVED', ''],
  [false, 'SYSTEM_CORRECT', 'APPROVED', ''],
  [true, 'CORRECT_DATA', 'ACTION_REQUIRED', 'กรุณาตรวจสอบและแก้ไขวันเดือนปีเกิดให้ตรงกับเอกสาร'],
  [true, 'REUPLOAD', 'ACTION_REQUIRED', 'กรุณาอัปโหลดเอกสารใหม่เพื่อให้ตรวจสอบวันเดือนปีเกิดได้ชัดเจน'],
])('honors selected status while retaining mandatory reasons: same=%s decision=%s', async (faceConfirmed, choice, docStatus, reason) => {
  const selected=docStatus === 'APPROVED' ? 'ACTION_REQUIRED' : 'APPROVED';
  const response = await request(app).post(url + '/review').set('Cookie', cookie()).set('X-Requested-With', 'PlayerVerification').send({ ...payload(), faceConfirmed, decisions: { ...payload().decisions, birthDate: choice }, docStatus:selected });
  expect(response.status).toBe(200);
  expect(response.body.docStatus).toBe(selected);
  expect(response.body.teamNote).toContain(reason);
  expect(response.body.teamNote).toContain('TEAM-NOTE');
  expect(query.mock.calls.find(([sql]) => sql.startsWith('UPDATE football_player SET'))![1]).toEqual(['PLAYER-AI', selected, response.body.teamNote]);
  const review = JSON.parse(query.mock.calls.find(([sql]) => sql.startsWith('UPDATE football_player_ai_verification SET review'))![1][1]);
  expect(review.reviewVersion).toBe(3);expect(review).not.toHaveProperty('faceConfirmed');
  expect(review).toMatchObject({docStatus:selected,decisionStatus:docStatus,statusSource:'MANUAL'});
});
it.each([admin,sat].flatMap(user=>['PENDING','APPROVED','ACTION_REQUIRED','CORRECTED'].map(status=>({user,status}))))('saves $status selected by $user.roleCode',async({user,status})=>{
  const response=await request(app).post((user===sat?'/sat-admin':'')+url+'/review').set('Cookie',cookie(user)).set('X-Requested-With','PlayerVerification').send({...payload(),docStatus:status});
  expect(response.status).toBe(200);expect(response.body.docStatus).toBe(status);
  expect(query.mock.calls.find(([sql])=>sql.startsWith('UPDATE football_player SET'))![1][1]).toBe(status);
});
it.each(['UNKNOWN','',null,{}])('rejects invalid manual status %j without player writes',async status=>{
  const response=await request(app).post(url+'/review').set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send({...payload(),docStatus:status});
  expect(response.status).toBe(400);expect(query.mock.calls.some(([sql])=>/^(UPDATE|INSERT)/.test(sql))).toBe(false);
});
it('keeps manual status changes scoped to the SAT province',async()=>{
  player.province='ลำพูน';
  const response=await request(app).post('/sat-admin'+url+'/review').set('Cookie',cookie(sat)).set('X-Requested-With','PlayerVerification').send({...payload(),docStatus:'CORRECTED'});
  expect(response.status).toBe(403);expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE football_player SET'))).toBe(false);
});
it('allows SAT staff to inspect but blocks saving an athlete until every registered category is submitted',async()=>{
  player.category='U14,U18';player.submitted_categories='U14';
  const response=await request(app).post('/sat-admin'+url+'/review').set('Cookie',cookie(sat)).set('X-Requested-With','PlayerVerification').send(payload());
  expect(response.status).toBe(409);expect(response.body.message).toContain('U18');
  expect(query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
  expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE football_player SET'))).toBe(false);
  const read=await request(app).get('/sat-admin'+url).set('Cookie',cookie(sat));
  expect(read.status).toBe(200);
});
it('blocks central Admin review too when the team has not submitted the athlete roster',async()=>{
  player.submitted_categories='';
  const response=await request(app).post(url+'/review').set('Cookie',cookie(admin)).set('X-Requested-With','PlayerVerification').send(payload());
  expect(response.status).toBe(409);expect(response.body.message).toContain('U18');
  expect(query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
  expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE football_player SET'))).toBe(false);
});
it('resets pending reviews without requiring old decisions, a current job or readable attachments',async()=>{
  const r=await request(app).post(url+'/review').set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send({...payload(),jobId:null,decisions:{},docStatus:'PENDING'});
  expect(r.status).toBe(200);expect(r.body).toMatchObject({docStatus:'PENDING',reset:true});expect(verificationSnapshot).not.toHaveBeenCalled();expect(readVerificationAsset).not.toHaveBeenCalled();
  const cleared=query.mock.calls.find(([sql])=>sql.includes("error_code='REVIEW_RESET_CLEARED'"));expect(cleared?.[1]).toEqual(['PLAYER-AI']);expect(cleared?.[0]).toContain('result=NULL,review=NULL');
  const marker=query.mock.calls.find(([sql])=>sql.includes("'REVIEW_RESET',$4::jsonb"));expect(JSON.parse(marker![1][3])).toMatchObject({decisions:{},docStatus:'PENDING',internalNote:'INTERNAL-ONLY',teamNote:'TEAM-NOTE'});
  expect(query.mock.calls.some(([sql])=>/DELETE FROM football_player_ocr|DELETE FROM football_audit/.test(sql))).toBe(false);
  expect(query.mock.calls.at(-1)![0]).toBe('COMMIT');
});
it('rolls back clearing and the pending status when audit persistence fails',async()=>{
  auditFailure=true;const r=await request(app).post(url+'/review').set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send({...payload(),docStatus:'PENDING',decisions:{}});
  expect(r.status).toBe(503);expect(query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
});
it('returns an empty reset state without loading an old result or scheduling OCR',async()=>{
  job={id:'reset',state:'FAILED',error_code:'REVIEW_RESET',review:{internalNote:'STAFF-NOTE',teamNote:'TEAM-NOTE'}};
  const r=await request(app).get(url).set('Cookie',cookie());expect(r.body).toMatchObject({job:null,reset:true,internalNote:'STAFF-NOTE'});
  expect(readVerificationAsset).not.toHaveBeenCalled();expect(analyzeWithIapp).not.toHaveBeenCalled();
});
it('requires explicit paid confirmation to start a new round after resetting',async()=>{
  job={id:'reset',state:'FAILED',error_code:'REVIEW_RESET',created_at:new Date(),updated_at:new Date()};
  const r=await request(app).post(url).set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send({});
  expect(r.body.code).toBe('OCR_RESET_CONFIRMATION_REQUIRED');expect(analyzeWithIapp).not.toHaveBeenCalled();
});
it('rejects an enqueue snapshot made before a concurrent reset committed',async()=>{
  const base=query.getMockImplementation()!;query.mockImplementation((sql:string,values:any[])=>sql.startsWith('SELECT id FROM football_player_ai_verification')?{rows:[{id:'new-reset'}]}:base(sql,values));
  const r=await request(app).post(url).set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send({force:true,confirmPaidRetry:true});
  expect(r.body.code).toBe('OCR_RESET_CHANGED');expect(analyzeWithIapp).not.toHaveBeenCalled();
});

it('requires explicit paid retry confirmation before scheduling OCR',async()=>{
  const r=await request(app).post(url).set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send({force:true});
  expect(r.status).toBe(400);expect(analyzeWithIapp).not.toHaveBeenCalled();
});
it('requires frame confirmation for whole-paper scans',async()=>{
  const snapshot=await verificationSnapshot({});snapshot.info.requiresPreparation=true;(verificationSnapshot as jest.Mock).mockResolvedValue(snapshot);
  const r=await request(app).post(url).set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send({});
  expect(r.body.code).toBe('OCR_PREPARATION_REQUIRED');expect(analyzeWithIapp).not.toHaveBeenCalled();
});
it('keeps document previews scoped and rejects a changed document hash',async()=>{
  player.province='ลำพูน';expect((await request(app).get('/sat-admin'+url+'/document-info').set('Cookie',cookie(sat))).status).toBe(403);expect(readVerificationAsset).not.toHaveBeenCalled();
  player.province='เชียงใหม่';expect((await request(app).get(url+'/document-preview?hash=wrong&page=1').set('Cookie',cookie())).status).toBe(409);expect(previewOcrDocument).not.toHaveBeenCalled();
  const r=await request(app).get(url+'/document-preview?hash='+'b'.repeat(64)+'&page=1').set('Cookie',cookie());expect(r.status).toBe(200);expect(r.headers['content-type']).toContain('image/jpeg');expect(r.headers['cache-control']).toBe('no-store');
});
it('leaves a shared-document task queued while another process owns OCR',async()=>{
  job={id:'shared-wait',state:'QUEUED',source_hash:'a'.repeat(64),created_at:new Date(),updated_at:new Date()};(analyzeWithIapp as jest.Mock).mockRejectedValueOnce(new SharedOcrBusy());
  await request(app).get(url).set('Cookie',cookie());
  for(let i=0;i<30&&!query.mock.calls.some(([sql])=>sql.includes("SET state='QUEUED'"));i++)await new Promise(resolve=>setTimeout(resolve,5));
  expect(query.mock.calls.some(([sql])=>sql.includes("SET state='QUEUED'"))).toBe(true);
});
it('previews prepared bytes without any paid request or verification reservation',async()=>{
  const r=await request(app).post(url+'/preparation-preview').set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send({documentHash:'b'.repeat(64),selection:{page:1,rotation:2,enhance:true}});
  expect(r.status).toBe(200);expect(r.body.image).toMatch(/^data:image\/jpeg;base64,/);expect(r.headers['cache-control']).toBe('no-store');
  expect(analyzeWithIapp).not.toHaveBeenCalled();expect(query.mock.calls.some(([sql])=>/^(INSERT|UPDATE)/.test(sql))).toBe(false);
});
it('keeps preparation preview inside CSRF, province and document-version boundaries',async()=>{
  expect((await request(app).post(url+'/preparation-preview').set('Cookie',cookie()).send({})).status).toBe(403);
  player.province='ลำพูน';expect((await request(app).post('/sat-admin'+url+'/preparation-preview').set('Cookie',cookie(sat)).set('X-Requested-With','PlayerVerification').send({})).status).toBe(403);
  player.province='เชียงใหม่';expect((await request(app).post(url+'/preparation-preview').set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send({documentHash:'stale'})).status).toBe(409);
  expect(analyzeWithIapp).not.toHaveBeenCalled();
});
it('requires paid retry confirmation when parser changes on the same document',async()=>{
  job={id:'old-parser',state:'SUCCEEDED',source_hash:'old-source',created_at:new Date(0),updated_at:new Date(0),result:{documentHash:'b'.repeat(64),modelVersion:'old-parser',preparation:{page:1},fields:{}}};
  const read=await request(app).get(url).set('Cookie',cookie());expect(read.body).toMatchObject({job:null,stale:true,parserChanged:true});
  const write=await request(app).post(url).set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send({});
  expect(write.body.code).toBe('OCR_PARSER_CHANGED');expect(analyzeWithIapp).not.toHaveBeenCalled();
  expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT INTO football_player_ai_verification'))).toBe(false);
});

it('accepts the expired-card decision only for expiry and audits its reason without a schema change',async()=>{
  const data=payload();data.docStatus='ACTION_REQUIRED';data.decisions.expiryDate='EXPIRED_CARD';
  const result=await request(app).post(url+'/review').set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send(data);
  expect(result.status).toBe(200);expect(result.body.teamNote).toContain('บัตรประชาชนหมดอายุ');
  const saved=query.mock.calls.find(([sql])=>sql.startsWith('UPDATE football_player_ai_verification SET review='));
  expect(JSON.parse(saved![1][1])).toMatchObject({reviewVersion:3,decisions:{expiryDate:'EXPIRED_CARD'},decisionSources:{expiryDate:'STAFF_EDITED'},decisionStatus:'ACTION_REQUIRED'});
  const invalid=await request(app).post(url+'/review').set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send({...data,decisions:{...data.decisions,fullName:'EXPIRED_CARD'}});
  expect(invalid.status).toBe(400);
});
it('recomputes expiry from a successful cache without contacting OCR',async()=>{
  const dates=require('../src/services/playerOcr.date');const clock=jest.spyOn(dates,'bangkokToday');
  job={id:'11111111-1111-4111-8111-111111111111',source_hash:'a'.repeat(64),state:'SUCCEEDED',created_at:new Date(),updated_at:new Date(),result:{
    ...parseIappText('Thai National ID Card'),documentHash:'b'.repeat(64),fields:{...parseIappText('').fields,expiryDate:{value:'2026-11-08',confidence:null,validation:'VALID'}}}};
  try{
    clock.mockReturnValue('2026-11-08');let result=await request(app).get(url).set('Cookie',cookie());
    expect(result.status).toBe(200);expect(result.body.job.result.rows.find((r:any)=>r.field==='expiryDate')).toMatchObject({expired:false,suggestedDecision:'SYSTEM_CORRECT'});
    clock.mockReturnValue('2026-11-09');result=await request(app).get(url).set('Cookie',cookie());
    expect(result.body.job.result.rows.find((r:any)=>r.field==='expiryDate')).toMatchObject({expired:true,status:'EXPIRED_CARD',suggestedDecision:'EXPIRED_CARD'});
    expect(analyzeWithIapp).not.toHaveBeenCalled();
  }finally{clock.mockRestore();}
});
it.each(['AI_PREFILL','SAVED_REVIEW'])('rejects a %s not-expired choice that became stale before save',async source=>{
  const clock=jest.spyOn(require('../src/services/playerOcr.date'),'bangkokToday').mockReturnValue('2026-11-09');
  job={id:'11111111-1111-4111-8111-111111111111',source_hash:'a'.repeat(64),state:'SUCCEEDED',result:{provider:'iapp',fields:{expiryDate:{value:'2026-11-08',confidence:null,validation:'VALID'}}},review:{decisions:payload().decisions}};
  try{
    const result=await request(app).post(url+'/review').set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send({...payload(),jobId:job.id,decisionSources:{expiryDate:source}});
    expect(result.status).toBe(409);expect(result.body.message).toContain('บัตรหมดอายุ');
    expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE football_player SET doc_status'))).toBe(false);
  }finally{clock.mockRestore();}
});
it.each([{}, {provider:'iapp',modelVersion:require('../src/services/playerOcr.types').OCR_PARSER_REVISION,fields:{}}])('requires explicit paid confirmation for incomplete legacy results without a document hash',async result=>{
  job={id:'legacy-no-hash',state:'SUCCEEDED',source_hash:'a'.repeat(64),created_at:new Date(0),updated_at:new Date(0),result};
  const read=await request(app).get(url).set('Cookie',cookie());
  expect(read.body).toMatchObject({job:null,parserChanged:true,stale:true});
  const write=await request(app).post(url).set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send({});
  expect(write.status).toBe(409);expect(write.body.code).toBe('OCR_PARSER_CHANGED');expect(analyzeWithIapp).not.toHaveBeenCalled();
});
it('retains prior decisions and the verified AI/manual origins in immutable audit metadata',async()=>{
  job={id:'11111111-1111-4111-8111-111111111111',source_hash:'a'.repeat(64),state:'SUCCEEDED',result:{provider:'iapp',fields:{expiryDate:{value:'2000-01-01',validation:'VALID',confidence:null}}},review:{decisions:payload().decisions}};
  const data={...payload(),jobId:job.id,docStatus:'ACTION_REQUIRED',decisions:{...payload().decisions,expiryDate:'EXPIRED_CARD'},decisionSources:{expiryDate:'AI_PREFILL'}};
  const result=await request(app).post(url+'/review').set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send(data);
  expect(result.status).toBe(200);
  const call=query.mock.calls.find(([sql])=>sql.includes('INSERT INTO football_audit_log'))!;
  const metadata=JSON.parse(call[1].find((value:any)=>typeof value==='string'&&value.includes('"previousDecisions"')));
  expect(JSON.parse(metadata.previousDecisions).expiryDate).toBe('SYSTEM_CORRECT');expect(JSON.parse(metadata.decisions).expiryDate).toBe('EXPIRED_CARD');
  expect(JSON.parse(metadata.decisionSources).expiryDate).toBe('AI_PREFILL');expect(metadata.aiPrefillCount).toBe('1');expect(metadata.staffEditedCount).toBe('3');
});

it('rejects an AI-prefilled approval for an invalid name candidate but permits an explicit staff choice',async()=>{
 const {OCR_PARSER_REVISION}=require('../src/services/playerOcr.types');
 player.name='ด.ช. ทดสอบ ตัวอย่าง';
 job={id:'11111111-1111-4111-8111-111111111111',source_hash:'a'.repeat(64),state:'SUCCEEDED',result:{provider:'iapp',modelVersion:OCR_PARSER_REVISION,documentType:'id_card',fields:{fullName:{value:'ด.ป ทดสอบ',validation:'INVALID',confidence:null}}}};
 const data={...payload(),jobId:job.id,decisionSources:{fullName:'AI_PREFILL'}};
 const rejected=await request(app).post(url+'/review').set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send(data);
 expect(rejected.status).toBe(409);expect(rejected.body.message).toContain('เลือกการตัดสินใจด้วยตนเอง');
 expect(query.mock.calls.some(([sql])=>sql.startsWith('UPDATE football_player SET'))).toBe(false);
 const allowed=await request(app).post(url+'/review').set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send({...data,decisionSources:{fullName:'STAFF_EDITED'}});
 expect(allowed.status).toBe(200);
});

it('accepts a prefix-only legacy difference without forcing manual decisions or a paid retry',async()=>{
 player.name='นาย ทดสอบ ตัวอย่าง';const analysis=parseIappText('Thai National ID Card\nชื่อตัวและชื่อสกุล ด.ป ทดสอบ ตัวอย่าง');
 analysis.modelVersion='iapp-plain-text-parser-v5';analysis.fields.fullName={value:'ด.ป ทดสอบ ตัวอย่าง',confidence:null,validation:'INVALID',reasonCode:'NAME_PREFIX_UNRECOGNIZED'};
 job={id:'11111111-1111-4111-8111-111111111111',source_hash:'a'.repeat(64),state:'SUCCEEDED',result:{...analysis,documentHash:'b'.repeat(64),preparation:{page:1}}};
 const read=await request(app).get(url).set('Cookie',cookie());expect(read.status).toBe(200);expect(read.body.parserChanged).toBe(false);
 expect(read.body.job.result.modelVersion).toBe('iapp-plain-text-parser-v5');expect(read.body.job.result.rows[0]).toMatchObject({status:'MATCH',requiresManualDecision:false});
 expect(analyzeWithIapp).not.toHaveBeenCalled();
 const saved=await request(app).post(url+'/review').set('Cookie',cookie()).set('X-Requested-With','PlayerVerification').send({...payload(),jobId:job.id,decisionSources:{fullName:'AI_PREFILL'}});
 expect(saved.status).toBe(200);
});

it('permits Demo players only when demo=true is explicitly requested within province scope', async () => {
  player.is_test = true;
  expect((await request(app).get(url + '?demo=true').set('Cookie', cookie(admin))).status).toBe(200);
  expect((await request(app).get('/sat-admin' + url + '?demo=true').set('Cookie', cookie(sat))).status).toBe(200);
  player.province = 'ลำพูน';
  expect((await request(app).get('/sat-admin' + url + '?demo=true').set('Cookie', cookie(sat))).status).toBe(403);
});
