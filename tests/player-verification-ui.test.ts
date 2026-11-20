import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { playerVerificationScript, renderPlayerVerificationModal } from '../src/views/playerVerification';

function fixture() {
  const nodes = new Map<string, any>();
  function node() {
    return { style: {}, hidden: true, children: [] as any[], value: '', textContent: '', innerHTML: '', disabled: false, checked: false,
      focus: jest.fn(), listeners: {} as Record<string, (...args: any[]) => any>,
      addEventListener(name: string, listener: (...args: any[]) => any) { this.listeners[name] = listener; },
      append(...children: any[]) { this.children.push(...children); }, appendChild(child: any) { this.children.push(child); }, replaceChildren() { this.children = []; }, removeAttribute: jest.fn(), setAttribute: jest.fn(), dataset: {},
      getContext: () => ({ drawImage: jest.fn(), strokeRect: jest.fn(), beginPath: jest.fn(), lineTo: jest.fn(), moveTo: jest.fn(), closePath: jest.fn(), stroke: jest.fn(), fillText: jest.fn() }) };
  }
  class TestImage {
    naturalWidth=800;naturalHeight=500;onload:(()=>void)|null=null;onerror:(()=>void)|null=null;private _src='';
    set src(value:string){this._src=value;setTimeout(()=>this.onload?.(),0)}
    get src(){return this._src}
  }
  const el = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, node());
    return nodes.get(id)!;
  };
  const fire = jest.fn().mockResolvedValue({ isConfirmed: true });
  const hide = jest.fn();
  const renderPlayersTable = jest.fn();
  const alert = jest.fn();
  const fetch = jest.fn().mockResolvedValue({
    ok: true, headers: { get: () => 'application/json' },
    json: async () => ({ success: true, job: { state: 'FAILED', errorCode: 'MANUAL_REVIEW', errorMessage: 'บันทึกการตรวจสอบโดยเจ้าหน้าที่แล้ว' }, teamNote: 'หมายเหตุถึงทีม', docStatus: 'APPROVED' })
  });
  const objectUrls = { createObjectURL: jest.fn().mockReturnValue('blob:synthetic-preview'), revokeObjectURL: jest.fn() };
  const window: any = { baseUrl: '', rawPlayersData: [] };
  vm.runInNewContext(playerVerificationScript(), {
    window, document: { getElementById: el, createElement: node, createTextNode: (text: string) => text },
    Swal: { fire }, bootstrap: { Modal: { getInstance: () => ({ hide }) } },
    fetch, alert, renderPlayersTable, AbortController, clearTimeout, setTimeout, Date, URL: objectUrls, Image: TestImage
  });
  const player = { id: 'TEST-PLAYER', docStatus: 'PENDING', remarks: '' };
  window.initializePlayerVerification(player);
  const choose = (field: string, value: string) => {
    const index = ['fullName', 'idCard', 'birthDate', 'expiryDate'].indexOf(field);
    const td = el('pvRows').children[index].children[4];
    const input = td.children.find((label: any) => label.children[0].value === value).children[0];
    input.checked = true; input.listeners.change();
  };
  for (const field of ['fullName', 'idCard', 'birthDate', 'expiryDate']) choose(field, 'SYSTEM_CORRECT');
  const save = () => el('btnSaveAdminRemark').listeners.click();
  return { choose, el, player, save, fire, hide, renderPlayersTable, alert, fetch, window, run: () => el('pvRun').listeners.click() };
}

async function settle() { for (let i = 0; i < 32; i++) await Promise.resolve(); }
afterEach(() => jest.useRealTimers());

it('uses the current team in the header and clears it when switching to an athlete without a team',async()=>{
 const f=fixture();await settle();const teamName='<img src=x onerror=alert(1)> '+ 'ทีมชื่อยาว '.repeat(20);
 f.window.rawTeamsMap={TEAM:{teamName}};
 f.window.initializePlayerVerification({id:'TEAM-PLAYER',teamId:'TEAM'});
 expect(f.el('adminPlayerDetailModalLabel').textContent).toBe('รายละเอียดข้อมูลนักกีฬา — '+teamName);
 expect(f.el('adminPlayerDetailModalLabel').children).toHaveLength(0);
 f.window.initializePlayerVerification({id:'NEXT',school:'ทีมสำรอง'});
 expect(f.el('adminPlayerDetailModalLabel').textContent).toBe('รายละเอียดข้อมูลนักกีฬา — ทีมสำรอง');
 f.window.initializePlayerVerification({id:'NO-TEAM'});
 expect(f.el('adminPlayerDetailModalLabel').textContent).toBe('รายละเอียดข้อมูลนักกีฬา — ไม่ระบุทีม');
 expect(renderPlayerVerificationModal()).toContain('overflow-wrap:anywhere');
});
it('keeps the exact red bold staff guidance separate from processing and error messages',async()=>{
 const html=renderPlayerVerificationModal();
 expect(html).toContain('<p id="pvGuidance">ระบบจะช่วยตรวจเอกสารเบื้องต้น เจ้าหน้าที่สามารถกดดูไฟล์แนบและพิจารณาด้วยสายตา และสามารถกดตัวเลือก ข้อมูลในระบบถูกต้อง เพื่อพิจาณาเองได้เลย</p>');
 expect(html).toContain('#pvGuidance{color:#c62828;font-weight:700;');
 expect(playerVerificationScript()).not.toContain("el('pvGuidance')");
 expect(playerVerificationScript()).not.toContain('ตรวจสอบเสร็จแล้ว กรุณาพิจารณาผลรายช่อง');
 const f=fixture();await settle();f.fetch.mockRejectedValueOnce(new Error('บริการขัดข้อง'));
 f.window.initializePlayerVerification(f.player);await settle();
 expect(f.el('pvNotice').textContent).toContain('บริการขัดข้อง');
});

