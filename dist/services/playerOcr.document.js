"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectionOf = selectionOf;
exports.inspectOcrDocument = inspectOcrDocument;
exports.previewOcrDocument = previewOcrDocument;
exports.prepareOcrDocument = prepareOcrDocument;
exports.inspectPreparedQuality = inspectPreparedQuality;
exports.ocrCacheKey = ocrCacheKey;
const crypto_1 = require("crypto");
const worker_threads_1 = require("worker_threads");
const url_1 = require("url");
const sharp_1 = __importDefault(require("sharp"));
const pdf_lib_1 = require("pdf-lib");
const playerOcr_types_1 = require("./playerOcr.types");
const playerOcr_geometry_1 = require("./playerOcr.geometry");
let rendering = false;
function selectionOf(input) {
    if (input === undefined || input === null)
        return { page: 1 };
    if (typeof input !== 'object' || Array.isArray(input))
        throw new playerOcr_types_1.VerificationError(400, 'การเลือกเอกสารไม่ถูกต้อง');
    const value = input;
    const page = value.page ?? 1;
    if (!Number.isInteger(page) || page < 1 || page > 4 || Object.keys(value).some(k => !['page', 'crop', 'corners', 'rotation', 'enhance'].includes(k)))
        throw new playerOcr_types_1.VerificationError(400, 'หน้าที่เลือกไม่ถูกต้อง');
    if (value.rotation !== undefined && (typeof value.rotation !== 'number' || !Number.isFinite(value.rotation) || Math.abs(value.rotation) > 15))
        throw new playerOcr_types_1.VerificationError(400, 'ปรับเอียงได้ตั้งแต่ -15 ถึง 15 องศา');
    if (value.enhance !== undefined && typeof value.enhance !== 'boolean')
        throw new playerOcr_types_1.VerificationError(400, 'การปรับแสงไม่ถูกต้อง');
    const options = { ...(value.rotation ? { rotation: Number(value.rotation.toFixed(2)) } : {}), ...(value.enhance ? { enhance: true } : {}) };
    if (value.corners !== undefined) {
        if (value.crop !== undefined)
            throw new playerOcr_types_1.VerificationError(400, 'เลือกกรอบหรือมุมบัตรอย่างใดอย่างหนึ่ง');
        return { page, corners: (0, playerOcr_geometry_1.validateCorners)(value.corners), ...options };
    }
    if (!value.crop)
        return { page, ...options };
    const c = value.crop;
    if (typeof c !== 'object' || Array.isArray(c) || Object.keys(c).some(k => !['x', 'y', 'width', 'height'].includes(k)) ||
        !['x', 'y', 'width', 'height'].every(k => typeof c[k] === 'number' && Number.isFinite(c[k])) ||
        c.x < 0 || c.y < 0 || c.width <= 0 || c.height <= 0 || c.x + c.width > 1.000001 || c.y + c.height > 1.000001)
        throw new playerOcr_types_1.VerificationError(400, 'กรอบหน้าบัตรไม่ถูกต้อง');
    return { page, crop: { x: Number(c.x.toFixed(6)), y: Number(c.y.toFixed(6)), width: Number(c.width.toFixed(6)), height: Number(c.height.toFixed(6)) }, ...options };
}
async function inspectOcrDocument(asset) {
    try {
        if (asset.type === 'application/pdf') {
            const pdf = await pdf_lib_1.PDFDocument.load(asset.bytes, { updateMetadata: false });
            const pages = pdf.getPageCount();
            if (pages < 1 || pages > 4)
                throw new playerOcr_types_1.VerificationError(422, 'รองรับ PDF ไม่เกิน 4 หน้า กรุณาเลือกเอกสารที่มีเฉพาะบัตร');
            const first = pdf.getPage(0), box = first.getCropBox(), rotate = first.getRotation().angle % 180 !== 0;
            return { type: asset.type, pages, width: rotate ? box.height : box.width, height: rotate ? box.width : box.height, requiresPreparation: true };
        }
        const meta = await (0, sharp_1.default)(asset.bytes, { limitInputPixels: 20000000, failOn: 'warning' }).metadata();
        if (!meta.width || !meta.height || (meta.pages || 1) !== 1 || !['jpeg', 'png'].includes(meta.format || ''))
            throw new Error('Unsupported image');
        const swap = [5, 6, 7, 8].includes(meta.orientation || 0);
        const width = swap ? meta.height : meta.width, height = swap ? meta.width : meta.height;
        if (width < 200 || height < 120)
            throw new playerOcr_types_1.VerificationError(422, 'ภาพมีขนาดเล็กเกินไป กรุณาอัปโหลดภาพที่อ่านตัวอักษรได้ชัดเจน');
        return { type: asset.type, pages: 1, width, height, requiresPreparation: width / height < 1.4 || width / height > 1.9 };
    }
    catch (error) {
        if (error instanceof playerOcr_types_1.VerificationError)
            throw error;
        throw new playerOcr_types_1.VerificationError(422, 'อ่านเอกสารไม่ได้ ไฟล์อาจเสีย มีรหัสผ่าน หรือมีขนาดภาพใหญ่เกินกำหนด');
    }
}
async function pdfPage(asset, pageNumber, region) {
    // A bounded per-request render thread keeps malformed/expensive PDFs out of the
    // web event loop. This is not a resident AI service and needs no service manager.
    const entry = (0, url_1.pathToFileURL)(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href;
    const source = String.raw `
    const { parentPort, workerData } = require('worker_threads');
    (async () => {
      const pdfjs = await import(workerData.entry);
      const { createCanvas } = require(workerData.canvas);
      const task = pdfjs.getDocument({ data: workerData.bytes, isEvalSupported: false,
        verbosity: 0, useSystemFonts: true, disableFontFace: true, enableXfa: false,
        disableAutoFetch: true, disableStream: true, maxImageSize: 20000000 });
      try {
        const doc = await task.promise, page = await doc.getPage(workerData.page);
        const first = page.getViewport({scale:1});
        const box = workerData.region || {x:0,y:0,width:1,height:1};
        const rw=first.width*box.width,rh=first.height*box.height;
        const scale = workerData.region ? Math.min(4,2800/Math.max(rw,rh),Math.sqrt(12000000/(rw*rh))) : Math.min(2, 2800 / Math.max(first.width, first.height));
        if (!Number.isFinite(scale) || scale <= 0) throw Error('Invalid page');
        const viewport = page.getViewport({scale});
        const canvas = createCanvas(Math.ceil(viewport.width*box.width),Math.ceil(viewport.height*box.height));
        await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport,
          transform:[1,0,0,1,-viewport.width*box.x,-viewport.height*box.y]}).promise;
        parentPort.postMessage({ok:true,bytes:new Uint8Array(canvas.toBuffer('image/png'))});
      } finally { await task.destroy(); }
    })().catch(() => parentPort.postMessage({ok:false}));`;
    const worker = new worker_threads_1.Worker(source, { eval: true, name: 'football-document-preview',
        workerData: { entry, canvas: require.resolve('@napi-rs/canvas'), bytes: new Uint8Array(asset.bytes), page: pageNumber, region },
        resourceLimits: { maxOldGenerationSizeMb: 192 } });
    let timer;
    try {
        return await new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error('PDF preparation timed out')), 15000);
            worker.once('message', value => value?.ok && value.bytes instanceof Uint8Array && value.bytes.length <= 32 * 1024 * 1024
                ? resolve(Buffer.from(value.bytes)) : reject(new Error('PDF preparation failed')));
            worker.once('error', () => reject(new Error('PDF preparation failed')));
            worker.once('exit', code => { if (code !== 0)
                reject(new Error('PDF preparation interrupted')); });
        });
    }
    finally {
        if (timer)
            clearTimeout(timer);
        await worker.terminate();
    }
}
async function previewOcrDocument(asset, page) {
    const info = await inspectOcrDocument(asset);
    if (!Number.isInteger(page) || page < 1 || page > info.pages)
        throw new playerOcr_types_1.VerificationError(400, 'หน้าที่เลือกไม่มีในเอกสาร');
    if (rendering)
        throw new playerOcr_types_1.VerificationError(429, 'กำลังเตรียมเอกสารอื่น กรุณาลองอีกครั้ง', 'OCR_PREPARATION_BUSY', 2);
    rendering = true;
    try {
        const bytes = asset.type === 'application/pdf' ? await pdfPage(asset, page) : asset.bytes;
        return await (0, sharp_1.default)(bytes, { limitInputPixels: 20000000, failOn: 'warning' }).rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 95 }).toBuffer();
    }
    catch (error) {
        if (error instanceof playerOcr_types_1.VerificationError)
            throw error;
        throw new playerOcr_types_1.VerificationError(422, 'ไม่สามารถเตรียมภาพเอกสารได้ กรุณาอัปโหลดภาพใหม่');
    }
    finally {
        rendering = false;
    }
}
async function prepareOcrDocument(asset, selected) {
    const selection = selectionOf(selected);
    const info = await inspectOcrDocument(asset);
    if (selection.page > info.pages)
        throw new playerOcr_types_1.VerificationError(400, 'หน้าที่เลือกไม่มีในเอกสาร');
    if (rendering)
        throw new playerOcr_types_1.VerificationError(429, 'กำลังเตรียมเอกสารอื่น กรุณาลองอีกครั้ง', 'OCR_PREPARATION_BUSY', 2);
    rendering = true;
    try {
        const box = selection.corners ? (0, playerOcr_geometry_1.cornerBox)(selection.corners) : selection.crop;
        let source;
        if (asset.type === 'application/pdf')
            source = await pdfPage(asset, selection.page, box || { x: 0, y: 0, width: 1, height: 1 });
        else {
            let image = (0, sharp_1.default)(asset.bytes, { limitInputPixels: 20000000, failOn: 'warning' }).rotate().flatten({ background: '#ffffff' });
            if (box) {
                const left = Math.round(box.x * info.width), top = Math.round(box.y * info.height);
                const width = Math.min(Math.round(box.width * info.width), info.width - left), height = Math.min(Math.round(box.height * info.height), info.height - top);
                if (width < 200 || height < 120)
                    throw new playerOcr_types_1.VerificationError(422, 'กรอบหน้าบัตรเล็กเกินไป กรุณาเลือกกรอบให้ครอบคลุมข้อมูลทั้งสี่ช่อง');
                image = image.extract({ left, top, width, height });
            }
            source = await image.png().toBuffer();
        }
        if (selection.corners && box)
            source = await (0, playerOcr_geometry_1.rectifyCard)(source, selection.corners.map(p => ({ x: (p.x - box.x) / box.width, y: (p.y - box.y) / box.height })));
        const meta = await (0, sharp_1.default)(source).metadata();
        if (meta.width < 200 || meta.height < 120)
            throw new playerOcr_types_1.VerificationError(422, 'กรอบหน้าบัตรเล็กเกินไป กรุณาเลือกกรอบให้ครอบคลุมข้อมูลทั้งสี่ช่อง');
        let output = (0, sharp_1.default)(source).rotate(selection.rotation || 0, { background: '#ffffff' });
        if (selection.enhance)
            output = output.normalize({ lower: 1, upper: 99 });
        return await output.resize({ width: 2800, height: 2800, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 95 }).toBuffer();
    }
    catch (error) {
        if (error instanceof playerOcr_types_1.VerificationError)
            throw error;
        throw new playerOcr_types_1.VerificationError(422, 'ไม่สามารถเตรียมภาพเอกสารได้ กรุณาตรวจกรอบหรืออัปโหลดภาพใหม่');
    }
    finally {
        rendering = false;
    }
}
/** Heuristics for staff review, never OCR confidence or automatic rejection. */
async function inspectPreparedQuality(bytes) {
    const meta = await (0, sharp_1.default)(bytes).metadata(), stat = await (0, sharp_1.default)(bytes).greyscale().stats();
    const { data } = await (0, sharp_1.default)(bytes).resize({ width: 320, height: 200, fit: 'inside' }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const brightPercent = 100 * data.filter(v => v >= 250).length / data.length, darkPercent = 100 * data.filter(v => v <= 25).length / data.length;
    const warnings = [];
    if (meta.width < 700 || meta.height < 400)
        warnings.push('หน้าบัตรมีรายละเอียดน้อย กรุณาขยายตรวจชื่อและวันที่');
    if (stat.channels[0].stdev < 20)
        warnings.push('ภาพมีความต่างแสงน้อย อาจอ่านตัวอักษรไม่ครบ');
    if (brightPercent > 15)
        warnings.push('มีพื้นที่สว่างมาก กรุณาตรวจว่ามีแสงสะท้อนทับข้อมูลหรือไม่');
    if (darkPercent > 30)
        warnings.push('มีพื้นที่มืดมาก กรุณาตรวจเงาบนข้อมูล');
    return { width: meta.width, height: meta.height, contrast: Number(stat.channels[0].stdev.toFixed(2)), sharpness: Number(stat.sharpness.toFixed(2)), brightPercent: Number(brightPercent.toFixed(2)), darkPercent: Number(darkPercent.toFixed(2)), warnings };
}
function ocrCacheKey(documentHash, selection) {
    return (0, crypto_1.createHash)('sha256').update(JSON.stringify([playerOcr_types_1.OCR_PROVIDER_REVISION, 'jpeg-preparation-v2', documentHash, selectionOf(selection)])).digest('hex');
}
