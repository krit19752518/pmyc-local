import { createHash } from 'crypto';
import { promises as fs, constants } from 'fs';
import path from 'path';
import { OcrAnalysis, OcrSelection } from './playerOcr.types';

// Operational control and captures are outside both the web root and application tree.
export const OCR_DEBUG_ROOT = '/home/zbpzpszw/football_app/ocr-debug-issue59';
export const OCR_DEBUG_END = Date.parse('2026-11-10T15:30:00Z');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export type DebugContext = { jobId: string; playerId: string; manualRetry: boolean };
type Control = { playerHash: string; expiresAt: string; maxCaptures: number };
type RequestMeta = { status: number; durationMs: number; width: number; height: number; selection: OcrSelection };

export function nameDebugReasons(text: string): string[] {
  const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const titled = lines.filter(s=>/(?:เด็กชาย|เด็กหญิง|นาย|นาง|ด\s*\.\s*[ชญ])/.test(s));
  const reasons: string[] = [];
  if (!titled.length) reasons.push('TITLE_NOT_DETECTED');
  if (titled.some(s=>/[A-Za-z]/.test(s))) reasons.push('TITLE_LINE_CONTAINS_LATIN');
  if (titled.some(s=>/\d|[๐-๙]/.test(s))) reasons.push('TITLE_LINE_CONTAINS_DIGITS');
  if (!/ชื่อตัว\s*และ\s*ชื่อสกุล|ชื่อ\s*[-–/]?\s*นามสกุล|ชื่อและนามสกุล/.test(text)) reasons.push('THAI_NAME_LABEL_NOT_DETECTED');
  return reasons.length ? reasons : ['NAME_BLOCK_REJECTED'];
}

/** No image, request headers, API key, player name or OCR text enters stderr. */
export function debugEvent(event: string, jobId: string, reasons: string[] = []) {
  if (!uuid.test(jobId)) return;
  const allowed = new Set(['TITLE_NOT_DETECTED','TITLE_LINE_CONTAINS_LATIN','TITLE_LINE_CONTAINS_DIGITS','THAI_NAME_LABEL_NOT_DETECTED','NAME_BLOCK_REJECTED']);
  const safe = reasons.filter(r=>allowed.has(r));
  if (!['captured','capture_failed','disabled','limit_reached','expired','not_needed'].includes(event)) return;
  try { console.error('PMYC_OCR_DEBUG_V2 '+JSON.stringify({event,jobId,at:new Date().toISOString(),reasons:safe})); } catch { /* Optional diagnostic only. */ }
}

async function privateFile(file: string): Promise<string> {
  const handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try { const stat=await handle.stat();if(!stat.isFile()||(stat.mode&0o077)||stat.size>600000)throw Error('UNSAFE_DEBUG_FILE');return await handle.readFile('utf8'); }
  finally { await handle.close(); }
}

/** Remove only this feature's exact capture/slot names; never traverse subdirectories. */
export async function purgeExpiredDebug(root=OCR_DEBUG_ROOT, now=Date.now()): Promise<void> {
  const stat=await fs.lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077))throw Error('UNSAFE_DEBUG_ROOT');
  const control=JSON.parse(await privateFile(path.join(root,'control.json'))) as Control;
  const until=Math.min(Date.parse(control.expiresAt),OCR_DEBUG_END);
  if(!Number.isFinite(until)||now<until)return;
  for(const name of await fs.readdir(root)) {
    if(!/^(?:capture-[a-f0-9-]{36}\.json|slot-[1-3])$/.test(name))continue;
    try { await fs.unlink(path.join(root,name)); } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error; }
  }
}

/** Called only after an explicit manual paid retry for the single configured athlete. */
export async function captureOcrDebug(context: DebugContext | undefined, response: unknown, analysis: OcrAnalysis,
  meta: RequestMeta, root=OCR_DEBUG_ROOT, now=Date.now()): Promise<boolean> {
  if(!context?.manualRetry||!uuid.test(context.jobId)||process.env.NODE_ENV!=='production')return false;
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    const stat=await fs.lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077))throw Error('UNSAFE_DEBUG_ROOT');
    const control=JSON.parse(await privateFile(path.join(root,'control.json'))) as Control;
    if(!/^[a-f0-9]{64}$/.test(control.playerHash)||createHash('sha256').update(context.playerId).digest('hex')!==control.playerHash)return false;
    const until=Math.min(Date.parse(control.expiresAt),OCR_DEBUG_END);
    if(!Number.isFinite(until)||now>=until){await purgeExpiredDebug(root,now);debugEvent('expired',context.jobId);return false;}
    if(analysis.fields.fullName.validation==='VALID'){debugEvent('not_needed',context.jobId);return false;}
    if(!Number.isInteger(control.maxCaptures)||control.maxCaptures<1||control.maxCaptures>3)throw Error('UNSAFE_DEBUG_LIMIT');
    const provider=response as {text?: unknown};
    if(!provider||!Array.isArray(provider.text)||provider.text.length!==1||typeof provider.text[0]!=='string'||provider.text[0].length>200000)throw Error('INVALID_DEBUG_RESPONSE');
    // Retain only the provider's original OCR text; discard arbitrary JSON extensions.
    const text=provider.text[0],reasons=nameDebugReasons(text);
    let reserved=false;
    for(let i=1;i<=control.maxCaptures;i++){
      try { const slot=await fs.open(path.join(root,'slot-'+i),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);await slot.close();reserved=true;break; }
      catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
    }
    if(!reserved){debugEvent('limit_reached',context.jobId);return false;}
    const target=path.join(root,'capture-'+context.jobId+'.json');
    handle=await fs.open(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    const record={jobId:context.jobId,createdAt:new Date(now).toISOString(),expiresAt:new Date(until).toISOString(),parser:analysis.modelVersion,
      request:{provider:'iapp',endpoint:'document/ocr',method:'POST',pages:1,width:meta.width,height:meta.height,selection:meta.selection},
      response:{status:meta.status,durationMs:meta.durationMs,text:[text]},nameValidation:analysis.fields.fullName.validation,reasons};
    await handle.writeFile(JSON.stringify(record));await handle.close();handle=undefined;
    debugEvent('captured',context.jobId,reasons);return true;
  } catch { debugEvent('capture_failed',context.jobId);return false; }
  finally { await handle?.close().catch(()=>undefined); }
}

// No startup mkdir or DDL. Cleanup is limited to the private diagnostic directory.
export function startDebugExpiryCleanup() {
  if(process.env.NODE_ENV!=='production')return;
  const cleanup=()=>{void purgeExpiredDebug().catch(()=>undefined);};
  cleanup();const timer=setInterval(cleanup,60000);timer.unref();return timer;
}
