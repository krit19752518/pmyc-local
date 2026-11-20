import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import request from 'supertest';
import { AGES, buildStatistics, CountableTeam, dueJobKey, registeredEntitlements, sum, total, validateStatistics } from '../src/services/registrationStatistics.service';
import { BANGKOK_ZONES } from '../src/services/registrationStatistics.registry';
import { StatisticsStore } from '../src/services/registrationStatistics.store';
import { refreshStatistics } from '../src/services/registrationStatistics.refresh';
import { filteredStatistics, statisticsCsv } from '../src/services/registrationStatistics.export';
import { createRegistrationStatisticsRouter } from '../src/routes/registrationStatistics.router';
import { renderRegistrationStatistics } from '../src/views/registrationStatistics';
import type { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { DEFINITION_VERSION, LEGACY_DEFINITION_VERSION } from '../src/services/registrationStatistics.service';

const approved = require('./fixtures/issue72-approved-statistics.json');
const asOf = '2026-11-12T04:06:00.000Z';
const fixture: CountableTeam[] = approved.provinces.flatMap((p: any) => p.districts.flatMap((d: any) => d.ages.flatMap((n: number, i: number) =>
  Array.from({ length: n }, (_, j) => ({ id: 'synthetic-'+d.code+'-'+i+'-'+j, categories: AGES[i], province: p.name, district: d.name })))));
const snapshot = () => buildStatistics(fixture, asOf, asOf);
function historicalSnapshot() {
  const { snapshotId, ...body } = snapshot();
  const historical = { ...body, definitionVersion: LEGACY_DEFINITION_VERSION, includesCancelled: true };
  return { snapshotId: createHash('sha256').update(JSON.stringify(historical)).digest('hex'), ...historical };
}
async function seedHistorical() {
  const old = historicalSnapshot();
  await fs.writeFile(path.join(directory,'current.json'),JSON.stringify(old),{mode:0o600});
  await fs.writeFile(path.join(directory,old.snapshotId+'.json'),JSON.stringify(old),{mode:0o600});
  return old;
}
let directory: string, store: StatisticsStore;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(),'football-issue72-test-')); store = new StatisticsStore(directory); });
afterEach(async () => { jest.restoreAllMocks(); await fs.rm(directory,{ recursive:true, force:true }); });

it('reproduces every approved geographic fixture without hardcoding future totals', () => {
  const result = snapshot();
  expect(result.ages).toEqual([628,683,525]); expect(total(result.ages)).toBe(1836);
  expect(result.provinces).toHaveLength(77);
  expect(result.provinces.every(p => total(p.ages)>0)).toBe(true);
  const districts=result.provinces.flatMap(p=>p.districts);
  expect(districts).toHaveLength(928); expect(new Set(districts.map(d=>d.code)).size).toBe(928);
  expect(districts.filter(d=>total(d.ages)>0)).toHaveLength(463);
  expect(districts.filter(d=>total(d.ages)===0)).toHaveLength(465);
  const bkk=result.provinces.find(p=>p.code==='10')!;
  expect(total(bkk.ages)).toBe(156); expect(bkk.unassigned).toEqual([0,0,0]);
  expect(bkk.districts.filter(d=>total(d.ages)===0)).toHaveLength(15);
  expect(BANGKOK_ZONES.map(z=>z.districts.length)).toEqual([15,16,19]);
  expect(BANGKOK_ZONES.map(z=>sum(bkk.districts.filter(d=>z.districts.includes(d.name))))).toEqual([[10,8,12],[13,18,19],[24,31,21]]);
  const kk=result.provinces.find(p=>p.name==='ขอนแก่น')!;
  expect(kk.districts).toHaveLength(26); expect(total(kk.ages)).toBe(63);
  expect(kk.districts.filter(d=>total(d.ages)===0)).toHaveLength(14);
  expect(kk.districts.find(d=>d.name==='เมืองขอนแก่น')?.ages).toEqual([9,9,10]);
  for(const p of result.provinces) expect(p.districts).toEqual(approved.provinces.find((a:any)=>a.code===p.code).districts);
});

