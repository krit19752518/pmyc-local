"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseIappText = parseIappText;
const playerOcr_date_1 = require("./playerOcr.date");
const playerOcr_types_1 = require("./playerOcr.types");
const playerOcr_name_1 = require("./playerOcr.name");
const empty = (reason = 'ไม่พบข้อมูลที่อ่านได้ชัดเจน') => ({ value: '', confidence: null, validation: 'MISSING', reason });
const unique = (values) => [...new Set(values.filter(Boolean))];
function choice(values, normalize, validate = (_) => true) {
    const candidates = unique(values.map(value => normalize(value) || '').filter(Boolean));
    if (candidates.length > 1)
        return { value: '', confidence: null, validation: 'AMBIGUOUS', reason: 'พบข้อมูลหลายค่าที่ขัดแย้งกัน กรุณาตรวจต้นฉบับ' };
    if (!candidates.length)
        return values.length ? { value: values[0].slice(0, 250), confidence: null, validation: 'INVALID', reason: 'รูปแบบข้อมูลที่อ่านได้ไม่ถูกต้อง' } : empty();
    const value = candidates[0];
    return { value, confidence: null, validation: validate(value) ? 'VALID' : 'INVALID',
        ...(!validate(value) ? { reason: 'ข้อมูลไม่ผ่านการตรวจรูปแบบ กรุณาตรวจต้นฉบับ' } : {}) };
}
// Bounded OCR variants apply to labels only, never to field values or digits.
const birthLabel = /เกิ[ดต]วันที่|วัน\s*เดือน\s*ปีเกิด|วันเกิด|D[au]t[ae]\s*[oae]f\s*Birth/i;
const expiryLabel = /วันบัตรหมดอาย[ุ]?|วันหมดอายุ|D[au]t[ae]\s*[oae]f\s*E[xs]pir[yv]|Expiry\s*Date|Expiration\s*Date/i;
const issueLabel = /วัน[อล]อกบัตร|วันที่ออกบัตร|D[au]t[ae]\s*[oae]f\s*Issue/i;
const dates = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\b|\d{1,2}\s*[A-Za-zก-๙.]+(?:\s*[A-Za-zก-๙.]+)?\s*\d{4}/g;
function fieldDates(lines, label, other) {
    const values = [], fragments = [];
    let lifetime = false, unalignedColumns = false;
    lines.forEach((line, index) => {
        if (!label.test(line))
            return;
        const inline = line.replace(label, ' ');
        if (!inline.match(dates) && /\d/.test(inline) && !other.test(inline) && !issueLabel.test(inline))
            fragments.push(inline.trim().slice(0, 100));
        // Flattened two-column cards: both labels explicitly establish date order.
        // Never infer expiry from age, DOB, expected data or an unlabeled date pair.
        const columnLabels = label === expiryLabel ? (issueLabel.test(line) ? line :
            lines.slice(Math.max(0, index - 2), index).find(s => issueLabel.test(s) && expiryLabel.test(s))) : undefined;
        if (columnLabels) {
            const candidates = [line, lines[index - 1] || '', lines[index + 1] || ''];
            const expiryFirst = columnLabels.search(expiryLabel) < columnLabels.search(issueLabel);
            for (const candidate of candidates) {
                const found = candidate.match(dates) || [];
                if (found.length === 2) {
                    values.push(found[expiryFirst ? 0 : 1]);
                    break;
                }
            }
            return;
        }
        // Prefer dates attached to their label. A wider text window can reach the
        // issue date after a birth-date line when OCR flattens the card layout.
        const near = inline.match(dates)?.length || /ตลอดชีพ|life\s*time|life\s*long/i.test(inline)
            ? [line] : [lines[index - 1] || '', line, lines[index + 1] || ''];
        for (const neighbor of near) {
            if (other.test(neighbor) || issueLabel.test(neighbor))
                continue;
            const clean = neighbor.replace(label, ' ');
            if (/ตลอดชีพ|life\s*time|life\s*long/i.test(clean))
                lifetime = true;
            const found = clean.match(dates) || [];
            if (neighbor !== line && found.length > 1) {
                unalignedColumns = true;
                continue;
            }
            // A Thai label must not borrow the adjacent English issue-date column.
            // Independently labeled Thai/English dates are still compared for conflict.
            const thaiLabel = /[ก-๙]/.test(line.match(label)?.[0] || '');
            values.push(...found.filter(value => neighbor === line || !(thaiLabel ? /[A-Za-z]/.test(value) : /[ก-๙]/.test(value))));
        }
    });
    if (unalignedColumns)
        return { value: '', confidence: null, validation: 'AMBIGUOUS', reason: 'พบวันที่หลายคอลัมน์แต่ป้ายกำกับไม่ชัด กรุณาตรวจต้นฉบับ' };
    if (lifetime && values.length)
        return { value: '', confidence: null, validation: 'AMBIGUOUS', reason: 'พบทั้งวันหมดอายุและข้อความตลอดชีพ' };
    if (lifetime && label === expiryLabel)
        return { value: 'LIFETIME', confidence: null, validation: 'VALID' };
    const result = choice(values, playerOcr_date_1.normalizeDate);
    if (result.validation === 'MISSING' && unique(fragments).length === 1)
        return { value: fragments[0], confidence: null, validation: 'INVALID', reason: 'ข้อความวันที่ที่อ่านได้ไม่ครบวัน เดือน ปี' };
    return result;
}
/** Deterministic extraction only. Never uses an athlete's expected values or an LLM. */
function parseIappText(text) {
    if (typeof text !== 'string' || text.length > 200000)
        throw new Error('Invalid OCR text');
    const lines = (0, playerOcr_date_1.asciiDigits)(text.normalize('NFC').replace(/[\u200b-\u200f\ufeff]/g, '')).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const whole = lines.join('\n');
    const isCard = /บัตร\s*ประจำตัว\s*ประชาชน|Thai\s*National\s*ID\s*Card|Identification\s*Number|เลขประจำตัวประชาชน/i.test(whole);
    const isBirth = !isCard && /สูติบัตร|Birth\s*Certificate/i.test(whole);
    const result = { provider: 'iapp', modelVersion: playerOcr_types_1.OCR_PARSER_REVISION, documentType: isCard ? 'id_card' : isBirth ? 'birth_certificate' : 'unknown',
        fields: Object.fromEntries(playerOcr_types_1.verificationFields.map(field => [field, empty()])), requiresStaffReview: true };
    if (!isCard && !isBirth) {
        result.documentIssue = 'UNKNOWN_TYPE';
        return result;
    }
    // Restrict card fields to printed card text; handwritten copy certification follows it.
    const end = lines.findIndex(line => /สำเนาถูกต้อง|รับรองสำเนา|certified\s*(true\s*)?copy/i.test(line));
    const body = end < 0 ? lines : lines.slice(0, end);
    const idValues = [];
    body.forEach((line, i) => {
        if (!/เลข\s*(ประจำตัว\s*)?ประชาชน|Identification\s*Number|เลขประจำตัว/i.test(line))
            return;
        for (const neighbor of [body[i - 1] || '', line, body[i + 1] || '']) {
            const matches = neighbor.match(/(?<!\d)(?:\d[ \t-]*){12}\d(?![ \t-]*\d)/g) || [];
            idValues.push(...matches.map(s => s.replace(/[\s-]/g, '')));
        }
    });
    // A number can be separated from its OCR-damaged label by another header line.
    // Restrict the fallback to the header preceding the name/DOB/address block.
    if (isCard)
        for (const line of body.slice(0, 6)) {
            if (/ชื่อตัว|ชื่อและ|Name|เกิด|ที่อยู่/i.test(line) || /(?:ด\s*\.\s*ช|ด\s*\.\s*ญ|นาย|นาง)\s*/.test(line))
                break;
            idValues.push(...(line.match(/(?<!\d)(?:\d[ \t-]*){12}\d(?![ \t-]*\d)/g) || []).map(s => s.replace(/[\s-]/g, '')));
        }
    result.fields.idCard = choice(idValues, value => value, playerOcr_date_1.validThaiId);
    if (!idValues.length) {
        const partials = [];
        body.forEach((line, i) => {
            const label = line.match(/เลข\s*(ประจำตัว\s*)?ประชาชน|Identification\s*Number|เลขประจำตัว/i);
            if (!label)
                return;
            for (const text of [line.slice(label.index + label[0].length).replace(/^\s*[:：]\s*/, ''), body[i + 1] || '']) {
                if (/^\s*(?:\d[ \t-]*){5,19}\d\s*$/.test(text))
                    partials.push(text.replace(/[\s-]/g, ''));
            }
        });
        if (unique(partials).length === 1)
            result.fields.idCard = { value: partials[0], confidence: null, validation: 'INVALID', reasonCode: 'ID_INCOMPLETE' };
    }
    if (unique(idValues).length > 1) {
        result.documentType = 'unknown';
        result.documentIssue = 'MULTIPLE_IDS';
        result.fields = Object.fromEntries(playerOcr_types_1.verificationFields.map(field => [field, { ...empty('พบเลขบัตรหลายค่า กรุณาเลือกเฉพาะหน้าบัตรหนึ่งใบ'), validation: 'AMBIGUOUS' }]));
        return result;
    }
    const names = [];
    const titleStart = /^(?:เด็กชาย|เด็กหญิง|นาย|นางสาว|นาง|ด\s*\.\s*ช\s*\.?|ด\s*\.\s*ญ\s*\.?|น\s*\.\s*ส\s*\.?)/;
    const title = /^(?:เด็กชาย|เด็กหญิง|นาย|นางสาว|นาง|ด\s*\.\s*ช\s*\.?|ด\s*\.\s*ญ\s*\.?|น\s*\.\s*ส\s*\.?)\s*[ก-๙]+(?:\s+[ก-๙]+)+$/;
    const nameLabel = /ชื่อตัว\s*และ\s*ชื่อสกุล|ชื่อ\s*[-–/]?\s*นามสกุล|ชื่อและนามสกุล/;
    const nameBoundary = /^(?:Name\b|Narne\b|Last\b|Date\b|เกิดวันที่|วันเกิด|วันเดือนปีเกิด|ที่อยู่|วัน.*(?:หมดอายุ|ออกบัตร)|ศาสนา|Religion|เพศ|สัญชาติ|หมู่โลหิต|เชื้อชาติ|นายทะเบียน|เจ้าพนักงาน|สำเนา|รับรอง|บัตรประจำตัว|Identification|เลขประจำตัว)/i;
    // Assemble only contiguous Thai name fragments, never cross a printed field boundary.
    // A second title starts another candidate rather than becoming someone's surname.
    function collectName(index, initial) {
        const fragments = initial ? [initial] : [];
        const count = initial ? 3 : 4;
        for (const line of body.slice(index + 1, index + 1 + count)) {
            if (nameBoundary.test(line) || nameLabel.test(line) || !/^[ก-๙.\s]+$/.test(line) || fragments.length && (title.test(line) || titleStart.test(line) && line.replace(titleStart, '').trim() === ''))
                break;
            fragments.push(line);
        }
        const candidate = fragments.join(' ').trim();
        return candidate.length <= 250 && !nameBoundary.test(candidate) ? candidate : '';
    }
    body.forEach((line, i) => {
        const label = line.match(nameLabel);
        if (!label)
            return;
        const tail = line.slice(label.index + label[0].length).replace(/^\s*[:：]?\s*/, '').split(/\s+(?:Name\b|Narne\b|Last\s*name\b|Date\b|เกิดวันที่|วันเกิด|ที่อยู่|ศาสนา|Religion\b)/i)[0].trim();
        const candidate = collectName(i, tail);
        if (candidate)
            names.push(candidate);
    });
    // OCR may damage the Thai name label. Accept a complete titled Thai name
    // only inside the ID/name block, bounded by an ID label and English surname
    // label. Never search address, issuer or copy-certification text for names.
    if (isCard)
        body.forEach((line, i) => {
            const preceding = body.slice(Math.max(0, i - 6), i);
            const following = body.slice(i + 1, i + 6);
            const headerBound = preceding.some(s => /Identification\s*Number|เลข\s*(ประจำตัว\s*)?ประชาชน|เลขประจำตัว/i.test(s)) ||
                i < 6 && preceding.some(s => /(?:\d[ \t-]*){12}\d/.test(s));
            if (!headerBound ||
                !following.some(s => /^Last\b|^Na(?:m|rn)e\s+(?:Master|Miss|Mr\.?|Mrs\.?)\b/i.test(s)) ||
                preceding.some(s => /เกิด|ที่อยู่|หมดอายุ|ออกบัตร|สำเนา|รับรอง/.test(s)) || nameBoundary.test(line))
                return;
            const tail = line.match(/(?:^|\s)((?:เด็กชาย|เด็กหญิง|นาย|นางสาว|นาง|ด\s*\.\s*ช\s*\.?|ด\s*\.\s*ญ\s*\.?|น\s*\.\s*ส\s*\.?)[\sก-๙.]+)$/)?.[1];
            const candidate = tail ? collectName(i, tail) : !nameLabel.test(line) && (0, playerOcr_name_1.inspectThaiName)(line).givenName ? collectName(i, line) : '';
            if (candidate)
                names.push(candidate);
        });
    result.fields.fullName = (0, playerOcr_name_1.thaiNameField)(names);
    const endName = body.findIndex(line => birthLabel.test(line) || /^(?:ที่อยู่|ศาสนา|Religion|เพศ|วัน.*(?:ออกบัตร|หมดอายุ))/i.test(line));
    if (isCard)
        result.englishName = (0, playerOcr_name_1.englishNameFields)(endName < 0 ? body : body.slice(0, endName));
    result.fields.birthDate = fieldDates(body, birthLabel, expiryLabel);
    result.fields.expiryDate = isBirth ? empty('สูติบัตรไม่มีวันหมดอายุ') : fieldDates(body, expiryLabel, birthLabel);
    return result;
}
