"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPlayerVerificationModal = renderPlayerVerificationModal;
exports.playerVerificationScript = playerVerificationScript;
const playerOcr_name_1 = require("../services/playerOcr.name");
/** Reference: AI_Verification.png. Values are populated through textContent, never OCR HTML. */
function renderPlayerVerificationModal() {
    return `<style>
  #adminPlayerDetailModal .modal-dialog{max-width:1480px;width:calc(100% - 32px)}
  #adminPlayerDetailModal .modal-content{border-radius:22px;overflow:hidden;border:1px solid #d9e4ef}
  #adminPlayerDetailModal .modal-header{background:linear-gradient(100deg,#064aa4,#003880);padding:18px 28px}
  #adminPlayerDetailModalLabel{min-width:0;overflow-wrap:anywhere}
  #pvGuidance{color:#c62828;font-weight:700;margin-bottom:10px}
  #adminPlayerDetailModal .modal-body{background:#f4f8fd;padding:18px 16px}
  .pv-progress-overlay{position:absolute;inset:0;z-index:20;background:rgba(244,248,253,.94);display:flex;align-items:center;justify-content:center;padding:24px}
  .pv-progress-overlay[hidden]{display:none}.pv-progress-box{width:min(100%,480px);padding:32px 24px;background:white;border:1px solid #dce5ee;border-radius:18px;box-shadow:0 12px 40px #112d4d26;text-align:center}
  .pv-progress-track{height:22px;background:#e0edff;border-radius:12px;overflow:hidden;margin-top:20px}.pv-progress-bar{height:100%;background:linear-gradient(90deg,#0860ed,#00a4cf);transition:width .25s ease}.pv-progress-percent{font-size:28px;color:#064aa4;font-weight:700;margin-top:12px}
  .pv-grid{display:grid;grid-template-columns:minmax(390px,37%) minmax(0,63%);gap:14px}
  .pv-left-top{display:flex;flex-direction:column;gap:12px;margin-bottom:12px}
  .pv-card{background:#fff;border:1px solid #dce5ee;border-radius:16px;padding:16px;box-shadow:0 2px 3px #112d4d0c}
  .pv-card h6{font-weight:700;color:#111e3b;border-bottom:1px solid #d8e1eb;padding-bottom:12px;margin-bottom:12px;font-size:18px}
  .pv-photo{text-align:center;grid-row:span 2;padding:20px 10px}.pv-photo>img{width:146px;height:228px;object-fit:cover;border-radius:12px}
  .pv-photo h5{font-size:17px;font-weight:700;margin:14px 0 8px}.pv-info p{margin-bottom:9px;font-size:15px}
  .pv-details-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}.pv-details-grid p{margin:0;overflow-wrap:anywhere}.pv-details-grid b{display:block;margin-bottom:4px;font-size:13px}.pv-details-wide{grid-column:1/-1}
  .pv-card-document{margin-top:16px;padding-top:14px;border-top:1px solid #d8e1eb}.pv-card-document img{width:100%;height:auto;max-height:300px;object-fit:contain;border-radius:8px}.pv-card-document a{display:block}.pv-card-document [hidden]{display:none}
  .pv-review{min-height:330px}.pv-review h6,.pv-team-note h6{color:#0860ed}
  .pv-ai{position:relative;padding:0;overflow:hidden;height:100%}.pv-ai-header{background:linear-gradient(100deg,#e2f1ff,#c8e1ff);padding:10px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .pv-ai-header h5{margin:0;font-size:22px;font-weight:700;color:#002eaa}.pv-ai-header small{margin-left:auto;font-size:12px}
  .pv-ai-content{padding:10px}.pv-table{width:100%;border-collapse:separate;border-spacing:0;font-size:14px;border:1px solid #d4e1ef;border-radius:10px;overflow:hidden}
  .pv-table th{background:#cce0f9;text-align:center;padding:10px 6px;white-space:nowrap}.pv-table td{padding:10px 8px;border-top:1px solid #dce6f1;border-right:1px solid #e3ecf6;vertical-align:top}
  .pv-table td:first-child{font-weight:700;width:22%}.pv-table td:last-child{width:28%;font-size:13px}.pv-table label{display:block;padding:3px 4px;cursor:pointer;border-radius:8px}
  .pv-table label:has(input:checked){background:#ffe3e5;color:#b20b20}.pv-table label:first-child:has(input:checked){background:#d9f4e6;color:#09652e}
  .pv-status{font-weight:700}.pv-status[data-status=MATCH]{color:#06852c}.pv-status[data-status=MISMATCH],.pv-status[data-status=EXPIRED_CARD]{color:#d61f38}.pv-status[data-status=UNCLEAR]{color:#a36900}
  .pv-observed[data-status=MISMATCH]{background:#ffe6e8;border-radius:8px}.pv-observed[data-status=UNCLEAR]{background:#fff5dc;border-radius:8px}
  .pv-help{padding:12px;background:#e0edff;border-radius:8px;color:#003373;font-size:14px}
  .pv-preparation{border:1px solid #aac9ed;border-radius:10px;background:#f1f7ff;padding:12px;margin-bottom:12px}
  .pv-preparation[hidden]{display:none}.pv-crop-wrap{max-height:480px;overflow:auto;background:#e1e7ed;text-align:center}
  #pvCropCanvas{max-width:100%;height:auto;touch-action:none;cursor:crosshair}.pv-crop-inputs{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.pv-crop-inputs label{font-size:12px}.pv-crop-inputs input{width:78px}
  .pv-team-note{border:1px solid #d4e1ef;border-radius:10px;margin-top:8px;padding:10px}.pv-team-note h6{font-size:16px;margin:0 0 8px;border:0;padding:0}
  #adminPlayerDetailModal .modal-footer{padding:16px 28px;background:white;gap:8px}
  @media(max-width:1100px){.pv-grid{grid-template-columns:1fr}.pv-review{min-height:0}.pv-table{min-width:760px}}
  @media(max-width:550px){#adminPlayerDetailModal .modal-dialog{width:calc(100% - 12px);margin:6px}.pv-left-top{display:block}.pv-photo{margin-bottom:12px}.pv-left-top>.pv-card{margin-bottom:12px}.pv-ai-header small{margin-left:0}}
  </style>
  <div class="modal fade" id="adminPlayerDetailModal" tabindex="-1" aria-labelledby="adminPlayerDetailModalLabel" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable"><div class="modal-content shadow-lg position-relative">
    <div class="modal-header text-white"><h4 class="mb-0 fw-bold" id="adminPlayerDetailModalLabel">รายละเอียดข้อมูลนักกีฬา</h4><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="ปิด"></button></div>
    <div class="modal-body"><input type="hidden" id="modalPlayerId"><div id="pvReadOnlyNotice" class="alert alert-info py-2 mb-3" hidden></div><div class="pv-grid">
      <div><div class="pv-left-top">
        <div class="pv-card pv-photo"><img id="modalPlayerPhoto" alt="รูปถ่ายนักกีฬา"><h5 id="modalPlayerName">—</h5><div id="modalPlayerIdCard" class="small text-muted mb-2">—</div><span id="modalPlayerPos" class="badge bg-info text-dark p-2">—</span><span id="modalPlayerJerseyNo" class="d-none"></span>
          <div class="pv-card-document"><div class="small fw-bold mb-2">สำเนาบัตรประชาชน / สูติบัตร</div><a id="pvCardDocumentLink" target="_blank" rel="noopener noreferrer" hidden><img id="pvCardDocumentImage" alt="ภาพตัวอย่างเอกสารบัตรประชาชนหรือสูติบัตร"></a><p id="pvCardDocumentStatus" class="small text-muted mb-0">ยังไม่มีเอกสารแนบ</p><small class="text-muted">กดภาพเพื่อดูขนาดเต็ม หรือเปิดไฟล์ต้นฉบับจากรายการเอกสารประกอบ</small></div>
        </div>
        <div id="pvGeneralInfo" class="pv-card pv-info"><h6><i class="bi bi-card-heading me-2"></i>ข้อมูลทั่วไป</h6><div class="pv-details-grid">
          <p class="pv-details-wide"><b>คำนำหน้า ชื่อ นามสกุล</b><span id="pvGeneralName">-</span></p><p><b>เลขบัตรประชาชน</b><span id="pvGeneralIdCard">-</span></p><p><b>วันเกิด</b><span id="pvGeneralBirthDate">-</span></p>
        </div></div>
        <div id="pvTeamInfo" class="pv-card pv-info"><h6><i class="bi bi-people me-2"></i>ข้อมูลทีม</h6><div class="pv-details-grid">
          <p class="pv-details-wide"><b>สังกัดทีม</b><span id="modalPlayerSchool">-</span></p><p><b>รุ่นอายุ</b><span id="modalPlayerCat">-</span></p><p><b>เบอร์เสื้อ</b><span id="pvTeamJerseyNo">-</span></p><p><b>ชื่อบนเสื้อ</b><span id="pvTeamJerseyName">-</span></p><p><b>ตำแหน่ง</b><span id="pvTeamPosition">-</span></p>
        </div></div>
        <div id="pvOtherInfo" class="pv-card pv-info"><h6><i class="bi bi-info-circle me-2"></i>ข้อมูลอื่นๆ</h6><div class="pv-details-grid">
          <p><b>ส่วนสูง / น้ำหนัก</b><span id="modalPlayerHW">-</span></p><p><b>ระดับชั้น</b><span id="modalPlayerGrade">-</span></p><p><b>ผู้ปกครอง / ความสัมพันธ์</b><span id="modalPlayerGuardian">-</span></p><p><b>เบอร์โทรศัพท์</b><span id="modalPlayerPhone">-</span></p>
        </div></div>
        <div id="pvDocumentsInfo" class="pv-card"><h6><i class="bi bi-file-earmark-pdf me-2"></i>รายการเอกสารประกอบ</h6><div id="modalPlayerDocsList"></div></div>
      </div><div class="pv-card pv-review"><h6><i class="bi bi-pencil-square me-2"></i>ผลการตรวจสอบ &amp; หมายเหตุเจ้าหน้าที่</h6>
        <label for="modalDocStatusSelect" class="fw-bold mb-2">สถานะการตรวจสอบเอกสาร</label>
        <select id="modalDocStatusSelect" aria-describedby="pvStatusHelp" class="form-select mb-4"><option value="PENDING">⏳ รอตรวจสอบ (Pending)</option><option value="APPROVED">ครบถ้วน สมบูรณ์ / อนุมัติ (Approved)</option><option value="ACTION_REQUIRED">มีหมายเหตุ / ต้องแก้ไข (Action Required)</option><option value="CORRECTED">แก้ไขข้อมูลเรียบร้อย</option></select><p id="pvStatusHelp" class="small text-muted">เจ้าหน้าที่เลือกสถานะได้ ระบบแนะนำจากผลตรวจเมื่อยังไม่ได้เลือกเอง และต้องเลือกการตัดสินใจให้ครบทั้งสี่หัวข้อก่อนบันทึก ยกเว้นรอตรวจสอบซึ่งจะล้างผล AI รอบเดิม</p>
        <label for="modalPlayerRemarks" class="fw-bold mb-2">หมายเหตุเจ้าหน้าที่ (ภายใน)</label><textarea id="modalPlayerRemarks" class="form-control" rows="4" maxlength="4000" placeholder="บันทึกข้อสังเกตสำหรับเจ้าหน้าที่"></textarea>
      </div></div>
      <div class="pv-card pv-ai"><div id="pvProgressPopup" class="pv-progress-overlay" hidden><div class="pv-progress-box" role="status" aria-live="polite"><i class="bi bi-robot fs-1 text-primary" aria-hidden="true"></i><p id="pvProgressMessage" class="fw-bold mt-3 mb-0">AI กำลังทำการตรวจสอบเอกสาร โปรดรอสักครู่</p><div id="pvProgressTrack" class="pv-progress-track" role="progressbar" aria-labelledby="pvProgressMessage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="pvProgressBar" class="pv-progress-bar" style="width:0%"></div></div><div id="pvProgressPercent" class="pv-progress-percent">0%</div><small id="pvProgressStage" class="text-muted">กำลังเตรียมข้อมูล</small><div class="mt-4"><button id="pvProgressClose" type="button" class="btn btn-primary px-4" hidden>ปิด</button></div></div></div><div class="pv-ai-header"><h5><i class="bi bi-robot me-2"></i>AI ช่วยตรวจเอกสาร</h5><small id="pvCheckedAt">ยังไม่ได้ตรวจสอบ</small><button id="pvRun" type="button" class="btn btn-sm btn-outline-primary bg-white"><i class="bi bi-arrow-clockwise"></i> ตรวจสอบด้วย AI อีกครั้ง</button></div>
      <div class="pv-ai-content">
        <p id="pvGuidance">ระบบจะช่วยตรวจเอกสารเบื้องต้น เจ้าหน้าที่สามารถกดดูไฟล์แนบและพิจารณาด้วยสายตา และสามารถกดตัวเลือก ข้อมูลในระบบถูกต้อง เพื่อพิจาณาเองได้เลย</p>
        <div id="pvPreparation" class="pv-preparation" hidden><p class="fw-bold mb-1">เลือกเฉพาะหน้าบัตรก่อนส่ง OCR</p><p class="small">ลากกรอบให้ครอบคลุมชื่อ เลขบัตร วันเกิด และวันหมดอายุ ไม่รวมหลังบัตรและลายมือรับรองสำเนา</p><label>หน้าเอกสาร <select id="pvDocumentPage" class="form-select form-select-sm d-inline-block w-auto"></select></label><div class="pv-crop-wrap mt-2"><canvas id="pvCropCanvas" aria-label="ภาพเอกสารสำหรับเลือกกรอบหน้าบัตร"></canvas></div><div class="pv-crop-inputs"><label>ซ้าย (%)<input id="pvCropX" type="number" min="0" max="100" step="0.1" value="0"></label><label>บน (%)<input id="pvCropY" type="number" min="0" max="100" step="0.1" value="0"></label><label>กว้าง (%)<input id="pvCropW" type="number" min="0.1" max="100" step="0.1" value="100"></label><label>สูง (%)<input id="pvCropH" type="number" min="0.1" max="100" step="0.1" value="100"></label></div><button id="pvCropReset" type="button" class="btn btn-sm btn-outline-secondary">ใช้ภาพเต็มหน้า</button> <button id="pvCorners" type="button" class="btn btn-sm btn-outline-secondary">เลือกมุมบัตร 4 จุด</button> <label class="small">ปรับเอียง (องศา) <input id="pvRotation" type="number" min="-15" max="15" step="0.1" value="0" style="width:70px"></label> <label class="small"><input id="pvEnhance" type="checkbox"> ปรับแสง</label> <button id="pvPreviewPrepared" type="button" class="btn btn-sm btn-outline-primary">ตรวจภาพก่อนส่ง (ไม่ใช้เครดิต)</button><div id="pvPreparedPanel" hidden><img id="pvPreparedImage" alt="ภาพที่เตรียมสำหรับส่ง OCR" style="max-width:100%;max-height:420px"><p id="pvPreparedQuality" class="small"></p></div> <button id="pvConfirmCrop" type="button" class="btn btn-sm btn-primary">ยืนยันกรอบและส่ง OCR</button><p class="small mb-0 mt-2">ส่งอ่านเฉพาะหน้าที่เลือกหนึ่งครั้ง การอ่านใหม่อาจใช้เครดิตเพิ่มเติม</p></div>
        <div id="pvNotice" class="small mb-2" role="status" aria-live="polite">ยังไม่ได้ตรวจสอบ</div>
        <div class="table-responsive"><table class="pv-table"><thead><tr><th>รายการตรวจสอบ</th><th>ข้อมูลในระบบ</th><th>AI อ่านจากบัตร</th><th>ผลเปรียบเทียบ</th><th>การตัดสินใจ กกท.</th></tr></thead><tbody id="pvRows"></tbody></table></div>
        <div class="pv-team-note"><h6><i class="bi bi-pencil-square me-2"></i>หมายเหตุถึงทีม <small class="fw-normal">(ระบบจัดทำให้จากการตัดสินใจของเจ้าหน้าที่ สามารถแก้ไขได้)</small></h6><textarea id="pvTeamNote" class="form-control" rows="3" maxlength="4000" aria-label="หมายเหตุถึงทีม"></textarea></div>
        <div class="pv-help fw-semibold mt-2"><i class="bi bi-info-circle me-2"></i>หมายเหตุ: AI เป็นเพียงเครื่องมือช่วยตรวจสอบข้อมูลเบื้องต้นเท่านั้น<br>การอนุมัติหรือไม่อนุมัติขึ้นอยู่กับการพิจารณาของ กกท. จังหวัด</div>
      </div></div>
    </div></div>
    <div class="modal-footer"><button id="pvDelete" type="button" class="btn btn-outline-danger me-auto"><i class="bi bi-trash me-2"></i>ลบข้อมูลนักกีฬาท่านนี้</button><button type="button" class="btn btn-outline-secondary px-4" data-bs-dismiss="modal">ปิด</button><button id="btnSaveAdminRemark" type="button" class="btn btn-primary px-4"><i class="bi bi-floppy me-2"></i>บันทึกข้อมูล</button></div>
  </div></div></div>
  <script>${playerVerificationScript()}</script>`;
}
function playerVerificationScript() {
    return String.raw `(()=>{
    const el=id=>document.getElementById(id), fields=[['fullName','ชื่อ / นามสกุล'],['idCard','เลขบัตรประชาชน'],['birthDate','วันเดือนปีเกิด'],['expiryDate','วันหมดอายุบัตร']];
    const personalName=value=>String(value||'').normalize('NFC').trim().replace(new RegExp(${JSON.stringify(playerOcr_name_1.NAME_TITLE_PATTERN_SOURCE)}),'').trim();
    let player=null,job=null,epoch=0,timer=null,controller=null,decisions={},decisionSources={},decisionTouched={},currentRows=[],managedReasons=[],appliedReview=false,noteEdited=false,internalNoteEdited=false,statusTouched=false,statusEdited=false,resetPending=false,retryConfirmed=false,progressValue=0,documentInfo=null,selection={page:1},selectionConfirmed=false,prepImage=null,dragStart=null,previewEpoch=0,quadMode=false,quadPoints=[],cardPreviewUrl=null,previewUrls=new Map(),previewRequests=new Map(),verificationContext={canEdit:true,allowDelete:true,onSaved:null,onDeleted:null,readOnlyMessage:''};
    const runLabel=el('pvRun').innerHTML;
    const statusText={MATCH:'✓ ตรงกัน',MISMATCH:'✕ ไม่ตรงกัน',UNCLEAR:'⚠ อ่านไม่ชัด',NO_REFERENCE:'ไม่มีข้อมูลอ้างอิง',NOT_APPLICABLE:'ไม่เกี่ยวข้อง',EXPIRED_CARD:'บัตรหมดอายุ'};
    const api=()=>window.baseUrl+'/api/admin/players/'+encodeURIComponent(player.id)+'/verification';
    const withDemo=u=>window.isDemoMode===true?u+(u.includes('?')?'&':'?')+'demo=true':u;
    async function call(method,url,body){const payload=body!==undefined&&window.isDemoMode===true?{...body,demo:true}:body;const r=await fetch(withDemo(url),{method,headers:method==='GET'?{}:{'Content-Type':'application/json','X-Requested-With':'PlayerVerification'},body:payload===undefined?undefined:JSON.stringify(payload),signal:controller?.signal});if(r.redirected||!r.headers.get('content-type')?.includes('application/json'))throw Error('Session หมดอายุ กรุณาเข้าสู่ระบบใหม่');const d=await r.json();if(!r.ok||!d.success)throw Error(d.message||'ไม่สามารถดำเนินการได้');return d}
    function stop(){epoch++;previewEpoch++;hideProgress();clearTimeout(timer);el('pvRun').innerHTML=runLabel;controller?.abort();controller=new AbortController()}
    function hideProgress(){el('pvProgressPopup').hidden=true;el('pvProgressClose').hidden=true}
    function showProgress(value,stage){el('pvProgressClose').hidden=true;el('pvProgressMessage').textContent='AI กำลังทำการตรวจสอบเอกสาร โปรดรอสักครู่';if(el('pvProgressPopup').hidden)progressValue=0;progressValue=Math.max(progressValue,value);el('pvProgressPopup').hidden=false;el('pvProgressBar').style.width=progressValue+'%';el('pvProgressPercent').textContent=progressValue+'%';el('pvProgressTrack').setAttribute('aria-valuenow',String(progressValue));el('pvProgressStage').textContent=stage}
    function finishProgress(){showProgress(100,'กรุณาตรวจผลการอ่านข้อมูลในรายละเอียดนักกีฬา');el('pvProgressMessage').textContent='AI ตรวจสอบเอกสารเสร็จแล้ว';el('pvProgressClose').hidden=false;el('pvProgressClose').focus()}
    async function submitAI(token,force){showProgress(10,'กำลังส่งเอกสารตรวจสอบ');el('pvRun').disabled=true;const d=await call('POST',api(),{force,confirmPaidRetry:force,selection,selectionConfirmed,documentHash:documentInfo?.hash});if(token!==epoch)return;job=d.job;resetPending=false;retryConfirmed=false;await load(token)}
    function notice(text){el('pvNotice').textContent=text}
    function enableRetry(){el('pvRun').disabled=false;el('pvRun').innerHTML=runLabel}
    function displayValue(key,value){if(!value)return '—';if(value==='LIFETIME')return 'ตลอดชีพ';const text=String(value);if(key==='idCard'&&/^\d{13}$/.test(text))return text[0]+'-'+text.slice(1,5)+'-'+text.slice(5,10)+'-'+text.slice(10,12)+'-'+text[12];if((key==='birthDate'||key==='expiryDate')&&/^\d{4}-\d{2}-\d{2}$/.test(text)){const date=new Date(text+'T00:00:00Z');if(!isNaN(date.getTime()))return date.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})}return text}
    const detailValue=value=>value===null||value===undefined||String(value).trim()===''?'-':String(value);
    function attachmentHref(value){if(typeof value!=='string'||!value.startsWith('/uploads/')||/[\\?#\u0000-\u001f]/.test(value))return '';try{const parts=decodeURIComponent(value).split('/');if(parts.some(p=>p==='.'||p==='..'||/[\\?#\u0000-\u001f]/.test(p)))return '';return window.baseUrl+parts.map(p=>encodeURIComponent(p)).join('/')}catch{return ''}}
    function clearCardPreview(){for(const url of previewUrls.values())URL.revokeObjectURL(url);previewUrls.clear();previewRequests.clear();cardPreviewUrl=null}
    async function requestDocumentPreview(url,token){
      if(previewUrls.has(url))return previewUrls.get(url);
      if(previewRequests.has(url))return previewRequests.get(url);
      const request=(async()=>{
        for(let attempt=0;attempt<3;attempt++){
          const response=await fetch(url,{signal:controller?.signal});
          if(token!==epoch)return '';
          const contentType=response.headers.get('content-type')||'';
          if(response.ok&&contentType.startsWith('image/')){
            const objectUrl=URL.createObjectURL(await response.blob());
            if(token!==epoch){URL.revokeObjectURL(objectUrl);return ''}
            previewUrls.set(url,objectUrl);
            return objectUrl;
          }
          let detail=null;
          if(contentType.includes('application/json')){
            try{detail=await response.json()}catch{throw Error('ไม่สามารถอ่านคำตอบจากระบบแสดงภาพเอกสารได้')}
          }
          if(response.status===429&&detail?.code==='OCR_PREPARATION_BUSY'&&attempt<2){
            const headerDelay=Number(response.headers.get('Retry-After'));
            const retryDelay=Number(detail.retryAfterSeconds??headerDelay);
            await new Promise(resolve=>setTimeout(resolve,Number.isFinite(retryDelay)?Math.min(5,Math.max(0,retryDelay))*1000:1000));
            if(token!==epoch)return '';
            continue;
          }
          const reference=typeof detail?.requestId==='string'&&/^[0-9a-f-]{36}$/i.test(detail.requestId)?' (รหัสอ้างอิง: '+detail.requestId+')':'';
          throw Error((detail?.message||'แสดงภาพตัวอย่างไม่ได้ กรุณาเปิดไฟล์จากรายการเอกสารประกอบ')+reference);
        }
        throw Error('กำลังเตรียมเอกสารอื่น กรุณาลองใหม่อีกครั้ง');
      })();
      previewRequests.set(url,request);
      try{return await request}
      finally{if(previewRequests.get(url)===request)previewRequests.delete(url)}
    }
    function populateDetails(p){
      const name=p.name||[p.prefix,p.firstName,p.middleName,p.lastName].filter(Boolean).join(' '),team=window.rawTeamsMap?.[p.teamId]||{};
      el('adminPlayerDetailModalLabel').textContent='รายละเอียดข้อมูลนักกีฬา — '+(team.teamName||p.school||'ไม่ระบุทีม');
      el('modalPlayerName').textContent=detailValue(name);
      const idCard=p.idCard||p.id_card;
      el('modalPlayerIdCard').textContent=detailValue(idCard?'เลขบัตร: '+idCard:'-');
      el('modalPlayerPos').textContent=detailValue(p.position);
      const values={pvGeneralName:name,pvGeneralIdCard:p.idCard,pvGeneralBirthDate:p.birthDate?displayValue('birthDate',p.birthDate):'-',modalPlayerSchool:team.teamName||p.school,modalPlayerCat:p.category||p.categories,pvTeamJerseyNo:p.jerseyNo,pvTeamJerseyName:p.jerseyName,pvTeamPosition:p.position,modalPlayerGrade:p.grade,modalPlayerGuardian:p.guardianName?(p.guardianName+(p.guardianRelation?' ('+p.guardianRelation+')':'')):(p.guardianRelation?'- ('+p.guardianRelation+')':'-'),modalPlayerPhone:p.phone,modalPlayerHW:(p.height?detailValue(p.height)+' ซม.':'-')+' / '+(p.weight?detailValue(p.weight)+' กก.':'-')};
      for(const [id,value]of Object.entries(values))el(id).textContent=detailValue(value);
      const docs=el('modalPlayerDocsList'),row=document.createElement('div'),label=document.createElement('span'),href=attachmentHref(p.docIdCard||p.doc_id_card);docs.replaceChildren();row.className='d-flex align-items-center justify-content-between gap-2 p-2 rounded border';label.textContent='สำเนาบัตรประชาชน / สูติบัตร';row.appendChild(label);
      if(href){const link=document.createElement('a');link.href=href;link.target='_blank';link.rel='noopener noreferrer';link.className='btn btn-sm btn-outline-info';link.textContent='เปิดดูเอกสาร';row.appendChild(link)}else{const status=document.createElement('span');status.textContent=p.docIdCard||p.doc_id_card?'ไม่สามารถเปิดเอกสารนี้ได้':'ยังไม่แนบ';status.className='small text-muted';row.appendChild(status)}docs.appendChild(row);
    }
    async function loadCardDocument(token){
      const image=el('pvCardDocumentImage'),link=el('pvCardDocumentLink'),status=el('pvCardDocumentStatus');link.hidden=true;link.removeAttribute('href');image.onload=null;image.onerror=null;image.removeAttribute('src');status.hidden=false;
      clearCardPreview();
      if(!(player.docIdCard||player.doc_id_card)){status.textContent='ยังไม่มีเอกสารแนบ';return}
      status.textContent='กำลังโหลดภาพเอกสาร…';
      try{const d=await call('GET',api()+'/document-info');if(token!==epoch)return;documentInfo=d.document;const url=await requestDocumentPreview(withDemo(api()+'/document-preview?page=1&hash='+encodeURIComponent(d.document.hash)),token);if(!url||token!==epoch)return;cardPreviewUrl=url;image.onload=()=>{if(token!==epoch)return;link.hidden=false;status.hidden=true};image.onerror=()=>{if(token!==epoch)return;clearCardPreview();link.hidden=true;status.hidden=false;status.textContent='แสดงภาพตัวอย่างไม่ได้ กรุณาเปิดไฟล์จากรายการเอกสารประกอบ'};link.href=url;image.src=url;}
      catch(e){if(token===epoch&&e.name!=='AbortError'){status.textContent=e.message||'แสดงภาพตัวอย่างไม่ได้ กรุณาเปิดเอกสารต้นฉบับ'}}
    }
    function fieldNotice(key,row){if(key==='fullName'&&row?.status==='MISMATCH')return 'AI อ่านได้ “'+(row.observedValue||'')+'” ไม่ตรงกับข้อมูลในระบบ ช่วยตรวจด้วยสายตาเพื่อพิจารณาอนุมัติ';if(row?.status!=='UNCLEAR')return '';if(key==='fullName'&&row.validation==='MISSING')return 'ไม่พบชื่อภาษาไทย กรุณาตรวจต้นฉบับ';if(key==='birthDate'&&(row.validation==='MISSING'||row.validation==='INVALID'&&/[A-Za-z]/.test(row.observedValue||'')))return 'ไม่พบ วันเดือนปีเกิด ภาษาไทย กรุณาตรวจต้นฉบับ';return ''}
    function comparisonLabel(key,row){if(!row)return 'ยังไม่ได้ตรวจ';if(key==='fullName'&&row.validation==='INVALID')return 'ต้องตรวจต้นฉบับ';const message=fieldNotice(key,row);if(message)return message;if(key==='expiryDate'&&row.status==='NO_REFERENCE'&&row.suggestedDecision==='SYSTEM_CORRECT')return row.observedValue==='LIFETIME'?'บัตรตลอดชีพ':'ยังไม่หมดอายุ';return statusText[row.status]||'ยังไม่ได้ตรวจ'}
    function renderRows(rows){currentRows=rows||[];el('pvRows').replaceChildren();for(const [key,label] of fields){const row=rows?.find(x=>x.field===key),tr=document.createElement('tr');const system=row?.systemValue||(key==='fullName'?player.name:key==='idCard'?player.idCard:key==='birthDate'?player.birthDate:'')||'—';
      let englishText='';if(key==='fullName'&&row?.englishName){const e=row.englishName;if(e.givenName||e.surname)englishText='\nอังกฤษ (ข้อมูลประกอบ): '+(e.givenName||'[ไม่พบชื่อ]')+' '+(e.surname||'[ไม่พบนามสกุล]');else if(e.labelsFound)englishText='\nอังกฤษ: ไม่พบค่าชื่อและนามสกุล'}
      const detail=Array.isArray(row?.details)&&row.details.length?row.details.join('\n'):row?label+': '+(row.reason||comparisonLabel(key,row)):'ยังไม่ได้ตรวจ';
      [label,key==='fullName'?personalName(system):displayValue(key,system),key==='birthDate'&&fieldNotice(key,row)&&/[A-Za-z]/.test(row.observedValue||'')?fieldNotice(key,row):(key==='fullName'?personalName(row?.observedValue)||'—':displayValue(key,row?.observedValue))+englishText,detail].forEach((text,i)=>{const td=document.createElement('td');td.textContent=text;if(i===3||key==='fullName'&&i===2)td.style.whiteSpace='pre-line';td.dataset.status=row?.status||'';if(i===2)td.className='pv-observed';if(i===3)td.className='pv-status';tr.appendChild(td)});
      const td=document.createElement('td');for(const [value,text] of [['SYSTEM_CORRECT','ข้อมูลในระบบถูกต้อง'],['CORRECT_DATA','ข้อมูลไม่ถูกต้อง — ให้ทีมแก้ไข'],['REUPLOAD','เอกสารอ่านไม่ชัด — ให้อัปโหลดใหม่'],...(key==='expiryDate'?[['EXPIRED_CARD','บัตรหมดอายุ']]:[])]){const labelEl=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name='pv-'+key;input.value=value;input.className='form-check-input me-1';input.checked=decisions[key]===value;input.disabled=verificationContext.canEdit===false;input.addEventListener('change',()=>{if(verificationContext.canEdit===false)return;decisions[key]=value;decisionTouched[key]=true;decisionSources[key]='STAFF_EDITED';updateStatus();suggestNote()});labelEl.append(input,document.createTextNode(text));td.appendChild(labelEl)}tr.appendChild(td);el('pvRows').appendChild(tr)}}
    function updateStatus(){if(statusEdited)return;const complete=fields.every(([key])=>decisions[key]);el('modalDocStatusSelect').value=currentRows.some(r=>r.requiresManualDecision&&!decisions[r.field])?'ACTION_REQUIRED':complete?(fields.some(([key])=>decisions[key]!=='SYSTEM_CORRECT')?'ACTION_REQUIRED':'APPROVED'):'PENDING'}
    function restoreReviewStatus(review){if(statusEdited||!review)return;if(review.docStatus){el('modalDocStatusSelect').value=['PENDING','APPROVED','ACTION_REQUIRED','CORRECTED'].includes(player.docStatus)?player.docStatus:review.docStatus;statusEdited=review.statusSource==='MANUAL'}else updateStatus()}
    el('modalDocStatusSelect').addEventListener('change',()=>{statusEdited=true;statusTouched=true});
    function decisionReason(key,label){const row=currentRows.find(r=>r.field===key),choice=decisions[key];
      if(choice==='EXPIRED_CARD')return row?.expired&&row.decisionReason?row.decisionReason:'บัตรประชาชนหมดอายุ กรุณาแนบบัตรใหม่ที่ยังไม่หมดอายุ';
      if(choice==='CORRECT_DATA')return 'กรุณาตรวจสอบและแก้ไข'+label+'ให้ตรงกับเอกสาร';
      if(choice==='REUPLOAD')return 'กรุณาอัปโหลดเอกสารใหม่เพื่อให้ตรวจสอบ'+label+'ได้ชัดเจน';return ''}
    function suggestNote(){const required=fields.map(([key,label])=>decisionReason(key,label)).filter(Boolean).map(text=>'• '+text);
      const custom=el('pvTeamNote').value.split('\n').filter(line=>!managedReasons.includes(line)).join('\n').trim();
      const lines=custom?custom.split('\n'):[];for(const reason of required)if(!lines.some(line=>line===reason||line===reason.slice(2)))lines.push(reason);
      el('pvTeamNote').value=lines.join('\n');managedReasons=required;
    }
    function applyReviewRows(rows,review){rows=rows||[];let expiryUpgrade=false;
      if(!appliedReview){if(!noteEdited)el('pvTeamNote').value=review?.teamNote??player.remarks??'';if(!internalNoteEdited)el('modalPlayerRemarks').value=review?.internalNote||'';restoreReviewStatus(review)}
      for(const [key]of fields){if(decisionTouched[key])continue;const row=rows.find(r=>r.field===key),saved=review?.decisions?.[key];
        if(key==='expiryDate'&&row?.expired){expiryUpgrade=saved!==undefined&&saved!=='EXPIRED_CARD';decisions[key]='EXPIRED_CARD';decisionSources[key]=saved==='EXPIRED_CARD'?'SAVED_REVIEW':'AI_PREFILL'}
        else if(['SYSTEM_CORRECT','CORRECT_DATA','REUPLOAD',...(key==='expiryDate'?['EXPIRED_CARD']:[])].includes(saved)){decisions[key]=saved;decisionSources[key]='SAVED_REVIEW'}
        else if(row?.requiresManualDecision){delete decisions[key];delete decisionSources[key]}
        else if(['SYSTEM_CORRECT','CORRECT_DATA','REUPLOAD'].includes(row?.suggestedDecision)){decisions[key]=row.suggestedDecision;decisionSources[key]='AI_PREFILL'}
      }
      if(expiryUpgrade&&!statusTouched)statusEdited=false;
      renderRows(rows);updateStatus();suggestNote();appliedReview=true;
    }
    function preparationOptions(){const rotation=Number(el('pvRotation').value)||0;return {...(rotation?{rotation}:{}),...(el('pvEnhance').checked?{enhance:true}:{})}}
    function invalidatePrepared(){selectionConfirmed=false;el('pvPreparedPanel').hidden=true}
    function cropInputs(){const c=selection.crop||{x:0,y:0,width:1,height:1};for(const [id,key] of [['pvCropX','x'],['pvCropY','y'],['pvCropW','width'],['pvCropH','height']])el(id).value=String(Math.round(c[key]*1000)/10)}
    function drawCrop(){if(!prepImage)return;const canvas=el('pvCropCanvas'),ctx=canvas.getContext('2d');ctx.drawImage(prepImage,0,0,canvas.width,canvas.height);if(selection.crop){const c=selection.crop;ctx.strokeStyle='#0860ed';ctx.lineWidth=3;ctx.strokeRect(c.x*canvas.width,c.y*canvas.height,c.width*canvas.width,c.height*canvas.height)}if(selection.corners){ctx.strokeStyle='#0860ed';ctx.lineWidth=3;ctx.beginPath();selection.corners.forEach((p,i)=>{if(i)ctx.lineTo(p.x*canvas.width,p.y*canvas.height);else ctx.moveTo(p.x*canvas.width,p.y*canvas.height)});ctx.closePath();ctx.stroke()}if(quadMode){ctx.fillStyle='#0860ed';quadPoints.forEach((p,i)=>ctx.fillText(String(i+1),p.x*canvas.width,p.y*canvas.height));el('pvConfirmCrop').disabled=quadPoints.length!==4}cropInputs()}
    async function previewPage(token){const previewToken=++previewEpoch;el('pvConfirmCrop').disabled=true;const page=Number(el('pvDocumentPage').value)||1,image=new Image(),url=api()+'/document-preview?page='+page+'&hash='+encodeURIComponent(documentInfo.hash),previewUrl=await requestDocumentPreview(url,token);if(!previewUrl||token!==epoch||previewToken!==previewEpoch)return;await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('เปิดภาพเอกสารไม่ได้ กรุณาเปิดรายละเอียดใหม่'));image.src=previewUrl});if(token!==epoch||previewToken!==previewEpoch)return;prepImage=image;selection={page};quadMode=false;quadPoints=[];el('pvRotation').value='0';el('pvEnhance').checked=false;invalidatePrepared();const canvas=el('pvCropCanvas'),scale=Math.min(1,1800/image.naturalWidth);canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);drawCrop();el('pvConfirmCrop').disabled=false}
    async function showPreparation(token){hideProgress();if(!documentInfo){const d=await call('GET',api()+'/document-info');if(token!==epoch)return;documentInfo=d.document}el('pvPreparation').hidden=false;el('pvRun').disabled=true;const select=el('pvDocumentPage');select.replaceChildren();for(let n=1;n<=documentInfo.pages;n++){const option=document.createElement('option');option.value=String(n);option.textContent='หน้า '+n;select.appendChild(option)}select.value=String(selection.page||1);notice('เลือกหน้าบัตรและยืนยันกรอบก่อนเรียก OCR');await previewPage(token)}
    el('pvDocumentPage').addEventListener('change',()=>previewPage(epoch).catch(e=>notice(e.message)));
    el('pvCropReset').addEventListener('click',()=>{selection={page:selection.page,...preparationOptions()};quadMode=false;quadPoints=[];invalidatePrepared();el('pvConfirmCrop').disabled=false;drawCrop()});
    for(const id of ['pvCropX','pvCropY','pvCropW','pvCropH'])el(id).addEventListener('input',()=>{const values=['pvCropX','pvCropY','pvCropW','pvCropH'].map(id=>Number(el(id).value)/100);if(values.every(Number.isFinite)&&values[0]>=0&&values[1]>=0&&values[2]>0&&values[3]>0&&values[0]+values[2]<=1&&values[1]+values[3]<=1){selection={page:selection.page,crop:{x:values[0],y:values[1],width:values[2],height:values[3]},...preparationOptions()};quadMode=false;quadPoints=[];invalidatePrepared();drawCrop()}});
    function pointer(e){const c=el('pvCropCanvas'),r=c.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}}
    el('pvCropCanvas').addEventListener('pointerdown',e=>{if(!prepImage)return;invalidatePrepared();if(quadMode){if(quadPoints.length===4)quadPoints=[];quadPoints.push(pointer(e));selection={page:selection.page,...preparationOptions(),...(quadPoints.length===4?{corners:quadPoints.slice()}: {})};drawCrop();return}dragStart=pointer(e);el('pvCropCanvas').setPointerCapture?.(e.pointerId)});
    el('pvCropCanvas').addEventListener('pointermove',e=>{if(!dragStart)return;const p=pointer(e);selection={page:selection.page,crop:{x:Math.min(p.x,dragStart.x),y:Math.min(p.y,dragStart.y),width:Math.abs(p.x-dragStart.x),height:Math.abs(p.y-dragStart.y)},...preparationOptions()};invalidatePrepared();drawCrop()});
    el('pvCropCanvas').addEventListener('pointerup',()=>{if(selection.crop&&(selection.crop.width<.01||selection.crop.height<.01))selection={page:selection.page};dragStart=null;drawCrop()});
    el('pvCorners').addEventListener('click',()=>{quadMode=!quadMode;quadPoints=[];selection={page:selection.page,...preparationOptions()};invalidatePrepared();el('pvConfirmCrop').disabled=quadMode;notice(quadMode?'คลิกมุมบัตรตามลำดับ ซ้ายบน ขวาบน ขวาล่าง ซ้ายล่าง':'ลากกรอบสี่เหลี่ยมเพื่อเลือกหน้าบัตร');drawCrop()});
    for(const id of ['pvRotation','pvEnhance'])el(id).addEventListener('change',()=>{delete selection.rotation;delete selection.enhance;Object.assign(selection,preparationOptions());invalidatePrepared()});
    el('pvPreviewPrepared').addEventListener('click',async()=>{if(!player||quadMode&&quadPoints.length!==4)return;const token=epoch,chosen=JSON.stringify(selection);el('pvPreviewPrepared').disabled=true;try{const d=await call('POST',api()+'/preparation-preview',{selection,documentHash:documentInfo.hash});if(token!==epoch||chosen!==JSON.stringify(selection))return;el('pvPreparedImage').src=d.image;el('pvPreparedQuality').textContent=d.quality.width+' × '+d.quality.height+' px · '+(d.quality.warnings.join(' · ')||'กรุณาตรวจว่าข้อมูลทั้งสี่ช่องชัดเจน')+' · ตัวชี้วัดภาพไม่ใช่ความมั่นใจ OCR หากแสงบังตัวอักษรควรขอภาพใหม่';el('pvPreparedPanel').hidden=false}catch(e){if(token===epoch)notice(e.message)}finally{if(token===epoch)el('pvPreviewPrepared').disabled=false}});
    el('pvConfirmCrop').addEventListener('click',async()=>{if(!player||el('pvConfirmCrop').disabled)return;const token=epoch;selectionConfirmed=true;el('pvPreparation').hidden=true;try{if(resetPending&&!retryConfirmed){const answer=await Swal.fire({icon:'question',title:'ยืนยันอ่าน OCR ใหม่',text:'การอ่านใหม่จะใช้เครดิตเพิ่มเติม',showCancelButton:true,target:el('adminPlayerDetailModal')});if(!answer.isConfirmed||token!==epoch)return;retryConfirmed=true}await submitAI(token,resetPending||retryConfirmed)}catch(e){if(token===epoch&&e.name!=='AbortError'){hideProgress();notice(e.message);enableRetry()}}});
    async function load(token,autoStart=false){try{const d=await call('GET',api());if(token!==epoch)return;job=d.job;if(d.document){documentInfo=d.document;}if(d.preparation){selection=d.preparation;selectionConfirmed=d.preparationConfirmed===true}
      if(!job){if(d.reset){resetPending=true;decisions={};decisionSources={};decisionTouched={};managedReasons=[];appliedReview=false;renderRows(null);hideProgress();el('pvCheckedAt').textContent='ล้างผลตรวจ AI แล้ว';el('modalPlayerRemarks').value=d.internalNote||'';el('pvRun').disabled=false;notice('รอตรวจสอบ — ล้างผล AI รอบก่อนแล้ว กดยืนยันอ่านใหม่เมื่อต้องการตรวจอีกครั้ง');return}if(d.parserChanged){hideProgress();el("pvRun").disabled=false;notice("ตัวแยกข้อมูลปรับปรุงแล้ว กรุณายืนยันอ่านใหม่ หรือพิจารณาต้นฉบับก่อน ไม่เรียกซ้ำอัตโนมัติ");return}if(d.requiresPreparation){hideProgress();await showPreparation(token);return}if(autoStart){await submitAI(token,false);return}hideProgress();el('pvRun').disabled=false;notice(d.stale?'ข้อมูลหรือเอกสารเปลี่ยนแปลง กรุณาตรวจ AI อีกครั้ง':d.interrupted?'งานตรวจก่อนหน้าถูกขัดจังหวะ กรุณาตรวจอีกครั้ง':'ยังไม่ได้ตรวจด้วย AI');return}
      if(job.state==='SUCCEEDED'){notice((job.result.documentNotice||'')+(job.result.quality?.warnings?.length?' · ข้อสังเกตระดับภาพ: '+job.result.quality.warnings.join(' · '):''));el('pvCheckedAt').textContent='ตรวจสอบล่าสุด: '+new Date(job.checkedAt).toLocaleString('th-TH');applyReviewRows(job.result.rows,job.review);enableRetry();finishProgress()}
      else if(job.state==='QUEUED'||job.state==='RUNNING'){showProgress(job.state==='QUEUED'?25:60,job.state==='QUEUED'?'รอคิวตรวจเอกสาร':'กำลังอ่านข้อมูลจากเอกสาร');notice(job.state==='QUEUED'?'รอคิวตรวจเอกสาร…':'กำลังอ่านข้อมูลจากเอกสาร…');el('pvRun').disabled=true;timer=setTimeout(()=>load(token),2000)}
      else{hideProgress();notice(job.errorMessage||(job.errorCode==='MANUAL_REVIEW'?'บันทึกการตรวจสอบโดยเจ้าหน้าที่แล้ว':'AI ไม่พร้อมประเมิน กรุณาตรวจด้วยตนเองหรือลองใหม่'));if(job.review){applyReviewRows([],job.review)}enableRetry()}
    }catch(e){if(token===epoch&&e.name!=='AbortError'){hideProgress();notice(e.message);enableRetry()}}}
    const defaultPlayerPhoto='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22146%22%20height%3D%22228%22%20viewBox%3D%220%200%20146%20228%22%3E%3Crect%20width%3D%22146%22%20height%3D%22228%22%20fill%3D%22%23e5eff9%22%2F%3E%3Ccircle%20cx%3D%2273%22%20cy%3D%2277%22%20r%3D%2228%22%20fill%3D%22%2393abc5%22%2F%3E%3Cpath%20d%3D%22M20%20200v-27a53%2053%200%200%201%20106%200v27%22%20fill%3D%22%2393abc5%22%2F%3E%3C/svg%3E';
    el('modalPlayerPhoto').onerror=function(){this.onerror=null;this.src=defaultPlayerPhoto};
    window.initializePlayerVerification=function(p,options={}){stop();verificationContext={canEdit:options.canEdit!==false,allowDelete:options.allowDelete!==false,onSaved:typeof options.onSaved==='function'?options.onSaved:null,onDeleted:typeof options.onDeleted==='function'?options.onDeleted:null,readOnlyMessage:String(options.readOnlyMessage||'')};player=p;job=null;decisions={};decisionSources={};decisionTouched={};currentRows=[];managedReasons=[];appliedReview=false;statusTouched=false;internalNoteEdited=false;noteEdited=false;resetPending=false;retryConfirmed=false;el('pvReadOnlyNotice').textContent=verificationContext.readOnlyMessage;el('pvReadOnlyNotice').hidden=!verificationContext.readOnlyMessage;el('modalPlayerRemarks').value='';el('pvTeamNote').value=p.remarks||'';statusEdited=false;el('modalDocStatusSelect').value=['PENDING','APPROVED','ACTION_REQUIRED','CORRECTED'].includes(p.docStatus)?p.docStatus:'PENDING';el('modalDocStatusSelect').disabled=verificationContext.canEdit===false;el('pvTeamNote').disabled=verificationContext.canEdit===false;el('modalPlayerRemarks').disabled=verificationContext.canEdit===false;el('btnSaveAdminRemark').disabled=verificationContext.canEdit===false;el('pvDelete').disabled=verificationContext.allowDelete===false;el('pvDelete').hidden=verificationContext.allowDelete===false;documentInfo=null;selection={page:1};selectionConfirmed=false;prepImage=null;quadMode=false;quadPoints=[];el('pvRotation').value='0';el('pvEnhance').checked=false;el('pvPreparedPanel').hidden=true;el('pvPreparation').hidden=true;el('pvRun').disabled=false;el('pvCheckedAt').textContent='ยังไม่ได้ตรวจสอบ';populateDetails(p);const photo=el('modalPlayerPhoto');photo.onerror=function(){this.onerror=null;this.src=defaultPlayerPhoto};photo.src=p.photoUrl||p.photo_url||defaultPlayerPhoto;void loadCardDocument(epoch);renderRows(null);notice('กำลังโหลดผลตรวจ…');showProgress(5,'กำลังเตรียมข้อมูล');load(epoch,true)};
    el('pvRun').addEventListener('click',async()=>{if(!player||el('pvRun').disabled)return;const dialogEpoch=epoch;const answer=await Swal.fire({icon:'question',title:'ยืนยันอ่าน OCR ใหม่',text:'การอ่านใหม่จะใช้เครดิตเพิ่มเติม แม้เอกสารยังเหมือนเดิม',showCancelButton:true,confirmButtonText:'ยืนยันอ่านใหม่',cancelButtonText:'ยกเลิก',target:el('adminPlayerDetailModal')});if(!answer.isConfirmed||dialogEpoch!==epoch||!player)return;stop();retryConfirmed=true;const token=epoch;try{if(documentInfo?.requiresPreparation&&!selectionConfirmed){await showPreparation(token);return}notice('กำลังส่งงานตรวจ…');await submitAI(token,true)}catch(e){if(token===epoch&&e.name!=='AbortError'){hideProgress();notice(e.message);enableRetry()}}});
    el('pvProgressClose').addEventListener('click',()=>{if(progressValue===100){hideProgress();el('pvRun').focus()}});
    el('pvTeamNote').addEventListener('input',()=>noteEdited=true);
    el('modalPlayerRemarks').addEventListener('input',()=>internalNoteEdited=true);
    el('btnSaveAdminRemark').addEventListener('click',async()=>{
      const token=epoch,btn=el('btnSaveAdminRemark');
      if(btn.disabled||!player||verificationContext.canEdit===false)return;
      btn.disabled=true;
      try{
        const missing=fields.filter(([key])=>!decisions[key]).map(([,label])=>label);
        if(missing.length&&el('modalDocStatusSelect').value!=='PENDING')throw Error('กรุณาเลือกการตัดสินใจ กกท. ให้ครบทุกหัวข้อ: '+missing.join(', '));
        if(el('modalDocStatusSelect').value!=='PENDING'||!statusEdited)updateStatus();
        const d=await call('POST',api()+'/review',{jobId:el('modalDocStatusSelect').value==='PENDING'?null:job?.state==='SUCCEEDED'?job.id:null,decisions,decisionSources,teamNote:el('pvTeamNote').value,remarks:el('modalPlayerRemarks').value,docStatus:el('modalDocStatusSelect').value});
        if(token!==epoch)return;
        player.docStatus=d.docStatus;
        player.remarks=d.teamNote;
        if(d.reset){stop();job=null;decisions={};decisionSources={};decisionTouched={};managedReasons=[];appliedReview=false;resetPending=true;renderRows(null);el('pvCheckedAt').textContent='ล้างผลตรวจ AI แล้ว';}
        bootstrap.Modal.getInstance(el('adminPlayerDetailModal'))?.hide();
        if(typeof renderPlayersTable==='function')renderPlayersTable();
        if(verificationContext.onSaved)await verificationContext.onSaved(player,d);
        await Swal.fire({icon:'success',title:'บันทึกข้อมูลสำเร็จ',text:d.reset?'ล้างผล AI รอบเดิมและตั้งสถานะรอตรวจสอบแล้ว':'บันทึกสถานะและผลการตรวจสอบนักกีฬาเรียบร้อยแล้ว',confirmButtonText:'ตกลง',returnFocus:false});
      }catch(e){
        if(token===epoch&&e.name!=='AbortError')await Swal.fire({icon:'error',title:'บันทึกไม่สำเร็จ',text:e.message,confirmButtonText:'ตกลง',target:el('adminPlayerDetailModal')});
      }finally{btn.disabled=false}
    });
    el('pvDelete').addEventListener('click',async()=>{if(!player||verificationContext.allowDelete===false||!confirm('ยืนยันลบข้อมูลนักกีฬา '+(player.name||'')+'? การดำเนินการนี้ไม่สามารถย้อนกลับได้'))return;const id=player.id,token=epoch;el('pvDelete').disabled=true;try{await call('POST',api()+'/delete',{confirmPlayerId:String(id)});if(token!==epoch)return;if(Array.isArray(window.rawPlayersData))window.rawPlayersData=window.rawPlayersData.filter(p=>String(p.id)!==String(id));bootstrap.Modal.getInstance(el('adminPlayerDetailModal'))?.hide();if(typeof renderPlayersTable==='function')renderPlayersTable();if(verificationContext.onDeleted)await verificationContext.onDeleted(player)}catch(e){if(e.name!=='AbortError')alert(e.message)}finally{el('pvDelete').disabled=false}});
    el('adminPlayerDetailModal').addEventListener('hidden.bs.modal',()=>{stop();clearCardPreview();player=null;prepImage=null;el('pvCropCanvas').width=0;el('pvCropCanvas').height=0;el('pvPreparation').hidden=true});
  })();`;
}