it('excludes cancelled ages publicly while preserving cumulative Admin enrollment and pending/all genders', () => {
  const row={id:'synthetic-multi',categories:'U14,U16,U18,U14',province:'กรุงเทพฯ',district:'เขตธนบุรี',cancelled_categories:'U14,U16,U18',status:'PENDING',gender:'girl',created_at:null};
  const rows=[row,{...row},{...row,id:'deleted',is_deleted:true},{...row,id:'demo',is_test:true},
    {id:'unregistered',categories:'',submitted_categories:'U14',cancelled_categories:'U18'},
    {id:'inconsistent',categories:'ตรวจสอบสถานะรุ่น'}, {id:'not-sent',categories:'ไม่ได้ส่งทีม'}];
  const result=buildStatistics(rows,asOf,asOf);
  expect(result.ages).toEqual([0,0,0]);
  expect(result.includesCancelled).toBe(false);
  expect(result.definitionVersion).toBe(DEFINITION_VERSION);
  expect(result.provinces.find(p=>p.code==='10')?.districts.find(d=>d.code==='1015')?.ages).toEqual([0,0,0]);
  expect(sum(registeredEntitlements(rows))).toEqual([1,1,1]); // Existing Admin caller keeps its default.
  const partial={...row,cancelled_categories:' u14 ,U18,U18 '};
  const active=buildStatistics([partial,{...partial}],asOf,asOf);
  expect(active.ages).toEqual([0,1,0]);
  expect(sum(registeredEntitlements([partial],{includeCancelled:false}))).toEqual([0,1,0]);
  expect(buildStatistics([{...partial,cancelled_categories:null}],asOf,asOf).ages).toEqual([1,1,1]);
  expect(buildStatistics([{...partial,cancelled_categories:'',cancelledCategories:['u14','U18']}],asOf,asOf).ages).toEqual([0,1,0]);
  expect(buildStatistics([{id:'orphan',categories:'U16',cancelled_categories:'U14'}],asOf,asOf).ages).toEqual([0,1,0]);
  expect(()=>registeredEntitlements([row,partial],{includeCancelled:false})).toThrow('Conflicting duplicate');
  expect(()=>registeredEntitlements([{...row},{...row,categories:'U14'}])).toThrow('Conflicting duplicate');
  expect(()=>registeredEntitlements([{id:'',categories:'U14'}])).toThrow('Missing registration');
});

it('recounts restored ages and highlights a district only after its last noncancelled registration disappears', () => {
  const row={id:'synthetic-restore',categories:'U14,U16',cancelled_categories:'U14',province:'กรุงเทพมหานคร',district:'ธนบุรี'};
  const district=(rows:CountableTeam[])=>buildStatistics(rows,asOf,asOf).provinces.find(p=>p.code==='10')!.districts.find(d=>d.code==='1015')!;
  expect(district([row]).ages).toEqual([0,1,0]);
  expect(district([{...row,cancelled_categories:''}]).ages).toEqual([1,1,0]);
  expect(district([{...row,cancelled_categories:'U14,U16'}]).ages).toEqual([0,0,0]);
  const filtered=filteredStatistics(buildStatistics([row],asOf,asOf),{province:'กรุงเทพมหานคร',q:'ธนบุรี',age:'U14',status:'zero'});
  expect(filtered.rows).toHaveLength(1);
  expect(filtered.rows[0].ages).toEqual([0,1,0]);
  expect(statisticsCsv(buildStatistics([row],asOf,asOf),{})).toContain('ไม่รวมรุ่นที่ยกเลิกการสมัคร');
});

it('retains unmatched geography, uses only same-province fallback, and never trusts a legacy zone label', () => {
  const result=buildStatistics([
    {id:'a',categories:'U14',province:'กรุงเทพฯ',district:'',contact_province:'กรุงเทพมหานคร',contact_district:'เขตธนบุรี',bkk_zone:'ฝั่งพระนคร 2'},
    {id:'b',categories:'U16',province:'กรุงเทพมหานคร',district:'unknown'},
    {id:'c',categories:'U18',province:'ขอนแก่น',district:'',contact_province:'กรุงเทพมหานคร',contact_district:'ธนบุรี'},
    {id:'d',categories:'U14,U16,U18',province:'unknown',district:'เมือง'},
  ] as CountableTeam[],asOf,asOf);
  expect(result.ages).toEqual([2,2,2]); expect(result.unassigned).toEqual([1,1,1]);
  const bkk=result.provinces.find(p=>p.code==='10')!;
  expect(bkk.unassigned).toEqual([0,1,0]); expect(bkk.districts.find(d=>d.name==='ธนบุรี')?.ages).toEqual([1,0,0]);
  expect(result.provinces.find(p=>p.name==='ขอนแก่น')?.unassigned).toEqual([0,0,1]);
  expect(result.provinces.flatMap(p=>p.districts)).toHaveLength(928);
  expect(filteredStatistics(result,{province:'กรุงเทพมหานคร',zone:'ฝั่งธนบุรี'}).rows.reduce((n,d)=>n+total(d.ages),0)).toBe(1);
});