it('keeps the existing AI split and stacks details below the athlete/document photo box',()=>{
  const html=renderPlayerVerificationModal();const ids=['modalPlayerPhoto','pvCardDocumentImage','pvGeneralInfo','pvTeamInfo','pvOtherInfo','pvDocumentsInfo'];
  expect(ids.map(id=>html.indexOf('id="'+id+'"'))).toEqual(ids.map(id=>html.indexOf('id="'+id+'"')).sort((a,b)=>a-b));
  expect(html).toContain('grid-template-columns:minmax(390px,37%) minmax(0,63%)');
  expect(html).not.toContain('pvFaceConfirmed');expect(html).not.toContain('เปรียบเทียบใบหน้า');
  expect(html.indexOf('id="pvProgressPopup"')).toBeGreaterThan(html.indexOf('<div class="pv-card pv-ai">'));
  expect(html.indexOf('id="pvProgressPopup"')).toBeLessThan(html.indexOf('<div class="pv-ai-header">'));
  expect(html).toContain('.pv-ai{position:relative;');
});
it('populates all requested detail groups from the player DTO and team map using plain text',async()=>{
  const f=fixture();await settle();f.window.rawTeamsMap={'TEAM-FIXTURE':{teamName:'ทีมตัวอย่าง'}};
  f.window.initializePlayerVerification({id:'DETAILS',teamId:'TEAM-FIXTURE',name:'ด.ช. นักกีฬา ตัวอย่าง',idCard:'synthetic-id',birthDate:'2008-03-15',jerseyNo:7,jerseyName:'<img src=x onerror=alert(1)>',category:'U16',position:'ผู้รักษาประตู (GK)',height:160,weight:50,grade:'ม.2',guardianName:'ผู้ปกครองตัวอย่าง',guardianRelation:'บิดา',phone:'fixture-phone'});
  expect(f.el('modalPlayerName').textContent).toBe('ด.ช. นักกีฬา ตัวอย่าง');expect(f.el('modalPlayerIdCard').textContent).toBe('เลขบัตร: synthetic-id');expect(f.el('modalPlayerPos').textContent).toBe('ผู้รักษาประตู (GK)');
  expect(f.el('pvGeneralName').textContent).toBe('ด.ช. นักกีฬา ตัวอย่าง');expect(f.el('pvGeneralIdCard').textContent).toBe('synthetic-id');expect(f.el('pvGeneralBirthDate').textContent).toContain('2551');
  expect(f.el('modalPlayerSchool').textContent).toBe('ทีมตัวอย่าง');expect(f.el('modalPlayerCat').textContent).toBe('U16');expect(f.el('pvTeamJerseyNo').textContent).toBe('7');
  expect(f.el('pvTeamJerseyName').textContent).toBe('<img src=x onerror=alert(1)>');expect(f.el('pvTeamJerseyName').children).toHaveLength(0);
  expect(f.el('pvTeamPosition').textContent).toBe('ผู้รักษาประตู (GK)');expect(f.el('modalPlayerHW').textContent).toBe('160 ซม. / 50 กก.');expect(f.el('modalPlayerGrade').textContent).toBe('ม.2');expect(f.el('modalPlayerGuardian').textContent).toBe('ผู้ปกครองตัวอย่าง (บิดา)');expect(f.el('modalPlayerPhone').textContent).toBe('fixture-phone');
});
it('populates photo captions through the teams-page opener and clears them for the next athlete',async()=>{
  const f=fixture();await settle();
  const source=fs.readFileSync(path.join(__dirname,'../src/routes/admin/adminPortal.router.ts'),'utf8');
  const opener=source.match(/window\.openTeamPlayerVerification = function[\s\S]*?(?=window\.showAdminPlayerDetail = function)/)?.[0];
  expect(opener).toBeTruthy();
  f.window.adminLoadedPlayers=[{id:'TEAM-DETAIL',name:'นักกีฬาสังเคราะห์',id_card:'synthetic-id',position:'ผู้รักษาประตู',category:'U16'},{id:'EMPTY-DETAIL',category:'U16'}];
  f.window.adminLoadedTeam={id:'TEAM',teamName:'ทีมสังเคราะห์'};
  f.window.adminLoadedTeamSubmittedCats='U16';f.window.canChangeTeamStatus=true;
  vm.runInNewContext(opener!,{window:f.window,base:'',document:{getElementById:()=>({})},bootstrap:{Modal:{getOrCreateInstance:()=>({show:jest.fn()})}}});
  f.window.openTeamPlayerVerification('TEAM-DETAIL');
  expect(f.el('modalPlayerName').textContent).toBe('นักกีฬาสังเคราะห์');
  expect(f.el('modalPlayerIdCard').textContent).toBe('เลขบัตร: synthetic-id');
  expect(f.el('modalPlayerPos').textContent).toBe('ผู้รักษาประตู');
  f.window.openTeamPlayerVerification('EMPTY-DETAIL');
  for(const id of ['modalPlayerName','modalPlayerIdCard','modalPlayerPos'])expect(f.el(id).textContent).toBe('-');
  await settle();
});
it('clears the previous athlete data and uses placeholders without inventing an age category',async()=>{
  const f=fixture();await settle();f.window.initializePlayerVerification({id:'EMPTY',jerseyNo:0});
  for(const id of ['modalPlayerName','modalPlayerIdCard','modalPlayerPos','pvGeneralName','pvGeneralIdCard','pvGeneralBirthDate','modalPlayerSchool','modalPlayerCat','pvTeamJerseyName','pvTeamPosition','modalPlayerGrade','modalPlayerGuardian','modalPlayerPhone'])expect(f.el(id).textContent).toBe('-');
  expect(f.el('pvTeamJerseyNo').textContent).toBe('0');expect(f.el('pvCardDocumentLink').hidden).toBe(true);
});
it.each(['image/jpeg','application/pdf'])('uses the scoped first-page preview for an attachment of type %s',async type=>{
  const f=fixture();await settle();f.fetch.mockImplementation((url:string)=>Promise.resolve(url.endsWith('/document-info')?response({document:{hash:'a'.repeat(64),type}}):url.includes('/document-preview')?previewResponse():response({job:null,parserChanged:true})));
  f.window.initializePlayerVerification({id:'DOCUMENT',docIdCard:'/uploads/synthetic-document'+(type==='application/pdf'?'.pdf':'.jpg')});await settle();
  expect(f.el('pvCardDocumentImage').src).toBe('blob:synthetic-preview');
  f.el('pvCardDocumentImage').onload();expect(f.el('pvCardDocumentLink').hidden).toBe(false);
  f.el('pvCardDocumentImage').onerror();expect(f.el('pvCardDocumentLink').hidden).toBe(true);expect(f.el('pvCardDocumentStatus').textContent).toContain('แสดงภาพตัวอย่างไม่ได้');
});
it('retries a temporary document preview busy response and preserves athlete details',async()=>{
  jest.useFakeTimers();
  const f=fixture();await settle();let attempts=0;
  f.fetch.mockImplementation((url:string)=>Promise.resolve(url.endsWith('/document-info')
    ?response({document:{hash:'a'.repeat(64),type:'image/jpeg'}})
    :url.includes('/document-preview')
      ?(++attempts===1?responseError(429,{code:'OCR_PREPARATION_BUSY',message:'กำลังเตรียมเอกสารอื่น',retryAfterSeconds:0}):previewResponse())
      :response({job:null,parserChanged:true})));
  f.window.initializePlayerVerification({id:'RETRY',name:'นักกีฬาทดสอบ',docIdCard:'/uploads/synthetic.jpg'});
  await jest.runOnlyPendingTimersAsync();await settle();
  expect(attempts).toBe(2);expect(f.el('pvGeneralName').textContent).toBe('นักกีฬาทดสอบ');
  expect(f.el('pvCardDocumentImage').src).toBe('blob:synthetic-preview');
});
it('shares the first-page preview between the document card and preparation flow',async()=>{
  const f=fixture();await settle();let previewRequests=0;
  const document={hash:'a'.repeat(64),type:'image/jpeg',pages:1,width:1108,height:1477,requiresPreparation:true};
  f.fetch.mockImplementation((url:string)=>Promise.resolve(url.endsWith('/document-info')
    ?response({document})
    :url.includes('/document-preview')?(previewRequests++,previewResponse())
    :response({job:null,document,preparation:{page:1},requiresPreparation:true})));
  f.window.initializePlayerVerification({id:'PREPARATION',name:'นักกีฬาทดสอบ',docIdCard:'/uploads/synthetic.jpg'});
  await new Promise(resolve=>setTimeout(resolve,10));await settle();
  expect(previewRequests).toBe(1);
  expect(f.el('pvPreparation').hidden).toBe(false);
  expect(f.el('pvCardDocumentImage').src).toBe('blob:synthetic-preview');
  expect(f.el('pvConfirmCrop').disabled).toBe(false);
});
it('shows a safe document-preview validation message without clearing athlete details',async()=>{
  const f=fixture();await settle();
  f.fetch.mockImplementation((url:string)=>Promise.resolve(url.endsWith('/document-info')
    ?response({document:{hash:'a'.repeat(64),type:'image/jpeg'}})
    :url.includes('/document-preview')
      ?responseError(422,{code:'OCR_DOCUMENT_NOT_FOUND',message:'ไม่พบไฟล์เอกสารแนบ กรุณาติดต่อผู้ดูแลระบบ'})
      :response({job:null,parserChanged:true})));
  f.window.initializePlayerVerification({id:'INVALID-DOC',name:'นักกีฬาทดสอบ',docIdCard:'/uploads/synthetic.jpg'});
  await settle();
  expect(f.el('pvGeneralName').textContent).toBe('นักกีฬาทดสอบ');
  expect(f.el('pvCardDocumentStatus').textContent).toBe('ไม่พบไฟล์เอกสารแนบ กรุณาติดต่อผู้ดูแลระบบ');
  expect(f.el('pvCardDocumentLink').hidden).toBe(true);
});
it('preserves the deployed preview error reference without clearing photo captions',async()=>{
  const f=fixture();await settle();const requestId='12345678-1234-1234-1234-123456789abc';
  f.fetch.mockImplementation((url:string)=>Promise.resolve(url.endsWith('/document-info')
    ?response({document:{hash:'a'.repeat(64),type:'image/jpeg'}})
    :url.includes('/document-preview')?responseError(422,{code:'OCR_DOCUMENT_NOT_FOUND',message:'ไม่พบไฟล์',requestId}):response({job:null,parserChanged:true})));
  f.window.initializePlayerVerification({id:'REF',name:'นักกีฬาสังเคราะห์',docIdCard:'/uploads/synthetic.jpg'});await settle();
  expect(f.el('pvCardDocumentStatus').textContent).toBe('ไม่พบไฟล์ (รหัสอ้างอิง: '+requestId+')');
  expect(f.el('modalPlayerName').textContent).toBe('นักกีฬาสังเคราะห์');
});
it('ignores late document metadata from a previously open athlete',async()=>{
  const f=fixture();await settle();let finish!:(r:any)=>void;
  f.fetch.mockImplementation((url:string)=>url.endsWith('/document-info')?new Promise(resolve=>{finish=resolve}):Promise.resolve(response({job:null,parserChanged:true})));
  f.window.initializePlayerVerification({id:'OLD',docIdCard:'/uploads/synthetic.jpg'});f.window.initializePlayerVerification({id:'NEW'});
  finish(response({document:{hash:'a'.repeat(64)}}));await settle();
  expect(f.el('pvCardDocumentLink').hidden).toBe(true);expect(f.el('pvCardDocumentStatus').textContent).toBe('ยังไม่มีเอกสารแนบ');
});
it.each(['https://example.test/card.jpg','//example.test/card.jpg','/uploads/../private','/uploads/%2e%2e/private'])('does not create unsafe document links for %s',async docIdCard=>{
  const f=fixture();await settle();f.window.initializePlayerVerification({id:'UNSAFE',docIdCard});
  const row=f.el('modalPlayerDocsList').children[0];expect(row.children.at(-1).textContent).toBe('ไม่สามารถเปิดเอกสารนี้ได้');expect(row.children.at(-1).href).toBeUndefined();
});

