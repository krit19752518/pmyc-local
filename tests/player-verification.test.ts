import { compareVerification, normalizeDate, validateReview, aiConfiguration, readVerificationAsset } from '../src/services/playerVerification.service';
import { playerVerificationScript, renderPlayerVerificationModal } from '../src/views/playerVerification';
import vm from 'vm';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

describe('player verification rules', () => {
  test.each([
    ['15 มี.ค. 2551', '2008-03-15'], ['๑๕ มีนาคม ๒๕๕๑', '2008-03-15'], ['15มี.ค.2551', '2008-03-15'],
    ['2008-03-15', '2008-03-15'], ['15/03/2551', '2008-03-15'], ['29/02/2567', '2024-02-29'],
    ['31/02/2551', null], ['15/13/2551', null], ['29/02/2566', null], ['', null]
  ])('normalizes %s without guessing', (value, expected) => expect(normalizeDate(value)).toBe(expected));
  const player = { name: 'นาย ทดสอบ ตัวอย่าง', id_card: '1234567890123', birth_date: '2008-03-15' };
  const analysis = () => ({ documentType: 'id_card', fields: {
    fullName: { value: 'นาย ทดสอบ  ตัวอย่าง', confidence: .99 }, idCard: { value: '1-2345-67890-12-3', confidence: .99 },
    birthDate: { value: '15 มี.ค. 2551', confidence: .99 }, expiryDate: { value: '14 มี.ค. 2571', confidence: .99 }
  } });
  it('matches normalized fields and separates expiry without an authoritative field', () => {
    const rows = compareVerification(player, analysis(), '2026-11-08');
    expect(rows.map(row => row.status)).toEqual(['MATCH', 'MATCH', 'MATCH', 'NO_REFERENCE']);
    expect(rows[3].expired).toBe(false);
  });
  it('reports actual mismatch only for confident readings', () => {
    const input = analysis(); input.fields.birthDate.value = '16 มี.ค. 2551';
    expect(compareVerification(player, input)[2].status).toBe('MISMATCH');
    input.fields.birthDate.confidence = .4;
    expect(compareVerification(player, input)[2].status).toBe('UNCLEAR');
  });
  it('marks expired separately from comparison', () => {
    const input = analysis(); input.fields.expiryDate.value = '1 ม.ค. 2560';
    const row = compareVerification(player, input)[3];
    expect(row.status).toBe('EXPIRED_CARD'); expect(row.expired).toBe(true);
  });
  it('does not invent expiry on a birth certificate', () => {
    const input = analysis(); input.documentType = 'birth_certificate';
    expect(compareVerification(player, input)[3].status).toBe('NOT_APPLICABLE');
  });
  it('uses the database calendar-date text instead of an ambiguous UTC Date serialization', () => {
    const input = analysis();
    const rows = compareVerification({ ...player, birth_date: new Date('2008-03-14T17:00:00Z'), verification_birth_date: '2008-03-15' }, input);
    expect(rows[2].status).toBe('MATCH');
  });
  it('refuses incomplete IDs and invalid dates', () => {
    const input = analysis(); input.fields.idCard.value = '123'; input.fields.birthDate.value = '31 ก.พ. 2551';
    expect(compareVerification(player, input).slice(1, 3).map(row => row.status)).toEqual(['UNCLEAR', 'UNCLEAR']);
  });
  it('does not allow a decision to modify the authoritative player', () => {
    expect(validateReview({ decisions: { fullName: 'SYSTEM_CORRECT', idCard: 'SYSTEM_CORRECT', birthDate: 'SYSTEM_CORRECT', expiryDate: 'SYSTEM_CORRECT' }, faceConfirmed: true, teamNote: ' แก้ไข ' })).toMatchObject({ reviewVersion: 3, teamNote: 'แก้ไข', docStatus: 'APPROVED' });
    expect(() => validateReview({ decisions: { password: 'SYSTEM_CORRECT' }, faceConfirmed: true, teamNote: '' })).toThrow();
    expect(() => validateReview({ decisions: { birthDate: 'APPROVE' }, faceConfirmed: true, teamNote: '' })).toThrow();
  });
  it('requires explicit iApp activation and does not accept the old worker configuration', () => {
    const key=process.env.IAPP_API_KEY,enabled=process.env.PLAYER_OCR_ENABLED;
    try {
      delete process.env.IAPP_API_KEY;delete process.env.PLAYER_OCR_ENABLED;expect(()=>aiConfiguration()).toThrow();
      process.env.IAPP_API_KEY='synthetic-test-key';process.env.PLAYER_OCR_ENABLED='true';
      expect(aiConfiguration().url).toBe('https://api.iapp.co.th/v3/store/ocr/document/ocr');
    } finally {
      if(key===undefined)delete process.env.IAPP_API_KEY;else process.env.IAPP_API_KEY=key;
      if(enabled===undefined)delete process.env.PLAYER_OCR_ENABLED;else process.env.PLAYER_OCR_ENABLED=enabled;
    }
  });
});
describe('request-time attachment confinement', () => {
  let root: string;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'issue55-assets-')); process.env.PLAYER_AI_ASSET_ROOT = root; });
  afterEach(async () => { delete process.env.PLAYER_AI_ASSET_ROOT; await fs.rm(root, { recursive: true, force: true }); });
  it('reads only a bounded local supported fixture', async () => {
    await fs.writeFile(path.join(root, 'fixture.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect((await readVerificationAsset('/uploads/fixture.png')).type).toBe('image/png');
  });
  it.each(['https://example.test/secret', '/uploads/../secret', '/uploads/a/b.png', '/uploads/%2e%2e%2fsecret'])('rejects %s without fetching arbitrary paths or URLs', async value => {
    await expect(readVerificationAsset(value)).rejects.toThrow();
  });
  it('refuses a symlink and oversized fixture', async () => {
    await fs.writeFile(path.join(root, 'target.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    await fs.symlink(path.join(root, 'target.png'), path.join(root, 'link.png'));
    await expect(readVerificationAsset('/uploads/link.png')).rejects.toThrow();
    await fs.writeFile(path.join(root, 'large.png'), ''); await fs.truncate(path.join(root, 'large.png'), 13 * 1024 * 1024);
    await expect(readVerificationAsset('/uploads/large.png')).rejects.toThrow();
  });
});
describe('attachment roots follow the web server lookup order', () => {
  let root: string;
  let previousOverride: string | undefined;
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  beforeEach(async () => {
    previousOverride = process.env.PLAYER_AI_ASSET_ROOT;
    delete process.env.PLAYER_AI_ASSET_ROOT;
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'issue60-assets-'));
    await fs.mkdir(path.join(root, 'public', 'uploads'), { recursive: true });
  });
  afterEach(async () => {
    if (previousOverride === undefined) delete process.env.PLAYER_AI_ASSET_ROOT;
    else process.env.PLAYER_AI_ASSET_ROOT = previousOverride;
    await fs.rm(root, { recursive: true, force: true });
  });
  const writeFallback = () => fs.writeFile(path.join(root, 'public', 'uploads', 'fixture.png'), png);
  it.each([true, false])('reads the public fallback with primary directory present=%s', async primaryExists => {
    if (primaryExists) await fs.mkdir(path.join(root, 'uploads'));
    await writeFallback();
    expect(await readVerificationAsset('/uploads/fixture.png', root)).toMatchObject({ bytes: png, type: 'image/png' });
  });
  it('prefers the primary file when both roots contain the same filename', async () => {
    await fs.mkdir(path.join(root, 'uploads'));
    const primary = Buffer.concat([png, Buffer.from('primary')]);
    await fs.writeFile(path.join(root, 'uploads', 'fixture.png'), primary); await writeFallback();
    expect((await readVerificationAsset('/uploads/fixture.png', root)).bytes).toEqual(primary);
  });
  it('reports a safe document error when neither root contains the file', async () => {
    await expect(readVerificationAsset('/uploads/fixture.png', root)).rejects.toMatchObject({
      status: 422, code: 'OCR_DOCUMENT_NOT_FOUND', message: 'ไม่พบไฟล์เอกสารแนบ กรุณาติดต่อผู้ดูแลระบบ'
    });
  });
  it('keeps an explicit asset root isolated even when the public fallback has a file', async () => {
    process.env.PLAYER_AI_ASSET_ROOT = path.join(root, 'override');
    await fs.mkdir(process.env.PLAYER_AI_ASSET_ROOT); await writeFallback();
    await expect(readVerificationAsset('/uploads/fixture.png', root)).rejects.toMatchObject({ status: 422, code: 'OCR_DOCUMENT_NOT_FOUND' });
    await fs.writeFile(path.join(process.env.PLAYER_AI_ASSET_ROOT, 'fixture.png'), png);
    expect((await readVerificationAsset('/uploads/fixture.png', root)).bytes).toEqual(png);
  });
  it('does not bypass a permission denial by reading a fallback file', async () => {
    await fs.mkdir(path.join(root, 'uploads')); await writeFallback();
    const open = jest.spyOn(fs, 'open').mockRejectedValueOnce(Object.assign(new Error('synthetic permission denial'), { code: 'EACCES' }));
    try {
      await expect(readVerificationAsset('/uploads/fixture.png', root)).rejects.toMatchObject({ code: 'EACCES' });
      expect(open).toHaveBeenCalledTimes(1);
    } finally { open.mockRestore(); }
  });
  it.each(['primary', 'fallback'])('refuses a symlink in the %s root', async location => {
    await fs.mkdir(path.join(root, 'uploads')); await writeFallback();
    const target = path.join(root, 'synthetic.png'); await fs.writeFile(target, png);
    const file = path.join(root, ...(location === 'primary' ? ['uploads'] : ['public', 'uploads']), 'fixture.png');
    if (location === 'fallback') await fs.unlink(file);
    await fs.symlink(target, file);
    await expect(readVerificationAsset('/uploads/fixture.png', root)).rejects.toMatchObject({ code: 'ELOOP' });
  });
  it.each(['unsupported', 'oversized'])('rejects an %s primary file without falling through', async kind => {
    await fs.mkdir(path.join(root, 'uploads')); await writeFallback();
    const file = path.join(root, 'uploads', 'fixture.png');
    await fs.writeFile(file, 'unsupported');
    if (kind === 'oversized') await fs.truncate(file, 13 * 1024 * 1024);
    await expect(readVerificationAsset('/uploads/fixture.png', root)).rejects.toMatchObject({ status: 422 });
  });
});

