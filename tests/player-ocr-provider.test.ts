jest.mock('../src/db',()=>({pool:{query:jest.fn(),connect:jest.fn()}}));
jest.mock('../src/services/playerOcr.document',()=>({...jest.requireActual('../src/services/playerOcr.document'),prepareOcrDocument:jest.fn(),inspectPreparedQuality:jest.fn().mockResolvedValue({width:800,height:500,contrast:30,sharpness:2,brightPercent:0,darkPercent:0,warnings:[]})}));
import { pool } from '../src/db';
import { analyzeWithIapp, readIappResponse, SharedOcrBusy } from '../src/services/playerOcr.provider';
import { prepareOcrDocument } from '../src/services/playerOcr.document';
import { parseIappText } from '../src/services/playerOcr.parser';
import { VerificationError, IAPP_OCR_ENDPOINT } from '../src/services/playerOcr.types';

const asset={bytes:Buffer.from('synthetic source'),type:'image/jpeg',sha256:'b'.repeat(64)},cacheKey='c'.repeat(64);
const originalFetch=global.fetch;
let query:jest.Mock,cache:any,used:any;
const response=(text='ไม่พบข้อมูลบัตร',status=200)=>new Response(JSON.stringify({text:[text],iapp:{page:1}}),{status,headers:{'Content-Type':'application/json','iapp-input-pages':'1'}});
beforeEach(()=>{
  process.env.IAPP_API_KEY='synthetic-test-key';process.env.PLAYER_OCR_ENABLED='true';
  delete process.env.PLAYER_OCR_QUOTA_MODE;
  process.env.PLAYER_OCR_DAILY_PAGE_LIMIT='100';process.env.PLAYER_OCR_MONTHLY_PAGE_LIMIT='500';process.env.PLAYER_OCR_TRIAL_PAGE_LIMIT='100';
  cache=null;used={total:0,daily:0,monthly:0};
  query=jest.fn(async(sql:string,values:any[]=[])=>{
    if(sql.startsWith('SELECT * FROM football_player_ocr_cache'))return {rows:cache?[cache]:[],rowCount:cache?1:0};
    if(sql.includes('FROM football_player_ocr_usage'))return {rows:[used]};
    if(sql.startsWith('INSERT INTO football_player_ocr_cache'))cache={state:'RUNNING',updated_at:new Date(),lease_id:values[1]};
    if(sql.includes("SET state='SUCCEEDED'")){cache={...cache,state:'SUCCEEDED',analysis:JSON.parse(values[2])};return {rows:[],rowCount:1};}
    if(sql.includes("SET state='FAILED'"))cache={...cache,state:'FAILED',error_code:values[2]};
    return {rows:[],rowCount:1};
  });
  (pool.query as jest.Mock).mockImplementation(query);(pool.connect as jest.Mock).mockResolvedValue({query,release:jest.fn()});
  (prepareOcrDocument as jest.Mock).mockResolvedValue(Buffer.from('server-prepared jpeg'));
  global.fetch=jest.fn().mockResolvedValue(response());
});
afterEach(()=>{
  global.fetch=originalFetch;
  for(const k of ['IAPP_API_KEY','PLAYER_OCR_ENABLED','PLAYER_OCR_DAILY_PAGE_LIMIT','PLAYER_OCR_MONTHLY_PAGE_LIMIT','PLAYER_OCR_TRIAL_PAGE_LIMIT','PLAYER_OCR_QUOTA_MODE'])delete process.env[k];
});
it('sends one server-prepared JPEG with a backend-only header and no face or expected athlete values',async()=>{
  const result=await analyzeWithIapp(asset,{page:1},cacheKey);
  expect(result.cached).toBe(false);expect(fetch).toHaveBeenCalledTimes(1);
  const [url,options]=(fetch as jest.Mock).mock.calls[0];expect(url).toBe(IAPP_OCR_ENDPOINT);
  expect(url).not.toContain('synthetic-test-key');expect(options.headers).toEqual({apikey:'synthetic-test-key'});
  expect(options.redirect).toBe('error');expect([...options.body.keys()]).toEqual(['file']);
  const file=options.body.get('file') as File;expect(await file.text()).toBe('server-prepared jpeg');expect(file.type).toBe('image/jpeg');
  const stored=JSON.stringify(cache.analysis);expect(stored).not.toContain('ไม่พบข้อมูลบัตร');expect(stored).not.toContain('face');
});
it('reuses cached extracted fields without a key, rendering, quota reservation or network',async()=>{
  cache={state:'SUCCEEDED',analysis:parseIappText('')};delete process.env.IAPP_API_KEY;
  expect((await analyzeWithIapp(asset,{page:1},cacheKey)).cached).toBe(true);
  expect(fetch).not.toHaveBeenCalled();expect(prepareOcrDocument).not.toHaveBeenCalled();
  expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
it('does not reuse an outdated parser result or pay to replace it implicitly',async()=>{
  cache={state:'SUCCEEDED',analysis:{...parseIappText(''),modelVersion:'old-parser'}};
  await expect(analyzeWithIapp(asset,{page:1},cacheKey)).rejects.toMatchObject({code:'OCR_PARSER_CHANGED'});
  expect(fetch).not.toHaveBeenCalled();expect(prepareOcrDocument).not.toHaveBeenCalled();
});
it('reuses a complete V5 result without rewriting its evidence or paying for a parser upgrade',async()=>{
  const prior={...parseIappText(''),modelVersion:'iapp-plain-text-parser-v5'};
  cache={state:'SUCCEEDED',analysis:prior};delete process.env.IAPP_API_KEY;
  const result=await analyzeWithIapp(asset,{page:1},cacheKey);
  expect(result.cached).toBe(true);expect(cache.analysis).toBe(prior);
  expect(cache.analysis.modelVersion).toBe('iapp-plain-text-parser-v5');
  expect(fetch).not.toHaveBeenCalled();expect(prepareOcrDocument).not.toHaveBeenCalled();
  expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT')||sql.startsWith('UPDATE'))).toBe(false);
});
it('does not submit a duplicate while another process owns the same-document lease',async()=>{
  cache={state:'RUNNING',updated_at:new Date()};
  await expect(analyzeWithIapp(asset,{page:1},cacheKey)).rejects.toBeInstanceOf(SharedOcrBusy);
  expect(fetch).not.toHaveBeenCalled();expect(prepareOcrDocument).not.toHaveBeenCalled();
});
it.each([{total:100,daily:0,monthly:0},{total:0,daily:100,monthly:0},{total:0,daily:0,monthly:500}])('stops before network when a shared page limit is exhausted: %j',async limits=>{
  used=limits;await expect(analyzeWithIapp(asset,{page:1},cacheKey)).rejects.toMatchObject({code:'OCR_BUDGET_EXCEEDED'});
  expect(fetch).not.toHaveBeenCalled();expect(query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
});
it('allows usage above all old caps in unlimited mode while recording an attempt before network',async()=>{
  process.env.PLAYER_OCR_QUOTA_MODE='unlimited';used={total:5000001,daily:1000001,monthly:5000001};
  await analyzeWithIapp(asset,{page:1},cacheKey);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(query.mock.calls.some(([sql])=>sql.includes('FROM football_player_ocr_usage'))).toBe(false);
  const index=query.mock.calls.findIndex(([sql])=>sql.startsWith('INSERT INTO football_player_ocr_usage'));
  expect(index).toBeGreaterThan(0);
  expect(query.mock.calls[index][1].slice(1)).toEqual(['football-iapp-trial',cacheKey]);
  const commit=query.mock.calls.findIndex(([sql])=>sql==='COMMIT');
  expect(commit).toBeGreaterThan(index);
  expect(query.mock.invocationCallOrder[commit]).toBeLessThan((fetch as jest.Mock).mock.invocationCallOrder[0]);
});
it('does not contact the provider when unlimited-mode usage accounting fails',async()=>{
  process.env.PLAYER_OCR_QUOTA_MODE='unlimited';
  const original=query.getMockImplementation()!;
  query.mockImplementation(async(sql,...rest)=>{
    if(sql.startsWith('INSERT INTO football_player_ocr_usage'))throw Error('synthetic accounting failure');
    return original(sql,...rest);
  });
  await expect(analyzeWithIapp(asset,{page:1},cacheKey)).rejects.toThrow('synthetic accounting failure');
  expect(fetch).not.toHaveBeenCalled();expect(query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
});
it.each(['','UNLIMITED','true','unknown'])('rejects invalid quota mode %j before network or paid reservation',async mode=>{
  process.env.PLAYER_OCR_QUOTA_MODE=mode;
  await expect(analyzeWithIapp(asset,{page:1},cacheKey)).rejects.toMatchObject({code:'OCR_CONFIG_INVALID'});
  expect(fetch).not.toHaveBeenCalled();expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
it.each(['limited','unlimited'])('requires configured OCR credentials in %s mode',async mode=>{
  process.env.PLAYER_OCR_QUOTA_MODE=mode;delete process.env.IAPP_API_KEY;
  await expect(analyzeWithIapp(asset,{page:1},cacheKey)).rejects.toMatchObject({code:'OCR_NOT_CONFIGURED'});
  expect(fetch).not.toHaveBeenCalled();
});
it.each(['limited','unlimited'])('retains failed attempts and requires confirmed retry in %s mode',async mode=>{
  process.env.PLAYER_OCR_QUOTA_MODE=mode;
  (fetch as jest.Mock).mockRejectedValue(Error('synthetic failure'));
  await expect(analyzeWithIapp(asset,{page:1},cacheKey)).rejects.toMatchObject({code:'OCR_CONNECTION_FAILED'});
  await expect(analyzeWithIapp(asset,{page:1},cacheKey)).rejects.toMatchObject({code:'OCR_PREVIOUS_FAILED'});
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(query.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO football_player_ocr_usage'))).toHaveLength(1);
  expect(query.mock.calls.some(([sql])=>/DELETE|page_count\s*=\s*0/.test(sql))).toBe(false);
});
it.each(['limited','unlimited'])('reuses cache and refuses a concurrent duplicate in %s mode',async mode=>{
  process.env.PLAYER_OCR_QUOTA_MODE=mode;
  cache={state:'SUCCEEDED',analysis:parseIappText('')};
  expect((await analyzeWithIapp(asset,{page:1},cacheKey)).cached).toBe(true);
  cache={state:'RUNNING',updated_at:new Date()};
  await expect(analyzeWithIapp(asset,{page:1},cacheKey)).rejects.toBeInstanceOf(SharedOcrBusy);
  expect(fetch).not.toHaveBeenCalled();
  expect(query.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
});
it('enforces caps again when unlimited mode is switched back to limited',async()=>{
  process.env.PLAYER_OCR_QUOTA_MODE='limited';used={total:101,daily:0,monthly:101};
  await expect(analyzeWithIapp(asset,{page:1},cacheKey)).rejects.toMatchObject({code:'OCR_BUDGET_EXCEEDED'});
  expect(fetch).not.toHaveBeenCalled();
});
it('claims the shared cache and reserves a page inside the same transaction before calling the provider',async()=>{
  await analyzeWithIapp(asset,{page:1},cacheKey);
  const calls=query.mock.calls.map(([sql,values])=>({sql,values}));
  const locks=calls.filter(x=>x.sql.includes('pg_advisory_xact_lock'));expect(locks.map(x=>x.values[0])).toEqual(['player-ocr-cache:'+cacheKey,'player-ocr-budget:football-iapp-trial']);
  const insert=calls.findIndex(x=>x.sql.startsWith('INSERT INTO football_player_ocr_usage'));
  const commit=calls.findIndex(x=>x.sql==='COMMIT');expect(insert).toBeGreaterThan(0);expect(commit).toBeGreaterThan(insert);
  expect((query as jest.Mock).mock.invocationCallOrder[commit]).toBeLessThan((fetch as jest.Mock).mock.invocationCallOrder[0]);
});
it('retains a conservative reservation on transport failure and never retries automatically',async()=>{
  (fetch as jest.Mock).mockRejectedValue(Error('private connection diagnostic'));
  await expect(analyzeWithIapp(asset,{page:1},cacheKey)).rejects.toMatchObject({code:'OCR_CONNECTION_FAILED'});
  expect(fetch).toHaveBeenCalledTimes(1);expect(cache.state).toBe('FAILED');
  expect(query.mock.calls.some(([sql])=>/DELETE|page_count\s*=\s*0/.test(sql))).toBe(false);
});
it('requires explicit retry for a previously failed cached document',async()=>{
  cache={state:'FAILED'};await expect(analyzeWithIapp(asset,{page:1},cacheKey)).rejects.toMatchObject({code:'OCR_PREVIOUS_FAILED'});expect(fetch).not.toHaveBeenCalled();
});
it.each([[401,'OCR_AUTH_FAILED'],[402,'OCR_CREDIT_EXHAUSTED'],[429,'OCR_BUSY'],[503,'OCR_SERVICE_FAILED'],[415,'OCR_DOCUMENT_REJECTED']])('maps provider status %s safely',async(status,code)=>{
  await expect(readIappResponse(response('private provider diagnostic',status as number))).rejects.toMatchObject({code});
});
it.each([{text:'wrong type'},{text:['one','two']},{text:['one'],iapp:{page:2}}])('rejects invalid response shape or unexpected pages',async data=>{
  await expect(readIappResponse(new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}}))).rejects.toMatchObject({code:'OCR_INVALID_RESPONSE'});
});
it('does not turn a failed cache write into a successful job',async()=>{
  const impl=query.getMockImplementation()!;query.mockImplementation(async(sql,...rest)=>sql.includes("SET state='SUCCEEDED'")?{rows:[],rowCount:0}:impl(sql,...rest));
  await expect(analyzeWithIapp(asset,{page:1},cacheKey)).rejects.toMatchObject({code:'OCR_CACHE_WRITE_FAILED'});
});
