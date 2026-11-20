import { asciiDigits, normalizeDate, validThaiId } from './playerOcr.date';
import { inspectThaiName } from './playerOcr.name';
import { labels, OCR_SOURCE_BINDING_REVISION, VerificationField } from './playerOcr.types';

export function documentNotice(analysis: any): string {
  if (analysis.documentIssue === 'MULTIPLE_IDS' || Object.values(analysis.fields || {}).some((f: any) => f?.reason?.includes('พบเลขบัตรหลายค่า')))
    return 'พบเลขบัตรหลายค่าภายในเอกสารเดียว กรุณาเลือกเฉพาะบัตรของนักกีฬาหนึ่งคนก่อนพิจารณาผลรายช่อง';
  return analysis.documentIssue === 'UNKNOWN_TYPE' || analysis.documentType === 'unknown'
    ? 'ผล OCR ยังระบุไม่ได้ว่าเป็นบัตรประชาชนหรือสูติบัตร กรุณาตรวจไฟล์แนบและเลือกเอกสารให้ชัดเจน' : '';
}

function namePart(label: string, observed: string, expected: string): string {
  if (observed === expected) return `${label}: ตรงกัน (“${observed}”)`;
  const a = [...observed], b = [...expected]; let start = 0, end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const x = a.slice(start, a.length - end).join(''), y = b.slice(start, b.length - end).join('');
  const marks = /^[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]+$/;
  const difference = (!x && marks.test(y)) || (!y && marks.test(x))
    ? `ต่างกันที่เครื่องหมาย “${x || y}”` : `ส่วนที่ต่าง: AI “${x || '[ไม่มี]'}” / ระบบ “${y || '[ไม่มี]'}”`;
  return `${label}: AI อ่าน “${observed}” แต่ข้อมูลในระบบเป็น “${expected}” · ${difference} กรุณาตรวจไฟล์แนบด้วยสายตา`;
}

function dateProblem(value: string): string {
  const text = asciiDigits(value).trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const numeric = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{1,4})$/);
  if (iso || numeric) {
    const day = Number(iso ? iso[3] : numeric![1]), month = Number(iso ? iso[2] : numeric![2]);
    const yearText = iso ? iso[1] : numeric![3];
    if (yearText.length !== 4) return 'ส่วนปีอ่านได้ไม่ครบ4หลัก';
    const year = Number(yearText) > 2400 ? Number(yearText) - 543 : Number(yearText);
    if (year < 1900 || year > 2200) return 'ส่วนปีอยู่นอกช่วงวันที่ที่ระบบรองรับ';
    if (month < 1 || month > 12) return `ส่วนเดือนอ่านได้เป็น${month} ซึ่งไม่ใช่เดือน1–12`;
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day < 1 || day > maxDay) return `ส่วนวันอ่านได้เป็น${day} แต่เดือนนี้มี${maxDay}วัน`;
  }
  if (!/\d{4}/.test(text)) return 'ไม่พบส่วนปี4หลักในข้อความวันที่ที่อ่านได้';
  const named = text.match(/^(\d{1,2})\s*([^\d]+?)\s*(\d{4})$/);
  if (named) {
    if (!normalizeDate(`1 ${named[2]} ${named[3]}`)) return `ส่วนเดือนหรือปี “${named[2].trim()} ${named[3]}” แปลเป็นวันที่ที่ถูกต้องไม่ได้`;
    return `ส่วนวัน “${named[1]}” ไม่ตรงกับจำนวนวันของเดือนและปีที่อ่านได้`;
  }
  return 'ยังแยกส่วนวัน เดือน และปีจากข้อความที่อ่านได้ไม่ได้';
}