describe('reference modal contract', () => {
  it('has a valid standalone client script and unique IDs', () => {
    expect(() => new vm.Script(playerVerificationScript())).not.toThrow();
    const html = renderPlayerVerificationModal();
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(html).toContain('ลบข้อมูลนักกีฬาท่านนี้');
    expect(html).not.toContain('pvFaceConfirmed');expect(html).toContain('pvConfirmCrop');
    expect(html).not.toContain('วันออกบัตร');
    expect(html).not.toContain('similarityPercent');
    expect(html).toContain("token!==epoch");
  });
});

describe('issue59 automatic decisions and Thai expiry calendar', () => {
  const input = (expiry: string, validation = 'VALID') => ({provider:'iapp',documentType:'id_card',fields:{
    fullName:{value:'ด.ช. ทดสอบ ตัวอย่าง',validation:'VALID',confidence:null},
    idCard:{value:'1234567890121',validation:'VALID',confidence:null},
    birthDate:{value:'2008-03-15',validation:'VALID',confidence:null},
    expiryDate:{value:expiry,validation,confidence:null}
  }});
  const player = {name:'เด็กชาย ทดสอบ ตัวอย่าง',id_card:'1234567890121',birth_date:'2008-03-15'};
  it.each([
    ['2026-11-07','EXPIRED_CARD'],['2026-11-08','EXPIRED_CARD'],['2026-11-09','SYSTEM_CORRECT'],['2026-11-10','SYSTEM_CORRECT'],['LIFETIME','SYSTEM_CORRECT']
  ])('suggests %s using expiry <= today-1', (expiry, decision) => {
    const rows=compareVerification(player,input(expiry),'2026-11-09');
    expect(rows.slice(0,3).map(row=>row.suggestedDecision)).toEqual(['SYSTEM_CORRECT','SYSTEM_CORRECT','SYSTEM_CORRECT']);
    expect(rows[3]).toMatchObject({suggestedDecision:decision,expiryCutoff:'2026-11-08',expired:decision==='EXPIRED_CARD'});
  });
  it.each(['MISSING','INVALID','AMBIGUOUS'])('requests reupload for an %s expiry without inventing expiration', validation => {
    expect(compareVerification(player,input('31/02/2569',validation),'2026-11-09')[3]).toMatchObject({suggestedDecision:'REUPLOAD',expired:false,status:'UNCLEAR'});
  });
  it('keeps birth-certificate expiry not applicable and explains missing system references', () => {
    const analysis=input('');analysis.documentType='birth_certificate';
    expect(compareVerification(player,analysis)[3]).toMatchObject({status:'NOT_APPLICABLE',suggestedDecision:'SYSTEM_CORRECT',expired:false});
    expect(compareVerification({},input('LIFETIME'))[0]).toMatchObject({status:'NO_REFERENCE',suggestedDecision:'CORRECT_DATA',reason:expect.stringContaining('ไม่พบชื่อและนามสกุลในระบบ')});
    expect(compareVerification({...player,name:'นาย ชื่ออื่น ตัวอย่าง'},input('LIFETIME'))[0]).toMatchObject({suggestedDecision:'CORRECT_DATA',requiresManualDecision:false});
    expect(compareVerification({...player,name:'เด็กชาย ชื่ออื่น ตัวอย่าง'},input('LIFETIME'))[0].suggestedDecision).toBe('CORRECT_DATA');
  });
  it('accepts expiry-only EXPIRED_CARD, adds its team reason and tracks manual origin', () => {
    const decisions={fullName:'SYSTEM_CORRECT',idCard:'SYSTEM_CORRECT',birthDate:'SYSTEM_CORRECT',expiryDate:'EXPIRED_CARD'};
    const result=validateReview({decisions,teamNote:'ข้อความเจ้าหน้าที่'});
    expect(result).toMatchObject({docStatus:'ACTION_REQUIRED',decisionStatus:'ACTION_REQUIRED',reviewVersion:3,decisionSources:{expiryDate:'STAFF_EDITED'}});
    expect(result.teamNote).toContain('ข้อความเจ้าหน้าที่');expect(result.teamNote).toContain('บัตรประชาชนหมดอายุ กรุณาแนบบัตรใหม่ที่ยังไม่หมดอายุ');
    for(const field of ['fullName','idCard','birthDate'])expect(()=>validateReview({decisions:{...decisions,[field]:'EXPIRED_CARD'},teamNote:''})).toThrow('ไม่ถูกต้อง');
    expect(()=>validateReview({decisions,teamNote:'',decisionSources:{expiryDate:'INVALID_SOURCE'}})).toThrow('ที่มา');
  });
});
