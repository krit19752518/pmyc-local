jest.mock('../src/db',()=>({pool:{}}));
import {parseIappText} from '../src/services/playerOcr.parser';
import {compareVerification} from '../src/services/playerVerification.service';
import {withoutNameTitle} from '../src/services/playerOcr.name';

const card=(name='ด.ช. ทดสอบ ตัวอย่าง',english='Name Master Example\nLast name Fixture')=>`Thai National ID Card
Identification Number 1234567890121
ชื่อตัวและชื่อสกุล ${name}
${english}
เกิดวันที่ 15 มี.ค. 2551
Date of Birth 15 Mar. 2008
ที่อยู่ ตัวอย่าง
วันหมดอายุ 14 มี.ค. 2571`;
const player={name:'เด็กชาย ทดสอบ ตัวอย่าง',id_card:'1234567890121',birth_date:'2008-03-15'};
it.each(['ด.ช.','เด็กชาย','นาย','นางสาว','ด.ป',''])('compares names independently of a differing, missing or misread title: %s',title=>{
 const analysis=parseIappText(card(title+' ทดสอบ ตัวอย่าง'));
 expect(analysis.fields.fullName).toMatchObject({value:'ทดสอบ ตัวอย่าง',validation:'VALID'});
 const row=compareVerification(player,analysis)[0];
 expect(row).toMatchObject({systemValue:'ทดสอบ ตัวอย่าง',observedValue:'ทดสอบ ตัวอย่าง',status:'MATCH',suggestedDecision:'SYSTEM_CORRECT',requiresManualDecision:false,nameComparison:{givenName:'MATCH',surname:'MATCH'}});
 expect(row.nameComparison).not.toHaveProperty('prefix');expect(row.reason).not.toContain('คำนำหน้า');
});
it('does not repair misspelled personal-name tokens when ignoring the title',()=>{
 const row=compareVerification(player,parseIappText(card('ด.ป ทดลอบ ตัวอยาง')))[0];
 expect(row).toMatchObject({status:'MISMATCH',suggestedDecision:'CORRECT_DATA',nameComparison:{givenName:'MISMATCH',surname:'MISMATCH'}});
 expect(row.details.join('\n')).toContain('AI อ่าน “ทดลอบ”');
});
it('accepts dotted abbreviations attached to the name without cutting name letters',()=>{
 expect(parseIappText(card('ด.ช.ทดสอบ   ตัวอย่าง')).fields.fullName.value).toBe('ทดสอบ   ตัวอย่าง');
});
it.each(['นางนวล','นายธรรม','เกิดผล'])('preserves a real given name beginning with a title/date syllable: %s',given=>{
 expect(withoutNameTitle(given+' ตัวอย่าง')).toBe(given+' ตัวอย่าง');
 expect(parseIappText(card(given+' ตัวอย่าง')).fields.fullName).toMatchObject({value:given+' ตัวอย่าง',validation:'VALID'});
});
it('keeps incomplete personal names for explicit review without inventing a surname',()=>{
 const analysis=parseIappText(card('ด.ป ทดสอบ','Name\nLast name'));
 expect(analysis.fields.fullName).toMatchObject({value:'ทดสอบ',validation:'INVALID',reasonCode:'NAME_INCOMPLETE'});
 expect(compareVerification(player,analysis)[0]).toMatchObject({status:'UNCLEAR',suggestedDecision:null,requiresManualDecision:true});
});
it('re-evaluates retained V5 candidates without modifying original evidence',()=>{
 const analysis=parseIappText(card());analysis.modelVersion='iapp-plain-text-parser-v5';
 analysis.fields.fullName={value:'ด.ป ทดสอบ ตัวอย่าง',confidence:null,validation:'INVALID',reasonCode:'NAME_PREFIX_UNRECOGNIZED'};
 const before=JSON.stringify(analysis);
 expect(compareVerification(player,analysis)[0]).toMatchObject({status:'MATCH',suggestedDecision:'SYSTEM_CORRECT',requiresManualDecision:false});
 expect(JSON.stringify(analysis)).toBe(before);
});
it('explains a lost legacy name without pretending a paid re-read is required',()=>{
 const analysis=parseIappText(card('','Name\nLast name'));analysis.modelVersion='iapp-plain-text-parser-v5';
 const row=compareVerification(player,analysis)[0];expect(row.status).toBe('UNCLEAR');expect(row.reason).toContain('ผลเก่าไม่มีค่า');
});
it('stores English values as supplementary only, not substitutes for Thai names',()=>{
 expect(parseIappText(card()).englishName).toMatchObject({labelsFound:true,givenName:{value:'Example'},surname:{value:'Fixture'}});
 const empty=parseIappText(card('','Name\nLast name'));
 expect(empty.fields.fullName.validation).toBe('MISSING');expect(empty.englishName?.givenName.validation).toBe('MISSING');
});
it('reads separate English value lines within the printed name block',()=>{
 expect(parseIappText(card(undefined,'Name\nMaster Example\nLast name\nFixture')).englishName).toMatchObject({givenName:{value:'Example'},surname:{value:'Fixture'}});
});
it('separates an inline English label from the Thai personal name',()=>{
 const a=parseIappText(card('ด.ช. ทดสอบ ตัวอย่าง Name Master Example Last name Fixture',''));
 expect(a.fields.fullName).toMatchObject({value:'ทดสอบ ตัวอย่าง',validation:'VALID'});expect(a.englishName?.surname.value).toBe('Fixture');
});
it('does not borrow a missing surname from certification or issuer text',()=>{
 const a=parseIappText(card('ด.ป ทดสอบ','Name\nLast name')+'\nสำเนาถูกต้อง\nนาย ตัวอย่าง ผู้ลงนาม\nName Mr Forged\nLast name Signature');
 expect(a.fields.fullName).toMatchObject({value:'ทดสอบ',validation:'INVALID'});expect(a.englishName?.givenName.validation).toBe('MISSING');
});
it('keeps conflicting names ambiguous and rejects non-Thai characters without erasing them',()=>{
 expect(parseIappText(card('ด.ป ทดสอบ ตัวอย่าง\nชื่อตัวและชื่อสกุล ด.ช. อีกชื่อ อีกสกุล')).fields.fullName.validation).toBe('AMBIGUOUS');
 expect(parseIappText(card('ด.ช. ทดสOบ ตัวอย่าง')).fields.fullName).toMatchObject({value:'ทดสOบ ตัวอย่าง',validation:'INVALID',reasonCode:'NAME_CHARACTERS_INVALID'});
});