/** Explanations use retained OCR values only; never invent the location of unread text. */
export function comparisonDetails(field: VerificationField, read: any, value: string, system: string, status: string, analysis: any): string[] {
  const label = labels[field];
  if (documentNotice(analysis)) return [`${label}: รอพิจารณาเอกสารให้ชัดเจนตามข้อความด้านบน จึงยังไม่สรุปผลของช่องนี้`];
  if (field === 'expiryDate' && status === 'NOT_APPLICABLE') return ['วันหมดอายุ: ไม่ใช้กับสูติบัตร'];
  if (read?.validation === 'AMBIGUOUS') {
    const detail = field === 'fullName' ? 'พบชื่อหลายค่าที่ขัดแย้งกัน' : field === 'idCard' ? 'พบเลขบัตรหลายค่าที่ขัดแย้งกัน'
      : read.reason?.includes('ตลอดชีพ') ? 'พบทั้งวันที่หมดอายุและข้อความตลอดชีพ' : 'พบวันที่หลายค่าหรือหลายคอลัมน์ที่ยังระบุค่าเดียวไม่ได้';
    return [`${label}: ${detail} กรุณาตรวจตำแหน่งข้อมูลนี้จากไฟล์แนบ`];
  }
  if (!value) return [`${label}: ไม่พบ${field === 'fullName' ? 'ชื่อและนามสกุล' : label}ในผล OCR จึงยังเปรียบเทียบไม่ได้ กรุณาตรวจข้อมูลนี้จากไฟล์แนบ`,
    ...(analysis.modelVersion === OCR_SOURCE_BINDING_REVISION ? [`ผลเก่าไม่มีค่าของ${label}ที่เก็บไว้ จึงกู้ข้อความส่วนนี้จาก cache ไม่ได้ เจ้าหน้าที่พิจารณาจากไฟล์แนบได้โดยไม่ต้องอ่าน OCR ใหม่`] : [])];
  if (field === 'fullName') {
    const observed = inspectThaiName(value), expected = inspectThaiName(system);
    if (!observed.charactersValid) return [`ชื่อ / นามสกุล: ข้อความ “${value}” มีอักขระที่ตรวจรูปแบบชื่อภาษาไทยไม่ได้ กรุณาตรวจตัวอักษรจากไฟล์แนบ`];
    if (!observed.complete) return [`ชื่อ / นามสกุล: อ่านได้ “${value}” เพียงส่วนเดียว จึงยังแยกชื่อและนามสกุลไม่ได้ กรุณาตรวจจากไฟล์แนบ`];
    if (status === 'UNCLEAR') return [`ชื่อ / นามสกุล: อ่านได้ “${value}” แต่ผล OCR ยังไม่ยืนยันค่าชื่อนี้ จึงยังสรุปว่าตรงหรือไม่ตรงไม่ได้ กรุณาตรวจจากไฟล์แนบ`];
    if (!system) return [`ชื่อ / นามสกุล: AI อ่าน “${value}” แต่ไม่พบชื่อและนามสกุลในระบบสำหรับเปรียบเทียบ`];
    if (observed.givenName && observed.surname && expected.givenName && expected.surname)
      return [namePart('ชื่อ', observed.givenName, expected.givenName), namePart('นามสกุล', observed.surname, expected.surname)];
    return [`ชื่อและนามสกุลรวม: ${status === 'MATCH' ? 'ตรงกัน' : `AI อ่าน “${value}” / ข้อมูลระบบ “${system}” ยังต้องตรวจด้วยสายตา`}`,
      'ผล OCR ไม่เพียงพอสำหรับแยกชื่อและนามสกุลเป็นรายส่วนอย่างแน่นอน จึงไม่ระบุว่าส่วนใดผิด'];
  }
  if (field === 'idCard') {
    const digits = asciiDigits(value).replace(/[\s-]/g, '');
    if (!/^\d+$/.test(digits)) return ['เลขบัตรประชาชน: ผล OCR มีอักขระอื่นปนกับตัวเลข จึงยังระบุเลขบัตรครบ13หลักไม่ได้'];
    if (digits.length !== 13) return [`เลขบัตรประชาชน: อ่านได้${digits.length}หลัก ต้องมี13หลัก โดยผล OCR ไม่ได้ระบุว่าหลักใดขาดหรือเกิน กรุณาตรวจตัวเลขจากไฟล์แนบ`];
    if (!validThaiId(digits)) return ['เลขบัตรประชาชน: อ่านได้13หลัก แต่เลขตรวจสอบไม่ผ่าน จึงยังยืนยันตัวเลขที่อ่านได้ไม่ได้ กรุณาตรวจจากไฟล์แนบ'];
    if (status === 'UNCLEAR') return ['เลขบัตรประชาชน: อ่านได้13หลักและเลขตรวจสอบผ่าน แต่ผล OCR ยังไม่ยืนยันค่าที่อ่าน จึงยังเปรียบเทียบกับข้อมูลในระบบไม่ได้ กรุณาตรวจจากไฟล์แนบ'];
    if (status === 'MATCH') return ['เลขบัตรประชาชน: อ่านครบ13หลัก เลขตรวจสอบผ่าน และตรงกับข้อมูลในระบบ'];
    if (!system) return ['เลขบัตรประชาชน: อ่านได้ครบ13หลัก แต่ไม่มีเลขบัตรในระบบสำหรับเปรียบเทียบ'];
    const expected = asciiDigits(system).replace(/[\s-]/g, '');
    const positions = /^\d{13}$/.test(expected) ? [...digits].flatMap((d, i) => d === expected[i] ? [] : [i + 1]) : [];
    return [positions.length ? `เลขบัตรประชาชน: ต่างจากข้อมูลในระบบที่หลัก${positions.join(', ')} กรุณาเทียบตัวเลขกับไฟล์แนบ`
      : 'เลขบัตรประชาชน: ค่าที่อ่านได้ไม่ตรงกับเลขบัตรในระบบ กรุณาตรวจข้อมูลทั้งสองฝั่งกับไฟล์แนบ'];
  }
  if (field === 'expiryDate' && value === 'LIFETIME') return [status === 'UNCLEAR'
    ? 'วันหมดอายุ: อ่านได้ข้อความตลอดชีพ แต่ผล OCR ยังไม่ยืนยัน จึงยังสรุปอายุบัตรไม่ได้ กรุณาตรวจจากไฟล์แนบ'
    : 'วันหมดอายุ: อ่านได้ว่าบัตรตลอดชีพ จึงไม่ใช้เกณฑ์วันหมดอายุ'];
  const date = normalizeDate(value);
  if (!date) return [`${label}: อ่านได้ “${value}” · ${dateProblem(value)} กรุณาตรวจช่องวันที่นี้จากไฟล์แนบ`];
  if (status === 'UNCLEAR') return [`${label}: อ่านได้ “${value}” แต่ผล OCR ยังไม่ยืนยันวันที่นี้ จึงยังสรุปผลเปรียบเทียบไม่ได้ กรุณาตรวจช่องวันที่นี้จากไฟล์แนบ`];
  if (field === 'expiryDate') return [`วันหมดอายุที่อ่านได้: ${date} · ${status === 'EXPIRED_CARD' ? 'บัตรหมดอายุแล้วตามวันที่ไทยปัจจุบัน' : 'บัตรยังไม่หมดอายุ ณ วันที่เปรียบเทียบ'}`];
  const expected = normalizeDate(system);
  if (!expected) return [`วันเกิด: อ่านได้ ${date} แต่ไม่มีวันเกิดที่ใช้เปรียบเทียบได้ในระบบ`];
  return ['วัน', 'เดือน', 'ปี'].map((part, index) => {
    const i = 2 - index, a = date.split('-')[i], b = expected.split('-')[i];
    return `วันเกิด—${part}: ${a === b ? `ตรงกัน (${a})` : `AI อ่าน ${a} / ข้อมูลระบบ ${b} ไม่ตรงกัน กรุณาตรวจไฟล์แนบ`}`;
  });
}
