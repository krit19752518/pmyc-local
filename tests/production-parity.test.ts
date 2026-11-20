import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createHash } from 'node:crypto';
const { digest } = require('./helpers/runtimeCanonical.cjs');
const { normalizeRuntime } = require('./helpers/productionParity.cjs');
const { reverseIssue86Runtime, issue86Module } = require('./helpers/issue86Preservation.cjs');
const { reverseIssue72Source, issue72Modules } = require('./helpers/issue72Preservation.cjs');
const { reverseIssue77Source } = require('./helpers/issue77Preservation.cjs');
const vpsDevTls: {modules: Array<{module: string; baseline_canonical_sha256: string; approved_canonical_sha256: string}>} = require('./fixtures/vps-dev-tls-runtime.json');
const root = path.resolve(__dirname, '..');
const issue89Home: Array<{module:string;text:string}> = require('./fixtures/issue89-home-source-additions.json');
function beforeIssue89Home(module:string, source:string) {
  for(const edit of issue89Home.filter(e=>e.module===module)) {
    expect(source.split(edit.text)).toHaveLength(2);
    source=source.replace(edit.text,'');
  }
  return source;
}

const contract: Array<{module: string; canonical_sha256: string}> = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/production-parity-20261109.json'), 'utf8')).modules;
const emitted = new Map<string, string>();
const quota70: {modules:Array<{module:string;approved_canonical_sha256:string}>;preserved_runtime_modules:Array<{module:string;approved_canonical_sha256:string}>}=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/issue70-unlimited-runtime.json'),'utf8'));
const name59: {modules:Array<{module:string;sha256:string}>}=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/issue59-name-review-runtime.json'),'utf8'));
const asset60: {issue:number;modules:Array<{module:string;baseline_canonical_sha256:string;approved_canonical_sha256:string}>}=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/issue60-asset-roots-runtime.json'),'utf8'));
const review61: {issue:number;modules:Array<{module:string;baseline_canonical_sha256:string|null;approved_canonical_sha256:string}>}=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/issue61-player-review-runtime.json'),'utf8'));
const support62: {issue:number;modules:Array<{module:string;baseline_canonical_sha256:string;approved_canonical_sha256:string}>;asset:{path:string;sha256:string}}=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/issue62-team-support-qr-runtime.json'),'utf8'));
const sat63: {issue:number;modules:Array<{module:string;baseline_canonical_sha256:string;approved_canonical_sha256:string}>;reuses_asset:{path:string;sha256:string}}=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/issue63-sat-support-qr-runtime.json'),'utf8'));
const roster64: {issue:number;modules:Array<{module:string;baseline_canonical_sha256:string;approved_canonical_sha256:string}>;edits:Array<{before:string;after:string}>}=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/issue64-team-profile-roster-runtime.json'),'utf8'));
const teamModal66: {issue:number;scope:string;modules:Array<{module:string;baseline_canonical_sha256:string;approved_canonical_sha256:string}>}=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/issue66-team-player-modal-runtime.json'),'utf8'));
it('limits issue64 to two team profile edits and reconstructs the entire prior runtime',()=>{
  expect(roster64.issue).toBe(64);
  expect(roster64.modules.map(x=>x.module)).toEqual(['routes/team/teamRoster.router']);
  const change=roster64.modules[0];
  expect(change.baseline_canonical_sha256).toBe(contract.find(x=>x.module===change.module)?.canonical_sha256);
  expect(roster64.edits).toHaveLength(2);
  let restored=fs.readFileSync(path.join(root,'dist',change.module+'.js'),'utf8');
  for(const edit of [...roster64.edits].reverse()){
    expect(edit.before).toContain('doc_roster');
    expect(edit.after).not.toContain('doc_roster');
    expect(restored.split(edit.after)).toHaveLength(2);
    restored=restored.replace(edit.after,edit.before);
  }
  restored=reverseIssue86Runtime(change.module,restored);
  expect(digest(normalizeRuntime(change.module,restored))).toBe(change.baseline_canonical_sha256);
});
it('limits issue63 to admin layout and reuses the unchanged issue62 QR',()=>{
  expect(sat63.issue).toBe(63);
  expect(sat63.modules.map(x=>x.module)).toEqual(['adminLayout']);
  expect(sat63.modules[0].baseline_canonical_sha256).toBe(contract.find(x=>x.module==='adminLayout')?.canonical_sha256);
  expect(sat63.reuses_asset).toEqual(support62.asset);
  expect(createHash('sha256').update(fs.readFileSync(path.join(root,sat63.reuses_asset.path))).digest('hex')).toBe(sat63.reuses_asset.sha256);
});
it('limits issue62 runtime changes to team layout and preserves the exact supplied QR bytes',()=>{
  expect(support62.issue).toBe(62);
  expect(support62.modules.map(x=>x.module)).toEqual(['teamLayout']);
  expect(support62.modules[0].baseline_canonical_sha256).toBe(contract.find(x=>x.module==='teamLayout')?.canonical_sha256);
  expect(support62.asset.path).toBe('public/images/lineoa-support-qr.png');
  expect(support62.asset.sha256).toBe('9034927c2e5fdb244ef6b580830b866f06f9154cb85303de46c3f9d42e6feeb2');
  expect(createHash('sha256').update(fs.readFileSync(path.join(root,support62.asset.path))).digest('hex')).toBe(support62.asset.sha256);
});
it('limits issue61 to the approved player review, parser and compatible cache modules',()=>{
  expect(review61.issue).toBe(61);
  expect(review61.modules.map(x=>x.module).sort()).toEqual(['services/playerOcr.name','services/playerOcr.parser','services/playerOcr.provider','services/playerOcr.types','services/playerVerification.service','services/playerVerification.details','routes/admin/adminPlayerVerification.router','views/playerVerification'].sort());
  for(const change of review61.modules){
    const baseline=asset60.modules.find(x=>x.module===change.module)?.approved_canonical_sha256 ?? name59.modules.find(x=>x.module===change.module)?.sha256 ?? debug59.modules.find(x=>x.module===change.module)?.sha256 ?? issue59.modules.find(x=>x.module===change.module)?.approved_canonical_sha256 ?? contract.find(x=>x.module===change.module)?.canonical_sha256 ?? null;
    expect(change.baseline_canonical_sha256).toBe(baseline);
  }
});
it('limits the issue60 attachment-root change to the verification service',()=>{
  expect(asset60.issue).toBe(60);
  expect(asset60.modules.map(x=>x.module)).toEqual(['services/playerVerification.service']);
  for(const change of asset60.modules)expect(change.baseline_canonical_sha256).toBe(name59.modules.find(x=>x.module===change.module)?.sha256);
});
it('limits issue66 to SAT team roster and shared player verification modules',()=>{
  expect(teamModal66.issue).toBe(66);
  expect(teamModal66.modules.map(x=>x.module).sort()).toEqual(['routes/admin/adminPortal.router','routes/admin/adminPlayerVerification.router','views/playerVerification'].sort());
  for(const change of teamModal66.modules){
    const prior=review61.modules.find(x=>x.module===change.module)?.approved_canonical_sha256 ?? contract.find(x=>x.module===change.module)?.canonical_sha256;
    expect(change.baseline_canonical_sha256).toBe(prior);
  }
});
it('limits the approved name-review delta to extraction, review and rendering modules',()=>{
  expect(name59.modules.map(x=>x.module).sort()).toEqual(['services/playerOcr.name','services/playerOcr.parser','services/playerOcr.types','services/playerOcr.diagnostics','services/playerVerification.service','routes/admin/adminPlayerVerification.router','views/playerVerification'].sort());
});
const debug59: {modules: Array<{module: string; sha256: string}>} = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/issue59-debug-runtime.json'), 'utf8'));
it('limits the debug runtime delta to provider, job correlation and two diagnostic modules',()=>{
  expect(debug59.modules.map(x=>x.module).sort()).toEqual(['services/playerOcr.provider','services/playerOcr.debug','services/playerOcr.diagnostics','routes/admin/adminPlayerVerification.router'].sort());
});
const issue59: {issue: number; modules: Array<{module: string; baseline_canonical_sha256: string; approved_canonical_sha256: string}>} = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/issue59-approved-runtime.json'), 'utf8'));
it('limits the approved issue59 delta to the six reviewed OCR/review modules', () => {
  expect(issue59.issue).toBe(59);
  expect(issue59.modules.map(entry => entry.module).sort()).toEqual([
    'services/playerOcr.parser','services/playerOcr.date','services/playerOcr.types','services/playerVerification.service',
    'routes/admin/adminPlayerVerification.router','views/playerVerification'
  ].sort());
  for (const change of issue59.modules) expect(change.baseline_canonical_sha256).toBe(contract.find(entry => entry.module === change.module)?.canonical_sha256);
});

