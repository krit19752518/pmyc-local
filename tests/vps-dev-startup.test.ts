import crypto from 'node:crypto';
const {validateConfig,authorize}=require('../scripts/run-vps-dev.cjs');
const root='/home/zbpzpszw/football-dev/workspace';
function valid(){return {databaseUrl:'postgresql://football_dev_app:fixture-password@143.14.36.234:5432/football_dev',tlsServername:'gritsolution',caFile:'/home/zbpzpszw/football-dev/shared/db-ca.pem',caSha256:'a'.repeat(64),accessDigest:'b'.repeat(64),adminSessionSecret:'c'.repeat(64),teamSessionSecret:'d'.repeat(64),phpBinary:'/home/zbpzpszw/football-dev/workspace/scripts/php-vps-dev.sh'};}
it('accepts only the explicit Dev identity',()=>expect(validateConfig(valid(),root).tlsServername).toBe('gritsolution'));
it.each([
 'postgresql://football_dev_app:p@143.14.36.234/my_office_db',
 'postgresql://postgres:p@143.14.36.234/football_dev',
 'postgresql://football_dev_app:p@127.0.0.1/football_dev',
 'postgresql://football_dev_app:p@143.14.36.234/football_dev?sslmode=disable',
])('rejects a database identity outside Dev: %s',databaseUrl=>expect(()=>validateConfig({...valid(),databaseUrl},root)).toThrow());
it('rejects a Production checkout path',()=>expect(()=>validateConfig(valid(),'/home/zbpzpszw/football_app/football')).toThrow());
it('rejects missing browser access protection',()=>expect(()=>validateConfig({...valid(),accessDigest:''},root)).toThrow());
it('authenticates the configured browser credential and rejects other input',()=>{
 const credential='fixture-user:fixture-password',digest=crypto.createHash('sha256').update(credential).digest('hex');
 expect(authorize('Basic '+Buffer.from(credential).toString('base64'),digest)).toBe(true);
 expect(authorize('Basic '+Buffer.from('fixture-user:wrong').toString('base64'),digest)).toBe(false);
 expect(authorize(undefined,digest)).toBe(false);
});

it('accepts optional Dev OCR config under shared/ and rejects outside paths', () => {
 expect(validateConfig({...valid(), ocrEnabled: true, playerOcrConfigFile: '/home/zbpzpszw/football-dev/shared/player-ocr.dev.json'}, root).ocrEnabled).toBe(true);
 expect(() => validateConfig({...valid(), playerOcrConfigFile: '/tmp/player-ocr.json'}, root)).toThrow();
});
