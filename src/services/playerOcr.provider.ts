import { randomUUID } from 'crypto';
import { pool } from '../db';
import { withDbTransaction } from './dbTransaction.service';
import { ocrConfiguration } from './playerOcr.config';
import { DocumentAsset, prepareOcrDocument, inspectPreparedQuality } from './playerOcr.document';
import { parseIappText } from './playerOcr.parser';
import { OcrAnalysis, OcrSelection, VerificationError, reusableOcrAnalysis } from './playerOcr.types';
import { OcrDiagnosticWindow, diagnosticLog, ocrDiagnosticShape, OCR_DIAGNOSTICS_UNTIL } from './playerOcr.diagnostics';
import { captureOcrDebug, DebugContext, startDebugExpiryCleanup } from './playerOcr.debug';
export { OcrDiagnosticWindow, ocrDiagnosticShape, OCR_DIAGNOSTICS_UNTIL, announceOcrDiagnosticsReady } from './playerOcr.diagnostics';
const diagnosticWindow = new OcrDiagnosticWindow();
startDebugExpiryCleanup();

export class SharedOcrBusy extends Error {}
export async function readIappResponse(response: globalThis.Response, received?: (data: unknown) => void): Promise<string> {
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403 ? 'OCR_AUTH_FAILED' : response.status === 402 ? 'OCR_CREDIT_EXHAUSTED'
      : response.status === 429 || response.status === 560 ? 'OCR_BUSY' : response.status === 415 || response.status === 413 ? 'OCR_DOCUMENT_REJECTED' : 'OCR_SERVICE_FAILED';
    throw new VerificationError(503, 'บริการ OCR ไม่สามารถประมวลผลคำขอนี้ได้', code);
  }
  if (!response.headers.get('content-type')?.includes('application/json') || !response.body) throw new VerificationError(503, 'ผลตอบกลับ OCR ไม่ถูกต้อง', 'OCR_INVALID_RESPONSE');
  const reader = response.body.getReader(), chunks: Buffer[] = []; let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      total += value.length;
      if (total > 500000) { await reader.cancel(); throw new Error('Response too large'); }
      chunks.push(Buffer.from(value));
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const reported = response.headers.get('iapp-input-pages');
    // We submit one server-prepared JPEG, never the original multi-page PDF.
    if (!Array.isArray(data.text) || data.text.length !== 1 || typeof data.text[0] !== 'string' || data.text[0].length > 200000 ||
      (reported !== null && Number(reported) !== 1) || (data.iapp?.page !== undefined && data.iapp.page !== 1)) throw new Error('Invalid text shape or page count');
    received?.(data);
    return data.text[0];
  } catch {
    throw new VerificationError(503, 'ผลตอบกลับ OCR ไม่ถูกต้อง', 'OCR_INVALID_RESPONSE');
  } finally { reader.releaseLock(); }
}

