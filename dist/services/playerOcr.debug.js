"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OCR_DEBUG_END = exports.OCR_DEBUG_ROOT = void 0;
exports.nameDebugReasons = nameDebugReasons;
exports.debugEvent = debugEvent;
exports.purgeExpiredDebug = purgeExpiredDebug;
exports.captureOcrDebug = captureOcrDebug;
exports.startDebugExpiryCleanup = startDebugExpiryCleanup;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
// Operational control and captures are outside both the web root and application tree.
exports.OCR_DEBUG_ROOT = '/home/zbpzpszw/football_app/ocr-debug-issue59';
exports.OCR_DEBUG_END = Date.parse('2026-11-10T15:30:00Z');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function nameDebugReasons(text) {
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const titled = lines.filter(s => /(?:เด็กชาย|เด็กหญิง|นาย|นาง|ด\s*\.\s*[ชญ])/.test(s));
    const reasons = [];
    if (!titled.length)
        reasons.push('TITLE_NOT_DETECTED');
    if (titled.some(s => /[A-Za-z]/.test(s)))
        reasons.push('TITLE_LINE_CONTAINS_LATIN');
    if (titled.some(s => /\d|[๐-๙]/.test(s)))
        reasons.push('TITLE_LINE_CONTAINS_DIGITS');
    if (!/ชื่อตัว\s*และ\s*ชื่อสกุล|ชื่อ\s*[-–/]?\s*นามสกุล|ชื่อและนามสกุล/.test(text))
        reasons.push('THAI_NAME_LABEL_NOT_DETECTED');
    return reasons.length ? reasons : ['NAME_BLOCK_REJECTED'];
}
/** No image, request headers, API key, player name or OCR text enters stderr. */
function debugEvent(event, jobId, reasons = []) {
    if (!uuid.test(jobId))
        return;
    const allowed = new Set(['TITLE_NOT_DETECTED', 'TITLE_LINE_CONTAINS_LATIN', 'TITLE_LINE_CONTAINS_DIGITS', 'THAI_NAME_LABEL_NOT_DETECTED', 'NAME_BLOCK_REJECTED']);
    const safe = reasons.filter(r => allowed.has(r));
    if (!['captured', 'capture_failed', 'disabled', 'limit_reached', 'expired', 'not_needed'].includes(event))
        return;
    try {
        console.error('PMYC_OCR_DEBUG_V2 ' + JSON.stringify({ event, jobId, at: new Date().toISOString(), reasons: safe }));
    }
    catch { /* Optional diagnostic only. */ }
}
async function privateFile(file) {
    const handle = await fs_1.promises.open(file, fs_1.constants.O_RDONLY | fs_1.constants.O_NOFOLLOW);
    try {
        const stat = await handle.stat();
        if (!stat.isFile() || (stat.mode & 0o077) || stat.size > 600000)
            throw Error('UNSAFE_DEBUG_FILE');
        return await handle.readFile('utf8');
    }
    finally {
        await handle.close();
    }
}
/** Remove only this feature's exact capture/slot names; never traverse subdirectories. */
async function purgeExpiredDebug(root = exports.OCR_DEBUG_ROOT, now = Date.now()) {
    const stat = await fs_1.promises.lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077))
        throw Error('UNSAFE_DEBUG_ROOT');
    const control = JSON.parse(await privateFile(path_1.default.join(root, 'control.json')));
    const until = Math.min(Date.parse(control.expiresAt), exports.OCR_DEBUG_END);
    if (!Number.isFinite(until) || now < until)
        return;
    for (const name of await fs_1.promises.readdir(root)) {
        if (!/^(?:capture-[a-f0-9-]{36}\.json|slot-[1-3])$/.test(name))
            continue;
        try {
            await fs_1.promises.unlink(path_1.default.join(root, name));
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
    }
}
/** Called only after an explicit manual paid retry for the single configured athlete. */
async function captureOcrDebug(context, response, analysis, meta, root = exports.OCR_DEBUG_ROOT, now = Date.now()) {
    if (!context?.manualRetry || !uuid.test(context.jobId) || process.env.NODE_ENV !== 'production')
        return false;
    let handle;
    try {
        const stat = await fs_1.promises.lstat(root);
        if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077))
            throw Error('UNSAFE_DEBUG_ROOT');
        const control = JSON.parse(await privateFile(path_1.default.join(root, 'control.json')));
        if (!/^[a-f0-9]{64}$/.test(control.playerHash) || (0, crypto_1.createHash)('sha256').update(context.playerId).digest('hex') !== control.playerHash)
            return false;
        const until = Math.min(Date.parse(control.expiresAt), exports.OCR_DEBUG_END);
        if (!Number.isFinite(until) || now >= until) {
            await purgeExpiredDebug(root, now);
            debugEvent('expired', context.jobId);
            return false;
        }
        if (analysis.fields.fullName.validation === 'VALID') {
            debugEvent('not_needed', context.jobId);
            return false;
        }
        if (!Number.isInteger(control.maxCaptures) || control.maxCaptures < 1 || control.maxCaptures > 3)
            throw Error('UNSAFE_DEBUG_LIMIT');
        const provider = response;
        if (!provider || !Array.isArray(provider.text) || provider.text.length !== 1 || typeof provider.text[0] !== 'string' || provider.text[0].length > 200000)
            throw Error('INVALID_DEBUG_RESPONSE');
        // Retain only the provider's original OCR text; discard arbitrary JSON extensions.
        const text = provider.text[0], reasons = nameDebugReasons(text);
        let reserved = false;
        for (let i = 1; i <= control.maxCaptures; i++) {
            try {
                const slot = await fs_1.promises.open(path_1.default.join(root, 'slot-' + i), fs_1.constants.O_WRONLY | fs_1.constants.O_CREAT | fs_1.constants.O_EXCL | fs_1.constants.O_NOFOLLOW, 0o600);
                await slot.close();
                reserved = true;
                break;
            }
            catch (error) {
                if (error.code !== 'EEXIST')
                    throw error;
            }
        }
        if (!reserved) {
            debugEvent('limit_reached', context.jobId);
            return false;
        }
        const target = path_1.default.join(root, 'capture-' + context.jobId + '.json');
        handle = await fs_1.promises.open(target, fs_1.constants.O_WRONLY | fs_1.constants.O_CREAT | fs_1.constants.O_EXCL | fs_1.constants.O_NOFOLLOW, 0o600);
        const record = { jobId: context.jobId, createdAt: new Date(now).toISOString(), expiresAt: new Date(until).toISOString(), parser: analysis.modelVersion,
            request: { provider: 'iapp', endpoint: 'document/ocr', method: 'POST', pages: 1, width: meta.width, height: meta.height, selection: meta.selection },
            response: { status: meta.status, durationMs: meta.durationMs, text: [text] }, nameValidation: analysis.fields.fullName.validation, reasons };
        await handle.writeFile(JSON.stringify(record));
        await handle.close();
        handle = undefined;
        debugEvent('captured', context.jobId, reasons);
        return true;
    }
    catch {
        debugEvent('capture_failed', context.jobId);
        return false;
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
// No startup mkdir or DDL. Cleanup is limited to the private diagnostic directory.
function startDebugExpiryCleanup() {
    if (process.env.NODE_ENV !== 'production')
        return;
    const cleanup = () => { void purgeExpiredDebug().catch(() => undefined); };
    cleanup();
    const timer = setInterval(cleanup, 60000);
    timer.unref();
    return timer;
}