it('shows an in-page success popup after saving and refreshes the player status', async () => {
  const f = fixture();
  await f.save();
  expect(f.player).toMatchObject({ docStatus: 'APPROVED', remarks: 'หมายเหตุถึงทีม' });
  expect(f.hide).toHaveBeenCalledTimes(1);
  expect(f.renderPlayersTable).toHaveBeenCalledTimes(1);
  expect(f.fire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'success', title: 'บันทึกข้อมูลสำเร็จ', confirmButtonText: 'ตกลง' }));
  expect(f.alert).not.toHaveBeenCalled();
  expect(f.el('btnSaveAdminRemark').disabled).toBe(false);
});

it.each(['server', 'network'])('keeps the review editable and shows an in-page error for %s failure', async failure => {
  const f = fixture();
  if (failure === 'network') f.fetch.mockRejectedValueOnce(new Error('เชื่อมต่อไม่ได้'));
  else f.fetch.mockResolvedValueOnce({ ok: false, headers: { get: () => 'application/json' }, json: async () => ({ success: false, message: 'บันทึกไม่สำเร็จจากเซิร์ฟเวอร์' }) });
  await f.save();
  expect(f.hide).not.toHaveBeenCalled();
  expect(f.renderPlayersTable).not.toHaveBeenCalled();
  expect(f.player.docStatus).toBe('PENDING');
  expect(f.fire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'error', title: 'บันทึกไม่สำเร็จ', target: f.el('adminPlayerDetailModal'), text: failure === 'network' ? 'เชื่อมต่อไม่ได้' : 'บันทึกไม่สำเร็จจากเซิร์ฟเวอร์' }));
  expect(f.alert).not.toHaveBeenCalled();
  expect(f.el('modalDocStatusSelect').value).toBe('APPROVED');
  expect(f.el('btnSaveAdminRemark').disabled).toBe(false);
});

