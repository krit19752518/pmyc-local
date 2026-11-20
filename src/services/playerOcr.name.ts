import { normalizeThaiName } from './playerOcr.date';
import { OcrField } from './playerOcr.types';

// Full titles require a word boundary; do not cut names such as นางนวล or นายธรรม.
// A dotted child-title variant is an explicit boundary even if OCR misreads its second letter.
export const NAME_TITLE_PATTERN_SOURCE = '^(?:(?:เด็กชาย|เด็กหญิง|นางสาว|นาย|นาง)\\s+|(?:ด\\s*\\.\\s*[ก-๙]|น\\s*\\.\\s*ส)(?:\\s*\\.\\s*|\\s+|(?=[ก-๙])))';
export function withoutNameTitle(value: string): string {
  return value.normalize('NFC').trim().replace(new RegExp(NAME_TITLE_PATTERN_SOURCE), '').trim();
}
export function inspectThaiName(value: string) {
  const personalName=withoutNameTitle(value);
  const thaiOnly=/^[ก-๙]+(?:\s+[ก-๙]+)*$/.test(personalName);
  const tokens=personalName.split(/\s+/);
  return {personalName,charactersValid:thaiOnly,complete:thaiOnly&&tokens.length>=2,
    givenName:thaiOnly&&tokens.length===2?tokens[0]:null,surname:thaiOnly&&tokens.length===2?tokens[1]:null};
}

/** Retain a bounded printed candidate; validation never repairs its characters. */
export function thaiNameField(values: string[]): OcrField {
  const candidates=[...new Map(values.filter(s=>s.trim()&&s.length<=250).map(withoutNameTitle).filter(Boolean).map(s=>[normalizeThaiName(s),s])).values()];
  if(!candidates.length)return {value:'',confidence:null,validation:'MISSING',reason:'ไม่พบชื่อและนามสกุลในผล OCR'};
  if(candidates.length>1)return {value:'',confidence:null,validation:'AMBIGUOUS',reason:'พบชื่อหลายค่าที่ขัดแย้งกัน กรุณาตรวจต้นฉบับ'};
  const value=candidates[0],parts=inspectThaiName(value);
  const reasonCode=!parts.personalName ? 'NAME_INCOMPLETE' : !parts.charactersValid ? 'NAME_CHARACTERS_INVALID' : !parts.complete ? 'NAME_INCOMPLETE' : undefined;
  const messages={NAME_CHARACTERS_INVALID:'ชื่อ / นามสกุลที่อ่านได้มีอักขระที่ตรวจรูปแบบไม่ได้ กรุณาตรวจจากไฟล์แนบ',
    NAME_INCOMPLETE:'ผล OCR มีข้อความชื่อเพียงส่วนเดียว จึงยังแยกชื่อและนามสกุลไม่ได้ กรุณาตรวจจากไฟล์แนบ'};
  return {value,confidence:null,validation:reasonCode?'INVALID':'VALID',...(reasonCode?{reasonCode,reason:messages[reasonCode]}:{})};
}

/** English is supplementary only, within the printed name block. Labels are not values. */
export function englishNameFields(lines: string[]) {
  const boundary=/^(?:Name\b|Narne\b|Last\b|Date\b|เกิด|วัน|ที่อยู่|ศาสนา|Religion|เพศ|สัญชาติ|Identification|เลข|เจ้าพนักงาน|นายทะเบียน|สำเนา|รับรอง)/i;
  const last=/\bLast\s*name\b\s*[:：]?\s*/i, first=/(?:^|\s)(?:Name|Narne)\b\s*[:：]?\s*/i;
  function collect(kind: 'givenName'|'surname'): OcrField {
    const candidates: string[]=[];
    lines.forEach((line,index)=>{
      if(kind==='givenName'&&last.test(line)&&!/(?:^|\s)(?:Name|Narne)\s+(?:Master|Miss|Mr\.?|Mrs\.?)\b/i.test(line))return;
      const match=line.match(kind==='surname'?last:first);if(!match)return;
      let tail=line.slice(match.index!+match[0].length).split(/\s+(?:Last\s*name|Date\b|เกิด|วัน|ที่อยู่|ศาสนา|Religion)\b/i)[0].trim();
      if(kind==='givenName')tail=tail.replace(/^(?:Master|Miss|Mrs\.?|Mr\.?)(?:\s+|$)/i,'').trim();
      if(!tail){const next=lines[index+1]||'';if(!boundary.test(next))tail=(kind==='givenName'?next.replace(/^(?:Master|Miss|Mrs\.?|Mr\.?)(?:\s+|$)/i,''):next).trim();}
      if(tail.length<=100&&!boundary.test(tail)&&/^[A-Za-z]+(?:[ .’'\-][A-Za-z]+)*$/.test(tail))candidates.push(tail);
    });
    const unique=[...new Map(candidates.map(s=>[s.toLowerCase().replace(/\s+/g,' '),s])).values()];
    return unique.length>1?{value:'',confidence:null,validation:'AMBIGUOUS',reason:'พบชื่อภาษาอังกฤษหลายค่า'}
      :unique.length?{value:unique[0],confidence:null,validation:'VALID'}
      :{value:'',confidence:null,validation:'MISSING',reason:'ไม่พบค่าชื่อภาษาอังกฤษ'};
  }
  return {givenName:collect('givenName'),surname:collect('surname'),labelsFound:lines.some(line=>first.test(line)||last.test(line))};
}