it('filters age zeros correctly, keeps dialogs all-age, exports all 928 coded rows plus labeled summaries', () => {
  const result=snapshot();
  const filtered=filteredStatistics(result,{level:'district',province:'กรุงเทพมหานคร',q:'ธนบุรี',age:'U14',status:'zero'});
  expect(filtered.rows).toHaveLength(1); expect(filtered.rows[0].ages).toEqual([0,0,1]);
  expect(filtered.value(filtered.rows[0])).toBe(0);
  const csv=statisticsCsv(result,{level:'district',page:'2'});
  expect(csv.startsWith('\ufeff')).toBe(true);
  expect(csv.split('\r\n')).toHaveLength(931);
  const codes=csv.split('\r\n').slice(1,929).map(line=>line.split(',')[2]);
  expect(new Set(codes).size).toBe(928);
  expect(csv).toContain(result.snapshotId);
  expect(statisticsCsv(result,{province:'กรุงเทพมหานคร',level:'district',q:'ธนบุรี',age:'U14',status:'zero'})).toContain('ยังไม่มีทีม U14');
  const province=filteredStatistics(result,{q:'ขอนแก่น'});
  expect(province.rows).toHaveLength(1); expect(total(province.rows[0].ages)).toBe(63);
});

it('changes daily due time exactly at 23:00 Bangkok, independent of host timezone', () => {
  expect(dueJobKey(new Date('2026-11-12T15:59:59.000Z'))).toBe('2026-11-11');
  expect(dueJobKey(new Date('2026-11-12T16:00:00.000Z'))).toBe('2026-11-12');
});

it('persists last-good across restart and retains older versions for pinned exports', async () => {
  const first=snapshot(); await store.publish(first);
  expect(await new StatisticsStore(directory).read()).toEqual(first);
  const second=buildStatistics([...fixture,{id:'new',categories:'U14'}],'2026-11-13T16:00:00.000Z','2026-11-13T16:00:01.000Z');
  await store.publish(second);
  expect((await store.read())?.ages).toEqual([629,683,525]);
  expect(await store.read(first.snapshotId)).toEqual(first);
  await expect(store.publish(first)).rejects.toThrow('time regression');
  expect(await store.stale(second,new Date('2026-11-13T16:01:00Z'))).toBe(false);
  expect(await store.stale(second,new Date('2026-11-14T16:00:00Z'))).toBe(true);
});

it('fails closed before first publication and rejects private fields, malformed counts, digest or incomplete registry', async () => {
  expect(await store.read()).toBeNull();
  const good=snapshot();
  for(const mutate of [
    (s:any)=>{s.password='private';},(s:any)=>{s.ages[0]++;},
    (s:any)=>{s.provinces[0].districts.pop();},(s:any)=>{s.provinces[0].districts[0].phone='private';},
    (s:any)=>{s.asOf='bad';},(s:any)=>{s.snapshotId='a'.repeat(64);},(s:any)=>{s.ages[0]=-1;}
  ]) { const bad=JSON.parse(JSON.stringify(good)); mutate(bad); expect(()=>validateStatistics(bad)).toThrow(); }
  expect(()=>new StatisticsStore('/tmp/public/statistics')).toThrow('private');
  await expect(store.read('../current')).rejects.toThrow('Invalid snapshot');
});

it('keeps prior current snapshot when final atomic publication fails, and marks stale after failure', async () => {
  const first=snapshot(); await store.publish(first);
  const second=buildStatistics([...fixture,{id:'extra',categories:'U18'}],'2026-11-13T16:00:00.000Z','2026-11-13T16:00:01.000Z');
  const rename=fs.rename.bind(fs);
  jest.spyOn(fs,'rename').mockImplementation(async (from,to)=> {
    if(String(to).endsWith('/current.json')) throw new Error('synthetic disk failure');
    await rename(from,to);
  });
  await expect(store.publish(second)).rejects.toThrow('synthetic disk failure');
  expect(await store.read()).toEqual(first);
  await store.recordFailure();
  expect(await store.stale(first,new Date(asOf))).toBe(true);
});

