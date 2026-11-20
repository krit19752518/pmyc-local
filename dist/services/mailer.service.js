"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTransporter = getTransporter;
exports.sendPasswordResetEmail = sendPasswordResetEmail;
const nodemailer = __importStar(require("nodemailer"));
const https_1 = __importDefault(require("https"));
let transporter = null;
let testAccount = null;
/**
 * Send email via Brevo HTTP API (bypass port 587 block)
 */
async function sendBrevoApiEmail(toEmail, subject, htmlContent) {
    return new Promise((resolve) => {
        const apiKey = process.env.SMTP_PASS || '';
        const senderEmail = process.env.SMTP_USER || 'krit2518@gmail.com';
        const senderName = process.env.MAIL_FROM_NAME || 'PM Youth CUP Football';
        const data = JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: toEmail }],
            subject: subject,
            htmlContent: htmlContent
        });
        const options = {
            hostname: 'api.brevo.com',
            port: 443,
            path: '/v3/smtp/email',
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(data)
            }
        };
        const req = https_1.default.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const json = JSON.parse(body);
                        resolve({ success: true, messageId: json.messageId });
                    }
                    catch (e) {
                        resolve({ success: true });
                    }
                }
                else {
                    console.error(`[BREVO_API_ERROR] Provider returned status ${res.statusCode}.`);
                    resolve({ success: false });
                }
            });
        });
        req.on('error', (e) => {
            console.error('[BREVO_API_ERROR] Network error.');
            resolve({ success: false });
        });
        req.write(data);
        req.end();
    });
}
/**
 * Initialize Transporter (Brevo SMTP with Fallback to Ethereal) with Detailed Logging
 */
async function getTransporter() {
    if (process.env.NODE_ENV === 'development' && process.env.FOOTBALL_VPS_DEV === '1') {
        return nodemailer.createTransport({ jsonTransport: true });
    }
    if (transporter) {
        console.log('[MAILER_DEBUG] getTransporter: Returning existing singleton transporter instance.');
        return transporter;
    }
    console.log('[MAILER_DEBUG] getTransporter: Initializing new transporter instance...');
    try {
        const smtpUser = process.env.SMTP_USER || 'krit2518@gmail.com';
        const smtpPass = process.env.SMTP_PASS || '';
        if (smtpUser && smtpPass) {
            transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
                port: Number(process.env.SMTP_PORT) || 587,
                secure: false,
                auth: {
                    user: smtpUser,
                    pass: smtpPass
                },
                pool: true,
                maxConnections: 1,
                maxMessages: 50,
                rateLimit: 1
            });
            console.log('[MAILER] Initialized Brevo SMTP Transporter with connection pooling.');
            return transporter;
        }
    }
    catch (e) {
        console.warn('[MAILER_WARN] Failed to initialize Brevo SMTP transporter; falling back to Ethereal.');
    }
    try {
        console.log('[MAILER_DEBUG] getTransporter: Creating Ethereal Test Account fallback...');
        testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass
            },
            pool: true,
            maxConnections: 1,
            maxMessages: 50
        });
        console.log('[MAILER] Initialized Ethereal Test Mailer.');
    }
    catch (e) {
        console.warn('[MAILER_WARN] Failed to create Ethereal test account; using JSON fallback transport.');
        transporter = nodemailer.createTransport({
            jsonTransport: true
        });
    }
    return transporter;
}
/**
 * Send Password Reset Email with Thai HTML Template & Detailed Step-by-Step Logging & Retry
 */
