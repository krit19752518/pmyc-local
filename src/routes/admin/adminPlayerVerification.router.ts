import { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../../db';
import { checkAdminSession } from '../../services/adminSession.service';
import { withDbTransaction, QueryExecutor } from '../../services/dbTransaction.service';
import { writeAuditLog } from '../../services/auditLog.service';
import { readVerificationAsset } from '../../services/playerVerification.service';
import { inspectOcrDocument, previewOcrDocument, prepareOcrDocument, inspectPreparedQuality, selectionOf } from '../../services/playerOcr.document';
import { analyzeWithIapp, SharedOcrBusy } from '../../services/playerOcr.provider';
import { OCR_PARSER_REVISION, verificationFields, reusableOcrAnalysis } from '../../services/playerOcr.types';
import { documentNotice } from '../../services/playerVerification.details';
import { resetGeneration, resetVerification } from '../../services/playerVerification.reset';
import { playersDatabase } from '../../models/player.model';
import { compareVerification, validateReview, verificationSnapshot, VerificationError } from '../../services/playerVerification.service';

export const adminPlayerVerificationRouter = Router();
const prefix = '/api/admin/players/:playerId/verification';
const queryOnly: QueryExecutor = { query: (sql, values) => pool.query(sql, values) };
const active = new Set<string>();
type AdminRequest = Request & { adminUser?: { id: string; roleCode: string; province?: string } };

function boundary(req: AdminRequest, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  if (!req.adminUser || !['SUPER_ADMIN', 'DOCUMENT_VERIFIER', 'SAT_OFFICER'].includes(req.adminUser.roleCode)) return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ตรวจข้อมูลนักกีฬา' });
  if (req.method !== 'GET' && (req.get('X-Requested-With') !== 'PlayerVerification' || !req.is('application/json'))) return res.status(403).json({ success: false, message: 'รูปแบบคำขอไม่ถูกต้อง' });
  next();
}
async function playerFor(req: AdminRequest, db: QueryExecutor = queryOnly, lock = false) {
  const id = req.params.playerId;
  if (!id || id.length > 80) throw new VerificationError(400, 'รหัสนักกีฬาไม่ถูกต้อง');
  const allowDemo = req.query?.demo === 'true' || req.body?.demo === true;
  const response = await db.query(`SELECT p.*, p.birth_date::text AS verification_birth_date, t.province, t.is_test, t.submitted_categories FROM football_player p
    JOIN football_registered_team t ON t.id = p.team_id
    WHERE p.id = $1 AND COALESCE(t.is_test,FALSE) = $2 AND COALESCE(t.is_deleted,FALSE) = FALSE
    ${lock ? 'FOR UPDATE OF p, t' : ''}`, [id, allowDemo]);
  const player = response.rows[0];
  if (!player) throw new VerificationError(404, 'ไม่พบข้อมูลนักกีฬา');
  if (req.adminUser?.roleCode === 'SAT_OFFICER' && (!req.adminUser.province || String(player.province || '').trim() !== req.adminUser.province.trim())) throw new VerificationError(403, 'ไม่มีสิทธิ์เข้าถึงนักกีฬานอกจังหวัดที่รับผิดชอบ');
  return player;
}
function requireSubmittedRoster(player: any) {
  const categories = String(player.category || player.categories || '').split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
  const submitted = new Set(String(player.submitted_categories || '').split(',').map(value => value.trim().toUpperCase()).filter(Boolean));
  const notSubmitted = categories.filter(category => !submitted.has(category));
  if (!categories.length || notSubmitted.length) {
    const label = notSubmitted.length ? notSubmitted.join(', ') : 'รุ่นที่ไม่ระบุ';
    throw new VerificationError(409, 'ทีมยังไม่ได้ส่งรายชื่อรุ่น ' + label + ' จึงยังเปลี่ยนสถานะนักกีฬาไม่ได้');
  }
}
function failed(res: Response, error: unknown) {
  // Never expose DB diagnostics, file paths, OCR text or service credentials.
  if (error instanceof VerificationError) {
    if (error.retryAfterSeconds) res.setHeader('Retry-After', String(error.retryAfterSeconds));
    return res.status(error.status).json({ success: false, message: error.message, code: error.code, retryAfterSeconds: error.retryAfterSeconds });
  }
  const code = (error as any)?.code;
  return res.status(503).json({ success: false, message: code === '42P01'
    ? 'ระบบยังไม่พร้อมบันทึกผลตรวจ AI กรุณาติดต่อผู้ดูแลระบบ'
    : 'บริการตรวจเอกสารยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง' });
}
const ocrErrors: Record<string, string> = {
  OCR_NOT_CONFIGURED: 'ยังไม่ได้เปิดใช้ iApp OCR หรือยังไม่ได้ตั้ง API key กรุณาติดต่อผู้ดูแลระบบ',
  OCR_AUTH_FAILED: 'iApp ไม่ยอมรับ API key กรุณาให้ผู้ดูแลตรวจสอบการตั้งค่า',
  OCR_CREDIT_EXHAUSTED: 'เครดิต iApp ไม่เพียงพอ กรุณาติดต่อผู้ดูแลระบบ',
  OCR_BUSY: 'บริการ OCR กำลังรับงานเต็ม กรุณาลองใหม่ภายหลัง',
  OCR_TIMEOUT: 'OCR ใช้เวลาเกินกำหนด ยังไม่ส่งซ้ำอัตโนมัติเพื่อป้องกันค่าใช้จ่ายซ้ำ',
  OCR_BUDGET_EXCEEDED: 'ถึงเพดาน OCR ที่กำหนดแล้ว กรุณาติดต่อผู้ดูแลระบบ',
  OCR_DOCUMENT_REJECTED: 'ผู้ให้บริการอ่านไฟล์นี้ไม่ได้ กรุณาตรวจเอกสารหรืออัปโหลดใหม่',
  OCR_INVALID_RESPONSE: 'ผลตอบกลับ OCR ไม่ถูกต้อง กรุณาให้ผู้ดูแลตรวจสอบ',
  OCR_CONNECTION_FAILED: 'ติดต่อ iApp OCR ไม่ได้ กรุณาลองใหม่ภายหลัง',
  OCR_PREVIOUS_FAILED: 'เอกสารนี้เคยอ่านไม่สำเร็จ กรุณากดยืนยันก่อนส่งอ่านใหม่',
  OCR_PARSER_CHANGED: 'ตัวแยกข้อมูลปรับปรุงแล้ว กรุณายืนยันก่อนอ่านใหม่ หรือให้เจ้าหน้าที่ตรวจต้นฉบับ',
  OCR_INTERRUPTED: 'งาน OCR เดิมถูกขัดจังหวะ กรุณาให้ผู้ดูแลตรวจสอบก่อนอ่านใหม่',
  INTERRUPTED: 'งานตรวจเอกสารถูกขัดจังหวะ กรุณาส่งตรวจอีกครั้ง',
  MANUAL_REVIEW: 'บันทึกการตรวจสอบโดยเจ้าหน้าที่แล้ว'
};
function currentOcrResult(result: any): boolean {
  return reusableOcrAnalysis(result);
}
function publicJob(row: any, player?: any) {
  if (!row) return null;
  // Explicit allowlist: legacy face crops/scores and raw provider responses never leave this API.
  const result = row.state === 'SUCCEEDED' && row.result?.fields ? {
    documentType: row.result.documentType, provider: row.result.provider, modelVersion: row.result.modelVersion,
    fields: row.result.fields, rows: player ? compareVerification(player, row.result) : row.result.rows,
    cached: row.result.cached === true, quality: row.result.quality, documentNotice: documentNotice(row.result), requiresStaffReview: true
  } : null;
  const oldReview = row.review;
  const review = oldReview ? { decisions: oldReview.decisions, teamNote: oldReview.teamNote, internalNote: oldReview.internalNote,
    docStatus: oldReview.docStatus, statusSource: oldReview.statusSource, decisionStatus: oldReview.decisionStatus,
    reviewVersion: oldReview.reviewVersion || 1,
    decisionSources: Object.fromEntries(verificationFields.filter(field => ['AI_PREFILL','STAFF_EDITED','SAVED_REVIEW'].includes(oldReview.decisionSources?.[field]))
      .map(field => [field, oldReview.decisionSources[field]])) } : null;
  return { id: row.id, state: row.state, createdAt: row.created_at, checkedAt: row.updated_at,
    errorCode: row.error_code, errorMessage: ocrErrors[row.error_code] || 'OCR ยังไม่พร้อม กรุณาตรวจด้วยตนเองหรือลองใหม่',
    result, review };
}
function schedule(row: any, player: any, snapshot: Awaited<ReturnType<typeof verificationSnapshot>>) {
  if (row.state !== 'QUEUED' || active.has(row.id) || active.size >= 2) return;
  active.add(row.id);
  void (async () => {
    try {
      const lease = await pool.query("UPDATE football_player_ai_verification SET state='RUNNING',updated_at=now() WHERE id=$1 AND state='QUEUED' RETURNING id", [row.id]);
      if (!lease.rowCount) return;
      const output = await analyzeWithIapp(snapshot.document, snapshot.selection, snapshot.cacheKey, row.result?.paidRetry === true, new Date(row.created_at).getTime(),
        {jobId:row.id,playerId:player.id,manualRetry:row.result?.paidRetry === true});
      const result = { ...output.analysis, cached: output.cached, preparation: snapshot.selection,
        documentHash: snapshot.document.sha256, rows: compareVerification(player, output.analysis) };
      await pool.query("UPDATE football_player_ai_verification SET state='SUCCEEDED',result=$2::jsonb,error_code=NULL,updated_at=now() WHERE id=$1 AND state='RUNNING'", [row.id, JSON.stringify(result)]);
    } catch (error) {
      if (error instanceof SharedOcrBusy || error instanceof VerificationError && error.code === 'OCR_PREPARATION_BUSY') {
        await pool.query("UPDATE football_player_ai_verification SET state='QUEUED',updated_at=now() WHERE id=$1 AND state='RUNNING'", [row.id]);
      } else {
        const code = error instanceof VerificationError ? error.code || 'OCR_SERVICE_FAILED' : 'OCR_SERVICE_FAILED';
        await pool.query("UPDATE football_player_ai_verification SET state='FAILED',error_code=$2,updated_at=now() WHERE id=$1 AND state='RUNNING'", [row.id, code]);
      }
    } finally { active.delete(row.id); }
  })().catch(() => { /* Persistence failure stays observable as an interrupted lease, never success. */ });
}

adminPlayerVerificationRouter.get(prefix + '/document-info', checkAdminSession, boundary, async (req: AdminRequest, res) => {
  try {
    const player = await playerFor(req), asset = await readVerificationAsset(player.doc_id_card);
    return res.json({ success: true, document: { ...await inspectOcrDocument(asset), hash: asset.sha256 } });
  } catch (error) { return failed(res, error); }
});
adminPlayerVerificationRouter.get(prefix + '/document-preview', checkAdminSession, boundary, async (req: AdminRequest, res) => {
  const requestId = randomUUID();
  let stage = 'player_lookup';
  res.setHeader('X-Request-Id', requestId);
  try {
    const player = await playerFor(req);
    stage = 'asset_read';
    const asset = await readVerificationAsset(player.doc_id_card);
    stage = 'hash_check';
    if (req.query.hash !== asset.sha256) throw new VerificationError(409, 'เอกสารเปลี่ยนแปลง กรุณาเปิดรายละเอียดใหม่');
    const page = Number(req.query.page || 1);
    stage = 'preview_render';
    const bytes = await previewOcrDocument(asset, page);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.type('image/jpeg').send(bytes);
  } catch (error) {
    const status = error instanceof VerificationError ? error.status : 503;
    const code = error instanceof VerificationError ? (error.code || `HTTP_${error.status}`) : 'PREVIEW_UNEXPECTED';
    console.warn('[player-document-preview]', JSON.stringify({ requestId, stage, status, code }));
    if (error instanceof VerificationError) {
      if (error.retryAfterSeconds) res.setHeader('Retry-After', String(error.retryAfterSeconds));
      return res.status(error.status).json({ success: false, message: error.message, code: error.code, retryAfterSeconds: error.retryAfterSeconds, requestId });
    }
    return res.status(503).json({ success: false, message: 'บริการแสดงภาพเอกสารยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง', requestId });
  }
});

// Local preparation only: no provider, quota reservation or verification job.
adminPlayerVerificationRouter.post(prefix + '/preparation-preview', checkAdminSession, boundary, async (req: AdminRequest, res) => {
  try {
    const player=await playerFor(req), asset=await readVerificationAsset(player.doc_id_card);
    if(req.body?.documentHash!==asset.sha256)throw new VerificationError(409,'เอกสารเปลี่ยนแปลง กรุณาเปิดรายละเอียดใหม่');
    const selection=selectionOf(req.body?.selection),bytes=await prepareOcrDocument(asset,selection);
    return res.json({success:true,image:'data:image/jpeg;base64,'+bytes.toString('base64'),quality:await inspectPreparedQuality(bytes),selection});
  } catch(error){return failed(res,error);}
});

adminPlayerVerificationRouter.post(prefix, checkAdminSession, boundary, async (req: AdminRequest, res) => {
  try {
    if (req.body?.force === true && req.body?.confirmPaidRetry !== true) throw new VerificationError(400, 'กรุณายืนยันค่าใช้จ่ายก่อนอ่านเอกสารใหม่');
    const player = await playerFor(req), snapshot = await verificationSnapshot(player, req.body?.selection);
    if (req.body?.documentHash && req.body.documentHash !== snapshot.document.sha256) throw new VerificationError(409, 'เอกสารเปลี่ยนแปลง กรุณาเปิดรายละเอียดใหม่');
    if (snapshot.info.requiresPreparation && req.body?.selectionConfirmed !== true) return res.status(409).json({ success: false, code: 'OCR_PREPARATION_REQUIRED', message: 'กรุณาเลือกหน้าบัตรและยืนยันกรอบเอกสารก่อนส่ง OCR' });
    const row = await withDbTransaction(async db => {
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['player-ai:' + player.id]);
      if(await resetGeneration(player.id,db)!==(snapshot.resetGeneration??null))throw new VerificationError(409,'ผลตรวจถูกล้างแล้ว กรุณาเปิดรายละเอียดใหม่','OCR_RESET_CHANGED');
      await db.query("UPDATE football_player_ai_verification SET state='FAILED',error_code='INTERRUPTED',updated_at=now() WHERE player_id=$1 AND state IN ('QUEUED','RUNNING') AND updated_at < now()-interval '3 minutes'", [player.id]);
      const prior = await db.query("SELECT * FROM football_player_ai_verification WHERE player_id=$1 AND error_code IS DISTINCT FROM 'MANUAL_REVIEW' ORDER BY created_at DESC LIMIT 1", [player.id]);
      const last = prior.rows[0];
      if(last?.error_code==='REVIEW_RESET'&&req.body?.force!==true)throw new VerificationError(409,'กรุณายืนยันอ่าน OCR ใหม่หลังล้างผลตรวจ','OCR_RESET_CONFIRMATION_REQUIRED');
      if (last && ['QUEUED', 'RUNNING'].includes(last.state)) return last;
      if(last?.state==='SUCCEEDED' && !currentOcrResult(last.result) && req.body?.force!==true)
        throw new VerificationError(409,ocrErrors.OCR_PARSER_CHANGED,'OCR_PARSER_CHANGED');
      if (last?.source_hash === snapshot.sourceHash && last.state === 'SUCCEEDED' && req.body?.force !== true) return last;
      const id = randomUUID();
      const metadata = { preparation: snapshot.selection, documentHash: snapshot.document.sha256,
        parserRevision: OCR_PARSER_REVISION, paidRetry: req.body?.force === true };
      const inserted = await db.query("INSERT INTO football_player_ai_verification(id,player_id,source_hash,state,result) VALUES($1,$2,$3,'QUEUED',$4::jsonb) RETURNING *", [id, player.id, snapshot.sourceHash, JSON.stringify(metadata)]);
      return inserted.rows[0];
    });
    if (!row || row.source_hash !== snapshot.sourceHash) throw new VerificationError(409, 'มีงานตรวจเอกสารเดิมกำลังทำงาน กรุณารอแล้วตรวจใหม่');
    schedule(row, player, snapshot);
    return res.status(row.state === 'SUCCEEDED' ? 200 : 202).json({ success: true, job: publicJob(row, player) });
  } catch (error) { return failed(res, error); }
});
adminPlayerVerificationRouter.get(prefix, checkAdminSession, boundary, async (req: AdminRequest, res) => {
  try {
    const player = await playerFor(req);
    const response = await pool.query('SELECT * FROM football_player_ai_verification WHERE player_id=$1 ORDER BY created_at DESC LIMIT 1', [player.id]);
    const row = response.rows[0];
    if(row?.error_code==='REVIEW_RESET')return res.json({success:true,job:null,reset:true,internalNote:row.review?.internalNote||'',teamNote:row.review?.teamNote||''});
    if (row?.error_code === 'MANUAL_REVIEW') return res.json({ success: true, job: publicJob(row, player) });
    const document = await readVerificationAsset(player.doc_id_card);
    const sameDocument = row?.result?.documentHash === document.sha256;
    const preparation = sameDocument ? selectionOf(row.result.preparation) : selectionOf(null);
    const snapshot = await verificationSnapshot(player, preparation);
    const context = { document: { ...snapshot.info, hash: snapshot.document.sha256 }, preparation,
      parserChanged: row?.state==='SUCCEEDED' && !currentOcrResult(row.result),
      preparationConfirmed: sameDocument, requiresPreparation: snapshot.info.requiresPreparation && !sameDocument };
    if (!row) return res.json({ success: true, job: null, ...context });
    if (context.parserChanged) return res.json({ success: true, job: null, stale: true, ...context });
    if (snapshot.sourceHash !== row.source_hash) return res.json({ success: true, job: null, stale: true, ...context });
    if (['QUEUED', 'RUNNING'].includes(row.state) && Date.now() - new Date(row.updated_at).getTime() > 180000) return res.json({ success: true, job: null, interrupted: true, ...context });
    schedule(row, player, snapshot);
    return res.json({ success: true, job: publicJob(row, player), ...context });
  } catch (error) { return failed(res, error); }
});