it('sends a single save while the request is pending', async () => {
  const f = fixture();
  let finish!: (response: any) => void;
  f.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const saving = f.save();
  await f.save();
  expect(f.fetch.mock.calls.filter(([url]) => url.endsWith('/review'))).toHaveLength(1);
  finish({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true, teamNote: '' }) });
  await saving;
  expect(f.fire).toHaveBeenCalledTimes(1);
});

it('enables retry immediately after an API failure without a countdown or automatic submission', async () => {
  const f = fixture();
  await settle();
  f.fetch.mockResolvedValueOnce({ ok: false, headers: { get: () => 'application/json' }, json: async () => ({ success: false, message: 'บริการ OCR กำลังรับงานเต็ม' }) });
  await f.run();
  expect(f.el('pvRun').disabled).toBe(false);
  expect(f.el('pvNotice').textContent).toContain('รับงานเต็ม');
  expect(f.el('pvRun').textContent).not.toContain('วินาที');
  const calls = f.fetch.mock.calls.length;
  expect(f.fetch.mock.calls).toHaveLength(calls);
  await f.run();
  expect(f.fetch.mock.calls.length).toBeGreaterThan(calls);
});

it('shows the specific OCR failure and keeps retry available when another player opens', async () => {
  jest.useFakeTimers();
  const f = fixture();
  await settle();
  f.fetch.mockResolvedValueOnce({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true, job: { state: 'FAILED', errorMessage: 'บริการ OCR กำลังรับงานเต็ม' } }) });
  f.window.initializePlayerVerification(f.player);
  await settle();
  expect(f.el('pvNotice').textContent).toContain('รับงานเต็ม');
  expect(f.el('pvRun').disabled).toBe(false);
  f.window.initializePlayerVerification({ id: 'OTHER-PLAYER' });
  await settle();
  expect(f.el('pvRun').disabled).toBe(false);
  jest.advanceTimersByTime(6000);
  expect(f.el('pvNotice').textContent).toBe('บันทึกการตรวจสอบโดยเจ้าหน้าที่แล้ว');
  expect(jest.getTimerCount()).toBe(0);
});