async function sendPasswordResetEmail(toEmail, username, resetLink) {
    if (process.env.NODE_ENV === 'development' && process.env.FOOTBALL_VPS_DEV === '1') {
        return { success: true, messageId: 'dev-email-disabled' };
    }
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
        console.log('[MAILER_TEST_MOCK] Bypassing real email send.');
        return { success: true, messageId: 'mock-test-message-id' };
    }
    const maxRetries = 2;
    let attempt = 0;
    const mailOptions = {
        from: `"${process.env.MAIL_FROM_NAME || 'PM Youth CUP Football'}" <${process.env.MAIL_FROM || process.env.SMTP_USER || 'krit2518@gmail.com'}>`,
        to: toEmail,
        subject: '🔑 ขั้นตอนการรีเซตรหัสผ่าน - Prime Minister\'s Youth CUP Football',
        html: `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f6fa; margin: 0; padding: 20px; color: #333; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        .header { background-color: #0b2a5b; padding: 25px 20px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }
        .header p { margin: 5px 0 0 0; font-size: 13px; color: #ffc107; }
        .body-content { padding: 30px 25px; line-height: 1.6; }
        .btn-reset { display: inline-block; background-color: #0d6efd; color: #ffffff !important; font-weight: bold; text-decoration: none; padding: 12px 28px; border-radius: 8px; margin: 20px 0; font-size: 15px; box-shadow: 0 2px 6px rgba(13,110,253,0.3); }
        .footer { background-color: #f8f9fa; padding: 15px 20px; text-align: center; font-size: 12px; color: #6c757d; border-top: 1px solid #eeeeee; }
        .link-box { word-break: break-all; background: #eef2f7; padding: 10px; border-radius: 6px; font-size: 12px; color: #0b2a5b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Prime Minister's Youth CUP</h1>
          <p>FOOTBALL COMPETITION 2026</p>
        </div>
        <div class="body-content">
          <h2 style="color: #0b2a5b; margin-top: 0; font-size: 18px;">เรียน คุณผู้ใช้งานทีม (${username})</h2>
          <p>ระบบได้รับคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีผู้ใช้งานของคุณแล้ว ท่านสามารถทำตามขั้นตอนการตั้งรหัสผ่านใหม่โดยคลิกที่ปุ่มด้านล่างนี้:</p>
          
          <div style="text-align: center;">
            <a href="${resetLink}" target="_blank" class="btn-reset">🔒 ตั้งรหัสผ่านใหม่ (Reset Password)</a>
          </div>

          <p style="font-size: 13px; color: #666;">หรือคัดลอกลิงก์ด้านล่างนี้ไปวางในเว็บเบราว์เซอร์ของคุณ:</p>
          <div class="link-box">${resetLink}</div>

          <p style="font-size: 12px; color: #dc3545; margin-top: 25px;">* ลิงก์นี้จะมีอายุการใช้งาน 1 ชั่วโมงเพื่อความปลอดภัยของบัญชีท่าน หากท่านไม่ได้เป็นผู้ทำรายการนี้ สามารถข้ามหรือลบอีเมลฉบับนี้ได้ทันที</p>
        </div>
        <div class="footer">
          <p style="margin:0;">สมาคมกีฬาฟุตบอลแห่งประเทศไทย ในพระบรมราชูปถัมภ์ & SAT</p>
          <p style="margin:4px 0 0 0;">Prime Minister's Youth CUP Football Official System</p>
        </div>
      </div>
    </body>
    </html>
    `
    };
    while (attempt < maxRetries) {
        try {
            attempt++;
            console.log(`[MAILER_DEBUG] 2. Calling Brevo HTTP API for attempt ${attempt}...`);
            const result = await sendBrevoApiEmail(toEmail, mailOptions.subject, mailOptions.html);
            if (result.success) {
                console.log('[MAIL_SENT] Password reset email sent via Brevo API.');
                return {
                    success: true,
                    messageId: result.messageId
                };
            }
            else {
                throw new Error('Brevo HTTP API returned failure status');
            }
        }
        catch (e) {
            const errMessage = e?.message || String(e);
            const isRateLimit = errMessage.includes('429') || errMessage.includes('Too Many Requests') || errMessage.includes('ETIMEDOUT');
            console.error(`[MAILER_ERROR] Password reset email attempt ${attempt} failed (rate limited: ${isRateLimit}).`);
            if (isRateLimit && attempt < maxRetries) {
                console.warn(`[MAILER_RETRY] Rate limit 429 encountered. Waiting 3 seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                continue;
            }
            console.error(`[MAILER_FAIL] Failed to send password reset email after attempt ${attempt}.`);
            return { success: false };
        }
    }
    return { success: false };
}
