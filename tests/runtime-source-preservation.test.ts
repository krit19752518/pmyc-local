import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createHash } from 'node:crypto';
const { digest } = require('./helpers/runtimeCanonical.cjs');
const { reverseIssue72Source } = require('./helpers/issue72Preservation.cjs');
const contract: { modules: Array<{ module: string; runtime_sha256: string; canonical_sha256: string }> } = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/production-runtime-contract.json'), 'utf8'));
const approvedEdits: Array<{ module: string; before: string; after: string }> = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/issue55-approved-source-edits.json'), 'utf8'));
const issue66: {modules:Array<{module:string;baseline_canonical_sha256:string;approved_canonical_sha256:string}>} = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/issue66-team-player-modal-runtime.json'), 'utf8'));
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true };
const quota70: {issue:number;modules:Array<{module:string;baseline_runtime_sha256:string;candidate_runtime_sha256:string;approved_canonical_sha256:string;runtime_edits:Array<{before:string;after:string}>}>;preserved_runtime_modules:Array<{module:string;approved_canonical_sha256:string}>}=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/issue70-unlimited-runtime.json'),'utf8'));

it.each(contract.modules.filter(entry => ![...issue66.modules,...quota70.modules].some(change => change.module === entry.module)))('preserves all prior runtime logic, templates, dependencies and exports in $module', (entry) => {
  let source = fs.readFileSync(path.join(__dirname, '../src', entry.module + '.ts'), 'utf8');
  source = reverseIssue72Source(entry.module, source);
  for (const edit of approvedEdits.filter(e => e.module === entry.module)) {
    expect(source.split(edit.after)).toHaveLength(2);
    source = source.replace(edit.after, edit.before);
  }
  const output = ts.transpileModule(source, { compilerOptions: options }).outputText;
  expect(digest(output)).toBe(entry.canonical_sha256);
});

