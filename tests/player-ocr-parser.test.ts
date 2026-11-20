import { parseIappText } from '../src/services/playerOcr.parser';
import { normalizeDate, validThaiId } from '../src/services/playerOcr.date';
import { compareVerification, validateReview } from '../src/services/playerVerification.service';

function identity(prefix = '123456789012') {
  const sum = [...prefix].reduce((n, v, i) => n + Number(v) * (13 - i), 0);
  return prefix + (11 - sum % 11) % 10;
}
const id = identity();
const card = () => `บัตรประจำตัวประชาชน Thai National ID Card
เลขประจำตัวประชาชน ${id}
Identification Number
ชื่อตัวและชื่อสกุล ด.ช. ทดสอบ ตัวอย่าง
Name Master Example
Last name Fixture
เกิดวันที่ 15 มี.ค. 2551
Date of Birth 15 Mar. 2008
ที่อยู่ ตัวอย่างที่อยู่
1 ม.ค. 2560
วันออกบัตร
1 Jan. 2017
Date of Issue
14 มี.ค. 2571
วันบัตรหมดอายุ
14 Mar. 2028
Date of Expiry
สำเนาถูกต้อง
นาย ผู้รับรอง เอกสาร`;

it('extracts four labeled fields without using copy-certification handwriting or inventing confidence', () => {
  const result = parseIappText(card());
  expect(result.documentType).toBe('id_card');
  expect(result.fields.fullName.value).toBe('ทดสอบ ตัวอย่าง');
  expect(result.fields.idCard.value).toBe(id);
  expect(result.fields.birthDate.value).toBe('2008-03-15');
  expect(result.fields.expiryDate.value).toBe('2028-03-14');
  expect(Object.values(result.fields).every(f => f.validation === 'VALID' && f.confidence === null)).toBe(true);
});
it('rejects conflicting Thai and English dates instead of choosing the expected system value', () => {
  expect(parseIappText(card().replace('15 Mar. 2008', '16 Mar. 2008')).fields.birthDate).toMatchObject({ value: '', validation: 'AMBIGUOUS' });
});
it('extracts a titled Thai name with a damaged label only inside the bilingual ID/name block', () => {
  const input = card().replace('ชื่อตัวและชื่อสกุล', 'ป้ายชื่อผิดเพี้ยน');
  expect(parseIappText(input).fields.fullName.value).toBe('ทดสอบ ตัวอย่าง');
  expect(parseIappText(input.replace('Last name Fixture', 'ข้อความอื่น').replace('Name Master Example','ข้อความอื่น')).fields.fullName.validation).toBe('MISSING');
  expect(parseIappText(input.replace('ด.ช. ทดสอบ ตัวอย่าง', 'ด.ช. ทดสอบ')).fields.fullName.validation).toBe('INVALID');
});
it('does not use a titled name outside the bounded ID/name block', () => {
  const input = card().replace('ชื่อตัวและชื่อสกุล ด.ช. ทดสอบ ตัวอย่าง', 'ข้อมูลชื่ออ่านไม่ได้')
    .replace('ที่อยู่ ตัวอย่างที่อยู่', 'ที่อยู่ นาย ทดสอบ ตัวอย่าง');
  expect(parseIappText(input).fields.fullName.validation).toBe('MISSING');
});
it('does not confuse the issue date with the expiry date', () => {
  const input = card().replace('14 มี.ค. 2571\nวันบัตรหมดอายุ\n14 Mar. 2028\nDate of Expiry', 'วันบัตรหมดอายุ\nDate of Expiry');
  expect(parseIappText(input).fields.expiryDate.validation).toBe('MISSING');
});
it('handles lifetime expiry without inventing a far-future date', () => {
  const input = card().replace('14 มี.ค. 2571\nวันบัตรหมดอายุ\n14 Mar. 2028\nDate of Expiry', 'วันบัตรหมดอายุ ตลอดชีพ\nDate of Expiry Lifetime');
  expect(parseIappText(input).fields.expiryDate).toMatchObject({ value: 'LIFETIME', validation: 'VALID', confidence: null });
});
it('marks a wrong checksum invalid without silently repairing the digit', () => {
  const bad = id.slice(0, 12) + ((Number(id[12]) + 1) % 10);
  expect(parseIappText(card().replace(id, bad)).fields.idCard).toMatchObject({ value: bad, validation: 'INVALID' });
});
it('refuses multiple distinct card identities in one OCR document', () => {
  const result = parseIappText(card().replace('สำเนาถูกต้อง', 'เลขประจำตัวประชาชน ' + identity('234567890123') + '\nสำเนาถูกต้อง'));
  expect(result.documentType).toBe('unknown');
  expect(Object.values(result.fields).every(f => f.validation === 'AMBIGUOUS')).toBe(true);
});
it('does not fill a missing surname from a signature below the card', () => {
  const result = parseIappText(card().replace('ด.ช. ทดสอบ ตัวอย่าง', 'ด.ช. ทดสอบ'));
  expect(result.fields.fullName.validation).toBe('INVALID');
});
it('does not identify arbitrary handwritten names as an ID card', () => {
  expect(parseIappText('สำเนาถูกต้อง\nนาย ตัวอย่าง ทดสอบ').documentType).toBe('unknown');
});
it('reads ID numbers separated from their label or under a damaged label only within the card header',()=>{
  expect(parseIappText(card().replace('เลขประจำตัวประชาชน '+id,'เลขประจำตัวประชาชน\nIdentification Number\n'+id)).fields.idCard.value).toBe(id);
  expect(parseIappText(card().replace('เลขประจำตัวประชาชน '+id,id)).fields.idCard.value).toBe(id);
  expect(parseIappText(card().replace('เลขประจำตัวประชาชน '+id,'ข้อมูลเลขบัตรไม่ชัด').replace('ที่อยู่ ตัวอย่างที่อยู่','ที่อยู่ '+id)).fields.idCard.validation).toBe('MISSING');
});
it('reads a damaged Thai name label when the nearby English first-name label is preserved',()=>{
  const text=card().replace('ชื่อตัวและชื่อสกุล','ป้ายชื่อผิดเพี้ยน').replace('Last name Fixture','ข้อความไม่ชัด');
  expect(parseIappText(text).fields.fullName.value).toBe('ทดสอบ ตัวอย่าง');
});
it('keeps adjacent English issue dates out of a Thai expiry-date label',()=>{
  const text=card().replace('14 มี.ค. 2571\nวันบัตรหมดอายุ\n14 Mar. 2028\nDate of Expiry','14 มี.ค. 2571\nวันบัตรหมดอายุ\n1 Jan. 2017\nข้อความอื่น');
  expect(parseIappText(text).fields.expiryDate.value).toBe('2028-03-14');
});
it.each([
 ['1 ม.ค. 2560 14 มี.ค. 2571\nวันออกบัตร วันบัตรหมดอายุ'],
 ['1 Jan. 2017 14 Mar. 2028\nDate of Issue Date of Expiry'],
 ['14 Mar. 2028 1 Jan. 2017\nDate of Expiry Date of Issue']
])('uses explicit paired column labels to extract expiry from %s',pair=>{
  const text=card().replace('14 มี.ค. 2571\nวันบัตรหมดอายุ\n14 Mar. 2028\nDate of Expiry',pair);
  expect(parseIappText(text).fields.expiryDate).toMatchObject({value:'2028-03-14',validation:'VALID'});
});
it('does not infer an expiry date from an unlabeled pair of dates',()=>{
  const text=card().replace('14 มี.ค. 2571\nวันบัตรหมดอายุ\n14 Mar. 2028\nDate of Expiry','1 Jan. 2017 14 Mar. 2028\nข้อความอ่านไม่ได้');
  expect(parseIappText(text).fields.expiryDate.validation).toBe('MISSING');
});
it('does not choose a valid issue date when the adjacent expiry month is damaged',()=>{
  const text=card().replace('14 มี.ค. 2571\nวันบัตรหมดอายุ\n14 Mar. 2028\nDate of Expiry','1 Jan. 2017 14 Garbled. 2028\nDate of Expiry');
  expect(parseIappText(text).fields.expiryDate).toMatchObject({value:'',validation:'AMBIGUOUS'});
});
it('uses explicit bilingual column order while still rejecting contradictory readings',()=>{
  const text=card().replace('14 มี.ค. 2571\nวันบัตรหมดอายุ\n14 Mar. 2028\nDate of Expiry','1 ม.ค. 2560 14 มี.ค. 2571\nวันออกบัตร วันบัตรหมดอายุ\n1 Jan. 2017 15 Mar. 2028\nDate of Expiry');
  expect(parseIappText(text).fields.expiryDate.validation).toBe('AMBIGUOUS');
});
it('tolerates bounded OCR label variants without repairing unknown date values',()=>{
  const text=card().replace('เกิดวันที่','เกิตวันที่').replace('Date of Birth 15 Mar. 2008','ข้อความอ่านไม่ได้')
    .replace('วันบัตรหมดอายุ','วันบัตรหมดอาย').replace('Date of Expiry','Duta of Espiry');
  expect(parseIappText(text).fields.birthDate.value).toBe('2008-03-15');expect(parseIappText(text).fields.expiryDate.value).toBe('2028-03-14');
  expect(parseIappText(text.replace('14 มี.ค. 2571','').replace('14 Mar. 2028','14 Garbled. 2028')).fields.expiryDate.validation).toBe('INVALID');
});
it('supports Thai numeric glyphs without changing word spelling', () => {
  const digits = '๐๑๒๓๔๕๖๗๘๙';
  expect(parseIappText(card().replace(id, id.replace(/\d/g, d => digits[Number(d)]))).fields.idCard.value).toBe(id);
});
it.each([['15 Mar. 2008','2008-03-15'],['29 February 2024','2024-02-29'],['29 Feb 2023',null],['31 Apr. 2024',null],['15 Janitor 2008',null]])('normalizes English dates %s', (value, expected) => expect(normalizeDate(value)).toBe(expected));
it('compares extracted data separately from absent provider confidence', () => {
  const rows = compareVerification({ name: 'เด็กชายทดสอบ ตัวอย่าง', first_name:'ทดสอบ', last_name:'ตัวอย่าง', id_card: id, birth_date: '2008-03-15' }, parseIappText(card()), '2026-11-09');
  expect(rows.map(x => x.status)).toEqual(['MATCH','MATCH','MATCH','NO_REFERENCE']);
  expect(rows.every(x => x.confidence === null && x.requiresStaffReview)).toBe(true);
});
it('reports a valid-but-different reading as mismatch without approving a player', () => {
  const rows = compareVerification({ name: 'นาย ชื่ออื่น ตัวอย่าง', id_card: id, birth_date: '2007-03-15' }, parseIappText(card()));
  expect(rows[0].status).toBe('MISMATCH'); expect(rows[2].status).toBe('MISMATCH');
});
it('requires all four decisions but no face decision in OCR-only reviews', () => {
  const decisions = { fullName:'SYSTEM_CORRECT',idCard:'SYSTEM_CORRECT',birthDate:'SYSTEM_CORRECT',expiryDate:'SYSTEM_CORRECT' };
  expect(validateReview({ decisions, teamNote:'' })).toMatchObject({ docStatus:'APPROVED',reviewVersion:3 });
  expect(() => validateReview({ decisions:{fullName:'SYSTEM_CORRECT'},teamNote:'' })).toThrow('ครบทุกหัวข้อ');
  expect(validateReview({ decisions:{...decisions,birthDate:'REUPLOAD'},teamNote:'' })).toMatchObject({docStatus:'ACTION_REQUIRED'});
});
it('does not treat a checksum as external identity validation', () => {
  expect(validThaiId(id)).toBe(true);expect(validThaiId('0000000000000')).toBe(false);
});

