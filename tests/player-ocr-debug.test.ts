import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { captureOcrDebug, nameDebugReasons, purgeExpiredDebug, OCR_DEBUG_END } from '../src/services/playerOcr.debug';
import { OcrDiagnosticWindow, ocrDiagnosticShape, diagnosticLog } from '../src/services/playerOcr.diagnostics';
import { parseIappText } from '../src/services/playerOcr.parser';

const context={jobId:'00000000-0000-4000-8000-000000000059',playerId:'synthetic-only',manualRetry:true};
const now=Date.parse('2026-11-09T16:00:00Z');
const text='Thai National ID Card\nIdentification Number 1234567890121\nชื่อตัวและชื่อสกุล ด.ป ทดสอบ Name Mr Example\nLast name Fixture\nเกิดวันที่ 15 มี.ค. 2551\nวันหมดอายุ 14 มี.ค. 2571';
const analysis=parseIappText(text);
const meta={status:200,durationMs:500,width:896,height:566,selection:{page:1}};
let root:string,logger:jest.SpyInstance;
const prior=process.env.NODE_ENV;
beforeEach(async()=>{
 process.env.NODE_ENV='production';root=await fs.mkdtemp(path.join(os.tmpdir(),'football-ocr-debug-test-'));await fs.chmod(root,0o700);
 await fs.writeFile(path.join(root,'control.json'),JSON.stringify({playerHash:createHash('sha256').update(context.playerId).digest('hex'),expiresAt:new Date(OCR_DEBUG_END).toISOString(),maxCaptures:3}),{mode:0o600});
 logger=jest.spyOn(console,'error').mockImplementation(()=>undefined);
});
afterEach(async()=>{process.env.NODE_ENV=prior;logger.mockRestore();await fs.rm(root,{recursive:true,force:true});});
it('captures only the original text and safe request metadata with private permissions and job correlation',async()=>{
 expect(await captureOcrDebug(context,{text:[text],unexpectedSecret:'fixture-secret'},analysis,meta,root,now)).toBe(true);
 const file=path.join(root,'capture-'+context.jobId+'.json'),raw=await fs.readFile(file,'utf8'),record=JSON.parse(raw);
 expect((await fs.stat(file)).mode&0o777).toBe(0o600);expect(record.jobId).toBe(context.jobId);expect(record.response.text).toEqual([text]);
 expect(record.request).toMatchObject({pages:1,width:896,height:566});expect(raw).not.toContain('fixture-secret');expect(raw).not.toContain(context.playerId);
 expect(logger.mock.calls.flat().join('')).not.toContain(text);expect(logger.mock.calls.flat().join('')).not.toContain('ทดสอบ');expect(logger).toHaveBeenCalledWith(expect.stringContaining('"event":"captured"'));
});
it.each(['other-player','not-forced','valid-name','development','invalid-job'])('does not capture outside authorized scope: %s',async kind=>{
 const c={...context},a=structuredClone(analysis);if(kind==='other-player')c.playerId='other';if(kind==='not-forced')c.manualRetry=false;if(kind==='invalid-job')c.jobId='../escape';if(kind==='valid-name')a.fields.fullName.validation='VALID';if(kind==='development')process.env.NODE_ENV='development';
 expect(await captureOcrDebug(c,{text:[text]},a,meta,root,now)).toBe(false);expect((await fs.readdir(root)).filter(x=>x.startsWith('capture-'))).toEqual([]);
});
it('atomically limits parallel captures across workers',async()=>{
 const result=await Promise.all(Array.from({length:8},(_,i)=>captureOcrDebug({...context,jobId:'00000000-0000-4000-8000-'+String(i).padStart(12,'0')},{text:[text]},analysis,meta,root,now)));
 expect(result.filter(Boolean)).toHaveLength(3);expect((await fs.readdir(root)).filter(x=>x.startsWith('capture-'))).toHaveLength(3);
});
it('purges only feature-owned captures at expiry and refuses additional captures',async()=>{
 await captureOcrDebug(context,{text:[text]},analysis,meta,root,now);await fs.writeFile(path.join(root,'keep.txt'),'fixture');
 await purgeExpiredDebug(root,OCR_DEBUG_END);expect((await fs.readdir(root)).sort()).toEqual(['control.json','keep.txt']);
 expect(await captureOcrDebug(context,{text:[text]},analysis,meta,root,OCR_DEBUG_END)).toBe(false);
});
it('fails closed on public control permissions, without throwing or leaking an error',async()=>{
 await fs.chmod(path.join(root,'control.json'),0o644);expect(await captureOcrDebug(context,{text:[text]},analysis,meta,root,now)).toBe(false);
 expect(logger).toHaveBeenCalledWith(expect.stringContaining('"event":"capture_failed"'));
});
it('refuses symlinked control files',async()=>{
 await fs.rename(path.join(root,'control.json'),path.join(root,'actual.json'));await fs.symlink(path.join(root,'actual.json'),path.join(root,'control.json'));
 expect(await captureOcrDebug(context,{text:[text]},analysis,meta,root,now)).toBe(false);
});
it('keeps OCR successful even if diagnostic storage does not exist',async()=>{
 expect(await captureOcrDebug(context,{text:[text]},analysis,meta,path.join(root,'absent'),now)).toBe(false);
});
it('returns structural hypotheses, never a claim that the image must be reuploaded',()=>{
 expect(nameDebugReasons(text)).toContain('TITLE_NOT_DETECTED');
 expect(nameDebugReasons('นาย ทดสอบ ตัวอย่าง Name Mr Example')).toContain('TITLE_LINE_CONTAINS_LATIN');expect(nameDebugReasons('Identification Number\nName Mr Example')).toContain('TITLE_NOT_DETECTED');
});
it('preserves the Production V1 time window, quota and content-free shape',()=>{
 const window=new OcrDiagnosticWindow();expect(window.begin(Date.parse('2026-11-09T12:00:00Z'))).toBeNull();
 for(let i=0;i<30;i++)expect(window.begin(now)).toMatch(/^[a-f0-9-]{36}$/);expect(window.begin(now)).toBeNull();
 expect(ocrDiagnosticShape(text,analysis)).toMatchObject({thaiNameLabelDetected:true,titleLinesWithLatin:0,fullNameValidation:'INVALID'});
 diagnosticLog('synthetic-id','parsed',{width:896,raw:text,apikey:'fixture-secret'});expect(logger.mock.calls.flat().join('')).not.toContain(text);expect(logger.mock.calls.flat().join('')).not.toContain('fixture-secret');
});