it.each([...issue66.modules.filter(entry=>![...quota70.modules,...quota70.preserved_runtime_modules].some(change=>change.module===entry.module)),...quota70.preserved_runtime_modules])('preserves the recorded deployed source/runtime for $module', (entry) => {
  let source = fs.readFileSync(path.join(__dirname, '../src', entry.module + '.ts'), 'utf8');
  let built = fs.readFileSync(path.join(__dirname, '../dist', entry.module + '.js'), 'utf8');
  if (entry.module === 'routes/admin/adminPlayerVerification.router') {
    const after113 = "async function playerFor(req: AdminRequest, db: QueryExecutor = queryOnly, lock = false) {\n  const id = req.params.playerId;\n  if (!id || id.length > 80) throw new VerificationError(400, 'รหัสนักกีฬาไม่ถูกต้อง');\n  const allowDemo = req.query?.demo === 'true' || req.body?.demo === true;\n  const response = await db.query(`SELECT p.*, p.birth_date::text AS verification_birth_date, t.province, t.is_test, t.submitted_categories FROM football_player p\n    JOIN football_registered_team t ON t.id = p.team_id\n    WHERE p.id = $1 AND COALESCE(t.is_test,FALSE) = $2 AND COALESCE(t.is_deleted,FALSE) = FALSE\n    ${lock ? 'FOR UPDATE OF p, t' : ''}`, [id, allowDemo]);";
    const before113 = "async function playerFor(req: AdminRequest, db: QueryExecutor = queryOnly, lock = false) {\n  const id = req.params.playerId;\n  if (!id || id.length > 80) throw new VerificationError(400, 'รหัสนักกีฬาไม่ถูกต้อง');\n  const response = await db.query(`SELECT p.*, p.birth_date::text AS verification_birth_date, t.province, t.is_test, t.submitted_categories FROM football_player p\n    JOIN football_registered_team t ON t.id = p.team_id\n    WHERE p.id = $1 AND COALESCE(t.is_test,FALSE) = FALSE AND COALESCE(t.is_deleted,FALSE) = FALSE\n    ${lock ? 'FOR UPDATE OF p, t' : ''}`, [id]);";
    expect(source).toContain(after113);
    source = source.replace(after113, before113);
    built = ts.transpileModule(source, { compilerOptions: options }).outputText;
  }
  if (entry.module === 'views/playerVerification') {
    const after113a = "    const api=()=>window.baseUrl+'/api/admin/players/'+encodeURIComponent(player.id)+'/verification';\n    const withDemo=u=>window.isDemoMode===true?u+(u.includes('?')?'&':'?')+'demo=true':u;\n    async function call(method,url,body){const payload=body!==undefined&&window.isDemoMode===true?{...body,demo:true}:body;const r=await fetch(withDemo(url),{method,headers:method==='GET'?{}:{'Content-Type':'application/json','X-Requested-With':'PlayerVerification'},body:payload===undefined?undefined:JSON.stringify(payload),signal:controller?.signal});if(r.redirected||!r.headers.get('content-type')?.includes('application/json'))throw Error('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');const d=await r.json();if(!r.ok||!d.success)throw Error(d.message||'ไม่สามารถดำเนินการได้');return d}";
    const before113a = "    const api=()=>window.baseUrl+'/api/admin/players/'+encodeURIComponent(player.id)+'/verification';\n    async function call(method,url,body){const r=await fetch(url,{method,headers:method==='GET'?{}:{'Content-Type':'application/json','X-Requested-With':'PlayerVerification'},body:body===undefined?undefined:JSON.stringify(body),signal:controller?.signal});if(r.redirected||!r.headers.get('content-type')?.includes('application/json'))throw Error('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');const d=await r.json();if(!r.ok||!d.success)throw Error(d.message||'ไม่สามารถดำเนินการได้');return d}";
    const after113b = "requestDocumentPreview(withDemo(api()+'/document-preview?page=1&hash='+encodeURIComponent(d.document.hash)),token)";
    const before113b = "requestDocumentPreview(api()+'/document-preview?page=1&hash='+encodeURIComponent(d.document.hash),token)";
    expect(source).toContain(after113a);
    expect(source).toContain(after113b);
    source = source.replace(after113a, before113a).replace(after113b, before113b);
    built = ts.transpileModule(source, { compilerOptions: options }).outputText;
  }
  if (entry.module === 'routes/admin/adminPortal.router') {
    const after111 = "        if (data.success) {\n          const found = (window.rawTeamsData || []).find(t => String(t.id).trim() === String(teamId).trim());\n          if (found) {\n            found.submitted_categories = data.submitted_categories ?? '';\n            found.submittedCategories = data.submittedCategories ?? '';\n            if (data.status) found.status = data.status;\n          }\n          renderTeamsTable();\n          const modalInstance = bootstrap.Modal.getInstance(modalElem);\n          if (modalInstance) modalInstance.hide();\n          await Swal.fire({ icon: 'success', title: 'เปลี่ยนสถานะสำเร็จ', text: data.message || 'รีเซ็ตสถานะการส่งรายชื่อเรียบร้อยแล้ว', confirmButtonText: 'ตกลง' });\n          window.location.reload();\n        } else {";
    const before111 = "        if (data.success) {\n          Swal.fire({ icon: 'success', title: 'เปลี่ยนสถานะสำเร็จ', text: data.message || 'รีเซ็ตสถานะการส่งรายชื่อเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });\n          const modalInstance = bootstrap.Modal.getInstance(modalElem);\n          if (modalInstance) modalInstance.hide();\n          renderTeamsTable();\n        } else {";
    expect(source).toContain(after111);
    expect(built).toContain(after111);
    source = source.replace(after111, before111);
    built = built.replace(after111, before111);
  }
  expect(digest(ts.transpileModule(source, { compilerOptions: options }).outputText)).toBe(entry.approved_canonical_sha256);
  expect(digest(built)).toBe(entry.approved_canonical_sha256);
});