it.each([
  'ชื่อตัวและชื่อสกุล ด.ช. ทดสอบ\nตัวอย่าง',
  'ชื่อตัวและชื่อสกุล ด.ช.\nทดสอบ ตัวอย่าง',
  'ชื่อตัวและชื่อสกุล\nด.ช.\nทดสอบ\nตัวอย่าง',
  'ป้ายชื่อผิดเพี้ยน ด.ช.\nทดสอบ\nตัวอย่าง',
  'ชื่อตัว และ ชื่อสกุล เด็กชาย\nทดสอบ\nตัวอย่าง'
])('assembles a bounded multiline Thai name: %s', name => {
  const result = parseIappText(card().replace('ชื่อตัวและชื่อสกุล ด.ช. ทดสอบ ตัวอย่าง', name));
  expect(result.fields.fullName.validation).toBe('VALID');
  expect(compareVerification({ name: 'เด็กชาย ทดสอบ ตัวอย่าง' }, result)[0]).toMatchObject({ status: 'MATCH', suggestedDecision: 'SYSTEM_CORRECT' });
});
it('keeps a surname starting with a title syllable and a given name containing a date syllable', () => {
  const text = card().replace('ชื่อตัวและชื่อสกุล ด.ช. ทดสอบ ตัวอย่าง', 'ชื่อตัวและชื่อสกุล ด.ช. เกิดผล\nนางนวล');
  expect(parseIappText(text).fields.fullName).toMatchObject({value:'เกิดผล นางนวล',validation:'VALID'});
});
it.each([
  'ชื่อตัวและชื่อสกุล ด.ช. ทดสอบ\nที่อยู่ ตัวอย่าง',
  'ชื่อตัวและชื่อสกุล ด.ช. ทดสอบ\nName Master Example\nตัวอย่าง',
  'ชื่อตัวและชื่อสกุล ด.ช. ทดสอบ'
])('does not invent missing name components across a field boundary: %s', name => {
  const text = card().replace('ชื่อตัวและชื่อสกุล ด.ช. ทดสอบ ตัวอย่าง', name);
  expect(parseIappText(text).fields.fullName.validation).toBe('INVALID');
});
it('keeps conflicting complete names ambiguous instead of choosing the system value', () => {
  const text = card().replace('ชื่อตัวและชื่อสกุล ด.ช. ทดสอบ ตัวอย่าง', 'ชื่อตัวและชื่อสกุล ด.ช. ทดสอบ ตัวอย่าง\nชื่อตัวและชื่อสกุล นาย อีกชื่อ อีกสกุล');
  expect(parseIappText(text).fields.fullName.validation).toBe('AMBIGUOUS');
});
