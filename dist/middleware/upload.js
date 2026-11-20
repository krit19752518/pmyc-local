"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = exports.TEAM_CERT_UPLOAD_ERROR = void 0;
exports.cleanupTestUploadFiles = cleanupTestUploadFiles;
exports.isAllowedTeamCertUpload = isAllowedTeamCertUpload;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const multer_1 = __importDefault(require("multer"));
const isTestEnvironment = process.env.NODE_ENV === 'test';
const uploadDir = isTestEnvironment
    ? path_1.default.join(os_1.default.tmpdir(), `football-test-uploads-${process.pid}`)
    : path_1.default.join(__dirname, '../../uploads');
function cleanupTestUploadFiles() {
    if (isTestEnvironment) {
        fs_1.default.rmSync(uploadDir, { recursive: true, force: true });
    }
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        fs_1.default.mkdir(uploadDir, { recursive: true }, error => cb(error, uploadDir));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path_1.default.extname(file.originalname) || '.jpg';
        cb(null, (file.fieldname || 'photo') + '-' + uniqueSuffix + ext);
    }
});
const TEAM_CERT_ALLOWED_MIMES_BY_EXT = {
    '.jpg': new Set(['image/jpeg', 'image/pjpeg']),
    '.jpeg': new Set(['image/jpeg', 'image/pjpeg']),
    '.png': new Set(['image/png']),
    '.pdf': new Set(['application/pdf'])
};
exports.TEAM_CERT_UPLOAD_ERROR = 'หนังสือรับรองทีมรองรับเฉพาะไฟล์ JPG, PNG หรือ PDF เท่านั้น';
function isAllowedTeamCertUpload(originalname, mimetype) {
    const ext = path_1.default.extname(String(originalname || '')).toLowerCase();
    const allowedMimes = TEAM_CERT_ALLOWED_MIMES_BY_EXT[ext];
    if (!allowedMimes)
        return false;
    const mime = String(mimetype || '').toLowerCase().split(';')[0].trim();
    return mime === '' || mime === 'application/octet-stream' || allowedMimes.has(mime);
}
exports.upload = (0, multer_1.default)({
    storage,
    fileFilter: (_req, file, cb) => {
        if (file.fieldname === 'doc_team_cert' || file.fieldname === 'docTeamCert') {
            if (!isAllowedTeamCertUpload(file.originalname, file.mimetype)) {
                return cb(new Error(exports.TEAM_CERT_UPLOAD_ERROR));
            }
        }
        cb(null, true);
    }
});