it.each(quota70.modules)('preserves the entire deployed runtime outside the exact issue70 edits in $module',entry=>{
  expect(quota70.issue).toBe(70);
  expect(quota70.modules.map(x=>x.module).sort()).toEqual(['services/playerOcr.config','services/playerOcr.provider','views/playerVerification']);
  let source=fs.readFileSync(path.join(__dirname,'../src',entry.module+'.ts'),'utf8');
  let built=fs.readFileSync(path.join(__dirname,'../dist',entry.module+'.js'),'utf8');
  if(entry.module==='views/playerVerification'){
    expect(digest(built)).toBe(digest(ts.transpileModule(source,{compilerOptions:options}).outputText));
    const after113a="    const api=()=>window.baseUrl+'/api/admin/players/'+encodeURIComponent(player.id)+'/verification';\n    const withDemo=u=>window.isDemoMode===true?u+(u.includes('?')?'&':'?')+'demo=true':u;\n    async function call(method,url,body){const payload=body!==undefined&&window.isDemoMode===true?{...body,demo:true}:body;const r=await fetch(withDemo(url),{method,headers:method==='GET'?{}:{'Content-Type':'application/json','X-Requested-With':'PlayerVerification'},body:payload===undefined?undefined:JSON.stringify(payload),signal:controller?.signal});if(r.redirected||!r.headers.get('content-type')?.includes('application/json'))throw Error('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');const d=await r.json();if(!r.ok||!d.success)throw Error(d.message||'ไม่สามารถดำเนินการได้');return d}", before113a="    const api=()=>window.baseUrl+'/api/admin/players/'+encodeURIComponent(player.id)+'/verification';\n    async function call(method,url,body){const r=await fetch(url,{method,headers:method==='GET'?{}:{'Content-Type':'application/json','X-Requested-With':'PlayerVerification'},body:body===undefined?undefined:JSON.stringify(body),signal:controller?.signal});if(r.redirected||!r.headers.get('content-type')?.includes('application/json'))throw Error('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');const d=await r.json();if(!r.ok||!d.success)throw Error(d.message||'ไม่สามารถดำเนินการได้');return d}";
    const after113b="requestDocumentPreview(withDemo(api()+'/document-preview?page=1&hash='+encodeURIComponent(d.document.hash)),token)", before113b="requestDocumentPreview(api()+'/document-preview?page=1&hash='+encodeURIComponent(d.document.hash),token)";
    expect(source).toContain(after113a); expect(source).toContain(after113b);
    source=source.replace(after113a,before113a).replace(after113b,before113b);
    built=built.replace(after113a,before113a).replace(after113b,before113b);
  }
  expect(digest(ts.transpileModule(source,{compilerOptions:options}).outputText)).toBe(entry.approved_canonical_sha256);
  expect(createHash('sha256').update(built).digest('hex')).toBe(entry.candidate_runtime_sha256);
  for(const edit of [...entry.runtime_edits].reverse()){
    expect(built.split(edit.after)).toHaveLength(2);
    built=built.replace(edit.after,edit.before);
  }
  expect(createHash('sha256').update(built).digest('hex')).toBe(entry.baseline_runtime_sha256);
});

it.each(contract.modules)('keeps generated runtime consistent with TypeScript source for $module', (entry) => {
  const source = fs.readFileSync(path.join(__dirname, '../src', entry.module + '.ts'), 'utf8');
  const built = fs.readFileSync(path.join(__dirname, '../dist', entry.module + '.js'), 'utf8');
  expect(digest(built)).toBe(digest(ts.transpileModule(source, { compilerOptions: options }).outputText));
});

it('allows compiler alias/formatting changes while detecting logic and template changes', () => {
  const before = 'const area_1 = require("./area"); function f(){ return (0, area_1.read)("safe"); } exports.f = f;';
  const equivalent = 'const renamed = require("./area"); function f() { return (0, renamed.read)("safe"); } exports.f=f;';
  expect(digest(before)).toBe(digest(equivalent));
  expect(digest(before)).not.toBe(digest(before.replace('"safe"', '"changed"')));
  expect(digest(before)).not.toBe(digest(before.replace('"./area"', '"./other"')));
  expect(digest(before)).not.toBe(digest(before.replace('exports.f = f;', 'exports.other = f;')));
});

it('detects a changed re-export getter instead of ignoring export wiring', () => {
  const before = 'const a = require("./area"); Object.defineProperty(exports,"read",{enumerable:true,get:function(){return a.read;}});';
  expect(digest(before)).not.toBe(digest(before.replace('return a.read', 'return a.other')));
});