it('blocks saving when any decision is missing and names the missing field', async () => {
  const f = fixture(); await settle();
  f.window.initializePlayerVerification(f.player); await settle();
  for (const field of ['fullName', 'idCard', 'birthDate']) f.choose(field, 'SYSTEM_CORRECT');
  f.el('modalDocStatusSelect').value='APPROVED';f.el('modalDocStatusSelect').listeners.change();
  await f.save();
  expect(f.fetch.mock.calls.filter(([url]) => url.endsWith('/review'))).toHaveLength(0);
  expect(f.fire).toHaveBeenCalledWith(expect.objectContaining({ icon: 'error', text: expect.stringContaining('วันหมดอายุบัตร') }));
  expect(f.hide).not.toHaveBeenCalled();
});
it('saves four-field review without any face input', async () => {
  const f=fixture();await f.save();
  const sent=JSON.parse(f.fetch.mock.calls.find(([url])=>url.endsWith('/review'))![1].body);
  expect(sent).not.toHaveProperty('faceConfirmed');expect(sent.docStatus).toBe('APPROVED');
});
it.each(['CORRECT_DATA', 'REUPLOAD'])('previews action required for %s and saves the server status', async choice => {
  const f = fixture(); f.choose('birthDate', choice);
  expect(f.el('modalDocStatusSelect').value).toBe('ACTION_REQUIRED');
  f.fetch.mockResolvedValueOnce({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true, teamNote: 'reason', docStatus: 'ACTION_REQUIRED' }) });
  await f.save();
  expect(f.player.docStatus).toBe('ACTION_REQUIRED');
});
it('shows decisions on every OCR row and ignores retired face flags', async () => {
  const f = fixture(); await settle();
  const decisions = Object.fromEntries(['fullName', 'idCard', 'birthDate', 'expiryDate'].map(key => [key, 'SYSTEM_CORRECT']));
  f.fetch.mockResolvedValueOnce({ ok: true, headers: { get: () => 'application/json' }, json: async () => ({ success: true, job: {
    state: 'SUCCEEDED', checkedAt: new Date().toISOString(), result: { rows: ['MATCH', 'MATCH', 'NOT_APPLICABLE', 'NO_REFERENCE'].map((status, i) => ({ field: Object.keys(decisions)[i], status })) },
    review: { decisions, faceConfirmed: false, faceReviewed: true, teamNote: 'different' }
  } }) });
  f.window.initializePlayerVerification(f.player); await settle();
  expect(f.el('pvRows').children.map((row: any) => row.children[4].children.length)).toEqual([3, 3, 3, 4]);
  expect(f.el('modalDocStatusSelect').value).toBe('APPROVED');
});

function response(data: any) { return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ success: true, ...data }) }; }
function responseError(status: number, data: any) { return { ok: false, status, headers: { get: (name: string) => name === 'Retry-After' ? String(data.retryAfterSeconds ?? '') : 'application/json' }, json: async () => ({ success: false, ...data }) }; }
function previewResponse() { return { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, blob: async () => ({ type: 'image/jpeg' }) }; }
const completedJob = () => ({ id: 'AI-COMPLETE', state: 'SUCCEEDED', checkedAt: new Date().toISOString(), result: { rows: [] } });
it('automatically submits missing results and tracks queue, running and completion until the user closes only progress', async () => {
  jest.useFakeTimers();
  const f = fixture(); await settle();
  f.fetch.mockResolvedValueOnce(response({ job: null }))
    .mockResolvedValueOnce(response({ job: { id: 'AI-PROGRESS', state: 'QUEUED' } }))
    .mockResolvedValueOnce(response({ job: { id: 'AI-PROGRESS', state: 'QUEUED' } }))
    .mockResolvedValueOnce(response({ job: { id: 'AI-PROGRESS', state: 'RUNNING' } }))
    .mockResolvedValueOnce(response({ job: completedJob() }));
  f.window.initializePlayerVerification(f.player);
  expect(f.el('pvProgressPopup').hidden).toBe(false);
  expect(f.el('pvProgressPercent').textContent).toBe('5%');
  await settle(); await settle();
  const submissions = f.fetch.mock.calls.filter(([, init]) => init.method === 'POST');
  expect(submissions).toHaveLength(1);
  expect(JSON.parse(submissions[0][1].body)).toEqual({force:false,confirmPaidRetry:false,selection:{page:1},selectionConfirmed:false});
  expect(f.el('pvProgressPercent').textContent).toBe('25%');
  jest.advanceTimersByTime(2000); await settle();
  expect(f.el('pvProgressPercent').textContent).toBe('60%');
  jest.advanceTimersByTime(2000); await settle();
  expect(f.el('pvProgressPercent').textContent).toBe('100%');
  expect(f.el('pvProgressPopup').hidden).toBe(false);
  jest.advanceTimersByTime(10000);
  expect(f.el('pvProgressPopup').hidden).toBe(false);
  expect(f.el('pvProgressClose').hidden).toBe(false);
  f.el('pvProgressClose').listeners.click();
  expect(f.el('pvProgressPopup').hidden).toBe(true);
  expect(f.hide).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});
