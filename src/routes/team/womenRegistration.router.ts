import {Router,Request,Response,NextFunction} from 'express';
import multer from 'multer';
import {randomBytes,randomUUID,timingSafeEqual} from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {pool} from '../../db';
import {renderTeamLayout} from '../../teamLayout';
import {renderAdminLayout} from '../../adminLayout';
import {parseCookies,getBaseUrl} from '../../utils/helpers';
import {buildTeamSessionCookies,requireSignedTeamSession,verifyTeamSessionCookies} from '../../services/teamSession.service';
import * as women from '../../services/womenRegistration.service';
import {renderWomenPage,renderWomenRegister,renderWomenPublicLayout} from '../../views/womenPortal';
import {escapeTeamPortal as e} from '../../views/teamPortal';

export const womenRegistrationRouter=Router();
const r=womenRegistrationRouter;
const memoryUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:4*1024*1024,files:4,fields:50,fieldSize:2000}}).any();
const wrap=(f:(q:Request,s:Response)=>Promise<unknown>)=>(q:Request,s:Response,n:NextFunction)=>{void f(q,s).catch(err=>{if(s.headersSent)return n(err);s.status(err instanceof women.WomenError?err.status:503).json({success:false,error:err instanceof women.WomenError?err.message:'ไม่สามารถบันทึกหรือโหลดข้อมูลได้ กรุณาลองใหม่'});});};
function csrf(req:Request,res:Response){const old=parseCookies(req).women_csrf;const token=typeof old==='string'&&/^[a-f0-9]{64}$/.test(old)?old:randomBytes(32).toString('hex');res.append('Set-Cookie',`women_csrf=${token}; Path=/; HttpOnly; SameSite=Lax${req.secure||req.headers['x-forwarded-proto']==='https'?'; Secure':''}`);res.setHeader('Cache-Control','no-store');return token;}
function checkCsrf(req:Request){const cookie=parseCookies(req).women_csrf,token=req.body?.csrf;if(typeof cookie!=='string'||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(cookie)||!/^[a-f0-9]{64}$/.test(token)||!timingSafeEqual(Buffer.from(cookie),Buffer.from(token)))throw new women.WomenError(403,'กรุณาโหลดหน้าใหม่ก่อนบันทึก');const origin=req.get('origin');if(origin&&new URL(origin).host!==req.get('host'))throw new women.WomenError(403,'แหล่งที่มาของคำขอไม่ถูกต้อง');}
const season=(req:Request)=>women.validSeason(req.body?.season||req.query.season||women.WOMEN_SEASON);
const team=(req:Request)=>String((req as any).teamSession.teamId);
const actor=(req:Request)=>String((req as any).teamSession.teamUser);
const script='<script src="/assets/team-portal/women.js?v=issue101-1" defer></script>';
function layout(req:Request,title:string,content:string,profile?:any){return renderTeamLayout(title,content+script,'women',getBaseUrl(req),profile);}
const success=(res:Response,seasonKey:string,tab='overview')=>res.json({success:true,redirectUrl:`/team/women.php?season=${encodeURIComponent(seasonKey)}&tab=${tab}`});
async function available(){if(!await women.womenReady())throw new women.WomenError(503,'ระบบสมัครหญิงยังไม่ได้ติดตั้งข้อมูล กรุณาติดต่อผู้ดูแล');}

