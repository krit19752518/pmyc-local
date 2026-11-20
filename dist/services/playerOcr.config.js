"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ocrConfiguration = ocrConfiguration;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const playerOcr_types_1 = require("./playerOcr.types");
function setting(value, fallback, max) {
    if (value === undefined || value === '')
        return fallback;
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1 || n > max)
        throw new playerOcr_types_1.VerificationError(503, 'การตั้งค่าเพดาน OCR ไม่ถูกต้อง', 'OCR_CONFIG_INVALID');
    return n;
}
function ocrConfiguration(requireKey = true) {
    let local = {};
    if (!['production', 'test'].includes(process.env.NODE_ENV || '')) {
        const file = process.env.PLAYER_OCR_CONFIG_FILE || path_1.default.resolve(__dirname, '../../.runtime/player-ocr.local.json');
        try {
            const stat = (0, fs_1.lstatSync)(file);
            if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.size > 8192)
                throw new Error('Unsafe local configuration');
            local = JSON.parse((0, fs_1.readFileSync)(file, 'utf8'));
        }
        catch { /* A missing or unsafe file never grants access to paid OCR. */ }
    }
    const key = String(process.env.IAPP_API_KEY || local.apiKey || '').trim();
    const enabled = (process.env.PLAYER_OCR_ENABLED ?? local.enabled) === 'true' || (process.env.PLAYER_OCR_ENABLED === undefined && local.enabled === true);
    if (requireKey && (!enabled || key.length < 8 || /[\r\n]/.test(key)))
        throw new playerOcr_types_1.VerificationError(503, 'ยังไม่ได้เปิดใช้ iApp OCR หรือยังไม่ได้ตั้ง API key กรุณาติดต่อผู้ดูแลระบบ', 'OCR_NOT_CONFIGURED');
    const budgetId = String(process.env.PLAYER_OCR_BUDGET_ID || local.budgetId || 'football-iapp-trial');
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(budgetId))
        throw new playerOcr_types_1.VerificationError(503, 'การตั้งค่างบ OCR ไม่ถูกต้อง', 'OCR_CONFIG_INVALID');
    const quotaMode = process.env.PLAYER_OCR_QUOTA_MODE ?? local.quotaMode ?? 'limited';
    if (quotaMode !== 'limited' && quotaMode !== 'unlimited')
        throw new playerOcr_types_1.VerificationError(503, 'การตั้งค่าโควตา OCR ไม่ถูกต้อง', 'OCR_CONFIG_INVALID');
    return { key, url: playerOcr_types_1.IAPP_OCR_ENDPOINT, revision: playerOcr_types_1.OCR_PARSER_REVISION, budgetId, quotaMode,
        dailyPageLimit: setting(process.env.PLAYER_OCR_DAILY_PAGE_LIMIT ?? local.dailyPageLimit, 100, 1000000),
        monthlyPageLimit: setting(process.env.PLAYER_OCR_MONTHLY_PAGE_LIMIT ?? local.monthlyPageLimit, 500, 5000000),
        trialPageLimit: setting(process.env.PLAYER_OCR_TRIAL_PAGE_LIMIT ?? local.trialPageLimit, 100, 5000000) };
}
