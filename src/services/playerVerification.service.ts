import { createHash } from 'crypto';
import { constants, promises as fs } from 'fs';
import path from 'path';
import { pool } from '../db';
import { resetGeneration, resetBoundKey } from './playerVerification.reset';
import { VerificationError, verificationFields, VerificationField, Decision, DecisionSource, labels, OcrSelection, OCR_SOURCE_BINDING_REVISION } from './playerOcr.types';
import { asciiDigits, normalizeDate, normalizeThaiName, validThaiId, bangkokToday, previousCalendarDay } from './playerOcr.date';
import { inspectThaiName, thaiNameField, withoutNameTitle } from './playerOcr.name';
import { comparisonDetails, documentNotice } from './playerVerification.details';
import { inspectOcrDocument, selectionOf, ocrCacheKey } from './playerOcr.document';
export { VerificationError, verificationFields, VerificationField, Decision, labels } from './playerOcr.types';
export { normalizeDate } from './playerOcr.date';
export { ocrConfiguration as aiConfiguration } from './playerOcr.config';

export function compareVerification(player: any, analysis: any, today = bangkokToday()) {
  const expiryCutoff = previousCalendarDay(today);
  const system: Record<VerificationField, string> = {
    fullName: withoutNameTitle(player.first_name && player.last_name
      ? [player.first_name, player.middle_name, player.last_name].filter(Boolean).join(' ')
      : player.name || [player.first_name, player.middle_name, player.last_name].filter(Boolean).join(' ')),
    idCard: player.id_card || '', birthDate: player.verification_birth_date ?? (player.birth_date instanceof Date
      ? `${player.birth_date.getFullYear()}-${String(player.birth_date.getMonth() + 1).padStart(2, '0')}-${String(player.birth_date.getDate()).padStart(2, '0')}` : String(player.birth_date || '')),
    expiryDate: ''
  };
  return verificationFields.map(field => {
    const stored = analysis.fields?.[field];
    // Project retained V5 candidates under current name rules without changing stored evidence.
    const read = field === 'fullName' && analysis.provider === 'iapp' && stored?.value && stored.validation !== 'AMBIGUOUS'
      ? thaiNameField([stored.value]) : stored;
    const rawValue = typeof read?.value === 'string' ? read.value.slice(0, 250) : '';
    const value = field === 'fullName' ? withoutNameTitle(rawValue) : rawValue;
    const confidence = typeof read?.confidence === 'number' && Number.isFinite(read.confidence) ? read.confidence : null;
    const normalize = (input: string): string | null => field === 'birthDate' || field === 'expiryDate' ? normalizeDate(input)
      : field === 'idCard' ? asciiDigits(input).replace(/[\s-]/g, '') : normalizeThaiName(input);
    const observed = normalize(value), expected = normalize(system[field]);
    const blockedByDocument = !!documentNotice(analysis);
    // iApp plain text supplies no confidence. Deterministic format checks and comparison
    // are separate from provider confidence; neither approves a player automatically.
    const parsed = analysis.provider === 'iapp' && read?.validation === 'VALID';
    const usable = analysis.provider === 'iapp' ? parsed : confidence !== null && confidence >= 0.85;
    let status = 'UNCLEAR';
    if (field === 'expiryDate' && analysis.documentType === 'birth_certificate') status = 'NOT_APPLICABLE';
    else if (field === 'expiryDate' && usable && value === 'LIFETIME') status = 'NO_REFERENCE';
    else if (usable && observed && (field !== 'idCard' || (parsed ? validThaiId(observed) : /^\d{13}$/.test(observed)))) status = !expected ? 'NO_REFERENCE' : observed === expected ? 'MATCH' : 'MISMATCH';
    const expired = !blockedByDocument && field === 'expiryDate' && usable && !!observed && observed <= expiryCutoff && status !== 'NOT_APPLICABLE';
    if (expired) status = 'EXPIRED_CARD';
    if (blockedByDocument && status !== 'NOT_APPLICABLE') status = 'UNCLEAR';
    const nameParts=field==='fullName'&&value?inspectThaiName(value):null;
    const expectedName=field==='fullName'?inspectThaiName(system.fullName):null;
    const nameComparison=nameParts&&expectedName?{
      personalName:!nameParts.complete?'UNCLEAR':!expectedName.personalName?'NO_REFERENCE':normalizeThaiName(nameParts.personalName)===normalizeThaiName(expectedName.personalName)?'MATCH':'MISMATCH',
      ...(nameParts.givenName && nameParts.surname && expectedName.givenName && expectedName.surname ? {
        givenName:nameParts.givenName===expectedName.givenName?'MATCH':'MISMATCH',
        surname:nameParts.surname===expectedName.surname?'MATCH':'MISMATCH'
      } : {})
    }:undefined;
    const requiresManualDecision=blockedByDocument || field==='fullName'&&!!value&&read?.validation==='INVALID';
    const suggestedDecision: Decision | null = requiresManualDecision ? null : expired ? 'EXPIRED_CARD'
      : status === 'MATCH' || status === 'NOT_APPLICABLE' || field === 'expiryDate' && status === 'NO_REFERENCE' ? 'SYSTEM_CORRECT'
      : status === 'MISMATCH' || status === 'NO_REFERENCE' ? 'CORRECT_DATA' : 'REUPLOAD';
    const decisionReason = suggestedDecision === 'EXPIRED_CARD'
      ? 'บัตรประชาชนหมดอายุ กรุณาแนบบัตรใหม่ที่ยังไม่หมดอายุ (วันหมดอายุ: ' + observed + ')'
      : suggestedDecision === 'CORRECT_DATA' ? 'กรุณาตรวจสอบและแก้ไข' + labels[field] + 'ให้ตรงกับเอกสาร'
      : suggestedDecision === 'REUPLOAD' ? 'กรุณาอัปโหลดเอกสารใหม่เพื่อให้ตรวจสอบ' + labels[field] + 'ได้ชัดเจน' : '';
    const details = comparisonDetails(field, read, value, system[field], status, analysis);
    const english=field==='fullName'&&analysis.englishName;
    const englishName=english?{givenName:english.givenName?.validation==='VALID'&&typeof english.givenName.value==='string'?english.givenName.value.slice(0,100):'',
      surname:english.surname?.validation==='VALID'&&typeof english.surname.value==='string'?english.surname.value.slice(0,100):'',labelsFound:english.labelsFound===true}:undefined;
    return { field, label: labels[field], systemValue: system[field], observedValue: value, confidence, status,
      validation: read?.validation || null, reason: details.join('\n'), details, requiresStaffReview: true, requiresManualDecision,
      expired, suggestedDecision, decisionReason, comparisonDate: today, expiryCutoff,
      ...(field==='fullName'?{nameComparison,englishName}:{} ) };
  });
}
export function validateReview(input: any) {
  if(input?.docStatus==='PENDING') {
    if(typeof input.teamNote!=='string'||input.teamNote.length>4000)throw new VerificationError(400,'หมายเหตุไม่ถูกต้อง');
    return {decisions:{} as Partial<Record<VerificationField, Decision>>,decisionSources:{} as Partial<Record<VerificationField, DecisionSource>>,teamNote:input.teamNote.trim(),docStatus:'PENDING',decisionStatus:'PENDING',statusSource:'MANUAL',reviewVersion:2,reset:true};
  }
  if (!input || typeof input !== 'object' || !input.decisions || typeof input.decisions !== 'object' || Array.isArray(input.decisions)) throw new VerificationError(400, 'กรุณาระบุผลการพิจารณา');
  const decisions: Partial<Record<VerificationField, Decision>> = {};
  const decisionSources: Partial<Record<VerificationField, DecisionSource>> = {};
  if (input.decisionSources !== undefined && (!input.decisionSources || typeof input.decisionSources !== 'object' || Array.isArray(input.decisionSources)
    || Object.keys(input.decisionSources).some(key => !verificationFields.includes(key as VerificationField)))) throw new VerificationError(400, 'ที่มาผลการพิจารณาไม่ถูกต้อง');
  for (const [field, choice] of Object.entries(input.decisions)) {
    if (!verificationFields.includes(field as VerificationField) || !['SYSTEM_CORRECT', 'CORRECT_DATA', 'REUPLOAD', 'EXPIRED_CARD'].includes(String(choice))
      || choice === 'EXPIRED_CARD' && field !== 'expiryDate') throw new VerificationError(400, 'ผลการพิจารณาไม่ถูกต้อง');
    decisions[field as VerificationField] = choice as Decision;
    const source = input.decisionSources?.[field] ?? 'STAFF_EDITED';
    if (!['AI_PREFILL','STAFF_EDITED','SAVED_REVIEW'].includes(source)) throw new VerificationError(400, 'ที่มาผลการพิจารณาไม่ถูกต้อง');
    decisionSources[field as VerificationField] = source;
  }
  if (verificationFields.some(field => !decisions[field])) throw new VerificationError(400, 'กรุณาเลือกการตัดสินใจ กกท. ให้ครบทุกหัวข้อ');
  if (typeof input.teamNote !== 'string' || input.teamNote.length > 4000) throw new VerificationError(400, 'หมายเหตุไม่ถูกต้อง');
  const reasons = verificationFields.flatMap(field => decisions[field] === 'CORRECT_DATA'
    ? ['กรุณาตรวจสอบและแก้ไข' + labels[field] + 'ให้ตรงกับเอกสาร']
    : decisions[field] === 'REUPLOAD' ? ['กรุณาอัปโหลดเอกสารใหม่เพื่อให้ตรวจสอบ' + labels[field] + 'ได้ชัดเจน']
    : decisions[field] === 'EXPIRED_CARD' ? ['บัตรประชาชนหมดอายุ กรุณาแนบบัตรใหม่ที่ยังไม่หมดอายุ'] : []);
  let teamNote = input.teamNote.trim();
  for (const reason of reasons) if (!teamNote.includes(reason)) teamNote += (teamNote ? '\n' : '') + '• ' + reason;
  if (teamNote.length > 4000) throw new VerificationError(400, 'หมายเหตุรวมเหตุผลต้องไม่เกิน 4000 ตัวอักษร');
  const decisionStatus = reasons.length ? 'ACTION_REQUIRED' : 'APPROVED';
  if(input.docStatus!==undefined && !['PENDING','APPROVED','ACTION_REQUIRED','CORRECTED'].includes(input.docStatus))throw new VerificationError(400,'สถานะการตรวจสอบเอกสารไม่ถูกต้อง');
  return { decisions, decisionSources, teamNote, docStatus: input.docStatus ?? decisionStatus, decisionStatus,
    statusSource: input.docStatus===undefined?'DECISIONS':'MANUAL', reviewVersion: 3 };
}