r.get('/team/women-entry.php',wrap(async(req,res)=>{
 const s=season(req);await available();await women.categoryConfig(s);const signed=verifyTeamSessionCookies(parseCookies(req));
 if(signed&&signed.teamId!=='default')return res.redirect(`/team/women.php?season=${s}`);
 const token=csrf(req,res);return res.send(renderWomenPublicLayout('เข้าสู่ระบบสมัครทีมหญิง',`<div class="registration-layout"><aside class="registration-aside"><h2>ใช้บัญชีเดิม<br>เพิ่มรุ่น18 (หญิง)</h2><p>ทีมที่สมัครชายแล้วไม่ต้องสร้างบัญชีใหม่ เข้าสู่ระบบและยืนยันเพิ่มรุ่นหญิงในขั้นตอนถัดไป</p></aside><section class="panel"><div class="panel-head"><h1>เข้าสู่ระบบสมัครทีมหญิง</h1></div><form class="panel-body" action="/api/team/login" method="post"><input type="hidden" name="women_season" value="${e(s)}"><input type="hidden" name="women_csrf" value="${token}"><div class="form-grid"><label class="field">อีเมลหรือชื่อผู้ใช้<input name="username" autocomplete="username" required></label><label class="field">รหัสผ่าน<input name="password" type="password" autocomplete="current-password" required></label></div><div class="form-actions"><button class="btn primary">เข้าสู่ระบบ</button><a class="btn" href="/team/women-register.php?season=${s}">ยังไม่มีบัญชี? ลงทะเบียนทีมใหม่</a></div><a href="/team/reset-password.php">ลืมรหัสผ่าน</a></form></section></div>`,s));
}));
r.get('/team/women-register.php',wrap(async(req,res)=>{await available();const s=season(req);await women.categoryConfig(s);res.send(renderWomenPublicLayout('ข้อมูลทีมใหม่',renderWomenRegister(csrf(req,res),s,getBaseUrl(req)),s));}));
r.post('/api/team/women/register',memoryUpload,wrap(async(req,res)=>{
 checkCsrf(req);await available();const s=season(req),result=await withFiles(req,input=>women.registerWomenTeam(input,s)) as Awaited<ReturnType<typeof women.registerWomenTeam>>;res.setHeader('Set-Cookie',buildTeamSessionCookies(req,result.teamId,result.username));res.json({success:true,enrolled:result.enrolled,redirectUrl:`/team/women.php?season=${s}&registered=${result.enrolled?'enrolled':'account'}`});
}));
r.get('/team/women.php',requireSignedTeamSession,wrap(async(req,res)=>{
 await available();const s=season(req),d=await women.loadWomen(team(req),s);d.availableOfficials=(await pool.query('SELECT id,name FROM football_official WHERE team_id=$1 ORDER BY name',[team(req)])).rows;
 const tab=String(req.query.tab||'overview');if(!['overview','players','officials','review','documents'].includes(tab))throw new women.WomenError(400,'เมนูไม่ถูกต้อง');
 const notice=req.query.registered?`<div class="notice">${req.query.registered==='enrolled'?'ลงทะเบียนทีมและสมัครรุ่น18 (หญิง) สำเร็จแล้ว ขั้นต่อไปจัดรายชื่อและยืนยันส่ง':'ลงทะเบียนบัญชีทีมสำเร็จ ยังไม่ได้สมัครรุ่นหญิง คุณสามารถยืนยันสมัครได้ด้านล่าง'}</div>`:'';
 res.send(layout(req,'จัดการรุ่น18 (หญิง)',notice+renderWomenPage(d,csrf(req,res),tab,String(req.query.edit||'')),{school:d.team.team_name,isDemo:d.team.is_test,womenSeason:s}));
}));
r.post('/api/team/women/enroll',requireSignedTeamSession,memoryUpload,wrap(async(req,res)=>{checkCsrf(req);await available();const s=season(req);await women.enrollWomen(team(req),s,actor(req));success(res,s);}));
const uploadRoot=()=>process.env.NODE_ENV==='test'?path.join(os.tmpdir(),`football-women-test-${process.pid}`):path.resolve(__dirname,'../../../uploads');
async function files(req:Request):Promise<{fields:Record<string,string>,created:string[]}>{
 const uploaded=(req.files||[]) as Express.Multer.File[],fields:Record<string,string>={},created:string[]=[];
 const allowed=new Set(req.path.endsWith('/register')?['doc_team_cert']:req.path.endsWith('/official')?['doc_id_card']:['photo','doc_id_card','doc_school_cert','doc_parent_consent']);
 for(const f of uploaded){
  const jpeg=f.buffer[0]===255&&f.buffer[1]===216&&f.buffer[2]===255,png=f.buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),pdf=f.buffer.subarray(0,5).toString()==='%PDF-';
  if(!allowed.has(f.fieldname)||fields[f.fieldname]||!(jpeg||png||pdf)||(f.fieldname==='photo'&&!jpeg&&!png))throw new women.WomenError(400,'ไฟล์ต้องเป็น JPG/PNG หรือ PDF ที่ถูกต้อง และไม่เกิน 4 MB');
  fields[f.fieldname]=f.originalname;
 }
 try{for(const f of uploaded){const ext=f.buffer.subarray(0,5).toString()==='%PDF-'?'.pdf':f.buffer[0]===255?'.jpg':'.png';const name='women-'+randomUUID()+ext;await fs.mkdir(uploadRoot(),{recursive:true});const target=path.join(uploadRoot(),name);await fs.writeFile(target,f.buffer,{flag:'wx',mode:0o600});created.push(target);fields[f.fieldname==='photo'?'photo_url':f.fieldname]='/uploads/'+name;}return {fields,created};}
 catch(err){await Promise.all(created.map(x=>fs.unlink(x)));throw err;}
}
async function withFiles(req:Request,save:(values:any)=>Promise<unknown>){const saved=await files(req);try{const values={...req.body};for(const k of ['photo_url','doc_id_card','doc_school_cert','doc_parent_consent','doc_team_cert'])delete values[k];return await save({...values,...saved.fields});}catch(err){await Promise.all(saved.created.map(x=>fs.unlink(x)));throw err;}}
r.post('/api/team/women/player',requireSignedTeamSession,memoryUpload,wrap(async(req,res)=>{checkCsrf(req);await available();const s=season(req);await withFiles(req,input=>women.saveWomenPlayer(team(req),s,actor(req),input));success(res,s,'players');}));
r.post('/api/team/women/official',requireSignedTeamSession,memoryUpload,wrap(async(req,res)=>{checkCsrf(req);await available();const s=season(req);await withFiles(req,input=>women.saveWomenOfficial(team(req),s,actor(req),input));success(res,s,'officials');}));
r.post('/api/team/women/details',requireSignedTeamSession,memoryUpload,wrap(async(req,res)=>{checkCsrf(req);await available();const s=season(req);await women.saveWomenDetails(team(req),s,actor(req),req.body);success(res,s,'documents');}));
r.post('/api/team/women/command',requireSignedTeamSession,memoryUpload,wrap(async(req,res)=>{checkCsrf(req);await available();const s=season(req);await women.womenCommand(team(req),s,actor(req),req.body);success(res,s);}));