it('limits discovery to maintained tests and excludes private recovery copies', () => {
  const config = require('../jest.config.js');
  expect(config.roots).toEqual(['<rootDir>/src', '<rootDir>/tests']);
  expect(config.testMatch).toEqual(['<rootDir>/tests/**/*.test.ts']);
  expect(config.testPathIgnorePatterns.some((pattern: string) => new RegExp(pattern).test('/project/.runtime/recovery/tests/old.test.ts'))).toBe(true);
});

beforeAll(() => {
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
  expect(config.error).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const program = ts.createProgram(parsed.fileNames, {...parsed.options, noEmitOnError: true});
  const diagnostics = ts.getPreEmitDiagnostics(program);
  expect(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual([]);
  const result = program.emit(undefined, (name, text) => emitted.set(path.relative(path.join(root, 'dist'), name), text));
  expect(result.emitSkipped).toBe(false);
}, 60000);

it.each(vpsDevTls.modules)('records the historical baseline for the explicit Dev TLS delta in $module', entry => {
  expect(entry.baseline_canonical_sha256).toBe(contract.find(item => item.module === entry.module)?.canonical_sha256);
});

it.each(contract)('preserves Production baseline plus approved feature behavior in $module', entry => {
  let built = fs.readFileSync(path.join(root, 'dist', entry.module + '.js'), 'utf8');
  if (entry.module === 'routes/phase2.router') {
    const source = fs.readFileSync(path.join(root, 'src', entry.module + '.ts'), 'utf8');
    const before = "process.env.NODE_ENV === 'production' ? 'https' : req.protocol";
    const after = "process.env.NODE_ENV === 'production' || process.env.FOOTBALL_VPS_DEV === '1' ? 'https' : req.protocol";
    expect(source.split(after)).toHaveLength(2);
    // Reverse only issue94's explicit HTTPS Dev condition; keep the historical contract.
    built = ts.transpileModule(source.replace(after, before), {compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true
    }}).outputText;
  }
  if (entry.module === 'routes/public.router') {
    const source = fs.readFileSync(path.join(root,'src',entry.module+'.ts'),'utf8');
    const options = {target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true};
    expect(digest(built)).toBe(digest(ts.transpileModule(source,{compilerOptions:options}).outputText));
    built=ts.transpileModule(beforeIssue89Home(entry.module,source),{compilerOptions:options}).outputText;
  }
  if (entry.module === issue86Module) {
    const source = fs.readFileSync(path.join(root, 'src', entry.module + '.ts'), 'utf8');
    const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true };
    expect(digest(built)).toBe(digest(ts.transpileModule(source, { compilerOptions: options }).outputText));
    built = reverseIssue86Runtime(entry.module, built);
  }
  if (issue72Modules.includes(entry.module)) {
    const source = fs.readFileSync(path.join(root,'src',entry.module+'.ts'),'utf8');
    const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true };
    expect(digest(built)).toBe(digest(ts.transpileModule(source,{compilerOptions:options}).outputText));
    built = ts.transpileModule(reverseIssue72Source(entry.module, reverseIssue77Source(entry.module, beforeIssue89Home(entry.module, source))),{compilerOptions:options}).outputText;
  }
  if (entry.module === 'routes/admin/adminPlayerVerification.router') {
    let source = fs.readFileSync(path.join(root, 'src', entry.module + '.ts'), 'utf8');
    const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true };
    expect(digest(built)).toBe(digest(ts.transpileModule(source, { compilerOptions: options }).outputText));
    const after113 = "async function playerFor(req: AdminRequest, db: QueryExecutor = queryOnly, lock = false) {\n  const id = req.params.playerId;\n  if (!id || id.length > 80) throw new VerificationError(400, 'รหัสนักกีฬาไม่ถูกต้อง');\n  const allowDemo = req.query?.demo === 'true' || req.body?.demo === true;\n  const response = await db.query(`SELECT p.*, p.birth_date::text AS verification_birth_date, t.province, t.is_test, t.submitted_categories FROM football_player p\n    JOIN football_registered_team t ON t.id = p.team_id\n    WHERE p.id = $1 AND COALESCE(t.is_test,FALSE) = $2 AND COALESCE(t.is_deleted,FALSE) = FALSE\n    ${lock ? 'FOR UPDATE OF p, t' : ''}`, [id, allowDemo]);";
    const before113 = "async function playerFor(req: AdminRequest, db: QueryExecutor = queryOnly, lock = false) {\n  const id = req.params.playerId;\n  if (!id || id.length > 80) throw new VerificationError(400, 'รหัสนักกีฬาไม่ถูกต้อง');\n  const response = await db.query(`SELECT p.*, p.birth_date::text AS verification_birth_date, t.province, t.is_test, t.submitted_categories FROM football_player p\n    JOIN football_registered_team t ON t.id = p.team_id\n    WHERE p.id = $1 AND COALESCE(t.is_test,FALSE) = FALSE AND COALESCE(t.is_deleted,FALSE) = FALSE\n    ${lock ? 'FOR UPDATE OF p, t' : ''}`, [id]);";
    expect(source).toContain(after113);
    built = ts.transpileModule(source.replace(after113, before113), { compilerOptions: options }).outputText;
  }
  if (entry.module === 'views/playerVerification') {
    let source = fs.readFileSync(path.join(root, 'src', entry.module + '.ts'), 'utf8');
    const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true };
    expect(digest(built)).toBe(digest(ts.transpileModule(source, { compilerOptions: options }).outputText));
    const after113a = "    const api=()=>window.baseUrl+'/api/admin/players/'+encodeURIComponent(player.id)+'/verification';\n    const withDemo=u=>window.isDemoMode===true?u+(u.includes('?')?'&':'?')+'demo=true':u;\n    async function call(method,url,body){const payload=body!==undefined&&window.isDemoMode===true?{...body,demo:true}:body;const r=await fetch(withDemo(url),{method,headers:method==='GET'?{}:{'Content-Type':'application/json','X-Requested-With':'PlayerVerification'},body:payload===undefined?undefined:JSON.stringify(payload),signal:controller?.signal});if(r.redirected||!r.headers.get('content-type')?.includes('application/json'))throw Error('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');const d=await r.json();if(!r.ok||!d.success)throw Error(d.message||'ไม่สามารถดำเนินการได้');return d}";
    const before113a = "    const api=()=>window.baseUrl+'/api/admin/players/'+encodeURIComponent(player.id)+'/verification';\n    async function call(method,url,body){const r=await fetch(url,{method,headers:method==='GET'?{}:{'Content-Type':'application/json','X-Requested-With':'PlayerVerification'},body:body===undefined?undefined:JSON.stringify(body),signal:controller?.signal});if(r.redirected||!r.headers.get('content-type')?.includes('application/json'))throw Error('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');const d=await r.json();if(!r.ok||!d.success)throw Error(d.message||'ไม่สามารถดำเนินการได้');return d}";
    const after113b = "requestDocumentPreview(withDemo(api()+'/document-preview?page=1&hash='+encodeURIComponent(d.document.hash)),token)";
    const before113b = "requestDocumentPreview(api()+'/document-preview?page=1&hash='+encodeURIComponent(d.document.hash),token)";
    expect(source).toContain(after113a);
    expect(source).toContain(after113b);
    built = ts.transpileModule(source.replace(after113a, before113a).replace(after113b, before113b), { compilerOptions: options }).outputText;
  }
  if (entry.module === 'routes/admin/adminPortal.router') {
    const after111 = "        if (data.success) {\n          const found = (window.rawTeamsData || []).find(t => String(t.id).trim() === String(teamId).trim());\n          if (found) {\n            found.submitted_categories = data.submitted_categories ?? '';\n            found.submittedCategories = data.submittedCategories ?? '';\n            if (data.status) found.status = data.status;\n          }\n          renderTeamsTable();\n          const modalInstance = bootstrap.Modal.getInstance(modalElem);\n          if (modalInstance) modalInstance.hide();\n          await Swal.fire({ icon: 'success', title: 'เปลี่ยนสถานะสำเร็จ', text: data.message || 'รีเซ็ตสถานะการส่งรายชื่อเรียบร้อยแล้ว', confirmButtonText: 'ตกลง' });\n          window.location.reload();\n        } else {";
    const before111 = "        if (data.success) {\n          Swal.fire({ icon: 'success', title: 'เปลี่ยนสถานะสำเร็จ', text: data.message || 'รีเซ็ตสถานะการส่งรายชื่อเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });\n          const modalInstance = bootstrap.Modal.getInstance(modalElem);\n          if (modalInstance) modalInstance.hide();\n          renderTeamsTable();\n        } else {";
    expect(built).toContain(after111);
    built = built.replace(after111, before111);
  }
  if (entry.module === 'layout') {
    const organizerLine = /(\borg-line">\s*จัดการแข่งขันโดย สมาคมกีฬาฟุตบอลแห่งประเทศไทย และ)การกีฬาแห่งประเทศไทย/;
    expect(built).toMatch(organizerLine);
    // Reverse only issue #67's header wording before comparing with the baseline.
    built = built.replace(organizerLine, '$1สมาคมกีฬาแห่งจังหวัด');
  }
  if (entry.module === 'routes/public.router') {
    expect(built).toContain('href="${base}/team/register.php"');
    built = built.replace('href="${base}/team/register.php"', 'href="https://pmycfootball.in.th/team/register.php"');
    // Preserve the historical contract while accepting the exact two-line
    // download-link update observed in Production on 2026-11-15.
    expect(built).toContain('ดาวน์โหลดใบสมัครออฟไลน์');
    expect(built).toContain('https://docs.google.com/document/d/1U4Gc96_g87tOBrbyPYEQnGSG51WMxxn9Q-AH6dGFJ_Q/edit?usp=sharing');
    built = built.replace('https://docs.google.com/document/d/1U4Gc96_g87tOBrbyPYEQnGSG51WMxxn9Q-AH6dGFJ_Q/edit?usp=sharing', 'https://drive.google.com/file/d/1AAojma2JztAfMKWlonnpKVvC17_T_M7y/view?usp=sharing')
      .replace('ดาวน์โหลดใบสมัครออฟไลน์', 'ดาวน์โหลดแบบฟอร์มใบรายชื่อนักกีฬา');
  }
  const change = issue59.modules.find(change => change.module === entry.module);
  expect(digest(normalizeRuntime(entry.module, built))).toBe(vpsDevTls.modules.find(item => item.module === entry.module)?.approved_canonical_sha256 ?? [...quota70.modules,...quota70.preserved_runtime_modules].find(x=>x.module===entry.module)?.approved_canonical_sha256 ?? roster64.modules.find(x=>x.module===entry.module)?.approved_canonical_sha256 ?? teamModal66.modules.find(x=>x.module===entry.module)?.approved_canonical_sha256 ?? sat63.modules.find(x=>x.module===entry.module)?.approved_canonical_sha256 ?? support62.modules.find(x=>x.module===entry.module)?.approved_canonical_sha256 ?? review61.modules.find(x=>x.module===entry.module)?.approved_canonical_sha256 ?? asset60.modules.find(x=>x.module===entry.module)?.approved_canonical_sha256 ?? name59.modules.find(x=>x.module===entry.module)?.sha256 ?? debug59.modules.find(x=>x.module===entry.module)?.sha256 ?? change?.approved_canonical_sha256 ?? entry.canonical_sha256);
});