/** Called only by authorized runtime requests. No import-time filesystem access. */
export async function readVerificationAsset(url: unknown, root = path.resolve(__dirname, '../..')) {
  if (typeof url !== 'string' || !/^\/uploads\/[A-Za-z0-9_.-]+$/.test(url) || url.includes('..')) throw new VerificationError(422, 'ไม่พบไฟล์แนบที่รองรับ');
  // Match Express's static lookup order; an explicit override remains confined to that root.
  const roots = process.env.PLAYER_AI_ASSET_ROOT ? [process.env.PLAYER_AI_ASSET_ROOT]
    : [path.join(root, 'uploads'), path.join(root, 'public', 'uploads')];
  let opened: { file: string; handle: Awaited<ReturnType<typeof fs.open>> } | undefined;
  for (const configuredRoot of roots) {
    try {
      const base = await fs.realpath(configuredRoot);
      const file = path.join(base, url.slice('/uploads/'.length));
      opened = { file, handle: await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW) };
      break;
    } catch (error) {
      // Never bypass a denied, symlinked or otherwise invalid primary file.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  if (!opened) throw new VerificationError(422, 'ไม่พบไฟล์เอกสารแนบ กรุณาติดต่อผู้ดูแลระบบ', 'OCR_DOCUMENT_NOT_FOUND');
  const { file, handle } = opened;
  try {
    const real = await fs.realpath(file);
    const stat = await handle.stat();
    // Refuse symlinks (including a target replaced during resolution).
    const link = await fs.lstat(file);
    const current = await fs.stat(real);
    if (real !== file || link.isSymbolicLink() || current.ino !== stat.ino || !stat.isFile() || stat.size > 12 * 1024 * 1024) throw new VerificationError(422, 'ไฟล์แนบไม่ถูกต้องหรือมีขนาดใหญ่เกินไป');
    const buffer = Buffer.alloc(Math.min(stat.size + 1, 12 * 1024 * 1024 + 1));
    let length = 0;
    while (length < buffer.length) {
      const read = await handle.read(buffer, length, buffer.length - length, null);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length !== stat.size) throw new VerificationError(409, 'ไฟล์แนบเปลี่ยนระหว่างอ่าน กรุณาลองใหม่');
    const bytes = buffer.subarray(0, length);
    const type = bytes.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf'
      : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
        : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png' : '';
    if (!type) throw new VerificationError(422, 'รองรับเอกสาร PDF, JPG และ PNG เท่านั้น');
    return { bytes, type, sha256: createHash('sha256').update(bytes).digest('hex') };
  } finally { await handle.close(); }
}
export async function verificationSnapshot(player: any, inputSelection?: unknown) {
  const document = await readVerificationAsset(player.doc_id_card);
  const info = await inspectOcrDocument(document);
  const selection: OcrSelection = selectionOf(inputSelection);
  if (selection.page > info.pages) throw new VerificationError(400, 'หน้าที่เลือกไม่มีในเอกสาร');
  const generation = await resetGeneration(player.id,pool);
  const cacheKey = resetBoundKey(ocrCacheKey(document.sha256, selection),generation);
  const sourceHash = resetBoundKey(createHash('sha256').update(JSON.stringify([player.id, player.team_id, player.name, player.prefix,
    player.first_name, player.middle_name, player.last_name, player.id_card, player.verification_birth_date ?? player.birth_date,
    document.sha256, selection, OCR_SOURCE_BINDING_REVISION])).digest('hex'),generation);
  return { sourceHash, cacheKey, document, info, selection, resetGeneration:generation };
}