it('reuses successful cached results without starting another AI job', async () => {
  jest.useFakeTimers();
  const f = fixture(); await settle();
  f.fetch.mockResolvedValueOnce(response({ job: {...completedJob(),result:{rows:[{field:'fullName',status:'UNCLEAR',validation:'MISSING',observedValue:'',reason:'legacy parser reason',suggestedDecision:'REUPLOAD'},{field:'birthDate',status:'UNCLEAR',validation:'INVALID',observedValue:'3 Xyz. 2011',reason:'legacy format reason',suggestedDecision:'REUPLOAD'}]}} }));
  f.window.initializePlayerVerification(f.player); await settle();
  expect(f.el('pvProgressPercent').textContent).toBe('100%');
  expect(f.el('pvRows').children[0].children[3].textContent).toBe('ชื่อ / นามสกุล: legacy parser reason');
  expect(f.el('pvRows').children[2].children[3].textContent).toBe('วันเดือนปีเกิด: legacy format reason');
  expect(f.el('pvRows').children[2].children[2].textContent).toBe('ไม่พบ วันเดือนปีเกิด ภาษาไทย กรุณาตรวจต้นฉบับ');
  expect(f.fetch.mock.calls.filter(([, init]) => init.method === 'POST')).toHaveLength(0);
  jest.advanceTimersByTime(10000);
  expect(f.el('pvProgressPopup').hidden).toBe(false);
  expect(f.el('pvProgressClose').hidden).toBe(false);
  f.el('pvProgressClose').listeners.click();
  expect(f.el('pvProgressPopup').hidden).toBe(true);
});
it('does not automatically pay to replace results after a parser revision changes',async()=>{
  const f=fixture();await settle();f.fetch.mockResolvedValueOnce(response({job:null,parserChanged:true,stale:true}));
  f.window.initializePlayerVerification(f.player);await settle();
  expect(f.fetch.mock.calls.filter(([,init])=>init.method==='POST')).toHaveLength(0);
  expect(f.el('pvNotice').textContent).toContain('ไม่เรียกซ้ำอัตโนมัติ');
});
it.each(['PENDING','APPROVED','ACTION_REQUIRED','CORRECTED'])('preserves explicitly selected %s through decision changes and save',async status=>{
  const f=fixture();await settle();f.el('modalDocStatusSelect').value=status;f.el('modalDocStatusSelect').listeners.change();
  f.choose('birthDate','REUPLOAD');expect(f.el('modalDocStatusSelect').value).toBe(status);
  await f.save();const [,init]=f.fetch.mock.calls.find(([url])=>url.endsWith('/review'))!;expect(JSON.parse(init.body).docStatus).toBe(status);
});
it('shows the saved current status and resets manual selection for the next athlete',async()=>{
  const f=fixture();await settle();f.window.initializePlayerVerification({...f.player,docStatus:'CORRECTED'});await settle();
  expect(f.el('modalDocStatusSelect').value).toBe('CORRECTED');
  f.el('modalDocStatusSelect').value='ACTION_REQUIRED';f.el('modalDocStatusSelect').listeners.change();
  f.window.initializePlayerVerification({id:'NEXT',docStatus:'APPROVED'});await settle();expect(f.el('modalDocStatusSelect').value).toBe('APPROVED');
});
it('does not overwrite an explicit status when OCR completes later',async()=>{
  const f=fixture();await settle();let finish!:(r:any)=>void;f.fetch.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
  f.window.initializePlayerVerification(f.player);f.el('modalDocStatusSelect').value='CORRECTED';f.el('modalDocStatusSelect').listeners.change();
  finish(response({job:{state:'SUCCEEDED',result:{rows:[]},checkedAt:new Date().toISOString(),review:{decisions:{},docStatus:'APPROVED',statusSource:'MANUAL'}}}));await settle();
  expect(f.el('modalDocStatusSelect').value).toBe('CORRECTED');
});
it('saves an explicit pending reset without old decisions and clears the visible AI round',async()=>{
  const f=fixture();await settle();f.window.initializePlayerVerification(f.player);await settle();
  f.el('modalDocStatusSelect').value='PENDING';f.el('modalDocStatusSelect').listeners.change();
  f.fetch.mockResolvedValueOnce(response({docStatus:'PENDING',teamNote:'',reset:true}));await f.save();
  const [,init]=f.fetch.mock.calls.find(([url])=>url.endsWith('/review'))!;expect(JSON.parse(init.body)).toMatchObject({docStatus:'PENDING',jobId:null,decisions:{}});
  expect(f.el('pvCheckedAt').textContent).toContain('ล้างผลตรวจ');expect(f.el('pvRows').children.every((tr:any)=>tr.children[4].children.every((label:any)=>!label.children[0].checked))).toBe(true);
});
it('reopens a reset round empty and waits for explicit confirmation instead of auto-reading',async()=>{
  const f=fixture();await settle();f.fetch.mockResolvedValue(response({job:null,reset:true,internalNote:'STAFF-NOTE',teamNote:'TEAM-NOTE'}));
  f.window.initializePlayerVerification({...f.player,docStatus:'PENDING'});await settle();
  expect(f.fetch.mock.calls.filter(([,init])=>init.method==='POST')).toHaveLength(0);expect(f.el('modalPlayerRemarks').value).toBe('STAFF-NOTE');expect(f.el('pvCheckedAt').textContent).toContain('ล้างผลตรวจ');expect(f.el('pvProgressPopup').hidden).toBe(true);
});
it('does not advance running jobs to 100 percent based on elapsed time', async () => {
  jest.useFakeTimers();
  const f = fixture(); await settle();
  f.fetch.mockResolvedValue(response({ job: { state: 'RUNNING' } }));
  f.window.initializePlayerVerification(f.player); await settle();
  for (let i = 0; i < 5; i++) { jest.advanceTimersByTime(2000); await settle(); }
  expect(f.el('pvProgressPercent').textContent).toBe('60%');
  expect(f.el('pvProgressPopup').hidden).toBe(false);
  f.el('adminPlayerDetailModal').listeners['hidden.bs.modal']();
  expect(f.el('pvProgressPopup').hidden).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});
