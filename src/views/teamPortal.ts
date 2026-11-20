import { getCategoryStatus, MIN_APPROVED_CATEGORY_PLAYERS } from '../utils/statusHelper';

export const PORTAL_MALE_CATEGORIES = ['U14','U16','U18'] as const;
type Category = typeof PORTAL_MALE_CATEGORIES[number];
export interface PortalTeam {
  school?: string; managerName?: string; status?: string; reject_reason?: string;
  categories?: string[] | string; submitted_categories?: string; submittedCategories?: string;
  cancelled_categories?: string; cancelledCategories?: string; province?: string;
  docTeamCert?: string; doc_team_cert?: string;
}
export interface PortalPerson {
  id?: string; category?: string; categories?: string | string[]; position?: string;
  idCard?: string; docStatus?: string; remarks?: string; jerseyNo?: string | number;
  docIdCard?: string; doc_id_card?: string;
}
export interface TeamPortalOverviewInput {
  profile: PortalTeam; players: PortalPerson[]; officials: PortalPerson[];
  categoryStates: Partial<Record<Category,string>>; registrationRanks: Record<string,Record<string,number>>;
  teamId: string; district: string; registrationDate: string; missingParts: string[];
  base: string; minGoalkeepers: number;
  women?: {season:string;enrolled:boolean;submitted:boolean;withdrawn:boolean;eligible:boolean;players:number;goalkeepers:number;officials:number};
}
export const escapeTeamPortal = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const portalCategories = (value: unknown): string[] => (Array.isArray(value)?value:String(value||'').split(',')).map(v=>String(v).trim().toUpperCase()).filter(Boolean);
const e=escapeTeamPortal;
const portalPaths:Record<string,string>={home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',team:'<path d="M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7z"/><path d="m8 12 3 3 5-6"/>',players:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 5c2 1 3 3 3 6"/>',officials:'<rect x="4" y="5" width="16" height="17" rx="2"/><path d="M9 5V2h6v3"/><circle cx="12" cy="11" r="2"/><path d="M8 18a4 4 0 0 1 8 0"/>',check:'<path d="m5 12 4 4L19 6"/>',clipboard:'<rect x="4" y="4" width="16" height="18" rx="2"/><path d="M9 2h6v5H9zM8 13l2 2 6-6m-8 9h8"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3h.01"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',back:'<path d="M20 12H4m6-6-6 6 6 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',lock:'<rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v3"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9m6 12h.01"/>',edit:'<path d="m14 4 6 6M4 20l2-7L17 2l5 5L11 18z"/>',trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',exit:'<path d="M9 4H3v16h6m6-14 6 6-6 6m-9-6h15"/>',shield:'<path d="M12 2 3 6v7c0 5 9 9 9 9s9-4 9-9V6z"/><path d="m8 12 3 3 5-6"/>',file:'<path d="M5 2h9l5 5v15H5zM14 2v6h5M9 12h6m-6 4h6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>'};
export function renderTeamPortalIcon(name:string):string {const aliases:Record<string,string>={house:"home",people:"players","person-badge":"officials","clipboard-check":"clipboard","question-circle":"help",pencil:"edit","arrow-right":"arrow"};return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${portalPaths[aliases[name]||name]||portalPaths.info}</svg>`;}
const icon=renderTeamPortalIcon;
const label=(cat:string)=>`รุ่น${cat.slice(1)} (ชาย)`;
const url=(base:string,path:string,cat?:string)=>`${base}${path}${cat?'?category='+encodeURIComponent(cat):''}`;
const badge=(text:string,tone='blue')=>`<span class="badge ${tone}">${e(text)}</span>`;
const link=(href:string,text:string,cls='btn')=>`<a class="${cls}" href="${e(href)}">${text}</a>`;
const belongs=(person:PortalPerson,cat:Category)=>portalCategories(person.category||person.categories||'U14').includes(cat);
const storedDocument=(value:unknown)=>!!String(value||'').trim()&&!['null','undefined','none','n/a','na','-','#','placeholder','placeholder.pdf','/uploads/'].includes(String(value).trim().toLowerCase());
export function buildTeamPortalRows(input: TeamPortalOverviewInput){
  const registered=portalCategories(input.profile.categories),submitted=portalCategories(input.profile.submitted_categories||input.profile.submittedCategories);
  return PORTAL_MALE_CATEGORIES.map(cat=>{
    const players=input.players.filter(p=>belongs(p,cat)),officials=input.officials.filter(p=>belongs(p,cat));
    const state=input.categoryStates[cat] || (registered.includes(cat)?'ACTIVE':'NOT_REGISTERED');
    const managers=officials.filter(o=>String(o.position||'').trim()==='ผู้จัดการทีม');
    const jerseys=players.map(p=>p.jerseyNo).filter(Boolean);
    const goalkeepers=players.filter(p=>String(p.position||'').trim()==='ผู้รักษาประตู (GK)').length;
    // Display the existing seven checks; submission authority remains on the existing server endpoint.
    const ready=players.length>=18&&players.length<=30&&officials.length>=1&&officials.length<=8
      &&players.length>0&&players.every(p=>String(p.idCard||'').trim().length>=13)
      &&managers.every(o=>!!String(o.idCard||'').trim()&&(storedDocument(o.docIdCard)||storedDocument(o.doc_id_card)))
      &&new Set(jerseys).size===jerseys.length&&goalkeepers>=input.minGoalkeepers;
    const approved=players.filter(p=>p.docStatus==='APPROVED').length;
    const categoryReview=getCategoryStatus({...input.profile,status:input.profile.status||'PENDING',categories:registered.join(',')},cat,players.map(p=>({id:String(p.id||''),category:p.category||portalCategories(p.categories).join(','),docStatus:p.docStatus,remarks:p.remarks}))).text;
    return {cat,state,players:players.length,officials:officials.length,goalkeepers,ready,approved,submitted:submitted.includes(cat),categoryReview,
      certified:state==='ACTIVE'&&submitted.includes(cat)&&input.profile.status==='APPROVED'&&approved>=MIN_APPROVED_CATEGORY_PLAYERS,
      rank:input.registrationRanks[input.teamId]?.[cat]||0};
  });
}

export function renderTeamPortalOverview(input: TeamPortalOverviewInput):string {
  const p=input.profile,base=input.base,rows=buildTeamPortalRows(input);
  const teamStatus=p.status==='APPROVED'?badge('ทีมผ่านการรับรอง','green'):p.status==='REJECTED'?badge('ทีมไม่ผ่านการรับรอง','red'):badge('ทีมรอการตรวจสอบ','amber');
  const certificate=(p.docTeamCert||p.doc_team_cert)?'':`<div class="notice warning"><div><strong>ยังไม่ได้แนบหนังสือรับรองทีม</strong><p>สามารถแนบภายหลังลงทะเบียนได้ แต่เอกสารนี้จำเป็นสำหรับ กกท.จังหวัดในการพิจารณาอนุมัติทีม</p></div>${link(url(base,'/team/team.php'),'แนบหนังสือรับรองทีม','btn smallbtn')}</div>`;
  const rowHtml=rows.map(r=>{
    const live=r.state==='ACTIVE',cancelled=r.state==='CANCELLED',missing=r.state==='NOT_REGISTERED';
    let stateHtml=missing?badge('ยังไม่ได้สมัคร','gray'):cancelled?badge('ถอนตัวแล้ว','red'):!live?badge(r.state==='INCONSISTENT'?'ข้อมูลสถานะรุ่นไม่สอดคล้อง':'ไม่สามารถใช้งานข้อมูลทีมได้','amber'):r.certified?badge('รับรองแล้ว','green'):r.submitted?badge(r.categoryReview==='ปรับแก้ข้อมูลนักกีฬา'?'ต้องแก้ไขข้อมูลนักกีฬา':'ส่งรายชื่อ / รอรับรอง','blue'):badge(r.ready?'พร้อมยืนยันรายชื่อ':'ยังไม่ส่งรายชื่อ',r.ready?'green':'amber');
    if(live&&r.submitted&&r.categoryReview==='ปรับแก้ข้อมูลนักกีฬา')stateHtml+=`<button type="button" class="btn smallbtn" onclick="openPlayerCorrections('${r.cat}')">ดูรายการที่ต้องแก้ไข</button>`;
    if(live&&r.submitted)stateHtml+=`<small class="muted d-block">นักกีฬาอนุมัติ ${r.approved} คน · เกณฑ์ ${MIN_APPROVED_CATEGORY_PLAYERS} คน</small>`;
    let actions=missing?`<button type="button" class="btn primary smallbtn" data-add-category="${r.cat}" onclick="openAddCategoryModal('${r.cat}')">${icon('plus')} เพิ่มรุ่น</button>`:!live?link(url(base,'/team/players.php',r.cat),'ดูข้อมูลเดิม','btn smallbtn'):link(url(base,r.submitted||r.ready?'/team/submit.php':'/team/players.php',r.cat),r.submitted?'ดูรายละเอียด':r.ready?'ตรวจและยืนยัน':'จัดรายชื่อ','btn smallbtn')+`<button type="button" class="btn danger smallbtn" onclick="openCancelCategoryModal('${r.cat}')">ถอนตัว</button>`;
    if(!live&&!missing&&!cancelled)actions='<span class="muted">กรุณาติดต่อเจ้าหน้าที่</span>';
    const count=(n:number,suffix:string)=>missing||r.state==='UNAVAILABLE'?'—':`${n} ${suffix}`;
    return `<tr data-category="${r.cat}"><td data-label="รุ่นการแข่งขัน"><strong>${label(r.cat)}</strong><div class="small muted">${missing?'ยังไม่ได้สมัคร':cancelled?'เก็บข้อมูลรายชื่อเดิมไว้':!live?'สถานะต้องตรวจสอบ':r.rank?'ลำดับที่ลงทะเบียน '+r.rank:!input.district?'ยังไม่ระบุอำเภอ':!p.province?'ยังไม่ระบุจังหวัด':'ยังจัดลำดับไม่ได้'}</div></td><td data-label="นักกีฬา"><span class="metric">${count(r.players,'คน')}</span><small class="muted d-block">18–30 คนต่อรุ่น</small></td><td data-label="ผู้รักษาประตู"><span class="metric">${count(r.goalkeepers,'คน')}</span><small class="muted d-block">อย่างน้อย ${input.minGoalkeepers} คน</small></td><td data-label="เจ้าหน้าที่"><span class="metric">${count(r.officials,'คน')}</span><small class="muted d-block">1–8 คนต่อรุ่น</small></td><td data-label="รายชื่อ / การรับรอง">${stateHtml}</td><td data-label="สิ่งที่ทำได้"><div class="actions">${actions}</div></td></tr>`;
  }).join('');
  const fw=input.women;
  const women=fw?`<tr class="women-row" data-category="U18F"><td data-label="รุ่นการแข่งขัน"><strong>รุ่น18 (หญิง)</strong>${badge('ระดับจังหวัด','pink')}</td><td data-label="นักกีฬา">${fw.players}</td><td data-label="ผู้รักษาประตู">${fw.goalkeepers}</td><td data-label="เจ้าหน้าที่">${fw.officials}</td><td data-label="รายชื่อ / การรับรอง">${badge(fw.withdrawn?'ถอนตัวแล้ว':fw.eligible?'รับรองแล้ว':fw.submitted?'ส่งแล้ว / รอรับรอง':fw.enrolled?'สมัครแล้ว':'ยังไม่ได้สมัคร','pink')}</td><td data-label="สิ่งที่ทำได้"><a class="btn primary smallbtn" href="${base}/team/women.php?season=${e(fw.season)}">${fw.enrolled?'จัดการรุ่นหญิง':'สมัครรุ่น18 (หญิง)'}</a></td></tr>`:`<tr class="women-row" data-future-category="U18F"><td data-label="รุ่นการแข่งขัน"><strong>รุ่น18 (หญิง)</strong>${badge('เตรียมรองรับ','pink')}</td><td data-label="นักกีฬา">—</td><td data-label="ผู้รักษาประตู">—</td><td data-label="เจ้าหน้าที่">—</td><td data-label="รายชื่อ / การรับรอง">${badge('ยังไม่เปิดใช้งาน','pink')}</td><td data-label="สิ่งที่ทำได้"><button class="btn smallbtn" type="button" disabled>เตรียมเปิดรุ่นหญิง</button></td></tr>`;
  const tasks=rows.filter(r=>r.state==='ACTIVE').map(r=>`<div class="task"><span class="task-icon">${icon(r.submitted?'clock':'people')}</span><div><strong>${label(r.cat)} · ${r.submitted?'ติดตามผลการรับรอง':r.ready?'ตรวจสอบและยืนยันรายชื่อ':'จัดรายชื่อให้ครบ'}</strong><p>${r.submitted?'หากต้องแก้หลังส่ง ติดต่อ กกท.จังหวัดหรือแอดมินให้เปิดเฉพาะรุ่น':`นักกีฬา ${r.players} คน · ผู้รักษาประตู ${r.goalkeepers} คน · เจ้าหน้าที่ ${r.officials} คน`}</p></div>${link(url(base,r.submitted?'/team/submit.php':r.ready?'/team/submit.php':'/team/players.php',r.cat),'เปิดดู','btn smallbtn')}</div>`).join('');
  return `${certificate}<div class="pagehead"><div><h1>ภาพรวมทีม</h1><p>ดูสถานะรายรุ่น และเลือกงานที่ต้องทำต่อได้จากหน้านี้</p></div>${link(url(base,'/team/guide.php'),icon('question-circle')+' ขั้นตอนการสมัคร','btn')}</div>
<section class="teamline"><div class="teammark">${icon('shield')}</div><div><h2>${e(p.school||'ทีมของคุณ')}</h2><div class="teammeta">จังหวัด<span data-team-province>${e(p.province||'—')}</span> · เขต/อำเภอ<span data-team-district>${e(input.district||'—')}</span> · ใช้ข้อมูลทีมร่วมกันทุกรุ่น</div></div><div class="spacer"></div>${teamStatus}${link(url(base,'/team/team.php'),icon('pencil')+' ตรวจข้อมูลทีม','btn smallbtn')}</section>
${p.status==='REJECTED'&&p.reject_reason?`<div class="notice error"><div><strong>ข้อเสนอแนะจากเจ้าหน้าที่</strong><p>${e(p.reject_reason)}</p></div></div>`:''}
<section class="panel hero"><div>${badge('เตรียมรองรับ','pink')}<h2>${fw?'สมัครและจัดการรุ่น18 (หญิง)':'เตรียมพร้อมสำหรับรุ่น18 (หญิง)'}</h2><p>พื้นที่จัดการรุ่นหญิงในบัญชีทีมเดิม<br>${fw?'จัดรายชื่อและส่งรับรองแยกจากรุ่นชาย แข่งขันรอบแรกระดับจังหวัด':'ข้อมูลรุ่นหญิงจะแสดงแยกจากรุ่นชายเมื่อระบบพร้อมเปิดใช้งาน'}</p></div><div>${fw?`<a class="btn" href="${base}/team/women.php?season=${e(fw.season)}">เข้าสู่ระบบสมัครทีมหญิง</a>`:'<button type="button" class="btn" disabled>รุ่น18 (หญิง) · เตรียมเปิด</button>'}<p class="small">${fw?'ใช้บัญชีเดิม สมัครหญิงโดยยืนยันในขั้นตอนถัดไป':'ยังไม่มีการสมัครรุ่นหญิงจากหน้านี้'}</p></div><div class="hero-icon">${icon('shield')}</div></section>
<ol class="steps" aria-label="ขั้นตอนต่อรุ่น"><li class="step"><span class="step-num">1</span><span>สมัครรุ่น</span></li><li class="step"><span class="step-num">2</span><span>เพิ่มนักกีฬา</span></li><li class="step"><span class="step-num">3</span><span>เลือกเจ้าหน้าที่</span></li><li class="step"><span class="step-num">4</span><span>ยืนยันรายชื่อ</span></li><li class="step"><span class="step-num">5</span><span>ติดตามการรับรอง</span></li></ol>
<section class="panel"><div class="panel-head"><div><h2>การสมัครและความพร้อมแต่ละรุ่น</h2><p>ตัวเลขทั้งหมดนับเฉพาะรุ่นนั้น · สมัครรุ่นแล้ว ยังต้องยืนยันรายชื่อและรอรับรอง</p></div>${badge('3 รุ่นชาย · เตรียมรุ่นหญิง','blue')}</div><table class="enrollment-table"><thead><tr><th>รุ่นการแข่งขัน</th><th>นักกีฬา</th><th>ผู้รักษาประตู</th><th>เจ้าหน้าที่</th><th>รายชื่อ / การรับรอง</th><th>สิ่งที่ทำได้</th></tr></thead><tbody>${rowHtml}${women}</tbody></table><div class="panel-foot"><span class="muted">เพิ่มรุ่นชายที่ยังไม่ได้สมัครได้ตามระบบปัจจุบัน</span>${link(url(base,'/team/officials.php'),'ดูเจ้าหน้าที่แยกตามรุ่น '+icon('arrow-right'))}</div></section>
<div class="grid-2"><section class="panel"><div class="panel-head"><h2>งานที่ควรทำต่อ</h2></div><div class="panel-body">${tasks||'<p class="muted">เลือกรุ่นที่ต้องการสมัครจากตารางด้านบน</p>'}</div></section><section class="panel"><div class="panel-head"><h2>ข้อมูลทีมและเอกสาร</h2></div><div class="panel-body"><dl class="portal-summary"><dt>ข้อมูลติดต่อ</dt><dd>${input.missingParts.length?e('ยังไม่ครบ: '+input.missingParts.join(', ')):'ครบถ้วน'}</dd><dt>วัน / เวลา ที่ลงสมัคร</dt><dd>${e(input.registrationDate)}</dd><dt>การรับรองทีม</dt><dd>${teamStatus}</dd></dl>${link(url(base,'/team/documents.php'),icon('download')+' เอกสารดาวน์โหลด','btn')}</div></section></div>`;
}

export function renderTeamPortalDocuments(profile:PortalTeam,base:string,selected:string):string {
  const categories=portalCategories(profile.categories).filter(c=>PORTAL_MALE_CATEGORIES.includes(c as Category));
  const cat=categories.includes(selected)?selected:categories[0]||'';
  return `<div class="pagehead"><div><h1>เอกสารดาวน์โหลด</h1><p>ใช้เอกสารจากระบบเดิมและตรวจข้อมูลรายรุ่นก่อนส่ง</p></div></div><section class="panel"><div class="panel-head"><h2>เลือกรุ่นการแข่งขัน</h2></div><div class="panel-body"><div class="actions">${categories.map(c=>link(url(base,'/team/documents.php',c),label(c),'btn '+(cat===c?'primary':''))).join('')}<button class="btn" disabled>รุ่น18 (หญิง) · เตรียมเปิด</button></div></div></section><section class="panel"><div class="panel-head"><h2>แบบฟอร์มและเอกสาร</h2></div><div class="panel-body portal-document-list"><article><div><h3>ใบรายชื่อนักกีฬา · Excel ตัวอย่าง</h3><p>แบบฟอร์มเปล่าสำหรับเตรียมข้อมูล</p></div>${link(url(base,'/api/team/download-sample-excel'),'ดาวน์โหลด Excel','btn')}</article><article><div><h3>ใบรายชื่อนักกีฬา · PDF ตัวอย่าง</h3><p>เอกสารตัวอย่างจากระบบรับสมัครเดิม</p></div>${link(url(base,'/api/team/download-sample-pdf'),'ดาวน์โหลด PDF','btn')}</article><article><div><h3>เอกสารประจำรุ่น${cat?' · '+label(cat):''}</h3><p>ตรวจสอบข้อมูลและใช้บริการพิมพ์เอกสารเดิม</p></div>${cat?link(url(base,'/team/submit.php',cat),'ตรวจสอบและพิมพ์เอกสาร','btn primary'):'<button class="btn" disabled>เลือกรุ่นที่สมัครแล้วก่อน</button>'}</article></div></section>`;
}
export function renderTeamPortalGuide(base:string):string {
  return `<div class="pagehead"><div><h1>ขั้นตอนและคำแนะนำ</h1><p>สมัครรุ่น ส่งรายชื่อ และการรับรองเป็นคนละขั้นตอน</p></div></div><section class="panel"><div class="panel-body"><ol class="portal-guide"><li><h2>ตรวจข้อมูลทีม</h2><p>ตรวจจังหวัด อำเภอ ข้อมูลติดต่อ และหนังสือรับรองทีม ซึ่งสามารถแนบภายหลังได้ แต่ต้องมีเพื่อประกอบการอนุมัติทีม</p>${link(url(base,'/team/team.php'),'ตรวจข้อมูลทีม','btn')}</li><li><h2>จัดนักกีฬาและเจ้าหน้าที่แยกตามรุ่น</h2><p>นักกีฬา 18–30 คน ผู้รักษาประตูอย่างน้อย 3 คน และเจ้าหน้าที่ 1–8 คนต่อรุ่น ตรวจหมายเลขเสื้อและเอกสารให้ครบ</p>${link(url(base,'/team/players.php'),'จัดรายชื่อนักกีฬา','btn')}</li><li><h2>ตรวจสอบและยืนยันรายชื่อ</h2><p>ตรวจเงื่อนไขทั้ง 7 ข้อก่อนยืนยัน หลังส่งจะล็อกการเพิ่มหรือลบนักกีฬาในรุ่นนั้น</p>${link(url(base,'/team/submit.php'),'ตรวจสอบและยืนยัน','btn primary')}</li><li><h2>ติดตามการรับรอง</h2><p>ทีมและรุ่นต้องผ่านการรับรองแยกกัน รุ่นต้องมีนักกีฬาอนุมัติอย่างน้อย ${MIN_APPROVED_CATEGORY_PLAYERS} คน หากต้องแก้รายชื่อหลังส่ง ติดต่อ กกท.จังหวัดหรือแอดมินให้เปลี่ยนเฉพาะรุ่นกลับเป็นยังไม่ส่งรายชื่อ</p></li><li><h2>ถอนตัวและขอกลับเข้าร่วม</h2><p>ถอนตัวเฉพาะรุ่นจากหน้าภาพรวม ข้อมูลรุ่นอื่นยังคงเดิม หากต้องการกลับเข้าร่วม ติดต่อ กกท.จังหวัดหรือแอดมินให้กู้คืน</p></li></ol></div></section>`;
}
