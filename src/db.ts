import { Pool } from 'pg';
import fs from 'fs';

const connectionString = process.env.DATABASE_URL;
const vpsDev = process.env.NODE_ENV === 'development' && process.env.FOOTBALL_VPS_DEV === '1';
if (process.env.FOOTBALL_VPS_DEV === '1' && !vpsDev) throw new Error('VPS Dev requires development mode');
const devTls = vpsDev ? {
  ca: fs.readFileSync(process.env.FOOTBALL_DEV_DB_CA_FILE || ''),
  servername: process.env.FOOTBALL_DEV_DB_TLS_NAME || '',
  rejectUnauthorized: true,
} : undefined;

export const pool = new Pool({
  connectionString,
  max: vpsDev ? 3 : 10,
  ...(devTls ? { ssl: devTls } : {}),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});
