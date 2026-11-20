"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCorners = validateCorners;
exports.cornerBox = cornerBox;
exports.rectifyCard = rectifyCard;
const sharp_1 = __importDefault(require("sharp"));
const playerOcr_types_1 = require("./playerOcr.types");
function validateCorners(input) {
    const bad = () => new playerOcr_types_1.VerificationError(400, 'กรุณาเลือกมุมบัตรตามลำดับ ซ้ายบน ขวาบน ขวาล่าง ซ้ายล่าง');
    if (!Array.isArray(input) || input.length !== 4)
        throw bad();
    const points = input.map(p => {
        if (!p || typeof p !== 'object' || Object.keys(p).some(k => !['x', 'y'].includes(k)) ||
            !['x', 'y'].every(k => typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 1))
            throw bad();
        return { x: Number(p.x.toFixed(6)), y: Number(p.y.toFixed(6)) };
    });
    let area = 0;
    for (let i = 0; i < 4; i++) {
        const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4];
        if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0.00001)
            throw bad();
        area += a.x * b.y - b.x * a.y;
    }
    if (area / 2 < .005)
        throw bad();
    return points;
}
function cornerBox(points) {
    const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
    return { x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y };
}
/** Inverse projective mapping, bilinear sampling only; never generates text. */
async function rectifyCard(bytes, normalized) {
    const { data, info } = await (0, sharp_1.default)(bytes).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const p = normalized.map(q => ({ x: q.x * (info.width - 1), y: q.y * (info.height - 1) }));
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const w = (distance(p[0], p[1]) + distance(p[3], p[2])) / 2, h = (distance(p[0], p[3]) + distance(p[1], p[2])) / 2;
    if (w < 200 || h < 120)
        throw new playerOcr_types_1.VerificationError(422, 'กรอบหน้าบัตรเล็กเกินไป กรุณาเลือกกรอบให้ครอบคลุมข้อมูลทั้งสี่ช่อง');
    const factor = Math.min(1, 2800 / Math.max(w, h));
    const width = Math.round(w * factor), height = Math.round(h * factor);
    const dx1 = p[1].x - p[2].x, dx2 = p[3].x - p[2].x, dx3 = p[0].x - p[1].x + p[2].x - p[3].x;
    const dy1 = p[1].y - p[2].y, dy2 = p[3].y - p[2].y, dy3 = p[0].y - p[1].y + p[2].y - p[3].y;
    const det = dx1 * dy2 - dx2 * dy1;
    const g = (dx3 * dy2 - dx2 * dy3) / det, k = (dx1 * dy3 - dx3 * dy1) / det;
    const a = p[1].x - p[0].x + g * p[1].x, b = p[3].x - p[0].x + k * p[3].x, c = p[0].x;
    const d = p[1].y - p[0].y + g * p[1].y, e = p[3].y - p[0].y + k * p[3].y, f = p[0].y;
    const output = Buffer.alloc(width * height * 3, 255);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const u = x / (width - 1), v = y / (height - 1), den = g * u + k * v + 1;
            const sx = Math.max(0, Math.min(info.width - 1, (a * u + b * v + c) / den)), sy = Math.max(0, Math.min(info.height - 1, (d * u + e * v + f) / den));
            if (!Number.isFinite(sx) || !Number.isFinite(sy))
                throw new playerOcr_types_1.VerificationError(422, 'ไม่สามารถปรับมุมบัตรนี้ได้');
            const left = Math.floor(sx), top = Math.floor(sy), right = Math.min(info.width - 1, left + 1), bottom = Math.min(info.height - 1, top + 1), fx = sx - left, fy = sy - top;
            for (let channel = 0; channel < 3; channel++) {
                const pixel = (xx, yy) => data[(yy * info.width + xx) * info.channels + channel];
                output[(y * width + x) * 3 + channel] = Math.round((1 - fy) * ((1 - fx) * pixel(left, top) + fx * pixel(right, top)) + fy * ((1 - fx) * pixel(left, bottom) + fx * pixel(right, bottom)));
            }
        }
    return (0, sharp_1.default)(output, { raw: { width, height, channels: 3 } }).png().toBuffer();
}
