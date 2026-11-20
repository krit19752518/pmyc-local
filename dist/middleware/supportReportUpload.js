"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportReportUpload = exports.SUPPORT_REPORT_UPLOAD_DIR = exports.SUPPORT_REPORT_MAX_FILES = exports.SUPPORT_REPORT_MAX_FILE_BYTES = void 0;
exports.removeSupportReportFiles = removeSupportReportFiles;
exports.cleanupTestSupportReportFiles = cleanupTestSupportReportFiles;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const multer_1 = __importDefault(require("multer"));
const crypto_1 = require("crypto");
exports.SUPPORT_REPORT_MAX_FILE_BYTES = 4 * 1024 * 1024;
exports.SUPPORT_REPORT_MAX_FILES = 10;
const uploadDir = process.env.NODE_ENV === 'test'
    ? path_1.default.join(os_1.default.tmpdir(), `football-test-support-reports-${process.pid}`)
    : path_1.default.join(__dirname, '../../private-support-attachments');
exports.SUPPORT_REPORT_UPLOAD_DIR = uploadDir;
const extensionByMimeType = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif'
};
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, callback) => {
        fs_1.default.mkdir(uploadDir, { recursive: true }, error => callback(error, uploadDir));
    },
    filename: (_req, file, callback) => {
        const extension = extensionByMimeType[file.mimetype];
        if (!extension)
            return callback(new Error('รองรับไฟล์ภาพ JPEG, PNG, WebP หรือ GIF เท่านั้น'), '');
        callback(null, `${(0, crypto_1.randomUUID)()}${extension}`);
    }
});
exports.supportReportUpload = (0, multer_1.default)({
    storage,
    limits: { fileSize: exports.SUPPORT_REPORT_MAX_FILE_BYTES, files: exports.SUPPORT_REPORT_MAX_FILES },
    fileFilter: (_req, file, callback) => {
        if (!extensionByMimeType[file.mimetype]) {
            return callback(new Error('รองรับไฟล์ภาพ JPEG, PNG, WebP หรือ GIF เท่านั้น'));
        }
        callback(null, true);
    }
});
async function removeSupportReportFiles(files) {
    await Promise.all(files.map(file => fs_1.default.promises.unlink(file.path)));
}
function cleanupTestSupportReportFiles() {
    if (process.env.NODE_ENV === 'test')
        fs_1.default.rmSync(uploadDir, { recursive: true, force: true });
}
