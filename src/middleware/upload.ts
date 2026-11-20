import path from 'path';
import fs from 'fs';
import os from 'os';
import multer from 'multer';

const isTestEnvironment = process.env.NODE_ENV === 'test';
const uploadDir = isTestEnvironment
  ? path.join(os.tmpdir(), `football-test-uploads-${process.pid}`)
  : path.join(__dirname, '../../uploads');

export function cleanupTestUploadFiles(): void {
  if (isTestEnvironment) {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdir(uploadDir, { recursive: true }, error => cb(error, uploadDir));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, (file.fieldname || 'photo') + '-' + uniqueSuffix + ext);
  }
});

const TEAM_CERT_ALLOWED_MIMES_BY_EXT: Record<string, Set<string>> = {
  '.jpg': new Set(['image/jpeg', 'image/pjpeg']),
  '.jpeg': new Set(['image/jpeg', 'image/pjpeg']),
  '.png': new Set(['image/png']),
  '.pdf': new Set(['application/pdf'])
};
export const TEAM_CERT_UPLOAD_ERROR = 'หนังสือรับรองทีมรองรับเฉพาะไฟล์ JPG, PNG หรือ PDF เท่านั้น';

export function isAllowedTeamCertUpload(originalname: string, mimetype: string): boolean {
  const ext = path.extname(String(originalname || '')).toLowerCase();
  const allowedMimes = TEAM_CERT_ALLOWED_MIMES_BY_EXT[ext];
  if (!allowedMimes) return false;
  const mime = String(mimetype || '').toLowerCase().split(';')[0].trim();
  return mime === '' || mime === 'application/octet-stream' || allowedMimes.has(mime);
}

export const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'doc_team_cert' || file.fieldname === 'docTeamCert') {
      if (!isAllowedTeamCertUpload(file.originalname, file.mimetype)) {
        return cb(new Error(TEAM_CERT_UPLOAD_ERROR));
      }
    }
    cb(null, true);
  }
});