it.each(['worker', 'network', 'providerBusy'])('closes progress on %s failure without claiming completion', async failure => {
  jest.useFakeTimers();
  const f = fixture(); await settle();
  if (failure === 'network') f.fetch.mockRejectedValueOnce(new Error('เชื่อมต่อไม่ได้'));
  else if (failure === 'providerBusy') f.fetch.mockResolvedValueOnce({ ok: false, headers: { get: () => 'application/json' }, json: async () => ({ success: false, message: 'บริการ OCR กำลังรับงานเต็ม' }) });
  else f.fetch.mockResolvedValueOnce(response({ job: { state: 'FAILED', errorMessage: 'ติดต่อบริการ AI ไม่ได้' } }));
  f.window.initializePlayerVerification(f.player); await settle();
  expect(f.el('pvProgressPopup').hidden).toBe(true);
  expect(f.el('pvProgressPercent').textContent).not.toBe('100%');
  expect(f.el('pvNotice').textContent).toContain(failure === 'network' ? 'เชื่อมต่อไม่ได้' : failure === 'worker' ? 'ติดต่อบริการ AI ไม่ได้' : 'รับงานเต็ม');
  f.el('adminPlayerDetailModal').listeners['hidden.bs.modal']();
  expect(jest.getTimerCount()).toBe(0);
});
it('clears the old completion and close button when a different player opens', async () => {
  jest.useFakeTimers();
  const f = fixture(); await settle();
  f.fetch.mockResolvedValueOnce(response({ job: completedJob() }));
  f.window.initializePlayerVerification(f.player); await settle();
  f.fetch.mockResolvedValue(response({ job: { state: 'RUNNING' } }));
  f.window.initializePlayerVerification({ id: 'OTHER' }); await settle();
  jest.advanceTimersByTime(500); await settle();
  expect(f.el('pvProgressPopup').hidden).toBe(false);
  expect(f.el('pvProgressPercent').textContent).toBe('60%');
  expect(f.el('pvProgressClose').hidden).toBe(true);
  f.el('pvProgressClose').listeners.click();
  expect(f.el('pvProgressPopup').hidden).toBe(false);
  f.el('adminPlayerDetailModal').listeners['hidden.bs.modal']();
  expect(jest.getTimerCount()).toBe(0);
});

const suggestedRows = (expired = false) => [
  {field:'fullName',status:'MATCH',suggestedDecision:'SYSTEM_CORRECT',observedValue:'ด.ช. ทดสอบ ตัวอย่าง'},
  {field:'idCard',status:'MISMATCH',suggestedDecision:'CORRECT_DATA'},
  {field:'birthDate',status:'UNCLEAR',suggestedDecision:'REUPLOAD'},
  {field:'expiryDate',status:expired?'EXPIRED_CARD':'NO_REFERENCE',suggestedDecision:expired?'EXPIRED_CARD':'SYSTEM_CORRECT',expired,
    decisionReason:expired?'บัตรประชาชนหมดอายุ กรุณาแนบบัตรใหม่ที่ยังไม่หมดอายุ (วันหมดอายุ: 2026-11-08)':''}
];
function selected(f: ReturnType<typeof fixture>, field: string) {
  const i=['fullName','idCard','birthDate','expiryDate'].indexOf(field);
  return f.el('pvRows').children[i].children[4].children.find((label:any)=>label.children[0].checked)?.children[0].value;
}
it('prefills all four officer decisions from AI and offers expired-card only for expiry',async()=>{
  const f=fixture();await settle();f.fetch.mockResolvedValueOnce(response({job:{...completedJob(),result:{rows:suggestedRows(true)}}}));
  f.window.initializePlayerVerification({...f.player,remarks:'หมายเหตุเดิม'});await settle();
  expect(['fullName','idCard','birthDate','expiryDate'].map(field=>selected(f,field))).toEqual(['SYSTEM_CORRECT','CORRECT_DATA','REUPLOAD','EXPIRED_CARD']);
  expect(f.el('pvRows').children.map((row:any)=>row.children[4].children.length)).toEqual([3,3,3,4]);
  expect(f.el('modalDocStatusSelect').value).toBe('ACTION_REQUIRED');
  expect(f.el('pvRows').children[3].children[3].textContent).toContain('บัตรหมดอายุ');
  expect(f.el('pvTeamNote').value).toContain('หมายเหตุเดิม');expect(f.el('pvTeamNote').value).toContain('วันหมดอายุ: 2026-11-08');
  expect(f.fetch.mock.calls.filter(([,init])=>init.method==='POST')).toHaveLength(0);
  await f.save();const body=JSON.parse(f.fetch.mock.calls.find(([url])=>url.endsWith('/review'))![1].body);
  expect(body.decisionSources).toEqual({fullName:'AI_PREFILL',idCard:'AI_PREFILL',birthDate:'AI_PREFILL',expiryDate:'AI_PREFILL'});
});
it('does not replace a field, status or notes edited while waiting for AI',async()=>{
  const f=fixture();await settle();let finish!:(r:any)=>void;f.fetch.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
  f.window.initializePlayerVerification(f.player);
  f.choose('fullName','CORRECT_DATA');f.el('pvTeamNote').value='ข้อความเจ้าหน้าที่';f.el('pvTeamNote').listeners.input();
  f.el('modalPlayerRemarks').value='หมายเหตุภายในที่แก้เอง';f.el('modalPlayerRemarks').listeners.input();
  f.el('modalDocStatusSelect').value='CORRECTED';f.el('modalDocStatusSelect').listeners.change();
  finish(response({job:{...completedJob(),result:{rows:suggestedRows()},review:{decisions:{fullName:'SYSTEM_CORRECT'},teamNote:'เก่า',internalNote:'เก่า',docStatus:'APPROVED',statusSource:'MANUAL'}}}));await settle();
  expect(selected(f,'fullName')).toBe('CORRECT_DATA');expect(selected(f,'idCard')).toBe('CORRECT_DATA');
  expect(f.el('pvTeamNote').value).toContain('ข้อความเจ้าหน้าที่');expect(f.el('pvTeamNote').value).not.toContain('เก่า');
  expect(f.el('modalPlayerRemarks').value).toBe('หมายเหตุภายในที่แก้เอง');expect(f.el('modalDocStatusSelect').value).toBe('CORRECTED');
});
it('retains saved field choices but upgrades a now-expired cached card without saving automatically',async()=>{
  const f=fixture();await settle();const decisions={fullName:'REUPLOAD',idCard:'SYSTEM_CORRECT',birthDate:'SYSTEM_CORRECT',expiryDate:'SYSTEM_CORRECT'};
  f.fetch.mockResolvedValueOnce(response({job:{...completedJob(),result:{cached:true,rows:suggestedRows(true)},review:{decisions,teamNote:'ข้อความเดิม',docStatus:'APPROVED',statusSource:'MANUAL'}}}));
  f.window.initializePlayerVerification({...f.player,docStatus:'APPROVED'});await settle();
  expect(selected(f,'fullName')).toBe('REUPLOAD');expect(selected(f,'idCard')).toBe('SYSTEM_CORRECT');
  expect(selected(f,'expiryDate')).toBe('EXPIRED_CARD');expect(f.el('modalDocStatusSelect').value).toBe('ACTION_REQUIRED');
  expect(f.fetch.mock.calls.filter(([,init])=>init.method==='POST')).toHaveLength(0);
});
it('replaces only managed reasons when staff overrides a prefilled decision',async()=>{
  const f=fixture();await settle();f.fetch.mockResolvedValueOnce(response({job:{...completedJob(),result:{rows:suggestedRows(true)}}}));
  f.window.initializePlayerVerification({...f.player,remarks:'ข้อความที่ต้องรักษา'});await settle();
  f.choose('expiryDate','SYSTEM_CORRECT');expect(f.el('pvTeamNote').value).toContain('ข้อความที่ต้องรักษา');expect(f.el('pvTeamNote').value).not.toContain('บัตรประชาชนหมดอายุ');
  await f.save();const body=JSON.parse(f.fetch.mock.calls.find(([url])=>url.endsWith('/review'))![1].body);
  expect(body.decisionSources.expiryDate).toBe('STAFF_EDITED');
});