adminPlayerVerificationRouter.post(prefix + '/review', checkAdminSession, boundary, async (req: AdminRequest, res) => {
  try {
    const review = validateReview(req.body);
    if (typeof req.body.remarks !== 'string' || req.body.remarks.length > 4000 || (req.body.jobId !== null && typeof req.body.jobId !== 'string')) throw new VerificationError(400, 'ข้อมูลบันทึกผลตรวจไม่ถูกต้อง');
    if (req.body.jobId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.body.jobId)) throw new VerificationError(400, 'รหัสผลตรวจไม่ถูกต้อง');
    await withDbTransaction(async db => {
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['player-ai:' + req.params.playerId]);
      const player = await playerFor(req, db, true);
      requireSubmittedRoster(player);
      let jobId = req.body.jobId;
      let previousDecisions: Record<string, string> = {};
      if(review.docStatus==='PENDING') {
        jobId=await resetVerification(db,player.id,req.adminUser!.id,{teamNote:review.teamNote,internalNote:req.body.remarks.trim()});
      } else if (jobId) {
        const response = await db.query("SELECT * FROM football_player_ai_verification WHERE id=$1 AND player_id=$2 AND state='SUCCEEDED' FOR UPDATE", [jobId, player.id]);
        const prior = response.rows[0];
        if (!prior) throw new VerificationError(409, 'ผลตรวจล้าสมัย กรุณาตรวจเอกสารอีกครั้ง');
        const snapshot = await verificationSnapshot(player, prior.result?.preparation);
        if (prior.source_hash !== snapshot.sourceHash) throw new VerificationError(409, 'ผลตรวจล้าสมัย กรุณาตรวจเอกสารอีกครั้ง');
        previousDecisions = Object.fromEntries(verificationFields.filter(field => ['SYSTEM_CORRECT','CORRECT_DATA','REUPLOAD',...(field === 'expiryDate' ? ['EXPIRED_CARD'] : [])].includes(prior.review?.decisions?.[field]))
          .map(field => [field, prior.review.decisions[field]]));
        const currentRows = compareVerification(player, prior.result);
        for (const field of verificationFields) {
          const row = currentRows.find(row => row.field === field)!;
          if(row.requiresManualDecision&&review.decisionSources[field]==='AI_PREFILL')
            throw new VerificationError(409,'ผล OCR '+row.label+'ยังต้องตรวจไฟล์แนบ กรุณาเลือกการตัดสินใจด้วยตนเองก่อนบันทึก');
          if (review.decisionSources[field] === 'AI_PREFILL' && review.decisions[field] !== row.suggestedDecision) {
            if (field === 'expiryDate' && row.expired) throw new VerificationError(409, 'บัตรหมดอายุแล้วตามวันที่ปัจจุบัน กรุณาปิดแล้วเปิดรายละเอียดอีกครั้งก่อนบันทึก ไม่ต้องอ่าน OCR ใหม่');
            review.decisionSources[field] = 'STAFF_EDITED';
          }
          if (review.decisionSources[field] === 'SAVED_REVIEW' && prior.review?.decisions?.[field] !== review.decisions[field]) review.decisionSources[field] = 'STAFF_EDITED';
          if (field === 'expiryDate' && row.expired && review.decisions[field] !== 'EXPIRED_CARD' && review.decisionSources[field] === 'SAVED_REVIEW')
            throw new VerificationError(409, 'บัตรหมดอายุแล้วตามวันที่ปัจจุบัน กรุณาปิดแล้วเปิดรายละเอียดอีกครั้งก่อนบันทึก ไม่ต้องอ่าน OCR ใหม่');
        }
      } else {
        for (const field of verificationFields) review.decisionSources[field] = 'STAFF_EDITED';
        jobId = randomUUID();
        await db.query("INSERT INTO football_player_ai_verification(id,player_id,source_hash,state,error_code) VALUES($1,$2,$3,'FAILED','MANUAL_REVIEW')", [jobId, player.id, '0'.repeat(64)]);
      }
      if(review.docStatus!=='PENDING') {
        const reviewed = { ...review, internalNote: req.body.remarks.trim() };
        await db.query('UPDATE football_player_ai_verification SET review=$2::jsonb,reviewed_by=$3,reviewed_at=now() WHERE id=$1', [jobId, JSON.stringify(reviewed), req.adminUser!.id]);
      }
      await db.query('UPDATE football_player SET doc_status=$2,remarks=$3 WHERE id=$1', [player.id, review.docStatus, review.teamNote]);
      await writeAuditLog(req, { eventType: 'PLAYER_DOCUMENT_STATUS_CHANGED', entityType: 'PLAYER', entityId: String(player.id), teamId: String(player.team_id),
        oldState: { docStatus: player.doc_status }, newState: { docStatus: review.docStatus }, metadata: { aiJobId: jobId, reviewVersion: String(review.reviewVersion), decisionCount: String(Object.keys(review.decisions).length), statusSource: review.statusSource, decisionStatus: review.decisionStatus, aiReset:review.docStatus==='PENDING'?'true':'false',
          aiPrefillCount: String(Object.values(review.decisionSources).filter(source => source === 'AI_PREFILL').length),
          staffEditedCount: String(Object.values(review.decisionSources).filter(source => source === 'STAFF_EDITED').length),
          savedReviewCount: String(Object.values(review.decisionSources).filter(source => source === 'SAVED_REVIEW').length),
          previousDecisions: JSON.stringify(previousDecisions), decisions: JSON.stringify(review.decisions), decisionSources: JSON.stringify(review.decisionSources) } }, db);
    });
    const cached = playersDatabase.find(p => String(p.id) === req.params.playerId);
    if (cached) { cached.docStatus = review.docStatus; cached.remarks = review.teamNote; }
    return res.json({ success: true, message: 'บันทึกผลตรวจเรียบร้อยแล้ว', teamNote: review.teamNote, docStatus: review.docStatus,reset:review.docStatus==='PENDING' });
  } catch (error) { return failed(res, error); }
});

adminPlayerVerificationRouter.post(prefix + '/delete', checkAdminSession, boundary, async (req: AdminRequest, res) => {
  try {
    if (req.body?.confirmPlayerId !== req.params.playerId) throw new VerificationError(400, 'กรุณายืนยันการลบนักกีฬา');
    await withDbTransaction(async db => {
      const player = await playerFor(req, db, true);
      await db.query('DELETE FROM football_player WHERE id=$1 AND team_id=$2', [player.id, player.team_id]);
      await db.query('DELETE FROM football_player_ai_verification WHERE player_id=$1', [player.id]);
      await writeAuditLog(req, { eventType: 'PLAYER_DELETED', entityType: 'PLAYER', entityId: String(player.id), teamId: String(player.team_id), oldState: { category: player.category }, metadata: { source: 'PLAYER_VERIFICATION_MODAL' } }, db);
    });
    const index = playersDatabase.findIndex(player => String(player.id) === req.params.playerId);
    if (index !== -1) playersDatabase.splice(index, 1);
    return res.json({ success: true });
  } catch (error) { return failed(res, error); }
});
