"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IAPP_OCR_ENDPOINT = exports.OCR_PROVIDER_REVISION = exports.OCR_SOURCE_BINDING_REVISION = exports.OCR_PARSER_REVISION = exports.labels = exports.verificationFields = exports.VerificationError = void 0;
exports.reusableOcrAnalysis = reusableOcrAnalysis;
class VerificationError extends Error {
    status;
    code;
    retryAfterSeconds;
    constructor(status, message, code, retryAfterSeconds) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
exports.VerificationError = VerificationError;
exports.verificationFields = ['fullName', 'idCard', 'birthDate', 'expiryDate'];
exports.labels = {
    fullName: 'ชื่อ / นามสกุล', idCard: 'เลขบัตรประชาชน', birthDate: 'วันเดือนปีเกิด', expiryDate: 'วันหมดอายุบัตร'
};
exports.OCR_PARSER_REVISION = 'iapp-plain-text-parser-v6';
// V5 extracted values can be re-evaluated without another paid call. Preserve
// their source binding and original modelVersion; never rewrite stored evidence.
exports.OCR_SOURCE_BINDING_REVISION = 'iapp-plain-text-parser-v5';
function reusableOcrAnalysis(value) {
    return value?.provider === 'iapp' && [exports.OCR_SOURCE_BINDING_REVISION, exports.OCR_PARSER_REVISION].includes(value.modelVersion)
        && exports.verificationFields.every(field => typeof value.fields?.[field]?.value === 'string'
            && ['VALID', 'MISSING', 'INVALID', 'AMBIGUOUS'].includes(value.fields[field].validation));
}
exports.OCR_PROVIDER_REVISION = 'iapp-document-ocr-plain-v3';
exports.IAPP_OCR_ENDPOINT = 'https://api.iapp.co.th/v3/store/ocr/document/ocr';