it('renders detailed surname differences as plain text without a prefix comparison',async()=>{
 const f=fixture();await settle();
 const details=['ชื่อ: ตรงกัน','นามสกุล: AI อ่าน “พิทักษ” / ข้อมูลระบบ “พิทักษ์” ต่างกันที่เครื่องหมาย “์” กรุณาตรวจด้วยสายตา'];
 const rows=suggestedRows().map(row=>row.field==='fullName'?{...row,status:'MISMATCH',validation:'VALID',systemValue:'ทดสอบ พิทักษ์',observedValue:'ทดสอบ พิทักษ',details,suggestedDecision:'CORRECT_DATA'}:row);
 f.fetch.mockResolvedValueOnce(response({job:{...completedJob(),result:{rows}}}));f.window.initializePlayerVerification(f.player);await settle();
 const cell=f.el('pvRows').children[0].children[3];expect(cell.textContent).toBe(details.join('\n'));expect(cell.children).toHaveLength(0);expect(cell.textContent).not.toContain('คำนำหน้า');
 expect(f.el('pvRows').children[0].children[0].textContent).toBe('ชื่อ / นามสกุล');expect(selected(f,'fullName')).toBe('CORRECT_DATA');
 expect(f.fetch.mock.calls.filter(([,init])=>init.method==='POST')).toHaveLength(0);f.choose('fullName','SYSTEM_CORRECT');expect(selected(f,'fullName')).toBe('SYSTEM_CORRECT');
});
it('retains explicit staff review for an incomplete personal name and English supplements',async()=>{
 const f=fixture();await settle();const reason='ชื่อ / นามสกุล: อ่านได้เพียง “ทดสอบ” จึงยังแยกชื่อและนามสกุลไม่ได้ กรุณาตรวจไฟล์แนบ';
 const rows=suggestedRows().map(row=>row.field==='fullName'?{...row,status:'UNCLEAR',validation:'INVALID',observedValue:'ทดสอบ',details:[reason],suggestedDecision:null,requiresManualDecision:true,englishName:{givenName:'Example',surname:'Fixture',labelsFound:true}}:row);
 f.fetch.mockResolvedValueOnce(response({job:{...completedJob(),result:{rows}}}));f.window.initializePlayerVerification(f.player);await settle();
 expect(selected(f,'fullName')).toBeUndefined();expect(f.el('modalDocStatusSelect').value).toBe('ACTION_REQUIRED');
 expect(f.el('pvRows').children[0].children[2].textContent).toContain('ทดสอบ');expect(f.el('pvRows').children[0].children[2].textContent).toContain('Example Fixture');
 expect(f.el('pvRows').children[0].children[3].textContent).toBe(reason);await f.save();expect(f.fetch.mock.calls.filter(([,init])=>init.method==='POST')).toHaveLength(0);
 f.choose('fullName','SYSTEM_CORRECT');await f.save();const body=JSON.parse(f.fetch.mock.calls.find(([url])=>url.endsWith('/review'))![1].body);expect(body.decisionSources.fullName).toBe('STAFF_EDITED');
});
it('shows label-only English as missing and never inserts markup from a raw Thai candidate',async()=>{
 const f=fixture();await settle();const rows=suggestedRows().map(row=>row.field==='fullName'?{...row,status:'UNCLEAR',validation:'INVALID',observedValue:'<img src=x>',suggestedDecision:null,requiresManualDecision:true,englishName:{givenName:'',surname:'',labelsFound:true}}:row);
 f.fetch.mockResolvedValueOnce(response({job:{...completedJob(),result:{rows}}}));f.window.initializePlayerVerification(f.player);await settle();
 const cell=f.el('pvRows').children[0].children[2];expect(cell.textContent).toContain('<img src=x>');expect(cell.children).toHaveLength(0);expect(cell.textContent).toContain('อังกฤษ: ไม่พบค่าชื่อและนามสกุล');
});