function adminScope(req:Request):women.WomenAdminScope{const u=(req as any).adminUser;if(!u||!['SUPER_ADMIN','DOCUMENT_VERIFIER','SAT_OFFICER'].includes(u.roleCode))throw new women.WomenError(403,'ไม่มีสิทธิ์ตรวจรับสมัครหญิง');const isDemo=(req.query.mode||req.body?.mode)==='demo';if(isDemo&&u.roleCode!=='SUPER_ADMIN')throw new women.WomenError(403,'ไม่มีสิทธิ์ข้อมูล Demo');return {role:u.roleCode,province:u.province,isDemo,actor:String(u.id||u.username)};}
r.get('/admin/women.php',wrap(async(req,res)=>{
 const scope=adminScope(req);await available();const s=season(req),id=String(req.query.teamId||''),token=csrf(req,res);let content='';
 const hidden=(k:string,v:unknown)=>`<input type="hidden" name="${k}" value="${e(v)}">`;
 if(!id){const rows=(await pool.query("SELECT t.id,t.team_name,t.province,e.submitted_at,e.withdrawn_at FROM football_category_enrollment e JOIN football_registered_team t ON t.id=e.team_id WHERE e.season_key=$1 AND e.division_code=$2 AND t.is_test=$3 AND NOT COALESCE(t.is_deleted,false) AND ($4::text IS NULL OR t.province=$4) ORDER BY e.registered_at,e.id",[s,women.WOMEN_DIVISION,scope.isDemo,scope.role==='SAT_OFFICER'?scope.province:null])).rows;content=`<h1>ตรวจรับสมัครหญิง U18</h1><p>รอบแรกระดับจังหวัด · ${e(s)}</p><table class="table"><thead><tr><th>ทีม</th><th>จังหวัด</th><th>สถานะ</th><th>ตรวจ</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${e(x.team_name)}</td><td>${e(x.province)}</td><td>${x.withdrawn_at?'ถอนตัว':x.submitted_at?'ส่งแล้ว':'ยังไม่ส่ง'}</td><td><a href="/admin/women.php?teamId=${e(x.id)}&season=${s}${scope.isDemo?'&mode=demo':''}">เปิดตรวจ</a></td></tr>`).join('')}</tbody></table>`;}
 else{const d=await women.loadWomen(id,s);if(d.team.is_test!==scope.isDemo||(scope.role==='SAT_OFFICER'&&(!scope.province||scope.province!==d.team.province)))throw new women.WomenError(403,'ไม่มีสิทธิ์ทีมนอกขอบเขต');if(!d.enrollment)throw new women.WomenError(404,'ยังไม่สมัครหญิง');
  const form=(action:string,body:string)=>`<form action="/api/admin/women/review" method="post" data-women-form>${hidden('csrf',token)}${hidden('season',s)}${hidden('team_id',id)}${hidden('mode',scope.isDemo?'demo':'real')}${hidden('version',d.enrollment.version)}${hidden('action',action)}${body}<label class="form-label">หมายเหตุ (อย่างน้อย5ตัว)<input class="form-control" name="reason" required minlength="5" maxlength="500"></label><button class="btn btn-primary mt-2">บันทึก ${e(action)}</button></form>`;
  content=`<h1>${e(d.team.team_name)} · U18 หญิง</h1><p>${e(d.team.province)} · นักกีฬาอนุมัติ ${d.players.filter((p:any)=>p.review_status==='APPROVED').length}/18 คน · ทีม ${e(d.team.status)} · ${women.womenEligible(d)?'พร้อมเข้าสู่การแข่งขัน':'ยังไม่ผ่านเกณฑ์ทั้งหมด'}</p><a href="/admin/women.php?season=${s}">กลับรายการ</a><div class="row g-3"><div class="col-lg-8">${d.players.map((p:any)=>`<section class="card my-3"><div class="card-body"><h2 class="h5">#${e(p.roster_jersey)} ${e(p.name)} · ${e(p.position)}</h2><p>สถานะ ${e(p.review_status)} · ${e(p.review_remarks)}</p><div class="d-flex gap-3">${[['photo_url','รูป'],['doc_id_card','สำเนาบัตร'],['doc_school_cert','รับรองสถานศึกษา'],['doc_parent_consent','ยินยอมผู้ปกครอง']].map(([k,l])=>p[k]?`<a target="_blank" rel="noopener" href="${e(p[k])}">${l}</a>`:'').join('')}</div>${form('review-player',hidden('id',p.id)+'<select class="form-select" name="status">'+['PENDING','APPROVED','ACTION_REQUIRED','REJECTED'].map(st=>`<option ${st===p.review_status?'selected':''}>${st}</option>`).join('')+'</select>')}</div></section>`).join('')}</div><div class="col-lg-4"><div class="card my-3"><div class="card-body"><h2 class="h5">การรับรองทีม</h2>${d.team.doc_team_cert?`<a href="${e(d.team.doc_team_cert)}" target="_blank" rel="noopener">หนังสือรับรองทีม</a>`:'ยังไม่มีหนังสือรับรองทีม'}${form('approve-team','<p>อนุมัติข้อมูลทีมร่วม ไม่ได้อนุมัตินักกีฬาหรือรุ่นชายเพิ่ม</p>')}</div></div><div class="card my-3"><div class="card-body">${form('reopen','<p>เปิดแก้เฉพาะรุ่นหญิง กลับเป็นยังไม่ส่งรายชื่อ</p>')}${d.enrollment.withdrawn_at?form('restore','<p>กู้คืนการสมัครหญิง รักษาสถานะส่ง/ผลตรวจเดิมตาม process รุ่นเดิม</p>'):''}</div></div></div></div>`;
 }
 if(!id&&scope.role==='SUPER_ADMIN'){
  const exists=await pool.query("SELECT to_regclass('p2_season') IS NOT NULL AS ready");
  if(exists.rows[0]?.ready){const cfg=await women.categoryConfig(s);const options=(await pool.query('SELECT id,label FROM p2_season ORDER BY label DESC')).rows;content+=`<section class="card"><div class="card-body"><h2 class="h5">เชื่อมฤดูกาลรับสมัครหญิงกับระบบแข่งขัน</h2><p>ผูก ${e(s)} กับฤดูกาลที่สร้างใน platform ก่อนแสดงทีมเข้าการแข่งขัน ห้ามย้ายฤดูกาลที่ผูกแล้วโดยไม่มีการตรวจผลกระทบ</p><form action="/api/admin/women/bind-season" method="post" data-women-form>${hidden('csrf',token)}${hidden('season',s)}<select name="p2_season_id" class="form-select" required><option value="">เลือกฤดูกาลแข่งขัน</option>${options.map((o:any)=>`<option value="${e(o.id)}" ${o.id===cfg.p2_season_id?'selected':''}>${e(o.label)}</option>`).join('')}</select><input class="form-control" name="reason" minlength="5" required placeholder="หมายเหตุการเชื่อมฤดูกาล"><button class="btn btn-primary">บันทึกการเชื่อมฤดูกาล</button></form></div></section>`;}
 }
 res.send(renderAdminLayout('ตรวจรับสมัครหญิง',content+script,'teams',getBaseUrl(req),(req as any).adminUser));
}));
r.post('/api/admin/women/bind-season',memoryUpload,wrap(async(req,res)=>{checkCsrf(req);const scope=adminScope(req);await available();const s=season(req);await women.bindWomenSeason(s,scope,req.body.p2_season_id,req.body.reason);res.json({success:true,redirectUrl:`/admin/women.php?season=${s}`});}));
r.post('/api/admin/women/review',memoryUpload,wrap(async(req,res)=>{checkCsrf(req);const scope=adminScope(req);await available();const s=season(req),id=String(req.body.team_id||'');await women.reviewWomen(id,s,scope,req.body);res.json({success:true,redirectUrl:`${req.originalUrl.startsWith('/sat-admin/')?'/sat-admin':'/admin'}/women.php?teamId=${encodeURIComponent(id)}&season=${s}${scope.isDemo?'&mode=demo':''}`});}));

r.get('/team/women-export',requireSignedTeamSession,wrap(async(req,res)=>{
 await available();const d=await women.loadWomen(team(req),season(req));if(!d.enrollment)throw new women.WomenError(404,'ยังไม่สมัครรุ่นหญิง');const format=req.query.format;if(!['xlsx','pdf'].includes(String(format)))throw new women.WomenError(400,'รูปแบบเอกสารไม่ถูกต้อง');
 res.setHeader('Cache-Control','no-store');const title=`${d.team.team_name} · U18 หญิง · ${d.config.season_key}`;
 if(format==='xlsx'){const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('U18 หญิง');sheet.addRow([title]);sheet.addRow(['เบอร์','ชื่อ','ตำแหน่ง','สถานะเอกสาร']);for(const p of d.players)sheet.addRow([p.roster_jersey,p.name,p.position,p.review_status]);sheet.columns.forEach(c=>c.width=25);res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition','attachment; filename="women-u18.xlsx"');await book.xlsx.write(res);res.end();}
 else{const font=path.resolve(__dirname,'../../../phase2/public/assets/fonts/Prompt-Regular-2a736dbb.ttf');await fs.access(font);res.type('application/pdf');res.setHeader('Content-Disposition','attachment; filename="women-u18.pdf"');const doc=new PDFDocument({size:'A4',margin:40});doc.pipe(res);doc.font(font).fontSize(15).text(title);doc.fontSize(11);for(const p of d.players)doc.text(`${p.roster_jersey}   ${p.name}   ${p.position}   ${p.review_status}`);doc.end();}
}));

// Scoped multipart errors must be understandable to the real AJAX forms.
r.use((err:any,req:Request,res:Response,next:NextFunction)=>{if(!req.path.includes('women'))return next(err);if(res.headersSent)return next(err);return res.status(400).json({success:false,error:err?.code==='LIMIT_FILE_SIZE'?'ไฟล์ต้องไม่เกิน 4 MB':'รูปแบบหรือจำนวนไฟล์ไม่ถูกต้อง'});});