/** Cache contains extracted fields only. This endpoint never accepts client OCR/image bytes. */
export async function analyzeWithIapp(asset: DocumentAsset, selection: OcrSelection, cacheKey: string, force = false, requestedAt?: number, debugContext?: DebugContext): Promise<{ analysis: OcrAnalysis; cached: boolean }> {
  const reusable = (row: any) => row?.state === 'SUCCEEDED' && row.analysis && (!force ||
    Number.isFinite(requestedAt) && new Date(row.updated_at).getTime() >= requestedAt!) && reusableOcrAnalysis(row.analysis);
  const outdated = (row:any) => row?.state==='SUCCEEDED' && !reusableOcrAnalysis(row.analysis);
  const existing = await pool.query('SELECT * FROM football_player_ocr_cache WHERE cache_key=$1', [cacheKey]);
  if (reusable(existing.rows[0])) return { analysis: existing.rows[0].analysis, cached: true };
  if(outdated(existing.rows[0])&&!force)throw new VerificationError(409,'ตัวแยกข้อมูลปรับปรุงแล้ว กรุณายืนยันก่อนอ่านใหม่ หรือให้เจ้าหน้าที่ตรวจต้นฉบับ','OCR_PARSER_CHANGED');
  if (existing.rows[0]?.state === 'RUNNING' && Date.now() - new Date(existing.rows[0].updated_at).getTime() <= 180000) throw new SharedOcrBusy();
  const config = ocrConfiguration();
  // Validate and prepare before reserving a paid attempt. This reads only the authorized source asset.
  const bytes = await prepareOcrDocument(asset, selection);
  const quality = await inspectPreparedQuality(bytes);
  const leaseId = randomUUID();
  const claimed = await withDbTransaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['player-ocr-cache:' + cacheKey]);
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['player-ocr-budget:' + config.budgetId]);
    const found = await db.query('SELECT * FROM football_player_ocr_cache WHERE cache_key=$1 FOR UPDATE', [cacheKey]);
    const prior = found.rows[0];
    if (reusable(prior)) return prior.analysis as OcrAnalysis;
    if(outdated(prior)&&!force)throw new VerificationError(409,'ตัวแยกข้อมูลปรับปรุงแล้ว กรุณายืนยันก่อนอ่านใหม่ หรือให้เจ้าหน้าที่ตรวจต้นฉบับ','OCR_PARSER_CHANGED');
    if (prior?.state === 'RUNNING') {
      if (Date.now() - new Date(prior.updated_at).getTime() <= 180000) throw new SharedOcrBusy();
      if (!force) throw new VerificationError(409, 'งาน OCR เดิมถูกขัดจังหวะ กรุณายืนยันก่อนอ่านใหม่', 'OCR_INTERRUPTED');
    }
    if (prior?.state === 'FAILED' && !force) throw new VerificationError(409, 'การอ่านเอกสารฉบับนี้เคยไม่สำเร็จ กรุณากดยืนยันอ่านใหม่', 'OCR_PREVIOUS_FAILED');
    if (config.quotaMode === 'limited') {
      const usage = await db.query(`SELECT
        COALESCE(SUM(page_count),0)::integer AS total,
        COALESCE(SUM(page_count) FILTER (WHERE created_at AT TIME ZONE 'Asia/Bangkok' >= date_trunc('day', now() AT TIME ZONE 'Asia/Bangkok')),0)::integer AS daily,
        COALESCE(SUM(page_count) FILTER (WHERE created_at AT TIME ZONE 'Asia/Bangkok' >= date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok')),0)::integer AS monthly
        FROM football_player_ocr_usage WHERE budget_id=$1`, [config.budgetId]);
      const used = usage.rows[0];
      if (!used || !['total', 'daily', 'monthly'].every(k => Number.isFinite(Number(used[k])) && Number(used[k]) >= 0)) throw new VerificationError(503, 'ตรวจสอบเพดาน OCR ไม่สำเร็จ', 'OCR_BUDGET_UNAVAILABLE');
      if (Number(used.total) + 1 > config.trialPageLimit || Number(used.daily) + 1 > config.dailyPageLimit || Number(used.monthly) + 1 > config.monthlyPageLimit) throw new VerificationError(429, 'ถึงเพดานการใช้งาน OCR ที่กำหนดแล้ว กรุณาติดต่อผู้ดูแลระบบ', 'OCR_BUDGET_EXCEEDED');
    }
    // Unlimited mode still records every paid attempt under the same budget and cache lease.
    await db.query('INSERT INTO football_player_ocr_usage(id,budget_id,cache_key,page_count) VALUES($1,$2,$3,1)', [leaseId, config.budgetId, cacheKey]);
    await db.query(`INSERT INTO football_player_ocr_cache(cache_key,state,lease_id) VALUES($1,'RUNNING',$2)
      ON CONFLICT(cache_key) DO UPDATE SET state='RUNNING',lease_id=$2,error_code=NULL,updated_at=now()`, [cacheKey, leaseId]);
    return null;
  });
  if (claimed) return { analysis: claimed, cached: true };
  const diagnosticId=diagnosticWindow.begin(),diagnosticStarted=Date.now();
  diagnosticLog(diagnosticId,'request',{width:quality?.width,height:quality?.height,cropped:!!selection.crop,rectified:!!selection.corners,rotated:!!selection.rotation,enhanced:!!selection.enhance});
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const form = new FormData(); form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'document.jpg');
    const response = await fetch(config.url, { method: 'POST', headers: { apikey: config.key }, body: form, redirect: 'error', signal: controller.signal });
    diagnosticLog(diagnosticId,'http',{status:response.status,jsonResponse:!!response.headers.get('content-type')?.includes('application/json'),durationMs:Date.now()-diagnosticStarted});
    let received: unknown;
    const text=await readIappResponse(response,data=>{received=data;});
    const analysis = parseIappText(text);
    if(diagnosticId&&Date.now()<OCR_DIAGNOSTICS_UNTIL){try{diagnosticLog(diagnosticId,'parsed',ocrDiagnosticShape(text,analysis));}catch{}}
    await captureOcrDebug(debugContext,received,analysis,{status:response.status,durationMs:Date.now()-diagnosticStarted,width:quality?.width??0,height:quality?.height??0,selection});
    analysis.quality = quality;
    const saved = await pool.query("UPDATE football_player_ocr_cache SET state='SUCCEEDED',analysis=$3::jsonb,error_code=NULL,updated_at=now() WHERE cache_key=$1 AND lease_id=$2 AND state='RUNNING'", [cacheKey, leaseId, JSON.stringify(analysis)]);
    if (saved.rowCount !== 1) throw new VerificationError(503, 'ไม่สามารถยืนยันผลบันทึก OCR ได้', 'OCR_CACHE_WRITE_FAILED');
    return { analysis, cached: false };
  } catch (error) {
    diagnosticLog(diagnosticId,'failed',{durationMs:Date.now()-diagnosticStarted});
    const code = controller.signal.aborted ? 'OCR_TIMEOUT' : error instanceof VerificationError ? error.code || 'OCR_SERVICE_FAILED' : 'OCR_CONNECTION_FAILED';
    await pool.query("UPDATE football_player_ocr_cache SET state='FAILED',error_code=$3,updated_at=now() WHERE cache_key=$1 AND lease_id=$2 AND state='RUNNING'", [cacheKey, leaseId, code]);
    throw new VerificationError(503, 'ไม่สามารถอ่านเอกสารด้วย OCR ได้', code);
  } finally { clearTimeout(timeout); }
}
