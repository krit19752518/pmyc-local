"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OcrDiagnosticWindow = exports.OCR_DIAGNOSTICS_UNTIL = void 0;
exports.ocrDiagnosticShape = ocrDiagnosticShape;
exports.diagnosticLog = diagnosticLog;
exports.announceOcrDiagnosticsReady = announceOcrDiagnosticsReady;
const crypto_1 = require("crypto");
const playerOcr_types_1 = require("./playerOcr.types");
/** Temporary, content-free diagnostics for #59. Stops automatically; never logs response text. */
exports.OCR_DIAGNOSTICS_UNTIL = Date.parse('2026-11-10T13:30:00Z');
class OcrDiagnosticWindow {
    issued = 0;
    begin(now = Date.now()) {
        if (now < Date.parse('2026-11-09T13:00:00Z') || now >= exports.OCR_DIAGNOSTICS_UNTIL || this.issued >= 30)
            return null;
        this.issued += 1;
        return (0, crypto_1.randomUUID)(); // Independent of the cache, athlete, document and paid-attempt IDs.
    }
}
exports.OcrDiagnosticWindow = OcrDiagnosticWindow;
const diagnosticWindow = new OcrDiagnosticWindow();
const validStates = new Set(['VALID', 'MISSING', 'INVALID', 'AMBIGUOUS']);
function ocrDiagnosticShape(text, analysis) {
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const titled = lines.filter(s => /(?:เด็กชาย|เด็กหญิง|ด\s*\.\s*ช|ด\s*\.\s*ญ|นาย|นาง)/.test(s));
    const ids = new Set((text.match(/(?<!\d)(?:\d[ \t-]*){12}\d(?![ \t-]*\d)/g) || []).map(s => s.replace(/[ \t-]/g, '')));
    const state = (field) => validStates.has(analysis.fields[field]?.validation) ? analysis.fields[field].validation : 'OTHER';
    return {
        lineCount: Math.min(lines.length, 999),
        cardHeaderDetected: /บัตร\s*ประจำตัว\s*ประชาชน|Thai\s*National\s*ID\s*Card|Identification\s*Number|เลขประจำตัวประชาชน/i.test(text),
        thaiNameLabelDetected: /ชื่อตัว\s*และ\s*ชื่อสกุล|ชื่อ\s*[-–/]?\s*นามสกุล|ชื่อและนามสกุล/.test(text),
        englishNameLabelDetected: /(?:^|\n)\s*(?:Name|Narne)\b/i.test(text),
        englishSurnameLabelDetected: /(?:^|\n)\s*Last\b/i.test(text),
        titledLineCount: Math.min(titled.length, 9),
        titleLineTokenCounts: titled.slice(0, 6).map(s => Math.min(s.split(/\s+/).length, 16)),
        titleLinesWithLatin: Math.min(titled.filter(s => /[A-Za-z]/.test(s)).length, 9),
        titleLinesWithDigits: Math.min(titled.filter(s => /\d/.test(s)).length, 9),
        distinctIdLikeCount: Math.min(ids.size, 9),
        fullNameValidation: state('fullName'), idCardValidation: state('idCard'),
        birthDateValidation: state('birthDate'), expiryDateValidation: state('expiryDate')
    };
}
function diagnosticLog(id, event, details) {
    if (!id || Date.now() >= exports.OCR_DIAGNOSTICS_UNTIL)
        return;
    // Only fixed enums, bounded numbers, booleans and bounded token-count arrays.
    const safe = {};
    const numbers = ['width', 'height', 'status', 'durationMs', 'lineCount', 'titledLineCount', 'titleLinesWithLatin', 'titleLinesWithDigits', 'distinctIdLikeCount'];
    const booleans = ['cropped', 'rectified', 'rotated', 'enhanced', 'jsonResponse', 'cardHeaderDetected', 'thaiNameLabelDetected', 'englishNameLabelDetected', 'englishSurnameLabelDetected'];
    for (const key of numbers)
        if (typeof details[key] === 'number' && Number.isFinite(details[key]))
            safe[key] = Math.max(0, Math.min(1000000, Math.floor(details[key])));
    for (const key of booleans)
        if (typeof details[key] === 'boolean')
            safe[key] = details[key];
    for (const key of ['fullNameValidation', 'idCardValidation', 'birthDateValidation', 'expiryDateValidation'])
        if (validStates.has(String(details[key])))
            safe[key] = details[key];
    if (Array.isArray(details.titleLineTokenCounts))
        safe.titleLineTokenCounts = details.titleLineTokenCounts.slice(0, 6).map(v => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(16, Math.floor(v))) : 0);
    try {
        console.error('PMYC_OCR_DIAG_V1 ' + JSON.stringify({ diagnosticId: id, event, at: new Date().toISOString(), parser: playerOcr_types_1.OCR_PARSER_REVISION, ...safe }));
    }
    catch { /* Diagnostics never change OCR behavior. */ }
}
/** Safe startup beacon verifies the real Passenger stderr sink without an OCR request. */
function announceOcrDiagnosticsReady() {
    const now = Date.now();
    if (process.env.NODE_ENV === 'production' && now >= Date.parse('2026-11-09T13:00:00Z') && now < exports.OCR_DIAGNOSTICS_UNTIL) {
        try {
            diagnosticLog((0, crypto_1.randomUUID)(), 'ready', {});
        }
        catch { /* Optional diagnostics never prevent startup. */ }
    }
}
announceOcrDiagnosticsReady();
