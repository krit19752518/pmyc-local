"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiConfiguration = exports.normalizeDate = exports.labels = exports.verificationFields = exports.VerificationError = void 0;
exports.compareVerification = compareVerification;
exports.validateReview = validateReview;
exports.readVerificationAsset = readVerificationAsset;
exports.verificationSnapshot = verificationSnapshot;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const db_1 = require("../db");
const playerVerification_reset_1 = require("./playerVerification.reset");
const playerOcr_types_1 = require("./playerOcr.types");
const playerOcr_date_1 = require("./playerOcr.date");
const playerOcr_name_1 = require("./playerOcr.name");
const playerVerification_details_1 = require("./playerVerification.details");
const playerOcr_document_1 = require("./playerOcr.document");
var playerOcr_types_2 = require("./playerOcr.types");
Object.defineProperty(exports, "VerificationError", { enumerable: true, get: function () { return playerOcr_types_2.VerificationError; } });
Object.defineProperty(exports, "verificationFields", { enumerable: true, get: function () { return playerOcr_types_2.verificationFields; } });
Object.defineProperty(exports, "labels", { enumerable: true, get: function () { return playerOcr_types_2.labels; } });
var playerOcr_date_2 = require("./playerOcr.date");
Object.defineProperty(exports, "normalizeDate", { enumerable: true, get: function () { return playerOcr_date_2.normalizeDate; } });
var playerOcr_config_1 = require("./playerOcr.config");
Object.defineProperty(exports, "aiConfiguration", { enumerable: true, get: function () { return playerOcr_config_1.ocrConfiguration; } });
function compareVerification(player, analysis, today = (0, playerOcr_date_1.bangkokToday)()) {
    const expiryCutoff = (0, playerOcr_date_1.previousCalendarDay)(today);
    const system = {
        fullName: (0, playerOcr_name_1.withoutNameTitle)(player.first_name && player.last_name
            ? [player.first_name, player.middle_name, player.last_name].filter(Boolean).join(' ')
            : player.name || [player.first_name, player.middle_name, player.last_name].filter(Boolean).join(' ')),
        idCard: player.id_card || '', birthDate: player.verification_birth_date ?? (player.birth_date instanceof Date
            ? `${player.birth_date.getFullYear()}-${String(player.birth_date.getMonth() + 1).padStart(2, '0')}-${String(player.birth_date.getDate()).padStart(2, '0')}` : String(player.birth_date || '')),
        expiryDate: ''
    };
    return playerOcr_types_1.verificationFields.map(field => {
        const stored = analysis.fields?.[field];
        // Project retained V5 candidates under current name rules without changing stored evidence.
        const read = field === 'fullName' && analysis.provider === 'iapp' && stored?.value && stored.validation !== 'AMBIGUOUS'
            ? (0, playerOcr_name_1.thaiNameField)([stored.value]) : stored;
        const rawValue = typeof read?.value === 'string' ? read.value.slice(0, 250) : '';
        const value = field === 'fullName' ? (0, playerOcr_name_1.withoutNameTitle)(rawValue) : rawValue;
        const confidence = typeof read?.confidence === 'number' && Number.isFinite(read.confidence) ? read.confidence : null;
        const normalize = (input) => field === 'birthDate' || field === 'expiryDate' ? (0, playerOcr_date_1.normalizeDate)(input)
            : field === 'idCard' ? (0, playerOcr_date_1.asciiDigits)(input).replace(/[\s-]/g, '') : (0, playerOcr_date_1.normalizeThaiName)(input);
        const observed = normalize(value), expected = normalize(system[field]);
        const blockedByDocument = !!(0, playerVerification_details_1.documentNotice)(analysis);
        // iApp plain text supplies no confidence. Deterministic format checks and comparison
        // are separate from provider confidence; neither approves a player automatically.
        const parsed = analysis.provider === 'iapp' && read?.validation === 'VALID';
        const usable = analysis.provider === 'iapp' ? parsed : confidence !== null && confidence >= 0.85;
        let status = 'UNCLEAR';
        if (field === 'expiryDate' && analysis.documentType === 'birth_certificate')
            status = 'NOT_APPLICABLE';
        else if (field === 'expiryDate' && usable && value === 'LIFETIME')
            status = 'NO_REFERENCE';
        else if (usable && observed && (field !== 'idCard' || (parsed ? (0, playerOcr_date_1.validThaiId)(observed) : /^\d{13}$/.test(observed))))
            status = !expected ? 'NO_REFERENCE' : observed === expected ? 'MATCH' : 'MISMATCH';
        const expired = !blockedByDocument && field === 'expiryDate' && usable && !!observed && observed <= expiryCutoff && status !== 'NOT_APPLICABLE';
        if (expired)
            status = 'EXPIRED_CARD';
        if (blockedByDocument && status !== 'NOT_APPLICABLE')
            status = 'UNCLEAR';
        const nameParts = field === 'fullName' && value ? (0, playerOcr_name_1.inspectThaiName)(value) : null;
        const expectedName = field === 'fullName' ? (0, playerOcr_name_1.inspectThaiName)(system.fullName) : null;
        const nameComparison = nameParts && expectedName ? {
            personalName: !nameParts.complete ? 'UNCLEAR' : !expectedName.personalName ? 'NO_REFERENCE' : (0, playerOcr_date_1.normalizeThaiName)(nameParts.personalName) === (0, playerOcr_date_1.normalizeThaiName)(expectedName.personalName) ? 'MATCH' : 'MISMATCH',
            ...(nameParts.givenName && nameParts.surname && expectedName.givenName && expectedName.surname ? {
                givenName: nameParts.givenName === expectedName.givenName ? 'MATCH' : 'MISMATCH',
                surname: nameParts.surname === expectedName.surname ? 'MATCH' : 'MISMATCH'
            } : {})
        } : undefined;
        const requiresManualDecision = blockedByDocument || field === 'fullName' && !!value && read?.validation === 'INVALID';
        const suggestedDecision = requiresManualDecision ? null : expired ? 'EXPIRED_CARD'
            : status === 'MATCH' || status === 'NOT_APPLICABLE' || field === 'expiryDate' && status === 'NO_REFERENCE' ? 'SYSTEM_CORRECT'
                : status === 'MISMATCH' || status === 'NO_REFERENCE' ? 'CORRECT_DATA' : 'REUPLOAD';
        const decisionReason = suggestedDecision === 'EXPIRED_CARD'
            ? 'บัตรประชาชนหมดอายุ กรุณาแนบบัตรใหม่ที่ยังไม่หมดอายุ (วันหมดอายุ: ' + observed + ')'
            : suggestedDecision === 'CORRECT_DATA' ? 'กรุณาตรวจสอบและแก้ไข' + playerOcr_types_1.labels[field] + 'ให้ตรงกับเอกสาร'
                : suggestedDecision === 'REUPLOAD' ? 'กรุณาอัปโหลดเอกสารใหม่เพื่อให้ตรวจสอบ' + playerOcr_types_1.labels[field] + 'ได้ชัดเจน' : '';
        const details = (0, playerVerification_details_1.comparisonDetails)(field, read, value, system[field], status, analysis);
        const english = field === 'fullName' && analysis.englishName;
        const englishName = english ? { givenName: english.givenName?.validation === 'VALID' && typeof english.givenName.value === 'string' ? english.givenName.value.slice(0, 100) : '',
            surname: english.surname?.validation === 'VALID' && typeof english.surname.value === 'string' ? english.surname.value.slice(0, 100) : '', labelsFound: english.labelsFound === true } : undefined;
        return { field, label: playerOcr_types_1.labels[field], systemValue: system[field], observedValue: value, confidence, status,
            validation: read?.validation || null, reason: details.join('\n'), details, requiresStaffReview: true, requiresManualDecision,
            expired, suggestedDecision, decisionReason, comparisonDate: today, expiryCutoff,
            ...(field === 'fullName' ? { nameComparison, englishName } : {}) };
    });
}
function validateReview(input) {
    if (input?.docStatus === 'PENDING') {
        if (typeof input.teamNote !== 'string' || input.teamNote.length > 4000)
            throw new playerOcr_types_1.VerificationError(400, 'หมายเหตุไม่ถูกต้อง');
        return { decisions: {}, decisionSources: {}, teamNote: input.teamNote.trim(), docStatus: 'PENDING', decisionStatus: 'PENDING', statusSource: 'MANUAL', reviewVersion: 2, reset: true };
    }
    if (!input || typeof input !== 'object' || !input.decisions || typeof input.decisions !== 'object' || Array.isArray(input.decisions))
        throw new playerOcr_types_1.VerificationError(400, 'กรุณาระบุผลการพิจารณา');
    const decisions = {};
    const decisionSources = {};
    if (input.decisionSources !== undefined && (!input.decisionSources || typeof input.decisionSources !== 'object' || Array.isArray(input.decisionSources)
        || Object.keys(input.decisionSources).some(key => !playerOcr_types_1.verificationFields.includes(key))))
        throw new playerOcr_types_1.VerificationError(400, 'ที่มาผลการพิจารณาไม่ถูกต้อง');
    for (const [field, choice] of Object.entries(input.decisions)) {
        if (!playerOcr_types_1.verificationFields.includes(field) || !['SYSTEM_CORRECT', 'CORRECT_DATA', 'REUPLOAD', 'EXPIRED_CARD'].includes(String(choice))
            || choice === 'EXPIRED_CARD' && field !== 'expiryDate')
            throw new playerOcr_types_1.VerificationError(400, 'ผลการพิจารณาไม่ถูกต้อง');
        decisions[field] = choice;
        const source = input.decisionSources?.[field] ?? 'STAFF_EDITED';
        if (!['AI_PREFILL', 'STAFF_EDITED', 'SAVED_REVIEW'].includes(source))
            throw new playerOcr_types_1.VerificationError(400, 'ที่มาผลการพิจารณาไม่ถูกต้อง');
        decisionSources[field] = source;
    }
    if (playerOcr_types_1.verificationFields.some(field => !decisions[field]))
        throw new playerOcr_types_1.VerificationError(400, 'กรุณาเลือกการตัดสินใจ กกท. ให้ครบทุกหัวข้อ');
    if (typeof input.teamNote !== 'string' || input.teamNote.length > 4000)
        throw new playerOcr_types_1.VerificationError(400, 'หมายเหตุไม่ถูกต้อง');
    const reasons = playerOcr_types_1.verificationFields.flatMap(field => decisions[field] === 'CORRECT_DATA'
        ? ['กรุณาตรวจสอบและแก้ไข' + playerOcr_types_1.labels[field] + 'ให้ตรงกับเอกสาร']
        : decisions[field] === 'REUPLOAD' ? ['กรุณาอัปโหลดเอกสารใหม่เพื่อให้ตรวจสอบ' + playerOcr_types_1.labels[field] + 'ได้ชัดเจน']
            : decisions[field] === 'EXPIRED_CARD' ? ['บัตรประชาชนหมดอายุ กรุณาแนบบัตรใหม่ที่ยังไม่หมดอายุ'] : []);
    let teamNote = input.teamNote.trim();
    for (const reason of reasons)
        if (!teamNote.includes(reason))
            teamNote += (teamNote ? '\n' : '') + '• ' + reason;
    if (teamNote.length > 4000)
        throw new playerOcr_types_1.VerificationError(400, 'หมายเหตุรวมเหตุผลต้องไม่เกิน 4000 ตัวอักษร');
    const decisionStatus = reasons.length ? 'ACTION_REQUIRED' : 'APPROVED';
    if (input.docStatus !== undefined && !['PENDING', 'APPROVED', 'ACTION_REQUIRED', 'CORRECTED'].includes(input.docStatus))
        throw new playerOcr_types_1.VerificationError(400, 'สถานะการตรวจสอบเอกสารไม่ถูกต้อง');
    return { decisions, decisionSources, teamNote, docStatus: input.docStatus ?? decisionStatus, decisionStatus,
        statusSource: input.docStatus === undefined ? 'DECISIONS' : 'MANUAL', reviewVersion: 3 };
}
/** Called only by authorized runtime requests. No import-time filesystem access. */
async function readVerificationAsset(url, root = path_1.default.resolve(__dirname, '../..')) {
    if (typeof url !== 'string' || !/^\/uploads\/[A-Za-z0-9_.-]+$/.test(url) || url.includes('..'))
        throw new playerOcr_types_1.VerificationError(422, 'ไม่พบไฟล์แนบที่รองรับ');
    // Match Express's static lookup order; an explicit override remains confined to that root.
    const roots = process.env.PLAYER_AI_ASSET_ROOT ? [process.env.PLAYER_AI_ASSET_ROOT]
        : [path_1.default.join(root, 'uploads'), path_1.default.join(root, 'public', 'uploads')];
    let opened;
    for (const configuredRoot of roots) {
        try {
            const base = await fs_1.promises.realpath(configuredRoot);
            const file = path_1.default.join(base, url.slice('/uploads/'.length));
            opened = { file, handle: await fs_1.promises.open(file, fs_1.constants.O_RDONLY | fs_1.constants.O_NOFOLLOW) };
            break;
        }
        catch (error) {
            // Never bypass a denied, symlinked or otherwise invalid primary file.
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
    if (!opened)
        throw new playerOcr_types_1.VerificationError(422, 'ไม่พบไฟล์เอกสารแนบ กรุณาติดต่อผู้ดูแลระบบ', 'OCR_DOCUMENT_NOT_FOUND');
    const { file, handle } = opened;
    try {
        const real = await fs_1.promises.realpath(file);
        const stat = await handle.stat();
        // Refuse symlinks (including a target replaced during resolution).
        const link = await fs_1.promises.lstat(file);
        const current = await fs_1.promises.stat(real);
        if (real !== file || link.isSymbolicLink() || current.ino !== stat.ino || !stat.isFile() || stat.size > 12 * 1024 * 1024)
            throw new playerOcr_types_1.VerificationError(422, 'ไฟล์แนบไม่ถูกต้องหรือมีขนาดใหญ่เกินไป');
        const buffer = Buffer.alloc(Math.min(stat.size + 1, 12 * 1024 * 1024 + 1));
        let length = 0;
        while (length < buffer.length) {
            const read = await handle.read(buffer, length, buffer.length - length, null);
            if (!read.bytesRead)
                break;
            length += read.bytesRead;
        }
        if (length !== stat.size)
            throw new playerOcr_types_1.VerificationError(409, 'ไฟล์แนบเปลี่ยนระหว่างอ่าน กรุณาลองใหม่');
        const bytes = buffer.subarray(0, length);
        const type = bytes.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf'
            : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
                : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png' : '';
        if (!type)
            throw new playerOcr_types_1.VerificationError(422, 'รองรับเอกสาร PDF, JPG และ PNG เท่านั้น');
        return { bytes, type, sha256: (0, crypto_1.createHash)('sha256').update(bytes).digest('hex') };
    }
    finally {
        await handle.close();
    }
}
async function verificationSnapshot(player, inputSelection) {
    const document = await readVerificationAsset(player.doc_id_card);
    const info = await (0, playerOcr_document_1.inspectOcrDocument)(document);
    const selection = (0, playerOcr_document_1.selectionOf)(inputSelection);
    if (selection.page > info.pages)
        throw new playerOcr_types_1.VerificationError(400, 'หน้าที่เลือกไม่มีในเอกสาร');
    const generation = await (0, playerVerification_reset_1.resetGeneration)(player.id, db_1.pool);
    const cacheKey = (0, playerVerification_reset_1.resetBoundKey)((0, playerOcr_document_1.ocrCacheKey)(document.sha256, selection), generation);
    const sourceHash = (0, playerVerification_reset_1.resetBoundKey)((0, crypto_1.createHash)('sha256').update(JSON.stringify([player.id, player.team_id, player.name, player.prefix,
        player.first_name, player.middle_name, player.last_name, player.id_card, player.verification_birth_date ?? player.birth_date,
        document.sha256, selection, playerOcr_types_1.OCR_SOURCE_BINDING_REVISION])).digest('hex'), generation);
    return { sourceHash, cacheKey, document, info, selection, resetGeneration: generation };
}
