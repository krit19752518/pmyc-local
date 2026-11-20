jest.mock('../src/db',()=>({pool:{query:jest.fn().mockResolvedValue({rows:[]})}}));
import { parseIappText } from '../src/services/playerOcr.parser';
import { compareVerification, verificationSnapshot } from '../src/services/playerVerification.service';
import { documentNotice } from '../src/services/playerVerification.details';
import { reusableOcrAnalysis } from '../src/services/playerOcr.types';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { pool } from '../src/db';
beforeEach(() => (pool.query as jest.Mock).mockResolvedValue({ rows: [] }));

const card=(name='นาย ทดสอบ พิทักษ์',id='1234567890121',birth='15 มี.ค. 2551',expiry='14 มี.ค. 2571')=>
  `Thai National ID Card\nIdentification Number ${id}\nชื่อตัวและชื่อสกุล ${name}\nName Mr Example\nLast name Fixture\nเกิดวันที่ ${birth}\nวันหมดอายุ ${expiry}`;
const player={name:'เด็กชาย ทดสอบ พิทักษ์',id_card:'1234567890121',birth_date:'2008-03-15'};
const rows=(text:string)=>compareVerification(player,parseIappText(text),'2026-11-10');

it('identifies the surname mark difference while keeping the matching given name separate',()=>{
 const row=rows(card('ด.ป ทดสอบ พิทักษ'))[0];
 expect(row.nameComparison).toMatchObject({givenName:'MATCH',surname:'MISMATCH'});
 expect(row.details[0]).toContain('ชื่อ: ตรงกัน');expect(row.details[1]).toContain('ต่างกันที่เครื่องหมาย “์”');
 expect(row.reason).not.toContain('คำนำหน้า');expect(row.suggestedDecision).toBe('CORRECT_DATA');
});
it('reports a different given name without calling the matching surname wrong',()=>{
 const row=rows(card('นาย อีกชื่อ พิทักษ์'))[0];
 expect(row.nameComparison).toMatchObject({givenName:'MISMATCH',surname:'MATCH'});
 expect(row.details[0]).toContain('AI อ่าน “อีกชื่อ”');expect(row.details[1]).toContain('นามสกุล: ตรงกัน');
});
it('does not guess how a multi-token personal name splits into given and family names',()=>{
 const row=rows(card('นาย ทดสอบ ชื่อกลาง พิทักษ์'))[0];expect(row.details.join('\n')).toContain('ไม่เพียงพอสำหรับแยกชื่อและนามสกุล');
 expect(row.nameComparison).not.toHaveProperty('givenName');
});
it('retains an incomplete ID without inventing which digit is missing',()=>{
 const row=rows(card(undefined,'123456789012'))[1];expect(row.observedValue).toBe('123456789012');
 expect(row.reason).toContain('อ่านได้12หลัก');expect(row.reason).toContain('ไม่ได้ระบุว่าหลักใดขาด');
});
it('distinguishes a checksum failure from missing digits',()=>{
 const row=rows(card(undefined,'1234567890122'))[1];expect(row.reason).toContain('อ่านได้13หลัก แต่เลขตรวจสอบไม่ผ่าน');
});
it('identifies which retained date components differ',()=>{
 const row=rows(card(undefined,undefined,'16 เม.ย. 2552'))[2];
 expect(row.details).toHaveLength(3);expect(row.details[0]).toContain('วัน: AI อ่าน 16 / ข้อมูลระบบ 15');
 expect(row.details[1]).toContain('เดือน: AI อ่าน 04 / ข้อมูลระบบ 03');expect(row.details[2]).toContain('ปี: AI อ่าน 2009 / ข้อมูลระบบ 2008');
});
it.each([['15 มี.ค.','ไม่พบส่วนปี4หลัก'],['15/13/2551','ส่วนเดือนอ่านได้เป็น13'],['31 ก.พ. 2551','ส่วนวัน “31”']])('explains the retained invalid birth-date part: %s',(date,message)=>{
 const row=rows(card(undefined,undefined,date))[2];expect(row.status).toBe('UNCLEAR');expect(row.reason).toContain(message);
});
it('explains lifetime, missing expiry and expiry at the Thai yesterday cutoff independently',()=>{
 expect(rows(card(undefined,undefined,undefined,'ตลอดชีพ'))[3].reason).toContain('บัตรตลอดชีพ');
 expect(rows(card(undefined,undefined,undefined,''))[3].reason).toContain('ไม่พบวันหมดอายุบัตรในผล OCR');
 const expired=rows(card(undefined,undefined,undefined,'9 พ.ย. 2569'))[3];expect(expired.status).toBe('EXPIRED_CARD');expect(expired.reason).toContain('2026-11-09');
});
it('keeps a document-wide conflict above the field details without blaming all four fields',()=>{
 const a=parseIappText(card()+'\nIdentification Number 2345678901234');expect(documentNotice(a)).toContain('เลือกเฉพาะบัตร');
 for(const row of compareVerification(player,a)){expect(row.suggestedDecision).toBeNull();expect(row.reason).toContain('รอพิจารณาเอกสาร');expect(row.reason).not.toContain('อ่านไม่ชัด');}
});
it('reuses only complete V5/V6 field structures and retains the old model version',()=>{
 const a=parseIappText(card());a.modelVersion='iapp-plain-text-parser-v5';expect(reusableOcrAnalysis(a)).toBe(true);
 expect(reusableOcrAnalysis({...a,modelVersion:'iapp-plain-text-parser-v3'})).toBe(false);
 expect(reusableOcrAnalysis({...a,fields:{}})).toBe(false);compareVerification(player,a);expect(a.modelVersion).toBe('iapp-plain-text-parser-v5');
});
it('does not invent a faulty date component for an unconfirmed but parseable retained date',()=>{
 const a=parseIappText(card());a.fields.birthDate.validation='INVALID';
 const row=compareVerification(player,a)[2];expect(row.status).toBe('UNCLEAR');
 expect(row.reason).toContain('ยังไม่ยืนยันวันที่นี้');expect(row.reason).not.toContain('ส่วนวัน');
});
it('does not call low-confidence legacy values a match, mismatch or unexpired card',()=>{
 const a:any=parseIappText(card());a.provider='legacy';
 Object.values(a.fields).forEach((f:any)=>f.confidence=0.3);
 for(const row of compareVerification(player,a)){
  expect(row.status).toBe('UNCLEAR');expect(row.reason).toContain('ยังไม่ยืนยัน');
  expect(row.reason).not.toContain('บัตรยังไม่หมดอายุ');
 }
});
it('preserves the V5 document/player/reset source binding for compatible stored results',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'issue61-binding-'));const before=process.env.PLAYER_AI_ASSET_ROOT;process.env.PLAYER_AI_ASSET_ROOT=root;
 try{
  const bytes=await sharp({create:{width:320,height:200,channels:3,background:'#ffffff'}}).png().toBuffer();await fs.writeFile(path.join(root,'fixture.png'),bytes);
  const p={...player,id:'SYNTHETIC',team_id:'SYNTHETIC-TEAM',prefix:'เด็กชาย',first_name:'ทดสอบ',last_name:'พิทักษ์',doc_id_card:'/uploads/fixture.png'};
  const snapshot=await verificationSnapshot(p);const expected=createHash('sha256').update(JSON.stringify([p.id,p.team_id,p.name,p.prefix,p.first_name,undefined,p.last_name,p.id_card,p.birth_date,createHash('sha256').update(bytes).digest('hex'),{page:1},'iapp-plain-text-parser-v5'])).digest('hex');
  expect(snapshot.sourceHash).toBe(expected);
 }finally{if(before===undefined)delete process.env.PLAYER_AI_ASSET_ROOT;else process.env.PLAYER_AI_ASSET_ROOT=before;await fs.rm(root,{recursive:true,force:true});}
});