function database(rows: CountableTeam[]=fixture, fail?: string, clock=asOf) {
  const query=jest.fn(async (sql:string) => {
    if(sql.includes('pg_try_advisory_lock')) return {rows:[{locked:fail!=='locked'}]};
    if(sql.includes('transaction_timestamp')) return {rows:[{as_of:clock}]};
    if(sql.includes('COUNT(DISTINCT id)')) {
      const ages=sum(registeredEntitlements(rows,{includeCancelled:false}));
      return {rows:[{u14:ages[0],u16:ages[1],u18:ages[2]}]};
    }
    if(sql.includes('FROM football_registered_team')) { if(fail==='query') throw new Error('synthetic query failure'); return {rows}; }
    if(sql.includes('pg_advisory_unlock')&&fail==='unlock') throw new Error('synthetic unlock failure');
    return {rows:[]};
  });
  const release=jest.fn(); const connect=jest.fn(async()=>({query,release}));
  return {pool:{connect} as unknown as Pool,query,release,connect};
}
it('refreshes from a strict read-only transaction, never SELECT * or roster, and is daily idempotent', async () => {
  const db=database();
  const first=await refreshStatistics(db.pool,store,new Date(asOf));
  expect(first.outcome).toBe('published');
  const sql=db.query.mock.calls.map(c=>c[0]).join('\n');
  expect(sql).toContain('REPEATABLE READ READ ONLY'); expect(sql).toContain('COALESCE(is_test, FALSE) = FALSE');
  expect(sql).not.toMatch(/SELECT \*|JOIN|football_player|password|phone|status\s*=/i);
  expect(db.release).toHaveBeenCalledWith(false);
  expect((await refreshStatistics(db.pool,store,new Date(asOf))).outcome).toBe('already-published');
  expect(db.query.mock.calls.filter(c=>c[0].includes('FROM football_registered_team'))).toHaveLength(2);
});
it('upgrades a same-day historical snapshot, keeps pinned historical exports honest, and does not republish legacy current', async () => {
  const old=await seedHistorical();
  const app=express();app.use(createRegistrationStatisticsRouter(store,async()=>snapshot()));
  const live=await request(app).get('/api/public/registration-statistics');
  expect(live.status).toBe(200);expect(live.body.includesCancelled).toBe(false);expect(live.body.snapshotId).not.toBe(old.snapshotId);
  const oldCsv=await request(app).get('/api/public/registration-statistics.csv').query({snapshotId:old.snapshotId});
  expect(oldCsv.status).toBe(200);expect(oldCsv.text).toContain('รวมยกเลิกการสมัครแล้ว');
  expect(oldCsv.text).not.toContain('ไม่รวมรุ่นที่ยกเลิกการสมัคร');
  await expect(store.publish(old)).rejects.toThrow('historical statistics definition');
  const row={id:'synthetic-upgrade',categories:'U14,U16',cancelled_categories:'U14'};
  const db=database([row],undefined,'2026-11-12T04:07:00.000Z');
  expect((await refreshStatistics(db.pool,store,new Date(asOf))).outcome).toBe('published');
  const current=(await store.read())!;expect(current.ages).toEqual([0,1,0]);expect(current.includesCancelled).toBe(false);
  expect(await store.read(old.snapshotId)).toEqual(old);
  const now=await request(app).get('/api/public/registration-statistics');expect(now.status).toBe(200);expect(now.body.definitionVersion).toBe(DEFINITION_VERSION);
  const csv=await request(app).get('/api/public/registration-statistics.csv').query({snapshotId:current.snapshotId});
  expect(csv.text).toContain('ไม่รวมรุ่นที่ยกเลิกการสมัคร');
  // A mismatched flag/version pair cannot be reinterpreted under the new definition.
  expect(()=>validateStatistics({...current,includesCancelled:true})).toThrow('Invalid statistics definition');
});
it('allows an explicit manual same-day refresh after cancellation and retains last-good v2 if refresh fails',async()=>{
  const row={id:'synthetic-manual',categories:'U14,U16'};
  await refreshStatistics(database([row]).pool,store,new Date(asOf));
  const cancelled={...row,cancelled_categories:'U14'};
  const next=database([cancelled],undefined,'2026-11-12T04:08:00.000Z');
  expect((await refreshStatistics(next.pool,store,new Date(asOf),{force:true})).outcome).toBe('published');
  const good=(await store.read())!;expect(good.ages).toEqual([0,1,0]);
  await expect(refreshStatistics(database([row],'query').pool,store,new Date(asOf),{force:true})).rejects.toThrow();
  expect(await store.read()).toEqual(good);
});
it('does not publish when independent SQL counts disagree with the cancellation-aware result',async()=>{
  const db=database([{id:'synthetic-disagreement',categories:'U14,U16',cancelled_categories:'U14'}]);
  const original=db.query.getMockImplementation()!;
  db.query.mockImplementation(async(sql:string)=>sql.includes('COUNT(DISTINCT id)')?{rows:[{u14:1,u16:1,u18:0}]}:original(sql));
  await expect(refreshStatistics(db.pool,store,new Date(asOf))).rejects.toThrow('totals do not reconcile');
  expect(await store.read()).toBeNull();expect(db.query.mock.calls.some(c=>c[0]==='ROLLBACK')).toBe(true);
});
it('publishes nothing on a competing writer or empty/failed source and releases/rolls back on errors', async () => {
  const busy=database(fixture,'locked');
  expect((await refreshStatistics(busy.pool,store,new Date(asOf))).outcome).toBe('locked');
  expect(await store.read()).toBeNull();
  for(const db of [database([]),database(fixture,'query')]) {
    await expect(refreshStatistics(db.pool,store,new Date(asOf))).rejects.toThrow();
    expect(db.query.mock.calls.some(c=>c[0]==='ROLLBACK')).toBe(true);
    expect(db.release).toHaveBeenCalled();
    expect(await store.read()).toBeNull();
  }
});
it('discards a session whose advisory lock cannot be released', async () => {
  const db=database(fixture,'unlock');
  await refreshStatistics(db.pool,store,new Date(asOf));
  expect(db.release).toHaveBeenCalledWith(true);
});
it('serves anonymous aggregate allowlists and pinned CSV without setting any session cookie', async () => {
  let live: ReturnType<typeof snapshot> | undefined;
  const app=express(); app.use(createRegistrationStatisticsRouter(store,async()=>{if(!live)throw Error('synthetic unavailable');return live;}));
  const unavailable=await request(app).get('/api/public/registration-statistics');
  expect(unavailable.status).toBe(503);
  const first=snapshot(); await store.publish(first);live=first;
  const response=await request(app).get('/api/public/registration-statistics').set('Cookie','admin_session=private-sentinel');
  expect(response.status).toBe(200); expect(response.headers['set-cookie']).toBeUndefined();
  expect(response.body.snapshotId).toBe(first.snapshotId);
  expect(response.text).not.toMatch(/private-sentinel|password|athlete|contact_|phone|email|document|session/i);
  const page=await request(app).get('/registration-statistics.php');
  expect(page.status).toBe(200); expect(page.headers['set-cookie']).toBeUndefined();
  expect(page.text).not.toContain('data.js');
  const second=buildStatistics([...fixture,{id:'extra',categories:'U18'}],'2026-11-13T16:00:00.000Z','2026-11-13T16:00:01.000Z');
  await store.publish(second);
  const csv=await request(app).get('/api/public/registration-statistics.csv').query({snapshotId:first.snapshotId,level:'district',page:9});
  expect(csv.status).toBe(200); expect(csv.text).toBe(statisticsCsv(first,{level:'district'}));
  expect(csv.headers['x-statistics-snapshot']).toBe(first.snapshotId);
  expect((await request(app).get('/api/public/registration-statistics.csv')).status).toBe(400);
  expect((await request(app).get('/api/public/registration-statistics').query({snapshotId:'../current'})).status).toBe(400);
  expect((await request(app).get('/api/public/registration-statistics').query({snapshotId:'f'.repeat(64)})).status).toBe(404);
});
it('mounts report assets under the existing prefix and keeps approved navigation order', () => {
  const html=renderRegistrationStatistics('/football');
  expect(html).toContain('/football/assets/registration-statistics/integration.css');
  expect(html).toContain('data-api="/football/api/public/registration-statistics"');
  expect(html.indexOf('ระเบียบการแข่งขัน')).toBeLessThan(html.indexOf('>ข้อมูลสถิติการสมัคร</a>'));
  expect(html.indexOf('>ข้อมูลสถิติการสมัคร</a>')).toBeLessThan(html.indexOf('>รับสมัครทีม</a>'));
  expect(html).not.toContain('ต้นแบบสำหรับรีวิว');
});