it.each(['services/playerOcr.debug','services/playerOcr.diagnostics','services/playerOcr.name','services/playerVerification.details'])('recreates the added module %s from source',module=>{
  const built=fs.readFileSync(path.join(root,'dist',module+'.js'),'utf8');
  expect(digest(built)).toBe(digest(emitted.get(module+'.js')));
  expect(digest(normalizeRuntime(module,built))).toBe(review61.modules.find(x=>x.module===module)?.approved_canonical_sha256 ?? name59.modules.find(x=>x.module===module)?.sha256 ?? debug59.modules.find(x=>x.module===module)?.sha256);
});

it.each(contract)('recreates $module from strict TypeScript', entry => {
  const built = fs.readFileSync(path.join(root, 'dist', entry.module + '.js'), 'utf8');
  expect(emitted.has(entry.module + '.js')).toBe(true);
  expect(digest(emitted.get(entry.module + '.js'))).toBe(digest(built));
});

it('keeps database credentials out of the source fallback', () => {
  const source = fs.readFileSync(path.join(root, 'src/db.ts'), 'utf8');
  expect(source).toContain('const connectionString = process.env.DATABASE_URL;');
  expect(source).not.toMatch(/postgres(?:ql)?:\/\//);
});

it('allows the skip-init override only in explicit development mode', () => {
  const { skipLocalInitialization } = require('../src/services/localRuntime.service');
  const old = { ...process.env };
  try {
    process.env.FOOTBALL_LOCAL_SKIP_INIT = 'true';
    for (const mode of ['production', 'test']) {
      process.env.NODE_ENV = mode;
      expect(skipLocalInitialization()).toBe(false);
    }
    process.env.NODE_ENV = 'development';
    expect(skipLocalInitialization()).toBe(true);
    expect(fs.readFileSync(path.join(root, 'src/app.ts'), 'utf8')).toContain("process.env.NODE_ENV !== 'production' && !skipLocalInitialization()");
  } finally { process.env = old; }
});
