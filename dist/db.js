"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
const pg_1 = require("pg");
const fs_1 = __importDefault(require("fs"));
const connectionString = process.env.DATABASE_URL;
const vpsDev = process.env.NODE_ENV === 'development' && process.env.FOOTBALL_VPS_DEV === '1';
if (process.env.FOOTBALL_VPS_DEV === '1' && !vpsDev)
    throw new Error('VPS Dev requires development mode');
const devTls = vpsDev ? {
    ca: fs_1.default.readFileSync(process.env.FOOTBALL_DEV_DB_CA_FILE || ''),
    servername: process.env.FOOTBALL_DEV_DB_TLS_NAME || '',
    rejectUnauthorized: true,
} : undefined;
exports.pool = new pg_1.Pool({
    connectionString,
    max: vpsDev ? 3 : 10,
    ...(devTls ? { ssl: devTls } : {}),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});
exports.pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
});
