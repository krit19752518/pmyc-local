import fs from 'fs';
import path from 'path';
import os from 'os';
import multer from 'multer';
import { randomUUID } from 'crypto';

export const SUPPORT_REPORT_MAX_FILE_BYTES = 4 * 1024 * 1024;
export const SUPPORT_REPORT_MAX_FILES = 10;

const uploadDir = process.env.NODE_ENV === 'test'
  ? path.join(os.tmpdir(), `football-test-support-reports-${process.pid}`)
  : path.join(__dirname, '../../private-support-attachments');

export const SUPPORT_REPORT_UPLOAD_DIR = uploadDir;

const extensionByMimeType: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    fs.mkdir(uploadDir, { recursive: true }, error => callback(error, uploadDir));
  },
  filename: (_req, file, callback) => {
    const extension = extensionByMimeType[file.mimetype];
    if (!extension) return callback(new Error('รองรับไฟล์ภาพ JPEG, PNG, WebP หรือ GIF เท่านั้น'), '');
    callback(null, `${randomUUID()}${extension}`);
  }
});

export const supportReportUpload = multer({
  storage,
  limits: { fileSize: SUPPORT_REPORT_MAX_FILE_BYTES, files: SUPPORT_REPORT_MAX_FILES },
  fileFilter: (_req, file, callback) => {
    if (!extensionByMimeType[file.mimetype]) {
      return callback(new Error('รองรับไฟล์ภาพ JPEG, PNG, WebP หรือ GIF เท่านั้น'));
    }
    callback(null, true);
  }
});

export async function removeSupportReportFiles(files: Express.Multer.File[]): Promise<void> {
  await Promise.all(files.map(file => fs.promises.unlink(file.path)));
}

export function cleanupTestSupportReportFiles(): void {
  if (process.env.NODE_ENV === 'test') fs.rmSync(uploadDir, { recursive: true, force: true });
}
