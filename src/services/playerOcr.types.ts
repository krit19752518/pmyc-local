export class VerificationError extends Error {
  constructor(public status: number, message: string, public code?: string, public retryAfterSeconds?: number) { super(message); }
}
export const verificationFields = ['fullName', 'idCard', 'birthDate', 'expiryDate'] as const;
export type VerificationField = typeof verificationFields[number];
export type Decision = 'SYSTEM_CORRECT' | 'CORRECT_DATA' | 'REUPLOAD' | 'EXPIRED_CARD';
export type DecisionSource = 'AI_PREFILL' | 'STAFF_EDITED' | 'SAVED_REVIEW';
export const labels: Record<VerificationField, string> = {
  fullName: 'ชื่อ / นามสกุล', idCard: 'เลขบัตรประชาชน', birthDate: 'วันเดือนปีเกิด', expiryDate: 'วันหมดอายุบัตร'
};
export type OcrField = { value: string; confidence: null; validation: 'VALID' | 'MISSING' | 'INVALID' | 'AMBIGUOUS'; reason?: string;
  reasonCode?: 'NAME_PREFIX_UNRECOGNIZED'|'NAME_PREFIX_MISSING'|'NAME_CHARACTERS_INVALID'|'NAME_INCOMPLETE'|'ID_INCOMPLETE' };
export type OcrAnalysis = { provider: 'iapp'; modelVersion: string; documentType: 'id_card' | 'birth_certificate' | 'unknown';
  fields: Record<VerificationField, OcrField>; documentIssue?: 'MULTIPLE_IDS'|'UNKNOWN_TYPE'; englishName?: {givenName: OcrField; surname: OcrField; labelsFound: boolean}; quality?: OcrQuality; requiresStaffReview: true };
export type OcrPoint = { x: number; y: number };
export type OcrQuality = { width: number; height: number; contrast: number; sharpness: number; brightPercent: number; darkPercent: number; warnings: string[] };
export type OcrSelection = { page: number; crop?: { x: number; y: number; width: number; height: number }; corners?: [OcrPoint,OcrPoint,OcrPoint,OcrPoint]; rotation?: number; enhance?: boolean };
export const OCR_PARSER_REVISION = 'iapp-plain-text-parser-v6';
// V5 extracted values can be re-evaluated without another paid call. Preserve
// their source binding and original modelVersion; never rewrite stored evidence.
export const OCR_SOURCE_BINDING_REVISION = 'iapp-plain-text-parser-v5';
export function reusableOcrAnalysis(value: any): boolean {
  return value?.provider === 'iapp' && [OCR_SOURCE_BINDING_REVISION, OCR_PARSER_REVISION].includes(value.modelVersion)
    && verificationFields.every(field => typeof value.fields?.[field]?.value === 'string'
      && ['VALID','MISSING','INVALID','AMBIGUOUS'].includes(value.fields[field].validation));
}
export const OCR_PROVIDER_REVISION = 'iapp-document-ocr-plain-v3';
export const IAPP_OCR_ENDPOINT = 'https://api.iapp.co.th/v3/store/ocr/document/ocr';
